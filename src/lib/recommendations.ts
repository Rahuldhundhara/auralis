import type { Card, Shelf, TasteArtist, Track } from '@shared/types';
import { tracksFromPage } from './actions';
import { useAppStore } from '../stores/app';

const CACHE_KEY = 'auralis.recommendations.v1';
const CACHE_TTL = 30 * 60_000;

export interface TasteProfile {
  artists: TasteArtist[];
  languages: string[];
  genres: string[];
}

interface ScoredArtist {
  name: string;
  score: number;
  thumbnail?: string;
  id?: string;
}

function addArtist(map: Map<string, ScoredArtist>, name: string, score: number, meta?: Partial<ScoredArtist>) {
  const key = name.trim().toLowerCase();
  if (!key) return;
  const existing = map.get(key);
  if (existing) {
    existing.score += score;
    if (!existing.thumbnail && meta?.thumbnail) existing.thumbnail = meta.thumbnail;
    if (!existing.id && meta?.id) existing.id = meta.id;
    return;
  }
  map.set(key, { name: name.trim(), score, thumbnail: meta?.thumbnail, id: meta?.id });
}

/** Builds a taste profile from onboarding choices plus real listening signals. */
export function currentTasteProfile(): TasteProfile {
  const state = useAppStore.getState();
  const settings = state.settings;
  const library = state.library;
  const scored = new Map<string, ScoredArtist>();

  for (const artist of settings.tasteArtists || []) addArtist(scored, artist.name, 10, artist);
  for (const artist of library.savedArtists || []) addArtist(scored, artist.title, 6, { id: artist.browseId || artist.id, thumbnail: artist.thumbnail });
  for (const track of library.liked || []) {
    for (const artist of track.artists || []) addArtist(scored, artist.name, 5, { id: artist.id });
  }
  library.recent.slice(0, 40).forEach((track, index) => {
    const weight = Math.max(1, 4 - Math.floor(index / 10));
    for (const artist of track.artists || []) addArtist(scored, artist.name, weight, { id: artist.id, thumbnail: track.thumbnail });
  });
  library.events.slice(0, 300).forEach((event) => {
    const weight = event.completed ? 2 : 1;
    for (const name of String(event.artist || '').split(/[,;&]/)) addArtist(scored, name, weight);
  });

  const artists = [...scored.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map<TasteArtist>((artist) => ({
      id: artist.id || artist.name,
      name: artist.name,
      thumbnail: artist.thumbnail,
    }));
  return {
    artists,
    languages: settings.tasteLanguages || [],
    genres: settings.tasteGenres || [],
  };
}

function trackToCard(track: Track, index: number): Card {
  return {
    type: track.type === 'video' || track.type === 'episode' ? track.type : 'song',
    id: track.id,
    title: track.title,
    subtitle: (track.artists || []).map((artist) => artist.name).join(', '),
    thumbnail: track.thumbnail,
    track,
    explicit: track.explicit,
    round: false,
    ...(index >= 0 ? {} : {}),
  };
}

// A coarse signature avoids refetching on every play. Listening history is
// bucketed so the feed still adapts over time without network churn.
function profileSignature(profile: TasteProfile): string {
  const library = useAppStore.getState().library;
  return JSON.stringify({
    artists: profile.artists.slice(0, 6).map((artist) => artist.id || artist.name).sort(),
    languages: profile.languages,
    genres: profile.genres,
    liked: Math.floor(library.liked.length / 5),
    recent: Math.floor(library.recent.length / 10),
  });
}

function readCache(profile: TasteProfile): Shelf[] | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { at: number; signature: string; shelves: Shelf[] };
    if (Date.now() - parsed.at > CACHE_TTL || parsed.signature !== profileSignature(profile)) return undefined;
    return Array.isArray(parsed.shelves) ? parsed.shelves : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(profile: TasteProfile, shelves: Shelf[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), signature: profileSignature(profile), shelves }));
  } catch {
    // best effort
  }
}

/** Builds real Home shelves from the listener's artists and listening history. */
export async function personalizedShelves(profile: TasteProfile): Promise<Shelf[]> {
  const cached = readCache(profile);
  if (cached) return cached;

  const seeds = profile.artists.filter((artist) => artist.id && artist.id !== artist.name).slice(0, 4);
  const pages = await Promise.allSettled(seeds.map((artist) => window.auralis.yt.artist(artist.id)));
  const seen = new Set<string>();
  const tracks: Track[] = [];
  for (const entry of pages) {
    if (entry.status !== 'fulfilled') continue;
    for (const track of tracksFromPage(entry.value)) {
      if (seen.has(track.id)) continue;
      seen.add(track.id);
      tracks.push(track);
    }
  }

  if (tracks.length < 6 && profile.languages.length) {
    const searches = await Promise.allSettled(
      profile.languages.slice(0, 2).map((language) => window.auralis.yt.search(`${language} hits`, 'songs')),
    );
    for (const entry of searches) {
      if (entry.status !== 'fulfilled') continue;
      for (const track of entry.value.songs || []) {
        if (!track?.id || seen.has(track.id)) continue;
        seen.add(track.id);
        tracks.push(track);
      }
    }
  }
  if (tracks.length < 4) return [];

  const shelves: Shelf[] = [];
  shelves.push({
    title: 'Made for you',
    items: tracks.slice(0, 24).map((track, index) => trackToCard(track, index)),
    style: 'carousel',
  });

  const artistCards: Card[] = seeds
    .filter((artist) => artist.thumbnail)
    .slice(0, 14)
    .map((artist) => ({
      type: 'artist',
      id: artist.id,
      title: artist.name,
      subtitle: 'Artist',
      thumbnail: artist.thumbnail,
      browseId: artist.id,
      round: true,
    }));
  if (artistCards.length >= 3) {
    shelves.push({ title: 'Your artists', items: artistCards, style: 'carousel' });
  }
  writeCache(profile, shelves);
  return shelves;
}

export function clearRecommendationCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
