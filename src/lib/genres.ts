import {
  AudioLines,
  Brain,
  CarFront,
  Church,
  Clapperboard,
  CloudRain,
  Coffee,
  Drum,
  Dumbbell,
  Flame,
  Flower2,
  Globe2,
  Guitar,
  HandHeart,
  Heart,
  Mic2,
  Mountain,
  Music,
  Music2,
  Palmtree,
  PartyPopper,
  Piano,
  Sparkles,
  Sprout,
  Smile,
  Star,
  Sun,
  Waves,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import punjabiArt from '../assets/moods/punjabi.jpg';
import hiphopArt from '../assets/moods/hiphop.jpg';
import edmArt from '../assets/moods/edm.jpg';
import workoutArt from '../assets/moods/workout.jpg';
import chillArt from '../assets/moods/chill.jpg';
import lofiArt from '../assets/moods/lofi.jpg';
import focusArt from '../assets/moods/focus.jpg';
import partyArt from '../assets/moods/party.jpg';
import romanticArt from '../assets/moods/romantic.jpg';
import sadArt from '../assets/moods/sad.jpg';
import drivingArt from '../assets/moods/driving.jpg';
import morningArt from '../assets/moods/morning.jpg';
import dholArt from '../assets/moods/dhol.jpg';
import relaxArt from '../assets/moods/relax.jpg';
import feelgoodArt from '../assets/moods/feelgood.jpg';

export interface GenreVisual {
  from: string;
  to: string;
  accent: string;
  icon: LucideIcon;
}

/** The genres offered in onboarding and Customize Your Taste. */
export const GENRES = [
  'Pop', 'Bollywood', 'Hip-Hop', 'Classical', 'Rock', 'Indie', 'EDM', 'Punjabi', 'Romantic', 'Lo-fi',
  'Jazz', 'Country', 'Metal', 'Reggae', 'Folk', 'K-Pop', 'Afrobeats', 'Latin', 'Gospel', 'R&B', 'Sad',
] as const;

export type Genre = (typeof GENRES)[number];

const DEFAULT_VISUAL: GenreVisual = {
  from: '#0f172a',
  to: '#334155',
  accent: '#94a3b8',
  icon: Music,
};

/** Each genre gets its own palette and illustration so the cards never look
 *  like a repeated template. */
export const GENRE_VISUALS: Record<string, GenreVisual> = {
  Pop: { from: '#20081a', to: '#2e0f26', accent: '#fbcfe8', icon: Sparkles },
  Bollywood: { from: '#431407', to: '#ea580c', accent: '#fed7aa', icon: Clapperboard },
  'Hip-Hop': { from: '#171129', to: '#211637', accent: '#ddd6fe', icon: Mic2 },
  Classical: { from: '#081c1c', to: '#0f2a28', accent: '#99f6e4', icon: Piano },
  Rock: { from: '#450a0a', to: '#b91c1c', accent: '#fecaca', icon: Guitar },
  Indie: { from: '#022c22', to: '#047857', accent: '#a7f3d0', icon: Sprout },
  EDM: { from: '#0d1626', to: '#152038', accent: '#bfdbfe', icon: Zap },
  Punjabi: { from: '#1d130b', to: '#2e1a0d', accent: '#fde68a', icon: Drum },
  Romantic: { from: '#4c0519', to: '#be123c', accent: '#fecdd3', icon: Heart },
  'Lo-fi': { from: '#0d1220', to: '#1a2233', accent: '#cbd5e1', icon: Coffee },
  Jazz: { from: '#3b0764', to: '#7e22ce', accent: '#e9d5ff', icon: Music2 },
  Country: { from: '#201a06', to: '#2b2408', accent: '#fef08a', icon: Mountain },
  Metal: { from: '#09090b', to: '#3f3f46', accent: '#d4d4d8', icon: Flame },
  Reggae: { from: '#052e16', to: '#16a34a', accent: '#bbf7d0', icon: Palmtree },
  Folk: { from: '#292524', to: '#a16207', accent: '#fde68a', icon: Flower2 },
  'K-Pop': { from: '#500724', to: '#e11d48', accent: '#fecdd3', icon: Star },
  Afrobeats: { from: '#042f2e', to: '#d97706', accent: '#fde68a', icon: Waves },
  Latin: { from: '#450a0a', to: '#f97316', accent: '#fed7aa', icon: Globe2 },
  Gospel: { from: '#211a06', to: '#2d250c', accent: '#fef9c3', icon: Church },
  'R&B': { from: '#3b0764', to: '#c026d3', accent: '#f5d0fe', icon: AudioLines },
  Sad: { from: '#0f172a', to: '#64748b', accent: '#cbd5e1', icon: CloudRain },
};

export function genreVisual(genre: string): GenreVisual {
  return GENRE_VISUALS[genre] || { ...DEFAULT_VISUAL, icon: HandHeart };
}

/** Curated mood & activity tiles for the redesigned Explore page. Each tile
 *  opens a real YTM mood/genre shelf (resolved from the moods endpoint when
 *  available) or a real search otherwise — never a fake destination. */
export interface ExploreMood {
  id: string;
  label: string;
  caption: string;
  query: string;
  keywords: string[];
  from: string;
  to: string;
  accent: string;
  icon: LucideIcon;
  /**
   * Decorative category cover art (never song artwork). It is bundled with
   * the app so the Explore grid paints instantly and never depends on a
   * third-party image host.
   */
  image: string;
}

export const EXPLORE_MOODS: ExploreMood[] = [
  {
    id: 'punjabi', label: 'Punjabi', caption: 'Bhangra & anthems', query: 'punjabi songs',
    keywords: ['punjabi'], from: '#1a1208', to: '#241a0b', accent: '#fde68a', icon: Drum,
    image: punjabiArt,
  },
  {
    id: 'hiphop', label: 'Hip-Hop', caption: 'Bars & beats', query: 'hip hop songs',
    keywords: ['hiphop', 'hip', 'rap'], from: '#08130f', to: '#0c1f18', accent: '#a7f3d0', icon: Mic2,
    image: hiphopArt,
  },
  {
    id: 'edm', label: 'EDM', caption: 'Peak-time energy', query: 'edm dance music',
    keywords: ['edm', 'electronic', 'dance', 'techno', 'house'], from: '#06140f', to: '#0a2019', accent: '#86efac', icon: Zap,
    image: edmArt,
  },
  {
    id: 'gym', label: 'Workout / Gym', caption: 'Push the last rep', query: 'workout gym music',
    keywords: ['workout', 'gym', 'exercise', 'fitness', 'motivation'], from: '#1a0d08', to: '#24130b', accent: '#fed7aa', icon: Dumbbell,
    image: workoutArt,
  },
  {
    id: 'chill', label: 'Chill', caption: 'Slow it right down', query: 'chill music',
    keywords: ['chill', 'chillout'], from: '#07130f', to: '#0a1e1a', accent: '#99f6e4', icon: Waves,
    image: chillArt,
  },
  {
    id: 'lofi', label: 'Lo-fi', caption: 'Coffee & headphones', query: 'lo-fi hip hop',
    keywords: ['lofi', 'lo', 'study'], from: '#1b1208', to: '#241809', accent: '#f5c98a', icon: Coffee,
    image: lofiArt,
  },
  {
    id: 'focus', label: 'Focus / Study', caption: 'Deep concentration', query: 'focus study music',
    keywords: ['focus', 'study', 'concentration', 'ambient'], from: '#06140f', to: '#0a2019', accent: '#6ee7b7', icon: Brain,
    image: focusArt,
  },
  {
    id: 'party', label: 'Party', caption: 'Dance until sunrise', query: 'party hits',
    keywords: ['party'], from: '#170b10', to: '#221018', accent: '#fbcfe8', icon: PartyPopper,
    image: partyArt,
  },
  {
    id: 'romantic', label: 'Romantic', caption: 'Love on repeat', query: 'romantic songs',
    keywords: ['romantic'], from: '#170b10', to: '#221018', accent: '#fecdd3', icon: Heart,
    image: romanticArt,
  },
  {
    id: 'sad', label: 'Sad', caption: 'Feel everything', query: 'sad songs',
    keywords: ['sad'], from: '#0b1220', to: '#121a2b', accent: '#c7d2fe', icon: CloudRain,
    image: sadArt,
  },
  {
    id: 'driving', label: 'Driving', caption: 'Windows down', query: 'driving music',
    keywords: ['driving', 'car', 'roadtrip', 'road'], from: '#161106', to: '#201808', accent: '#fde68a', icon: CarFront,
    image: drivingArt,
  },
  {
    id: 'morning', label: 'Morning Energy', caption: 'Wake up bright', query: 'morning energy music',
    keywords: ['morning', 'energy', 'upbeat'], from: '#101506', to: '#18200a', accent: '#fef08a', icon: Sun,
    image: morningArt,
  },
  {
    id: 'dhol', label: 'Dhol dhol', caption: 'Bhangra beats', query: 'dhol bhangra punjabi',
    keywords: ['dhol', 'bhangra', 'punjabi'], from: '#07130f', to: '#0b1f18', accent: '#6ee7b7', icon: Drum,
    image: dholArt,
  },
  {
    id: 'relax', label: 'Relaxation', caption: 'Let everything go', query: 'relaxing music',
    keywords: ['relax', 'relaxation', 'calm', 'sleep'], from: '#071410', to: '#0b1f1a', accent: '#99f6e4', icon: Wind,
    image: relaxArt,
  },
  {
    id: 'feelgood', label: 'Feel good', caption: 'Good vibes only', query: 'feel good music',
    keywords: ['feel good', 'happy', 'upbeat'], from: '#07140d', to: '#0b2014', accent: '#bbf7d0', icon: Smile,
    image: feelgoodArt,
  },
];
