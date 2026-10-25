import { execFileSync, spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const executablePath = path.resolve(process.argv[2] || 'release/Auralis-Portable-1.0.2.exe');
const label = process.argv[2] ? 'installed' : 'portable';
if (!fs.existsSync(executablePath)) throw new Error(`Packaged build not found: ${executablePath}`);
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-qa-portable-'));
const port = 9333;
const child = spawn(executablePath, [`--user-data-dir=${userData}`, `--remote-debugging-port=${port}`], {
  stdio: 'ignore',
  windowsHide: true,
});

let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // Portable stub is still unpacking.
    }
  }
  if (!ready) throw new Error('Portable app did not expose its debug port in 90 seconds.');

  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  let page;
  for (let attempt = 0; attempt < 120; attempt++) {
    page = browser.contexts().flatMap((context) => context.pages()).find((candidate) => !candidate.url().startsWith('devtools://'));
    if (page) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!page) throw new Error('Portable app did not open a renderer window.');
  await page.waitForSelector('.home-hero', { timeout: 120000 });
  const info = await page.evaluate(() => window.auralis.app.info());
  console.log(`[${label}]`, JSON.stringify({
    name: info?.name,
    version: info?.version,
    electron: info?.electron,
    ytDlpVersion: info?.ytDlpVersion,
    ffmpegAvailable: info?.ffmpegAvailable,
    shelves: await page.locator('.shelf').count(),
    cards: await page.locator('.media-card').count(),
  }));
  await page.evaluate(() => window.auralis.app.close());
  await new Promise((resolve) => setTimeout(resolve, 2500));
} finally {
  await browser?.close().catch(() => {});
  if (!child.killed) child.kill();
  await new Promise((resolve) => setTimeout(resolve, 2500));
  // The portable stub can exit while its extracted child keeps running. Only
  // terminate processes that belong to this QA profile.
  try {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "Auralis.exe" -and $_.CommandLine -like "*$env:AURALIS_QA_USER_DATA*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }',
      ],
      { windowsHide: true, env: { ...process.env, AURALIS_QA_USER_DATA: userData } },
    );
  } catch {
    // Nothing left to clean up.
  }
}
