import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

fs.mkdirSync('qa', { recursive: true });
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-qa-extra-'));
const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-qa-downloads-'));
const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
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
  await page.screenshot({ path: `qa/extra-${String(step).padStart(2, '0')}-${name}.png` });
}
async function waitIdle() {
  await page.waitForTimeout(700);
  for (let i = 0; i < 40; i++) {
    if (!(await page.locator('.skeleton').count())) return;
    await page.waitForTimeout(400);
  }
}
async function searchFor(query) {
  await page.locator('.sidebar-item', { hasText: 'Search' }).first().click();
  const input = page.locator('.top-search input').first();
  await input.fill(query);
  await input.press('Enter');
  await page.waitForSelector('.search-page', { timeout: 20000 });
  await waitIdle();
}
async function openRowMenu(index = 0) {
  const row = page.locator('.track-row').nth(index);
  await row.hover();
  await row.locator('.track-more').click();
  await page.waitForSelector('.context-menu', { timeout: 5000 });
}
async function clickMenu(label) {
  await page.locator('.context-menu .menu-item', { hasText: label }).first().click();
  await page.waitForTimeout(500);
}

try {
  await page.waitForSelector('.home-hero', { timeout: 60000 });
  await page.evaluate(async (dir) => {
    const current = await window.auralis.settings.get();
    await window.auralis.settings.set({ downloadDir: dir, theme: 'dark' });
    return current;
  }, downloadDir);

  // Download a real track through the row menu.
  await searchFor('Tainu Khabar Nahi');
  await openRowMenu(0);
  await clickMenu('Download');
  let downloaded = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    await page.waitForTimeout(2000);
    const list = await page.evaluate(() => window.auralis.library.getDownloads());
    downloaded = list.find((entry) => entry.track.title.includes('Tainu Khabar') && entry.status === 'done');
    if (downloaded) break;
  }
  const downloadPath = downloaded?.path;
  console.log('[download]', JSON.stringify({ status: downloaded?.status, path: downloadPath, file: downloadPath ? fs.existsSync(downloadPath) : false, size: downloadPath && fs.existsSync(downloadPath) ? fs.statSync(downloadPath).size : 0 }, null, 2));
  await page.locator('.sidebar-item', { hasText: 'Downloads' }).first().click();
  await page.waitForTimeout(1800);
  await shot('downloads');
  console.log('[downloads page]', (await page.locator('.content-scroll').innerText()).slice(0, 500));

  // Create a local playlist, add two songs, reorder and remove.
  await page.locator('button[aria-label="Create playlist"]').click();
  await page.waitForSelector('.modal');
  await page.locator('.modal input').first().fill('QA Drive');
  await page.locator('.modal button', { hasText: 'Create playlist' }).click();
  await page.waitForTimeout(1200);
  console.log('[created playlist]', await page.locator('.sidebar-playlist').filter({ hasText: 'QA Drive' }).count());

  await searchFor('Tainu Khabar Nahi');
  for (const rowIndex of [0, 1]) {
    await openRowMenu(rowIndex);
    await clickMenu('Add to playlist');
    await page.waitForSelector('.playlist-picker', { timeout: 5000 });
    const picker = page.locator('.playlist-picker button', { hasText: 'QA Drive' }).first();
    console.log('[picker has playlist]', await picker.count());
    await picker.click();
    await page.waitForTimeout(800);
  }

  await page.locator('.sidebar-playlist', { hasText: 'QA Drive' }).first().click();
  await page.waitForSelector('.local-playlist-page', { timeout: 10000 });
  await page.waitForTimeout(900);
  const before = await page.locator('.local-playlist-page .track-row .track-title').allTextContents();
  console.log('[playlist before]', before);
  await openRowMenu(0);
  await clickMenu('Move down');
  await page.waitForTimeout(600);
  const afterMove = await page.locator('.local-playlist-page .track-row .track-title').allTextContents();
  console.log('[playlist after move]', afterMove);
  await openRowMenu(0);
  await clickMenu('Remove from this playlist');
  await page.waitForTimeout(900);
  const afterRemove = await page.locator('.local-playlist-page .track-row .track-title').allTextContents();
  console.log('[playlist after remove]', afterRemove);
  await shot('local-playlist');

  // Podcast detail.
  await searchFor('The Daily');
  await page.locator('.chip', { hasText: 'Podcasts' }).first().click();
  await waitIdle();
  const podcastCards = await page.locator('.media-card').count();
  console.log('[podcast cards]', podcastCards);
  if (podcastCards) {
    await page.locator('.media-card .card-art-button').first().click();
    await page.waitForTimeout(2200);
    const hero = await page.locator('.detail-hero h1').first().textContent().catch(() => '');
    console.log('[podcast hero]', hero);
    await shot('podcast');
  }

  // Theme switching.
  await page.locator('.sidebar-item', { hasText: 'Settings' }).click();
  await page.waitForSelector('.settings-page');
  await page.locator('.settings-nav-item', { hasText: 'Appearance' }).click();
  await page.waitForTimeout(600);
  await page.locator('.theme-card.theme-light').click();
  await page.waitForTimeout(600);
  await shot('theme-light');
  await page.locator('.theme-card.theme-black').click();
  await page.waitForTimeout(600);
  await shot('theme-black');
  await page.locator('.theme-card.theme-dark').click();
  await page.waitForTimeout(400);

  // EQ controls.
  await page.locator('.settings-nav-item', { hasText: 'Playback' }).click();
  await page.waitForTimeout(600);
  const eqToggle = page.locator('.setting-row', { hasText: 'Enable equalizer' }).locator('button[role="switch"]');
  await eqToggle.click();
  await page.waitForTimeout(600);
  await page.locator('.eq-range').nth(0).fill('6').catch(() => {});
  await page.waitForTimeout(500);
  const eq = await page.evaluate(async () => (await window.auralis.settings.get()).eq);
  console.log('[eq]', eq);
  await shot('playback-eq');
  await eqToggle.click();

  // Radio from a track menu.
  await searchFor('Tainu Khabar Nahi');
  await openRowMenu(0);
  await clickMenu('Start radio');
  await page.waitForTimeout(5500);
  const radio = await page.evaluate(async () => {
    const list = await window.auralis.library.getDownloads();
    return { title: document.querySelector('.player-title')?.textContent, queue: document.querySelector('.player-queue-count')?.textContent, downloads: list.length };
  });
  console.log('[radio]', radio);
} catch (error) {
  issues.push(`[flow] ${error.message}`);
  await shot('error');
}

console.log('[issues]', issues.slice(0, 40));
await app.close();
setTimeout(() => {
  try {
    fs.rmSync(downloadDir, { recursive: true, force: true });
    fs.rmSync(userData, { recursive: true, force: true });
  } catch (error) {
    console.log('[cleanup]', error.message);
  }
}, 1200);
