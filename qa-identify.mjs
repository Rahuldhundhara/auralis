import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const shotsDir = path.resolve('qa/features');
fs.mkdirSync(shotsDir, { recursive: true });
const issues = [];

const app = await electron.launch({
  args: [
    '.',
    `--user-data-dir=${path.join(os.tmpdir(), `auralis-qa-mic-${Date.now()}`)}`,
    '--no-sandbox',
    '--ozone-platform=x11',
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
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

await page.locator('.identify-inline').first().click();
await page.waitForSelector('.recognition-modal', { timeout: 10000 });
for (let attempt = 0; attempt < 20; attempt++) {
  await page.waitForTimeout(300);
  const cls = (await page.locator('.mic-orb').getAttribute('class')) || '';
  if (cls.includes('is-recording')) break;
}
const listening = await page.evaluate(() => ({
  live: document.querySelector('.recognition-live')?.textContent?.trim() || '',
  indeterminate: Boolean(document.querySelector('.recognition-progress.is-indeterminate')),
  micLevel: getComputedStyle(document.querySelector('.mic-orb')).getPropertyValue('--mic-level'),
}));
console.log('[mic] listen state:', JSON.stringify(listening));
if (!listening.live) issues.push('[mic] live listening status missing');
await page.screenshot({ path: path.join(shotsDir, 'identify-listening.png') });

// Wait for the automatic attempt to settle into a result (or an error).
let outline = '';
for (let attempt = 0; attempt < 60; attempt++) {
  await page.waitForTimeout(500);
  outline = (await page.evaluate(() => document.body.innerText));
  if (await page.locator('.recognize-info').count()) break;
  if (await page.locator('.recognize-error').count()) break;
}
const result = await page.evaluate(() => ({
  matched: Boolean(document.querySelector('.recognize-info')),
  title: document.querySelector('.recognize-info h3')?.textContent || '',
  artist: document.querySelector('.recognize-info p')?.textContent || '',
  artLoaded: Boolean(document.querySelector('.recognize-art img')?.complete),
  playButton: Boolean(document.querySelector('.recognize-actions .btn-primary')),
  error: document.querySelector('.recognize-error')?.textContent || '',
}));
console.log('[mic] outcome:', JSON.stringify(result));
await page.screenshot({ path: path.join(shotsDir, 'identify-result.png') });
if (result.matched) {
  if (!result.title || !result.artist) issues.push('[mic] match missing title/artist');
  if (!result.playButton) issues.push('[mic] play button missing');
  const closeBtn = page.locator('.recognition-footer-actions .btn', { hasText: 'Close' });
  if (await closeBtn.count()) await closeBtn.first().click();
} else if (result.error) {
  console.log('[mic] no match on fake tone (acceptable in this environment):', result.error);
  const closeBtn = page.locator('.recognize-controls .btn', { hasText: 'Close' });
  if (await closeBtn.count()) await closeBtn.first().click();
} else {
  issues.push('[mic] neither result nor error after 30s');
}

await app.close();
console.log('\n[issues]', issues.length ? JSON.stringify(issues, null, 2) : 'none');
if (issues.length) process.exitCode = 1;
