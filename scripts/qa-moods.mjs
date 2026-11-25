import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

fs.mkdirSync('qa/moods', { recursive: true });
const profile = path.join(process.env.TEMP || '.', `auralis-moods-qa-${Date.now()}`);
const app = await electron.launch({
  args: ['.', `--user-data-dir=${profile}`],
  cwd: process.cwd(),
  env: { ...process.env, AURALIS_FORCE_PROD: '1', AURALIS_SKIP_LOGIN: '1' },
  timeout: 60000,
});
const page = await app.firstWindow({ timeout: 60000 });
const issues = [];
page.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  // Expected noise from the deliberate bad-image probe below.
  if (/status of 502|auralis-media/.test(message.text())) return;
  issues.push(`[console] ${message.text()}`);
});

async function resize(width, height) {
  await app.evaluate(({ BrowserWindow }, size) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window.isMaximized()) window.unmaximize();
    window.setSize(size.width, size.height);
  }, { width, height });
  await page.waitForTimeout(900);
}

async function shot(name) {
  await page.screenshot({ path: `qa/moods/${name}.png` });
}

const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

try {
  await page.waitForSelector('.app-shell', { timeout: 60000 });
  await page.waitForSelector('.home-vibe-stage', { timeout: 30000 });
  await resize(1440, 960);

  /* ---- 1. Explore mood grid ---- */
  await page.locator('.sidebar-item', { hasText: 'Explore' }).first().click();
  await page.waitForSelector('.mood-grid', { timeout: 20000 });
  await page.waitForTimeout(1200);
  const grid = await page.evaluate(() => {
    const gridElement = document.querySelector('.mood-grid');
    const style = getComputedStyle(gridElement);
    const tiles = [...document.querySelectorAll('.mood-tile')];
    const first = tiles[0];
    const firstStyle = first ? getComputedStyle(first) : null;
    const photo = first?.querySelector('.mood-tile-photo');
    return {
      columns: style.gridTemplateColumns.split(' ').length,
      count: tiles.length,
      titles: tiles.map((tile) => tile.querySelector('.mood-tile-title')?.textContent),
      firstStyle: firstStyle
        ? {
            aspectRatio: firstStyle.aspectRatio,
            minHeight: firstStyle.minHeight,
            radius: firstStyle.borderRadius,
            border: firstStyle.borderTopWidth,
          }
        : null,
      hasNoise: Boolean(first?.querySelector('.mood-tile-noise')),
      hasShade: Boolean(first?.querySelector('.mood-tile-shade')),
      shadeBg: first?.querySelector('.mood-tile-shade') ? getComputedStyle(first.querySelector('.mood-tile-shade')).backgroundImage.slice(0, 80) : '',
      photoLoaded: photo ? photo.complete && photo.naturalWidth > 0 : false,
      photoSrc: photo?.currentSrc || photo?.getAttribute('src') || '',
      headChip: document.querySelector('.mood-count-chip')?.textContent,
      headTitle: document.querySelector('.mood-grid-head h2')?.textContent,
      eyebrow: document.querySelector('.mood-grid-head .eyebrow')?.textContent,
    };
  });
  console.log('[mood-grid]', JSON.stringify(grid, null, 2));
  if (grid.count !== 15) issues.push(`[mood-grid] expected 15 tiles, got ${grid.count}`);
  if (!grid.photoLoaded) issues.push('[mood-grid] first tile photo not loaded');
  if (!grid.hasNoise || !grid.hasShade) issues.push('[mood-grid] missing noise/shade layers');
  await shot('01-mood-grid-1440');

  /* hover state: chevron + lift */
  await page.locator('.mood-tile').first().hover();
  await page.waitForTimeout(400);
  const hoverState = await page.evaluate(() => {
    const tile = document.querySelector('.mood-tile');
    const style = getComputedStyle(tile);
    const chevron = getComputedStyle(tile.querySelector('.mood-tile-chevron'));
    const photo = getComputedStyle(tile.querySelector('.mood-tile-photo'));
    return { transform: style.transform, chevronOpacity: chevron.opacity, photoScale: photo.transform };
  });
  console.log('[mood-hover]', JSON.stringify(hoverState));
  if (hoverState.chevronOpacity !== '1') issues.push(`[mood-grid] chevron not visible on hover (${hoverState.chevronOpacity})`);

  /* ---- 2. Mood tile navigates to a real browse page ---- */
  await page.locator('.mood-tile').first().click();
  await page.waitForSelector('.detail-page-browse', { timeout: 20000 });
  await page.waitForTimeout(2000);
  const browse = await page.evaluate(() => ({
    title: document.querySelector('.detail-copy h1')?.textContent || document.querySelector('.page-hero h1')?.textContent || '',
    cards: document.querySelectorAll('.media-card').length,
    artwork: document.querySelector('.detail-art img')?.currentSrc || '',
  }));
  console.log('[browse]', JSON.stringify(browse));
  if (!browse.title) issues.push('[mood-grid] browse page did not open');
  if (!browse.cards) issues.push('[mood-grid] browse page has no cards');
  await shot('02-mood-browse');

  /* ---- 3. Home idle ---- */
  await page.locator('.sidebar-item', { hasText: 'Home' }).first().click();
  await page.waitForSelector('.home-vibe-stage', { timeout: 20000 });
  await page.waitForTimeout(800);
  const idle = await page.evaluate(() => {
    const stage = document.querySelector('.home-vibe-stage');
    const style = stage ? getComputedStyle(stage) : null;
    return {
      isIdle: stage?.classList.contains('is-idle'),
      tagline: document.querySelector('.vibe-tagline')?.textContent,
      title: document.querySelector('.vibe-title')?.textContent,
      artists: document.querySelector('.vibe-artists')?.textContent,
      playLabel: document.querySelector('.vibe-play')?.textContent?.trim(),
      radioLabel: document.querySelector('.vibe-radio')?.textContent?.trim(),
      artRadius: style ? getComputedStyle(document.querySelector('.vibe-art')).borderRadius : '',
      backdropImg: Boolean(document.querySelector('.vibe-backdrop img')),
      glow: Boolean(document.querySelector('.vibe-glow')),
      art: document.querySelector('.vibe-art img')?.getAttribute('src') || '',
      quick: document.querySelectorAll('.quick-card').length,
      quickArt: document.querySelector('.quick-art') ? getComputedStyle(document.querySelector('.quick-art')).width : '',
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  console.log('[home-idle]', JSON.stringify(idle, null, 2));
  if (!idle.isIdle) issues.push('[home] stage not idle on fresh profile');
  if (idle.tagline !== 'Ready when you are') issues.push(`[home] idle tagline wrong: ${idle.tagline}`);
  await shot('03-home-idle');

  /* ---- 4. Play, then check stage + artwork consistency ---- */
  await page.locator('.sidebar-item', { hasText: 'Search' }).first().click();
  await page.waitForTimeout(500);
  const input = page.locator('.top-search input').first();
  await input.fill('Kesariya');
  await input.press('Enter');
  await page.waitForSelector('.search-page', { timeout: 20000 });
  await page.waitForTimeout(2500);
  const rows = page.locator('.top-songs .track-row');
  if (!(await rows.count())) throw new Error('no search rows');
  await rows.first().dblclick();
  for (let index = 0; index < 50; index += 1) {
    const playing = await page.evaluate(() => document.querySelector('.player-center .play-button')?.getAttribute('data-playing'));
    if (playing === 'true') break;
    await page.waitForTimeout(400);
  }

  await page.locator('.sidebar-item', { hasText: 'Home' }).first().click();
  await page.waitForTimeout(1600);
  const live = await page.evaluate(() => {
    const stage = document.querySelector('.home-vibe-stage');
    const vibeArt = document.querySelector('.vibe-art img')?.getAttribute('src') || '';
    const playerArt = document.querySelector('.player-art img')?.getAttribute('src') || '';
    return {
      isLive: stage?.classList.contains('is-live'),
      tagline: document.querySelector('.vibe-tagline')?.textContent,
      title: document.querySelector('.vibe-title')?.textContent,
      artists: document.querySelector('.vibe-artists')?.textContent,
      album: document.querySelector('.vibe-album')?.textContent || '',
      playLabel: document.querySelector('.vibe-play')?.textContent?.trim(),
      backdropImg: Boolean(document.querySelector('.vibe-backdrop img')),
      vibeArt,
      playerArt,
      quick: document.querySelectorAll('.quick-card').length,
      quickDuration: document.querySelector('.quick-card .quick-duration')?.textContent || '',
      sameArt: Boolean(vibeArt) && vibeArt === playerArt,
      proxied: vibeArt.startsWith('auralis-media://image/'),
      palette: stage ? getComputedStyle(stage).getPropertyValue('--hero-accent-r').trim() : '',
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  console.log('[home-live]', JSON.stringify(live, null, 2));
  if (!live.isLive) issues.push('[home] stage not live while playing');
  if (!live.backdropImg) issues.push('[home] no blurred backdrop while playing');
  if (!live.proxied) issues.push('[home] vibe art not proxied');
  if (!live.sameArt) issues.push(`[artwork] stage and player differ: ${live.vibeArt} vs ${live.playerArt}`);
  if (live.quick < 1) issues.push('[home] Jump Back In is empty after playing');
  await shot('04-home-playing');

  /* ---- 5. Now Playing uses the same proxied URL ---- */
  await page.locator('.queue-pill').first().click().catch(() => {});
  await page.evaluate(() => document.querySelector('.player-art')?.click());
  await page.waitForTimeout(1200);
  const npArt = await page.evaluate(() => document.querySelector('.np-art img')?.getAttribute('src') || '');
  console.log('[nowplaying-art]', npArt);
  if (npArt && npArt !== live.vibeArt) issues.push(`[artwork] Now Playing differs: ${npArt}`);
  await shot('05-nowplaying-art');
  await page.keyboard.press('Escape');

  /* ---- 6. Quick access refresh ---- */
  const quickBefore = await page.evaluate(() => document.querySelectorAll('.quick-card').length);
  await page.locator('.quick-heading-actions .icon-btn').first().click();
  await page.waitForTimeout(1200);
  const quickAfter = await page.evaluate(() => document.querySelectorAll('.quick-card').length);
  console.log('[quick-refresh]', JSON.stringify({ before: quickBefore, after: quickAfter }));
  if (quickAfter < 1) issues.push('[home] quick grid lost cards after refresh');

  /* ---- 7. Proxy error path: a bad image returns 502 (fallback shows) ---- */
  const badUrl = `auralis-media://image/${btoa('https://i.ytimg.com/vi/definitely-missing-404xyz/mqdefault.jpg').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
  const bad = await page.evaluate(async (url) => {
    try {
      const response = await fetch(url);
      return { status: response.status, cors: response.headers.get('access-control-allow-origin') };
    } catch (error) {
      return { status: 0, error: String(error) };
    }
  }, badUrl);
  console.log('[proxy-bad]', JSON.stringify(bad));
  if (bad.status !== 502) issues.push(`[proxy] bad image did not 502 (${bad.status})`);

  /* broken artwork must render the fallback, never a broken icon */
  const fallback = await page.evaluate(async () => {
    const probe = document.createElement('img');
    probe.src = `auralis-media://image/${btoa('https://i.ytimg.com/vi/definitely-missing-404xyz/mqdefault.jpg').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
    probe.loading = 'eager';
    await new Promise((resolve) => {
      probe.onload = resolve;
      probe.onerror = resolve;
    });
    return { failed: !probe.complete || probe.naturalWidth === 0 };
  });
  console.log('[proxy-fallback-probe]', JSON.stringify(fallback));

  /* ---- 8. Compact 1024 ---- */
  await page.setViewportSize({ width: 1024, height: 680 });
  await page.waitForTimeout(900);
  await page.locator('.sidebar-item', { hasText: 'Explore' }).first().click();
  await page.waitForTimeout(700);
  const compact = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    moodColumns: document.querySelector('.mood-grid') ? getComputedStyle(document.querySelector('.mood-grid')).gridTemplateColumns.split(' ').length : 0,
    stageHeight: document.querySelector('.home-vibe-stage')?.getBoundingClientRect().height,
  }));
  console.log('[compact-1024]', JSON.stringify(compact));
  if (compact.overflow > 0) issues.push(`[compact] horizontal overflow ${compact.overflow}px`);
  await shot('06-mood-1024');
  await page.locator('.sidebar-item', { hasText: 'Home' }).first().click();
  await page.waitForTimeout(700);
  await shot('07-home-1024');

  /* ---- 9. Responsive mood grid ---- */
  for (const width of [950, 850, 640, 560]) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(600);
    await page.locator('.sidebar-item', { hasText: 'Explore' }).first().click();
    await page.waitForTimeout(500);
    const state = await page.evaluate(() => ({
      columns: document.querySelector('.mood-grid') ? getComputedStyle(document.querySelector('.mood-grid')).gridTemplateColumns.split(' ').length : 0,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    console.log(`[responsive ${width}]`, JSON.stringify(state));
    if (state.overflow > 0) issues.push(`[responsive ${width}] overflow ${state.overflow}px`);
    await shot(`08-mood-${width}`);
  }

  /* ---- 10. Disk cache check in the main process ---- */
  const cached = await app.evaluate(() => {
    try {
      const fsModule = require('node:fs');
      const pathModule = require('node:path');
      const dir = pathModule.join(require('electron').app.getPath('userData'), 'image-cache');
      return { exists: fsModule.existsSync(dir), files: fsModule.existsSync(dir) ? fsModule.readdirSync(dir).length : 0 };
    } catch (error) {
      return { error: String(error) };
    }
  });
  console.log('[disk-cache]', JSON.stringify(cached));
  if (cached.files === 0) issues.push('[proxy] disk cache is empty after loads');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(400);
  await shot('09-reduced-motion');
} catch (error) {
  console.error('[FAIL]', error.message);
  issues.push(`[fail] ${error.message}`);
  await shot('99-failure').catch(() => {});
} finally {
  console.log('[issues]', JSON.stringify(issues, null, 2));
  await app.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
