import type { LibraryData, PlayEvent, Track } from '@shared/types';

/**
 * The local recommender. Spotify-style ranking built entirely from the
 * signals Auralis already records — play events (completed vs skipped),
 * liked songs, downloads and the recent list — with no account required.
 *
 * Three jobs:
 *  1. A taste profile: artist affinities, repeat favourites, skip-prone
 *     artists and diverse seed tracks.
 *  2. Radio curation: shape the raw YouTube radio pages so the queue
 *     avoids repeats and junk, favours liked artists and never stacks
 *     one artist back to back.
 *  3. "Made for you" mixes: On repeat + a daily Discover mix of songs
 *     the listener has never played.
 */

const DAY_MS = 86_400_000;
/** Recency half-life: an event from 14 days ago counts half as much. */
const HALF_LIFE_DAYS = 14;
/** Events inside this window are treated as "just heard" for repeat-avoidance. */
const REPEAT_AVOID_DAYS = 7;
/** Skips recorded before this much listening are still skip signals. */
const MAX_EVENTS = 500;

export interface TasteProfile {
  /** Normalised 0..1 affinity per artist name (lowercased). */
  artistAffinity: Map<string, number>;
  /** Artists the listener keeps skipping — dropped from radio queues. */
  skipArtists: Set<string>;
  /** Every track id with a recorded play event. */
  playedIds: Set<string>;
  /** Track ids played inside the repeat-avoidance window. */
  recentIds: Set<string>;
  /** Song identities (normalised title+artist) ever played, across uploads. */
  playedKeys: Set<string>;
  /** Song identities played inside the repeat-avoidance window. */
  recentKeys: Set<string>;
  /** Tracks the listener keeps finishing, best first. */
  onRepeat: Track[];
  /** Diverse, high-affinity seeds for starting radio sessions. */
  seedTracks: Track[];
  /** Strongest artists, best first. */
  topArtists: Array<{ name: string; score: number }>;
}

const EMPTY_PROFILE: TasteProfile = {
  artistAffinity: new Map(),
  skipArtists: new Set(),
  playedIds: new Set(),
  recentIds: new Set(),
  playedKeys: new Set(),
  recentKeys: new Set(),
  onRepeat: [],
  seedTracks: [],
  topArtists: [],
};

const key = (value: string) => value.trim().toLowerCase();

/** Normalised title: case, parenthetical and bracket noise removed. */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\((?:[^)]*)\)|\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Collapse whitespace/punctuation noise so "Song (Live)" can't dodge dedupe. */
export function trackKey(track: Pick<Track, 'title' | 'artists'>): string {
  return `${key(track.artists[0]?.name || '')}|${titleKey(track.title)}`;
}

function recencyWeight(playedAt: number, now: number): number {
  const days = Math.max(0, (now - playedAt) / DAY_MS);
  return Math.pow(0.5, days / HALF_LIFE_DAYS);
}

/**
 * Builds the profile. Events are the strongest signal: finishing a song
 * is a plus, bailing after 4+ seconds is a skip. Likes and downloads are
 * persistent taste, the recent list is a light touch.
 */
