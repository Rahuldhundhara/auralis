import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

fs.mkdirSync('qa/reco', { recursive: true });

/** Real, verifiable video id used as the strongest completed-play seed. */
const RICK = 'dQw4w9WgXcQ';
const DAY = 86_400_000;
const now = Date.now();

function t(id, title, artist) {
  return { id, type: 'song', title, artists: [{ name: artist }], duration: 213, thumbnail: '' };
}
function ev(id, title, artist, daysAgo, completed) {
  return { trackId: id, title, artist, duration: 213, playedAt: now - daysAgo * DAY, completed };
}

const library = {
  liked: [t(RICK, 'Never Gonna Give You Up', 'Rick Astley'), t('fakeDiljit1', 'Laung Laachi', 'Diljit Dosanjh')],
  playlists: [],
  recent: [
    t(RICK, 'Never Gonna Give You Up', 'Rick Astley'),
    t('fakeArijit1', 'Tum Hi Ho', 'Arijit Singh'),
    t('fakeShreya1', 'Deewani Mastani', 'Shreya Ghoshal'),
    t('fakeBunny1', 'Tití Me Preguntó', 'Bad Bunny'),
  ],
  events: [
    ev(RICK, 'Never Gonna Give You Up', 'Rick Astley', 1, true),
    ev(RICK, 'Never Gonna Give You Up', 'Rick Astley', 2, true),
    ev(RICK, 'Never Gonna Give You Up', 'Rick Astley', 4, true),
    ev('fakeArijit1', 'Tum Hi Ho', 'Arijit Singh', 2, true),
    ev('fakeArijit1', 'Tum Hi Ho', 'Arijit Singh', 5, true),
    ev('fakeShreya1', 'Deewani Mastani', 'Shreya Ghoshal', 3, true),
    ev('fakeDiljit1', 'Laung Laachi', 'Diljit Dosanjh', 10, true),
    ev('fakeBunny1', 'Tití Me Preguntó', 'Bad Bunny', 1, false),
    ev('fakeBunny2', 'Me Porto Bonito', 'Bad Bunny', 2, false),
    ev('fakeBunny3', 'Yo Perreo Sola', 'Bad Bunny', 3, false),
    ev('fakeBunny4', 'Callaíta', 'Bad Bunny', 4, false),
  ],
  downloads: [],
  savedAlbums: [],
  savedArtists: [],
  searchHistory: [],
};

const issues = [];

async function launch(withLibrary) {
  const profile = path.join(process.env.TEMP || '.', `auralis-reco-qa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  if (withLibrary) {
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(path.join(profile, 'library.json'), JSON.stringify(library), 'utf8');
  }
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${profile}`],
    cwd: process.cwd(),
    env: { ...process.env, AURALIS_FORCE_PROD: '1', AURALIS_SKIP_LOGIN: '1' },
    timeout: 60000,
  });
  return { app, profile };
}

async function playFirstSearch(page, query) {
  const input = page.locator('.top-search input').first();
  await input.click();
  await input.fill(query);
  await input.press('Enter');
  await page.waitForSelector('.search-page', { timeout: 20000 });
  await page.waitForTimeout(2200);
  const rows = page.locator('.top-songs .track-row');
  if (!(await rows.count())) throw new Error('no search rows');
  await rows.first().dblclick();
  for (let index = 0; index < 50; index += 1) {
    const playing = await page.evaluate(() => document.querySelector('.player-center .play-button')?.getAttribute('data-playing'));
    if (playing === 'true') break;
    await page.waitForTimeout(400);
  }
}

async function queueArtists(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.queue-drawer .queue-row .queue-artist')].map((node) => node.textContent?.trim() || ''),
  );
}

async function readShelves(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.home-page .shelf')].map((shelf) => ({
      title: shelf.querySelector('.shelf-head h2')?.textContent || '',
      cards: [...shelf.querySelectorAll('.media-card .card-title')].map((node) => node.textContent || ''),
    })),
  );
}

