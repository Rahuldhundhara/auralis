import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  net,
  protocol,
  session,
  shell,
  Tray,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SessionState, Settings, Track } from '../shared/types';
import { ytm } from './services/ytm';
import { innertube } from './services/innertube';
import { streams, isIssuedStreamUrl } from './services/streams';
import { lyricsService } from './services/lyrics';
import { lastfm } from './services/lastfm';
import { discord } from './services/discord';
import { recognition } from './services/shazam';
import { libraryService, setLibraryChangeHandler } from './services/library';
import {
  DEFAULT_SETTINGS,
  downloadsDir,
  ensureDownloadsDir,
  flushStores,
  libraryStore,
  sanitizeCookieString,
  sessionStore,
  settingsStore,
  userDataDir,
} from './services/store';

const APP_ID = 'com.auralis.music';
const isDev = !process.env.AURALIS_FORCE_PROD && (Boolean(process.env.AURALIS_DEV) || !app.isPackaged);
const devUrl = 'http://localhost:5173';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let loginWindow: BrowserWindow | null = null;

app.setAppUserModelId(APP_ID);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'auralis-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

function broadcast(channel: string, payload?: unknown) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload);
  }
}

function getWindowState(window: BrowserWindow): 'maximized' | 'unmaximized' | 'focused' | 'blurred' {
  if (window.isMaximized()) return 'maximized';
  return 'unmaximized';
}

function sendWindowState(window: BrowserWindow) {
  window.webContents.send('window:state', getWindowState(window));
}

function applyTheme(theme: Settings['theme']) {
  nativeTheme.themeSource = theme === 'system' ? 'system' : theme === 'light' ? 'light' : 'dark';
}

function resourcePath(file: string): string {
  const candidates = [
    path.join(process.resourcesPath, file),
    path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'resources', file),
    path.join(app.getAppPath(), 'resources', file),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function iconPath(): string {
  return resourcePath('icon.png');
}

function trayPath(): string {
  return resourcePath('tray.png');
}

function createTray() {
  if (tray || !settingsStore.get().trayEnabled) return;
  const icon = trayPath() || iconPath();
  const image = icon ? nativeImage.createFromPath(icon).resize({ width: 20, height: 20 }) : nativeImage.createEmpty();
  tray = new Tray(image);
  tray.setToolTip('Auralis');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Auralis', click: () => showWindow() },
      { type: 'separator' },
      { label: 'Home', click: () => { showWindow(); broadcast('navigate', '/home'); } },
      { label: 'Library', click: () => { showWindow(); broadcast('navigate', '/library'); } },
      { label: 'Search', click: () => { showWindow(); broadcast('navigate', '/search'); } },
      { type: 'separator' },
      { label: 'Play / Pause', click: () => broadcast('media-key', 'play-pause') },
      { label: 'Next track', click: () => broadcast('media-key', 'next') },
      { label: 'Previous track', click: () => broadcast('media-key', 'previous') },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } },
    ]),
  );
  tray.on('double-click', () => showWindow());
}

function destroyTray() {
  tray?.destroy();
  tray = null;
}

function registerShortcuts() {
  globalShortcut.unregisterAll();
  const bindings: Array<[string, string]> = [
    ['MediaPlayPause', 'play-pause'],
    ['MediaNextTrack', 'next'],
    ['MediaPreviousTrack', 'previous'],
    ['MediaStop', 'stop'],
  ];
  for (const [accelerator, key] of bindings) {
    try {
      globalShortcut.register(accelerator, () => broadcast('media-key', key));
    } catch {
      // Another app may own the media key; the in-app shortcuts still work.
    }
  }
}

function showWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow() {
  const settings = settingsStore.get();
  applyTheme(settings.theme);
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    frame: false,
    backgroundColor: settings.theme === 'light' ? '#f6f5f8' : '#0b0b0f',
    title: 'Auralis',
    icon: iconPath() || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });
  mainWindow.on('maximize', () => mainWindow && sendWindowState(mainWindow));
  mainWindow.on('unmaximize', () => mainWindow && sendWindowState(mainWindow));
  mainWindow.on('focus', () => mainWindow?.webContents.send('window:state', 'focused'));
  mainWindow.on('blur', () => mainWindow?.webContents.send('window:state', 'blurred'));
  mainWindow.on('close', (event) => {
    if (!quitting && settingsStore.get().closeToTray && settingsStore.get().trayEnabled) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL() || '';
    if (url !== current && !url.startsWith(devUrl) && !url.startsWith('file://')) {
      event.preventDefault();
      void openExternal(url);
    }
  });

  if (isDev) {
    void mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

async function openExternal(raw: string) {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return;
    await shell.openExternal(url.toString());
  } catch {
    // ignore malformed urls
  }
}

function readWindowSessionCookies(): string {
  return '';
}

const MEDIA_EXTENSIONS = new Set([
  '.aac',
  '.flac',
  '.m4a',
  '.m4v',
  '.mkv',
  '.mp3',
  '.mp4',
  '.oga',
  '.ogg',
  '.opus',
  '.wav',
  '.webm',
]);

function pathInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function safeRealPath(target: string): string | null {
  if (!target || !path.isAbsolute(target)) return null;
  try {
    const real = fs.realpathSync.native(target);
    return fs.statSync(real).isFile() ? real : null;
  } catch {
    return null;
  }
}

/** Local media is limited to completed downloads (current or previously recorded). */
function isAllowedLocalMedia(filePath: string): boolean {
  const real = safeRealPath(filePath);
  if (!real || !MEDIA_EXTENSIONS.has(path.extname(real).toLowerCase())) return false;
  const recorded = libraryStore.get().downloads.some((item) => {
    if (!item.path) return false;
    const recordedPath = safeRealPath(item.path);
    return recordedPath?.toLowerCase() === real.toLowerCase();
  });
  if (recorded) return true;
  const roots = [settingsStore.get().downloadDir, downloadsDir()].filter(Boolean);
  return roots.some((root) => {
    try {
      const realRoot = fs.realpathSync.native(root);
      return pathInside(real.toLowerCase(), realRoot.toLowerCase());
    } catch {
      return false;
    }
  });
}

