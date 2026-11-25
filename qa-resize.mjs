import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const shotsDir = path.resolve('qa');
fs.mkdirSync(shotsDir, { recursive: true });
const app = await electron.launch({
  args: [
    '.',
    `--user-data-dir=${path.join(os.tmpdir(), `auralis-qa-resize-${Date.now()}`)}`,
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
await page.waitForLoadState('domcontentloaded');
await page.setViewportSize({ width: 620, height: 900 });
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
}
await page.waitForTimeout(1500);
await page.locator('.search-field input').first().fill('Blinding Lights');
await page.keyboard.press('Enter');
await page.waitForTimeout(3500);
await page.locator('.track-row').first().click();
await page.waitForSelector('.player-art-button', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(6000);
await page.locator('.player-art-button').first().click();
await page.waitForTimeout(800);
const state = await page.evaluate(() => {
  const picks = Array.from(document.querySelectorAll('.seek-range, .volume-range'));
  return picks.map((el) => ({
    cls: el.className,
    width: Math.round(el.getBoundingClientRect().width),
    height: Math.round(el.getBoundingClientRect().height),
    display: getComputedStyle(el).display,
    visible: el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0,
  }));
});
console.log('ranges:', JSON.stringify(state, null, 2));
await page.screenshot({ path: path.join(shotsDir, 'small-nowplaying.png') });
await app.close();
