import { execFile, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crc32 } from 'node:zlib';
import type { RecognizeResult } from '../../shared/types';
import { streams, ffmpegPath, ytdlpPath } from './streams';
import { sessionStore } from './store';

const SAMPLE_RATE = 16_000;
const FFT_SIZE = 2048;
const FFT_OUTPUT_SIZE = FFT_SIZE / 2 + 1;
const MAX_PEAKS = 255;
const MAX_TIME_SECONDS = 12;
const RING_BUF_SIZE = 256;
const HANNING = new Float64Array(FFT_SIZE);
for (let i = 0; i < FFT_SIZE; i++) {
  HANNING[i] = 0.5 * (1 - Math.cos((2 * Math.PI * (i + 1)) / 2049));
}

interface FrequencyPeak {
  fftPassNumber: number;
  peakMagnitude: number;
  correctedPeakFrequencyBin: number;
}

function fft(windowed: Float64Array): Float64Array {
  const n = windowed.length;
  const re = Float64Array.from(windowed);
  const im = new Float64Array(n);
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >>> 1;
    while (j & bit) {
      j ^= bit;
      bit >>>= 1;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >>> 1;
    const angle = -Math.PI / half;
    const baseRe = Math.cos(angle);
    const baseIm = Math.sin(angle);
    for (let start = 0; start < n; start += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < half; k++) {
        const u = start + k;
        const v = u + half;
        const evenRe = re[u];
        const evenIm = im[u];
        const oddRe = re[v] * wRe - im[v] * wIm;
        const oddIm = re[v] * wIm + im[v] * wRe;
        re[u] = evenRe + oddRe;
        im[u] = evenIm + oddIm;
        re[v] = evenRe - oddRe;
        im[v] = evenIm - oddIm;
        const nextRe = wRe * baseRe - wIm * baseIm;
        wIm = wRe * baseIm + wIm * baseRe;
        wRe = nextRe;
      }
    }
  }
  const scale = 1 / (1 << 17);
  const out = new Float64Array(FFT_OUTPUT_SIZE);
  for (let i = 0; i < FFT_OUTPUT_SIZE; i++) {
    const magnitude = (re[i] * re[i] + im[i] * im[i]) * scale;
    out[i] = magnitude < 1e-10 ? 1e-10 : magnitude;
  }
  return out;
}

