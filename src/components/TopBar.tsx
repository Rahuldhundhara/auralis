import { AudioLines, ChevronLeft, ChevronRight, UserRound } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { useUiStore } from '../stores/ui';
import { initials } from '../lib/format';
import { Artwork, IconButton } from './primitives';
import { SearchField } from './SearchField';

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
  const session = useAppStore((state) => state.session);
  const openDialog = useUiStore((state) => state.openDialog);

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
        <SearchField />
      </div>
      <div className="top-actions">
        <button type="button" className="recognize-pill" onClick={() => openDialog({ type: 'recognition' })} title="Identify a song">
          <AudioLines size={17} />
          <span>Identify</span>
        </button>
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
    </header>
  );
}
