import { useEffect, useState } from 'react';
import { Compass, Home, LibraryBig, Search, Settings } from 'lucide-react';
import type { Route } from '../stores/nav';
import { useNavStore } from '../stores/nav';

interface MobileTab {
  label: string;
  icon: React.ReactNode;
  route: Route;
  isActive: (route: Route) => boolean;
}

const TABS: MobileTab[] = [
  {
    label: 'Home',
    icon: <Home size={21} />,
    route: { page: 'home' },
    isActive: (route) => route.page === 'home',
  },
  {
    label: 'Explore',
    icon: <Compass size={21} />,
    route: { page: 'explore' },
    isActive: (route) => route.page === 'explore',
  },
  {
    label: 'Search',
    icon: <Search size={21} />,
    route: { page: 'search' },
    isActive: (route) => route.page === 'search',
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
  const route = useNavStore((state) => state.entries[state.index] || { page: 'home' as const });
  const matched = TABS.find((tab) => tab.isActive(route));
  const [lastActive, setLastActive] = useState(matched?.label || 'Home');
  const activeLabel = matched?.label || lastActive;

  useEffect(() => {
    if (matched) setLastActive(matched.label);
  }, [matched?.label]);

  return (
    <nav className="mobile-nav" aria-label="Primary navigation">
      {TABS.map((tab) => {
        const active = tab.label === activeLabel;
        return (
          <button
            type="button"
            key={tab.label}
            className={`mobile-nav-item ${active ? 'is-active' : ''}`}
            aria-current={matched?.label === tab.label ? 'page' : undefined}
            onClick={() => navigate(tab.route)}
          >
            <span className="mobile-nav-icon">{tab.icon}</span>
            <span className="mobile-nav-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
