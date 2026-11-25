import { useState, useEffect, useRef } from 'react';
import { Pause, Play, Radio, Sparkles } from 'lucide-react';
import type { Card, Shelf as ShelfType, Track } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { toast } from '../stores/ui';
import { shuffleArray } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { tracksFromPage } from '../lib/actions';
import { withoutVideos } from '../lib/shelves';
import { Artwork, Button, ErrorPanel, IconButton, PageSkeleton } from '../components/primitives';
import { taglineForTrack } from '../lib/vibeTagline';
import { extractAverageColor } from '../lib/artColor';
import { proxiedArtwork } from '../lib/image';
import { Shelf } from '../components/MediaCard';
import { useTranslation } from '../lib/i18n';
import {
  fetchPersonalizedArtists,
  fetchPersonalizedTracks,
  fetchSimilarArtists,
  fetchTrendingInGenres,
  trackCard,
} from '../lib/personalized';

function uniqueTracks<T extends { id: string }>(tracks: T[]): T[] {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Dynamic music-reactive hero banner                                 */
/* ------------------------------------------------------------------ */

function DynamicHero({ tracks }: { tracks: Track[] }) {
  const current = usePlayerStore((state) => state.current);
  const playing = usePlayerStore((state) => state.playing);
  const [artColor, setArtColor] = useState<{ r: number; g: number; b: number }>({ r: 16, g: 185, b: 129 });
  const [tagline, setTagline] = useState("This one's for you.");
  const prevIdRef = useRef<string>('');

  useEffect(() => {
    const activeTrack = current || tracks[0];
    const signature = `${activeTrack?.id || ''}:${activeTrack?.thumbnail || ''}`;
    if (signature === prevIdRef.current) return;
    prevIdRef.current = signature;

    if (activeTrack?.thumbnail) {
      extractAverageColor(activeTrack.thumbnail).then((color) => {
        if (color) setArtColor({ r: color.r, g: color.g, b: color.b });
      });
    }
    setTagline(taglineForTrack(activeTrack));
  }, [current?.id, current?.thumbnail, tracks]);

  const featured = current || tracks[0] || null;
  const artwork = proxiedArtwork(featured?.thumbnail);
  const artistLine = featured?.artists?.map((a) => a.name).join(' • ') || 'Auralis';
  const albumLine = featured?.album?.name && featured.album.name !== featured.title ? featured.album.name : null;

  const hexColor = `rgb(${artColor.r}, ${artColor.g}, ${artColor.b})`;
  const hexColorDim = `rgba(${artColor.r}, ${artColor.g}, ${artColor.b}, 0.35)`;
  const hexColorDeep = `rgba(${Math.round(artColor.r * 0.35)}, ${Math.round(artColor.g * 0.35)}, ${Math.round(artColor.b * 0.35)}, 0.92)`;

  const playPause = () => {
    const state = usePlayerStore.getState();
    if (state.current) {
      state.toggle();
      return;
    }
    const list = tracks;
    if (list.length) {
      usePlayerStore.getState().playQueue(list, 0);
    } else {
      toast('Nothing to play yet — open Explore and pick a song.', 'info');
    }
  };

  const startRadio = () => {
    if (!featured) {
      toast('Radio needs a track to start from.', 'info');
      return;
    }
    usePlayerStore.getState().startRadio(featured);
    toast('Radio ready — endless discovery', 'success');
  };

  return (
    <section
      className="dynamic-hero"
      aria-label="Featured music"
      style={{
        // @ts-ignore
        '--art-color': hexColor,
        '--art-color-dim': hexColorDim,
        '--art-color-deep': hexColorDeep,
      }}
    >
      <div
        className="dynamic-hero-backdrop"
        style={{
          backgroundImage: artwork ? `url('${artwork}')` : 'none',
          backgroundColor: hexColorDeep,
        }}
        aria-hidden="true"
      />
      <div className="dynamic-hero-shade" aria-hidden="true" />

      <div className="dynamic-hero-content">
        <div className="dynamic-hero-art-wrap">
          <Artwork
            src={featured?.thumbnail}
            alt={featured?.title || 'Current track'}
            className="dynamic-hero-art"
            eager
          />
        </div>
        <div className="dynamic-hero-text">
          <span className="dynamic-tagline">{tagline}</span>
          <h1 className="dynamic-title">{featured?.title || 'Select a song to start'}</h1>
          <p className="dynamic-artist">{artistLine}</p>
          {albumLine ? <p className="dynamic-album">{albumLine}</p> : null}
          <div className="dynamic-hero-actions">
            <button
              type="button"
              className="dynamic-play-btn"
              onClick={playPause}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? (
                <><Pause size={16} fill="currentColor" />Pause</>
              ) : (
                <><Play size={16} fill="currentColor" />Play</>
              )}
            </button>
            <button type="button" className="cinematic-btn" onClick={startRadio}>
              <Radio size={15} />
              <span>Radio</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Jump back in grid                                                   */
/* ------------------------------------------------------------------ */

function QuickAccess({ recent }: { recent: Track[] }) {
  const navigate = useNavStore((state) => state.navigate);
  const items = recent.slice(0, 6);

  if (!items.length) return null;

  const createMix = () => {
    const library = useAppStore.getState().library;
    const downloaded = library.downloads.filter((item) => item.status === 'done').map((item) => item.track);
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

  return (
    <section className="jump-back-section">
      <div className="jump-back-head">
        <div>
          <div className="jump-back-title">
            <h2>Jump Back In</h2>
            <span className="jump-back-badge">Recent</span>
          </div>
          <p className="jump-back-sub">Pick up right where you left your headphones</p>
        </div>
        <div className="jump-back-actions">
          <button
            type="button"
            className="sync-btn"
            onClick={() => toast('Synchronizing with YouTube Music library...', 'info')}
          >
            Sync YouTube Library
          </button>
          <button type="button" className="see-all-link" onClick={() => navigate({ page: 'recent' })}>
            See all ({items.length})
          </button>
          <Button variant="ghost" size="sm" icon={<Sparkles size={15} />} onClick={createMix}>
            Create a Mix
          </Button>
        </div>
      </div>
      <div className="jump-back-grid">
        {items.map((track, index) => (
          <div
            key={track.id}
            className="jump-back-card"
            onClick={() => usePlayerStore.getState().playQueue(items, index)}
          >
            <Artwork src={track.thumbnail} alt={track.title} className="jump-back-cover" />
            <div className="jump-back-meta">
              <h4>{track.title}</h4>
              <p>{track.artists.map((a) => a.name).join(', ')}</p>
              <span className="sub">{track.duration > 0 ? `${Math.floor(track.duration / 60)}:${String(track.duration % 60).padStart(2, '0')}` : ''} • Track</span>
            </div>
            <button
              type="button"
              className="jump-back-play"
              onClick={(e) => {
                e.stopPropagation();
                usePlayerStore.getState().playQueue(items, index);
              }}
              aria-label={`Play ${track.title}`}
            >
              <Play size={16} fill="currentColor" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function HomePage() {
  const { data, loading, error, reload } = useAsync(() => window.auralis.yt.home(), []);
  const { data: charts } = useAsync(() => window.auralis.yt.charts(), []);
  const { data: newReleases } = useAsync(() => window.auralis.yt.newReleases(), []);
  const [extraShelves, setExtraShelves] = useState<ShelfType[]>([]);
  const [continuation, setContinuation] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const recent = useAppStore((state) => state.library.recent);
  const personalization = useAppStore((state) => state.settings.personalization);
  const { t } = useTranslation();

  const {
    data: favoriteArtistsCards,
    loading: artistsLoading,
  } = useAsync(
    () =>
      personalization.onboardingCompleted
        ? fetchPersonalizedArtists(personalization.favoriteArtists)
        : Promise.resolve<Card[]>([]),
    [personalization.onboardingCompleted, personalization.favoriteArtists],
  );
  const {
    data: tasteTracks,
    loading: tasteLoading,
  } = useAsync(
    () =>
      personalization.onboardingCompleted
        ? fetchPersonalizedTracks(personalization.preferredGenres, [])
        : Promise.resolve<Track[]>([]),
    [personalization.onboardingCompleted, personalization.preferredGenres],
  );
  const {
    data: similarArtistsCards,
    loading: similarLoading,
  } = useAsync(
    () =>
      personalization.onboardingCompleted
        ? fetchSimilarArtists(personalization.preferredGenres, personalization.favoriteArtists)
        : Promise.resolve<Card[]>([]),
    [personalization.onboardingCompleted, personalization.preferredGenres, personalization.favoriteArtists],
  );
  const {
    data: recommendedTracks,
    loading: recommendedLoading,
  } = useAsync(
    () =>
      personalization.onboardingCompleted
        ? fetchPersonalizedTracks([], personalization.favoriteArtists)
        : Promise.resolve<Track[]>([]),
    [personalization.onboardingCompleted, personalization.favoriteArtists],
  );
  const {
    data: trendingTracks,
    loading: trendingLoading,
  } = useAsync(
    () =>
      personalization.onboardingCompleted
        ? fetchTrendingInGenres(personalization.preferredGenres)
        : Promise.resolve<Track[]>([]),
    [personalization.onboardingCompleted, personalization.preferredGenres],
  );

  const personalizedLoading = artistsLoading || tasteLoading || similarLoading || recommendedLoading || trendingLoading;

  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorPanel message={error} retry={reload} />;

  const tracks = tracksFromPage(data).filter((track) => !track.isVideo && track.type !== 'video');

  const hotShelves = charts
    ? charts.shelves
        .slice(0, 1)
        .map((shelf) => ({ ...shelf, title: 'Hot Picks Worldwide', subtitle: 'Top tracks across the globe right now' }))
    : [];

  const trendyShelves = newReleases
    ? newReleases.shelves
        .slice(0, 1)
        .map((shelf) => ({ ...shelf, title: 'Trendy Right Now', subtitle: 'New releases landing globally' }))
    : [];

  const shelves = withoutVideos([...hotShelves, ...trendyShelves, ...(data?.shelves || []), ...extraShelves]);

  const loadMore = async () => {
    const next = continuation || data?.continuation;
    if (!next) return;
    setLoadingMore(true);
    try {
      const page = await window.auralis.yt.home(next);
      const titles = new Set(shelves.map((shelf) => shelf.title));
      const nextShelves = withoutVideos(page.shelves).filter((shelf) => !shelf.title || !titles.has(shelf.title));
      setExtraShelves([...extraShelves, ...nextShelves]);
      setContinuation(page.continuation);
    } finally {
      setLoadingMore(false);
    }
  };

  function TrackShelf({ title, tracks }: { title: string; tracks: Track[] }) {
    if (!tracks.length) return null;
    const items = tracks.map((track) => trackCard(track));
    return <Shelf shelf={{ title, items, style: 'carousel' }} />;
  }

  return (
    <div className="page home-page">
      <DynamicHero tracks={tracks.length ? tracks : recent} />

      <QuickAccess recent={recent.length ? uniqueTracks([...recent, ...tracks]) : tracks} />

      <div className="shelf-stack">
        {personalization.onboardingCompleted ? (
          <>
            {favoriteArtistsCards?.length ? (
              <Shelf
                shelf={{
                  title: t('home.yourFavouriteArtists'),
                  items: favoriteArtistsCards,
                  style: 'grid',
                }}
              />
            ) : null}
            <TrackShelf title={t('home.basedOnYourTaste')} tracks={tasteTracks || []} />
            {similarArtistsCards?.length ? (
              <Shelf
                shelf={{
                  title: t('home.discoverSimilarArtists'),
                  items: similarArtistsCards,
                  style: 'grid',
                }}
              />
            ) : null}
            <TrackShelf title={t('home.recommendedForYou')} tracks={recommendedTracks || []} />
            <TrackShelf title={t('home.trendingInYourGenres')} tracks={trendingTracks || []} />
            {personalizedLoading && (
              <div className="shelf-row" style={{ opacity: 0.5, pointerEvents: 'none' }}>
                <span className="skeleton" style={{ width: 120, height: 20, display: 'inline-block', marginRight: 12 }} />
                <span className="skeleton" style={{ width: 200, height: 16, display: 'inline-block' }} />
              </div>
            )}
          </>
        ) : (
          <>
            {shelves.map((shelf, index) => {
              const isTrending = shelf.title === 'Trendy Right Now' || shelf.title === 'Hot Picks Worldwide';
              return (
                <Shelf
                  key={`${shelf.title}-${index}`}
                  shelf={shelf}
                  row={isTrending}
                  maxItems={isTrending ? 20 : undefined}
                />
              );
            })}
          </>
        )}
      </div>

      {!personalization.onboardingCompleted && (data?.continuation || continuation) ? (
        <div className="load-more-row">
          <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Show more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
