# Auralis — Complete UI Reproduction Prompt (0 → 100%)

Copy everything below the line into the other developer's AI agent / task brief.
It is written to be self-contained: stack, tokens, layout, every page, the
Explore hero pixel spec, the artwork pipeline, QA and Windows packaging.

---

## 0. Mission

Build a **desktop music client called Auralis** (Electron + React + TypeScript)
that reproduces, 1:1, the UI described in this document. The app streams
YouTube Music. The visual language is **dark, glassy, emerald-accented,
cinematic**. The single most important screen is the **Explore hero banner**:
a flat dark-slate panel with a vertical "NOW PLAYING" rail, a glowing teal
energy sweep, a tilted real album cover with a glossy green vinyl behind it,
an emerald Play pill and a cream ECG-style waveform.

Non-negotiables:

- Nothing is hardcoded. Artwork, title, artist, album, palette, taglines and
  waveforms all come from the **real currently playing track** in global state.
- No placeholder or random artwork, ever. A fallback is allowed only when the
  track genuinely has no thumbnail.
- Switching tracks must update the bottom player, the hero and the Now Playing
  screen **simultaneously**, with no stale previous cover at any point.
- The hero Play button must drive the **existing** player (no second player,
  no duplicate audio element).
- Do not add extra buttons, stats, badges or descriptive paragraphs to the hero.
- Keep the rest of the app (sidebar, cards, player bar, lyrics) visually
  consistent — do not redesign unrelated screens while doing the hero.

---

## 1. Stack (use exactly this)

- **Electron 45**, `electron-builder` 26 (NSIS target for Windows).
- **React 19** + **TypeScript 5.9**, **Vite 8** for the renderer.
- **Zustand 5** for state.
- **lucide-react** for icons.
- Plain **CSS** (no Tailwind): `base.css` (tokens/reset/shell), `components.css`,
  `pages.css`, `settings.css`, `responsive.css`, `streamify.css` (visual
  language), `redesign.css` (Home), all imported from `src/index.css`.
- Fonts: `Manrope` (UI) and `Bricolage Grotesque` (display) as bundled woff2,
  with `Segoe UI Variable` / `Selawik` fallbacks. Mono: `Cascadia Code`.
- No image libraries required for the UI; the palette is extracted with a
  tiny canvas in the renderer.

### Windows setup

```powershell
git clone <repo> auralis
cd auralis
npm install
npm run dev          # vite + electron with hot reload
npm run typecheck
npm run build
npm run dist         # NSIS installer -> release/Auralis-Setup-1.0.2.exe
```

`main` field must be `dist-electron/main.js`. `electron-builder` win config:
`target: nsis (x64)`, `oneClick: false`, `perMachine: false`,
`allowToChangeInstallationDirectory: true`, desktop + start-menu shortcuts,
icon `resources/icon.png`, `requestedExecutionLevel: asInvoker`.

---

## 2. Design tokens (copy verbatim)

```css
:root {
  --titlebar-h: 0px;
  --sidebar-w: 256px;
  --sidebar-collapsed-w: 78px;
  --player-h: 96px;
  --topbar-h: 64px;

  --bg: #090b0e;
  --bg-elevated: #12161c;
  --sidebar: #0d1015;
  --surface: #12161c;
  --surface-2: #161c24;
  --surface-3: #1f2937;
  --surface-4: #2a3644;
  --surface-hover: #19202a;

  --text: #f4f4f5;
  --text-secondary: #d4d4d8;
  --muted: #a1a1aa;
  --faint: #71717a;

  --accent: #10b981;          /* emerald 500 */
  --accent-light: #34d399;
  --accent-dark: #059669;
  --accent-contrast: #101014;

  --border: rgba(255, 255, 255, 0.06);
  --border-strong: rgba(255, 255, 255, 0.12);
  --divider: rgba(255, 255, 255, 0.05);

  --radius-xs: 6px;  --radius-sm: 10px;  --radius-md: 14px;
  --radius-lg: 20px; --radius-xl: 28px;  --radius-pill: 999px;

  --font-ui: 'Manrope', 'Segoe UI Variable Text', 'Segoe UI', Selawik, system-ui, sans-serif;
  --font-display: 'Bricolage Grotesque', 'Segoe UI Variable Display', 'Segoe UI', Selawik, system-ui, sans-serif;
  --font-mono: 'Cascadia Code', Consolas, monospace;

  --ease: cubic-bezier(0.22, 0.8, 0.24, 1);
  --fast: 140ms var(--ease);
  --normal: 220ms var(--ease);
  --slow: 360ms var(--ease);

  --shadow-sm: 0 8px 24px rgba(0, 0, 0, 0.35);
  --shadow-md: 0 18px 48px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 34px 90px rgba(0, 0, 0, 0.65);

  --player-bg: rgba(13, 16, 21, 0.95);
  --card-bg: #12161c;
  --card-bg-hover: #19202a;
  --card-border: rgba(255, 255, 255, 0.05);
  --card-border-hover: rgba(16, 185, 129, 0.3);
}
```

