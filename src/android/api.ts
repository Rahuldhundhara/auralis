import type {
  AuralisApi,
} from '../../shared/api';
import type {
  AccountInfo,
  AppInfo,
  BrowsePage,
  Card,
  DownloadItem,
  DownloadProgress,
  LastFmState,
  LibraryData,
  LocalPlaylist,
  LyricsResult,
  NavEndpoint,
  NextResult,
  RecognizeResult,
  SearchResults,
  SearchSuggestion,
  SessionState,
  Settings,
  StreamInfo,
  Track,
  TranslationResult,
} from '../../shared/types';
import { nativeAppInfo, nativeBridge, sanitizeCookieString, settingsStore, DEFAULT_SETTINGS, downloadsDir } from './store';
import { libraryService, setLibraryChangeHandler } from './library';
import { lyricsService } from './lyrics';
import { lastfm } from './lastfm';
import { recognition } from './shazam';
import { streams } from './streams';
import { ytm } from './ytm';

type Listener = (payload: any) => void;
const listeners = new Map<string, Set<Listener>>();

export function emitEvent(name: string, payload: any) {
  const set = listeners.get(name);
  if (!set) return;
  for (const listener of [...set]) {
    try {
      listener(payload);
    } catch (error) {
      console.error(`[events] ${name} listener failed`, error);
    }
  }
}

function subscribe<T>(name: string, callback: (payload: T) => void): () => void {
  let set = listeners.get(name);
  if (!set) {
    set = new Set();
    listeners.set(name, set);
  }
  const listener = callback as Listener;
  set.add(listener);
  return () => {
    set?.delete(listener);
  };
}

setLibraryChangeHandler((data) => emitEvent('library-change', data));

interface NativeInfo {
  name?: string;
  version?: string;
  electron?: string;
  chrome?: string;
  platform?: string;
  userData?: string;
  downloadsDir?: string;
  ytDlpVersion?: string;
  ffmpegAvailable?: boolean;
}

function appInfo(): AppInfo {
  const raw = nativeAppInfo() as NativeInfo;
  return {
    name: raw.name || 'Auralis',
    version: raw.version || '1.0.3',
    electron: raw.electron || 'Android WebView',
    chrome: raw.chrome || navigator.userAgent,
    platform: raw.platform || 'android',
    userData: raw.userData || '',
    downloadsDir: raw.downloadsDir || downloadsDir(),
    ytDlpVersion: raw.ytDlpVersion,
    ffmpegAvailable: Boolean(raw.ffmpegAvailable),
  };
}

function mergeSettings(current: Settings, patch: Partial<Settings>): Settings {
  const next: Settings = { ...current, ...patch };
  if (patch.eq) {
    next.eq = {
      ...current.eq,
      ...patch.eq,
      bands: patch.eq.bands ? [...patch.eq.bands] : current.eq.bands,
    };
  }
  if (patch.lastfm) next.lastfm = { ...current.lastfm, ...patch.lastfm };
  if (patch.discord) next.discord = { ...current.discord, ...patch.discord };
  if (patch.translation) next.translation = { ...current.translation, ...patch.translation };
  next.volume = Math.min(1, Math.max(0, Number(next.volume) || 0));
  next.playbackRate = Math.min(2, Math.max(0.5, Number(next.playbackRate) || 1));
  next.downloadDir = downloadsDir();
  return next;
}

function applyNativeTheme(settings: Settings) {
  try {
    nativeBridge()?.setTheme(settings.theme !== 'light');
  } catch {
    // System bars are cosmetic.
  }
}

function publishSession(state: SessionState): SessionState {
  emitEvent('session-change', state);
  return state;
}

let pendingLogin: {
  resolve: (state: SessionState) => void;
  reject: (error: Error) => void;
} | null = null;
let loginPromise: Promise<SessionState> | null = null;

