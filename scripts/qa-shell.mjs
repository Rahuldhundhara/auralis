import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

fs.mkdirSync('qa/shell', { recursive: true });
const profile = path.join(process.env.TEMP || '.', `auralis-shell-qa-${Date.now()}`);
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
  await page.waitForTimeout(700);
}

async function shot(name) {
  await page.screenshot({ path: `qa/shell/${name}.png` });
}

async function shellState() {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
    };
    const controls = [...document.querySelectorAll('.top-bar .window-controls .window-btn')].map((button) => {
      const box = button.getBoundingClientRect();
      return { label: button.getAttribute('aria-label'), width: box.width, height: box.height, right: box.right };
    });
    const search = document.querySelector('.top-search');
    const bar = document.querySelector('.player-bar');
    const topbar = document.querySelector('.top-bar');
    const sidebar = document.querySelector('.sidebar');
    return {
      tokens: {
        titlebar: root.getPropertyValue('--titlebar-h').trim(),
        sidebar: root.getPropertyValue('--sidebar-w').trim(),
        player: root.getPropertyValue('--player-h').trim(),
        topbar: root.getPropertyValue('--topbar-h').trim(),
        accent: root.getPropertyValue('--accent').trim(),
        accentRgb: root.getPropertyValue('--accent-rgb').trim(),
        accentContrast: root.getPropertyValue('--accent-contrast').trim(),
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      titlebarPresent: Boolean(document.querySelector('.app-body .titlebar')),
      sidebar: rect('.sidebar'),
      topbar: rect('.top-bar'),
      player: rect('.player-bar'),
      controls,
      closeGap: controls.length ? window.innerWidth - controls[controls.length - 1].right : null,
      topbarOverflow: topbar ? topbar.scrollWidth - topbar.clientWidth : null,
      searchWidth: search ? search.getBoundingClientRect().width : null,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      contentOverflow: (() => {
        const content = document.querySelector('.content-scroll');
        return content ? content.scrollWidth - content.clientWidth : null;
      })(),
      playerOverflow: bar ? bar.scrollWidth - bar.clientWidth : null,
      sidebarOverflow: sidebar ? sidebar.scrollWidth - sidebar.clientWidth : null,
      bodyFont: getComputedStyle(document.body).fontFamily,
      displayFont: document.querySelector('.sidebar-brand-copy strong')
        ? getComputedStyle(document.querySelector('.sidebar-brand-copy strong')).fontFamily
        : null,
      fonts: {
        manrope: document.fonts.check('14px Manrope'),
        bricolage: document.fonts.check('16px "Bricolage Grotesque"'),
      },
      accentResolved: (() => {
        const play = document.querySelector('.player-center .play-button');
        return play ? getComputedStyle(play).backgroundColor : null;
      })(),
      topbarRegion: topbar ? getComputedStyle(topbar).getPropertyValue('-webkit-app-region') : null,
    };
  });
}

async function checkLayout(label, expected) {
  const state = await shellState();
  const failures = [];
  if (state.tokens.titlebar !== '0px') failures.push(`titlebar ${state.tokens.titlebar}`);
  if (state.tokens.sidebar !== '256px' && expected.sidebar !== 'narrow') failures.push(`sidebar ${state.tokens.sidebar}`);
  if (state.tokens.player !== '96px') failures.push(`player token ${state.tokens.player}`);
  if (state.sidebar && Math.abs(state.sidebar.width - (expected.sidebar === 'narrow' ? 232 : 256)) > 1) {
    failures.push(`sidebar width ${state.sidebar.width}`);
  }
  if (state.player && Math.abs(state.player.height - 96) > 1) failures.push(`player height ${state.player.height}`);
  if (!state.titlebarPresent) {
    // Expected: the shell has no titlebar; window controls live in the top bar.
  } else {
    failures.push('shell still renders a titlebar');
  }
  if (state.controls.length !== 3) failures.push(`window controls ${state.controls.length}`);
  if (state.closeGap === null || state.closeGap < -0.5 || state.closeGap > 1) failures.push(`close gap ${state.closeGap}`);
  if (state.pageOverflow > 0) failures.push(`page overflow ${state.pageOverflow}px`);
  if (state.contentOverflow > 0) failures.push(`content overflow ${state.contentOverflow}px`);
  if (state.topbarOverflow > 0) failures.push(`topbar overflow ${state.topbarOverflow}px`);
  if (state.playerOverflow > 0) failures.push(`player overflow ${state.playerOverflow}px`);
  if (state.sidebarOverflow > 0) failures.push(`sidebar overflow ${state.sidebarOverflow}px`);
  if (!state.fonts.manrope) failures.push('Manrope not loaded');
  if (!state.fonts.bricolage) failures.push('Bricolage Grotesque not loaded');
  if (state.tokens.accent !== '#10b981') failures.push(`accent ${state.tokens.accent}`);
  console.log(`[${label}]`, JSON.stringify(state, null, 2));
  if (failures.length) throw new Error(`${label}: ${failures.join(', ')}`);
  return state;
}

