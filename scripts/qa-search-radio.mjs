import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

fs.mkdirSync('qa/search-radio', { recursive: true });

const issues = [];

async function launch() {
  const profile = path.join(process.env.TEMP || '.', `auralis-search-radio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  fs.mkdirSync(profile, { recursive: true });
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${profile}`],
    cwd: process.cwd(),
    env: { ...process.env, AURALIS_FORCE_PROD: '1', AURALIS_SKIP_LOGIN: '1' },
    timeout: 60000,
  });
  return { app, profile };
}

async function search(page, query) {
  const input = page.locator('.top-search input').first();
  await input.click();
  await input.fill(query);
  await input.press('Enter');
  await page.waitForSelector('.search-page', { timeout: 20000 });
  await page.waitForTimeout(2500);
}

/** Titles shown in the search page's own songs list. */
async function searchSongTitles(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.search-page .top-songs .track-row .track-title, .search-page .shelf-list-card .track-row .track-title')].map(
      (node) => (node.textContent || '').trim(),
    ),
  );
}

async function closeQueue(page) {
  // The backdrop closes the drawer only when the mousedown lands on it.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!(await page.locator('.drawer-layer').count())) return;
    await page.locator('.drawer-layer').dispatchEvent('mousedown');
    await page.waitForTimeout(500);
  }
}

async function openQueue(page) {
  if (!(await page.locator('.queue-drawer').count())) {
    await page.evaluate(() => document.querySelector('.queue-pill')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForSelector('.queue-drawer', { timeout: 10000 });
  }
  await page.waitForTimeout(2000);
}

async function queueRows(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.queue-drawer .queue-row')].map((row) => ({
      title: (row.querySelector('.queue-title')?.textContent || '').trim(),
      artist: (row.querySelector('.queue-artist')?.textContent || '').trim(),
    })),
  );
}

/** Polls until the queue drawer shows at least `min` upcoming rows. */
async function waitForRows(page, min, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let rows = [];
  while (Date.now() < deadline) {
    rows = await queueRows(page);
    if (rows.length >= min) return rows;
    await page.waitForTimeout(800);
  }
  return rows;
}

const norm = (value) => (value || '').toLowerCase().replace(/\((?:[^)]*)\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();

const { app, profile } = await launch();
const page = await app.firstWindow({ timeout: 60000 });
page.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error' && !/status of 502|auralis-media|ERR_/i.test(message.text())) {
    issues.push(`[console] ${message.text()}`);
  }
});

