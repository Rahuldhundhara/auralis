import { contextBridge, ipcRenderer } from 'electron';
import type { AuralisApi } from '../shared/api';

function on<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

function invoke(channel: string, ...args: unknown[]): Promise<any> {
  return ipcRenderer.invoke(channel, ...args);
}

const api: AuralisApi = {
  app: {
    info: () => invoke('app:info'),
    minimize: () => invoke('app:minimize'),
    toggleMaximize: () => invoke('app:toggle-maximize'),
    close: () => invoke('app:close'),
    openExternal: (url) => invoke('app:open-external', url),
    showItemInFolder: (target) => invoke('app:show-item', target),
    chooseFolder: (defaultPath) => invoke('app:choose-folder', defaultPath),
    setBadge: (text) => invoke('app:set-badge', text),
    flashFrame: (flag) => invoke('app:flash-frame', flag),
    setTheme: (dark) => invoke('app:set-theme', dark),
    relaunch: () => invoke('app:relaunch'),
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (patch) => invoke('settings:set', patch),
    reset: () => invoke('settings:reset'),
  },
  library: {
    get: () => invoke('library:get'),
    like: (track) => invoke('library:like', track),
    unlike: (trackId) => invoke('library:unlike', trackId),
    isLiked: (trackId) => invoke('library:is-liked', trackId),
    addRecent: (track) => invoke('library:add-recent', track),
    recordEvent: (event) => invoke('library:record-event', event),
    createPlaylist: (name, description) => invoke('library:create-playlist', name, description),
    renamePlaylist: (id, name, description) => invoke('library:rename-playlist', id, name, description),
    deletePlaylist: (id) => invoke('library:delete-playlist', id),
    addToPlaylist: (id, track) => invoke('library:add-to-playlist', id, track),
    removeFromPlaylist: (id, trackId) => invoke('library:remove-from-playlist', id, trackId),
    reorderPlaylist: (id, from, to) => invoke('library:reorder-playlist', id, from, to),
    addSearchHistory: (query) => invoke('library:add-search-history', query),
    clearSearchHistory: () => invoke('library:clear-search-history'),
    clearRecent: () => invoke('library:clear-recent'),
    saveAlbum: (album) => invoke('library:save-album', album),
    removeAlbum: (albumId) => invoke('library:remove-album', albumId),
    saveArtist: (artist) => invoke('library:save-artist', artist),
    removeArtist: (artistId) => invoke('library:remove-artist', artistId),
    getDownloads: () => invoke('library:get-downloads'),
    removeDownload: (id, deleteFile) => invoke('library:remove-download', id, deleteFile),
    clearDownloads: (deleteFiles) => invoke('library:clear-downloads', deleteFiles),
  },
  yt: {
    session: () => invoke('yt:session'),
    setCookies: (cookie) => invoke('yt:set-cookies', cookie),
    clearSession: () => invoke('yt:clear-session'),
    login: () => invoke('yt:login'),
    home: (continuation) => invoke('yt:home', continuation),
    explore: () => invoke('yt:explore'),
    charts: () => invoke('yt:charts'),
    newReleases: () => invoke('yt:new-releases'),
    moods: () => invoke('yt:moods'),
    browse: (id, params, continuation) => invoke('yt:browse', id, params, continuation),
    browseEndpoint: (endpoint) => invoke('yt:browse-endpoint', endpoint),
    artist: (id) => invoke('yt:artist', id),
    album: (id) => invoke('yt:album', id),
    playlist: (id) => invoke('yt:playlist', id),
    podcast: (id) => invoke('yt:podcast', id),
    detailContinuation: (continuation) => invoke('yt:detail-continuation', continuation),
    search: (query, filter, continuation) => invoke('yt:search', query, filter, continuation),
    searchSuggestions: (query) => invoke('yt:search-suggestions', query),
    next: (endpoint, continuation) => invoke('yt:next', endpoint, continuation),
    lyrics: (endpoint) => invoke('yt:lyrics', endpoint),
    transcript: (videoId) => invoke('yt:transcript', videoId),
    library: () => invoke('yt:library'),
    libraryPage: (id, params, continuation) => invoke('yt:library-page', id, params, continuation),
    history: () => invoke('yt:history'),
    account: () => invoke('yt:account'),
    rate: (videoId, rating) => invoke('yt:rate', videoId, rating),
    subscribe: (channelId, subscribe, params) => invoke('yt:subscribe', channelId, subscribe, params),
    addToYTPlaylist: (playlistId, videoId) => invoke('yt:add-to-yt-playlist', playlistId, videoId),
    removeFromYTPlaylist: (playlistId, videoId, setVideoId) =>
      invoke('yt:remove-from-yt-playlist', playlistId, videoId, setVideoId),
    createYTPlaylist: (title) => invoke('yt:create-yt-playlist', title),
    renameYTPlaylist: (playlistId, title) => invoke('yt:rename-yt-playlist', playlistId, title),
    deleteYTPlaylist: (playlistId) => invoke('yt:delete-yt-playlist', playlistId),
    addToLibrary: (videoId) => invoke('yt:add-to-library', videoId),
    removeFromLibrary: (videoId) => invoke('yt:remove-from-library', videoId),
  },
  player: {
    resolve: (track) => invoke('player:resolve', track),
    prefetch: (track) => invoke('player:prefetch', track),
    download: (track) => invoke('player:download', track),
    cancelDownload: (id) => invoke('player:cancel-download', id),
    invalidate: (trackId) => invoke('player:invalidate', trackId),
    ffmpegAvailable: () => invoke('player:ffmpeg-available'),
    ytdlpUpdate: () => invoke('player:ytdlp-update'),
  },
  lyrics: {
    fetch: (track, providers) => invoke('lyrics:fetch', track, providers),
    translate: (lines, targetLanguage) => invoke('lyrics:translate', lines, targetLanguage),
  },
  lastfm: {
    state: () => invoke('lastfm:state'),
    beginAuth: () => invoke('lastfm:begin-auth'),
    completeAuth: (token) => invoke('lastfm:complete-auth', token),
    disconnect: () => invoke('lastfm:disconnect'),
    nowPlaying: (track) => invoke('lastfm:now-playing', track),
    scrobble: (track, startedAt) => invoke('lastfm:scrobble', track, startedAt),
    love: (track, loved) => invoke('lastfm:love', track, loved),
  },
  discord: {
    update: (track, playing) => invoke('discord:update', track, playing),
    clear: () => invoke('discord:clear'),
  },
  recognize: {
    fromFile: (file) => invoke('recognize:from-file', file),
    fromVideoId: (videoId) => invoke('recognize:from-video-id', videoId),
    fromPcm: (pcm) => invoke('recognize:from-pcm', pcm),
  },
  window: {
    onStateChange: (callback) => on('window:state', callback),
  },
  events: {
    onDownloadProgress: (callback) => on('download-progress', callback),
    onLibraryChange: (callback) => on('library-change', callback),
    onSettingsChange: (callback) => on('settings-change', callback),
    onMediaKey: (callback) => on('media-key', callback),
    onNavigate: (callback) => on('navigate', callback),
    onLyricsTranslation: (callback) => on('lyrics:translation', callback),
    onSessionChange: (callback) => on('session-change', callback),
  },
  shell: {
    openPath: (target) => invoke('shell:open-path', target),
  },
};

contextBridge.exposeInMainWorld('auralis', api);