App background (on `body` / `.app-shell`):

```css
background:
  radial-gradient(900px 620px at 50% -8%, rgba(16,185,129,0.12), transparent 70%),
  radial-gradient(760px 520px at 92% 4%,  rgba(45,212,191,0.08), transparent 72%),
  #090b0e;
```

Support `data-theme="dark" | "black" | "light"`; dark is the default and the
only one you must perfect. Light theme exists but is secondary.

---

## 3. App shell layout

```
.app-shell
├── <TitleBar/>        (custom window controls, transparent, drag region)
├── .app-body          (display:flex, height: calc(100vh - player-h))
│   ├── <Sidebar/>     (fixed 256px / 78px collapsed)
│   └── .main-frame    (flex column, min-width 0)
│       ├── <TopBar/>  (64px, sticky, blurred)
│       └── <main class="content-scroll">  (the only scroll container)
│           └── .route-stage > page
└── <PlayerBar/>       (fixed bottom, 96px, z-index 90)
<NowPlaying/>          (right drawer overlay)
<DialogHost/>, <Toasts/>, <ContextMenu/>
```

- `content-scroll` has `padding: 0 clamp(20px, 3vw, 44px)` and bottom space of
  `calc(var(--player-h) + 40px)`.
- Route transitions: 220ms fade + 8px translateY, keyed on the route.
- No page-level scrollbars inside pages; everything scrolls in `content-scroll`.

---

## 4. Sidebar

- Width 256px, background `--sidebar`, `border-right: 1px solid rgba(255,255,255,.05)`,
  padding 20px, hidden scrollbar.
- Top: app wordmark "Auralis" (display font, 20px, letter-spacing -0.02em)
  with a small emerald dot/logo mark.
- Primary nav (icon + label, 38px row, radius 10px, hover
  `rgba(255,255,255,.06)`, active = emerald-tinted pill with emerald icon and
  white label):
  Home, Explore, Podcasts, Library, Liked Songs, Downloads, Recently played.
- Section label "Your playlists" (11px, uppercase, letter-spacing .12em,
  `--faint`) + a "+" button.
- Playlist rows with a 2×2 mosaic thumbnail, name, and track count; hover
  reveals a play button.
- Bottom: Settings row.
- Collapsed state (78px): icons only, centered, labels hidden, tooltips on
  hover. Toggle persists in settings.
- **Live visualizer**: 4–5 small emerald bars at the bottom of the sidebar
  that animate with the real analyser and freeze when paused.

---

## 5. Top bar

- 64px, sticky, background `rgba(9,11,14,.8)`, `backdrop-filter: blur(20px)`,
  1px bottom border `--divider`.
- Left: back / forward circular ghost buttons (32px, disabled at history ends).
- Center-left: a **pill search field** (max-width 460px, height 40px, radius
  pill, `rgba(255,255,255,.05)` background, magnifier icon, placeholder
  "Search songs, albums, artists…", `Ctrl+F` focuses it).
- Inside the search field, at its right edge: a small **Identify** microphone
  button (lucide `Mic`). Do not put an equalizer icon next to it.
- Right: "Customize your taste" ghost chip, then the account chip (24px round
  avatar + name + tiny "PRO" emerald badge).
- Nothing else — no notifications bell clutter beyond a single icon button.

---

## 6. Player bar (bottom, fixed)

- Height 96px, full width, `grid-template-columns:
  minmax(220px,1fr) minmax(380px,1.55fr) minmax(250px,1fr)`, gap 18px,
  padding 10px 28px.
- Background `--player-bg`, `backdrop-filter: blur(28px) saturate(1.4)`,
  top border `rgba(255,255,255,.1)`, inset top highlight
  `inset 0 1px 0 rgba(255,255,255,.22)`, shadow
  `0 -20px 48px -24px rgba(0,0,0,.9)`.
- **Left**: 56px rounded (10px) artwork button (click opens Now Playing),
  then title (14px, 600, single-line ellipsis) and artist line (12px,
  `--muted`, clickable links to the artist). A small download button appears
  on hover.
- **Center**: shuffle, previous, big 42px emerald circular play/pause
  (black icon, `box-shadow: 0 8px 22px -8px rgba(16,185,129,.7)`), next,
  repeat. Below: elapsed time — a **seek range** with emerald fill and a
  buffered lighter track — total/remaining time. Seek must be drag-scrubable
  and update instantly.
