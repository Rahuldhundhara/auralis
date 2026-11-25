import { _electron as electron } from 'playwright-core';
import os from 'node:os';
import path from 'node:path';
const app = await electron.launch({
  args: ['.', `--user-data-dir=${path.join(os.tmpdir(), `auralis-qa-r3-${Date.now()}`)}`, '--no-sandbox', '--ozone-platform=x11', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  cwd: process.cwd(), env: { ...process.env, AURALIS_FORCE_PROD: '1' }, timeout: 60000,
});
const page = await app.firstWindow({ timeout: 60000 });
await page.waitForSelector('.onboarding-layer, .sidebar', { timeout: 60000 });
if (await page.locator('.onboarding-layer').count()) {
  await page.locator('.onboarding-nav-primary').click();
  await page.waitForSelector('.genre-card', { timeout: 15000 });
  await page.locator('.genre-card').nth(0).click();
  await page.locator('.genre-card').nth(1).click();
  await page.locator('.onboarding-nav-primary').click();
  await page.waitForTimeout(600);
  await page.locator('.onboarding-nav-skip').click();
  await page.waitForSelector('.sidebar-item', { timeout: 30000 });
  await page.waitForTimeout(800);
}
for (const width of [1024, 1050, 1080, 1081]) {
  await app.evaluate(({ BrowserWindow }, w) => { const win = BrowserWindow.getAllWindows()[0]; if (win) win.setSize(w, 720); }, width);
  await page.waitForTimeout(350);
  const r = await page.evaluate(() => {
    const b = (s) => { const el = document.querySelector(s); if (!el) return null; const x = el.getBoundingClientRect(); return { x: Math.round(x.x), w: Math.round(x.width), right: Math.round(x.right), h: Math.round(x.height), display: getComputedStyle(el).display }; };
    const a = b('.account-chip');
    const t = b('.titlebar');
    let hit = null;
    const el = document.querySelector('.account-chip');
    if (el) { const x = el.getBoundingClientRect(); const h = document.elementFromPoint(x.x + x.width / 2, x.y + x.height / 2); hit = h ? `${h.tagName}.${h.className}` : null; }
    return { vw: window.innerWidth, actions: b('.top-actions'), account: a, name: b('.account-name'), pro: b('.account-pro'), custom: b('.top-customize-taste'), bell: b('.top-bell'), search: b('.top-search'), titlebar: t, hit, overlap: a && t ? Math.max(0, a.right - t.x) : null };
  });
  console.log(`[${width}]`, JSON.stringify(r));
  if (r.overlap > 0) { console.log(`[FAIL ${width}] account overlaps titlebar by ${r.overlap}px`); }
  if (r.hit && !String(r.hit).includes('account-chip') && !String(r.hit).includes('svg') && !String(r.hit).includes('path')) { console.log(`[FAIL ${width}] center hit is ${r.hit}`); }
}
await app.close();
