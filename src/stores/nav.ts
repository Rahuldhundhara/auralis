import { create } from 'zustand';
import type { NavEndpoint } from '@shared/types';

export type SettingsTab =
  | 'general'
  | 'appearance'
  | 'playback'
  | 'lyrics'
  | 'downloads'
  | 'integrations'
  | 'account'
  | 'about';

export type Route =
  | { page: 'home' }
  | { page: 'explore'; tab?: 'explore' | 'charts' | 'new' | 'moods' }
  | { page: 'search'; q?: string; filter?: string }
  | { page: 'album'; id: string }
  | { page: 'playlist'; id: string }
  | { page: 'artist'; id: string }
  | { page: 'podcast'; id: string }
  | { page: 'browse'; id?: string; params?: string; title?: string }
  | { page: 'library'; tab?: 'playlists' | 'songs' | 'albums' | 'artists' | 'downloads' | 'youtube' }
  | { page: 'liked' }
  | { page: 'recent' }
  | { page: 'history' }
  | { page: 'downloads' }
  | { page: 'local'; id: string }
  | { page: 'settings'; tab?: SettingsTab };

interface NavState {
  entries: Route[];
  index: number;
  navigate: (route: Route, replace?: boolean) => void;
  back: () => void;
  forward: () => void;
  reset: (route: Route) => void;
  route: () => Route;
  canBack: () => boolean;
  canForward: () => boolean;
  navigateEndpoint: (endpoint: NavEndpoint | undefined, title?: string) => void;
}

function sameRoute(a: Route | undefined, b: Route): boolean {
  if (!a || a.page !== b.page) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

const MAX_HISTORY = 60;

export const useNavStore = create<NavState>((set, get) => ({
  entries: [{ page: 'home' }],
  index: 0,
  navigate: (route, replace = false) => {
    const state = get();
    if (sameRoute(state.entries[state.index], route)) return;
    if (replace) {
      const entries = [...state.entries];
      entries[state.index] = route;
      set({ entries });
      return;
    }
    let entries = [...state.entries.slice(0, state.index + 1), route];
    // Long browsing sessions should not keep every page route in memory.
    if (entries.length > MAX_HISTORY) entries = entries.slice(entries.length - MAX_HISTORY);
    set({ entries, index: entries.length - 1 });
  },
  back: () => {
    const { index } = get();
    if (index > 0) set({ index: index - 1 });
  },
  forward: () => {
    const { index, entries } = get();
    if (index < entries.length - 1) set({ index: index + 1 });
  },
  reset: (route) => set({ entries: [route], index: 0 }),
  route: () => get().entries[get().index] || { page: 'home' },
  canBack: () => get().index > 0,
  canForward: () => get().index < get().entries.length - 1,
  navigateEndpoint: (endpoint, title) => {
    if (!endpoint) return;
    if (endpoint.browseId) {
      const id = endpoint.browseId;
      if (id.startsWith('UC') && id.length >= 20) {
        get().navigate({ page: 'artist', id });
        return;
      }
      get().navigate({ page: 'browse', id, params: endpoint.params, title });
      return;
    }
    if (endpoint.playlistId) {
      get().navigate({ page: 'playlist', id: endpoint.playlistId });
      return;
    }
    if (endpoint.videoId) {
      get().navigate({ page: 'search', q: title || '' });
    }
  },
}));

export function navigate(route: Route, replace = false) {
  useNavStore.getState().navigate(route, replace);
}
