import { create } from 'zustand';
import type { LucideIcon } from 'lucide-react';
import type { LocalPlaylist, Track } from '@shared/types';

export interface MenuItem {
  label?: string;
  icon?: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  separator?: boolean;
  submenu?: MenuItem[];
}

export type DialogState =
  | { type: 'create-playlist'; track?: Track }
  | { type: 'import-playlist' }
  | { type: 'rename-playlist'; playlist: LocalPlaylist }
  | { type: 'add-to-playlist'; track: Track }
  | {
      type: 'confirm';
      title: string;
      message: string;
      confirmLabel?: string;
      danger?: boolean;
      onConfirm: () => void | Promise<void>;
    }
  | { type: 'recognition' }
  | { type: 'cookie' }
  | { type: 'yt-playlist'; track: Track }
  | { type: 'eq' };

export interface Toast {
  id: string;
  message: string;
  kind: 'info' | 'success' | 'error';
  action?: { label: string; onClick: () => void };
}

interface UiState {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (value: boolean) => void;

  queueOpen: boolean;
  setQueueOpen: (value: boolean) => void;
  nowPlayingOpen: boolean;
  setNowPlayingOpen: (value: boolean, tab?: 'lyrics' | 'queue' | 'about') => void;
  nowPlayingTab: 'lyrics' | 'queue' | 'about';
  setNowPlayingTab: (tab: 'lyrics' | 'queue' | 'about') => void;

  toasts: Toast[];
  toast: (message: string, kind?: Toast['kind'], action?: Toast['action']) => void;
  dismissToast: (id: string) => void;

  menu: { x: number; y: number; items: MenuItem[] } | null;
  openMenu: (x: number, y: number, items: MenuItem[]) => void;
  closeMenu: () => void;

  dialog: DialogState | null;
  openDialog: (dialog: DialogState) => void;
  closeDialog: () => void;
}

let toastCounter = 0;

export const useUiStore = create<UiState>((set, get) => ({
  sidebarCollapsed: false,
  setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),

  queueOpen: false,
  setQueueOpen: (value) => set({ queueOpen: value }),
  nowPlayingOpen: false,
  setNowPlayingOpen: (value, tab) => set(tab ? { nowPlayingOpen: value, nowPlayingTab: tab } : { nowPlayingOpen: value }),
  nowPlayingTab: 'queue',
  setNowPlayingTab: (tab) => set({ nowPlayingTab: tab }),

  toasts: [],
  toast: (message, kind = 'info', action) => {
    const id = `toast_${++toastCounter}`;
    set((state) => ({ toasts: [...state.toasts.slice(-4), { id, message, kind, action }] }));
    window.setTimeout(() => get().dismissToast(id), action ? 7000 : 4200);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

  menu: null,
  openMenu: (x, y, items) => set({ menu: { x, y, items } }),
  closeMenu: () => set({ menu: null }),

  dialog: null,
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
}));

export function toast(message: string, kind: Toast['kind'] = 'info', action?: Toast['action']) {
  useUiStore.getState().toast(message, kind, action);
}

export function confirmDialog(options: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  useUiStore.getState().openDialog({ type: 'confirm', ...options });
}
