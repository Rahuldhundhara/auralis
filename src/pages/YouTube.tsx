import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CirclePlay,
  Clock3,
  History,
  ListMusic,
  Play,
  RefreshCw,
  Shuffle,
} from 'lucide-react';
import type { Card, Track } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { formatLongDuration, shuffleArray } from '../lib/format';
import { proxiedArtwork } from '../lib/artwork';
import { useAsync } from '../lib/useAsync';
import {
  loadAllYouTubePlaylists,
  loadYouTubeHistory,
  loadYouTubePlaylistSongs,
} from '../lib/youtube';
import { Artwork, Button, EmptyState, ErrorPanel, IconButton, PageSkeleton } from '../components/primitives';
import { TrackList } from '../components/TrackList';
import { YouTubePlaylistCard } from '../components/YouTubePlaylistCard';

export type YouTubeTab = 'history' | 'playlists';

function totalDuration(tracks: Track[]): number {
  return tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
}

function PlayActions({
  tracks,
  onRefresh,
  loading,
}: {
  tracks: Track[];
  onRefresh: () => void;
  loading: boolean;
}) {
  const play = (shuffle: boolean) => {
    if (!tracks.length) return;
    usePlayerStore.getState().playQueue(shuffle ? shuffleArray(tracks) : tracks, 0);
  };
  return (
    <div className="detail-actions">
      <Button
        variant="primary"
        size="lg"
        icon={<Play size={19} fill="currentColor" />}
        onClick={() => play(false)}
        disabled={!tracks.length}
      >
        Play
      </Button>
      <IconButton
        label="Shuffle songs"
        size="lg"
        variant="surface"
        onClick={() => play(true)}
        disabled={!tracks.length}
      >
        <Shuffle size={19} />
      </IconButton>
      <Button variant="outline" icon={<RefreshCw size={16} />} onClick={onRefresh} disabled={loading}>
        Refresh
      </Button>
    </div>
  );
}

function HistoryPanel() {
  const { data, loading, error, reload } = useAsync(() => loadYouTubeHistory(), []);
  const tracks = data || [];
  const cover = tracks.find((track) => track.thumbnail)?.thumbnail;

  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorPanel message={error} retry={reload} />;

  if (!tracks.length) {
    return (
      <EmptyState
        icon={<History size={28} />}
        title="No recent songs found"
        message="YouTube Music returned no songs for this account. Make sure watch history is turned on in YouTube Music, then refresh."
        action={
          <Button variant="outline" icon={<RefreshCw size={16} />} onClick={reload} disabled={loading}>
            Refresh
          </Button>
        }
      />
    );
  }

  return (
    <div className="yt-panel">
      <section className="detail-hero detail-hero-recent">
        <div
          className="detail-hero-bg"
          style={cover ? { backgroundImage: `url(${proxiedArtwork(cover)})` } : undefined}
          aria-hidden="true"
        />
        <div className="detail-hero-inner">
          <div className="detail-cover recent-cover">
            <Artwork src={cover} alt="YouTube Music history" className="detail-art" />
            <span className="liked-cover-badge recent-cover-badge">
              <History size={30} />
            </span>
          </div>
          <div className="detail-copy">
            <span className="eyebrow">
              <CirclePlay size={14} /> YouTube Music history
            </span>
            <h1>Recently played</h1>
            <p className="detail-description">
              Songs from your YouTube Music account, collected here across every device. Videos and episodes are left
              out.
            </p>
            <div className="detail-meta">
              <span className="detail-meta-item">
                {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}
              </span>
              {totalDuration(tracks) ? (
                <span className="detail-meta-item">
                  <span className="meta-dot" /> {formatLongDuration(totalDuration(tracks))}
                </span>
              ) : null}
            </div>
            <PlayActions tracks={tracks} onRefresh={reload} loading={loading} />
          </div>
        </div>
      </section>
      <section className="detail-tracks">
        <div className="shelf-list-card">
          <TrackList tracks={tracks} showArt showAlbum />
        </div>
      </section>
    </div>
  );
}