- **Right**: lyrics toggle, queue toggle, volume icon + horizontal volume
  range + max button, then Now Playing expand button.
- Empty state (nothing ever played): a slim bar with a logo mark,
  "Nothing playing yet", and a "Find something to play" emerald button that
  routes to Explore.
- The player **never** unmounts on route change.

---

## 7. EXPLORE PAGE — the hero (the core deliverable)

> **Update (Nov 2026):** The hero was redesigned against a new cinematic
> emerald reference. It is now a wide near-black panel with a left emerald
> edge light, a `NOW PLAYING` audio-wave eyebrow, an oversized uppercase title,
> a grouped Play / Add to Queue / Like action row and a fanned stack of three
> glass-framed covers. The vertical rail, vinyl, canvas waveform and panel
> seams described in 7.1–7.10 are retired — treat `src/pages/Explore.tsx` and
> the `.explore-feature*` rules in `src/styles/pages.css` as the source of
> truth, and keep the state wiring in 7.11 and the responsive intent in 7.12.

Page wrapper: `.explore-page` inside `.page`, vertical stack, 26px gaps.

### 7.1 Geometry

```css
.explore-feature {
  position: relative;
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr) minmax(240px, 300px);
  align-items: center;
  gap: 22px;
  min-height: 268px;
  overflow: hidden;
  padding: 20px clamp(22px, 2.4vw, 32px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 20px;                    /* QA asserts exactly 20px */
  background:
    radial-gradient(130% 160% at 46% -22%, rgba(35,46,66,.55), transparent 55%),
    radial-gradient(125% 145% at 46% 122%, rgba(4,7,12,.62), transparent 62%),
    linear-gradient(168deg, #171d2a 0%, #141a26 42%, #101623 78%, #0d1320 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.055),
              0 30px 70px -46px rgba(0,0,0,.9);
}
```

**There are no clouds, no smoke, no nebula, no blurred artwork backdrop.**
The panel is flat dark slate with faint leather-panel seams.

### 7.2 Panel seams (pseudo-element)

```css
.explore-feature::after {
  content: ''; position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background:
    linear-gradient(90deg, transparent 0 calc(51% - 1px), rgba(255,255,255,.030) calc(51% - 1px) 51%, transparent 51%),
    linear-gradient(90deg, transparent 0 calc(80.5% - 1px), rgba(255,255,255,.033) calc(80.5% - 1px) 80.5%, transparent 80.5%),
    linear-gradient(0deg, transparent 0 calc(25% - 1px), rgba(255,255,255,.022) calc(25% - 1px) 25%, transparent 25%),
    linear-gradient(0deg, transparent 0 calc(76.5% - 1px), rgba(255,255,255,.022) calc(76.5% - 1px) 76.5%, transparent 76.5%);
}
```

### 7.3 Left vertical rail

```css
.explore-feature-rail {
  position: relative; z-index: 4; align-self: stretch;
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 16px; padding-block: 10px;
  border-right: 1px solid rgba(255,255,255,.07);
}
.explore-feature-rail-label {
  writing-mode: vertical-rl;           /* letters stacked, reads top→bottom */
  font-size: 10px; font-weight: 700; line-height: 1;
  letter-spacing: .32em; text-transform: uppercase;
  color: rgba(244,248,255,.5);
}
.explore-feature-rail-divider {
  width: 1px; height: 15%; min-height: 40px;
  background: rgba(255,255,255,.09);
}
.explore-feature-rail-wave { width: 30px; height: 148px; }   /* canvas */
```

Label text: `NOW PLAYING` when a track is playing, `FEATURED TRACK` when idle.

**Rail canvas (`VerticalWaveform`)**: 30×148, DPR-scaled. 19 rows, row height
`148/19`. Each row draws a centered rounded horizontal bar, half-width
`1.6 + level*12`, thickness 2.2px, color
`rgba(45,235,162, .45 + level*.55)` with `shadowBlur: 5` glow. Levels come from
the analyser spectrum (low bins for the middle rows, mirrored so it breathes
symmetrically), smoothed per frame (0.55 attack when playing, 0.14 when idle).
Paused: a calm 0.13–0.2 sine wobble. Reduced motion: draw one static frame.

### 7.4 Copy block

