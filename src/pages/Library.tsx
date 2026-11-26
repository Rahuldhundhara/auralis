import { useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Clock3,
  Disc3,
  Download,
  Heart,
  History,
  LibraryBig,
  ListMusic,
  Link2,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Shuffle,
  Trash2,
  UserRound,
  CirclePlay,
  LayoutGrid,
  List as ListIcon,
  Search,
} from 'lucide-react';
import type { LocalPlaylist, Track } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore, type Route } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { confirmDialog, toast, useUiStore } from '../stores/ui';
import { artistsLine, formatBytes, formatDuration, formatLongDuration, shuffleArray, timeAgo } from '../lib/format';
import { prefetchTrack, showTrackMenu } from '../lib/actions';
import { useAsync } from '../lib/useAsync';
import { withoutVideos } from '../lib/shelves';
import { Artwork, Button, EmptyState, ErrorPanel, IconButton, PageSkeleton } from '../components/primitives';
import { MediaCard, ShelfGrid } from '../components/MediaCard';
import { TrackList } from '../components/TrackList';

type LibraryTab = 'playlists' | 'songs' | 'albums' | 'artists' | 'downloads' | 'youtube';
type ViewMode = 'grid' | 'list';

const TABS: Array<{ id: LibraryTab; label: string; icon: React.ReactNode }> = [
  { id: 'playlists', label: 'Playlists', icon: <ListMusic size={15} /> },
  { id: 'songs', label: 'Liked songs', icon: <Heart size={15} /> },
  { id: 'albums', label: 'Albums', icon: <Disc3 size={15} /> },
  { id: 'artists', label: 'Artists', icon: <UserRound size={15} /> },
  { id: 'downloads', label: 'Downloads', icon: <Download size={15} /> },
  { id: 'youtube', label: 'YouTube Music', icon: <CirclePlay size={15} /> },
];

function playlistCover(playlist?: LocalPlaylist): string | undefined {
  if (!playlist) return undefined;
  return playlist.cover || playlist.tracks.find((track) => track.thumbnail)?.thumbnail;
}

function LocalPlaylistCard({ playlist }: { playlist: LocalPlaylist }) {
  const navigate = useNavStore((state) => state.navigate);
  const openMenu = useUiStore((state) => state.openMenu);
  const openDialog = useUiStore((state) => state.openDialog);
  const deletePlaylist = useAppStore((state) => state.deletePlaylist);
  const duration = playlist.tracks.reduce((sum, track) => sum + (track.duration || 0), 0);

  const menu = (event: React.MouseEvent) => {
    event.preventDefault();
    openMenu(event.clientX, event.clientY, [
      { label: 'Open playlist', icon: ListMusic, onClick: () => navigate({ page: 'local', id: playlist.id }) },
      {
        label: 'Play',
        icon: Play,
        onClick: () => playlist.tracks.length && usePlayerStore.getState().playQueue(playlist.tracks, 0),
      },
      {
        label: 'Shuffle',
        icon: Shuffle,
        onClick: () => playlist.tracks.length && usePlayerStore.getState().playQueue(shuffleArray(playlist.tracks), 0),
      },
      { separator: true },
      { label: 'Edit details', icon: Pencil, onClick: () => openDialog({ type: 'rename-playlist', playlist }) },
      {
        label: 'Delete playlist',
        icon: Trash2,
        danger: true,
        onClick: () =>
          confirmDialog({
            title: 'Delete playlist?',
            message: `“${playlist.name}” will be removed. This cannot be undone.`,
            confirmLabel: 'Delete',
            danger: true,
            onConfirm: async () => {
              await deletePlaylist(playlist.id);
              toast('Playlist deleted.', 'success');
            },
          }),
      },
    ]);
  };

  const play = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!playlist.tracks.length) {
      toast('This playlist is empty.', 'info');
      return;
    }
    usePlayerStore.getState().playQueue(playlist.tracks, 0);
  };

  return (
    <article className="library-playlist-card" onContextMenu={menu}>
      <div className="library-playlist-art">
        <button type="button" onClick={() => navigate({ page: 'local', id: playlist.id })} aria-label={`Open ${playlist.name}`}>
          <Artwork src={playlistCover(playlist)} alt={playlist.name} className="library-playlist-art-img" />
        </button>
        <button type="button" className="library-playlist-play" onClick={play} aria-label={`Play ${playlist.name}`}>
          <Play size={16} fill="currentColor" />
        </button>
      </div>
      <button type="button" className="library-playlist-text" onClick={() => navigate({ page: 'local', id: playlist.id })}>
        <strong>{playlist.name}</strong>
        <span>
          {playlist.tracks.length} {playlist.tracks.length === 1 ? 'song' : 'songs'}
          {duration ? ` · ${formatLongDuration(duration)}` : ''}
        </span>
      </button>
    </article>
  );
}

