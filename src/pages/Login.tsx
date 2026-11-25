import { useState } from 'react';
import logoMark from '../assets/splash/a.png';
import {
  ArrowRight,
  Clock3,
  Cookie,
  Globe,
  ListMusic,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useAppStore } from '../stores/app';
import { useUiStore } from '../stores/ui';
import { Button } from '../components/primitives';

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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-atmosphere" aria-hidden="true">
        <img src={logoMark} alt="" className="login-watermark" draggable={false} />
        <span className="login-orb login-orb-a" />
        <span className="login-orb login-orb-b" />
        <span className="login-rings" />
      </div>

      <div className="login-stage">
        <section className="login-story">
          <div className="login-brand">
            <img src="./icon.png" alt="" className="login-logo" draggable={false} />
            <div>
              <strong>Auralis</strong>
              <span>Music, without the noise</span>
            </div>
          </div>

          <div className="login-copy">
            <span className="eyebrow">
              <Sparkles size={14} /> Your account, your library
            </span>
            <h1>
              Sign in once.
              <br />
              <span>Your music stays.</span>
            </h1>
            <p>
              Auralis uses your YouTube Music account to bring your history, playlists and recommendations into one
              calm place. Your password stays with Google.
            </p>
            <ul className="login-features">
              <li>
                <span className="login-feature-icon">
                  <Clock3 size={16} />
                </span>
                <span>
                  <strong>Listening history</strong>
                  <span>Pick up the songs you played across every device.</span>
                </span>
              </li>
              <li>
                <span className="login-feature-icon">
                  <ListMusic size={16} />
                </span>
                <span>
                  <strong>Every playlist</strong>
                  <span>Your YouTube Music playlists appear beside your local ones.</span>
                </span>
              </li>
              <li>
                <span className="login-feature-icon">
                  <ShieldCheck size={16} />
                </span>
                <span>
                  <strong>Private by design</strong>
                  <span>Auralis only keeps the YouTube session cookies it needs.</span>
                </span>
              </li>
            </ul>
          </div>

          <p className="login-footnote">Your local library, downloads and settings stay on this PC.</p>
        </section>

        <section className="login-card" aria-labelledby="login-title">
          <span className="login-badge">
            <ShieldCheck size={14} /> Secure Google sign-in
          </span>
          <h2 id="login-title">Welcome back</h2>
          <p className="login-card-copy">
            Sign in with the Google account you already use for YouTube Music. A separate Chrome window opens so
            Google can verify you normally.
          </p>

          <Button
            variant="primary"
            size="lg"
            className="login-google"
            icon={busy ? <Loader2 size={19} className="spin" /> : <Globe size={19} />}
            onClick={() => void start()}
            disabled={busy}
          >
            {busy ? 'Waiting for Chrome…' : 'Continue with Google'}
            {!busy ? <ArrowRight size={17} className="login-google-arrow" /> : null}
          </Button>

          <button
            type="button"
            className="login-cookie"
            onClick={() => openDialog({ type: 'cookie' })}
            disabled={busy}
          >
            <Cookie size={15} /> Use cookies manually instead
          </button>

          {error ? (
            <div className="login-error" role="alert">
              <strong>Could not open sign-in</strong>
              <span>{error}</span>
            </div>
          ) : null}

          <div className="login-note">
            <span className="login-note-dot" aria-hidden="true" />
            <span>
              Auralis never sees your password. Sign out any time from Settings → Account.
            </span>
          </div>
        </section>
      </div>

      <footer className="login-footer">
        <span>Auralis {version ? `v${version}` : ''}</span>
        <span>Sign-in is required to use the app.</span>
      </footer>
    </div>
  );
}