export function buildTasteProfile(library: LibraryData, now = Date.now()): TasteProfile {
  const events = (library.events || []).slice(0, MAX_EVENTS);
  if (!events.length && !library.liked.length && !library.downloads.length) return EMPTY_PROFILE;

  const raw = new Map<string, number>();
  const skipStats = new Map<string, { skips: number; plays: number }>();
  const playedIds = new Set<string>();
  const recentIds = new Set<string>();
  const playedKeys = new Set<string>();
  const recentKeys = new Set<string>();
  const completions = new Map<string, { count: number; lastAt: number; event: PlayEvent }>();

  for (const event of events) {
    playedIds.add(event.trackId);
    if (now - event.playedAt <= REPEAT_AVOID_DAYS * DAY_MS) recentIds.add(event.trackId);
    const identity = trackKey({ title: event.title, artists: [{ name: event.artist }] });
    playedKeys.add(identity);
    if (now - event.playedAt <= REPEAT_AVOID_DAYS * DAY_MS) recentKeys.add(identity);
    const artistKey = key(event.artist);
    const weight = recencyWeight(event.playedAt, now);
    const delta = (event.completed ? 1 : -0.6) * weight;
    raw.set(artistKey, (raw.get(artistKey) || 0) + delta);
    const stats = skipStats.get(artistKey) || { skips: 0, plays: 0 };
    stats.plays += 1;
    if (!event.completed) stats.skips += 1;
    skipStats.set(artistKey, stats);
    if (event.completed) {
      const entry = completions.get(event.trackId);
      if (entry) {
        entry.count += 1;
        entry.lastAt = Math.max(entry.lastAt, event.playedAt);
      } else {
        completions.set(event.trackId, { count: 1, lastAt: event.playedAt, event });
      }
    }
  }

  for (const track of library.liked) {
    if (!track) continue;
    raw.set(key(track.artists[0]?.name || ''), (raw.get(key(track.artists[0]?.name || '')) || 0) + 2.5);
  }
  for (const download of library.downloads || []) {
    const track = download.track;
    if (!track) continue;
    raw.set(key(track.artists[0]?.name || ''), (raw.get(key(track.artists[0]?.name || '')) || 0) + 1.5);
  }
  for (const track of library.recent || []) {
    if (!track) continue;
    raw.set(key(track.artists[0]?.name || ''), (raw.get(key(track.artists[0]?.name || '')) || 0) + 0.3);
  }

  const scores = [...raw.values()].filter((value) => value > 0);
  const max = Math.max(0.001, ...scores);
  const artistAffinity = new Map<string, number>();
  for (const [name, value] of raw) {
    if (value > 0) artistAffinity.set(name, Math.min(1, value / max));
  }

  const skipArtists = new Set<string>();
  for (const [name, stats] of skipStats) {
    if (stats.plays >= 3 && stats.skips / stats.plays >= 0.6 && (raw.get(name) || 0) < 0) {
      skipArtists.add(name);
    }
  }

  const topArtists = [...artistAffinity.entries()]
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  // On repeat: completed plays, ranked by completions and recency, resolved
  // to full Track objects so they are playable.
  const trackIndex = new Map<string, Track>();
  for (const track of [...library.recent, ...library.liked]) {
    if (track?.id && !trackIndex.has(track.id)) trackIndex.set(track.id, track);
  }
  const onRepeat: Track[] = [];
  for (const [trackId, entry] of [...completions.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].lastAt - a[1].lastAt)
    .slice(0, 10)) {
    const known = trackIndex.get(trackId);
    onRepeat.push(
      known ||
        ({
          id: trackId,
          type: entry.event.album ? 'song' : 'song',
          title: entry.event.title,
          artists: [{ name: entry.event.artist }],
          album: entry.event.album ? { name: entry.event.album } : undefined,
          duration: entry.event.duration,
          source: 'youtube',
        } as Track),
    );
  }

  // Seeds: liked first, then repeats, then downloads — max 2 per artist so a
  // single heavy artist cannot own every radio session.
  const perArtist = new Map<string, number>();
  const seedTracks: Track[] = [];
  const candidates = [...library.liked, ...onRepeat, ...(library.downloads || []).map((d) => d.track)].filter(Boolean) as Track[];
  const seen = new Set<string>();
  for (const track of candidates) {
    if (seen.has(track.id)) continue;
    const artistKey = key(track.artists[0]?.name || '');
    const count = perArtist.get(artistKey) || 0;
    if (count >= 2) continue;
    seen.add(track.id);
    perArtist.set(artistKey, count + 1);
    seedTracks.push(track);
    if (seedTracks.length >= 10) break;
  }

  return { artistAffinity, skipArtists, playedIds, recentIds, playedKeys, recentKeys, onRepeat, seedTracks, topArtists };
}

/**
 * Stable per-library memo: recomputed only when the signals change size.
 * The player store calls this on every radio page, so it must be cheap.
 */
let cachedProfile: TasteProfile | undefined;
let cachedSignature = '';
export function tasteProfile(library: LibraryData): TasteProfile {
  const signature = `${library.events?.length || 0}:${library.liked?.length || 0}:${library.recent?.length || 0}:${library.downloads?.length || 0}`;
  if (signature === cachedSignature && cachedProfile) return cachedProfile;
  cachedSignature = signature;
  cachedProfile = buildTasteProfile(library);
  return cachedProfile;
}

/** 0..1 affinity for the first artist of a track. */
export function artistScore(profile: TasteProfile, track: Track): number {
  return profile.artistAffinity.get(key(track.artists[0]?.name || '')) || 0;
}

export interface CurateOptions {
  /** Title of the song that seeded this station. */
  seedTitle?: string;
  /** Primary artist of the seed. */
  seedArtist?: string;
}

