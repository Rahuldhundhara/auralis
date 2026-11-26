import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  AudioLines,
  ChevronRight,
  Heart,
  ListMusic,
  Pause,
  Play,
  Search,
  Sparkle,
  Sparkles,
} from 'lucide-react';
import type { Card, Shelf as ShelfType, Track } from '@shared/types';
import { useAppStore } from '../stores/app';
import { usePlayerStore } from '../stores/player';
import { taglineForTrack } from '../lib/vibeTagline';
import { useNavStore } from '../stores/nav';
import { toast } from '../stores/ui';
import { useAsync } from '../lib/useAsync';
import { withoutVideos } from '../lib/shelves';
import { fetchPersonalizedTracks } from '../lib/personalized';
import { playCard } from '../lib/actions';
import { EXPLORE_MOODS, type ExploreMood } from '../lib/genres';
import { extractPalette, atmospherePalette, type ArtPalette } from '../lib/artColor';
import { Artwork, Button, ErrorPanel, PageSkeleton } from '../components/primitives';
import { ShelfGrid } from '../components/MediaCard';
import { TrackList } from '../components/TrackList';

const ALBUM_TYPES = new Set(['album', 'single', 'ep']);

function uniqueCards(cards: Card[]): Card[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = card.browseId || card.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shelvesOf(page?: { shelves: ShelfType[] }): ShelfType[] {
  return page ? withoutVideos(page.shelves) : [];
}

function isAlbumLike(card: Card): boolean {
  return ALBUM_TYPES.has(card.type) && !card.round;
}

function episodeTrack(track: Track): Track {
  return { ...track, type: 'episode' };
}

/* -------------------------------------------------------------------------- */
/* Hero helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Split a YouTube Music title into the part that deserves the huge headline
 * and the trailing version / release-context segments. Examples:
 *   "Yeh Awarapan (Amaal Mallik Version)" -> "Yeh Awarapan" + ["Amaal Mallik Version"]
 *   "Kesariya (From "Brahmastra") (Tu Fuljhad...)" -> "Kesariya" + ["From "Brahmastra"", "Tu Fuljhad..."]
 *   "Song - Live" -> "Song" + ["Live"]
 */
function splitTrackTitle(title: string): { primary: string; segments: string[] } {
  const trimmed = title.trim();
  const DASH = /[\u2010-\u2015\u2212-]/;

  /** Extract every balanced top-level parenthetical group. */
  const parentheticals = (text: string): string[] => {
    const groups: string[] = [];
    let index = 0;
    while (index < text.length) {
      if (text[index] !== '(') {
        index += 1;
        continue;
      }
      let depth = 0;
      let end = -1;
      for (let cursor = index; cursor < text.length; cursor += 1) {
        if (text[cursor] === '(') depth += 1;
        else if (text[cursor] === ')') {
          depth -= 1;
          if (depth === 0) {
            end = cursor;
            break;
          }
        }
      }
      if (end < 0) break;
      const content = text.slice(index + 1, end).trim();
      if (content) groups.push(content);
      index = end + 1;
    }
    return groups;
  };

  /** Drop bracketed context from a string, leaving the version words. */
  const withoutParentheses = (text: string): string => {
    let output = '';
    let depth = 0;
    for (const character of text) {
      if (character === '(') depth += 1;
      else if (character === ')') depth = Math.max(0, depth - 1);
      else if (depth === 0) output += character;
    }
    return output.replace(/\s+/g, ' ').trim();
  };

  // A version marker can sit before the first bracket (YTM often formats it as
  // "Song - Version (From "Album")"). Only treat a dash at parenthesis depth
  // zero as a separator; the dash inside "(Tu Fuljhadiyo... - Happy Diwali)"
  // is part of the version name.
  let depth = 0;
  let dashIndex = -1;
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (character === '(') depth += 1;
    else if (character === ')') depth = Math.max(0, depth - 1);
    else if (
      depth === 0 &&
      DASH.test(character) &&
      /\s/.test(trimmed[index - 1] || '') &&
      /\s/.test(trimmed[index + 1] || '')
    ) {
      dashIndex = index;
      break;
    }
  }

  const firstBracket = trimmed.indexOf('(');
  const ends = [firstBracket, dashIndex].filter((index) => index > 0);
  const primaryEnd = ends.length ? Math.min(...ends) : trimmed.length;
  const primary = trimmed.slice(0, primaryEnd).trim();
  const segments = parentheticals(trimmed);

  if (dashIndex > 0) {
    const version = withoutParentheses(trimmed.slice(dashIndex + 1));
    if (version) segments.unshift(version);
  }

  if (primary && segments.length) return { primary, segments };

  // Titles with no bracket or separator still use the full title.
  return { primary: trimmed, segments: [] };
}

