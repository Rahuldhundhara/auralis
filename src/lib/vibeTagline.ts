import type { Track } from '@shared/types';

/**
 * Mood-keyed taglines. Each bucket carries enough variants that the same line
 * does not repeat for consecutive songs; the picker below also guards against
 * returning the previous line twice in a row.
 */
export const VIBE_TAGLINES = {
  sad: [
    'Some feelings sound better in music.',
    'For the nights that need no words.',
    "Let the melody hold what you can't say.",
    'Some songs understand you better.',
    'A softer place to land.',
    'Play it once more for the feeling.',
  ],
  romantic: [
    'A little melody, a lot of emotions.',
    'Every note sounds like you.',
    'Made for hearts that feel deeply.',
    'Love, in stereo.',
    'A song worth falling for.',
    'Softly, slowly, yours.',
  ],
  energetic: [
    'Turn the volume up. Feel everything.',
    'Own the moment. Loud.',
    'This is your main-character soundtrack.',
    'No brakes, just bass.',
    'Wake the whole room up.',
    'Energy looks good on you.',
  ],
  chill: [
    'Let the world slow down for a while.',
    'Nothing urgent. Just music.',
    'Breathe in. Press play.',
    'A quiet corner in a loud day.',
    'Drift a little.',
    'Easy does it.',
  ],
  motivational: [
    'Keep moving. Keep becoming.',
    'Your next chapter starts here.',
    'Play it loud. Chase it down.',
    'Small steps, big sound.',
    'Built for the climb.',
    'Rise. Repeat.',
  ],
  retro: [
    'Old memories, new feelings.',
    'Some classics never fade.',
    'Take a trip down memory lane.',
    'Throwback, but make it loud.',
    'Yesterday still sounds good.',
    'Rewind the good times.',
  ],
  party: [
    'Tonight belongs to the rhythm.',
    'Lights down. Volume up.',
    "Move like nobody's watching.",
    'The night is still young.',
    'One more song. One more round.',
    'Make the floor shake.',
  ],
  focus: [
    'Deep focus, deeper sound.',
    'Find your flow.',
    'One song. One task. No noise.',
    'The quiet engine of your work.',
    'Lock in. Let it play.',
    'Head down, volume steady.',
  ],
  default: [
    'Sometimes music says it all.',
    "This one's for you.",
    'Lost in the rhythm.',
    'Let the music find you.',
    'A soundtrack for right now.',
    'Press play and stay a while.',
    'Your moment, in sound.',
    'Good songs, better company.',
  ],
};

const MOOD_KEYWORDS: Record<string, string[]> = {
  sad: ['sad', 'lonely', 'broken', 'cry', 'tears', 'miss', 'hurt', 'pain', 'uplift', 'heartbreak', 'down', 'alone', 'goodbye', 'regret'],
  romantic: ['love', 'romance', 'heart', 'dear', 'beloved', 'kiss', 'moon', 'star', 'valentine', 'sweet', 'darling', 'forever', 'together', 'ishq', 'pyaar'],
  party: ['party', 'celebration', 'dance', 'club', 'funk', 'groov', 'turn up', 'bang', 'tonight', 'shots'],
  energetic: ['fire', 'energy', 'run', 'fast', 'power', 'pulse', 'drive', 'gangnam', 'beat', 'clap', 'wild', 'jump', 'anthem'],
  chill: ['relax', 'calm', 'sleep', 'rain', 'slow', 'breeze', 'lo-fi', 'lofi', 'chill', 'midnight', 'night', 'sunset', 'waves', 'ocean', 'coffee', 'lazy'],
  motivational: ['rise', 'grind', 'hustle', 'winner', 'dream', 'strong', 'unstoppable', 'warrior', 'win', 'believe', 'champion', 'alive'],
  retro: ['retro', '80s', '90s', 'classic', 'throwback', 'vibes', 'back in the day', 'disco', 'funk', 'old', 'memories'],
  focus: ['focus', 'study', 'work', 'concentrate', 'deep', 'ambience', 'ambient', 'lofi study', 'instrumental', 'piano', 'waves'],
};

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function taglinesForTrack(track: Track | undefined): string[] {
  if (!track) return VIBE_TAGLINES.default;
  const text = `${track.title} ${track.artists?.map((a) => a.name).join(' ') || ''} ${track.album?.name || ''}`.toLowerCase();

  for (const mood of Object.keys(MOOD_KEYWORDS) as Array<keyof typeof VIBE_TAGLINES>) {
    const keywords = MOOD_KEYWORDS[mood];
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        const lines = VIBE_TAGLINES[mood];
        return lines && lines.length ? lines : VIBE_TAGLINES.default;
      }
    }
  }
  return VIBE_TAGLINES.default;
}

/** Last line handed to the UI, so consecutive picks never repeat. */
let lastTagline = '';

/**
 * One line per track signature. Explore, Home and any other surface that asks
 * for the current track's tagline must get the same answer, so the first call
 * decides (and advances the anti-repeat guard) and later calls reuse it.
 */
const taglineCache = new Map<string, string>();
const TAGLINE_CACHE_LIMIT = 200;

function trackSignature(track: Track): string {
  return `${track.id}:${track.title}:${track.album?.name || ''}:${(track.artists || [])
    .map((artist) => artist.name)
    .join(',')}`;
}

export function taglineForTrack(track: Track | undefined): string {
  if (!track) {
    const lines = VIBE_TAGLINES.default;
    const next = lines.find((line) => line !== lastTagline) || lines[0];
    lastTagline = next;
    return next;
  }
  const signature = trackSignature(track);
  const cached = taglineCache.get(signature);
  if (cached) return cached;
  const lines = taglinesForTrack(track);
  const hash = hashString(`${track.id}:${track.title}`);
  let line = lines[hash % lines.length];
  if (line === lastTagline && lines.length > 1) {
    line = lines[(hash + 1) % lines.length];
  }
  lastTagline = line;
  taglineCache.set(signature, line);
  if (taglineCache.size > TAGLINE_CACHE_LIMIT) {
    const oldest = taglineCache.keys().next().value;
    if (oldest) taglineCache.delete(oldest);
  }
  return line;
}

export function vibeTaglineRandom(): string {
  const lines = [
    ...VIBE_TAGLINES.energetic,
    ...VIBE_TAGLINES.party,
    ...VIBE_TAGLINES.chill,
    ...VIBE_TAGLINES.motivational,
    ...VIBE_TAGLINES.default,
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}
