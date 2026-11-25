# Linux QA record

This record covers the Linux x64 port of Auralis 1.0.2. Results are recorded as
`pass`, `fail`, `blocked` or `untested`. A feature is only marked `pass` after it
was exercised in a real Linux session.

## Environment

| Item | Value |
| --- | --- |
| Distribution | Ubuntu 26.04 LTS |
| Session | GNOME Wayland with XWayland available (`DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-0`) |
| Architecture | x86_64 |
| Electron | 45.0.0 |
| Chromium | 156.0.8078.48 |
| Node used for build | 24.22.1 (temporary toolchain) |
| npm | 11.19.1 |
| Audio | PipeWire |
| Keyring | GNOME Keyring / libsecret (`gnome_libsecret`) |
| Tray host | Ubuntu AppIndicator extension (`ubuntu-appindicators@ubuntu.com`); `org.kde.StatusNotifierWatcher` owned by `gnome-shell` |
| Display scaling | 100% for automated desktop runs; 125% reference comparison by logical geometry (see [Screenshots](#screenshots)) |

### How automated QA was launched

Unpackaged builds were launched with Playwright. The host's AppArmor policy
requires a test-only sandbox flag for the unpackaged Electron binary:

```bash
AURALIS_QA_NO_SANDBOX=1 node scripts/qa-full.mjs
```

This flag is read by the QA scripts only. It is not part of the product. The
AppImage was launched without an explicit test flag; its AppRun launcher may
add `--no-sandbox` itself (see the sandbox limitation below).

The Linux QA scripts write to `qa/linux` so they do not overwrite the Windows
screenshots in `qa/`. Set `AURALIS_QA_SHOTS` to override the output directory.

The focused desktop audits ignore clicks on the custom titlebar close button.
That guard is test-only: without it, outside pointer input can close the visible
test window and end an unattended run. It is not present in release builds.

## Build gates

| Check | Status | Evidence |
| --- | --- | --- |
| `npm ci` in Linux worktree | pass | 397 packages installed; Linux Electron/esbuild/sharp binaries |
| `npm run typecheck` | pass | Renderer and Electron TypeScript projects |
| `npm run build` | pass | Main, preload and Vite renderer bundles |
| `npm run verify:tools:linux` | pass | yt-dlp 2026.10.21, FFmpeg 7.0.2-static |
| `electron-builder --linux` | pass | AppImage and `.deb` produced |
| Linux binary staging | pass | `resources/bin/yt-dlp`, `resources/bin/ffmpeg`, mode 0755 |
| Packaged resource validation | pass | `scripts/after-pack.cjs` found both binaries and license files |

Final artifact checksums from the last build:

```
bda7076e8985e140b9af177ff494bd3db6acd5e089aaff9a2bd9a1b125f71d66  Auralis-1.0.2-x86_64.AppImage
ed3165d54702b2427242bae2f75c363b1b76f4d7c6cc86070a31d53e747a0e2b  Auralis-1.0.2-amd64.deb
```

The original Windows release artifacts in the source checkout were not rebuilt
or overwritten; their SHA-256 values still match `docs/QA.md`.

The focused page audit found a renderer crash in the **More options** menu on an
artist detail page. The subscribe item passed a React element where the
context-menu renderer expects a lucide component, producing React error #130.
`src/pages/Detail.tsx` now passes `BellOff`/`Bell` directly. Typecheck, build,
packaging and the rebuilt artist/album/playlist/podcast menu probe passed with no
renderer errors.

## Post-QA fixes and regression checks

A second review found several Linux-only edge cases that did not appear in the
main workflow. They were fixed without changing Windows behaviour, the visual
design or the public settings:

| Issue | Fix | Verification |
| --- | --- | --- |
| Tray availability was false whenever the tray setting was off, so Settings wrongly said no tray host existed | Tray capability is now tracked separately from the tray setting; the host is probed at startup even when the icon is disabled, and `app.info()` is refreshed after tray/settings changes | Isolated source runs: tray off + host present -> `trayAvailable:true`, no warning, close-to-tray disabled; tray on -> close-to-tray enabled; fake failing `busctl` -> `trayAvailable:false`, warning shown, close-to-tray disabled; no renderer issues |
| Close-to-tray could be enabled when no tray host existed, silently quitting on close | The toggle is disabled when `appInfo.trayAvailable === false`; the explanatory note appears only when the tray setting is enabled | Same no-host run; toggle disabled and warning rendered |
| `app.info()` synchronously created the download folder, so an unavailable network/FUSE path could block startup | Folder creation is asynchronous in `ensureDownloadsDir()`; startup prepares it in the background; `app.info()` only reports the configured path | Launch with `downloadDir:/proc/auralis-nope` (the path that previously hung); `app.info()` resolved, home rendered, no startup hang or renderer error |
| Restart used `app.exit(0)` without flushing debounced settings | `app.relaunch` now calls `flushStores()` first; AppImage relaunch resolves `setsid` from `/usr/bin`, `/bin`, then `PATH` | Source, AppImage and extracted `.deb` restarts all preserved a just-changed light theme; AppImage and `.deb` started a new process; settings file remained `0600` |
| `settings.json`, `library.json` and `session.json` were created with default permissions; `settings.json` can contain API secrets and `session.json` may contain plaintext cookies when no keyring is available | JSON stores are created and rewritten with mode `0600`; existing files are restricted at load; temp files are restricted before rename | Test run set a Last.fm secret and a session cookie; `settings.json` and `session.json` both reported `0600` |
| Shazam passed `--ffmpeg-location .` when the resolver returned the system command `ffmpeg`, and its temporary cookie file used default permissions | `--ffmpeg-location` is passed only for an absolute FFmpeg path; the temporary cookie file is written with mode `0600` | Code review only: recognition still needs a microphone or audio sample and was not exercised live |

## End-to-end QA

`scripts/qa-full.mjs` exercises the live service through the real UI. The final
run used the rebuilt packaged `linux-unpacked` binary and passed all checks with
no JavaScript/page errors and no console issues. The unpackaged build was also
run after the fixes and passed 21/21.

| Check | Status | Detail |
| --- | --- | --- |
| Home hero and shelves | pass | 6 shelves, 122 cards |
| Explore / Charts / New / Moods | pass | 5, 3, 1 and 2 shelves; 49 mood cards |
| Search filters | pass | 26 results; Songs 5, Videos 3, Albums 3, Artists 3, Playlists 6, Podcasts 6 |
| Song playback | pass | Tera Yaar Hoon Main started and advanced to 0:01 |
| Likes and library | pass | Like/unlike round trip |
| Related radio/autoplay | pass | 50 rows, queue advanced to a related track |
| Album detail | pass | Tracks rendered, back navigation |
| Artist detail | pass | 9 shelves |
| Playlist detail | pass | 50 rows (live playlist) |
| Podcast detail | pass | 20 episodes |
| Queue reorder/remove | pass | Reordered and removed upcoming tracks |
| Sleep timer | pass | Set, expired, paused and cleared |
| Local playlist create/add/reorder/remove | pass | Full round trip |
| Download and offline playback | pass | 3,048,719-byte `.m4a` downloaded and played from disk |
| Settings tabs and theme persistence | pass | All tabs, light/dark switch persisted |
| Lyrics provider | pass | LyricsPlus returned real lyrics |
| Now Playing queue tab | pass | Queue row rendered |
| Search history | pass | 6 chips |
| Downloads page | pass | 1 row, 3 stats |
| Signed-out account UI | pass | Sign-in affordance opens safely |
| Restart persistence | pass | Queue title and theme restored after restart |

**Result: 21/21 checks passed, 0 failed. No JavaScript/page errors and no console
issues in the final packaged run.**

One earlier packaged attempt hit YouTube's anonymous anti-bot check and a remote
429; a second attempt passed 21/21 but logged one transient media-stream 502.
The final rerun above was clean. These are live-service/network responses, not
application exceptions, and no product code was changed to make the checks pass.

The sleep-timer check starts a fresh track and waits up to 45 seconds for it to
reach `Pause`, retrying the row click if the first attempt is still buffering.
A focused sleep probe on the rebuilt package also passed. The final full run
above is the accepted result; no product code was changed to make the check
pass.

## Focused desktop and workflow audits

Three focused Playwright audits ran against the rebuilt `linux-unpacked`
binary with isolated profiles, explicit native Wayland
(`--ozone-platform=wayland`) and the test-only close-button guard. They
supplement the 21-check catalogue suite.

| Audit | Result | Coverage |
| --- | --- | --- |
| Desktop controls, settings, windows and keyboard | pass 16/16 | Window minimize/maximize/restore/double-click; sidebar collapse and persistence; back/forward/account/search focus; suggestions/history/clear; identify dialog; General, Appearance, Playback & EQ, Lyrics, Downloads, Integrations, Account and About tabs; settings reset; restart affordance; Space/M/L/Q/arrows/Ctrl+,/Alt+Left shortcuts; toast dismissal |
| Player, queue, Now Playing and context menus | pass 7/7 | Transport, shuffle/repeat/next/previous, seek/volume/mute/sleep timer, like/lyrics/queue/more, Now Playing tabs/details/like/playlist, queue reorder/remove/clear, track and card context menus, download and show-downloaded-file |
| Page workflows | pass 8/8 | Home hero/quick actions/shelves/scroll/Show all; Explore tabs; search top result/filters/detail links; library playlist create/rename/delete; liked play/shuffle; recent clear; downloads filters/play/menu/open-folder/clear; album/artist/playlist detail actions/menus; podcast episodes/playback |

These focused audits were run before the post-QA tray/settings/download fixes.
The changed paths were rechecked by the targeted regression runs and the final
21-check packaged suite; the full focused set was not repeated.

The page audit covered 6 home shelves and 122 cards; Explore rendered 50
Charts, 131 new-release, 49 mood and 96 Explore cards; search returned 20 Songs,
20 Videos, 20 Albums, 3 Artists, 20 Playlists and 11 Podcasts; the podcast
detail rendered 20 episodes. These are live catalogue counts and vary between
runs. The home **Show more**, Explore genre-chip and search **Load more**
controls were absent for this live response; their absence is not a failure.
The page audit clicked the top-result play control; transport itself is covered
by the player audit.

Downloads **Open folder** was invoked with the OS handoff stubbed, and
copy-link was checked through the app toast and Electron clipboard. External
`xdg-open`/system-clipboard behavior is listed under Known items.

## Packaged application

| Check | Status | Detail |
| --- | --- | --- |
| `linux-unpacked` launch | pass | With test-only `--no-sandbox` |
| Packaged full suite | pass | 21/21 checks, no JavaScript/page errors or console issues |
| Packaged home/network | pass | 6 shelves, 122 cards |
| Packaged playback | pass | Tera Yaar Hoon Main started and advanced to 0:01 |
| Packaged radio | pass | 50 rows |
| Packaged download | pass | 3,048,719-byte `.m4a`, exists on disk |
| Packaged moods/podcast | pass | 49 cards, 20 episodes |
| Bundled tool resolution | pass | yt-dlp 2026.10.21, FFmpeg available |
| AppImage launch | pass | Default X11 path; 6 shelves/122 cards and artist More menu |
| AppImage streaming playback | pass | Post-fix probe: Tera Yaar Hoon Main reached Pause/playing state with no console issues |
| AppImage download | pass | Earlier AppImage downloaded a 3,048,719-byte `.m4a` and created writable `userData/bin/yt-dlp`; the changed download-folder path was re-verified on the final packaged `linux-unpacked` run |
| AppImage offline playback | pass | Earlier AppImage played the downloaded track from disk; the offline media path was not changed |
| Rebuilt AppImage smoke | pass | 6 shelves/122 cards and artist More menu; one Kesariya attempt hit YouTube's anonymous anti-bot check, then Tera Yaar Hoon Main played cleanly |
| Rebuilt `.deb` extracted smoke | pass | Default X11; 6 shelves/122 cards and artist More menu; Tera Yaar Hoon Main played with no console issues |
| AppImage relaunch | pass | Post-fix: new AppImage process started; just-changed light theme persisted; `settings.json` mode `0600` |
| `.deb` build | pass | `release/Auralis-1.0.2-amd64.deb` |
| `.deb` extracted launch | pass | `dpkg-deb -x`; home, search and streaming playback |
| `.deb` extracted relaunch | pass | Post-fix: standard `app.relaunch`; new process started and light theme persisted |
| `.deb` install/launch | blocked | Requires `sudo`; not installed on this host |
| `.deb` dependency resolution | pass (simulated) | `apt-get -s install ./Auralis-1.0.2-amd64.deb` resolves; Ubuntu 26.04 `t64` packages provide `libgtk-3-0` and `libatspi2.0-0`. No install was performed |

### Relaunch detail

The post-fix tests launched each packaged executable with an isolated profile,
changed the theme, invoked the same `app:relaunch` IPC used by **Settings →
General → Restart now**, and then checked for a new process and the persisted
theme. The AppImage relaunch helper waits for the old process to exit before
launching the outer AppImage, because the inner mount path is removed during
teardown. It now resolves `setsid` from `/usr/bin`, `/bin`, or `PATH` instead of
assuming `/usr/bin/setsid` exists.

Both packaged variants started a new process. The AppImage and extracted `.deb`
runs reported `theme: "light"` and `mode: "600"` after restart.

## Desktop integration

| Check | Status | Detail |
| --- | --- | --- |
| Keyring backend | pass | `gnome_libsecret` logged at startup |
| Session cookie encryption | untested | Requires signing in with an account |
| MPRIS metadata | pass | Title, artist and length exposed for the playing track |
| MPRIS play/pause | pass | `busctl` PlayPause changed the UI to Play, then back to Pause |
| Hardware media keys | untested | Requires a physical keyboard/session test |
| Tray host detection | pass | AppIndicator host found; `trayAvailable: true` |
| Tray state with tray disabled | pass | Tray setting off while host present still reported `trayAvailable: true`; no false missing-host warning |
| Tray item registration | pass | `:1.399@/StatusNotifierItem`, status `Active`, icon `status_icon_0` |
| Close-to-tray | pass | Window hidden, process remained alive |
| Restore after close-to-tray | pass | A second launch restored the existing window through the single-instance handler |
| Tray context menu / double-click | untested | Menu labels and double-click handler were not automated |
| Tray fallback (no host) | pass | Fake failing `busctl`; `trayAvailable: false`; close-to-tray disabled and warning shown |
| Close without a tray | pass | With close-to-tray enabled, closing the window quit the process |
| Window controls / drag | pass (visual) | 1440×920 frameless window and controls render; drag/resize not automated |
| Edge resize | untested | Needs a dedicated pointer test on X11 and Wayland |
| X11 rendering | pass | Default XWayland path; QA screenshots |
| AppImage sandbox | limitation | electron-builder's AppImage desktop entry passes `--no-sandbox`; AppRun also adds it when user namespaces are unavailable. The `.deb` post-install logic retains the Chromium sandbox (SUID `chrome-sandbox` fallback) |
| Native Wayland rendering | pass (focused) | `--ozone-platform=wayland` passed the focused controls (16/16), player (7/7) and page (8/8) audits, including the native-framed Google sign-in window; those audits ran before the post-QA fixes, whose changed tray/settings paths were rechecked separately. The full 21-check suite used the default XWayland path |
| Local store permissions | pass | `settings.json` and `session.json` mode `0600` after writing a secret and a cookie |
| Downloads path failure isolation | pass | Invalid `/proc/auralis-nope` path did not block startup or `app.info()` |
| Relaunch settings flush | pass | Source, AppImage and extracted `.deb` preserved a just-changed theme |
| Fonts | pass | CDP platform-font check: Selawik for UI, Cascadia Code for monospace |
| 100% scaling | pass | 1440×920 and 1442×864 logical captures |
| 125% reference comparison | pass (layout) | Windows 1803×1080 reference normalized to 1442×864; moods and settings near-identical |

### Font evidence

The computed family lists Selawik as the fallback, and Chromium's platform-font
query confirms it is the font actually rasterized:

| Element | Computed family | Actual platform font |
| --- | --- | --- |
| Home hero | `Segoe UI Variable Display, Segoe UI, Selawik, …` | Selawik (custom) |
| Title bar brand | `Segoe UI Variable Display, Segoe UI, Selawik, …` | Selawik (custom) |
| Sidebar item | `Segoe UI Variable Text, Segoe UI, Selawik, …` | Selawik (custom) |
| Search field | `Segoe UI Variable Text, Segoe UI, Selawik, …` | Selawik (custom) |
| Player title/time | `Segoe UI Variable Text, Segoe UI, Selawik, …` | Selawik (custom) |
| About version badge | `Cascadia Code, Cascadia Mono, …` | Cascadia Code (custom) |

`document.fonts` reported all three Selawik faces loaded and Cascadia Code
loaded when the About badge was rendered.

## Integrations and permissions

| Check | Status | Reason |
| --- | --- | --- |
| YouTube Music login/session restore | blocked | No account credentials supplied |
| Last.fm auth/scrobble | blocked | No API key/account supplied |
| Discord Rich Presence | blocked | No Discord application ID/client |
| Translation (DeepL/OpenAI) | blocked | No API keys |
| Shazam recognition | blocked | No microphone/sample in automated run. The post-QA fixes make system-FFmpeg lookup and temporary-cookie permissions safe; this path was code-reviewed, not exercised live |
| Sign-in window opens/closes | pass | Native-framed Google sign-in window opened and closed safely; no credentials entered |
| Microphone permission dialog copy | untested | No interactive microphone test |
| File chooser | untested | Not exercised in automated run |
| Open downloads folder | untested | `xdg-open` handoff not exercised |
| Notifications | untested | Not exercised |
| yt-dlp in-app update | pass | **Settings → About → Update yt-dlp** completed, produced a success toast and reported the updated version; writable `userData/bin/yt-dlp` copy was used |

## Screenshots

Linux captures are in `qa/linux`; the Windows reference screenshots in
`docs/screenshots` were not modified.

- `qa/linux/01-home.png` … `13-settings-about.png` — 1440×920 layout pass
- `qa/linux/full/` — final 21-check packaged `linux-unpacked` sequence and `results.json`
- `qa/linux/pages/` — focused page-workflow captures (home, Explore, search,
  library, liked, downloads, detail and podcast)
- `qa/linux/packaged-home.png`, `packaged-downloads.png`, `packaged-final.png`
- `qa/linux/compare-1803/` — 1803×1080 captures at 100% logical scale
- `qa/linux/compare-125/` — 1442×864 logical captures and side-by-side
  comparisons against the 1803×1080 Windows references

The Windows references are 1803×1080. Their UI geometry corresponds to a
1442×864 logical viewport at 125% scaling. For the fair layout comparison, the
Windows reference was reduced to 1442×864 and compared with a 1442×864 Linux
capture. Mean absolute pixel error and the share of pixels differing by more
than 20/255:

| Screen | MAE | Pixels >20 | Notes |
| --- | --- | --- | --- |
| Moods & genres | 2.50 | 3.4% | Same live mood cards; font rasterization only |
| Settings | 2.51 | 3.1% | Same layout; Linux wording in the General card |
| Now Playing | 13.33 | 16.8% | Different track/cover/lyrics content |
| Home | 18.91 | 18.5% | Different live shelves and greeting |

These are layout comparisons, not claims of pixel-identical output. The UI uses
the bundled Selawik fallback on Linux instead of Segoe UI, so glyph rasterization
will differ even when geometry matches.

## Known failures and open items

1. `.deb` installation needs a host with `sudo`. Dependency resolution was
   simulated with `apt-get -s install` and passed; no package was installed.
2. Login/session restore, Last.fm, Discord, translation and Shazam need
   credentials or media samples.
3. Tray context-menu items and double-click were not automated; the tray item,
   close-to-tray, second-instance restore and no-host fallback were verified.
4. The AppImage desktop launcher disables Chromium's sandbox
   (`--no-sandbox`); use the `.deb` when sandbox isolation matters. This is
   electron-builder's AppImage behavior, not an Auralis feature choice.
5. Native Wayland passed the focused controls (16/16), player (7/7) and page
   (8/8) audits, including the native-framed Google sign-in window. The full
   21-check suite was run on the default XWayland path; a native-Wayland full
   run was not repeated.
6. OS-level 125%/150% desktop scaling was not changed; the 125% comparison uses
   matching logical geometry and a normalized Windows reference.
7. Hardware media keys, the native file chooser, notifications and `xdg-open`
   remain untested. The in-app yt-dlp update passed.
8. The MPRIS D-Bus service is Chromium-branded
   (`org.mpris.MediaPlayer2.chromium.instance<pid>`), not Auralis-branded.
9. Windows runtime regression needs a Windows host. Static typecheck/build
   against shared code passed on Linux, but no Windows executable was run.
10. Copy-link actions show the success toast and update Electron's clipboard.
    Pasting into a separate native-Wayland application was not verified; the
    external clipboard readers used by the harness did not consistently see
    the new value while the test window was unfocused.
11. Anonymous YouTube requests can intermittently receive anti-bot/429
    responses. One packaged run hit this; a later packaged run passed 21/21
    cleanly. This is live-service behaviour, not a Linux application error.
12. Shazam's system-FFmpeg argument handling and temporary-cookie permissions
    were hardened from code review but not exercised with a real audio sample.

No Windows runtime result is claimed.
