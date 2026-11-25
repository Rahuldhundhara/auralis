import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  ArrowDown,
  Atom,
  Compass,
  Cpu,
  Fingerprint,
  Ghost,
  Headphones,
  HeartPulse,
  Landmark,
  Music2,
  Newspaper,
  Play,
  Podcast,
  Search,
  Smile,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import type { SearchResults, Shelf as ShelfType } from '@shared/types';
import { useAsync } from '../lib/useAsync';
import { useNavStore } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { Artwork, Button, EmptyState, ErrorPanel, PageSkeleton } from '../components/primitives';
import { Shelf } from '../components/MediaCard';
import { TrackList } from '../components/TrackList';
import { PodcastScene } from '../components/PodcastScene';
import {
  DEFAULT_PODCAST_THEME,
  PODCAST_CATEGORIES,
  PODCAST_THEMES,
  podcastPageBackground,
  podcastThemeVars,
  type PodcastTheme,
} from '../lib/podcastThemes';

const CATEGORY_ICONS: Record<string, typeof Sparkles> = {
  trending: Sparkles,
  crime: Fingerprint,
  news: Newspaper,
  horror: Ghost,
  technology: Cpu,
  comedy: Smile,
  business: TrendingUp,
  history: Landmark,
  science: Atom,
  health: HeartPulse,
  society: Users,
  music: Music2,
  sports: Trophy,
};

interface PodcastData {
  shows: SearchResults;
  episodes: SearchResults;
}

interface ThemeLayer {
  key: string;
  theme: PodcastTheme;
}

