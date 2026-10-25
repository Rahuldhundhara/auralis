# Bundled tools

The packaged app already includes the tools for its platform. This folder is for
source builds only.

The binaries are not stored in git: the Windows FFmpeg is above GitHub's 100 MB
per-file limit, and the Linux tools are large enough to keep the source tree
lean.

## Windows

Place these two files here before running or packaging from source:

| File | Where to get it |
| --- | --- |
| `yt-dlp.exe` | [yt-dlp latest release](https://github.com/yt-dlp/yt-dlp/releases/latest) (`yt-dlp.exe`) |
| `ffmpeg.exe` | [Gyan FFmpeg builds](https://www.gyan.dev/ffmpeg/builds/) (`ffmpeg-release-essentials.zip`, take `bin/ffmpeg.exe`) |

The app expects exactly `resources/bin/yt-dlp.exe` and
`resources/bin/ffmpeg.exe`.

## Linux

Use the pinned download script:

```bash
npm run fetch:tools:linux
npm run verify:tools:linux
```

This writes:

| File | Version |
| --- | --- |
| `yt-dlp` | 2026.10.21 |
| `ffmpeg` | 7.0.2 static (John Van Sickle build) |

Both files must be executable (`0755`). The fetch script verifies SHA-256 before
installing them, and packaging fails if either is missing. Browsing and
streaming use yt-dlp; downloads and Shazam fingerprinting also use FFmpeg.

On Linux the packaged app copies yt-dlp to `~/.config/Auralis/bin/yt-dlp` on
first use so the in-app update can write to it. FFmpeg is used read-only.
