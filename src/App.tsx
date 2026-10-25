import {
  Component,
  useEffect,
  useLayoutEffect,
  useRef,
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
import { QueuePanel } from './components/QueuePanel';
import { NowPlaying } from './components/NowPlaying';
import { DialogHost } from './components/Dialogs';
import { HomePage } from './pages/Home';
import { ExplorePage } from './pages/Explore';
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

/* ------------------------------------------------------------------ */
/* Splash                                                              */
/* ------------------------------------------------------------------ */

function Splash() {
  return (
    <div className="splash">
      <div className="splash-glow" aria-hidden="true" />
      <div className="splash-brand">
        <img src="./icon.png" alt="" className="splash-logo" draggable={false} />
        <div className="splash-word">
          <span>Auralis</span>
          <small>Music for Windows</small>
        </div>
      </div>
      <div className="splash-eq" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <p>Warming up your library…</p>
    </div>
  );
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const startApplied = useRef(false);
  const key = routeKey(route);

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
        useUiStore.getState().setQueueOpen(false);
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
    const timer = window.setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = useScrollStore.getState().positions[key] ?? 0;
    }, 90);
    return () => window.clearTimeout(timer);
  }, [key]);

  return (
    <div className="app-shell">
      <TitleBar />
      {ready ? (
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
              <div className="route-stage" key={key}>
                <RouteView route={route} />
              </div>
              <div className="content-bottom-space" />
            </main>
          </div>
        </div>
      ) : (
        <Splash />
      )}
      {ready ? (
        <>
          <PlayerBar />
          <QueuePanel />
          <NowPlaying />
        </>
      ) : null}
      <DialogHost />
      <Toasts />
      <ContextMenu />
    </div>
  );
}
