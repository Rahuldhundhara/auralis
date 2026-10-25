import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

fs.mkdirSync('qa', { recursive: true });
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-qa-moods-'));
const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  cwd: process.cwd(),
  env: { ...process.env, AURALIS_FORCE_PROD: '1' },
  timeout: 60000,
});
const page = await app.firstWindow({ timeout: 60000 });
const issues = [];
page.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') issues.push(`[console] ${message.text()}`);
});

try {
  await page.waitForSelector('.home-hero', { timeout: 60000 });
  await page.locator('.sidebar-item', { hasText: 'Explore' }).first().click();
  await page.locator('.explore-tab', { hasText: 'Moods & genres' }).click();
  await page.waitForSelector('.mood-card', { timeout: 30000 });
  const cards = await page.locator('.mood-card').count();
  const titles = await page.locator('.mood-card-title').allInnerTexts();
  console.log('[moods]', JSON.stringify({ cards, shelves: await page.locator('.shelf').count(), first: titles.slice(0, 8) }));
  await page.screenshot({ path: 'qa/moods-grid.png' });

  await page.locator('.mood-card', { hasText: 'Chill' }).first().click();
  await page.waitForTimeout(3000);
  const heading = await page.locator('.detail-hero h1, .page-hero h1').first().innerText().catch(() => '');
  const tracks = await page.locator('.track-row').count();
  const shelves = await page.locator('.shelf').count();
  console.log('[mood open]', JSON.stringify({ heading, tracks, shelves, url: page.url() }));
  await page.screenshot({ path: 'qa/moods-chill.png' });
  console.log('[issues]', issues);
} finally {
  await app.close();
}