function dedupe<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function PodcastsPage() {
  const navigate = useNavStore((state) => state.navigate);
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [category, setCategory] = useState(DEFAULT_PODCAST_THEME.id);

  const activeTheme = useMemo<PodcastTheme>(() => {
    if (submitted) {
      return {
        ...PODCAST_THEMES.trending,
        id: 'search',
        label: 'Search',
        eyebrow: 'Search results',
        title: `Results for “${submitted}”`,
        tagline: 'Matching shows and episodes.',
        description: 'Every podcast result opens in the same global player as your music.',
      };
    }
    return PODCAST_THEMES[category] ?? DEFAULT_PODCAST_THEME;
  }, [category, submitted]);

  /** Keep the previous backdrop underneath while the new theme fades in. */
  const [themeLayers, setThemeLayers] = useState<ThemeLayer[]>(() => [
    { key: activeTheme.id, theme: activeTheme },
  ]);

  useEffect(() => {
    setThemeLayers((layers) =>
      layers[layers.length - 1]?.key === activeTheme.id
        ? layers
        : [...layers.slice(-1), { key: activeTheme.id, theme: activeTheme }],
    );
    const timer = window.setTimeout(() => {
      setThemeLayers((layers) => (layers.length > 1 ? layers.slice(-1) : layers));
    }, 720);
    return () => window.clearTimeout(timer);
  }, [activeTheme]);

  const searchTerm = submitted.trim() || activeTheme.query || 'podcast';

  const { data, loading, error, reload } = useAsync<PodcastData>(async () => {
    const [shows, episodes] = await Promise.all([
      window.auralis.yt.search(searchTerm, 'podcasts'),
      window.auralis.yt.search(searchTerm, 'episodes'),
    ]);
    return { shows, episodes };
  }, [searchTerm]);

  const showShelf = useMemo<ShelfType | undefined>(() => {
    if (!data) return undefined;
    const items = dedupe(data.shows.podcasts || []);
    if (!items.length) return undefined;
    return {
      title: submitted ? `Shows for “${submitted}”` : `${activeTheme.label} shows`,
      subtitle: 'Follow a show to keep up with every new episode.',
      items,
      style: 'grid',
    };
  }, [data, submitted, activeTheme.label]);

  const episodes = useMemo(() => {
    if (!data) return [];
    const fallbackArt = (data.shows.podcasts || []).find((show) => show.thumbnail)?.thumbnail;
    return dedupe(data.episodes.episodes || []).map((episode) =>
      episode.thumbnail ? episode : { ...episode, thumbnail: fallbackArt },
    );
  }, [data]);
  const latestShows = useMemo(() => (data ? dedupe(data.shows.podcasts || []).slice(0, 6) : []), [data]);
  const featuredEpisode = episodes[0];
  const categoryNumber = Math.max(
    1,
    PODCAST_CATEGORIES.findIndex((entry) => entry.id === activeTheme.id) + 1,
  )
    .toString()
    .padStart(2, '0');

  const playFeatured = () => {
    if (featuredEpisode) usePlayerStore.getState().playTrack(featuredEpisode);
  };

  const scrollToEpisodes = () => {
    document.getElementById('podcast-episodes')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div
      className="page podcasts-page"
      data-podcast-theme={activeTheme.id}
      style={podcastThemeVars(activeTheme) as CSSProperties}
    >
      {themeLayers.map((layer) => (
        <span
          key={layer.key}
          className="podcasts-ambient"
          style={{ background: podcastPageBackground(layer.theme) }}
          aria-hidden="true"
        />
      ))}

      <header className="podcasts-hero" data-art={activeTheme.art}>
        <div className="podcasts-hero-scenes" aria-hidden="true">
          {themeLayers.map((layer) => (
            <PodcastScene key={layer.key} art={layer.theme.art} />
          ))}
        </div>
        <span className="podcasts-hero-shade" aria-hidden="true" />
        <span className="podcasts-hero-ghost" aria-hidden="true">
          {activeTheme.label}
        </span>
        <span className="podcasts-hero-index" aria-hidden="true">
          {categoryNumber} / {PODCAST_CATEGORIES.length.toString().padStart(2, '0')}
        </span>

        <div className="podcasts-hero-content">
          <div className="podcasts-hero-copy">
            <span className="podcasts-hero-kicker">
              <Podcast size={13} /> Auralis Originals <span className="podcasts-hero-kicker-dot" /> {activeTheme.label}
            </span>
            <span className="eyebrow">{activeTheme.eyebrow}</span>
            <h1>{activeTheme.title}</h1>
            <p className="podcasts-hero-tagline">{activeTheme.tagline}</p>
            <p className="podcasts-hero-description">{activeTheme.description}</p>

            <div className="podcasts-hero-actions">
              <Button
                variant="primary"
                size="md"
                icon={<Play size={15} fill="currentColor" />}
                className="podcasts-hero-play"
                onClick={playFeatured}
                disabled={!featuredEpisode}
              >
                Play latest
              </Button>
              <button type="button" className="podcasts-hero-explore" onClick={scrollToEpisodes}>
                Explore episodes <ArrowDown size={15} />
              </button>
            </div>

            <form
              className="podcasts-search"
              onSubmit={(event) => {
                event.preventDefault();
                setSubmitted(query.trim());
                setCategory(DEFAULT_PODCAST_THEME.id);
              }}
              role="search"
            >
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search podcasts or episodes"
                aria-label="Search podcasts"
              />
              <Button type="submit" variant="primary" size="sm" className="podcasts-search-submit">
                Search
              </Button>
            </form>
          </div>

          <aside className="podcasts-hero-feature" aria-label="Featured category">
            <span className="podcasts-hero-feature-label">Now streaming</span>
            <strong>{activeTheme.label}</strong>
            <span className="podcasts-hero-feature-copy">{activeTheme.tagline}</span>
            <span className="podcasts-hero-feature-line" />
            <span className="podcasts-hero-feature-meta">
              <span>01 — Featured dossier</span>
              <span>{categoryNumber}</span>
            </span>
          </aside>
        </div>
      </header>

      <div className="podcasts-category-row" role="tablist" aria-label="Podcast categories">
        {PODCAST_CATEGORIES.map((entry) => {
          const Icon = CATEGORY_ICONS[entry.id] ?? Headphones;
          const selected = !submitted && category === entry.id;
          return (
            <button
              type="button"
              key={entry.id}
              role="tab"
              aria-selected={selected}
              className={`podcasts-category ${selected ? 'is-active' : ''}`}
              onClick={() => {
                setSubmitted('');
                setCategory(entry.id);
              }}
            >
              <Icon size={14} />
              {entry.label}
            </button>
          );
        })}
      </div>

      {submitted ? (
        <div className="podcasts-search-note">
          <Compass size={15} /> Results for “{submitted}”
          <button
            type="button"
            onClick={() => {
              setSubmitted('');
              setQuery('');
            }}
          >
            Clear
          </button>
        </div>
      ) : null}

      {loading && !data ? <PageSkeleton /> : null}
      {error && !data ? <ErrorPanel message={error} retry={reload} /> : null}

      {data && !showShelf && !episodes.length ? (
        <EmptyState
          icon={<Podcast size={26} />}
          title="No podcasts found"
          message="Try another search or pick a different category."
        />
      ) : null}

      {showShelf ? <Shelf shelf={showShelf} grid /> : null}

      {latestShows.length && !submitted ? (
        <section className="podcasts-quick-row">
          <div className="section-heading">
            <h2>Quick picks</h2>
          </div>
          <div className="podcasts-quick-grid">
            {latestShows.slice(0, 4).map((show) => (
              <button
                type="button"
                key={show.id}
                className="podcast-quick-card"
                onClick={() => navigate({ page: 'podcast', id: show.browseId || show.id })}
              >
                <span className="podcast-quick-art">
                  {show.thumbnail ? <Artwork src={show.thumbnail} alt="" /> : <Podcast size={22} />}
                </span>
                <span className="podcast-quick-text">
                  <strong>{show.title}</strong>
                  <span>{show.subtitle || 'Podcast'}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {episodes.length ? (
        <section className="podcasts-episodes" id="podcast-episodes">
          <div className="section-heading">
            <h2>{submitted ? 'Matching episodes' : 'Latest episodes'}</h2>
          </div>
          <TrackList tracks={episodes} showArt showAlbum={false} showIndex={false} />
        </section>
      ) : null}
    </div>
  );
}
