import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-qa-lyrics-'));
const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  cwd: process.cwd(),
  env: { ...process.env, AURALIS_FORCE_PROD: '1' },
  timeout: 60000,
});
const page = await app.firstWindow({ timeout: 60000 });
await page.waitForSelector('.app-shell', { timeout: 60000 });

const track = {
  id: '8zkUFoXku0Y',
  title: 'Tainu Khabar Nahi (From "Munjya")',
  artists: [{ name: 'Sachin-Jigar' }, { name: 'Arijit Singh' }],
  album: { name: 'Munjya' },
  duration: 189,
  thumbnail: '',
};
const providers = ['BetterLyrics', 'Paxsenix', 'LyricsPlus', 'LrcLib', 'KuGou', 'YouTube', 'YouTubeSubtitle', 'Zemer'];
for (const provider of providers) {
  const started = Date.now();
  try {
    const result = await page.evaluate(
      async ({ track, provider }) => {
        try {
          const data = await window.auralis.lyrics.fetch(track, [provider]);
          return { ok: true, provider: data?.provider, synced: data?.synced, lines: data?.lines?.length, first: data?.lines?.[0]?.text };
        } catch (error) {
          return { ok: false, error: String(error) };
        }
      },
      { track, provider },
    );
    console.log(`[${provider}] ${Date.now() - started}ms`, JSON.stringify(result));
  } catch (error) {
    console.log(`[${provider}] ${Date.now() - started}ms EVAL ERROR`, error.message);
  }
}

const allStarted = Date.now();
const all = await page.evaluate(async (track) => {
  try {
    const data = await window.auralis.lyrics.fetch(track);
    return { ok: true, provider: data?.provider, synced: data?.synced, lines: data?.lines?.length, first: data?.lines?.[0]?.text };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}, track);
console.log(`[all] ${Date.now() - allStarted}ms`, JSON.stringify(all));

await app.close();
setTimeout(() => {
  try {
    fs.rmSync(userData, { recursive: true, force: true });
  } catch {}
}, 1000);
