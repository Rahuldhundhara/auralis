import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-qa-net-'));
const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  cwd: process.cwd(),
  env: { ...process.env, AURALIS_FORCE_PROD: '1' },
  timeout: 60000,
});
const page = await app.firstWindow({ timeout: 60000 });
const bad = [];
page.on('response', (response) => {
  if (response.status() >= 400) bad.push({ status: response.status(), url: response.url() });
});
page.on('requestfailed', (request) => bad.push({ failed: request.failure()?.errorText, url: request.url() }));
page.on('console', (message) => {
  if (message.type() === 'error') console.log('[console]', message.text());
});

async function waitIdle() {
  await page.waitForTimeout(700);
  for (let i = 0; i < 30; i += 1) {
    if (!(await page.locator('.skeleton').count())) return;
    await page.waitForTimeout(300);
  }
}

try {
  await page.waitForSelector('.home-hero', { timeout: 60000 });
  await waitIdle();
  const input = page.locator('.top-search input').first();
  await input.fill('Arijit Singh');
  await input.press('Enter');
  await page.waitForSelector('.search-page');
  await waitIdle();
  await page.locator('.chips .chip', { hasText: 'Songs' }).click();
  await waitIdle();
  await page.locator('.search-page .track-row').first().click();
  for (const seconds of [3, 6, 10]) {
    await page.waitForTimeout(seconds * 1000);
    const state = await page.evaluate(() => ({
      title: document.querySelector('.player-title')?.textContent,
      times: [...document.querySelectorAll('.seek-bar .time')].map((node) => node.textContent),
      playing: document.querySelector('.play-button')?.getAttribute('aria-label'),
      error: document.querySelector('.player-error')?.textContent || '',
      buffering: Boolean(document.querySelector('.play-button .spin')),
    }));
    console.log(`[player +${seconds}s]`, JSON.stringify(state));
  }

  await page.locator('.player-right button[aria-label="Lyrics"]').click();
  await page.waitForSelector('.now-playing');
  for (const seconds of [2, 6, 12]) {
    await page.waitForTimeout(seconds * 1000);
    const state = await page.evaluate(() => ({
      panel: document.querySelector('.np-panel')?.innerText?.slice(0, 300),
      loading: Boolean(document.querySelector('.np-panel .spinner, .np-panel .skeleton')),
      error: document.querySelector('.np-panel .error-panel, .np-panel .empty-state')?.textContent || '',
    }));
    console.log(`[lyrics +${seconds}s]`, JSON.stringify(state));
  }
  console.log('[bad responses]', JSON.stringify(bad.slice(0, 30), null, 2));
} finally {
  await app.close();
  setTimeout(() => {
    try {
      fs.rmSync(userData, { recursive: true, force: true });
    } catch {}
  }, 1000);
}
