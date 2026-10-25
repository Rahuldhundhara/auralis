import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const shotsDir = path.resolve('qa', 'full');
fs.mkdirSync(shotsDir, { recursive: true });
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-qa-full-'));
const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-qa-full-dl-'));

const launch = () =>
  electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: process.cwd(),
    env: { ...process.env, AURALIS_FORCE_PROD: '1' },
    timeout: 60000,
  });

let app = await launch();
let page = await app.firstWindow({ timeout: 60000 });

const issues = [];
const checks = [];
let step = 0;
function watchPage(target) {
  target.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
  target.on('console', (message) => {
    if (message.type() === 'error') issues.push(`[console] ${message.text()}`);
  });
  target.on('response', (response) => {
    if (response.status() >= 400) issues.push(`[http ${response.status()}] ${response.url()}`);
  });
  target.on('requestfailed', (request) => {
    // The media proxy intentionally aborts the old range request when the
    // player switches tracks; Chromium reports that as ERR_ABORTED.
    if (request.url().startsWith('auralis-media://') && request.failure()?.errorText === 'net::ERR_ABORTED') return;
    issues.push(`[requestfailed] ${request.url()} ${request.failure()?.errorText || ''}`);
  });
}
watchPage(page);

async function shot(name) {
  step += 1;
  await page.screenshot({ path: path.join(shotsDir, `${String(step).padStart(2, '0')}-${name}.png`) });
}

async function waitIdle(min = 500, max = 18000) {
  await page.waitForTimeout(min);
  const started = Date.now();
  while (Date.now() - started < max) {
    if (!(await page.locator('.skeleton').count())) return;
    await page.waitForTimeout(300);
  }
}

