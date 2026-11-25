import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

fs.mkdirSync('qa/hero', { recursive: true });
const profile = path.join(process.env.TEMP || '.', `auralis-hero-qa-${Date.now()}`);
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
  if (message.type() === 'error') issues.push(`[console] ${message.text()}`);
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
  await page.screenshot({ path: `qa/hero/${name}.png` });
}

async function heroState() {
  return page.evaluate(() => {
    const hero = document.querySelector('.explore-feature');
    const cover = document.querySelector('.explore-feature-cover .is-current img') || document.querySelector('.explore-feature-cover img');
    const style = hero ? getComputedStyle(hero) : null;
    const actions = document.querySelector('.explore-feature-play');
    const wave = document.querySelector('.explore-feature-wave');
    const canvas = document.querySelector('.explore-feature-rail-wave');
    const rail = document.querySelector('.explore-feature-rail');
    const railLabel = document.querySelector('.explore-feature-rail-label');
    const art = document.querySelector('.explore-feature-art');
    const heroCover = document.querySelector('.explore-feature-cover');
    const rect = hero?.getBoundingClientRect();
    const railLabelRect = railLabel?.getBoundingClientRect();
    const railRect = rail?.getBoundingClientRect();
    return {
      title: document.querySelector('.explore-feature h1')?.textContent,
      tagline: document.querySelector('.explore-feature-tagline')?.textContent,
      artist: document.querySelector('.explore-feature-version')?.textContent || '',
      variant: document.querySelector('.explore-feature-variant')?.textContent || '',
      album: document.querySelector('.explore-feature-album')?.textContent || '',
      rail: document.querySelector('.explore-feature-rail-label')?.textContent,
      playLabel: actions?.textContent?.trim(),
      playDisabled: actions?.disabled,
      cover: cover?.getAttribute('src') || '',
      covers: [...document.querySelectorAll('.explore-feature-cover img')].map((img) => ({ src: img.getAttribute('src'), opacity: getComputedStyle(img).opacity })),
      waveClass: wave?.className,
      waveOpacity: wave ? getComputedStyle(wave).opacity : '',
      waveDisplay: wave ? getComputedStyle(wave).display : '',
      radius: style?.borderRadius,
      grid: style?.gridTemplateColumns,
      width: rect?.width,
      height: rect?.height,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
      railLabelHeight: railLabelRect?.height,
      railHeight: railRect?.height,
      railDisplay: rail ? getComputedStyle(rail).display : '',
      artDisplay: art ? getComputedStyle(art).display : '',
      artWidth: art ? getComputedStyle(art).width : '',
      coverWidth: heroCover ? getComputedStyle(heroCover).width : '',
      h1Size: document.querySelector('.explore-feature h1') ? getComputedStyle(document.querySelector('.explore-feature h1')).fontSize : '',
      palette: hero ? ['--hero-r', '--hero-g', '--hero-b', '--hero-accent-r'].map((key) => style?.getPropertyValue(key).trim()) : [],
      playerTitle: document.querySelector('.player-title')?.textContent,
      playerArtist: document.querySelector('.player-artist')?.textContent,
      playerArt: document.querySelector('.player-art img')?.getAttribute('src') || '',
      playing: document.querySelector('.player-center .play-button')?.getAttribute('data-playing'),
      pageHero: Boolean(document.querySelector('.explore-page .page-hero')),
    };
  });
}

async function waitForPlayback() {
  for (let index = 0; index < 50; index += 1) {
    const state = await page.evaluate(() => ({
      title: document.querySelector('.player-title')?.textContent || '',
      playing: document.querySelector('.player-center .play-button')?.getAttribute('data-playing'),
      error: document.querySelector('.player-error')?.textContent || '',
    }));
    if (state.title && state.playing === 'true') return state;
    if (state.error) throw new Error(`playback failed: ${state.error}`);
    await page.waitForTimeout(400);
  }
  throw new Error('playback did not start');
}

