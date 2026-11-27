import type { DownloadItem, DownloadProgress, StreamInfo, Track } from '../../shared/types';
import { localMediaUrl, mediaUrl, nativeJson, nativeJsonGet } from './http';
import { ensureDownloadsDir, libraryStore, newId, sessionStore, settingsStore } from './store';

const CACHE_TTL_MS = 90 * 60_000;
const PERSISTED_CACHE_KEY = 'auralis.streams.v1';
const PERSISTED_CACHE_LIMIT = 18;
const FAST_RESOLVE_TIMEOUT_MS = 1800;
const FAST_FALLBACK_DELAY_MS = 180;
const FAST_FAILURE_COOLDOWN_MS = 10 * 60_000;

interface CachedStream {
  info: StreamInfo;
  at: number;
}

const streamCache = new Map<string, CachedStream>();
const pendingStreams = new Map<string, Promise<StreamInfo>>();
const activeDownloads = new Map<string, string>();
const fastResolveBlockedUntil = new Map<string, number>();
const STREAM_CACHE_LIMIT = 48;

function rememberStream(key: string, info: StreamInfo) {
  streamCache.delete(key);
  streamCache.set(key, { info, at: Date.now() });
  while (streamCache.size > STREAM_CACHE_LIMIT) {
    const oldest = streamCache.keys().next().value;
    if (oldest === undefined) break;
    streamCache.delete(oldest);
  }
  schedulePersistedCache();
}

let persistTimer: number | undefined;

function schedulePersistedCache() {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(persistStreamCache, 1200);
}

/**
 * Resolved googlevideo URLs stay valid for hours. Keeping the newest few in
 * localStorage turns a cold app start, or a reload after Android reclaimed the
 * WebView, into an instant start for the songs the listener actually plays.
 */
function persistStreamCache() {
  try {
    const now = Date.now();
    const entries = [...streamCache.entries()]
      .filter(([, cached]) => now - cached.at < CACHE_TTL_MS)
      .slice(-PERSISTED_CACHE_LIMIT);
    localStorage.setItem(
      PERSISTED_CACHE_KEY,
      JSON.stringify(entries.map(([key, cached]) => ({ key, info: cached.info, at: cached.at }))),
    );
  } catch {
    // Storage can be full or disabled; the in-memory cache still works.
  }
}

