import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const shotsDir = path.resolve('qa/explore');
fs.mkdirSync(shotsDir, { recursive: true });
const issues = [];
const warnings = [];
const shot = async (page, name) => {
  const file = path.join(shotsDir, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`[shot] ${file}`);
};

const app = await electron.launch({
  args: [
    '.',
    `--user-data-dir=${path.join(os.tmpdir(), `auralis-qa-explore-${Date.now()}`)}`,
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
page.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text();
  // CDN fetch failures are reported by the resource loader, not by the app;
  // real breakage is caught by the visible-broken-images checks instead.
  if (/Failed to load resource/.test(text)) {
    warnings.push(`[console] ${text}`);
    return;
  }
  issues.push(`[console] ${text} @ ${message.location()?.url || ''}`);
});
await page.waitForLoadState('domcontentloaded');
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
  await page.waitForTimeout(1000);
}

// Match the reference viewport as closely as the app's minimum size allows.
await app.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  win.setBounds({ x: 40, y: 40, width: 1024, height: 680 });
  win.center();
});
await page.waitForTimeout(800);

const visibleBrokenImages = async () =>
  page.evaluate(() => {
    const scroll = document.querySelector('.content-scroll')?.getBoundingClientRect();
    const top = scroll?.top ?? 0;
    const bottom = Math.min(scroll?.bottom ?? window.innerHeight, window.innerHeight);
    return [...document.images]
      .filter((img) => {
        const rect = img.getBoundingClientRect();
        return rect.width > 8 && rect.height > 8 && rect.bottom > top && rect.top < bottom;
      })
      // Only flag images that finished and failed; lazy offscreen images may not have started.
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => ({ src: img.currentSrc || img.src, alt: img.alt }))
      .slice(0, 8);
  });

const go = async (label) => {
  const item = page.locator('.sidebar-item').filter({ hasText: new RegExp(`^${label}$`) }).first();
  await item.click();
  await page.waitForTimeout(700);
  let active = await item.evaluate((el) => el.classList.contains('is-active')).catch(() => false);
  if (!active) {
    // A first click can be consumed by closing the search popover / a menu.
    await item.click();
    await page.waitForTimeout(900);
    active = await item.evaluate((el) => el.classList.contains('is-active')).catch(() => false);
  }
  if (!active) {
    // Last resort for headless WMs where a transparent overlay swallows clicks.
    await page.evaluate((target) => {
      const el = [...document.querySelectorAll('.sidebar-item')].find((node) => node.textContent?.trim() === target);
      if (el instanceof HTMLElement) el.click();
    }, label);
  }
  await page.waitForTimeout(2500);
};

// Open Explore.
await page.locator('.sidebar-item', { hasText: 'Explore' }).first().click();
await page.waitForTimeout(4000);
await page.screenshot({ path: path.join(shotsDir, 'cloud-hero.png') });
const scrollTo = async (pixels) =>
  page.evaluate((y) => {
    const el = document.querySelector('.content-scroll');
    if (el) el.scrollTop = y;
  }, pixels);
