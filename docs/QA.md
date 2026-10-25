# Quality assurance record

**Build:** Auralis 1.0.2
**Platform:** Windows 11 x64 (build 10.0.26300)
**Electron:** 45.0.0
**Node:** 24.19.0
**Test date:** 25 October 2026
**Live catalogue:** YouTube Music anonymous session

## Summary

| Area | Result |
| --- | --- |
| TypeScript typecheck | Pass |
| Production renderer build | Pass |
| Branding | Pass (supplied Auralis logo in app, installer, portable, title bar, splash, tray and README) |
| Full end-to-end UI QA | Pass (21/21 checks) |
| Sleep timer | Pass |
| NSIS installer build | Pass |
| Portable build | Pass |
| Packaged EXE launch | Pass |
| Portable EXE launch | Pass |
| Silent install + installed app launch + uninstall | Pass |
| Live playback from packaged EXE | Pass |
| Live download from packaged EXE | Pass |
| Moods & genres | Pass (49 tiles) |
| Podcast episodes | Pass (20 episodes) |
| Themes, EQ, settings | Pass |
| Browser/page errors during final pass | None |

The final full-app pass and the packaged smoke test both produced no `pageerror` or console-error entries. The QA watcher ignores the expected `ERR_ABORTED` reported when the media proxy cancels the previous track's range request during a track switch.

## Test environment

Tests were run against the real YouTube Music service, not fixtures. Each Playwright run used a fresh `--user-data-dir` and a fresh download directory, so a previous login, queue or library could not mask a failure.

| Setting | Value |
| --- | --- |
| App build | `release/win-unpacked/Auralis.exe` |
| Packaged app version | `1.0.2` |
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
| `node scripts/qa-full.mjs` | 21 live end-to-end checks: home, Explore, search filters, playback, likes, related-song radio and queue-end autoplay, detail pages, queue edit, sleep timer, local playlists, download/offline play, settings, lyrics, now playing, history, downloads page and restart persistence |
| `node scripts/qa-sleep.mjs` | Focused sleep-timer countdown, simulated expiry, toast, end-of-track option and off |
| `node scripts/qa-packaged.mjs` | Packaged EXE launch, app info, playback, download, moods, podcast API |
| `node scripts/qa-portable-cdp.mjs [exe]` | Starts a portable or installed EXE, connects over CDP, verifies home and bundled tools, then cleans up its own profile |
| `node scripts/qa-download-debug.mjs` | Focused download progress and file verification |

The full-suite home check retries a transient live-service failure through the app's own **Try again** control before it fails the run.

Run the packaged check after `npm run dist`:

```powershell
node scripts/qa-packaged.mjs
```

## Packaged EXE â€” final result

Launch: `release/win-unpacked/Auralis.exe` built from the final source, with the app's bundled binaries and icon resources.

```text
[packaged info] {"name":"Auralis","version":"1.0.2","electron":"45.0.0",
  "ytDlpVersion":"2026.10.21","ffmpegAvailable":true,
  "downloadsDir":"C:\\Users\\rv888\\Music\\Auralis"}
[packaged home] {"shelves":6,"cards":122}
[packaged playback] {"title":"Kesariya (From \"Brahmastra\")",
  "playerTitle":"Kesariya (From \"Brahmastra\")",
  "playerArtist":"Arijit Singh","playerTime":"0:04",
  "playerError":"","playing":true}
[packaged radio] {"rows":50,"radio":1}
[packaged download] {"status":"done",
  "path":"...\\NJAv_7lHUIU.m4a","exists":true,"size":4338550}
[packaged moods] {"cards":49}
[packaged podcast] {"title":"The Daily","episodes":20}
[packaged issues] []
```

The download was a real 4.34 MB M4A file produced by the bundled yt-dlp. The player advanced to 0:04 with the pause control visible and no error text. The radio check queued 50 related rows, the podcast check returned the real 20-episode list for "The Daily", and moods rendered all 49 navigation tiles.

## Portable EXE â€” final result

The portable build was started directly, allowed to finish unpacking, then inspected over the Chromium debugging protocol:

```text
[portable] {"name":"Auralis","version":"1.0.2","electron":"45.0.0",
  "ytDlpVersion":"2026.10.21","ffmpegAvailable":true,
  "shelves":6,"cards":122}
```

