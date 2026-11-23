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

Two variable font families are bundled with the app under the SIL Open Font License 1.1:

| Font | Weights | Licence | Used for |
| --- | --- | --- | --- |
| [Manrope](https://github.com/googlefonts/manrope) | 400–800 | SIL OFL 1.1 | Interface text (`--font-ui`) |
| [Bricolage Grotesque](https://github.com/ateliertriay/bricolage) | 400–800 | SIL OFL 1.1 | Display headings and brand (`--font-display`) |

The WOFF2 subsets and the upstream licence texts are in [`src/assets/fonts`](../src/assets/fonts). They are bundled by Vite, so no font request leaves the machine at runtime.

## Mood tile photos

Fifteen photos are bundled with the app for the Explore mood tiles (`src/assets/moods`). They were sourced via [Openverse](https://openverse.org/) from Flickr, Wikimedia Commons and Rawpixel. JPEGs were resized to 900px wide (quality 82); the Rawpixel sunrise is kept at its CDN 1024px size. Per-image details are also recorded in [`src/assets/moods/credits.json`](../src/assets/moods/credits.json).

| File | Photo | Creator | Licence | Source page |
| --- | --- | --- | --- | --- |
| punjabi.jpg | Bhangra Dance punjab | Onef9day | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | https://commons.wikimedia.org/w/index.php?curid=11047556 |
| hiphop.jpg | Danseurs de Hip Hop sur l'Alexander Platz (Berlin) | Jean-Pierre Dalbéra | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/72746018@N00/2705383805 |
| edm.jpg | Dj Mix | Anderson Mancini | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/17912374@N06/2931447597 |
| workout.jpg | Gym Dumbbells For Working Out | sterlinggraham | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/147328181@N07/32184464542 |
| chill.jpg | Got Hammock? | slgckgc | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/14771153@N04/7433810112 |
| lofi.jpg | Heavy Metal: TDK MA-R90 Cassette Tape | Schill | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/12289718@N00/7586864728 |
| focus.jpg | stockport library - books | Holiday Gems | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/117849715@N07/12585538065 |
| party.jpg | Confetti, Times Square | StuartMoreton | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/47001638@N08/4716778684 |
| romantic.jpg | dawn-sunset-couple-love | pixellaphoto | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | https://www.flickr.com/photos/137643065@N06/24029710780 |
| sad.jpg | rain window drive | Yuichiro Haga | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/77324941@N00/6979081135 |
| driving.jpg | highway night 3 | Oscar E. | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/21583873@N03/2338666395 |
| morning.webp | Beautiful sunrise field winter | Rawpixel (public domain collection) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | https://www.rawpixel.com/image/6035941/photo-image-public-domain-pink-sky |
| dhol.jpg | Dhol Tasha | ramnath bhat | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/31341155@N07/7943196228 |
| relax.jpg | Spa Accents | kymerastudio | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/11507280@N03/5076738369 |
| feelgood.jpg | Friends | Greg Walters | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | https://www.flickr.com/photos/51035803402@N01/3175988747 |

Monospace text still uses the fonts installed with Windows:

- Cascadia Code / Cascadia Mono
- Consolas
- System monospace fallbacks

## Catalogue content

Album art, artist images, track metadata, lyrics and podcast artwork are fetched from YouTube Music, LRCLIB and the configured lyrics providers. They remain the property of their respective rights holders and are not licensed to you by Auralis. Auralis claims no ownership over this content.

## YouTube and Google

YouTube Music and YouTube are trademarks of Google LLC. Auralis is an independent client and is not affiliated with, endorsed by or sponsored by Google or YouTube. Use of the service is subject to YouTube's terms and policies.
