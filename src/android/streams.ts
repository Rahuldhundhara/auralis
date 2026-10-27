import type { DownloadItem, DownloadProgress, StreamInfo, Track } from '../../shared/types';
import { localMediaUrl, mediaUrl, nativeJson, nativeJsonGet } from './http';
import { ensureDownloadsDir, libraryStore, newId, sessionStore, settingsStore } from './store';

const CACHE_TTL_MS = 90 * 60_000;

interface CachedStream {
  info: StreamInfo;
  at: number;
}

const streamCache = new Map<string, CachedStream>();
const pendingStreams = new Map<string, Promise<StreamInfo>>();
const activeDownloads = new Map<string, string>();
const STREAM_CACHE_LIMIT = 48;

function rememberStream(key: string, info: StreamInfo) {
  streamCache.delete(key);
  streamCache.set(key, { info, at: Date.now() });
  while (streamCache.size > STREAM_CACHE_LIMIT) {
    const oldest = streamCache.keys().next().value;
    if (oldest === undefined) break;
    streamCache.delete(oldest);
  }
}

function qualityFormat(quality: string): string {
  switch (quality) {
    case 'high':
      return 'bestaudio[abr<=256]/bestaudio[ext=m4a]/bestaudio';
    case 'medium':
      return 'bestaudio[abr<=192]/bestaudio[ext=m4a]/bestaudio';
    case 'low':
      return 'bestaudio[abr<=128]/bestaudio[ext=m4a]/bestaudio';
    case 'best':
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
    if (track.localPath) {
      return {
        url: localMediaUrl(track.localPath),
        format: extOf(track.localPath),
        title: track.title,
        duration: track.duration,
        localPath: track.localPath,
      };
    }
    const quality = settingsStore.get().audioQuality;
    const key = `${track.id}:${quality}`;
    const cached = streamCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.info;
    const pending = pendingStreams.get(key);
    if (pending) return pending;

    const task = (async () => {
      const result = await nativeJson<{ url: string }>('/__ytdlp/resolve', {
        videoId: track.id,
        quality,
        cookie: cookie(),
        proxy: settingsStore.get().proxy || '',
      });
      if (!result.url) throw new Error('yt-dlp did not return a playable audio URL.');
      const info: StreamInfo = {
        url: mediaUrl(result.url),
        format: 'audio',
        quality,
        title: track.title,
        duration: track.duration,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
      rememberStream(key, info);
      return info;
    })();
    pendingStreams.set(key, task);
    void task
      .finally(() => {
        if (pendingStreams.get(key) === task) pendingStreams.delete(key);
      })
      .catch(() => {});
    return task;
  }

  async prefetch(track: Track): Promise<void> {
    try {
      await this.resolve(track);
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
