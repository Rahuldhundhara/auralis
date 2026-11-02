import { app } from 'electron';
import { spawn, execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DownloadItem, DownloadProgress, StreamInfo, Track } from '../../shared/types';
import { downloadsDir, ensureDownloadsDir, libraryStore, newId, sessionStore, settingsStore } from './store';
import { innertube } from './innertube';

const CACHE_TTL_MS = 90 * 60_000;
const STREAM_CACHE_MAX_BYTES = 512 * 1024 * 1024;
const STREAM_CACHE_MAX_FILES = 120;
const STREAM_CACHE_MAX_AGE = 30 * 24 * 60 * 60_000;

interface CachedStream {
  info: StreamInfo;
  at: number;
}

const streamCache = new Map<string, CachedStream>();
const pendingResolve = new Map<string, Promise<StreamInfo>>();
const cacheTasks = new Map<string, Promise<string | null>>();
const active = new Map<string, ReturnType<typeof spawn>>();
const pausedDownloads = new Set<string>();

/** Private, disposable audio cache used to make next-track starts local. */
export function streamCacheDir(): string {
  return path.join(app.getPath('userData'), 'stream-cache');
}

export function resourcesBinDir(): string {
  if (app?.isPackaged) return path.join(process.resourcesPath, 'bin');
  return path.join(app?.getAppPath?.() || process.cwd(), 'resources', 'bin');
}

let cachedYtdlpPath: string | undefined;
let ytdlpStageTask: Promise<string> | undefined;

/**
 * Copy yt-dlp into the writable user-data directory in the background. The
 * bundled binary is 70+ MB, so doing this synchronously inside the first
 * playback request added several seconds to the first song after a fresh
 * install. Playback can use the bundled copy immediately while this runs.
 */
