import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  AccountInfo,
  LibraryData,
  LocalPlaylist,
  Settings,
  Track,
} from '../../shared/types';

let cachedUserData: string | undefined;

function fallbackTestDir(): string {
  return path.join(os.tmpdir(), 'auralis-test');
}

/** Resolves Electron's per-user data directory lazily (also lets scripts import this module). */
export function userDataDir(): string {
  if (cachedUserData) return cachedUserData;
  try {
    cachedUserData = app?.getPath?.('userData') || process.env.AURALIS_USER_DATA || fallbackTestDir();
  } catch {
    cachedUserData = process.env.AURALIS_USER_DATA || fallbackTestDir();
  }
  return cachedUserData;
}

export function downloadsDir(): string {
  // Offline media is app-private. It is never placed in Music, Downloads or
  // any other user-visible folder by default.
  return path.join(userDataDir(), 'offline');
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  accent: '#8ab4f8',
  language: 'en',
  region: 'US',
  startPage: 'home',
  audioQuality: 'auto',
  volume: 0.9,
  muted: false,
  normalize: false,
  crossfadeSec: 0,
  gapless: true,
  eq: {
    enabled: false,
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    preamp: 0,
    bassBoost: 0,
  },
  playbackRate: 1,
  skipSilence: false,
  showLyricsInPlayer: true,
  lyricsProviders: [
    'BetterLyrics',
    'Paxsenix',
    'LyricsPlus',
    'LrcLib',
    'KuGou',
    'YouTube',
    'YouTubeSubtitle',
    'Zemer',
  ],
  translation: {
    enabled: false,
    provider: 'deepl',
    targetLanguage: 'en',
    deeplApiKey: '',
    openaiBaseUrl: 'https://api.openai.com/v1',
    openaiApiKey: '',
    openaiModel: 'gpt-4o-mini',
  },
  downloadDir: downloadsDir(),
  downloadQuality: 'best',
  autoDownloadLiked: false,
  lastfm: {
    enabled: false,
    apiKey: '',
    apiSecret: '',
    sessionKey: '',
    username: '',
    scrobble: true,
    nowPlaying: true,
  },
  discord: {
    enabled: false,
    appId: '',
    showButtons: true,
  },
  proxy: '',
  trayEnabled: true,
  closeToTray: false,
  hardwareAcceleration: true,
  scrobbleThreshold: 0.5,
  sidebarCollapsed: false,
};

const DEFAULT_LIBRARY: LibraryData = {
  liked: [],
  playlists: [],
  recent: [],
  events: [],
  downloads: [],
  savedAlbums: [],
  savedArtists: [],
  searchHistory: [],
};

function deepMerge<T extends Record<string, any>>(base: T, patch: any): T {
  if (patch === null || patch === undefined) return base;
  if (Array.isArray(base) || Array.isArray(patch) || typeof base !== 'object') {
    return patch as T;
  }
  const out: any = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (key in base) {
      out[key] = deepMerge((base as any)[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Keep local stores readable only by the current user on Unix. */
function restrictFile(file: string): void {
  if (process.platform === 'win32') return;
  try {
    if (fs.existsSync(file)) fs.chmodSync(file, 0o600);
  } catch {
    // Best-effort; a read-only or unusual filesystem may reject chmod.
  }
}

class JsonFile<T> {
  private current: T;
  private writeTimer: NodeJS.Timeout | null = null;

  constructor(
    private file: string,
    private defaults: T,
    private validate?: (value: any) => T,
  ) {
    this.current = this.load();
    restrictFile(this.file);
  }

  private load(): T {
    try {
      if (fs.existsSync(this.file)) {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (this.validate) return this.validate(parsed);
        return { ...this.defaults, ...parsed };
      }
    } catch (error) {
      console.error(`[store] failed to read ${this.file}`, error);
    }
    return structuredClone(this.defaults);
  }

  get(): T {
    return this.current;
  }

  set(value: T): T {
    this.current = value;
    this.queueWrite();
    return this.current;
  }

  update(fn: (value: T) => T | void): T {
    const next = fn(this.current);
    if (next !== undefined) this.current = next;
    this.queueWrite();
    return this.current;
  }

  private queueWrite() {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.flush();
    }, 120);
  }

  flush() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.current, null, 2), { encoding: 'utf8', mode: 0o600 });
      restrictFile(tmp);
      fs.renameSync(tmp, this.file);
      restrictFile(this.file);
    } catch (error) {
      console.error(`[store] failed to write ${this.file}`, error);
    }
  }
}