function writeUInt32LE(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

function writeInt32LE(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32LE(value | 0, 0);
  return buffer;
}

/**
 * Pure TypeScript port of the Shazam audio fingerprint used by the desktop
 * recognizer. Input must be mono 16-bit little-endian PCM at 16 kHz.
 */
export function generateSignature(pcm: Buffer): { uri: string; sampleMs: number } {
  if (!pcm.length || pcm.length % 2 !== 0) {
    throw new Error('Recognition audio must be non-empty 16-bit PCM.');
  }
  const input = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
  const samplesRing = new Int32Array(FFT_SIZE);
  let samplesPos = 0;
  const fftOutputs = Array.from({ length: RING_BUF_SIZE }, () => new Float64Array(FFT_OUTPUT_SIZE));
  let fftPos = 0;
  const spreadFfts = Array.from({ length: RING_BUF_SIZE }, () => new Float64Array(FFT_OUTPUT_SIZE));
  let spreadPos = 0;
  let spreadNumWritten = 0;
  let numSamples = 0;
  let totalPeaks = 0;
  const bandPeaks: FrequencyPeak[][] = [[], [], [], []];

  const doPeakSpreading = () => {
    const last = (fftPos - 1 + RING_BUF_SIZE) % RING_BUF_SIZE;
    const spread = Float64Array.from(fftOutputs[last]);
    for (let pos = 0; pos < FFT_OUTPUT_SIZE - 2; pos++) {
      spread[pos] = Math.max(spread[pos], spread[pos + 1], spread[pos + 2]);
    }
    for (let pos = 0; pos < FFT_OUTPUT_SIZE; pos++) {
      let maxValue = spread[pos];
      for (const offset of [-1, -3, -6]) {
        const idx = ((spreadPos + offset) % RING_BUF_SIZE + RING_BUF_SIZE) % RING_BUF_SIZE;
        const old = spreadFfts[idx][pos];
        if (old > maxValue) maxValue = old;
        spreadFfts[idx][pos] = maxValue;
      }
    }
    spreadFfts[spreadPos].set(spread);
    spreadPos = (spreadPos + 1) % RING_BUF_SIZE;
    spreadNumWritten++;
  };

  const doPeakRecognition = () => {
    const fftMinus46 = fftOutputs[(fftPos - 46 + RING_BUF_SIZE * 2) % RING_BUF_SIZE];
    const spreadMinus49 = spreadFfts[(spreadPos - 49 + RING_BUF_SIZE * 2) % RING_BUF_SIZE];
    const otherOffsets = [-53, -45, 165, 172, 179, 186, 193, 200, 214, 221, 228, 235, 242, 249];
    for (let binPos = 10; binPos < FFT_OUTPUT_SIZE - 8; binPos++) {
      const fftValue = fftMinus46[binPos];
      if (fftValue < 1 / 64 || fftValue < spreadMinus49[binPos]) continue;
      let maxNeighbor = 0;
      for (const offset of [-10, -7, -4, -3, 1, 2, 5, 8]) {
        const value = spreadMinus49[binPos + offset];
        if (value > maxNeighbor) maxNeighbor = value;
      }
      if (fftValue <= maxNeighbor) continue;
      for (const offset of otherOffsets) {
        const idx = ((spreadPos + offset) % RING_BUF_SIZE + RING_BUF_SIZE) % RING_BUF_SIZE;
        const value = spreadFfts[idx][binPos - 1];
        if (value > maxNeighbor) maxNeighbor = value;
      }
      if (fftValue <= maxNeighbor) continue;

      const fftNumber = spreadNumWritten - 46;
      const magnitude = Math.log(Math.max(1 / 64, fftValue)) * 1477.3 + 6144;
      const before = Math.log(Math.max(1 / 64, fftMinus46[binPos - 1])) * 1477.3 + 6144;
      const after = Math.log(Math.max(1 / 64, fftMinus46[binPos + 1])) * 1477.3 + 6144;
      const variation1 = magnitude * 2 - before - after;
      if (!variation1) continue;
      const variation2 = ((after - before) * 32) / variation1;
      const correctedBin = binPos * 64 + variation2;
      const frequency = correctedBin * ((SAMPLE_RATE / 2 / 1024) / 64);
      let band: number;
      if (frequency < 250) continue;
      else if (frequency < 520) band = 0;
      else if (frequency < 1450) band = 1;
      else if (frequency < 3500) band = 2;
      else if (frequency <= 5500) band = 3;
      else continue;
      bandPeaks[band].push({
        fftPassNumber: fftNumber,
        peakMagnitude: Math.trunc(magnitude),
        correctedPeakFrequencyBin: Math.trunc(correctedBin),
      });
      totalPeaks++;
    }
  };

  let offset = 0;
  while (offset + 128 <= input.length) {
    if (numSamples / SAMPLE_RATE >= MAX_TIME_SECONDS && totalPeaks >= MAX_PEAKS) break;
    numSamples += 128;
    for (let k = 0; k < 128; k++) {
      samplesRing[samplesPos] = input[offset + k];
      samplesPos = (samplesPos + 1) % FFT_SIZE;
    }
    const windowed = new Float64Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) {
      windowed[i] = samplesRing[(samplesPos + i) % FFT_SIZE] * HANNING[i];
    }
    fftOutputs[fftPos].set(fft(windowed));
    fftPos = (fftPos + 1) % RING_BUF_SIZE;
    doPeakSpreading();
    if (spreadNumWritten >= 47) doPeakRecognition();
    offset += 128;
  }

  const chunks: Buffer[] = [];
  for (let band = 0; band < 4; band++) {
    const peaks = bandPeaks[band];
    if (!peaks.length) continue;
    const peakChunks: Buffer[] = [];
    let previous = 0;
    for (const peak of peaks) {
      const diff = peak.fftPassNumber - previous;
      if (diff >= 255) {
        peakChunks.push(Buffer.from([0xff]), writeInt32LE(peak.fftPassNumber));
        previous = peak.fftPassNumber;
      }
      const step = Buffer.alloc(5);
      step.writeUInt8(peak.fftPassNumber - previous, 0);
      step.writeInt16LE(peak.peakMagnitude, 1);
      step.writeInt16LE(peak.correctedPeakFrequencyBin, 3);
      peakChunks.push(step);
      previous = peak.fftPassNumber;
    }
    const peakBytes = Buffer.concat(peakChunks);
    chunks.push(writeUInt32LE(0x60030040 + band), writeUInt32LE(peakBytes.length), peakBytes);
    const pad = (4 - (peakBytes.length % 4)) % 4;
    if (pad) chunks.push(Buffer.alloc(pad));
  }
  const contents = Buffer.concat(chunks);
  const sizeMinusHeader = contents.length + 8;
  const samplesAndOffset = Math.trunc(numSamples + SAMPLE_RATE * 0.24);

  const header = Buffer.alloc(48);
  header.writeUInt32LE(0xcafe2580, 0);
  header.writeUInt32LE(0, 4);
  header.writeUInt32LE(sizeMinusHeader, 8);
  header.writeUInt32LE(0x94119c00, 12);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(0, 20);
  header.writeUInt32LE(0, 24);
  header.writeUInt32LE(3 << 27, 28);
  header.writeUInt32LE(0, 32);
  header.writeUInt32LE(0, 36);
  header.writeUInt32LE(samplesAndOffset, 40);
  header.writeUInt32LE((15 << 19) + 0x40000, 44);

  const full = Buffer.concat([
    header,
    writeUInt32LE(0x40000000),
    writeUInt32LE(contents.length + 8),
    contents,
  ]);
  const checksum = crc32(full.subarray(8)) >>> 0;
  full.writeUInt32LE(checksum, 4);
  return {
    uri: `data:audio/vnd.shazam.sig;base64,${full.toString('base64')}`,
    sampleMs: Math.round((numSamples / SAMPLE_RATE) * 1000),
  };
}

