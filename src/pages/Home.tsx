import { useEffect, useRef, useState } from 'react';
import { Compass, Play, Radio, Sparkles } from 'lucide-react';
import type { Shelf as ShelfType, Track } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { toast } from '../stores/ui';
import { greeting, shuffleArray } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { tracksFromPage } from '../lib/actions';
import { Artwork, Button, ErrorPanel, IconButton, PageSkeleton } from '../components/primitives';
import { Shelf } from '../components/MediaCard';

function uniqueTracks<T extends { id: string }>(tracks: T[]): T[] {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

function QuickAccess() {
  const library = useAppStore((state) => state.library);
  const recent = library.recent.slice(0, 12);
  const navigate = useNavStore((state) => state.navigate);
  const carouselRef = useRef<HTMLDivElement>(null);
  const prefetchedRef = useRef(new Set<string>());

  const prefetch = (track: Track | undefined) => {
    if (!track?.id || prefetchedRef.current.has(track.id)) return;
    prefetchedRef.current.add(track.id);
    void window.auralis.player.prefetch(track).catch(() => {});
  };

  useEffect(() => {
    if (!recent[0]?.id) return;
    const timer = window.setTimeout(() => prefetch(recent[0]), 1200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recent[0]?.id]);

  const createMix = () => {
    const downloaded = library.downloads
      .filter((item) => item.status === 'done')
      .map((item) => item.track);
    const pool = uniqueTracks([...library.liked, ...recent, ...downloaded]);
    if (!pool.length) {
      toast('Play or like a few songs first, then Auralis can build a mix.', 'info');
      navigate({ page: 'explore' });
      return;
    }
    const mix = shuffleArray(pool).slice(0, 40);
    usePlayerStore.getState().playQueue(mix, 0);
    toast(`Created a ${mix.length}-song mix from your library.`, 'success');
  };

  const nudge = (direction: -1 | 1) => {
    carouselRef.current?.scrollBy({ left: direction * Math.max(260, carouselRef.current.clientWidth * 0.7), behavior: 'smooth' });
  };

  if (!recent.length) return null;
  return (
    <section className="quick-access">
      <div className="section-heading">
        <div>
          <h2>Jump back in</h2>
          <span className="section-subtitle">Your recent listening, ready when you are.</span>
        </div>
        <div className="section-heading-actions">
          <Button variant="ghost" size="sm" icon={<Sparkles size={15} />} onClick={createMix}>
            Create a Mix
          </Button>
          <button type="button" className="text-button" onClick={() => navigate({ page: 'recent' })}>
            See all
          </button>
        </div>
      </div>
      <div className="quick-carousel-wrap">
        <button type="button" className="quick-carousel-arrow is-left" aria-label="Scroll recent songs left" onClick={() => nudge(-1)}>
          ‹
        </button>
        <div ref={carouselRef} className="quick-grid" role="list" aria-label="Recently played songs">
          {recent.map((track, index) => (
            <button
              type="button"
              role="listitem"
              key={track.id}
              className="quick-card"
              onClick={() => usePlayerStore.getState().playQueue(recent, index)}
              onMouseEnter={() => prefetch(track)}
              onFocus={() => prefetch(track)}
            >
              <Artwork src={track.thumbnail} alt={track.title} className="quick-art" />
              <span className="quick-text">
                <span className="quick-title">{track.title}</span>
                <span className="quick-artist">{track.artists.map((artist) => artist.name).join(', ')}</span>
              </span>
              <span className="quick-play">
                <Play size={15} fill="currentColor" />
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="quick-carousel-arrow is-right" aria-label="Scroll recent songs right" onClick={() => nudge(1)}>
          ›
        </button>
      </div>
    </section>
  );
}

export function HomePage() {
  const { data, loading, error, reload } = useAsync(() => window.auralis.yt.home(), []);
  const [extraShelves, setExtraShelves] = useState<ShelfType[]>([]);
  const [continuation, setContinuation] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const navigate = useNavStore((state) => state.navigate);
  const liked = useAppStore((state) => state.library.liked);
  const recent = useAppStore((state) => state.library.recent);
  const openDialog = useUiStore((state) => state.openDialog);

  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorPanel message={error} retry={reload} />;

  const tracks = tracksFromPage(data);
  const shelves = [...(data?.shelves || []), ...extraShelves];

  const loadMore = async () => {
    const next = continuation || data?.continuation;
    if (!next) return;
    setLoadingMore(true);
    try {
      const page = await window.auralis.yt.home(next);
      const titles = new Set(shelves.map((shelf) => shelf.title));
      setExtraShelves([...extraShelves, ...page.shelves.filter((shelf) => !shelf.title || !titles.has(shelf.title))]);
      setContinuation(page.continuation);
    } finally {
      setLoadingMore(false);
    }
  };

  const shuffleLibrary = () => {
    const pool = liked.length ? liked : recent;
    if (!pool.length) {
      navigate({ page: 'explore' });
      return;
    }
    usePlayerStore.getState().playQueue(shuffleArray(pool), 0);
  };

  const heroTracks = tracks.slice(0, 4);

  return (
    <div className="page home-page">
      <section className="home-hero">
        <div className="home-hero-copy">
          <span className="eyebrow">
            <Sparkles size={14} /> Made for {new Date().toLocaleDateString(undefined, { weekday: 'long' })}
          </span>
          <h1>{greeting()}</h1>
          <p>Your music, your mood. Pick up where you left off or let Auralis find something new.</p>
          <div className="home-hero-actions">
            <Button variant="primary" icon={<Play size={17} fill="currentColor" />} onClick={shuffleLibrary}>
              Shuffle my library
            </Button>
            <Button
              variant="secondary"
              icon={<Radio size={17} />}
              onClick={() => {
                if (heroTracks[0]) usePlayerStore.getState().startRadio(heroTracks[0]);
                else navigate({ page: 'explore' });
              }}
            >
              Start a radio
            </Button>
            <Button variant="ghost" icon={<Compass size={17} />} onClick={() => navigate({ page: 'explore' })}>
              Explore
            </Button>
          </div>
        </div>
        <div className="home-hero-art" aria-hidden="true">
          {heroTracks.length ? (
            heroTracks.map((track, index) => (
              <Artwork
                key={`${track.id}-${index}`}
                src={track.thumbnail}
                alt={track.title}
                className={`hero-tile hero-tile-${index + 1}`}
              />
            ))
          ) : (
            <div className="hero-tile hero-tile-placeholder">
              <img src="./icon.png" alt="" />
            </div>
          )}
        </div>
      </section>

      <QuickAccess />

      <div className="quick-actions-row">
        <button type="button" className="pill-action" onClick={() => openDialog({ type: 'recognition' })}>
          <Sparkles size={15} /> Identify a song
        </button>
        <button type="button" className="pill-action" onClick={() => navigate({ page: 'library', tab: 'youtube' })}>
          <Play size={15} /> Your YouTube library
        </button>
      </div>

      <div className="shelf-stack">
        {shelves.map((shelf, index) => (
          <Shelf key={`${shelf.title}-${index}`} shelf={shelf} />
        ))}
      </div>

      {data?.continuation || continuation ? (
        <div className="load-more-row">
          <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Show more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
