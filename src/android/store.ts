import type {
  AccountInfo,
  LibraryData,
  LocalPlaylist,
  Settings,
  Track,
} from '../../shared/types';

/**
 * The Android build keeps the exact same persistent data shapes as the desktop
 * build, but stores them in the WebView origin's localStorage. The WebView data
 * directory survives app restarts and upgrades.
 */

export interface AndroidNativeBridge {
  downloadsDir(): string;
  appInfo(): string;
  openExternalUrl(url: string): void;
  openFile(path: string): void;
  showInFolder(path: string): void;
  showMessage(message: string): void;
  closeApp(): void;
  relaunch(): void;
  login(): void;
  setTheme(dark: boolean): void;
  setPlayback(
    playing: boolean,
    title: string,
    artist: string,
    artwork: string,
    positionMs: number,
    durationMs: number,
    liked: boolean,
    trackId: string,
    buffering: boolean,
  ): void;
  stopPlayback?(): void;
  startVoiceSearch?(): void;
  cancelVoiceSearch?(): void;
  openAppSettings(): void;
}

export interface AndroidMediaSnapshot {
  position: number;
  duration: number;
  buffering: boolean;
  liked: boolean;
}

declare global {
  interface Window {
    AuralisNative?: AndroidNativeBridge;
    __auralisNativeEvent?: (type: string, payload: unknown) => void;
    __auralisAndroidMediaState?: (track: Track | null, playing: boolean, snapshot?: AndroidMediaSnapshot) => void;
    __auralisVoiceResult?: (payload: string) => void;
  }
}

export function nativeBridge(): AndroidNativeBridge | undefined {
  try {
    return window.AuralisNative;
  } catch {
    return undefined;
  }
}

export function nativeAppInfo(): Record<string, unknown> {
  try {
    const raw = nativeBridge()?.appInfo();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function fallbackDownloadsDir(): string {
  return '/storage/emulated/0/Android/data/com.auralis.music/files/Music/Auralis';
}

export function downloadsDir(): string {
  try {
    const value = nativeBridge()?.downloadsDir();
    if (value && value.trim()) return value;
  } catch {
    // ignore
  }
  return fallbackDownloadsDir();
}

export function userDataDir(): string {
  const info = nativeAppInfo();
  return typeof info.userData === 'string' && info.userData ? info.userData : '/data/user/0/com.auralis.music/files';
}

const LEGACY_LYRICS_PROVIDERS = [
  'BetterLyrics',
  'Paxsenix',
  'LyricsPlus',
  'LrcLib',
  'KuGou',
  'YouTube',
  'YouTubeSubtitle',
  'Zemer',
];

// Accurate, metadata-searched providers come first. BetterLyrics can return a
// different song by the same artist when its catalogue match is fuzzy, so it is
// a fallback rather than the default source.
const DEFAULT_LYRICS_PROVIDERS = [
  'LrcLib',
  'LyricsPlus',
  'YouTube',
  'BetterLyrics',
  'KuGou',
  'YouTubeSubtitle',
  'Zemer',
  'Paxsenix',
];

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
    bassFrequency: 80,
    limiter: true,
  },
  playbackRate: 1,
  skipSilence: false,
  showLyricsInPlayer: true,
  videoClips: false,
  lyricsProviders: [...DEFAULT_LYRICS_PROVIDERS],
  translation: {
    enabled: false,
    provider: 'auto',
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepMerge<T extends Record<string, any>>(base: T, patch: any): T {
  if (patch === null || patch === undefined) return base;
  if (Array.isArray(base) || Array.isArray(patch) || typeof base !== 'object') {
    return patch as T;
  }
  const out: any = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (key in base) out[key] = deepMerge((base as any)[key], value);
    else out[key] = value;
  }
  return out;
}

class LocalJsonStore<T> {
  private current: T;

  constructor(
    private readonly key: string,
    private readonly defaults: T,
    private readonly validate?: (value: any) => T,
  ) {
    this.current = this.load();
  }

  private load(): T {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (this.validate) return this.validate(parsed);
        return { ...(this.defaults as any), ...parsed };
      }
    } catch (error) {
      console.error(`[store] failed to read ${this.key}`, error);
    }
    return clone(this.defaults);
  }

  get(): T {
    return this.current;
  }

  set(value: T): T {
    this.current = value;
    this.flush();
    return this.current;
  }

  update(fn: (value: T) => T | void): T {
    const next = fn(this.current);
    if (next !== undefined) this.current = next;
    this.flush();
    return this.current;
  }

  flush() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.current));
    } catch (error) {
      console.error(`[store] failed to write ${this.key}`, error);
    }
  }
}

