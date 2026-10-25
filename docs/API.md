# Architecture and API reference

This document describes how Auralis is put together, which services it talks to, what the renderer can call, and where state is stored. It is written for contributors and for anyone auditing what the app does on the network.

## Process model

```
┌─────────────────────────────────────────────────────────────────────┐
│ Renderer (React 19 + Zustand)                                       │
│  pages → components → stores → window.auralis                       │
│  HTML5 audio + Web Audio EQ                                         │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ contextBridge (preload.ts)
                               │ narrow, typed IPC surface
┌──────────────────────────────▼──────────────────────────────────────┐
│ Electron main process (Node.js)                                     │
│  main.ts ── windows, tray, shortcuts, protocol, IPC router          │
│  ytm.ts ── browse/search/next/search suggestions/account            │
│  innertube.ts ── HTTP transport, cookies, SAPISIDHASH               │
│  ytm-parse.ts ── response → shared domain types                     │
│  streams.ts ── yt-dlp resolve/download, FFmpeg captions             │
│  lyrics.ts / lastfm.ts / discord.ts / shazam.ts / library.ts        │
│  store.ts ── JSON persistence + safeStorage cookie encryption       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS, child processes, local files
                     YouTube Music · yt-dlp · FFmpeg · lyrics APIs
```

The renderer has no Node integration and no filesystem access. Everything privileged is exposed through `window.auralis`, which is created in `electron/preload.ts` and typed by `shared/api.ts`.

The main process is bundled by esbuild into `dist-electron/main.js`; the preload becomes `dist-electron/preload.js`. The production renderer is a Vite build in `dist/`. Native dependencies are not rebuilt at package time because the main bundle has none.

## Renderer API contract

The full TypeScript declaration lives in [`shared/api.ts`](../shared/api.ts). Domain objects (`Track`, `Card`, `Shelf`, `BrowsePage`, `Settings`, etc.) live in [`shared/types.ts`](../shared/types.ts).

```ts
const home = await window.auralis.yt.home();
const results = await window.auralis.yt.search('Kesariya', filters.songs);
const stream = await window.auralis.player.resolve(results.songs[0]);
```

### `app`

| Method | Purpose |
| --- | --- |
| `info()` | App, Electron, yt-dlp and FFmpeg versions; user-data and downloads paths. |
| `minimize()`, `toggleMaximize()`, `close()` | Frameless window controls. |
| `openExternal(url)` | Opens only `http:`, `https:` and `mailto:` URLs in the default browser. |
| `showItemInFolder(path)` | Reveals a downloaded file in Explorer. |
| `chooseFolder(defaultPath?)` | Native directory picker for the downloads folder. |
| `setBadge(text)`, `flashFrame(flag)` | Taskbar feedback. |
| `setTheme(dark)` | Keeps the native window chrome in sync with the renderer theme. |
| `relaunch()` | Restarts to apply graphics changes. |

### `settings`

| Method | Purpose |
| --- | --- |
| `get()` | Returns the complete settings object, merged with defaults. |
| `set(patch)` | Deep-merges a partial update, persists it and broadcasts a change. |
| `reset()` | Restores defaults; library, downloads and the account are untouched. |

### `library`

All methods return library data or a local playlist object. Writes are debounced to disk.

| Method | Purpose |
| --- | --- |
| `get()` | Full local library: likes, playlists, recent, events, downloads, saved albums/artists, search history. |
| `like(track)`, `unlike(trackId)`, `isLiked(id)` | Local likes. When signed in, the renderer also calls the YouTube Music rating action. |
| `addRecent(track)`, `recordEvent(event)`, `clearRecent()` | Listening state. Events record completion for scrobbling. |
| `createPlaylist(name, description?)` | Creates a local playlist. |
| `renamePlaylist(id, name, description?)`, `deletePlaylist(id)` | Local playlist editing. |
| `addToPlaylist(id, track)`, `removeFromPlaylist(id, trackId)` | Playlist membership. |
| `reorderPlaylist(id, from, to)` | Moves a track and persists the new order. |
| `addSearchHistory(query)`, `clearSearchHistory()` | Search history. |
| `saveAlbum(card)`, `removeAlbum(id)` | Locally saved album cards. |
| `saveArtist(card)`, `removeArtist(id)` | Locally followed artist cards. |
| `getDownloads()`, `removeDownload(id, deleteFile?)`, `clearDownloads(deleteFiles?)` | Offline file management. |

Download progress arrives asynchronously through `events.onDownloadProgress`.

### `yt` — live YouTube Music

