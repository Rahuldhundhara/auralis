import type { Card, TasteArtist, Track } from '@shared/types';

export interface OnboardingLanguage {
  id: string;
  label: string;
  native: string;
  query: string;
  /** A famous, official artist used as the tile artwork. */
  seed: string;
  group: 'India' | 'Global';
  /** Country / region shown in the picker. */
  area: string;
}

export interface OnboardingGenre {
  id: string;
  label: string;
  seed: string;
}

export const ONBOARDING_LANGUAGES: OnboardingLanguage[] = [
  { id: 'hindi', label: 'Hindi', native: 'हिन्दी', query: 'Hindi', seed: 'Arijit Singh', group: 'India', area: 'North India' },
  { id: 'punjabi', label: 'Punjabi', native: 'ਪੰਜਾਬੀ', query: 'Punjabi', seed: 'Diljit Dosanjh', group: 'India', area: 'Punjab' },
  { id: 'haryanvi', label: 'Haryanvi', native: 'हरियाणवी', query: 'Haryanvi', seed: 'Sapna Choudhary', group: 'India', area: 'Haryana' },
  { id: 'bhojpuri', label: 'Bhojpuri', native: 'भोजपुरी', query: 'Bhojpuri', seed: 'Pawan Singh', group: 'India', area: 'Bihar / UP' },
  { id: 'rajasthani', label: 'Rajasthani', native: 'राजस्थानी', query: 'Rajasthani', seed: 'Swaroop Khan', group: 'India', area: 'Rajasthan' },
  { id: 'marathi', label: 'Marathi', native: 'मराठी', query: 'Marathi', seed: 'Ajay Gogavale', group: 'India', area: 'Maharashtra' },
  { id: 'gujarati', label: 'Gujarati', native: 'ગુજરાતી', query: 'Gujarati', seed: 'Aditya Gadhvi', group: 'India', area: 'Gujarat' },
  { id: 'tamil', label: 'Tamil', native: 'தமிழ்', query: 'Tamil', seed: 'Anirudh Ravichander', group: 'India', area: 'Tamil Nadu' },
  { id: 'telugu', label: 'Telugu', native: 'తెలుగు', query: 'Telugu', seed: 'Sid Sriram', group: 'India', area: 'Andhra / Telangana' },
  { id: 'malayalam', label: 'Malayalam', native: 'മലയാളം', query: 'Malayalam', seed: 'K. J. Yesudas', group: 'India', area: 'Kerala' },
  { id: 'kannada', label: 'Kannada', native: 'ಕನ್ನಡ', query: 'Kannada', seed: 'Puneeth Rajkumar', group: 'India', area: 'Karnataka' },
  { id: 'bengali', label: 'Bengali', native: 'বাংলা', query: 'Bengali', seed: 'Anupam Roy', group: 'India', area: 'West Bengal' },
  { id: 'assamese', label: 'Assamese', native: 'অসমীয়া', query: 'Assamese', seed: 'Zubeen Garg', group: 'India', area: 'Assam' },
  { id: 'odia', label: 'Odia', native: 'ଓଡ଼ିଆ', query: 'Odia', seed: 'Human Sagar', group: 'India', area: 'Odisha' },
  { id: 'urdu', label: 'Urdu', native: 'اردو', query: 'Urdu', seed: 'Atif Aslam', group: 'India', area: 'North India' },
  { id: 'nepali', label: 'Nepali', native: 'नेपाली', query: 'Nepali', seed: 'Nepali', group: 'India', area: 'Nepal' },
  { id: 'english', label: 'English', native: 'English', query: 'English', seed: 'Taylor Swift', group: 'Global', area: 'Global' },
  { id: 'spanish', label: 'Spanish', native: 'Español', query: 'Spanish', seed: 'Bad Bunny', group: 'Global', area: 'Latin America / Spain' },
  { id: 'portuguese', label: 'Portuguese', native: 'Português', query: 'Portuguese', seed: 'Anitta', group: 'Global', area: 'Brazil / Portugal' },
  { id: 'french', label: 'French', native: 'Français', query: 'French', seed: 'Indila', group: 'Global', area: 'France' },
  { id: 'german', label: 'German', native: 'Deutsch', query: 'German', seed: 'Rammstein', group: 'Global', area: 'Germany' },
  { id: 'korean', label: 'Korean', native: '한국어', query: 'Korean', seed: 'BTS', group: 'Global', area: 'South Korea' },
  { id: 'japanese', label: 'Japanese', native: '日本語', query: 'Japanese', seed: 'YOASOBI', group: 'Global', area: 'Japan' },
  { id: 'arabic', label: 'Arabic', native: 'العربية', query: 'Arabic', seed: 'Amr Diab', group: 'Global', area: 'Middle East / North Africa' },
  { id: 'turkish', label: 'Turkish', native: 'Türkçe', query: 'Turkish', seed: 'Tarkan', group: 'Global', area: 'Türkiye' },
  { id: 'indonesian', label: 'Indonesian', native: 'Bahasa Indonesia', query: 'Indonesian', seed: 'Raisa', group: 'Global', area: 'Indonesia' },
  { id: 'thai', label: 'Thai', native: 'ไทย', query: 'Thai', seed: 'Thai', group: 'Global', area: 'Thailand' },
];

