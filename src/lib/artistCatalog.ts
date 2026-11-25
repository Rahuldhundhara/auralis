import type { Card } from '@shared/types';

/**
 * Curated artist catalog for the onboarding "pick your favorite artists" step.
 *
 * These are REAL, well-known artists grouped by listening category. The grid is
 * not search-only: the user sees the collection immediately and taps cards to
 * select. Search remains as a secondary path for names outside the catalog.
 *
 * Artwork and browse ids are resolved lazily through the real YouTube Music
 * API (`window.auralis.yt.search(..., 'artists')`) and cached — no fake
 * images are ever rendered. Until an image resolves, cards show the artist's
 * initials.
 */

export type ArtistCategoryId =
  | 'hindi'
  | 'punjabi'
  | 'english'
  | 'hiphop'
  | 'kpop'
  | 'latin'
  | 'indie'
  | 'romantic'
  | 'edm'
  | 'classical';

export interface ArtistCategory {
  id: ArtistCategoryId;
  label: string;
}

export const ARTIST_CATEGORIES: ArtistCategory[] = [
  { id: 'hindi', label: 'Hindi & Bollywood' },
  { id: 'punjabi', label: 'Punjabi & Bhangra' },
  { id: 'english', label: 'English Pop' },
  { id: 'hiphop', label: 'Hip-Hop & Rap' },
  { id: 'kpop', label: 'K-Pop' },
  { id: 'latin', label: 'Latin' },
  { id: 'indie', label: 'Indie & Alternative' },
  { id: 'romantic', label: 'Romantic & Soul' },
  { id: 'edm', label: 'EDM & Dance' },
  { id: 'classical', label: 'Classical & Devotionals' },
];

const CATALOG_NAMES: Record<ArtistCategoryId, string[]> = {
  hindi: [
    'Arijit Singh',
    'Shreya Ghoshal',
    'Pritam',
    'Neha Kakkar',
    'Jubin Nautiyal',
    'Atif Aslam',
    'Armaan Malik',
    'Darshan Raval',
    'Sonu Nigam',
    'Sunidhi Chauhan',
    'KK',
    'Ankit Tiwari',
  ],
  punjabi: [
    'Diljit Dosanjh',
    'AP Dhillon',
    'Sidhu Moose Wala',
    'Guru Randhawa',
    'Karan Aujla',
    'Badshah',
    'Yo Yo Honey Singh',
    'Mankirt Aulakh',
    'Ammy Virk',
  ],
  english: [
    'Taylor Swift',
    'The Weeknd',
    'Ed Sheeran',
    'Billie Eilish',
    'Ariana Grande',
    'Dua Lipa',
    'Bruno Mars',
    'Justin Bieber',
    'Adele',
    'Olivia Rodrigo',
  ],
  hiphop: [
    'Eminem',
    'Drake',
    'Kendrick Lamar',
    'Post Malone',
    'Travis Scott',
    'J. Cole',
    'Megan Thee Stallion',
    'Doja Cat',
  ],
  kpop: ['BTS', 'BLACKPINK', 'Stray Kids', 'NewJeans', 'SEVENTEEN', 'TWICE'],
  latin: ['Bad Bunny', 'Shakira', 'Karol G', 'J Balvin', 'Anitta'],
  indie: ['Tame Impala', 'Arctic Monkeys', 'Lana Del Rey', 'The 1975', 'Phoebe Bridgers', 'Cigarettes After Sex'],
  romantic: ['John Legend', 'Shawn Mendes', 'Sade', 'Lewis Capaldi'],
  edm: ['Marshmello', 'Alan Walker', 'David Guetta', 'Martin Garrix', 'Calvin Harris'],
  classical: ['A.R. Rahman', 'Hans Zimmer', 'Lata Mangeshkar', 'Shankar Mahadevan'],
};

export interface CatalogArtist {
  /** Stable catalog identity (lowercase name). */
  key: string;
  name: string;
  category: ArtistCategoryId;
  /** Real YTM browse id, once resolved via search. */
  browseId?: string;
  /** Real YTM thumbnail, once resolved via search. */
  thumbnail?: string;
}

export const CURATED_ARTISTS: CatalogArtist[] = ARTIST_CATEGORIES.flatMap((category) =>
  CATALOG_NAMES[category.id].map((name) => ({
    key: name.toLowerCase(),
    name,
    category: category.id,
  })),
);

