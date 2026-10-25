import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-qa-sleep-'));
const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  cwd: process.cwd(),
  env: { ...process.env, AURALIS_FORCE_PROD: '1' },
  timeout: 60000,
});
const page = await app.firstWindow({ timeout: 60000 });
const issues = [];
page.on('pageerror', (error) => issues.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') issues.push(message.text());
});

async function waitIdle() {
  await page.waitForTimeout(600);
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
  await page.waitForTimeout(5000);

  const timer = page.locator('.player-right button[aria-label^="Sleep timer"]');
  console.log('[timer button]', await timer.count(), await timer.getAttribute('aria-label'));
  await timer.click();
  await page.waitForSelector('.context-menu');
  await page.locator('.context-menu .menu-item', { hasText: '5 minutes' }).first().click();
  await page.waitForTimeout(500);
  console.log('[after 5m]', await timer.getAttribute('aria-label'), 'playing=', await page.locator('.play-button').getAttribute('aria-label'));

  await page.evaluate(() => {
    const original = Date.now;
    Date.now = () => original() + 6 * 60 * 1000;
  });
  await page.waitForTimeout(1800);
  console.log('[after jump]', await timer.getAttribute('aria-label'), 'playing=', await page.locator('.play-button').getAttribute('aria-label'));
  console.log('[toasts]', await page.locator('.toast').allTextContents());

  await timer.click();
  await page.waitForSelector('.context-menu');
  await page.locator('.context-menu .menu-item', { hasText: 'End of track' }).first().click();
  await page.waitForTimeout(400);
  console.log('[end of track]', await timer.getAttribute('aria-label'));
  await timer.click();
  await page.locator('.context-menu .menu-item', { hasText: 'Off' }).first().click();
  await page.waitForTimeout(400);
  console.log('[off]', await timer.getAttribute('aria-label'));

  const state = await page.evaluate(() => ({
    queueTitle: document.querySelector('.player-title')?.textContent,
    toastTexts: [...document.querySelectorAll('.toast')].map((node) => node.textContent),
  }));
  console.log('[state]', JSON.stringify(state));
} finally {
  console.log('[issues]', issues);
  await app.close();
  setTimeout(() => {
    try {
      fs.rmSync(userData, { recursive: true, force: true });
    } catch {}
  }, 1000);
}
