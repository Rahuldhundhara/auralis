<p align="center">
  <img src="resources/logo.png" width="280" alt="Auralis logo" />
</p>

<h1 align="center">Auralis for Linux</h1>

<p align="center">
  Auralis 1.0.2 for Linux x64 — a native-feeling YouTube Music desktop client.<br />
  Browse, stream, queue, sing along and listen offline — in one focused desktop app.
</p>

<p align="center">
  <strong>Linux release 1.0.2</strong> · AppImage · Debian package · GPL-3.0-or-later
</p>

<p align="center">
  <a href="https://github.com/Rahuldhundhara/auralis/releases/download/v1.0.2-linux/Auralis-1.0.2-x86_64.AppImage"><strong>Download AppImage</strong></a>
  ·
  <a href="https://github.com/Rahuldhundhara/auralis/releases/download/v1.0.2-linux/Auralis-1.0.2-amd64.deb"><strong>Download .deb</strong></a>
  ·
  <a href="https://github.com/Rahuldhundhara/auralis/releases/download/v1.0.2-linux/SHA256SUMS-linux.txt">SHA-256 checksums</a>
</p>

> Auralis is an independent, unofficial client. It is not affiliated with, endorsed by or sponsored by YouTube or Google. You are responsible for how you use it and for following the terms of the services you access.

![Auralis home](docs/screenshots/home.png)

## What's inside

Auralis is a complete desktop front end for YouTube Music. It talks to the same live catalogue through YouTube Music's web API, resolves audio with a bundled `yt-dlp`, and plays it through an HTML5 audio pipeline with a Web Audio equalizer.

| | |
|---|---|
| **Home** | Personalised home feed, quick picks, mixes, charts, new releases, moods and genres |
| **Search** | Search suggestions plus separate songs, videos, albums, artists, playlists and podcasts; song picks start a related station |
| **Details** | Album, playlist, artist and podcast pages with continuation and full track/episode lists |
| **Player** | Seek, volume, speed, repeat, shuffle, queue, radio/automix with queue-end autoplay, prefetch, sleep timer and media keys |
| **Now Playing** | Full-screen artwork, queue, synced lyrics and word-by-word highlighting |
| **Lyrics** | Eight providers, including LRCLIB, BetterLyrics, Paxsenix, LyricsPlus, KuGou and YouTube |
| **Library** | Likes, local playlists, saved albums and artists, recently played, history and search history |
| **Downloads** | Offline audio downloads in app-private storage with progress, pause/resume, cancel, retry, delete and auto-download for liked songs |
| **Integrations** | YouTube Music account, Last.fm scrobbling, Discord Rich Presence and Shazam recognition |
| **Desktop** | Frameless window, tray icon, close-to-tray, keyboard shortcuts and platform media controls (MPRIS on Linux) |
| **Look and feel** | Material-inspired design, dark/black/light/system themes and eight accent colours |

### Screens

| Now Playing | Album |
| --- | --- |
| ![Now Playing with lyrics](docs/screenshots/now-playing.png) | ![Album detail](docs/screenshots/album.png) |

| Artist | Podcast |
| --- | --- |
| ![Artist detail](docs/screenshots/artist.png) | ![Podcast episodes](docs/screenshots/podcast.png) |

| Moods & genres | Downloads |
| --- | --- |
| ![Moods and genres](docs/screenshots/moods.png) | ![Offline downloads](docs/screenshots/downloads.png) |

## Install Auralis for Linux 1.0.2

