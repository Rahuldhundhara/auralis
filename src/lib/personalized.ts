import type { ArtistRef, Card, SearchResults, Track } from '@shared/types';

const PAGE_LIMIT = 6;
const TRACK_LIMIT = 40;

function artistCard(card: Card): Card {
  return {
    type: 'artist' as const,
    id: card.browseId || card.id,
    title: card.title,
    thumbnail: card.thumbnail,
    round: true,
    artists: card.artists,
  };
}

export function trackCard(track: Track): Card {
  return {
    type: 'song' as const,
    id: track.id,
    title: track.title,
    subtitle: track.artists.map((artist) => artist.name).join(', '),
    thumbnail: track.thumbnail,
    artists: track.artists,
    track,
  };
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/**
 * Fetch the favorite artists as browseable cards, resolving a thumbnail and
 * browse id for each via a real artist search.
 */
export async function fetchPersonalizedArtists(favoriteArtists: ArtistRef[]): Promise<Card[]> {
  if (!favoriteArtists.length) return [];
  const cards: Card[] = [];
  await Promise.all(
    favoriteArtists.map(async (artist) => {
      if (!artist.id) return;
      try {
        const results = (await window.auralis.yt.search(artist.name, 'artists')) as SearchResults;
        const match = results.artists.find((card) => card.id === artist.id) || results.artists[0];
        if (match) {
          cards.push(artistCard(match));
        } else {
          cards.push({ type: 'artist', id: artist.id, title: artist.name, round: true });
        }
      } catch {
        cards.push({ type: 'artist', id: artist.id, title: artist.name, round: true });
      }
    }),
  );
  return uniqueById(cards).slice(0, PAGE_LIMIT);
}

/**
 * Fetch tracks based on the selected genres and favorite artists using real
 * search results. Returns a de-duplicated track list.
 */
export async function fetchPersonalizedTracks(genres: string[], favoriteArtists: ArtistRef[]): Promise<Track[]> {
  const queries: string[] = [...genres];
  favoriteArtists.forEach((artist) => {
    if (artist.name) queries.push(artist.name);
  });
  if (!queries.length) return [];

  const allTracks: Track[] = [];
  await Promise.all(
    queries.map(async (query) => {
      try {
        const results = (await window.auralis.yt.search(query, 'songs')) as SearchResults;
        allTracks.push(...(results.songs || []));
      } catch {
        // Continue with the remaining queries on failure.
      }
    }),
  );
  return uniqueById(allTracks).slice(0, TRACK_LIMIT);
}

/**
 * Find similar/related artists for the selected genres and favorite artists.
 * Excludes artists already marked as favorites.
 */
export async function fetchSimilarArtists(genres: string[], favoriteArtists: ArtistRef[]): Promise<Card[]> {
  const favoriteIds = new Set(favoriteArtists.map((artist) => artist.id).filter(Boolean));
  const queries = [...genres, ...favoriteArtists.map((artist) => artist.name).filter(Boolean)];
  if (!queries.length) return [];

  const cards: Card[] = [];
  await Promise.all(
    queries.map(async (query) => {
      try {
        const results = (await window.auralis.yt.search(query, 'artists')) as SearchResults;
        for (const card of results.artists || []) {
          if (!card.id || favoriteIds.has(card.id)) continue;
          cards.push(artistCard(card));
        }
      } catch {
        // Continue with the remaining queries on failure.
      }
    }),
  );
  return uniqueById(cards).slice(0, PAGE_LIMIT);
}

/**
 * Get trending tracks for the selected genres using real search results.
 */
export async function fetchTrendingInGenres(genres: string[]): Promise<Track[]> {
  if (!genres.length) return [];
  const allTracks: Track[] = [];
  await Promise.all(
    genres.map(async (genre) => {
      try {
        const results = (await window.auralis.yt.search(`${genre} top tracks`, 'songs')) as SearchResults;
        allTracks.push(...(results.songs || []));
      } catch {
        // Continue with the remaining genres on failure.
      }
    }),
  );
  return uniqueById(allTracks).slice(0, TRACK_LIMIT);
}

export { PAGE_LIMIT, TRACK_LIMIT };
