import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Download,
  ExternalLink,
  FolderCheck,
  Heart,
  Info,
  ListMusic,
  ListPlus,
  MicVocal,
  MoreHorizontal,
  Radio,
} from 'lucide-react';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { artistsLine, formatDuration, formatLongDuration } from '../lib/format';
import { downloadTrackAction, showTrackMenu, toggleLikeTrack } from '../lib/actions';
import { Artwork, Button, IconButton } from './primitives';
import { SeekBar, TransportControls, VolumeControl } from './PlayerBar';
import { LyricsPanel } from './LyricsPanel';
import { QueueList } from './QueuePanel';

function NowPlayingAbout() {
  const current = usePlayerStore((state) => state.current);
  const duration = usePlayerStore((state) => state.duration);
  const settings = useAppStore((state) => state.settings);
  const radio = usePlayerStore((state) => state.radio);
  const navigate = useNavStore((state) => state.navigate);
  if (!current) return null;
  return (
    <div className="np-about">
      <div className="np-about-grid">
        <div>
          <span className="np-about-label">Album</span>
          <span className="np-about-value">{current.album?.name || 'Single'}</span>
        </div>
        <div>
          <span className="np-about-label">Artists</span>
          <span className="np-about-value">
            {current.artists?.length
              ? current.artists.map((artist, index) => (
                  <span key={`${artist.name}-${index}`}>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => artist.id && navigate({ page: 'artist', id: artist.id })}
                    >
                      {artist.name}
                    </button>
                    {index < current.artists.length - 1 ? ', ' : ''}
                  </span>
                ))
              : 'Unknown artist'}
          </span>
        </div>
        <div>
          <span className="np-about-label">Duration</span>
          <span className="np-about-value">{formatLongDuration(duration || current.duration) || '—'}</span>
        </div>
        <div>
          <span className="np-about-label">Audio quality</span>
          <span className="np-about-value">{settings.audioQuality === 'auto' ? 'Automatic' : settings.audioQuality}</span>
        </div>
        <div>
          <span className="np-about-label">Source</span>
          <span className="np-about-value">{current.localPath ? 'Downloaded file' : 'YouTube Music'}</span>
        </div>
        <div>
          <span className="np-about-label">Video ID</span>
          <span className="np-about-value is-mono">{current.id}</span>
        </div>
      </div>
      <div className="np-about-actions">
        <Button
          variant="outline"
          icon={<ExternalLink size={16} />}
          onClick={() => void window.auralis.app.openExternal(`https://music.youtube.com/watch?v=${current.id}`)}
        >
          Open on YouTube Music
        </Button>
        {radio ? (
          <span className="np-radio-badge">
            <Radio size={14} /> Playing from radio
          </span>
        ) : null}
      </div>
      <p className="np-about-note">
        Auralis streams audio through yt-dlp and never hosts music. Support the artists you love by listening on official
        platforms.
      </p>
    </div>
  );
}