| Method | Endpoint / behaviour |
| --- | --- |
| `session()` | Current cookie/account state, visitor data and auth user. |
| `login()` | Opens the embedded Google sign-in window and captures YouTube cookies. |
| `setCookies(cookie)` | Validates and stores a manually pasted cookie header. |
| `clearSession()` | Clears cookies and account metadata. |
| `home(continuation?)` | `FEmusic_home`; follows continuation tokens. |
| `explore()` | `FEmusic_explore`. |
| `charts()` | `FEmusic_charts`. |
| `newReleases()` | `FEmusic_new_releases_albums`. |
| `moods()` | `FEmusic_moods_and_genres`; navigation tiles are parsed into mood/genre cards. |
| `browse(id, params?, continuation?)` | Generic browse and browse continuation. |
| `browseEndpoint(endpoint)` | Dispatches a `NavEndpoint` to browse/next/playlist resolution. |
| `artist(id)`, `album(id)`, `playlist(id)`, `podcast(id)` | Typed detail pages. Podcasts normalise `MPSP…` browse ids. |
| `detailContinuation(token)` | Loads more album/playlist/podcast tracks or episodes. |
| `search(query, filter?, continuation?)` | Filtered search and merged continuation. |
| `searchSuggestions(query)` | YouTube Music search suggestions. |
| `next(endpoint, continuation?)` | Queue, radio, related tracks and lyrics endpoint. Radio uses `RDAMVM<videoId>`; the renderer keeps the continuation token so queue-end autoplay can append more pages. |
| `lyrics(endpoint)` | Official YouTube Music lyrics text. |
| `transcript(videoId)` | Transcript endpoint (currently returns HTTP 400 from YouTube Music; yt-dlp captions are the fallback). |
| `library()`, `libraryPage(id, params?, continuation?)` | Signed-in cloud library shelves. |
| `history()` | Signed-in listening history. |
| `account()` | Account name, avatar and plan badge. |
| `rate(videoId, rating)` | Like, dislike or remove rating on YouTube Music. |
| `subscribe(channelId, subscribe, params?)` | Artist subscription mutation. |
| `addToYTPlaylist`, `removeFromYTPlaylist`, `createYTPlaylist`, `renameYTPlaylist`, `deleteYTPlaylist` | Remote playlist mutations. |
| `addToLibrary(videoId)`, `removeFromLibrary(videoId)` | Cloud library mutations for signed-in users. |

### `player`

| Method | Purpose |
| --- | --- |
| `resolve(track)` | Returns a playable `auralis-media://` URL or a local file URL. |
| `prefetch(track)` | Warms the yt-dlp URL cache for gapless playback. |
| `download(track)` | Starts a download and returns the initial `DownloadItem`. |
| `cancelDownload(id)` | Kills the child process and marks the entry cancelled. |
| `invalidate(trackId)` | Drops cached stream URLs for one track. |
| `ffmpegAvailable()` | Probes the bundled FFmpeg binary. |
| `ytdlpUpdate()` | Runs `yt-dlp -U` and returns its output. |

### `lyrics`, `lastfm`, `discord`, `recognize`

| Namespace | Methods |
| --- | --- |
| `lyrics` | `fetch(track, providers?)`, `translate(lines, targetLanguage?)` |
| `lastfm` | `state`, `beginAuth`, `completeAuth`, `disconnect`, `nowPlaying`, `scrobble`, `love` |
| `discord` | `update(track, playing)`, `clear` |
| `recognize` | `fromFile(path)`, `fromVideoId(videoId)`, `fromPcm(ArrayBuffer)` |

### Events

| Event | Payload |
| --- | --- |
| `app.info` / IPC request | Version and path information. |
| `events.onDownloadProgress` | `{ id, progress, status, error?, path? }` |
| `events.onLibraryChange` | Complete updated `LibraryData`. |
| `events.onSettingsChange` | Complete updated `Settings`. |
| `events.onMediaKey` | `play-pause`, `next`, `previous` or `stop`. |
| `events.onNavigate` | Route string sent by the tray menu. |
| `events.onLyricsTranslation` | `{ lineIndex, text }` for progressive translation. |
| `events.onSessionChange` | Updated `SessionState` after login, cookie import or sign-out. |
| `window.onStateChange` | `maximized`, `unmaximized`, `focused` or `blurred`. |

All event subscriptions return an unsubscribe function.

## YouTube Music transport

`electron/services/innertube.ts` is a small, dependency-free Innertube client.

