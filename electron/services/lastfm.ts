import crypto from 'node:crypto';
import type { LastFmSettings, LastFmState, Track } from '../../shared/types';
import { settingsStore } from './store';

const BASE = 'https://ws.audioscrobbler.com/2.0/';

function sign(params: Record<string, string>, secret: string): string {
  const keys = Object.keys(params).sort();
  const signature = keys.map((key) => `${key}${params[key]}`).join('') + secret;
  return crypto.createHash('md5').update(signature, 'utf8').digest('hex');
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
