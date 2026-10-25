import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const shotsDir = path.resolve('qa');
fs.mkdirSync(shotsDir, { recursive: true });
const issues = [];
let step = 0;

async function shot(page, name) {
  step += 1;
  const file = path.join(shotsDir, `${String(step).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  console.log(`[shot] ${file}`);
  return file;
}

const app = await electron.launch({
  args: ['.', `--user-data-dir=${path.join(process.env.TEMP || '.', 'auralis-qa-userdata')}`],
  cwd: process.cwd(),
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1', AURALIS_FORCE_PROD: '1' },
  timeout: 60000,
});

app.on('window', (win) => {
  win.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
  win.on('console', (message) => {
    if (message.type() === 'error') issues.push(`[console] ${message.text()}`);
  });
});

const page = await app.firstWindow({ timeout: 60000 });
page.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') issues.push(`[console] ${message.text()}`);
});

await page.waitForLoadState('domcontentloaded');
await page.waitForSelector('.app-shell', { timeout: 60000 });
try {
  await page.waitForSelector('.home-hero', { timeout: 30000 });
} catch {
  issues.push('[home] hero did not appear');
}
await page.waitForTimeout(1800);

const shell = await page.evaluate(() => {
  const box = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height), top: Math.round(rect.top) };
  };
  return {
    title: document.title,
    viewport: { width: innerWidth, height: innerHeight },
    splash: Boolean(document.querySelector('.splash')),
    sidebar: box('.sidebar'),
    topbar: box('.top-bar'),
    player: box('.player-bar'),
    content: box('.content-scroll'),
    homeHero: box('.home-hero'),
    bodyText: document.body.innerText.slice(0, 1200),
  };
});
console.log('[shell]', JSON.stringify(shell, null, 2));
await shot(page, 'home');

async function clickSidebar(text) {
  const item = page.locator('.sidebar-item', { hasText: text }).first();
  await item.click();
  await page.waitForTimeout(1800);
}

try {
  await clickSidebar('Explore');
  await shot(page, 'explore');
  console.log('[explore text]', (await page.locator('.content-scroll').innerText()).slice(0, 400));

  const search = page.locator('.top-search input').first();
  await search.fill('Arijit Singh');
  await search.press('Enter');
  await page.waitForTimeout(3500);
  await shot(page, 'search');
  console.log('[search text]', (await page.locator('.content-scroll').innerText()).slice(0, 800));

  const firstPlay = page.locator('.top-result-play').first();
  if (await firstPlay.count()) {
    await firstPlay.click();
    await page.waitForTimeout(7000);
    await shot(page, 'search-playing');
    const playing = await page.evaluate(() => ({
      playerTitle: document.querySelector('.player-title')?.textContent,
      playerError: document.querySelector('.player-error')?.textContent,
      audio: [...document.querySelectorAll('audio')].map((a) => ({ src: a.src.slice(0, 80), paused: a.paused, time: a.currentTime, ready: a.readyState })),
    }));
    console.log('[playing]', JSON.stringify(playing, null, 2));

    const nowPlayingButton = page.locator('.player-art-button').first();
    if (await nowPlayingButton.count()) {
      await nowPlayingButton.click();
      await page.waitForTimeout(2200);
      await shot(page, 'now-playing');
      const tabs = page.locator('.np-tabs button');
      if (await tabs.count()) {
        await tabs.nth(1).click();
        await page.waitForTimeout(900);
        await shot(page, 'now-playing-queue');
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  }
} catch (error) {
  issues.push(`[flow] ${error.message}`);
  console.error('[flow error]', error);
}

try {
  await clickSidebar('Library');
  await shot(page, 'library');
  const tabs = page.locator('.library-tab');
  if (await tabs.count() > 1) {
    await tabs.nth(1).click();
    await page.waitForTimeout(1200);
    await shot(page, 'library-songs');
  }
} catch (error) {
  issues.push(`[library] ${error.message}`);
}

try {
  await clickSidebar('Downloads');
  await shot(page, 'downloads');
} catch (error) {
  issues.push(`[downloads] ${error.message}`);
}

try {
  await clickSidebar('Settings');
  await page.waitForTimeout(900);
  await shot(page, 'settings-general');
  const nav = page.locator('.settings-nav-item');
  for (const [index, name] of [[1, 'settings-appearance'], [2, 'settings-playback'], [3, 'settings-lyrics'], [5, 'settings-integrations'], [6, 'settings-account'], [7, 'settings-about']]) {
    if (await nav.count() > index) {
      await nav.nth(index).click();
      await page.waitForTimeout(600);
      await shot(page, name);
    }
  }
} catch (error) {
  issues.push(`[settings] ${error.message}`);
}

console.log('[issues]', JSON.stringify(issues, null, 2));
await app.close();
