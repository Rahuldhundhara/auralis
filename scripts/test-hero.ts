import { heroCopy } from '../src/lib/hero';
import type { Track } from '../shared/types';

function track(title: string, album?: string): Track {
  return {
    id: 'x',
    type: 'song',
    title,
    artists: [{ name: 'Artist One' }, { name: 'Artist Two' }],
    duration: 200,
    album: album ? { name: album } : undefined,
  };
}

const cases: Array<[string, Track, { title: string; album?: string; version?: string }]> = [
  ['from parenthetical', track('Kesariya (From "Brahmastra")', 'Brahmastra'), { title: 'Kesariya', album: 'Brahmastra' }],
  ['album ref repeats song', track('Apna Bana Le (From "Bhediya")', 'Apna Bana Le'), { title: 'Apna Bana Le', album: 'Bhediya' }],
  ['plain song', track('Believer', 'Evolve'), { title: 'Believer', album: 'Evolve' }],
  ['eponymous album', track('Believer', 'Believer'), { title: 'Believer' }],
  ['live version', track('Song (Live)'), { title: 'Song', version: 'Live' }],
  ['leading parenthetical', track("(I Can't Get No) Satisfaction"), { title: "(I Can't Get No) Satisfaction" }],
  ['album and version', track('Song (From "Album") (Live)'), { title: 'Song', album: 'Album', version: 'Live' }],
  ['dash version', track('Song - Remix'), { title: 'Song', version: 'Remix' }],
  ['dash after album', track('Song (From "Album") - Live'), { title: 'Song', album: 'Album', version: 'Live' }],
];

let failed = 0;
for (const [name, input, expected] of cases) {
  const actual = heroCopy(input);
  const pass = actual.title === expected.title && actual.album === expected.album && actual.version === expected.version;
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}:`, JSON.stringify({ title: actual.title, album: actual.album, version: actual.version }));
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exitCode = failed ? 1 : 0;
