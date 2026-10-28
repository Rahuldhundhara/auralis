import { BarChart3, Compass, Disc3, Flame, Smile, Sparkles } from 'lucide-react';
import type { NavEndpoint } from '@shared/types';
import { useNavStore } from '../stores/nav';
import { useAsync } from '../lib/useAsync';
import { Button, Chips, ErrorPanel, PageSkeleton } from '../components/primitives';
import { ShelfGrid } from '../components/MediaCard';

type ExploreTab = 'explore' | 'charts' | 'new' | 'moods';

const TABS: Array<{ id: ExploreTab; label: string; icon: React.ReactNode; title: string; subtitle: string }> = [
  {
    id: 'explore',
    label: 'Explore',
    icon: <Compass size={16} />,
    title: 'Find your next favourite',
    subtitle: 'New releases, moods, charts and playlists picked for every kind of day.',
  },
  {
    id: 'charts',
    label: 'Charts',
    icon: <BarChart3 size={16} />,
    title: 'What the world is playing',
    subtitle: 'The biggest songs, albums and artists on YouTube Music right now.',
  },
  {
    id: 'new',
    label: 'New releases',
    icon: <Disc3 size={16} />,
    title: 'Fresh out of the studio',
    subtitle: 'New albums and singles, updated as they land.',
  },
  {
    id: 'moods',
    label: 'Moods & genres',
    icon: <Smile size={16} />,
    title: 'Music for every moment',
    subtitle: 'Browse by mood, genre and activity. There is a soundtrack for all of it.',
  },
];

export function ExplorePage({ tab: initialTab }: { tab?: ExploreTab }) {
  const tab = initialTab || 'explore';
  const navigate = useNavStore((state) => state.navigate);
  const navigateEndpoint = useNavStore((state) => state.navigateEndpoint);
  const { data, loading, error, reload } = useAsync(() => {
    if (tab === 'charts') return window.auralis.yt.charts();
    if (tab === 'new') return window.auralis.yt.newReleases();
    if (tab === 'moods') return window.auralis.yt.moods();
    return window.auralis.yt.explore();
  }, [tab]);
  const meta = TABS.find((entry) => entry.id === tab) || TABS[0];

  return (
    <div className="page explore-page">
      <header className="page-hero compact-hero">
        <div>
          <span className="eyebrow">
            {tab === 'charts' ? <Flame size={14} /> : <Sparkles size={14} />} Discover
          </span>
          <h1>{meta.title}</h1>
          <p>{meta.subtitle}</p>
        </div>
      </header>

      <div className="explore-tabs" role="tablist" aria-label="Explore sections">
        {TABS.map((entry) => (
          <button
            type="button"
            key={entry.id}
            role="tab"
            aria-selected={tab === entry.id}
            className={`explore-tab ${tab === entry.id ? 'is-active' : ''}`}
            onClick={() => navigate({ page: 'explore', tab: entry.id }, true)}
          >
            {entry.icon}
            {entry.label}
          </button>
        ))}
      </div>

      {data?.chips?.length ? (
        <div className="genre-chips">
          {data.chips.map((chip, index) => (
            <button
              type="button"
              key={`${chip.title}-${index}`}
              className={`genre-chip ${chip.selected ? 'is-selected' : ''}`}
              onClick={() => chip.endpoint && navigateEndpoint(chip.endpoint, chip.title)}
            >
              {chip.title}
            </button>
          ))}
        </div>
      ) : null}

      {loading && !data ? <PageSkeleton /> : null}
      {error && !data ? <ErrorPanel message={error} retry={reload} /> : null}
      {data ? <ShelfGrid shelves={data.shelves} /> : null}
      {data && !data.shelves.length ? (
        <div className="load-more-row">
          <Button variant="outline" onClick={reload}>
            Refresh
          </Button>
        </div>
      ) : null}
    </div>
  );
}
