import { create } from 'zustand';
import type {
  AppInfo,
  Card,
  DownloadItem,
  DownloadProgress,
  LibraryData,
  LocalPlaylist,
  SessionState,
  Settings,
  Track,
} from '@shared/types';
import { toast } from './ui';

interface AppState {
  ready: boolean;
  settings: Settings;
  library: LibraryData;
  session: SessionState;
  appInfo?: AppInfo;
  init: () => Promise<void>;
  refreshLibrary: () => Promise<void>;
  refreshSession: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  resetSettings: () => Promise<void>;
  toggleLike: (track: Track) => Promise<boolean>;
  likeTrack: (track: Track) => Promise<void>;
  unlikeTrack: (trackId: string) => Promise<void>;
  isLiked: (trackId: string) => boolean;
  addRecent: (track: Track) => Promise<void>;
  recordEvent: (track: Track, completed: boolean) => Promise<void>;
  createPlaylist: (name: string, description?: string) => Promise<LocalPlaylist>;
  renamePlaylist: (id: string, name: string, description?: string) => Promise<LocalPlaylist>;
  deletePlaylist: (id: string) => Promise<void>;
  addToPlaylist: (id: string, track: Track) => Promise<LocalPlaylist>;
  removeFromPlaylist: (id: string, trackId: string) => Promise<void>;
  reorderPlaylist: (id: string, from: number, to: number) => Promise<void>;
  addSearchHistory: (query: string) => Promise<void>;
  removeSearchHistory: (query: string) => Promise<void>;
  clearSearchHistory: () => Promise<void>;
  clearRecent: () => Promise<void>;
  toggleSaveAlbum: (album: Card) => Promise<void>;
  isAlbumSaved: (id: string) => boolean;
  toggleSaveArtist: (artist: Card) => Promise<void>;
  isArtistSaved: (id: string) => boolean;
  downloadTrack: (track: Track) => Promise<void>;
  removeDownload: (id: string, deleteFile?: boolean) => Promise<void>;
  clearDownloads: (deleteFiles?: boolean) => Promise<void>;
  login: () => Promise<SessionState>;
  setCookies: (cookie: string) => Promise<SessionState>;
  clearSession: () => Promise<SessionState>;
}

const EMPTY_SETTINGS: Settings = {
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
  eq: { enabled: false, bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], preamp: 0, bassBoost: false },
  playbackRate: 1,
  skipSilence: false,
  showLyricsInPlayer: true,
  lyricsProviders: [],
  translation: {
    enabled: false,
    provider: 'deepl',
    targetLanguage: 'EN',
    deeplApiKey: '',
    openaiBaseUrl: 'https://api.openai.com/v1',
    openaiApiKey: '',
    openaiModel: 'gpt-4o-mini',
  },
  downloadDir: '',
  downloadQuality: 'best',
  autoDownloadLiked: false,
  lastfm: { enabled: false, apiKey: '', apiSecret: '', sessionKey: '', username: '', scrobble: true, nowPlaying: true },
  discord: { enabled: false, appId: '', showButtons: true },
  proxy: '',
  trayEnabled: true,
  closeToTray: false,
  hardwareAcceleration: true,
  scrobbleThreshold: 0.5,
  sidebarCollapsed: false,
};

const EMPTY_LIBRARY: LibraryData = {
  liked: [],
  playlists: [],
  recent: [],
  events: [],
  downloads: [],
  savedAlbums: [],
  savedArtists: [],
  searchHistory: [],
};

const EMPTY_SESSION: SessionState = { hasCookies: false, authUser: '0' };

function resolvedTheme(theme: Settings['theme']): 'dark' | 'light' | 'black' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return theme;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const value = hex.replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(value) && !/^[0-9a-f]{3}$/i.test(value)) return null;
  const full = value.length === 3 ? value.split('').map((char) => char + char).join('') : value;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

export function applyAppearance(settings: Settings) {
  const theme = resolvedTheme(settings.theme);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
  const accent = settings.accent || '#8ab4f8';
  document.documentElement.style.setProperty('--accent', accent);
  const rgb = hexToRgb(accent) || [138, 180, 248];
  document.documentElement.style.setProperty('--accent-rgb', rgb.join(', '));
  const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  document.documentElement.style.setProperty('--accent-contrast', luminance > 0.62 ? '#101014' : '#ffffff');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f7f6fa' : '#0b0b10');
}

