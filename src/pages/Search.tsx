import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock3, Play, Search, Sparkles, X } from 'lucide-react';
import type { Card, SearchResults, Shelf as ShelfType, Track } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { useAsync } from '../lib/useAsync';
import { openCard, playCard } from '../lib/actions';
import { formatDuration } from '../lib/format';
import { Artwork, Button, Chips, EmptyState, ErrorPanel, IconButton, PageSkeleton } from '../components/primitives';
import { Shelf, MediaCard } from '../components/MediaCard';
import { TrackList } from '../components/TrackList';
import { SearchField } from '../components/SearchField';

const FILTERS = ['All', 'Songs', 'Videos', 'Albums', 'Artists', 'Playlists', 'Podcasts'] as const;
const FILTER_KEYS: Record<string, string | undefined> = {
  All: undefined,
  Songs: 'songs',
  Videos: 'videos',
  Albums: 'albums',
  Artists: 'artists',
  Playlists: 'playlists',
  Podcasts: 'podcasts',
};

function TopResult({ card }: { card: Card }) {
  const round = card.type === 'artist';
  const playable = Boolean(card.track) || ['song', 'video', 'album', 'playlist', 'episode'].includes(card.type);
  return (
    <div className="top-result" onClick={() => openCard(card)} role="button" tabIndex={0}>
      <Artwork src={card.thumbnail} alt={card.title} round={round} className="top-result-art" />
      <div className="top-result-text">
        <span className="eyebrow">Top result</span>
        <h2>{card.title}</h2>
        <p>{card.subtitle || card.type}</p>
        {card.track?.duration ? <span className="top-result-duration">{formatDuration(card.track.duration)}</span> : null}
      </div>
      {playable ? (
        <button
          type="button"
          className="top-result-play"
          aria-label={`Play ${card.title}`}
          onClick={(event) => {
            event.stopPropagation();
            void playCard(card);
          }}
        >
          <Play size={24} fill="currentColor" />
        </button>
      ) : null}
    </div>
  );
}

