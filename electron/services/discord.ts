import type { Track } from '../../shared/types';
import { settingsStore } from './store';

// discord-rpc is CommonJS-only; require lazily so the app still starts if the
// optional dependency is missing.
let RPC: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  RPC = require('discord-rpc');
} catch {
  RPC = null;
}

let client: any = null;
let connectedAppId = '';
let ready = false;

function artistOf(track: Track): string {
  return (track.artists || []).map((a) => a.name).filter(Boolean).join(', ');
}

async function connect(appId: string): Promise<boolean> {
  if (!RPC) return false;
  if (client && connectedAppId === appId) return ready;
  await disconnect();
  client = new RPC.Client({ transport: 'ipc' });
  connectedAppId = appId;
  ready = false;
  client.on('ready', () => {
    ready = true;
  });
  client.on('disconnected', () => {
    ready = false;
  });
  try {
    await client.login({ clientId: appId });
    ready = true;
    return true;
  } catch {
    client = null;
    connectedAppId = '';
    ready = false;
    return false;
  }
}

async function disconnect(): Promise<void> {
  if (client) {
    try {
      await client.clearActivity();
      await client.destroy();
    } catch {
      // ignore
    }
  }
  client = null;
  connectedAppId = '';
  ready = false;
}

export class DiscordService {
  async update(track: Track | null, playing: boolean): Promise<void> {
    const settings = settingsStore.get().discord;
    if (!settings.enabled || !settings.appId) {
      if (client) await disconnect();
      return;
    }
    const ok = await connect(settings.appId);
    if (!ok || !client) return;
    if (!track) {
      await client.clearActivity().catch(() => {});
      return;
    }
    const artist = artistOf(track) || 'Unknown artist';
    const activity: any = {
      details: track.title.slice(0, 128),
      state: `${playing ? 'Playing' : 'Paused'} • ${artist}`.slice(0, 128),
      instance: false,
    };
    if (settings.showButtons && track.id) {
      activity.buttons = [
        {
          label: 'Open in Auralis',
          url: `https://music.youtube.com/watch?v=${encodeURIComponent(track.id)}`,
        },
      ];
    }
    try {
      await client.setActivity(activity);
    } catch {
      // Discord may reject an activity if the app has no assets configured.
    }
  }

  clear(): Promise<void> {
    return disconnect();
  }
}

export const discord = new DiscordService();
