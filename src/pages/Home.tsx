import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, Radio, RotateCw } from 'lucide-react';
import type { Card, Shelf as ShelfType, Track } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { toast } from '../stores/ui';
import { formatDuration, shuffleArray } from '../lib/format';
import { THOUGHT_INTERVAL_MS, heroThought, thoughtBucket, type HeroThought } from '../lib/heroThought';
import { heroCopy, paletteVars, useHeroPalette } from '../lib/hero';
import { proxiedArtwork } from '../lib/artwork';
import { curateRadioTracks, discoverSeed, onRepeatMix, tasteProfile, trackKey } from '../lib/taste';
import { languageSummary, artistMeta } from '../lib/onboarding';
import { useAsync } from '../lib/useAsync';
import { tracksFromPage } from '../lib/actions';
import { Artwork, Button, ErrorPanel, IconButton, PageSkeleton } from '../components/primitives';
import { Shelf } from '../components/MediaCard';

/** Artists chosen in onboarding, kept as a real shelf of channel cards. */
function YourArtists() {
  const artists = useAppStore((state) => state.settings.tasteArtists);
  const languages = useAppStore((state) => state.settings.tasteLanguages);

  if (!artists?.length) return null;

  const labels = languageSummary(languages ?? []);
  const items: Card[] = artists.map((artist) => ({
    type: 'artist',
    id: artist.id,
    browseId: artist.id,
    title: artist.name,
    subtitle: artistMeta(artist.subtitle),
    thumbnail: artist.thumbnail,
    round: true,
  }));
  const count = `${artists.length} ${artists.length === 1 ? 'artist' : 'artists'}`;
  const subtitle = labels ? `${count} picked from ${labels}` : `${count} picked for your Home shelf`;

  return <Shelf shelf={{ title: 'Your artists', subtitle, items }} />;
}

/** Re-render the thought exactly when the ten-minute slot turns over. */
function useThoughtBucket() {
  const [bucket, setBucket] = useState(() => thoughtBucket());
  useEffect(() => {
    let timer = 0;
    const sync = () => setBucket(thoughtBucket());
    const schedule = () => {
      const delay = THOUGHT_INTERVAL_MS - (Date.now() % THOUGHT_INTERVAL_MS) + 200;
      timer = window.setTimeout(() => {
        sync();
        schedule();
      }, delay);
    };
    schedule();
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);
  return bucket;
}

function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 23) return 'Good evening';
  return 'Still up?';
}

/**
 * The dynamic home hero. The whole stage follows the current track:
 * backdrop, artwork and accent palette crossfade on every change, and the
 * idle state keeps its own voice so it never looks broken.
 */