let initialized = false;
let eventsBound = false;
let systemThemeListener: (() => void) | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  settings: EMPTY_SETTINGS,
  library: EMPTY_LIBRARY,
  session: EMPTY_SESSION,
  appInfo: undefined,

  init: async () => {
    if (initialized) return;
    initialized = true;
    const [settingsResult, libraryResult, sessionResult, infoResult] = await Promise.allSettled([
      window.auralis.settings.get(),
      window.auralis.library.get(),
      window.auralis.yt.session(),
      window.auralis.app.info(),
    ]);
    const failures: string[] = [];
    const settings = settingsResult.status === 'fulfilled' ? settingsResult.value : get().settings;
    const library = libraryResult.status === 'fulfilled' ? libraryResult.value : get().library;
    const session = sessionResult.status === 'fulfilled' ? sessionResult.value : get().session;
    const appInfo = infoResult.status === 'fulfilled' ? infoResult.value : get().appInfo;
    if (settingsResult.status === 'rejected') failures.push('settings');
    if (libraryResult.status === 'rejected') failures.push('library');
    if (sessionResult.status === 'rejected') failures.push('account session');
    if (infoResult.status === 'rejected') failures.push('app diagnostics');

    set({ settings, library, session, appInfo, ready: true });
    applyAppearance(settings);

    if (settings.sidebarCollapsed) {
      const { useUiStore } = await import('./ui');
      useUiStore.getState().setSidebarCollapsed(true);
    }

    if (!systemThemeListener) {
      const media = window.matchMedia('(prefers-color-scheme: light)');
      systemThemeListener = () => {
        if (get().settings.theme === 'system') applyAppearance(get().settings);
      };
      media.addEventListener('change', systemThemeListener);
    }

    // Event wiring must survive a partial load; otherwise later settings or
    // library writes would never reach this window.
    if (!eventsBound) {
      eventsBound = true;
      window.auralis.events.onSettingsChange((next) => {
        set({ settings: next });
        applyAppearance(next);
      });
      window.auralis.events.onLibraryChange((next) => set({ library: next }));
      window.auralis.events.onSessionChange((next) => set({ session: next }));
      window.auralis.events.onDownloadProgress((progress: DownloadProgress) => {
        const known = get().library.downloads.some((item) => item.id === progress.id);
        if (!known) void get().refreshLibrary();
        set((state) => ({
          library: {
            ...state.library,
            downloads: state.library.downloads.map((item) =>
              item.id === progress.id
                ? {
                    ...item,
                    progress: progress.progress,
                    status: progress.status,
                    error: progress.error,
                    path: progress.path || item.path,
                  }
                : item,
            ),
          },
        }));
        if (progress.status === 'done' || progress.status === 'error') void get().refreshLibrary();
      });
    }

    if (failures.length) {
      // Leave init retryable. Successfully loaded data stays visible.
      initialized = false;
      toast(
        `Auralis started with partial data (could not load ${failures.join(', ')}).`,
        'error',
        { label: 'Retry', onClick: () => void get().init() },
      );
    }
  },

  refreshLibrary: async () => {
    const library = await window.auralis.library.get();
    set({ library });
  },

  refreshSession: async () => {
    const session = await window.auralis.yt.session();
    set({ session });
  },

  updateSettings: async (patch) => {
    const optimistic = { ...get().settings, ...patch } as Settings;
    set({ settings: optimistic });
    applyAppearance(optimistic);
    try {
      const settings = await window.auralis.settings.set(patch);
      set({ settings });
      applyAppearance(settings);
    } catch (error: any) {
      toast(`Could not save settings: ${error?.message || error}`, 'error');
    }
  },

  resetSettings: async () => {
    const settings = await window.auralis.settings.reset();
    set({ settings });
    applyAppearance(settings);
    toast('Settings reset to defaults.', 'success');
  },

  isLiked: (trackId) => get().library.liked.some((track) => track.id === trackId),

  likeTrack: async (track) => {
    if (get().isLiked(track.id)) return;
    const library = await window.auralis.library.like(track);
    set({ library });
    if (get().session.hasCookies) {
      window.auralis.yt.rate(track.id, 'like').catch(() => {});
    }
    if (get().settings.lastfm.enabled && get().settings.lastfm.sessionKey) {
      window.auralis.lastfm.love(track, true).catch(() => {});
    }
  },

  unlikeTrack: async (trackId) => {
    const library = await window.auralis.library.unlike(trackId);
    set({ library });
    if (get().session.hasCookies) {
      window.auralis.yt.rate(trackId, 'none').catch(() => {});
    }
  },

  toggleLike: async (track) => {
    if (get().isLiked(track.id)) {
      await get().unlikeTrack(track.id);
      return false;
    }
    await get().likeTrack(track);
    return true;
  },

  addRecent: async (track) => {
    const library = await window.auralis.library.addRecent(track);
    set({ library });
  },

  recordEvent: async (track, completed) => {
    const library = await window.auralis.library.recordEvent({
      trackId: track.id,
      title: track.title,
      artist: (track.artists || []).map((artist) => artist.name).join(', '),
      album: track.album?.name,
      duration: track.duration,
      completed,
    });
    set({ library });
  },

  createPlaylist: async (name, description) => {
    const playlist = await window.auralis.library.createPlaylist(name, description);
    set((state) => ({
      library: { ...state.library, playlists: [playlist, ...state.library.playlists.filter((item) => item.id !== playlist.id)] },
    }));
    return playlist;
  },

  renamePlaylist: async (id, name, description) => {
    const playlist = await window.auralis.library.renamePlaylist(id, name, description);
    set((state) => ({
      library: {
        ...state.library,
        playlists: state.library.playlists.map((item) => (item.id === id ? playlist : item)),
      },
    }));
    return playlist;
  },

  deletePlaylist: async (id) => {
    const library = await window.auralis.library.deletePlaylist(id);
    set({ library });
  },

  addToPlaylist: async (id, track) => {
    const playlist = await window.auralis.library.addToPlaylist(id, track);
    set((state) => ({
      library: {
        ...state.library,
        playlists: state.library.playlists.map((item) => (item.id === id ? playlist : item)),
      },
    }));
    return playlist;
  },

  removeFromPlaylist: async (id, trackId) => {
    const playlist = await window.auralis.library.removeFromPlaylist(id, trackId);
    set((state) => ({
      library: {
        ...state.library,
        playlists: state.library.playlists.map((item) => (item.id === id ? playlist : item)),
      },
    }));
  },

  reorderPlaylist: async (id, from, to) => {
    const playlist = await window.auralis.library.reorderPlaylist(id, from, to);
    set((state) => ({
      library: {
        ...state.library,
        playlists: state.library.playlists.map((item) => (item.id === id ? playlist : item)),
      },
    }));
  },

  addSearchHistory: async (query) => {
    if (!query.trim()) return;
    const library = await window.auralis.library.addSearchHistory(query);
    set({ library });
  },

  removeSearchHistory: async (query) => {
    const library = await window.auralis.library.removeSearchHistory(query);
    set({ library });
  },

  clearSearchHistory: async () => {
    const library = await window.auralis.library.clearSearchHistory();
    set({ library });
  },

  clearRecent: async () => {
    const library = await window.auralis.library.clearRecent();
    set({ library });
    toast('Listening history cleared.', 'success');
  },

  isAlbumSaved: (id) => get().library.savedAlbums.some((album) => album.id === id),

  toggleSaveAlbum: async (album) => {
    const saved = get().isAlbumSaved(album.id);
    const library = saved
      ? await window.auralis.library.removeAlbum(album.id)
      : await window.auralis.library.saveAlbum(album);
    set({ library });
    toast(saved ? 'Removed from your library.' : 'Saved to your library.', 'success');
  },

  isArtistSaved: (id) => get().library.savedArtists.some((artist) => artist.id === id),

  toggleSaveArtist: async (artist) => {
    const saved = get().isArtistSaved(artist.id);
    const library = saved
      ? await window.auralis.library.removeArtist(artist.id)
      : await window.auralis.library.saveArtist(artist);
    set({ library });
    toast(saved ? 'Removed artist from your library.' : 'Artist added to your library.', 'success');
  },

  downloadTrack: async (track) => {
    const existing = get().library.downloads.find((item) => item.track.id === track.id && item.status === 'done');
    if (existing?.path) {
      toast('This track is already downloaded.', 'info');
      return;
    }
    toast(`Downloading “${track.title}”…`, 'info');
    try {
      const item = await window.auralis.player.download(track);
      await get().refreshLibrary();
      toast(`Downloaded “${item.track.title}”.`, 'success', {
        label: 'Show file',
        onClick: () => window.auralis.app.showItemInFolder(item.path),
      });
    } catch (error: any) {
      await get().refreshLibrary();
      toast(`Download failed: ${error?.message || error}`, 'error');
    }
  },

  removeDownload: async (id, deleteFile = true) => {
    const downloads = await window.auralis.library.removeDownload(id, deleteFile);
    set((state) => ({ library: { ...state.library, downloads } }));
  },

  clearDownloads: async (deleteFiles = true) => {
    const downloads = await window.auralis.library.clearDownloads(deleteFiles);
    set((state) => ({ library: { ...state.library, downloads } }));
  },

  login: async () => {
    const session = await window.auralis.yt.login();
    set({ session });
    if (session.hasCookies) toast('Signed in to YouTube Music.', 'success');
    return session;
  },

  setCookies: async (cookie) => {
    const session = await window.auralis.yt.setCookies(cookie);
    set({ session });
    if (session.hasCookies) toast('Cookie added. You are signed in.', 'success');
    else toast('No valid cookies found in that text.', 'error');
    return session;
  },

  clearSession: async () => {
    const session = await window.auralis.yt.clearSession();
    set({ session });
    toast('Signed out of YouTube Music.');
    return session;
  },
}));

export function downloadForTrack(downloads: DownloadItem[], trackId: string): DownloadItem | undefined {
  return downloads.find((item) => item.track.id === trackId && item.status === 'done');
}
