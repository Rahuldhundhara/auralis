import { useMemo, useState } from 'react';
import {
  BarChart3,
  Clock3,
  Disc3,
  Download,
  Heart,
  History,
  LibraryBig,
  ListMusic,
  Loader2,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Shuffle,
  Trash2,
  UserRound,
  CirclePlay,
} from 'lucide-react';
import type { Card, LocalPlaylist } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore, type Route } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { confirmDialog, toast, useUiStore } from '../stores/ui';
import { formatBytes, formatLongDuration, shuffleArray, timeAgo } from '../lib/format';
import { tracksFromPage } from '../lib/actions';
import { useAsync } from '../lib/useAsync';
import { isAndroidShell } from '../lib/platform';
import { Artwork, Button, EmptyState, ErrorPanel, IconButton, PageSkeleton } from '../components/primitives';
import { MediaCard, ShelfGrid } from '../components/MediaCard';
import { TrackList } from '../components/TrackList';

type LibraryTab = 'playlists' | 'songs' | 'albums' | 'artists' | 'downloads' | 'youtube';

const TABS: Array<{ id: LibraryTab; label: string; icon: React.ReactNode }> = [
  { id: 'playlists', label: 'Playlists', icon: <ListMusic size={16} /> },
  { id: 'songs', label: 'Liked songs', icon: <Heart size={16} /> },
  { id: 'albums', label: 'Albums', icon: <Disc3 size={16} /> },
  { id: 'artists', label: 'Artists', icon: <UserRound size={16} /> },
  { id: 'downloads', label: 'Downloads', icon: <Download size={16} /> },
  { id: 'youtube', label: 'YouTube Music', icon: <CirclePlay size={16} /> },
];

function playlistCover(playlist: LocalPlaylist): string | undefined {
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
      { label: 'Play', icon: Play, onClick: () => playlist.tracks.length && usePlayerStore.getState().playQueue(playlist.tracks, 0) },
      { label: 'Shuffle', icon: Shuffle, onClick: () => playlist.tracks.length && usePlayerStore.getState().playQueue(shuffleArray(playlist.tracks), 0) },
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

  return (
    <article className="media-card media-card-grid local-card" onContextMenu={menu}>
      <div className="card-art-wrap">
        <button type="button" className="card-art-button" onClick={() => navigate({ page: 'local', id: playlist.id })} title={playlist.name}>
          <Artwork src={playlistCover(playlist)} alt={playlist.name} className="card-art" />
          <span className="card-play" aria-hidden="true">
            <Play size={20} fill="currentColor" />
          </span>
        </button>
        <IconButton label="More options" size="sm" className="card-more" onClick={menu}>
          <MoreHorizontal size={17} />
        </IconButton>
      </div>
      <button type="button" className="card-text" onClick={() => navigate({ page: 'local', id: playlist.id })}>
        <span className="card-title">{playlist.name}</span>
        <span className="card-subtitle">
          {playlist.tracks.length} {playlist.tracks.length === 1 ? 'song' : 'songs'}
          {duration ? ` · ${formatLongDuration(duration)}` : ''}
        </span>
      </button>
    </article>
  );
}

