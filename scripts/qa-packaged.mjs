import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const executablePath = path.resolve(
  process.env.AURALIS_PACKAGED_EXE || `release/${packageJson.version}/win-unpacked/Auralis.exe`,
);
if (!fs.existsSync(executablePath)) throw new Error(`Packaged app not found: ${executablePath}`);

fs.mkdirSync('qa', { recursive: true });
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-qa-packaged-'));
const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-qa-packaged-downloads-'));

const app = await electron.launch({
  executablePath,
  args: [`--user-data-dir=${userData}`],
  timeout: 90000,
});
const page = await app.firstWindow({ timeout: 90000 });
const issues = [];
page.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') issues.push(`[console] ${message.text()}`);
});

async function idle(timeout = 30000) {
  await page.waitForTimeout(600);
  const started = Date.now();
  while (await page.locator('.skeleton').count()) {
    if (Date.now() - started > timeout) break;
    await page.waitForTimeout(400);
  }
}

try {
  await page.waitForSelector('.home-hero', { timeout: 90000 });
  await idle();
  const info = await page.evaluate(() => window.auralis.app.info());
  console.log('[packaged info]', JSON.stringify({
    name: info?.name,
    version: info?.version,
    electron: info?.electron,
    ytDlpVersion: info?.ytDlpVersion,
    ffmpegAvailable: info?.ffmpegAvailable,
    downloadsDir: info?.downloadsDir,
    packagedResources: info?.userData,
  }));
  await page.screenshot({ path: 'qa/packaged-home.png' });

  // Confirm the packaged UI can reach the live catalogue.
  const shelves = await page.locator('.shelf').count();
  console.log('[packaged home]', JSON.stringify({ shelves, cards: await page.locator('.media-card').count() }));

  // Search and play a real song through the packaged media pipeline.
  await page.locator('.sidebar-item', { hasText: 'Search' }).first().click();
  const search = page.locator('.top-search input').first();
  await search.fill('Kesariya Arijit Singh');
  await search.press('Enter');
  await page.waitForSelector('.search-page', { timeout: 30000 });
  await idle();
  const first = page.locator('.track-row').first();
  await first.waitFor({ timeout: 30000 });
  const title = await first.locator('.track-title').innerText();
  await first.click();
  await page.waitForTimeout(12000);
  const playback = await page.evaluate(() => ({
    playerTitle: document.querySelector('.player-title')?.textContent || '',
    playerArtist: document.querySelector('.player-artist')?.textContent || '',
    playerTime: document.querySelector('.player-center .time')?.textContent || '',
    playerError: document.querySelector('.player-error')?.textContent || '',
    playing: Boolean(document.querySelector('.play-button[aria-label="Pause"]')),
  }));
  console.log('[packaged playback]', JSON.stringify({ title, ...playback }));

  await page.locator('.player-right button[aria-label="Queue"]').click();
  await page.waitForSelector('.queue-drawer');
  console.log('[packaged radio]', JSON.stringify({
    rows: await page.locator('.queue-drawer .queue-row').count(),
    radio: await page.locator('.queue-radio').count(),
  }));
  await page.locator('.queue-drawer button[aria-label="Close queue"]').click();

  // Exercise the bundled downloader with a short real track.
  await page.evaluate(async (dir) => window.auralis.settings.set({ downloadDir: dir, theme: 'dark' }), downloadDir);
  const row = page.locator('.track-row').first();
  await row.hover();
  await row.locator('.track-more').click();
  await page.waitForSelector('.context-menu', { timeout: 10000 });
  await page.locator('.context-menu .menu-item', { hasText: 'Download' }).first().click();
  let download = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    await page.waitForTimeout(2000);
    const downloads = await page.evaluate(() => window.auralis.library.getDownloads());
    download = downloads.find((item) => item.status === 'done' && item.track.title.includes('Kesariya'));
    if (download) break;
  }
  console.log('[packaged download]', JSON.stringify({
    status: download?.status,
    path: download?.path,
    exists: download?.path ? fs.existsSync(download.path) : false,
    size: download?.path && fs.existsSync(download.path) ? fs.statSync(download.path).size : 0,
  }));
  await page.locator('.sidebar-item', { hasText: 'Downloads' }).first().click();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'qa/packaged-downloads.png' });

  // Moods and podcasts, the two browse shapes touched in the final pass.
  await page.locator('.sidebar-item', { hasText: 'Explore' }).first().click();
  await page.locator('.explore-tab', { hasText: 'Moods & genres' }).click();
  await page.waitForSelector('.mood-card', { timeout: 30000 });
  console.log('[packaged moods]', JSON.stringify({ cards: await page.locator('.mood-card').count() }));

  const podcast = await page.evaluate(async () => {
    const page = await window.auralis.yt.podcast('MPSPPLdMrbgYfVl-s16D_iT2BJCJ90pWtTO1A4');
    return {
      title: page.header?.title || '',
      episodes: page.shelves.reduce((sum, shelf) => sum + shelf.items.filter((item) => item.track).length, 0),
    };
  });
  console.log('[packaged podcast]', JSON.stringify(podcast));

  await page.screenshot({ path: 'qa/packaged-final.png' });
  console.log('[packaged issues]', issues);
} finally {
  await app.close();
}
