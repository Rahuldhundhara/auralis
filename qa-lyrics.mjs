import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const shotsDir = path.resolve('qa/features');
fs.mkdirSync(shotsDir, { recursive: true });
const issues = [];
const shot = async (page, name) => {
  const file = path.join(shotsDir, `lyrics-${name}.png`);
  await page.screenshot({ path: file });
  console.log(`[shot] ${file}`);
};

const app = await electron.launch({
  args: [
    '.',
    `--user-data-dir=${path.join(os.tmpdir(), `auralis-qa-lyrics-${Date.now()}`)}`,
    '--no-sandbox',
    '--ozone-platform=x11',
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
  cwd: process.cwd(),
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1', AURALIS_FORCE_PROD: '1' },
  timeout: 60000,
});
const page = await app.firstWindow({ timeout: 60000 });
page.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') issues.push(`[console] ${message.text()}`);
});
await page.waitForLoadState('domcontentloaded');
await page.waitForSelector('.onboarding-layer, .sidebar', { timeout: 60000 });
if (await page.locator('.onboarding-layer').count()) {
  await page.locator('.onboarding-nav-primary').click();
  await page.waitForSelector('.genre-card', { timeout: 15000 });
  const cards = page.locator('.genre-card');
  await cards.nth(0).click();
  await cards.nth(1).click();
  await page.locator('.onboarding-nav-primary').click();
  await page.waitForTimeout(600);
  await page.locator('.onboarding-nav-skip').click();
  await page.waitForSelector('.sidebar-item', { timeout: 30000 });
  await page.waitForTimeout(1000);
}

// Search for a song with well-known synced lyrics.
await page.locator('.search-field input').first().fill('Blinding Lights');
await page.keyboard.press('Enter');
await page.waitForTimeout(3500);
const firstTrack = page.locator('.track-row').first();
if (!(await firstTrack.count())) {
  issues.push('[search] no track results for Blinding Lights');
} else {
  await firstTrack.click();
  await page.waitForSelector('.player-art-button', { timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(8000);
  const title = await page.locator('.player-title').first().innerText().catch(() => 'none');
  console.log('[playback] current track:', title);
}

// Open Now Playing on the Lyrics tab (if the click did not open it already).
if (!(await page.locator('.now-playing').count())) {
  await page.locator('.player-art-button').first().click();
  await page.waitForTimeout(800);
} else {
  console.log('[nowplaying] opened automatically');
}
const lyricsTab = page.locator('.np-tab', { hasText: 'Lyrics' });
if (await lyricsTab.count()) await lyricsTab.click();

// Wait for real lyrics to load.
let lyrics = { count: 0, overlap: 0, active: 0, sample: [] };
for (let attempt = 0; attempt < 12; attempt++) {
  await page.waitForTimeout(2500);
  lyrics = await page.evaluate(() => {
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
      sample: lines.slice(0, 3).map((line) => (line.textContent || '').trim().slice(0, 80)),
    };
  });
  if (lyrics.count > 0) break;
}
console.log('[lyrics]', JSON.stringify(lyrics));
if (!lyrics.count) issues.push('[lyrics] no lines rendered for Blinding Lights');
if (lyrics.overlap) issues.push(`[lyrics] ${lyrics.overlap} overlapping lines`);
await shot(page, 'panel');

// Seek to a different position and confirm the active line follows immediately.
const before = await page.evaluate(() => {
  const lines = Array.from(document.querySelectorAll('.lyric-line'));
  const index = lines.findIndex((line) => line.classList.contains('is-active'));
  return { index, position: document.querySelectorAll('.seek-range')[0]?.value || '' };
});
await page.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll('.seek-range'));
  const np = inputs.find((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 80 && getComputedStyle(el).display !== 'none';
  });
  if (!np) return;
  const duration = Number(np.max) || 200;
  const target = Math.max(0, duration * 0.55);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(np, String(target));
  np.dispatchEvent(new Event('input', { bubbles: true }));
  np.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(1200);
const after = await page.evaluate(() => {
  const lines = Array.from(document.querySelectorAll('.lyric-line'));
  const index = lines.findIndex((line) => line.classList.contains('is-active'));
  return {
    index,
    activeText: index >= 0 ? lines[index].textContent.trim().slice(0, 90) : 'none',
    position: document.querySelectorAll('.seek-range')[0]?.value || '',
    currentTime: document.querySelector('.np-tab-body') ? 'ok' : 'ok',
  };
});
console.log('[seek-before]', JSON.stringify(before));
console.log('[seek-after]', JSON.stringify(after));
if (lyrics.count > 3 && after.index >= 0 && after.index <= before.index) {
  issues.push(`[lyrics] active line did not advance on seek (${before.index} -> ${after.index})`);
}
await shot(page, 'after-seek');

await app.close();
console.log('\n[issues]', issues.length ? JSON.stringify(issues, null, 2) : 'none');
if (issues.length) process.exitCode = 1;