function YouTubeLibrary() {
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
  const importPlaylist = useAppStore((state) => state.importPlaylist);
  const refreshLibrary = useAppStore((state) => state.refreshLibrary);
  const [importing, setImporting] = useState(false);

  const playlistCards = useMemo(() => {
    const seen = new Set<string>();
    const output: Card[] = [];
    for (const shelf of data?.shelves || []) {
      for (const card of shelf.items) {
        if (card.type !== 'playlist' || !card.id || seen.has(card.id)) continue;
        seen.add(card.id);
        output.push(card);
      }
    }
    return output;
  }, [data]);

  const migratePlaylists = () => {
    if (!playlistCards.length) {
      toast('No YouTube Music playlists found in your library yet.', 'info');
      return;
    }
    confirmDialog({
      title: 'Import YouTube playlists?',
      message: `${playlistCards.length} ${playlistCards.length === 1 ? 'playlist will' : 'playlists will'} be copied into your local Auralis library. Re-importing refreshes the same playlists instead of creating duplicates.`,
      confirmLabel: 'Import',
      onConfirm: async () => {
        setImporting(true);
        let imported = 0;
        let failed = 0;
        let copied = 0;
        for (const card of playlistCards) {
          try {
            const page = await window.auralis.yt.playlist(card.id);
            const seen = new Set<string>();
            const tracks = tracksFromPage(page).filter((track) => {
              if (seen.has(track.id)) return false;
              seen.add(track.id);
              return true;
            });
            let continuation = page.continuation;
            let pages = 0;
            while (continuation && pages < 25) {
              const next = await window.auralis.yt.detailContinuation(continuation);
              for (const track of next.tracks) {
                if (seen.has(track.id)) continue;
                seen.add(track.id);
                tracks.push(track);
              }
              continuation = next.continuation;
              pages += 1;
            }
            if (!tracks.length) {
              failed += 1;
              continue;
            }
            await importPlaylist(card.title, tracks, 'Imported from YouTube Music', card.id);
            imported += 1;
            copied += tracks.length;
          } catch {
            failed += 1;
          }
        }
        await refreshLibrary();
        setImporting(false);
        if (imported) {
          toast(
            `Imported ${imported} ${imported === 1 ? 'playlist' : 'playlists'} with ${copied} songs.`,
            'success',
          );
        }
        if (failed) toast(`${failed} ${failed === 1 ? 'playlist' : 'playlists'} could not be imported.`, 'error');
      },
    });
  };

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
          {playlistCards.length ? (
            <Button
              variant="ghost"
              size="sm"
              icon={importing ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
              onClick={migratePlaylists}
              disabled={importing}
            >
              {importing ? 'Importing…' : 'Import playlists'}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" icon={<History size={16} />} onClick={() => navigate({ page: 'history' })}>
            History
          </Button>
          <Button variant="outline" size="sm" onClick={reload}>
            Refresh
          </Button>
        </div>
      </div>
      {data?.shelves.length ? <ShelfGrid shelves={data.shelves} /> : <EmptyState icon={<LibraryBig size={26} />} title="Your library is empty" message="Save songs and playlists on YouTube Music and they will appear here." />}
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

  const downloadedTracks = useMemo(
    () => library.downloads.filter((item) => item.status === 'done').map((item) => item.track),
    [library.downloads],
  );
  const downloadBytes = library.downloads.reduce((sum, item) => sum + (item.size || 0), 0);
  const routeFor = (next: LibraryTab): Route => ({ page: 'library', tab: next });

  const shuffleLiked = () => {
    if (!library.liked.length) {
      toast('Like some songs first.', 'info');
      return;
    }
    usePlayerStore.getState().playQueue(shuffleArray(library.liked), 0);
  };

  return (
    <div className="page library-page">
      <header className="page-hero library-hero">
        <div className="library-hero-copy">
          <span className="eyebrow">
            <LibraryBig size={14} /> Your collection
          </span>
          <h1>Library</h1>
          <p>Everything you have saved, downloaded and collected in Auralis.</p>
          <div className="library-stats">
            <button type="button" className="library-stat" onClick={() => navigate(routeFor('songs'))}>
              <strong>{library.liked.length}</strong>
              <span>Liked songs</span>
            </button>
            <button type="button" className="library-stat" onClick={() => navigate(routeFor('playlists'))}>
              <strong>{library.playlists.length}</strong>
              <span>Playlists</span>
            </button>
            <button type="button" className="library-stat" onClick={() => navigate(routeFor('albums'))}>
              <strong>{library.savedAlbums.length}</strong>
              <span>Albums</span>
            </button>
            <button type="button" className="library-stat" onClick={() => navigate(routeFor('downloads'))}>
              <strong>{library.downloads.filter((item) => item.status === 'done').length}</strong>
              <span>Downloads</span>
            </button>
          </div>
          <div className="library-hero-actions">
            <Button variant="primary" icon={<Plus size={17} />} onClick={() => openDialog({ type: 'create-playlist' })}>
              New playlist
            </Button>
            <Button variant="secondary" icon={<Shuffle size={17} />} onClick={shuffleLiked}>
              Shuffle liked
            </Button>
            {session.hasCookies ? (
              <Button variant="ghost" icon={<History size={16} />} onClick={() => navigate({ page: 'history' })}>
                YouTube history
              </Button>
            ) : null}
          </div>
        </div>
        <div className="library-hero-art" aria-hidden="true">
          {[
            ...library.savedAlbums.map((album) => album.thumbnail),
            ...library.playlists.map(playlistCover),
            ...downloadedTracks.map((track) => track.thumbnail),
          ]
            .filter(Boolean)
            .slice(0, 4)
            .map((src, index) => (
              <Artwork key={`${src}-${index}`} src={src} alt="" className={`hero-tile hero-tile-${index + 1}`} />
            ))}
          {!library.savedAlbums.length && !library.playlists.length && !downloadedTracks.length ? (
            <div className="hero-tile hero-tile-placeholder">
              <LibraryBig size={46} />
            </div>
          ) : null}
        </div>
      </header>

      <div className="library-tabs" role="tablist">
        {TABS.map((entry) => (
          <button
            type="button"
            key={entry.id}
            role="tab"
            aria-selected={tab === entry.id}
            className={`library-tab ${tab === entry.id ? 'is-active' : ''}`}
            onClick={() => navigate(routeFor(entry.id), true)}
          >
            {entry.icon}
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'playlists' ? (
        <section className="library-section">
          <div className="section-heading">
            <div>
              <h2>Playlists</h2>
              <span className="section-subtitle">Your own collections, ordered however you like.</span>
            </div>
            <Button variant="outline" size="sm" icon={<Plus size={16} />} onClick={() => openDialog({ type: 'create-playlist' })}>
              Create
            </Button>
          </div>
          {library.playlists.length ? (
            <div className="media-grid library-playlist-grid">
              <button type="button" className="create-playlist-card" onClick={() => openDialog({ type: 'create-playlist' })}>
                <span className="create-playlist-icon">
                  <Plus size={26} />
                </span>
                <strong>New playlist</strong>
                <span>Start a fresh collection</span>
              </button>
              {library.playlists.map((playlist) => (
                <LocalPlaylistCard key={playlist.id} playlist={playlist} />
              ))}
            </div>
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
          )}
        </section>
      ) : null}

      {tab === 'songs' ? (
        <section className="library-section">
          <div className="section-heading">
            <div>
              <h2>Liked songs</h2>
              <span className="section-subtitle">
                {library.liked.length} songs
                {library.liked.length
                  ? ` · ${formatLongDuration(library.liked.reduce((sum, track) => sum + (track.duration || 0), 0))}`
                  : ''}
              </span>
            </div>
            <div className="section-heading-actions">
              <Button
                variant="primary"
                size="sm"
                icon={<Play size={16} fill="currentColor" />}
                disabled={!library.liked.length}
                onClick={() => usePlayerStore.getState().playQueue(library.liked, 0)}
              >
                Play
              </Button>
              <IconButton label="Shuffle liked songs" size="md" variant="surface" onClick={shuffleLiked} disabled={!library.liked.length}>
                <Shuffle size={17} />
              </IconButton>
            </div>
          </div>
          {library.liked.length ? (
            <div className="shelf-list-card">
              <TrackList tracks={library.liked} showArt showAlbum />
            </div>
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
          )}
        </section>
      ) : null}

      {tab === 'albums' ? (
        <section className="library-section">
          <div className="section-heading">
            <div>
              <h2>Saved albums</h2>
              <span className="section-subtitle">{library.savedAlbums.length} albums and releases</span>
            </div>
          </div>
          {library.savedAlbums.length ? (
            <div className="media-grid">
              {library.savedAlbums.map((album) => (
                <MediaCard key={album.id} card={album} variant="grid" />
              ))}
            </div>
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
          )}
        </section>
      ) : null}

      {tab === 'artists' ? (
        <section className="library-section">
          <div className="section-heading">
            <div>
              <h2>Artists you follow</h2>
              <span className="section-subtitle">{library.savedArtists.length} artists</span>
            </div>
          </div>
          {library.savedArtists.length ? (
            <div className="media-grid artist-grid">
              {library.savedArtists.map((artist) => (
                <MediaCard key={artist.id} card={artist} variant="grid" />
              ))}
            </div>
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
          )}
        </section>
      ) : null}

      {tab === 'downloads' ? (
        <section className="library-section">
          <div className="section-heading">
            <div>
              <h2>Downloads</h2>
              <span className="section-subtitle">
                {downloadedTracks.length} {downloadedTracks.length === 1 ? 'song' : 'songs'} ready offline{downloadBytes ? ` · ${formatBytes(downloadBytes)}` : ''}
              </span>
            </div>
            <div className="section-heading-actions">
              <Button variant="outline" size="sm" icon={<Download size={16} />} onClick={() => navigate({ page: 'downloads' })}>
                Manage downloads
              </Button>
            </div>
          </div>
          {downloadedTracks.length ? (
            <div className="shelf-list-card">
              <TrackList tracks={downloadedTracks} showArt showAlbum emptyText="No downloaded songs yet." />
            </div>
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
            Last refreshed {timeAgo(Date.now())}.{' '}
            {isAndroidShell
              ? 'Downloads are stored privately inside Auralis and never leave your device.'
              : 'Downloads are stored in your chosen folder and never leave your PC.'}
          </p>
          <button type="button" className="text-button" onClick={() => void refreshLibrary()}>
            <Clock3 size={14} /> Refresh library
          </button>
        </section>
      ) : null}

      {tab === 'youtube' ? (
        <section className="library-section">
          <YouTubeLibrary />
        </section>
      ) : null}
    </div>
  );
}
