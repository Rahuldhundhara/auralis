// Shared domain types for the Auralis main process, preload bridge and renderer.

export type ItemType =
  | 'song'
  | 'video'
  | 'album'
  | 'single'
  | 'ep'
  | 'artist'
  | 'playlist'
  | 'podcast'
  | 'episode'
  | 'profile'
  | 'mood';

export interface Thumbnail {
  url: string;
  width?: number;
  height?: number;
}

export interface ArtistRef {
  id?: string;
  name: string;
}

export interface AlbumRef {
  id?: string;
  name: string;
}

export interface Track {
  id: string;
  type: 'song' | 'video' | 'episode';
  title: string;
  artists: ArtistRef[];
  album?: AlbumRef;
  /** Duration in seconds. */
  duration: number;
  thumbnail?: string;
  explicit?: boolean;
  isVideo?: boolean;
  playlistId?: string;
  setVideoId?: string;
  libraryAddToken?: string;
  libraryRemoveToken?: string;
  /** Absolute path of a downloaded/local file. */
  localPath?: string;
  source?: 'youtube' | 'download' | 'local';
  /** Radio/automix tracks have no stable album context. */
  radio?: boolean;
  /** Song this track was started from (for radio queues). */
  seedVideoId?: string;
}

export interface Card {
  type: ItemType;
  id: string;
  title: string;
  subtitle?: string;
  thumbnail?: string;
  round?: boolean;
  explicit?: boolean;
  browseId?: string;
  params?: string;
  /** Optional tint for mood/genre navigation tiles. */
  color?: string;
  trackCount?: number;
  year?: string;
  artists?: ArtistRef[];
  /** Present when the card itself is a playable song (quick picks etc.). */
  track?: Track;
}

export interface Shelf {
  title?: string;
  subtitle?: string;
  items: Card[];
  browseId?: string;
  params?: string;
  /** Raw endpoint for "See all" (browse or watch playlist). */
  endpoint?: NavEndpoint;
  style?: 'carousel' | 'list' | 'grid' | 'chips';
}

export interface PageHeader {
  type: 'album' | 'playlist' | 'artist' | 'podcast' | 'generic';
  id?: string;
  browseId?: string;
  playlistId?: string;
  title: string;
  subtitle?: string;
  description?: string;
  thumbnail?: string;
  round?: boolean;
  meta?: string[];
  trackCount?: number;
  duration?: number;
  year?: string;
  author?: { name: string; id?: string; thumbnail?: string };
  /** Tokens used by like/subscribe menus on the header. */
  libraryAddToken?: string;
  libraryRemoveToken?: string;
  subscribe?: boolean;
  subscribed?: boolean;
}

export interface NavEndpoint {
  browseId?: string;
  params?: string;
  videoId?: string;
  playlistId?: string;
  playlistSetVideoId?: string;
  index?: number;
  query?: string;
  continuation?: string;
}

export interface BrowsePage {
  header?: PageHeader;
  shelves: Shelf[];
  continuation?: string;
  /** chips for explore/library */
  chips?: { title: string; endpoint?: NavEndpoint; selected?: boolean }[];
}

export interface SearchResults {
  top?: Card;
  songs: Track[];
  videos: Track[];
  albums: Card[];
  artists: Card[];
  playlists: Card[];
  podcasts: Card[];
  episodes: Track[];
  profiles: Card[];
  continuation?: string;
}

export interface SearchSuggestion {
  text: string;
  fromHistory?: boolean;
}

export interface NextResult {
  title?: string;
  tracks: Track[];
  currentIndex?: number;
  lyricsEndpoint?: NavEndpoint;
  relatedEndpoint?: NavEndpoint;
  continuation?: string;
  endpoint?: NavEndpoint;
}

export interface AccountInfo {
  name: string;
  email?: string;
  channelHandle?: string;
  thumbnailUrl?: string;
  channelId?: string;
}

export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  chrome: string;
  platform: string;
  userData: string;
  downloadsDir: string;
  ytDlpVersion?: string;
  ffmpegAvailable: boolean;
}

export type ThemeMode = 'dark' | 'light' | 'black' | 'system';
export type AudioQuality = 'auto' | 'high' | 'medium' | 'low' | 'best';

