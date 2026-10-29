import { CirclePlay, Clock3, History, Play, RefreshCw, Shuffle, Trash2 } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { confirmDialog, useUiStore } from '../stores/ui';
import { formatLongDuration, shuffleArray, timeAgo } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { isAndroidShell } from '../lib/platform';
import { Artwork, Button, EmptyState, ErrorPanel, IconButton, PageSkeleton } from '../components/primitives';
import { ShelfGrid } from '../components/MediaCard';
import { TrackList } from '../components/TrackList';

export function RecentPage() {
  const recent = useAppStore((state) => state.library.recent);
  const events = useAppStore((state) => state.library.events);
  const clearRecent = useAppStore((state) => state.clearRecent);
  const session = useAppStore((state) => state.session);
  const navigate = useNavStore((state) => state.navigate);
  const duration = recent.reduce((sum, track) => sum + (track.duration || 0), 0);
  const cover = recent.find((track) => track.thumbnail)?.thumbnail;

  const play = (shuffle = false) => {
    if (!recent.length) return;
    usePlayerStore.getState().playQueue(shuffle ? shuffleArray(recent) : recent, 0);
  };

  const clear = () => {
    confirmDialog({
      title: 'Clear listening history?',
      message: `Recently played songs and play counts will be cleared from this ${isAndroidShell ? 'device' : 'PC'}. Your YouTube Music history is not affected.`,
      confirmLabel: 'Clear history',
      danger: true,
      onConfirm: async () => {
        await clearRecent();
      },
    });
  };

  return (
    <div className="page recent-page">
      <section className="detail-hero detail-hero-recent">
        <div className="detail-hero-bg" style={cover ? { backgroundImage: `url(${cover})` } : undefined} aria-hidden="true" />
        <div className="detail-hero-inner">
          <div className="detail-cover recent-cover">
            <Artwork src={cover} alt="Recently played" className="detail-art" />
            <span className="liked-cover-badge recent-cover-badge">
              <Clock3 size={32} />
            </span>
          </div>
          <div className="detail-copy">
            <span className="eyebrow">Listening history</span>
            <h1>Recently played</h1>
            <p className="detail-description">Pick up exactly where you left off. Auralis keeps your last 100 songs on this {isAndroidShell ? 'device' : 'PC'}.</p>
            <div className="detail-meta">
              <span className="detail-meta-item">{recent.length} songs</span>
              {duration ? (
                <span className="detail-meta-item">
                  <span className="meta-dot" /> {formatLongDuration(duration)}
                </span>
              ) : null}
              {events.length ? (
                <span className="detail-meta-item">
                  <span className="meta-dot" /> {events.length} play events
                </span>
              ) : null}
            </div>
            <div className="detail-actions">
              <Button variant="primary" size="lg" icon={<Play size={19} fill="currentColor" />} onClick={() => play(false)} disabled={!recent.length}>
                Play
              </Button>
              <IconButton label="Shuffle recent songs" size="lg" variant="surface" onClick={() => play(true)} disabled={!recent.length}>
                <Shuffle size={19} />
              </IconButton>
              {session.hasCookies ? (
                <Button variant="outline" icon={<CirclePlay size={17} />} onClick={() => navigate({ page: 'history' })}>
                  YouTube history
                </Button>
              ) : null}
              <IconButton label="Clear history" size="lg" variant="surface" onClick={clear} disabled={!recent.length}>
                <Trash2 size={18} />
              </IconButton>
            </div>
          </div>
        </div>
      </section>

      {recent.length ? (
        <section className="detail-tracks">
          <div className="shelf-list-card">
            <TrackList tracks={recent} showArt showAlbum />
          </div>
          {events.length ? (
            <section className="play-events">
              <div className="section-heading">
                <div>
                  <h2>Recent activity</h2>
                  <span className="section-subtitle">A log of your last plays on this device.</span>
                </div>
              </div>
              <div className="event-list">
                {events.slice(0, 8).map((event, index) => (
                  <div className="event-row" key={`${event.trackId}-${event.playedAt}-${index}`}>
                    <span className="event-date">{timeAgo(event.playedAt)}</span>
                    <span className="event-title">{event.title}</span>
                    <span className="event-artist">{event.artist}</span>
                    <span className={`event-state ${event.completed ? 'is-complete' : ''}`}>
                      {event.completed ? 'Played' : 'Skipped'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </section>
      ) : (
        <EmptyState
          icon={<Clock3 size={28} />}
          title="Nothing played yet"
          message="Songs you play will appear here so you can jump back in."
          action={
            <Button variant="primary" onClick={() => navigate({ page: 'home' })}>
              Go to Home
            </Button>
          }
        />
      )}
    </div>
  );
}

export function HistoryPage() {
  const session = useAppStore((state) => state.session);
  const navigate = useNavStore((state) => state.navigate);
  const openDialog = useUiStore((state) => state.openDialog);
  const { data, loading, error, reload } = useAsync(
    () => (session.hasCookies ? window.auralis.yt.history() : Promise.resolve({ shelves: [] } as Awaited<ReturnType<typeof window.auralis.yt.history>>)),
    [session.hasCookies],
  );

  if (!session.hasCookies) {
    return (
      <EmptyState
        icon={<History size={28} />}
        title="Connect YouTube Music to see your history"
        message="Your account history stays on YouTube. Auralis only reads it to show it here, and never uploads your local activity."
        action={
          <Button variant="primary" icon={<CirclePlay size={16} />} onClick={() => openDialog({ type: 'cookie' })}>
            Sign in
          </Button>
        }
      />
    );
  }

  return (
    <div className="page history-page">
      <header className="page-hero compact-hero">
        <div>
          <span className="eyebrow">
            <History size={14} /> YouTube Music
          </span>
          <h1>Listening history</h1>
          <p>Your recent plays across every device signed in to this account.</p>
        </div>
        <div className="page-hero-actions">
          <Button variant="outline" icon={<RefreshCw size={16} />} onClick={reload} disabled={loading}>
            Refresh
          </Button>
        </div>
      </header>
      {loading && !data ? <PageSkeleton /> : null}
      {error && !data ? <ErrorPanel message={error} retry={reload} /> : null}
      {data?.shelves.length ? <ShelfGrid shelves={data.shelves} /> : null}
      {data && !data.shelves.length && !loading ? (
        <EmptyState
          icon={<History size={26} />}
          title="No history found"
          message="Play something on YouTube Music and it will show up here."
          action={
            <Button variant="primary" onClick={() => navigate({ page: 'explore' })}>
              Explore Auralis
            </Button>
          }
        />
      ) : null}
    </div>
  );
}
