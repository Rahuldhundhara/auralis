import { useState } from 'react';
import { CirclePlay, Loader2, Play } from 'lucide-react';
import type { Card } from '@shared/types';
import { useNavStore } from '../stores/nav';
import { playYouTubePlaylist } from '../lib/youtube';
import { Artwork } from './primitives';

export function YouTubePlaylistCard({ card, onOpen }: { card: Card; onOpen?: (card: Card) => void }) {
  const navigate = useNavStore((state) => state.navigate);
  const [busy, setBusy] = useState(false);

  const open = () => {
    if (onOpen) onOpen(card);
    else navigate({ page: 'playlist', id: card.id });
  };

  const play = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await playYouTubePlaylist(card.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="media-card media-card-grid yt-playlist-card">
      <div className="card-art-wrap">
        <button type="button" className="card-art-button" onClick={open} title={card.title} aria-label={`Open ${card.title}`}>
          <Artwork src={card.thumbnail} alt={card.title} className="card-art" />
        </button>
        <button
          type="button"
          className={`card-play ${busy ? 'is-busy' : ''}`}
          onClick={() => void play()}
          aria-label={`Play ${card.title}`}
          title="Play songs"
        >
          {busy ? <Loader2 size={18} className="spin" /> : <Play size={20} fill="currentColor" />}
        </button>
        <span className="yt-source-badge">
          <CirclePlay size={12} /> YouTube
        </span>
      </div>
      <button type="button" className="card-text" onClick={open}>
        <span className="card-title">{card.title}</span>
        <span className="card-subtitle">
          {card.trackCount ? `${card.trackCount} ${card.trackCount === 1 ? 'song' : 'songs'}` : card.subtitle || 'YouTube Music playlist'}
        </span>
      </button>
    </article>
  );
}
