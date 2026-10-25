#!/usr/bin/env node
/**
 * Verify that the Linux runtime tools are present and executable.
 * Windows builds use resources/bin/*.exe and do not run this script.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN_DIR = path.join(ROOT, 'resources', 'bin');

function fail(message) {
  console.error(`verify-tools: ${message}`);
  process.exit(1);
}

if (process.platform !== 'linux') {
  fail('Linux tools can only be verified on Linux');
}

for (const name of ['yt-dlp', 'ffmpeg']) {
  const binary = path.join(BIN_DIR, name);
  if (!fs.existsSync(binary)) {
    fail(`missing ${binary}. Run: npm run fetch:tools:linux`);
  }
  const mode = fs.statSync(binary).mode;
  if ((mode & 0o111) === 0) fail(`${binary} is not executable`);
}

try {
  const ytdlp = execFileSync(path.join(BIN_DIR, 'yt-dlp'), ['--version'], { encoding: 'utf8' }).trim();
  const ffmpegFirstLine = execFileSync(path.join(BIN_DIR, 'ffmpeg'), ['-version'], { encoding: 'utf8' })
    .split(/\r?\n/)[0]
    .trim();
  console.log(`yt-dlp: ${ytdlp}`);
  console.log(`ffmpeg: ${ffmpegFirstLine}`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
