import { useEffect, useState } from 'react';
import {
  ChevronUp,
  Heart,
  ListMusic,
  Loader2,
  MicVocal,
  MoreHorizontal,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Timer,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { Track } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { useUiStore, type MenuItem } from '../stores/ui';
import { artistsLine, formatDuration } from '../lib/format';
import { showTrackMenu, toggleLikeTrack } from '../lib/actions';
import { Artwork, IconButton, Range } from './primitives';

export function SeekBar({ compact = false }: { compact?: boolean }) {
  const position = usePlayerStore((state) => state.position);
  const duration = usePlayerStore((state) => state.duration);
  const seek = usePlayerStore((state) => state.seek);
  const safeDuration = duration > 0 ? duration : 1;
  return (
    <div className={`seek-bar ${compact ? 'is-compact' : ''}`}>
      {!compact ? <span className="time">{formatDuration(position)}</span> : null}
      <Range
        className="seek-range"
        min={0}
        max={safeDuration}
        step={0.25}
        value={Math.min(position, safeDuration)}
        onValueChange={seek}
        aria-label="Seek"
      />
      {!compact ? <span className="time">{formatDuration(duration)}</span> : null}
    </div>
  );
}

export function TransportControls({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const playing = usePlayerStore((state) => state.playing);
  const loading = usePlayerStore((state) => state.loading);
  const buffering = usePlayerStore((state) => state.buffering);
  const shuffle = usePlayerStore((state) => state.shuffle);
  const repeat = usePlayerStore((state) => state.repeat);
  const hasQueue = usePlayerStore((state) => state.queue.length > 0);
  const big = size === 'lg';

  return (
    <div className={`transport transport-${size}`}>
      <IconButton
        label={shuffle ? 'Turn shuffle off' : 'Shuffle'}
        active={shuffle}
        size={big ? 'md' : 'sm'}
        onClick={() => usePlayerStore.getState().toggleShuffle()}
        disabled={!hasQueue}
      >
        <Shuffle size={big ? 20 : 16} />
      </IconButton>
      <IconButton label="Previous" size={big ? 'lg' : 'md'} onClick={() => usePlayerStore.getState().previous()} disabled={!hasQueue}>
        <SkipBack size={big ? 26 : 19} fill="currentColor" />
      </IconButton>
      <button
        type="button"
        className={`play-button ${big ? 'is-large' : ''}`}
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={() => usePlayerStore.getState().toggle()}
      >
        {loading || buffering ? (
          <Loader2 size={big ? 30 : 22} className="spin" />
        ) : playing ? (
          <Pause size={big ? 30 : 22} fill="currentColor" />
        ) : (
          <Play size={big ? 30 : 22} fill="currentColor" className="play-icon-offset" />
        )}
      </button>
      <IconButton label="Next" size={big ? 'lg' : 'md'} onClick={() => usePlayerStore.getState().next()} disabled={!hasQueue}>
        <SkipForward size={big ? 26 : 19} fill="currentColor" />
      </IconButton>
      <IconButton
        label={repeat === 'one' ? 'Repeat this song' : repeat === 'all' ? 'Repeat queue' : 'Repeat off'}
        active={repeat !== 'off'}
        size={big ? 'md' : 'sm'}
        onClick={() => usePlayerStore.getState().cycleRepeat()}
        disabled={!hasQueue}
      >
        {repeat === 'one' ? <Repeat1 size={big ? 20 : 16} /> : <Repeat size={big ? 20 : 16} />}
      </IconButton>
    </div>
  );
}

export function VolumeControl() {
  const volume = usePlayerStore((state) => state.volume);
  const muted = usePlayerStore((state) => state.muted);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const toggleMute = usePlayerStore((state) => state.toggleMute);
  const Icon = muted || volume === 0 ? VolumeX : volume < 0.45 ? Volume1 : Volume2;
  return (
    <div className="volume-control">
      <IconButton label={muted ? 'Unmute' : 'Mute'} size="sm" onClick={() => toggleMute()}>
        <Icon size={18} />
      </IconButton>
      <Range
        className="volume-range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onValueChange={setVolume}
        aria-label="Volume"
      />
    </div>
  );
}

function SleepTimerButton() {
  const end = usePlayerStore((state) => state.sleepTimerEnd);
  const endOfTrack = usePlayerStore((state) => state.sleepTimerEndOfTrack);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!end) return;
    const timer = window.setInterval(() => tick((value) => value + 1), 15000);
    return () => window.clearInterval(timer);
  }, [end]);

  const remaining = end ? Math.max(1, Math.ceil((end - Date.now()) / 60000)) : 0;
  const active = Boolean(end || endOfTrack);
  const label = endOfTrack
    ? 'Sleep timer: end of track'
    : end
      ? `Sleep timer: ${remaining} min left`
      : 'Sleep timer';

  const openMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    const setTimer = usePlayerStore.getState().setSleepTimer;
    const items: MenuItem[] = [
      ...[5, 10, 15, 30, 45, 60].map((minutes) => ({
        label: `${minutes} minutes`,
        icon: Timer,
        onClick: () => setTimer(minutes),
      })),
      { separator: true },
      { label: 'End of track', icon: Timer, checked: endOfTrack, onClick: () => setTimer('end') },
      { label: 'Off', checked: !active, onClick: () => setTimer(null) },
    ];
    useUiStore.getState().openMenu(event.clientX, event.clientY, items);
  };

  return (
    <IconButton label={label} size="sm" active={active} onClick={openMenu}>
      <Timer size={18} />
    </IconButton>
  );
}