for (const position of [[0, 'top'], [640, 'moods'], [1300, 'new-albums'], [2000, 'trending'], [2700, 'episodes'], [3500, 'gems']]) {
  await scrollTo(position[0]);
  await page.waitForTimeout(400);
  await shot(page, `scroll-${position[1]}`);
}
const layout = await page.evaluate(() => ({
  hero: Boolean(document.querySelector('.explore-feature')),
  h1: document.querySelector('.explore-feature h1')?.textContent || '',
  playMix: Boolean(document.querySelector('.explore-feature-play')),
  featured: Boolean(document.querySelector('.explore-fan-cover img, .explore-fan-cover svg')),
  eyebrow: Boolean(document.querySelector('.explore-feature-eyebrow')),
  secondary: Boolean(document.querySelector('.explore-feature-secondary')),
  state: '',
  moods: document.querySelectorAll('.explore-mood').length,
  photoMoods: document.querySelectorAll('.explore-mood.is-photo').length,
  iconMoods: document.querySelectorAll('.explore-mood.is-icon, .explore-mood-icon').length,
  moodLabels: [...document.querySelectorAll('.explore-mood-copy strong')].map((el) => el.textContent),
  sectionTop: document.querySelector('.explore-section')?.offsetTop ?? -1,
  heroRadius: (() => {
    const hero = document.querySelector('.explore-feature');
    return hero ? getComputedStyle(hero).borderBottomLeftRadius : '';
  })(),
  newAlbums: document.querySelectorAll('#explore-new .media-card').length,
  trending: document.querySelectorAll('#explore-new ~ section .media-card').length,
  episodes: document.querySelectorAll('.explore-episode').length,
  gems: document.querySelectorAll('.explore-gems .track-row').length,
  navTabs: document.querySelectorAll('.explore-tab').length,
  moreToExplore: /More to explore/i.test(document.body.innerText),
  identifyIcon: document.querySelector('.identify-inline svg')?.getAttribute('class') || '',
  sidebarVisualizer: Boolean(document.querySelector('.sidebar-visualizer')),
  topbar: (() => {
    const account = document.querySelector('.account-chip');
    const titlebar = document.querySelector('.titlebar');
    if (!account || !titlebar) return null;
    const a = account.getBoundingClientRect();
    const t = titlebar.getBoundingClientRect();
    const hit = document.elementFromPoint(a.x + a.width / 2, a.y + a.height / 2);
    return {
      accountRight: Math.round(a.right),
      titlebarLeft: Math.round(t.left),
      centerInsideAccount: Boolean(hit && account.contains(hit)),
    };
  })(),
}));
console.log('[layout]', JSON.stringify(layout, null, 2));
if (!layout.hero) issues.push('[explore] hero missing');
if (!layout.playMix) issues.push('[explore] featured play button missing');
if (layout.moods !== 15) issues.push(`[explore] expected 15 mood tiles, got ${layout.moods}`);
if (layout.photoMoods !== 15) issues.push(`[explore] expected 15 photo mood tiles, got ${layout.photoMoods}`);
if (layout.iconMoods !== 0) issues.push(`[explore] icon-only mood tiles still present: ${layout.iconMoods}`);
for (const label of ['Dhol dhol', 'Relaxation', 'Feel good', 'Morning Energy']) {
  if (!layout.moodLabels.includes(label)) issues.push(`[explore] missing mood: ${label}`);
}
if (!layout.featured) issues.push('[explore] fanned hero artwork missing');
if (!layout.eyebrow) issues.push('[explore] NOW PLAYING eyebrow missing');
if (!layout.secondary) issues.push('[explore] Add to Queue / Like actions missing');
if (layout.heroRadius !== '24px') issues.push(`[explore] hero card radius should be 24px: ${layout.heroRadius}`);
if (layout.navTabs !== 0) issues.push('[explore] four nav buttons row still present');
if (layout.moreToExplore) issues.push('[explore] "More to explore" section still present');
if (!/lucide-mic/.test(layout.identifyIcon)) issues.push('[topbar] Identify is not using a microphone icon');
if (/lucide-audio-lines/.test(layout.identifyIcon)) issues.push('[topbar] equalizer visualizer still present beside Identify');
if (!layout.sidebarVisualizer) issues.push('[sidebar] visualizer was removed by mistake');
if (!layout.topbar) issues.push('[topbar] account chip or titlebar missing');
else {
  if (layout.topbar.accountRight > layout.topbar.titlebarLeft - 2) {
    issues.push(
      `[topbar] account chip is under the window controls (${layout.topbar.accountRight} > ${layout.topbar.titlebarLeft})`,
    );
  }
  if (!layout.topbar.centerInsideAccount) issues.push('[topbar] account chip is covered by another element');
}
await scrollTo(0);
await page.waitForTimeout(300);
await shot(page, 'top');

const brokenBefore = await visibleBrokenImages();
if (brokenBefore.length) issues.push(`[artwork] broken Explore images: ${JSON.stringify(brokenBefore)}`);

// Play my mix — must start real playback and paint the hero from the artwork.
await page.locator('.explore-feature-play').click();
const started = await page
  .waitForSelector('.player-art-button', { timeout: 20000 })
  .then(() => true)
  .catch(() => false);
console.log('[play-my-mix]', started);
await page.waitForTimeout(3500);
await scrollTo(0);
await page.waitForTimeout(300);
await shot(page, 'hero-playing');
const readHero = () =>
  page.evaluate(() => {
    const root = document.querySelector('.explore-page');
    const style = root ? getComputedStyle(root) : null;
    const art = document.querySelector('.explore-fan-cover img');
    const playerArt = document.querySelector('.player-art img');
    return {
      title: document.querySelector('.explore-feature h1')?.textContent || '',
      version: document.querySelector('.explore-feature-version')?.textContent || '',
      album: document.querySelector('.explore-feature-album')?.textContent || '',
      tagline: document.querySelector('.explore-feature-tagline')?.textContent || '',
      art: art?.getAttribute('src') || '',
      artLoaded: art instanceof HTMLImageElement ? art.naturalWidth > 0 : false,
      playerArt: playerArt?.getAttribute('src') || '',
      playerArtLoaded: playerArt instanceof HTMLImageElement ? playerArt.naturalWidth > 0 : false,
      palette: ['--hero-r', '--hero-g', '--hero-b', '--hero2-r', '--hero2-g', '--hero2-b'].map((name) =>
        style?.getPropertyValue(name).trim(),
      ),
    };
  });
