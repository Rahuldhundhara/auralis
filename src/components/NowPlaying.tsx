import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Download, FolderCheck, Heart, ListMusic, Mic, MicVocal, MoreHorizontal, X } from 'lucide-react';
import { downloadForTrack, useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { downloadTrackAction, showTrackMenu, toggleLikeTrack } from '../lib/actions';
import { Artwork, IconButton } from './primitives';
import { proxiedArtwork } from '../lib/image';
import { SeekBar, TransportControls, VolumeControl } from './PlayerBar';
import { LyricsPanel } from './LyricsPanel';
import { QueuePanel } from './QueuePanel';

export function NowPlaying() {
  const open = useUiStore((state) => state.nowPlayingOpen);
  const setOpen = useUiStore((state) => state.setNowPlayingOpen);
  const openDialog = useUiStore((state) => state.openDialog);
  const tab = useUiStore((state) => state.nowPlayingTab);
  const setTab = useUiStore((state) => state.setNowPlayingTab);
  const current = usePlayerStore((state) => state.current);
  const upcomingCount = usePlayerStore((state) => Math.max(0, state.queue.length - state.index - 1));
  const liked = useAppStore((state) => state.library.liked.some((item) => item?.id === current?.id));
  const downloads = useAppStore((state) => state.library.downloads);
  const downloaded = current ? downloadForTrack(downloads, current.id) : undefined;
  const navigate = useNavStore((state) => state.navigate);
  const [artLoaded, setArtLoaded] = useState(false);
  const swipeStart = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, setOpen]);

  // The thumbnail identity (not just the id) also drives the fade so a
  // hydrated cover never leaves the panel stuck on the old one.
  useEffect(() => {
    setArtLoaded(false);
  }, [current?.id, current?.thumbnail]);

  if (!open || !current) return null;

  return (
    <div className="now-playing" role="dialog" aria-label="Now playing">
      <div
        className="np-backdrop"
        style={current.thumbnail ? { backgroundImage: `url(${proxiedArtwork(current.thumbnail)})` } : undefined}
      />
      <div className="np-overlay" />
      <header
        className="np-header"
        onPointerDown={(event) => {
          if (event.pointerType === 'touch' || event.pointerType === 'pen') swipeStart.current = event.clientY;
        }}
        onPointerUp={(event) => {
          const start = swipeStart.current;
          swipeStart.current = null;
          if (start !== null && event.clientY - start > 80) setOpen(false);
        }}
      >
        <IconButton label="Back" size="md" className="np-round-btn" onClick={() => setOpen(false)}>
          <ChevronLeft size={20} />
        </IconButton>
        <div className="np-header-actions">
          <IconButton
            label="More options"
            size="md"
            className="np-round-btn"
            onClick={(event) => showTrackMenu(current, event)}
          >
            <MoreHorizontal size={18} />
          </IconButton>
          <IconButton label="Close now playing" size="md" className="np-round-btn" onClick={() => setOpen(false)}>
            <X size={18} />
          </IconButton>
        </div>
      </header>

      <div className="np-layout">
        <section className={`np-left ${artLoaded ? 'is-loaded' : ''}`}>
          <div className="np-art-frame">
            <Artwork src={current.thumbnail} alt={current.title} className="np-art" />
            {!artLoaded && current.thumbnail ? (
              <img src={proxiedArtwork(current.thumbnail)} alt="" className="preload-img" onLoad={() => setArtLoaded(true)} />
            ) : null}
          </div>
          <div className="np-track-meta">
            <div className="np-title-row">
              <h1>{current.title}</h1>
              <div className="np-title-actions">
                <IconButton
                  label={liked ? 'Remove from liked songs' : 'Add to liked songs'}
                  size="sm"
                  className={liked ? 'is-liked' : ''}
                  onClick={() => void toggleLikeTrack(current)}
                >
                  <Heart size={17} fill={liked ? 'currentColor' : 'none'} />
                </IconButton>
                <IconButton
                  label={downloaded ? 'Show downloaded file' : 'Download'}
                  size="sm"
                  className={downloaded ? 'is-downloaded' : ''}
                  onClick={() => {
                    if (downloaded?.path) void window.auralis.app.showItemInFolder(downloaded.path);
                    else void downloadTrackAction(current);
                  }}
                >
                  {downloaded ? <FolderCheck size={17} /> : <Download size={17} />}
                </IconButton>
                <IconButton label="More options" size="sm" onClick={(event) => showTrackMenu(current, event)}>
                  <MoreHorizontal size={17} />
                </IconButton>
              </div>
            </div>
            <div className="np-artist-line">
              {current.artists?.length
                ? current.artists.map((artist, artistIndex) => (
                    <span key={`${artist.name}-${artistIndex}`}>
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => (artist.id ? navigate({ page: 'artist', id: artist.id }) : navigate({ page: 'search', q: artist.name }))}
                      >
                        {artist.name}
                      </button>
                      {artistIndex < current.artists.length - 1 ? ', ' : ''}
                    </span>
                  ))
                : 'Unknown artist'}
              {current.album?.name ? (
                <>
                  <span className="np-dot">—</span>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => current.album?.id && navigate({ page: 'album', id: current.album.id })}
                  >
                    {current.album.name}
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <SeekBar remaining />
          <div className="np-transport-row">
            <TransportControls size="lg" />
            <VolumeControl />
          </div>
        </section>

        <section className="np-right">
          <div className="np-tabs" role="tablist" aria-label="Now playing view">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'lyrics'}
              className={`np-tab ${tab === 'lyrics' ? 'is-active' : ''}`}
              onClick={() => setTab('lyrics')}
            >
              <MicVocal size={16} />
              <span>Lyrics</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'queue'}
              className={`np-tab ${tab === 'queue' ? 'is-active' : ''}`}
              onClick={() => setTab('queue')}
            >
              <ListMusic size={16} />
              <span>Queue</span>
              {upcomingCount > 0 ? <span className="np-tab-count">{upcomingCount}</span> : null}
            </button>
          </div>
          <div className="np-tab-body">
            {tab === 'queue' ? (
              <QueuePanel />
            ) : (
              <LyricsPanel track={current} active={tab === 'lyrics'} />
            )}
          </div>
        </section>
      </div>

      <button
        type="button"
        className="np-identify"
        onClick={() => openDialog({ type: 'recognition' })}
        title="Identify a song by singing, humming, or playing it nearby"
        aria-label="Identify your song"
      >
        <Mic size={18} />
      </button>
    </div>
  );
}