/** Map a UI language to the catalog categories it prioritizes. */
const LANGUAGE_CATEGORY_ORDER: Record<string, ArtistCategoryId[]> = {
  hi: ['hindi', 'punjabi', 'romantic', 'classical'],
  pa: ['punjabi', 'hindi'],
  ta: ['hindi', 'english', 'classical'],
  te: ['hindi', 'english'],
  en: ['english', 'hiphop', 'romantic', 'indie', 'edm'],
  es: ['latin', 'english'],
  ko: ['kpop', 'english'],
  ja: ['english', 'kpop'],
  fr: ['english', 'indie', 'romantic'],
  de: ['english', 'edm'],
  pt: ['latin', 'english'],
  ar: ['english', 'romantic'],
  zh: ['kpop', 'english'],
  ru: ['english', 'edm'],
  id: ['english', 'kpop'],
  tr: ['english', 'classical'],
};

/** Map a genre label to the catalog categories it prioritizes. */
const GENRE_CATEGORY_ORDER: Record<string, ArtistCategoryId[]> = {
  Bollywood: ['hindi'],
  Hindi: ['hindi'],
  Punjabi: ['punjabi'],
  Pop: ['english'],
  'Hip-Hop': ['hiphop'],
  'K-Pop': ['kpop'],
  Latin: ['latin'],
  Indie: ['indie'],
  Romantic: ['romantic'],
  EDM: ['edm'],
  Electronic: ['edm'],
  Classical: ['classical'],
  Devotional: ['classical'],
  Sad: ['romantic', 'hindi'],
  'R&B': ['romantic', 'hiphop'],
  Rock: ['english', 'indie'],
};

/**
 * Order the catalog so artists from the user's languages and genres surface
 * first, with the full collection still reachable. Within a priority tier the
 * original editorial order is kept.
 */
export function orderCatalogForPreferences(
  languages: string[],
  genres: string[],
): CatalogArtist[] {
  const priority = new Map<string, number>();
  languages.forEach((language) => {
    (LANGUAGE_CATEGORY_ORDER[language] || []).forEach((category, index) => {
      const rank = index + 1;
      if (!priority.has(category) || (priority.get(category) ?? 99) > rank) priority.set(category, rank);
    });
  });
  genres.forEach((genre) => {
    (GENRE_CATEGORY_ORDER[genre] || []).forEach((category, index) => {
      const rank = index + 3;
      if (!priority.has(category) || (priority.get(category) ?? 99) > rank) priority.set(category, rank);
    });
  });
  return [...CURATED_ARTISTS]
    .map((artist, index) => ({ artist, index, rank: priority.get(artist.category) ?? 50 }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.artist);
}

/** Module-level cache of resolved artwork/browse ids (real YTM data only). */
const resolvedCache = new Map<string, { browseId?: string; thumbnail?: string }>();

/** Read the cached record for an artist (populated by `resolveArtistArt`). */
export function getResolvedArtistArt(name: string): { browseId?: string; thumbnail?: string } {
  return resolvedCache.get(name.toLowerCase()) || {};
}

function pickArtistCard(cards: Card[], name: string): Card | undefined {
  const wanted = name.trim().toLowerCase();
  return (
    cards.find((card) => (card.title || '').trim().toLowerCase() === wanted) ||
    cards.find((card) => (card.title || '').toLowerCase().includes(wanted)) ||
    cards[0]
  );
}

/**
 * Resolve the real thumbnail + browse id for a catalog artist via YTM search.
 * Returns the cached record when already resolved. Never throws.
 */
export async function resolveArtistArt(name: string): Promise<{ browseId?: string; thumbnail?: string }> {
  const key = name.toLowerCase();
  const cached = resolvedCache.get(key);
  if (cached) return cached;
  let record: { browseId?: string; thumbnail?: string } = {};
  try {
    const results = await window.auralis.yt.search(name, 'artists');
    const match = pickArtistCard(results.artists || [], name);
    if (match) {
      record = { browseId: match.browseId || match.id, thumbnail: match.thumbnail };
    }
  } catch {
    record = {};
  }
  resolvedCache.set(key, record);
  return record;
}

/** Resolve artwork for a batch of artists with bounded concurrency. The
 *  optional `onEach` callback fires as soon as each artist resolves, so the
 *  grid can paint real photos progressively instead of waiting for the whole
 *  batch. */
export async function resolveArtistArtBatch(
  names: string[],
  concurrency = 8,
  onEach?: (name: string) => void,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, names.length || 1) }, async () => {
    while (cursor < names.length) {
      const name = names[cursor];
      cursor += 1;
      await resolveArtistArt(name);
      onEach?.(name);
    }
  });
  await Promise.all(workers);
}
