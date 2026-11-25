# Cloud sync, Supabase and the VPS API

Auralis 1.1.3 is fully local. This branch adds an **optional** cloud layer on top of it: Supabase Auth + private per-user storage for settings and library, plus a small backend API and landing page for a VPS. The mandatory YouTube Music sign-in, downloads and playback are untouched.

## Supabase project

The project used during development is `Auralis` in `ap-northeast-1`:

- Project URL: `https://gajqbhnbhfbhnsdyjcva.supabase.co`
- Publishable (anon) key: in `.env.example` and `.env.local` — public by design because every table uses row-level security
- No service-role key is used anywhere in the desktop app or the API

`supabase/schema.sql` creates nine tables, all with RLS policies keyed on `auth.uid()`:

| Table | Purpose |
| --- | --- |
| `profiles` | Display name and avatar from Supabase Auth metadata |
| `user_settings` | The synced snapshot document (settings + library) |
| `sync_state` | Last sync time and device id |
| `taste_preferences` | Onboarding languages and artists |
| `liked_songs`, `playlists`, `playlist_tracks`, `play_history`, `recent_searches` | Normalized mirrors for future server-side queries |

A `handle_new_user()` trigger creates the private rows when someone signs up. Email auth and user signups are enabled; `auralis://auth-callback` is registered as a redirect URL for future magic-link support.

### Running the schema

Paste `supabase/schema.sql` into the Supabase SQL Editor and run it. It uses `if not exists` for tables and triggers; the RLS policies are created by name, so re-running on a project that already has them will need the policy statements removed first.

## Desktop app

```bash
npm install
npm run typecheck
npm run build
```

Vite injects these values at build time:

```dotenv
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_…
VITE_AURALIS_API_URL=http://<vps-ip>
```

Copy `.env.example` to `.env.local` and replace the values for your own deployment. Users can also override URL/key/API in **Settings → Cloud sync → Your own backend**; those values live in renderer `localStorage` only.

In **Settings → Cloud sync**:

- **Sign in / Create account** uses Supabase Auth email + password
- **Sync now** pulls when the cloud copy is newer, otherwise pushes the local copy
- **Upload / Download** force a direction
- **Last synced** shows the local timestamp

The snapshot contains `settings` (all preferences including taste) and `library` minus `downloads`. Offline audio files stay on the device, and the YouTube Music session is never copied into Supabase.

## Backend API

`server/index.mjs` uses only Node 20+ built-ins. Start locally:

```bash
PORT=8787 SUPABASE_URL=https://<project>.supabase.co SUPABASE_ANON_KEY=sb_publishable_… node server/index.mjs
```

| Endpoint | Auth | Description |
| --- | --- | --- |
| `GET /health` | no | `{ ok, service, uptimeSec }` |
| `GET /api/search?q=…&limit=…` | no | YouTube Music search, in-memory cache (10 min), 30 req/min per IP |
| `GET /api/me` | Bearer Supabase token | Verifies the token through Supabase Auth and returns id/email |

Verified locally: `/api/search?q=kesariya&limit=5` returned five real results including `NJAv_7lHUIU` (Kesariya from Brahmastra).

### VPS deployment

A domain is not required; the server works on the VPS IP over HTTP.

```bash
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_ANON_KEY=sb_publishable_… \
bash deploy/setup-vps.sh
```

The script installs Node and nginx, copies `server/` and `site/` to `/opt/auralis`, creates a systemd service for the API and an nginx site that serves the landing page at `/` and proxies `/api/` and `/health` to `127.0.0.1:8787`. After it finishes, set `VITE_AURALIS_API_URL=http://<vps-ip>` in the desktop build so the Settings status shows the backend as reachable.

When a domain is added later, put it in the nginx `server_name` and run certbot for HTTPS. Do not put the service-role key on the VPS: the API only needs the publishable key to verify user tokens.

## Landing page

`site/` is a static dark landing page with download links to the GitHub release, feature summary and API status card. nginx serves it from `/`; no build step is required.
