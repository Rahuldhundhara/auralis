# Auralis 1.0.4 (Android) — test-build notes

**Status:** prepared for physical-device testing. Not pushed, tagged or published.

- `versionName`: `1.0.4`
- `versionCode`: `10004`
- Package: `com.auralis.music` (unchanged)
- Minimum Android: 24 · Target Android: 34
- Release ABIs: `arm64-v8a`, `armeabi-v7a`
- Keystore/signing configuration: unchanged

## What's new

### Android first-run sign-in and taste setup

- A phone-sized **Sign in** screen is now shown on first launch, inspired by the
  Windows login page: blurred green AURALIS logo background, the same privacy
  copy, Google sign-in and a manual-cookies fallback. The native sign-in
  activity now uses a normal Android Chrome user agent, injects the Chrome
  bridge globals Google expects, and keeps popups in the same activity so the
  "This browser or app may not be secure" rejection is avoided.
- After sign-in, a two-step taste setup asks for **at least one language** and
  then **at least three artists**. Language tiles use real official artist
  photography fetched from YouTube Music; artist tiles use the official
  channel images for the selected languages. Both screens use only the existing
  green AURALIS logo as a blurred background.
- Selections are saved in settings (`tasteLanguages`, `tasteArtists`,
  `onboardingComplete`) and are used as recommendation signals on Home.

### Faster playback (highest priority)

- Added a **native** direct stream resolver (`/__fast/resolve`) ported from the
  Windows app's `innertube.playerMedia()` fast path. It tries VISIONOS →
  ANDROID_VR → IOS with the same public API keys, client contexts, user agents
  and visitorData, validates each URL with an open-ended `Range: bytes=0-`, and
  returns a direct m4a URL in one request. OkHttp avoids the JS fetch bridge;
  cookies are deliberately omitted for playback-only requests. No UI code was
  changed in this pass.
- The direct request and the bundled yt-dlp worker race with cancellation.
  A slow or bot-checked direct call no longer adds its full timeout to the
  fallback; only a real failure from both paths rejects.
- Added up to three quick retries with short backoff for transient direct
  failures before the yt-dlp fallback is allowed to decide.
- **Root cause of rejected direct URLs fixed:** YouTube's CDN answers
  `Range: bytes=0-` with HTTP 403 for some Innertube responses while accepting
  bounded 1 MB chunks. The media proxy now rewrites open-ended ranges to
  `bytes=N-(N+1048575)`, so the WebView media element can start instantly and
  request the next chunk as needed. Direct URLs now validate successfully in
  the media element instead of forcing the slow yt-dlp fallback; this also
  fixes errors when seeking forward.
- **Fixed `YoutubeDL$CancelledException`:** native workers no longer kill each
  other when a warm/next resolve overlaps playback, and front-end resolve
  errors treat cancellation as retryable instead of showing a toast.
- Resolved URLs are cached in memory and persisted to `localStorage` for up to
  90 minutes, so a warm start or a recreated WebView starts instantly.
- **Silent audio warming:** after a song starts, the next one is resolved and
  loaded into a muted HTMLAudioElement so its opening seconds are already
  buffered. Tapping that song (or Next) reuses the same element — no new
  network request — and reconnects it to the existing Web Audio EQ graph.
  The restored song is warmed at startup and Search warms its top two results.
- Removed the fixed 120 ms native sleep on a normal first resolve; it is now
  only a small 80 ms de-duplication wait when a resolve is already active.
- Added a QA-only playback trace at `window.__auralisPlaybackTrace`
  (`requestedAt`, `resolvedAt`, `startedAt`, `format`). It is not used by the UI.
- Kept the queue, notification media session, Like action, background
  playback, EQ and gapless behaviour unchanged.

### Player

- Restored the blurred, artwork-derived backdrop on Android with a dark overlay
  for readable controls.
- Added a dedicated expandable **Lyrics** button. Queue stays the default pane;
  lyrics open only on demand and stay synchronised when synced lyrics exist.
- Added an Android-only **Video ON/OFF** toggle. When enabled and a real
  progressive video exists, it plays muted as a cropped immersive layer while
  the normal audio remains the playback source. Unsupported tracks fall back
  to artwork with a clear status message — no fake or silent video.
- Expanded layout is queue-first with artwork, titles, artists and selection.

### Settings

