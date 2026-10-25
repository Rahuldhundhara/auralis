# Bundled tools

The Windows installer and portable EXE already include both tools. This folder is
for source builds only.

The binaries are not stored in git because `ffmpeg.exe` is about 105 MB, which is
above GitHub's 100 MB per-file limit. Before running the app or packaging it from
source, place these two files here:

| File | Where to get it |
| --- | --- |
| `yt-dlp.exe` | [yt-dlp latest release](https://github.com/yt-dlp/yt-dlp/releases/latest) (`yt-dlp.exe`) |
| `ffmpeg.exe` | [Gyan FFmpeg builds](https://www.gyan.dev/ffmpeg/builds/) (`ffmpeg-release-essentials.zip`, take `bin/ffmpeg.exe`) |

The app expects exactly `resources/bin/yt-dlp.exe` and
`resources/bin/ffmpeg.exe`. Browsing and streaming use `yt-dlp`; downloads and
Shazam fingerprinting also use FFmpeg.