/** Genres shown as chips on the first setup step. */
export const ONBOARDING_GENRES: OnboardingGenre[] = [
  { id: 'bollywood', label: 'Bollywood', seed: 'Arijit Singh' },
  { id: 'indie', label: 'Indie', seed: 'Arijit Singh' },
  { id: 'pop', label: 'Pop', seed: 'Taylor Swift' },
  { id: 'hiphop', label: 'Hip-Hop', seed: 'Bad Bunny' },
  { id: 'rock', label: 'Rock', seed: 'Rammstein' },
  { id: 'classical', label: 'Classical', seed: 'K. J. Yesudas' },
  { id: 'romance', label: 'Romance', seed: 'Pritam' },
  { id: 'party', label: 'Party', seed: 'Diljit Dosanjh' },
  { id: 'devotional', label: 'Devotional', seed: 'Anuradha Paudwal' },
  { id: 'lofi', label: 'Lo-Fi', seed: 'LoFi' },
  { id: 'jazz', label: 'Jazz', seed: 'Norah Jones' },
  { id: 'electronic', label: 'Electronic', seed: 'Alan Walker' },
  { id: 'folk', label: 'Folk', seed: 'Swaroop Khan' },
  { id: 'podcast', label: 'Podcasts & spoken', seed: 'Podcast' },
];

export const MAX_TASTE_ARTISTS = 8;

/** Puts the listener's region first, using the account/device region setting. */
export function sortLanguagesForRegion(
  languages: OnboardingLanguage[],
  region?: string,
): OnboardingLanguage[] {
  const code = (region || '').toUpperCase();
  const india = /^(IN|NP|BD|LK|PK)$/.test(code);
  return [...languages].sort((a, b) => {
    const aMatch = india ? a.group === 'India' : a.group === 'Global';
    const bMatch = india ? b.group === 'India' : b.group === 'Global';
    if (aMatch !== bMatch) return aMatch ? -1 : 1;
    return 0;
  });
}

const LANGUAGE_LOOKUP = new Map(ONBOARDING_LANGUAGES.map((language) => [language.id, language]));

export function artistMeta(subtitle?: string): string {
  if (!subtitle) return 'Artist';
  const cleaned = subtitle.replace(/^Artist\s*[·•]\s*/i, '').trim();
  const audience = cleaned.match(/^([\d.,]+[KMB]?)\s+(monthly audience|subscribers)/i);
  if (audience) {
    return audience[2].toLowerCase() === 'subscribers'
      ? `${audience[1]} subscribers`
      : `${audience[1]} monthly`;
  }
  return cleaned.length > 22 ? `${cleaned.slice(0, 21)}…` : cleaned;
}

