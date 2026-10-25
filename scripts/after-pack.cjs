const fs = require('node:fs');
const path = require('node:path');

/**
 * electron-builder afterPack hook.
 *
 * Linux packages must contain executable yt-dlp/ffmpeg binaries. We fail the
 * build instead of shipping an app that cannot resolve streams. Windows keeps
 * using the existing bundled .exe files and needs no adjustment here.
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return;

  const resourcesDir = path.join(context.appOutDir, 'resources');
  const binDir = path.join(resourcesDir, 'bin');
  const required = ['yt-dlp', 'ffmpeg'];

  for (const name of required) {
    const binary = path.join(binDir, name);
    if (!fs.existsSync(binary)) {
      throw new Error(
        `Linux package is missing resources/bin/${name}. Run "npm run fetch:tools:linux" before packaging.`,
      );
    }
    fs.chmodSync(binary, 0o755);
  }

  for (const name of ['yt-dlp.exe', 'ffmpeg.exe']) {
    const stale = path.join(binDir, name);
    if (fs.existsSync(stale)) fs.rmSync(stale, { force: true });
  }

  const licenses = path.join(resourcesDir, 'licenses');
  if (!fs.existsSync(licenses)) {
    throw new Error('Linux package is missing resources/licenses. Check the extraResources configuration.');
  }
};