/**
 * Shapes a raw radio page into something worth queueing. YouTube's order is
 * kept (it is the relevance signal) subject to:
 *  - no duplicates by video id or normalised title+artist
 *  - no songs from the repeat-avoidance window, across uploads of the same song
 *  - skip-prone artists filtered out entirely
 *  - covers/variants of the seed song (same normalised title, different
 *    artist) are dropped — the listener picked one exact performance, so
 *    every other upload of that same-named song is noise
 *  - one artist never back-to-back where the data allows it
 *  - an artist at most 3 times per page
 *  - when the profile is strong, up to three loved-artist tracks anchor the
 *    front of the page so a session opens familiar before it explores
 */
export function curateRadioTracks(
  incoming: Track[],
  profile: TasteProfile,
  now = Date.now(),
  options: CurateOptions = {},
): Track[] {
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const artistCount = new Map<string, number>();
  const out: Track[] = [];
  const pending: Track[] = [];
  const strongProfile = profile.topArtists.length >= 3;
  const seedKey = options.seedTitle ? titleKey(options.seedTitle) : '';
  const seedArtistKey = key(options.seedArtist || '');

  const artistOf = (track: Track) => key(track.artists[0]?.name || '');

  const push = (track: Track): void => {
    out.push(track);
    artistCount.set(artistOf(track), (artistCount.get(artistOf(track)) || 0) + 1);
  };

  const accepted: Array<{ track: Track; loved: boolean }> = [];
  for (const track of incoming) {
    if (!track?.id || seenIds.has(track.id)) continue;
    const dedupeKey = trackKey(track);
    if (seenKeys.has(dedupeKey) || profile.recentKeys.has(dedupeKey)) continue;
    if (profile.recentIds.has(track.id)) continue;
    const artistKey = artistOf(track);
    if (profile.skipArtists.has(artistKey)) continue;
    if ((artistCount.get(artistKey) || 0) >= 3) continue;
    if (seedKey && titleKey(track.title) === seedKey && artistKey !== seedArtistKey) continue;
    accepted.push({ track, loved: strongProfile && artistScore(profile, track) >= 0.5 });
    seenIds.add(track.id);
    seenKeys.add(dedupeKey);
  }

  // Familiar anchors first (stable), then YouTube's relevance order.
  const ordered = [
    ...accepted.filter((entry) => entry.loved).slice(0, 3).map((entry) => entry.track),
    ...accepted.filter((entry) => !entry.loved).map((entry) => entry.track),
    ...accepted.filter((entry) => entry.loved).slice(3).map((entry) => entry.track),
  ];

  // Greedy interleave: a track that would repeat the last artist waits in
  // `pending` and jumps in at the first later slot with a different artist.
  for (const track of ordered) {
    if ((artistCount.get(artistOf(track)) || 0) >= 3) continue;
    const last = out[out.length - 1];
    if (last && artistOf(last) === artistOf(track)) {
      pending.push(track);
      continue;
    }
    push(track);
    for (let index = 0; index < pending.length; ) {
      const candidate = pending[index];
      if ((artistCount.get(artistOf(candidate)) || 0) >= 3) {
        pending.splice(index, 1);
        continue;
      }
      if (artistOf(out[out.length - 1]) === artistOf(candidate)) {
        index += 1;
        continue;
      }
      pending.splice(index, 1);
      push(candidate);
    }
  }
  // Whatever is left over (single-artist data) still queues, cap permitting.
  for (const track of pending) {
    if ((artistCount.get(artistOf(track)) || 0) >= 3) continue;
    push(track);
  }
  return out;
}

export interface MixResult {
  title: string;
  subtitle: string;
  tracks: Track[];
}

/** "On repeat": the listener's most-finished songs, ready to play. */
export function onRepeatMix(profile: TasteProfile): MixResult | null {
  const tracks = profile.onRepeat.slice(0, 10);
  if (tracks.length < 3) return null;
  return {
    title: 'On repeat',
    subtitle: 'Songs you keep coming back to',
    tracks,
  };
}

/**
 * "Discover mix": songs from the listener's taste radius they have never
 * played. Seeded from a rotating profile seed so the mix changes daily,
 * filled from the real YouTube radio for that seed.
 */
export function discoverSeed(profile: TasteProfile): Track | null {
  const seeds = profile.seedTracks;
  if (!seeds.length) return null;
  const day = Math.floor(Date.now() / DAY_MS);
  // Prefer a strong artist, but rotate through the top seeds day by day.
  const ordered = [...seeds].sort(
    (a, b) => artistScore(profile, b) - artistScore(profile, a),
  );
  const strong = ordered.slice(0, Math.min(5, ordered.length));
  return strong[day % strong.length] || seeds[0];
}