export function isSameArtist(left: TasteArtist, right: TasteArtist): boolean {
  return left.id === right.id || normalizeName(left.name) === normalizeName(right.name);
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

function cardToArtist(card: Card | undefined): TasteArtist | undefined {
  const id = (card?.browseId || card?.id || '').trim();
  const name = (card?.title || '').trim();
  if (!id || !name) return undefined;
  return {
    id,
    name,
    thumbnail: card?.thumbnail,
    subtitle: card?.subtitle?.trim() || undefined,
  };
}

function collector() {
  const byName = new Map<string, TasteArtist>();
  const byId = new Set<string>();
  return {
    add(artist: TasteArtist | undefined) {
      if (!artist) return;
      const key = normalizeName(artist.name);
      const existing = byName.get(key);
      if (existing) {
        if (!existing.thumbnail && artist.thumbnail) existing.thumbnail = artist.thumbnail;
        if ((!existing.subtitle || existing.subtitle === 'Artist') && artist.subtitle) existing.subtitle = artist.subtitle;
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

/** Finds one official artist card by name for a language/genre tile. */
export async function artistCover(seed: string): Promise<string | undefined> {
  try {
    const result = await window.auralis.yt.search(seed, 'artists');
    const first = normalizeName(seed).split(' ')[0];
    const match = (result.artists || []).find(
      (card) => card.thumbnail && normalizeName(card.title).includes(first),
    );
    return match?.thumbnail;
  } catch {
    return undefined;
  }
}

export async function languageCover(language: OnboardingLanguage): Promise<string | undefined> {
  return artistCover(language.seed);
}

/** Artists inferred from the signed-in Google/YouTube Music account. */
export async function accountTasteSuggestions(): Promise<TasteArtist[]> {
  const found = collector();
  try {
    const page = await window.auralis.yt.history();
    const tracks: Track[] = page ? extractTracks(page) : [];
    const names = [...new Set(tracks.flatMap((track) => (track.artists || []).map((artist) => artist.name)))].slice(0, 6);
    const results = await Promise.allSettled(names.map((name) => window.auralis.yt.search(name, 'artists')));
    for (const entry of results) {
      if (entry.status !== 'fulfilled') continue;
      for (const card of (entry.value.artists || []).slice(0, 1)) found.add(cardToArtist(card));
    }
  } catch {
    // Account history is optional; local library still contributes below.
  }
  return found.values().filter((artist) => Boolean(artist.thumbnail)).slice(0, 8);
}

function extractTracks(page: any): Track[] {
  const tracks: Track[] = [];
  for (const shelf of page?.shelves || []) {
    for (const card of shelf?.items || []) {
      if (card?.track) tracks.push(card.track as Track);
    }
  }
  return tracks;
}

/** Builds a real artist pool for the languages the listener picked. */
export async function loadTasteArtistCandidates(languageIds: string[]): Promise<TasteArtist[]> {
  const languages = languageIds
    .map((id) => LANGUAGE_LOOKUP.get(id))
    .filter((language): language is OnboardingLanguage => Boolean(language));
  const searches = languages.map(async (language) => {
    const results = await Promise.allSettled([
      window.auralis.yt.search(`${language.query} top artists`, 'artists'),
      artistCoverTerms(language.seed),
    ]);
    const cards: Card[] = [];
    for (const entry of results) {
      if (entry.status === 'fulfilled') {
        cards.push(...(Array.isArray(entry.value) ? entry.value : entry.value.artists || []));
      }
    }
    return cards;
  });
  const settled = await Promise.allSettled(searches);
  const found = collector();
  for (const entry of settled) {
    if (entry.status !== 'fulfilled') continue;
    for (const card of entry.value.slice(0, 10)) found.add(cardToArtist(card));
  }
  const account = await accountTasteSuggestions();
  for (const artist of account) found.add(artist);
  const artists = found.values().filter((artist) => Boolean(artist.thumbnail));
  if (!artists.length) throw new Error('YouTube Music did not return any artists. Check your connection and try again.');
  return artists.slice(0, 72);
}

async function artistCoverTerms(seed: string): Promise<Card[]> {
  try {
    const result = await window.auralis.yt.search(seed, 'artists');
    return result.artists || [];
  } catch {
    return [];
  }
}