```css
.explore-feature-copy { position: relative; z-index: 4; display: flex;
  min-width: 0; flex-direction: column; justify-content: center; }

.explore-feature-tagline {
  margin: 0 0 10px; font-size: 12.5px; font-weight: 500;
  color: rgba(232,237,247,.72); letter-spacing: .01em;
}

.explore-feature h1 {
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; margin: 0;
  font-family: var(--font-display);
  font-size: clamp(38px, 4.7vw, 60px);
  font-weight: 800; line-height: 1.02; letter-spacing: -0.02em;
  text-transform: uppercase; color: #f4f6fa;
  text-shadow: 0 6px 40px rgba(0,0,0,.45);
}

.explore-feature-version {           /* artist line */
  margin: 12px 0 0; font-family: var(--font-ui);
  font-size: clamp(17px, 1.6vw, 21px); font-weight: 500;
  color: #a9b1c1; line-height: 1.3; letter-spacing: -0.005em;
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
  overflow: hidden;
}

.explore-feature-album {             /* album line, mint */
  margin: 9px 0 0; font-size: 12px; font-weight: 600;
  letter-spacing: .03em; color: #56f0b0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
```

Content rules:

- Tagline: short, human, one line, chosen from a mood-keyword tagline table
  (e.g. "Sometimes music says it all.", "This one's for you.",
  "Let the music find you."). Deterministic per track id — never random per
  render.
- Title: the parsed **song title only**, uppercase via CSS, max 2 lines.
  Strip "(From \"Album\")" and " - Version" suffixes into the album/version
  lines instead of the title.
- Artist line: comma-joined artist names.
- Album line: rendered as `(From "Album")` in mint — only when an album exists.
- If nothing has ever played: tagline "Let the music find you.",
  title "Auralis Discover", no artist line, no album line, and a clean
  fallback cover (gradient + music glyph), Play disabled.

### 7.5 Actions row

```css
.explore-feature-actions { display: flex; align-items: center;
  gap: 22px; margin-top: 20px; }

.explore-feature-play {
  display: inline-flex; align-items: center; gap: 9px;
  padding: 12px 28px; border: 0; border-radius: 999px;
  background: linear-gradient(180deg, #17ec9d 0%, #08d47f 100%);
  color: #04140b; font-size: 15px; font-weight: 750; letter-spacing: -0.01em;
  box-shadow: 0 14px 36px -12px rgba(20,236,155,.55),
              inset 0 1px 0 rgba(255,255,255,.42);
  transition: transform 180ms var(--ease), background 180ms var(--ease),
              box-shadow 180ms var(--ease);
}
.explore-feature-play:hover {
  background: linear-gradient(180deg, #34f7ad 0%, #12e68e 100%);
  transform: translateY(-1px);
  box-shadow: 0 18px 44px -12px rgba(20,236,155,.65),
              inset 0 1px 0 rgba(255,255,255,.46);
}
.explore-feature-play:active { transform: scale(.97); }
.explore-feature-play:disabled { opacity: .6; cursor: default; }
```

- Icon: filled lucide `Play` / `Pause`, 17px, black.
- Label: "Play" / "Pause".
- Click calls the global player's play/pause for the current track. If the
  hero is showing a track that isn't the current one, start that track through
  the normal player action — never create a second audio element.

### 7.6 Cream ECG waveform (next to Play)

```css
.explore-feature-wave {
  display: block; width: min(330px, 33vw); min-width: 150px; height: 44px;
  opacity: .55;
  mask-image: linear-gradient(90deg, #000 0%, #000 78%, transparent 100%);
  -webkit-mask-image: linear-gradient(90deg, #000 0%, #000 78%, transparent 100%);
  transition: opacity 300ms var(--ease);
}
.explore-feature-wave.is-live { opacity: 1; }
.explore-feature-wave-canvas { display: block; width: 100%; height: 100%; }
```

Canvas drawing (360×44 logical, DPR ≤ 2, ~30 fps):

- 150 points across the width.
- Sharp triangle wave, ~13 peaks: `tri = |((p*26) % 2) - 1| * 2 - 1`.
- Envelope: `0.62 + 0.38 * sin(π * clamp(p*1.04,0,1))^0.8`.
- Amplitude: when playing, `0.42 + min(1, spectrumEnergy*1.7 + beat*.55) * envelope`;
  paused, `0.4 + 0.16*|sin(p*6 + t*0.0016)| * envelope` and amplitude ×0.35.
- Small wobble `sin(p*11 + t*0.0024)*0.22`.
- Stroke `rgba(233,228,201,.95)` playing / `.45` paused, width 1.5,
  round joins/caps, shadowBlur 5/2 with a warm cream glow.
- Reduced motion: render a single static frame.

### 7.7 Glowing teal energy sweep

Full-bleed SVG, `viewBox="0 0 1200 320"`, `preserveAspectRatio="none"`,
absolute inset 0, z-index 1, `filter: drop-shadow(0 0 7px rgba(45,240,178,.45))`.