function restoreStreamCache() {
  try {
    const raw = localStorage.getItem(PERSISTED_CACHE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Array<{ key: string; info: StreamInfo; at: number }>;
    if (!Array.isArray(saved)) return;
    const now = Date.now();
    for (const entry of saved) {
      if (!entry?.key || !entry.info?.url || now - entry.at >= CACHE_TTL_MS) continue;
      streamCache.set(entry.key, { info: entry.info, at: entry.at });
    }
  } catch {
    // Ignore corrupt caches.
  }
}

restoreStreamCache();

/**
 * Some player responses carry a URL that the media element cannot actually
 * decode (for example a stale signature timestamp). Validate it through the
 * same /media proxy the player uses before committing it as the fast path.
 */
function validateStreamUrl(url: string, timeoutMs = 1100): Promise<boolean> {
  return new Promise((resolve) => {
    const element = new Audio();
    element.preload = 'metadata';
    let settled = false;
    const done = (value: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      element.removeAttribute('src');
      element.load();
      resolve(value);
    };
    const timer = window.setTimeout(() => done(true), timeoutMs);
    element.addEventListener('loadedmetadata', () => done(true), { once: true });
    element.addEventListener('error', () => done(false), { once: true });
    element.src = url;
  });
}

function preferredAudioBitrate(quality: string): number {
  // Matches the Windows app's quality caps (kbps); auto/best are uncapped.
  if (quality === 'low') return 128;
  if (quality === 'medium') return 192;
  if (quality === 'high') return 256;
  return 10_000;
}

function qualityFormat(quality: string): string {
  switch (quality) {
    case 'high':
      return 'bestaudio[abr<=256]/bestaudio[ext=m4a]/bestaudio';
    case 'medium':
      return 'bestaudio[abr<=192]/bestaudio[ext=m4a]';
    case 'low':
      return 'worstaudio[ext=m4a]/worstaudio';
    case 'best':
      return 'bestaudio/best';
    case 'auto':
    default:
      return 'bestaudio[ext=m4a]/bestaudio';
  }
}

function cookie(): string {
  return sessionStore.cookie || '';
}

function extOf(path: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(path || '');
  return match ? match[1].toLowerCase() : 'audio';
}

export class StreamService {
  async resolve(track: Track): Promise<StreamInfo> {
    return this.resolveStream(track, false, true);
  }

  /**
   * Resolves a progressive MP4 for the optional music-video preview. The
   * preview is rendered muted while the normal audio element keeps playing,
   * so the EQ and gapless playback are unaffected. Callers must fall back to
   * artwork when this rejects.
   */
  async resolveVideo(track: Track): Promise<StreamInfo> {
    const quality = settingsStore.get().audioQuality;
    const key = `${track.id}:${quality}:video`;
    const cached = streamCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.info;
    try {
      const result = await nativeJson<{ url: string; format: string }>('/__fast/resolve', {
        videoId: track.id,
        bitrate: 0,
        video: true,
        visitorData: sessionStore.visitorData || '',
      });
      if (result.url) {
        const info: StreamInfo = {
          url: mediaUrl(result.url),
          format: result.format || 'video',
          quality,
          title: track.title,
          duration: track.duration,
          expiresAt: Date.now() + CACHE_TTL_MS,
          video: true,
        };
        rememberStream(key, info);
        return info;
      }
    } catch {
      // yt-dlp remains the fallback for videos the fast client cannot resolve.
    }
    return this.resolveStream(track, true, true);
  }

  private async resolveStream(track: Track, video: boolean, cancelSlow = true): Promise<StreamInfo> {
    if (track.localPath) {
      return {
        url: localMediaUrl(track.localPath),
        format: video ? 'video' : extOf(track.localPath),
        title: track.title,
        duration: track.duration,
        localPath: track.localPath,
        video,
      };
    }
    const quality = settingsStore.get().audioQuality;
    const key = `${track.id}:${quality}${video ? ':video' : ''}`;
    const cached = streamCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      // Refresh recency without changing the URL.
      streamCache.delete(key);
      streamCache.set(key, cached);
      return cached.info;
    }
    const pending = pendingStreams.get(key);
    if (pending) return pending;

    const task = this.resolveFresh(track, quality, video, cancelSlow);
    pendingStreams.set(key, task);
    void task
      .finally(() => {
        if (pendingStreams.get(key) === task) pendingStreams.delete(key);
      })
      .catch(() => {});
    return task;
  }

  /**
   * Starts the direct Innertube player request and the bundled yt-dlp worker
   * together. The fast path usually wins on a warm connection; the yt-dlp
   * worker is still there for ciphered formats, PO-token challenges and bot
   * checks. Whichever produces a playable URL first is cached and used.
   */
  private async resolveFresh(
    track: Track,
    quality: string,
    video: boolean,
    cancelSlow = true,
  ): Promise<StreamInfo> {
    const key = `${track.id}:${quality}${video ? ':video' : ''}`;
    const blockedUntil = fastResolveBlockedUntil.get(track.id) || 0;
    const tryFast = !video && Date.now() >= blockedUntil;
    try {
      (window as unknown as { __auralisFastDebug?: any[] }).__auralisFastDebug = [
        ...((window as unknown as { __auralisFastDebug?: any[] }).__auralisFastDebug || []),
        { id: track.id, video, tryFast, blockedIn: Math.max(0, blockedUntil - Date.now()) },
      ].slice(-10);
    } catch {
      // ignore
    }

    let fastTimer: number | undefined;
    let fastRetryTimer: number | undefined;
    let slowTimer: number | undefined;
    let fastAttempts = 0;
    let slowStarted = false;
    let settled = false;
    let fastDone = !tryFast;
    let slowDone = false;
    let fastError: any;
    let slowError: any;
    const MAX_FAST_ATTEMPTS = 2;

    return new Promise<StreamInfo>((resolve, reject) => {
      const finish = (info: StreamInfo) => {
        if (settled) return;
        settled = true;
        try {
          (window as unknown as { __auralisResolveSource?: string }).__auralisResolveSource = info.format === 'm4a' ? 'fast' : 'slow';
        } catch {
          // ignore
        }
        window.clearTimeout(fastTimer);
        window.clearTimeout(fastRetryTimer);
        window.clearTimeout(slowTimer);
        // Never cancel native workers here. A warming resolve for the next
        // song may be in flight and cancelling it produced visible
        // YoutubeDL$CancelledException toasts during playback and seeking.
        rememberStream(key, info);
        resolve(info);
      };

      // The direct request may time out before the yt-dlp worker has finished
      // a cold start. Reject only when *both* paths are done; otherwise the
      // slower-but-working fallback was thrown away for no reason.
      const maybeFail = () => {
        if (settled || !fastDone || !slowDone) return;
        settled = true;
        window.clearTimeout(fastTimer);
        window.clearTimeout(fastRetryTimer);
        window.clearTimeout(slowTimer);
        reject(
          slowError ||
            fastError ||
            new Error(video ? 'Could not resolve a video.' : 'Could not resolve this track.'),
        );
      };

      const fastFail = (error: any) => {
        if (settled || fastDone) return;
        window.clearTimeout(fastTimer);
        try {
          const target = window as unknown as { __auralisFastErrors?: string[] };
          target.__auralisFastErrors = [
            ...(target.__auralisFastErrors || []),
            `${track.id}: ${error?.message || error}`,
          ].slice(-12);
        } catch {
          // ignore
        }
        fastError = error;
        fastAttempts += 1;
        if (fastAttempts < MAX_FAST_ATTEMPTS) {
          // A transient bot check or cold connection should not force the
          // slow extractor. One short retry keeps the sub-second path alive.
          fastRetryTimer = window.setTimeout(runFast, 350);
          return;
        }
        fastDone = true;
        maybeFail();
      };

      const slowFail = (error: any) => {
        if (settled) return;
        slowDone = true;
        slowError = error;
        maybeFail();
      };

      const runFast = () => {
        if (settled || fastDone) return;
        fastTimer = window.setTimeout(() => {
          fastFail(new Error('Direct stream lookup timed out.'));
        }, FAST_RESOLVE_TIMEOUT_MS);
        // Native OkHttp resolves the player response directly. This avoids the
        // JS fetch bridge and its extra serialization on every song change.
        nativeJson<{ url: string; format: string }>('/__fast/resolve', {
          videoId: track.id,
          bitrate: preferredAudioBitrate(quality) * 1000,
          visitorData: sessionStore.visitorData || '',
        })
          .then(async (result) => {
            if (!result.url) throw new Error('No direct audio format was available.');
            const info: StreamInfo = {
              url: mediaUrl(result.url),
              format: result.format || 'audio',
              quality,
              title: track.title,
              duration: track.duration,
              expiresAt: Date.now() + CACHE_TTL_MS,
              video,
            };
            if (!(await validateStreamUrl(info.url))) {
              throw new Error('Direct URL was rejected by the media element.');
            }
            finish(info);
          })
          .catch(fastFail);
      };
      if (tryFast) runFast();

      const startSlow = () => {
        slowStarted = true;
        this.resolveWithYtDlp(track, quality, video).then(
          (info) => finish(info),
          (error) => slowFail(error),
        );
      };
      // Give the direct request a short head start without making a failed
      // fast path add its full timeout to the yt-dlp wait.
      slowTimer = window.setTimeout(startSlow, tryFast ? FAST_FALLBACK_DELAY_MS : 0);
    });
  }

  private async resolveWithYtDlp(track: Track, quality: string, video: boolean): Promise<StreamInfo> {
    let result: { url: string } | undefined;
    let lastError: any;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        result = await nativeJson<{ url: string }>('/__ytdlp/resolve', {
          videoId: track.id,
          quality,
          video,
          cookie: cookie(),
          proxy: settingsStore.get().proxy || '',
        });
        if (result.url) break;
        lastError = new Error(
          video
            ? 'yt-dlp did not return a playable video URL.'
            : 'yt-dlp did not return a playable audio URL.',
        );
      } catch (error) {
        // A cancellation (for example from a stale worker) is not a real
        // failure; retry quietly instead of surfacing it to the user.
        if (/CancelledException|superseded/i.test(String((error as any)?.message || error))) continue;
        lastError = error;
      }
      // One short retry covers transient network and extractor hiccups
      // without doubling the wait for a permanent failure such as a
      // YouTube bot check.
      if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 650));
    }
    if (!result?.url) throw lastError || new Error('Could not resolve this track.');
    return {
      url: mediaUrl(result.url),
      format: video ? 'video' : 'audio',
      quality,
      title: track.title,
      duration: track.duration,
      expiresAt: Date.now() + CACHE_TTL_MS,
      video,
    };
  }

  async resolveForWarm(track: Track): Promise<StreamInfo> {
    return this.resolveStream(track, false, false);
  }

  async prefetch(track: Track): Promise<void> {
    try {
      // Prefetches must not cancel other workers: they often run alongside the
      // song that is currently starting.
      await this.resolveStream(track, false, false);
    } catch {
      // Prefetch failures are silent; playback will surface a real error.
    }
  }

  invalidate(trackId: string) {
    for (const key of streamCache.keys()) {
      if (key.startsWith(`${trackId}:`)) streamCache.delete(key);
    }
    for (const key of pendingStreams.keys()) {
      if (key.startsWith(`${trackId}:`)) pendingStreams.delete(key);
    }
    // If a direct URL was rejected by the media element, do not hand it back
    // on the immediate retry. yt-dlp gets the next attempt; the fast path is
    // allowed again after the cooldown.
    fastResolveBlockedUntil.set(trackId, Date.now() + FAST_FAILURE_COOLDOWN_MS);
    persistStreamCache();
    void nativeJson('/__ytdlp/invalidate', { videoId: trackId }).catch(() => {});
  }

  async ffmpegAvailable(): Promise<boolean> {
    try {
      const info = await nativeJsonGet<{ ffmpegAvailable?: boolean }>('/__native/appinfo');
      return Boolean(info.ffmpegAvailable);
    } catch {
      return false;
    }
  }

  async ytdlpVersion(): Promise<string | undefined> {
    try {
      const info = await nativeJsonGet<{ ytDlpVersion?: string }>('/__native/appinfo');
      return info.ytDlpVersion || undefined;
    } catch {
      return undefined;
    }
  }

  async update(): Promise<string> {
    const result = await nativeJson<{ message: string }>('/__ytdlp/update');
    return result.message || 'yt-dlp is up to date.';
  }

  /** Downloads auto/manual captions and converts the VTT to extended LRC. */
  async fetchSubtitles(videoId: string): Promise<string | null> {
    try {
      const result = await nativeJson<{ vtt: string | null }>('/__ytdlp/subtitles', {
        videoId,
        cookie: cookie(),
      });
      if (!result.vtt) return null;
      return vttToLrc(result.vtt);
    } catch {
      return null;
    }
  }

  async download(track: Track, onProgress?: (progress: DownloadProgress) => void): Promise<DownloadItem> {
    const lib = libraryStore.get();
    const existing = lib.downloads.find((item) => item.track.id === track.id && item.status === 'done');
    if (existing?.path) return existing;

    const settings = settingsStore.get();
    const quality = settings.downloadQuality === 'high' ? 'high' : settings.downloadQuality;
    const id = newId('dl');
    const item: DownloadItem = {
      id,
      track,
      path: '',
      format: '',
      quality,
      createdAt: Date.now(),
      status: 'downloading',
      progress: 0,
    };
    libraryStore.update((value) => ({
      ...value,
      downloads: [item, ...value.downloads.filter((download) => download.track.id !== track.id)],
    }));
    onProgress?.({ id, progress: 0, status: 'downloading' });

    let nativeId: string;
    try {
      const started = await nativeJson<{ id: string }>('/__ytdlp/download/start', {
        videoId: track.id,
        quality,
        cookie: cookie(),
        proxy: settings.proxy || '',
      });
      nativeId = started.id;
      activeDownloads.set(id, nativeId);
    } catch (error: any) {
      const message = error?.message || 'Could not start the download.';
      const failed: DownloadItem = { ...item, status: 'error', error: message };
      libraryStore.update((value) => ({
        ...value,
        downloads: value.downloads.map((download) => (download.id === id ? failed : download)),
      }));
      onProgress?.({ id, progress: 0, status: 'error', error: message });
      throw new Error(message);
    }

    return new Promise<DownloadItem>((resolve, reject) => {
      let lastProgress = 0;
      let settled = false;
      const stop = () => {
        settled = true;
      };
      const tick = async () => {
        if (settled) return;
        try {
          const state = await nativeJson<{
            status: string;
            progress: number;
            path: string;
            size: number;
            error?: string;
          }>('/__ytdlp/download/progress', { id: nativeId });
          lastProgress = Math.max(lastProgress, Number(state.progress) || 0);
          if (state.status === 'done') {
            stop();
            activeDownloads.delete(id);
            const completed: DownloadItem = {
              ...item,
              path: state.path,
              format: extOf(state.path),
              size: state.size || undefined,
              status: 'done',
              progress: 100,
            };
            libraryStore.update((value) => ({
              ...value,
              downloads: value.downloads.map((download) => (download.id === id ? completed : download)),
            }));
            onProgress?.({ id, progress: 100, status: 'done', path: completed.path });
            resolve(completed);
            return;
          }
          if (state.status === 'error' || state.status === 'cancelled') {
            stop();
            activeDownloads.delete(id);
            const status = state.status === 'cancelled' ? 'cancelled' : 'error';
            const message = state.error || (status === 'cancelled' ? 'Download cancelled.' : 'Download failed.');
            const failed: DownloadItem = {
              ...item,
              path: state.path || '',
              status,
              progress: lastProgress,
              error: message,
            };
            libraryStore.update((value) => ({
              ...value,
              downloads: value.downloads.map((download) => (download.id === id ? failed : download)),
            }));
            onProgress?.({ id, progress: lastProgress, status, error: message, path: state.path || undefined });
            reject(new Error(message));
            return;
          }
          onProgress?.({ id, progress: lastProgress, status: 'downloading' });
          window.setTimeout(tick, 650);
        } catch (error: any) {
          // A transient local-server hiccup should not abort a native download.
          if (!settled) window.setTimeout(tick, 1200);
        }
      };
      window.setTimeout(tick, 400);
    });
  }

  cancelDownload(id: string) {
    const nativeId = activeDownloads.get(id);
    activeDownloads.delete(id);
    if (!nativeId) return;
    void nativeJson('/__ytdlp/download/cancel', { id: nativeId }).catch(() => {});
  }
}

export const streams = new StreamService();

function vttToLrc(vtt: string): string | null {
  const cues: { time: number; text: string }[] = [];
  const timeRe = /(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s+-->/;
  const blocks = vtt.replace(/\r\n/g, '\n').split(/\n{2,}/);
  let previous = '';
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const timeIndex = lines.findIndex((line) => timeRe.test(line));
    if (timeIndex < 0) continue;
    const match = lines[timeIndex].match(timeRe);
    if (!match) continue;
    const time = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
    const text = lines
      .slice(timeIndex + 1)
      .filter((line) => !/^(NOTE|STYLE|REGION)\b/.test(line))
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || text === previous) continue;
    previous = text;
    cues.push({ time, text });
  }
  if (!cues.length) return null;
  return cues
    .map(({ time, text }) => {
      const minutes = Math.floor(time / 60);
      const seconds = Math.floor(time % 60);
      const millis = Math.round((time % 1) * 1000);
      return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}]${text}`;
    })
    .join('\n');
}