async function canvasStats(selector) {
  return page.evaluate((query) => {
    const canvas = document.querySelector(query);
    if (!canvas) return null;
    const context = canvas.getContext('2d');
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let alpha = 0;
    let max = 0;
    let minY = canvas.height;
    let maxY = 0;
    for (let index = 3; index < data.length; index += 4) {
      const value = data[index];
      alpha += value;
      if (value > max) max = value;
      if (value > 12) {
        const y = Math.floor((index - 3) / 4 / canvas.width);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return { alpha, max, span: maxY - minY, width: canvas.width, height: canvas.height };
  }, selector);
}

try {
  await page.waitForSelector('.app-shell', { timeout: 60000 });
  await page.waitForSelector('.home-vibe-stage', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await resize(1440, 960);

  await page.locator('.sidebar-item', { hasText: 'Explore' }).first().click();
  await page.waitForSelector('.explore-feature', { timeout: 20000 });
  await page.waitForTimeout(800);
  const idle = await heroState();
  console.log('[idle]', JSON.stringify(idle, null, 2));
  await shot('01-idle-1440');

  await page.locator('.sidebar-item', { hasText: 'Search' }).first().click();
  await page.waitForTimeout(500);
  const input = page.locator('.top-search input').first();
  await input.fill('Kesariya');
  await input.press('Enter');
  await page.waitForSelector('.search-page', { timeout: 20000 });
  await page.waitForTimeout(2500);

  const rows = page.locator('.top-songs .track-row');
  console.log('[rows]', await rows.count());
  if (!(await rows.count())) throw new Error('no search rows');
  await rows.first().dblclick();
  const started = await waitForPlayback();
  console.log('[started]', JSON.stringify(started));

  await page.locator('.sidebar-item', { hasText: 'Explore' }).first().click();
  await page.waitForSelector('.explore-feature', { timeout: 20000 });
  await page.waitForTimeout(1500);
  const playing = await heroState();
  console.log('[playing]', JSON.stringify(playing, null, 2));
  const liveA = await canvasStats('.explore-feature-wave-canvas');
  const railA = await canvasStats('.explore-feature-rail-wave');
  await page.waitForTimeout(400);
  const liveB = await canvasStats('.explore-feature-wave-canvas');
  const railB = await canvasStats('.explore-feature-rail-wave');
  console.log('[canvases]', JSON.stringify({ cream: { a: liveA, b: liveB }, rail: { a: railA, b: railB } }));
  await shot('02-playing-1440');

  await page.locator('.explore-feature-play').click();
  await page.waitForTimeout(1200);
  const paused = await heroState();
  console.log('[paused]', JSON.stringify({ playLabel: paused.playLabel, rail: paused.rail, waveClass: paused.waveClass, waveOpacity: paused.waveOpacity, playing: paused.playing }));
  const pausedCream = await canvasStats('.explore-feature-wave-canvas');
  const pausedRail = await canvasStats('.explore-feature-rail-wave');
  console.log('[canvases paused]', JSON.stringify({ cream: pausedCream, rail: pausedRail }));
  await shot('03-paused-1440');

  await page.locator('.explore-feature-play').click();
  await page.waitForTimeout(900);
  const resumed = await heroState();
  console.log('[resumed]', JSON.stringify({ playLabel: resumed.playLabel, playing: resumed.playing }));

  const before = await heroState();
  await page.locator('.player-center .play-button').first().focus();
  await page.getByRole('button', { name: 'Next', exact: true }).first().click();
  await page.waitForTimeout(1800);
  const after = await heroState();
  console.log('[switch]', JSON.stringify({ before: { title: before.title, cover: before.cover, player: before.playerTitle, covers: before.covers.length }, after: { title: after.title, cover: after.cover, player: after.playerTitle, artist: after.artist, album: after.album, palette: after.palette, covers: after.covers.length } }, null, 2));
  await shot('04-switched-1440');

  await page.setViewportSize({ width: 1024, height: 680 });
  await page.waitForTimeout(900);
  const compact = await heroState();
  console.log('[compact]', JSON.stringify({ width: compact.width, height: compact.height, grid: compact.grid, overflow: compact.overflow, title: compact.title, h1Size: compact.h1Size }));
  await shot('05-compact-1024');

  await page.locator('.explore-page').evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(500);
  await shot('06-compact-top-1024');

  for (const width of [950, 850, 640, 560]) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(600);
    const state = await heroState();
    console.log(`[responsive ${width}]`, JSON.stringify({
      width: state.width,
      height: state.height,
      grid: state.grid,
      rail: state.railDisplay,
      art: state.artDisplay,
      artWidth: state.artWidth,
      coverWidth: state.coverWidth,
      h1Size: state.h1Size,
      wave: state.waveDisplay,
      overflow: state.overflow,
      titleLines: await page.locator('.explore-feature h1').evaluate((element) => ({ scroll: element.scrollHeight, client: element.clientHeight })),
    }));
    await shot(`07-responsive-${width}`);
  }

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.sidebar-item', { hasText: 'Home' }).first().click();
  await page.waitForTimeout(600);
  await page.locator('.sidebar-item', { hasText: 'Explore' }).first().click();
  await page.waitForSelector('.explore-feature', { timeout: 20000 });
  await page.waitForTimeout(900);
  const reduced = await page.evaluate(() => {
    const names = ['.explore-feature-sweep', '.explore-feature-note', '.explore-feature-sparkle', '.explore-feature-vinyl'].map((selector) => {
      const element = document.querySelector(selector);
      return element ? getComputedStyle(element).animationName : null;
    });
    const cream = document.querySelector('.explore-feature-wave-canvas');
    const rail = document.querySelector('.explore-feature-rail-wave');
    return { names, cream: cream?.toDataURL(), rail: rail?.toDataURL() };
  });
  await page.waitForTimeout(600);
  const reducedAgain = await page.evaluate(() => ({
    cream: document.querySelector('.explore-feature-wave-canvas')?.toDataURL(),
    rail: document.querySelector('.explore-feature-rail-wave')?.toDataURL(),
  }));
  console.log('[reduced-motion]', JSON.stringify({
    animationNames: reduced.names,
    creamStatic: reduced.cream === reducedAgain.cream,
    railStatic: reduced.rail === reducedAgain.rail,
  }));
  await shot('08-reduced-motion-1440');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
} catch (error) {
  console.error('[FAIL]', error.message);
  issues.push(`[fail] ${error.message}`);
  await shot('99-failure').catch(() => {});
} finally {
  console.log('[issues]', JSON.stringify(issues, null, 2));
  await app.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
