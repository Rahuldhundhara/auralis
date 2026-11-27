import type { Track } from '@shared/types';
import { tracksFromPage } from './actions';
import { currentTasteProfile } from './recommendations';
import { useAppStore } from '../stores/app';

const CACHE_KEY = 'auralis.smartRadio.v1';
const CACHE_TTL = 15 * 60_000;
const MAX_POOL = 60;

const STOP_WORDS = new Set([
  'from', 'with', 'feat', 'this', 'that', 'your', 'the', 'and', 'for', 'you', 'are',
  'not', 'but', 'have', 'into', 'its', 'one', 'all', 'out', 'get', 'song', 'official',
]);

interface CachedPool {
  at: number;
  signature: string;
  tracks: Track[];
}

function currentSignature(): string {
  return currentTasteProfile().artists
    .filter((artist) => artist.id && artist.id !== artist.name)
    .slice(0, 4)
    .map((artist) => artist.id)
    .join('|');
}

function readPool(signature: string): Track[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CachedPool;
    if (parsed.signature !== signature || Date.now() - parsed.at > CACHE_TTL) return [];
    return Array.isArray(parsed.tracks) ? parsed.tracks : [];
  } catch {
    return [];
  }
}

function writePool(tracks: Track[], signature: string) {
  try {
    const entry: CachedPool = { at: Date.now(), signature, tracks };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Caching is best-effort.
  }
}

/** Signals that define the listener's current vibe. */
function signals() {
  const state = useAppStore.getState();
  const profile = currentTasteProfile();
  const names = new Set<string>();
  for (const artist of profile.artists) names.add(artist.name.toLowerCase());
  for (const artist of state.library.savedArtists) names.add(artist.title.toLowerCase());
  for (const track of state.library.liked) {
    for (const artist of track.artists || []) names.add(artist.name.toLowerCase());
  }
  const recent = state.library.recent.slice(0, 25);
  const recentArtists = new Set<string>();
  for (const track of recent) {
    for (const artist of track.artists || []) recentArtists.add(artist.name.toLowerCase());
  }
  return {
    names,
    recentArtists,
    artistIds: profile.artists
      .filter((artist) => artist.id && artist.id !== artist.name)
      .slice(0, 4)
      .map((artist) => artist.id),
    likedIds: new Set(state.library.liked.map((track) => track.id)),
    recentIds: new Set(recent.map((track) => track.id)),
  };
}

/**
 * Songs from the listener's chosen/saved artists. Fetched once per taste
 * change and cached, so a long radio session never refetches these pages.
 */
export async function tastePool(): Promise<Track[]> {
  const signature = currentSignature();
  const cached = readPool(signature);
  if (cached.length) return cached;
  const { artistIds } = signals();
  if (!artistIds.length) return [];
  const pages = await Promise.allSettled(artistIds.map((id) => window.auralis.yt.artist(id)));
  const seen = new Set<string>();
  const tracks: Track[] = [];
  for (const page of pages) {
    if (page.status !== 'fulfilled') continue;
    for (const track of tracksFromPage(page.value)) {
      if (!track?.id || seen.has(track.id)) continue;
      seen.add(track.id);
      tracks.push(track);
    }
  }
  const pool = tracks.slice(0, MAX_POOL);
  if (pool.length) writePool(pool, signature);
  return pool;
}

/**
 * Re-rank YouTube's related songs against the listener's taste. Related pages
 * drift into unrelated genres after a few tracks; this keeps the station on
 * the same artists/vibe without throwing away discovery entirely.
 */
export function rankRadioCandidates(candidates: Track[], seed: Track | undefined, seenIds: Set<string>): Track[] {
  const state = signals();
  const poolIds = new Set(readPool(state.artistIds.join('|')).map((track) => track.id));
  const seedArtists = new Set((seed?.artists || []).map((artist) => artist.name.toLowerCase()));
  const seedWords = new Set(
    (seed?.title || '')
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 3 && !STOP_WORDS.has(word)),
  );

  const scored: { track: Track; score: number; order: number }[] = [];
  candidates.forEach((track, order) => {
    if (!track?.id || seenIds.has(track.id)) return;
    const artists = (track.artists || []).map((artist) => artist.name.toLowerCase());
    let score = 0;
    if (seed && track.id === seed.id) score -= 100;
    if (artists.some((name) => seedArtists.has(name))) score += 9;
    if (artists.some((name) => state.names.has(name))) score += 7;
    if (artists.some((name) => state.recentArtists.has(name))) score += 3;
    if (state.likedIds.has(track.id)) score += 5;
    if (poolIds.has(track.id)) score += 5;
    if (state.recentIds.has(track.id)) score -= 8;
    if (
      (track.title || '')
        .toLowerCase()
        .split(/\W+/)
        .some((word) => word.length > 3 && seedWords.has(word))
    ) {
      score += 2;
    }
    scored.push({ track, score, order });
  });

  // When we have a clear taste anchor, drop songs with no signal at all —
  // this is what stops a station from drifting into unrelated genres.
  const anchored = scored.some((entry) => entry.score >= 7);
  const kept = anchored ? scored.filter((entry) => entry.score > 0) : scored;
  kept.sort((a, b) => b.score - a.score || a.order - b.order);
  return kept.map((entry) => entry.track);
}