function LocalPlaylistListRow({ playlist, index }: { playlist: LocalPlaylist; index: number }) {
  const navigate = useNavStore((state) => state.navigate);
  const duration = playlist.tracks.reduce((sum, track) => sum + (track.duration || 0), 0);

  const play = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!playlist.tracks.length) {
      toast('This playlist is empty.', 'info');
      return;
    }
    usePlayerStore.getState().playQueue(playlist.tracks, 0);
  };

  return (
    <div className="library-list-row" role="button" tabIndex={0} onClick={() => navigate({ page: 'local', id: playlist.id })}>
      <span className="library-list-index">{index + 1}</span>
      <Artwork src={playlistCover(playlist)} alt={playlist.name} className="library-list-art" />
      <div className="library-list-copy">
        <strong>{playlist.name}</strong>
        <span>Playlist · {playlist.tracks.length} songs{duration ? ` · ${formatLongDuration(duration)}` : ''}</span>
      </div>
      <button type="button" className="library-list-play" onClick={play} aria-label={`Play ${playlist.name}`}>
        <Play size={14} fill="currentColor" />
      </button>
    </div>
  );
}

function LibraryTrackTable({ tracks }: { tracks: Track[] }) {
  const current = usePlayerStore((state) => state.current);
  const playing = usePlayerStore((state) => state.playing);
  const liked = useAppStore((state) => state.library.liked);
  const toggleLike = useAppStore((state) => state.toggleLike);
  const likedIds = useMemo(() => new Set(liked.map((track) => track.id)), [liked]);

  if (!tracks.length) {
    return <div className="library-table-empty">Nothing here yet.</div>;
  }

  return (
    <div className="library-track-table">
      <div className="library-track-table-head">
        <span>Title</span>
        <span>Collection</span>
        <span>Duration</span>
      </div>
      <div className="library-track-table-body">
        {tracks.map((track, index) => {
          const isCurrent = current?.id === track.id;
          const isLiked = likedIds.has(track.id);
          const play = () => {
            prefetchTrack(track);
            usePlayerStore.getState().playQueue(tracks, index);
          };
          return (
            <div
              key={`${track.id}-${index}`}
              className={`library-track-row ${isCurrent ? 'is-current' : ''}`}
              role="button"
              tabIndex={0}
              onClick={play}
              onKeyDown={(event) => {
                if (event.key === 'Enter') play();
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                showTrackMenu(track, event, { trackIndex: index });
              }}
            >
              <div className="library-track-title-cell">
                <span className="library-track-index">{index + 1}</span>
                <Artwork src={track.thumbnail} alt={track.title} className="library-track-art" />
                <div className="library-track-copy">
                  <strong>{track.title}</strong>
                  <span>{artistsLine(track.artists) || 'Unknown artist'}</span>
                </div>
                {isCurrent && playing ? (
                  <span className="library-track-eq" aria-label="Now playing">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : null}
              </div>
              <span className="library-track-album">{track.album?.name || 'Auralis'}</span>
              <div className="library-track-end">
                <button
                  type="button"
                  className={`library-track-like ${isLiked ? 'is-liked' : ''}`}
                  aria-label={isLiked ? 'Remove from liked songs' : 'Add to liked songs'}
                  onClick={(event) => {
                    event.stopPropagation();
                    void toggleLike(track);
                  }}
                >
                  <Heart size={16} fill={isLiked ? 'currentColor' : 'none'} />
                </button>
                <span className="library-track-duration">{formatDuration(track.duration)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YouTubeLibrary({ query = '' }: { query?: string }) {
  const session = useAppStore((state) => state.session);
  const navigate = useNavStore((state) => state.navigate);
  const openDialog = useUiStore((state) => state.openDialog);
  const { data, loading, error, reload } = useAsync(
    () =>
      session.hasCookies
        ? window.auralis.yt.library()
        : Promise.resolve({ shelves: [] } as Awaited<ReturnType<typeof window.auralis.yt.library>>),
    [session.hasCookies],
  );

  const shelves = useMemo(() => {
    const term = query.trim().toLowerCase();
    const all = data ? withoutVideos(data.shelves) : [];
    if (!term) return all;
    return all
      .map((shelf) => ({
        ...shelf,
        items: shelf.items.filter(
          (item) =>
            item.title.toLowerCase().includes(term) ||
            (item.subtitle || '').toLowerCase().includes(term),
        ),
      }))
      .filter((shelf) => shelf.items.length);
  }, [data, query]);

  if (!session.hasCookies) {
    return (
      <EmptyState
        icon={<CirclePlay size={28} />}
        title="Connect your YouTube Music account"
        message="Sign in to see your playlists, liked music, uploads and listening history from YouTube Music."
        action={
          <div className="empty-actions-row">
            <Button variant="primary" icon={<CirclePlay size={16} />} onClick={() => openDialog({ type: 'cookie' })}>
              Sign in
            </Button>
            <Button variant="outline" icon={<History size={16} />} onClick={() => openDialog({ type: 'cookie' })}>
              Paste cookies
            </Button>
          </div>
        }
      />
    );
  }

  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorPanel message={error} retry={reload} />;

  return (
    <div className="youtube-library">
      <div className="library-subhead">
        <div>
          <h2>Your YouTube Music</h2>
          <p>{session.account?.name ? `Signed in as ${session.account.name}` : 'Your account library'}</p>
        </div>
        <div className="library-subhead-actions">
          <Button variant="ghost" size="sm" icon={<History size={16} />} onClick={() => navigate({ page: 'history' })}>
            History
          </Button>
          <Button variant="outline" size="sm" onClick={reload}>
            Refresh
          </Button>
        </div>
      </div>
      {shelves.length ? (
        <ShelfGrid shelves={shelves} />
      ) : (
        <EmptyState icon={<LibraryBig size={26} />} title="Your library is empty" message="Save songs and playlists on YouTube Music and they will appear here." />
      )}
    </div>
  );
}

export function LibraryPage({ tab: initialTab }: { tab?: LibraryTab }) {
  const tab: LibraryTab = initialTab || 'playlists';
  const library = useAppStore((state) => state.library);
  const session = useAppStore((state) => state.session);
  const navigate = useNavStore((state) => state.navigate);
  const openDialog = useUiStore((state) => state.openDialog);
  const refreshLibrary = useAppStore((state) => state.refreshLibrary);
  const [filter, setFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const polaroidRef = useRef<HTMLDivElement>(null);

  const downloadedTracks = useMemo(
    () => library.downloads.filter((item) => item.status === 'done').map((item) => item.track),
    [library.downloads],
  );
  const downloadBytes = library.downloads.reduce((sum, item) => sum + (item.size || 0), 0);
  const routeFor = (next: LibraryTab): Route => ({ page: 'library', tab: next });
  const term = filter.trim().toLowerCase();
  const matches = (value?: string) => !term || (value || '').toLowerCase().includes(term);
  const matchesTrack = (track: Track) =>
    matches(track.title) || matches(artistsLine(track.artists)) || matches(track.album?.name);

  const filteredPlaylists = library.playlists.filter((playlist) => matches(playlist.name));
  const filteredLiked = library.liked.filter(matchesTrack);
  const filteredAlbums = library.savedAlbums.filter((album) => matches(album.title) || matches(album.subtitle));
  const filteredArtists = library.savedArtists.filter((artist) => matches(artist.title) || matches(artist.subtitle));
  const filteredDownloads = downloadedTracks.filter(matchesTrack);

  const shuffleLiked = () => {
    if (!library.liked.length) {
      toast('Like some songs first.', 'info');
      return;
    }
    usePlayerStore.getState().playQueue(shuffleArray(library.liked), 0);
  };

  const heroPlaylist = library.playlists[0];
  const heroArtwork =
    playlistCover(heroPlaylist) ||
    library.savedAlbums[0]?.thumbnail ||
    downloadedTracks[0]?.thumbnail;
  const heroTitle = heroPlaylist?.name || 'YOUR MIX';
  const heroCount = library.liked.length;

  const movePolaroid = (event: React.MouseEvent<HTMLDivElement>) => {
    const wrap = polaroidRef.current;
    if (!wrap) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const relX = (event.clientX - rect.left) / rect.width - 0.5;
    const relY = (event.clientY - rect.top) / rect.height - 0.5;
    wrap.style.transform = `rotateX(${(-relY * 12).toFixed(2)}deg) rotateY(${(relX * 12).toFixed(2)}deg)`;
  };

  const resetPolaroid = () => {
    if (polaroidRef.current) polaroidRef.current.style.transform = 'rotateX(0deg) rotateY(0deg)';
  };

  const playHero = () => {
    if (heroPlaylist?.tracks.length) {
      usePlayerStore.getState().playQueue(heroPlaylist.tracks, 0);
    } else if (filteredLiked.length) {
      usePlayerStore.getState().playQueue(filteredLiked, 0);
    } else {
      toast('Nothing to play yet.', 'info');
    }
  };

  const stats = [
    { id: 'songs' as const, label: 'Liked', count: library.liked.length, color: '#ff6b9d' },
    { id: 'playlists' as const, label: 'Playlists', count: library.playlists.length, color: '#38e58d' },
    { id: 'albums' as const, label: 'Albums', count: library.savedAlbums.length, color: '#38bdf8' },
    { id: 'downloads' as const, label: 'Downloads', count: downloadedTracks.length, color: '#a78bfa' },
  ];

  const headings: Record<LibraryTab, { title: string; subtitle: string }> = {
    playlists: { title: 'Playlists', subtitle: 'Your own collections, ordered however you like.' },
    songs: {
      title: 'Liked songs',
      subtitle: `${library.liked.length} songs${
        library.liked.length ? ` · ${formatLongDuration(library.liked.reduce((sum, track) => sum + (track.duration || 0), 0))}` : ''
      }`,
    },
    albums: { title: 'Albums', subtitle: `${library.savedAlbums.length} albums and releases` },
    artists: { title: 'Artists', subtitle: 'Creators featured in your saved collections.' },
    downloads: {
      title: 'Downloads',
      subtitle: `${downloadedTracks.length} songs ready offline${downloadBytes ? ` · ${formatBytes(downloadBytes)}` : ''}`,
    },
    youtube: {
      title: 'YouTube Music',
      subtitle: session.account?.name ? `Signed in as ${session.account.name}` : 'Recently played and synced from YouTube Music.',
    },
  };

  const emptyFilter = (
    <EmptyState
      icon={<Search size={27} />}
      title="No matches"
      message={`Nothing in this section matched “${filter.trim()}”. Try a different filter.`}
      action={<Button variant="outline" onClick={() => setFilter('')}>Clear filter</Button>}
    />
  );

  return (
    <div className="page library-page">
      <header className="library-editorial-hero">
        <div className="library-hero-grid">
          <div className="library-hero-left">
            <span className="library-collection-pill">
              <i /> YOUR COLLECTION
            </span>
            <div className="library-editorial-heading">
              <h1>
                <span>Your</span>
                <em>Library</em>
              </h1>
              <p>Saved, downloaded and collected. All of it, in one quiet corner.</p>
            </div>
            <div className="library-segmented-stats">
              {stats.map((stat) => (
                <button type="button" key={stat.id} onClick={() => navigate(routeFor(stat.id))}>
                  <strong style={{ color: stat.color }}>{stat.count}</strong>
                  <span>{stat.label}</span>
                </button>
              ))}
            </div>
            <div className="library-hero-actions">
              <button type="button" className="library-action-shuffle" onClick={shuffleLiked}>
                <Play size={14} fill="currentColor" /> Shuffle liked
              </button>
              <button type="button" className="library-action-create" onClick={() => openDialog({ type: 'create-playlist' })}>
                <Plus size={16} /> New playlist
              </button>
              <button
                type="button"
                className="library-action-history"
                aria-label="YouTube Music history"
                title="YouTube Music history"
                onClick={() => (session.hasCookies ? navigate({ page: 'history' }) : openDialog({ type: 'cookie' }))}
              >
                <History size={17} />
              </button>
            </div>
          </div>

          <div className="library-hero-right" onMouseMove={movePolaroid} onMouseLeave={resetPolaroid}>
            <div className="library-polaroid-stage">
              <span className="library-polaroid-shadow" aria-hidden="true" />
              <div className="library-polaroid-wrap" ref={polaroidRef}>
                <button type="button" className="library-polaroid-card" onClick={playHero} aria-label={`Play ${heroTitle}`}>
                  {heroArtwork ? (
                    <Artwork src={heroArtwork} alt={heroTitle} className="library-polaroid-img" />
                  ) : (
                    <span className="library-polaroid-placeholder">
                      <LibraryBig size={46} />
                    </span>
                  )}
                  <span className="library-polaroid-sheen" aria-hidden="true" />
                </button>
                <button type="button" className="library-floating-badge library-floating-liked" onClick={() => navigate(routeFor('songs'))}>
                  <Heart size={14} fill="#ff6b9d" color="#ff6b9d" />
                  <span>{heroCount} liked</span>
                </button>
                <button type="button" className="library-floating-badge library-floating-play" onClick={playHero}>
                  <span>{heroTitle}</span>
                  <span className="library-floating-play-icon">
                    <Play size={13} fill="currentColor" />
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="library-filter-row">
        <div className="library-tab-strip" role="tablist" aria-label="Library sections">
          {TABS.map((entry) => (
            <button
              type="button"
              key={entry.id}
              role="tab"
              aria-selected={tab === entry.id}
              className={`library-pill-tab ${tab === entry.id ? 'is-active' : ''}`}
              onClick={() => navigate(routeFor(entry.id), true)}
            >
              {entry.icon}
              <span>{entry.label}</span>
            </button>
          ))}
        </div>
        <div className="library-filter-tools">
          <label className="library-quick-filter">
            <Search size={15} />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter library..."
              aria-label="Filter library"
            />
          </label>
          <div className="library-view-toggle" role="group" aria-label="Library view">
            <button
              type="button"
              className={viewMode === 'grid' ? 'is-active' : ''}
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              title="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              className={viewMode === 'list' ? 'is-active' : ''}
              onClick={() => setViewMode('list')}
              aria-label="List view"
              title="List view"
            >
              <ListIcon size={16} />
            </button>
          </div>
        </div>
      </div>

      <section className="library-content-section">
        <div className="library-content-heading">
          <div>
            <h2>{headings[tab].title}</h2>
            <p>{headings[tab].subtitle}</p>
          </div>
          <div className="library-heading-actions">
            <button type="button" className="library-heading-import" onClick={() => openDialog({ type: 'import-playlist' })}>
              <Link2 size={14} /> Import
            </button>
            <button type="button" className="library-heading-create" onClick={() => openDialog({ type: 'create-playlist' })}>
              <Plus size={14} /> Create
            </button>
          </div>
        </div>

        {tab === 'playlists' ? (
          filteredPlaylists.length ? (
            viewMode === 'grid' ? (
              <div className="library-playlist-grid">
                <button type="button" className="library-new-playlist-card" onClick={() => openDialog({ type: 'create-playlist' })}>
                  <span className="library-new-playlist-icon">
                    <Plus size={21} />
                  </span>
                  <strong>New playlist</strong>
                  <span>Start a fresh collection</span>
                </button>
                {filteredPlaylists.map((playlist) => (
                  <LocalPlaylistCard key={playlist.id} playlist={playlist} />
                ))}
              </div>
            ) : (
              <div className="library-list-view">
                <button type="button" className="library-list-create" onClick={() => openDialog({ type: 'create-playlist' })}>
                  <Plus size={17} /> Create a new playlist
                </button>
                {filteredPlaylists.map((playlist, index) => (
                  <LocalPlaylistListRow key={playlist.id} playlist={playlist} index={index} />
                ))}
              </div>
            )
          ) : term ? (
            emptyFilter
          ) : (
            <EmptyState
              icon={<ListMusic size={27} />}
              title="No playlists yet"
              message="Create a playlist for a mood, a drive or a late-night session. You can add songs from anywhere in Auralis."
              action={
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => openDialog({ type: 'create-playlist' })}>
                  Create playlist
                </Button>
              }
            />
          )
        ) : null}

        {tab === 'songs' ? (
          filteredLiked.length ? (
            <div className="library-table-card">
              <LibraryTrackTable tracks={filteredLiked} />
            </div>
          ) : term ? (
            emptyFilter
          ) : (
            <EmptyState
              icon={<Heart size={27} />}
              title="No liked songs yet"
              message="Tap the heart on any song to keep it here. Your likes also sync to YouTube Music when you are signed in."
              action={
                <Button variant="primary" icon={<BarChart3 size={16} />} onClick={() => navigate({ page: 'explore' })}>
                  Find music
                </Button>
              }
            />
          )
        ) : null}

        {tab === 'albums' ? (
          filteredAlbums.length ? (
            <div className="library-media-grid">
              {filteredAlbums.map((album) => (
                <MediaCard key={album.id} card={album} variant="grid" />
              ))}
            </div>
          ) : term ? (
            emptyFilter
          ) : (
            <EmptyState
              icon={<Disc3 size={27} />}
              title="No saved albums"
              message="Save an album from its page and it will wait for you here."
              action={
                <Button variant="primary" onClick={() => navigate({ page: 'explore', tab: 'new' })}>
                  Browse new releases
                </Button>
              }
            />
          )
        ) : null}

        {tab === 'artists' ? (
          filteredArtists.length ? (
            <div className="library-media-grid artist-grid">
              {filteredArtists.map((artist) => (
                <MediaCard key={artist.id} card={artist} variant="grid" />
              ))}
            </div>
          ) : term ? (
            emptyFilter
          ) : (
            <EmptyState
              icon={<UserRound size={27} />}
              title="No artists followed"
              message="Follow an artist to keep their page within reach."
              action={
                <Button variant="primary" onClick={() => navigate({ page: 'explore' })}>
                  Discover artists
                </Button>
              }
            />
          )
        ) : null}

        {tab === 'downloads' ? (
          <div className="library-downloads-content">
            {filteredDownloads.length ? (
              <div className="library-table-card">
                <LibraryTrackTable tracks={filteredDownloads} />
              </div>
            ) : term ? (
              emptyFilter
            ) : (
              <EmptyState
                icon={<Download size={27} />}
                title="Nothing downloaded yet"
                message="Download songs from any track menu to listen without a connection."
                action={
                  <Button variant="primary" onClick={() => navigate({ page: 'explore' })}>
                    Find music
                  </Button>
                }
              />
            )}
            <p className="library-footnote">
              Last refreshed {timeAgo(Date.now())}. Downloads are stored in your chosen folder and never leave your PC.
            </p>
            <button type="button" className="text-button" onClick={() => void refreshLibrary()}>
              <Clock3 size={14} /> Refresh library
            </button>
          </div>
        ) : null}

        {tab === 'youtube' ? <YouTubeLibrary query={filter} /> : null}
      </section>
    </div>
  );
}