Gradient `explore-sweep-stroke` (horizontal): transparent → `#1fe3a4` .32 →
`#2cf0b2` .6 → `#3dffc2` .95 → `#2cf0b2` .55 → transparent.

Five cubic paths arcing from the left-middle up and over to the right edge,
strokes 1.15 / 0.8 / 0.65 / 0.55 / 0.45 px, opacities 1 / .7 / .5 / .4 / .35:

```
M-40 232 C 170 228, 300 176, 432 192 C 562 208, 612 118, 730 82 C 852 46, 880 176, 1240 158
M-40 246 C 190 242, 330 202, 458 214 C 585 226, 640 148, 756 118 C 872 88, 905 190, 1240 178
M-40 196 C 160 194, 300 142, 420 158 C 548 175, 606 60, 726 30 C 846 0, 872 128, 1240 118
M-40 262 C 200 260, 360 238, 500 246 C 640 254, 700 190, 814 176 C 922 162, 980 228, 1240 214
M-40 118 C 150 116, 280 84, 400 96 C 530 110, 590 10, 716 -16 C 840 -40, 862 92, 1240 76
```

Animate the whole SVG: `explore-sweep-drift 17s ease-in-out infinite alternate`
from `translate3d(-22px,4px,0); opacity:.82` to `translate3d(28px,-5px,0); opacity:1`.
Every path also gets `vector-effect: non-scaling-stroke`.

### 7.8 Glow dots + music notes

Absolute container, z-index 2. 26 seeded dots + 8 notes.

- Dots: `x 36–94%`, `y 18–76%`, size 0.8–3.2px, circular, background `#53ffc6`,
  `box-shadow: 0 0 6px 1.5px rgba(83,255,198,.75), 0 0 13px 4px rgba(83,255,198,.28)`.
- Notes: glyphs `♪ ♫ ♩` at 9–13px, color `#57f3b6`, `text-shadow: 0 0 9px rgba(87,243,182,.7)`,
  positions clustered over the sweep/cover area (x 51–96%, y 24–74%).
- Animation `explore-note-float`: 5.5–12s, staggered negative delays,
  translateY 2px → -8px and opacity `o*.55` → `o`.
- Seeded pseudo-random (`sin(i*127.1 + seed*311.7)` fractional) so positions
  never shuffle between renders.

### 7.9 Artwork composition (right column)

```css
.explore-feature-art {
  position: relative; z-index: 5; display: grid;
  width: 290px; height: 228px; place-items: center;
  justify-self: end; perspective: 1100px;
}
.explore-feature-cover {
  position: relative; z-index: 10; display: grid;
  width: 216px; height: 216px; place-items: center; overflow: hidden;
  border: 1px solid rgba(255,255,255,.07); border-radius: 13px;
  background: #0b111c; color: #7df0b4;
  transform: perspective(1050px) rotateY(-17deg) rotateX(5.5deg);
  transform-style: preserve-3d;
  box-shadow: 0 46px 70px -20px rgba(0,0,0,.82),
              0 0 42px -8px rgba(45,255,190,.16),
              inset 0 1px 0 rgba(255,255,255,.09);
  transition: transform 650ms var(--ease), box-shadow 650ms var(--ease);
}
.explore-feature:hover .explore-feature-cover {
  transform: perspective(1050px) rotateY(-9deg) rotateX(3.2deg);
}
```

- Cover crossfade: keep a stack of at most **2** layers
  `[{src,key}, {src,key}]`. On thumbnail change, append the new layer, then
  drop the old one after ~850ms. Old layer fades out 520ms; new fades in.
  Never leave the previous cover visible after the fade.
- The cover is the real track thumbnail via the shared `Artwork` component
  (proxied URL, fallback only if the thumbnail is missing/failed).
- **Vinyl** behind it, shifted right:

```css
.explore-feature-vinyl {
  position: absolute; z-index: 1; top: 50%; right: -14px;
  width: 204px; height: 204px; margin-top: -102px; overflow: hidden;
  border-radius: 50%;
  background: radial-gradient(circle at 40% 33%, #153c2d, #0b241c 56%, #050f0b 100%);
  box-shadow: 0 26px 52px -18px rgba(0,0,0,.85),
              inset 0 0 0 1px rgba(255,255,255,.04);
  transition: transform 650ms cubic-bezier(.22,1,.36,1);
}
.explore-feature:hover .explore-feature-vinyl { transform: translateX(26px); }
```

