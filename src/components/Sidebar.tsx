import { useEffect, useRef } from 'react';
import {
  Clock3,
  Compass,
  Download,
  Heart,
  Home,
  LibraryBig,
  ListMusic,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Podcast,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react';
import type { LocalPlaylist } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { useUiStore } from '../stores/ui';
import { getAudioEnergy, getAudioSpectrum, usePlayerStore } from '../stores/player';
import { confirmDialog, toast } from '../stores/ui';
import { platformName } from '../lib/platform';
import { Artwork, IconButton } from './primitives';
import logo from '../assets/logo.png';

function NavItem({
  icon,
  label,
  active,
  collapsed,
  badge,
  heart,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  collapsed: boolean;
  badge?: number;
  heart?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`sidebar-item ${active ? 'is-active' : ''} ${collapsed ? 'is-collapsed' : ''} ${heart ? 'nav-heart' : ''}`}
      onClick={onClick}
      title={collapsed ? label : undefined}
    >
      <span className="sidebar-icon">{icon}</span>
      {!collapsed ? (
        <>
          <span className="sidebar-label">{label}</span>
          {badge ? <span className="sidebar-badge">{badge > 999 ? '999+' : badge}</span> : null}
        </>
      ) : null}
    </button>
  );
}

const BAR_COUNT = 26;

function SidebarVisualizer() {
  const barsRef = useRef<HTMLDivElement>(null);
  const live = usePlayerStore((state) => Boolean(state.current && state.playing && !state.loading));

  useEffect(() => {
    const host = barsRef.current;
    if (!host) return;
    const root = host.closest<HTMLElement>('.sidebar-visualizer');
    if (!root) return;

    const bars = Array.from(host.querySelectorAll<HTMLElement>('.sidebar-visualizer-bar'));
    if (!bars.length) return;

    const reset = () => {
      root.classList.remove('is-live');
      for (const bar of bars) {
        bar.style.transform = '';
        bar.style.opacity = '';
      }
    };

    if (!live || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      reset();
      return;
    }

    root.classList.add('is-live');
    let raf = 0;
    let lastFrame = 0;
    const levels = new Float32Array(bars.length);
    for (let i = 0; i < bars.length; i++) levels[i] = 0.12;
    const phases = bars.map((_, i) => (i * 0.354) % (Math.PI * 2));

    const tick = (now: number) => {
      // Do not keep a compositor loop alive while the window is hidden.
      if (document.hidden) {
        raf = 0;
        return;
      }
      raf = window.requestAnimationFrame(tick);
      // 30 fps is plenty for a 68px decorative strip and halves the style
      // writes compared with the old unconditional 60 fps loop.
      if (now - lastFrame < 32) return;
      lastFrame = now;

      const spectrum = getAudioSpectrum();
      const energy = getAudioEnergy();
      const beat = Math.max(0, Math.min(1, (energy - 0.02) / 0.35));
      const useAnalyser = spectrum && spectrum.length > 0;
      const beatPulse = useAnalyser ? beat : 0.5 + 0.5 * Math.sin(now * 0.016);

      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i];
        let target: number;
        if (useAnalyser) {
          const spectrumDense = spectrum as Uint8Array<ArrayBuffer>;
          const progress = i / Math.max(1, bars.length - 1);
          const shaped = Math.pow(progress * 1.05, 1.15);
          const binRaw = shaped * (spectrumDense.length - 8) + 2;
          const bin = Math.max(0, Math.min(spectrumDense.length - 1, Math.floor(binRaw)));
          let peak = spectrumDense[bin];
          for (let k = 1; k <= 2; k++) {
            const next = Math.min(spectrumDense.length - 1, bin + k);
            if (spectrumDense[next] > peak) peak = spectrumDense[next];
          }
          const raw = peak / 255;
          const isLowBar = i < 8;
          const punch = isLowBar ? 0.45 + beat * 0.55 : 0.35 + beat * 0.25;
          target = 0.08 + Math.min(0.95, (raw * 0.92 + beat * 0.12) * punch * 1.15);
        } else {
          target = 0.12 + (0.35 + 0.45 * beatPulse) * Math.abs(Math.sin(now * 0.003458 + phases[i]));
        }

        const current = levels[i];
        const attack = 0.65;
        const release = 0.14;
        const next = target > current
          ? current + (target - current) * attack
          : current + (target - current) * release;
        levels[i] = Math.max(0.07, Math.min(1, next));
        bar.style.transform = `scaleY(${levels[i].toFixed(3)})`;
        bar.style.opacity = String(0.35 + levels[i] * 0.6);
      }
    };

    const onVisibility = () => {
      if (!document.hidden && !raf) raf = window.requestAnimationFrame(tick);
    };

    document.addEventListener('visibilitychange', onVisibility);
    raf = window.requestAnimationFrame(tick);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.cancelAnimationFrame(raf);
      reset();
    };
  }, [live]);

  return (
    <div className="sidebar-visualizer" aria-hidden="true">
      <div ref={barsRef} className="sidebar-visualizer-bars">
        {Array.from({ length: BAR_COUNT }, (_, index) => {
          const height = 26 + ((index * 41 + 13) % 66);
          return (
            <span
              key={index}
              className="sidebar-visualizer-bar"
              style={{ '--bar-height': `${height}%` } as React.CSSProperties}
            />
          );
        })}
      </div>
    </div>
  );
}