async function handleLoginCookie(cookie: string) {
  const pending = pendingLogin;
  pendingLogin = null;
  try {
    let state: SessionState;
    if (cookie.trim()) {
      state = publishSession(await ytm.setCookies(sanitizeCookieString(cookie)));
    } else {
      state = ytm.session();
    }
    pending?.resolve(state);
  } catch (error: any) {
    pending?.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

export function installNativeEventHandler() {
  window.__auralisNativeEvent = (type, payload) => {
    if (type === 'media-key') {
      emitEvent('media-key', typeof payload === 'string' ? payload : String(payload || ''));
      return;
    }
    if (type === 'login') {
      let cookie = '';
      if (typeof payload === 'string') {
        try {
          cookie = String(JSON.parse(payload)?.cookie || '');
        } catch {
          cookie = payload;
        }
      } else if (payload && typeof payload === 'object') {
        cookie = String((payload as any).cookie || '');
      }
      void handleLoginCookie(cookie);
    }
  };
}

function openExternal(raw: string) {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return;
    nativeBridge()?.openExternalUrl(url.toString());
  } catch {
    // Ignore malformed URLs, matching the desktop app.
  }
}

const api: AuralisApi = {
  app: {
    info: async () => appInfo(),
    minimize: async () => {},
    toggleMaximize: async () => false,
    close: async () => {
      nativeBridge()?.closeApp();
    },
    openExternal: async (url) => openExternal(url),
    showItemInFolder: async (path) => {
      if (path) nativeBridge()?.showInFolder(path);
    },
    chooseFolder: async () => downloadsDir(),
    setBadge: async () => {},
    flashFrame: async () => {},
    setTheme: async (dark) => {
      nativeBridge()?.setTheme(Boolean(dark));
    },
    relaunch: async () => {
      nativeBridge()?.relaunch();
    },
  },

  settings: {
    get: async () => settingsStore.get(),
    set: async (patch) => {
      const merged = settingsStore.update((current) => mergeSettings(current, patch));
      applyNativeTheme(merged);
      emitEvent('settings-change', merged);
      return merged;
    },
    reset: async () => {
      const defaults = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Settings;
      defaults.downloadDir = downloadsDir();
      const merged = settingsStore.set(defaults);
      applyNativeTheme(merged);
      emitEvent('settings-change', merged);
      return merged;
    },
  },

  library: {
    get: async () => libraryService.get(),
    like: async (track) => {
      const data = libraryService.like(track);
      if (settingsStore.get().autoDownloadLiked) {
        void streams
          .download(track, (progress) => emitEvent('download-progress', progress))
          .catch(() => {});
      }
      return data;
    },
    unlike: async (trackId) => libraryService.unlike(trackId),
    isLiked: async (trackId) => libraryService.isLiked(trackId),
    addRecent: async (track) => libraryService.addRecent(track),
    recordEvent: async (event) => libraryService.recordEvent(event),
    createPlaylist: async (name, description) => libraryService.createPlaylist(name, description),
    importPlaylist: async (name, tracks, description, remoteId) =>
      libraryService.importPlaylist(name, tracks, description || '', remoteId || ''),
    renamePlaylist: async (id, name, description) => libraryService.renamePlaylist(id, name, description),
    deletePlaylist: async (id) => libraryService.deletePlaylist(id),
    addToPlaylist: async (id, track) => libraryService.addToPlaylist(id, track),
    removeFromPlaylist: async (id, trackId) => libraryService.removeFromPlaylist(id, trackId),
    reorderPlaylist: async (id, from, to) => libraryService.reorderPlaylist(id, from, to),
    addSearchHistory: async (query) => libraryService.addSearchHistory(query),
    removeSearchHistory: async (query) => libraryService.removeSearchHistory(query),
    clearSearchHistory: async () => libraryService.clearSearchHistory(),
    clearRecent: async () => libraryService.clearRecent(),
    saveAlbum: async (album) => libraryService.saveAlbum(album),
    removeAlbum: async (albumId) => libraryService.removeAlbum(albumId),
    saveArtist: async (artist) => libraryService.saveArtist(artist),
    removeArtist: async (artistId) => libraryService.removeArtist(artistId),
    getDownloads: async () => libraryService.getDownloads(),
    removeDownload: async (id, deleteFile) => libraryService.removeDownload(id, deleteFile),
    clearDownloads: async (deleteFiles) => libraryService.clearDownloads(deleteFiles),
  },

  yt: {
    session: async () => ytm.session(),
    login: async () => {
      if (loginPromise) return loginPromise;
      const bridge = nativeBridge();
      if (!bridge) throw new Error('Google sign-in is only available in the Android app.');
      loginPromise = new Promise<SessionState>((resolve, reject) => {
        pendingLogin = { resolve, reject };
        try {
          bridge.login();
        } catch (error: any) {
          pendingLogin = null;
          loginPromise = null;
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
      const clear = () => {
        loginPromise = null;
      };
      loginPromise.then(clear, clear);
      return loginPromise;
    },
    setCookies: async (cookie) => publishSession(await ytm.setCookies(sanitizeCookieString(cookie))),
    clearSession: async () => publishSession(ytm.clearSession()),
    home: async (continuation) => ytm.home(continuation),
    explore: async () => ytm.explore(),
    charts: async () => ytm.charts(),
    newReleases: async () => ytm.newReleases(),
    moods: async () => ytm.moods(),
    browse: async (id, params, continuation) => ytm.browsePage(id, params, continuation),
    browseEndpoint: async (endpoint) => ytm.browseEndpoint(endpoint),
    artist: async (id) => ytm.artist(id),
    album: async (id) => ytm.album(id),
    playlist: async (id) => ytm.playlist(id),
    podcast: async (id) => ytm.podcast(id),
    detailContinuation: async (continuation) => ytm.detailContinuation(continuation),
    search: async (query, filter, continuation) => ytm.search(query, filter, continuation),
    searchSuggestions: async (query) => ytm.searchSuggestions(query),
    next: async (endpoint, continuation) => ytm.next(endpoint, continuation),
    lyrics: async (endpoint) => ytm.lyrics(endpoint),
    transcript: async (videoId) => ytm.transcript(videoId),
    library: async () => ytm.library(),
    libraryPage: async (id, params, continuation) => ytm.libraryPage(id, params, continuation),
    history: async () => ytm.history(),
    account: async () => ytm.account(),
    rate: async (videoId, rating) => ytm.rate(videoId, rating),
    subscribe: async (channelId, subscribe, params) => ytm.subscribe(channelId, subscribe, params),
    addToYTPlaylist: async (playlistId, videoId) => ytm.addToYTPlaylist(playlistId, videoId),
    removeFromYTPlaylist: async (playlistId, videoId, setVideoId) =>
      ytm.removeFromYTPlaylist(playlistId, videoId, setVideoId),
    createYTPlaylist: async (title) => ytm.createYTPlaylist(title),
    renameYTPlaylist: async (playlistId, title) => ytm.renameYTPlaylist(playlistId, title),
    deleteYTPlaylist: async (playlistId) => ytm.deleteYTPlaylist(playlistId),
    addToLibrary: async (videoId) => ytm.addToLibrary(videoId),
    removeFromLibrary: async (videoId) => ytm.removeFromLibrary(videoId),
  },

  player: {
    resolve: async (track: Track): Promise<StreamInfo> => streams.resolve(track),
    resolveVideo: async (track: Track): Promise<StreamInfo> => streams.resolveVideo(track),
    prefetch: async (track) => streams.prefetch(track),
    download: async (track) =>
      streams.download(track, (progress: DownloadProgress) => emitEvent('download-progress', progress)),
    cancelDownload: async (id) => {
      streams.cancelDownload(id);
    },
    invalidate: async (trackId) => {
      streams.invalidate(trackId);
    },
    ffmpegAvailable: async () => streams.ffmpegAvailable(),
    ytdlpUpdate: async () => streams.update(),
  },

  lyrics: {
    fetch: async (track, providers) => lyricsService.fetch(track, providers),
    translate: async (lines, targetLanguage) => lyricsService.translate(lines, targetLanguage),
  },

  lastfm: {
    state: async () => lastfm.state(),
    beginAuth: async () => lastfm.beginAuth(),
    completeAuth: async (token) => {
      const state = await lastfm.completeAuth(token);
      emitEvent('settings-change', settingsStore.get());
      return state;
    },
    disconnect: async () => {
      const state = lastfm.disconnect();
      emitEvent('settings-change', settingsStore.get());
      return state;
    },
    nowPlaying: async (track) => lastfm.nowPlaying(track),
    scrobble: async (track, startedAt) => lastfm.scrobble(track, startedAt),
    love: async (track, loved) => lastfm.love(track, loved),
  },

  discord: {
    // Discord IPC is a desktop-only transport. Keeping the methods present means
    // the unchanged renderer can call them without feature detection.
    update: async () => {},
    clear: async () => {},
  },

  recognize: {
    fromFile: async (path) => recognition.fromFile(path),
    fromVideoId: async (videoId) => recognition.fromVideoId(videoId),
    fromPcm: async (pcm) => recognition.fromPcm(pcm),
  },

  window: {
    onStateChange: () => () => {},
  },

  events: {
    onDownloadProgress: (cb) => subscribe<DownloadProgress>('download-progress', cb),
    onLibraryChange: (cb) => subscribe<LibraryData>('library-change', cb),
    onSettingsChange: (cb) => subscribe<Settings>('settings-change', cb),
    onMediaKey: (cb) => subscribe<string>('media-key', cb),
    onNavigate: (cb) => subscribe<string>('navigate', cb),
    onLyricsTranslation: (cb) => subscribe<{ lineIndex: number; text: string }>('lyrics-translation', cb),
    onSessionChange: (cb) => subscribe<SessionState>('session-change', cb),
  },

  shell: {
    openPath: async (path) => {
      if (!path) return 'Missing path.';
      try {
        nativeBridge()?.openFile(path);
        return '';
      } catch (error: any) {
        return error?.message || 'Could not open that path.';
      }
    },
  },
};

export default api;
