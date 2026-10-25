import { useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal, Play, Podcast, Video } from 'lucide-react';
import type { Card, Shelf as ShelfType, Track } from '@shared/types';
import { openCard, playCard, queueForShelf, showCardMenu, tracksFromPage } from '../lib/actions';
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
  const round = Boolean(card.round) || card.type === 'artist' || card.type === 'profile';
  const playable = Boolean(card.track) || ['song', 'video', 'episode', 'album', 'single', 'ep', 'playlist', 'podcast'].includes(card.type);

  if (card.type === 'mood') {
    return (
      <button
        type="button"
        className={`media-card mood-card ${variant === 'grid' ? 'mood-card-grid' : ''}`}
        style={{ '--mood-color': card.color || '#8ab4f8' } as CSSProperties}
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
      onDoubleClick={() => void activate()}
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
          aria-label={card.track ? `Play ${card.title}` : `Open ${card.title}`}
          title={card.title}
        >
          <Artwork src={card.thumbnail} alt={card.title} round={round} className="card-art" />
          {card.type === 'video' ? (
            <span className="card-kind" title="Video">
              <Video size={13} />
            </span>
          ) : card.type === 'podcast' ? (
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

export function Shelf({
  shelf,
  grid,
}: {
  shelf: ShelfType;
  grid?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigateEndpoint = useNavStore((state) => state.navigateEndpoint);
  const tracks = tracksFromPage({ shelves: [shelf] });
  const queue = tracks.length ? tracks : queueForShelf(shelf.items);
  const style = shelf.style || 'carousel';

  if (!shelf.items.length) return null;

  const showAsList = !grid && style === 'list' && shelf.items.filter((item) => item.track).length > 2;

  return (
    <section className={`shelf shelf-${style}`}>
      <header className="shelf-head">
        <div className="shelf-titles">
          <h2>{shelf.title || 'More to explore'}</h2>
          {shelf.subtitle ? <p>{shelf.subtitle}</p> : null}
        </div>
        <div className="shelf-actions">
          {shelf.endpoint ? (
            <Button variant="ghost" size="sm" onClick={() => navigateEndpoint(shelf.endpoint, shelf.title)}>
              Show all
            </Button>
          ) : null}
          {!showAsList && shelf.items.length > 3 ? (
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
      {showAsList ? (
        <div className="shelf-list-card">
          <TrackList tracks={tracks} showAlbum showArt={false} />
        </div>
      ) : (
        <div ref={scrollRef} className={`shelf-row ${grid || style === 'grid' ? 'is-grid' : ''}`}>
          {shelf.items.map((card, index) => (
            <MediaCard
              key={`${card.type}-${card.id}-${index}`}
              card={card}
              queue={card.track ? queue : undefined}
              index={card.track ? Math.max(0, tracks.findIndex((track) => track.id === card.track?.id)) : index}
              variant={grid || style === 'grid' ? 'grid' : 'carousel'}
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
