import {
  Clock3,
  Compass,
  Download,
  Heart,
  Home,
  LibraryBig,
  ListMusic,
  Music2,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
} from 'lucide-react';
import type { LocalPlaylist } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { useUiStore } from '../stores/ui';
import { confirmDialog, toast } from '../stores/ui';
import { platformName } from '../lib/platform';
import { Artwork, IconButton } from './primitives';

function NavItem({
  icon,
  label,
  active,
  collapsed,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  collapsed: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`sidebar-item ${active ? 'is-active' : ''} ${collapsed ? 'is-collapsed' : ''}`}
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
      <div className="sidebar-top">
        <nav className="sidebar-section">
          {!collapsed ? <div className="sidebar-section-title">Discover</div> : null}
          <NavItem
            icon={<Home size={20} />}
            label="Home"
            collapsed={collapsed}
            active={route.page === 'home'}
            onClick={() => navigate({ page: 'home' })}
          />
          <NavItem
            icon={<Compass size={20} />}
            label="Explore"
            collapsed={collapsed}
            active={route.page === 'explore'}
            onClick={() => navigate({ page: 'explore' })}
          />
          <NavItem
            icon={<Search size={20} />}
            label="Search"
            collapsed={collapsed}
            active={route.page === 'search'}
            onClick={() => navigate({ page: 'search' })}
          />
        </nav>

        <nav className="sidebar-section">
          {!collapsed ? <div className="sidebar-section-title">Your collection</div> : null}
          <NavItem
            icon={<LibraryBig size={20} />}
            label="Library"
            collapsed={collapsed}
            active={route.page === 'library'}
            onClick={() => navigate({ page: 'library' })}
          />
          <NavItem
            icon={<Heart size={20} />}
            label="Liked songs"
            collapsed={collapsed}
            active={route.page === 'liked'}
            badge={library.liked.length}
            onClick={() => navigate({ page: 'liked' })}
          />
          <NavItem
            icon={<Download size={20} />}
            label="Downloads"
            collapsed={collapsed}
            active={route.page === 'downloads'}
            badge={library.downloads.filter((item) => item.status === 'done').length}
            onClick={() => navigate({ page: 'downloads' })}
          />
          <NavItem
            icon={<Clock3 size={20} />}
            label="Recently played"
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
        <NavItem
          icon={<Settings size={20} />}
          label="Settings"
          collapsed={collapsed}
          active={route.page === 'settings'}
          onClick={() => navigate({ page: 'settings' })}
        />
        <button type="button" className="sidebar-collapse" onClick={toggleCollapsed} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          {!collapsed ? <span>Collapse</span> : null}
        </button>
        {!collapsed ? (
          <div className="sidebar-signature">
            <Music2 size={13} />
            <span>Auralis for {platformName()}</span>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