This confirms that the portable stub unpacks and launches the same app, the home feed loads, and the bundled yt-dlp/FFmpeg resources are present. The QA script closes the app through its own API and then terminates only processes belonging to its isolated test profile. A follow-up process check confirmed that no Auralis processes were left running.

## Silent install â€” final result

The 1.0.2 NSIS installer was installed silently into a temporary directory:

```text
installer exit: 0
Auralis.exe: present
Uninstall Auralis.exe: present
resources/bin/yt-dlp.exe, ffmpeg.exe: present
```

The installed executable was then launched with a separate test profile:

```text
[installed] {"name":"Auralis","version":"1.0.2","electron":"45.0.0",
  "ytDlpVersion":"2026.10.21","ffmpegAvailable":true,
  "shelves":6,"cards":122}
```

The installed app was closed through its API and uninstalled silently. The uninstaller exited 0, the temporary installation folder was removed, and no Auralis registry entry, shortcut or process remained.

## Feature checks

The `qa-full` pass executed 21 checks and all 21 passed. The tables below record the broader feature evidence from the full, packaged and installed runs.

### Discovery

| Check | Expected | Observed |
| --- | --- | --- |
| Anonymous home | Shelves and playable cards | 6 shelves, 122 cards in the final packaged run |
| Search | Live suggestions and results | Typed a real query and received real songs |
| Songs filter | Live songs with artists and durations | Pass |
| Explore | New releases, popular episodes, trending, videos | Pass |
| Charts | Video, language and artist charts | Pass |
| New releases | Fresh album grid | 133 live items |
| Moods & genres | Mood and genre navigation | 49 tiles across two shelves |
| Mood category | Opens a browse page | "Chill" loaded 13 shelves |
| Album detail | Header, tracks, related shelves | Pass |
| Artist detail | Top songs, releases, artwork | Pass |
| Playlist detail | Tracks and metadata | Pass |
| Podcast detail | Episode list with durations | 20 episodes, 9h 50m total |
| Search continuation | Extra pages merged | Pass, duplicates removed |

### Playback

| Check | Expected | Observed |
| --- | --- | --- |
| Stream resolution | Bundled yt-dlp returns audio | Pass |
| Audio start | Player time advances | 0:04 in the final packaged run |
| Pause/play control | Reflects playing state | Pause control visible |
| Seek | Position changes | Pass |
| Queue | Current track and next tracks | Pass |
| Queue editing | Reorder and remove upcoming tracks | Pass |
| Sleep timer | Presets, countdown, automatic pause, end-of-track and off | Pass |
| Radio and related autoplay | Search pick seeds a station; queue end continues with related songs | Search pick produced a 50-track Hindi station; after clearing upcoming and pressing Next, the app started "Apna Bana Le" with 49 related rows. Continuation pages were exercised live. |
| Lyrics | Synced lyrics from LRCLIB/YouTube | Pass; synced highlight and scrolling |
| EQ | Ten bands and preamp update | Pass; state persisted |
| Playback rate | Applied live | Pass |
| Theme switch | Light/Black/Dark applied | Pass |
| Media keys/tray | Registered without error | Pass |

### Related autoplay

- A search for `Tainu Khabar Nahi` returned 5 song rows. Clicking the first row started that song and built a 50-track radio queue from it, instead of queuing the other search results.
- Clearing the upcoming queue and pressing Next on the last track seeded a new station from that track. The player moved to `Apna Bana Le (From "Bhediya")` with 49 related rows still queued.
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
| `app.asar` | Contains app code | 2.6 MB |
| Icons | Present in packaged resources and match source | `icon.png`, `tray.png` |
| Executable icon | Supplied Auralis mark embedded | 32x32 icon extracted from EXE and installer |
| Binaries | Present in packaged resources | `bin/yt-dlp.exe`, `bin/ffmpeg.exe` |
| NSIS installer | Produces Setup EXE | 158,300,663 bytes |
| Portable | Produces single EXE | 145,354,641 bytes |
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
- The packaged `resources/icon.png` and `resources/tray.png` hashes match the source files. The 32x32 icon extracted from `Auralis.exe`, `Auralis-Setup-1.0.2.exe` and `Auralis-Portable-1.0.2.exe` is the supplied mark.
- Branding asset hashes: `icon.png` `3E9F4FA978D9E9FE6971325EAED16D03A0A1728A7A4F519D32E12332C41F7279`; `tray.png` `6445D58E3336166CAAA5EAD5CD5BBD8ABF425DB9E4AC647F61ACFA66EBA868AA`.