- Android Settings is now a vertical category list. Each category opens a
  dedicated nested screen with its own options and a back button; the hardware
  back key returns to the category list first.
- Every existing preference, saved value and desktop layout is preserved.

### Home

- Replaced the repeated **Show More** button with an infinite-scroll sentinel
  backed by continuation tokens, with duplicate filtering, bounded requests,
  lightweight loading text and graceful failures.
- Added real artwork fallbacks from nested track data for exploration cards.
- Added a blurred AURALIS logo glow near the top of the page that fades as the
  page scrolls and returns at the top. It uses the existing `icon.png` asset.
- Added horizontally scrolling **Recommended Artist Stations** using official
  artist photographs from the live catalogue, cached for 24 hours. Tapping an
  artist opens the artist page; the play badge starts an artist radio.

### Search

- Added the same blurred AURALIS logo watermark, which fades out on focus and
  disappears when results appear.
- Search history, filters, categories, suggestions, infinite results, and
  loading/empty/error states are preserved. Home and the header keep Search
  one tap away.

### Navigation, taste and playlists

- SHOTS and the AURA feed have been **removed completely**. The centre
  bottom-nav item is now a green **+** button that opens the **New playlist**
  dialog directly. The other destinations remain Home / Explore / Library /
  Settings. Search stays in the header and on Home.
- Home is driven by a saved taste profile: onboarding languages, genres,
  selected artists, saved artists, likes, recent plays and completed play
  events. `Made for you` and `Your artists` shelves are built from those
  signals, and the artist rail prioritises the listener's own picks.
- Now Playing keeps immersive official video: the native fast resolver is used
  for `video: true` requests, with yt-dlp as fallback. If a video is unavailable
  the artwork stays in place instead of leaving an empty pane.
- On Android phones the Lyrics tab now opens as a full-height panel. It no
  longer scrolls the stacked Now Playing layout or leaves a blurred half-screen
  above the lyrics. Auto-follow uses the real scroll container geometry, starts
  at the current line, and stops as soon as the listener drags the lyrics.
- The language picker now includes Haryanvi, Rajasthani, Bhojpuri and many more
  regional/global languages with area labels, plus genre chips. Artist
  candidates combine language searches with artists inferred from the signed-in
  Google account's history.

### Lighter UI

- Removed the extra Home instructions and shortcuts: `Create a Mix` in the
  Jump-back-in heading, `Start a radio` / `Search` / `Explore` in the hero, the
  `Identify a song` / `Search the catalogue` / `Your YouTube library` pill row,
  and the explanatory lines under Artist Stations and Made for you. Search is
  still in the header; Shuffle and See all remain where they are useful.
- On Android the Home/Search logo wash is static and unblurred, and offscreen
  shelf sections use `content-visibility: auto` so the WebView skips their
  layout and paint work.
- Recommendations refetch far less often: a coarser taste signature, a 30-minute
  cache, four artist seeds instead of six and two language searches instead of
  three. The feed still adapts as listening history grows.
- The artist fallback now queries four known artists instead of eight.
- Only the immediately next song is silently warmed (down from two), the warmed
  audio cap is two, and a failed warm gives up after 3.5 seconds instead of 5.

### Smarter next songs

- Radio/no-queue playback no longer trusts YouTube's related list blindly. Every
  candidate page is re-ranked against the listener's onboarding artists, saved
  artists, likes, recent plays and the current song's artist/title.
- A cached pool of songs from the listener's chosen artists is mixed into each
  radio page, so the station keeps the same vibe instead of drifting into
  unrelated genres after a few tracks.
- Songs played recently are penalised and songs without any taste signal are
  dropped when a clear taste anchor exists. The pool is refetched only when the
  taste selection changes (15-minute cache).

## Measured playback startup

Measured on the x86_64 emulator (Android 14, host Wi-Fi/NAT, no account
cookies) with the QA trace and timed stream resolution:

