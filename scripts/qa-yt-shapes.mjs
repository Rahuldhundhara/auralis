import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const executablePath = path.resolve(
  process.env.AURALIS_PACKAGED_EXE || `release/${packageJson.version}/win-unpacked/Auralis.exe`,
);
if (!fs.existsSync(executablePath)) throw new Error(`Packaged app not found: ${executablePath}`);

const app = await electron.launch({
  executablePath,
  env: { ...process.env, AURALIS_SKIP_LOGIN: '1' },
  timeout: 90000,
});
const page = await app.firstWindow({ timeout: 90000 });
await page.waitForTimeout(3000);

const shapes = await page.evaluate(async () => {
  const yt = window.auralis.yt;
  const session = await yt.session();
  const out = { session: { hasCookies: session.hasCookies, account: session.account, authUser: session.authUser } };
  try {
    const history = await yt.history();
    out.history = {
      shelfCount: history.shelves.length,
      shelves: history.shelves.map((shelf) => ({
        title: shelf.title,
        style: shelf.style,
        browseId: shelf.browseId,
        endpoint: shelf.endpoint,
        itemCount: shelf.items.length,
        itemTypes: [...new Set(shelf.items.map((item) => item.type))],
        sample: shelf.items.slice(0, 3).map((item) => ({
          type: item.type,
          id: item.id,
          title: item.title,
          subtitle: item.subtitle,
          hasTrack: Boolean(item.track),
          trackDuration: item.track?.duration,
          trackType: item.track?.type,
        })),
      })),
      continuation: history.continuation,
    };
  } catch (error) {
    out.historyError = String(error);
  }
  try {
    const library = await yt.library();
    out.library = {
      shelfCount: library.shelves.length,
      shelves: library.shelves.map((shelf) => ({
        title: shelf.title,
        style: shelf.style,
        browseId: shelf.browseId,
        endpoint: shelf.endpoint,
        itemCount: shelf.items.length,
        itemTypes: [...new Set(shelf.items.map((item) => item.type))],
        sample: shelf.items.slice(0, 4).map((item) => ({
          type: item.type,
          id: item.id,
          title: item.title,
          subtitle: item.subtitle,
          trackCount: item.trackCount,
          browseId: item.browseId,
          params: item.params,
        })),
      })),
      continuation: library.continuation,
    };
  } catch (error) {
    out.libraryError = String(error);
  }
  return out;
});

fs.mkdirSync('qa/shapes', { recursive: true });
fs.writeFileSync('qa/shapes/yt-shapes.json', JSON.stringify(shapes, null, 2));
console.log(JSON.stringify(shapes, null, 2));
await app.close();
