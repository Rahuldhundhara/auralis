import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Download,
  FolderCheck,
  Heart,
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
  Speaker,
  Timer,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { Track } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { beginSeekDrag, endSeekDrag, usePlayerStore } from '../stores/player';
import { toast, useUiStore, type MenuItem } from '../stores/ui';
import { artistsLine, formatDuration } from '../lib/format';
import { downloadTrackAction, showTrackMenu, toggleLikeTrack } from '../lib/actions';
import { Artwork, IconButton, Range } from './primitives';

export function SeekBar({ compact = false, remaining = false }: { compact?: boolean; remaining?: boolean }) {
  const position = usePlayerStore((state) => state.position);
  const duration = usePlayerStore((state) => state.duration);
  const buffered = usePlayerStore((state) => state.buffered);
  const loading = usePlayerStore((state) => state.loading);
  const seek = usePlayerStore((state) => state.seek);
  const [localPos, setLocalPos] = useState<number | null>(null);
  const dragPos = useRef<number | null>(null);
  // True only between pointerdown and pointerup/cancel of an actual drag.
  // Keyboard (or other non-drag input) also fires onValueChange, but never
  // sets this — see the release effect below.
  const draggingRef = useRef(false);
  const safeDuration = duration > 0 ? duration : 1;
  const displayedPos = localPos ?? position;

  // While the user is dragging, the thumb follows `localPos` (the finger),
  // never the store position, so re-renders from playback events can never
  // move or abort the native drag.
  const handleSeek = (newPos: number) => {
    dragPos.current = newPos;
    setLocalPos(newPos);
    seek(newPos);
  };
  const startDrag = () => {
    draggingRef.current = true;
    dragPos.current = null;
    beginSeekDrag();
  };
  const endDrag = () => {
    // Re-stamp the exact final pointer value on release. `localPos` state can
    // lag the last input event by one render; the ref cannot.
    const target = dragPos.current;
    dragPos.current = null;
    if (target !== null) seek(target);
    setLocalPos(null);
    draggingRef.current = false;
    endSeekDrag();
  };

  // Release a keyboard (or other non-drag) transient as soon as the store has
  // converged on it. Without this, `localPos` stays pinned forever — the thumb
  // and time labels freeze at the previous track's position even after the
  // store resets for the next track. Never releases mid-drag, so slow drags
  // cannot jump.
  useEffect(() => {
    if (localPos === null || draggingRef.current) return;
    if (Math.abs(position - localPos) <= 1.5) {
      dragPos.current = null;
      setLocalPos(null);
    }
  }, [localPos, position]);

  return (
    <div className={`seek-bar ${compact ? 'is-compact' : ''}`}>
      {!compact ? <span className="time">{formatDuration(displayedPos)}</span> : null}
      <Range
        className="seek-range"
        min={0}
        max={safeDuration}
        step={0.25}
        value={Math.min(displayedPos, safeDuration)}
        buffer={Math.max(displayedPos, Math.min(buffered, safeDuration))}
        onValueChange={handleSeek}
        onPointerDown={startDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        aria-label="Seek"
        aria-valuetext={`${formatDuration(displayedPos)} of ${formatDuration(duration)}`}
        disabled={duration <= 0 || (loading && localPos === null)}
      />
      {!compact ? (
        <span className="time">{remaining ? `-${formatDuration(Math.max(0, duration - displayedPos))}` : formatDuration(duration)}</span>
      ) : null}
    </div>
  );
}

function MiniProgress() {
  const position = usePlayerStore((state) => state.position);
  const duration = usePlayerStore((state) => state.duration);
  const buffered = usePlayerStore((state) => state.buffered);
  const seek = usePlayerStore((state) => state.seek);
  const [localPos, setLocalPos] = useState<number | null>(null);
  const dragPos = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const displayedPos = localPos ?? position;
  // Same drag discipline as SeekBar: while the thumb is under the user's
  // finger it follows `localPos`, so store races can never move or abort the
  // native drag. Released on pointer up / cancel, or once the store has
  // converged for non-drag input (keyboard).
  const handleSeek = (newPos: number) => {
    dragPos.current = newPos;
    setLocalPos(newPos);
    seek(newPos);
  };
  const startDrag = () => {
    draggingRef.current = true;
    dragPos.current = null;
    beginSeekDrag();
  };
  const endDrag = () => {
    const target = dragPos.current;
    dragPos.current = null;
    if (target !== null) seek(target);
    setLocalPos(null);
    draggingRef.current = false;
    endSeekDrag();
  };
  useEffect(() => {
    if (localPos === null || draggingRef.current) return;
    if (Math.abs(position - localPos) <= 1.5) {
      dragPos.current = null;
      setLocalPos(null);
    }
  }, [localPos, position]);
  if (!duration || duration <= 0) return null;
  return (
    <Range
      className="player-mini-progress"
      min={0}
      max={duration}
      step={0.25}
      value={Math.min(displayedPos, duration)}
      buffer={Math.max(displayedPos, Math.min(buffered, duration))}
      onValueChange={handleSeek}
      onPointerDown={startDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      aria-label="Song progress"
      aria-valuetext={`${formatDuration(displayedPos)} of ${formatDuration(duration)}`}
    />
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
        <Shuffle size={big ? 18 : 16} />
      </IconButton>
      <IconButton label="Previous" size={big ? 'lg' : 'md'} onClick={() => usePlayerStore.getState().previous()} disabled={!hasQueue}>
        <SkipBack size={big ? 22 : 19} fill="currentColor" />
      </IconButton>
      <button
        type="button"
        className={`play-button ${big ? 'is-large' : ''}`}
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={() => usePlayerStore.getState().toggle()}
      >
        {loading || buffering ? (
          <Loader2 size={big ? 26 : 22} className="spin" />
        ) : playing ? (
          <Pause size={big ? 26 : 22} fill="currentColor" />
        ) : (
          <Play size={big ? 26 : 22} fill="currentColor" className="play-icon-offset" />
        )}
      </button>
      <IconButton label="Next" size={big ? 'lg' : 'md'} onClick={() => usePlayerStore.getState().next()} disabled={!hasQueue}>
        <SkipForward size={big ? 22 : 19} fill="currentColor" />
      </IconButton>
      <IconButton
        label={repeat === 'one' ? 'Repeat this song' : repeat === 'all' ? 'Repeat queue' : 'Repeat off'}
        active={repeat !== 'off'}
        size={big ? 'md' : 'sm'}
        onClick={() => usePlayerStore.getState().cycleRepeat()}
        disabled={!hasQueue}
      >
        {repeat === 'one' ? <Repeat1 size={big ? 18 : 16} /> : <Repeat size={big ? 18 : 16} />}
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
    <div className={`volume-control ${muted || volume === 0 ? 'is-muted' : ''}`}>
      <IconButton
        className="volume-toggle"
        label={muted ? 'Unmute' : 'Mute'}
        size="sm"
        active={muted}
        onClick={() => toggleMute()}
      >
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
      <IconButton
        className="volume-max"
        label="Set volume to maximum"
        size="sm"
        onClick={() => {
          if (muted) toggleMute();
          setVolume(1);
        }}
      >
        <Volume2 size={17} />
      </IconButton>
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

function PlayerLikeButton({ track }: { track: Track }) {
  const liked = useAppStore((state) => state.library.liked.some((item) => item.id === track.id));
  return (
    <IconButton
      label={liked ? 'Remove from liked songs' : 'Add to liked songs'}
      size="sm"
      className={`player-like ${liked ? 'is-liked' : ''}`}
      onClick={() => void toggleLikeTrack(track)}
    >
      <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
    </IconButton>
  );
}

function PlayerDownloadButton({ track }: { track: Track }) {
  const downloads = useAppStore((state) => state.library.downloads);
  const item = downloads.find((entry) => entry.track.id === track.id && entry.status === 'done');
  return (
    <IconButton
      label={item ? 'Show downloaded file' : 'Download'}
      size="sm"
      className="player-download"
      onClick={() => {
        if (item?.path) void window.auralis.app.showItemInFolder(item.path);
        else void downloadTrackAction(track);
      }}
    >
      {item ? <FolderCheck size={18} /> : <Download size={18} />}
    </IconButton>
  );
}

export function PlayerTrackInfo({ track, compact = false }: { track: Track; compact?: boolean }) {
  const navigate = useNavStore((state) => state.navigate);
  return (
    <div className={`player-track-info ${compact ? 'is-compact' : ''}`}>
      <button
        type="button"
        className="player-art-button"
        onClick={() => useUiStore.getState().setNowPlayingOpen(true, 'lyrics')}
        title="Open now playing"
      >
        <Artwork src={track.thumbnail} alt={track.title} className="player-art" />
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
    </div>
  );
}

export function PlayerBar() {
  const current = usePlayerStore((state) => state.current);

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
      <MiniProgress />
      <div className="player-left">
        <PlayerTrackInfo track={current} />
        <PlayerLikeButton track={current} />
        <PlayerDownloadButton track={current} />
      </div>
      <div className="player-center">
        <TransportControls />
        <SeekBar />
      </div>
      <div className="player-right">
        <IconButton
          label="Lyrics"
          size="sm"
          onClick={() => useUiStore.getState().setNowPlayingOpen(true, 'lyrics')}
        >
          <MicVocal size={18} />
        </IconButton>
        <IconButton
          label="Connect device"
          size="sm"
          onClick={() => toast('Connect to AirPlay / Spotify Connect speaker', 'info')}
        >
          <Speaker size={18} />
        </IconButton>
        <VolumeControl />
      </div>
    </footer>
  );
}
