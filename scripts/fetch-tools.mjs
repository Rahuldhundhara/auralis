#!/usr/bin/env node
/**
 * Fetch the Linux runtime tools used by Auralis.
 *
 * The Windows build keeps using resources/bin/yt-dlp.exe and ffmpeg.exe.
 * This script is Linux-only and is never run automatically by npm install.
 *
 * Usage:
 *   npm run fetch:tools:linux
 *   npm run fetch:tools:linux -- --force
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN_DIR = path.join(ROOT, 'resources', 'bin');

const YTDLP_VERSION = '2026.10.21';
const YTDLP_URL = `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp`;
const YTDLP_SHA256 = 'b7af77f686e95f7845ce8d09d21957718febb8b48b30555adb9dd2292ad7bf14';

// John Van Sickle's static build; the archive is currently FFmpeg 7.0.2.
const FFMPEG_VERSION = '7.0.2';
const FFMPEG_URL = 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz';
const FFMPEG_SHA256 = 'abda8d77ce8309141f83ab8edf0596834087c52467f6badf376a6a2a4c87cf67';

function fail(message) {
  console.error(`fetch-tools: ${message}`);
  process.exit(1);
}

function sha256(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

async function download(url, destination) {
  console.log(`Downloading ${url}`);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) fail(`download failed (${response.status} ${response.statusText}): ${url}`);
  const body = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destination, body);
  console.log(`Saved ${destination} (${body.length} bytes)`);
}

async function main() {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    fail('this script stages Linux x64 binaries only; run it on Linux x64');
  }

  const force = process.argv.includes('--force');
  fs.mkdirSync(BIN_DIR, { recursive: true });

  const ytdlpDest = path.join(BIN_DIR, 'yt-dlp');
  const ffmpegDest = path.join(BIN_DIR, 'ffmpeg');

  if (!force && fs.existsSync(ytdlpDest) && fs.existsSync(ffmpegDest)) {
    console.log('Both Linux tools already exist. Use --force to replace them.');
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-tools-'));
  try {
    const ytdlpTmp = path.join(tempDir, 'yt-dlp');
    await download(YTDLP_URL, ytdlpTmp);
    if (sha256(ytdlpTmp) !== YTDLP_SHA256) fail('yt-dlp SHA-256 mismatch');
    fs.copyFileSync(ytdlpTmp, ytdlpDest);
    fs.chmodSync(ytdlpDest, 0o755);

    const ffmpegArchive = path.join(tempDir, 'ffmpeg.tar.xz');
    await download(FFMPEG_URL, ffmpegArchive);
    if (sha256(ffmpegArchive) !== FFMPEG_SHA256) fail('FFmpeg archive SHA-256 mismatch');

    const extracted = path.join(tempDir, 'ffmpeg-extracted');
    fs.mkdirSync(extracted);
    const tar = spawnSync('tar', ['-xJf', ffmpegArchive, '-C', extracted], { stdio: 'inherit' });
    if (tar.status !== 0) fail('could not extract the FFmpeg archive');

    const ffmpegDir = fs
      .readdirSync(extracted)
      .map((name) => path.join(extracted, name))
      .find((candidate) => fs.statSync(candidate).isDirectory() && /^ffmpeg-.*-amd64-static$/.test(path.basename(candidate)));
    if (!ffmpegDir) fail('FFmpeg archive did not contain the expected static build directory');

    const ffmpegBinary = path.join(ffmpegDir, 'ffmpeg');
    if (!fs.existsSync(ffmpegBinary)) fail('FFmpeg archive did not contain the ffmpeg binary');
    fs.copyFileSync(ffmpegBinary, ffmpegDest);
    fs.chmodSync(ffmpegDest, 0o755);

    console.log(`\nyt-dlp ${YTDLP_VERSION}: ${ytdlpDest}`);
    console.log(`FFmpeg ${FFMPEG_VERSION}: ${ffmpegDest}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => fail(error?.stack || String(error)));
