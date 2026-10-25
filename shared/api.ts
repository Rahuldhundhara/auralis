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
} from './types';

/** Shape exposed on window.auralis by the preload script. */
export interface AuralisApi {
  app: {
    info(): Promise<AppInfo>;
    minimize(): Promise<void>;
    toggleMaximize(): Promise<boolean>;
    close(): Promise<void>;
    openExternal(url: string): Promise<void>;
    showItemInFolder(path: string): Promise<void>;
    chooseFolder(defaultPath?: string): Promise<string | null>;
    setBadge(text: string): Promise<void>;
    flashFrame(flag: boolean): Promise<void>;
    setTheme(dark: boolean): Promise<void>;
    relaunch(): Promise<void>;
  };
  settings: {
    get(): Promise<Settings>;
    set(patch: Partial<Settings>): Promise<Settings>;
    reset(): Promise<Settings>;
  };
  library: {
    get(): Promise<LibraryData>;
    like(track: Track): Promise<LibraryData>;
    unlike(trackId: string): Promise<LibraryData>;
    isLiked(trackId: string): Promise<boolean>;
    addRecent(track: Track): Promise<LibraryData>;
    recordEvent(event: {
      trackId: string;
      title: string;
      artist: string;
      album?: string;
      duration: number;
      completed: boolean;
    }): Promise<LibraryData>;
    createPlaylist(name: string, description?: string): Promise<LocalPlaylist>;
    renamePlaylist(id: string, name: string, description?: string): Promise<LocalPlaylist>;
    deletePlaylist(id: string): Promise<LibraryData>;
    addToPlaylist(id: string, track: Track): Promise<LocalPlaylist>;
    removeFromPlaylist(id: string, trackId: string): Promise<LocalPlaylist>;
    reorderPlaylist(id: string, from: number, to: number): Promise<LocalPlaylist>;
    addSearchHistory(query: string): Promise<LibraryData>;
    clearSearchHistory(): Promise<LibraryData>;
    clearRecent(): Promise<LibraryData>;
    saveAlbum(album: Card): Promise<LibraryData>;
    removeAlbum(albumId: string): Promise<LibraryData>;
    saveArtist(artist: Card): Promise<LibraryData>;
    removeArtist(artistId: string): Promise<LibraryData>;
    getDownloads(): Promise<DownloadItem[]>;
    removeDownload(id: string, deleteFile?: boolean): Promise<DownloadItem[]>;
    clearDownloads(deleteFiles?: boolean): Promise<DownloadItem[]>;
  };
  yt: {
    session(): Promise<SessionState>;
    login(): Promise<SessionState>;
    setCookies(cookie: string): Promise<SessionState>;
    clearSession(): Promise<SessionState>;
    home(continuation?: string): Promise<BrowsePage>;
    explore(): Promise<BrowsePage>;
    charts(country?: string): Promise<BrowsePage>;
    newReleases(): Promise<BrowsePage>;
    moods(): Promise<BrowsePage>;
    browse(id: string, params?: string, continuation?: string): Promise<BrowsePage>;
    browseEndpoint(endpoint: NavEndpoint): Promise<BrowsePage>;
    artist(id: string): Promise<BrowsePage>;
    album(id: string): Promise<BrowsePage>;
    playlist(id: string): Promise<BrowsePage>;
    podcast(id: string): Promise<BrowsePage>;
    detailContinuation(continuation: string): Promise<{ tracks: Track[]; continuation?: string }>;
    search(query: string, filter?: string, continuation?: string): Promise<SearchResults>;
    searchSuggestions(query: string): Promise<SearchSuggestion[]>;
    next(endpoint: NavEndpoint, continuation?: string): Promise<NextResult>;
    lyrics(endpoint: NavEndpoint): Promise<string | null>;
    transcript(videoId: string): Promise<string | null>;
    library(): Promise<BrowsePage>;
    libraryPage(id: string, params?: string, continuation?: string): Promise<BrowsePage>;
    history(): Promise<BrowsePage>;
    account(): Promise<AccountInfo | null>;
    rate(videoId: string, rating: 'like' | 'dislike' | 'none'): Promise<boolean>;
    subscribe(channelId: string, subscribe: boolean, params?: string): Promise<boolean>;
    addToYTPlaylist(playlistId: string, videoId: string): Promise<boolean>;
    removeFromYTPlaylist(playlistId: string, videoId: string, setVideoId: string): Promise<boolean>;
    createYTPlaylist(title: string): Promise<string>;
    renameYTPlaylist(playlistId: string, title: string): Promise<boolean>;
    deleteYTPlaylist(playlistId: string): Promise<boolean>;
    addToLibrary(videoId: string): Promise<boolean>;
    removeFromLibrary(videoId: string): Promise<boolean>;
  };
  player: {
    resolve(track: Track): Promise<StreamInfo>;
    prefetch(track: Track): Promise<void>;
    download(track: Track): Promise<DownloadItem>;
    cancelDownload(id: string): Promise<void>;
    invalidate(trackId: string): Promise<void>;
    ffmpegAvailable(): Promise<boolean>;
    ytdlpUpdate(): Promise<string>;
  };
  lyrics: {
    fetch(track: Track, providers?: string[]): Promise<LyricsResult | null>;
    translate(
      lines: string[],
      targetLanguage?: string,
    ): Promise<TranslationResult>;
  };
  lastfm: {
    state(): Promise<LastFmState>;
    beginAuth(): Promise<{ token: string; url: string }>;
    completeAuth(token: string): Promise<LastFmState>;
    disconnect(): Promise<LastFmState>;
    nowPlaying(track: Track): Promise<void>;
    scrobble(track: Track, startedAt: number): Promise<void>;
    love(track: Track, loved: boolean): Promise<void>;
  };
  discord: {
    update(track: Track | null, playing: boolean): Promise<void>;
    clear(): Promise<void>;
  };
  recognize: {
    fromFile(path: string): Promise<RecognizeResult>;
    fromVideoId(videoId: string): Promise<RecognizeResult>;
    fromPcm(pcm: ArrayBuffer): Promise<RecognizeResult>;
  };
  window: {
    onStateChange(cb: (state: 'maximized' | 'unmaximized' | 'focused' | 'blurred') => void): () => void;
  };
  events: {
    onDownloadProgress(cb: (p: DownloadProgress) => void): () => void;
    onLibraryChange(cb: (lib: LibraryData) => void): () => void;
    onSettingsChange(cb: (s: Settings) => void): () => void;
    onMediaKey(cb: (key: string) => void): () => void;
    onNavigate(cb: (path: string) => void): () => void;
    onLyricsTranslation(cb: (payload: { lineIndex: number; text: string }) => void): () => void;
    onSessionChange(cb: (state: SessionState) => void): () => void;
  };
  shell: {
    openPath(path: string): Promise<string>;
  };
}

declare global {
  interface Window {
    auralis: AuralisApi;
  }
}
