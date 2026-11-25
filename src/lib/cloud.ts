import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { LibraryData, Settings } from '@shared/types';

/** Public/publishable values. Users can override them from Settings → Cloud sync. */
export interface CloudConfig {
  url: string;
  anonKey: string;
  apiUrl: string;
}

const CONFIG_KEY = 'auralis.cloud.config.v1';
const DEVICE_KEY = 'auralis.cloud.device.v1';

export function cloudConfig(): CloudConfig {
  let saved: Partial<CloudConfig> = {};
  try {
    saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') as Partial<CloudConfig>;
  } catch {
    saved = {};
  }
  return {
    url: saved.url || import.meta.env.VITE_SUPABASE_URL || '',
    anonKey: saved.anonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    apiUrl: saved.apiUrl || import.meta.env.VITE_AURALIS_API_URL || '',
  };
}

export function saveCloudConfig(patch: Partial<CloudConfig>): CloudConfig {
  const next = { ...cloudConfig(), ...patch };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  client = null;
  return next;
}

export function isCloudConfigured(): boolean {
  const config = cloudConfig();
  return Boolean(config.url && config.anonKey);
}

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!isCloudConfigured()) throw new Error('Cloud sync is not configured. Add the Supabase URL and publishable key.');
  if (!client) {
    const config = cloudConfig();
    client = createClient(config.url, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return client;
}

export async function cloudUser(): Promise<User | null> {
  const { data, error } = await supabase().auth.getUser();
  if (error) throw error;
  return data.user ?? null;
}

export async function cloudSignIn(email: string, password: string): Promise<User> {
  const { data, error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.user) throw new Error('Supabase did not return a user.');
  return data.user;
}

export async function cloudSignUp(email: string, password: string): Promise<User> {
  const { data, error } = await supabase().auth.signUp({ email, password });
  if (error) throw error;
  if (!data.user) throw new Error('Supabase did not create a user.');
  return data.user;
}

export async function cloudSignOut(): Promise<void> {
  const { error } = await supabase().auth.signOut();
  if (error) throw error;
}

function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

/** One JSON document per user. RLS keeps it private; normalized tables remain available for queries. */
export interface CloudSnapshot {
  version: 1;
  updatedAt: string;
  settings: Settings;
  library: Omit<LibraryData, 'downloads'>;
}

export async function buildSnapshot(): Promise<CloudSnapshot> {
  const [settings, library] = await Promise.all([
    window.auralis.settings.get(),
    window.auralis.library.get(),
  ]);
  const { downloads: _downloads, ...libraryWithoutDownloads } = library;
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    settings,
    library: libraryWithoutDownloads,
  };
}

export async function pushSnapshot(): Promise<string> {
  const db = supabase();
  const user = await cloudUser();
  if (!user) throw new Error('Sign in to cloud sync first.');
  const snapshot = await buildSnapshot();
  const { error } = await db.from('user_settings').upsert({
    user_id: user.id,
    settings: snapshot as unknown as Record<string, unknown>,
    updated_at: snapshot.updatedAt,
  });
  if (error) throw error;
  await db.from('sync_state').upsert({
    user_id: user.id,
    device_id: deviceId(),
    collections: { settings: true, library: true },
    last_synced_at: snapshot.updatedAt,
  });
  localStorage.setItem('auralis.cloud.lastSync.v1', snapshot.updatedAt);
  return snapshot.updatedAt;
}

export async function fetchSnapshot(): Promise<{ snapshot: CloudSnapshot; updatedAt: string } | null> {
  const db = supabase();
  const user = await cloudUser();
  if (!user) throw new Error('Sign in to cloud sync first.');
  const { data, error } = await db
    .from('user_settings')
    .select('settings, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const snapshot = data.settings as unknown as CloudSnapshot;
  if (!snapshot || snapshot.version !== 1 || !snapshot.settings || !snapshot.library) return null;
  return { snapshot, updatedAt: data.updated_at ?? snapshot.updatedAt };
}

export async function applySnapshot(snapshot: CloudSnapshot): Promise<void> {
  const current = await window.auralis.library.get();
  await window.auralis.settings.set(snapshot.settings as Partial<Settings>);
  await window.auralis.library.replace({
    ...snapshot.library,
    // Offline audio stays on this device: the files are not in the cloud.
    downloads: current.downloads,
  } as LibraryData);
  localStorage.setItem('auralis.cloud.lastSync.v1', snapshot.updatedAt);
}

/** Pull when the cloud copy is newer, otherwise push the local copy. */
export async function syncNow(): Promise<'pushed' | 'pulled' | 'up-to-date'> {
  const remote = await fetchSnapshot();
  const localStamp = localStorage.getItem('auralis.cloud.lastSync.v1') || '';
  if (!remote) {
    await pushSnapshot();
    return 'pushed';
  }
  if (remote.updatedAt > localStamp) {
    await applySnapshot(remote.snapshot);
    return 'pulled';
  }
  await pushSnapshot();
  return 'pushed';
}

export function lastSyncedAt(): string | null {
  return localStorage.getItem('auralis.cloud.lastSync.v1');
}

export function formatSyncTime(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString();
}

export function backendUrl(): string {
  return cloudConfig().apiUrl.replace(/\/$/, '');
}

export async function backendHealth(): Promise<boolean> {
  const base = backendUrl();
  if (!base) return false;
  try {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}