/** Titles whose bracket is really release context, not a version name. */
const CONTEXT_SUFFIX = /^(from|feat\.?|ft\.?|with|soundtrack|original motion picture)\b/i;
const GENERIC_ALBUM = /^(single|album|ep|unknown|youtube music|various artists)$/i;

/** Extract `Brahmastra` from `From "Brahmastra"` or `From Brahmastra`. */
function releaseContext(value?: string): string | undefined {
  if (!value) return undefined;
  const quoted = value.match(/From\s+"([^"]+)"/i)?.[1];
  if (quoted) return quoted.trim();
  const bare = value.match(/^From\s+(.+)$/i)?.[1];
  return bare ? bare.replace(/[()]/g, '').trim() : undefined;
}

/* -------------------------------------------------------------------------- */
/* Section header                                                             */
/* -------------------------------------------------------------------------- */

function Section({
  id,
  eyebrow,
  title,
  extra,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="explore-section" id={id}>
      <div className="explore-section-head">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        {extra ? <div className="explore-section-side">{extra}</div> : null}
      </div>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Mood & genre tile                                                          */
/* -------------------------------------------------------------------------- */

function MoodTile({
  mood,
  onOpen,
}: {
  mood: ExploreMood;
  onOpen: (mood: ExploreMood) => void;
}) {
  return (
    <button
      type="button"
      className="explore-mood is-photo"
      style={
        {
          '--mood-from': mood.from,
          '--mood-to': mood.to,
          '--mood-accent': mood.accent,
        } as CSSProperties
      }
      onClick={() => onOpen(mood)}
      aria-label={`Play ${mood.label} music`}
    >
      <span
        className="explore-mood-photo"
        style={{ backgroundImage: `url("${mood.image}")` }}
        aria-hidden="true"
      />
      <span className="explore-mood-copy">
        <strong>{mood.label}</strong>
        <span>{mood.caption}</span>
      </span>
      <ChevronRight size={14} className="explore-mood-arrow" aria-hidden="true" />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Podcast episode card                                                       */
/* -------------------------------------------------------------------------- */

function EpisodeCard({ episode, index }: { episode: Track; index: number }) {
  const playQueue = usePlayerStore((state) => state.playQueue);
  const [busy, setBusy] = useState(false);
  const show = (episode.artists || []).map((artist) => artist.name).filter((name) => name && name.toLowerCase() !== 'episode').join(', ') || 'Podcast';
  const duration = episode.duration || 0;
  const play = async () => {
    setBusy(true);
    try {
      playQueue([episodeTrack(episode)], 0);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      className="explore-episode"
      onClick={() => void play()}
      style={{ '--ep-delay': `${Math.min(index, 8) * 45}ms` } as CSSProperties}
      aria-label={`Play ${episode.title}`}
    >
      <span className="explore-episode-art">
        <Artwork src={episode.thumbnail} alt={episode.title} />
        <span className="explore-episode-play">{busy ? <ListMusic size={17} /> : <Play size={17} fill="currentColor" />}</span>
      </span>
      <span className="explore-episode-copy">
        <strong title={episode.title}>{episode.title}</strong>
        <span className="explore-episode-show">{show}</span>
        <span className="explore-episode-meta">{duration ? `${Math.floor(duration / 60)} min` : 'Episode'}</span>
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

/** `tab` is accepted for backwards compatibility with older navigation
 *  entries (the Explore page is no longer tab-based) and otherwise ignored. */
export function ExplorePage(_props: { tab?: 'explore' | 'charts' | 'new' | 'moods' } = {}) {
  const navigate = useNavStore((state) => state.navigate);
  const navigateEndpoint = useNavStore((state) => state.navigateEndpoint);
  const personalization = useAppStore((state) => state.settings.personalization);
  const playQueue = usePlayerStore((state) => state.playQueue);
  const [mixing, setMixing] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => {
    const settle = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await fn();
      } catch {
        return undefined;
      }
    };
    const gems = await fetchPersonalizedTracks(
      personalization.preferredGenres,
      personalization.favoriteArtists,
    ).catch(() => [] as Track[]);
    // YouTube Music's episodes search filter is misrouted server-side (it
    // returns profiles), so episode cards are drawn from ordinary searches,
    // which are reliable and always carry real artwork.
    const EPISODE_QUERIES = ['the daily', 'podcast', 'lex fridman podcast', 'true crime podcast'];
    const [newPage, moodsPage, albumSearch, ...episodeSearches] = await Promise.all([
      settle(() => window.auralis.yt.newReleases()),
      settle(() => window.auralis.yt.moods()),
      settle(() => window.auralis.yt.search('trending albums', 'albums')),
      ...EPISODE_QUERIES.map((query) => settle(() => window.auralis.yt.search(query))),
    ]);
    return { gems, newPage, moodsPage, albumSearch, episodeSearches: episodeSearches.filter(Boolean) };
  }, [
    personalization.preferredGenres.join('|'),
    (personalization.favoriteArtists || []).map((artist) => artist.id).join('|'),
  ]);

  /** Curated, real data for the sections below. */
  const newAlbums = useMemo(
    () => uniqueCards(shelvesOf(data?.newPage).flatMap((shelf) => shelf.items).filter(isAlbumLike)).slice(0, 12),
    [data?.newPage],
  );
  const trendingAlbums = useMemo(() => {
    const fresh = new Set(newAlbums.map((card) => card.id));
    const fromSearch = uniqueCards(data?.albumSearch?.albums || [])
      .filter(isAlbumLike)
      .filter((card) => !fresh.has(card.id));
    if (fromSearch.length) return fromSearch.slice(0, 12);
    // Fall back to album-like cards in new releases rather than leaving the
    // section empty.
    return [];
  }, [data?.albumSearch, newAlbums]);
  const episodes = useMemo(() => {
    const merged = (data?.episodeSearches || []).flatMap((result) => result?.episodes || []);
    const seen = new Set<string>();
    return merged
      .filter((episode) => episode?.id && episode.title && episode.thumbnail)
      .filter((episode) => {
        if (seen.has(episode.id)) return false;
        seen.add(episode.id);
        return true;
      })
      .slice(0, 10);
  }, [data?.episodeSearches]);
  /** Songs beyond the big charts, picked for the user's taste (language / genre / artists). */
  const gems = useMemo(() => {
    const fromTaste = (data?.gems || [])
      .filter((track) => !track.isVideo)
      .slice(0, 10);
    if (fromTaste.length >= 4) return fromTaste;
    // Fresh profile: fall back to songs from the new releases shelf.
    const freshSongs = uniqueCards(
      shelvesOf(data?.newPage).flatMap((shelf) =>
        shelf.items.filter((card) => card.type === 'song' && card.track),
      ),
    )
      .map((card) => card.track as Track)
      .slice(0, 10);
    return fromTaste.length ? fromTaste : freshSongs;
  }, [data?.gems, data?.newPage]);

  /** Real mood shelf endpoints from the Moods & Genres page, when the title matches. */
  const moodPool = useMemo(
    () =>
      shelvesOf(data?.moodsPage)
        .flatMap((shelf) => shelf.items)
        .filter((card) => card.type === 'mood'),
    [data?.moodsPage],
  );

  /** Hero follows the global player: current track drives the cover, the
   *  title and the mood tagline. Silent fallback keeps the panel alive. */
  const currentTrack = usePlayerStore((state) => state.current);
  const isPlaying = usePlayerStore((state) => state.playing);
  const togglePlayback = usePlayerStore((state) => state.toggle);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const liked = useAppStore((state) => (currentTrack ? state.isLiked(currentTrack.id) : false));
  const heroTitle = currentTrack?.title || 'Auralis Discover';
  const heroEyebrow = currentTrack ? 'Now playing' : 'Featured track';
  // Pick the mood line once per track (plus a hydration-safe signature) so a
  // palette or like-state re-render never swaps the tagline mid-view.
  const taglineKey = currentTrack
    ? `${currentTrack.id}:${currentTrack.title}:${currentTrack.album?.name || ''}:${(currentTrack.artists || [])
        .map((artist) => artist.name)
        .join(',')}`
    : '';
  const [heroTagline, setHeroTagline] = useState(() =>
    currentTrack ? taglineForTrack(currentTrack) : 'Let the music find you.',
  );
  const taglineKeyRef = useRef(taglineKey);
  useEffect(() => {
    if (taglineKeyRef.current === taglineKey) return;
    taglineKeyRef.current = taglineKey;
    setHeroTagline(currentTrack ? taglineForTrack(currentTrack) : 'Let the music find you.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taglineKey]);
  const heroSplit = splitTrackTitle(heroTitle);
  const albumName = currentTrack?.album?.name?.trim();
  const albumContext = releaseContext(albumName);
  const segmentContext = heroSplit.segments.map((segment) => releaseContext(segment)).find(Boolean);
  const heroVersion = heroSplit.segments.find(
    (segment) => !CONTEXT_SUFFIX.test(segment) && !releaseContext(segment),
  );
  const artistLine = (currentTrack?.artists || [])
    .map((artist) => artist.name)
    .filter(Boolean)
    .join(', ');
  const heroSubtitle = heroVersion || artistLine;
  // Prefer the album's own release context. When the album name is the song
  // title (common on YTM singles), the reference design still shows it as the
  // "From ..." line, so keep it rather than dropping useful context.
  const albumLabel =
    albumContext ||
    (albumName && !GENERIC_ALBUM.test(albumName) ? albumName : undefined) ||
    segmentContext;
  const heroAlbum = albumLabel ? `From "${albumLabel}"` : undefined;

  /** The page's ambient glow is tinted by the colours of the current artwork. */
  const [palette, setPalette] = useState<ArtPalette | null>(null);
  const paletteRequest = useRef(0);
  useEffect(() => {
    const request = ++paletteRequest.current;
    if (!currentTrack?.thumbnail) {
      setPalette(null);
      return;
    }
    let alive = true;
    extractPalette(currentTrack.thumbnail).then((next) => {
      if (!alive || paletteRequest.current !== request) return;
      setPalette(next);
    });
    return () => {
      alive = false;
    };
  }, [currentTrack?.id, currentTrack?.thumbnail]);

  /** Layered covers so the hero crossfades from the previous artwork to the
   *  new one on every song change; the superseded layer is unmounted once
   *  the fade completes, so stale artwork never lingers in the DOM. */
  const [artLayers, setArtLayers] = useState<Array<{ src?: string; key: number }>>(() => [
    { src: currentTrack?.thumbnail, key: 0 },
  ]);
  useEffect(() => {
    const src = currentTrack?.thumbnail;
    setArtLayers((prev) => {
      if (prev[prev.length - 1]?.src === src) return prev;
      return [...prev, { src, key: Date.now() }].slice(-2);
    });
    // Drop the superseded layer once the crossfade has finished.
    const timer = window.setTimeout(() => {
      setArtLayers((prev) => (prev.length > 1 ? prev.slice(-1) : prev));
    }, 850);
    return () => window.clearTimeout(timer);
  }, [currentTrack?.id, currentTrack?.thumbnail]);

  /** The page's ambient glow is tinted by the colours of the current artwork.
   *  The raw dominant colour is often a pale, desaturated wash; push it into
   *  a rich, dark atmosphere so the reference's deep green (or amber / blue)
   *  reads clearly against the page. */
  const heroPalette = atmospherePalette(
    palette?.primary ?? { r: 16, g: 185, b: 129 },
  );
  const heroStyle = {
    '--hero-r': heroPalette.primary.r,
    '--hero-g': heroPalette.primary.g,
    '--hero-b': heroPalette.primary.b,
    '--hero2-r': heroPalette.secondary.r,
    '--hero2-g': heroPalette.secondary.g,
    '--hero2-b': heroPalette.secondary.b,
    '--hero-accent-r': heroPalette.accent.r,
    '--hero-accent-g': heroPalette.accent.g,
    '--hero-accent-b': heroPalette.accent.b,
  } as CSSProperties;

  /** Stacked background layers: the new artwork palette fades in over the
   *  previous one instead of snapping between gradient stops. */
  const heroBackground = (
    p: Pick<ArtPalette, 'primary' | 'secondary' | 'accent'>,
  ): CSSProperties => ({
    background: [
      `radial-gradient(120% 150% at 86% 46%, rgba(${p.accent.r}, ${p.accent.g}, ${p.accent.b}, 0.34), transparent 60%)`,
      `radial-gradient(90% 130% at 0% 100%, rgba(${p.primary.r}, ${p.primary.g}, ${p.primary.b}, 0.36), transparent 64%)`,
      'linear-gradient(135deg, #050b09 0%, #07130f 46%, #04100c 100%)',
    ].join(', '),
  });
  const bgKey = [
    heroPalette.primary.r, heroPalette.primary.g, heroPalette.primary.b,
    heroPalette.accent.r, heroPalette.accent.g, heroPalette.accent.b,
  ].join('-');
  const [bgLayers, setBgLayers] = useState<Array<{ key: string; style: CSSProperties }>>(() => [
    { key: 'initial', style: heroBackground(atmospherePalette({ r: 16, g: 185, b: 129 })) },
  ]);
  useEffect(() => {
    setBgLayers((prev) => {
      if (prev[prev.length - 1]?.key === bgKey) return prev;
      return [...prev, { key: bgKey, style: heroBackground(heroPalette) }].slice(-2);
    });
    const timer = window.setTimeout(() => {
      setBgLayers((prev) => (prev.length > 1 ? prev.slice(-1) : prev));
    }, 950);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgKey]);

  const queueCurrent = () => {
    if (!currentTrack) return;
    addToQueue(currentTrack);
    toast('Added to queue.', 'success');
  };

  const likeCurrent = () => {
    if (!currentTrack) return;
    void useAppStore
      .getState()
      .toggleLike(currentTrack)
      .then((next) => toast(next ? 'Added to liked songs.' : 'Removed from liked songs.', 'success'))
      .catch((error: any) => toast(`Could not update liked songs: ${error?.message || error}`, 'error'));
  };

  const toggleHeroPlayback = () => {
    if (currentTrack) {
      void togglePlayback();
      return;
    }
    void playMyMix();
  };

  const openMood = (mood: ExploreMood) => {
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const match = moodPool.find((card) => {
      const hay = normalize(`${card.title} ${card.subtitle || ''}`);
      return mood.keywords.some((keyword) => hay.includes(normalize(keyword)));
    });
    if (match?.browseId) {
      navigateEndpoint({ browseId: match.browseId, params: match.params }, `${mood.label} music`);
    } else {
      navigate({ page: 'search', q: mood.query });
    }
  };

  const playMyMix = async () => {
    if (!gems.length && !newAlbums.length) return;
    setMixing(true);
    try {
      if (gems.length) {
        playQueue(gems, 0);
        return;
      }
      const first = newAlbums[0];
      if (first) await playCard(first);
    } finally {
      setMixing(false);
    }
  };

  const gemsCaption = personalization.preferredGenres?.length
    ? `Because you listen to ${personalization.preferredGenres.slice(0, 2).join(' & ')}`
    : 'Fresh picks beyond the charts';

  return (
    <div className="page explore-page" style={heroStyle}>
      {/* --------------------------------------------- Featured hero */}
      <header className="explore-feature">
        {/* Artwork-tinted atmosphere, crossfaded on every track change. */}
        {bgLayers.map((layer) => (
          <span key={layer.key} className="explore-feature-bg" style={layer.style} aria-hidden="true" />
        ))}
        <span className="explore-feature-edge" aria-hidden="true" />

        <div className="explore-feature-copy">
          <span className="explore-feature-eyebrow">
            <AudioLines size={18} strokeWidth={2.4} className="explore-feature-eyebrow-icon" aria-hidden="true" />
            {heroEyebrow}
            <i className="explore-feature-dot" aria-hidden="true" />
          </span>
          <p className="explore-feature-tagline">{heroTagline}</p>
          <h1>{heroSplit.primary}</h1>
          {heroSubtitle ? <p className="explore-feature-version">{heroSubtitle}</p> : null}
          {heroAlbum ? <p className="explore-feature-album">({heroAlbum})</p> : null}
          <div className="explore-feature-actions">
            <button
              type="button"
              className="explore-feature-play"
              onClick={toggleHeroPlayback}
              disabled={mixing}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              data-playing={isPlaying ? 'true' : 'false'}
            >
              {isPlaying ? (
                <Pause size={20} fill="currentColor" strokeWidth={0} />
              ) : (
                <Play size={20} fill="currentColor" strokeWidth={0} />
              )}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>
            <div className="explore-feature-secondary">
              <button
                type="button"
                className="explore-feature-queue"
                onClick={queueCurrent}
                disabled={!currentTrack}
              >
                Add to Queue
              </button>
              <span className="explore-feature-divider" aria-hidden="true" />
              <button
                type="button"
                className={`explore-feature-like ${liked ? 'is-liked' : ''}`}
                onClick={likeCurrent}
                disabled={!currentTrack}
                aria-label={liked ? 'Remove from liked songs' : 'Add to liked songs'}
                aria-pressed={liked}
              >
                <Heart size={19} fill={liked ? 'currentColor' : 'none'} strokeWidth={1.8} />
              </button>
            </div>
          </div>
        </div>

        <div className="explore-feature-art" aria-hidden="true">
          <span className="explore-feature-halo" />
          <div className="explore-fan">
            <div className="explore-fan-frame is-back">
              <Artwork
                src={currentTrack?.thumbnail}
                alt={currentTrack?.title || 'Auralis Discover'}
                className="explore-fan-art"
              />
            </div>
            <div className="explore-fan-frame is-mid">
              <Artwork
                src={currentTrack?.thumbnail}
                alt={currentTrack?.title || 'Auralis Discover'}
                className="explore-fan-art"
              />
            </div>
            <div className="explore-fan-frame is-front">
              <span className="explore-fan-cover">
                {artLayers.map((layer) => (
                  <Artwork
                    key={layer.key}
                    src={layer.src}
                    alt={currentTrack?.title || 'Auralis Discover'}
                    className="explore-feature-cover-art"
                    eager
                  />
                ))}
              </span>
            </div>
          </div>
        </div>

        <Sparkle className="explore-feature-sparkle" size={24} aria-hidden="true" />
      </header>

      {/* ------------------------------------------- Pick your mood */}
      <Section
        eyebrow="Pick your mood"
        title="Music for every moment"
        extra={<span className="explore-count">{EXPLORE_MOODS.length} mixes</span>}
      >
        <div className="explore-mood-grid">
          {EXPLORE_MOODS.map((mood) => (
            <MoodTile key={mood.id} mood={mood} onOpen={openMood} />
          ))}
        </div>
      </Section>

      {loading && !data ? <PageSkeleton /> : null}
      {error && !data ? <ErrorPanel message={error || 'Could not load Explore.'} retry={reload} /> : null}

      {/* --------------------------------------- New Albums & Singles */}
      {newAlbums.length ? (
        <Section
          id="explore-new"
          eyebrow="New albums & singles"
          title="Fresh off the studio"
          extra={
            <button type="button" className="explore-pill-link" onClick={() => navigate({ page: 'search', q: 'new releases albums singles' })}>
              See more <ChevronRight size={13} />
            </button>
          }
        >
          <ShelfGrid shelves={[{ title: '', items: newAlbums, style: 'grid' }]} />
        </Section>
      ) : null}

      {/* ---------------------------------------------- Trending Albums */}
      {trendingAlbums.length ? (
        <Section
          eyebrow="Trending now"
          title="Trending albums"
          extra={
            <button type="button" className="explore-pill-link" onClick={() => navigate({ page: 'search', q: 'trending albums' })}>
              See more <ChevronRight size={13} />
            </button>
          }
        >
          <ShelfGrid shelves={[{ title: '', items: trendingAlbums, style: 'grid' }]} />
        </Section>
      ) : null}

      {/* -------------------------------------- Popular podcast episodes */}
      {episodes.length ? (
        <Section
          eyebrow="Popular podcast episodes"
          title="Episodes worth your time"
          extra={
            <button type="button" className="explore-pill-link" onClick={() => navigate({ page: 'podcasts' })}>
              All podcasts <ChevronRight size={13} />
            </button>
          }
        >
          <div className="explore-episode-row" role="list">
            {episodes.map((episode, index) => (
              <EpisodeCard key={episode.id} episode={episode} index={index} />
            ))}
          </div>
        </Section>
      ) : null}

      {/* -------------------------------------- Hidden gems / taste picks */}
      {gems.length ? (
        <Section
          eyebrow="Hidden gems"
          title="Worth discovering"
          extra={
            <span className="explore-gem-caption">
              <Sparkles size={12} /> {gemsCaption}
            </span>
          }
        >
          <div className="explore-gems">
            <TrackList tracks={gems} showArt showAlbum={false} compact radioOnPlay prefetchFirst={false} />
          </div>
        </Section>
      ) : null}

      {/* Empty state */}
      {data && !newAlbums.length && !trendingAlbums.length && !episodes.length && !gems.length ? (
        <div className="explore-empty">
          <Search size={26} />
          <h2>Nothing to show right now</h2>
          <p>Your connection may be limiting the music catalogue. Try refreshing.</p>
          <Button variant="outline" onClick={reload}>
            Refresh
          </Button>
        </div>
      ) : null}
    </div>
  );
}