const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]|^\\\\/;

/**
 * A settings.json copied from the Windows build may contain C:\... paths.
 * Ignore them at runtime instead of deleting files or rewriting the user's
 * library data. The next settings write persists the Linux default.
 */
function normalizePlatformSettings(settings: Settings): Settings {
  if (process.platform !== 'win32' && WINDOWS_ABSOLUTE_PATH.test(settings.downloadDir || '')) {
    console.warn('[auralis] ignoring Windows download folder on Linux:', settings.downloadDir);
    settings.downloadDir = downloadsDir();
  }
  return settings;
}

export const settingsStore = new JsonFile<Settings>(path.join(userDataDir(), 'settings.json'), DEFAULT_SETTINGS, (value) => {
  const merged = deepMerge(DEFAULT_SETTINGS, value);
  if (!Array.isArray(merged.eq?.bands) || merged.eq.bands.length !== 10) {
    merged.eq = { ...DEFAULT_SETTINGS.eq };
  } else {
    merged.eq = {
      ...DEFAULT_SETTINGS.eq,
      ...merged.eq,
      preamp: Math.min(12, Math.max(-12, Number(merged.eq.preamp) || 0)),
      bassBoost: Math.min(12, Math.max(-12, Number(merged.eq.bassBoost) || 0)),
      bands: merged.eq.bands.map((value) => Math.min(12, Math.max(-12, Number(value) || 0))),
    };
  }
  merged.volume = Math.min(1, Math.max(0, Number(merged.volume) || 0));
  merged.playbackRate = Math.min(2, Math.max(0.5, Number(merged.playbackRate) || 1));
  return normalizePlatformSettings(merged);
});

export const libraryStore = new JsonFile<LibraryData>(path.join(userDataDir(), 'library.json'), DEFAULT_LIBRARY, (value) => {
  const merged = { ...DEFAULT_LIBRARY, ...(value || {}) };
  for (const key of ['liked', 'playlists', 'recent', 'events', 'downloads', 'savedAlbums', 'savedArtists', 'searchHistory'] as const) {
    if (!Array.isArray((merged as any)[key])) (merged as any)[key] = [];
  }
  merged.liked = merged.liked.filter((item: LibraryData['liked'][number]) => Boolean(item?.id));
  merged.recent = merged.recent.filter((item: LibraryData['recent'][number]) => Boolean(item?.id));
  merged.playlists = merged.playlists
    .filter((item: LibraryData['playlists'][number]) => Boolean(item?.id))
    .map((item: LibraryData['playlists'][number]) => ({
      ...item,
      tracks: Array.isArray(item.tracks)
        ? item.tracks.filter((track: Track) => Boolean(track?.id))
        : [],
    }));
  merged.downloads = merged.downloads.filter(
    (item: LibraryData['downloads'][number]) => Boolean(item?.id && item?.track?.id),
  );
  merged.downloads = merged.downloads.map((item: LibraryData['downloads'][number]) => {
    if (item.status === 'downloading' || item.status === 'queued') {
      return { ...item, status: 'error' as const, error: 'Download was interrupted when Auralis closed. Retry to resume.' };
    }
    if (item.status === 'done' && item.path && !fs.existsSync(item.path)) {
      return { ...item, status: 'error' as const, error: 'The offline file is missing. Retry the download.' };
    }
    return item;
  });
  return merged;
});

interface SessionFile {
  cookie?: string;
  cookieEncrypted?: string;
  visitorData?: string;
  dataSyncId?: string;
  authUser?: string;
  account?: AccountInfo;
}

let backendLogged = false;

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/** Log the Linux secret-service backend once, after the app is ready. */
function logSecretBackend(): void {
  if (backendLogged || process.platform !== 'linux' || !app.isReady()) return;
  backendLogged = true;
  try {
    const backend = safeStorage.getSelectedStorageBackend();
    if (backend === 'basic_text') {
      console.warn('[auralis] no OS keyring available; session cookies use Electron basic_text storage');
    } else {
      console.info('[auralis] secret storage backend:', backend);
    }
  } catch {
    // Older Electron builds do not expose the backend.
  }
}