Download the Linux 1.0.2 packages from the
[Linux release page](https://github.com/Rahuldhundhara/auralis/releases/tag/v1.0.2-linux):

| Build | File | Use it when |
| --- | --- | --- |
| AppImage | [`Auralis-1.0.2-x86_64.AppImage`](https://github.com/Rahuldhundhara/auralis/releases/download/v1.0.2-linux/Auralis-1.0.2-x86_64.AppImage) | You want a single portable file with no installation |
| Debian package | [`Auralis-1.0.2-amd64.deb`](https://github.com/Rahuldhundhara/auralis/releases/download/v1.0.2-linux/Auralis-1.0.2-amd64.deb) | You want a desktop entry, system integration and a package-managed install |

```bash
chmod +x Auralis-1.0.2-x86_64.AppImage
./Auralis-1.0.2-x86_64.AppImage

# or
sudo apt install ./Auralis-1.0.2-amd64.deb
auralis
```

Verify the download against
[`SHA256SUMS-linux.txt`](https://github.com/Rahuldhundhara/auralis/releases/download/v1.0.2-linux/SHA256SUMS-linux.txt):

```bash
sha256sum -c SHA256SUMS-linux.txt
```

The AppImage needs FUSE 2 (`libfuse2t64` on Ubuntu 24.04/26.04). Both Linux
builds include yt-dlp and FFmpeg and do not need a separate browser runtime.
GNOME needs the AppIndicator extension for the tray icon; without it Auralis
quits when the last window closes and explains why in Settings. See
[`docs/LINUX.md`](docs/LINUX.md) for Wayland, keyring, sandbox and troubleshooting
details.

Windows builds remain available on the
[GitHub Releases page](https://github.com/Rahuldhundhara/auralis/releases).

### First run

1. Open **Settings → Appearance** and choose a theme and accent.
2. Open **Settings → Downloads** to manage offline audio. Downloads are stored in app-private storage (`%APPDATA%\Auralis\offline` on Windows, `${XDG_CONFIG_HOME:-~/.config}/Auralis/offline` on Linux).
3. Optionally connect an account under **Settings → Account**, or configure Last.fm and Discord under **Settings → Integrations**.
4. Start typing in the search bar, or pick something from Home.

Anonymous browsing works immediately. A YouTube Music account unlocks your cloud library, remote playlist edits, subscriptions and account history.

### What's new in 1.0.2

- Picking a search result now starts a related-song station from that song instead of playing the other search results underneath it.
- Albums, playlists and one-off picks keep going after their last track: Auralis seeds a radio station from the song that just ended. Radio stations follow continuation tokens, so they do not stop after the first batch.
- Seed-based radio keeps the seed's language and scene; a Hindi song seeds Hindi recommendations, verified live against YouTube Music.
- Supplied Auralis logo: green "A" play mark with soundwave arcs, used by the installer, window, title bar, splash, tray and README.
- Hardened live QA: 21 end-to-end checks covering search filters, playback, related autoplay, queue editing, playlists, downloads, lyrics, settings and restart persistence.
- Rebuilt NSIS installer and portable EXE with the 1.0.2 binaries and refreshed SHA-256 checksums.
- Published the Linux 1.0.2 AppImage and Debian package with SHA-256 checksums.

## Where your data lives

| Data | Windows | Linux |
| --- | --- | --- |
| Settings and local library | `%APPDATA%\Auralis\settings.json`, `library.json` | `${XDG_CONFIG_HOME:-~/.config}/Auralis/settings.json`, `library.json` |
| YouTube Music session | `%APPDATA%\Auralis\session.json` | `${XDG_CONFIG_HOME:-~/.config}/Auralis/session.json` |
| Downloads | `%APPDATA%\Auralis\offline` (app-private) | `${XDG_CONFIG_HOME:-~/.config}/Auralis/offline` (app-private) |
| Writable yt-dlp copy | bundled `resources\bin\yt-dlp.exe` | `~/.config/Auralis/bin/yt-dlp` |
| Playback cache | Electron's per-user cache folder | Electron's per-user cache folder |

Cookies are encrypted at rest with Electron `safeStorage`: DPAPI on Windows,
libsecret/GNOME Keyring or KWallet on Linux. The session is never encrypted with
a hard-coded key and is not uploaded anywhere. If no keyring is available,
Electron may use its `basic_text` fallback; this is logged at startup on Linux.

## Build from source

### Requirements

**Windows**

- Windows 10 or 11 x64
- Node.js 22 or newer (Node 24 recommended)
- npm
- About 1 GB of free disk space for dependencies and packaged output

**Linux**

- Linux x64 (Ubuntu 24.04/26.04 tested)
- Node.js 22 or newer (Node 24 recommended)
- npm, `tar`, `xz`, and Electron's usual build libraries
- About 1.5 GB of free disk space including the runtime tools

### Development

The release builds include yt-dlp and FFmpeg. The GitHub source tree does not:
`ffmpeg.exe` is about 105 MB, over GitHub's per-file limit. Before running the app
or packaging from source, put `yt-dlp.exe` and `ffmpeg.exe` in `resources/bin/`
(see [`resources/bin/README.md`](resources/bin/README.md)). Browsing works without
them, but playback, downloads and Shazam do not.

```powershell
npm install
npm run dev
```

On Linux, stage the pinned tools first:

```bash
npm ci
npm run fetch:tools:linux
npm run verify:tools:linux
npm run dev
```

`npm run dev` starts Vite on port 5173, builds the Electron main and preload bundles, and launches the app. Main-process changes need a restart; renderer changes hot-reload.

On Linux, Auralis keeps the established XWayland path by default. Set
`ELECTRON_OZONE_PLATFORM_HINT=auto` or pass `--ozone-platform=wayland` to try
native Wayland.

### Checks and production build

```powershell
npm run typecheck
npm run build
npm run preview
```

`npm run preview` builds and runs the production renderer without packaging.

### Installer and portable builds

```powershell
npm run dist            # release/Auralis-Setup-1.0.2.exe
npm run dist:portable   # release/Auralis-Portable-1.0.2.exe
```

Linux:

```bash
npm run dist:linux           # AppImage + .deb
npm run dist:linux:appimage  # AppImage only
npm run dist:linux:deb       # .deb only
```

Packaging uses `electron-builder` with `npmRebuild: false`; the Electron main process is bundled by esbuild, so no native modules are rebuilt at package time. The bundled tools in `resources/bin` are copied into the app's `resources/bin` directory. Linux packaging verifies and marks both tool binaries executable; it fails rather than shipping a package without them.

### Quality checks

```powershell
npm run test:api            # live Innertube parser check
node scripts/qa-full.mjs    # 21-check live end-to-end pass
node scripts/qa-sleep.mjs   # focused sleep-timer regression
```

Linux additionally has:

```bash
npm run qa:linux            # renderer/layout pass and screenshots
npm run qa:linux:full       # 21-check live end-to-end pass
npm run qa:linux:packaged   # packaged linux-unpacked pass
```

On hosts where AppArmor blocks user namespaces for unpackaged Electron, prefix
the development QA commands with `AURALIS_QA_NO_SANDBOX=1`. The flag is read by
the QA scripts only; it is not part of the product. The Playwright QA scripts
launch the real app with an isolated user-data directory and exercise live
playback, downloads, playlists, podcasts, sleep timer and settings. See
[docs/QA.md](docs/QA.md) and [docs/QA-LINUX.md](docs/QA-LINUX.md).

## Architecture at a glance

```
React 19 renderer  ──window.auralis──▶  preload bridge  ──IPC──▶  Electron main
        │                                                           │
        ├─ Zustand stores                                    ├─ YouTube Music API (WEB_REMIX)
        ├─ HTML5 audio + Web Audio EQ                        ├─ yt-dlp stream and download service
        └─ auralis-media:// playback                         └─ JSON stores, safeStorage, tray
```

- **UI:** React 19, TypeScript, Vite 8, Zustand, custom CSS and lucide icons.
- **Desktop:** Electron 45, context isolation on, Node integration off, narrow preload API.
- **Catalogue:** YouTube Music Innertube (`WEB_REMIX`) with optional authenticated cookies and SAPISIDHASH.
- **Audio:** bundled `yt-dlp` (`.exe` on Windows, native binary on Linux) resolves direct audio streams; `auralis-media://` proxies range requests and CORS so the Web Audio equalizer can inspect the stream.
- **Downloads:** bundled `yt-dlp`, with bundled FFmpeg for conversion and caption extraction.
- **Persistence:** plain JSON files in Electron's user data directory; no database server, no telemetry.

See [docs/API.md](docs/API.md) for the full IPC and service reference, and [docs/PARITY.md](docs/PARITY.md) for the feature-by-feature parity matrix.

## Bundled tools

| Tool | Windows | Linux | Purpose |
| --- | --- | --- | --- |
| `yt-dlp` | 2026.10.21 (`yt-dlp.exe`) | 2026.10.21 (`yt-dlp`) | Resolve live audio streams, download tracks, fetch captions |
| FFmpeg | 9.0.2 essentials (Gyan build) | 7.0.2 static (John Van Sickle build) | Audio conversion for downloads and Shazam fingerprint input |

The Linux binaries are fetched with `npm run fetch:tools:linux` and verified
against pinned SHA-256 values before packaging. The app works offline only for
tracks that have already been downloaded. A network connection is required to
browse and stream the live catalogue.

### Updating yt-dlp

YouTube changes its delivery formats regularly. If playback or downloads stop working after a site change:

1. Open **Settings → About** and use **Update yt-dlp**, or
2. Windows: replace `resources\bin\yt-dlp.exe` with a fresh release, then restart.
3. Linux development: replace `resources/bin/yt-dlp`, then run `npm run verify:tools:linux`.
4. Linux packages: Auralis copies the bundled tool to `~/.config/Auralis/bin/yt-dlp` on first use. The in-app update writes there, so it works even though the AppImage/`.deb` install is read-only.

The current version is shown in **Settings → About**.

## Troubleshooting

**A track spins or fails to start.** Try another track; if every track fails, update yt-dlp. A proxy or VPN can also cause the stream host to reject requests. Set the proxy under **Settings → Downloads → Network**.

**Downloads finish but the file will not play.** Keep FFmpeg in the app's `resources/bin` folder. Do not move the portable EXE out of its unpacked directory while it is running.

**YouTube Music login did not stick.** Close the sign-in window after the account name appears, then restart. If the embedded Google sign-in is blocked, paste a `Cookie` header value under **Settings → Account → Manual cookie**. Do not share cookies with anyone.

**The window is blank on a GPU driver.** Open **Settings → General**, turn off **Hardware acceleration**, and restart. On Linux, the app uses XWayland by default; try `ELECTRON_OZONE_PLATFORM_HINT=auto` or `--ozone-platform=wayland` only if your compositor and GPU driver support it.

**GNOME shows no tray icon.** Install and enable the **AppIndicator and KStatusNotifierItem Support** extension. Without a tray host Auralis quits when the last window closes and shows a note in **Settings → General**.

**The AppImage will not start.** Install FUSE 2 (`libfuse2t64` on Ubuntu 24.04/26.04) and make the file executable. The AppImage launcher already adds `--no-sandbox` when unprivileged user namespaces are unavailable; if it still fails, use the `.deb` package or `--appimage-extract-and-run`. The `.deb` keeps Chromium's sandbox and sets SUID `chrome-sandbox` when user namespaces are unavailable.

**Search works but Home is slow on first launch.** The first feed request can take several seconds while YouTube Music builds a fresh anonymous session. Subsequent requests are cached for the session.

## Project layout

```
electron/            Electron main process, preload and services
  services/          Innertube, parsers, streams, downloads, lyrics, stores
shared/              Shared TypeScript types and the renderer API contract
src/                 React renderer (pages, components, stores, styles)
resources/           App icons and bundled binaries
scripts/             Build and Playwright QA scripts
docs/                Screenshots, API notes, parity matrix and QA records
release/             Installer, AppImage and .deb output (generated)
```

Linux-specific build, integration and troubleshooting notes are in
[`docs/LINUX.md`](docs/LINUX.md). The Linux test record is in
[`docs/QA-LINUX.md`](docs/QA-LINUX.md).

## License

Auralis is free software, licensed under the **GNU General Public License, version 3 or later**. See [LICENSE](LICENSE).

Bundled and third-party components keep their own licences; see [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md). The GPL-3.0 text is distributed with the app.

## Acknowledgements

Built with Electron, React, Vite, Zustand, lucide, fast-xml-parser, yt-dlp and FFmpeg. Lyrics come from their respective community providers. Artwork and metadata belong to their respective rights holders and are displayed as part of the YouTube Music catalogue.
