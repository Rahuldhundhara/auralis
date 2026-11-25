import { ArrowDown, ArrowUp, ListMusic, Play, Trash2 } from 'lucide-react';
import type { Track } from '@shared/types';
import { usePlayerStore } from '../stores/player';
import { formatDuration } from '../lib/format';
import { Artwork, EmptyState, IconButton } from './primitives';

function artistsLine(track: Track): string {
  return track.artists?.length ? track.artists.map((artist) => artist.name).join(', ') : 'Unknown artist';
}

/**
 * The real playback queue. Reads directly from the global player store, so
 * skips, additions, removals and reorders are reflected immediately — there is
 * no separate or cached copy of the queue here.
 */
export function QueuePanel() {
  const queue = usePlayerStore((state) => state.queue);
  const index = usePlayerStore((state) => state.index);
  const playing = usePlayerStore((state) => state.playing);
  const playAt = usePlayerStore((state) => state.playAt);
  const removeQueueAt = usePlayerStore((state) => state.removeQueueAt);
  const moveQueue = usePlayerStore((state) => state.moveQueue);
  const clearUpcoming = usePlayerStore((state) => state.clearUpcoming);

  if (!queue.length) {
    return (
      <EmptyState
        icon={<ListMusic size={26} />}
        title="Your queue is empty"
        message="Play a song, album or playlist and the upcoming tracks will appear here."
      />
    );
  }

  const upcomingCount = Math.max(0, queue.length - index - 1);

  return (
    <div className="queue-panel">
      <div className="queue-panel-head">
        <div className="queue-panel-title">
          <span className="queue-panel-eyebrow">Up next</span>
          <strong>
            {upcomingCount === 0
              ? 'Nothing queued after this'
              : `${upcomingCount} song${upcomingCount === 1 ? '' : 's'} in the queue`}
          </strong>
        </div>
        {upcomingCount > 0 ? (
          <button type="button" className="text-button queue-clear" onClick={clearUpcoming}>
            Clear upcoming
          </button>
        ) : null}
      </div>

      <div className="queue-list" role="list">
        {queue.map((track, itemIndex) => {
          const isCurrent = itemIndex === index;
          const isPast = itemIndex < index;
          return (
            <div
              key={`${track.id}-${itemIndex}`}
              role="listitem"
              className={`queue-item ${isCurrent ? 'is-current' : ''} ${isPast ? 'is-past' : ''}`}
            >
              <button
                type="button"
                className="queue-item-main"
                onClick={() => playAt(itemIndex)}
                title={isCurrent ? 'Currently playing' : `Play ${track.title}`}
              >
                <span className="queue-item-art">
                  <Artwork src={track.thumbnail} alt={track.title} className="queue-art" />
                  {isCurrent ? (
                    <span className={`queue-equalizer ${playing ? 'is-playing' : ''}`} aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : (
                    <span className="queue-play-hover" aria-hidden="true">
                      <Play size={14} fill="currentColor" />
                    </span>
                  )}
                </span>
                <span className="queue-item-meta">
                  <span className="queue-item-title">{track.title}</span>
                  <span className="queue-item-artist">{artistsLine(track)}</span>
                </span>
                {isCurrent ? <span className="queue-now-badge">Now playing</span> : null}
                <span className="queue-item-duration">{formatDuration(track.duration)}</span>
              </button>

              {!isCurrent ? (
                <div className="queue-item-actions">
                  {itemIndex > index + 1 ? (
                    <IconButton
                      label="Move earlier"
                      size="xs"
                      onClick={() => moveQueue(itemIndex, itemIndex - 1)}
                    >
                      <ArrowUp size={14} />
                    </IconButton>
                  ) : null}
                  {itemIndex > index && itemIndex < queue.length - 1 ? (
                    <IconButton
                      label="Move later"
                      size="xs"
                      onClick={() => moveQueue(itemIndex, itemIndex + 1)}
                    >
                      <ArrowDown size={14} />
                    </IconButton>
                  ) : null}
                  <IconButton
                    label={`Remove ${track.title} from the queue`}
                    size="xs"
                    onClick={() => removeQueueAt(itemIndex)}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
