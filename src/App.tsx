import {
  Component,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { Route } from './stores/nav';
import { useNavStore } from './stores/nav';
import { useAppStore } from './stores/app';
import { usePlayerStore } from './stores/player';
import { useUiStore } from './stores/ui';
import { Button, ContextMenu, Toasts, useScrollStore } from './components/primitives';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { PlayerBar } from './components/PlayerBar';
import { NowPlaying } from './components/NowPlaying';
import { DialogHost } from './components/Dialogs';
import { Splash } from './components/Splash';
import { HomePage } from './pages/Home';
import { ExplorePage } from './pages/Explore';
import { PodcastsPage } from './pages/Podcasts';
import { Onboarding } from './components/Onboarding';
import { SearchPage } from './pages/Search';
import { DetailPage } from './pages/Detail';
import { LibraryPage } from './pages/Library';
import { LikedPage } from './pages/Liked';
import { RecentPage, HistoryPage } from './pages/Recent';
import { DownloadsPage } from './pages/Downloads';
import { LocalPlaylistPage } from './pages/LocalPlaylist';
import { SettingsPage } from './pages/Settings';

/* ------------------------------------------------------------------ */
/* Error boundary                                                      */
/* ------------------------------------------------------------------ */

interface BoundaryState {
  error?: Error;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = {};

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Auralis renderer crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="crash-screen">
          <div className="crash-card">
            <span className="crash-icon">
              <AlertTriangle size={30} />
            </span>
            <h1>Something went off-key</h1>
            <p>
              The interface hit an unexpected error. Your library and downloads are safe — reloading usually fixes it.
            </p>
            <pre>{this.state.error.message}</pre>
            <div className="crash-actions">
              <Button
                variant="primary"
                icon={<RefreshCw size={16} />}
                onClick={() => window.location.reload()}
              >
                Reload Auralis
              </Button>
              <Button variant="ghost" onClick={() => this.setState({ error: undefined })}>
                Try again
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ------------------------------------------------------------------ */
/* Route rendering                                                     */
/* ------------------------------------------------------------------ */

function RouteView({ route }: { route: Route }) {
  switch (route.page) {
    case 'home':
      return <HomePage />;
    case 'explore':
      return <ExplorePage tab={route.tab} />;
    case 'search':
      return <SearchPage q={route.q} filter={route.filter} />;
    case 'album':
      return <DetailPage kind="album" id={route.id} />;
    case 'playlist':
      return <DetailPage kind="playlist" id={route.id} />;
    case 'artist':
      return <DetailPage kind="artist" id={route.id} />;
    case 'podcast':
      return <DetailPage kind="podcast" id={route.id} />;
    case 'podcasts':
      return <PodcastsPage />;
    case 'browse':
      return <DetailPage kind="browse" id={route.id} params={route.params} title={route.title} />;
    case 'library':
      return <LibraryPage tab={route.tab} />;
    case 'liked':
      return <LikedPage />;
    case 'recent':
      return <RecentPage />;
    case 'history':
      return <HistoryPage />;
    case 'downloads':
      return <DownloadsPage />;
    case 'local':
      return <LocalPlaylistPage id={route.id} />;
    case 'settings':
      return <SettingsPage tab={route.tab} />;
    default:
      return <HomePage />;
  }
}

function routeKey(route: Route): string {
  return JSON.stringify(route);
}

/**
 * Top-level destinations are kept mounted once visited. Previously every
 * navigation changed the route-stage key, which destroyed the current page,
 * aborted its requests and re-fetched the same shelves when the user came
 * back. Keeping these pages alive makes repeat navigation instant and also
 * preserves their scroll/player context.
 */
const KEEP_ALIVE_PAGES = new Set<Route['page']>([
  'home',
  'explore',
  'search',
  'podcasts',
  'library',
  'liked',
  'recent',
  'history',
  'downloads',
  'settings',
]);

function isKeepAliveRoute(route: Route): boolean {
  return KEEP_ALIVE_PAGES.has(route.page);
}

/* ------------------------------------------------------------------ */
/* App shell                                                           */
/* ------------------------------------------------------------------ */

export default function App() {
  const ready = useAppStore((state) => state.ready);
  const startPage = useAppStore((state) => state.settings.startPage);
  const sidebarSetting = useAppStore((state) => state.settings.sidebarCollapsed);
  const entries = useNavStore((state) => state.entries);
  const index = useNavStore((state) => state.index);
  const route = entries[index] || { page: 'home' as const };
  const key = routeKey(route);
  const activeViewKey = isKeepAliveRoute(route) ? route.page : `@${key}`;
  const [mountedRoutes, setMountedRoutes] = useState<Record<string, Route>>(() =>
    isKeepAliveRoute(route) ? { [route.page]: route } : {},
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const startApplied = useRef(false);
  const [splashDone, setSplashDone] = useState(false);
  const onboardingCompleted = useAppStore((state) => state.settings.personalization.onboardingCompleted);
  const onboardingOpen = useUiStore((state) => state.onboardingOpen);
  const postSplash = ready && splashDone;
  const showApp = postSplash && onboardingCompleted;

  useEffect(() => {
    if (!isKeepAliveRoute(route)) return;
    setMountedRoutes((current) => {
      const previous = current[route.page];
      if (previous && routeKey(previous) === key) return current;
      return { ...current, [route.page]: route };
    });
  }, [key, route]);

  useEffect(() => {
    // Let the cold-start reveal finish before the library appears. The app
    // keeps loading behind the splash, so this is a floor, not a fixed delay.
    const timer = window.setTimeout(() => setSplashDone(true), 3300);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await useAppStore.getState().init();
      if (!cancelled) usePlayerStore.getState().init();
    })();

    const unsubscribeNav = window.auralis.events.onNavigate((path) => {
      const nav = useNavStore.getState();
      if (path === '/home') nav.navigate({ page: 'home' });
      else if (path === '/library') nav.navigate({ page: 'library' });
      else if (path === '/search') nav.navigate({ page: 'search' });
      else if (path === '/explore') nav.navigate({ page: 'explore' });
      else if (path === '/downloads') nav.navigate({ page: 'downloads' });
      else if (path === '/liked') nav.navigate({ page: 'liked' });
      else if (path === '/recent') nav.navigate({ page: 'recent' });
      else if (path === '/settings') nav.navigate({ page: 'settings' });
    });

    const keyboard = (event: KeyboardEvent) => {
      const typing = Boolean(
        (event.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]'),
      );
      if (event.altKey && event.key === 'ArrowLeft' && !typing) {
        event.preventDefault();
        useNavStore.getState().back();
      } else if (event.altKey && event.key === 'ArrowRight' && !typing) {
        event.preventDefault();
        useNavStore.getState().forward();
      } else if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault();
        useNavStore.getState().navigate({ page: 'settings' });
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        const input = document.querySelector<HTMLInputElement>('.top-search input');
        input?.focus();
        input?.select();
      } else if (event.key === 'Escape') {
        useUiStore.getState().setNowPlayingOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => keyboard(event);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      cancelled = true;
      unsubscribeNav();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!ready || startApplied.current) return;
    startApplied.current = true;
    const nav = useNavStore.getState();
    const untouched = nav.entries.length === 1 && nav.entries[0].page === 'home';
    if (untouched && startPage !== 'home') nav.reset({ page: startPage });
  }, [ready, startPage]);

  useEffect(() => {
    useUiStore.getState().setSidebarCollapsed(sidebarSetting);
  }, [sidebarSetting]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const player = usePlayerStore.getState();
      if (!player.sleepTimerEnd || Date.now() < player.sleepTimerEnd) return;
      const wasPlaying = player.playing;
      player.pause();
      player.clearSleepTimer();
      useUiStore.getState().toast(wasPlaying ? 'Sleep timer ended. Playback paused.' : 'Sleep timer ended.');
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const saved = useScrollStore.getState().positions[key] ?? 0;
    node.scrollTop = saved;
    if (!saved) return;
    // Correct once after paint only if the browser clamped the restore while
    // the route was still mounting. A second timed assignment used to yank the
    // viewport back 90ms later if the user had already started scrolling.
    const frame = window.requestAnimationFrame(() => {
      if (scrollRef.current && Math.abs(scrollRef.current.scrollTop - saved) > 1) {
        scrollRef.current.scrollTop = saved;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [key]);

  return (
    <div className="app-shell">
      <TitleBar />
      {showApp ? (
        <div className="app-body">
          <Sidebar />
          <div className="main-frame">
            <TopBar />
            <main
              className="content-scroll"
              ref={scrollRef}
              onScroll={(event) => {
                useScrollStore.getState().setPosition(key, event.currentTarget.scrollTop);
              }}
            >
              <div className="route-stage">
                {Object.entries(mountedRoutes).map(([page, cachedRoute]) => {
                  const active = page === activeViewKey;
                  return (
                    <div key={page} className="route-page" hidden={!active}>
                      <RouteView route={active ? route : cachedRoute} />
                    </div>
                  );
                })}
                {isKeepAliveRoute(route) ? null : (
                  <div key={activeViewKey} className="route-page">
                    <RouteView route={route} />
                  </div>
                )}
              </div>
              <div className="content-bottom-space" />
            </main>
          </div>
        </div>
      ) : postSplash ? (
        <Onboarding onComplete={() => useUiStore.getState().closeOnboarding()} editing={onboardingCompleted} />
      ) : (
        <Splash />
      )}
      {showApp && onboardingOpen ? (
        <Onboarding onComplete={() => useUiStore.getState().closeOnboarding()} editing />
      ) : null}
      {showApp ? (
        <>
          <PlayerBar />
          <NowPlaying />
        </>
      ) : null}
      <DialogHost />
      <Toasts />
      <ContextMenu />
    </div>
  );
}