Vinyl SVG (dark green metal): outer disc `#0b241c` with `#133028` rim, groove
rings at r=52/46/39/32/25 in `#173a2d / #0e2b21 / #1b4232 / #103026 / #1d4733`,
label r=18 `#123528` stroke `#1f503c`, spindle `#0a1f16`, tiny accent dot
`#1fe3a4` at 55% opacity, and 2–3 light highlight arcs `#27533f`.
It slides in from the left once (`explore-vinyl-in 780ms`).

### 7.10 Sparkle

Bottom-right of the panel: lucide `Sparkle`, 19px, color `#7bf0c4`,
`filter: drop-shadow(0 0 7px rgba(123,240,196,.6))`,
pulse 3.6s (opacity .65→1, scale .92→1.08, rotate 0→12deg).

### 7.11 Hero state wiring (critical)

- Source of truth: global player store — `currentTrack` (id, title, artists,
  album, thumbnail), `playing`, `queue`, `progress`.
- Title parsing helper: balance parentheses and split on ` - `; extract
  `(From "X")` as album context; the remaining segment is the version line
  (shown only if it adds information). Never duplicate the album in the title.
- Palette: on `currentTrack.id + thumbnail` change, load the proxied image into
  a small canvas, bucket dominant colours (ignore near-black/near-white and
  low saturation), then pass the dominant colour through
  `atmospherePalette()`: keep hue, force saturation into 0.38–0.72, lightness
  0.29 (primary) / 0.21 (secondary, hue-12) / 0.56 (accent, hue+6). If the
  cover is monochrome use hue 158. Expose as CSS vars `--hero-r/g/b`,
  `--hero2-r/g/b`, `--hero-accent-r/g/b` on `.explore-page`.
- The hero ambient glow behind the page also follows the artwork palette
  (subtle radial, not clouds).
- Re-entering Explore must show the current track immediately — initialise
  state from the store, never from an empty local state.
- Skip/next/previous/play-from-anywhere must update the hero in the same frame
  as the bottom player.

### 7.12 Hero responsiveness

- ≤1100px: `grid-template-columns: 54px 1fr 250px`, art 250×210, cover 188,
  vinyl 186.
- ≤960px: `50px 1fr 206px`, art 200×190, cover 150, vinyl 150, rail gap 12,
  label 9px/.26em, rail wave 108px tall.
- ≤860px: single column, rail + art hidden, min-height 232, padding 28/24.
- ≤640px: min-height 226, padding 24/20, cover radius unchanged.
- ≤560px: h1 `clamp(28px, 9vw, 40px)`, hide the cream waveform, keep the Play
  pill.
- Never let the title overflow: 2-line clamp + ellipsis.

---

## 8. Explore mood grid (below the hero)

- Section header: "Browse all" / "Moods & moments" with a muted subtitle and a
  count chip ("15 mixes").
- Grid: `repeat(4, minmax(0,1fr))`, gap 10px; 3 columns ≤960px; 2 columns
  ≤640px.
- Every tile is a **photo card**, `aspect-ratio: 1.72/1`, min-height 104px,
  radius 14px, 1px `rgba(255,255,255,.12)` border, overflow hidden.
- Structure: full-bleed photo (`background-size: cover`, center) + bottom
  gradient overlay `linear-gradient(180deg, rgba(4,10,8,.02), rgba(4,10,8,.18) 42%, rgba(4,10,8,.88))`
  + subtle noise overlay (SVG feTurbulence, 0.2 opacity, overlay blend) +
  title (14px, 700) and subtitle (11px, muted) bottom-left + a chevron that
  slides on hover.
- Hover: `translateY(-2px)`, photo `scale(1.045)`, border brightens.
- 15 moods in this order: Punjabi, Hip-Hop, EDM, Workout/Gym, Chill, Lo-fi,
  Focus/Study, Party, Romantic, Sad, Driving, Morning Energy, Dhol dhol,
  Relaxation, Feel good. All 15 use bundled photos (no icon-only tiles).
- Below: shelves of cards ("New releases", "Made for you", "Trending") using
  the shared `ShelfGrid`/`MediaCard`.

---

## 9. Home page

- **Dynamic hero** (`.home-vibe-stage`): 24px radius, 28/32 padding,
  `linear-gradient(90deg, rgba(6,51,40,.65), var(--surface) 72%)`, border
  `--border-strong`, `--shadow-lg`. Contains:
  - blurred artwork backdrop at 0.22 opacity, blur 40px, scale 1.25;
  - emerald accent glow blob top-right (384px, blur 60px, opacity .35);
  - 150px artwork with 14px radius;
  - tagline (uppercase, 11px, emerald, letterspacing .18em), big display title
    (clamp 34–52px, 800), artist line, album line, emerald Play pill + a
    "Start radio" ghost button;
  - the whole stage's accent + backdrop follow the current track artwork and
    crossfade over 700–1000ms.