try {
  await page.waitForSelector('.app-shell', { timeout: 60000 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1200);

  /* ---------------- Surface A: playing a song row ---------------- */
  await search(page, 'kesariya');
  const searchTitles = await searchSongTitles(page);
  console.log('[search songs]', JSON.stringify(searchTitles.slice(0, 6)));

  await page.locator('.search-page .top-songs .track-row').first().dblclick();
  await page.waitForTimeout(2500);
  await openQueue(page);
  let rows = await waitForRows(page, 5);
  console.log('[queue A]', JSON.stringify({ rows: rows.length, first: rows.slice(0, 5) }));
  if (rows.length < 5) issues.push(`[songs-row] radio did not append related songs (${rows.length} rows)`);
  const others = searchTitles.slice(1).map(norm).filter(Boolean);
  const leaked = rows.slice(1).filter((row) => others.includes(norm(row.title)));
  if (leaked.length > 2) issues.push(`[songs-row] other search results still queued: ${leaked.map((r) => r.title).join(', ')}`);
  const uniqueArtists = new Set(rows.slice(1).map((row) => norm(row.artist).split(',')[0]));
  if (uniqueArtists.size < 3) issues.push(`[songs-row] queue too narrow: ${uniqueArtists.size} unique artists`);
  await page.screenshot({ path: 'qa/search-radio/01-songs-row-radio.png' });

  /* ---------------- Auto-continue when the song ends ---------------- */
  // The audio element lives outside the DOM, so drive the real UI instead:
  // focusing the progress slider and pressing End seeks to the song's last
  // moment, the browser fires 'ended', and the player must move on to the
  // next related track on its own.
  const beforeTitle = await page.evaluate(() => (document.querySelector('.queue-now-title')?.textContent || '').trim());
  await page.locator('input[aria-label="Song progress"]').focus();
  await page.keyboard.press('End');
  let advanced = false;
  let playing = false;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1200);
    const nowTitle = await page.evaluate(() => (document.querySelector('.queue-now-title')?.textContent || '').trim());
    playing = (await page.evaluate(() => document.querySelector('.player-center .play-button')?.getAttribute('data-playing'))) === 'true';
    if (nowTitle && nowTitle !== beforeTitle) {
      advanced = true;
      console.log('[auto-continue]', JSON.stringify({ before: beforeTitle, after: nowTitle, playing }));
      break;
    }
  }
  if (!advanced) issues.push(`[auto-continue] track did not advance after the song ended (was: ${beforeTitle})`);
  else if (!playing) issues.push('[auto-continue] next related track did not keep playing');
  await page.screenshot({ path: 'qa/search-radio/02-auto-continue.png' });

  /* ---------------- Surface B: top result play ---------------- */
  await closeQueue(page);
  await search(page, 'tum hi ho arijit singh');
  await page.waitForTimeout(1500);
  const topHasPlay = await page.locator('.top-result-play').count();
  if (topHasPlay) {
    await page.locator('.top-result-play').first().click();
    await page.waitForTimeout(2500);
    await openQueue(page);
    rows = await waitForRows(page, 2);
    console.log('[queue B]', JSON.stringify({ rows: rows.length, first: rows.slice(0, 4) }));
    if (rows.length < 2) issues.push('[top-result] playing the top result did not start a related radio');
    await page.screenshot({ path: 'qa/search-radio/03-top-result-radio.png' });
  } else {
    console.log('[queue B] top result has no play button (non-song top result) — skipped');
  }

  /* ---------------- Surface C: videos shelf card ---------------- */
  await closeQueue(page);
  await search(page, 'kesariya brahmastra');
  await page.waitForTimeout(2000);
  const videoShelf = page.locator('.search-page .shelf').filter({ hasText: 'Videos' }).first();
  if (await videoShelf.count()) {
    const videoTitles = await videoShelf.locator('.media-card .card-title').evaluateAll((nodes) => nodes.map((node) => (node.textContent || '').trim()));
    console.log('[videos]', JSON.stringify(videoTitles.slice(0, 5)));
    await videoShelf.locator('.media-card .card-play').first().click();
    await page.waitForTimeout(2500);
    await openQueue(page);
    rows = await waitForRows(page, 2);
    console.log('[queue C]', JSON.stringify({ rows: rows.length, first: rows.slice(0, 4) }));
    if (rows.length < 2) issues.push('[videos] playing a video card did not start a related radio');
    const seedNorm = norm(videoTitles[0]);
    const sameName = rows.slice(1).filter((row) => norm(row.title) === seedNorm);
    if (sameName.length) issues.push(`[videos] same-name variants of the seed leaked: ${sameName.map((r) => r.title).join(', ')}`);
    const shelfRest = videoTitles.slice(1).map(norm);
    const shelfLeak = rows.slice(1).filter((row) => shelfRest.includes(norm(row.title)));
    if (shelfLeak.length > 2) issues.push(`[videos] the rest of the video shelf was queued: ${shelfLeak.length} rows`);
    await page.screenshot({ path: 'qa/search-radio/04-video-radio.png' });
  } else {
    console.log('[queue C] no Videos shelf for this query — skipped');
  }
} catch (error) {
  console.error('[FAIL]', error.message);
  issues.push(`[fail] ${error.message}`);
  await page.screenshot({ path: 'qa/search-radio/99-failure.png' }).catch(() => {});
} finally {
  await app.close();
  fs.rmSync(profile, { recursive: true, force: true });
}

console.log('[issues]', JSON.stringify(issues, null, 2));
process.exit(issues.length ? 1 : 0);