export const settingsStore = new LocalJsonStore<Settings>('auralis.settings.v1', DEFAULT_SETTINGS, (value) => {
  const merged = deepMerge(DEFAULT_SETTINGS, value);
  if (!Array.isArray(merged.eq?.bands) || merged.eq.bands.length !== 10) {
    merged.eq = { ...DEFAULT_SETTINGS.eq };
  }
  merged.volume = Math.min(1, Math.max(0, Number(merged.volume) || 0));
  merged.playbackRate = Math.min(2, Math.max(0.5, Number(merged.playbackRate) || 1));
  if (
    Array.isArray(merged.lyricsProviders) &&
    merged.lyricsProviders.length === LEGACY_LYRICS_PROVIDERS.length &&
    LEGACY_LYRICS_PROVIDERS.every((provider, index) => merged.lyricsProviders[index] === provider)
  ) {
    merged.lyricsProviders = [...DEFAULT_LYRICS_PROVIDERS];
  }
  // The WebView can only stream files it is allowed to serve. Keep the folder
  // inside the app's own external music directory on Android.
  merged.downloadDir = downloadsDir();
  return merged;
});

export const libraryStore = new LocalJsonStore<LibraryData>('auralis.library.v1', DEFAULT_LIBRARY, (value) => {
  const merged = { ...DEFAULT_LIBRARY, ...(value || {}) };
  for (const key of [
    'liked',
    'playlists',
    'recent',
    'events',
    'downloads',
    'savedAlbums',
    'savedArtists',
    'searchHistory',
  ] as const) {
    if (!Array.isArray((merged as any)[key])) (merged as any)[key] = [];
  }
  return merged;
});

interface SessionFile {
  cookie?: string;
  visitorData?: string;
  dataSyncId?: string;
  authUser?: string;
  account?: AccountInfo;
}

export class SessionStore {
  private data: SessionFile = {};
  private cookieCache: string | null = null;

  constructor() {
    try {
      const raw = localStorage.getItem('auralis.session.v1');
      if (raw) this.data = JSON.parse(raw);
    } catch {
      this.data = {};
    }
  }

  get cookie(): string | null {
    if (this.cookieCache !== null) return this.cookieCache;
    this.cookieCache = this.data.cookie || null;
    return this.cookieCache;
  }

  set cookie(value: string | null) {
    this.cookieCache = value;
    if (value) this.data.cookie = value;
    else delete this.data.cookie;
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
      localStorage.setItem('auralis.session.v1', JSON.stringify(this.data));
    } catch (error) {
      console.error('[store] failed to write session', error);
    }
  }
}

export const sessionStore = new SessionStore();

export function flushStores() {
  settingsStore.flush();
  libraryStore.flush();
}

export function ensureDownloadsDir(): string {
  return downloadsDir();
}

export function newId(prefix = 'lp'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function playlistById(id: string): LocalPlaylist | undefined {
  return libraryStore.get().playlists.find((playlist) => playlist.id === id);
}

export function isTrackLiked(trackId: string): boolean {
  return libraryStore.get().liked.some((track) => track.id === trackId);
}

export function upsertRecent(track: Track) {
  const lib = libraryStore.get();
  const recent = [track, ...lib.recent.filter((item) => item.id !== track.id)].slice(0, 100);
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
        value = parsed.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
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
