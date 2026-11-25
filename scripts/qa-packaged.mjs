import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const executablePath =
  process.platform === 'win32'
    ? path.resolve('release/win-unpacked/Auralis.exe')
    : process.platform === 'linux'
      ? path.resolve('release/linux-unpacked/auralis')
      : path.resolve('release/mac/Auralis.app/Contents/MacOS/Auralis');
if (!fs.existsSync(executablePath)) throw new Error(`Packaged app not found: ${executablePath}`);

const shotsDir = path.resolve(process.env.AURALIS_QA_SHOTS || (process.platform === 'linux' ? 'qa/linux' : 'qa'));
fs.mkdirSync(shotsDir, { recursive: true });
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-qa-packaged-'));
const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-qa-packaged-downloads-'));

const app = await electron.launch({
  executablePath,
  args: [
    `--user-data-dir=${userData}`,
    ...(process.platform === 'linux' && process.env.AURALIS_QA_NO_SANDBOX === '1' ? ['--no-sandbox'] : []),
    // SwiftShader (CI) struggles with the heavy blur/filters used by the UI;
    // render purely on CPU so the GPU process cannot die mid-run.
    ...(process.env.AURALIS_QA_DISABLE_GPU === '1' ? ['--disable-gpu'] : []),
  ],
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
  // Fresh packaged profile: wait for either the onboarding gate or the home
  // reveal, then complete onboarding if it is shown.
  await page.waitForSelector('.onboarding-layer, .dynamic-hero', { timeout: 90000 });
  if (await page.locator('.onboarding-layer').count()) {
    console.log('[packaged onboarding] completing first-run flow');
    await page.locator('.onboarding-nav-primary').click();
    await page.waitForSelector('.genre-card', { timeout: 15000 });
    const cards = page.locator('.genre-card');
    await cards.nth(0).click();
    await cards.nth(1).click();
    await page.locator('.onboarding-nav-primary').click();
    await page.waitForTimeout(600);
    await page.locator('.onboarding-nav-skip').click();
    await page.waitForSelector('.sidebar-item', { timeout: 60000 });
  }
  await page.waitForSelector('.dynamic-hero', { timeout: 90000 });
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
  await page.screenshot({ path: path.join(shotsDir, 'packaged-home.png') });

  // Confirm the packaged UI can reach the live catalogue.
  const shelves = await page.locator('.shelf').count();
  console.log('[packaged home]', JSON.stringify({ shelves, cards: await page.locator('.media-card').count() }));

  // Search and play a real song through the packaged media pipeline.
  const search = page.locator('.search-field input').first();
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

  await page.locator('.player-art-button').first().click();
  await page.locator('.np-tab', { hasText: 'Queue' }).click();
  await page.waitForSelector('.queue-panel', { timeout: 15000 });
  console.log('[packaged queue]', JSON.stringify({ rows: await page.locator('.queue-item').count() }));
  await page.keyboard.press('Escape');

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
  await page.screenshot({ path: path.join(shotsDir, 'packaged-downloads.png') });

  // Moods and podcasts, the two browse shapes touched in the final pass.
  await page.locator('.sidebar-item', { hasText: 'Explore' }).first().click();
  await page.waitForSelector('.explore-feature', { timeout: 30000 });
  await page.waitForTimeout(2500);
  const exploreState = await page.evaluate(() => {
    const heroArt = document.querySelector('.explore-fan-cover img');
    const playerArt = document.querySelector('.player-art img');
    const identify = document.querySelector('.identify-inline svg');
    const scroll = document.querySelector('.content-scroll')?.getBoundingClientRect();
    const top = scroll?.top ?? 0;
    const bottom = Math.min(scroll?.bottom ?? window.innerHeight, window.innerHeight);
    const broken = [...document.images]
      .filter((img) => {
        const rect = img.getBoundingClientRect();
        return rect.width > 8 && rect.height > 8 && rect.bottom > top && rect.top < bottom;
      })
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => img.alt)
      .slice(0, 5);
    return {
      moods: document.querySelectorAll('.explore-mood').length,
      cine: document.querySelector('.explore-feature h1')?.textContent || '',
      identify: identify?.getAttribute('class') || '',
      heroArt: heroArt?.getAttribute('src') || '',
      heroLoaded: heroArt instanceof HTMLImageElement ? heroArt.naturalWidth > 0 : false,
      playerArt: playerArt?.getAttribute('src') || '',
      playerLoaded: playerArt instanceof HTMLImageElement ? playerArt.naturalWidth > 0 : false,
      broken,
    };
  });
  console.log('[packaged explore]', JSON.stringify({ cine: exploreState.cine.slice(0, 40), moodTiles: exploreState.moods, identify: exploreState.identify, heroArt: exploreState.heroArt.slice(0, 32), heroLoaded: exploreState.heroLoaded, playerLoaded: exploreState.playerLoaded, broken: exploreState.broken }));
  if (exploreState.moods !== 15) issues.push(`[explore] expected 15 mood tiles, got ${exploreState.moods}`);
  if (!/lucide-mic/.test(exploreState.identify)) issues.push('[topbar] Identify is not using a microphone icon');
  if (/lucide-audio-lines/.test(exploreState.identify)) issues.push('[topbar] equalizer visualizer still present beside Identify');
  if (!/^auralis-media:\/\/image\//.test(exploreState.heroArt)) issues.push('[artwork] Explore hero is not using the media proxy');
  if (!exploreState.heroLoaded) issues.push('[artwork] Explore hero artwork failed to load');
  if (!exploreState.playerLoaded) issues.push('[artwork] player artwork failed to load');
  if (exploreState.broken.length) issues.push(`[artwork] broken Explore images: ${JSON.stringify(exploreState.broken)}`);

  const podcast = await page.evaluate(async () => {
    const page = await window.auralis.yt.podcast('MPSPPLdMrbgYfVl-s16D_iT2BJCJ90pWtTO1A4');
    return {
      title: page.header?.title || '',
      episodes: page.shelves.reduce((sum, shelf) => sum + shelf.items.filter((item) => item.track).length, 0),
    };
  });
  console.log('[packaged podcast]', JSON.stringify(podcast));

  await page.screenshot({ path: path.join(shotsDir, 'packaged-final.png') });
  console.log('[packaged issues]', issues);
} finally {
  await app.close();
}
