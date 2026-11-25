import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { GENRES, genreVisual } from '../lib/genres';

export function GenreGrid({
  selected,
  onToggle,
  genres = GENRES,
  compact = false,
}: {
  selected: string[];
  onToggle: (genre: string) => void;
  genres?: readonly string[];
  compact?: boolean;
}) {
  return (
    <div className={`genre-grid ${compact ? 'is-compact' : ''}`} role="group" aria-label="Genres">
      {genres.map((genre) => {
        const active = selected.includes(genre);
        const visual = genreVisual(genre);
        const Icon = visual.icon;
        return (
          <button
            key={genre}
            type="button"
            className={`genre-card ${active ? 'is-active' : ''}`}
            style={
              {
                '--genre-from': visual.from,
                '--genre-to': visual.to,
                '--genre-accent': visual.accent,
              } as CSSProperties
            }
            onClick={() => onToggle(genre)}
            aria-pressed={active}
          >
            <span className="genre-card-glow" aria-hidden="true" />
            <span className="genre-card-pattern" aria-hidden="true" />
            <span className="genre-card-art" aria-hidden="true">
              <Icon size={compact ? 22 : 30} strokeWidth={1.55} />
            </span>
            <span className="genre-card-copy">
              <span className="genre-card-name">{genre}</span>
              <span className="genre-card-caption">{active ? 'Selected' : 'Add to your taste'}</span>
            </span>
            <span className="genre-card-check" aria-hidden="true">
              {active ? <Check size={12} strokeWidth={3} /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