export function NowPlaying() {
  const open = useUiStore((state) => state.nowPlayingOpen);
  const setOpen = useUiStore((state) => state.setNowPlayingOpen);
  const tab = useUiStore((state) => state.nowPlayingTab);
  const setTab = useUiStore((state) => state.setNowPlayingTab);
  const current = usePlayerStore((state) => state.current);
  const duration = usePlayerStore((state) => state.duration);
  const queue = usePlayerStore((state) => state.queue);
  const index = usePlayerStore((state) => state.index);
  const liked = useAppStore((state) => state.library.liked.some((item) => item?.id === current?.id));
  const downloads = useAppStore((state) => state.library.downloads);
  const navigate = useNavStore((state) => state.navigate);
  const openDialog = useUiStore((state) => state.openDialog);
  const [artLoaded, setArtLoaded] = useState(false);
  const dragStart = useRef<number | null>(null);

  const tabIds = ['lyrics', 'queue', 'about'] as const;
  const focusTab = (id: (typeof tabIds)[number]) => {
    setTab(id);
    document.getElementById(`np-tab-${id}`)?.focus();
  };
  const onTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = tabIds.indexOf(tab);
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusTab(tabIds[(index + 1) % tabIds.length]);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusTab(tabIds[(index - 1 + tabIds.length) % tabIds.length]);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusTab(tabIds[0]);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusTab(tabIds[tabIds.length - 1]);
    }
  };

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, setOpen]);

  useEffect(() => {
    setArtLoaded(false);
  }, [current?.id]);

  if (!open || !current) return null;
  const downloaded = downloads.some((item) => item.track.id === current.id && item.status === 'done');

  return (
    <div className="now-playing" role="dialog" aria-label="Now playing">
      <div
        className="np-backdrop"
        style={current.thumbnail ? { backgroundImage: `url(${current.thumbnail})` } : undefined}
      />
      <div className="np-overlay" />
      <header
        className="np-header"
        onPointerDown={(event) => {
          dragStart.current = event.clientY;
        }}
        onPointerUp={(event) => {
          if (dragStart.current !== null && event.clientY - dragStart.current > 80) setOpen(false);
          dragStart.current = null;
        }}
        onPointerCancel={() => {
          dragStart.current = null;
        }}
      >
        <IconButton label="Close now playing" size="md" onClick={() => setOpen(false)}>
          <ChevronDown size={22} />
        </IconButton>
        <span className="np-header-title">Now playing</span>
        <div className="np-header-actions">
          <IconButton label="Queue" size="sm" active={tab === 'queue'} onClick={() => setTab('queue')}>
            <ListMusic size={18} />
          </IconButton>
          <IconButton
            label="More options"
            size="sm"
            onClick={(event) => showTrackMenu(current, event)}
          >
            <MoreHorizontal size={18} />
          </IconButton>
        </div>
      </header>
      <div className="np-layout">
        <section className={`np-left ${artLoaded ? 'is-loaded' : ''}`}>
          <div className="np-art-frame">
            <Artwork src={current.thumbnail} alt={current.title} className="np-art" />
            {!artLoaded ? <img src={current.thumbnail} alt="" className="preload-img" onLoad={() => setArtLoaded(true)} /> : null}
          </div>
          <div className="np-track-meta">
            <div className="np-title-line">
              <h1>{current.title}</h1>
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
                  <span className="np-dot">•</span>
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
          <div className="np-actions-row">
            <IconButton
              label={liked ? 'Remove from liked songs' : 'Add to liked songs'}
              size="md"
              className={liked ? 'is-liked' : ''}
              onClick={() => void toggleLikeTrack(current)}
            >
              <Heart size={21} fill={liked ? 'currentColor' : 'none'} />
            </IconButton>
            <IconButton
              label={downloaded ? 'Show downloaded file' : 'Download'}
              size="md"
              onClick={() => {
                if (downloaded) {
                  const item = downloads.find((entry) => entry.track.id === current.id);
                  if (item?.path) void window.auralis.app.showItemInFolder(item.path);
                } else {
                  void downloadTrackAction(current);
                }
              }}
            >
              {downloaded ? <FolderCheck size={21} /> : <Download size={21} />}
            </IconButton>
            <IconButton label="Add to playlist" size="md" onClick={() => openDialog({ type: 'add-to-playlist', track: current })}>
              <ListPlus size={21} />
            </IconButton>
            <IconButton label="More options" size="md" onClick={(event) => showTrackMenu(current, event)}>
              <MoreHorizontal size={21} />
            </IconButton>
          </div>
          <SeekBar />
          <div className="np-transport-row">
            <TransportControls size="lg" />
            <VolumeControl />
          </div>
          <div className="np-quality-line">
            <span>{current.localPath ? 'Playing from your library' : 'Streaming'}</span>
            <span>·</span>
            <span>{formatDuration(duration || current.duration)}</span>
            {current.isVideo ? (
              <>
                <span>·</span>
                <span>Video source</span>
              </>
            ) : null}
          </div>
        </section>

        <section className="np-right">
          <div className="np-tabs" role="tablist" aria-label="Now playing panels" onKeyDown={onTabKeyDown}>
            <button
              type="button"
              role="tab"
              id="np-tab-lyrics"
              aria-selected={tab === 'lyrics'}
              aria-controls="np-tabpanel-lyrics"
              tabIndex={tab === 'lyrics' ? 0 : -1}
              className={tab === 'lyrics' ? 'is-active' : ''}
              onClick={() => setTab('lyrics')}
            >
              <MicVocal size={16} /> Lyrics
            </button>
            <button
              type="button"
              role="tab"
              id="np-tab-queue"
              aria-selected={tab === 'queue'}
              aria-controls="np-tabpanel-queue"
              tabIndex={tab === 'queue' ? 0 : -1}
              className={tab === 'queue' ? 'is-active' : ''}
              onClick={() => setTab('queue')}
            >
              <ListMusic size={16} /> Queue <span className="np-tab-count">{Math.max(0, queue.length - index - 1)}</span>
            </button>
            <button
              type="button"
              role="tab"
              id="np-tab-about"
              aria-selected={tab === 'about'}
              aria-controls="np-tabpanel-about"
              tabIndex={tab === 'about' ? 0 : -1}
              className={tab === 'about' ? 'is-active' : ''}
              onClick={() => setTab('about')}
            >
              <Info size={16} /> Details
            </button>
          </div>
          <div
            className="np-panel"
            role="tabpanel"
            id={`np-tabpanel-${tab}`}
            aria-labelledby={`np-tab-${tab}`}
          >
            {tab === 'lyrics' ? <LyricsPanel track={current} active /> : null}
            {tab === 'queue' ? <QueueList compact /> : null}
            {tab === 'about' ? <NowPlayingAbout /> : null}
          </div>
        </section>
      </div>
      <div className="np-artist-meta">{artistsLine(current.artists)}</div>
    </div>
  );
}
