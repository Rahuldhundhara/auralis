import assert from 'node:assert/strict';
import {
  THOUGHT_INTERVAL_MS,
  daypartFor,
  heroThought,
  shortTitle,
  thoughtBucket,
  type ThoughtContext,
} from '../src/lib/heroThought';

const base: ThoughtContext = {
  bucket: 100,
  now: new Date(2026, 10, 4, 20, 0).getTime(),
  title: 'Kesariya (From "Brahmastra")',
  artist: 'Arijit Singh',
  playing: true,
};

// A slot is stable: re-renders must not reshuffle the line.
const first = heroThought(base);
assert.equal(heroThought(base).text, first.text);
assert.equal(heroThought(base).key, first.key);

// The next ten-minute slot always moves to a different line.
const next = heroThought({ ...base, bucket: base.bucket + 1 });
assert.notEqual(next.text, first.text, 'thought did not rotate at the next slot');

// Ten slots cover the pool without a placeholder leaking into the UI.
const texts = new Set<string>();
for (let offset = 0; offset < 12; offset += 1) {
  const thought = heroThought({ ...base, bucket: base.bucket + offset });
  texts.add(thought.text);
  assert.ok(!thought.text.includes('{'), `placeholder left in: ${thought.text}`);
}
assert.ok(texts.size >= 10, `only ${texts.size} distinct playing thoughts across 12 slots`);

// A different song gets a different rotation.
const otherSong = heroThought({ ...base, title: 'Tum Hi Ho', artist: 'Arijit Singh' });
const otherTexts = new Set<string>();
for (let offset = 0; offset < 12; offset += 1) {
  otherTexts.add(heroThought({ ...base, title: 'Tum Hi Ho', artist: 'Arijit Singh', bucket: base.bucket + offset }).text);
}
assert.ok(
  [...texts].some((line) => !otherTexts.has(line)),
  'two different songs produced the same thought set',
);

// Mood pools: morning and late night must not be the same rotation.
const morning = new Set<string>();
const lateNight = new Set<string>();
for (let offset = 0; offset < 12; offset += 1) {
  morning.add(
    heroThought({
      bucket: offset,
      now: new Date(2026, 10, 4, 8, 0).getTime(),
      playing: false,
    }).text,
  );
  lateNight.add(
    heroThought({
      bucket: offset,
      now: new Date(2026, 10, 4, 2, 0).getTime(),
      playing: false,
    }).text,
  );
}
assert.ok([...morning].some((line) => !lateNight.has(line)), 'morning and late night pools matched');

// Paused and idle states get their own lines.
const paused = heroThought({ ...base, playing: false, paused: true });
const idle = heroThought({ ...base, playing: false, paused: false });
assert.notEqual(paused.key.split(':')[1], 'idle');
assert.equal(idle.key.split(':')[1], 'idle');
assert.notEqual(paused.text, idle.text);

// Clock and title helpers.
assert.equal(thoughtBucket(THOUGHT_INTERVAL_MS * 3 - 1), 2);
assert.equal(thoughtBucket(THOUGHT_INTERVAL_MS * 3), 3);
assert.equal(daypartFor(new Date(2026, 10, 4, 7, 30)), 'morning');
assert.equal(daypartFor(new Date(2026, 10, 4, 14, 0)), 'afternoon');
assert.equal(daypartFor(new Date(2026, 10, 4, 19, 0)), 'evening');
assert.equal(daypartFor(new Date(2026, 10, 4, 23, 0)), 'night');
assert.equal(daypartFor(new Date(2026, 10, 4, 2, 0)), 'lateNight');
assert.equal(shortTitle('Kesariya (From "Brahmastra") (Happy Diwali)'), 'Kesariya');
assert.equal(shortTitle('Tum Hi Ho'), 'Tum Hi Ho');

console.log('hero thought tests passed');
console.log(`sample (evening, playing): ${first.text}`);
console.log(`next slot: ${next.text}`);
console.log(`paused: ${paused.text}`);
console.log(`idle: ${idle.text}`);