function HomeVibeStage({ thought, heroTrack }: { thought: HeroThought; heroTrack?: Track }) {
  const current = usePlayerStore((state) => state.current);
  const playing = usePlayerStore((state) => state.playing);
  const radioMode = usePlayerStore((state) => state.radio);
  const toggle = usePlayerStore((state) => state.toggle);
  const startRadio = usePlayerStore((state) => state.startRadio);
  const navigate = useNavStore((state) => state.navigate);
  const liked = useAppStore((state) => state.library.liked);
  const recent = useAppStore((state) => state.library.recent);

  const art = proxiedArtwork(current?.thumbnail);
  const palette = useHeroPalette(art);
  const copy = heroCopy(current);

  const tagline = current
    ? playing
      ? radioMode
        ? 'Live radio · no plan'
        : 'Now in rotation'
      : 'Paused, mood intact'
    : 'Ready when you are';
  const title = current ? copy.title : greetingFor(new Date().getHours());
  const artistsLine = current ? copy.artists : thought.text;
  const albumLine = current ? copy.album : undefined;

  const shuffleLibrary = () => {
    const pool = liked.length ? liked : recent;
    if (!pool.length) {
      navigate({ page: 'explore' });
      return;
    }
    usePlayerStore.getState().playQueue(shuffleArray(pool), 0);
  };

  return (
    <section
      className={`home-vibe-stage ${current ? 'is-live' : 'is-idle'}`}
      style={paletteVars(palette)}
      aria-label="Listening now"
    >
      <div className="vibe-backdrop" aria-hidden="true">
        {art ? <img key={art} src={art} alt="" decoding="async" draggable={false} /> : null}
      </div>
      <span className="vibe-glow" aria-hidden="true" />
      <div className="vibe-row">
        <div className="vibe-art">
          {art ? (
            <img key={art} src={art} alt={current?.title || ''} decoding="async" draggable={false} />
          ) : (
            <img src="./icon.png" alt="" draggable={false} />
          )}
        </div>
        <div className="vibe-copy">
          <p className="vibe-tagline">{tagline}</p>
          <h1 className="vibe-title" title={title}>
            {title}
          </h1>
          <p className="vibe-artists" title={artistsLine}>
            {artistsLine || 'YouTube Music'}
          </p>
          {albumLine ? <p className="vibe-album">From &ldquo;{albumLine}&rdquo;</p> : null}
          <div className="vibe-actions">
            <button
              type="button"
              className="vibe-play"
              onClick={() => (current ? toggle() : shuffleLibrary())}
              title={current ? undefined : 'Shuffle library'}
            >
              {current && playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
              {current && playing ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              className="vibe-radio"
              onClick={() => {
                if (current) startRadio(current);
                else if (heroTrack) startRadio(heroTrack);
                else navigate({ page: 'explore' });
              }}
            >
              <Radio size={16} />
              Start radio
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Playable song cards for the locally built shelves. */
function cardsForShelf(tracks: Track[]): Card[] {
  return tracks.map((track) => ({
    type: track.type,
    id: track.id,
    title: track.title,
    subtitle: track.artists.map((artist) => artist.name).join(', '),
    thumbnail: track.thumbnail,
    track,
    artists: track.artists,
  }));
}

/** Home revisits reuse the daily mix instead of refetching radio. */
const DISCOVER_TTL_MS = 30 * 60 * 1000;
let discoverCache: { shelf: ShelfType; at: number } | null = null;

/**
 * "Made for you": Spotify-style shelves built from Auralis's own play
 * signals. "On repeat" is instant (library data); "Discover mix" fetches
 * the real YouTube radio for a rotating taste seed and keeps only songs
 * the listener has never played.
 */
function MadeForYou() {
  const library = useAppStore((state) => state.library);
  const [discover, setDiscover] = useState<ShelfType | null>(() =>
    discoverCache && Date.now() - discoverCache.at < DISCOVER_TTL_MS ? discoverCache.shelf : null,
  );
  const [loading, setLoading] = useState(false);

  const profile = useMemo(() => tasteProfile(library), [library]);
  const repeat = onRepeatMix(profile);

  useEffect(() => {
    if (discover || loading) return;
    const seed = discoverSeed(profile);
    if (!seed) return;
    setLoading(true);
    void (async () => {
      try {
        const result = await window.auralis.yt.next({ videoId: seed.id, playlistId: `RDAMVM${seed.id}` });
        const fresh = curateRadioTracks(result.tracks, profile)
          .filter((track) => !profile.playedKeys.has(trackKey(track)))
          .slice(0, 12);
        if (fresh.length < 6) return;
        const shelf: ShelfType = {
          title: 'Discover mix',
          subtitle: 'New picks from your taste, refreshed daily',
          items: cardsForShelf(fresh),
        };
        discoverCache = { shelf, at: Date.now() };
        setDiscover(shelf);
      } catch {
        // The mix is optional chrome; a failed fetch keeps Home clean.
      } finally {
        setLoading(false);
      }
    })();
  }, [profile, discover, loading]);

  if (!repeat && !discover) return null;

  return (
    <div className="made-for-you">
      {repeat ? <Shelf shelf={{ title: repeat.title, subtitle: repeat.subtitle, items: cardsForShelf(repeat.tracks) }} /> : null}
      {discover ? <Shelf shelf={discover} /> : null}
    </div>
  );
}

/** Jump Back In: the last handful of real plays, refreshed from the library. */
function QuickAccess() {
  const recentAll = useAppStore((state) => state.library.recent);
  const refreshLibrary = useAppStore((state) => state.refreshLibrary);
  const navigate = useNavStore((state) => state.navigate);
  const [refreshing, setRefreshing] = useState(false);
  const recent = recentAll.slice(0, 6);

  if (!recent.length) return null;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshLibrary();
    } catch {
      toast('Could not refresh recents just now.', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section className="quick-access">
      <div className="section-heading quick-heading">
        <div className="quick-heading-copy">
          <div className="quick-title-row">
            <h2>Jump back in</h2>
            <span className="quick-chip">Recent</span>
          </div>
          <p className="quick-subtitle">Pick up right where you left your headphones.</p>
        </div>
        <div className="quick-heading-actions">
          <IconButton
            label={refreshing ? 'Refreshing…' : 'Refresh recents'}
            size="sm"
            variant="surface"
            onClick={() => void refresh()}
          >
            <RotateCw size={15} className={refreshing ? 'is-spinning' : ''} />
          </IconButton>
          <button type="button" className="text-button" onClick={() => navigate({ page: 'recent' })}>
            See all ({recentAll.length})
          </button>
        </div>
      </div>
      <div className="quick-grid">
        {recent.map((track, index) => (
          <button
            type="button"
            key={track.id}
            className="quick-card"
            title={`${track.title} — ${track.artists.map((artist) => artist.name).join(', ') || 'YouTube Music'}`}
            onClick={() => usePlayerStore.getState().playQueue(recent, index)}
          >
            <Artwork src={track.thumbnail} alt={track.title} className="quick-art" />
            <span className="quick-text">
              <span className="quick-title">{track.title}</span>
              <span className="quick-artist">
                {track.duration > 0 ? <span className="quick-duration">{formatDuration(track.duration)}</span> : null}
                {track.duration > 0 && track.artists.length ? <span aria-hidden="true"> · </span> : null}
                {track.artists.map((artist) => artist.name).join(', ') || track.album?.name || 'YouTube Music'}
              </span>
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
  const thoughtSlot = useThoughtBucket();
  const currentTrack = usePlayerStore((state) => state.current);
  const playing = usePlayerStore((state) => state.playing);
  const radioMode = usePlayerStore((state) => state.radio);
  const thought = heroThought({
    bucket: thoughtSlot,
    title: currentTrack?.title,
    artist: currentTrack?.artists[0]?.name,
    playing: Boolean(currentTrack && playing),
    paused: Boolean(currentTrack && !playing),
    radio: radioMode || Boolean(currentTrack?.radio),
    local: Boolean(currentTrack?.localPath) || currentTrack?.source === 'local',
  });

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

  return (
    <div className="page home-page">
      <HomeVibeStage thought={thought} heroTrack={tracks[0]} />

      <YourArtists />

      <QuickAccess />

      <MadeForYou />

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
