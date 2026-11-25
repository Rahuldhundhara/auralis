import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

fs.mkdirSync('qa', { recursive: true });
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-qa-hero-'));

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
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

const checks = [];
function check(name, value, detail = '') {
  checks.push({ name, ok: Boolean(value), detail });
  console.log(`[${value ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function waitIdle(min = 500, max = 18000) {
  await page.waitForTimeout(min);
  const started = Date.now();
  while (Date.now() - started < max) {
    if (!(await page.locator('.skeleton').count())) return;
    await page.waitForTimeout(300);
  }
}

async function resize(width, height) {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) return;
      window.unmaximize();
      window.setMinimumSize(320, 320);
      window.setBounds({ width: size[0], height: size[1] });
    },
    [width, height],
  );
  await page.waitForTimeout(700);
  await page
    .waitForFunction(
      (size) => Math.abs(window.innerWidth - size[0]) < 8,
      [width, height],
      { timeout: 5000 },
    )
    .catch(() => {});
}

try {
  await page.waitForSelector('.home-hero', { timeout: 30000 });
  await waitIdle(600);
  check('home hero still renders', await page.locator('.home-hero').isVisible());
  check('greeting heading is gone', !/^(good morning|good afternoon|good evening)$/i.test(await page.locator('.home-hero h1').innerText()));
  const idleThought = (await page.locator('.home-hero h1').innerText()).trim();
  const idleKey = await page.locator('.home-hero h1').getAttribute('data-thought-key');
  const idleBucket = Number(await page.locator('.home-hero h1').getAttribute('data-thought-bucket'));
  check('a mood thought fills the greeting space', idleThought.length > 10, idleThought);
  check(
    'thought is pinned to the current ten-minute slot',
    Math.abs(idleBucket - Math.floor(Date.now() / (10 * 60 * 1000))) <= 1,
    String(idleBucket),
  );
  check('empty now-playing card is shown', await page.locator('.hero-now-card.is-empty').isVisible());
  check(
    'empty card explains how to fill it',
    (await page.locator('.hero-now-card.is-empty .hero-now-meta strong').innerText()).includes('Nothing playing'),
  );
  await page.screenshot({ path: 'qa/home-hero-empty.png' });

  const input = page.locator('.top-search input').first();
  await input.fill('Kesariya');
  await input.press('Enter');
  await page.waitForSelector('.search-page', { timeout: 25000 });
  await waitIdle(800);
  await page.locator('.search-page .track-row').first().click();

  let time = '0:00';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.waitForTimeout(500);
    time = (await page.locator('.seek-bar .time').first().textContent().catch(() => '0:00')) || '0:00';
    if (time !== '0:00') break;
  }
  const playerTitle = (await page.locator('.player-title').first().textContent())?.trim() || '';
  check('a real song starts playing', time !== '0:00', `${playerTitle} @ ${time}`);

  await page.locator('.sidebar-item', { hasText: 'Home' }).first().click();
  await page.waitForSelector('.home-hero', { timeout: 20000 });
  await waitIdle(500);

  check('now-playing card replaces the artwork collage', (await page.locator('.home-hero .hero-now-card.is-playing').count()) === 1);
  check('collage tiles are gone from the hero', (await page.locator('.home-hero .hero-tile').count()) === 0);
  const cardTitle = (await page.locator('.hero-now-card .hero-now-meta strong').innerText()).trim();
  check('card shows the same song as the player bar', cardTitle === playerTitle, `${cardTitle} / ${playerTitle}`);
  check(
    'card shows artwork and a live equalizer while playing',
    (await page.locator('.hero-now-card .hero-now-art').count()) === 1 &&
      (await page.locator('.hero-now-card .hero-now-eq').count()) === 1,
  );
  const heroProgress = await page.locator('.hero-now-progress').evaluate((node) => {
    const fill = node.querySelector('.hero-now-track i');
    return {
      time: node.querySelector('.hero-now-time')?.textContent?.trim() || '',
      width: fill ? parseFloat(getComputedStyle(fill).width) : 0,
    };
  });
  check(
    'card shows real progress and time',
    /^\d+:\d{2} \/ \d+:\d{2}$/.test(heroProgress.time) && heroProgress.width > 0,
    JSON.stringify(heroProgress),
  );
  const kicker = (await page.locator('.hero-kicker').innerText()).trim();
  check(
    'hero kicker reflects live playback',
    /live radio|currently dominating/i.test(kicker) && (await page.locator('.hero-kicker.is-live').count()) === 1,
    kicker,
  );
  const playingThought = (await page.locator('.home-hero h1').innerText()).trim();
  const playingKey = await page.locator('.home-hero h1').getAttribute('data-thought-key');
  check(
    'thought changes with the song and playing state',
    playingKey !== idleKey && Boolean(playingKey?.includes(':playing:')),
    `${playingThought} (${playingKey})`,
  );
  await page.screenshot({ path: 'qa/home-hero-playing.png' });

  await page.locator('.hero-now-open').click();
  await page.waitForSelector('.now-playing', { timeout: 10000 });
  check('open player control opens Now Playing', await page.locator('.now-playing').isVisible());
  await page.locator('.now-playing button[aria-label="Close now playing"]').click();
  await page.waitForSelector('.now-playing', { state: 'detached', timeout: 10000 });

  await resize(1024, 680);
  check('card hidden at the 1024px minimum window', await page.locator('.home-hero-now').isHidden());
  check(
    'hero has no horizontal overflow at 1024px',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  );
  await page.screenshot({ path: 'qa/home-hero-compact.png' });

  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
      window.setMinimumSize(1024, 680);
      window.setSize(1440, 920);
    }
  });

  check('no renderer errors during the hero checks', issues.length === 0, issues.join(' | '));
} catch (error) {
  issues.push(`[fatal] ${error?.message || error}`);
  console.error(error);
} finally {
  await app.close().catch(() => {});
}

fs.writeFileSync(
  'qa/home-hero-results.json',
  JSON.stringify({ checks, issues, passed: checks.filter((item) => item.ok).length, total: checks.length }, null, 2),
);
const failed = checks.filter((item) => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length || issues.length) process.exitCode = 1;
