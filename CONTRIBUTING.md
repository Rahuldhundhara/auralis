# Contributing to Auralis

Thanks for helping. Bug fixes, documentation, QA notes and platform work are all
welcome. This guide is the short version; the full build and test commands are
in the [README](README.md#build-from-source).

## Before you start

- You need push access to the repository, or you can fork it and open a pull
  request from your fork.
- Your Git author email must be added to your GitHub account, otherwise GitHub
  will not link the commit to your profile or count it on the Contributors
  graph. The easiest option is your GitHub noreply address from
  **GitHub → Settings → Emails** (`ID+username@users.noreply.github.com`).

## One-time setup

```bash
gh auth login
git clone https://github.com/Rahuldhundhara/auralis.git
cd auralis
git config user.name "Your Name"
git config user.email "YOUR_ID+YOUR_USERNAME@users.noreply.github.com"
```

Check the identity before committing:

```bash
git config user.name
git config user.email
```

## Build and run

Node.js 22 or newer (24 recommended) and npm are required.

```bash
npm install
npm run dev
```

`npm run dev` starts Vite on port 5173, builds the Electron main/preload bundles
and launches the app. Release builds bundle `yt-dlp` and FFmpeg; the source tree
does not. Put `yt-dlp.exe` and `ffmpeg.exe` in `resources/bin/` if you need
playback, downloads or Shazam locally.

## Make a change

```bash
git checkout -b fix/short-description
# edit files
npm run typecheck
npm run build
git add .
git commit -m "Describe the change"
git push origin fix/short-description
```

Open the pull request link GitHub prints after the push. Keep `main` reviewable:
one focused branch per change, no release binaries, no `node_modules`, no local
`release/` output.

## Checks

| Command | What it covers |
| --- | --- |
| `npm run typecheck` | Renderer and Electron TypeScript |
| `npm run build` | Production renderer and main bundles |
| `npm run test:api` | Live Innertube parser check |
| `node scripts/qa-full.mjs` | 21-check live end-to-end pass |
| `node scripts/qa-upgrade.mjs` | Focused 1.1.0 regression pass |

The Playwright QA scripts need the live service and the bundled tools. Say in
the pull request which checks you ran and which you could not run.

## Pull requests

Include:

- what changed and why;
- how you tested it, with the command output or screenshot;
- the platform you tested on (Windows, Linux or Android);
- any known limitation, instead of hiding it.

## Troubleshooting

**`Permission denied` or `403` on push** — confirm the active account and its
access:

```bash
gh auth status
gh api repos/Rahuldhundhara/auralis/collaborators/YOUR_USERNAME/permission
```

**`HTTP 408` or a reset connection during a large push** — retry with a
non-thin pack:

```bash
git push --no-thin origin YOUR_BRANCH
```

**Commit not showing on your profile** — the author email on the commit does not
match a verified email on your GitHub account. Fix the config above and amend
the commit:

```bash
git commit --amend --reset-author --no-edit
git push --force-with-lease origin YOUR_BRANCH
```

## Good first changes

- Fix a documentation error in `README.md`, `docs/` or `qa/README.md`.
- Add a missing edge case to a QA script and record the result.
- Improve a platform note for Windows, Linux or Android.
- Pick an open issue and ask for the expected behaviour before changing code.
