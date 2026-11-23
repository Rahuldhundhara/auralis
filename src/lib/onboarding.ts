import type { Card, TasteArtist } from '@shared/types';

/** Languages offered by the two-step taste onboarding. */
export interface OnboardingLanguage {
  id: string;
  label: string;
  native: string;
  /** Search phrase used to discover real artists in this language. */
  query: string;
  group: 'India' | 'Global';
}

export const ONBOARDING_LANGUAGES: OnboardingLanguage[] = [
  { id: 'hindi', label: 'Hindi', native: 'हिन्दी', query: 'Hindi', group: 'India' },
  { id: 'punjabi', label: 'Punjabi', native: 'ਪੰਜਾਬੀ', query: 'Punjabi', group: 'India' },
  { id: 'tamil', label: 'Tamil', native: 'தமிழ்', query: 'Tamil', group: 'India' },
  { id: 'telugu', label: 'Telugu', native: 'తెలుగు', query: 'Telugu', group: 'India' },
  { id: 'malayalam', label: 'Malayalam', native: 'മലയാളം', query: 'Malayalam', group: 'India' },
  { id: 'kannada', label: 'Kannada', native: 'ಕನ್ನಡ', query: 'Kannada', group: 'India' },
  { id: 'marathi', label: 'Marathi', native: 'मराठी', query: 'Marathi', group: 'India' },
  { id: 'bengali', label: 'Bengali', native: 'বাংলা', query: 'Bengali', group: 'India' },
  { id: 'gujarati', label: 'Gujarati', native: 'ગુજરાતી', query: 'Gujarati', group: 'India' },
  { id: 'bhojpuri', label: 'Bhojpuri', native: 'भोजपुरी', query: 'Bhojpuri', group: 'India' },
  { id: 'urdu', label: 'Urdu', native: 'اردو', query: 'Urdu', group: 'India' },
  { id: 'english', label: 'English', native: 'English', query: 'English', group: 'Global' },
  { id: 'spanish', label: 'Spanish', native: 'Español', query: 'Spanish', group: 'Global' },
  { id: 'korean', label: 'Korean', native: '한국어', query: 'Korean', group: 'Global' },
  { id: 'japanese', label: 'Japanese', native: '日本語', query: 'Japanese', group: 'Global' },
  { id: 'arabic', label: 'Arabic', native: 'العربية', query: 'Arabic', group: 'Global' },
  { id: 'french', label: 'French', native: 'Français', query: 'French', group: 'Global' },
  { id: 'indonesian', label: 'Indonesian', native: 'Bahasa Indonesia', query: 'Indonesian', group: 'Global' },
];

export const MAX_TASTE_ARTISTS = 8;

const LANGUAGE_LOOKUP = new Map(ONBOARDING_LANGUAGES.map((language) => [language.id, language]));

export function languageLabel(id: string): string {
  return LANGUAGE_LOOKUP.get(id)?.label || id;
}

export function languageLabels(ids: string[]): string[] {
  return ids.map(languageLabel);
}

/** Compact label for cards and settings rows, e.g. "Hindi, Punjabi +2". */
export function languageSummary(ids: string[], limit = 3): string {
  const labels = languageLabels(ids);
  if (!labels.length) return '';
  if (labels.length <= limit) return labels.join(', ');
  return `${labels.slice(0, limit).join(', ')} +${labels.length - limit}`;
}

/**
 * Turns YouTube Music's "Artist • 715M monthly audience" subtitle into a short
 * label that fits an onboarding tile without cutting off mid-word.
 */
export function artistMeta(subtitle?: string): string {
  if (!subtitle) return 'Artist';
  const cleaned = subtitle.replace(/^Artist\s*[·•]\s*/i, '').trim();
  const audience = cleaned.match(/^([\d.,]+[KMB]?)\s+(monthly audience|subscribers)/i);
  if (audience) {
    return audience[2].toLowerCase() === 'subscribers'
      ? `${audience[1]} subscribers`
      : `${audience[1]} monthly`;
  }
  return cleaned.length > 24 ? `${cleaned.slice(0, 23)}…` : cleaned;
}

export function isSameArtist(left: TasteArtist, right: TasteArtist): boolean {
  return left.id === right.id || normalizeName(left.name) === normalizeName(right.name);
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

function cardToArtist(card: Card): TasteArtist | null {
  const id = (card.browseId || card.id || '').trim();
  const name = (card.title || '').trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    thumbnail: card.thumbnail,
    subtitle: card.subtitle?.trim() || undefined,
  };
}

function createCollector() {
  const byName = new Map<string, TasteArtist>();
  const byId = new Set<string>();

  return {
    add(artist: TasteArtist | null) {
      if (!artist) return;
      const key = normalizeName(artist.name);
      const existing = byName.get(key);
      if (existing) {
        // Prefer the richer search result (monthly audience) and a real photo.
        if ((!existing.subtitle || existing.subtitle === 'Artist') && artist.subtitle) {
          existing.subtitle = artist.subtitle;
        }
        if (!existing.thumbnail && artist.thumbnail) existing.thumbnail = artist.thumbnail;
        return;
      }
      if (byId.has(artist.id)) return;
      byId.add(artist.id);
      byName.set(key, artist);
    },
    values() {
      return [...byName.values()];
    },
  };
}

/**
 * Builds a real artist pool from the charts shelf plus artist searches for the
 * languages the listener picked. Individual requests may fail; the pool is
 * only considered failed when every source comes back empty.
 */
export async function loadTasteArtistCandidates(languageIds: string[]): Promise<TasteArtist[]> {
  const languages = languageIds
    .map((id) => LANGUAGE_LOOKUP.get(id))
    .filter((language): language is OnboardingLanguage => Boolean(language));

  const searches = languages.map((language) =>
    window.auralis.yt
      .search(`${language.query} top artists`, 'artists')
      .then((result) => result.artists)
      .catch(() => [] as Card[]),
  );
  const charts = window.auralis.yt.charts().catch(() => undefined);

  const [searchResults, chartPage] = await Promise.all([Promise.all(searches), charts]);

  const collector = createCollector();

  // Language matches come first so a Tamil or Punjabi pick is visible without
  // scrolling through the global chart names.
  for (const artists of searchResults) {
    for (const card of artists.slice(0, 8)) {
      collector.add(cardToArtist(card));
    }
  }

  if (chartPage) {
    const topArtists = chartPage.shelves.find((shelf) => /top artists/i.test(shelf.title || ''));
    for (const card of topArtists?.items.slice(0, 24) || []) {
      collector.add(cardToArtist(card));
    }
  }

  const artists = collector.values();
  if (!artists.length) {
    throw new Error('YouTube Music did not return any artists. Check your connection and try again.');
  }
  return artists.slice(0, 72);
}
