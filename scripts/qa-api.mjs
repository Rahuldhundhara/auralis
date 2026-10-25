import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

fs.mkdirSync('qa', { recursive: true });
const app = await electron.launch({
  args: ['.', `--user-data-dir=${path.join(process.env.TEMP || '.', 'auralis-qa-userdata')}`],
  cwd: process.cwd(),
  env: { ...process.env, AURALIS_FORCE_PROD: '1' },
  timeout: 60000,
});
const page = await app.firstWindow({ timeout: 60000 });
await page.waitForSelector('.app-shell', { timeout: 60000 });

const result = await page.evaluate(async () => {
  const api = window.auralis.yt;
  const timed = async (name, fn) => {
    const start = performance.now();
    try {
      const value = await fn();
      return { name, ms: Math.round(performance.now() - start), value };
    } catch (error) {
      return { name, ms: Math.round(performance.now() - start), error: String(error) };
    }
  };
  const calls = await Promise.all([
    timed('explore', () => api.explore()),
    timed('newReleases', () => api.newReleases()),
    timed('charts', () => api.charts()),
    timed('home', () => api.home()),
    timed('search', () => api.search('Arijit Singh')),
    timed('album', () => api.album('MPREb_qQGEE0NawlN')),
    timed('playlist', () => api.playlist('VLPLLlUPygAcL2VX4glMNhtJkLeFO7vAPwl-')),
    timed('artist', () => api.artist('UC9zY_E8mcAo_Oq772LEZq8Q')),
  ]);
  return calls;
});

for (const entry of result) {
  if (entry.error) {
    console.log(`[${entry.name}] ${entry.ms}ms ERROR ${entry.error}`);
    continue;
  }
  const value = entry.value;
  const shelves = value?.shelves || [];
  console.log(`[${entry.name}] ${entry.ms}ms header=${value?.header?.title || value?.title || ''} shelves=${shelves.length} songs=${value?.songs?.length || 0} albums=${value?.albums?.length || 0} artists=${value?.artists?.length || 0} playlists=${value?.playlists?.length || 0} videos=${value?.videos?.length || 0} episodes=${value?.episodes?.length || 0}`);
  for (const shelf of shelves.slice(0, 4)) {
    console.log(`  SHELF ${shelf.title} style=${shelf.style} items=${shelf.items?.length}`);
    for (const item of (shelf.items || []).slice(0, 4)) {
      console.log(`    ${item.type} ${JSON.stringify(item.title)?.slice(0, 60)} thumb=${item.thumbnail ? item.thumbnail.slice(0, 70) : 'NONE'}`);
    }
  }
  if (entry.name === 'search') {
    console.log('  TOP', value.top?.type, value.top?.title, value.top?.thumbnail?.slice(0, 70));
    for (const key of ['songs', 'videos', 'albums', 'artists', 'playlists', 'episodes']) {
      console.log(`  ${key}:`, (value[key] || []).slice(0, 6).map((item) => `${item.type}:${item.title}`.slice(0, 70)));
    }
  }
}

fs.writeFileSync('qa/api.json', JSON.stringify(result, null, 2));
await app.close();