async function check(name, fn) {
  try {
    const detail = await fn();
    checks.push({ name, ok: true, detail });
    console.log(`[pass] ${name}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`);
    return detail;
  } catch (error) {
    checks.push({ name, ok: false, detail: error.message });
    issues.push(`[check] ${name}: ${error.message}`);
    console.log(`[fail] ${name}: ${error.message}`);
    return undefined;
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function sidebar(label) {
  await page.locator('.sidebar-item', { hasText: label }).first().click();
  await waitIdle(700);
}

async function searchFor(query) {
  const input = page.locator('.top-search input').first();
  await input.fill(query);
  await input.press('Enter');
  await page.waitForSelector('.search-page', { timeout: 25000 });
  await waitIdle(800);
}

async function chip(label) {
  await page.locator('.chips .chip', { hasText: label }).first().click();
  // Switching filters keeps the previous response on screen while the new
  // request is in flight. Wait for the selected chip and real result rows
  // instead of counting immediately, otherwise fast filters race the request.
  await page.waitForFunction(
    (value) => {
      const selected = Array.from(document.querySelectorAll('.chips .chip')).find(
        (element) => element.textContent?.trim() === value,
      );
      if (!selected?.classList.contains('is-selected')) return false;
      return document.querySelectorAll('.search-page .track-row, .search-page .media-card').length > 0;
    },
    label,
    { timeout: 30000 },
  );
  await waitIdle(400);
}

async function back() {
  await page.locator('.top-nav-buttons button[aria-label="Go back"]').click();
  await waitIdle(500);
}

async function openFirstCard() {
  const card = page.locator('.media-card .card-art-button').first();
  await card.click();
  await waitIdle(900);
}

async function count(selector) {
  return page.locator(selector).count();
}

async function api(fn) {
  return page.evaluate(fn);
}

try {
  // The home feed is a live network call. If YouTube Music hiccups on the
  // first attempt, exercise the app's Try again control before failing QA.
  let homeReady = false;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.waitForSelector('.home-hero', { timeout: 30000 });
      homeReady = true;
      break;
    } catch (error) {
      const retry = page.getByRole('button', { name: 'Try again' });
      if ((await retry.count()) === 0) throw error;
      console.log(`[retry] home load attempt ${attempt} failed; clicking Try again`);
      await retry.first().click();
      await page.waitForTimeout(1500);
    }
  }
  if (!homeReady) throw new Error('home did not load after retries');
  await waitIdle(1200);
  await page.evaluate(async (dir) => {
    const current = await window.auralis.settings.get();
    await window.auralis.settings.set({ downloadDir: dir, theme: 'dark', eq: { ...current.eq, enabled: false } });
  }, downloadDir);

  await check('home renders hero and shelves', async () => {
    const shelves = await count('.home-page .shelf');
    const cards = await count('.home-page .media-card');
    expect(shelves > 0, 'no home shelves');
    expect(cards > 0, 'no home cards');
    return { shelves, cards };
  });
  await shot('home');

  await check('explore tabs render live shelves', async () => {
    await sidebar('Explore');
    await page.waitForSelector('.explore-page');
    const result = {};
    for (const label of ['Explore', 'Charts', 'New', 'Moods']) {
      await page.locator('.explore-tab', { hasText: label }).first().click();
      await waitIdle(900);
      result[label] = {
        shelves: await count('.explore-page .shelf'),
        cards: await count('.explore-page .media-card'),
      };
      expect(result[label].shelves + result[label].cards > 0, `${label} is empty`);
    }
    const moodCards = await page.locator('.mood-card').count();
    result.moodCards = moodCards;
    expect(moodCards >= 40, `only ${moodCards} mood cards`);
    return result;
  });
  await shot('explore-moods');

  await check('search all filters return results', async () => {
    await searchFor('Arijit Singh');
    const result = { all: await count('.search-page .track-row') + await count('.search-page .media-card') };
    expect(result.all > 0, 'All filter empty');
    for (const label of ['Songs', 'Videos', 'Albums', 'Artists', 'Playlists', 'Podcasts']) {
      await chip(label);
      result[label] = (await count('.search-page .track-row')) + (await count('.search-page .media-card'));
      expect(result[label] > 0, `${label} filter empty`);
    }
    return result;
  });
  await shot('search-filters');

  await check('song playback starts and advances', async () => {
    await chip('Songs');
    const before = await page.locator('.player-title').first().textContent().catch(() => '');
    await page.locator('.search-page .track-row').first().click();
    let time = '0:00';
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await page.waitForTimeout(500);
      time = (await page.locator('.seek-bar .time').first().textContent().catch(() => '0:00')) || '0:00';
      if (time !== '0:00') break;
    }
    const title = await page.locator('.player-title').first().textContent();
    const error = await page.locator('.player-error').first().textContent().catch(() => '');
    expect(title && title.trim().length > 0, 'player title is empty');
    expect(!error, `player error: ${error}`);
    expect(time !== '0:00', `playback position did not move (${time})`);
    return { before, title, time };
  });
  await shot('playing');

  await check('liked song appears in library and can be unliked', async () => {
    const before = (await api(() => window.auralis.library.get())).liked.length;
    await page.locator('.track-row.is-current .track-like').first().click();
    await page.waitForTimeout(600);
    const afterLike = (await api(() => window.auralis.library.get())).liked.length;
    expect(afterLike === before + 1, `like count ${before} -> ${afterLike}`);
    await page.locator('.sidebar-item', { hasText: 'Liked' }).first().click();
    await page.waitForSelector('.liked-page');
    await waitIdle(500);
    expect((await count('.liked-page .track-row')) >= 1, 'liked page has no rows');
    await page.locator('.liked-page .track-row.is-current .track-like').first().click();
    await page.waitForTimeout(500);
    const afterUnlike = (await api(() => window.auralis.library.get())).liked.length;
    expect(afterUnlike === before, `unlike count ${afterUnlike}, expected ${before}`);
    return { before, afterLike, afterUnlike };
  });

  await check('search result starts related radio and auto-continues', async () => {
    await searchFor('Tainu Khabar Nahi');
    await chip('Songs');
    const results = await count('.search-page .track-row');
    await page.locator('.search-page .track-row').first().click();
    await page.waitForTimeout(2600);
    await page.locator('.player-right button[aria-label="Queue"]').click();
    await page.waitForSelector('.queue-drawer');
    const rows = await count('.queue-drawer .queue-row');
    const radio = await count('.queue-radio');
    expect(rows > results, `search results were not replaced by radio: ${rows} <= ${results}`);
    expect(radio === 1, 'radio badge missing');

    await page.locator('.queue-section').nth(1).locator('.text-button', { hasText: 'Clear' }).click();
    await page.waitForTimeout(500);
    const remaining = await page.locator('.queue-section').nth(1).locator('.queue-row').count();
    expect(remaining === 0, `upcoming queue was not cleared: ${remaining}`);
    await page.locator('.queue-drawer button[aria-label="Close queue"]').click();

    const before = (await page.locator('.player-title').first().textContent())?.trim();
    await page.locator('.transport button[aria-label="Next"]').click();
    let after = before;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await page.waitForTimeout(500);
      after = (await page.locator('.player-title').first().textContent())?.trim();
      if (after && after !== before) break;
    }
    expect(after && after !== before, `auto radio did not start: ${before} -> ${after}`);

    await page.locator('.player-right button[aria-label="Queue"]').click();
    await page.waitForSelector('.queue-drawer');
    const radioRows = await count('.queue-drawer .queue-row');
    const autoRadio = await count('.queue-radio');
    await page.locator('.queue-drawer button[aria-label="Close queue"]').click();
    expect(radioRows > 1, `auto radio queue is empty: ${radioRows}`);
    expect(autoRadio === 1, 'auto radio badge missing');
    return { results, rows, remaining, before, after, radioRows };
  });

  await check('album detail opens with tracks and back works', async () => {
    await searchFor('Kesariya');
    await chip('Albums');
    await openFirstCard();
    const hero = await page.locator('.detail-hero h1').first().textContent();
    const rows = await count('.detail-track-list .track-row');
    expect(hero && hero.trim().length > 0, 'album hero missing');
    expect(rows > 0, 'album has no tracks');
    await back();
    expect(await count('.search-page'), 'back did not return to search');
    return { hero, rows };
  });

  await check('artist detail opens with sections', async () => {
    await searchFor('Arijit Singh');
    await chip('Artists');
    await openFirstCard();
    const hero = await page.locator('.detail-hero h1').first().textContent();
    expect(hero && hero.trim().length > 0, 'artist hero missing');
    const shelves = await count('.detail-page .shelf, .detail-related, .detail-tracks');
    expect(shelves > 0, 'artist page has no content');
    await back();
    return { hero, shelves };
  });

  await check('playlist detail opens live playlist', async () => {
    await searchFor('Bollywood');
    await chip('Playlists');
    await openFirstCard();
    const hero = await page.locator('.detail-hero h1').first().textContent();
    const rows = await count('.detail-track-list .track-row');
    expect(hero && hero.trim().length > 0, 'playlist hero missing');
    expect(rows > 0, 'playlist has no tracks');
    await back();
    return { hero, rows };
  });

  await check('podcast detail opens episodes', async () => {
    await searchFor('The Daily');
    await chip('Podcasts');
    await openFirstCard();
    const hero = await page.locator('.detail-hero h1').first().textContent();
    const rows = await count('.detail-track-list .track-row');
    expect(hero && hero.trim().length > 0, 'podcast hero missing');
    expect(rows > 0, 'podcast has no episodes');
    await back();
    return { hero, rows };
  });
  await shot('podcast-detail');

  await check('queue can reorder and remove upcoming tracks', async () => {
    await searchFor('Arijit Singh');
    await chip('Songs');
    await page.locator('.search-page .track-row').nth(1).click();
    await page.locator('.player-right button[aria-label="Queue"]').click();
    await page.waitForSelector('.queue-drawer');
    try {
      // Related radio fills in asynchronously; wait for real upcoming rows
      // instead of racing the live request with a fixed sleep.
      await page.waitForFunction(
        () => {
          const sections = document.querySelectorAll('.queue-section');
          return Boolean(sections[1] && sections[1].querySelectorAll('.queue-row').length >= 2);
        },
        { timeout: 20000 },
      );
      const upcoming = page.locator('.queue-section').nth(1).locator('.queue-row .queue-title');
      const before = (await upcoming.allTextContents()).map((value) => value.trim());
      expect(before.length >= 2, `not enough queued songs: ${before.length}`);
      await page.locator('.queue-section').nth(1).locator('.queue-row').first().locator('button[aria-label="Move down"]').click();
      await page.waitForTimeout(500);
      const after = (await upcoming.allTextContents()).map((value) => value.trim());
      expect(after[0] === before[1] && after[1] === before[0], `queue order unchanged: ${before.slice(0, 2)} -> ${after.slice(0, 2)}`);
      await page.locator('.queue-section').nth(1).locator('.queue-row').first().locator('button[aria-label="Remove from queue"]').click();
      await page.waitForTimeout(400);
      const afterRemove = (await upcoming.allTextContents()).map((value) => value.trim());
      expect(afterRemove.length === before.length - 1, `remove failed: ${before.length} -> ${afterRemove.length}`);
      return { before, after, afterRemove };
    } finally {
      const close = page.locator('.queue-drawer button[aria-label="Close queue"]');
      if (await close.count()) await close.click().catch(() => {});
      else await page.keyboard.press('Escape').catch(() => {});
    }
  });

  await check('sleep timer sets, expires and clears', async () => {
    const button = page.locator('.player-right button[aria-label^="Sleep timer"]');
    await button.click();
    await page.waitForSelector('.context-menu');
    await page.locator('.context-menu .menu-item', { hasText: '5 minutes' }).first().click();
    await page.waitForTimeout(400);
    const label = await button.getAttribute('aria-label');
    expect(label?.includes('5 min'), `timer label missing countdown: ${label}`);

    await page.evaluate(() => {
      window.__auralisRealNow = Date.now;
      Date.now = () => window.__auralisRealNow() + 6 * 60 * 1000;
    });
    await page.waitForTimeout(1600);
    const afterExpiry = await button.getAttribute('aria-label');
    const playLabel = await page.locator('.play-button').getAttribute('aria-label');
    expect(afterExpiry === 'Sleep timer', `timer did not clear: ${afterExpiry}`);
    expect(playLabel === 'Play', `playback did not pause: ${playLabel}`);
    await page.evaluate(() => {
      if (window.__auralisRealNow) Date.now = window.__auralisRealNow;
    });

    await button.click();
    await page.waitForSelector('.context-menu');
    await page.locator('.context-menu .menu-item', { hasText: 'End of track' }).first().click();
    await page.waitForTimeout(300);
    expect((await button.getAttribute('aria-label'))?.includes('end of track'), 'end-of-track timer did not set');
    await button.click();
    await page.waitForSelector('.context-menu');
    await page.locator('.context-menu .menu-item', { hasText: 'Off' }).first().click();
    await page.waitForTimeout(300);
    return { label, afterExpiry, playLabel };
  });

  await check('local playlist create, add, reorder and remove', async () => {
    await sidebar('Library');
    await page.waitForSelector('.library-page');
    await page.locator('button[aria-label="Create playlist"]').click().catch(async () => {
      await page.locator('.library-hero-actions button', { hasText: 'New playlist' }).click();
    });
    await page.waitForSelector('.modal');
    await page.locator('.modal input').first().fill('QA Full Drive');
    await page.locator('.modal button', { hasText: 'Create playlist' }).click();
    await page.waitForTimeout(1000);

    await searchFor('Tainu Khabar Nahi');
    await chip('Songs');
    for (const index of [0, 1]) {
      const row = page.locator('.search-page .track-row').nth(index);
      await row.hover();
      await row.locator('.track-more').click();
      await page.waitForSelector('.context-menu');
      await page.locator('.context-menu .menu-item', { hasText: 'Add to playlist' }).first().click();
      await page.waitForSelector('.playlist-picker');
      await page.locator('.playlist-picker button', { hasText: 'QA Full Drive' }).first().click();
      await page.waitForTimeout(600);
    }

    await page.locator('.sidebar-playlist', { hasText: 'QA Full Drive' }).first().click();
    await page.waitForSelector('.local-playlist-page');
    await waitIdle(500);
    const before = (await page.locator('.local-playlist-page .track-title').allTextContents()).map((value) => value.trim());
    expect(before.length === 2, `expected 2 playlist tracks, got ${before.length}`);

    const firstRow = page.locator('.local-playlist-page .track-row').first();
    await firstRow.hover();
    await firstRow.locator('.track-more').click();
    await page.waitForSelector('.context-menu');
    await page.locator('.context-menu .menu-item', { hasText: 'Move down' }).first().click();
    await page.waitForTimeout(500);
    const moved = (await page.locator('.local-playlist-page .track-title').allTextContents()).map((value) => value.trim());
    expect(moved[0] === before[1] && moved[1] === before[0], 'local playlist reorder failed');

    // Use the row's remove control so the assertion tests playlist state
    // rather than Playwright's stability check on the animated context menu.
    const secondRow = page.locator('.local-playlist-page .track-row').nth(1);
    await secondRow.hover();
    await secondRow.locator('button[aria-label="Remove from playlist"]').click();
    await page.waitForTimeout(600);
    const afterRemove = (await page.locator('.local-playlist-page .track-title').allTextContents()).map((value) => value.trim());
    expect(afterRemove.length === 1, `playlist remove failed: ${afterRemove.length}`);
    return { before, moved, afterRemove };
  });
  await shot('local-playlist');

  await check('download completes and plays from disk', async () => {
    await searchFor('Tainu Khabar Nahi');
    await chip('Songs');
    const row = page.locator('.search-page .track-row').first();
    await row.hover();
    await row.locator('.track-more').click();
    await page.waitForSelector('.context-menu');
    await page.locator('.context-menu .menu-item', { hasText: 'Download' }).first().click();

    let downloaded;
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await page.waitForTimeout(2000);
      const list = await api(() => window.auralis.library.getDownloads());
      downloaded = list.find((entry) => entry.track.title.includes('Tainu Khabar') && entry.status === 'done');
      if (downloaded) break;
    }
    expect(downloaded, 'download did not complete in 180s');
    expect(downloaded.path && fs.existsSync(downloaded.path), 'downloaded file is missing');
    expect(fs.statSync(downloaded.path).size > 100000, 'downloaded file is too small');

    await sidebar('Downloads');
    await page.waitForSelector('.downloads-page');
    await waitIdle(500);
    expect((await count('.download-row')) >= 1, 'downloads page has no rows');
    await page.locator('.download-row .download-main').first().click();
    await page.waitForTimeout(3500);
    const title = await page.locator('.player-title').first().textContent();
    expect(title && title.includes('Tainu Khabar'), `download did not play: ${title}`);
    return { title, path: downloaded.path, size: downloaded.size };
  });
  await shot('downloads');

  await check('settings tabs and theme persist', async () => {
    await sidebar('Settings');
    await page.waitForSelector('.settings-page');
    const tabs = ['General', 'Appearance', 'Playback & EQ', 'Lyrics', 'Downloads', 'Integrations', 'Account', 'About'];
    const found = {};
    for (const tab of tabs) {
      await page.locator('.settings-nav-item', { hasText: tab }).first().click();
      await waitIdle(350);
      found[tab] = (await count('.settings-card')) + (await count('.about-page, .account-card, .integration-card'));
      expect(found[tab] > 0, `${tab} settings tab is empty`);
    }
    await page.locator('.settings-nav-item', { hasText: 'Appearance' }).first().click();
    await waitIdle(300);
    await page.locator('.theme-card.theme-light').click();
    await page.waitForTimeout(600);
    const light = await api(async () => (await window.auralis.settings.get()).theme);
    await page.locator('.theme-card.theme-dark').click();
    await page.waitForTimeout(600);
    const dark = await api(async () => (await window.auralis.settings.get()).theme);
    expect(light === 'light' && dark === 'dark', `theme persist failed: ${light}, ${dark}`);
    return { tabs: found, light, dark };
  });
  await shot('settings');

  await check('lyrics panel loads a real provider', async () => {
    await page.locator('.player-right button[aria-label="Lyrics"]').click();
    await page.waitForSelector('.now-playing');
    let panel = '';
    let provider = '';
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await page.waitForTimeout(500);
      panel = await page.locator('.np-panel').innerText().catch(() => '');
      provider = await page.locator('.np-panel .lyrics-provider').first().textContent().catch(() => '');
      if (!panel.includes('Finding lyrics')) break;
    }
    expect(panel.trim().length > 0, 'lyrics/queue panel is blank');
    expect(!panel.includes('Finding lyrics'), 'lyrics search did not finish within 45s');
    expect(provider.trim().length > 0, 'no lyrics provider returned a result');
    await page.screenshot({ path: path.join(shotsDir, 'lyrics-loaded.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    return { provider, preview: panel.slice(0, 140) };
  });

  await check('now playing queue tab opens', async () => {
    await page.locator('.player-right button[aria-label="Open now playing"]').click();
    await page.waitForSelector('.now-playing');
    await page.locator('.np-tabs button', { hasText: 'Queue' }).click();
    await page.waitForTimeout(500);
    const queueRows = await count('.now-playing .queue-row');
    expect(queueRows >= 1, 'now playing queue is empty');
    await page.keyboard.press('Escape');
    return { queueRows };
  });

  await check('search history is recorded', async () => {
    await sidebar('Search');
    await page.waitForSelector('.search-landing');
    const chips = await count('.search-history-chip');
    expect(chips > 0, 'no search history chips');
    return { chips };
  });

  await check('downloads page filters and stats', async () => {
    await sidebar('Downloads');
    await page.waitForSelector('.downloads-page');
    const rows = await count('.download-row');
    const stats = await count('.download-stat');
    expect(rows > 0, 'no download rows');
    expect(stats >= 3 && stats <= 4, `expected 3-4 stats, got ${stats}`);
    await page.locator('.downloads-toolbar .library-tab', { hasText: 'Completed' }).click();
    await page.waitForTimeout(300);
    expect((await count('.download-row')) > 0, 'completed filter empty');
    await page.locator('.downloads-toolbar .library-tab', { hasText: 'In progress' }).click();
    await page.waitForTimeout(300);
    expect((await count('.download-row')) === 0, 'in-progress filter should be empty');
    return { rows, stats };
  });

  await check('signed-out account UI opens safely', async () => {
    await sidebar('Settings');
    await page.locator('.settings-nav-item', { hasText: 'Account' }).click();
    await waitIdle(400);
    const text = await page.locator('.settings-content, .content-scroll').innerText();
    expect(text.toLowerCase().includes('sign in') || text.toLowerCase().includes('connect') || text.toLowerCase().includes('cookie'), 'account UI has no sign-in affordance');
    return text.slice(0, 180);
  });

  const savedQueueTitle = await page.locator('.player-title').first().textContent().catch(() => '');

  await app.close();
  await new Promise((resolve) => setTimeout(resolve, 1200));

  app = await launch();
  page = await app.firstWindow({ timeout: 60000 });
  watchPage(page);

  await check('restart restores queue and theme', async () => {
    await page.waitForSelector('.app-shell', { timeout: 60000 });
    await page.waitForTimeout(2500);
    const title = await page.locator('.player-title').first().textContent().catch(() => '');
    const theme = await page.evaluate(async () => (await window.auralis.settings.get()).theme);
    expect(title && title.trim().length > 0, 'queue did not restore after restart');
    expect(theme === 'dark', `theme did not restore: ${theme}`);
    return { title, savedQueueTitle, theme };
  });
  await shot('restart-restored');
} catch (error) {
  issues.push(`[fatal] ${error.stack || error.message}`);
  await shot('fatal').catch(() => {});
} finally {
  try {
    await app.close();
  } catch {}
  console.log('[issues]', JSON.stringify(issues, null, 2));
  console.log('[summary]', JSON.stringify({ checks: checks.length, passed: checks.filter((entry) => entry.ok).length, failed: checks.filter((entry) => !entry.ok).length }, null, 2));
  fs.writeFileSync(path.join(shotsDir, 'results.json'), JSON.stringify({ checks, issues }, null, 2));
  setTimeout(() => {
    try {
      fs.rmSync(downloadDir, { recursive: true, force: true });
      fs.rmSync(userData, { recursive: true, force: true });
    } catch (error) {
      console.log('[cleanup]', error.message);
    }
  }, 1500);
}
