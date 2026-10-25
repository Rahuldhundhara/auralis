import {
  ArrowDown,
  ArrowUp,
  Disc3,
  Download,
  FolderCheck,
  Heart,
  HeartOff,
  Link2,
  ListEnd,
  ListMusic,
  ListPlus,
  Play,
  Radio,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type { Card, NavEndpoint, Track } from '@shared/types';
import type { BrowsePage } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { toast } from '../stores/ui';
import { artistsLine } from './format';

export interface TrackMenuContext {
  albumId?: string;
  playlistId?: string;
  localPlaylistId?: string;
  queueIndex?: number;
  trackIndex?: number;
}

export function tracksFromPage(page: BrowsePage | undefined): Track[] {
  if (!page) return [];
  const seen = new Set<string>();
  const output: Track[] = [];
  for (const shelf of page.shelves) {
    for (const item of shelf.items) {
      const track = item.track;
      if (!track || seen.has(track.id)) continue;
      seen.add(track.id);
      output.push(track);
    }
  }
  return output;
}

export function queueForShelf(cards: Card[]): Track[] {
  return cards.map((card) => card.track).filter((track): track is Track => Boolean(track?.id));
}

export function trackFromCard(card: Card): Track | undefined {
  if (card.track) return card.track;
  if (['song', 'video', 'episode'].includes(card.type)) {
    return {
      id: card.id,
      type: card.type === 'video' ? 'video' : card.type === 'episode' ? 'episode' : 'song',
      title: card.title,
      artists: card.artists || (card.subtitle ? [{ name: card.subtitle.split('•')[0].trim() }] : []),
      thumbnail: card.thumbnail,
      duration: 0,
      isVideo: card.type === 'video',
    };
  }
  return undefined;
}

export function openCard(card: Card) {
  if (card.track || ['song', 'video', 'episode'].includes(card.type)) {
    void playCard(card);
    return;
  }
  const id = card.browseId || card.id;
  if (card.type === 'album' || card.type === 'single' || card.type === 'ep') {
    useNavStore.getState().navigate({ page: 'album', id });
  } else if (card.type === 'artist') {
    useNavStore.getState().navigate({ page: 'artist', id });
  } else if (card.type === 'playlist') {
    useNavStore.getState().navigate({ page: 'playlist', id });
  } else if (card.type === 'podcast') {
    useNavStore.getState().navigate({ page: 'podcast', id });
  } else if (card.type === 'profile') {
    useNavStore.getState().navigate({ page: 'artist', id });
  } else {
    useNavStore.getState().navigate({ page: 'browse', id, params: card.params, title: card.title });
  }
}

async function fetchPageForCard(card: Card): Promise<BrowsePage | undefined> {
  const id = card.browseId || card.id;
  if (card.type === 'album' || card.type === 'single' || card.type === 'ep') return window.auralis.yt.album(id);
  if (card.type === 'playlist') return window.auralis.yt.playlist(id);
  if (card.type === 'artist') return window.auralis.yt.artist(id);
  if (card.type === 'podcast') return window.auralis.yt.browse(id);
  return undefined;
}

export async function playCard(card: Card, queue?: Track[], index = 0) {
  const direct = trackFromCard(card);
  if (direct) {
    const list = queue?.length ? queue : [direct];
    const start = queue?.length ? Math.max(0, index) : 0;
    usePlayerStore.getState().playQueue(list, start);
    return;
  }
  try {
    const page = await fetchPageForCard(card);
    const tracks = tracksFromPage(page);
    if (!tracks.length) {
      toast('This release has no playable tracks.', 'error');
      return;
    }
    usePlayerStore.getState().playQueue(tracks, 0);
  } catch (error: any) {
    toast(`Could not play “${card.title}”: ${error?.message || error}`, 'error');
  }
}

export async function shuffleCard(card: Card) {
  const direct = trackFromCard(card);
  if (direct) {
    usePlayerStore.getState().playQueue([direct], 0);
    return;
  }
  try {
    const page = await fetchPageForCard(card);
    const tracks = tracksFromPage(page);
    if (!tracks.length) return;
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    usePlayerStore.getState().playQueue(shuffled, 0);
  } catch (error: any) {
    toast(`Could not start shuffle: ${error?.message || error}`, 'error');
  }
}

export async function queueCardNext(card: Card) {
  const direct = trackFromCard(card);
  if (direct) {
    usePlayerStore.getState().playNext(direct);
    return;
  }
  try {
    const page = await fetchPageForCard(card);
    const tracks = tracksFromPage(page);
    const player = usePlayerStore.getState();
    if (!tracks.length) return;
    const queue = [...player.queue];
    queue.splice(player.index + 1, 0, ...tracks);
    usePlayerStore.setState({ queue });
    toast(`Queued ${tracks.length} tracks to play next.`, 'success');
  } catch (error: any) {
    toast(`Could not queue this release: ${error?.message || error}`, 'error');
  }
}

export function playPage(page: BrowsePage | undefined) {
  const tracks = tracksFromPage(page);
  if (!tracks.length) {
    toast('No playable songs on this page.', 'error');
    return;
  }
  usePlayerStore.getState().playQueue(tracks, 0);
}

export function shufflePage(page: BrowsePage | undefined) {
  const tracks = tracksFromPage(page);
  if (!tracks.length) return;
  const shuffled = [...tracks].sort(() => Math.random() - 0.5);
  usePlayerStore.getState().playQueue(shuffled, 0);
}

export async function playEndpoint(endpoint: NavEndpoint | undefined) {
  if (!endpoint) return;
  try {
    if (endpoint.playlistId) {
      const page = await window.auralis.yt.playlist(endpoint.playlistId);
      playPage(page);
      return;
    }
    if (endpoint.videoId) {
      const result = await window.auralis.yt.next(endpoint);
      if (result.tracks.length) {
        const index = Math.max(0, result.currentIndex || 0);
        usePlayerStore.getState().playQueue(result.tracks, index);
      }
      return;
    }
    if (endpoint.browseId) {
      const page = await window.auralis.yt.browseEndpoint(endpoint);
      playPage(page);
    }
  } catch (error: any) {
    toast(`Could not start playback: ${error?.message || error}`, 'error');
  }
}

export function addTrackToQueue(track: Track) {
  usePlayerStore.getState().addToQueue(track);
}

export function playTrackNext(track: Track) {
  usePlayerStore.getState().playNext(track);
}

export function startTrackRadio(track: Track) {
  void usePlayerStore.getState().startRadio(track);
}

export async function toggleLikeTrack(track: Track) {
  try {
    const liked = await useAppStore.getState().toggleLike(track);
    toast(liked ? 'Added to liked songs.' : 'Removed from liked songs.', 'success');
  } catch (error: any) {
    toast(`Could not update liked songs: ${error?.message || error}`, 'error');
  }
}

export async function downloadTrackAction(track: Track) {
  await useAppStore.getState().downloadTrack(track);
}

export function copyTrackLink(track: Track) {
  const link = `https://music.youtube.com/watch?v=${track.id}`;
  void navigator.clipboard
    .writeText(link)
    .then(() => toast('Link copied to clipboard.', 'success'))
    .catch(() => toast('Could not copy the link.', 'error'));
}

export function openArtist(id?: string, name?: string) {
  if (id) {
    useNavStore.getState().navigate({ page: 'artist', id });
    return;
  }
  if (name) useNavStore.getState().navigate({ page: 'search', q: name });
}

export function openAlbum(id?: string) {
  if (id) useNavStore.getState().navigate({ page: 'album', id });
}

export function showTrackMenu(track: Track, event: { clientX: number; clientY: number }, context: TrackMenuContext = {}) {
  const app = useAppStore.getState();
  const player = usePlayerStore.getState();
  const ui = useUiStore.getState();
  const liked = app.isLiked(track.id);
  const localPlaylist = context.localPlaylistId
    ? app.library.playlists.find((playlist) => playlist.id === context.localPlaylistId)
    : undefined;
  const downloaded = app.library.downloads.some((item) => item.track.id === track.id && item.status === 'done');
  const items = [
    { label: 'Play now', icon: Play, onClick: () => player.playQueue([track], 0) },
    { label: 'Play next', icon: ListEnd, onClick: () => player.playNext(track) },
    { label: 'Add to queue', icon: ListPlus, onClick: () => player.addToQueue(track) },
    { label: 'Start radio', icon: Radio, onClick: () => void player.startRadio(track) },
    { separator: true },
    {
      label: liked ? 'Remove from liked songs' : 'Add to liked songs',
      icon: liked ? HeartOff : Heart,
      onClick: () => void toggleLikeTrack(track),
    },
    { label: 'Add to playlist', icon: ListMusic, onClick: () => ui.openDialog({ type: 'add-to-playlist', track }) },
    ...(app.session.hasCookies
      ? [
          {
            label: 'Add to YouTube Music playlist',
            icon: ListPlus,
            onClick: () => ui.openDialog({ type: 'yt-playlist', track }),
          },
        ]
      : []),
    {
      label: downloaded ? 'Show downloaded file' : 'Download',
      icon: downloaded ? FolderCheck : Download,
      onClick: () => {
        if (downloaded) {
          const item = app.library.downloads.find((entry) => entry.track.id === track.id && entry.status === 'done');
          if (item?.path) void window.auralis.app.showItemInFolder(item.path);
        } else {
          void app.downloadTrack(track);
        }
      },
    },
    { separator: true },
    ...(track.album?.id
      ? [{ label: 'Go to album', icon: Disc3, onClick: () => openAlbum(track.album?.id) }]
      : []),
    ...(track.artists?.some((artist) => artist.id)
      ? [
          {
            label: 'Go to artist',
            icon: User,
            onClick: () => {
              const artist = track.artists.find((entry) => entry.id);
              openArtist(artist?.id, artist?.name);
            },
          },
        ]
      : []),
    ...(context.queueIndex !== undefined
      ? [
          {
            label: 'Remove from queue',
            icon: X,
            onClick: () => player.removeQueueAt(context.queueIndex!),
          },
        ]
      : []),
    ...(context.localPlaylistId
      ? [
          ...(context.trackIndex !== undefined
            ? [
                {
                  label: 'Move up',
                  icon: ArrowUp,
                  disabled: context.trackIndex === 0,
                  onClick: () => {
                    void app
                      .reorderPlaylist(context.localPlaylistId!, context.trackIndex!, context.trackIndex! - 1)
                      .catch((error: any) => toast(`Could not reorder: ${error?.message || error}`, 'error'));
                  },
                },
                {
                  label: 'Move down',
                  icon: ArrowDown,
                  disabled: context.trackIndex >= (localPlaylist?.tracks.length ?? 1) - 1,
                  onClick: () => {
                    void app
                      .reorderPlaylist(context.localPlaylistId!, context.trackIndex!, context.trackIndex! + 1)
                      .catch((error: any) => toast(`Could not reorder: ${error?.message || error}`, 'error'));
                  },
                },
                { separator: true },
              ]
            : []),
          {
            label: 'Remove from this playlist',
            icon: Trash2,
            danger: true,
            onClick: () => {
              void app.removeFromPlaylist(context.localPlaylistId!, track.id).then(() => toast('Removed from playlist.'));
            },
          },
        ]
      : []),
    ...(context.playlistId && track.setVideoId && app.session.hasCookies
      ? [
          {
            label: 'Remove from YouTube playlist',
            icon: Trash2,
            danger: true,
            onClick: () => {
              void window.auralis.yt
                .removeFromYTPlaylist(context.playlistId!, track.id, track.setVideoId!)
                .then(() => toast('Removed from the YouTube playlist.', 'success'))
                .catch((error) => toast(`Could not remove the track: ${error?.message || error}`, 'error'));
            },
          },
        ]
      : []),
    { separator: true },
    { label: 'Copy link', icon: Link2, onClick: () => copyTrackLink(track) },
  ];
  ui.openMenu(event.clientX, event.clientY, items);
}

export function showCardMenu(card: Card, event: { clientX: number; clientY: number }) {
  const app = useAppStore.getState();
  const ui = useUiStore.getState();
  const items: any[] = [
    { label: 'Play', icon: Play, onClick: () => void playCard(card) },
    { label: 'Shuffle', icon: ListMusic, onClick: () => void shuffleCard(card) },
    { label: 'Play next', icon: ListEnd, onClick: () => void queueCardNext(card) },
    { separator: true },
  ];
  if (card.type === 'album' || card.type === 'single' || card.type === 'ep') {
    const saved = app.isAlbumSaved(card.id);
    items.push({
      label: saved ? 'Remove from library' : 'Save album',
      icon: saved ? HeartOff : Heart,
      onClick: () => void app.toggleSaveAlbum(card),
    });
    items.push({ label: 'Go to album', icon: Disc3, onClick: () => openCard(card) });
  } else if (card.type === 'artist') {
    const saved = app.isArtistSaved(card.id);
    items.push({
      label: saved ? 'Unfollow artist' : 'Follow artist',
      icon: saved ? HeartOff : Heart,
      onClick: () => void app.toggleSaveArtist(card),
    });
    items.push({ label: 'Go to artist', icon: User, onClick: () => openCard(card) });
  } else if (card.type === 'playlist' || card.type === 'podcast') {
    items.push({ label: 'Open', icon: ListMusic, onClick: () => openCard(card) });
  }
  if (card.track) {
    items.push({ separator: true }, { label: 'Copy link', icon: Link2, onClick: () => copyTrackLink(card.track!) });
  }
  ui.openMenu(event.clientX, event.clientY, items);
}

export function searchFor(text: string) {
  useNavStore.getState().navigate({ page: 'search', q: text });
}

export function artistNames(track: Track): string {
  return artistsLine(track.artists);
}
