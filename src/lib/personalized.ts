import type { ArtistRef, Card, SearchResults, Track } from '@shared/types';

const PAGE_LIMIT = 6;
const TRACK_LIMIT = 40;

/* Home is the most-visited page. These datasets only change when taste changes,
   so keep the parsed results instead of re-searching on every navigation. */
const artistCardCache = new Map<string, Card[]>();
const similarArtistCache = new Map<string, Card[]>();
const trendingTrackCache = new Map<string, Track[]>();
const personalizedTrackCache = new Map<string, Track[]>();

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
  const key = favoriteArtists
    .map((artist) => `${artist.id || ''}:${artist.name}:${artist.thumbnail || ''}`)
    .join('|');
  const cached = artistCardCache.get(key);
  if (cached) return cached;

  const cards: Card[] = [];
  await Promise.all(
    favoriteArtists.map(async (artist) => {
      if (!artist.id) return;
      const direct: Card = {
        type: 'artist',
        id: artist.id,
        browseId: artist.id,
        title: artist.name,
        thumbnail: artist.thumbnail,
        round: true,
      };
      // Taste selection now saves the real photo, so the common path never
      // hits the network at all.
      if (artist.thumbnail) {
        cards.push(direct);
        return;
      }
      try {
        const results = (await window.auralis.yt.search(artist.name, 'artists')) as SearchResults;
        const match = results.artists.find((card) => card.id === artist.id) || results.artists[0];
        cards.push(
          match
            ? artistCard({
                ...match,
                thumbnail: match.thumbnail || artist.thumbnail,
                browseId: match.browseId || match.id || artist.id,
              })
            : direct,
        );
      } catch {
        // Last resort: the artist page header carries the same real artwork.
        try {
          const page = await window.auralis.yt.artist(artist.id);
          cards.push(page.header?.thumbnail ? { ...direct, thumbnail: page.header.thumbnail } : direct);
        } catch {
          cards.push(direct);
        }
      }
    }),
  );
  const result = uniqueById(cards).slice(0, PAGE_LIMIT);
  artistCardCache.set(key, result);
  return result;
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

  const cacheKey = `${queries.join('|')}\u0000${favoriteArtists.map((artist) => artist.id || artist.name).join('|')}`;
  const cached = personalizedTrackCache.get(cacheKey);
  if (cached) return cached;

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
  const result = uniqueById(allTracks).slice(0, TRACK_LIMIT);
  personalizedTrackCache.set(cacheKey, result);
  return result;
}

/**
 * Find similar/related artists for the selected genres and favorite artists.
 * Excludes artists already marked as favorites.
 */
export async function fetchSimilarArtists(genres: string[], favoriteArtists: ArtistRef[]): Promise<Card[]> {
  const favoriteIds = new Set(favoriteArtists.map((artist) => artist.id).filter(Boolean));
  const queries = [...genres, ...favoriteArtists.map((artist) => artist.name).filter(Boolean)];
  if (!queries.length) return [];
  const key = queries.join('|');
  const cached = similarArtistCache.get(key);
  if (cached) return cached;

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
  const result = uniqueById(cards).slice(0, PAGE_LIMIT);
  similarArtistCache.set(key, result);
  return result;
}

/**
 * Get trending tracks for the selected genres using real search results.
 */
export async function fetchTrendingInGenres(genres: string[]): Promise<Track[]> {
  if (!genres.length) return [];
  const key = genres.join('|');
  const cached = trendingTrackCache.get(key);
  if (cached) return cached;
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
  const result = uniqueById(allTracks).slice(0, TRACK_LIMIT);
  trendingTrackCache.set(key, result);
  return result;
}

export { PAGE_LIMIT, TRACK_LIMIT };
