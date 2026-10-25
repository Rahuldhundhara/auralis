# Third-party notices

Auralis itself is licensed under the **GNU General Public License version 3 or later** (`GPL-3.0-or-later`). The full licence text is in [`LICENSE`](../LICENSE).

The application depends on the following components. Their licences apply to those components; nothing here changes the licence of Auralis.

## Runtime libraries

| Component | Version | Licence | Used for |
| --- | --- | --- | --- |
| [Electron](https://www.electronjs.org/) | 45.0.0 | MIT | Desktop runtime |
| [Chromium](https://www.chromium.org/) | bundled with Electron | BSD-style and third-party licences | Renderer engine |
| [Node.js](https://nodejs.org/) | bundled with Electron | MIT | Main-process runtime |
| [React](https://react.dev/) | 19.3.1 | MIT | User interface |
| [React DOM](https://react.dev/) | 19.3.1 | MIT | DOM renderer |
| [Zustand](https://github.com/pmndrs/zustand) | 5.0.16 | MIT | Renderer state stores |
| [lucide-react](https://lucide.dev/) | 1.61.0 | ISC | Interface icons |
| [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) | 5.11.2 | MIT | Lyrics and caption parsing where XML/RSS is used |
| [discord-rpc](https://github.com/discordjs/RPC) | 4.0.1 | MIT | Discord Rich Presence |

## Bundled executables

| Component | Version | Licence | Source |
| --- | --- | --- | --- |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | 2026.10.21 | Unlicense | https://github.com/yt-dlp/yt-dlp |
| [FFmpeg](https://ffmpeg.org/) | 9.0.2 essentials build by Gyan | GPL-3.0-or-later (this build is configured with `--enable-gpl --enable-version3`) | https://www.gyan.dev/ffmpeg/builds/ and https://github.com/FFmpeg/FFmpeg |

The bundled FFmpeg binary is used for audio conversion, caption extraction and decoding audio for Shazam fingerprinting. It is distributed unmodified. Corresponding FFmpeg source is available from the upstream project and the build provider linked above. The GPL-3.0 text in [`LICENSE`](../LICENSE) also covers the GPL terms for this build.

## Development tools

These are used to build and test Auralis but are not shipped in the runtime bundle:

| Component | Licence |
| --- | --- |
| Vite | MIT |
| esbuild | MIT |
| TypeScript | Apache-2.0 |
| electron-builder | MIT |
| Playwright Core | Apache-2.0 |
| sharp | Apache-2.0 |
| concurrently, wait-on, cross-env, tsx | MIT |

## Fonts

No font files are bundled. Auralis uses the fonts already installed with Windows:

- Segoe UI Variable / Segoe UI
- Cascadia Code / Cascadia Mono
- System fallbacks

## Catalogue content

Album art, artist images, track metadata, lyrics and podcast artwork are fetched from YouTube Music, LRCLIB and the configured lyrics providers. They remain the property of their respective rights holders and are not licensed to you by Auralis. Auralis claims no ownership over this content.

## YouTube and Google

YouTube Music and YouTube are trademarks of Google LLC. Auralis is an independent client and is not affiliated with, endorsed by or sponsored by Google or YouTube. Use of the service is subject to YouTube's terms and policies.
