import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

fs.mkdirSync('qa', { recursive: true });
const app = await electron.launch({
  args: ['.', `--user-data-dir=${path.join(process.env.TEMP || '.', 'auralis-qa-userdata')}`],
  cwd: process.cwd(),
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1', AURALIS_FORCE_PROD: '1' },
  timeout: 60000,
});
const proc = app.process();
const logs = [];
proc.stdout?.on('data', (chunk) => logs.push(`[stdout] ${chunk}`));
proc.stderr?.on('data', (chunk) => logs.push(`[stderr] ${chunk}`));

const page = await app.firstWindow({ timeout: 60000 });
const issues = [];
page.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') issues.push(`[console:${message.type()}] ${message.text()}`);
});
page.on('requestfailed', (request) => issues.push(`[requestfailed] ${request.url()} ${request.failure()?.errorText}`));

try {
  for (const wait of [2500, 8000, 20000]) {
    await page.waitForTimeout(wait);
    const state = await page.evaluate(() => ({
      shell: Boolean(document.querySelector('.app-shell')),
      skeleton: document.querySelectorAll('.skeleton').length,
      error: document.querySelector('.error-panel')?.textContent,
      hero: Boolean(document.querySelector('.home-hero')),
      quick: Boolean(document.querySelector('.quick-access')),
      body: document.body.innerText.slice(0, 300),
    }));
    console.log(`[state after ${wait}]`, state);
  }

  const ipc = await page.evaluate(async () => {
    const t = Date.now();
    try {
      const home = await window.auralis.yt.home();
      return { ms: Date.now() - t, shelves: home.shelves?.length, title: home.title, firstShelf: home.shelves?.[0]?.title };
    } catch (error) {
      return { ms: Date.now() - t, error: String(error) };
    }
  });
  console.log('[direct ipc home]', ipc);
  console.log('[issues]', issues.slice(0, 40));
  console.log('[startup logs]', logs.join('').split('\n').filter((line) => /error|fail|exception/i.test(line)).slice(0, 40));
  await page.screenshot({ path: 'qa/debug2.png' });
} finally {
  await app.close();
}
