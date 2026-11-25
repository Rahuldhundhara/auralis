import { useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Mic, Sliders, UserRound } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { useUiStore } from '../stores/ui';
import { initials } from '../lib/format';
import { Artwork, IconButton } from './primitives';
import { SearchField } from './SearchField';
import { NotificationBell } from './NotificationCenter';

export function TopBar() {
  const canBack = useNavStore((state) => state.index > 0);
  const canForward = useNavStore((state) => state.index < state.entries.length - 1);
  const back = useNavStore((state) => state.back);
  const forward = useNavStore((state) => state.forward);
  const navigate = useNavStore((state) => state.navigate);
  const session = useAppStore((state) => state.session);
  const login = useAppStore((state) => state.login);
  const openDialog = useUiStore((state) => state.openDialog);
  const openOnboarding = useUiStore((state) => state.openOnboarding);
  const toast = useUiStore((state) => state.toast);
  const [signingIn, setSigningIn] = useState(false);

  const openAccount = async () => {
    if (session.hasCookies) {
      navigate({ page: 'settings', tab: 'account' });
      return;
    }
    if (signingIn) return;
    setSigningIn(true);
    try {
      const next = await login();
      // Closing the private Google window without finishing is not an error.
      if (!next.hasCookies) return;
    } catch (error: any) {
      toast(`Sign in failed: ${error?.message || error}`, 'error');
      navigate({ page: 'settings', tab: 'account' });
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <header className="top-bar">
      <div className="top-nav-buttons">
        <IconButton label="Go back" size="sm" onClick={back} disabled={!canBack}>
          <ChevronLeft size={18} />
        </IconButton>
        <IconButton label="Go forward" size="sm" onClick={forward} disabled={!canForward}>
          <ChevronRight size={18} />
        </IconButton>
      </div>

      <div className="top-search">
        <SearchField
          trailing={
            <button
              type="button"
              className="identify-inline"
              onClick={(event) => {
                event.stopPropagation();
                openDialog({ type: 'recognition' });
              }}
              title="Identify Playing Song Around You"
            >
              <Mic size={15} />
              <span>Identify</span>
            </button>
          }
        />
      </div>

      <div className="top-actions">
        <button
          type="button"
          className="top-customize-taste"
          onClick={() => void openOnboarding()}
          title="Customize Your Taste"
          aria-label="Customize Your Taste"
        >
          <Sliders size={16} />
          <span>Customize Your Taste</span>
        </button>

        <NotificationBell />

        <button
          type="button"
          className="account-chip"
          onClick={() => void openAccount()}
          title={session.hasCookies ? 'Account' : 'Sign in to YouTube Music'}
          aria-label={session.hasCookies ? 'Account' : 'Sign in to YouTube Music'}
          aria-busy={signingIn}
          disabled={signingIn}
        >
          {signingIn ? (
            <span className="account-avatar account-avatar-fallback">
              <Loader2 size={15} className="spin" />
            </span>
          ) : session.account?.thumbnailUrl ? (
            <Artwork src={session.account.thumbnailUrl} alt={session.account.name} round className="account-avatar" />
          ) : (
            <span className="account-avatar account-avatar-fallback">
              {session.account ? initials(session.account.name) : <UserRound size={15} />}
            </span>
          )}
          <span className="account-name">
            {signingIn ? 'Signing in…' : session.account?.name || (session.hasCookies ? 'YouTube Music' : 'Sign in')}
          </span>
          {signingIn ? null : <span className="account-pro">PRO</span>}
        </button>
      </div>
    </header>
  );
}
