import type { LyricsResult, Track } from '@shared/types';

interface CachedLyrics {
  at: number;
  result: LyricsResult | null;
}

const RESULT_TTL = 30 * 60_000;
const EMPTY_TTL = 2 * 60_000;
const cache = new Map<string, CachedLyrics>();
const pending = new Map<string, Promise<LyricsResult | null>>();

function keyFor(track: Track): string {
  return `${track.id}:${track.title}:${(track.artists || []).map((artist) => artist.name).join(',')}`;
}

function fresh(entry: CachedLyrics | undefined): boolean {
  if (!entry) return false;
  return Date.now() - entry.at < (entry.result ? RESULT_TTL : EMPTY_TTL);
}

/** Return a previously fetched result (including a known "no lyrics" result). */
export function peekLyrics(track: Track | undefined): CachedLyrics | undefined {
  if (!track) return undefined;
  const key = keyFor(track);
  const entry = cache.get(key);
  if (!fresh(entry)) {
    cache.delete(key);
    return undefined;
  }
  return entry;
}

/**
 * Fetched lyrics are shared by the background prefetch and the panel. The
 * in-flight map prevents opening the Now Playing panel from starting a second
 * set of provider requests while the prefetch is still running.
 */
export async function fetchLyrics(track: Track, force = false): Promise<LyricsResult | null> {
  const key = keyFor(track);
  if (!force) {
    const entry = cache.get(key);
    if (entry && fresh(entry)) return entry.result;
  }
  const running = pending.get(key);
  if (running) return running;

  const request = window.auralis.lyrics
    .fetch(track, undefined, force)
    .then((result) => {
      cache.set(key, { at: Date.now(), result: result || null });
      return result;
    })
    .finally(() => {
      pending.delete(key);
    });
  pending.set(key, request);
  return request;
}

/** Warm the cache after playback starts so opening Lyrics is usually instant. */
export function prefetchLyrics(track: Track): Promise<LyricsResult | null> {
  return fetchLyrics(track).catch(() => null);
}
