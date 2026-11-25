import type { LastFmSettings, LastFmState, Track } from '../../shared/types';
import { settingsStore } from './store';

const BASE = 'https://ws.audioscrobbler.com/2.0/';

function rotl(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function md5(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const paddedLength = (((bytes.length + 8) >>> 6) + 1) * 64;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;
  const view = new DataView(buffer.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);

  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const constants = Array.from({ length: 64 }, (_, index) =>
    Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0
  );
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const words = new Uint32Array(16);

  for (let offset = 0; offset < buffer.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, true);
    }
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let index = 0; index < 64; index += 1) {
      let f: number;
      let g: number;
      if (index < 16) {
        f = (b & c) | (~b & d);
        g = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        g = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        g = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * index) % 16;
      }
      const sum = (a + f + constants[index] + words[g]) >>> 0;
      const rotated = rotl(sum, shifts[index]);
      a = d;
      d = c;
      c = b;
      b = (b + rotated) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const output = new Uint8Array(16);
  const outputView = new DataView(output.buffer);
  outputView.setUint32(0, a0, true);
  outputView.setUint32(4, b0, true);
  outputView.setUint32(8, c0, true);
  outputView.setUint32(12, d0, true);
  return Array.from(output, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sign(params: Record<string, string>, secret: string): string {
  const keys = Object.keys(params).sort();
  const signature = keys.map((key) => `${key}${params[key]}`).join('') + secret;
  return md5(signature);
}

function artistOf(track: Track): string {
  return (track.artists || []).map((a) => a.name).filter(Boolean).join(', ');
}

async function call(
  method: string,
  params: Record<string, string>,
  settings = settingsStore.get().lastfm,
  post = false,
): Promise<any> {
  if (!settings.apiKey || !settings.apiSecret) {
    throw new Error('Add your Last.fm API key and secret in Settings → Integrations.');
  }
  const body: Record<string, string> = {
    method,
    api_key: settings.apiKey,
    ...params,
  };
  if (settings.sessionKey) body.sk = settings.sessionKey;
  body.api_sig = sign(body, settings.apiSecret);
  body.format = 'json';
  const url = post ? BASE : `${BASE}?${new URLSearchParams(body).toString()}`;
  const response = await fetch(url, {
    method: post ? 'POST' : 'GET',
    headers: post ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
    body: post ? new URLSearchParams(body).toString() : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const json: any = await response.json().catch(() => ({}));
  if (!response.ok || json?.error) {
    throw new Error(json?.message || `Last.fm returned HTTP ${response.status}.`);
  }
  return json;
}

export class LastFmService {
  state(): LastFmState {
    const settings = settingsStore.get().lastfm;
    return {
      configured: Boolean(settings.apiKey && settings.apiSecret),
      authenticated: Boolean(settings.sessionKey),
      username: settings.username || undefined,
    };
  }

  async beginAuth(): Promise<{ token: string; url: string }> {
    const settings = settingsStore.get().lastfm;
    const json = await call('auth.getToken', {}, settings);
    const token = json?.token;
    if (!token) throw new Error('Last.fm did not return a token.');
    return {
      token,
      url: `https://www.last.fm/api/auth/?api_key=${encodeURIComponent(settings.apiKey)}&token=${encodeURIComponent(token)}`,
    };
  }

  async completeAuth(token: string): Promise<LastFmState> {
    const settings = settingsStore.get().lastfm;
    const json = await call('auth.getSession', { token }, settings);
    const session = json?.session;
    if (!session?.key) throw new Error('Last.fm did not return a session.');
    this.patch({
      sessionKey: session.key,
      username: session.name || '',
      enabled: true,
    });
    return this.state();
  }

  disconnect(): LastFmState {
    this.patch({ sessionKey: '', username: '', enabled: false });
    return this.state();
  }

  async nowPlaying(track: Track): Promise<void> {
    const settings = settingsStore.get().lastfm;
    if (!settings.enabled || !settings.nowPlaying || !settings.sessionKey) return;
    await call(
      'track.updateNowPlaying',
      {
        artist: artistOf(track),
        track: track.title,
        album: track.album?.name || '',
        duration: String(Math.round(track.duration || 0)),
        trackNumber: '',
        mbid: '',
      },
      settings,
      true,
    );
  }

  async scrobble(track: Track, startedAt: number): Promise<void> {
    const settings = settingsStore.get().lastfm;
    if (!settings.enabled || !settings.scrobble || !settings.sessionKey) return;
    await call(
      'track.scrobble',
      {
        artist: artistOf(track),
        track: track.title,
        album: track.album?.name || '',
        duration: String(Math.round(track.duration || 0)),
        timestamp: String(Math.floor(startedAt / 1000)),
        trackNumber: '',
        mbid: '',
      },
      settings,
      true,
    );
  }

  async love(track: Track, loved: boolean): Promise<void> {
    const settings = settingsStore.get().lastfm;
    if (!settings.sessionKey) throw new Error('Connect Last.fm first.');
    await call(
      loved ? 'track.love' : 'track.unlove',
      { artist: artistOf(track), track: track.title },
      settings,
      true,
    );
  }

  private patch(patch: Partial<LastFmSettings>) {
    settingsStore.update((settings) => ({
      ...settings,
      lastfm: { ...settings.lastfm, ...patch },
    }));
  }
}

export const lastfm = new LastFmService();
