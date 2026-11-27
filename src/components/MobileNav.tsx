import { useEffect, useState } from 'react';
import { Compass, Home, LibraryBig, Plus, Settings } from 'lucide-react';
import type { Route } from '../stores/nav';
import { useNavStore } from '../stores/nav';
import { useUiStore } from '../stores/ui';

interface MobileTab {
  label: string;
  icon: React.ReactNode;
  route?: Route;
  createPlaylist?: boolean;
  isActive?: (route: Route) => boolean;
}

const TABS: MobileTab[] = [
  {
    label: 'Home',
    icon: <Home size={21} />,
    route: { page: 'home' },
    // Search is reached from the header/home, so keep Home highlighted while
    // search is open instead of leaving a stale tab lit.
    isActive: (route) => route.page === 'home' || route.page === 'search',
  },
  {
    label: 'Explore',
    icon: <Compass size={21} />,
    route: { page: 'explore' },
    isActive: (route) => route.page === 'explore',
  },
  {
    label: 'New',
    icon: <Plus size={24} strokeWidth={2.6} />,
    createPlaylist: true,
  },
  {
    label: 'Library',
    icon: <LibraryBig size={21} />,
    route: { page: 'library' },
    isActive: (route) =>
      route.page === 'library' ||
      route.page === 'liked' ||
      route.page === 'recent' ||
      route.page === 'history' ||
      route.page === 'downloads' ||
      route.page === 'local',
  },
  {
    label: 'Settings',
    icon: <Settings size={21} />,
    route: { page: 'settings' },
    isActive: (route) => route.page === 'settings',
  },
];

export function MobileNav() {
  const navigate = useNavStore((state) => state.navigate);
  const openDialog = useUiStore((state) => state.openDialog);
  const route = useNavStore((state) => state.entries[state.index] || { page: 'home' as const });
  const matched = TABS.find((tab) => tab.isActive?.(route));
  const [lastActive, setLastActive] = useState(matched?.label || 'Home');
  const activeLabel = matched?.label || lastActive;

  useEffect(() => {
    if (matched) setLastActive(matched.label);
  }, [matched?.label]);

  return (
    <nav className="mobile-nav" aria-label="Primary navigation">
      {TABS.map((tab) => {
        const active = Boolean(tab.isActive) && tab.label === activeLabel;
        return (
          <button
            type="button"
            key={tab.label}
            className={`mobile-nav-item ${active ? 'is-active' : ''} ${tab.createPlaylist ? 'mobile-nav-create' : ''}`}
            aria-current={matched?.label === tab.label ? 'page' : undefined}
            aria-label={tab.createPlaylist ? 'Create playlist' : undefined}
            onClick={() => {
              if (tab.createPlaylist) {
                openDialog({ type: 'create-playlist' });
                return;
              }
              if (tab.route) navigate(tab.route);
            }}
          >
            <span className="mobile-nav-icon">{tab.icon}</span>
            <span className="mobile-nav-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