export function PlayerTrackInfo({ track, compact = false }: { track: Track; compact?: boolean }) {
  const liked = useAppStore((state) => state.library.liked.some((item) => item.id === track.id));
  const toggleLike = useAppStore((state) => state.toggleLike);
  const navigate = useNavStore((state) => state.navigate);
  return (
    <div className={`player-track-info ${compact ? 'is-compact' : ''}`}>
      <button
        type="button"
        className="player-art-button"
        onClick={() => {
          const ui = useUiStore.getState();
          ui.setNowPlayingOpen(true);
        }}
        title="Open now playing"
      >
        <Artwork src={track.thumbnail} alt={track.title} className="player-art" />
        <span className="player-art-expand">
          <ChevronUp size={18} />
        </span>
      </button>
      <div className="player-track-text">
        <div className="player-title-line">
          <span className="player-title" title={track.title}>
            {track.title}
          </span>
        </div>
        <div className="player-artist" title={artistsLine(track.artists)}>
          {track.artists?.length
            ? track.artists.map((artist, index) => (
                <span key={`${artist.name}-${index}`}>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => {
                      if (artist.id) navigate({ page: 'artist', id: artist.id });
                      else navigate({ page: 'search', q: artist.name });
                    }}
                  >
                    {artist.name}
                  </button>
                  {index < track.artists.length - 1 ? ', ' : ''}
                </span>
              ))
            : 'Unknown artist'}
        </div>
      </div>
      <IconButton
        label={liked ? 'Remove from liked songs' : 'Add to liked songs'}
        size="sm"
        className={liked ? 'is-liked' : ''}
        onClick={() => void toggleLikeTrack(track)}
      >
        <Heart size={17} fill={liked ? 'currentColor' : 'none'} />
      </IconButton>
    </div>
  );
}

export function PlayerBar() {
  const current = usePlayerStore((state) => state.current);
  const queueOpen = useUiStore((state) => state.queueOpen);
  const nowPlayingOpen = useUiStore((state) => state.nowPlayingOpen);
  const nowPlayingTab = useUiStore((state) => state.nowPlayingTab);
  const setQueueOpen = useUiStore((state) => state.setQueueOpen);
  const setNowPlayingOpen = useUiStore((state) => state.setNowPlayingOpen);
  const setNowPlayingTab = useUiStore((state) => state.setNowPlayingTab);

  if (!current) {
    return (
      <footer className="player-bar player-bar-empty">
        <div className="player-empty">
          <div className="player-empty-mark">
            <MicVocal size={20} />
          </div>
          <div>
            <strong>Your soundtrack starts here</strong>
            <span>Pick a song, album or playlist — it will keep playing while you browse.</span>
          </div>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => useNavStore.getState().navigate({ page: 'explore' })}>
          Find music
        </button>
      </footer>
    );
  }

  return (
    <footer className="player-bar">
      <div className="player-left">
        <PlayerTrackInfo track={current} />
      </div>
      <div className="player-center">
        <TransportControls />
        <SeekBar />
      </div>
      <div className="player-right">
        <SleepTimerButton />
        <IconButton
          label="Lyrics"
          size="sm"
          active={nowPlayingOpen && nowPlayingTab === 'lyrics'}
          onClick={() => {
            setNowPlayingTab('lyrics');
            setNowPlayingOpen(true);
          }}
        >
          <MicVocal size={18} />
        </IconButton>
        <IconButton label="Queue" size="sm" active={queueOpen} onClick={() => setQueueOpen(!queueOpen)}>
          <ListMusic size={19} />
        </IconButton>
        <IconButton
          label="More options"
          size="sm"
          onClick={(event) => showTrackMenu(current, event)}
        >
          <MoreHorizontal size={19} />
        </IconButton>
        <VolumeControl />
        <IconButton label="Open now playing" size="sm" onClick={() => setNowPlayingOpen(true)}>
          <ChevronUp size={19} />
        </IconButton>
      </div>
    </footer>
  );
}
