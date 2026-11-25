import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal, Play, Podcast } from 'lucide-react';
import type { Card, Shelf as ShelfType, Track } from '@shared/types';
import { openCard, playCard, prefetchTrack, queueForShelf, showCardMenu, tracksFromPage } from '../lib/actions';
import { useNavStore } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { Artwork, Button, ExplicitBadge, IconButton } from './primitives';
import { TrackList } from './TrackList';

export function MediaCard({
  card,
  queue,
  index = 0,
  variant = 'carousel',
}: {
  card: Card;
  queue?: Track[];
  index?: number;
  variant?: 'carousel' | 'grid';
}) {
  const [busy, setBusy] = useState(false);
  const prefetchTimer = useRef<number | undefined>(undefined);
  const round = Boolean(card.round) || card.type === 'artist' || card.type === 'profile';
  const playable = Boolean(card.track) || ['song', 'video', 'episode', 'album', 'single', 'ep', 'playlist', 'podcast'].includes(card.type);

  useEffect(() => () => window.clearTimeout(prefetchTimer.current), []);

  const scheduleCardPrefetch = () => {
    if (!card.track?.id) return;
    window.clearTimeout(prefetchTimer.current);
    prefetchTimer.current = window.setTimeout(() => prefetchTrack(card.track), 90);
  };

  if (card.type === 'mood') {
    return (
      <button
        type="button"
        className={`media-card mood-card ${variant === 'grid' ? 'mood-card-grid' : ''}`}
        style={{ '--mood-color': card.color || '#f0f0f0' } as CSSProperties}
        onClick={() => openCard(card)}
        title={`Open ${card.title}`}
      >
        <span className="mood-card-orb" aria-hidden="true" />
        <span className="mood-card-title">{card.title}</span>
        <span className="mood-card-subtitle">{card.subtitle || 'Mood & genre'}</span>
      </button>
    );
  }

  const activate = async () => {
    if (card.track && queue?.length) {
      usePlayerStore.getState().playQueue(queue, index);
      return;
    }
    if (card.track) {
      openCard(card);
      return;
    }
    if (['song', 'video', 'episode'].includes(card.type)) {
      openCard(card);
      return;
    }
    setBusy(true);
    try {
      await playCard(card);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className={`media-card media-card-${variant} ${round ? 'is-round' : ''}`}
      onMouseEnter={scheduleCardPrefetch}
      onMouseLeave={() => window.clearTimeout(prefetchTimer.current)}
      onContextMenu={(event) => {
        event.preventDefault();
        showCardMenu(card, event);
      }}
    >
      <div className="card-art-wrap">
        <button
          type="button"
          className="card-art-button"
          onClick={() => (card.track ? void activate() : openCard(card))}
          onPointerDown={() => prefetchTrack(card.track)}
          aria-label={card.track ? `Play ${card.title}` : `Open ${card.title}`}
          title={card.title}
        >
          <Artwork src={card.thumbnail} alt={card.title} round={round} className="card-art" />
          {card.type === 'podcast' ? (
            <span className="card-kind" title="Podcast">
              <Podcast size={13} />
            </span>
          ) : null}
        </button>
        {playable ? (
          <button
            type="button"
            className={`card-play ${busy ? 'is-busy' : ''}`}
            aria-label={`Play ${card.title}`}
            onPointerDown={() => prefetchTrack(card.track)}
            onClick={(event) => {
              event.stopPropagation();
              void activate();
            }}
          >
            <Play size={20} fill="currentColor" />
          </button>
        ) : null}
        <IconButton
          label="More options"
          size="sm"
          className="card-more"
          onClick={(event) => {
            event.stopPropagation();
            showCardMenu(card, event);
          }}
        >
          <MoreHorizontal size={17} />
        </IconButton>
      </div>
      <button type="button" className="card-text" onClick={() => (card.track ? void activate() : openCard(card))}>
        <span className="card-title">
          {card.title}
          {card.explicit ? <ExplicitBadge /> : null}
        </span>
        <span className="card-subtitle">
          {card.subtitle || (card.year ? String(card.year) : '')}
          {!card.subtitle && card.trackCount ? `${card.trackCount} songs` : ''}
        </span>
      </button>
    </article>
  );
}

function CompactRow({
  card,
  index,
  queue,
  trackIndex,
}: {
  card: Card;
  index: number;
  queue: Track[] | undefined;
  trackIndex: number | undefined;
}) {
  const round = Boolean(card.round) || card.type === 'artist' || card.type === 'profile';
  const activate = () => {
    if (card.track && queue?.length) {
      usePlayerStore.getState().playQueue(queue, trackIndex ?? index);
      return;
    }
    if (card.track) {
      usePlayerStore.getState().playTrack(card.track);
      return;
    }
    if (['song', 'video', 'episode'].includes(card.type)) {
      openCard(card);
      return;
    }
    openCard(card);
  };

  const subtitle = card.subtitle || (card.year ? String(card.year) : card.trackCount ? `${card.trackCount} songs` : '');

  return (
    <button
      type="button"
      className={`compact-row ${round ? 'is-round' : ''}`}
      onClick={activate}
      onContextMenu={(event) => {
        event.preventDefault();
        showCardMenu(card, event);
      }}
      title={card.title}
      aria-label={card.title}
    >
      <span className="compact-row-art">
        <Artwork src={card.thumbnail} alt={card.title} round={round} className="compact-row-artwork" />
      </span>
      <span className="compact-row-text">
        <span className="compact-row-title">
          {card.title}
          {card.explicit ? <ExplicitBadge /> : null}
        </span>
        {subtitle ? <span className="compact-row-sub">{subtitle}</span> : null}
      </span>
    </button>
  );
}

export function Shelf({
  shelf,
  grid,
  row,
  maxItems,
  compact: compactProp = false,
  list,
}: {
  shelf: ShelfType;
  grid?: boolean;
  row?: boolean;
  maxItems?: number;
  compact?: boolean;
  list?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigateEndpoint = useNavStore((state) => state.navigateEndpoint);
  const items = shelf.items.filter((card) => card.type !== 'video' && !card.track?.isVideo && card.track?.type !== 'video');
  const shown = maxItems && maxItems > 0 ? items.slice(0, maxItems) : items;
  const tracks = tracksFromPage({ shelves: [{ ...shelf, items: shown }] });
  const queue = tracks.length ? tracks : queueForShelf(shown);
  const style = shelf.style || 'carousel';
  const isCompact = compactProp && !grid;
  const useGrid = Boolean(grid || (!row && style === 'grid'));

  if (!items.length) return null;

  // Compact list view for trending / hot picks — small, not oversized
  const showAsList = Boolean(list || (!isCompact && style === 'list')) && shown.filter((item) => item.track).length > 1;

  return (
    <section className={`shelf shelf-${style} ${isCompact ? 'shelf-compact' : ''}`}>
      {shelf.title || shelf.subtitle || shelf.endpoint ? (
        <header className="shelf-head">
          <div className="shelf-titles">
            <h2>{shelf.title}</h2>
            {shelf.subtitle ? <p>{shelf.subtitle}</p> : null}
          </div>
          <div className="shelf-actions">
            {shelf.endpoint ? (
              <Button variant="ghost" size="sm" onClick={() => navigateEndpoint(shelf.endpoint, shelf.title)}>
                Show all
              </Button>
            ) : null}
            {!showAsList && shown.length > 3 ? (
              <div className="shelf-scroll-buttons">
                <IconButton label="Scroll left" size="sm" variant="surface" onClick={() => scrollRef.current?.scrollBy({ left: -560, behavior: 'smooth' })}>
                  <ChevronLeft size={16} />
                </IconButton>
                <IconButton label="Scroll right" size="sm" variant="surface" onClick={() => scrollRef.current?.scrollBy({ left: 560, behavior: 'smooth' })}>
                  <ChevronRight size={16} />
                </IconButton>
              </div>
            ) : null}
          </div>
        </header>
      ) : null}
      {isCompact ? (
        <div ref={scrollRef} className="compact-row-list" role="list">
          {shown.map((card, index) => {
            const trackIndex = card.track ? Math.max(0, tracks.findIndex((t) => t.id === card.track?.id)) : index;
            return (
              <CompactRow
                key={`${card.type}-${card.id}-${index}`}
                card={card}
                index={index}
                queue={card.track ? queue : undefined}
                trackIndex={trackIndex}
              />
            );
          })}
        </div>
      ) : showAsList ? (
        <div className="shelf-list-card">
          <TrackList tracks={tracks} showAlbum showArt={false} />
        </div>
      ) : (
        <div ref={scrollRef} className={`shelf-row ${useGrid ? 'is-grid' : ''}`}>
          {shown.map((card, index) => (
            <MediaCard
              key={`${card.type}-${card.id}-${index}`}
              card={card}
              queue={card.track ? queue : undefined}
              index={card.track ? Math.max(0, tracks.findIndex((track) => track.id === card.track?.id)) : index}
              variant={useGrid ? 'grid' : 'carousel'}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function ShelfGrid({ shelves }: { shelves: ShelfType[] }) {
  return (
    <div className="shelf-stack">
      {shelves.map((shelf, index) => (
        <Shelf shelf={shelf} key={`${shelf.title}-${index}`} grid={shelf.style === 'grid'} />
      ))}
    </div>
  );
}
