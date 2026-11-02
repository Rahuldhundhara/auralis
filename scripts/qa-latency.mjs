import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const outDir = path.resolve('qa', 'latency');
fs.mkdirSync(outDir, { recursive: true });
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-qa-latency-'));
const env = { ...process.env, AURALIS_FORCE_PROD: '1', AURALIS_DEBUG_STREAM: '1' };

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  cwd: process.cwd(),
  env,
  timeout: 60000,
});
const page = await app.firstWindow({ timeout: 60000 });
const consoleLines = [];
const mainLines = [];
const httpErrors = [];
app.process().stderr?.on('data', (chunk) => mainLines.push(chunk.toString().trim()));
app.process().stdout?.on('data', (chunk) => mainLines.push(chunk.toString().trim()));
page.on('response', (response) => {
  if (response.status() >= 400) {
    httpErrors.push({ status: response.status(), url: response.url().slice(0, 160) });
  }
});
page.on('requestfailed', (request) => {
  httpErrors.push({ failed: request.url().slice(0, 160), error: request.failure()?.errorText });
});
page.on('console', (message) => {
  if (message.type() === 'error' || message.text().includes('[streams]')) consoleLines.push(message.text());
});

const results = { resolve: [], playback: [], hover: [], console: consoleLines, main: mainLines, http: httpErrors, issues: [] };

async function waitFor(fn, timeout = 30000, interval = 25) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await fn()) return Date.now() - started;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`timed out after ${timeout} ms`);
}

try {
  await page.waitForSelector('.app-shell', { timeout: 60000 });
  // Let Home finish so the Innertube session has a stable visitorData before
  // the first player call. This mirrors a real launch.
  await page.waitForSelector('.home-hero', { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1500);

  results.resolve = await page.evaluate(async (tracks) => {
    const rows = [];
    for (const track of tracks) {
      const started = performance.now();
      try {
        const info = await window.auralis.player.resolve(track);
        rows.push({
          id: track.id,
          ms: Math.round(performance.now() - started),
          format: info.format,
          quality: info.quality,
          stream: info.url.slice(0, 48),
        });
      } catch (error) {
        rows.push({ id: track.id, error: String(error?.message || error) });
      }
    }
    return rows;
  }, [{ id: 'dQw4w9WgXcQ', title: 'Resolve probe', artists: [], duration: 213 }]);

  await page.waitForTimeout(1500);

  const input = page.locator('.top-search input').first();
  await input.fill('Tainu Khabar Nahi');
  await input.press('Enter');
  await page.waitForSelector('.search-page', { timeout: 30000 });
  await page.locator('.search-page .track-row').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);

  const first = page.locator('.search-page .track-row').first();
  const firstId = await first.getAttribute('data-track-id');
  const clickStarted = Date.now();
  await first.click();
  const spinnerVisible = await page
    .locator('.transport .play-button .spin')
    .first()
    .isVisible()
    .catch(() => false);
  let spinnerSeen = false;
  const toPlaying = await waitFor(async () => {
    if (!spinnerSeen) {
      spinnerSeen = await page.locator('.transport .play-button .spin').first().isVisible().catch(() => false);
    }
    const currentId = await page.locator('.player-title').first().getAttribute('data-track-id').catch(() => null);
    const playing = (await page.locator('.transport .play-button[data-playing="true"]').count()) > 0;
    return currentId === firstId && playing;
  }, 20000);
  const playingAt = Date.now();
  const toPosition = await waitFor(async () => {
    const text = (await page.locator('.seek-bar .time').first().textContent().catch(() => '0:00')) || '0:00';
    return text.trim() !== '0:00';
  }, 20000);
  results.playback.push({
    clickToPlayButtonMs: playingAt - clickStarted,
    clickToPositionMs: Date.now() - clickStarted,
    spinnerVisibleRightAfterClick: spinnerVisible,
    spinnerSeenWhileStarting: spinnerSeen,
    title: (await page.locator('.player-title').first().textContent())?.trim(),
    error: (await page.locator('.player-error').first().textContent().catch(() => ''))?.trim() || null,
  });
  await page.waitForTimeout(2000);

  const warmLinesFor = (videoId) =>
    mainLines
      .join('\n')
      .split(/\r?\n/)
      .filter(
        (line) =>
          line.includes(`[streams] fast path ${videoId} `) ||
          line.includes(`[streams] cached ${videoId}`) ||
          line.includes(`[streams] joined in-flight ${videoId}`),
      ).length;
  const fifth = page.locator('.search-page .track-row').nth(4);
  await fifth.hover();
  const fifthId = await fifth.getAttribute('data-track-id');
  const hoverResolvesBefore = warmLinesFor(fifthId);
  await page.waitForTimeout(1200);
  const hoverResolvesAfter = warmLinesFor(fifthId);
  const hoverStarted = Date.now();
  await fifth.click();
  const hoverPlaying = await waitFor(async () => {
    const currentId = await page.locator('.player-title').first().getAttribute('data-track-id').catch(() => null);
    const playing = (await page.locator('.transport .play-button[data-playing="true"]').count()) > 0;
    return currentId === fifthId && playing;
  }, 20000);
  const hoverPlayingAt = Date.now();
  const hoverPosition = await waitFor(async () => {
    const text = (await page.locator('.seek-bar .time').first().textContent().catch(() => '0:00')) || '0:00';
    return text.trim() !== '0:00';
  }, 20000);
  results.hover.push({
    prefetchedOnHover: hoverResolvesAfter > hoverResolvesBefore,
    clickToPlayButtonMs: hoverPlayingAt - hoverStarted,
    clickToPositionMs: Date.now() - hoverStarted,
    title: (await page.locator('.player-title').first().textContent())?.trim(),
  });

  await page.screenshot({ path: path.join(outDir, 'playing.png') }).catch(() => {});
} catch (error) {
  results.issues.push(String(error?.stack || error));
  await page.screenshot({ path: path.join(outDir, 'failure.png') }).catch(() => {});
} finally {
  await app.close().catch(() => {});
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  setTimeout(() => {
    try {
      fs.rmSync(userData, { recursive: true, force: true });
    } catch {}
  }, 1000);
}