export function Sidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const setCollapsed = useUiStore((state) => state.setSidebarCollapsed);
  const navigate = useNavStore((state) => state.navigate);
  const route = useNavStore((state) => state.entries[state.index]);
  const library = useAppStore((state) => state.library);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const openDialog = useUiStore((state) => state.openDialog);
  const openMenu = useUiStore((state) => state.openMenu);
  const deletePlaylist = useAppStore((state) => state.deletePlaylist);

  const toggleCollapsed = () => {
    setCollapsed(!collapsed);
    void updateSettings({ sidebarCollapsed: !collapsed });
  };

  const openPlaylistMenu = (event: React.MouseEvent, playlist: LocalPlaylist) => {
    event.preventDefault();
    openMenu(event.clientX, event.clientY, [
      { label: 'Open playlist', icon: ListMusic, onClick: () => navigate({ page: 'local', id: playlist.id }) },
      { label: 'Rename', icon: Pencil, onClick: () => openDialog({ type: 'rename-playlist', playlist }) },
      { separator: true },
      {
        label: 'Delete playlist',
        icon: Trash2,
        danger: true,
        onClick: () =>
          confirmDialog({
            title: 'Delete playlist?',
            message: `“${playlist.name}” will be removed. This cannot be undone.`,
            confirmLabel: 'Delete',
            danger: true,
            onConfirm: async () => {
              await deletePlaylist(playlist.id);
              if (route.page === 'local' && route.id === playlist.id) navigate({ page: 'library' });
              toast('Playlist deleted.', 'success');
            },
          }),
      },
    ]);
  };

  return (
    <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="sidebar-brand" title="Auralis">
        <span className="sidebar-brand-mark">
          <img src={logo} alt="Auralis" className="sidebar-brand-logo" />
        </span>
        <span>
          <span className="sidebar-brand-name">Auralis</span>
          <span className="sidebar-brand-sub">Hi-Fi Audio</span>
        </span>
      </div>
      <div className="sidebar-top">
        <nav className="sidebar-section">
          <NavItem
            icon={<Home size={18} />}
            label="Home"
            collapsed={collapsed}
            active={route.page === 'home'}
            onClick={() => navigate({ page: 'home' })}
          />
          <NavItem
            icon={<Compass size={18} />}
            label="Explore"
            collapsed={collapsed}
            active={route.page === 'explore'}
            onClick={() => navigate({ page: 'explore' })}
          />
          <NavItem
            icon={<Podcast size={18} />}
            label="Podcasts"
            collapsed={collapsed}
            active={route.page === 'podcasts'}
            onClick={() => navigate({ page: 'podcasts' })}
          />
          <NavItem
            icon={<LibraryBig size={18} />}
            label="Library"
            collapsed={collapsed}
            active={route.page === 'library'}
            onClick={() => navigate({ page: 'library' })}
          />
        </nav>

        <nav className="sidebar-section">
          {!collapsed ? <span className="sidebar-section-title">Collection</span> : null}
          <NavItem
            icon={<Heart size={18} />}
            label="Liked Songs"
            collapsed={collapsed}
            active={route.page === 'liked'}
            badge={library.liked.length}
            heart
            onClick={() => navigate({ page: 'liked' })}
          />
          <NavItem
            icon={<Download size={18} />}
            label="Downloads"
            collapsed={collapsed}
            active={route.page === 'downloads'}
            badge={library.downloads.filter((item) => item.status === 'done').length}
            onClick={() => navigate({ page: 'downloads' })}
          />
          <NavItem
            icon={<Clock3 size={18} />}
            label="Recently Played"
            collapsed={collapsed}
            active={route.page === 'recent'}
            onClick={() => navigate({ page: 'recent' })}
          />
        </nav>
      </div>

      {!collapsed ? (
        <div className="sidebar-playlists">
          <div className="sidebar-section-title playlist-title-row">
            <span>Playlists</span>
            <IconButton
              label="Create playlist"
              size="xs"
              onClick={() => openDialog({ type: 'create-playlist' })}
            >
              <Plus size={16} />
            </IconButton>
          </div>
          <div className="playlist-scroll">
            {library.playlists.length ? (
              library.playlists.map((playlist) => (
                <button
                  type="button"
                  key={playlist.id}
                  className={`sidebar-playlist ${route.page === 'local' && route.id === playlist.id ? 'is-active' : ''}`}
                  onClick={() => navigate({ page: 'local', id: playlist.id })}
                  onContextMenu={(event) => openPlaylistMenu(event, playlist)}
                  title={playlist.name}
                >
                  <Artwork
                    src={playlist.cover || playlist.tracks[0]?.thumbnail}
                    alt={playlist.name}
                    className="sidebar-playlist-art"
                  />
                  <span className="sidebar-playlist-text">
                    <span className="sidebar-playlist-name">{playlist.name}</span>
                    <span className="sidebar-playlist-meta">
                      {playlist.tracks.length} {playlist.tracks.length === 1 ? 'song' : 'songs'}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <button type="button" className="sidebar-create-card" onClick={() => openDialog({ type: 'create-playlist' })}>
                <span className="sidebar-create-icon">
                  <Plus size={18} />
                </span>
                <span>
                  <strong>Create your first playlist</strong>
                  <span>It only takes a moment</span>
                </span>
              </button>
            )}
          </div>
        </div>
      ) : null}

      <div className="sidebar-footer">
        <div className="sidebar-footer-row">
          <button
            type="button"
            className={`sidebar-settings ${route.page === 'settings' ? 'is-active' : ''}`}
            onClick={() => navigate({ page: 'settings' })}
            title="Settings"
          >
            <Settings size={16} />
            {!collapsed ? <span>Settings</span> : null}
          </button>
        </div>
        <button type="button" className="sidebar-collapse" onClick={toggleCollapsed} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          {!collapsed ? <span>Collapse</span> : null}
        </button>
        {!collapsed ? (
          <div className="sidebar-signature">
            <img src={logo} alt="" className="sidebar-signature-logo" />
            <span>Auralis for {platformName()}</span>
          </div>
        ) : null}
      </div>

      <SidebarVisualizer />
    </aside>
  );
}
