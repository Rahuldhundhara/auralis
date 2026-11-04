import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  Heart,
  Link2,
  ListPlus,
  MoreHorizontal,
  Pencil,
  Play,
  Radio,
  RefreshCw,
  Shuffle,
  Trash2,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import type { BrowseChip, BrowsePage, Card, ChipOption, PageHeader, Shelf as ShelfType, Track } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { confirmDialog, toast, useUiStore } from '../stores/ui';
import { formatLongDuration, shuffleArray } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { tracksFromPage } from '../lib/actions';
import { Artwork, Button, EmptyState, ErrorPanel, IconButton, Modal, PageSkeleton, Spinner } from '../components/primitives';
import { Shelf } from '../components/MediaCard';
import { TrackList } from '../components/TrackList';

export type DetailKind = 'album' | 'playlist' | 'artist' | 'podcast' | 'browse';

interface ActiveFilter {
  /** Played-state chip that is currently applied (In progress / Unplayed / Played). */
  status?: string;
  /** Sort option picked from the "Latest" popup. */
  sort?: string;
  tracks: Track[];
  message?: string;
  continuation?: string;
}

function uniqueTracks(input: Track[]): Track[] {
  const seen = new Set<string>();
  const output: Track[] = [];
  for (const track of input) {
    if (!track?.id || seen.has(track.id)) continue;
    seen.add(track.id);
    output.push(track);
  }
  return output;
}

/** Reads the selected sort option and played-state filter from a chip cloud. */
function selectedChipState(chips: BrowseChip[] | undefined): { status?: string; sort?: string } {
  const state: { status?: string; sort?: string } = {};
  for (const chip of chips || []) {
    if (chip.options?.length) {
      const option = chip.options.find((entry) => entry.selected);
      if (option) state.sort = option.title;
    } else if (chip.selected) {
      state.status = chip.title;
    }
  }
  return state;
}

function findSortOption(chips: BrowseChip[], title: string): ChipOption | undefined {
  for (const chip of chips) {
    const option = chip.options?.find((entry) => entry.title === title);
    if (option) return option;
  }
  return undefined;
}

function isTrackShelf(shelf: ShelfType): boolean {
  return shelf.items.some((item) => Boolean(item.track?.id));
}

function headerCard(header: PageHeader, kind: DetailKind): Card {
  const id = header.browseId || header.id || header.playlistId || '';
  const type: Card['type'] =
    kind === 'artist' ? 'artist' : kind === 'podcast' ? 'podcast' : kind === 'playlist' ? 'playlist' : 'album';
  return {
    type,
    id,
    browseId: header.browseId || header.id,
    title: header.title,
    subtitle: header.author?.name || header.subtitle,
    thumbnail: header.thumbnail,
    round: header.round || kind === 'artist',
    year: header.year,
    trackCount: header.trackCount,
    artists: header.author?.name ? [{ id: header.author.id, name: header.author.name }] : undefined,
  };
}

function metaLine(header: PageHeader | undefined, tracks: Track[]): string[] {
  if (!header) return [];
  const pieces = [...(header.meta || [])].filter(Boolean);
  if (header.trackCount && !pieces.some((piece) => /song|track|episode/i.test(piece))) {
    pieces.push(`${header.trackCount} ${header.type === 'podcast' ? 'episodes' : 'songs'}`);
  } else if (!header.trackCount && tracks.length && !pieces.some((piece) => /song|track|episode/i.test(piece))) {
    pieces.push(`${tracks.length} ${header.type === 'podcast' ? 'episodes' : 'songs'}`);
  }
  const total = tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
  if (total > 0 && !pieces.some((piece) => /min|hr/i.test(piece))) pieces.push(formatLongDuration(total));
  return pieces.filter((piece, index) => pieces.indexOf(piece) === index);
}

function useDetailLoader(kind: DetailKind, id?: string, params?: string) {
  return useAsync<BrowsePage>(() => {
    if (kind === 'album' && id) return window.auralis.yt.album(id);
    if (kind === 'playlist' && id) return window.auralis.yt.playlist(id);
    if (kind === 'artist' && id) return window.auralis.yt.artist(id);
    if (kind === 'podcast' && id) {
      return window.auralis.yt.podcast(id).catch(() => window.auralis.yt.browse(id));
    }
    if (id || params) return window.auralis.yt.browse(id || '', params);
    return Promise.resolve({ shelves: [] });
  }, [kind, id, params]);
}

