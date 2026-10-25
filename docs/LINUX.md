# Auralis on Linux

Auralis 1.0.2 is available for Linux x64 as an **AppImage** and a **`.deb`**. The
renderer, design, catalogue integration, playback and download pipeline are the
same as the Windows build. This document covers the Linux-specific pieces:
build requirements, runtime tools, desktop integration and known limitations.

## Build requirements

- Linux x64 (Ubuntu 24.04/26.04 tested)
- Node.js 22 or newer (Node 24 recommended)
- npm
- `tar`, `xz`, and the usual Electron build libraries
- About 1.5 GB free disk space for `node_modules`, packaged output and tools

The source tree does not contain the Linux binaries. They are large runtime
assets (the static FFmpeg is about 77 MB) fetched and verified separately. Fetch
them once before running or packaging:

```bash
npm ci
npm run fetch:tools:linux
npm run verify:tools:linux
```

`fetch:tools:linux` downloads pinned versions and verifies their SHA-256 before
writing:

| Tool | Version | Destination |
| --- | --- | --- |
| yt-dlp | 2026.10.21 | `resources/bin/yt-dlp` |
| FFmpeg | 7.0.2 static (John Van Sickle build) | `resources/bin/ffmpeg` |

Use `npm run fetch:tools:linux -- --force` to replace existing files. The
downloads are developer actions; the packaged app already contains both tools.

## Development

```bash
npm run dev
```

This starts Vite on port 5173, builds the Electron main/preload bundles and
launches the app. Use `npm run typecheck` and `npm run build` before packaging.

## Packaging

```bash
npm run dist:linux           # AppImage + .deb
npm run dist:linux:appimage  # AppImage only
npm run dist:linux:deb       # .deb only
```

Output:

- `release/Auralis-1.0.2-x86_64.AppImage`
- `release/Auralis-1.0.2-amd64.deb`

`scripts/after-pack.cjs` verifies that both runtime tools exist in the packaged
resources and makes them executable. The build fails rather than shipping an app
without them.

### AppImage

```bash
chmod +x Auralis-1.0.2-x86_64.AppImage
./Auralis-1.0.2-x86_64.AppImage
```

The AppImage needs FUSE 2. Ubuntu 24.04/26.04 provides it as `libfuse2t64`.

### Debian/Ubuntu package

```bash
sudo apt install ./Auralis-1.0.2-amd64.deb
auralis
```

The `.deb` installs to `/opt/Auralis`, adds `/usr/bin/auralis`, a desktop entry
and icons, and registers an AppArmor profile on distributions that support it.
The package post-install script configures the Chromium sandbox for the host's
user-namespace policy.

## Runtime paths

| Data | Linux location |
| --- | --- |
| Settings and library | `${XDG_CONFIG_HOME:-~/.config}/Auralis/settings.json`, `library.json` |
| YouTube Music session | `${XDG_CONFIG_HOME:-~/.config}/Auralis/session.json` |
| Downloads | `~/Music/Auralis` by default (configurable) |
| Writable yt-dlp copy | `~/.config/Auralis/bin/yt-dlp` |
| Playback/cache | Electron's per-user cache directory |

### Windows profile migration

A settings or library directory copied from Windows can be used, but:

- Windows `C:\...` download paths are ignored on Linux and replaced at runtime
  with `~/Music/Auralis`. Existing library entries are not deleted or rewritten.
- YouTube cookies encrypted with Windows DPAPI cannot be decrypted on Linux.
  Sign in again in **Settings → Account**.
- No files are moved or deleted during migration.

## Desktop integration

### Secret storage

Electron `safeStorage` uses the desktop keyring (libsecret/GNOME Keyring or
KWallet). The selected backend is logged at startup:

```
[auralis] secret storage backend: gnome_libsecret
```

If no keyring is available, Electron may fall back to `basic_text`. Auralis
continues to work, but the session cookie is not protected by the OS keyring.

### Window rendering

The app keeps the established XWayland path by default. To use native Wayland:

```bash
ELECTRON_OZONE_PLATFORM_HINT=auto ./Auralis-1.0.2-x86_64.AppImage
# or
./Auralis-1.0.2-x86_64.AppImage --ozone-platform=wayland
```

Native Wayland support depends on the compositor, GPU driver and Electron's
Ozone backend. Screen sharing/portals are not part of Auralis's feature set.

### System tray

Auralis uses Electron `Tray`, which needs a StatusNotifier/AppIndicator host:

- GNOME: install and enable the **AppIndicator and KStatusNotifierItem Support**
  extension.
- KDE/XFCE/Cinnamon: usually available by default.

Without a tray host, Auralis detects this at startup, does not create an
invisible icon, and quits when the last window closes unless the tray is
available. **Settings → General** shows a note when no host was found.

### Media keys and MPRIS

The renderer publishes its metadata and playback state through the Media
Session API. On Linux this is exposed as MPRIS, so desktop media keys,
`playerctl`, lock-screen controls and the GNOME sound menu control playback.
Auralis does not register the Windows-style global shortcuts on Linux, avoiding
double-triggering with MPRIS.

### Fonts

Segoe UI and Cascadia Code are not available on most Linux systems. Auralis
bundles metric-compatible fallbacks:

- **Selawik** (regular, semibold, bold) for the UI
- **Cascadia Code** for monospace text

Locally installed Segoe/Cascadia fonts are preferred when present. Both bundled
fonts are under the SIL Open Font License; see
[`THIRD_PARTY.md`](THIRD_PARTY.md).

### yt-dlp updates

Packaged Linux installs are read-only (AppImage mount, `/opt` for `.deb`). On
first use, Auralis copies `yt-dlp` from `resources/bin` to
`~/.config/Auralis/bin/yt-dlp` and runs that copy. **Settings → About → Update
yt-dlp** therefore works without root or a writable install directory.

The bundled FFmpeg is used read-only and does not need updating at runtime.

## Known limitations

- The `.deb` and AppImage are x64 only in this release.
- GNOME requires the AppIndicator extension for the tray icon.
- Hardware badge counts and window urgency hints are desktop-dependent.
- Windows DPAPI cookies cannot be migrated; sign in again.
- Login, Last.fm, Discord, translation and Shazam require accounts, keys or an
  audio sample and are not verified by the automated suite.
- The application has no auto-updater. Download a newer package to update.
- The AppImage desktop launcher uses electron-builder's `--no-sandbox`
  default; AppRun also adds it when unprivileged user namespaces are not
  available. Use the `.deb` if Chromium sandbox isolation is required. The
  `.deb` post-install logic keeps the sandbox and sets SUID `chrome-sandbox`
  when user namespaces are unavailable.
- The MPRIS D-Bus name is Chromium's (`org.mpris.MediaPlayer2.chromium.instance<pid>`),
  not an Auralis-branded name. Media controls work, but the service name is a
  runtime artifact of Electron.
- `.deb` installation has not been exercised on this host because it needs
  root; the extracted package did launch and play audio. See
  [`QA-LINUX.md`](QA-LINUX.md) for the current test record.

## Troubleshooting

**The AppImage does not start.** Check that FUSE 2 is installed
(`sudo apt install libfuse2t64`) and that the file is executable. The AppImage
launcher already adds `--no-sandbox` when unprivileged user namespaces are
unavailable; if it still fails, use the `.deb` or
`--appimage-extract-and-run`.

**No tray icon on GNOME.** Install the AppIndicator extension and restart
Auralis. Settings will tell you when no tray host was detected. On Ubuntu the
`ubuntu-appindicators@ubuntu.com` extension provides the host used in the QA
run.

**Media keys do nothing.** Confirm the desktop's MPRIS integration is working
(`busctl --user list | grep -i mpris`). Auralis relies on the Media Session
handlers rather than X11 global shortcuts.

**Playback fails after a YouTube change.** Use **Settings → About → Update
yt-dlp**. The writable copy is in `~/.config/Auralis/bin`.

**Login does not persist.** Ensure a keyring service is running and unlocked.
Check the startup log for `secret storage backend`. If it reports
`basic_text`, install/unlock GNOME Keyring or KWallet.