function SearchLanding() {
  const history = useAppStore((state) => state.library.searchHistory);
  const removeSearchHistory = useAppStore((state) => state.removeSearchHistory);
  const clearSearchHistory = useAppStore((state) => state.clearSearchHistory);
  const navigate = useNavStore((state) => state.navigate);
  return (
    <div className="search-landing">
      <div className="search-landing-hero">
        <span className="eyebrow">
          <Sparkles size={14} /> Search Auralis
        </span>
        <h1>What do you want to hear?</h1>
        <p>Songs, albums, artists, playlists and podcasts from YouTube Music.</p>
        <SearchField autoFocus large />
      </div>
      {history.length ? (
        <section className="search-history-section">
          <div className="section-heading">
            <h2>Recent searches</h2>
            <button type="button" className="text-button" onClick={() => void clearSearchHistory()}>
              <X size={14} /> Clear
            </button>
          </div>
          <div className="search-history-chips">
            {history.map((query) => (
              <span className="search-history-item" key={query}>
                <button type="button" className="search-history-chip" onClick={() => navigate({ page: 'search', q: query })}>
                  <Clock3 size={15} />
                  {query}
                </button>
                <button
                  type="button"
                  className="search-history-remove"
                  aria-label={`Remove “${query}” from search history`}
                  title={`Remove “${query}”`}
                  onClick={() => void removeSearchHistory(query)}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </section>
      ) : (
        <div className="search-suggestions-grid">
          <EmptyState
            icon={<Search size={25} />}
            title="Start with a song, artist or feeling"
            message="Try “lo-fi bollywood”, “Arijit Singh” or “albums for a rainy evening”."
            compact
          />
        </div>
      )}
    </div>
  );
}

export function SearchPage({ q, filter: initialFilter }: { q?: string; filter?: string }) {
  const query = (q || '').trim();
  const [filter, setFilter] = useState<string>(initialFilter && FILTERS.includes(initialFilter as any) ? initialFilter : 'All');
  const [extra, setExtra] = useState<SearchResults | null>(null);
  const [continuation, setContinuation] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | undefined>();
  const [loadMoreEnded, setLoadMoreEnded] = useState(false);
  const addHistory = useAppStore((state) => state.addSearchHistory);
  const player = usePlayerStore();
  const key = FILTER_KEYS[filter];
  const requestToken = useRef(0);
  const loadMoreBusy = useRef(false);
  const historyQuery = useRef('');
  const { data, loading, error, reload } = useAsync<SearchResults>(
    () => (query ? window.auralis.yt.search(query, key) : Promise.resolve(emptySearchResults())),
    [query, key],
    { resetOnChange: true },
  );

  useEffect(() => {
    if (query && historyQuery.current !== query) {
      historyQuery.current = query;
      void addHistory(query);
    }
    requestToken.current += 1;
    loadMoreBusy.current = false;
    setExtra(null);
    setContinuation(undefined);
    setLoadingMore(false);
    setLoadMoreError(undefined);
    setLoadMoreEnded(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, key]);

  const results = useMemo(() => {
    if (!data) return undefined;
    return extra ? mergeSearchResults(data, extra) : dedupeSearchResults(data);
  }, [data, extra]);

  if (!query) return <SearchLanding />;

  const loadMore = async () => {
    const next = continuation || data?.continuation;
    if (!next || loadMoreBusy.current || loadMoreEnded) return;
    const token = requestToken.current;
    loadMoreBusy.current = true;
    setLoadingMore(true);
    setLoadMoreError(undefined);
    try {
      const page = await window.auralis.yt.search(query, key, next);
      if (token !== requestToken.current) return;
      const merged = extra ? mergeSearchResults(extra, page) : dedupeSearchResults(page);
      setExtra(merged);
      setContinuation(page.continuation);
      const currentCount = results ? searchResultCount(results) : 0;
      const mergedCount = results ? searchResultCount(mergeSearchResults(results, page)) : searchResultCount(merged);
      if (!page.continuation || page.continuation === next || mergedCount <= currentCount) {
        setLoadMoreEnded(true);
      }
    } catch (err: any) {
      if (token === requestToken.current) {
        setLoadMoreError(err?.message || 'Could not load more results.');
      }
    } finally {
      if (token === requestToken.current) {
        loadMoreBusy.current = false;
        setLoadingMore(false);
      }
    }
  };

  const hasAny = results ? searchResultCount(results) > 0 : false;

  return (
    <div className="page search-page">
      <header className="page-hero search-hero">
        <span className="eyebrow">Search results</span>
        <h1>{query}</h1>
        <p>{results ? `${searchResultCount(results)} results` : 'Searching YouTube Music…'}</p>
      </header>

      <Chips items={[...FILTERS]} selected={filter} onSelect={setFilter} />

      {loading && !results ? <PageSkeleton /> : null}
      {error && !results ? <ErrorPanel message={error} retry={reload} /> : null}

      {results && !hasAny ? (
        <EmptyState
          icon={<Search size={26} />}
          title="No results found"
          message="Check the spelling or try a different search."
          action={<Button variant="outline" onClick={() => setFilter('All')}>Search everything</Button>}
        />
      ) : null}

      {results && hasAny ? (
        <div className="search-results">
          {filter === 'All' && results.top ? (
            <div className="search-top-layout">
              <TopResult card={results.top} />
              {results.songs.length ? (
                <section className="top-songs">
                  <div className="section-heading">
                    <h2>Songs</h2>
                    <button type="button" className="text-button" onClick={() => setFilter('Songs')}>
                      Show all
                    </button>
                  </div>
                  <TrackList tracks={results.songs.slice(0, 5)} showArt showAlbum={false} compact radioOnPlay />
                </section>
              ) : null}
            </div>
          ) : null}

          {filter === 'Songs' ? (
            <div className="shelf-list-card">
              <TrackList tracks={results.songs} showArt showAlbum radioOnPlay />
            </div>
          ) : null}

          {filter === 'All' || filter === 'Videos' ? (
            results.videos.length ? (
              <Shelf shelf={{ title: 'Videos', items: results.videos.map((track) => ({ type: 'video', id: track.id, title: track.title, subtitle: track.artists.map((a) => a.name).join(', '), thumbnail: track.thumbnail, track: { ...track, isVideo: true } })) }} />
            ) : null
          ) : null}

          {filter === 'All' || filter === 'Albums' ? (
            results.albums.length ? <Shelf shelf={{ title: 'Albums', items: results.albums, style: 'grid' }} grid /> : null
          ) : null}
          {filter === 'All' || filter === 'Artists' ? (
            results.artists.length ? <Shelf shelf={{ title: 'Artists', items: results.artists, style: 'grid' }} grid /> : null
          ) : null}
          {filter === 'All' || filter === 'Playlists' ? (
            results.playlists.length ? <Shelf shelf={{ title: 'Playlists', items: results.playlists, style: 'grid' }} grid /> : null
          ) : null}
          {filter === 'All' || filter === 'Podcasts' ? (
            results.podcasts.length ? <Shelf shelf={{ title: 'Podcasts', items: results.podcasts, style: 'grid' }} grid /> : null
          ) : null}
          {filter === 'All' || filter === 'Podcasts' ? (
            results.episodes.length ? (
              <section className="search-episodes">
                <div className="section-heading">
                  <h2>Episodes</h2>
                </div>
                <div className="shelf-list-card">
                  <TrackList tracks={results.episodes} showArt showAlbum={false} />
                </div>
              </section>
            ) : null
          ) : null}

          {loadMoreError ? (
            <div className="load-more-row load-more-error" role="alert">
              <span>{loadMoreError}</span>
              <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={loadingMore}>
                Try again
              </Button>
            </div>
          ) : (data?.continuation || continuation) && !loadMoreEnded ? (
            <div className="load-more-row">
              <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function dedupeCards(cards: Card[]): Card[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = `${card.type}-${card.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeTracks(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (!track?.id || seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

function emptySearchResults(): SearchResults {
  return {
    songs: [],
    videos: [],
    albums: [],
    artists: [],
    playlists: [],
    podcasts: [],
    episodes: [],
    profiles: [],
  };
}

function dedupeSearchResults(results: SearchResults): SearchResults {
  return {
    ...results,
    songs: dedupeTracks(results.songs),
    videos: dedupeTracks(results.videos),
    episodes: dedupeTracks(results.episodes),
    albums: dedupeCards(results.albums),
    artists: dedupeCards(results.artists),
    playlists: dedupeCards(results.playlists),
    podcasts: dedupeCards(results.podcasts),
    profiles: dedupeCards(results.profiles || []),
  };
}

function mergeSearchResults(base: SearchResults, next: SearchResults): SearchResults {
  return dedupeSearchResults({
    ...base,
    top: base.top || next.top,
    songs: [...base.songs, ...next.songs],
    videos: [...base.videos, ...next.videos],
    episodes: [...base.episodes, ...next.episodes],
    albums: [...base.albums, ...next.albums],
    artists: [...base.artists, ...next.artists],
    playlists: [...base.playlists, ...next.playlists],
    podcasts: [...base.podcasts, ...next.podcasts],
    profiles: [...(base.profiles || []), ...(next.profiles || [])],
    continuation: next.continuation,
  });
}

function searchResultCount(results: SearchResults): number {
  return (
    results.songs.length +
    results.videos.length +
    results.albums.length +
    results.artists.length +
    results.playlists.length +
    results.podcasts.length +
    results.episodes.length +
    (results.profiles?.length || 0)
  );
}
