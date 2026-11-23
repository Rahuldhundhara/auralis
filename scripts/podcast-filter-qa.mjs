import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-podcast-qa-'));
const logs = [];
const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  cwd: process.cwd(),
  env: { ...process.env, AURALIS_FORCE_PROD: '1', AURALIS_SKIP_LOGIN: '1' },
  timeout: 60000,
});
const page = await app.firstWindow({ timeout: 60000 });
app.process().stdout?.on('data', (c) => logs.push(c.toString().trim()));
app.process().stderr?.on('data', (c) => logs.push(c.toString().trim()));

async function snapshot(label) {
  const data = {
    label,
    count: await page.locator('.detail-track-list .track-row').count(),
    titles: await page
      .locator('.detail-track-list .track-title')
      .evaluateAll((nodes) => nodes.slice(0, 3).map((node) => node.textContent?.trim())),
    summary: (await page.locator('.detail-filter-status').count())
      ? (await page.locator('.detail-filter-status span').first().innerText()).trim()
      : null,
    empty: (await page.locator('.detail-empty-note').count())
      ? (await page.locator('.detail-empty-note').innerText()).trim()
      : null,
    selected: await page.locator('.detail-chips .genre-chip.is-selected').allInnerTexts(),
  };
  console.log(JSON.stringify(data));
  return data;
}

async function waitFilterDone(previousSummary) {
  await page.waitForFunction(
    (before) => {
      const node = document.querySelector('.detail-filter-status span');
      const busy = document.querySelector('.detail-filter-loading');
      return !busy && Boolean(node) && node.textContent !== before;
    },
    previousSummary ?? null,
    { timeout: 45000 },
  );
  await page.waitForTimeout(350);
}

async function clearWithProgress() {
  await page.locator('.detail-filter-status .text-link').click();
  await page.waitForFunction(() => !document.querySelector('.detail-filter-status'), null, { timeout: 45000 });
  await page.waitForTimeout(500);
}

try {
  await page.waitForSelector('.app-shell', { timeout: 60000 });
  await page.waitForTimeout(4200);

  const input = page.locator('.top-search input').first();
  await input.fill('Good Mythical Morning');
  await input.press('Enter');
  await page.waitForSelector('.search-page', { timeout: 45000 });
  await page.waitForTimeout(3500);

  const card = page
    .locator('.media-card')
    .filter({ has: page.locator('.card-kind[title="Podcast"]') })
    .filter({ hasText: 'Good Mythical Morning' })
    .first();
  console.log('podcast cards:', await card.count());
  await card.locator('.card-text').click();
  await page.waitForSelector('.detail-page-podcast', { timeout: 45000 });
  await page.waitForTimeout(3000);

  console.log('page title:', (await page.locator('.detail-page-podcast h1').first().innerText()).trim());
  console.log('chips:', await page.locator('.detail-chips .genre-chip').allInnerTexts());
  const baseline = await snapshot('baseline');

  // In progress
  await page.locator('.detail-chips .genre-chip', { hasText: 'In progress' }).click();
  await waitFilterDone(baseline.summary);
  const inProgress = await snapshot('in progress');
  await page.screenshot({ path: path.resolve('qa', 'podcast-filter-empty.png') });

  // Unplayed (switch status filter)
  await page.locator('.detail-chips .genre-chip', { hasText: 'Unplayed' }).click();
  await waitFilterDone(inProgress.summary);
  const unplayed = await snapshot('unplayed');
  await page.screenshot({ path: path.resolve('qa', 'podcast-filter-unplayed.png') });

  // Unplayed again -> clear back to the original list
  await page.locator('.detail-chips .genre-chip', { hasText: 'Unplayed' }).click();
  await page.waitForFunction(() => !document.querySelector('.detail-filter-status'), null, { timeout: 45000 });
  await page.waitForTimeout(600);
  const cleared = await snapshot('cleared');

  // Played
  await page.locator('.detail-chips .genre-chip').filter({ hasText: /^Played$/ }).click();
  await waitFilterDone(cleared.summary);
  const played = await snapshot('played');
  await clearWithProgress();
  const clearedPlayed = await snapshot('cleared played');

  // Latest sort popup -> Oldest
  await page.locator('.detail-chips .genre-chip', { hasText: 'Latest' }).click();
  await page.waitForSelector('.context-menu .menu-item', { timeout: 10000 });
  console.log('sort menu:', await page.locator('.context-menu .menu-item .menu-label').allInnerTexts());
  await page.screenshot({ path: path.resolve('qa', 'podcast-sort-menu.png') });
  await page.locator('.context-menu .menu-item', { hasText: 'Oldest' }).click();
  await waitFilterDone(clearedPlayed.summary);
  const oldest = await snapshot('oldest');

  // Combine Unplayed + Oldest
  await page.locator('.detail-chips .genre-chip', { hasText: 'Unplayed' }).click();
  await waitFilterDone(oldest.summary);
  const unplayedOldest = await snapshot('unplayed + oldest');

  // Clear Unplayed but keep Oldest
  await page.locator('.detail-chips .genre-chip', { hasText: 'Unplayed' }).click();
  await page.waitForFunction(
    () => {
      const node = document.querySelector('.detail-filter-status span');
      return !document.querySelector('.detail-filter-loading') && node?.textContent?.startsWith('Sorted by Oldest');
    },
    null,
    { timeout: 45000 },
  );
  await page.waitForTimeout(500);
  const oldestOnly = await snapshot('oldest only');

  // Clear everything
  await clearWithProgress();
  const reset = await snapshot('reset');

  console.log(
    'RESULT',
    JSON.stringify({
      baselineCount: baseline.count,
      inProgressCount: inProgress.count,
      unplayedCount: unplayed.count,
      playedCount: played.count,
      clearedMatchesBaseline: cleared.titles?.[0] === baseline.titles?.[0] && cleared.count === baseline.count,
      clearedPlayedMatchesBaseline:
        clearedPlayed.titles?.[0] === baseline.titles?.[0] && clearedPlayed.count === baseline.count,
      oldestFirstTitle: oldest.titles?.[0],
      baselineFirstTitle: baseline.titles?.[0],
      oldestDiffers: oldest.titles?.[0] !== baseline.titles?.[0],
      combinedSummary: unplayedOldest.summary,
      oldestOnlySummary: oldestOnly.summary,
      resetMatchesBaseline: reset.titles?.[0] === baseline.titles?.[0] && reset.count === baseline.count,
      inProgressMessage: inProgress.empty,
      playedMessage: played.empty,
    }),
  );
} catch (error) {
  console.error('TEST FAILED:', error?.message || error);
  console.error('main logs:', logs.slice(-20).join('\n'));
  await page.screenshot({ path: 'C:\\Users\\rv888\\AppData\\Local\\Temp\\opencode\\podcast-filter-failure.png' }).catch(() => {});
  console.error('screenshot: C:\\Users\\rv888\\AppData\\Local\\Temp\\opencode\\podcast-filter-failure.png');
  process.exitCode = 1;
} finally {
  await app.close().catch(() => {});
  setTimeout(() => fs.rmSync(userData, { recursive: true, force: true }), 1000);
}