export interface EqSettings {
  enabled: boolean;
  /** 10 bands, dB gain -12..12. */
  bands: number[];
  preamp: number;
  /** Low-shelf bass boost in dB, 0..12. */
  bassBoost?: number;
  /** Bass shelf corner frequency in Hz. */
  bassFrequency?: number;
  /** Peak limiter after the EQ to prevent clipping. */
  limiter?: boolean;
}

export interface LastFmSettings {
  enabled: boolean;
  apiKey: string;
  apiSecret: string;
  sessionKey: string;
  username: string;
  scrobble: boolean;
  nowPlaying: boolean;
}

export interface DiscordSettings {
  enabled: boolean;
  appId: string;
  showButtons: boolean;
}

export interface TranslationSettings {
  enabled: boolean;
  provider: 'auto' | 'deepl' | 'openai';
  targetLanguage: string;
  deeplApiKey: string;
  openaiBaseUrl: string;
  openaiApiKey: string;
  openaiModel: string;
}

export interface Settings {
  theme: ThemeMode;
  accent: string;
  language: string;
  region: string;
  startPage: 'home' | 'explore' | 'library';
  audioQuality: AudioQuality;
  volume: number;
  muted: boolean;
  normalize: boolean;
  crossfadeSec: number;
  gapless: boolean;
  eq: EqSettings;
  playbackRate: number;
  skipSilence: boolean;
  showLyricsInPlayer: boolean;
  /** Android-only: show muted music-video previews in Now Playing. */
  videoClips?: boolean;
  lyricsProviders: string[];
  translation: TranslationSettings;
  downloadDir: string;
  downloadQuality: 'best' | 'high' | 'medium';
  autoDownloadLiked: boolean;
  lastfm: LastFmSettings;
  discord: DiscordSettings;
  proxy: string;
  trayEnabled: boolean;
  closeToTray: boolean;
  hardwareAcceleration: boolean;
  scrobbleThreshold: number;
  sidebarCollapsed: boolean;
}

export interface LocalPlaylist {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  tracks: Track[];
  cover?: string;
  /** Optional linked YouTube playlist id. */
  remoteId?: string;
}

export interface DownloadItem {
  id: string;
  track: Track;
  path: string;
  format: string;
  quality: string;
  size?: number;
  createdAt: number;
  status: 'queued' | 'downloading' | 'done' | 'error' | 'cancelled';
  progress?: number;
  error?: string;
}

export interface PlayEvent {
  trackId: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  playedAt: number;
  completed: boolean;
}

export interface LibraryData {
  liked: Track[];
  playlists: LocalPlaylist[];
  recent: Track[];
  events: PlayEvent[];
  downloads: DownloadItem[];
  savedAlbums: Card[];
  savedArtists: Card[];
  searchHistory: string[];
}

export interface SessionState {
  hasCookies: boolean;
  account?: AccountInfo;
  visitorData?: string;
  authUser: string;
}

export interface StreamInfo {
  url: string;
  /** Direct media URL expires quickly; metadata is used for debugging. */
  expiresAt?: number;
  format: string;
  quality?: string;
  title?: string;
  duration?: number;
  localPath?: string;
  /** True when the resolved URL carries a video track. */
  video?: boolean;
}

export interface LyricsLine {
  time: number;
  text: string;
  words?: { text: string; start: number; end: number; space?: boolean }[];
  translation?: string;
  romanized?: string;
  agent?: string;
  background?: boolean;
}

export interface LyricsResult {
  provider: string;
  synced: boolean;
  lines: LyricsLine[];
  raw: string;
}

export interface DownloadProgress {
  id: string;
  progress: number;
  status: DownloadItem['status'];
  error?: string;
  path?: string;
}

export interface LastFmState {
  configured: boolean;
  authenticated: boolean;
  username?: string;
}

export interface TranslationResult {
  lines: string[];
  provider: string;
}

export interface RecognizeResult {
  title: string;
  artist: string;
  album?: string;
  coverArt?: string;
  genre?: string;
  releaseDate?: string;
  shazamUrl?: string;
  youtubeVideoId?: string;
  lyrics?: string;
}

export interface ApiErrorShape {
  message: string;
  code?: string;
}

export type Unsubscribe = () => void;