- **Jump Back In** section: header with title + "Recent" badge + subtitle
  "Pick up right where you left your headphones", a sync/refresh button and
  "See all". Grid of up to 6 cards: 72px artwork, title, `mm:ss • Track`
  sub-line, hover play button. All artwork through `Artwork`.
- Shelves: horizontal `ShelfGrid` rows of `MediaCard`s (album/playlist/track),
  each with 1:1 artwork radius 12px, title 13px 600, subtitle 11.5px muted,
  hover lift + emerald ring + play FAB.

---

## 10. Other pages (match the same language)

- **Search**: pill input at top, filter chips (All / Songs / Albums / Artists /
  Playlists), "Top result" hero card + songs list + shelves; empty state with
  a large search glyph and suggestions.
- **Library**: tabs (Playlists / Albums / Artists / Songs), grid/list toggle,
  sort menu, cards as above, empty states.
- **Liked Songs**: emerald gradient header card with a big heart glyph, count,
  "Play all" + shuffle, then `TrackList`.
- **Recently played / History**: grouped by day, compact rows with artwork,
  title, artist, duration, hover play.
- **Downloads**: list of downloaded tracks with size/quality, progress rows,
  storage summary card, open-folder button.
- **Detail** (album/playlist/artist/podcast/browse): blurred artwork header,
  180px cover, type label, huge title, artist/meta line, Play + shuffle +
  download + more, then `TrackList`; artist page adds top-tracks and album
  shelves; podcast adds episode list with play progress.
- **Podcasts**: show grid with cover, publisher, episode count.
- **Local playlist**: mosaic header, rename/delete, track list.
- **Settings**: left sub-nav (General, Appearance, Playback, Downloads,
  Integrations, About), right cards; theme picker (dark/black/light), accent
  colour, start page, sidebar collapse toggle, crossfade, gapless, audio
  quality, download folder, Discord RPC, equalizer presets, about/version.
- **Onboarding**: 3 steps (welcome, pick genres as emerald chips, done) with
  a progress bar, skip, and a final "Start listening" emerald button.
- **Splash**: black screen, logo mark, thin emerald progress line, ~3.3s.

---

## 11. Shared components

- **`Artwork`** (single source for every cover in the app):
  - props: `src`, `alt`, `className`, `round?`, `eager?`;
  - resolves through `proxiedArtwork(src)`;
  - while loading shows a neutral skeleton; on error shows a gradient fallback
    with a music glyph — **only** when the URL is missing or the request
    failed;
  - resets internal error/loading state when `src` changes (keyed on src) so a
    previous broken image can never stick to a new track;
  - `object-fit: cover`, `display: block`, radius inherits.
- **`MediaCard` / `ShelfGrid`**: card + hover play FAB + context menu.
- **`TrackList`**: sticky header row (index, title, album, duration),
  virtual-free simple rows, playing row highlighted emerald with an animated
  equalizer, double-click to play, context menu (play next, add to queue,
  like, download, go to artist/album).
- **`NowPlaying`**: right drawer, blurred artwork backdrop, 320px cover with
  crossfade, title/artist links, seek bar, transport, volume, queue preview,
  lyrics toggle; artwork must reset on `id + thumbnail` change.
- **`QueuePanel`**: drawer listing now playing + up next with drag reorder,
  remove, clear.
- **`LyricsPanel`**: time-synced lines, active line emerald + larger, click to
  seek, auto-scroll, plain fallback text.
- **`Dialogs`**: confirm, prompt, add-to-playlist, create playlist, sleep
  timer, equalizer, shortcuts — all use the same glass modal
  (`linear-gradient(165deg,#192029,#0d1015)`, 20px radius, border
  `--border-strong`, `--shadow-lg`).
- **`Toasts`**: bottom-center above the player, dark glass pill, emerald icon
  for success, red for errors, 3s auto-dismiss.
- **`ContextMenu`**: 12px radius, `rgba(18,22,28,.97)`, blur, 1px border,
  destructive items red.

---

## 12. Playback + artwork pipeline (the root-cause fix)

1. **Single audio element** owned by the player store. Never create another.
2. On play of any card/track/list: set `current` + `queue`, start loading,
   and immediately set `current.thumbnail` from the list item so the UI has art
   before the stream metadata arrives.
3. **`hydrateMissingMetadata()`**: after `yt.next` resolves, backfill any
   missing `thumbnail`, `duration`, `artists`, `album` on the current track,
   the queue entry, the media-session metadata, and the recent/liked/download
   mirrors. Never block playback waiting for it.