export function DetailPage({
  kind,
  id,
  params,
  title,
}: {
  kind: DetailKind;
  id?: string;
  params?: string;
  title?: string;
}) {
  const { data, loading, error, reload, setData } = useDetailLoader(kind, id, params);
  const [extraTracks, setExtraTracks] = useState<Track[]>([]);
  const [continuation, setContinuation] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [extraShelves, setExtraShelves] = useState<ShelfType[]>([]);
  const [downloading, setDownloading] = useState<string | undefined>();
  const [savedCopy, setSavedCopy] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const navigate = useNavStore((state) => state.navigate);
  const navigateEndpoint = useNavStore((state) => state.navigateEndpoint);
  const library = useAppStore((state) => state.library);
  const session = useAppStore((state) => state.session);
  const toggleSaveAlbum = useAppStore((state) => state.toggleSaveAlbum);
  const toggleSaveArtist = useAppStore((state) => state.toggleSaveArtist);
  const createPlaylist = useAppStore((state) => state.createPlaylist);
  const addToPlaylist = useAppStore((state) => state.addToPlaylist);
  const refreshLibrary = useAppStore((state) => state.refreshLibrary);
  const openMenu = useUiStore((state) => state.openMenu);
  const [pageHeader, setPageHeader] = useState<PageHeader | undefined>();
  const [chips, setChips] = useState<BrowseChip[]>([]);
  const [baseChips, setBaseChips] = useState<BrowseChip[]>([]);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter | null>(null);
  const [filterExtraTracks, setFilterExtraTracks] = useState<Track[]>([]);
  const [filterLoading, setFilterLoading] = useState<string | null>(null);

  useEffect(() => {
    setExtraTracks([]);
    setExtraShelves([]);
    setContinuation(undefined);
    setSavedCopy(false);
    setPageHeader(data?.header);
    setRenameValue(data?.header?.title || '');
    setChips(data?.chips || []);
    setBaseChips(data?.chips || []);
    setActiveFilter(null);
    setFilterExtraTracks([]);
    setFilterLoading(null);
  }, [data]);

  const primaryShelf = useMemo(() => {
    if (!data || kind === 'browse') return undefined;
    if (kind === 'artist') {
      return (
        data.shelves.find((shelf) => isTrackShelf(shelf) && /top songs|songs/i.test(shelf.title || '')) ||
        data.shelves.find(isTrackShelf)
      );
    }
    return data.shelves.find(isTrackShelf);
  }, [data, kind]);

  const primaryTracks = useMemo(() => {
    if (!data) return [];
    const fromShelf = primaryShelf
      ? primaryShelf.items.map((item) => item.track).filter((track): track is Track => Boolean(track?.id))
      : [];
    if (fromShelf.length) return fromShelf;
    if (kind === 'album' || kind === 'playlist' || kind === 'podcast') return tracksFromPage(data);
    return [];
  }, [data, primaryShelf, kind]);

  const baseTracks = useMemo(() => {
    const seen = new Set<string>();
    const output: Track[] = [];
    for (const track of [...primaryTracks, ...extraTracks]) {
      if (!track?.id || seen.has(track.id)) continue;
      seen.add(track.id);
      output.push(track);
    }
    return output;
  }, [primaryTracks, extraTracks]);

  const filteredTracks = useMemo(() => {
    if (!activeFilter) return [];
    return uniqueTracks([...activeFilter.tracks, ...filterExtraTracks]);
  }, [activeFilter, filterExtraTracks]);

  const tracks = activeFilter ? filteredTracks : baseTracks;

  const restShelves = useMemo(() => {
    if (!data) return [];
    const base = data.shelves.filter((shelf) => shelf !== primaryShelf);
    return [...base, ...extraShelves];
  }, [data, primaryShelf, extraShelves]);

  const header = pageHeader || data?.header;
  const cover = header?.thumbnail;
  const round = Boolean(header?.round) || kind === 'artist';
  const typeLabel =
    kind === 'artist'
      ? 'Artist'
      : kind === 'podcast'
        ? 'Podcast'
        : kind === 'playlist'
          ? 'Playlist'
          : kind === 'album'
            ? 'Album'
            : title || 'Browse';
  const meta = metaLine(header, tracks);
  const displayTitle = header?.title || title || (loading ? 'Loading…' : 'Browse');
  const playlistId = (header?.playlistId || header?.browseId || header?.id || id || '').replace(/^VL/, '');
  const canEditPlaylist = kind === 'playlist' && Boolean(session.hasCookies && playlistId);
  const hasContinuation = Boolean(activeFilter ? activeFilter.continuation : continuation || data?.continuation);
  const displayChips = chips.length ? chips : data?.chips || [];
  const activeSort = activeFilter?.sort && activeFilter.sort !== 'Latest' ? activeFilter.sort : undefined;
  const filterSummary = activeFilter
    ? `${
        activeFilter.status
          ? `${activeFilter.status} ${kind === 'podcast' ? 'episodes' : 'songs'}${activeSort ? ` · ${activeSort}` : ''}`
          : activeSort
            ? `Sorted by ${activeSort}`
            : 'Filtered'
      } · ${tracks.length} shown`
    : '';

  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorPanel message={error} retry={reload} />;
  if (data && !header && !data.shelves.length) {
    return (
      <EmptyState
        icon={<RefreshCw size={26} />}
        title="Nothing to show"
        message="This page did not return any music. It may be region locked or private."
        action={
          <Button variant="outline" onClick={reload}>
            Try again
          </Button>
        }
      />
    );
  }

  const loadMoreTracks = async () => {
    const next = activeFilter ? activeFilter.continuation : continuation || data?.continuation;
    if (!next || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await window.auralis.yt.detailContinuation(next);
      if (activeFilter) {
        setFilterExtraTracks((current) => [...current, ...result.tracks]);
        setActiveFilter((current) => (current ? { ...current, continuation: result.continuation } : current));
      } else {
        setExtraTracks((current) => [...current, ...result.tracks]);
        setContinuation(result.continuation);
      }
    } catch (err: any) {
      toast(`Could not load more ${kind === 'podcast' ? 'episodes' : 'songs'}: ${err?.message || err}`, 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const loadMoreShelves = async () => {
    const next = continuation || data?.continuation;
    if (!next || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await window.auralis.yt.browseEndpoint({ continuation: next });
      const known = new Set([...(data?.shelves || []), ...extraShelves].map((shelf) => `${shelf.title}-${shelf.items.length}`));
      setExtraShelves((current) => [...current, ...page.shelves.filter((shelf) => !known.has(`${shelf.title}-${shelf.items.length}`))]);
      setContinuation(page.continuation);
    } catch (err: any) {
      toast(`Could not load more: ${err?.message || err}`, 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const inPageFilters = kind !== 'browse';

  const clearFilter = () => {
    setActiveFilter(null);
    setFilterExtraTracks([]);
    setChips(baseChips);
  };

  const applyFilterToken = async (
    label: string,
    token: string,
    fallback: { status?: string; sort?: string },
  ) => {
    setFilterLoading(label);
    try {
      const page = await window.auralis.yt.browseEndpoint({ continuation: token });
      if (page.chips?.length) setChips(page.chips);
      const selected = selectedChipState(page.chips);
      setActiveFilter({
        status: 'status' in selected ? selected.status : fallback.status,
        sort: 'sort' in selected ? selected.sort : fallback.sort,
        tracks: tracksFromPage(page),
        message: page.message,
        continuation: page.continuation,
      });
      setFilterExtraTracks([]);
    } catch (err: any) {
      toast(`Could not apply the filter: ${err?.message || err}`, 'error');
    } finally {
      setFilterLoading(null);
    }
  };

  const applyStatusChip = (chip: BrowseChip) => {
    if (filterLoading) return;
    const token = chip.endpoint?.continuation;
    if (!token) return;
    if (activeFilter?.status === chip.title) {
      // Clicking the active played-state chip clears it. When a real sort is
      // active, reload through the unfiltered sort token so the order is kept.
      const baseSort =
        activeFilter.sort && activeFilter.sort !== 'Latest'
          ? findSortOption(baseChips, activeFilter.sort)
          : undefined;
      if (baseSort?.endpoint?.continuation) {
        void applyFilterToken(baseSort.title, baseSort.endpoint.continuation, { sort: baseSort.title });
      } else {
        clearFilter();
      }
      return;
    }
    void applyFilterToken(chip.title, token, { status: chip.title, sort: activeFilter?.sort });
  };

  const applySortOption = (option: ChipOption) => {
    if (filterLoading) return;
    const token = option.endpoint?.continuation;
    if (!token) return;
    void applyFilterToken(option.title, token, { sort: option.title, status: activeFilter?.status });
  };

  const openSortMenu = (chip: BrowseChip, event: React.MouseEvent<HTMLButtonElement>) => {
    const options = chip.options || [];
    if (!options.length) return;
    const selectedSort = activeFilter?.sort || options.find((option) => option.selected)?.title;
    const rect = event.currentTarget.getBoundingClientRect();
    openMenu(
      rect.left,
      rect.bottom + 6,
      options.map((option) => ({
        label: option.title,
        checked: option.title === selectedSort,
        onClick: () => applySortOption(option),
      })),
    );
  };

  const handleChipClick = (chip: BrowseChip, event: React.MouseEvent<HTMLButtonElement>) => {
    if (!inPageFilters) {
      if (chip.endpoint) navigateEndpoint(chip.endpoint, chip.title);
      return;
    }
    if (chip.options?.length) {
      openSortMenu(chip, event);
      return;
    }
    if (chip.endpoint?.continuation) {
      applyStatusChip(chip);
      return;
    }
    if (chip.endpoint) navigateEndpoint(chip.endpoint, chip.title);
  };

  const isChipSelected = (chip: BrowseChip): boolean => {
    if (!inPageFilters) return Boolean(chip.selected);
    if (chip.options?.length) return Boolean(activeSort);
    return activeFilter ? activeFilter.status === chip.title : false;
  };

  const playAll = (shuffle = false) => {
    if (!tracks.length) {
      toast(`No playable ${kind === 'podcast' ? 'episodes' : 'songs'} on this page.`, 'error');
      return;
    }
    usePlayerStore.getState().playQueue(shuffle ? shuffleArray(tracks) : tracks, 0);
  };

  const downloadAll = () => {
    const done = new Set(library.downloads.filter((item) => item.status === 'done').map((item) => item.track.id));
    const pending = tracks.filter((track) => !done.has(track.id));
    if (!pending.length) {
      toast('Everything here is already downloaded.', 'info');
      return;
    }
    const start = async () => {
      let completed = 0;
      let failed = 0;
      for (let index = 0; index < pending.length; index++) {
        setDownloading(`${index + 1}/${pending.length}`);
        try {
          await window.auralis.player.download(pending[index]);
          completed++;
        } catch {
          failed++;
        }
      }
      setDownloading(undefined);
      await refreshLibrary();
      toast(
        failed
          ? `Downloaded ${completed} songs; ${failed} failed.`
          : `Downloaded ${completed} ${completed === 1 ? 'song' : 'songs'}.`,
        failed ? 'error' : 'success',
      );
    };
    if (pending.length > 3) {
      confirmDialog({
        title: `Download ${pending.length} songs?`,
        message: 'Each song is saved to your downloads folder. This can take a while on a slow connection.',
        confirmLabel: 'Start download',
        onConfirm: start,
      });
    } else {
      void start();
    }
  };

  const savePlaylistCopy = async () => {
    if (!header || !tracks.length || savedCopy) return;
    try {
      const playlist = await createPlaylist(header.title, header.description || `Saved from YouTube Music`);
      for (const track of tracks) await addToPlaylist(playlist.id, track);
      setSavedCopy(true);
      toast(`Saved “${playlist.name}” to your library.`, 'success', {
        label: 'Open',
        onClick: () => navigate({ page: 'local', id: playlist.id }),
      });
    } catch (err: any) {
      toast(`Could not save the playlist: ${err?.message || err}`, 'error');
    }
  };

  const toggleSave = async () => {
    if (!header) return;
    if (kind === 'album') {
      await toggleSaveAlbum(headerCard(header, kind));
    } else if (kind === 'artist') {
      await toggleSaveArtist(headerCard(header, kind));
    } else if (kind === 'playlist') {
      await savePlaylistCopy();
    }
  };

  const saveLabel =
    kind === 'album'
      ? library.savedAlbums.some((album) => album.id === (header?.browseId || header?.id))
        ? 'Saved'
        : 'Save album'
      : kind === 'artist'
        ? library.savedArtists.some((artist) => artist.id === (header?.browseId || header?.id))
          ? 'Following'
          : 'Follow'
        : savedCopy
          ? 'Saved copy'
          : 'Save playlist';
  const isSaved =
    kind === 'album'
      ? library.savedAlbums.some((album) => album.id === (header?.browseId || header?.id))
      : kind === 'artist'
        ? library.savedArtists.some((artist) => artist.id === (header?.browseId || header?.id))
        : savedCopy;

  const subscribe = async () => {
    if (!header || !session.hasCookies) {
      toast('Sign in to subscribe on YouTube Music.', 'info');
      return;
    }
    const channelId = header.browseId || header.id;
    if (!channelId) return;
    try {
      await window.auralis.yt.subscribe(channelId, !header.subscribed);
      setPageHeader((current) => (current ? { ...current, subscribed: !current.subscribed } : current));
      toast(header.subscribed ? 'Unsubscribed on YouTube Music.' : 'Subscribed on YouTube Music.', 'success');
    } catch (err: any) {
      toast(`Could not update the subscription: ${err?.message || err}`, 'error');
    }
  };

  const removePlaylist = () => {
    if (!playlistId) return;
    confirmDialog({
      title: 'Delete this YouTube Music playlist?',
      message: `“${displayTitle}” will be permanently removed from your account.`,
      confirmLabel: 'Delete playlist',
      danger: true,
      onConfirm: async () => {
        await window.auralis.yt.deleteYTPlaylist(playlistId);
        toast('Playlist deleted from YouTube Music.', 'success');
        navigate({ page: 'library', tab: 'youtube' });
      },
    });
  };

  const renamePlaylist = async () => {
    if (!playlistId || !renameValue.trim()) return;
    try {
      await window.auralis.yt.renameYTPlaylist(playlistId, renameValue.trim());
      setPageHeader((current) => (current ? { ...current, title: renameValue.trim() } : current));
      setRenameOpen(false);
      toast('Playlist renamed.', 'success');
    } catch (err: any) {
      toast(`Could not rename the playlist: ${err?.message || err}`, 'error');
    }
  };

  const showMore = (event: React.MouseEvent) => {
    const items: any[] = [];
    if (tracks.length) {
      items.push({ label: 'Play next', icon: ListPlus, onClick: () => usePlayerStore.getState().playNext(tracks[0]) });
      items.push({ label: 'Start radio', icon: Radio, onClick: () => void usePlayerStore.getState().startRadio(tracks[0]) });
      items.push({ separator: true });
    }
    if (kind === 'artist' && header) {
      items.push({
        label: header.subscribed ? 'Unsubscribe on YouTube Music' : 'Subscribe on YouTube Music',
        icon: header.subscribed ? <BellOff size={16} /> : <Bell size={16} />,
        onClick: () => void subscribe(),
        disabled: !session.hasCookies,
      });
    }
    if (kind === 'playlist') {
      if (canEditPlaylist) {
        items.push({ label: 'Rename on YouTube Music', icon: Pencil, onClick: () => setRenameOpen(true) });
        items.push({ label: 'Delete from YouTube Music', icon: Trash2, danger: true, onClick: removePlaylist });
      }
      if (tracks.length && !savedCopy) {
        items.push({ label: 'Save as local playlist', icon: ListPlus, onClick: () => void savePlaylistCopy() });
      }
      items.push({ separator: true });
    }
    if (header?.author?.name) {
      items.push({
        label: 'Go to artist',
        icon: UserPlus,
        onClick: () => {
          if (header.author?.id) navigate({ page: 'artist', id: header.author.id });
          else navigate({ page: 'search', q: header.author?.name || '' });
        },
      });
    }
    items.push({
      label: 'Copy link',
      icon: Link2,
      onClick: () => {
        const link =
          kind === 'album'
            ? `https://music.youtube.com/browse/${header?.browseId || header?.id || id}`
            : kind === 'playlist'
              ? `https://music.youtube.com/playlist?list=${playlistId}`
              : kind === 'artist'
                ? `https://music.youtube.com/channel/${header?.browseId || header?.id || id}`
                : `https://music.youtube.com/watch?v=${tracks[0]?.id || ''}`;
        void navigator.clipboard
          .writeText(link)
          .then(() => toast('Link copied to clipboard.', 'success'))
          .catch(() => toast('Could not copy the link.', 'error'));
      },
    });
    items.push({
      label: 'Open on YouTube Music',
      icon: ExternalLink,
      onClick: () => {
        const link =
          kind === 'album'
            ? `https://music.youtube.com/browse/${header?.browseId || header?.id || id}`
            : kind === 'playlist'
              ? `https://music.youtube.com/playlist?list=${playlistId}`
              : kind === 'artist'
                ? `https://music.youtube.com/channel/${header?.browseId || header?.id || id}`
                : `https://music.youtube.com/watch?v=${tracks[0]?.id || ''}`;
        void window.auralis.app.openExternal(link);
      },
    });
    openMenu(event.clientX, event.clientY, items);
  };

  const headerNode = header ? (
    <section className={`detail-hero detail-hero-${kind}`}>
      <div
        className="detail-hero-bg"
        style={cover ? { backgroundImage: `url(${cover})` } : undefined}
        aria-hidden="true"
      />
      <div className="detail-hero-inner">
        <div className={`detail-cover ${round ? 'is-round' : ''}`}>
          <Artwork src={cover} alt={displayTitle} round={round} className="detail-art" />
        </div>
        <div className="detail-copy">
          <span className="eyebrow">{typeLabel}</span>
          <h1>{displayTitle}</h1>
          {header.description ? <p className="detail-description">{header.description}</p> : null}
          <div className="detail-meta">
            {meta.map((piece, index) => (
              <span key={`${piece}-${index}`} className="detail-meta-item">
                {index > 0 ? <span className="meta-dot" /> : null}
                {piece}
              </span>
            ))}
            {header.author?.name ? (
              <button
                type="button"
                className="detail-author text-link"
                onClick={() => {
                  if (header.author?.id) navigate({ page: 'artist', id: header.author.id });
                  else navigate({ page: 'search', q: header.author?.name || '' });
                }}
              >
                {header.author.name}
              </button>
            ) : null}
          </div>
          <div className="detail-actions">
            <Button
              variant="primary"
              size="lg"
              icon={<Play size={19} fill="currentColor" />}
              onClick={() => playAll(false)}
              disabled={!tracks.length}
            >
              Play
            </Button>
            <IconButton label="Shuffle" size="lg" variant="surface" onClick={() => playAll(true)} disabled={!tracks.length}>
              <Shuffle size={19} />
            </IconButton>
            {kind !== 'podcast' ? (
              <Button
                variant={isSaved ? 'secondary' : 'outline'}
                icon={
                  kind === 'artist' ? (
                    isSaved ? (
                      <UserCheck size={17} />
                    ) : (
                      <UserPlus size={17} />
                    )
                  ) : isSaved ? (
                    <Check size={17} />
                  ) : (
                    <Heart size={17} />
                  )
                }
                onClick={() => void toggleSave()}
                disabled={kind === 'playlist' && !tracks.length}
              >
                {saveLabel}
              </Button>
            ) : null}
            {kind === 'artist' ? (
              <IconButton
                label={header.subscribed ? 'Unsubscribe on YouTube Music' : 'Subscribe on YouTube Music'}
                size="lg"
                variant="surface"
                active={Boolean(header.subscribed)}
                onClick={() => void subscribe()}
              >
                {header.subscribed ? <BellOff size={18} /> : <Bell size={18} />}
              </IconButton>
            ) : null}
            <IconButton
              label={downloading ? `Downloading ${downloading}` : 'Download all'}
              size="lg"
              variant="surface"
              onClick={downloadAll}
              disabled={!tracks.length || Boolean(downloading)}
            >
              {downloading ? <Spinner size={18} /> : <Download size={18} />}
            </IconButton>
            <IconButton label="More options" size="lg" variant="surface" onClick={showMore}>
              <MoreHorizontal size={19} />
            </IconButton>
          </div>
        </div>
      </div>
    </section>
  ) : (
    <header className="page-hero compact-hero">
      <div>
        <span className="eyebrow">{typeLabel}</span>
        <h1>{displayTitle}</h1>
        {meta.length ? <p>{meta.join(' · ')}</p> : null}
      </div>
      {tracks.length ? (
        <div className="page-hero-actions">
          <Button variant="primary" icon={<Play size={17} fill="currentColor" />} onClick={() => playAll(false)}>
            Play
          </Button>
          <Button variant="secondary" icon={<Shuffle size={17} />} onClick={() => playAll(true)}>
            Shuffle
          </Button>
        </div>
      ) : null}
    </header>
  );

  return (
    <div className={`page detail-page detail-page-${kind}`}>
      {headerNode}

      {displayChips.length ? (
        <div
          className="genre-chips detail-chips"
          role="group"
          aria-label={kind === 'podcast' ? 'Episode filters' : 'Filters'}
          aria-busy={Boolean(filterLoading)}
        >
          {displayChips.map((chip, index) => (
            <button
              type="button"
              key={`${chip.title}-${index}`}
              className={`genre-chip ${isChipSelected(chip) ? 'is-selected' : ''}`}
              onClick={(event) => handleChipClick(chip, event)}
              aria-pressed={isChipSelected(chip)}
              disabled={Boolean(filterLoading)}
            >
              <span>{chip.title}</span>
              {chip.options?.length ? <ChevronDown size={13} aria-hidden="true" /> : null}
            </button>
          ))}
          {filterLoading ? (
            <span className="detail-filter-loading">
              <Spinner size={13} /> Filtering…
            </span>
          ) : null}
        </div>
      ) : null}

      {activeFilter ? (
        <div className="detail-filter-status">
          <span>{filterSummary}</span>
          <button type="button" className="text-link" onClick={clearFilter}>
            Show all {kind === 'podcast' ? 'episodes' : 'songs'}
          </button>
        </div>
      ) : null}

      {kind !== 'browse' && tracks.length ? (
        <section className="detail-tracks">
          <div className="section-heading">
            <div>
              <h2>{kind === 'artist' ? 'Top songs' : kind === 'podcast' ? 'Episodes' : 'Track list'}</h2>
              <span className="section-subtitle">
                {tracks.length} {kind === 'podcast' ? 'episodes' : 'songs'}
                {tracks.some((track) => track.duration > 0)
                  ? ` · ${formatLongDuration(tracks.reduce((sum, track) => sum + (track.duration || 0), 0))}`
                  : ''}
              </span>
            </div>
          </div>
          <div className="shelf-list-card detail-track-list">
            <TrackList
              tracks={tracks}
              showArt={kind === 'playlist' || kind === 'podcast'}
              showAlbum={kind === 'playlist'}
              showIndex
              context={{
                albumId: kind === 'album' ? header?.browseId || header?.id || id : undefined,
                playlistId: kind === 'playlist' ? playlistId : undefined,
              }}
            />
          </div>
          {hasContinuation ? (
            <div className="load-more-row">
              <Button variant="outline" onClick={() => void loadMoreTracks()} disabled={loadingMore}>
                {loadingMore ? 'Loading more…' : kind === 'podcast' ? 'Show all episodes' : 'Show all songs'}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {kind !== 'browse' && !tracks.length && !loading && activeFilter ? (
        <div className="detail-empty-note">
          <p>{activeFilter.message || 'No episodes match the filters you applied.'}</p>
          <Button variant="outline" onClick={clearFilter}>
            Show all {kind === 'podcast' ? 'episodes' : 'songs'}
          </Button>
        </div>
      ) : kind !== 'browse' && !tracks.length && primaryShelf && !loading ? (
        <div className="detail-empty-note">This release does not have any playable songs.</div>
      ) : null}

      {kind === 'browse' ? (
        <>
          {data?.shelves.map((shelf, index) => (
            <Shelf key={`${shelf.title}-${index}`} shelf={shelf} />
          ))}
          {data?.continuation || continuation ? (
            <div className="load-more-row">
              <Button variant="outline" onClick={() => void loadMoreShelves()} disabled={loadingMore}>
                {loadingMore ? 'Loading more…' : 'Show more'}
              </Button>
            </div>
          ) : null}
        </>
      ) : restShelves.length ? (
        <div className="detail-related">
          <h2 className="detail-related-title">
            {kind === 'artist' ? 'More from this artist' : kind === 'album' ? 'You might also like' : 'More like this'}
          </h2>
          {restShelves.map((shelf, index) => (
            <Shelf key={`${shelf.title}-${index}`} shelf={shelf} />
          ))}
        </div>
      ) : null}

      <Modal
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Rename playlist"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void renamePlaylist()} disabled={!renameValue.trim()}>
              Save
            </Button>
          </>
        }
      >
        <label className="field">
          <span>Name</span>
          <input
            autoFocus
            value={renameValue}
            maxLength={100}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void renamePlaylist()}
          />
        </label>
      </Modal>
    </div>
  );
}
