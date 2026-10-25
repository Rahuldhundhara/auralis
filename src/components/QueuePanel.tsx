import { ChevronDown, ChevronUp, ListMusic, MoreHorizontal, Radio, Trash2, X } from 'lucide-react';
import type { Track } from '@shared/types';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { formatDuration } from '../lib/format';
import { showTrackMenu } from '../lib/actions';
import { Artwork, EmptyState, IconButton, Spinner } from './primitives';

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
  return (
    <div
      className={`queue-row ${current ? 'is-current' : ''}`}
      onDoubleClick={() => usePlayerStore.getState().playAt(queueIndex)}
      onContextMenu={(event) => {
        event.preventDefault();
        showTrackMenu(track, event, { queueIndex });
      }}
    >
      <button
        type="button"
        className="queue-row-main"
        onClick={() => (current ? usePlayerStore.getState().toggle() : usePlayerStore.getState().playAt(queueIndex))}
      >
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
      <div className="queue-row-actions">
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
          <QueueRow track={current} queueIndex={index} current />
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
      <aside className="queue-drawer" role="dialog" aria-label="Queue">
        <header className="drawer-head">
          <div>
            <h2>Queue</h2>
            <span>{count} {count === 1 ? 'track' : 'tracks'}</span>
          </div>
          <IconButton label="Close queue" size="sm" onClick={() => setOpen(false)}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="drawer-body">
          <QueueList />
        </div>
        <footer className="drawer-foot">
          <button
            type="button"
            className="text-button danger"
            onClick={() => {
              const state = usePlayerStore.getState();
              if (!state.queue.length) return;
              for (let index = state.queue.length - 1; index > state.index; index--) state.removeQueueAt(index);
            }}
          >
            <Trash2 size={14} /> Clear upcoming
          </button>
        </footer>
      </aside>
    </div>
  );
}
