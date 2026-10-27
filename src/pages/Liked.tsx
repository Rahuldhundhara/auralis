import { useState } from 'react';
import { Download, Heart, Play, Shuffle } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { confirmDialog, toast } from '../stores/ui';
import { formatLongDuration, shuffleArray } from '../lib/format';
import { Artwork, Button, EmptyState, IconButton, Spinner } from '../components/primitives';
import { TrackList } from '../components/TrackList';

export function LikedPage() {
  const liked = useAppStore((state) => state.library.liked);
  const refreshLibrary = useAppStore((state) => state.refreshLibrary);
  const navigate = useNavStore((state) => state.navigate);
  const [downloading, setDownloading] = useState<string | undefined>();
  const duration = liked.reduce((sum, track) => sum + (track.duration || 0), 0);
  const cover = liked.find((track) => track.thumbnail)?.thumbnail;

  const play = (shuffle = false) => {
    if (!liked.length) return;
    usePlayerStore.getState().playQueue(shuffle ? shuffleArray(liked) : liked, 0);
  };

  const downloadAll = () => {
    const done = new Set(useAppStore.getState().library.downloads.filter((item) => item.status === 'done').map((item) => item.track.id));
    const pending = liked.filter((track) => !done.has(track.id));
    if (!pending.length) {
      toast('All liked songs are already downloaded.', 'info');
      return;
    }
    const run = async () => {
      let completed = 0;
      let failed = 0;
      for (let index = 0; index < pending.length; index++) {
        setDownloading(`${index + 1}/${pending.length}`);
        try {
          const item = await window.auralis.player.download(pending[index]);
          if (item.status === 'done') completed++;
          else if (item.status === 'paused') break;
          else failed++;
        } catch {
          failed++;
        }
      }
      setDownloading(undefined);
      await refreshLibrary();
      toast(failed ? `Downloaded ${completed}; ${failed} failed.` : `Downloaded ${completed} songs.`, failed ? 'error' : 'success');
    };
    if (pending.length > 3) {
      confirmDialog({
        title: `Download ${pending.length} liked songs?`,
        message: 'They will be saved to your downloads folder for offline listening.',
        confirmLabel: 'Start download',
        onConfirm: run,
      });
    } else {
      void run();
    }
  };

  return (
    <div className="page liked-page">
      <section className="detail-hero detail-hero-liked">
        <div className="detail-hero-bg" style={cover ? { backgroundImage: `url(${cover})` } : undefined} aria-hidden="true" />
        <div className="detail-hero-inner">
          <div className="detail-cover liked-cover">
            <Artwork src={cover} alt="Liked songs" className="detail-art" />
            <span className="liked-cover-badge">
              <Heart size={34} fill="currentColor" />
            </span>
          </div>
          <div className="detail-copy">
            <span className="eyebrow">Your collection</span>
            <h1>Liked songs</h1>
            <p className="detail-description">Every song you loved, in one place. New likes appear here instantly.</p>
            <div className="detail-meta">
              <span className="detail-meta-item">{liked.length} songs</span>
              {duration ? (
                <span className="detail-meta-item">
                  <span className="meta-dot" /> {formatLongDuration(duration)}
                </span>
              ) : null}
            </div>
            <div className="detail-actions">
              <Button variant="primary" size="lg" icon={<Play size={19} fill="currentColor" />} onClick={() => play(false)} disabled={!liked.length}>
                Play
              </Button>
              <IconButton label="Shuffle liked songs" size="lg" variant="surface" onClick={() => play(true)} disabled={!liked.length}>
                <Shuffle size={19} />
              </IconButton>
              <Button
                variant="outline"
                icon={downloading ? <Spinner size={16} /> : <Download size={17} />}
                onClick={downloadAll}
                disabled={!liked.length || Boolean(downloading)}
              >
                {downloading ? `Downloading ${downloading}` : 'Download all'}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {liked.length ? (
        <section className="detail-tracks">
          <div className="shelf-list-card">
            <TrackList tracks={liked} showArt showAlbum />
          </div>
        </section>
      ) : (
        <EmptyState
          icon={<Heart size={28} />}
          title="Songs you like will live here"
          message="Tap the heart on any track, or press L while a song is playing. Your likes sync with YouTube Music when signed in."
          action={
            <Button variant="primary" onClick={() => navigate({ page: 'explore' })}>
              Discover music
            </Button>
          }
        />
      )}
    </div>
  );
}