interface ShazamTrack {
  key?: string;
  title?: string;
  subtitle?: string;
  url?: string;
  isrc?: string;
  images?: { coverart?: string; coverarthq?: string };
  genres?: { primary?: string };
  sections?: Array<{ type?: string; text?: string; metadata?: Array<{ title?: string; text?: string }> }>;
  hub?: {
    providers?: Array<{ caption?: string; actions?: Array<{ uri?: string }> }>;
    options?: Array<{ type?: string; providername?: string; actions?: Array<{ uri?: string }> }>;
  };
}

function youtubeIdFromUri(uri?: string): string | undefined {
  if (!uri) return undefined;
  const byQuery = uri.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (byQuery) return byQuery[1];
  const byPath = uri.match(/\/watch\/([A-Za-z0-9_-]{11})/);
  if (byPath) return byPath[1];
  return /^[A-Za-z0-9_-]{11}$/.test(uri) ? uri : undefined;
}

function toResult(track: ShazamTrack, fallbackVideoId?: string): RecognizeResult {
  const song = track.sections?.find((section) => section.type === 'SONG');
  const metadata = song?.metadata || [];
  const value = (name: string) => metadata.find((entry) => entry.title === name)?.text;
  const youtubeOption = track.hub?.options?.find((option) => /video/i.test(option.type || ''));
  const youtube = youtubeIdFromUri(youtubeOption?.actions?.[0]?.uri) || fallbackVideoId;
  const lyrics = track.sections?.find((section) => section.type === 'LYRICS')?.text;
  return {
    title: track.title || 'Unknown track',
    artist: track.subtitle || 'Unknown artist',
    album: value('Album'),
    coverArt: track.images?.coverarthq || track.images?.coverart,
    genre: track.genres?.primary,
    releaseDate: value('Released'),
    shazamUrl: track.url,
    youtubeVideoId: youtube,
    lyrics,
  };
}