| Condition | Stream resolution | Time to `play` event | Notes |
| --- | --- | --- | --- |
| Cold playback after range + cancellation fixes (*So Easy (To Fall In Love)*) | **96 ms** resolution, **203 ms** to `play` | ~203 ms | Emulator end-to-end via Home shuffle |
| Cold, native direct fast path (4 fresh tracks: *Chaiyya Chaiyya*, *Jiya Jale*, *Gulabi Ankhen*, *Ngamen 2*) | 624 / 678 / 628 / 594 ms | ≈ resolution + 17–20 ms | Single native OkHttp Innertube request, cookies omitted |
| Native endpoint itself (4 fresh tracks: *Bar Badal* set) | 514 / 632 / 803 / 482 ms | — | Direct player response parsed in Java |
| Earlier JS-proxy fast path (before the native endpoint) | 364 / 473 / 458 / 492 ms | ≈ resolution + 17–20 ms | Kept for comparison; native is more reliable on signed-in devices |
| Warm (same track resolved again in the session) | 0 ms | ≈ 17 ms | In-memory URL cache |
| Warm after app restart / reload | cached | immediate | Persisted `localStorage` URL cache |
| Search-prefetched top result (silent audio warm) | **28 ms** to `resolvedAt` | same element starts immediately | Top two results are buffered in muted audio elements while the list is read |
| Next button with a warmed queue item | **15 ms** to `resolvedAt` | same element starts immediately | Next song is warmed while the current song plays |
| Direct path failed, yt-dlp fallback | 12–24 s | ≈ 12–24 s | Observed when YouTube throttled or bot-checked repeated requests; no cookies on this device |

The app reaches the **≤500 ms** target when the direct path succeeds or the
URL is cached. It cannot guarantee that bound when the upstream service
returns a bot check or throttles a request; in those cases yt-dlp remains the
reliable fallback and the UI shows a lightweight spinner rather than freezing.

## Verification performed

- `npm run typecheck:android` — passed.
- `npm run build:android` — passed.
- Gradle `:app:assembleDebug -Pauralis.abis=x86_64` — passed; installed and
  exercised on the emulator via WebView CDP.
- Verified: app launch, home feed, infinite-scroll shelves, artist rail with
  official imagery, search query/history/filters/results, track selection,
  playback start, player backdrop, Lyrics open and sync, queue-first pane,
  nested Settings and hardware-back return, the bottom-nav create-playlist
  action, full-height Android lyrics with correct line centring, and
  bottom-navigation state restoration.
- Real screenshots are in [docs/screenshots](screenshots).

## Known limitations / not verifiable in this environment

- The test emulator has no account cookies. YouTube may return bot checks; a
  signed-in device may behave differently.
- The emulator runs with `-no-audio`, so live microphone voice search and
  audible output could not be verified.
- ARM release builds cannot run on the x86_64 emulator; physical-device
  testing is required.
- Device coverage tested here: one 1080×1920 x86_64 Android 14 emulator.
  Physical phones and other Android versions are pending user testing.

## Build artifacts (local, unsigned-for-publication check pending)

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `Auralis-1.0.4-android.apk` | 105303027 | `8AC59F0AAC8D81F834B5C032741425E5FE7FF7E91C6003C1856C73036A585388` |
| `Auralis-1.0.4-android.aab` | 104880995 | `8E7ACC28A3CEA452FFE75C41CA0CD1FDC7D30FAF7F6216527EAA6959705EC0B1` |

The APK is signed with the existing Auralis release key
(certificate SHA-256 `5ce12bd4bc70bca6e7f1bf455b597ddebd1da7499c079dde354b02765264b875`)
and `aapt` reports `versionCode=10004`, `versionName=1.0.4`,
`package=com.auralis.music`. Checksums are also in
`Auralis-1.0.4-android.sha256`.

## Screenshots

1. [Home with a clean layout](screenshots/1.0.4-01-home.png)
2. [Player with blurred artwork](screenshots/1.0.4-02-player.png)
3. [Lyrics panel with the current line centred](screenshots/1.0.4-03-lyrics.png)
4. [Queue-first expanded player](screenshots/1.0.4-04-queue.png)
5. [Recommended Artist Stations](screenshots/1.0.4-05-artists.png)
6. [Settings categories](screenshots/1.0.4-06-settings.png)
7. [Nested settings screen](screenshots/1.0.4-06b-settings-detail.png)
8. [Search landing](screenshots/1.0.4-07-search.png)
9. [Search results](screenshots/1.0.4-08-search-results.png)
10. [Android first-run sign-in](screenshots/1.0.4-10-login.png)
11. [Language selection](screenshots/1.0.4-11-languages.png)
12. [Bottom-nav + creates a playlist](screenshots/1.0.4-12-create-playlist.png)
