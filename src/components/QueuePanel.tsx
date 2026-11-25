import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Heart,
  ListMusic,
  MoreHorizontal,
  Pause,
  Play,
  Radio,
  X,
} from 'lucide-react';
import type { Track } from '@shared/types';
import { useAppStore } from '../stores/app';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { artistsLine, formatDuration } from '../lib/format';
import { showTrackMenu, toggleLikeTrack } from '../lib/actions';
import { Artwork, EmptyState, IconButton, Spinner } from './primitives';

function QueueNowCard({ track, queueIndex }: { track: Track; queueIndex: number }) {
  const playing = usePlayerStore((state) => state.playing);
  const position = usePlayerStore((state) => state.position);
  const liveDuration = usePlayerStore((state) => state.duration);
  const liked = useAppStore((state) => state.library.liked.some((item) => item.id === track.id));
  const duration = liveDuration || track.duration || 0;
  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <div className="queue-now">
      <div className="queue-now-art-wrap">
        <Artwork src={track.thumbnail} alt={track.title} className="queue-now-art" />
        <button
          type="button"
          className="queue-now-play"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => usePlayerStore.getState().toggle()}
        >
          {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
      </div>
      <div className="queue-now-copy">
        <span className="queue-now-label">
          <i />
          {playing ? 'Playing now' : 'Paused'}
        </span>
        <strong className="queue-now-title" title={track.title}>
          {track.title}
        </strong>
        <span className="queue-now-artist">{artistsLine(track.artists) || 'YouTube Music'}</span>
        {track.album?.name ? <span className="queue-now-album">{track.album.name}</span> : null}
        <div className="queue-now-progress" aria-hidden="true">
          <span className="queue-now-track">
            <i style={{ width: `${progress}%` }} />
          </span>
          <span className="queue-now-time">
            {formatDuration(position)} / {formatDuration(duration)}
          </span>
        </div>
        <div className="queue-now-actions">
          <button
            type="button"
            className={`queue-now-action ${liked ? 'is-liked' : ''}`}
            onClick={() => void toggleLikeTrack(track)}
          >
            <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
            <span>{liked ? 'Liked' : 'Like'}</span>
          </button>
          <button
            type="button"
            className="queue-now-action is-accent"
            onClick={() => {
              useUiStore.getState().setQueueOpen(false);
              useUiStore.getState().openNowPlaying();
            }}
          >
            <ArrowUpRight size={15} />
            <span>Open player</span>
          </button>
          <IconButton
            label="More options"
            size="xs"
            onClick={(event) => showTrackMenu(track, event, { queueIndex })}
          >
            <MoreHorizontal size={15} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

function QueueRow({
  track,
  queueIndex,
  current,
}: {
  track: Track;
  queueIndex: number;
  current?: boolean;
}) {
  const player = usePlayerStore.getState();
  const activate = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const store = usePlayerStore.getState();
    if (current) store.toggle();
    else store.playAt(queueIndex);
  };
  return (
    <div
      className={`queue-row ${current ? 'is-current' : ''}`}
      onClick={activate}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        showTrackMenu(track, event, { queueIndex });
      }}
    >
      <button type="button" className="queue-row-main" onClick={activate}>
        <Artwork src={track.thumbnail} alt={track.title} className="queue-art" />
        <span className="queue-text">
          <span className="queue-title">
            {current ? <span className="queue-current-dot" /> : null}
            {track.title}
          </span>
          <span className="queue-artist">{track.artists.map((artist) => artist.name).join(', ')}</span>
        </span>
        <span className="queue-duration">{track.duration > 0 ? formatDuration(track.duration) : ''}</span>
      </button>
      <div
        className="queue-row-actions"
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
      >
        <IconButton
          label="Move up"
          size="xs"
          disabled={queueIndex === 0}
          onClick={() => player.moveQueue(queueIndex, queueIndex - 1)}
        >
          <ChevronUp size={14} />
        </IconButton>
        <IconButton
          label="Move down"
          size="xs"
          disabled={queueIndex >= usePlayerStore.getState().queue.length - 1}
          onClick={() => player.moveQueue(queueIndex, queueIndex + 1)}
        >
          <ChevronDown size={14} />
        </IconButton>
        <IconButton label="Remove from queue" size="xs" onClick={() => player.removeQueueAt(queueIndex)}>
          <X size={14} />
        </IconButton>
        <IconButton label="More options" size="xs" onClick={(event) => showTrackMenu(track, event, { queueIndex })}>
          <MoreHorizontal size={15} />
        </IconButton>
      </div>
    </div>
  );
}

export function QueueList({ compact = false }: { compact?: boolean }) {
  const queue = usePlayerStore((state) => state.queue);
  const index = usePlayerStore((state) => state.index);
  const current = usePlayerStore((state) => state.current);
  const radio = usePlayerStore((state) => state.radio);
  const radioLoading = usePlayerStore((state) => state.radioLoading);
  const clearUpcoming = usePlayerStore((state) => state.clearUpcoming);
  const upcoming = queue.slice(index + 1);

  if (!queue.length) {
    return (
      <EmptyState
        compact
        icon={<ListMusic size={24} />}
        title="The queue is empty"
        message="Play an album or add songs to build your listening session."
      />
    );
  }

  return (
    <div className={`queue-list ${compact ? 'is-compact' : ''}`}>
      {current ? (
        <section className="queue-section">
          <div className="queue-section-head">
            <span>Now playing</span>
            {radio ? (
              <span className="queue-radio">
                <Radio size={13} /> Radio
              </span>
            ) : null}
          </div>
          {compact ? (
            <QueueRow track={current} queueIndex={index} current />
          ) : (
            <QueueNowCard track={current} queueIndex={index} />
          )}
        </section>
      ) : null}
      <section className="queue-section">
        <div className="queue-section-head">
          <span>Next up · {upcoming.length}</span>
          {upcoming.length ? (
            <button type="button" className="text-button" onClick={clearUpcoming}>
              Clear
            </button>
          ) : null}
        </div>
        {upcoming.length ? (
          upcoming.map((track, offset) => (
            <QueueRow key={`${track.id}-${index + 1 + offset}`} track={track} queueIndex={index + 1 + offset} />
          ))
        ) : radioLoading ? (
          <div className="queue-loading">
            <Spinner size={18} /> Finding more tracks for this radio…
          </div>
        ) : (
          <div className="queue-empty-line">
            {radio ? 'Radio will keep playing similar songs.' : 'Nothing else queued.'}
          </div>
        )}
      </section>
      {radio ? (
        <div className="queue-radio-note">
          <Radio size={15} />
          <span>This station keeps going with songs like “{current?.title}”.</span>
        </div>
      ) : null}
    </div>
  );
}

export function QueuePanel() {
  const open = useUiStore((state) => state.queueOpen);
  const setOpen = useUiStore((state) => state.setQueueOpen);
  const count = usePlayerStore((state) => state.queue.length);
  if (!open) return null;
  return (
    <div className="drawer-layer" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
      <aside className="queue-drawer" role="dialog" aria-label="Now playing and queue">
        <header className="drawer-head">
          <div className="drawer-head-title">
            <i className="drawer-live-dot" aria-hidden="true" />
            <div>
              <h2>Now playing &amp; queue</h2>
              <span>{count} {count === 1 ? 'track' : 'tracks'} in this session</span>
            </div>
          </div>
          <IconButton label="Close queue" size="sm" onClick={() => setOpen(false)}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="drawer-body">
          <QueueList />
        </div>
      </aside>
    </div>
  );
}