export class SessionStore {
  private data: SessionFile = {};
  private cookieCache: string | null = null;

  private readonly file = path.join(userDataDir(), 'session.json');

  constructor() {
    try {
      if (fs.existsSync(this.file)) {
        this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      }
    } catch {
      this.data = {};
    }
    restrictFile(this.file);
  }

  get cookie(): string | null {
    if (this.cookieCache !== null) return this.cookieCache;
    logSecretBackend();
    let cookie = this.data.cookie || null;
    if (this.data.cookieEncrypted && encryptionAvailable()) {
      try {
        cookie = safeStorage.decryptString(Buffer.from(this.data.cookieEncrypted, 'base64'));
      } catch {
        cookie = null;
      }
    }
    this.cookieCache = cookie;
    return cookie;
  }

  set cookie(value: string | null) {
    this.cookieCache = value;
    logSecretBackend();
    if (value) {
      if (encryptionAvailable()) {
        try {
          this.data.cookieEncrypted = safeStorage.encryptString(value).toString('base64');
          delete this.data.cookie;
        } catch (error) {
          console.error('[auralis] could not encrypt session cookie; storing plaintext', error);
          this.data.cookie = value;
          delete this.data.cookieEncrypted;
        }
      } else {
        this.data.cookie = value;
        delete this.data.cookieEncrypted;
      }
    } else {
      delete this.data.cookie;
      delete this.data.cookieEncrypted;
    }
    this.save();
  }

  get visitorData(): string | undefined {
    return this.data.visitorData;
  }

  set visitorData(value: string | undefined) {
    this.data.visitorData = value;
    this.save();
  }

  get dataSyncId(): string | undefined {
    return this.data.dataSyncId;
  }

  set dataSyncId(value: string | undefined) {
    this.data.dataSyncId = value;
    this.save();
  }

  get authUser(): string {
    return this.data.authUser || '0';
  }

  set authUser(value: string) {
    this.data.authUser = value;
    this.save();
  }

  get account(): AccountInfo | undefined {
    return this.data.account;
  }

  set account(value: AccountInfo | undefined) {
    this.data.account = value;
    this.save();
  }

  clear() {
    this.data = {};
    this.cookieCache = null;
    this.save();
  }

  private save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { encoding: 'utf8', mode: 0o600 });
      restrictFile(tmp);
      fs.renameSync(tmp, this.file);
      restrictFile(this.file);
    } catch (error) {
      console.error('[store] failed to write session', error);
    }
  }
}

export const sessionStore = new SessionStore();

/** Ensures cookies are written to disk before the app quits. */
export function flushStores() {
  settingsStore.flush();
  libraryStore.flush();
}

export async function ensureDownloadsDir(): Promise<string> {
  const dir = downloadsDir();
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') await fs.promises.chmod(dir, 0o700);
  return dir;
}

export function newId(prefix = 'lp'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function playlistById(id: string): LocalPlaylist | undefined {
  return libraryStore.get().playlists.find((p) => p.id === id);
}

export function isTrackLiked(trackId: string): boolean {
  return libraryStore.get().liked.some((t) => t.id === trackId);
}

export function upsertRecent(track: Track) {
  const lib = libraryStore.get();
  const recent = [track, ...lib.recent.filter((t) => t.id !== track.id)].slice(0, 100);
  libraryStore.update((value) => ({ ...value, recent }));
}

/** Normalizes a pasted cookie string (also accepts "name=value; name=value"). */
export function sanitizeCookieString(input: string): string {
  let value = (input || '').trim();
  if (!value) return '';
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        value = parsed.map((c) => `${c.name}=${c.value}`).join('; ');
      }
    } catch {
      // keep as-is
    }
  }
  const pairs = new Map<string, string>();
  for (const part of value.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!name || /[\r\n]/.test(name) || /[\r\n]/.test(val)) continue;
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) continue;
    pairs.set(name, val);
  }
  return [...pairs.entries()].map(([name, val]) => `${name}=${val}`).join('; ');
}

export function cookieValue(cookie: string, name: string): string | undefined {
  for (const part of cookie.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return undefined;
}
