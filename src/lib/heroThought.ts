/** How often the home hero thought rotates. */
export const THOUGHT_INTERVAL_MS = 10 * 60 * 1000;

export type ThoughtDaypart = 'morning' | 'afternoon' | 'evening' | 'night' | 'lateNight';

export interface ThoughtContext {
  /** Ten-minute slot, see thoughtBucket(). */
  bucket: number;
  /** Local timestamp used only to pick the time-of-day mood. */
  now?: number;
  title?: string;
  artist?: string;
  playing?: boolean;
  paused?: boolean;
  radio?: boolean;
  local?: boolean;
}

export interface HeroThought {
  key: string;
  text: string;
}

const MOOD_LINES: Record<ThoughtDaypart, string[]> = {
  morning: [
    'A slow morning is still a good morning.',
    'Let the first song set the pace.',
    'Sunlight, headphones, and nowhere to rush.',
    'Start soft. The day can wait a minute.',
    'Mornings sound better at a lower volume.',
    'One song before the world gets loud.',
    'A quiet start, on purpose.',
    'The day is still warming up.',
  ],
  afternoon: [
    'The middle of the day deserves a good soundtrack.',
    'A small pause, with the volume up.',
    'Afternoon light and a song you know by heart.',
    'Nothing urgent. Just the next track.',
    'Let the hours drift a little.',
    'A good song makes an ordinary afternoon feel intentional.',
    'Halfway through the day, fully in the music.',
    'Take the long way through this one.',
  ],
  evening: [
    'Evenings are better with a song that lingers.',
    'Let the day come down slowly.',
    'The light is going; the music can stay.',
    'One more song before the evening ends.',
    'A quiet hour, well soundtracked.',
    'The room feels warmer with this on.',
    'No plans. Just the queue.',
    'Evening, and nowhere else to be.',
  ],
  night: [
    'The night sounds better at this volume.',
    'Late hours and songs that understand.',
    'Let the world go quiet for a while.',
    "One more track won't hurt.",
    "The city is asleep; the playlist isn't.",
    'Nighttime is for the songs you keep coming back to.',
    'A little music before the lights go out.',
    'The best part of the night is still playing.',
  ],
  lateNight: [
    "It's late. The good songs don't mind.",
    'The quietest hours have the best soundtracks.',
    'Still awake, still listening.',
    'No rush. The night is long.',
    'A song for the last hour of the day.',
    'The world is quiet. Let this one fill it.',
    'Late-night listening hits differently.',
    'One last song, then maybe one more.',
  ],
};

const PLAYING_LINES = [
  '{title} is on. The rest can wait.',
  'Let {title} finish before you decide what comes next.',
  '{artist} knows how to hold a room.',
  'This one sounds like it was made for right now.',
  'A good song is a place to stay for a few minutes.',
  'No skipping. This one deserves its full run.',
  'The queue can wait; this is the part to keep.',
  'Some songs do the talking for you.',
];

const PAUSED_LINES = [
  'Paused, but not gone. The mood is still here.',
  'Take the silence. The next song will keep.',
  'A quiet room and a song on hold.',
  'Even on pause, the right song stays with you.',
];

const IDLE_LINES = [
  'Nothing playing yet. The right song is close.',
  'A quiet room is still a listening room.',
  'Nothing queued. Nothing rushed.',
  'Ready when you are.',
];

const RADIO_LINES = [
  'The radio is picking the next move.',
  'One song led to another. Keep going.',
  'No queue, no plan. Just the stream.',
  'Let the station surprise you.',
];

const LOCAL_LINES = [
  'Offline, and still in the mood.',
  'Your own library, no signal needed.',
  'Local files, full volume.',
];

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

/** Stable ten-minute slot based on the local clock. */
export function thoughtBucket(now = Date.now()): number {
  return Math.floor(now / THOUGHT_INTERVAL_MS);
}

export function daypartFor(date = new Date()): ThoughtDaypart {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  if (hour >= 21 || hour < 1) return 'night';
  return 'lateNight';
}

/** Trim YouTube's long parenthetical suffixes down to the song name. */
export function shortTitle(title: string): string {
  const base = title.split(/\s*[([\]]/)[0].trim() || title.trim();
  return base.length > 36 ? `${base.slice(0, 35).trimEnd()}…` : base;
}

function shortArtist(artist: string): string {
  return artist.length > 28 ? `${artist.slice(0, 27).trimEnd()}…` : artist;
}

function fill(line: string, title: string, artist: string): string {
  return line.replaceAll('{title}', title).replaceAll('{artist}', artist);
}

/**
 * Pick the current hero thought. The ten-minute bucket moves the index one
 * step, so the line changes every interval. The track, playback state and
 * time of day seed the order, so different songs and moods get different
 * lines instead of one fixed rotation for everyone.
 */
export function heroThought(context: ThoughtContext): HeroThought {
  const daypart = daypartFor(new Date(context.now ?? Date.now()));
  const title = context.title ? shortTitle(context.title) : '';
  const artist = context.artist ? shortArtist(context.artist) : '';
  const state = context.playing ? 'playing' : context.paused ? 'paused' : 'idle';

  const pool = [...MOOD_LINES[daypart]];
  if (state === 'playing') pool.push(...PLAYING_LINES);
  else if (state === 'paused') pool.push(...PAUSED_LINES);
  else pool.push(...IDLE_LINES);
  if (context.radio) pool.push(...RADIO_LINES);
  if (context.local) pool.push(...LOCAL_LINES);

  const usable = pool.filter(
    (line) => (!line.includes('{title}') || title) && (!line.includes('{artist}') || artist),
  );
  const seed = `${daypart}|${title}|${artist}|${state}|${context.radio ? 'radio' : ''}|${context.local ? 'local' : ''}`;
  const index = (hash(seed) + context.bucket) % usable.length;
  const text = fill(usable[index], title, artist);

  return {
    key: `${daypart}:${state}:${index}:${context.bucket}:${title}`,
    text,
  };
}
