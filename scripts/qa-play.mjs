import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

fs.mkdirSync('qa', { recursive: true });
const app = await electron.launch({
  args: ['.', `--user-data-dir=${path.join(process.env.TEMP || '.', 'auralis-qa-userdata2')}`],
  cwd: process.cwd(),
  env: { ...process.env, AURALIS_FORCE_PROD: '1' },
  timeout: 60000,
});
const page = await app.firstWindow({ timeout: 60000 });
const issues = [];
let step = 0;
page.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') issues.push(`[console] ${message.text()}`);
});

async function shot(name) {
  step += 1;
  await page.screenshot({ path: `qa/play-${String(step).padStart(2, '0')}-${name}.png` });
}
async function waitIdle() {
  await page.waitForTimeout(700);
  for (let i = 0; i < 30; i++) {
    const skeletons = await page.locator('.skeleton').count();
    if (!skeletons) return;
    await page.waitForTimeout(400);
  }
}
async function searchFor(query) {
  const input = page.locator('.top-search input').first();
  await input.fill(query);
  await input.press('Enter');
  await page.waitForSelector('.search-page', { timeout: 20000 });
  await waitIdle();
}

try {
  await page.waitForSelector('.app-shell', { timeout: 60000 });
  await page.waitForSelector('.home-hero', { timeout: 30000 });
  await page.waitForTimeout(1200);
  await shot('home');

  await page.locator('.sidebar-item', { hasText: 'Search' }).first().click();
  await page.waitForTimeout(400);
  await searchFor('Tainu Khabar Nahi');
  await shot('search');

  const rows = page.locator('.top-songs .track-row');
  console.log('[search rows]', await rows.count());
  if (await rows.count()) {
    await rows.first().dblclick();
    await page.waitForTimeout(1200);
    for (let i = 0; i < 40; i++) {
      const state = await page.evaluate(() => ({
        title: document.querySelector('.player-title')?.textContent || '',
        error: document.querySelector('.player-error')?.textContent || '',
        audio: [...document.querySelectorAll('audio')].map((a) => ({ paused: a.paused, ready: a.readyState, time: a.currentTime, duration: a.duration, error: a.error?.message })),
      }));
      if (state.audio.some((a) => !a.paused && a.ready >= 2)) break;
      await page.waitForTimeout(500);
    }
    const playing = await page.evaluate(() => ({
      title: document.querySelector('.player-title')?.textContent,
      artist: document.querySelector('.player-artist')?.textContent,
      time: document.querySelector('.player-time')?.textContent,
      error: document.querySelector('.player-error')?.textContent,
      audio: [...document.querySelectorAll('audio')].map((a) => ({ paused: a.paused, ready: a.readyState, time: a.currentTime, duration: a.duration })),
    }));
    console.log('[playing]', JSON.stringify(playing, null, 2));
    await shot('playing');

    await page.locator('.player-art-button').first().click();
    await page.waitForTimeout(900);
    await shot('now-playing');

    const lyricsTab = page.locator('.np-tabs button').filter({ hasText: 'Lyrics' }).first();
    if (await lyricsTab.count()) {
      await lyricsTab.click();
      await page.waitForTimeout(5500);
      await shot('lyrics');
      const lyrics = await page.evaluate(() => ({
        text: document.querySelector('.np-panel')?.innerText?.slice(0, 500),
        empty: document.querySelector('.np-panel .empty-state')?.innerText,
      }));
      console.log('[lyrics]', JSON.stringify(lyrics, null, 2));
    }
    const queueTab = page.locator('.np-tabs button').filter({ hasText: 'Queue' }).first();
    if (await queueTab.count()) {
      await queueTab.click();
      await page.waitForTimeout(900);
      await shot('queue');
      console.log('[queue text]', (await page.locator('.np-panel').innerText()).slice(0, 500));
    }
    await page.keyboard.press('Escape');
  }

  await page.locator('.sidebar-item', { hasText: 'Search' }).first().click();
  await searchFor('Evergreen Songs');
  const albumChip = page.locator('.chip', { hasText: 'Albums' }).first();
  await albumChip.click();
  await waitIdle();
  await shot('album-results');
  const albumCard = page.locator('.media-card .card-art-button').first();
  console.log('[album cards]', await page.locator('.media-card').count());
  if (await albumCard.count()) {
    await albumCard.click();
    await page.waitForTimeout(1800);
    await shot('album-detail');
    console.log('[album detail text]', (await page.locator('.content-scroll').innerText()).slice(0, 700));
    await page.goBack?.().catch(() => {});
    await page.locator('.top-nav-buttons button').first().click();
    await waitIdle();
  }

  await searchFor('Arijit Singh');
  const artistChip = page.locator('.chip', { hasText: 'Artists' }).first();
  await artistChip.click();
  await waitIdle();
  await shot('artist-results');
  const artistCard = page.locator('.media-card .card-art-button').first();
  if (await artistCard.count()) {
    await artistCard.click();
    await page.waitForTimeout(2200);
    await shot('artist-detail');
    console.log('[artist detail text]', (await page.locator('.content-scroll').innerText()).slice(0, 700));
  }
} catch (error) {
  issues.push(`[flow] ${error.message}`);
  await shot('error');
}

console.log('[issues]', issues.slice(0, 30));
await app.close();
