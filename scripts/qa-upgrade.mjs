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
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-qa-upgrade-'));
const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-qa-upgrade-downloads-'));

const app = await electron.launch({
  executablePath,
  args: [`--user-data-dir=${userData}`],
  env: { ...process.env, AURALIS_QA_DOWNLOAD_DIR: downloadDir },
  timeout: 90000,
});
const page = await app.firstWindow({ timeout: 90000 });
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

try {
  await page.waitForSelector('.splash-stage', { timeout: 20000 });
  const splash = {
    layers: await page.locator('.splash-layer').count(),
    visible: await page.locator('.splash').isVisible(),
  };
  await page.screenshot({ path: 'qa/upgrade-splash.png' });
  check('Cold-start animation renders all 13 layers', splash.layers === 13 && splash.visible, JSON.stringify(splash));

  await page.waitForSelector('.home-hero', { timeout: 90000 });
  check('Splash clears after startup', !(await page.locator('.splash').count()));

  const scroll = await page.locator('.content-scroll').evaluate((node) => {
    const style = getComputedStyle(node);
    return { scrollbarWidth: style.scrollbarWidth, overflowY: style.overflowY };
  });
  check('Content scrollbars hidden but scrolling enabled', scroll.scrollbarWidth === 'none' && scroll.overflowY === 'auto', JSON.stringify(scroll));

  await page.locator('.sidebar-item', { hasText: 'Search' }).first().click();
  const search = page.locator('.top-search input').first();
  await search.fill('Kesariya Arijit Singh');
  await search.press('Enter');
  await page.waitForSelector('.search-page', { timeout: 30000 });
  await page.waitForSelector('.track-row', { timeout: 60000 });

  const first = page.locator('.track-row').first();
  const title = await first.locator('.track-title').innerText();
  await first.click();
  await page.waitForSelector('.mini-progress-range', { timeout: 30000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('.player-center .play-button');
    return button?.getAttribute('aria-label') === 'Pause';
  }, { timeout: 45000 });
  // Duration comes from loadedmetadata, so wait for the real rail instead of
  // checking during the brief pre-metadata window.
  await page.waitForFunction(() => {
    const rail = document.querySelector('.mini-progress-range');
    return rail && Number(rail.max) > 30 && !rail.disabled;
  }, { timeout: 45000 });

  const mini = await page.locator('.mini-progress-range').evaluate((node) => ({
    max: Number(node.max),
    value: Number(node.value),
    disabled: node.disabled,
  }));
  check('Mini-player progress is always present and seekable', mini.max > 30 && !mini.disabled, JSON.stringify(mini));

  const beforeSeek = mini.value;
  const railBox = await page.locator('.mini-progress-range').boundingBox();
  if (railBox) {
    await page.mouse.click(railBox.x + railBox.width * 0.35, railBox.y + railBox.height / 2);
    await page.waitForFunction(
      (start) => Number(document.querySelector('.mini-progress-range')?.value || 0) > Math.max(30, start + 5),
      beforeSeek,
      { timeout: 15000 },
    ).catch(() => {});
  }
  const seeked = await page.locator('.mini-progress-range').evaluate((node) => ({
    value: Number(node.value),
    text: node.getAttribute('aria-valuetext') || '',
  }));
  check('Seeking from the mini-player moves playback', seeked.value > Math.max(30, beforeSeek + 5), JSON.stringify(seeked));

  await page.locator('.player-right button[aria-label="Open now playing"]').click();
  await page.waitForSelector('.now-playing');
  const queueSelected = await page.locator('#np-tab-queue').getAttribute('aria-selected');
  const queueRows = await page.locator('.now-playing .queue-row').count();
  check('Now Playing defaults to Queue', queueSelected === 'true' && queueRows > 0, `${queueSelected}/${queueRows}`);

  await page.locator('#np-tab-lyrics').click();
  await page.waitForSelector('.lyrics-panel');
  check('Lyrics tab switches without stopping playback', (await page.locator('.player-center .play-button').getAttribute('aria-label')) === 'Pause');

  await page.locator('button[aria-label="Close now playing"]').click().catch(async () => {
    await page.keyboard.press('Escape');
  });

  await page.locator('.player-right button[aria-label^="Streaming quality"]').click();
  await page.locator('.context-menu .menu-item', { hasText: 'High (256 kbps)' }).click();
  await page.waitForFunction(() => {
    const button = document.querySelector('.player-center .play-button');
    return button?.getAttribute('aria-label') === 'Pause';
  }, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const quality = await page.evaluate(() => window.auralis.settings.get());
  const qualityPlaying = (await page.locator('.player-center .play-button').getAttribute('aria-label')) === 'Pause';
  check('In-player quality selector persists and reloads', quality.audioQuality === 'high' && qualityPlaying, quality.audioQuality);

  const media = await page.evaluate(() => ({
    title: navigator.mediaSession.metadata?.title || '',
    state: navigator.mediaSession.playbackState,
  }));
  const playerTitle = await page.locator('.player-title').innerText();
  check('Media Session mirrors the single playback source', media.title === playerTitle && media.state === 'playing', JSON.stringify(media));

  await page.locator('.sidebar-item', { hasText: 'Home' }).first().click();
  await page.waitForSelector('.quick-rail', { timeout: 15000 });
  const quick = await page.locator('.quick-rail').evaluate((node) => {
    const style = getComputedStyle(node);
    return { cards: node.children.length, overflowX: style.overflowX, overflowY: style.overflowY };
  });
  check('Jump back in is a horizontal real-history carousel', quick.cards > 0 && quick.overflowX === 'auto', JSON.stringify(quick));

  await page.locator('.sidebar-item', { hasText: 'Search' }).first().click();
  await page.waitForSelector('.search-history-chip', { timeout: 15000 });
  const historyBefore = await page.evaluate(async () => (await window.auralis.library.get()).searchHistory);
  await page.locator('.search-history-chip .search-history-remove').first().click();
  await page.waitForTimeout(500);
  const historyAfter = await page.evaluate(async () => (await window.auralis.library.get()).searchHistory);
  check(
    'Individual search history removal is persisted',
    historyBefore.length > historyAfter.length && historyAfter.length === historyBefore.length - 1,
    `${historyBefore.length} -> ${historyAfter.length}`,
  );

  await page.locator('.sidebar-item', { hasText: 'Settings' }).last().click();
  await page.waitForSelector('.settings-nav');
  await page.locator('.settings-nav-item', { hasText: 'Playback' }).click();
  const eqToggle = page.locator('.setting-row', { hasText: 'Enable equalizer' }).locator('button[role="switch"]');
  if ((await eqToggle.getAttribute('aria-checked')) !== 'true') await eqToggle.click();
  await page.waitForFunction(() => {
    const row = Array.from(document.querySelectorAll('.setting-row')).find((node) =>
      node.textContent?.includes('Enable equalizer'),
    );
    return row?.querySelector('button[role="switch"]')?.getAttribute('aria-checked') === 'true';
  }, { timeout: 10000 });
  const presetCount = await page.locator('.eq-presets button').count();
  await page.locator('.eq-presets button', { hasText: 'Bass' }).first().click();
  await page.waitForFunction(async () => {
    const eq = (await window.auralis.settings.get()).eq;
    return eq.enabled === true && eq.bands[0] === 6 && eq.bassBoost === 5;
  }, { timeout: 10000 }).catch(() => {});
  const eq = await page.evaluate(async () => (await window.auralis.settings.get()).eq);
  check(
    'EQ enables and the Bass preset applies a real curve and shelf',
    presetCount >= 5 && eq.enabled === true && eq.bands[0] === 6 && eq.bassBoost === 5,
    JSON.stringify(eq),
  );

  const bassSlider = page.locator('input[aria-label="Bass boost"]');
  await bassSlider.evaluate((node) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(node, '8');
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(async () => (await window.auralis.settings.get()).eq.bassBoost === 8, { timeout: 10000 }).catch(() => {});
  const bass = await page.evaluate(async () => (await window.auralis.settings.get()).eq.bassBoost);
  check('Bass boost slider persists a numeric dB shelf', bass === 8, String(bass));

  await page.locator('.settings-nav-item', { hasText: 'Lyrics' }).click();
  await page.waitForSelector('.provider-list');
  await page.locator('.setting-row', { hasText: 'Target language' }).locator('select').selectOption('HI');
  await page.waitForTimeout(400);
  const targetLanguage = await page.evaluate(async () => (await window.auralis.settings.get()).translation.targetLanguage);
  check('Translation target language selection persists', targetLanguage === 'HI', targetLanguage);

  const translationError = await page.evaluate(async () => {
    try {
      await window.auralis.lyrics.translate(['Hello, this is Auralis.'], 'HI');
      return '';
    } catch (error) {
      return error?.message || String(error);
    }
  });
  check(
    'Keyless translation surfaces a real setup error',
    /Configure a DeepL API key/i.test(translationError),
    translationError,
  );

  await page.screenshot({ path: 'qa/upgrade-settings.png' });

  const unexpected = issues.filter((text) => !/ERR_ABORTED|Failed to load resource/.test(text));
  check('No unexpected page or console errors', unexpected.length === 0, unexpected.join(' | '));
} finally {
  await app.close().catch(() => {});
  fs.rmSync(userData, { recursive: true, force: true });
  fs.rmSync(downloadDir, { recursive: true, force: true });
}

const failed = checks.filter((entry) => !entry.ok);
fs.writeFileSync('qa/upgrade-results.json', JSON.stringify({ version: packageJson.version, checks, issues }, null, 2));
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exitCode = 1;
