import { useMemo, useState } from 'react';
import { Download, MoreHorizontal, Pencil, Play, Plus, Search, Shuffle, Trash2 } from 'lucide-react';
import type { Track } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { confirmDialog, toast, useUiStore } from '../stores/ui';
import { formatLongDuration, shuffleArray, timeAgo } from '../lib/format';
import { Artwork, Button, EmptyState, IconButton, Spinner } from '../components/primitives';
import { TrackList } from '../components/TrackList';

export function LocalPlaylistPage({ id }: { id: string }) {
  const playlist = useAppStore((state) => state.library.playlists.find((item) => item.id === id));
  const removeFromPlaylist = useAppStore((state) => state.removeFromPlaylist);
  const addToPlaylist = useAppStore((state) => state.addToPlaylist);
  const deletePlaylist = useAppStore((state) => state.deletePlaylist);
  const downloadTrack = useAppStore((state) => state.downloadTrack);
  const refreshLibrary = useAppStore((state) => state.refreshLibrary);
  const openDialog = useUiStore((state) => state.openDialog);
  const openMenu = useUiStore((state) => state.openMenu);
  const navigate = useNavStore((state) => state.navigate);
  const [downloading, setDownloading] = useState<string | undefined>();

  const tracks = playlist?.tracks || [];
  const covers = useMemo(() => {
    const seen = new Set<string>();
    const output: string[] = [];
    for (const track of tracks) {
      if (!track.thumbnail || seen.has(track.thumbnail)) continue;
      seen.add(track.thumbnail);
      output.push(track.thumbnail);
      if (output.length === 4) break;
    }
    return output;
  }, [tracks]);
  const totalDuration = tracks.reduce((sum, track) => sum + (track.duration || 0), 0);

  if (!playlist) {
    return (
      <EmptyState
        icon={<Search size={26} />}
        title="Playlist not found"
        message="It may have been deleted. Your other playlists are safe in the library."
        action={
          <Button variant="primary" onClick={() => navigate({ page: 'library', tab: 'playlists' })}>
            Back to library
          </Button>
        }
      />
    );
  }

  const play = (shuffle = false) => {
    if (!tracks.length) {
      toast('Add some songs to this playlist first.', 'info');
      return;
    }
    usePlayerStore.getState().playQueue(shuffle ? shuffleArray(tracks) : tracks, 0);
  };

  const removeTrack = (track: Track) => {
    void removeFromPlaylist(playlist.id, track.id)
      .then(() => {
        toast(`Removed “${track.title}”.`, 'info', {
          label: 'Undo',
          onClick: () => {
            void addToPlaylist(playlist.id, track).catch(() => {});
          },
        });
      })
      .catch((error: any) => toast(`Could not remove the song: ${error?.message || error}`, 'error'));
  };

  const deleteThisPlaylist = () => {
    confirmDialog({
      title: 'Delete playlist?',
      message: `“${playlist.name}” will be removed from your library. The downloaded files and liked songs stay.`,
      confirmLabel: 'Delete playlist',
      danger: true,
      onConfirm: async () => {
        await deletePlaylist(playlist.id);
        toast('Playlist deleted.', 'success');
        navigate({ page: 'library', tab: 'playlists' });
      },
    });
  };

  const downloadAll = () => {
    const pending = tracks.filter((track) => !useAppStore.getState().library.downloads.some((item) => item.track.id === track.id && item.status === 'done'));
    if (!pending.length) {
      toast('Everything in this playlist is already downloaded.', 'info');
      return;
    }
    const run = async () => {
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
        failed ? `Downloaded ${completed}; ${failed} failed.` : `Downloaded ${completed} ${completed === 1 ? 'song' : 'songs'}.`,
        failed ? 'error' : 'success',
      );
    };
    if (pending.length > 3) {
      confirmDialog({
        title: `Download ${pending.length} songs?`,
        message: 'The songs will be saved to your downloads folder so they play without a connection.',
        confirmLabel: 'Start download',
        onConfirm: run,
      });
    } else {
      void run();
    }
  };

  const showMenu = (event: React.MouseEvent) => {
    openMenu(event.clientX, event.clientY, [
      { label: 'Play', icon: Play, onClick: () => play(false) },
      { label: 'Shuffle', icon: Shuffle, onClick: () => play(true) },
      { separator: true },
      { label: 'Edit details', icon: Pencil, onClick: () => openDialog({ type: 'rename-playlist', playlist }) },
      { label: 'Find more songs', icon: Plus, onClick: () => navigate({ page: 'search' }) },
      { label: 'Download all', icon: Download, onClick: downloadAll },
      { separator: true },
      { label: 'Delete playlist', icon: Trash2, danger: true, onClick: deleteThisPlaylist },
    ]);
  };

  return (
    <div className="page local-playlist-page">
      <section className="detail-hero detail-hero-playlist local-playlist-hero">
        <div
          className="detail-hero-bg"
          style={covers[0] ? { backgroundImage: `url(${covers[0]})` } : undefined}
          aria-hidden="true"
        />
        <div className="detail-hero-inner">
          <div className="detail-cover local-playlist-cover">
            {covers.length ? (
              <div className={`cover-mosaic count-${covers.length}`}>
                {covers.map((src, index) => (
                  <img src={src} alt="" key={`${src}-${index}`} loading="lazy" />
                ))}
              </div>
            ) : (
              <Artwork src={playlist.cover} alt={playlist.name} className="detail-art" />
            )}
          </div>
          <div className="detail-copy">
            <span className="eyebrow">Your playlist</span>
            <h1>{playlist.name}</h1>
            {playlist.description ? <p className="detail-description">{playlist.description}</p> : null}
            <div className="detail-meta">
              <span className="detail-meta-item">{playlist.tracks.length} songs</span>
              {totalDuration ? (
                <span className="detail-meta-item">
                  <span className="meta-dot" />
                  {formatLongDuration(totalDuration)}
                </span>
              ) : null}
              <span className="detail-meta-item">
                <span className="meta-dot" />
                Updated {timeAgo(playlist.updatedAt)}
              </span>
            </div>
            <div className="detail-actions">
              <Button variant="primary" size="lg" icon={<Play size={19} fill="currentColor" />} onClick={() => play(false)} disabled={!tracks.length}>
                Play
              </Button>
              <IconButton label="Shuffle" size="lg" variant="surface" onClick={() => play(true)} disabled={!tracks.length}>
                <Shuffle size={19} />
              </IconButton>
              <Button
                variant="outline"
                icon={<Plus size={17} />}
                onClick={() => openDialog({ type: 'create-playlist' })}
              >
                New playlist
              </Button>
              <Button
                variant="outline"
                icon={downloading ? <Spinner size={16} /> : <Download size={17} />}
                onClick={downloadAll}
                disabled={!tracks.length || Boolean(downloading)}
              >
                {downloading ? `Downloading ${downloading}` : 'Download'}
              </Button>
              <IconButton label="More options" size="lg" variant="surface" onClick={showMenu}>
                <MoreHorizontal size={19} />
              </IconButton>
            </div>
          </div>
        </div>
      </section>

      {tracks.length ? (
        <section className="detail-tracks">
          <div className="section-heading">
            <div>
              <h2>Track list</h2>
              <span className="section-subtitle">Use the row menu to reorder or remove songs.</span>
            </div>
            <Button variant="ghost" size="sm" icon={<Pencil size={15} />} onClick={() => openDialog({ type: 'rename-playlist', playlist })}>
              Edit
            </Button>
          </div>
          <div className="shelf-list-card detail-track-list">
            <TrackList
              tracks={tracks}
              showArt
              showAlbum
              showIndex
              context={{ localPlaylistId: playlist.id }}
              onRemove={removeTrack}
            />
          </div>
          <div className="detail-footer-actions">
            <Button variant="outline" icon={<Plus size={16} />} onClick={() => navigate({ page: 'search' })}>
              Add more songs
            </Button>
            <Button variant="ghost" icon={<Trash2 size={16} />} onClick={deleteThisPlaylist}>
              Delete playlist
            </Button>
          </div>
        </section>
      ) : (
        <EmptyState
          icon={<Plus size={26} />}
          title="This playlist is ready for music"
          message="Search for songs, albums or artists and use “Add to playlist” from any track menu."
          action={
            <div className="empty-actions-row">
              <Button variant="primary" icon={<Search size={16} />} onClick={() => navigate({ page: 'search' })}>
                Find songs
              </Button>
              <Button variant="outline" icon={<Play size={16} />} onClick={() => navigate({ page: 'explore' })}>
                Explore music
              </Button>
            </div>
          }
        />
      )}

      <button type="button" className="floating-add" onClick={() => navigate({ page: 'search' })} title="Find songs to add">
        <Plus size={22} />
      </button>
    </div>
  );
}