const heroState = await readHero();
console.log('[hero-playing]', JSON.stringify(heroState));
if (!started) issues.push('[explore] Play my mix did not start playback');
if (!heroState.art) issues.push('[explore] hero artwork missing after playback');
if (!heroState.artLoaded) issues.push('[explore] hero artwork failed to load');
if (!/^auralis-media:\/\/image\//.test(heroState.art)) issues.push('[artwork] hero is not using the media proxy');
if (!heroState.playerArtLoaded) issues.push('[artwork] player bar artwork failed to load');

// Skip to another song from the hidden-gems list and verify the cover and palette move with it.
const gemRows = page.locator('.explore-gems .track-row');
if ((await gemRows.count()) > 1) {
  await gemRows.nth(1).click();
  await page.waitForTimeout(3200);
  await scrollTo(0);
  await page.waitForTimeout(300);
  await shot(page, 'hero-playing-2');
  const second = await readHero();
  console.log('[hero-playing-2]', JSON.stringify(second));
  if (second.art === heroState.art) issues.push('[artwork] hero artwork did not change after switching songs');
  if (!second.artLoaded) issues.push('[artwork] second song artwork failed to load');
  if (!second.playerArtLoaded) issues.push('[artwork] second song player artwork failed to load');
  const changed = second.palette.some((value, index) => value !== heroState.palette[index]);
  if (!changed) warnings.push('[hero] palette did not visibly change between the two test songs');
  else console.log('[hero-palette] changed', heroState.palette, '->', second.palette);
} else {
  warnings.push('[explore] hidden-gems list was empty; skipped the second-song artwork check');
}

// Episodes must play.
await scrollTo(99999);
await page.waitForTimeout(400);
const episodeButtons = page.locator('.explore-episode');
if ((await episodeButtons.count()) > 0) {
  await episodeButtons.first().click();
  await page.waitForTimeout(4000);
  const title = await page.locator('.player-title').first().innerText().catch(() => '');
  console.log('[episode-play]', title);
  if (!title) issues.push('[explore] episode card did not start playback');
} else {
  issues.push('[explore] no podcast episodes rendered');
}

// Home must use the proxied artwork for its dynamic hero and jump-back row.
await go('Home');
await page.waitForSelector('.dynamic-hero', { timeout: 60000 });
await scrollTo(0);
await page.waitForTimeout(3000);
await shot(page, 'home');
const homeState = await page.evaluate(() => {
  const backdrop = document.querySelector('.dynamic-hero-backdrop');
  const img = document.querySelector('.dynamic-hero img, .jump-back-cover');
  return {
    backdrop: backdrop ? getComputedStyle(backdrop).backgroundImage : '',
    img: img?.getAttribute('src') || '',
    imgLoaded: img instanceof HTMLImageElement ? img.naturalWidth > 0 : false,
  };
});
console.log('[home]', JSON.stringify(homeState));
if (!homeState.backdrop.includes('auralis-media://image/')) issues.push('[artwork] Home hero backdrop is not proxied');
const brokenHome = await visibleBrokenImages();
if (brokenHome.length) issues.push(`[artwork] broken Home images: ${JSON.stringify(brokenHome)}`);

// Podcasts header and show art.
await go('Podcasts');
await scrollTo(0);
await page.waitForTimeout(2500);
await shot(page, 'podcasts-header');
const brokenPodcasts = await visibleBrokenImages();
if (brokenPodcasts.length) issues.push(`[artwork] broken Podcasts images: ${JSON.stringify(brokenPodcasts)}`);

// Now Playing backdrop / cover must be proxied and loaded.
await page.locator('.player-art-button').click();
await page.waitForTimeout(1800);
await shot(page, 'now-playing');
const npState = await page.evaluate(() => {
  const img = document.querySelector('.np-art img');
  const backdrop = document.querySelector('.np-backdrop');
  return {
    img: img?.getAttribute('src') || '',
    loaded: img instanceof HTMLImageElement ? img.naturalWidth > 0 : false,
    backdrop: backdrop ? getComputedStyle(backdrop).backgroundImage : '',
  };
});
console.log('[now-playing]', JSON.stringify(npState));
if (!npState.loaded) issues.push('[artwork] Now Playing cover failed to load');
if (!npState.backdrop.includes('auralis-media://image/')) issues.push('[artwork] Now Playing backdrop is not proxied');
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

console.log('\n[warnings]', warnings.length ? JSON.stringify(warnings, null, 2) : 'none');
console.log('[issues]', issues.length ? JSON.stringify(issues, null, 2) : 'none');
await app.close();
if (issues.length) process.exitCode = 1;
