-- Auralis cloud sync schema for Supabase Postgres.
-- Run in the Supabase SQL Editor (or `supabase db push`). All tables are
-- private to the authenticated user through row level security; the anon
-- client key is safe to ship in the desktop app.

create extension if not exists pgcrypto;

-- Shared trigger: keep updated_at honest on every write.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Profile: public identity for a Supabase auth user.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

-- App settings (theme, accent, EQ, playback, integrations) as one document.
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists user_settings_touch_updated_at on public.user_settings;
create trigger user_settings_touch_updated_at
before update on public.user_settings
for each row execute function public.touch_updated_at();

-- Which device last changed each collection, so a restore can pick a winner.
create table if not exists public.sync_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  device_id text not null,
  last_synced_at timestamptz not null default now(),
  collections jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists sync_state_touch_updated_at on public.sync_state;
create trigger sync_state_touch_updated_at
before update on public.sync_state
for each row execute function public.touch_updated_at();

-- Music taste picked in onboarding.
create table if not exists public.taste_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  languages text[] not null default '{}',
  artists jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists taste_touch_updated_at on public.taste_preferences;
create trigger taste_touch_updated_at
before update on public.taste_preferences
for each row execute function public.touch_updated_at();

-- Liked songs, keyed by YouTube video id.
create table if not exists public.liked_songs (
  user_id uuid not null references auth.users (id) on delete cascade,
  video_id text not null,
  title text not null default '',
  artist text not null default '',
  thumbnail text,
  added_at timestamptz not null default now(),
  primary key (user_id, video_id)
);
create index if not exists liked_songs_added_at_idx
on public.liked_songs (user_id, added_at desc);

-- Local style playlists mirrored to the cloud.
create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text not null default '',
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists playlists_user_updated_idx
on public.playlists (user_id, updated_at desc);

drop trigger if exists playlists_touch_updated_at on public.playlists;
create trigger playlists_touch_updated_at
before update on public.playlists
for each row execute function public.touch_updated_at();

create table if not exists public.playlist_tracks (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  video_id text not null,
  position integer not null default 0,
  title text not null default '',
  artist text not null default '',
  thumbnail text,
  added_at timestamptz not null default now(),
  primary key (playlist_id, video_id)
);
create index if not exists playlist_tracks_order_idx
on public.playlist_tracks (playlist_id, position);

-- Play history. Kept append-only; the app deduplicates by video id locally.
create table if not exists public.play_history (
  user_id uuid not null references auth.users (id) on delete cascade,
  video_id text not null,
  title text not null default '',
  artist text not null default '',
  thumbnail text,
  played_at timestamptz not null default now(),
  id bigint generated always as identity primary key
);
create index if not exists play_history_recent_idx
on public.play_history (user_id, played_at desc);

create table if not exists public.recent_searches (
  user_id uuid not null references auth.users (id) on delete cascade,
  query text not null,
  searched_at timestamptz not null default now(),
  id bigint generated always as identity primary key
);
create index if not exists recent_searches_recent_idx
on public.recent_searches (user_id, searched_at desc);

-- Every table is private to its owner.
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.sync_state enable row level security;
alter table public.taste_preferences enable row level security;
alter table public.liked_songs enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_tracks enable row level security;
alter table public.play_history enable row level security;
alter table public.recent_searches enable row level security;

-- Ownership policy helper. Each policy is explicit so the SQL is readable.
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "settings_select_own" on public.user_settings for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.user_settings for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "sync_select_own" on public.sync_state for select using (auth.uid() = user_id);
create policy "sync_insert_own" on public.sync_state for insert with check (auth.uid() = user_id);
create policy "sync_update_own" on public.sync_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "taste_select_own" on public.taste_preferences for select using (auth.uid() = user_id);
create policy "taste_insert_own" on public.taste_preferences for insert with check (auth.uid() = user_id);
create policy "taste_update_own" on public.taste_preferences for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "likes_select_own" on public.liked_songs for select using (auth.uid() = user_id);
create policy "likes_insert_own" on public.liked_songs for insert with check (auth.uid() = user_id);
create policy "likes_delete_own" on public.liked_songs for delete using (auth.uid() = user_id);

create policy "playlists_select_own" on public.playlists for select using (auth.uid() = user_id or is_public);
create policy "playlists_insert_own" on public.playlists for insert with check (auth.uid() = user_id);
create policy "playlists_update_own" on public.playlists for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "playlists_delete_own" on public.playlists for delete using (auth.uid() = user_id);

create policy "tracks_select_own" on public.playlist_tracks for select using (
  exists (select 1 from public.playlists p where p.id = playlist_id and (p.user_id = auth.uid() or p.is_public))
);
create policy "tracks_insert_own" on public.playlist_tracks for insert with check (
  exists (select 1 from public.playlists p where p.id = playlist_id and p.user_id = auth.uid())
);
create policy "tracks_update_own" on public.playlist_tracks for update using (
  exists (select 1 from public.playlists p where p.id = playlist_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from public.playlists p where p.id = playlist_id and p.user_id = auth.uid())
);
create policy "tracks_delete_own" on public.playlist_tracks for delete using (
  exists (select 1 from public.playlists p where p.id = playlist_id and p.user_id = auth.uid())
);

create policy "history_select_own" on public.play_history for select using (auth.uid() = user_id);
create policy "history_insert_own" on public.play_history for insert with check (auth.uid() = user_id);
create policy "history_delete_own" on public.play_history for delete using (auth.uid() = user_id);

create policy "search_select_own" on public.recent_searches for select using (auth.uid() = user_id);
create policy "search_insert_own" on public.recent_searches for insert with check (auth.uid() = user_id);
create policy "search_delete_own" on public.recent_searches for delete using (auth.uid() = user_id);

-- New auth user gets empty private rows automatically.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  insert into public.user_settings (user_id, settings) values (new.id, '{}'::jsonb) on conflict do nothing;
  insert into public.taste_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
