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
import { usePlayerStore, currentPlaybackPosition } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { artistsLine, formatDuration, formatLongDuration } from '../lib/format';
import { isAndroidShell } from '../lib/platform';
import { downloadTrackAction, showTrackMenu, toggleLikeTrack } from '../lib/actions';
import { Artwork, Button, IconButton } from './primitives';
import { SeekBar, TransportControls, VolumeControl } from './PlayerBar';
import { LyricsPanel } from './LyricsPanel';
import { QueueList } from './QueuePanel';

function largerAndroidArtwork(src?: string): string | undefined {
  if (!src || !document.documentElement.classList.contains('is-android')) return src;
  if (!/googleusercontent\.com|ggpht\.com/.test(src)) return src;
  if (/=w\d+-h\d+/.test(src)) {
    return src.replace(/=w\d+-h\d+/, '=w960-h960');
  }
  if (/=s\d+/.test(src)) return src.replace(/=s\d+/, '=s960');
  return src;
}

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
  const videoClips = useAppStore((state) => Boolean(state.settings.videoClips));
  const [artLoaded, setArtLoaded] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | undefined>();
  const videoRef = useRef<HTMLVideoElement>(null);

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
    setVideoUrl(undefined);
  }, [current?.id]);

  useEffect(() => {
    setVideoUrl(undefined);
    if (!open || !videoClips || !current || current.localPath || !isAndroidShell) return;
    const resolveVideo = window.auralis.player.resolveVideo;
    if (!resolveVideo) return;
    let cancelled = false;
    const trackId = current.id;
    resolveVideo(current)
      .then((stream) => {
        if (cancelled || !stream.url) return;
        if (usePlayerStore.getState().current?.id !== trackId) return;
        setVideoUrl(stream.url);
      })
      .catch(() => {
        // Artwork remains the fallback when no progressive video exists.
      });
    return () => {
      cancelled = true;
    };
  }, [open, videoClips, current]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    const sync = () => {
      const state = usePlayerStore.getState();
      const target = currentPlaybackPosition();
      if (Number.isFinite(target) && Math.abs(video.currentTime - target) > 0.8) {
        try {
          video.currentTime = target;
        } catch {
          // Seeking before metadata is ready is ignored.
        }
      }
      video.playbackRate = state.rate || 1;
      if (state.playing && video.paused) void video.play().catch(() => {});
      if (!state.playing && !video.paused) video.pause();
    };
    sync();
    video.addEventListener('loadedmetadata', sync);
    const unsubscribe = usePlayerStore.subscribe((state, previous) => {
      if (state.playing !== previous.playing || state.rate !== previous.rate) sync();
    });
    const timer = window.setInterval(sync, 5000);
    return () => {
      window.clearInterval(timer);
      unsubscribe();
      video.removeEventListener('loadedmetadata', sync);
    };
  }, [videoUrl]);

  if (!open || !current) return null;
  const downloaded = downloads.some((item) => item.track.id === current.id && item.status === 'done');
  const artworkSrc = largerAndroidArtwork(current.thumbnail);

  return (
    <div className="now-playing" role="dialog" aria-modal="true" aria-label="Now playing">
      <div
        className="np-backdrop"
        style={artworkSrc ? { backgroundImage: `url(${artworkSrc})` } : undefined}
      />
      <div className="np-overlay" />
      <header className="np-header">
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
          <div className={`np-art-frame ${videoUrl ? 'has-video' : ''}`}>
            <Artwork src={artworkSrc} alt={current.title} className="np-art" />
            {videoUrl ? (
              <>
                <video
                  ref={videoRef}
                  className="np-video"
                  src={videoUrl}
                  muted
                  playsInline
                  preload="metadata"
                  disablePictureInPicture
                  aria-label={`Video clip for ${current.title}`}
                  onError={() => setVideoUrl(undefined)}
                />
                <span className="np-video-badge">Video</span>
              </>
            ) : null}
            {!artLoaded && !videoUrl ? <img src={artworkSrc} alt="" className="preload-img" onLoad={() => setArtLoaded(true)} /> : null}
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
          <div className="np-tabs" role="tablist" aria-label="Now playing sections">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'lyrics'}
              className={tab === 'lyrics' ? 'is-active' : ''}
              onClick={() => setTab('lyrics')}
            >
              <MicVocal size={16} /> Lyrics
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'queue'}
              className={tab === 'queue' ? 'is-active' : ''}
              onClick={() => setTab('queue')}
            >
              <ListMusic size={16} /> Queue <span className="np-tab-count">{Math.max(0, queue.length - index - 1)}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'about'}
              className={tab === 'about' ? 'is-active' : ''}
              onClick={() => setTab('about')}
            >
              <Info size={16} /> Details
            </button>
          </div>
          <div className="np-panel">
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
