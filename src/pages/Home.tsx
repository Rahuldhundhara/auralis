import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Play, Radio, Sparkles } from 'lucide-react';
import type { Card, Shelf as ShelfType } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { toast } from '../stores/ui';
import { greeting, shuffleArray } from '../lib/format';
import { isAndroidShell } from '../lib/platform';
import { useAsync } from '../lib/useAsync';
import { tracksFromPage } from '../lib/actions';
import { currentTasteProfile, personalizedShelves } from '../lib/recommendations';
import { Artwork, Button, ErrorPanel, IconButton, PageSkeleton } from '../components/primitives';
import { Shelf } from '../components/MediaCard';

function QuickAccess() {
  const recent = useAppStore((state) => state.library.recent).slice(0, 14);
  const liked = useAppStore((state) => state.library.liked);
  const navigate = useNavStore((state) => state.navigate);
  const railRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const updateEdges = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const max = rail.scrollWidth - rail.clientWidth;
    setEdges({ left: rail.scrollLeft > 4, right: rail.scrollLeft < max - 4 });
  }, []);

  useEffect(() => {
    updateEdges();
    const rail = railRef.current;
    if (!rail) return;
    rail.addEventListener('scroll', updateEdges, { passive: true });
    window.addEventListener('resize', updateEdges);
    return () => {
      rail.removeEventListener('scroll', updateEdges);
      window.removeEventListener('resize', updateEdges);
    };
  }, [updateEdges, recent.length]);

  if (!recent.length) return null;

  const createMix = () => {
    const seen = new Set<string>();
    const pool = shuffleArray([...liked, ...recent]).filter((track) => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    });
    if (!pool.length) {
      toast('Like a few songs or play something first, then create a mix.', 'info');
      navigate({ page: 'explore' });
      return;
    }
    const mix = pool.slice(0, 30);
    usePlayerStore.getState().playQueue(mix, 0);
    toast(`Your mix is ready — ${mix.length} ${mix.length === 1 ? 'song' : 'songs'}.`, 'success');
  };

  const scrollRail = (direction: -1 | 1) => {
    railRef.current?.scrollBy({ left: direction * Math.max(260, railRef.current.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <section className="quick-access">
      <div className="section-heading">
        <h2>Jump back in</h2>
        <div className="quick-heading-actions">
          <button type="button" className="text-button" onClick={() => navigate({ page: 'recent' })}>
            See all
          </button>
        </div>
      </div>
      <div className="quick-rail-wrap">
        {edges.left ? (
          <button type="button" className="rail-arrow is-left" aria-label="Scroll back" onClick={() => scrollRail(-1)}>
            <ChevronLeft size={17} />
          </button>
        ) : null}
        <div className="quick-rail" ref={railRef}>
          <button type="button" className="quick-card quick-mix-card" onClick={createMix}>
            <span className="quick-mix-art">
              <Sparkles size={22} />
            </span>
            <span className="quick-text">
              <span className="quick-title">Create a Mix</span>
              <span className="quick-artist">Liked songs and recent plays</span>
            </span>
          </button>
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
        {edges.right ? (
          <button type="button" className="rail-arrow is-right" aria-label="Scroll forward" onClick={() => scrollRail(1)}>
            <ChevronRight size={17} />
          </button>
        ) : null}
      </div>
    </section>
  );
}

function HomeLogoBackground({ pageRef }: { pageRef: RefObject<HTMLDivElement | null> }) {
  useEffect(() => {
    // Android uses a static, unblurred watermark; the scroll-driven blur is a
    // desktop effect and costs frames in the WebView.
    if (isAndroidShell) return;
    const page = pageRef.current;
    if (!page) return;
    const scroller = page.closest('.content-scroll') as HTMLElement | null;
    let frame = 0;
    const update = () => {
      frame = 0;
      const offset = scroller?.scrollTop || 0;
      const fade = Math.max(0, 1 - offset / 420);
      page.style.setProperty('--home-logo-opacity', String(Math.min(0.28, fade * 0.28)));
      page.style.setProperty('--home-logo-shift', `${Math.min(120, offset * 0.16)}px`);
    };
    const request = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    scroller?.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      scroller?.removeEventListener('scroll', request);
      window.removeEventListener('resize', request);
    };
  }, [pageRef]);

  return (
    <div className="home-logo-bg" aria-hidden="true">
      <span className="home-logo-word">AURALIS</span>
      <img src="./icon.png" alt="" draggable={false} />
    </div>
  );
}

const RECOMMENDED_ARTIST_NAMES = ['Arijit Singh', 'Diljit Dosanjh', 'Pritam', 'Shreya Ghoshal'];

const ARTIST_CACHE_KEY = 'auralis.recommendedArtists.v1';
const ARTIST_CACHE_TTL = 24 * 60 * 60_000;

function cachedArtists(): Card[] {
  try {
    const raw = localStorage.getItem(ARTIST_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { at: number; artists: Card[] };
    if (!Array.isArray(parsed.artists) || Date.now() - parsed.at > ARTIST_CACHE_TTL) return [];
    return parsed.artists.filter((card) => card?.thumbnail && (card.browseId || card.id));
  } catch {
    return [];
  }
}

function rememberArtists(artists: Card[]) {
  try {
    localStorage.setItem(ARTIST_CACHE_KEY, JSON.stringify({ at: Date.now(), artists }));
  } catch {
    // Caching is best-effort.
  }
}

function RecommendedArtistStations({ shelves }: { shelves: ShelfType[] }) {
  const navigate = useNavStore((state) => state.navigate);
  const savedArtists = useAppStore((state) => state.library.savedArtists);
  const tasteArtists = useAppStore((state) => state.settings.tasteArtists);
  const [fallback, setFallback] = useState<Card[]>(cachedArtists);
  const [busyId, setBusyId] = useState<string | undefined>();

  const artists = useMemo(() => {
    const seen = new Set<string>();
    const pool: Card[] = [];
    const add = (card: Card) => {
      if (!card || card.type !== 'artist') return;
      const key = card.browseId || card.id;
      if (!key || seen.has(key) || !card.thumbnail) return;
      seen.add(key);
      pool.push({ ...card, id: card.id || key, browseId: card.browseId || key });
    };
    for (const artist of tasteArtists || []) {
      if (artist.thumbnail) {
        add({
          type: 'artist',
          id: artist.id,
          title: artist.name,
          subtitle: 'Your pick',
          thumbnail: artist.thumbnail,
          browseId: artist.id,
          round: true,
        });
      }
    }
    for (const card of savedArtists) add(card);
    for (const shelf of shelves) {
      for (const card of shelf.items) add(card);
    }
    // A search-backed fallback keeps the rail useful on home pages whose
    // shelves are all playlists. Artist results carry the official channel
    // artwork used by YouTube Music.
    for (const card of fallback) add(card);
    return pool.slice(0, 14);
  }, [fallback, savedArtists, shelves, tasteArtists]);

  useEffect(() => {
    let cancelled = false;
    const hasArtistShelf = shelves.some((shelf) => shelf.items.some((card) => card.type === 'artist' && card.thumbnail));
    if (tasteArtists?.length || hasArtistShelf || savedArtists.length || cachedArtists().length >= 4) return;
    const wanted = new Set(RECOMMENDED_ARTIST_NAMES.map((name) => name.toLowerCase()));
    void Promise.allSettled(
      RECOMMENDED_ARTIST_NAMES.map((name) =>
        window.auralis.yt.search(name, 'artists').then((result) => {
          const match = (result.artists || []).find((card) => {
            const title = card.title.toLowerCase();
            return card.thumbnail && (title === name.toLowerCase() || title.includes(name.toLowerCase()));
          });
          return match ? { ...match, id: match.browseId || match.id } : undefined;
        }),
      ),
    ).then((settled) => {
      if (cancelled) return;
      const found = settled
        .filter((entry): entry is PromiseFulfilledResult<Card | undefined> => entry.status === 'fulfilled')
        .map((entry) => entry.value)
        .filter((card): card is Card => Boolean(card && card.thumbnail && wanted.has((card.title || '').toLowerCase())));
      if (found.length) {
        setFallback(found);
        rememberArtists(found);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [savedArtists.length, shelves, tasteArtists?.length]);

  if (!artists.length) return null;

  const startStation = async (card: Card) => {
    if (busyId) return;
    const id = card.browseId || card.id;
    setBusyId(id);
    try {
      const page = await window.auralis.yt.artist(id);
      const tracks = tracksFromPage(page);
      const seed = tracks[0];
      if (seed) {
        usePlayerStore.getState().startRadio(seed);
        toast(`Starting an artist station for ${card.title}…`, 'success');
      } else {
        navigate({ page: 'artist', id });
      }
    } catch {
      toast(`Could not start the ${card.title} station. Opening the artist instead.`, 'error');
      navigate({ page: 'artist', id });
    } finally {
      setBusyId(undefined);
    }
  };

  return (
    <section className="artist-stations" aria-label="Recommended artist stations">
      <div className="section-heading">
        <div>
          <h2>Recommended Artist Stations</h2>
        </div>
      </div>
      <div className="artist-station-rail">
        {artists.map((card) => {
          const id = card.browseId || card.id;
          return (
            <div key={id} className={`artist-station-card ${busyId === id ? 'is-busy' : ''}`}>
              <button
                type="button"
                className="artist-station-open"
                onClick={() => navigate({ page: 'artist', id })}
                title={`Open ${card.title}`}
                aria-label={`Open ${card.title}`}
              >
                <span className="artist-station-art">
                  <Artwork src={card.thumbnail} alt={card.title} round />
                </span>
                <span className="artist-station-copy">
                  <strong>{card.title}</strong>
                  <span>{card.subtitle || 'Artist'}</span>
                </span>
              </button>
              <button
                type="button"
                className="artist-station-play"
                onClick={() => void startStation(card)}
                title={`Start a ${card.title} station`}
                aria-label={`Start a ${card.title} station`}
              >
                {busyId === id ? <Loader2 size={17} className="spin" /> : <Radio size={16} />}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function HomePage() {
  const { data, loading, error, reload } = useAsync(() => window.auralis.yt.home(), []);
  const [extraShelves, setExtraShelves] = useState<ShelfType[]>([]);
  const [continuation, setContinuation] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
  const homeVersionRef = useRef(0);
  const navigate = useNavStore((state) => state.navigate);
  const liked = useAppStore((state) => state.library.liked);
  const recent = useAppStore((state) => state.library.recent);
  const tasteArtists = useAppStore((state) => state.settings.tasteArtists);
  const tasteLanguages = useAppStore((state) => state.settings.tasteLanguages);
  const tasteGenres = useAppStore((state) => state.settings.tasteGenres);
  const recentCount = useAppStore((state) => state.library.recent.length);
  const likedCount = useAppStore((state) => state.library.liked.length);
  const [personalShelves, setPersonalShelves] = useState<ShelfType[]>([]);

  useEffect(() => {
    let cancelled = false;
    const profile = currentTasteProfile();
    if (!profile.artists.length && !profile.languages.length) {
      setPersonalShelves([]);
      return;
    }
    void personalizedShelves(profile)
      .then((shelves) => {
        if (!cancelled) setPersonalShelves(shelves);
      })
      .catch(() => {
        if (!cancelled) setPersonalShelves([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tasteArtists, tasteLanguages, tasteGenres, recentCount, likedCount]);

  useEffect(() => {
    homeVersionRef.current += 1;
    setExtraShelves([]);
    // Seed the cursor from the first page only. After that we strictly follow
    // the server's continuation token; falling back to the original token
    // would reload the same shelves forever when the feed ends.
    setContinuation(data?.continuation);
  }, [data]);

  const shelves = [...personalShelves, ...(data?.shelves || []), ...extraShelves];
  const hasMore = Boolean(continuation);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !continuation) return;
    const version = homeVersionRef.current;
    const next = continuation;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await window.auralis.yt.home(next);
      if (version !== homeVersionRef.current) return;
      setExtraShelves((current) => {
        const base = [...(data?.shelves || []), ...current];
        const titles = new Set(base.map((shelf) => shelf.title).filter(Boolean));
        return [
          ...current,
          ...page.shelves.filter((shelf) => !shelf.title || !titles.has(shelf.title)),
        ];
      });
      setContinuation(page.continuation);
    } catch {
      // Keep the current shelves; the sentinel retries when it is visible again.
    } finally {
      loadingMoreRef.current = false;
      if (version === homeVersionRef.current) setLoadingMore(false);
    }
  }, [continuation, data?.shelves]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const root = node.closest('.content-scroll') as HTMLElement | null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { root, rootMargin: '300px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorPanel message={error} retry={reload} />;

  const tracks = tracksFromPage(data);

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
    <div className="page home-page" ref={pageRef}>
      <HomeLogoBackground pageRef={pageRef} />
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

      <RecommendedArtistStations shelves={shelves} />

      <div className="shelf-stack">
        {shelves.map((shelf, index) => (
          <Shelf key={`${shelf.title}-${index}`} shelf={shelf} />
        ))}
      </div>

      <div ref={sentinelRef} className={`infinite-sentinel ${hasMore ? 'is-loading' : 'is-done'}`} aria-live="polite">
        {hasMore ? (
          <>
            <Loader2 size={16} className={loadingMore ? 'spin' : ''} />
            <span>{loadingMore ? 'Loading more for you…' : 'Keep scrolling for more'}</span>
          </>
        ) : extraShelves.length ? (
          <span>You’re all caught up.</span>
        ) : null}
      </div>
    </div>
  );
}
