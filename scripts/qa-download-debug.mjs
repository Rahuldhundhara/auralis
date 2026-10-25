import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-qa-dl-'));
const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-qa-dldir-'));
const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  cwd: process.cwd(),
  env: { ...process.env, AURALIS_FORCE_PROD: '1', AURALIS_DEBUG_DOWNLOAD: '1' },
  timeout: 60000,
});
app.process().stdout?.on('data', (data) => process.stdout.write(`[main] ${data}`));
app.process().stderr?.on('data', (data) => process.stdout.write(`[main-err] ${data}`));
const page = await app.firstWindow({ timeout: 60000 });
page.on('console', (message) => console.log(`[page:${message.type()}] ${message.text()}`));
page.on('pageerror', (error) => console.log('[pageerror]', error.message));

await page.waitForSelector('.home-hero', { timeout: 60000 });
await page.evaluate(async (dir) => {
  await window.auralis.settings.set({ downloadDir: dir, theme: 'dark' });
}, downloadDir);
console.log('[dir]', downloadDir);

await page.locator('.sidebar-item', { hasText: 'Search' }).first().click();
const input = page.locator('.top-search input').first();
await input.fill('Tainu Khabar Nahi');
await input.press('Enter');
await page.waitForSelector('.top-songs .track-row', { timeout: 30000 });
const row = page.locator('.top-songs .track-row').first();
await row.hover();
await row.locator('.track-more').click();
await page.waitForSelector('.context-menu');
await page.locator('.context-menu .menu-item', { hasText: 'Download' }).first().click();
console.log('[clicked download]');

await page.waitForTimeout(15000);
const list = await page.evaluate(() => window.auralis.library.getDownloads());
console.log('[api list]', JSON.stringify(list.map((item) => ({ status: item.status, progress: item.progress, path: item.path, error: item.error }))));
await page.locator('.sidebar-item', { hasText: 'Downloads' }).first().click();
await page.waitForTimeout(2500);
console.log('[downloads text]', (await page.locator('.content-scroll').innerText()).slice(0, 700));
await page.screenshot({ path: 'qa/download-ui.png' });
const files = fs.readdirSync(downloadDir);
console.log('[files]', files.map((name) => ({ name, size: fs.statSync(path.join(downloadDir, name)).size })));
await app.close();
setTimeout(() => {
  try {
    fs.rmSync(downloadDir, { recursive: true, force: true });
    fs.rmSync(userData, { recursive: true, force: true });
  } catch {}
}, 1000);
