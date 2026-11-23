# Quality assurance record

**Build:** Auralis 1.1.2 (podcast filters + Identify fix; 1.1.1 evidence retained below)
**Platform:** Windows 11 x64 (build 10.0.26300)
**Electron:** 45.0.0
**Node:** 24.19.0
**Test date:** 29 October 2026; playback latency pass 2 November 2026; podcast/Identify/glass UI passes 4 November 2026; reference-led redesign and taste onboarding passes 5 November 2026; Explore hero and global shell passes 15 November 2026
**Live catalogue:** YouTube Music anonymous session

> **Unreleased UI (4 November 2026):** the local tree adds a reworked Home hero with a rotating mood thought and a live now-playing card. It is not part of the published 1.1.2 build. See [Home hero](#home-hero-unreleased-4-november-2026) below. The same tree also stops the top search field from leaving its suggestion spinner running when the popover closes mid-request.
>
> **Glass UI pass (unreleased, 4 November 2026):** the title bar, sidebar, top bar, player rail, page heroes, dialogs and Now Playing now share a smoked-glass treatment over a faint blurred album-art wash. Content cards stay flat so titles, metadata and controls remain readable. The pass also removes the duplicate Home quick actions and the hero equalizer, flattens card hover effects and reduces the display type scale. The final tree passed typecheck, the production build, the 21-check full suite and the 16-check hero pass; the light theme was visually checked at 1440 px and at the 1024 px minimum window with no horizontal overflow. See [Glass UI pass](#glass-ui-pass-unreleased-4-november-2026).
>
> **Reference-led redesign (unreleased, 5 November 2026):** Home, the top bar and the queue drawer were rebuilt against the supplied dark reference. The change is layout and hierarchy only: every track, count, progress value and state still comes from the live store. Jump back in is now a compact grid of real recent plays, the hero has a larger thought with a live status chip and a real now-playing/progress card, Identify sits inside the search field, and the queue drawer opens as **Now playing & queue**. Accent colours still come from the user's theme; an Emerald preset was added (it became the stored default in the 15 November shell pass). Typecheck, the production build, the 21-check full suite and the now 18-check hero pass are green, with visual checks at 1440 × 960 and the 1024 × 680 minimum. See [Reference-led redesign](#reference-led-redesign-unreleased-5-november-2026).
>
> **Taste onboarding (unreleased, 5 November 2026):** the first launch now opens a full-screen, two-step preference flow — languages first, then artists, like Spotify's taste setup. Both steps are multi-select and persist to settings. The artist pool is built from YouTube Music's real **Top artists** chart plus artist searches for the selected languages, de-duplicated and capped at eight picks. Saved artists appear as a **Your artists** shelf on Home, and **Music preferences → Edit preferences** in Settings reopens the same flow. `AURALIS_SKIP_LOGIN=1` suppresses the automatic prompt for automation; the manual edit path still works. Typecheck, the production build, the 36-check onboarding pass, the 18-check hero pass and the 21-check full suite are green; the flow was checked at 1024 × 680 with no horizontal overflow. See [Taste onboarding](#taste-onboarding-unreleased-5-november-2026).
>
> **Explore featured-track hero (unreleased, 15 November 2026):** the Explore tab now opens on the new flat dark-slate hero — vertical NOW PLAYING rail with a live spectrum, teal energy sweep, real cover over a green vinyl, emerald Play/Pause pill and a cream ECG waveform. It reads the global player store, uses a canvas-extracted artwork palette and crossfades covers on track changes. Typecheck and the production build pass; the focused hero pass is green at 1440 × 960, the 1024 × 680 minimum and the 950/850/640/560 breakpoints, including reduced motion. See [Explore hero](#explore-featured-track-hero-unreleased-15-november-2026).
>
> **Global shell pass (unreleased, 15 November 2026):** the shell now uses the brief's token set — emerald `#10b981` as the default accent, `#090b0e` background with `#12161c` surfaces, a 256 px expanded sidebar and a 96 px player. The 38 px title bar is gone from the app shell (`--titlebar-h: 0px`) and stays only on the splash/sign-in screen; because the Electron window is frameless, the minimize/maximize/close buttons moved into the top bar. Manrope and Bricolage Grotesque are bundled locally. Typecheck, the renderer build, the shell pass and the hero regression are green. See [Global shell and design tokens](#global-shell-and-design-tokens-unreleased-15-november-2026).
>
> **1.1.2 scope:** podcast episode filters and Identify music. The filter chips now use YouTube Music's `browseSectionListReloadEndpoint` continuation instead of a browse-navigation endpoint, and the “Latest” chip exposes the real sort menu. Identify was failing before its request was sent because Shazam fingerprint fields were written as signed 16-bit integers.
>
> **1.1.1 scope:** playback start latency. The resolver no longer spawns yt-dlp per track; it asks the Innertube player endpoint for a direct audio URL and keeps yt-dlp as the fallback. The transport also stops flashing a spinner for fast starts, and the media proxy retries a dropped range request through Node's stack. Feature set, UI and packaging are unchanged from 1.1.0.
>
> **1.1.0 scope:** cold-start animation, dedicated search, Queue-first Now Playing, lyrics translation UI, mini-player progress, streaming-quality reload, EQ presets/numeric bass boost, Jump Back In and hardened media handling. The full 21-check suite was re-run on 1.1.0; the 1.0.2 results remain the baseline for older evidence.
>
> **Merged tree:** The Android/mobile branch (through the `v1.0.3-android` release) was merged into 1.1.0 without dropping platform-specific code. Typecheck, production builds, the 21-check suite, packaged smoke and focused upgrade checks were re-run on the merged tree; the Android renderer keeps its `isAndroidShell` paths and the regenerated web assets are committed.
>
> **Build paths:** Builds are written to `release/<version>/`; the 1.1.0 baseline was built in `release/1.1.0/`, the latency patch in `release/1.1.1/` and this patch in `release/1.1.2/`. The pre-1.1.2 local build folders were removed from this PC on 4 November 2026 to free space; the published installers remain on GitHub Releases, and `release/1.1.2/` is still present locally.

## Summary

| Area | Result |
| --- | --- |
| TypeScript typecheck | Pass |
| Android renderer typecheck (`npm run typecheck:android`) | Pass |
| Production renderer build | Pass |
| Android web asset build (`npm run build:android`) | Pass (assets regenerated) |
| 1.1.0 focused upgrade UI QA | Pass (16/16 checks) |
| 1.1.1 focused upgrade UI QA | Pass (16/16 checks) |
| 1.1.2 focused upgrade UI QA | Pass (16/16 checks) |
| 1.1.0 packaged smoke test | Pass |
| 1.1.1 packaged smoke test | Pass |
| 1.1.2 packaged smoke test | Pass |
| 1.1.2 portable EXE launch | Pass (CDP, version 1.1.2) |
| Branding | Pass (supplied Auralis logo in app, installer, portable, title bar, splash, tray and README) |
| Full end-to-end UI QA | Pass (21/21 checks) |
| Glass UI pass (unreleased) | Pass (21/21 full suite; light theme checked at 1440 px and 1024 px with no overflow) |
| Reference-led redesign (unreleased) | Pass (21/21 full suite, 18/18 hero; 1440 × 960 and 1024 × 680 visual checks) |
| Taste onboarding (unreleased) | Pass (36/36 onboarding, 18/18 hero, 21/21 full suite; 1024 × 680 visual checks) |
| Explore featured-track hero (unreleased) | Pass (idle, playing, pause, next-track switch, cover count, palette, live canvases, reduced motion; 1440 × 960, 1024 × 680 and 950/850/640/560 breakpoints, no overflow) |
| Global shell + tokens (unreleased) | Pass (emerald default, 256 px rail, 96 px player, 0 px title bar with relocated window controls, bundled fonts; 1440 × 960 and 1024 × 680, no overflow; hero regression green) |
| Performance and cache pass (unreleased, 19 November 2026) | Pass (login, Home playback, Library, YouTube phonk detail, Now Playing 640 px cover, exact 1024 × 680 zero overflow; cache markers `2`; no page or console errors) |
| Optimized portable rebuild | Pass (133.33 MB vs 140.89 MB; packaged launch, login restore, 320 px artwork, cache markers `2`) |
| Podcast filters | Pass (In progress, Unplayed, Played, clear-on-second-click, Latest sort menu) |
| Identify music | Pass (2 live matches plus the Now Playing dialog) |
| Home hero (unreleased) | Pass (18/18 checks with `node scripts/home-hero-qa.mjs`; thought rotation unit test) |
| Sleep timer | Pass |
| NSIS installer build | Pass |
| Portable build | Pass |
| Packaged EXE launch | Pass |
| Portable EXE launch | Pass |
| Silent install + installed app launch + uninstall | Pass |
| Live playback from packaged EXE | Pass |
| Playback start latency | Pass: resolve 0.29–0.65 s, click → first audio 1.13–1.32 s, hover-prefetched 0.80–0.97 s, no spinner flash (was 7.52 s) |
| Live download from packaged EXE | Pass |
| Moods & genres | Pass (50 tiles) |
| Podcast episodes | Pass (20 episodes) |
| Themes, EQ, settings | Pass |
| Browser/page errors during final pass | No app exceptions; third-party artwork CDN failures fell back to placeholders |

The final full-app pass, focused upgrade pass and packaged smoke test produced no page exceptions. The latency-build full pass logged one external `yt3.googleusercontent.com` artwork 404; the image fell back to a placeholder, and no app code failed. The QA watcher still records these external asset failures in `issues` rather than hiding them. It ignores the expected `ERR_ABORTED` reported when the media proxy cancels the previous track's range request during a track switch.

## Podcast filters and Identify (4 November 2026)

### Podcast filters

The chips looked clickable but did nothing because YouTube Music returns them with `browseSectionListReloadEndpoint.continuation.reloadContinuationData.continuation`, not a `browseEndpoint`. The parser discarded that token and the click handler called a navigation function that had no continuation branch. The **Latest** chip is also different: it opens an `openPopupAction` menu instead of filtering directly.

The fix keeps the current detail page mounted and:

- parses the reload continuation into `NavEndpoint.continuation` and the popup options into `BrowseChip.options`;
- reloads the section list in place through `yt.browseEndpoint({ continuation })`;
- replaces the episode list with the returned `musicMultiRowListItemRenderer` rows;
- reads `messageRenderer` as the real empty state;
- updates the chip cloud from each response, so sort and played-state filters combine;
- restores the original list when the active chip is clicked again, and keeps a non-default sort when clearing a played-state filter;
- hides the “Show all episodes” continuation while a filter view is active.

Verified with `node scripts/podcast-filter-qa.mjs` on *Good Mythical Morning with Rhett & Link* (`MPSPPLJ49NV73ttrvdqf3b1icOXusZabXitci9`):

| Step | Result |
| --- | --- |
| Initial page | 20 episode rows |
| In progress | 0 rows; YouTube's “No episodes match the filters you applied.” message |
| Unplayed | 700 rows; chip highlighted |
| Unplayed clicked again | Original 20 rows restored |
| Played | 0 rows; real empty message (anonymous session has no history) |
| Latest → Oldest | 100 rows; first episode changed from “Try Not To Get Angry Challenge” to “Extremely OCD Morning Routine” |
| Unplayed + Oldest | 700 rows; summary “Unplayed episodes · Oldest” |
| Clear Unplayed, keep Oldest | 100 rows; summary “Sorted by Oldest” |
| Show all | Original 20 rows restored |

The anonymous session has no listening history, so **In progress** and **Played** legitimately returned an empty list. **Unplayed** proving a 700-row replacement verifies that the same continuation path works for the other two chips; a signed-in account supplies the history they filter.

### Identify music

`generateSignature` was throwing `RangeError [ERR_OUT_OF_RANGE]` before any Shazam request was sent:

```text
The value of "value" is out of range. It must be >= -32768 and <= 32767. Received 38223
```

The Shazam signature format stores each peak's magnitude and corrected frequency bin as **unsigned** 16-bit little-endian values. The implementation wrote both with `writeInt16LE`, so any bin above 32767 failed. The fix uses `writeUInt16LE` with explicit clamping and matches the reference peak comparison (`spreadMinus49[binPos - 1]`).

| Test | Result |
| --- | --- |
| Backend `recognize:from-video-id` `dQw4w9WgXcQ` | “Never Gonna Give You Up” — 6.9 s |
| Backend `recognize:from-video-id` `kJQP7kiw5Fk` | “Despacito” — 5.8 s |
| Now Playing dialog, play “Never Gonna Give You Up” then Identify | “Never Gonna Give You Up” / Rick Astley — 7.3–9.0 s across runs, album/year/genre populated |

No recognition errors were logged in the main process during either run.

## Sign-in entry points (6 November 2026)

The dedicated sign-in screen and its browser/cookies.txt handoff were removed. The app now opens directly into the taste onboarding on first run and into Home afterwards. Account sign-in remains available only from **Settings → Account**, using the existing Google window and the manual cookie dialog.

## Sign-in system (16 November 2026)

Sign-in is now visible from everywhere instead of being buried in Settings. The sidebar footer carries a permanent account card: signed out it reads **Sign in / Connect your account** and opens **Settings → Account**; signed in it shows the real YouTube Music avatar (or initials), display name, channel handle and an accent connection dot. The top-bar account chip remains as a second entry point.

The Google window is still available as the fallback flow when Chrome is not installed. The app opens `accounts.google.com`, keeps only `youtube.com` cookies in the `persist:auralis-login` partition and never sees the password. Completion detection polls that partition every 1.5 s, listens to `did-navigate`, `did-navigate-in-page` and `did-redirect-navigation`, and attempts one last cookie capture when the window closes, so Google's client-side redirect cannot be missed. Closing the window without finishing restores the signed-out state and shows “Sign-in window closed before completing.” The manual cookies.txt / `name=value` path remains under **Paste cookies**.

## Chrome-window sign-in (18 November 2026)

Chrome 136+ refuses remote debugging on the default Chrome data directory (“DevTools remote debugging requires a non-default data directory”), and its app-bound v20 cookies cannot be decrypted outside that directory. Importing the user's main Chrome profile is therefore impossible by design — and copying or junctioning it can destroy the live cookie database, so that code was removed completely.

Sign-in opens a **visible real Chrome window** with a profile owned by Auralis at `app.getPath('userData')/chrome-login`. The user's own Chrome profile and tabs are never opened, copied or modified. The window starts at Google's standard YouTube sign-in URL with the account email as a hint, so password managers, 2FA and Google's normal pages all work exactly as in Chrome. The first sign-in asks for the password/2FA because this profile is separate from the user's main Chrome; it persists until sign-out.

Two Chrome behaviours shaped the final flow:

- `--remote-debugging-port` makes Google reject the account step with **“This browser or app may not be secure.”** The sign-in window therefore runs with no DevTools port at all.
- `windowsHide: true` makes Chrome create its window **hidden** (the Win32 title exists but `IsWindowVisible` is false), so the user sees no sign-in window. The sign-in launch explicitly uses `windowsHide: false`.

The app polls the visible window title through `tasklist`, waiting for Google's redirect to land on `/YouTube Music/i`. It then waits 1.5 s, closes Chrome gracefully (`taskkill /PID` without `/F`) so the cookie store flushes, and starts a short-lived **headless** Chrome on the same dedicated profile only to read `Storage.getCookies`. Google never sees a debuggable browser during sign-in. When the YouTube auth cookies (`SID`, `SAPISID`, `__Secure-3PAPISID` or `__Secure-1PAPISID`) are present, Auralis saves only the `youtube.com` cookies as the app session and broadcasts `session-change`. A 5-minute timeout closes the window if the user walks away. Signing out deletes the dedicated profile, so the next sign-in does not silently reuse the old account. The embedded Google window remains as a fallback only when Chrome is missing.

| Check | Result |
| --- | --- |
| Signed-out sidebar card says “Sign in” and opens Settings → Account | Pass |
| Same card keeps its size at the 1024 × 680 minimum, no horizontal overflow | Pass |
| Sign in launches a **visible** `chrome.exe` with `--user-data-dir=…\chrome-login` and **no** `--remote-debugging-port` | Pass |
| Chrome loads the real Google sign-in form and is not flagged as an insecure browser | Pass |
| Closing the window unsigned leaves the app signed out and toasts the cancel note | Pass |
| Headless `Storage.getCookies` returns the profile's cookies after Chrome exits | Pass |
| Captured cookies are adopted, the window closes itself and the app reports the session | Pass (disposable fake-cookie mechanics probe; real Google auth is manual) |
| Sign out removes the dedicated Chrome login profile | Pass |
| Advanced cookie textarea reachable from the dialog | Pass |
| Renderer errors during the checks | None |

`node scripts/qa-signin-probe.mjs` reproduces the pass and writes `qa/signin/*.png`. `qa/signin/07-mechanics-signed-in.png` is the disposable fake-cookie run showing the adopted session, the connected sidebar card and the success toast; it exists only as QA mechanics evidence, not as a real account. The second app launch in that probe uses the test-only `AURALIS_QA_LOGIN_URL=https://music.youtube.com/` fixture so the post-login title can be reached without a real Google password.

## Mandatory sign-in and YouTube Music section (19 November 2026)

The app now opens on a dedicated welcome screen and stays there until a YouTube Music account is connected. The shell, sidebar and routes are not mounted while signed out; signing out returns to the same screen. `Login.tsx` keeps the real Chrome-window flow and the manual cookie fallback from the sections above. On cold start the encrypted session is only readable after Electron is ready, so `innertube.refreshSession()` now runs after `app.whenReady()` and the app no longer bounces back to the sign-in screen.

The **YouTube Music** page adds two tabs. **History** is strict songs-only: `type === 'song' && !isVideo`, so official music videos, UGC clips and episodes never appear. **Playlists** lists every account playlist from `FEmusic_liked_playlists`, including private ones; playlist browse requests now go out with the signed-in cookies, or YouTube returns an empty page. Opening a playlist shows its tracks inline and stops at the header's `trackCount`, because the section-list continuation otherwise appends a recommendation tail (the phonk playlist showed 55 rows before this cap). The same playlists are merged into **Library → Playlists** under **From YouTube Music**, deduplicated by YouTube id.

Verified in dev mode against the real signed-in account (Thara Bhaii Jack, authUser `0`):

| Check | Result |
| --- | --- |
| Cold start restores the encrypted session and account | Pass (`hasCookies: true`) |
| Signed out: welcome screen visible, no shell or sidebar, Google and cookie buttons present | Pass |
| 1024 × 680 minimum: no document or content horizontal overflow (login and shell) | Pass (`1026 × 682` viewport, overflow `0`) |
| Home card starts playback from the rendered DOM | Pass (“The Lost Life”, player `data-playing="true"`, no toast) |
| History is songs-only | Pass (1 row, “Pal Pal”, 0 video flags) |
| Playlists include the private playlist and exclude Episodes for Later | Pass (Liked Music, Sounds from Shorts, phonk) |
| Playlist detail stops at the real track count | Pass (phonk: 3 rows — MONTAGEM BAILÃO, LUZ ROJA, MATADORA; was 55) |
| Library merge has no duplicates | Pass (3 cards, 0 duplicates) |
| Play from a Library YouTube playlist card | Pass (starts “MONTAGEM BAILÃO”, no toast) |
| Official music videos stay in playlists while history filters them out | Pass (`isVideo: true` rows play in phonk, absent from History) |
| `npm run typecheck` and `npm run build:main` | Pass |

Evidence: `qa/youtube/results.json`, `qa/youtube/01-home.png` through `qa/youtube/07-library-playlist-playing.png`. The Home feed rotates per request, so the “Music videos for you” two-row shelf is not present in every session; when it appeared, its watch-endpoint cards parsed into playable tracks and a card played end to end.

## Performance and cache pass (19 November 2026)

Scope: lower decoded artwork, renderer/GPU memory, disk cache and package size without changing login, playback, downloads or the YouTube Music section. Verification used `npm run build`; after the pass a portable was packaged with `npm run dist:portable` (the Setup installer was not rebuilt). All launches used an isolated copy of the real signed-in profile.

Changes: parse-time thumbnail clamp (320 px cards, 640 px Now Playing, 960 px on Android), a 16 MB in-memory artwork cache with a 400-file disk cap, 128 MB HTTP and 64 MB media cache switches, one-time cache cleanup via `.cache-version` and `image-cache/.version`, `content-visibility: auto` for shelves and track rows, tray background throttling, DevTools opt-in with `AURALIS_DEVTOOLS=1`, and maximum-compression packaging with only the `en-US` Electron locale and no source maps. FFmpeg (100.5 MB) and yt-dlp (17.1 MB) remain bundled.

| Measurement | Before | After |
| --- | --- | --- |
| Decoded artwork after scrolling the full Home feed | 27.8 MP / 82 images | 11.1 MP / 78 images |
| Decoded artwork in the idle Home shelf view | — | 4.8 MP / 40 images |
| Renderer working set, idle | — | 178 MB |
| Renderer working set after the full scroll | 233 MB | 236–243 MB |
| Total working set (idle / minimized / browsed) | 749 MB (browsed pass) | 772 / 718 / 727 MB |
| GPU process while minimized | 282 MB | 250 MB |
| Real profile on disk | 480 MB (307 MB Chromium cache, 103 MB login profile, 41 MB artwork) | HTTP 128 MB + media 64 MB caps, 400 artwork files; one-time cleanup on next launch |

The total working set is still dominated by the Electron/Chromium baseline (Browser, GPU and utility processes), so the meaningful savings are decoded pixels, hidden-window GPU work and bounded disk, not a dramatic total-RAM drop. Disabling hardware acceleration was measured at 732 / 633 / 662 MB (idle / minimized / browsed) versus 772 / 718 / 727 MB with it on; the renderer grew to 295 MB and UI smoothness dropped, so acceleration stays on by default. Benchmarks ran while a portable 1.1.4 build was also open, which adds GPU-memory noise of roughly 10–50 MB.

Focused production-build smoke, using a temp copy of the real profile:

| Check | Result |
| --- | --- |
| Encrypted session restore | Pass (real account, `hasCookies: true`) |
| Shelf scroll and lazy artwork | Pass (scrolled 584 px; 10 images loaded) |
| Card artwork clamp | Pass (38 loaded, 0 above 320 px) |
| Home playback | Pass (card → queue, player in Pause/playing state) |
| Now Playing cover | Pass (natural width 640, `sddefault` variant, backdrop shares the proxy URL) |
| Library | Pass (3 cards, 6 tabs, no skeleton) |
| YouTube phonk detail | Pass (3 rows, track art 320 px max) |
| Exact 1024 × 680 viewport | Pass (document/client width 1024, overflow 0 on YouTube detail, Home and Library) |
| Cache version markers | Pass (`.cache-version` = 2, `image-cache/.version` = 2, 79 files) |
| Page or console errors | None |
| `npm run typecheck` and `npm run build` | Pass |

Evidence: `qa/perf/before.json`, `after2.json`, `phases-gpu.json`, `phases-nogpu.json`, `phases-cv.json`, `smoke.json` and `smoke-*.png`. The temporary benchmark profile was deleted after the run; the real `%APPDATA%\Auralis` was only read to seed the temp profile.

Portable package: `npm run dist:portable` produced `release/1.1.4/Auralis-Portable-1.1.4.exe` at **133.33 MB**, down from **140.89 MB** (−7.56 MB, −5.4%). `win-unpacked` is 431.3 MB with only `locales/en-US.pak`; `app.asar` is 5.16 MB with 0 source maps; FFmpeg (100.5 MB) and yt-dlp (17.1 MB) are still most of the package. The Setup installer was rebuilt as well and measures **145.41 MB** (152,471,751 bytes), down from **153.81 MB** (161,283,477 bytes), −8.40 MB (−5.5%). Building both targets in a single `electron-builder --win` run produced a larger portable (145.17 MB), so the release is made with two runs, `npx electron-builder --win portable` and `npx electron-builder --win nsis`; `SHA256SUMS.txt` was regenerated for both artifacts.

Packaged launch smoke (`release/1.1.4/win-unpacked/Auralis.exe`, temp profile): version 1.1.4, real account session restored, 7 Home shelves, 33 loaded card images all at or below 320 px, cache markers `2` / `2`, no exceptions. Evidence: `qa/perf/portable-build.log`, `packaged-smoke.json`, `packaged-home.png`.

## Home hero (unreleased, 4 November 2026)

The Home hero no longer shows a time-of-day greeting or the four-tile artwork collage. The greeting space now holds a short thought that rotates every 10 minutes; the line is seeded by the current song, playback state and local time of day, so different songs and moods get different rotations. A status chip above the headline names the live state (“Live radio, no plan”, “Paused, mood intact”, “Ready when you are”) so the hero never implies playback that is not happening. The right side is a live now-playing card driven by the player store: real artwork, song title, artist, **Open player**, a compact four-bar level indicator while playing, and real elapsed/total time with a progress fill. With an empty queue it shows a “Nothing playing” state instead of hiding the area. The hero keeps two clear actions — **Shuffle library** and **Start radio** — and a larger display scale that still fits the 1024 px minimum.

| Check | Result |
| --- | --- |
| Greeting heading removed | Pass |
| Thought fills the greeting space and is pinned to the current ten-minute slot | Pass |
| Thought changes with the song and playing state | Pass |
| Twelve slots produce at least ten distinct playing thoughts with no unfilled placeholders | Pass (`npx tsx scripts/test-thought.ts`) |
| Collage tiles replaced by the now-playing card | Pass |
| Card shows the same song as the player bar and its artwork | Pass |
| Playing card shows the live equalizer, real progress and elapsed/total time | Pass |
| Kicker reflects live playback (radio or direct) | Pass |
| Open player opens Now Playing | Pass |
| Card hidden at the 1024 px minimum window; hero has no horizontal overflow | Pass |
| Renderer errors during the checks | None |

`node scripts/home-hero-qa.mjs` writes `qa/home-hero-results.json` and screenshots `qa/home-hero-playing.png`, `qa/home-hero-empty.png` and `qa/home-hero-compact.png`. The pure rotation/pool logic is covered by `npx tsx scripts/test-thought.ts`. The hero pass is now 18 checks.

## Glass UI pass (unreleased, 4 November 2026)

The unreleased tree uses one visual direction across the app: **smoked glass over album light**. Shell chrome and transient surfaces are translucent and blurred; content stays flat so titles, metadata and controls keep their contrast. The accent still comes from the user's current theme setting.

| Layer | Surfaces |
| --- | --- |
| Shell chrome | Title bar, sidebar, top bar, search field, player rail, back/forward and account controls |
| Moments | Home hero, hero now-playing card, page heroes, dialogs, menus, toasts, Now Playing, queue drawer, lyrics and recognition panels |
| Flat content | Media cards, shelves, mood tiles, stat cards, track rows and tables |

Shared tokens in `base.css` set a 28 px blur for chrome, 32–34 px for stronger transient surfaces, and translucent tinted fills per theme. Each glass surface gets a 1 px light seam on its top edge, plus the live playing dot as the recurring signature. The Home hero's album wash is driven by the `--hero-art` variable from the current track thumbnail: a blurred cover under an accent radial and a gradient that keeps the headline readable.

The simplification pass also:

- removed the Home eyebrow and the duplicate **Identify a song** / **YouTube library** quick actions, leaving **Shuffle library** and **Start radio**;
- replaced the hero's 14 equalizer bars with a compact artwork + track-info row (the later redesign added a small four-bar live indicator inside that card);
- flattened card hover scale/accent effects, normalized heading weights to 550, moved uppercase labels to sentence case, reduced the display type scale (hero headlines now cap around 44–48 px) and tightened radii and spacing;
- keeps opaque surfaces when `backdrop-filter` is unavailable (Android shell / reduced capability), so text never sits on an unreadable transparent layer.

| Check | Result |
| --- | --- |
| Dark, black and light token sets render the same surfaces | Pass |
| Light theme at 1440 × 900 | Pass; no horizontal overflow |
| Light theme at the 1024 × 680 minimum window | Pass; hero now-playing card hidden, no horizontal overflow |
| Full end-to-end suite on the final tree | Pass (21/21 checks) |
| Home hero | Pass (16/16 checks) |
| Renderer/page errors during the glass checks | None |

The final rerun wrote `qa/full/results.json` and refreshed `qa/full/01-home.png` through `09-restart-restored.png`. The only logged issues were two expected external `yt3.googleusercontent.com` artwork 404s; both fell back to placeholders and no app code failed.

## Reference-led redesign (unreleased, 5 November 2026)

The supplied dark reference set the direction: charcoal surfaces, one strong accent, compact rounded cards, a large editorial Home headline, and a queue that doubles as a now-playing panel. The implementation adopts that hierarchy without copying the reference's fictional BPM, PRO badge, lyrics preview or quality claims. Every displayed value is live: queue counts come from the player store, recent cards come from library history, progress uses the audio position and duration, and no format is claimed unless the track provides it.

| Area | What changed |
| --- | --- |
| Home hero | Status kicker, larger thought, accent wash and a real now-playing card with artwork, live level indicator, progress, elapsed/total time and **Open player** |
| Jump back in | Horizontal rail replaced by a compact 2×3 grid: **Create a Mix** plus up to five real recent plays with duration |
| Top bar | Desktop **Playing Queue** pill with the live queue count and active state; **Identify** moved inside the search field; Android keeps its standalone fallback |
| Queue drawer | Renamed **Now playing & queue**; large current-track card with play/pause, like, open-player, more menu and real progress; upcoming list and Clear action retained |
| Sidebar and shell | Brand lockup moves into the sidebar while the app shell is visible; grouped nav, accent-tinted active row, pill badges, tighter short-height layout; title-bar brand stays on splash |
| Accent | All highlights use the theme accent; **Emerald** was added to the presets without changing the stored default or adding an override |
| Drawer placement | Queue drawer starts below the title bar and top bar so its header is never clipped, and the 1024 × 680 sidebar keeps the playlist card and footer separated |

| Check | Result |
| --- | --- |
| TypeScript typecheck and production renderer build | Pass |
| Android web assets regenerated | Pass |
| Full end-to-end suite | Pass (21/21 checks) |
| Home hero | Pass (18/18 checks, including live equalizer, progress/time and kicker) |
| Identify from the integrated search control | Pass (“Never Gonna Give You Up” / Rick Astley, 9.99 s) |
| Dark theme at 1440 × 960 (empty, playing, queue open) | Pass; no clipped header or horizontal overflow |
| Light theme with the Emerald preset at 1440 × 960 and 1024 × 680 | Pass; queue drawer kept opaque enough to read, no overflow |
| 1024 × 680 minimum window | Pass; hero card hidden by design, sidebar create card and footer fully visible |
| Renderer/page errors during the redesign checks | None |
| Real data only | Pass; no fake BPM, PRO badge, lyrics, Hi-Fi or Spatial Audio claims were added |

The final full-suite rerun on this tree passed 21/21; the only logged issue was one external `yt3.googleusercontent.com` artwork 404 that fell back to a placeholder. `node scripts/qa-upgrade.mjs` now asserts the `.quick-grid` layout and three-column real-history grid, but it was not rerun for this pass because no new release package was built. The packaged `release/1.1.2` folder still contains the published build. The temporary visual helpers used during the pass (`scripts/qa-visual-redesign.mjs` and `scripts/qa-visual-redesign-light.mjs`) were removed after the screenshots were captured.

## Taste onboarding (unreleased, 5 November 2026)

The first launch now opens a full-screen preference flow, styled like Spotify's taste setup but built from Auralis's own tokens. It only appears automatically when `onboardingComplete` is false; automation launches with `AURALIS_SKIP_LOGIN=1` bypass the automatic prompt. **Skip for now** completes onboarding with whatever is selected, while reopening from Settings starts in edit mode and offers **Close** without overwriting the saved choices.

| Step | Behaviour |
| --- | --- |
| 1 — Languages | 18 curated options (11 Indian languages plus English, Spanish, Korean, Japanese, Arabic, French and Indonesian), multi-select. Continue stays disabled until at least one language is picked. |
| 2 — Artists | Real artists from the charts **Top artists** shelf plus a `"<language> top artists"` artist search for every selected language. Results are de-duplicated by name/id, language matches come first, each language contributes up to eight names, and the pool is capped at 72 cards for the grid. |
| Artist picking | Multi-select up to eight; search filters the loaded pool client-side; artwork uses the real channel image with the shared fallback. Loading skeletons and an inline **Try again** state cover slow or failed requests. |
| Persistence | `tasteLanguages`, `tasteArtists` and `onboardingComplete` live in the shared `Settings` type and in both the Electron and Android defaults. Arrays are validated on load. |
| Home | A **Your artists** shelf sits directly under the Home hero, above Jump back in and the editorial shelves, and uses the saved channel ids, names, thumbnails and audience metadata. Its subtitle names the chosen languages, e.g. “3 artists picked from Hindi, Punjabi”. |
| Settings | **Music preferences** in General summarizes the saved languages and artist count, with **Edit preferences** reopening the flow with the current picks preselected. |

| Check | Result |
| --- | --- |
| TypeScript typecheck and production build | Pass |
| Dedicated onboarding QA | Pass (36/36 checks with `node scripts/onboarding-qa.mjs`) |
| First launch → onboarding | Pass (36/36 onboarding checks) |
| Real artist data for Hindi + Punjabi | 31–32 unique artists across runs; real names, artwork and audience metadata from YouTube Music |
| Language and artist persistence | Pass (`["hindi","punjabi"]`, 3 artists, `onboardingComplete: true`) |
| Home personalization shelf | Pass (3 saved cards, Hindi/Punjabi subtitle) |
| Settings edit round-trip | Pass (picks preselected, Close keeps saved values) |
| 1024 × 680 minimum window | Pass; no horizontal overflow in either step and the footer stays visible |
| Home hero regression | Pass (18/18 checks) |
| Full end-to-end suite | Pass (21/21 checks) |
| Renderer/page errors | None |

The language list is deliberately curated rather than scraped: it is a stable, readable set of real listening languages. Artist names are never invented — if both the chart and the language searches fail, step 2 shows the error state instead of placeholder people. Evidence: [`qa/onboarding-languages.png`](../qa/onboarding-languages.png), [`qa/onboarding-artists.png`](../qa/onboarding-artists.png), [`qa/onboarding-home-artists.png`](../qa/onboarding-home-artists.png) and [`qa/onboarding-settings.png`](../qa/onboarding-settings.png). The temporary API inspector used during discovery (`scripts/inspect-onboarding.ts`) was removed.

## Explore featured-track hero (unreleased, 15 November 2026)

The Explore tab now opens on the reference hero instead of the old compact page heading. It is one component (`src/components/explore/ExploreFeature.tsx`) over the shared player store: there is no second audio element, no hardcoded track and no placeholder art. The panel geometry follows the brief — 20 px radius, 1 px `rgba(255,255,255,.06)` border, flat dark-slate gradients, leather seams, 60/1fr/300 columns and a 268 px minimum height.

| Layer | Implementation |
| --- | --- |
| Data | `current`, `playing` and `toggle()` come from `usePlayerStore`; the hero initialises from the store, so re-entering Explore shows the live track immediately |
| Copy | `heroCopy()` strips `(From "Album")` into the mint line, peels trailing `- Version` / `(Live)` segments and never repeats the album in the title; `heroTagline()` is deterministic per track id |
| Palette | A tiny canvas buckets the real cover (skipping near-black/white), then `atmospherePalette()` forces saturation 0.38–0.72 and lightness 0.29/0.21/0.56 into `--hero-*` vars; monochrome art falls back to hue 158 |
| Cover | The real `current.thumbnail` through `Artwork`, with at most two layers: the new layer fades in over 520 ms and the old one is removed after 850 ms |
| Motion | The rail and cream waveform read a live `AnalyserNode` placed after the master gain; the sweep, dots, notes, vinyl and sparkle follow the brief timings and stop under `prefers-reduced-motion` |
| Controls | The emerald pill calls the global `toggle()`; the cream waveform dims to `.55` when paused. Idle shows **Auralis Discover**, a gradient music-glyph fallback and a disabled Play button |

Live checks used a fresh Electron profile and the real YouTube Music service. Search for *Kesariya* → play the top song → Explore:

| Check | Result |
| --- | --- |
| Panel radius / border | `20px` / `1px rgba(255, 255, 255, 0.06)` |
| Idle state | **Auralis Discover**, “Let the music find you.”, no artist/album, fallback cover, Play disabled |
| Playing state | Title `KESARIYA`, artist `Arijit Singh`, album `(From "Brahmastra")`, rail `NOW PLAYING` |
| Hero ↔ player | Player title/artist/artwork matched the hero; Play/Pause on the hero changed the player state both ways |
| Live canvases | Cream span 54 px playing → 16 px paused; rail alpha roughly halved when paused; both non-zero |
| Track switch | Next → `Apna Bana Le`, album `(From "Bhediya")`, new cover, palette changed; one cover layer after the crossfade |
| Layout | 1440 × 960, 1024 × 680, 950, 850, 640 and 560 px; zero horizontal overflow at every width |
| Breakpoints | 950: rail + 200 px art + 150 px cover; 850: single column, rail/art hidden; 560: cream waveform hidden, Play retained |
| Reduced motion | All four decorative CSS animations `none`; both canvases byte-identical after 600 ms |
| Titles | Long titles clamp to two lines with an ellipsis; no horizontal overflow |
| Errors | No page errors or console errors during the pass |

The title parser has nine focused cases in `scripts/test-hero.ts` (album groups, version groups, leading parentheses, eponymous albums). The browser pass is `node scripts/qa-hero.mjs`, which writes screenshots to `qa/hero/`. The same run records the player and hero artwork URLs, which matched on every track.

Known follow-ups for later brief phases: the mood grid, Home hero, shared artwork proxy and packaging sections are not part of this pass.

## Global shell and design tokens (unreleased, 15 November 2026)

The shell now uses the brief's token set: emerald `#10b981` as the default accent, `#090b0e` page background with `#12161c` surfaces, a 256 px expanded sidebar and a 96 px player. The 38 px title bar is gone from the app shell (`--titlebar-h: 0px`) and remains only on the splash/sign-in screen. Because the Electron window is frameless, the existing minimize/maximize/close buttons moved into a shared `WindowControls` component at the right edge of the top bar; the top bar is also the window drag region.

| Layer | Implementation |
| --- | --- |
| Tokens | `--accent #10b981`, `--accent-rgb 16, 185, 129`, `--bg #090b0e`, `--surface #12161c`, `--sidebar-w 256px`, `--player-h 96px`, `--titlebar-h 0px`, `--topbar-h 64px` |
| Window chrome | `WindowControls` is shared by the splash title bar and the shell top bar; the three 44 px buttons bleed to the window's right edge. Clicking maximize/restore changed the real `BrowserWindow` state |
| Drag regions | `.top-bar` computes `-webkit-app-region: drag`; search, buttons and window controls are `no-drag`. The onboarding top bar keeps a drag area |
| Fonts | Manrope (UI) and Bricolage Grotesque (display) are bundled variable WOFF2 files with their SIL OFL 1.1 texts in `src/assets/fonts`; no font is fetched at runtime |
| Accent contrast | The foreground is chosen from WCAG relative luminance instead of the old brightness cutoff; emerald resolves to dark ink `#04140d`. Saved user accents are untouched — only the new-install default changed |
| Rail / player | Sidebar expands to 256 px and collapses to 78 px; the top bar follows the rail. Player token and rendered height are both 96 px |
| Queue / Now Playing | The queue drawer starts at `y = 64`, flush with the top bar, and Now Playing covers the full window |

Checks used a fresh Electron profile and the production build:

| Check | Result |
| --- | --- |
| Tokens at 1440 × 960 | Accent `#10b981`, sidebar 256 px, player 96 px, title bar 0 px |
| Tokens at 1024 × 680 | Sidebar 232 px via the existing ≤1220 rule, player still 96 px, top bar and content overflow 0 |
| Window chrome | Splash title bar 38 px with three controls; shell top bar with the same three controls, close button flush to the right edge; maximize/restore passed |
| Fonts | `document.fonts.check()` true for both families; body resolves to Manrope, display headings to Bricolage Grotesque |
| Page smoke | Home, Explore and Search at 1024 px; Home, Explore, Library, Liked, Recently played and Downloads at 1440 px; Settings checked visually — zero document/content horizontal overflow where measured |
| Sidebar | Expanded 256 px → collapsed 78 px, top bar x follows; expanded again without layout loss |
| Queue drawer | Layer top 64 px = top bar bottom 64 px |
| Splash | Title bar and its three controls render above the React splash |
| Hero regression | `node scripts/qa-hero.mjs` remains green: idle, playing, pause, next-track switch, live canvases, one cover layer, reduced motion, no overflow |

`node scripts/qa-shell.mjs` writes `qa/shell/00-splash.png` through `06-search-1024.png`, plus the queue and collapsed-rail screenshots. The hero pass writes to `qa/hero/`.

Known follow-ups for the remaining brief phases: the mood grid, Home hero, shared artwork pipeline and packaging are unchanged by this pass.

## Mood grid, Home hero and artwork pipeline (unreleased, 15 November 2026)

This pass covers brief §8 (Explore mood grid), §9 (Home) and §12 (shared artwork pipeline). Fifteen real photos are bundled for the mood tiles, every mood tile opens a real YouTube Music browse endpoint, and Home gained the dynamic vibe stage plus the Jump Back In row. All artwork in the app now flows through one proxy with skeleton loading states.

| Layer | Implementation |
| --- | --- |
| Mood photos | 15 curated photos in `src/assets/moods` (~1.7 MB total): fourteen JPEGs resized to 900 px (quality 82) plus the Rawpixel CC0 sunrise kept at CDN 1024 px WebP. Sourced via Openverse from Flickr / Wikimedia Commons / Rawpixel, all CC0 or CC BY; attributions in `src/assets/moods/credits.json` and `docs/THIRD_PARTY.md` |
| Mood grid | `src/components/explore/MoodGrid.tsx` — 15 photo tiles in the brief's exact order (Punjabi → Feel good), aspect-ratio 1.72/1, min-height 104 px, radius 14 px, `rgba(255,255,255,.12)` border, gradient shade + feTurbulence noise overlay, hover lift −2 px with photo scale 1.045 and a sliding chevron. Header: "Browse all" eyebrow, "Moods & moments" title, muted subtitle and a "15 mixes" chip |
| Real endpoints | Every tile carries a real `FEmusic_moods_and_genres_category` `params` captured from the live `moods()` payload. Lo-fi and Focus/Study both map to the Focus category, Dhol dhol maps to Punjabi and Driving to Commute, matching the reference app's own shortcuts |
| Explore wiring | The grid renders below the Explore hero on the main tab only; the payload's small untitled 4-item mood strip is filtered out there. The "Moods & genres" tab keeps its payload behaviour |
| Artwork proxy | `auralis-media://image/<base64url>` in `electron/main.ts`: host allowlist (ytimg/googleusercontent/ggpht), YouTube Music referer + desktop UA, two attempts with a 350 ms backoff, memory + bounded disk cache (`userData/image-cache`, 800 files, pruned every 64 writes), CORS-wrapped 502 on failure so `Artwork` renders its fallback |
| Renderer helper | `proxiedArtwork()` in `src/lib/artwork.ts` passes through data:/already-proxied/local URLs, no-ops inside the Android shell and encodes with TextEncoder + btoa (Vite does not polyfill `Buffer`) |
| Artwork component | Skeleton shimmer while loading, 220 ms fade-in, error fallback with initials keyed on the resolved src, optional `eager` loading |
| Home vibe stage | `.home-vibe-stage`: 24 px radius, linear-gradient(90deg, rgba(6,51,40,.65), var(--surface) 72%), blurred backdrop (opacity .22, blur 40 px, scale 1.25), 384 px accent glow blob, 150 px artwork (radius 14), tagline / clamp(34-52 px) title / artist / album lines, Play pill + Start radio ghost, hero palette vars, 900 ms crossfade |
| Home idle | Greeting title (Good morning / afternoon / evening / Still up?) with the hero-thought sub-line, app icon in the art slot, no Jump Back In row when the library is empty |
| Jump Back In | Header with "Recent" chip, subtitle "Pick up right where you left your headphones.", refresh button wired to `refreshLibrary()` and "See all (n)"; up to 6 cards with 72 px artwork, mm:ss · artists sub-line and a hover play button. The retired Create-a-Mix card is gone |

Checks used a fresh Electron profile, the production build and the real YouTube Music service:

| Check | Result |
| --- | --- |
| Mood grid | 4 columns at 1440, exactly 15 tiles in order, aspect-ratio `1.72 / 1`, radius 14 px, noise + shade layers present, all photos loaded, chip "15 mixes" |
| Hover | Tile `translateY(-2px)`, photo `scale(1.045)`, chevron opacity 1 |
| Browse | Punjabi tile opened the real Punjabi browse page with 224 media cards |
| Home idle | `.is-idle`, tagline "Ready when you are", greeting title, thought sub-line, Play + Start radio, art radius 14 px |
| Home live | `.is-live`, blurred backdrop present, "LIVE RADIO · NO PLAN" tagline, title/artist/album from the real track, Pause + Start radio |
| Artwork consistency | Vibe stage, player bar and Now Playing all used the identical proxied `auralis-media://image/…` URL |
| Proxy behaviour | Valid ytimg URL → 200 image/jpeg with one `image-cache` file written under the profile; invalid video → 502 through the proxy and the `Artwork` fallback probe failed as expected |
| Quick access | Refresh button re-read the library; card survived with artwork; "See all (n)" navigates to Recently played |
| Compact 1024 × 680 | No horizontal overflow; Home and Explore render the compact stage/grid correctly |
| Breakpoints | Mood grid 3 columns ≤960 px, 2 columns ≤640 px; 950 / 850 / 640 / 560 px runs all had zero overflow |
| Regressions | `node scripts/qa-shell.mjs` and `node scripts/qa-hero.mjs` both green; typecheck and `npm run build` clean; Android assets rebuilt with the new CSP (`img-src … auralis-media:`) and all 15 mood photos bundled |

Screenshots: `qa/moods/01-mood-grid-1440.png` through `09-reduced-motion.png` (grid, browse, Home idle/live, Now Playing artwork, 1024 px, responsive widths). `node scripts/qa-moods.mjs` reproduces the run and returns `[issues] []`.

## Recommendation engine (unreleased, 15 November 2026)

The radio used to append raw YouTube pages — no repeat avoidance, no artist diversity, no personalisation, and it died the moment a station ran dry. This pass adds a local recommender ("Spotify-style ranking without an account") built on signals Auralis already records: play events (500-entry history with completed-vs-skipped flags and timestamps), liked songs, downloads and the recent list.

| Layer | Implementation |
| --- | --- |
| Taste profile (`src/lib/taste.ts`) | Artist affinity from weighted play events: completed +1.0, skipped −0.6, each decayed with a 14-day half-life; liked +2.5, download +1.5, recent +0.3. Skip-prone artists (≥3 plays, ≥60 % skipped, negative affinity) are excluded from radio. Song identity is normalised title+artist, so two uploads of one song dedupe |
| Radio curation | `curateRadioTracks()` shapes every radio page: no duplicates (id or song identity), nothing played in the last 7 days (liked exempt), skip-prone artists dropped, an artist at most 3 times per page, no back-to-back same-artist rows via a greedy pending buffer, and up to three loved-artist tracks anchoring the front of the page when the profile is strong |
| Re-seed fallback | When a station runs out (`appendRadioPage` → 'ended'), the session re-seeds from a different high-affinity profile seed, up to 2 consecutive re-seeds, instead of stopping playback with "The radio station has ended." |
| On repeat | Home shelf of the most-completed songs (completions × recency), rendered when there are ≥3 distinct finished tracks |
| Discover mix | Home shelf of 12 songs the listener has never played (filtered by song identity, not just video id), fetched from the real YouTube radio of a rotating top-affinity seed — the seed rotates daily, the shelf is cached 30 minutes per session and silently omitted when it builds nothing |
| Placement | "Made for you" shelves render between Jump Back In and YouTube's own shelves; both disappear entirely for fresh installs (no signals → no fake personalisation) |

Checks — 21 focused unit tests plus two live app passes:

| Check | Result |
| --- | --- |
| Unit (`npx tsx scripts/test-taste.ts`) | 21/21: identity dedupe, recency windows, skip detection, on-repeat ranking, seed diversity, loved anchors, adjacency break, artist cap, empty-profile passthrough |
| Profiled launch (synthetic `library.json`) | "On repeat" shelf with 4 cards ranked by completions; "Discover mix" with 12 picks, zero of them already-played songs |
| Radio quality | 42-track queue: no adjacent same-artist rows, no duplicate songs, skip-prone artist absent, all picks contextually relevant to the seed |
| Empty-profile regression | No made-for-you shelves; radio still appended 43 tracks |
| Regressions | `qa-moods.mjs` `[issues] []`; typecheck clean; Android assets rebuilt |

Screenshots: `qa/reco/01-home-madeforyou.png` (On repeat), `02-home-discover.png`, `03-radio-queue.png` (curated 43-track radio drawer). Reproduce with `npx tsx scripts/test-taste.ts` and `node scripts/qa-reco.mjs`.

Known limits: affinities are artist-level (YouTube exposes no genre/energy features locally); the Discover mix needs ≥6 fresh radio picks per fetch or it stays hidden; skip signals need ≥3 plays of an artist before they kick in.

## Search playback → related radio (15 November 2026)

Playing a song from search used to queue the other search results — for a Hindi search that meant same-name covers, remixes and live versions instead of what the listener actually wanted next. Search playback now always starts a related-songs radio from the picked track.

| Surface | Before | Now |
| --- | --- | --- |
| Songs rows (top 5 + Songs filter) | Radio (already shipped) | Unchanged — related radio from the picked song |
| Top result card | Queued that one song (or the page list) | `startRadio` — the picked song plus its related queue |
| Videos shelf cards | Queued the whole video shelf — this is where same-name variants came from | `radioOnPlay` on the shelf — a video card starts its own related radio |
| Albums / playlists in search results | Page queue | Unchanged (album context is the correct queue) |

Radio quality additions:

| Rule | Implementation |
| --- | --- |
| Same-name covers of the seed never queue | `curateRadioTracks` now takes the seed's normalised title + artist; any other upload of that same-named song (cover, lo-fi, sped-up, live) is dropped for the whole station |
| Re-seeds stay in the same style/language | `fallbackSeed` prefers tracks the session already played, so a Hindi station re-seeds into Hindi instead of jumping to another taste corner; profile seeds remain the second choice |
| Learning continues daily | The taste profile keeps feeding on completed plays, skips, likes and downloads with a 14-day half-life — loved artists anchor the front of every page and skip-prone artists disappear over time |
| Auto-continue | Queue end already seeded a radio from the last track (non-radio sessions) or continued the station (radio sessions); now verified end-to-end |

Checks — 24 focused unit tests plus a dedicated three-surface live pass:

| Check | Result |
| --- | --- |
| Unit (`npx tsx scripts/test-taste.ts`) | 24/24, including: same-name covers of the seed dropped, seed artist's own songs kept, filter off without seed context |
| Songs row (`kesariya`) | 44-row curated radio; none of the other 5 search results leaked into the queue |
| Auto-continue | End-key seek on the progress slider → song ended → `Tera Hone Laga Hoon` started on its own and kept playing |
| Top result (`tum hi ho arijit singh`) | 44-row radio of related Arijit/Aashiqui-2-era songs instead of a one-song queue |
| Video card (`kesariya brahmastra`) | 43-row radio; zero same-name variants of the seed; the rest of the video shelf was not queued |
| Regressions | `qa-reco.mjs` `[issues] []`; `qa-moods.mjs` `[issues] []`; typecheck clean; Android assets rebuilt |

Screenshots: `qa/search-radio/01-songs-row-radio.png` through `04-video-radio.png`. Reproduce with `npx tsx scripts/test-taste.ts` and `node scripts/qa-search-radio.mjs`.

## Playback start latency (2 November 2026)

The original resolver spawned `yt-dlp.exe` for every track. A fresh process costs **4.1–4.3 s** before the first audio byte, which is the spinner users saw after clicking a song. Six consecutive measurements:

| Track | Round 1 | Round 2 |
| --- | ---: | ---: |
| `dQw4w9WgXcQ` | 4,282 ms | 3,963 ms |
| `kJQP7kiw5Fk` | 4,241 ms | 4,298 ms |
| `9bZkp7q19f0` | 4,351 ms | 4,142 ms |

The resolver now asks the Innertube player endpoint for a direct audio URL first and keeps yt-dlp as the fallback. The first client is **VISIONOS** — the same client yt-dlp uses for music — because it returns full, un-capped audio when the request carries the anonymous session's `visitorData`. `ANDROID_VR` and `IOS` remain as secondary clients. The fast path also adds:

- a 90-minute per-track cache and in-flight de-duplication, so a hover prefetch and a click share one request;
- an open-ended `Range: bytes=0-` probe that reads only the response headers; this catches bot-flagged URLs that answer a 2-byte range but reject real playback;
- a per-track fast-failure cache and a two-minute cooldown after three consecutive failures;
- hover prefetch in track lists, plus the next-track prefetch scheduled before `play()` is awaited;
- removal of the redundant `audio.load()` call that restarted the media pipeline after `src` was set;
- a 900 ms delay before the transport shows a spinner, so a fast start shows the play state instead of flashing a loading spinner, while a real stall (slow yt-dlp fallback) still gets feedback;
- a Node-fetch fallback inside the `auralis-media://` proxy when Chromium's network stack drops a range request during a track switch. This was an intermittent stall where a new track sat on a spinner with no request retry.

Measured on the same Windows machine with a fresh profile (`node scripts/qa-latency.mjs`):

| Measurement | Before | After |
| --- | ---: | ---: |
| Innertube resolve | 4,142–4,351 ms (yt-dlp) | **292–653 ms** |
| Click → play button changes to Pause | — | **476–568 ms** |
| Click → first audio position advance | 7,517 ms | **1,126–1,317 ms** |
| Hover-prefetched click → play button | — | **165–228 ms** |
| Hover-prefetched click → first audio | — | **804–971 ms** |
| Spinner shown while a fast start is resolving | Always | **Never** |
| Console/HTTP errors during playback | 403 from the media proxy, then yt-dlp fallback | **None** |

The 7,517 ms "before" figure includes the failed fast-path URL followed by the yt-dlp retry. The fast path was originally handing out iOS URLs that returned `403` through the media proxy; VISIONOS with `visitorData` returns a playable full stream instead, so the fallback is no longer on the normal path. Evidence: [`qa/latency/results.json`](../qa/latency/results.json).

Four consecutive runs on the final build kept the same shape: 476–568 ms to the play state, 1.13–1.32 s to the first second of audio and 165–228 ms on a hover-prefetched click, with no spinner visible while starting. One of those runs hit the Chromium range-request failure described above; the Node fallback recovered it and the renderer saw no HTTP error.

**Known limits:** the fast path needs a populated anonymous `visitorData`; the app fetches it from the music homepage when Home has not supplied one. If YouTube bot-flags the current IP, all mobile clients can return `LOGIN_REQUIRED` and the app intentionally falls back to yt-dlp rather than showing an unplayable URL. VISIONOS also excludes "made for kids" videos; those use the yt-dlp fallback.

## Test environment

Tests were run against the real YouTube Music service, not fixtures. Each Playwright run used a fresh `--user-data-dir` and a fresh download directory, so a previous login, queue or library could not mask a failure.

| Setting | Value |
| --- | --- |
| App build | `release/1.1.1/win-unpacked/Auralis.exe` for the latency patch; `release/1.1.0/win-unpacked/Auralis.exe` for the 1.1.0 baseline sections |
| Packaged app version | `1.1.1` (patch), `1.1.0` (baseline) |
| Bundled yt-dlp | `2026.10.21` |
| Bundled FFmpeg | `9.0.2-essentials_build` |
| DB / accounts | None; local JSON stores |
| Network | Direct connection, no proxy for QA |

## Automated scripts

| Script | What it covers |
| --- | --- |
| `npm run typecheck` | Renderer, preload and main TypeScript projects |
| `npm run build` | esbuild main/preload and Vite renderer |
| `npm run test:api` | Live Innertube home, search, next, lyrics, Explore and Charts parsers |
| `node scripts/qa-play.mjs` | Live search, playback, Now Playing, lyrics, album and artist details |
| `node scripts/qa-extra.mjs` | Live download, local playlist editing, podcast list, themes, EQ and radio |
| `node scripts/qa-moods.mjs` | Moods & genres tiles and category navigation |
| `node scripts/qa-signin-probe.mjs` | Signed-out sidebar account card, Settings → Account navigation, a visible Chrome sign-in window with Auralis's dedicated profile and no DevTools port, Google form render, cancel toast, headless cookie read, dedicated-profile cleanup, cookie dialog, 1024 × 680 layout and a disposable fake-cookie adoption run |
| `node scripts/qa-full.mjs` | 21 live end-to-end checks: home, Explore, search filters, playback, likes, related-song radio and queue-end autoplay, detail pages, queue edit, sleep timer, local playlists, download/offline play, settings, lyrics, now playing, history, downloads page and restart persistence |
| `node scripts/podcast-filter-qa.mjs` | Podcast In progress / Unplayed / Played chips, clear-on-second-click, Latest menu sorting, combined sort + filter and empty state |
| `node scripts/identify-ui-qa.mjs` | Opens the Identify dialog in Now Playing mode after a real track starts, then checks the Shazam match |
| `node scripts/onboarding-qa.mjs` | Two-step language → artist flow, multi-select, real artist loading and filtering, persistence, Home shelf, Settings edit round-trip and 1024 × 680 overflow |
| `node scripts/home-hero-qa.mjs` | Greeting removal, ten-minute thought slot, song/state-based thought changes, now-playing artwork card, Open player and compact layout |
| `npx tsx scripts/test-thought.ts` | Thought rotation between slots, song/mood variation, placeholder filling, daypart boundaries and title trimming |
| `node scripts/qa-latency.mjs` | Playback latency: direct resolve timing, click → play button, click → first audio, and hover-prefetch effect; writes `qa/latency/results.json` |
| `node scripts/qa-hero.mjs` | Explore featured-track hero: idle state, live title/artist/album/artwork/palette, hero Play/Pause, track switch cover crossfade, canvas response, 1440 × 960 / 1024 × 680 / 950 / 850 / 640 / 560 layouts and reduced motion |
| `npx tsx scripts/test-hero.ts` | Hero title parser: album groups, version groups, leading parentheses, eponymous albums and dash versions |
| `node scripts/qa-sleep.mjs` | Focused sleep-timer countdown, simulated expiry, toast, end-of-track option and off |
| `node scripts/qa-packaged.mjs` | Packaged EXE launch, app info, playback, download, moods, podcast API |
| `node scripts/qa-upgrade.mjs` | 1.1.0 focused upgrade checks: splash layers, hidden scrollbars, mini-player seek, Queue-first panel, lyrics view switch, quality reload, Media Session, Jump Back In, search-history removal, EQ/bass boost, translation language and keyless setup error |
| `node scripts/qa-portable-cdp.mjs [exe]` | Starts a portable or installed EXE, connects over CDP, verifies home and bundled tools, then cleans up its own profile |
| `node scripts/qa-download-debug.mjs` | Focused download progress and file verification |

The full-suite home check retries a transient live-service failure through the app's own **Try again** control before it fails the run.

Run the packaged check after `npm run dist`:

```powershell
node scripts/qa-packaged.mjs
```

## Packaged EXE — final 1.1.0 result

Launch: `release/1.1.0/win-unpacked/Auralis.exe` built from the final source, with the app's bundled binaries and icon resources.

```text
[packaged info] {"name":"Auralis","version":"1.1.0","electron":"45.0.0",
  "ytDlpVersion":"2026.10.21","ffmpegAvailable":true,
  "downloadsDir":"C:\\Users\\rv888\\Music\\Auralis"}
[packaged home] {"shelves":6,"cards":112}
[packaged playback] {"title":"Kesariya (From \"Brahmastra\")",
  "playerTitle":"Kesariya (From \"Brahmastra\")",
  "playerArtist":"Arijit Singh","playerTime":"0:11",
  "playerError":"","playing":true}
[packaged radio] {"rows":50,"radio":1}
[packaged download] {"status":"done",
  "path":"...\\NJAv_7lHUIU.m4a","exists":true,"size":4338550}
[packaged moods] {"cards":50}
[packaged podcast] {"title":"The Daily","episodes":20}
[packaged issues] []
```

The download was a real 4.34 MB M4A file produced by the bundled yt-dlp. The player advanced to 0:11 with the pause control visible and no error text. The radio check queued 50 related rows, the podcast check returned the real 20-episode list for "The Daily", and moods rendered all 50 navigation tiles.

## Focused 1.1.0 upgrade result

`node scripts/qa-upgrade.mjs` launched the packaged 1.1.0 EXE with a fresh profile and passed all 16 checks:

| Check | Observed |
| --- | --- |
| Cold-start animation | 13 layers rendered, then the splash cleared into Home |
| Hidden scrollbars | `scrollbar-width: none`, `overflow-y: auto`; scrolling stayed enabled |
| Mini-player progress | Enabled rail with `max=268.16`, then a seek to 1:34 of 4:28 |
| Queue-first Now Playing | Queue tab selected with 50 rows |
| Lyrics view switch | Playback still reported Pause (playing) |
| Streaming quality | High (256 kbps) persisted and playback resumed |
| Media Session | Title matched the player bar and state was `playing` |
| Jump Back In | Real-history carousel, 2 cards, `overflow-x: auto` |
| Search history removal | 1 → 0 entries, confirmed through a fresh `library.get()` |
| EQ + bass boost | Equalizer enabled; Bass preset persisted `[6,5,4,2,0,-1,-1,0,1,2]` with `bassBoost: 5`, `bassFrequency: 80` and `limiter: true`; the slider then persisted 8 dB |
| Translation language | Hindi (HI) persisted in settings |
| Keyless translation | Real setup error from the backend, no fake translation: “Configure a DeepL API key or an OpenAI-compatible endpoint in Settings → Lyrics.” |

Machine-readable output: [`qa/upgrade-results.json`](../qa/upgrade-results.json). Screenshots: [`qa/upgrade-splash.png`](../qa/upgrade-splash.png) and [`qa/upgrade-settings.png`](../qa/upgrade-settings.png).

## Portable EXE — final 1.1.0 result

The portable build was started directly, allowed to finish unpacking, then inspected over the Chromium debugging protocol:

```text
[portable] {"name":"Auralis","version":"1.1.0","electron":"45.0.0",
  "ytDlpVersion":"2026.10.21","ffmpegAvailable":true,
  "shelves":6,"cards":112}
```

This confirms that the portable stub unpacks and launches the same app, the home feed loads, and the bundled yt-dlp/FFmpeg resources are present. The QA script closes the app through its own API and then terminates only processes belonging to its isolated test profile. A follow-up process check confirmed that no Auralis processes were left running.

## Silent install — final 1.1.0 result

The 1.1.0 NSIS installer was installed silently into a temporary directory:

```text
installer exit: 0
Auralis.exe: present
Uninstall Auralis.exe: present
resources/bin/yt-dlp.exe, ffmpeg.exe: present
registry: Auralis [e5728c7e-3e5e-5138-8034-c30069bad0ea]
```

The installed executable was then launched with a separate test profile:

```text
[installed] {"name":"Auralis","version":"1.1.0","electron":"45.0.0",
  "ytDlpVersion":"2026.10.21","ffmpegAvailable":true,
  "shelves":6,"cards":122}
```

The installed app was closed through its API and uninstalled silently. The uninstaller exited 0, the temporary installation folder was removed, and no Auralis registry entry remained.

## Feature checks

The `qa-full` pass executed 21 checks and all 21 passed. The tables below record the broader feature evidence from the full, packaged and installed runs.

On the unreleased tree the suite's filter helper waits out the previous filter's cards before reading the newly selected tab. The app keeps the old results mounted for a frame while the next live search starts; without that settle the playback check could read a slow Songs request too early and time out. The rebuilt tree passed 21/21 again (`qa/full/final-regression.log`); the only logged issues were the expected external artwork 404s.

### Discovery

| Check | Expected | Observed |
| --- | --- | --- |
| Anonymous home | Shelves and playable cards | 6 shelves, 109 cards in the final packaged run; 107 in the full pass |
| Search | Live suggestions and results | Typed a real query and received real songs |
| Songs filter | Live songs with artists and durations | Pass |
| Explore | New releases, popular episodes, trending, videos | Pass |
| Charts | Video, language and artist charts | Pass |
| New releases | Fresh album grid | 128 live items |
| Moods & genres | Mood and genre navigation | 50 tiles across two shelves |
| Mood category | Opens a browse page | "Chill" loaded 13 shelves |
| Album detail | Header, tracks, related shelves | Pass |
| Artist detail | Top songs, releases, artwork | Pass |
| Playlist detail | Tracks and metadata | Pass |
| Podcast detail | Episode list with durations | 20 episodes, 9h 50m total |
| Search continuation | Extra pages merged | Pass, duplicates removed |

### Playback

| Check | Expected | Observed |
| --- | --- | --- |
| Stream resolution | Innertube VISIONOS fast path returns direct audio; yt-dlp fallback | Pass; 292–653 ms resolve, 1.13–1.32 s to first audio |
| Audio start | Player time advances | 0:05 in the final packaged run |
| Pause/play control | Reflects playing state | Pause control visible |
| Seek | Position changes | Pass |
| Queue | Current track and next tracks | Pass |
| Queue editing | Reorder and remove upcoming tracks | Pass |
| Sleep timer | Presets, countdown, automatic pause, end-of-track and off | Pass |
| Radio and related autoplay | Search pick seeds a station; queue end continues with related songs | Search pick produced a 50-track Hindi station; after clearing upcoming and pressing Next, the app started "Chaleya" with 49 related rows. Continuation pages were exercised live. |
| Lyrics | Synced lyrics from LRCLIB/YouTube | Pass; synced highlight and scrolling |
| EQ | Ten bands and preamp update | Pass; state persisted |
| Playback rate | Applied live | Pass |
| Theme switch | Light/Black/Dark applied | Pass |
| Media keys/tray | Registered without error | Pass |

### Related autoplay

- A search for `Tainu Khabar Nahi` returned 20 song rows. Clicking the first row started that song and built a 50-track radio queue from it, instead of queuing the other search results.
- Clearing the upcoming queue and pressing Next on the last track seeded a new station from that track. The player moved to `Chaleya` with 49 related rows still queued.
- A live probe of the same Hindi seed returned Hindi recommendations from the first page and from the continuation page. The station is seed-based, so it keeps the seed's language and scene instead of mixing in unrelated catalogue results.
- Radio continuation tokens are kept in player state and persisted, so a restored radio queue can keep fetching related songs when it reaches the end.

### Downloads and local library

| Check | Expected | Observed |
| --- | --- | --- |
| Download progress | `downloading` then `done` | Pass |
| File on disk | Real audio file | 4,338,550 bytes M4A |
| Downloads page | Completed entry with size | Pass |
| Download removal | File deleted | Pass |
| Local playlist create | New playlist appears | Pass |
| Add two tracks | Both tracks present | Pass |
| Reorder | Order changes and persists | Pass |
| Remove | Track removed | Pass |
| Search history | Queries recorded | Pass |
| Liked songs | Heart state and library entry | Pass |

### Packaging

| Check | Expected | Observed |
| --- | --- | --- |
| Main/preload bundles | Written to `dist-electron` | Pass |
| Renderer | Written to `dist` | Pass |
| `app.asar` | Contains app code | 4,810,645 bytes |
| Icons | Present in packaged resources and match source | `icon.png`, `tray.png` |
| Executable icon | Supplied Auralis mark embedded | 32x32 icon extracted from EXE and installer |
| Binaries | Present in packaged resources | `bin/yt-dlp.exe`, `bin/ffmpeg.exe` |
| NSIS installer | Produces Setup EXE | 159,342,036 bytes |
| Portable | Produces single EXE | 145,878,108 bytes |
| Packaged launch | Home renders | Pass |
| Packaged playback | Audio from bundled tools | Pass |
| Packaged download | File via bundled tools | Pass |
| Portable launch | Unpacks and renders Home | Pass |
| Portable resources | yt-dlp and FFmpeg available | Pass |
| Silent install | Installs without error to temp folder | Pass |
| Installed app launch | Home and bundled tools work | Pass |
| Silent uninstall | Removes folder and shortcuts | Pass |

### Branding

The supplied Auralis artwork is the only logo used in the release:

- `resources/logo.png` is the full green `AURALIS` lockup used by the README.
- `resources/icon.png` is the 512px black app tile built from the supplied green "A" play mark and soundwave arcs; `resources/icon-256.png` and `public/icon.png` are derived from it.
- `resources/tray.png` is the transparent mark used by the Windows tray.
- The packaged `resources/icon.png` and `resources/tray.png` hashes match the source files. The 32x32 icon extracted from `Auralis.exe`, `Auralis-Setup-1.1.0.exe` and `Auralis-Portable-1.1.0.exe` is the supplied mark.
- Branding asset hashes: `icon.png` `3E9F4FA978D9E9FE6971325EAED16D03A0A1728A7A4F519D32E12332C41F7279`; `tray.png` `6445D58E3336166CAAA5EAD5CD5BBD8ABF425DB9E4AC647F61ACFA66EBA868AA`.

## Build artifacts

| File | Size | SHA-256 |
| --- | --- | --- |
| `Auralis-Setup-1.1.0.exe` | 159,342,036 bytes | `56dbda7842ae4093e7f400fd3ca7efdb388613e0bb9a72fc19e21da235839faa` |
| `Auralis-Portable-1.1.0.exe` | 145,878,108 bytes | `df68a549782dfc67d69832a878a288b25d30f4025f0135c79b9cc033e3d01032` |

The same hashes are written to `release/1.1.0/SHA256SUMS.txt`.

> The hashes above belong to the **published** v1.1.0 assets. The playback-latency patch ships separately as 1.1.1 below; the 1.1.0 files were not replaced.

### 1.1.1 — playback latency patch

| File | Size | SHA-256 |
| --- | --- | --- |
| `Auralis-Setup-1.1.1.exe` | 159,369,064 bytes | `66aa6a44cdf8a04414ec03398baadb0d59312cb97463ce0f37b10e53684565a6` |
| `Auralis-Portable-1.1.1.exe` | 145,879,754 bytes | `cb6aaba9911a1bed4f86186acb5c220c37e08d104b1b254fccf5da7b9a71302a` |

The same hashes are written to `release/1.1.1/SHA256SUMS.txt`.

### 1.1.4 — sign-in system

| File | Size | SHA-256 |
| --- | --- | --- |
| `Auralis-Setup-1.1.4.exe` | 152,471,751 bytes | `1105ACCC8A04C3C956A27E127FE45C875D11E546183457AC2CB62EE9B3AAA722` |
| `Auralis-Portable-1.1.4.exe` | 139,804,954 bytes | `591A22EC3860593ABAADEE6F16786AC6D58BD8703E15934783DF9CDCB36F8127` |

The same hashes are written to `release/1.1.4/SHA256SUMS.txt`.

Built locally with `npx electron-builder --win nsis --publish never` (Setup) and `npx electron-builder --win portable --publish never` (portable); nothing was uploaded to GitHub. `package.json` lists both `nsis` and `portable` x64 targets, so `npm run dist` builds both, but a single `--win` run yields a larger portable (145.17 MB) than the portable-only run (133.33 MB), so the release is built as two separate commands. Packaged smoke test on `release/1.1.4/win-unpacked/Auralis.exe`:

```text
[packaged info] {"name":"Auralis","version":"1.1.4","electron":"45.0.0",
  "ytDlpVersion":"2026.10.21","ffmpegAvailable":true}
[packaged home] {"shelves":6,"cards":122}
[packaged playback] {"title":"Kesariya (From \"Brahmastra\")",
  "playerTime":"0:11","playerError":"","playing":true}
[packaged radio] {"rows":43,"radio":1}
[packaged download] {"status":"done","exists":true,"size":4338550}
[packaged moods] {"cards":49}
[packaged podcast] {"title":"The Daily","episodes":20}
[packaged issues] []
```

`AURALIS_PACKAGED_EXE=release\1.1.4\win-unpacked\Auralis.exe node scripts/qa-signin-probe.mjs` also passes with `[issues] []`, covering the sidebar card, Settings → Account, the visible no-CDP Chrome window on the dedicated profile, the Google form, the headless cookie read, the cancel toast and the fake-cookie adoption mechanics in the packaged build.

The portable EXE was launched manually with a fresh `--user-data-dir`; it unpacked to `%TEMP%`, opened the real `Auralis` window and created its session. Playwright cannot attach to the portable bootstrap, so the automated packaged checks run against `win-unpacked`.

Re-run on the rebuilt 1.1.4 artifacts (21 November 2026, temp profile): version 1.1.4, 6 Home shelves / 122 cards, Kesariya playback at 0:11 with no player error, radio 43 rows, download 4.34 MB, 50 mood cards, The Daily 20 episodes, `[packaged issues] []`.

### 1.1.3 - performance and package size

| File | Size | SHA-256 |
| --- | --- | --- |
| `Auralis-Setup-1.1.3.exe` | 152,471,723 bytes | `6C0DFB4DC26845ECAA2E7A0C6737307758E2493E9D3FC3AA6D64F78115303B3D` |
| `Auralis-Portable-1.1.3.exe` | 139,802,706 bytes | `AB9D5D63449AD6F560774DB758F989DC56B075DC6125D141A42B285C6CAC36D2` |

Built from `main` with `npx electron-builder --win portable` and `npx electron-builder --win nsis` as two separate runs (see the packaging note above; a combined run gives a 145.17 MB portable). The portable is 133.33 MB, down from 140.89 MB, and the installer is 145.41 MB, down from 153.81 MB. Packaged smoke on `release/1.1.3/win-unpacked/Auralis.exe` with a temp profile: version 1.1.3, 6 shelves / 122 cards, Kesariya playback at 0:11 with no player error, radio 43 rows, download 4.34 MB, 50 mood cards, The Daily 20 episodes, `[packaged issues] []`.

Packaged smoke test on `release/1.1.1/win-unpacked/Auralis.exe`:

```text
[packaged info] {"name":"Auralis","version":"1.1.1","electron":"45.0.0",
  "ytDlpVersion":"2026.10.21","ffmpegAvailable":true}
[packaged home] {"shelves":6,"cards":122}
[packaged playback] {"title":"Kesariya (From \"Brahmastra\")",
  "playerTime":"0:11","playerError":"","playing":true}
[packaged download] {"status":"done","exists":true,"size":4338550}
[packaged moods] {"cards":50}
[packaged podcast] {"title":"The Daily","episodes":20}
[packaged issues] []
```

The portable build launched under CDP with a fresh profile and reported version `1.1.1`, six shelves, 112 cards and the bundled yt-dlp/FFmpeg.

## Known limitations and unverified paths

These are not mocked or faked; they are implemented calls that require credentials or a specific target to verify:

| Path | Why it was not live-verified | What to check manually |
| --- | --- | --- |
| Playback fast path | The Innertube VISIONOS/Android/iOS player endpoints are unofficial and can be bot-flagged per IP; the fast path also needs the anonymous session's `visitorData` | Run with `AURALIS_DEBUG_STREAM=1`; `[streams] fast path` means the direct URL was used, `[streams] fast path failed` falls back to yt-dlp. Signing in or changing network clears a persistent bot flag. |
| Google account sign-in | A real Google login needs the user's password and any 2FA challenge; the visible window, no-CDP launch, title detection, graceful close and headless cookie-adoption mechanics were verified with disposable fake cookies | Settings → Account → Sign in; finish the Google form in the visible Chrome window (first time asks for password/2FA), confirm name/avatar, then open Library → YouTube Music |
| YouTube Music likes/ratings | Needs a signed-in account | Like a song, check music.youtube.com; dislike and clear rating |
| Remote playlist editing | Needs a signed-in account and a playlist owned by the user | Create, rename, add, remove and delete a playlist |
| Subscribe/unsubscribe | Needs a signed-in account | Follow an artist and check YouTube Music |
| Cloud library and history | Needs a signed-in account | Open Library → YouTube Music and History |
| Last.fm | Needs the user's API key, secret and authorisation | Connect, play a track past 50%, check the Last.fm profile |
| Discord Rich Presence | Needs a Discord application id and running client | Enable, play a track, inspect the profile activity |
| Lyrics translation | Needs an OpenAI or DeepL key | The keyless setup error and target-language persistence were verified; enter a key, run Test translation, then open a synced song |
| Shazam recognition | Needs a known audio sample or microphone input | Use Identify on a track with a clean intro |
| YouTube captions fallback | The official transcript endpoint returns HTTP 400; needs a captioned video | Play a video with captions and open Lyrics → YouTube captions |
| Android runtime | The merged Android shell compiles (`typecheck:android`, `build:android`) and its web assets were regenerated, but this Windows QA pass did not run an Android device/emulator build | Build the APK in `android/` and smoke-test playback, notifications and downloads on a device; the remote `v1.0.3-android` release remains the device-tested baseline |

The transcript endpoint issue is external: YouTube Music returns HTTP 400 for that request shape. The yt-dlp VTT fallback is implemented and fails gracefully.

### Features not implemented in 1.1.0

These reference-client features have no working implementation in the current Windows build. They are listed here so the parity claim stays accurate; they are not hidden toggles or stubs.

| Feature | Status | Why it is not in 1.1.0 |
| --- | --- | --- |
| Voice search | Not implemented | No speech-recognition engine or service is configured; the search bar is typed-only. |
| Music video playback | Not implemented | The resolver and player are audio-only; video metadata is displayed but no video pipeline exists. |
| Playlist migration / import | Not implemented | Public playlists can be opened and saved as a local copy, but importing arbitrary external playlists needs provider APIs or authorised export files. |
| Encrypted app-private downloads | Not implemented | Downloads are plain M4A files in the chosen folder; app-private encrypted storage needs a storage/decryption redesign and a licensing review. |
| Notification Like action | Not applicable | Windows Media Session exposes transport, metadata and position, but not a standard custom Like action. |
| Skip silence | Not implemented | Requires silence detection and automatic seek on top of the single HTML5 audio pipeline. |
| Crossfade | Not implemented | Overlapping two tracks needs a dual-audio mixer; Auralis uses one audio element. |
| Independent pitch | Not implemented | Playback speed uses the browser's pitch-preserving rate; a separate pitch control is not exposed. |
| Listen Together | Not implemented | Needs a realtime relay service and a shared-session protocol; Auralis has no backend. |

## Manual account checklist

Use a throwaway or personal test account, not shared credentials.

1. **Settings → Account → Sign in** opens a real Chrome window with Auralis's own profile; finish the Google form there and the account name appears.
2. **Library → YouTube Music** lists cloud playlists and liked music.
3. Like a song in Auralis, then refresh music.youtube.com and confirm the like.
4. Dislike a song and confirm the rating on the website; clear it again.
5. Create a playlist in Auralis from a track menu; confirm it appears on YouTube Music.
6. Add and remove a track from that playlist; confirm the order on the website.
7. Follow an artist and confirm the subscription.
8. Open **History** and confirm recent listens appear.
9. Sign out and confirm the local library, likes and downloads remain.
10. Reopen the app and confirm the anonymous session still browses normally.

## Evidence

Screenshots are stored in `qa/` and selected product screenshots in `docs/screenshots/`.

| Evidence | File |
| --- | --- |
| Cold-start animation | `qa/upgrade-splash.png` |
| 1.1.0 settings/EQ/translation | `qa/upgrade-settings.png` |
| Packaged home | `qa/packaged-home.png` |
| Packaged final state | `qa/packaged-final.png` |
| Moods & genres | `qa/full/02-explore-moods.png`, `docs/screenshots/moods.png` |
| Live playback | `qa/full/04-playing.png` |
| Now Playing + lyrics | `docs/screenshots/now-playing.png` |
| Album detail | `docs/screenshots/album.png` |
| Artist detail | `docs/screenshots/artist.png` |
| Podcast | `docs/screenshots/podcast.png` |
| Podcast filters | `qa/podcast-filter-unplayed.png`, `qa/podcast-filter-empty.png`, `qa/podcast-sort-menu.png` |
| Identify result | `qa/identify-result.png` |
| Home thought + now-playing card | `qa/home-hero-playing.png` |
| Home empty now-playing state | `qa/home-hero-empty.png` |
| Explore hero, idle at 1440 × 960 | `qa/hero/01-idle-1440.png` |
| Explore hero, playing at 1440 × 960 | `qa/hero/02-playing-1440.png` |
| Explore hero, paused at 1440 × 960 | `qa/hero/03-paused-1440.png` |
| Explore hero, next track at 1440 × 960 | `qa/hero/04-switched-1440.png` |
| Explore hero, 1024 × 680 minimum | `qa/hero/05-compact-1024.png` |
| Explore hero, 950 / 850 / 640 / 560 breakpoints | `qa/hero/07-responsive-*.png` |
| Explore hero, reduced motion | `qa/hero/08-reduced-motion-1440.png` |
| Onboarding, language step | `qa/onboarding-languages.png` |
| Onboarding, artist step | `qa/onboarding-artists.png` |
| Onboarding, Home artist shelf | `qa/onboarding-home-artists.png` |
| Onboarding, Settings preferences | `qa/onboarding-settings.png` |
| Sign-in, sidebar card signed out | `qa/signin/01-sidebar-signed-out.png` |
| Sign-in, 1024 × 680 minimum | `qa/signin/02-sidebar-1024x680.png` |
| Sign-in, Settings → Account tab | `qa/signin/03-account-tab.png` |
| Sign-in, real Chrome window | `qa/signin/04-chrome-window.png` |
| Sign-in, cancelled toast | `qa/signin/05-signin-cancelled.png` |
| Sign-in, cookie dialog | `qa/signin/06-cookie-dialog.png` |
| Sign-in, adopted-session mechanics | `qa/signin/07-mechanics-signed-in.png` |
| Glass UI, light theme at 1440 px | `qa/glass-light-home-1440.png` |
| Glass UI, light theme at 1024 px | `qa/glass-light-home-1024.png` |
| Glass UI, light settings | `qa/glass-light-settings.png` |
| Redesign, empty Home at 1440 × 960 | `qa/redesign-home-empty-1440.png` |
| Redesign, playing Home at 1440 × 960 | `qa/redesign-home-playing-1440.png` |
| Redesign, Now playing & queue drawer | `qa/redesign-queue-1440.png` |
| Redesign, 1024 × 680 minimum window | `qa/redesign-home-1024.png` |
| Redesign, light theme + Emerald at 1440 × 960 | `qa/redesign-light-emerald-1440.png` |
| Redesign, light queue drawer | `qa/redesign-light-queue-1440.png` |
| Redesign, dark theme + Emerald at 1440 × 960 | `qa/redesign-dark-emerald-1440.png` |
| Redesign, light theme at 1024 × 680 | `qa/redesign-light-emerald-1024.png` |
| Downloads | `qa/packaged-downloads.png`, `docs/screenshots/downloads.png` |
| Settings | `docs/screenshots/settings.png` |

## Reproducing a clean run

```powershell
npm install
npm run typecheck
npm run typecheck:android
npm run build
npm run build:android
npm run dist
node scripts/qa-latency.mjs
node scripts/qa-full.mjs
node scripts/podcast-filter-qa.mjs
node scripts/identify-ui-qa.mjs
node scripts/onboarding-qa.mjs
node scripts/qa-moods.mjs
node scripts/qa-signin-probe.mjs
npx tsx scripts/test-taste.ts
node scripts/qa-reco.mjs
node scripts/qa-search-radio.mjs
node scripts/home-hero-qa.mjs
npx tsx scripts/test-thought.ts
node scripts/qa-packaged.mjs
node scripts/qa-upgrade.mjs
```

The packaged QA script creates its own temporary profile and download folder, so it does not touch your normal Auralis library, queue, account or downloads.
