import { useEffect, useMemo, useState } from 'react';
import { AudioLines, Clock3, Loader2, Mic, Play, Search, Sparkles, Square, X } from 'lucide-react';
import type { Card, SearchResults } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { useUiStore } from '../stores/ui';
import { toast } from '../stores/ui';
import { useAsync } from '../lib/useAsync';
import { useVoiceSearch } from '../lib/useVoiceSearch';
import { openCard, playCard } from '../lib/actions';
import { formatDuration } from '../lib/format';
import { Artwork, Button, Chips, EmptyState, ErrorPanel, IconButton, PageSkeleton } from '../components/primitives';
import { Shelf } from '../components/MediaCard';
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
  const clearSearchHistory = useAppStore((state) => state.clearSearchHistory);
  const removeSearchHistory = useAppStore((state) => state.removeSearchHistory);
  const navigate = useNavStore((state) => state.navigate);
  const openDialog = useUiStore((state) => state.openDialog);
  const voice = useVoiceSearch((text) => navigate({ page: 'search', q: text }));

  useEffect(() => {
    if (!voice.error) return;
    toast(voice.error, 'error');
    voice.clearError();
  }, [voice.error, voice.clearError]);

  return (
    <div className="search-landing">
      <div className="search-landing-hero">
        <span className="eyebrow">
          <Sparkles size={14} /> Search Auralis
        </span>
        <h1>What do you want to hear?</h1>
        <p>Songs, albums, artists, playlists and podcasts from YouTube Music.</p>
        <SearchField large />
        <div className="search-landing-actions">
          <Button
            variant={voice.recording ? 'primary' : 'outline'}
            size="sm"
            icon={
              voice.transcribing ? (
                <Loader2 size={15} className="spin" />
              ) : voice.recording ? (
                <Square size={13} fill="currentColor" />
              ) : (
                <Mic size={15} />
              )
            }
            disabled={voice.transcribing}
            onClick={() => (voice.recording ? voice.stop() : void voice.start())}
          >
            {voice.transcribing ? 'Transcribing…' : voice.recording ? 'Stop listening' : 'Voice search'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<AudioLines size={15} />}
            onClick={() => openDialog({ type: 'recognition' })}
          >
            Identify a song
          </Button>
        </div>
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
              <span className="search-history-chip" key={query}>
                <button
                  type="button"
                  className="search-history-query"
                  onClick={() => navigate({ page: 'search', q: query })}
                >
                  <Clock3 size={15} />
                  {query}
                </button>
                <button
                  type="button"
                  className="search-history-remove"
                  aria-label={`Remove ${query} from recent searches`}
                  onClick={() => void removeSearchHistory(query)}
                >
                  <X size={13} />
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
  const addHistory = useAppStore((state) => state.addSearchHistory);
  const key = FILTER_KEYS[filter];
  const { data, loading, error, reload, setData } = useAsync<SearchResults>(
    () => (query ? window.auralis.yt.search(query, key) : Promise.resolve({ songs: [], videos: [], albums: [], artists: [], playlists: [], podcasts: [], episodes: [], profiles: [] })),
    [query, key],
  );

  useEffect(() => {
    if (query) void addHistory(query);
    setData(undefined);
    setExtra(null);
    setContinuation(undefined);
  }, [query, key, addHistory, setData]);

  const results = useMemo(() => {
    if (!data) return undefined;
    if (!extra) return data;
    return {
      ...data,
      songs: [...data.songs, ...extra.songs],
      videos: [...data.videos, ...extra.videos],
      albums: dedupeCards([...data.albums, ...extra.albums]),
      artists: dedupeCards([...data.artists, ...extra.artists]),
      playlists: dedupeCards([...data.playlists, ...extra.playlists]),
      podcasts: dedupeCards([...data.podcasts, ...extra.podcasts]),
      episodes: [...data.episodes, ...extra.episodes],
    };
  }, [data, extra]);

  if (!query) return <SearchLanding />;

  const loadMore = async () => {
    const next = continuation || data?.continuation;
    if (!next || loadingMore || loading || !data) return;
    setLoadingMore(true);
    try {
      const page = await window.auralis.yt.search(query, key, next);
      setExtra((current) => {
        if (!current) return page;
        return {
          ...current,
          songs: [...current.songs, ...page.songs],
          videos: [...current.videos, ...page.videos],
          albums: dedupeCards([...current.albums, ...page.albums]),
          artists: dedupeCards([...current.artists, ...page.artists]),
          playlists: dedupeCards([...current.playlists, ...page.playlists]),
          podcasts: dedupeCards([...current.podcasts, ...page.podcasts]),
          episodes: [...current.episodes, ...page.episodes],
        };
      });
      setContinuation(page.continuation);
    } catch (error: any) {
      toast(`Could not load more results: ${error?.message || error}`, 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const hasAny = results
    ? results.songs.length + results.videos.length + results.albums.length + results.artists.length + results.playlists.length + results.podcasts.length + results.episodes.length > 0
    : false;

  return (
    <div className="page search-page">
      <header className="page-hero search-hero">
        <span className="eyebrow">Search results</span>
        <h1>{query}</h1>
        <p>{results ? `${results.songs.length + results.videos.length + results.albums.length + results.artists.length + results.playlists.length + results.podcasts.length + results.episodes.length} results` : 'Searching YouTube Music…'}</p>
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

          {data?.continuation || continuation ? (
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