/* ---------------- Part 1: profiled library ---------------- */
{
  const { app, profile } = await launch(true);
  const page = await app.firstWindow({ timeout: 60000 });
  page.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/status of 502|auralis-media|ERR_/i.test(message.text())) {
      issues.push(`[console] ${message.text()}`);
    }
  });
  try {
    await page.waitForSelector('.app-shell', { timeout: 60000 });
    await page.waitForSelector('.home-vibe-stage', { timeout: 30000 });
    await page.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window.isMaximized()) window.unmaximize();
      window.setSize(1440, 960);
    }, undefined).catch(() => {});
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'qa/reco/01-home-madeforyou.png' });

    const shelves = await readShelves(page);
    console.log('[shelves]', JSON.stringify(shelves.map((s) => ({ title: s.title, n: s.cards.length }))));
    const onRepeat = shelves.find((shelf) => shelf.title === 'On repeat');
    if (!onRepeat) issues.push('[on-repeat] shelf missing with a profiled library');
    else {
      if (onRepeat.cards.length < 3) issues.push(`[on-repeat] only ${onRepeat.cards.length} cards`);
      if (!onRepeat.cards.some((title) => title.includes('Never Gonna Give You Up'))) {
        issues.push(`[on-repeat] most-completed song not ranked first: ${onRepeat.cards[0]}`);
      }
    }

    // Discover mix builds from the real radio for the rotating seed.
    await page.waitForTimeout(4500);
    const shelvesAfter = await readShelves(page);
    console.log('[shelves+]', JSON.stringify(shelvesAfter.map((s) => ({ title: s.title, n: s.cards.length }))));
    const discover = shelvesAfter.find((shelf) => shelf.title === 'Discover mix');
    if (!discover) issues.push('[discover] mix shelf missing');
    else {
      const forbidden = ['Never Gonna Give You Up', 'Tum Hi Ho', 'Deewani Mastani', 'Laung Laachi', 'Tití Me Preguntó'];
      const leaked = discover.cards.filter((title) => forbidden.some((needle) => title.includes(needle)));
      if (leaked.length) issues.push(`[discover] repeated already-played songs: ${leaked.join(', ')}`);
      if (discover.cards.length < 6) issues.push(`[discover] only ${discover.cards.length} picks`);
    }
    await page.screenshot({ path: 'qa/reco/02-home-discover.png' });

    // Radio curation: play a real song, then inspect the queue rows.
    await playFirstSearch(page, 'Kesariya');
    await page.waitForTimeout(3000);
    await page.evaluate(() => document.querySelector('.queue-pill')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForSelector('.queue-drawer', { timeout: 10000 });
    await page.waitForTimeout(2500);
    const artists = await queueArtists(page);
    const titles = await page.evaluate(() =>
      [...document.querySelectorAll('.queue-drawer .queue-row .queue-title')].map((node) => node.textContent?.trim() || ''),
    );
    console.log('[queue]', JSON.stringify({ rows: artists.length, artists: [...new Set(artists)], titles: titles.slice(0, 12) }));
    if (artists.length < 2) issues.push('[radio] queue has no radio tracks appended');
    const adjacentDup = artists.some((artist, index) => index > 0 && artist && artist === artists[index - 1]);
    if (adjacentDup) issues.push('[radio] two consecutive queue rows share one artist');
    const badBunny = artists.filter((artist) => artist.includes('Bad Bunny'));
    if (badBunny.length) issues.push(`[radio] skip-prone artist leaked into the queue: ${badBunny.length}`);
    const combined = artists.map((artist, index) => `${titles[index]}|${artist}`);
    const dupPairs = combined.filter((value, index) => combined.indexOf(value) !== index);
    if (dupPairs.length) issues.push(`[radio] duplicate songs in queue: ${dupPairs.join(', ')}`);
    await page.screenshot({ path: 'qa/reco/03-radio-queue.png' });
  } catch (error) {
    console.error('[FAIL-part1]', error.message);
    issues.push(`[fail] ${error.message}`);
    await page.screenshot({ path: 'qa/reco/99-failure-1.png' }).catch(() => {});
  } finally {
    await app.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

/* ---------------- Part 2: empty-profile regression ---------------- */
{
  const { app, profile } = await launch(false);
  const page = await app.firstWindow({ timeout: 60000 });
  page.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
  try {
    await page.waitForSelector('.app-shell', { timeout: 60000 });
    await page.waitForSelector('.home-vibe-stage', { timeout: 30000 });
    await page.waitForTimeout(1200);
    const shelves = await readShelves(page);
    const made = shelves.filter((shelf) => shelf.title === 'On repeat' || shelf.title === 'Discover mix');
    if (made.length) issues.push(`[empty] made-for-you shelves rendered without any listening data: ${made.map((s) => s.title).join(', ')}`);
    await playFirstSearch(page, 'Kesariya');
    await page.waitForTimeout(3000);
    await page.evaluate(() => document.querySelector('.queue-pill')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForSelector('.queue-drawer', { timeout: 10000 });
    await page.waitForTimeout(2500);
    const artists = await queueArtists(page);
    console.log('[queue-empty-profile]', JSON.stringify({ rows: artists.length, unique: [...new Set(artists)].length }));
    if (artists.length < 2) issues.push('[radio] empty-profile radio did not append tracks');
  } catch (error) {
    console.error('[FAIL-part2]', error.message);
    issues.push(`[fail] ${error.message}`);
    await page.screenshot({ path: 'qa/reco/99-failure-2.png' }).catch(() => {});
  } finally {
    await app.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

console.log('[issues]', JSON.stringify(issues, null, 2));
process.exit(issues.length ? 1 : 0);