function PlaylistsPanel({ onOpen }: { onOpen: (card: Card) => void }) {
  const { data, loading, error, reload } = useAsync(() => loadAllYouTubePlaylists(), []);
  const cards = data || [];

  if (loading && !data) return <PageSkeleton />;
  if (error && !data) return <ErrorPanel message={error} retry={reload} />;

  return (
    <div className="yt-panel">
      <div className="section-heading yt-panel-heading">
        <div>
          <h2>Playlists in your account</h2>
          <span className="section-subtitle">
            {cards.length ? `${cards.length} ${cards.length === 1 ? 'playlist' : 'playlists'} from YouTube Music` : 'Every playlist synced from YouTube Music'}
          </span>
        </div>
        <Button variant="outline" size="sm" icon={<RefreshCw size={15} />} onClick={reload} disabled={loading}>
          Refresh
        </Button>
      </div>
      {cards.length ? (
        <div className="media-grid yt-playlist-grid">
          {cards.map((card) => (
            <YouTubePlaylistCard key={card.id} card={card} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<ListMusic size={27} />}
          title="No YouTube playlists yet"
          message="Create a playlist in YouTube Music and it will appear here, right beside your local collections."
        />
      )}
    </div>
  );
}

function PlaylistPanel({ card, onBack }: { card: Card; onBack: () => void }) {
  const { data, loading, error, reload } = useAsync(
    () => loadYouTubePlaylistSongs(card.id),
    [card.id],
    { resetOnChange: true },
  );
  const tracks = data || [];
  const cover = card.thumbnail || tracks.find((track) => track.thumbnail)?.thumbnail;

  if (loading && !data) {
    return (
      <div className="yt-panel">
        <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={onBack}>
          Back to playlists
        </Button>
        <PageSkeleton />
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="yt-panel">
        <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={onBack}>
          Back to playlists
        </Button>
        <ErrorPanel message={error} retry={reload} />
      </div>
    );
  }

  return (
    <div className="yt-panel">
      <div className="yt-panel-back">
        <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={onBack}>
          Back to playlists
        </Button>
      </div>
      <section className="detail-hero detail-hero-recent">
        <div
          className="detail-hero-bg"
          style={cover ? { backgroundImage: `url(${proxiedArtwork(cover)})` } : undefined}
          aria-hidden="true"
        />
        <div className="detail-hero-inner">
          <div className="detail-cover recent-cover">
            <Artwork src={cover} alt={card.title} className="detail-art" />
          </div>
          <div className="detail-copy">
            <span className="eyebrow">
              <CirclePlay size={14} /> YouTube playlist
            </span>
            <h1>{card.title}</h1>
            <p className="detail-description">
              Songs only — videos and podcast episodes from this playlist are not shown here.
            </p>
            <div className="detail-meta">
              <span className="detail-meta-item">
                {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}
              </span>
              {totalDuration(tracks) ? (
                <span className="detail-meta-item">
                  <span className="meta-dot" /> {formatLongDuration(totalDuration(tracks))}
                </span>
              ) : null}
            </div>
            <PlayActions tracks={tracks} onRefresh={reload} loading={loading} />
          </div>
        </div>
      </section>
      {tracks.length ? (
        <section className="detail-tracks">
          <div className="shelf-list-card">
            <TrackList tracks={tracks} showArt showAlbum />
          </div>
        </section>
      ) : (
        <EmptyState
          icon={<ListMusic size={27} />}
          title="No songs in this playlist"
          message="This playlist only contains videos or episodes, so there is nothing to play in Auralis."
        />
      )}
    </div>
  );
}

export function YouTubePage({ tab = 'history' }: { tab?: YouTubeTab }) {
  const session = useAppStore((state) => state.session);
  const navigate = useNavStore((state) => state.navigate);
  const openDialog = useUiStore((state) => state.openDialog);
  const [selected, setSelected] = useState<Card | null>(null);

  useEffect(() => {
    setSelected(null);
  }, [tab]);

  const changeTab = (next: YouTubeTab) => {
    setSelected(null);
    navigate({ page: 'youtube', tab: next }, true);
  };

  if (!session.hasCookies) {
    return (
      <div className="page youtube-page">
        <EmptyState
          icon={<CirclePlay size={28} />}
          title="Sign in to see your YouTube Music"
          message="Your account history and playlists appear here after a quick Google sign-in."
          action={
            <Button variant="primary" icon={<CirclePlay size={16} />} onClick={() => openDialog({ type: 'cookie' })}>
              Sign in
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="page youtube-page">
      <header className="page-hero youtube-hero">
        <div>
          <span className="eyebrow">
            <CirclePlay size={14} /> YouTube Music
          </span>
          <h1>Your YouTube</h1>
          <p>
            {session.account?.name
              ? `Signed in as ${session.account.name}. History and playlists, songs only.`
              : 'History and playlists from your YouTube Music account, songs only.'}
          </p>
        </div>
        {session.account ? (
          <div className="youtube-account-card">
            <Artwork
              src={session.account.thumbnailUrl}
              alt={session.account.name}
              round
              className="youtube-account-avatar"
            />
            <div>
              <strong>{session.account.name}</strong>
              <span>{session.account.channelHandle || 'YouTube Music connected'}</span>
            </div>
          </div>
        ) : null}
      </header>

      <div className="library-tabs yt-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          className={`library-tab ${tab === 'history' ? 'is-active' : ''}`}
          onClick={() => changeTab('history')}
        >
          <Clock3 size={16} /> History
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'playlists'}
          className={`library-tab ${tab === 'playlists' ? 'is-active' : ''}`}
          onClick={() => changeTab('playlists')}
        >
          <ListMusic size={16} /> Playlists
        </button>
      </div>

      {tab === 'history' ? (
        <HistoryPanel />
      ) : selected ? (
        <PlaylistPanel card={selected} onBack={() => setSelected(null)} />
      ) : (
        <PlaylistsPanel onOpen={setSelected} />
      )}
    </div>
  );
}