export function stageYtdlp(): Promise<string> {
  if (process.platform === 'win32') {
    const exe = 'yt-dlp.exe';
    const bundled = path.join(resourcesBinDir(), exe);
    return Promise.resolve(fs.existsSync(bundled) ? bundled : exe);
  }
  if (cachedYtdlpPath) return Promise.resolve(cachedYtdlpPath);
  if (ytdlpStageTask) return ytdlpStageTask;

  const exe = 'yt-dlp';
  const bundled = path.join(resourcesBinDir(), exe);
  ytdlpStageTask = (async () => {
    const user = path.join(app.getPath('userData'), 'bin', exe);
    if (fs.existsSync(user)) {
      fs.chmodSync(user, 0o755);
      cachedYtdlpPath = user;
      return user;
    }
    if (!fs.existsSync(bundled)) {
      cachedYtdlpPath = exe;
      return exe;
    }
    await fs.promises.mkdir(path.dirname(user), { recursive: true });
    // Copy to a temporary name and rename atomically. ytdlpPath() may be
    // called while this is in progress; it must never execute a half-written
    // binary. Use the async FS API so the main process can keep serving the
    // renderer while the 70+ MB binary is being copied.
    const temporary = `${user}.${process.pid}.tmp`;
    try {
      await fs.promises.copyFile(bundled, temporary);
      await fs.promises.chmod(temporary, 0o755);
      await fs.promises.rename(temporary, user);
      cachedYtdlpPath = user;
      return user;
    } catch (error) {
      await fs.promises.rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
  })().catch((error) => {
    console.warn('[auralis] could not stage yt-dlp in userData; using bundled copy', error);
    ytdlpStageTask = undefined;
    const fallback = fs.existsSync(bundled) ? bundled : exe;
    cachedYtdlpPath = fallback;
    return fallback;
  });
  return ytdlpStageTask;
}

/**
 * Linux packages mount the app read-only (AppImage) or install it under /opt
 * (deb). Use the writable copy when it is ready, otherwise keep playback
 * moving with the bundled executable. Windows keeps using the bundled
 * executable exactly as before.
 */
export function ytdlpPath(): string {
  if (process.platform === 'win32') {
    const exe = 'yt-dlp.exe';
    const bundled = path.join(resourcesBinDir(), exe);
    return fs.existsSync(bundled) ? bundled : exe;
  }

  if (cachedYtdlpPath) return cachedYtdlpPath;
  const exe = 'yt-dlp';
  const bundled = path.join(resourcesBinDir(), exe);
  try {
    const user = path.join(app.getPath('userData'), 'bin', exe);
    if (fs.existsSync(user)) {
      fs.chmodSync(user, 0o755);
      cachedYtdlpPath = user;
      return user;
    }
  } catch (error) {
    console.warn('[auralis] could not read staged yt-dlp; using bundled copy', error);
  }
  return fs.existsSync(bundled) ? bundled : exe;
}

/** Warm the staged binary and Python runtime while the app is idle. */
export function warmupStreams(): void {
  void stageYtdlp()
    .then(() => runYtdlp(['--version'], 10_000))
    .catch(() => {
      // Warmup is best-effort.
    });
}

export function ffmpegPath(): string | null {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const bundled = path.join(resourcesBinDir(), exe);
  return fs.existsSync(bundled) ? bundled : exe;
}

function cookieFile(): string | null {
  const cookie = sessionStore.cookie;
  if (!cookie) return null;
  const lines = ['# Netscape HTTP Cookie File', '# Generated by Auralis'];
  for (const part of cookie.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!name || /[\r\n]/.test(name) || /[\r\n]/.test(value)) continue;
    lines.push(`.youtube.com\tTRUE\t/\tTRUE\t${Math.floor(Date.now() / 1000) + 86400}\t${name}\t${value}`);
  }
  let dir = os.tmpdir();
  try {
    dir = path.join(app.getPath('userData'), 'tmp');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch {
    // fall back to the OS temp directory when userData is unavailable
  }
  const file = path.join(dir, `auralis-cookies-${crypto.randomUUID()}.txt`);
  fs.writeFileSync(file, lines.join('\n'), { encoding: 'utf8', mode: 0o600 });
  return file;
}

function commonArgs(): string[] {
  const args: string[] = ['--no-warnings', '--no-playlist'];
  const settings = settingsStore.get();
  const cookies = cookieFile();
  if (cookies) args.push('--cookies', cookies);
  if (settings.proxy?.trim()) args.push('--proxy', settings.proxy.trim());
  return args;
}

function qualityFormat(quality: string): string {
  switch (quality) {
    case 'high':
      // Caps are real: do not silently fall back to a higher-bitrate stream.
      return 'bestaudio[abr<=256]';
    case 'medium':
      return 'bestaudio[abr<=192]';
    case 'low':
      return 'bestaudio[abr<=128]';
    case 'best':
    case 'auto':
    default:
      // Let yt-dlp choose the highest available audio stream instead of
      // preferring a lower-bitrate m4a fallback.
      return 'bestaudio/best';
  }
}

const FAST_PLAYER_CLIENTS = [
  { name: 'ANDROID', version: '20.10.38', id: '3' },
  { name: 'IOS', version: '20.10.4', id: '5' },
] as const;

function bitrateCap(quality: string): number {
  if (quality === 'high') return 256_000;
  if (quality === 'medium') return 192_000;
  if (quality === 'low') return 128_000;
  return Number.POSITIVE_INFINITY;
}

interface FastFormat {
  itag?: number;
  mimeType?: string;
  bitrate?: number;
  height?: number;
  url?: string;
  drmFamilies?: unknown;
}

function pickAudioFormat(adaptive: FastFormat[], formats: FastFormat[], quality: string): FastFormat | undefined {
  const candidates = [...adaptive, ...formats].filter(
    (format) =>
      typeof format.url === 'string' &&
      /^audio\//.test(format.mimeType || '') &&
      !format.drmFamilies,
  );
  if (!candidates.length) return undefined;
  const cap = bitrateCap(quality);
  const eligible = candidates.filter((format) => (format.bitrate || 0) <= cap);
  const pool = eligible.length ? eligible : candidates;
  // WebM/Opus carries its headers at the start, so playback can begin from
  // the first fast range without waiting for the file's tail.
  const rank = (format: FastFormat) => (/audio\/webm/i.test(format.mimeType || '') ? 0 : 1);
  return pool.sort((a, b) => rank(a) - rank(b) || (b.bitrate || 0) - (a.bitrate || 0))[0];
}

function pickVideoFormat(adaptive: FastFormat[], formats: FastFormat[]): FastFormat | undefined {
  const all = [...adaptive, ...formats].filter(
    (format) =>
      typeof format.url === 'string' &&
      /^video\//.test(format.mimeType || '') &&
      !format.drmFamilies &&
      (format.height || 0) <= 720,
  );
  if (!all.length) return undefined;
  // Prefer a video-only stream at the highest available resolution. Muxed
  // progressive formats are only a fallback for older uploads.
  const videoOnly = all.filter((format) => !/^audio\//.test(format.mimeType || ''));
  const pool = videoOnly.length ? videoOnly : all;
  const rank = (format: FastFormat) => {
    if (/video\/webm/i.test(format.mimeType || '')) return 0;
    if (/avc1/i.test(format.mimeType || '')) return 1;
    return 2;
  };
  return pool.sort(
    (a, b) => (b.height || 0) - (a.height || 0) || rank(a) - rank(b) || (b.bitrate || 0) - (a.bitrate || 0),
  )[0];
}

/**
 * YouTube's player endpoint returns signed stream URLs in a few hundred
 * milliseconds, while spawning yt-dlp costs several seconds. Try the mobile
 * clients in order, then fall back to yt-dlp if YouTube withholds URLs for
 * this video or session.
 */
async function fastPlayerUrl(
  videoId: string,
  kind: 'audio' | 'video',
  quality = 'auto',
): Promise<{ url: string; format: string; itag?: number } | undefined> {
  const request = async (client: (typeof FAST_PLAYER_CLIENTS)[number]) => {
    const data = await innertube.request(
      'player',
      {
        videoId,
        playbackContext: {
          contentPlaybackContext: {
            signatureTimestamp: 20000,
            html5Preference: 'HTML5_PREF_WANTS',
          },
        },
        contentCheckOk: true,
        racyCheckOk: true,
      },
      { login: false, client, timeoutMs: 3_500 },
    );
    const adaptive = (data?.streamingData?.adaptiveFormats || []) as FastFormat[];
    const progressive = (data?.streamingData?.formats || []) as FastFormat[];
    const format = kind === 'audio'
      ? pickAudioFormat(adaptive, progressive, quality)
      : pickVideoFormat(adaptive, progressive);
    if (!format?.url) throw new Error('No direct stream URL.');
    const mime = format.mimeType || '';
    return {
      url: format.url,
      format: mime.includes('/') ? mime.split('/')[1].split(';')[0] : kind,
      itag: format.itag,
    };
  };
  // Try Android first: it exposes WebM/Opus and accepts an immediate first
  // range. IOS is a fallback for tracks where Android's formats are withheld.
  for (const client of FAST_PLAYER_CLIENTS) {
    try {
      return await request(client);
    } catch {
      // try the next client
    }
  }
  return undefined;
}

const fallbackStreams = new Map<string, { at: number; task: Promise<string | undefined> }>();

function rememberFallback(fastUrl: string, task: Promise<string | undefined>) {
  const now = Date.now();
  for (const [url, entry] of fallbackStreams) {
    if (now - entry.at > CACHE_TTL_MS) fallbackStreams.delete(url);
  }
  fallbackStreams.set(fastUrl, { at: now, task });
}

/**
 * Fast player URLs are useful for an instant start but some of them only
 * permit the first bounded range. The media protocol uses the yt-dlp URL for
 * later ranges so playback can continue for the whole track.
 */
export function fallbackStreamTask(fastUrl: string): Promise<string | undefined> | undefined {
  const entry = fallbackStreams.get(fastUrl);
  if (!entry || Date.now() - entry.at > CACHE_TTL_MS) return undefined;
  return entry.task;
}

export async function fallbackStreamUrl(fastUrl: string): Promise<string | undefined> {
  return fallbackStreamTask(fastUrl);
}

function runYtdlp(args: string[], timeoutMs = 90_000): Promise<{ stdout: string; stderr: string }> {
  const cookie = args.includes('--cookies') ? args[args.indexOf('--cookies') + 1] : null;
  return new Promise((resolve, reject) => {
    execFile(
      ytdlpPath(),
      args,
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (cookie) fs.rm(cookie, { force: true }, () => {});
        if (error) {
          const detail = (stderr || stdout || error.message || '').trim().split(/\r?\n/).slice(-4).join(' ');
          reject(new Error(detail || 'yt-dlp failed.'));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

function safeFileBase(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || 'track';
}

function cachedAudioFile(trackId: string): string | undefined {
  try {
    const dir = streamCacheDir();
    const base = safeFileBase(trackId);
    const files = fs
      .readdirSync(dir)
      .filter((name) => name.startsWith(`${base}.`) && !name.endsWith('.part'))
      .map((name) => {
        const file = path.join(dir, name);
        try {
          const stat = fs.statSync(file);
          return stat.size > 0 ? { file, mtime: stat.mtimeMs } : undefined;
        } catch {
          return undefined;
        }
      })
      .filter((entry): entry is { file: string; mtime: number } => Boolean(entry))
      .sort((a, b) => b.mtime - a.mtime);
    return files[0]?.file;
  } catch {
    return undefined;
  }
}

async function trimStreamCache(): Promise<void> {
  try {
    const dir = streamCacheDir();
    const names = await fs.promises.readdir(dir);
    const now = Date.now();
    const entries: { file: string; size: number; mtime: number }[] = [];
    for (const name of names) {
      const file = path.join(dir, name);
      try {
        const stat = await fs.promises.stat(file);
        const age = now - stat.mtimeMs;
        if ((name.endsWith('.part') && age > 60 * 60_000) || age > STREAM_CACHE_MAX_AGE) {
          await fs.promises.rm(file, { force: true });
          continue;
        }
        if (!name.endsWith('.part')) entries.push({ file, size: stat.size, mtime: stat.mtimeMs });
      } catch {
        // A file can disappear while the cache is being pruned.
      }
    }
    entries.sort((a, b) => b.mtime - a.mtime);
    let total = 0;
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (index >= STREAM_CACHE_MAX_FILES || total + entry.size > STREAM_CACHE_MAX_BYTES) {
        await fs.promises.rm(entry.file, { force: true });
      } else {
        total += entry.size;
      }
    }
  } catch {
    // Cache pruning is best-effort.
  }
}

function removePartialFiles(trackId: string) {
  try {
    const dir = downloadsDir();
    const base = safeFileBase(trackId);
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(`${base}.`) && name.endsWith('.part')) fs.rmSync(path.join(dir, name), { force: true });
    }
  } catch {
    // The folder may not exist yet.
  }
}

function proxyStreamUrl(url: string): string {
  return `auralis-media://stream/${Buffer.from(url, 'utf8').toString('base64url')}`;
}

export class StreamService {
  warmup(): void {
    warmupStreams();
  }

  async resolve(track: Track): Promise<StreamInfo> {
    if (track.localPath && fs.existsSync(track.localPath)) {
      return {
        url: `auralis-media://local/${encodeURIComponent(track.localPath)}`,
        format: path.extname(track.localPath).replace('.', '') || 'audio',
        title: track.title,
        duration: track.duration,
        localPath: track.localPath,
      };
    }
    const cachedFile = cachedAudioFile(track.id);
    if (cachedFile) {
      return {
        url: `auralis-media://local/${encodeURIComponent(cachedFile)}`,
        format: path.extname(cachedFile).replace('.', '') || 'audio',
        title: track.title,
        duration: track.duration,
        quality: settingsStore.get().audioQuality,
      };
    }
    const quality = settingsStore.get().audioQuality;
    const key = `${track.id}:${quality}`;
    const cached = streamCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.info;
    const pending = pendingResolve.get(key);
    if (pending) return pending;

    const task = this.resolveRemote(track, quality)
      .then((info) => {
        streamCache.set(key, { info, at: Date.now() });
        return info;
      })
      .finally(() => {
        pendingResolve.delete(key);
      });
    pendingResolve.set(key, task);
    return task;
  }

  /**
   * Resolve a video-only stream for the optional video surface. Audio keeps
   * using the normal resolve() path, so opening a music video does not replace
   * or restart the audio pipeline.
   */
  async resolveVideo(track: Track): Promise<StreamInfo> {
    const key = `video:${track.id}`;
    const cached = streamCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.info;
    const pending = pendingResolve.get(key);
    if (pending) return pending;

    const task = this.resolveVideoRemote(track)
      .then((info) => {
        streamCache.set(key, { info, at: Date.now() });
        return info;
      })
      .finally(() => {
        pendingResolve.delete(key);
      });
    pendingResolve.set(key, task);
    return task;
  }

  private async resolveRemote(track: Track, quality: string): Promise<StreamInfo> {
    const fast = await fastPlayerUrl(track.id, 'audio', quality);
    let url: string;
    let format = 'audio';
    if (fast) {
      // The proxy switches to this full-range URL after the first fast chunk.
      // Ask yt-dlp for the same format so the codec/container does not change
      // halfway through playback.
      const slow = this.extractUrl(
        track,
        fast.itag ? String(fast.itag) : qualityFormat(quality),
        'audio',
        30_000,
      ).catch(() => this.extractUrl(track, qualityFormat(quality), 'audio', 30_000));
      rememberFallback(fast.url, slow.catch(() => undefined));
      url = fast.url;
      format = fast.format;
    } else {
      url = await this.extractUrl(track, qualityFormat(quality), 'audio', 30_000);
      try {
        const mime = new URL(url).searchParams.get('mime');
        if (mime?.includes('/')) format = mime.split('/')[1].split(';')[0];
      } catch {
        // keep generic format
      }
    }
    return {
      url: proxyStreamUrl(url),
      format,
      quality,
      title: track.title,
      duration: track.duration,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
  }

  private async resolveVideoRemote(track: Track): Promise<StreamInfo> {
    // The video surface is muted (the normal audio player provides sound), so
    // prefer the higher-quality video-only streams. Fall back to muxed
    // progressive formats for videos that only expose those.
    const format =
      'bestvideo[height<=720][ext=mp4]/bestvideo[height<=720]/best[height<=720][ext=mp4]/best[height<=720]/bestvideo';
    const fast = await fastPlayerUrl(track.id, 'video');
    let url: string;
    let mimeFormat = 'video';
    if (fast) {
      const slow = this.extractUrl(
        track,
        fast.itag ? String(fast.itag) : format,
        'video',
        45_000,
        false,
      ).catch(() => this.extractUrl(track, format, 'video', 45_000, false));
      rememberFallback(fast.url, slow.catch(() => undefined));
      url = fast.url;
      mimeFormat = fast.format;
    } else {
      url = await this.extractUrl(track, format, 'video', 45_000, false);
      try {
        const mime = new URL(url).searchParams.get('mime');
        if (mime?.includes('/')) mimeFormat = mime.split('/')[1].split(';')[0];
      } catch {
        // keep generic format
      }
    }
    return {
      url: proxyStreamUrl(url),
      format: mimeFormat,
      title: track.title,
      duration: track.duration,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
  }

  /**
   * Ask yt-dlp for a direct URL. The Android extractor client is noticeably
   * faster than the default web clients for audio and works without signing
   * in, but it exposes fewer video formats; video resolution therefore uses
   * the default client list.
   */
  private async extractUrl(
    track: Track,
    format: string,
    kind: 'audio' | 'video',
    timeoutMs: number,
    preferAndroid = true,
  ): Promise<string> {
    const base = [
      '--socket-timeout',
      '10',
      '--retries',
      '2',
      '--fragment-retries',
      '2',
      '-f',
      format,
      '-g',
      `https://music.youtube.com/watch?v=${encodeURIComponent(track.id)}`,
    ];
    let lastError: Error | undefined;
    const attempts = preferAndroid
      ? [['--extractor-args', 'youtube:player_client=android'], []]
      : [[], ['--extractor-args', 'youtube:player_client=android']];
    for (const extractorArgs of attempts) {
      try {
        const { stdout } = await runYtdlp([...commonArgs(), ...extractorArgs, ...base], timeoutMs);
        const url = stdout.split(/\r?\n/).map((line) => line.trim()).find((line) => /^https?:\/\//.test(line));
        if (url) return url;
        lastError = new Error(`yt-dlp did not return a playable ${kind} URL.`);
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // A genuinely unavailable/private video will not succeed with the
        // fallback either; avoid doubling the error latency.
        if (/video is unavailable|video unavailable|private video|removed by the uploader|account.*terminated/i.test(lastError.message)) break;
      }
    }
    throw lastError || new Error(`yt-dlp did not return a playable ${kind} URL.`);
  }

  async prefetch(track: Track): Promise<void> {
    try {
      await this.resolve(track);
    } catch {
      // Prefetch failures are silent; playback will surface a real error.
    }
  }

  async prefetchVideo(track: Track): Promise<void> {
    try {
      await this.resolveVideo(track);
    } catch {
      // The video button can still report a useful error when clicked.
    }
  }

  /**
   * Download the next queue item into the private stream cache. The current
   * track keeps streaming immediately; by the time the next track starts its
   * bytes are already local, so track transitions do not expose a network
   * buffering gap. Downloads are deliberately rate-limited so they do not
   * starve the currently playing stream on a slow connection.
   */
  async cache(track: Track): Promise<string | null> {
    if (!track.id || track.localPath) return null;
    const existing = cachedAudioFile(track.id);
    if (existing) return existing;
    const pending = cacheTasks.get(track.id);
    if (pending) return pending;

    const task = (async () => {
      try {
        const dir = streamCacheDir();
        await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
        const base = safeFileBase(track.id);
        const output = path.join(dir, `${base}.%(ext)s`);
        const args = [
          ...commonArgs(),
          '--socket-timeout',
          '10',
          '--retries',
          '2',
          '--fragment-retries',
          '2',
          '--no-progress',
          '--limit-rate',
          '320K',
          '-f',
          qualityFormat(settingsStore.get().audioQuality),
          '-o',
          output,
          `https://music.youtube.com/watch?v=${encodeURIComponent(track.id)}`,
        ];
        await runYtdlp(args, 180_000);
        const file = cachedAudioFile(track.id);
        if (file && process.platform !== 'win32') {
          fs.chmodSync(file, 0o600);
        }
        void trimStreamCache();
        return file || null;
      } catch {
        // A cache miss is harmless: resolve() falls back to the live stream.
        return null;
      } finally {
        cacheTasks.delete(track.id);
      }
    })();
    cacheTasks.set(track.id, task);
    return task;
  }

  invalidate(trackId: string) {
    for (const key of streamCache.keys()) {
      if (key.startsWith(`${trackId}:`) || key.startsWith(`video:${trackId}`)) streamCache.delete(key);
    }
  }

  async ffmpegAvailable(): Promise<boolean> {
    const exe = ffmpegPath();
    if (!exe) return false;
    return new Promise((resolve) => {
      execFile(exe, ['-version'], { timeout: 5000, windowsHide: true }, (error) => resolve(!error));
    });
  }

  async ytdlpVersion(): Promise<string | undefined> {
    try {
      const { stdout } = await runYtdlp(['--version'], 15_000).catch(() => ({ stdout: '' }));
      return stdout.trim().split(/\r?\n/)[0] || undefined;
    } catch {
      return undefined;
    }
  }

  async update(): Promise<string> {
    await stageYtdlp();
    const { stdout, stderr } = await runYtdlp(['-U'], 180_000);
    return (stdout || stderr).trim() || 'yt-dlp is up to date.';
  }

  /** Downloads auto/manual captions and converts the VTT to extended LRC. */
  async fetchSubtitles(videoId: string, timeoutMs = 120_000): Promise<string | null> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-subs-'));
    const args = [
      ...commonArgs(),
      '--skip-download',
      '--write-subs',
      '--write-auto-subs',
      '--sub-langs',
      'en.*,en,hi.*,hi',
      '--sub-format',
      'vtt',
      '-o',
      path.join(dir, '%(id)s.%(ext)s'),
      `https://music.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    ];
    try {
      await runYtdlp(args, timeoutMs);
      const file = fs.readdirSync(dir).find((name) => name.endsWith('.vtt'));
      if (!file) return null;
      const vtt = fs.readFileSync(path.join(dir, file), 'utf8');
      return vttToLrc(vtt);
    } catch {
      return null;
    } finally {
      fs.rm(dir, { recursive: true, force: true }, () => {});
    }
  }

  async download(track: Track, onProgress?: (progress: DownloadProgress) => void): Promise<DownloadItem> {
    const lib = libraryStore.get();
    const existing = lib.downloads.find((d) => d.track.id === track.id && d.status === 'done');
    if (existing && fs.existsSync(existing.path)) return existing;
    const inFlight = lib.downloads.find((d) => d.track.id === track.id && d.status === 'downloading');
    if (inFlight) throw new Error('This song is already downloading.');

    const dir = await ensureDownloadsDir();
    const base = safeFileBase(track.id);
    const output = path.join(dir, `${base}.%(ext)s`);
    const args = [
      ...commonArgs(),
      '--newline',
      '--continue',
      ...(process.platform === 'win32' ? ['--windows-filenames'] : []),
      '-f',
      qualityFormat(settingsStore.get().downloadQuality === 'high' ? 'high' : settingsStore.get().downloadQuality),
      '-o',
      output,
      `https://music.youtube.com/watch?v=${encodeURIComponent(track.id)}`,
    ];

    const id = newId('dl');
    const item: DownloadItem = {
      id,
      track,
      path: '',
      format: '',
      quality: settingsStore.get().downloadQuality,
      createdAt: Date.now(),
      status: 'downloading',
      progress: 0,
    };
    libraryStore.update((value) => ({
      ...value,
      downloads: [item, ...value.downloads.filter((d) => d.track.id !== track.id)],
    }));
    onProgress?.({ id, progress: 0, status: 'downloading' });

    const cookie = args.includes('--cookies') ? args[args.indexOf('--cookies') + 1] : null;
    const debug = Boolean(process.env.AURALIS_DEBUG_DOWNLOAD);
    if (debug) console.log('[download] spawn', ytdlpPath(), args);
    return new Promise<DownloadItem>((resolve, reject) => {
      const child = spawn(ytdlpPath(), args, { windowsHide: true });
      active.set(id, child);
      let stderr = '';
      let lastProgress = 0;
      const finish = (status: DownloadItem['status'], error?: string) => {
        active.delete(id);
        if (cookie) fs.rm(cookie, { force: true }, () => {});
        let file = '';
        try {
          file = fs.readdirSync(dir).find((name) => name.startsWith(`${base}.`) && !name.endsWith('.part')) || '';
          if (file) file = path.join(dir, file);
        } catch {
          file = '';
        }
        if (status === 'cancelled') removePartialFiles(track.id);
        const size = file && fs.existsSync(file) ? fs.statSync(file).size : undefined;
        const completed: DownloadItem = {
          ...item,
          path: file,
          format: file ? path.extname(file).replace('.', '') : '',
          size,
          status,
          progress: status === 'done' ? 100 : lastProgress,
          error,
        };
        libraryStore.update((value) => ({
          ...value,
          downloads: value.downloads.map((d) => (d.id === id ? completed : d)),
        }));
        onProgress?.({ id, progress: completed.progress || 0, status, error, path: file });
        if (status === 'done') {
          try {
            if (file && process.platform !== 'win32') fs.chmodSync(file, 0o600);
          } catch {
            // best-effort privacy hardening
          }
          resolve(completed);
        } else if (status === 'paused') resolve(completed);
        else reject(new Error(error || 'Download failed.'));
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        if (debug) console.log('[download] stdout', text.trim().slice(0, 500));
        for (const match of text.matchAll(/\[download\]\s+([\d.]+)%/g)) {
          lastProgress = Number(match[1]);
          onProgress?.({ id, progress: lastProgress, status: 'downloading' });
        }
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        if (debug) console.log('[download] stderr', text.trim().slice(0, 500));
        stderr += text;
        if (stderr.length > 8000) stderr = stderr.slice(-8000);
      });
      child.on('error', (error) => {
        if (debug) console.log('[download] error', error);
        finish('error', error.message);
      });
      child.on('close', (code) => {
        if (debug) console.log('[download] close', code, stderr.slice(-500));
        if (code === 0) finish('done');
        else if (pausedDownloads.has(id)) finish('paused');
        else if (child.killed) finish('cancelled', 'Download cancelled.');
        else finish('error', stderr.trim().split(/\r?\n/).slice(-3).join(' ') || `yt-dlp exited with code ${code}.`);
      });
    });
  }

  cancelDownload(id: string) {
    pausedDownloads.delete(id);
    const child = active.get(id);
    if (child) child.kill();
    active.delete(id);
    const item = libraryStore.get().downloads.find((entry) => entry.id === id);
    if (item) removePartialFiles(item.track.id);
    if (item && (item.status === 'paused' || item.status === 'queued')) {
      libraryStore.update((value) => ({
        ...value,
        downloads: value.downloads.map((entry) =>
          entry.id === id ? { ...entry, status: 'cancelled', error: 'Download cancelled.' } : entry,
        ),
      }));
    }
  }

  pauseDownload(id: string) {
    const child = active.get(id);
    if (!child) {
      const item = libraryStore.get().downloads.find((entry) => entry.id === id);
      if (item?.status === 'queued') {
        libraryStore.update((value) => ({
          ...value,
          downloads: value.downloads.map((entry) =>
            entry.id === id ? { ...entry, status: 'paused' as const } : entry,
          ),
        }));
      }
      return;
    }
    pausedDownloads.add(id);
    child.kill();
    active.delete(id);
  }

  async resumeDownload(id: string, onProgress?: (progress: DownloadProgress) => void): Promise<DownloadItem> {
    const item = libraryStore.get().downloads.find((entry) => entry.id === id);
    if (!item) throw new Error('Download entry not found.');
    pausedDownloads.delete(id);
    return this.download(item.track, onProgress);
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