4. **Media session**: update title/artist/album/artwork on every change.
5. **Artwork proxy** (`auralis-media://image/<base64url>` in the main process):
   - allowlist hosts (ytimg / googleusercontent / yt3.ggpht …);
   - send a YouTube Music referer + desktop UA;
   - in-memory + disk cache in `userData/image-cache`;
   - 2 attempts with 350ms backoff;
   - on failure return a CORS-wrapped 502 so the renderer's `onError` fires and
     the fallback renders (never a spinner forever, never a broken icon).
6. **Consistency rule**: bottom player, hero and Now Playing must all show the
   same `current.thumbnail`. If one shows art, all must; if none, all show the
   fallback.
7. Stream `ERR_FAILED` aborts on track switch are expected and must not be
   surfaced as errors.

---

## 13. Motion, responsiveness, accessibility

- Standard durations: 140/220/360ms with `--ease`. Hover lifts ≤2px.
- All decorative animation (sweep, dots, notes, sparkle, vinyl) disabled under
  `prefers-reduced-motion: reduce`; canvases draw one static frame.
- Focus-visible: 2px emerald ring with 2px offset on every interactive element.
- Keyboard: `Ctrl+F` search, `Ctrl+,` settings, `Alt+←/→` history, `Space`
  play/pause, `Esc` closes overlays.
- Contrast: body text ≥ 4.5:1; muted text only for secondary info.
- Breakpoints: 1400 / 1180 / 1100 / 960 / 860 / 640 / 560. The hero rules in
  §7.12 are mandatory; other pages collapse grids 4→3→2→1.

---

## 14. Acceptance checklist (0 → 100 %)

Hero

- [ ] Panel radius is exactly 20px, border `1px rgba(255,255,255,.06)`.
- [ ] Flat dark-slate background with visible but subtle seams; **zero**
      clouds/smoke/nebula.
- [ ] Vertical `NOW PLAYING` label + hairline divider + live teal vertical
      waveform on the left rail.
- [ ] Tagline, uppercase title (≤2 lines, no overflow), artist line, mint album
      line, emerald Play/Pause pill, cream ECG waveform.
- [ ] Teal energy sweep with glow dots and ♪/♫ notes, drifting.
- [ ] Real cover, tilted in 3D, with glossy green vinyl behind it and the
      bottom-right sparkle.
- [ ] Clicking Play/Pause controls the real player; the cream waveform reacts
      to audio and dims when paused.
- [ ] Track change updates title/artist/album/artwork/palette with a crossfade;
      no stale cover at any moment.
- [ ] Navigating away and back shows the current track; skipping in the player
      updates the hero instantly.
- [ ] Idle state (nothing played) looks intentional: Discover title, fallback
      cover, disabled Play, no broken image.

Artwork & playback

- [ ] Explore playlists, New releases, Home, Search, Library, Liked, Recently
      played: correct song + correct artwork + correct title/artist, in the
      bottom player, the hero and Now Playing.
- [ ] Switching tracks replaces the artwork in all three places.
- [ ] Zero broken/stale images in any of those flows.
- [ ] Fallback appears only when artwork is genuinely unavailable.

Whole app

- [ ] Sidebar, top bar, player bar, mood grid, Home, Search, Library, Liked,
      Recent, Downloads, Detail, Podcasts, Settings, dialogs, toasts and
      onboarding all match the tokens and spacing above.
- [ ] Typecheck + production build pass.
- [ ] Windows NSIS installer builds and installs; app launches and plays.

---

## 15. Windows packaging

```powershell
npm run typecheck
npm run build
npm run dist        # electron-builder --win  -> release/Auralis-Setup-1.0.2.exe
```

Requirements: `build.appId = com.auralis.music`, `productName = Auralis`,
asar enabled, `files: dist/**/*, dist-electron/**/*, package.json, LICENSE`,
`extraResources` = `resources/bin` (yt-dlp.exe / ffmpeg.exe on Windows),
`icon.png`, `tray.png`, `licenses`. Keep `requestedExecutionLevel: asInvoker`
so it installs per-user without admin.

---

## 16. Do NOT

- Do not add clouds, smoke, particles that look like weather, or a blurred
  artwork background behind the hero.
- Do not add extra hero buttons, stats, badges, descriptions or a second
  player.
- Do not hardcode a song, artist, album or cover.
- Do not use placeholder/random artwork to "make it look nice".
- Do not redesign the sidebar, mood grid, player bar or lyrics while working
  on the hero.
- Do not use Tailwind or a new component library; extend the existing CSS.
- Do not break the app when a thumbnail is missing — degrade to the fallback.