const USER_AGENTS = [
  'Dalvik/2.1.0 (Linux; U; Android 5.0.2; VS980 4G Build/LRX22G)',
  'Dalvik/1.6.0 (Linux; U; Android 4.4.2; SM-T210 Build/KOT49H)',
  'Dalvik/2.1.0 (Linux; U; Android 6.0.1; SM-G920F Build/MMB29K)',
  'Dalvik/2.1.0 (Linux; U; Android 5.1.1; SM-P905V Build/LMY47X)',
  'Dalvik/2.1.0 (Linux; U; Android 5.0; SM-G900F Build/LRX21T)',
];
const TIMEZONES = ['Europe/Paris', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Dubai'];

let lastRequest = 0;
const cache = new Map<string, { at: number; result: RecognizeResult }>();

export class RecognitionService {
  private async request(uri: string, sampleMs: number): Promise<RecognizeResult> {
    const cacheKey = crypto.createHash('sha1').update(uri).digest('hex');
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < 5 * 60_000) return cached.result;
    const wait = Math.max(0, 1000 - (Date.now() - lastRequest));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequest = Date.now();

    const timestamp = Math.floor(Date.now() / 1000);
    const body = {
      geolocation: {
        altitude: 100 + Math.random() * 400,
        latitude: Math.random() * 180 - 90,
        longitude: Math.random() * 360 - 180,
      },
      signature: { samplems: sampleMs, timestamp, uri },
      timestamp,
      timezone: TIMEZONES[Math.floor(Math.random() * TIMEZONES.length)],
    };
    const url =
      `https://amp.shazam.com/discovery/v5/en/US/android/-/tag/${crypto.randomUUID().toUpperCase()}/${crypto.randomUUID()}` +
      '?sync=true&webv3=true&sampling=true&connected=&shazamapiversion=v3&sharehub=true&video=v3';
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
          'Content-Language': 'en_US',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error: any) {
      throw new Error(`Could not reach Shazam: ${error?.message || error}`);
    }
    if (response.status === 429) throw new Error('Shazam rate limit reached. Try again in a moment.');
    if (response.status === 404) throw new Error('No match found. Try a longer or clearer clip.');
    if (!response.ok) throw new Error(`Shazam returned HTTP ${response.status}.`);
    const json: any = await response.json().catch(() => null);
    const track: ShazamTrack | undefined = json?.track;
    if (!track) throw new Error('No match found. Try a different part of the song.');
    const result = toResult(track);
    cache.set(cacheKey, { at: Date.now(), result });
    return result;
  }

  async fromPcm(pcm: Buffer): Promise<RecognizeResult> {
    const { uri, sampleMs } = generateSignature(pcm);
    return this.request(uri, sampleMs || 12000);
  }

  async fromFile(file: string): Promise<RecognizeResult> {
    if (!fs.existsSync(file)) throw new Error('That audio file could not be found.');
    const pcm = await this.decodeToPcm(file);
    return this.fromPcm(pcm);
  }

  async fromVideoId(videoId: string): Promise<RecognizeResult> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-recognize-'));
    const ffmpeg = ffmpegPath();
    const args = [
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificates',
      '-f',
      'bestaudio/best',
      '--download-sections',
      '*0:10-0:22',
      '--force-keyframes-at-cuts',
      '-o',
      path.join(dir, 'sample.%(ext)s'),
    ];
    if (ffmpeg) args.push('--ffmpeg-location', path.dirname(ffmpeg));
    const cookie = sessionStore.cookie;
    if (cookie) {
      const cookiePath = path.join(dir, 'cookies.txt');
      const lines = ['# Netscape HTTP Cookie File'];
      for (const part of cookie.split(';')) {
        const idx = part.indexOf('=');
        if (idx <= 0) continue;
        lines.push(`.youtube.com\tTRUE\t/\tTRUE\t${Math.floor(Date.now() / 1000) + 86400}\t${part.slice(0, idx).trim()}\t${part.slice(idx + 1).trim()}`);
      }
      fs.writeFileSync(cookiePath, lines.join('\n'), 'utf8');
      args.push('--cookies', cookiePath);
    }
    args.push(`https://music.youtube.com/watch?v=${encodeURIComponent(videoId)}`);
    try {
      await run(ytdlpPath(), args, 120_000);
      const file = fs.readdirSync(dir).find((name) => name.startsWith('sample.'));
      if (!file) throw new Error('Could not download a clip for recognition.');
      const pcm = await this.decodeToPcm(path.join(dir, file));
      return this.fromPcm(pcm);
    } finally {
      fs.rm(dir, { recursive: true, force: true }, () => {});
    }
  }

  private decodeToPcm(file: string): Promise<Buffer> {
    const ffmpeg = ffmpegPath();
    if (!ffmpeg) {
      throw new Error(
        process.platform === 'win32'
          ? 'ffmpeg is required for audio recognition. Place ffmpeg.exe next to yt-dlp.exe.'
          : 'FFmpeg is required for audio recognition. Install it on PATH or place the ffmpeg binary in the app\'s bin folder.',
      );
    }
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const child = spawn(ffmpeg, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-ss',
        '8',
        '-t',
        '12',
        '-i',
        file,
        '-ac',
        '1',
        '-ar',
        String(SAMPLE_RATE),
        '-f',
        's16le',
        'pipe:1',
      ], { windowsHide: true });
      child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0 || !chunks.length) {
          reject(new Error(stderr.trim() || 'ffmpeg could not decode that audio.'));
          return;
        }
        resolve(Buffer.concat(chunks));
      });
    });
  }
}

function run(binary: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (error, _stdout, stderr) => {
      if (error) reject(new Error((stderr || error.message || '').trim().split(/\r?\n/).slice(-3).join(' ')));
      else resolve();
    });
  });
}

export const recognition = new RecognitionService();

// Keep TypeScript from flagging the import as unused while retaining the helper
// for future audio decoding paths.
void streams;
