import type { RecognizeResult } from '../../shared/types';
import { nativeJson, readLocalFile } from './http';
import { sha1Hex } from './innertube';
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

function pushU32(buffer: number[], value: number) {
  const v = value >>> 0;
  buffer.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
}

function pushI32(buffer: number[], value: number) {
  pushU32(buffer, value | 0);
}

function pushI16(buffer: number[], value: number) {
  const v = value & 0xffff;
  buffer.push(v & 0xff, (v >>> 8) & 0xff);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: number[]): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toBase64(bytes: number[]): string {
  const uint8 = Uint8Array.from(bytes);
  let binary = '';
  const block = 0x8000;
  for (let index = 0; index < uint8.length; index += block) {
    binary += String.fromCharCode(...uint8.subarray(index, index + block));
  }
  return btoa(binary);
}

/**
 * Pure TypeScript port of the Shazam audio fingerprint used by the desktop
 * recognizer. Input must be mono 16-bit PCM at 16 kHz.
 */
export function generateSignature(pcm: Int16Array): { uri: string; sampleMs: number } {
  if (!pcm.length) {
    throw new Error('Recognition audio must be non-empty 16-bit PCM.');
  }
  const input = pcm;
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

  const contents: number[] = [];
  for (let band = 0; band < 4; band++) {
    const peaks = bandPeaks[band];
    if (!peaks.length) continue;
    const peakBytes: number[] = [];
    let previous = 0;
    for (const peak of peaks) {
      const diff = peak.fftPassNumber - previous;
      if (diff >= 255) {
        peakBytes.push(0xff);
        pushI32(peakBytes, peak.fftPassNumber);
        previous = peak.fftPassNumber;
      }
      peakBytes.push(peak.fftPassNumber - previous);
      pushI16(peakBytes, peak.peakMagnitude);
      pushI16(peakBytes, peak.correctedPeakFrequencyBin);
      previous = peak.fftPassNumber;
    }
    pushU32(contents, 0x60030040 + band);
    pushU32(contents, peakBytes.length);
    for (const byte of peakBytes) contents.push(byte);
    const pad = (4 - (peakBytes.length % 4)) % 4;
    for (let index = 0; index < pad; index += 1) contents.push(0);
  }

  const sizeMinusHeader = contents.length + 8;
  const samplesAndOffset = Math.trunc(numSamples + SAMPLE_RATE * 0.24);

  const header: number[] = new Array(48).fill(0);
  const writeHeader = (offset: number, value: number) => {
    header[offset] = value & 0xff;
    header[offset + 1] = (value >>> 8) & 0xff;
    header[offset + 2] = (value >>> 16) & 0xff;
    header[offset + 3] = (value >>> 24) & 0xff;
  };
  writeHeader(0, 0xcafe2580);
  writeHeader(8, sizeMinusHeader);
  writeHeader(12, 0x94119c00);
  writeHeader(28, 3 << 27);
  writeHeader(40, samplesAndOffset);
  writeHeader(44, (15 << 19) + 0x40000);

  const full: number[] = [...header];
  pushU32(full, 0x40000000);
  pushU32(full, contents.length + 8);
  for (const byte of contents) full.push(byte);
  const checksum = crc32(full.slice(8));
  full[4] = checksum & 0xff;
  full[5] = (checksum >>> 8) & 0xff;
  full[6] = (checksum >>> 16) & 0xff;
  full[7] = (checksum >>> 24) & 0xff;

  return {
    uri: `data:audio/vnd.shazam.sig;base64,${toBase64(full)}`,
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

function randomUuid(): string {
  try {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  }
}

function timeoutSignal(ms: number): AbortSignal {
  try {
    return AbortSignal.timeout(ms);
  } catch {
    const controller = new AbortController();
    window.setTimeout(() => controller.abort(), ms);
    return controller.signal;
  }
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  if (channels === 1) return buffer.getChannelData(0);
  const mixed = new Float32Array(buffer.length);
  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) mixed[index] += data[index] / channels;
  }
  return mixed;
}

async function decodeToPcm(arrayBuffer: ArrayBuffer): Promise<Int16Array> {
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) throw new Error('This device cannot decode the recognition sample.');
  const context: AudioContext = new Ctor();
  try {
    const audio = await context.decodeAudioData(arrayBuffer.slice(0));
    const mono = mixToMono(audio);
    const startSeconds = audio.duration > 10 ? 8 : 0;
    const start = Math.min(mono.length, Math.floor(startSeconds * audio.sampleRate));
    const available = Math.min(mono.length - start, Math.floor(12 * audio.sampleRate));
    if (available < 256) throw new Error('That clip is too short to identify. Try a longer sample.');
    const targetLength = Math.max(1, Math.floor((available / audio.sampleRate) * SAMPLE_RATE));
    const output = new Int16Array(targetLength);
    const ratio = audio.sampleRate / SAMPLE_RATE;
    for (let index = 0; index < targetLength; index += 1) {
      const position = start + index * ratio;
      const left = Math.floor(position);
      const fraction = position - left;
      const a = mono[left] || 0;
      const b = mono[Math.min(mono.length - 1, left + 1)] || 0;
      const sample = Math.max(-1, Math.min(1, a + (b - a) * fraction));
      output[index] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
    }
    return output;
  } finally {
    void context.close().catch(() => {});
  }
}

export class RecognitionService {
  private async request(uri: string, sampleMs: number): Promise<RecognizeResult> {
    const cacheKey = sha1Hex(uri);
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
      `https://amp.shazam.com/discovery/v5/en/US/android/-/tag/${randomUuid().toUpperCase()}/${randomUuid()}` +
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
        signal: timeoutSignal(30_000),
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

  async fromPcm(input: ArrayBuffer | Uint8Array | Int16Array): Promise<RecognizeResult> {
    let pcm: Int16Array;
    if (input instanceof Int16Array) {
      pcm = input;
    } else if (input instanceof ArrayBuffer) {
      pcm = new Int16Array(input);
    } else {
      if (input.byteOffset % 2 !== 0) throw new Error('Recognition audio is not aligned PCM.');
      pcm = new Int16Array(input.buffer, input.byteOffset, Math.floor(input.byteLength / 2));
    }
    const { uri, sampleMs } = generateSignature(pcm);
    return this.request(uri, sampleMs || 12000);
  }

  async fromFile(file: string): Promise<RecognizeResult> {
    if (!file) throw new Error('That audio file could not be found.');
    const data = await readLocalFile(file);
    const pcm = await decodeToPcm(data);
    return this.fromPcm(pcm);
  }

  async fromVideoId(videoId: string): Promise<RecognizeResult> {
    const result = await nativeJson<{ path: string }>('/__ytdlp/sample', {
      videoId,
      cookie: sessionStore.cookie || '',
    });
    if (!result.path) throw new Error('Could not download a clip for recognition.');
    try {
      const data = await readLocalFile(result.path);
      const pcm = await decodeToPcm(data);
      return await this.fromPcm(pcm);
    } finally {
      void nativeJson('/__native/delete', { path: result.path }).catch(() => {});
    }
  }
}

export const recognition = new RecognitionService();