function registerMediaProtocol() {
  protocol.handle('auralis-media', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host === 'local') {
        const filePath = decodeURIComponent(url.pathname.replace(/^\//, ''));
        if (!isAllowedLocalMedia(filePath)) {
          return new Response('Not found', { status: 404 });
        }
        const response = await net.fetch(pathToFileURL(filePath).toString());
        return withCors(response);
      }
      if (url.host === 'stream') {
        const encoded = url.pathname.replace(/^\//, '');
        const remote = Buffer.from(encoded, 'base64url').toString('utf8');
        if (!/^https:\/\//i.test(remote) || !isIssuedStreamUrl(remote)) {
          return new Response('Forbidden', { status: 403 });
        }
        const headers: Record<string, string> = {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
          Referer: 'https://music.youtube.com/',
          Origin: 'https://music.youtube.com',
        };
        const range = request.headers.get('range');
        if (range) headers.Range = range;
        const response = await net.fetch(remote, { headers, method: 'GET' });
        return withCors(response);
      }
      return new Response('Not found', { status: 404 });
    } catch (error: any) {
      return new Response(error?.message || 'Media request failed', { status: 502 });
    }
  });
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Headers', 'Range');
  headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function openLoginWindow(): Promise<SessionState> {
  if (loginWindow) {
    loginWindow.focus();
    return ytm.session();
  }
  const partition = 'persist:auralis-login';
  const loginSession = session.fromPartition(partition);
  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
  loginSession.setUserAgent(userAgent);
  loginWindow = new BrowserWindow({
    width: 560,
    height: 760,
    parent: mainWindow || undefined,
    modal: false,
    title: 'Sign in to YouTube Music',
    autoHideMenuBar: true,
    webPreferences: {
      partition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  loginWindow.webContents.setUserAgent(userAgent);

  return new Promise<SessionState>((resolve) => {
    let settled = false;
    const complete = (state: SessionState) => {
      if (settled) return;
      settled = true;
      resolve(state);
    };
    const finish = async () => {
      try {
        const cookies = await loginSession.cookies.get({ domain: '.youtube.com' });
        const names = new Map<string, string>();
        for (const cookie of cookies) {
          if (!cookie.name || !cookie.value) continue;
          if (cookie.domain?.includes('youtube.com')) names.set(cookie.name, cookie.value);
        }
        if (!names.has('SAPISID') && !names.has('__Secure-3PAPISID') && !names.has('SID')) return false;
        const cookie = [...names.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
        const state = await ytm.setCookies(cookie);
        broadcast('session-change', state);
        complete(state);
        loginWindow?.close();
        loginWindow = null;
        return true;
      } catch {
        return false;
      }
    };

    loginWindow!.webContents.on('did-navigate', async (_event, url) => {
      if (!/^https:\/\/(music|www)\.youtube\.com\//.test(url)) return;
      await finish();
    });
    loginWindow!.webContents.on('did-redirect-navigation', async (_event, url) => {
      if (!/^https:\/\/(music|www)\.youtube\.com\//.test(url)) return;
      await finish();
    });
    loginWindow!.on('closed', () => {
      loginWindow = null;
      complete(ytm.session());
    });
    loginWindow!.loadURL(
      'https://accounts.google.com/ServiceLogin?service=youtube&passive=true&continue=https%3A%2F%2Fmusic.youtube.com%2F&flowName=GlifWebSignIn',
    ).catch(() => {
      loginWindow?.close();
      complete(ytm.session());
    });
  });
}

function settingsPatchHandlers() {
  ipcMain.handle('settings:set', (_event, patch: Partial<Settings>) => {
    const previous = settingsStore.get();
    const merged = settingsStore.update((current) => mergeSettings(current, patch));
    if (merged.theme !== previous.theme) applyTheme(merged.theme);
    if (merged.trayEnabled !== previous.trayEnabled) {
      if (merged.trayEnabled) createTray();
      else destroyTray();
    }
    if (merged.language !== previous.language || merged.region !== previous.region) {
      innertube.setLocale({ hl: merged.language || 'en', gl: merged.region || 'US' });
    }
    broadcast('settings-change', merged);
    return merged;
  });
  ipcMain.handle('settings:reset', () => {
    const merged = settingsStore.set(structuredClone(DEFAULT_SETTINGS));
    applyTheme(merged.theme);
    if (merged.trayEnabled) createTray();
    else if (tray) {
      tray.destroy();
      tray = null;
    }
    broadcast('settings-change', merged);
    return merged;
  });
}

function mergeSettings(current: Settings, patch: Partial<Settings>): Settings {
  const next: Settings = { ...current, ...patch };
  if (patch.eq) next.eq = { ...current.eq, ...patch.eq, bands: patch.eq.bands ? [...patch.eq.bands] : current.eq.bands };
  if (patch.lastfm) next.lastfm = { ...current.lastfm, ...patch.lastfm };
  if (patch.discord) next.discord = { ...current.discord, ...patch.discord };
  if (patch.translation) next.translation = { ...current.translation, ...patch.translation };
  next.volume = Math.min(1, Math.max(0, Number(next.volume) || 0));
  next.playbackRate = Math.min(2, Math.max(0.5, Number(next.playbackRate) || 1));
  return next;
}

function registerIpc() {
  ipcMain.handle('app:info', async () => {
    let resolvedDownloads = downloadsDir();
    try {
      resolvedDownloads = ensureDownloadsDir() || downloadsDir();
    } catch (error) {
      console.error('[app] download folder unavailable', error);
    }
    const [ytDlpVersion, ffmpegAvailable] = await Promise.all([
      streams.ytdlpVersion(),
      streams.ffmpegAvailable(),
    ]);
    return {
      name: 'Auralis',
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      platform: process.platform,
      userData: userDataDir(),
      downloadsDir: resolvedDownloads,
      ytDlpVersion,
      ffmpegAvailable,
    };
  });
  ipcMain.handle('app:minimize', () => mainWindow?.minimize());
  ipcMain.handle('app:toggle-maximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle('app:close', () => mainWindow?.close());
  ipcMain.handle('app:open-external', (_event, url: string) => openExternal(url));
  ipcMain.handle('app:show-item', (_event, target: string) => {
    if (target && fs.existsSync(target)) shell.showItemInFolder(target);
  });
  ipcMain.handle('app:choose-folder', async (_event, defaultPath?: string) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a folder',
      defaultPath: defaultPath || downloadsDir(),
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('app:set-badge', (_event, text: string) => {
    const count = Number(text);
    if (Number.isFinite(count)) app.setBadgeCount(Math.max(0, Math.round(count)));
  });
  ipcMain.handle('app:flash-frame', (_event, flag: boolean) => mainWindow?.flashFrame(Boolean(flag)));
  ipcMain.handle('app:set-theme', (_event, dark: boolean) => {
    nativeTheme.themeSource = dark ? 'dark' : 'light';
    return true;
  });
  ipcMain.handle('app:relaunch', () => {
    quitting = true;
    app.relaunch();
    app.exit(0);
  });
  ipcMain.handle('shell:open-path', (_event, target: string) => {
    if (!target) return 'Missing path.';
    return shell.openPath(target);
  });

  ipcMain.handle('settings:get', () => settingsStore.get());
  settingsPatchHandlers();

  ipcMain.handle('library:get', () => libraryService.get());
  ipcMain.handle('library:like', async (_event, track: Track) => {
    const data = libraryService.like(track);
    if (settingsStore.get().autoDownloadLiked) {
      streams.download(track, (progress) => broadcast('download-progress', progress)).catch(() => {});
    }
    return data;
  });
  ipcMain.handle('library:unlike', (_event, trackId: string) => libraryService.unlike(trackId));
  ipcMain.handle('library:is-liked', (_event, trackId: string) => libraryService.isLiked(trackId));
  ipcMain.handle('library:add-recent', (_event, track: Track) => libraryService.addRecent(track));
  ipcMain.handle('library:record-event', (_event, event: Parameters<typeof libraryService.recordEvent>[0]) =>
    libraryService.recordEvent(event),
  );
  ipcMain.handle('library:create-playlist', (_event, name: string, description?: string) =>
    libraryService.createPlaylist(name, description),
  );
  ipcMain.handle('library:rename-playlist', (_event, id: string, name: string, description?: string) =>
    libraryService.renamePlaylist(id, name, description),
  );
  ipcMain.handle('library:delete-playlist', (_event, id: string) => libraryService.deletePlaylist(id));
  ipcMain.handle('library:add-to-playlist', (_event, id: string, track: Track) =>
    libraryService.addToPlaylist(id, track),
  );
  ipcMain.handle('library:remove-from-playlist', (_event, id: string, trackId: string) =>
    libraryService.removeFromPlaylist(id, trackId),
  );
  ipcMain.handle('library:reorder-playlist', (_event, id: string, from: number, to: number) =>
    libraryService.reorderPlaylist(id, from, to),
  );
  ipcMain.handle('library:add-search-history', (_event, query: string) => libraryService.addSearchHistory(query));
  ipcMain.handle('library:remove-search-history', (_event, query: string) => libraryService.removeSearchHistory(query));
  ipcMain.handle('library:clear-search-history', () => libraryService.clearSearchHistory());
  ipcMain.handle('library:clear-recent', () => libraryService.clearRecent());
  ipcMain.handle('library:save-album', (_event, album) => libraryService.saveAlbum(album));
  ipcMain.handle('library:remove-album', (_event, id: string) => libraryService.removeAlbum(id));
  ipcMain.handle('library:save-artist', (_event, artist) => libraryService.saveArtist(artist));
  ipcMain.handle('library:remove-artist', (_event, id: string) => libraryService.removeArtist(id));
  ipcMain.handle('library:get-downloads', () => libraryService.getDownloads());
  ipcMain.handle('library:remove-download', (_event, id: string, deleteFile?: boolean) =>
    libraryService.removeDownload(id, deleteFile),
  );
  ipcMain.handle('library:clear-downloads', (_event, deleteFiles?: boolean) => libraryService.clearDownloads(deleteFiles));

  ipcMain.handle('yt:session', () => ytm.session());
  ipcMain.handle('yt:set-cookies', (_event, cookie: string) => ytm.setCookies(sanitizeCookieString(cookie)));
  ipcMain.handle('yt:clear-session', () => ytm.clearSession());
  ipcMain.handle('yt:login', () => openLoginWindow());
  ipcMain.handle('yt:home', (_event, continuation?: string) => ytm.home(continuation));
  ipcMain.handle('yt:explore', () => ytm.explore());
  ipcMain.handle('yt:charts', () => ytm.charts());
  ipcMain.handle('yt:new-releases', () => ytm.newReleases());
  ipcMain.handle('yt:moods', () => ytm.moods());
  ipcMain.handle('yt:browse', (_event, id?: string, params?: string, continuation?: string) =>
    ytm.browsePage(id, params, continuation),
  );
  ipcMain.handle('yt:browse-endpoint', (_event, endpoint) => ytm.browseEndpoint(endpoint));
  ipcMain.handle('yt:artist', (_event, id: string) => ytm.artist(id));
  ipcMain.handle('yt:album', (_event, id: string) => ytm.album(id));
  ipcMain.handle('yt:playlist', (_event, id: string) => ytm.playlist(id));
  ipcMain.handle('yt:podcast', (_event, id: string) => ytm.podcast(id));
  ipcMain.handle('yt:detail-continuation', (_event, continuation: string) => ytm.detailContinuation(continuation));
  ipcMain.handle('yt:search', (_event, query: string, filter?: string, continuation?: string) =>
    ytm.search(query, filter, continuation),
  );
  ipcMain.handle('yt:search-suggestions', (_event, query: string) => ytm.searchSuggestions(query));
  ipcMain.handle('yt:next', (_event, endpoint, continuation?: string) => ytm.next(endpoint, continuation));
  ipcMain.handle('yt:lyrics', (_event, endpoint) => ytm.lyrics(endpoint));
  ipcMain.handle('yt:transcript', (_event, videoId: string) => ytm.transcript(videoId));
  ipcMain.handle('yt:library', () => ytm.library());
  ipcMain.handle('yt:library-page', (_event, id: string, params?: string, continuation?: string) =>
    ytm.libraryPage(id, params, continuation),
  );
  ipcMain.handle('yt:history', () => ytm.history());
  ipcMain.handle('yt:account', () => ytm.account());
  ipcMain.handle('yt:rate', (_event, videoId: string, rating: 'like' | 'dislike' | 'none') => ytm.rate(videoId, rating));
  ipcMain.handle('yt:subscribe', (_event, channelId: string, subscribe: boolean, params?: string) =>
    ytm.subscribe(channelId, subscribe, params),
  );
  ipcMain.handle('yt:add-to-yt-playlist', (_event, playlistId: string, videoId: string) =>
    ytm.addToYTPlaylist(playlistId, videoId),
  );
  ipcMain.handle('yt:remove-from-yt-playlist', (_event, playlistId: string, videoId: string, setVideoId: string) =>
    ytm.removeFromYTPlaylist(playlistId, videoId, setVideoId),
  );
  ipcMain.handle('yt:create-yt-playlist', (_event, title: string) => ytm.createYTPlaylist(title));
  ipcMain.handle('yt:rename-yt-playlist', (_event, playlistId: string, title: string) =>
    ytm.renameYTPlaylist(playlistId, title),
  );
  ipcMain.handle('yt:delete-yt-playlist', (_event, playlistId: string) => ytm.deleteYTPlaylist(playlistId));
  ipcMain.handle('yt:add-to-library', (_event, videoId: string) => ytm.addToLibrary(videoId));
  ipcMain.handle('yt:remove-from-library', (_event, videoId: string) => ytm.removeFromLibrary(videoId));

  ipcMain.handle('player:resolve', (_event, track: Track) => streams.resolve(track));
  ipcMain.handle('player:prefetch', (_event, track: Track) => streams.prefetch(track));
  ipcMain.handle('player:download', (_event, track: Track) =>
    streams.download(track, (progress) => broadcast('download-progress', progress)),
  );
  ipcMain.handle('player:cancel-download', (_event, id: string) => {
    streams.cancelDownload(id);
  });
  ipcMain.handle('player:invalidate', (_event, trackId: string) => {
    streams.invalidate(trackId);
  });
  ipcMain.handle('player:ffmpeg-available', () => streams.ffmpegAvailable());
  ipcMain.handle('player:ytdlp-update', () => streams.update());

  ipcMain.handle('lyrics:fetch', (_event, track: Track, providers?: string[], force?: boolean) =>
    lyricsService.fetch(track, providers, force),
  );
  ipcMain.handle('lyrics:translate', (_event, lines: string[], targetLanguage?: string) =>
    lyricsService.translate(lines, targetLanguage),
  );

  ipcMain.handle('lastfm:state', () => lastfm.state());
  ipcMain.handle('lastfm:begin-auth', () => lastfm.beginAuth());
  ipcMain.handle('lastfm:complete-auth', async (_event, token: string) => {
    const state = await lastfm.completeAuth(token);
    broadcast('settings-change', settingsStore.get());
    return state;
  });
  ipcMain.handle('lastfm:disconnect', () => {
    const state = lastfm.disconnect();
    broadcast('settings-change', settingsStore.get());
    return state;
  });
  ipcMain.handle('lastfm:now-playing', (_event, track: Track) => lastfm.nowPlaying(track));
  ipcMain.handle('lastfm:scrobble', (_event, track: Track, startedAt: number) => lastfm.scrobble(track, startedAt));
  ipcMain.handle('lastfm:love', (_event, track: Track, loved: boolean) => lastfm.love(track, loved));

  ipcMain.handle('discord:update', (_event, track: Track | null, playing: boolean) => discord.update(track, playing));
  ipcMain.handle('discord:clear', () => discord.clear());

  ipcMain.handle('recognize:from-file', (_event, file: string) => recognition.fromFile(file));
  ipcMain.handle('recognize:from-video-id', (_event, videoId: string) => recognition.fromVideoId(videoId));
  ipcMain.handle('recognize:from-pcm', (_event, data: ArrayBuffer | Uint8Array) => {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    return recognition.fromPcm(buffer);
  });
}

async function bootstrap() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.on('second-instance', () => showWindow());
  if (!settingsStore.get().hardwareAcceleration) app.disableHardwareAcceleration();
  await app.whenReady();
  applyTheme(settingsStore.get().theme);
  registerMediaProtocol();
  registerIpc();
  setLibraryChangeHandler((data) => broadcast('library-change', data));
  libraryService.reconcileDownloads();
  createWindow();
  createTray();
  registerShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showWindow();
  });
}

app.on('before-quit', () => {
  quitting = true;
  flushStores();
  void discord.clear();
  // A second instance quits before Electron is ready. Calling globalShortcut
  // then throws and shows an error dialog instead of focusing the first window.
  if (app.isReady()) globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !settingsStore.get().trayEnabled) app.quit();
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

void bootstrap().catch((error) => {
  console.error('[auralis] startup failed', error);
  dialog.showErrorBox('Auralis failed to start', String(error?.stack || error));
  app.quit();
});

// Keep a reference so the store module is initialized before bootstrap reads it.
void readWindowSessionCookies;
void sessionStore;
void DEFAULT_SETTINGS;
