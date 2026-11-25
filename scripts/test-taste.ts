// Unit tests for the local recommender (src/lib/taste.ts).
// Run: npx tsx scripts/test-taste.ts
import type { LibraryData, PlayEvent, Track } from '../shared/types';
import { buildTasteProfile, curateRadioTracks, discoverSeed, onRepeatMix, tasteProfile, trackKey } from '../src/lib/taste';

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${name}`, detail !== undefined ? JSON.stringify(detail) : '');
  }
}

const DAY = 86_400_000;
const now = Date.now();

function track(id: string, title: string, artist: string, duration = 210): Track {
  return {
    id,
    type: 'song',
    title,
    artists: [{ name: artist }],
    duration,
    thumbnail: '',
  } as Track;
}

function event(track: Track, daysAgo: number, completed: boolean): PlayEvent {
  return {
    trackId: track.id,
    title: track.title,
    artist: track.artists[0].name,
    duration: track.duration,
    playedAt: now - daysAgo * DAY,
    completed,
  };
}

function library(patch: Partial<LibraryData> = {}): LibraryData {
  return {
    liked: [],
    playlists: [],
    recent: [],
    events: [],
    downloads: [],
    savedAlbums: [],
    savedArtists: [],
    searchHistory: [],
    ...patch,
  };
}

/* ------------------------------------------------------------------ */
/* trackKey                                                            */
/* ------------------------------------------------------------------ */
check('trackKey strips (Live) and case', trackKey(track('a', 'Tum Hi Ho (Live)', 'Arijit Singh')) === trackKey(track('b', 'tum hi ho', 'arijit singh')));
check('trackKey separates different artists', trackKey(track('a', 'Same Title', 'A')) !== trackKey(track('b', 'Same Title', 'B')));

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */
const arijit = track('arijit1', 'Tum Hi Ho', 'Arijit Singh');
const shreya = track('shreya1', 'Deewani Mastani', 'Shreya Ghoshal');
const diljit = track('diljit1', 'Laung Laachi', 'Diljit Dosanjh');
const badbunny = track('bunny1', 'Tití Me Preguntó', 'Bad Bunny');
const bunny2 = track('bunny2', 'Me Porto Bonito', 'Bad Bunny');
const bunny3 = track('bunny3', 'Yo Perreo Sola', 'Bad Bunny');
const bunny4 = track('bunny4', 'Callaíta', 'Bad Bunny');

const events = [
  event(arijit, 1, true),
  event(arijit, 3, true),
  event(shreya, 2, true),
  event(diljit, 10, true),
  event(badbunny, 1, false),
  event(bunny2, 2, false),
  event(bunny3, 3, false),
  event(bunny4, 4, false),
];

const profile = buildTasteProfile(library({ events, recent: [arijit, shreya], liked: [diljit] }), now);

check('profile: completed artists rank, skip-only artists excluded', profile.topArtists[0]?.name === 'diljit dosanjh' && !profile.topArtists.some((a) => a.name === 'bad bunny'), profile.topArtists.slice(0, 4));
check('profile: skip artist detected', profile.skipArtists.has('bad bunny'), [...profile.skipArtists]);
check('profile: played ids tracked', profile.playedIds.has('bunny1') && profile.playedIds.has('arijit1'));
check('profile: recent ids window', profile.recentIds.has('bunny1') && !profile.recentIds.has('diljit1'), [...profile.recentIds]);
check('profile: played song identities tracked', profile.playedKeys.has(trackKey(arijit)));
check('profile: recent song identities window', profile.recentKeys.has(trackKey(arijit)) && !profile.recentKeys.has(trackKey(diljit)));

const onRepeat = onRepeatMix(profile);
check('onRepeat mix exists', Boolean(onRepeat));
check('onRepeat ranks completed plays', onRepeat?.tracks[0]?.id === 'arijit1' || onRepeat?.tracks[0]?.id === 'shreya1', onRepeat?.tracks.map((t) => t.id));

check('seeds: liked present and diverse', profile.seedTracks.some((t) => t.id === 'diljit1'), profile.seedTracks.map((t) => t.id));

const memo1 = tasteProfile(library({ events }));
const memo2 = tasteProfile(library({ events }));
check('tasteProfile memoised per signature', memo1 === memo2);

/* ------------------------------------------------------------------ */
/* Curation                                                            */
/* ------------------------------------------------------------------ */
const incoming = [
  track('fresh1', 'New Song One', 'Unknown Artist'),
  track('dup1', 'Tum Hi Ho', 'Arijit Singh'), // same song identity as arijit1 → recently heard
  track('bunny5', 'Dákiti', 'Bad Bunny'), // skip artist → dropped
  track('recentX', 'Brand New', 'Someone'), // marked recently played → dropped
  track('fresh2', 'New Song Two', 'Other Artist'),
];

const curated = curateRadioTracks(
  incoming,
  {
    ...profile,
    recentIds: new Set([...profile.recentIds, 'recentX']),
  },
  now,
);

check('curation: drops skip artist', !curated.some((t) => t.id === 'bunny5'));
check('curation: drops recently played', !curated.some((t) => t.id === 'recentX'));
check('curation: dedupes same song across uploads', !curated.some((t) => t.id === 'dup1'));
check('curation: keeps fresh tracks', curated.some((t) => t.id === 'fresh1') && curated.some((t) => t.id === 'fresh2'));

// Loved anchors move to the front when the profile is strong.
const lovedProfile = buildTasteProfile(
  library({
    events: [
      event(arijit, 1, true),
      event(shreya, 2, true),
      event(diljit, 2, true),
      event(track('x1', 'X', 'X'), 2, true),
      event(track('x2', 'Y', 'Y'), 2, true),
      event(track('x3', 'Z', 'Z'), 2, true),
    ],
  }),
  now,
);
const page = [
  track('p1', 'Song One', 'Stranger One'),
  track('p2', 'Song Two', 'Stranger Two'),
  track('p3', 'Teri Ore', 'Shreya Ghoshal'), // loved artist, never played
  track('p4', 'Song Four', 'Stranger Three'),
  track('p5', 'G.O.A.T.', 'Diljit Dosanjh'), // loved artist, never played
];
const curatedPage = curateRadioTracks(page, lovedProfile, now);
check(
  'curation: loved anchors lead the page',
  curatedPage.slice(0, 2).every((t) => ['Shreya Ghoshal', 'Diljit Dosanjh'].includes(t.artists[0].name)),
  curatedPage.map((t) => `${t.title} — ${t.artists[0].name}`),
);

// Back-to-back artist runs are broken when the data allows it.
const stack = [
  track('s1', 'One', 'Artist A'),
  track('s2', 'Two', 'Artist A'),
  track('s3', 'Three', 'Artist B'),
  track('s4', 'Four', 'Artist C'),
  track('s5', 'Five', 'Artist D'),
];
const curatedStack = curateRadioTracks(stack, buildTasteProfile(library()), now);
const adjacentSame = curatedStack.some((t, index) => index > 0 && t.artists[0].name === curatedStack[index - 1].artists[0].name);
check('curation: no back-to-back same artist when avoidable', !adjacentSame, curatedStack.map((t) => t.artists[0].name));

// Artist cap of 3 per page.
const many = ['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => track(id, `Song ${id}`, 'One Hit Wonder'));
const capped = curateRadioTracks(many, buildTasteProfile(library()), now);
check('curation: artist capped at 3 per page', capped.length === 3, capped.length);

// Empty profile still dedupes and never crashes.
const plain = curateRadioTracks([track('e1', 'A', 'B'), track('e1', 'A', 'B')], buildTasteProfile(library()), now);
check('curation: empty profile dedupes by id', plain.length === 1, plain.length);

// Same-name uploads of the seed song (covers, variants by other artists) never queue.
const seededRadio = curateRadioTracks(
  [
    track('cover1', 'Tum Hi Ho (Lofi Version)', 'Lofi Channel'),
    track('cover2', 'TUM HI HO', 'Random Singer'),
    track('own1', 'Milne Hai Mujhse Aayi', 'Arijit Singh'),
    track('fresh1b', 'Brand New Song', 'Fresh Artist'),
  ],
  buildTasteProfile(library()),
  now,
  { seedTitle: 'Tum Hi Ho', seedArtist: 'Arijit Singh' },
);
check(
  'curation: drops same-name covers of the seed song',
  !seededRadio.some((t) => t.id === 'cover1' || t.id === 'cover2'),
  seededRadio.map((t) => `${t.title} — ${t.artists[0].name}`),
);
check('curation: keeps the seed artist other songs', seededRadio.some((t) => t.id === 'own1'));

// Without seed context the filter stays off.
const unseeded = curateRadioTracks(
  [track('cover1', 'Tum Hi Ho (Lofi Version)', 'Lofi Channel')],
  buildTasteProfile(library()),
  now,
);
check('curation: seed filter only applies with seed context', unseeded.length === 1, unseeded.length);

/* ------------------------------------------------------------------ */
/* Discover seed                                                       */
/* ------------------------------------------------------------------ */
const seededProfile = buildTasteProfile(library({ events, liked: [arijit, diljit] }), now);
const seed1 = discoverSeed(seededProfile);
check('discover seed comes from taste', Boolean(seed1) && ['arijit1', 'diljit1'].includes(seed1?.id || ''), seed1?.id);

console.log(failures ? `\n${failures} failure(s)` : '\nAll taste tests passed.');
process.exit(failures ? 1 : 0);
