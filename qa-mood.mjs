import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const shotsDir = path.resolve('qa/explore');
fs.mkdirSync(shotsDir, { recursive: true });
const issues = [];

const app = await electron.launch({
  args: [
    '.',
    `--user-data-dir=${path.join(os.tmpdir(), `auralis-qa-mood-${Date.now()}`)}`,
    '--no-sandbox',
    '--ozone-platform=x11',
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
  cwd: process.cwd(),
  env: { ...process.env, AURALIS_FORCE_PROD: '1' },
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
  await page.locator('.genre-card').nth(0).click();
  await page.locator('.genre-card').nth(1).click();
  await page.locator('.onboarding-nav-primary').click();
  await page.waitForTimeout(600);
  await page.locator('.onboarding-nav-skip').click();
  await page.waitForSelector('.sidebar-item', { timeout: 60000 });
}
await page.locator('.sidebar-item', { hasText: 'Explore' }).first().click();
await page.waitForTimeout(3000);

const tiles = await page.evaluate(() => Array.from(document.querySelectorAll('.explore-mood')).map((t) => t.textContent.trim()));
console.log('[tiles]', JSON.stringify(tiles));

for (const label of ['Workout / Gym', 'Chill']) {
  await page.locator('.sidebar-item', { hasText: 'Explore' }).first().click();
  await page.waitForTimeout(2000);
  const tile = page.locator('.explore-mood', { hasText: label });
  if (!(await tile.count())) {
    issues.push(`[mood] ${label} tile missing`);
    continue;
  }
  await tile.first().click();
  await page.waitForTimeout(3500);
  const state = await page.evaluate(() => ({
    url: window.location.href,
    active: document.querySelector('.nav-item.is-active, .sidebar-item.is-active')?.textContent?.trim() || '',
    body: document.body.innerText.slice(0, 300),
  }));
  console.log(`[mood ${label}]`, JSON.stringify(state));
  await page.screenshot({ path: path.join(shotsDir, `mood-${label.replace(/[^a-z]/gi, '_')}.png`) });
}

console.log('\n[issues]', issues.length ? JSON.stringify(issues, null, 2) : 'none');
await app.close();
if (issues.length) process.exitCode = 1;