| Setting | Value |
| --- | --- |
| Client | `WEB_REMIX` |
| Client version | `1.20260707.12.00` |
| API key | `AIzaSyC9XL3ZjWddXya6X74dJoCTL0kn8m3XvR0` |
| Base URL | `https://music.youtube.com/youtubei/v1/` |
| User agent | Desktop Chrome user agent |
| Auth | Stored `Cookie` header plus `SAPISIDHASH`, `SAPISID`/`__Secure-3PAPISID` and `X-Goog-AuthUser` when present |
| Locale | `hl` from Settings language, `gl` from region |
| Visitor data | Captured from responses and reused for anonymous continuity |

Requests carry `playbackContext` and content-check context where YouTube Music requires them. Errors are surfaced as HTTP status plus a short response excerpt; nothing is silently swallowed except optional enrichments (home supplementation, prefetch and captions).

### Parser coverage

`ytm-parse.ts` maps raw renderers into stable types. It handles:

- `musicCarouselShelfRenderer`, `musicShelfRenderer`, `musicPlaylistShelfRenderer`
- `musicTwoRowItemRenderer` and `musicResponsiveListItemRenderer`
- `musicMultiRowListItemRenderer` for podcast episodes, with human-readable durations such as `33 min`
- `musicNavigationButtonRenderer` for mood and genre tiles
- `musicCardShelfRenderer`, `gridRenderer`, descriptions and continuation tokens
- Search result classification into songs, videos, albums, artists, playlists, podcasts and top result
- Album/playlist/artist/podcast headers, badges, track counts and related shelves

The shared domain types are deliberately platform-neutral. Every card carries either a `track` (directly playable) or a `browseId`/`params` pair (needs a detail fetch), which is how the UI avoids special-casing each renderer.

## Playback pipeline

1. The renderer calls `player.resolve(track)`.
2. If `track.localPath` exists, the main process returns `auralis-media://local/<encoded path>` immediately.
3. Otherwise yt-dlp resolves the best audio URL for the selected quality: `-f`, quality selector, `-g`, YouTube Music watch URL. Cookies and the configured proxy are passed when present.
4. The URL is cached for 90 minutes per track and quality, and wrapped as `auralis-media://stream/<base64url(remote URL)>`.
5. The protocol handler in `main.ts` fetches the remote URL with YouTube `Referer`, `Origin`, a desktop user agent and the incoming `Range` header, then returns the response with permissive CORS headers.
6. The renderer plays that URL through a single `HTMLAudioElement`. It is not appended to the DOM but is connected to a Web Audio graph: preamp → 10 peaking filters → compressor → master gain → destination.
7. Media Session metadata and Windows transport controls are updated on play, pause and position changes.

The media protocol is what lets the Web Audio EQ inspect the stream. Fetching a cross-origin audio URL directly would taint or block `createMediaElementSource` without CORS.

### Related autoplay

`RDAMVM<videoId>` powers both the explicit **Start radio** action and the automatic continuation at the end of a queue. Search song rows start a station from the picked track immediately; albums, playlists and one-off picks seed a station from the track that just ended. The first page is appended behind the seed, continuation tokens are stored with the queue, and duplicate ids are filtered. `repeat-one` repeats the current track; `repeat-all` loops an ordinary queue, while an already-active radio station keeps following its continuations. Because the station is seeded by the song, a Hindi seed returns Hindi-related recommendations rather than a generic mix.

### Downloads

- Output directory comes from Settings; default `%USERPROFILE%\Music\Auralis`.
- Filename is `<videoId>.<ext>`; existing completed files are reused.
- yt-dlp runs with `--newline --no-part --windows-filenames`, the selected quality selector and the watch URL.
- Progress is parsed from yt-dlp output and broadcast to the renderer.
- Cancellation kills the process; the library marks the entry `cancelled`.
- Quality preference maps to yt-dlp audio selectors; `best` keeps the native container (usually M4A/Opus).

## Lyrics

Provider order is user-configurable and defaults to:

`BetterLyrics → Paxsenix → LyricsPlus → LRCLIB → KuGou → YouTube Music → YouTube captions → Zemer`

- `lyrics.fetch` returns `{ provider, synced, lines, raw }`; translated or romanised text is attached per line.
- LRCLIB uses its public API.
- Community providers are queried by title/artist/duration with graceful fallback.
- YouTube Music lyrics come from the lyrics browse endpoint returned by `next`.
- Captions are fetched by yt-dlp and converted from VTT to extended LRC.
- Word-by-word timing is preserved when a provider supplies it.
- Translation uses DeepL (including free `:fx` keys) or an OpenAI-compatible endpoint. Lines are translated in batches; progressive results are streamed to the renderer through `lyrics:translation`.

No lyrics are bundled with the app.

## Last.fm

The integration uses the desktop browser-token flow:

1. `lastfm.beginAuth` requests a token and returns the authorisation URL.
2. The user authorises the app and returns the token.
3. `lastfm.completeAuth` exchanges the token for a session key.
4. Now-playing updates are sent when playback starts; scrobbles are sent after the configured threshold (25/50/75%).
5. `love` maps the heart state to `track.love` / `track.unlove`.

Requests are signed with the user's API secret using the Last.fm MD5 signature scheme. API key, secret and session key live in `settings.json` on the local machine.

## Discord Rich Presence

`discord.ts` uses `discord-rpc` with a user-supplied application id. The presence includes track title, artist, album, artwork URL, elapsed/remaining timestamps and optionally a YouTube Music button. Presence is cleared on pause/stop when configured.

## Shazam recognition

`shazam.ts` ports the Shazam fingerprint algorithm in TypeScript:

1. FFmpeg decodes an audio file, video or the current PCM buffer to mono 16-bit PCM.
2. Samples are grouped into overlapping windows; constellations of spectral peaks are generated.
3. Hashes are packed into Shazam's lookup format.
4. The lookup is sent to Shazam's public recognition endpoint.
5. A match is mapped back to title, artist, artwork and a YouTube Music search result.

This is an original implementation, not an embedded third-party binary. It is used by the **Identify** button in the top bar.

## Persistence

All state is plain JSON under Electron's user-data directory (`%APPDATA%\Auralis` on Windows). Writes go through a temporary file and atomic rename; writes are debounced by 120 ms.

| File | Contents |
| --- | --- |
| `settings.json` | Theme, accent, locale, playback, EQ, lyrics, downloads, proxy, Last.fm, Discord, window preferences. |
| `library.json` | `liked`, `playlists`, `recent`, `events`, `downloads`, `savedAlbums`, `savedArtists`, `searchHistory`. |
| `session.json` | `cookieEncrypted`, `visitorData`, `dataSyncId`, `authUser`, cached `account`. |

The YouTube cookie is encrypted with Electron `safeStorage` (DPAPI on Windows). If encryption is unavailable, the cookie falls back to plain storage in `session.json`; this is logged by Electron's storage API behaviour and should be avoided on shared machines. Last.fm, Discord and translation credentials are user-entered settings and are not encrypted separately.

`settings.json` validation clamps volume to 0–1, speed to 0.5–2 and requires exactly 10 EQ bands. Missing library arrays are repaired to empty arrays on load.

## Security model

| Control | Implementation |
| --- | --- |
| Renderer isolation | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false` on the main window; the preload exposes only the typed API. |
| Navigation | `will-navigate` prevents navigation away from the app; external links open in the browser after protocol validation. |
| Login window | Separate persistent partition, sandboxed, no preload, no Node integration. |
| Cookies | Encrypted at rest with DPAPI when available; never sent anywhere except YouTube Music and yt-dlp's temporary cookie file. |
| Temporary cookie file | Created with a random name for yt-dlp, removed when the child process exits. |
| File paths | Local media URLs are decoded and checked for existence; only app-generated URLs reach the protocol handler. |
| External binaries | Only the bundled `resources/bin` executables are used; user input is passed as arguments, not through a shell. |
| Telemetry | None. Auralis has no backend and no analytics endpoint. |
| Downloads | Written only to the configured folder. No automatic executable execution. |

## Build and packaging

| Stage | Command | Output |
| --- | --- | --- |
| Main/preload bundle | `npm run build:main` | `dist-electron/main.js`, `preload.js` |
| Renderer | `npm run build:renderer` | `dist/` |
| Production preview | `npm run preview` | Runs Electron against `dist/` |
| NSIS installer | `npm run dist` | `release/Auralis-Setup-1.0.3.exe` |
| Portable | `npm run dist:portable` | `release/Auralis-Portable-1.0.3.exe` |

`electron-builder` packs only `dist`, `dist-electron`, `package.json` and `LICENSE`; `node_modules` is excluded because all runtime dependencies are bundled by esbuild. Icons and `resources/bin/{yt-dlp,ffmpeg}.exe` are copied to `resources/` via `extraResources`. `npmRebuild` is disabled because there are no native Node modules in the packaged runtime.

## Compatibility notes

- YouTube Music's web client version and API key change occasionally. If browsing breaks while the website works, update `CLIENT_VERSION` and `API_KEY` in `innertube.ts`.
- YouTube's stream URLs are short-lived and IP-bound. Auralis caches them for 90 minutes and invalidates on demand; switching networks may require replaying the track.
- Signing into Google inside an embedded browser can be restricted by Google. Manual cookie import is the supported fallback.
- The official transcript endpoint currently responds with HTTP 400 for this client version. Captions through yt-dlp are the fallback.
- yt-dlp is updated independently of the app. Use Settings → About or replace the binary when formats change.
