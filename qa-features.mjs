import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const shotsDir = path.resolve('qa/features');
fs.mkdirSync(shotsDir, { recursive: true });
const issues = [];
let step = 0;
const shot = async (page, name) => {
  step += 1;
  const file = path.join(shotsDir, `${String(step).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  console.log(`[shot] ${file}`);
};

const userData = path.join(os.tmpdir(), `auralis-qa-features-${Date.now()}`);
const app = await electron.launch({
  args: [
    '.',
    `--user-data-dir=${userData}`,
    '--no-sandbox',
    '--ozone-platform=x11',
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
  cwd: process.cwd(),
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1', AURALIS_FORCE_PROD: '1' },
  timeout: 60000,
});
app.on('window', (win) => {
  win.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
  win.on('console', (message) => {
    if (message.type() === 'error') issues.push(`[console] ${message.text()}`);
  });
});

const page = await app.firstWindow({ timeout: 60000 });
page.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') issues.push(`[console] ${message.text()}`);
});
await page.waitForLoadState('domcontentloaded');
await page.waitForSelector('.app-shell', { timeout: 60000 });
await page.waitForSelector('.onboarding-layer, .sidebar', { timeout: 60000 });
await page.waitForTimeout(500);

// Complete first-run onboarding with the shared genre cards.
if (await page.locator('.onboarding-layer').count()) {
  console.log('[onboarding] first run detected');
  await page.locator('.onboarding-nav-primary').click();
  await page.waitForSelector('.genre-card', { timeout: 15000 });
  const cards = page.locator('.genre-card');
  console.log('[onboarding] genre cards:', await cards.count());
  if ((await cards.count()) >= 2) {
    await cards.nth(0).click();
    await cards.nth(1).click();
  }
  await shot(page, 'onboarding-genres');
  await page.locator('.onboarding-nav-primary').click();
  await page.waitForTimeout(700);
  await page.locator('.onboarding-nav-skip').click();
  await page.waitForSelector('.sidebar-item', { timeout: 30000 });
  await page.waitForTimeout(1500);
}

// Sidebar: Radio gone, Podcasts present and active when selected.
const sidebar = await page.evaluate(() => ({
  labels: Array.from(document.querySelectorAll('.sidebar-item .sidebar-label')).map((el) => el.textContent),
  radio: Array.from(document.querySelectorAll('.sidebar-item')).some((el) => /Radio/.test(el.textContent || '')),
  podcasts: Array.from(document.querySelectorAll('.sidebar-item')).some((el) => /Podcasts/.test(el.textContent || '')),
}));
console.log('[sidebar]', JSON.stringify(sidebar));
if (sidebar.radio) issues.push('[sidebar] Radio item still present');
if (!sidebar.podcasts) issues.push('[sidebar] Podcasts item missing');

await page.locator('.sidebar-item', { hasText: 'Podcasts' }).first().click();
await page.waitForTimeout(3500);
const podcasts = await page.evaluate(() => ({
  active: document.querySelector('.sidebar-item.is-active')?.textContent || '',
  hero: Boolean(document.querySelector('.podcasts-hero')),
  categories: document.querySelectorAll('.podcasts-category').length,
  shows: document.querySelectorAll('.podcast-quick-card').length,
  body: document.body.innerText.slice(0, 400),
}));
console.log('[podcasts]', JSON.stringify(podcasts));
if (!podcasts.hero) issues.push('[podcasts] hero missing');
if (!/Podcasts/.test(podcasts.active)) issues.push(`[podcasts] active item is ${podcasts.active}`);
await shot(page, 'podcasts');

// Explore redesign.
await page.locator('.sidebar-item', { hasText: 'Explore' }).first().click();
await page.waitForTimeout(3500);
const explore = await page.evaluate(() => ({
  active: document.querySelector('.sidebar-item.is-active')?.textContent || '',
  hero: Boolean(document.querySelector('.explore-cine')),
  categories: document.querySelectorAll('.explore-mood').length,
  artists: 0,
  sections: document.querySelectorAll('.explore-section').length,
  shelves: document.querySelectorAll('.shelf').length,
  body: document.body.innerText.slice(0, 500),
}));
console.log('[explore]', JSON.stringify(explore));
if (!explore.hero) issues.push('[explore] hero missing');
if (!/Explore/.test(explore.active)) issues.push(`[explore] active item is ${explore.active}`);
await shot(page, 'explore');

// Play a track so the player bar is present. Mood cards navigate, so use the
// hero's "Play something new" action, which always resolves to a playable card.
const playButton = page.getByRole('button', { name: /Play my mix/i });
if (await playButton.count()) {
  await playButton.click();
  await page.waitForSelector('.player-art-button', { timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(6000);
  const title = await page.locator('.player-title').first().innerText().catch(() => 'none');
  console.log('[playback] current track:', title);
} else {
  issues.push('[playback] Play something new button missing');
}

// Notification centre.
await page.locator('.top-bell').click();
await page.waitForTimeout(4500);
const notifications = await page.evaluate(() => ({
  panel: Boolean(document.querySelector('.notification-panel')),
  items: document.querySelectorAll('.notification-item').length,
  unread: document.querySelectorAll('.notification-item.is-unread').length,
  empty: document.querySelector('.notification-empty')?.textContent || '',
  loading: Boolean(document.querySelector('.notification-loading')),
  body: document.querySelector('.notification-panel')?.innerText.slice(0, 500) || '',
}));
console.log('[notifications]', JSON.stringify(notifications));
if (!notifications.panel) issues.push('[notifications] panel missing');
await shot(page, 'notifications');
await page.keyboard.press('Escape');

// Volume control in the player bar and now playing.
const playerVolume = await page.evaluate(() => {
  const control = document.querySelector('.player-bar .volume-control');
  const range = document.querySelector('.player-bar .volume-range');
  if (!control || !range) return null;
  const rect = range.getBoundingClientRect();
  return {
    visible: getComputedStyle(control).display !== 'none',
    icons: control.querySelectorAll('.icon-btn').length,
    rangeWidth: Math.round(rect.width),
    rangeDisplay: getComputedStyle(range).display,
  };
});
console.log('[player-volume]', JSON.stringify(playerVolume));
if (!playerVolume || !playerVolume.visible) issues.push('[volume] player volume missing');
if (playerVolume && playerVolume.icons < 2) issues.push('[volume] expected mute + max icons');

const artButton = page.locator('.player-art-button').first();
if (await artButton.count()) {
  await artButton.click();
  await page.waitForTimeout(900);
  const npVolume = await page.evaluate(() => {
    const control = document.querySelector('.np-transport-row .volume-control');
    const range = document.querySelector('.np-transport-row .volume-range');
    if (!control || !range) return null;
    const rect = range.getBoundingClientRect();
    return {
      visible: getComputedStyle(control).display !== 'none',
      rangeWidth: Math.round(rect.width),
      rangeDisplay: getComputedStyle(range).display,
      icons: control.querySelectorAll('.icon-btn').length,
    };
  });
  console.log('[now-playing-volume]', JSON.stringify(npVolume));
  if (!npVolume || !npVolume.visible || npVolume.rangeWidth < 40) issues.push('[volume] now-playing volume hidden');
  const lyricsTab = page.locator('.np-tab', { hasText: 'Lyrics' });
  if (await lyricsTab.count()) {
    await lyricsTab.click();
    await page.waitForTimeout(8000);
    const lyrics = await page.evaluate(() => {
      const lines = Array.from(document.querySelectorAll('.lyric-line'));
      const rects = lines.map((line) => line.getBoundingClientRect());
      let overlap = 0;
      for (let i = 1; i < rects.length; i++) {
        if (rects[i].top < rects[i - 1].bottom - 1) overlap++;
      }
      return {
        count: lines.length,
        overlap,
        active: document.querySelectorAll('.lyric-line.is-active').length,
        joined: document.body.innerText.includes('♪'),
        sample: lines.slice(0, 3).map((line) => (line.textContent || '').trim().slice(0, 40)),
      };
    });
    console.log('[lyrics]', JSON.stringify(lyrics));
    if (lyrics.count > 3 && lyrics.overlap > 0) issues.push('[lyrics] lines overlap or clip');
    await shot(page, 'now-playing-lyrics');
  }
  await shot(page, 'now-playing');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

// Customize Your Taste reuses the same genre cards.
await page.locator('.top-customize-taste').click();
await page.waitForTimeout(600);
await page.locator('.onboarding-nav-primary').click();
await page.waitForTimeout(500);
const customize = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('.genre-card'));
  const sample = cards[0];
  return {
    count: cards.length,
    icons: document.querySelectorAll('.genre-card-art svg').length,
    gradients: cards.filter((card) => Boolean(card.getAttribute('style')?.includes('--genre-from'))).length,
    selected: document.querySelectorAll('.genre-card.is-active').length,
    sampleStyle: sample?.getAttribute('style') || '',
  };
});
console.log('[customize-genres]', JSON.stringify(customize));
if (customize.count < 20) issues.push('[genres] expected all genres in Customize Your Taste');
if (customize.icons < 20) issues.push('[genres] icons missing');
if (customize.gradients < 20) issues.push('[genres] per-genre gradients missing');
await shot(page, 'customize-genres');
await page.locator('.onboarding-close').click();
await page.waitForTimeout(500);

console.log('\n[issues]', issues.length ? JSON.stringify(issues, null, 2) : 'none');
await app.close();
if (issues.length) process.exitCode = 1;
