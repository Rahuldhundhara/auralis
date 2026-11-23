import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-identify-ui-'));
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

try {
  await page.waitForSelector('.app-shell', { timeout: 60000 });
  await page.waitForTimeout(4200);

  const input = page.locator('.top-search input').first();
  await input.fill('Never Gonna Give You Up Rick Astley');
  await input.press('Enter');
  await page.waitForSelector('.search-page .track-row', { timeout: 45000 });
  await page.waitForTimeout(2000);

  const row = page.locator('.search-page .track-row', { hasText: 'Never Gonna Give You Up' }).first();
  console.log('search rows:', await page.locator('.search-page .track-row', { hasText: 'Never Gonna Give You Up' }).count());
  await row.click();
  await page.waitForTimeout(2500);

  await page.locator('.recognize-pill').click();
  await page.waitForSelector('.recognition-modal', { timeout: 10000 });
  await page.locator('.recognition-tabs button', { hasText: 'Now playing' }).click();
  await page.waitForTimeout(400);

  const currentText = (await page.locator('.recognition-stage p').first().innerText()).trim();
  console.log('current text:', currentText);

  const started = Date.now();
  await page.getByRole('button', { name: 'Identify this song' }).click();

  await page.waitForFunction(
    () => {
      const result = document.querySelector('.recognize-result h3');
      const error = document.querySelector('.recognize-error');
      if (error) throw new Error(error.textContent || 'recognition error');
      return Boolean(result);
    },
    null,
    { timeout: 90000 },
  );

  const elapsed = Date.now() - started;
  const title = (await page.locator('.recognize-result h3').innerText()).trim();
  const artist = (await page.locator('.recognize-info p').first().innerText()).trim();
  const meta = await page.locator('.recognize-meta span').allInnerTexts();
  const artwork = await page
    .locator('.recognize-art img')
    .first()
    .evaluate((image) => ({ complete: image.complete, width: image.naturalWidth, src: image.src }))
    .catch(() => null);
  console.log('RESULT', JSON.stringify({ title, artist, meta, artwork, elapsedMs: elapsed }));
  if (!/never gonna give you up/i.test(title)) throw new Error(`Unexpected match: ${title}`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.resolve('qa', 'identify-result.png') });
} catch (error) {
  console.error('TEST FAILED:', error?.message || error);
  console.error('main logs:', logs.slice(-20).join('\n'));
  await page.screenshot({ path: path.resolve('qa', 'identify-failure.png') }).catch(() => {});
  console.error(`screenshot: ${path.resolve('qa', 'identify-failure.png')}`);
  process.exitCode = 1;
} finally {
  await app.close().catch(() => {});
  setTimeout(() => fs.rmSync(userData, { recursive: true, force: true }), 1000);
}