## Build artifacts

| File | Size | SHA-256 |
| --- | --- | --- |
| `Auralis-Setup-1.0.2.exe` | 158,300,663 bytes | `07CCAFBF5906D32C35125CCB405600A53F30C57E43B32DEC4DA56A81BA53739E` |
| `Auralis-Portable-1.0.2.exe` | 145,354,641 bytes | `FDEAF92AA87E596027D11CA2B33F004CF511269F42D035350504A95A6BD2EDC0` |

The same hashes are written to `release/SHA256SUMS.txt`.

## Known limitations and unverified paths

These are not mocked or faked; they are implemented calls that require credentials or a specific target to verify:

| Path | Why it was not live-verified | What to check manually |
| --- | --- | --- |
| Google sign-in | Requires the user's Google account and may be challenged by Google | Settings â†’ Account â†’ Sign in; confirm name/avatar, then open Library â†’ YouTube Music |
| YouTube Music likes/ratings | Needs a signed-in account | Like a song, check music.youtube.com; dislike and clear rating |
| Remote playlist editing | Needs a signed-in account and a playlist owned by the user | Create, rename, add, remove and delete a playlist |
| Subscribe/unsubscribe | Needs a signed-in account | Follow an artist and check YouTube Music |
| Cloud library and history | Needs a signed-in account | Open Library â†’ YouTube Music and History |
| Last.fm | Needs the user's API key, secret and authorisation | Connect, play a track past 50%, check the Last.fm profile |
| Discord Rich Presence | Needs a Discord application id and running client | Enable, play a track, inspect the profile activity |
| Lyrics translation | Needs an OpenAI or DeepL key | Enable auto-translate and open a synced song |
| Shazam recognition | Needs a known audio sample or microphone input | Use Identify on a track with a clean intro |
| YouTube captions fallback | The official transcript endpoint returns HTTP 400; needs a captioned video | Play a video with captions and open Lyrics â†’ YouTube captions |

The transcript endpoint issue is external: YouTube Music returns HTTP 400 for that request shape. The yt-dlp VTT fallback is implemented and fails gracefully.

### Features not implemented in 1.0.2

These reference-client features have no working implementation in the current Windows build. They are listed here so the parity claim stays accurate; they are not hidden toggles or stubs.

| Feature | Status | Why it is not in 1.0.2 |
| --- | --- | --- |
| Skip silence | Not implemented | Requires silence detection and automatic seek on top of the single HTML5 audio pipeline. |
| Crossfade | Not implemented | Overlapping two tracks needs a dual-audio mixer; Auralis uses one audio element. |
| Independent pitch | Not implemented | Playback speed uses the browser's pitch-preserving rate; a separate pitch control is not exposed. |
| Playlist import by URL | Not implemented | Public playlists can be opened and saved as a local copy from their detail page, but pasting an arbitrary playlist URL into the local library is not built. |
| Listen Together | Not implemented | Needs a realtime relay service and a shared-session protocol; Auralis has no backend. |

## Manual account checklist

Use a throwaway or personal test account, not shared credentials.

1. **Settings â†’ Account â†’ Sign in** completes in the embedded window and the account name appears.
2. **Library â†’ YouTube Music** lists cloud playlists and liked music.
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
| Packaged home | `qa/packaged-home.png` |
| Packaged final state | `qa/packaged-final.png` |
| Moods & genres | `qa/full/02-explore-moods.png`, `docs/screenshots/moods.png` |
| Live playback | `qa/full/04-playing.png` |
| Now Playing + lyrics | `docs/screenshots/now-playing.png` |
| Album detail | `docs/screenshots/album.png` |
| Artist detail | `docs/screenshots/artist.png` |
| Podcast | `docs/screenshots/podcast.png` |
| Downloads | `qa/packaged-downloads.png`, `docs/screenshots/downloads.png` |
| Settings | `docs/screenshots/settings.png` |

## Reproducing a clean run

```powershell
npm install
npm run typecheck
npm run build
npm run dist
node scripts/qa-packaged.mjs
```

The packaged QA script creates its own temporary profile and download folder, so it does not touch your normal Auralis library, queue, account or downloads.
