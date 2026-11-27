import { useState } from 'react';
import { ArrowRight, Clock3, Cookie, Globe, ListMusic, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { useUiStore } from '../stores/ui';

/**
 * Android first-run sign-in. Mirrors the Windows login story (Google session,
 * manual cookies fallback, private by design) in a phone-sized layout.
 */
export function LoginPage() {
  const login = useAppStore((state) => state.login);
  const version = useAppStore((state) => state.appInfo?.version);
  const openDialog = useUiStore((state) => state.openDialog);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await login();
    } catch (cause: any) {
      setError(cause?.message || String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="onboard-login">
      <div className="onboard-logo-bg" aria-hidden="true">
        <img src="./icon.png" alt="" draggable={false} />
      </div>
      <div className="onboard-login-inner">
        <div className="onboard-brand-row">
          <img src="./icon.png" alt="" draggable={false} />
          <div>
            <strong>Auralis</strong>
            <span>Music, without the noise</span>
          </div>
        </div>

        <span className="onboard-kicker">
          <Sparkles size={13} /> Your account, your library
        </span>
        <h1>
          Sign in once.
          <br />
          <span>Your music stays.</span>
        </h1>
        <p className="onboard-intro">
          Auralis uses your YouTube Music account to bring your playlists, history and recommendations into one calm
          place. Your password stays with Google.
        </p>

        <ul className="onboard-features">
          <li>
            <span><Clock3 size={17} /></span>
            <div><strong>Listening history</strong><small>Pick up songs from every device.</small></div>
          </li>
          <li>
            <span><ListMusic size={17} /></span>
            <div><strong>Every playlist</strong><small>Your YouTube Music lists, beside your local ones.</small></div>
          </li>
          <li>
            <span><ShieldCheck size={17} /></span>
            <div><strong>Private by design</strong><small>Only the session cookies Auralis needs are kept on this device.</small></div>
          </li>
        </ul>

        <button type="button" className="onboard-primary" disabled={busy} onClick={() => void start()}>
          {busy ? <Loader2 size={18} className="spin" /> : <Globe size={18} />}
          <span>{busy ? 'Waiting for Google…' : 'Continue with Google'}</span>
          {!busy ? <ArrowRight size={17} /> : null}
        </button>
        <button type="button" className="onboard-secondary" disabled={busy} onClick={() => openDialog({ type: 'cookie' })}>
          <Cookie size={16} /> Use cookies manually instead
        </button>

        {error ? (
          <div className="onboard-error" role="alert">
            <strong>Could not open sign-in</strong>
            <span>{error}</span>
          </div>
        ) : null}

        <p className="onboard-footnote">
          Auralis never sees your password. You can sign out any time from Settings → Account.
          {version ? ` · v${version}` : ''}
        </p>
      </div>
    </div>
  );
}
