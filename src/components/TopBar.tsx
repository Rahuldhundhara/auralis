import { AudioLines, ChevronLeft, ChevronRight, ListMusic, UserRound } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { initials } from '../lib/format';
import { isAndroidShell } from '../lib/platform';
import { Artwork, IconButton } from './primitives';
import { AndroidSearchLauncher, SearchField } from './SearchField';
import { WindowControls } from './WindowControls';

export function TopBar() {
  const canBack = useNavStore((state) => state.index > 0);
  const canForward = useNavStore((state) => state.index < state.entries.length - 1);
  const back = useNavStore((state) => state.back);
  const forward = useNavStore((state) => state.forward);
  const navigate = useNavStore((state) => state.navigate);
  const route = useNavStore((state) => state.entries[state.index] || { page: 'home' as const });
  const showMobileBack =
    canBack &&
    !['home', 'explore', 'search', 'library', 'liked', 'recent', 'downloads', 'history', 'settings'].includes(route.page);
  // The dedicated Search page owns its search field (hero on the landing view,
  // inline field on results). Showing the launcher there would duplicate it.
  const hideMobileSearch = isAndroidShell && route.page === 'search';
  const session = useAppStore((state) => state.session);
  const openDialog = useUiStore((state) => state.openDialog);
  const queueOpen = useUiStore((state) => state.queueOpen);
  const setQueueOpen = useUiStore((state) => state.setQueueOpen);
  const queueCount = usePlayerStore((state) => state.queue.length);

  return (
    <header className="top-bar">
      <div className="top-mobile-leading">
        {showMobileBack ? (
          <IconButton label="Go back" size="sm" onClick={back}>
            <ChevronLeft size={21} />
          </IconButton>
        ) : (
          <img src="./icon.png" alt="" className="top-mobile-logo" draggable={false} />
        )}
      </div>
      <div className="top-nav-buttons">
        <IconButton label="Go back" size="sm" onClick={back} disabled={!canBack}>
          <ChevronLeft size={20} />
        </IconButton>
        <IconButton label="Go forward" size="sm" onClick={forward} disabled={!canForward}>
          <ChevronRight size={20} />
        </IconButton>
      </div>
      <div className="top-search">
        {hideMobileSearch ? null : isAndroidShell ? (
          <AndroidSearchLauncher />
        ) : (
          <SearchField onIdentify={() => openDialog({ type: 'recognition' })} />
        )}
      </div>
      <div className="top-actions">
        {isAndroidShell ? (
          <button
            type="button"
            className="recognize-pill"
            onClick={() => openDialog({ type: 'recognition' })}
            title="Identify a song"
          >
            <AudioLines size={17} />
            <span>Identify</span>
          </button>
        ) : null}
        {!isAndroidShell ? (
          <button
            type="button"
            className={`queue-pill ${queueOpen ? 'is-active' : ''}`}
            onClick={() => setQueueOpen(!queueOpen)}
            title="Playing queue"
          >
            <ListMusic size={17} />
            <span>Playing Queue</span>
            {queueCount > 0 ? <em>{queueCount > 99 ? '99+' : queueCount}</em> : null}
          </button>
        ) : null}
        <button
          type="button"
          className="account-chip"
          onClick={() => navigate({ page: 'settings', tab: 'account' })}
          title="Account"
        >
          {session.account?.thumbnailUrl ? (
            <Artwork src={session.account.thumbnailUrl} alt={session.account.name} round className="account-avatar" />
          ) : (
            <span className="account-avatar account-avatar-fallback">{session.account ? initials(session.account.name) : <UserRound size={15} />}</span>
          )}
          <span className="account-name">
            {session.account?.name || (session.hasCookies ? 'YouTube Music' : 'Sign in')}
          </span>
        </button>
      </div>
      {!isAndroidShell ? <div className="topbar-drag-region" aria-hidden="true" /> : null}
      {!isAndroidShell ? <WindowControls className="is-topbar" /> : null}
    </header>
  );
}
