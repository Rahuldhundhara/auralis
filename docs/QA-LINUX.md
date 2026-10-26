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
b4daf6711d5679d9a6d2b5f85ba4603c273d6a8884fe09f48bac2aee45848363  Auralis-1.0.2-x86_64.AppImage
8ee164e330c9c552c6d9fd22c4d0addd9af2ada54d926d75959e66411bb004e8  Auralis-1.0.2-amd64.deb
```

The original Windows release artifacts in the source checkout were not rebuilt
or overwritten; their SHA-256 values still match `docs/QA.md`.

The focused page audit found a renderer crash in the **More options** menu on an
artist detail page. The subscribe item passed a React element where the
context-menu renderer expects a lucide component, producing React error #130.
`src/pages/Detail.tsx` now passes `BellOff`/`Bell` directly. Typecheck, build,
packaging and the rebuilt artist/album/playlist/podcast menu probe passed with no
renderer errors.

## End-to-end QA

`scripts/qa-full.mjs` exercises the live service through the real UI. The final
run passed all checks with no JavaScript/page errors and no console issues.

| Check | Status | Detail |
| --- | --- | --- |
| Home hero and shelves | pass | 6 shelves, 122 cards |
| Explore / Charts / New / Moods | pass | 5, 3, 1 and 2 shelves; 49 mood cards |
| Search filters | pass | 26 results; Songs 5, Videos 3, Albums 20, Artists 10, Playlists 20, Podcasts 3 |
| Song playback | pass | Playback started and advanced |
| Likes and library | pass | Like/unlike round trip |
| Related radio/autoplay | pass | 50 rows, queue advanced to a related track |
| Album detail | pass | Tracks rendered, back navigation |
| Artist detail | pass | 9 shelves |
| Playlist detail | pass | 27 rows (live playlist) |
| Podcast detail | pass | 20 episodes |
| Queue reorder/remove | pass | Reordered and removed upcoming tracks |
| Sleep timer | pass | Set, expired, paused and cleared |
| Local playlist create/add/reorder/remove | pass | Full round trip |
| Download and offline playback | pass | 3,048,719-byte `.m4a` downloaded and played from disk |
| Settings tabs and theme persistence | pass | All tabs, light/dark switch persisted |
| Lyrics provider | pass | LyricsPlus returned real lyrics |
| Now Playing queue tab | pass | Queue rows rendered |
| Search history | pass | 6 chips |
| Downloads page | pass | Rows and stats |
| Signed-out account UI | pass | Sign-in affordance opens safely |
| Restart persistence | pass | Queue title and theme restored after restart |

**Result: 21/21 checks passed, 0 failed. No JavaScript/page errors.**

An earlier full run logged one non-fatal remote artwork 404 from
`yt3.googleusercontent.com`; the final run above was clean. The 404 is live
catalogue content, not an application exception.

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
| Packaged home/network | pass | 6 shelves, 122 cards |
| Packaged playback | pass | Kesariya, 0:08 progress, no player error |
| Packaged radio | pass | 50 rows |
| Packaged download | pass | 4,343,026-byte `.m4a`, exists on disk |
| Packaged moods/podcast | pass | 49 cards, 20 episodes |
| Bundled tool resolution | pass | yt-dlp 2026.10.21, FFmpeg available |
| AppImage launch | pass | Default X11 path; home and live catalogue |
| AppImage streaming playback | pass | Kesariya started, 0:02 progress, no player error |
| AppImage download | pass | 3,048,719-byte `.m4a`, writable `userData/bin/yt-dlp` created |
| AppImage offline playback | pass | Downloaded track played from disk |
| Rebuilt AppImage smoke | pass | Native Wayland; 6 shelves/122 cards, Kesariya playback and artist More menu; immediate rerun had no console issues (one earlier attempt hit a transient remote 403) |
| Rebuilt `.deb` extracted smoke | pass | Default X11; 6 shelves/122 cards, Kesariya playback and artist More menu; no console issues |
| AppImage relaunch | pass | New AppImage process and new X11 window after restart (verified before the renderer fix; relaunch code unchanged) |
| `.deb` build | pass | `release/Auralis-1.0.2-amd64.deb` |
| `.deb` extracted launch | pass | `dpkg-deb -x`; home, search, streaming playback (one earlier attempt hit a transient live-service 403; immediate rerun passed) |
| `.deb` extracted relaunch | pass | Standard `app.relaunch`; new process and home window (verified before the renderer fix; relaunch code unchanged) |
| `.deb` install/launch | blocked | Requires `sudo`; not installed on this host |
| `.deb` dependency resolution | pass (simulated) | `apt-get -s install ./Auralis-1.0.2-amd64.deb` resolves; Ubuntu 26.04 `t64` packages provide `libgtk-3-0` and `libatspi2.0-0`. No install was performed |

### AppImage relaunch detail

The test connected to the running AppImage over CDP, invoked the same
`app:relaunch` IPC used by **Settings → General → Restart now**, and then checked
for a new process and a new window owned by that process:

```
before pids: [27870, 27874, 27913, 27917, 27965, 28001]
after pids:  [28007, 28036, 28076, 28079, 28126, 28151]
after windows: [ { id: '0xa00003', pid: 28007 } ]
RELAUNCH PASS
```

The old process exited, the new process became ready, and the new X11 window was
present. The outer AppImage is restarted from a detached helper that waits for
the old process to exit before launching, because the inner mount path is
removed during teardown.

## Desktop integration

| Check | Status | Detail |
| --- | --- | --- |
| Keyring backend | pass | `gnome_libsecret` logged at startup |
| Session cookie encryption | untested | Requires signing in with an account |
| MPRIS metadata | pass | Title, artist and length exposed for the playing track |
| MPRIS play/pause | pass | `busctl` PlayPause changed the UI to Play, then back to Pause |
| Hardware media keys | untested | Requires a physical keyboard/session test |
| Tray host detection | pass | AppIndicator host found; `trayAvailable: true` |
| Tray item registration | pass | `:1.399@/StatusNotifierItem`, status `Active`, icon `status_icon_0` |
| Close-to-tray | pass | Window hidden, process remained alive |
| Restore after close-to-tray | pass | A second launch restored the existing window through the single-instance handler |
| Tray context menu / double-click | untested | Menu labels and double-click handler were not automated |
| Tray fallback (no host) | pass | Fake failing `busctl`; `trayAvailable: false` |
| Close without a tray | pass | With close-to-tray enabled, closing the window quit the process |
| Window controls / drag | pass (visual) | 1440×920 frameless window and controls render; drag/resize not automated |
| Edge resize | untested | Needs a dedicated pointer test on X11 and Wayland |
| X11 rendering | pass | Default XWayland path; QA screenshots |
| AppImage sandbox | limitation | electron-builder's AppImage desktop entry passes `--no-sandbox`; AppRun also adds it when user namespaces are unavailable. The `.deb` post-install logic retains the Chromium sandbox (SUID `chrome-sandbox` fallback) |
| Native Wayland rendering | pass (focused) | `--ozone-platform=wayland` passed the focused controls (16/16), player (7/7) and page (8/8) audits, including the native-framed Google sign-in window; the full 21-check suite used the default XWayland path |
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
| Shazam recognition | blocked | No microphone/sample in automated run |
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
- `qa/linux/full/` — final 21-check sequence and `results.json`
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

No Windows runtime result is claimed.
