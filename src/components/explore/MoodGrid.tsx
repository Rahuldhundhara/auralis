import { ChevronRight } from 'lucide-react';
import type { Card } from '@shared/types';
import { openCard } from '../../lib/actions';

import punjabiPhoto from '../../assets/moods/punjabi.jpg';
import hiphopPhoto from '../../assets/moods/hiphop.jpg';
import edmPhoto from '../../assets/moods/edm.jpg';
import workoutPhoto from '../../assets/moods/workout.jpg';
import chillPhoto from '../../assets/moods/chill.jpg';
import lofiPhoto from '../../assets/moods/lofi.jpg';
import focusPhoto from '../../assets/moods/focus.jpg';
import partyPhoto from '../../assets/moods/party.jpg';
import romanticPhoto from '../../assets/moods/romantic.jpg';
import sadPhoto from '../../assets/moods/sad.jpg';
import drivingPhoto from '../../assets/moods/driving.jpg';
import morningPhoto from '../../assets/moods/morning.webp';
import dholPhoto from '../../assets/moods/dhol.jpg';
import relaxPhoto from '../../assets/moods/relax.jpg';
import feelgoodPhoto from '../../assets/moods/feelgood.jpg';

/**
 * The fifteen curated mood tiles. Every tile links to a real YouTube Music
 * browse endpoint (moods & moments category, captured from the live
 * moods() payload) and uses a bundled photo — no icon-only tiles.
 */
const MOODS_BROWSE_ID = 'FEmusic_moods_and_genres_category';

interface MoodTile {
  key: string;
  title: string;
  subtitle: string;
  /** YouTube Music moods & params for the real browse endpoint. */
  params: string;
  photo: string;
}

export const MOOD_TILES: MoodTile[] = [
  { key: 'punjabi', title: 'Punjabi', subtitle: 'Bhangra, desi pop & dhol', params: 'ggMPOg1uX1ZKNkRodjF2YWxv', photo: punjabiPhoto },
  { key: 'hiphop', title: 'Hip-Hop', subtitle: 'Beats, bars & cyphers', params: 'ggMPOg1uX0M2dmRieXNxTW1s', photo: hiphopPhoto },
  { key: 'edm', title: 'EDM', subtitle: 'Dance & electronic', params: 'ggMPOg1uX1NPTld3SDN3WGs4', photo: edmPhoto },
  { key: 'workout', title: 'Workout / Gym', subtitle: 'Pace for every rep', params: 'ggMPOg1uX09LWkhnTjRGRUJh', photo: workoutPhoto },
  { key: 'chill', title: 'Chill', subtitle: 'Low pressure, easy listening', params: 'ggMPOg1uX1JOQWZFeDByc2Jm', photo: chillPhoto },
  { key: 'lofi', title: 'Lo-fi', subtitle: 'Beats to drift to', params: 'ggMPOg1uX0NvNGNhWThMYWRh', photo: lofiPhoto },
  { key: 'focus', title: 'Focus / Study', subtitle: 'Deep work, zero distractions', params: 'ggMPOg1uX0NvNGNhWThMYWRh', photo: focusPhoto },
  { key: 'party', title: 'Party', subtitle: 'Turn it all the way up', params: 'ggMPOg1uX0pmQ0s2V0JRclZs', photo: partyPhoto },
  { key: 'romantic', title: 'Romantic', subtitle: 'Sunsets & slow dances', params: 'ggMPOg1uX0FzQ2FhZWtUY211', photo: romanticPhoto },
  { key: 'sad', title: 'Sad', subtitle: 'Rainy windows allowed', params: 'ggMPOg1uX0JLQ0gySWZKZVY1', photo: sadPhoto },
  { key: 'driving', title: 'Driving', subtitle: 'Highways & headlights', params: 'ggMPOg1uX044Z2o5WERLckpU', photo: drivingPhoto },
  { key: 'morning', title: 'Morning Energy', subtitle: 'Sunrise momentum', params: 'ggMPOg1uX2lRZUZiMnNrQnJW', photo: morningPhoto },
  { key: 'dhol', title: 'Dhol dhol', subtitle: 'Festival drums, full volume', params: 'ggMPOg1uX1ZKNkRodjF2YWxv', photo: dholPhoto },
  { key: 'relax', title: 'Relaxation', subtitle: 'Unwind and breathe out', params: 'ggMPOg1uX1MxaFQ3Z0JMZkN4', photo: relaxPhoto },
  { key: 'feelgood', title: 'Feel good', subtitle: 'Instant serotonin', params: 'ggMPOg1uXzZQbDB5eThLRTQ3', photo: feelgoodPhoto },
];

export function moodCard(tile: MoodTile): Card {
  return {
    type: 'mood',
    id: tile.key,
    browseId: MOODS_BROWSE_ID,
    params: tile.params,
    title: tile.title,
    subtitle: tile.subtitle,
    thumbnail: tile.photo,
  };
}

export function MoodGrid() {
  return (
    <section className="mood-section" aria-label="Moods and moments">
      <header className="mood-grid-head">
        <div className="mood-grid-head-copy">
          <span className="eyebrow">Browse all</span>
          <h2>Moods &amp; moments</h2>
          <p>Pick a lane — the mix follows the mood.</p>
        </div>
        <span className="mood-count-chip">15 mixes</span>
      </header>
      <div className="mood-grid">
        {MOOD_TILES.map((tile) => {
          const card = moodCard(tile);
          return (
            <button
              type="button"
              key={tile.key}
              className="mood-tile"
              title={`Open ${tile.title}`}
              onClick={() => openCard(card)}
            >
              <img className="mood-tile-photo" src={tile.photo} alt="" loading="lazy" decoding="async" draggable={false} />
              <span className="mood-tile-noise" aria-hidden="true" />
              <span className="mood-tile-shade" aria-hidden="true" />
              <span className="mood-tile-copy">
                <span className="mood-tile-title">{tile.title}</span>
                <span className="mood-tile-subtitle">{tile.subtitle}</span>
              </span>
              <ChevronRight className="mood-tile-chevron" size={17} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