try {
  await page.waitForSelector('.app-shell', { timeout: 60000 });
  await page.waitForSelector('.splash', { timeout: 30000 });
  await page.waitForTimeout(600);
  const splash = await page.evaluate(() => {
    const titlebar = document.querySelector('.titlebar')?.getBoundingClientRect();
    return {
      titlebar: titlebar ? { height: titlebar.height, top: titlebar.top } : null,
      controls: document.querySelectorAll('.titlebar .window-btn').length,
      appBody: Boolean(document.querySelector('.app-body')),
    };
  });
  console.log('[splash]', JSON.stringify(splash));
  if (splash.titlebar?.height !== 38 || splash.controls !== 3) {
    throw new Error(`splash window chrome: ${JSON.stringify(splash)}`);
  }
  await shot('00-splash');

  await page.waitForSelector('.app-body', { timeout: 30000 });
  await page.waitForTimeout(1200);
  await resize(1440, 960);
  await checkLayout('home-1440', { sidebar: 'wide' });
  await shot('01-home-1440');

  await page.locator('.sidebar-item', { hasText: 'Explore' }).first().click();
  await page.waitForSelector('.explore-feature', { timeout: 20000 });
  await page.waitForTimeout(900);
  await shot('02-explore-1440');

  await page.locator('.sidebar-item', { hasText: 'Settings' }).first().click();
  await page.waitForSelector('.settings-page', { timeout: 20000 });
  await page.waitForTimeout(500);
  await shot('03-settings-1440');

  for (const [label, route] of [
    ['library', '.library-page'],
    ['liked', '.liked-page'],
    ['recent', '.recent-page'],
    ['downloads', '.downloads-page'],
  ]) {
    const name = label === 'recent' ? 'Recently played' : label[0].toUpperCase() + label.slice(1);
    await page.locator('.sidebar-item', { hasText: name }).first().click();
    await page.waitForFunction((selector) => Boolean(document.querySelector(selector)), route, { timeout: 20000 });
    await page.waitForTimeout(450);
    const overflow = await page.evaluate(() => {
      const content = document.querySelector('.content-scroll');
      return {
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        content: content ? content.scrollWidth - content.clientWidth : null,
      };
    });
    console.log(`[page ${label}]`, JSON.stringify(overflow));
    if (overflow.page > 0 || (overflow.content ?? 0) > 0) {
      throw new Error(`${label} overflows horizontally: ${JSON.stringify(overflow)}`);
    }
    if (label === 'library' || label === 'liked') await shot(`03b-${label}-1440`);
  }

  // The queue drawer should start below the top bar now that the title bar is gone.
  await page.locator('.queue-pill').click();
  await page.waitForSelector('.queue-drawer', { timeout: 10000 });
  await page.waitForTimeout(450);
  const drawer = await page.evaluate(() => {
    const layer = document.querySelector('.drawer-layer')?.getBoundingClientRect();
    const topbar = document.querySelector('.top-bar')?.getBoundingClientRect();
    return { top: layer?.top, topbarBottom: topbar?.bottom };
  });
  console.log('[queue drawer]', JSON.stringify(drawer));
  if (Math.abs((drawer.top ?? -1) - (drawer.topbarBottom ?? -2)) > 1) {
    throw new Error(`queue drawer top ${drawer.top} vs top bar ${drawer.topbarBottom}`);
  }
  await shot('03c-queue-1440');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);

  // Sidebar collapse keeps the new 256px rail behaviour intact.
  await page.locator('.sidebar-collapse').click();
  await page.waitForTimeout(450);
  const collapsed = await page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar')?.getBoundingClientRect();
    const topbar = document.querySelector('.top-bar')?.getBoundingClientRect();
    return { sidebar: sidebar?.width, topbarX: topbar?.x };
  });
  console.log('[sidebar collapsed]', JSON.stringify(collapsed));
  if (Math.abs((collapsed.sidebar ?? -1) - 78) > 1) throw new Error(`collapsed sidebar ${collapsed.sidebar}`);
  await shot('03d-collapsed-1440');
  await page.locator('.sidebar-collapse').click();
  await page.waitForTimeout(450);

  // Window controls must keep working after moving out of the title bar.
  const maximize = page.locator('.top-bar .window-controls .window-btn').nth(1);
  await maximize.click();
  await page.waitForTimeout(600);
  const maximized = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized());
  await maximize.click();
  await page.waitForTimeout(600);
  const restored = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized());
  console.log('[maximize]', JSON.stringify({ maximized, restored }));
  if (!maximized || restored) throw new Error(`window controls failed: maximized=${maximized} restored=${restored}`);
  await resize(1440, 960);

  await page.locator('.sidebar-item', { hasText: 'Home' }).first().click();
  await page.waitForTimeout(500);
  await resize(1024, 680);
  await checkLayout('home-1024', { sidebar: 'narrow' });
  await shot('04-home-1024');

  await page.locator('.sidebar-item', { hasText: 'Explore' }).first().click();
  await page.waitForSelector('.explore-feature', { timeout: 20000 });
  await page.waitForTimeout(900);
  await checkLayout('explore-1024', { sidebar: 'narrow' });
  await shot('05-explore-1024');

  await page.locator('.sidebar-item', { hasText: 'Search' }).first().click();
  await page.waitForFunction(() => Boolean(document.querySelector('.search-landing')), null, { timeout: 20000 });
  await page.waitForTimeout(600);
  await checkLayout('search-1024', { sidebar: 'narrow' });
  await shot('06-search-1024');
} catch (error) {
  console.error('[FAIL]', error.message);
  issues.push(`[fail] ${error.message}`);
  await shot('99-failure').catch(() => {});
} finally {
  console.log('[issues]', JSON.stringify(issues, null, 2));
  await app.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
