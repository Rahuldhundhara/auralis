import type { BrowsePage, Card, Track } from '@shared/types';
import { shuffleArray } from './format';
import { usePlayerStore } from '../stores/player';
import { toast } from '../stores/ui';

/** YouTube library page that lists every playlist in the signed-in account. */
export const YT_PLAYLIST_BROWSE_ID = 'FEmusic_liked_playlists';
const MAX_PAGES = 12;

/** Strict songs-only filter for history: music videos stay out. */
export function isSongTrack(track: Track | undefined): track is Track {
  return Boolean(track && track.type === 'song' && !track.isVideo);
}

/** Playlists keep official music videos, but drop real videos and episodes. */
export function isPlaylistSong(track: Track | undefined): track is Track {
  return Boolean(track && track.type === 'song');
}

function mergeTracks(current: Track[], next: Track[]): Track[] {
  const seen = new Set(current.map((track) => track.id));
  const output = [...current];
  for (const track of next) {
    if (!track.id || seen.has(track.id)) continue;
    seen.add(track.id);
    output.push(track);
  }
  return output;
}

function tracksFromPage(page: BrowsePage | undefined, predicate: (track: Track | undefined) => track is Track): Track[] {
  if (!page) return [];
  const tracks: Track[] = [];
  for (const shelf of page.shelves) {
    for (const item of shelf.items) {
      if (predicate(item.track)) tracks.push(item.track);
    }
  }
  return mergeTracks([], tracks);
}

export function songTracksFromPage(page: BrowsePage | undefined): Track[] {
  return tracksFromPage(page, isSongTrack);
}

export function playlistCardsFromPage(page: BrowsePage | undefined): Card[] {
  if (!page) return [];
  const seen = new Set<string>();
  const output: Card[] = [];
  for (const shelf of page.shelves) {
    for (const card of shelf.items) {
      if (card.type !== 'playlist' || !card.id || seen.has(card.id)) continue;
      // Episodes for Later is a podcast queue, not a music playlist.
      if (card.id === 'VLSE' || /queued episodes|episodes for later/i.test(`${card.title} ${card.subtitle || ''}`)) continue;
      seen.add(card.id);
      output.push(card);
    }
  }
  return output;
}

/** Account watch history, reduced to playable songs. */
export async function loadYouTubeHistory(): Promise<Track[]> {
  let page = await window.auralis.yt.history();
  let tracks = songTracksFromPage(page);
  let continuation = page.continuation;
  let pages = 0;
  while (continuation && pages < MAX_PAGES) {
    page = await window.auralis.yt.libraryPage('FEmusic_history', undefined, continuation);
    tracks = mergeTracks(tracks, songTracksFromPage(page));
    continuation = page.continuation;
    pages += 1;
  }
  return tracks;
}

/** Every playlist in the account, including auto playlists, deduplicated and paginated. */
export async function loadAllYouTubePlaylists(): Promise<Card[]> {
  let page = await window.auralis.yt.libraryPage(YT_PLAYLIST_BROWSE_ID);
  let cards = playlistCardsFromPage(page);
  let continuation = page.continuation;
  let pages = 0;
  while (continuation && pages < MAX_PAGES) {
    page = await window.auralis.yt.libraryPage(YT_PLAYLIST_BROWSE_ID, undefined, continuation);
    const seen = new Set(cards.map((card) => card.id));
    cards = [...cards, ...playlistCardsFromPage(page).filter((card) => !seen.has(card.id))];
    continuation = page.continuation;
    pages += 1;
  }
  return cards;
}

/** Songs inside one YouTube playlist, with every continuation page followed. */
export async function loadYouTubePlaylistSongs(id: string): Promise<Track[]> {
  const page = await window.auralis.yt.playlist(id);
  // The header count tells us how many real playlist entries exist. The
  // section-list continuation can continue into "recommended" tracks, so stop
  // as soon as we have the promised number.
  const expected = page.header?.trackCount;
  let tracks = tracksFromPage(page, isPlaylistSong);
  if (expected) tracks = tracks.slice(0, expected);
  let continuation = page.continuation;
  let pages = 0;
  while (continuation && pages < MAX_PAGES && (!expected || tracks.length < expected)) {
    const next = await window.auralis.yt.detailContinuation(continuation);
    tracks = mergeTracks(tracks, next.tracks.filter(isPlaylistSong));
    if (expected) tracks = tracks.slice(0, expected);
    continuation = next.continuation;
    pages += 1;
  }
  return tracks;
}

export async function playYouTubePlaylist(id: string, shuffle = false): Promise<void> {
  try {
    const tracks = await loadYouTubePlaylistSongs(id);
    if (!tracks.length) {
      toast('This playlist has no songs to play.', 'info');
      return;
    }
    usePlayerStore
      .getState()
      .playQueue(shuffle ? shuffleArray(tracks) : tracks, 0);
  } catch (error: unknown) {
    toast(`Could not play this playlist: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}
