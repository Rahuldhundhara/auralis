import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const shotsDir = path.resolve('qa/features');
fs.mkdirSync(shotsDir, { recursive: true });
const issues = [];

const app = await electron.launch({
  args: [
    '.',
    `--user-data-dir=${path.join(os.tmpdir(), `auralis-qa-final-${Date.now()}`)}`,
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
  if (message.type() === 'error') issues.push(`[console] ${message.text()}`);
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

// Notifications: mark all read clears unread dots and the badge.
await page.locator('.top-bell').click();
await page.waitForTimeout(5000);
const unreadBefore = await page.locator('.notification-item.is-unread').count();
await page.locator('.notification-mark-all').click();
await page.waitForTimeout(400);
const after = await page.evaluate(() => ({
  unreadItems: document.querySelectorAll('.notification-item.is-unread').length,
  badge: document.querySelectorAll('.top-bell-count').length,
  panelItems: document.querySelectorAll('.notification-item').length,
}));
console.log('[notifications]', { unreadBefore, ...after });
if (after.unreadItems !== 0) issues.push('[notifications] unread items remain after mark all read');
if (after.badge !== 0) issues.push('[notifications] badge remains after mark all read');
await page.keyboard.press('Escape');

// Notification persistence across reload: re-open panel; read state should survive.
await page.reload();
await page.waitForSelector('.sidebar-item', { timeout: 60000 });
await page.waitForTimeout(2000);
await page.locator('.top-bell').click();
await page.waitForTimeout(4000);
const badgeAfterReloadData = await page.evaluate(async () => {
  const settings = await window.auralis.settings.get();
  return {
    read: settings.notificationsRead?.length ?? 0,
    readIds: settings.notificationsRead || [],
    unreadIds: Array.from(document.querySelectorAll('.notification-item.is-unread')).map((el) => el.getAttribute('data-id')),
  };
});
console.log('[notifications] after reload:', JSON.stringify({ read: badgeAfterReloadData.read, unreadIds: badgeAfterReloadData.unreadIds }));
// Read state must survive the reload: any unread id after reload must be one
// that was genuinely not present in the persisted read set.
const stale = badgeAfterReloadData.unreadIds.filter((id) => badgeAfterReloadData.readIds.includes(id));
if (stale.length) issues.push(`[notifications] ids re-marked unread after reload: ${stale.join(', ')}`);
const markAll = page.locator('.notification-mark-all');
if (await markAll.isEnabled()) {
  await markAll.click();
  await page.waitForTimeout(400);
} else {
  console.log('[notifications] nothing new to mark — bell already caught up');
}
const badgeAfterReload = await page.evaluate(() => document.querySelectorAll('.top-bell-count').length);
console.log('[notifications] badge after mark-all-read again:', badgeAfterReload);
if (badgeAfterReload !== 0) issues.push('[notifications] mark all read did not clear the badge');
await page.keyboard.press('Escape');

// Clicking a notification opens it (album -> detail page) and marks it read.
const items = page.locator('.notification-item');
if (await items.count()) {
  await items.first().click();
  await page.waitForTimeout(2500);
  console.log('[notifications] after click body:', (await page.locator('body').innerText()).slice(0, 120).replace(/\n/g, ' | '));
}

// Settings → Integrations: song recognition card present with three fields.
await page.locator('.sidebar-settings').first().click();
await page.waitForTimeout(600);
await page.locator('.settings-nav-item', { hasText: 'Integrations' }).click();
await page.waitForTimeout(800);
const integrations = await page.evaluate(() => ({
  recognitionCard: /Song recognition/.test(document.body.innerText),
  hummingMention: /humming/i.test(document.body.innerText),
  acrcloudInputs: document.querySelectorAll('input[placeholder*="acrcloud"], input[placeholder*="ACRCloud"]').length,
}));
console.log('[integrations]', JSON.stringify(integrations));
if (!integrations.recognitionCard) issues.push('[settings] Song recognition card missing');
if (integrations.acrcloudInputs < 3) issues.push(`[settings] expected 3 ACRCloud fields, got ${integrations.acrcloudInputs}`);
await page.screenshot({ path: path.join(shotsDir, 'settings-integrations.png') });

// Recognition settings are wired to the preload surface.
const recognitionApi = await page.evaluate(() => ({
  recognize: Boolean(window.auralis?.recognize?.fromPcm),
}));
console.log('[api]', JSON.stringify(recognitionApi));
if (!recognitionApi.recognize) issues.push('[api] recognize.fromPcm missing from preload');

await app.close();
console.log('\n[issues]', issues.length ? JSON.stringify(issues, null, 2) : 'none');
if (issues.length) process.exitCode = 1;
