import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Compass, Play, Radio, Sparkles } from 'lucide-react';
import type { Shelf as ShelfType, Track } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { toast, useUiStore } from '../stores/ui';
import { greeting, shuffleArray } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { tracksFromPage } from '../lib/actions';
import { Artwork, Button, ErrorPanel, IconButton, PageSkeleton } from '../components/primitives';
import { Shelf } from '../components/MediaCard';

function QuickAccess() {
  const recent = useAppStore((state) => state.library.recent).slice(0, 14);
  const liked = useAppStore((state) => state.library.liked);
  const navigate = useNavStore((state) => state.navigate);
  const carouselRef = useRef<HTMLDivElement>(null);
  if (!recent.length) return null;

  const createMix = () => {
    const seen = new Set<string>();
    const pool: Track[] = [];
    const rounds = Math.max(liked.length, recent.length);
    // Alternate liked and recent tracks so the mix is not dominated by one list.
    for (let index = 0; index < rounds; index += 1) {
      for (const track of [liked[index], recent[index]]) {
        if (!track?.id || seen.has(track.id)) continue;
        seen.add(track.id);
        pool.push(track);
      }
    }
    if (!pool.length) {
      toast('Like a few songs or play something first, then Create a mix can use them.', 'info');
      navigate({ page: 'explore' });
      return;
    }
    const mix = shuffleArray(pool).slice(0, 30);
    usePlayerStore.getState().playQueue(mix, 0);
    toast(
      mix.length > 1
        ? `Playing a ${mix.length}-song mix from your liked songs and recent listens.`
        : 'Only one track is available, so the mix starts with it. Like more songs to grow it.',
      'success',
    );
  };

  return (
    <section className="quick-access">
      <div className="section-heading">
        <h2>Jump back in</h2>
        <div className="quick-access-actions">
          <button type="button" className="text-button quick-mix-button" onClick={createMix}>
            <Sparkles size={14} /> Create a mix
          </button>
          <div className="shelf-scroll-buttons">
            <IconButton label="Scroll Jump back in left" size="sm" variant="surface" onClick={() => carouselRef.current?.scrollBy({ left: -520, behavior: 'smooth' })}>
              <ChevronLeft size={16} />
            </IconButton>
            <IconButton label="Scroll Jump back in right" size="sm" variant="surface" onClick={() => carouselRef.current?.scrollBy({ left: 520, behavior: 'smooth' })}>
              <ChevronRight size={16} />
            </IconButton>
          </div>
          <button type="button" className="text-button" onClick={() => navigate({ page: 'recent' })}>
            See all
          </button>
        </div>
      </div>
      <div ref={carouselRef} className="quick-grid" aria-label="Jump back in">
        {recent.map((track, index) => (
          <button
            type="button"
            key={track.id}
            className="quick-card"
            onClick={() => usePlayerStore.getState().playQueue(recent, index)}
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
