import { useState } from 'react';
import { Download, MoreHorizontal, Play, Video, X } from 'lucide-react';
import type { Track } from '@shared/types';
import {
  openAlbum,
  openArtist,
  showTrackMenu,
  type TrackMenuContext,
} from '../lib/actions';
import { useAppStore, downloadForTrack } from '../stores/app';
import { usePlayerStore } from '../stores/player';
import { Artwork, ExplicitBadge, IconButton } from './primitives';
import { formatDuration } from '../lib/format';

interface TrackListProps {
  tracks: Track[];
  showArt?: boolean;
  showAlbum?: boolean;
  showIndex?: boolean;
  context?: TrackMenuContext;
  compact?: boolean;
  emptyText?: string;
  hideHeader?: boolean;
  radioOnPlay?: boolean;
  onRemove?: (track: Track, index: number) => void;
}

export function TrackList({
  tracks,
  showArt = true,
  showAlbum = true,
  showIndex = true,
  context = {},
  compact = false,
  emptyText = 'No songs here yet.',
  radioOnPlay = false,
  onRemove,
}: TrackListProps) {
  const current = usePlayerStore((state) => state.current);
  const playing = usePlayerStore((state) => state.playing);
  const loading = usePlayerStore((state) => state.loading);
  const liked = useAppStore((state) => state.library.liked);
  const downloads = useAppStore((state) => state.library.downloads);
  const toggleLike = useAppStore((state) => state.toggleLike);
  const [hovered, setHovered] = useState<number | null>(null);

  if (!tracks.length) {
    return <div className="track-list-empty">{emptyText}</div>;
  }

  const likedIds = new Set(liked.map((track) => track.id));

  return (
    <div className={`track-list ${compact ? 'is-compact' : ''} ${showArt ? 'has-art' : ''} ${showAlbum ? 'has-album' : ''}`}>
      {tracks.map((track, index) => {
        const isCurrent = current?.id === track.id;
        const isPlaying = isCurrent && playing;
        const isLiked = likedIds.has(track.id);
        const downloaded = Boolean(downloadForTrack(downloads, track.id));
        const number = index + 1;
        const playRow = () => {
          if (radioOnPlay) void usePlayerStore.getState().startRadio(track);
          else usePlayerStore.getState().playQueue(tracks, index);
        };
        return (
          <div
            key={`${track.id}-${index}`}
            className={`track-row ${isCurrent ? 'is-current' : ''} ${loading && isCurrent ? 'is-loading' : ''}`}
            role="button"
            tabIndex={0}
            onClick={playRow}
            onKeyDown={(event) => {
              if (event.key === 'Enter') playRow();
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              showTrackMenu(track, event, { ...context, trackIndex: index, queueIndex: isCurrent ? usePlayerStore.getState().index : undefined });
            }}
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered(null)}
            onDoubleClick={playRow}
          >
            <div className="track-index">
              {isPlaying ? (
                <span className="playing-bars" aria-label="Playing">
                  <i />
                  <i />
                  <i />
                </span>
              ) : hovered === index ? (
                <Play size={14} fill="currentColor" />
              ) : (
                <span className="track-number">{showIndex ? number : ''}</span>
              )}
            </div>
            {showArt ? (
              <Artwork src={track.thumbnail} alt={track.title} className="track-art" />
            ) : null}
            <div className="track-main">
              <div className="track-title-line">
                <span className="track-title" title={track.title}>
                  {track.title}
                </span>
                {track.explicit ? <ExplicitBadge /> : null}
                {track.isVideo ? (
                  <span className="track-flag" title="Video">
                    <Video size={12} />
                  </span>
                ) : null}
                {downloaded ? (
                  <span className="track-flag" title="Downloaded">
                    <Download size={12} />
                  </span>
                ) : null}
              </div>
              <div className="track-artists">
                {track.artists?.length ? (
                  track.artists.map((artist, artistIndex) => (
                    <span key={`${artist.name}-${artistIndex}`}>
                      <button
                        type="button"
                        className="text-link"
                        onClick={(event) => {
                          event.stopPropagation();
                          openArtist(artist.id, artist.name);
                        }}
                      >
                        {artist.name}
                      </button>
                      {artistIndex < track.artists.length - 1 ? ', ' : ''}
                    </span>
                  ))
                ) : (
                  <span>Unknown artist</span>
                )}
              </div>
            </div>
            {showAlbum ? (
              <button
                type="button"
                className="track-album text-link"
                title={track.album?.name}
                onClick={(event) => {
                  event.stopPropagation();
                  if (track.album?.id) openAlbum(track.album.id);
                }}
              >
                {track.album?.name || ''}
              </button>
            ) : null}
            <div className="track-duration">{track.duration > 0 ? formatDuration(track.duration) : ''}</div>
            <div className="track-actions">
              <IconButton
                label={isLiked ? 'Remove from liked songs' : 'Add to liked songs'}
                size="xs"
                className={`track-like ${isLiked ? 'is-liked' : ''}`}
                onClick={(event) => {
                  event.stopPropagation();
                  void toggleLike(track);
                }}
              >
                {isLiked ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                  </svg>
                )}
              </IconButton>
              <IconButton
                label="More options"
                size="xs"
                className="track-more"
                onClick={(event) => {
                  event.stopPropagation();
                  showTrackMenu(track, event, { ...context, trackIndex: index, queueIndex: isCurrent ? usePlayerStore.getState().index : undefined });
                }}
              >
                <MoreHorizontal size={17} />
              </IconButton>
              {onRemove ? (
                <IconButton
                  label="Remove from playlist"
                  size="xs"
                  className="track-remove"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(track, index);
                  }}
                >
                  <X size={14} />
                </IconButton>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
