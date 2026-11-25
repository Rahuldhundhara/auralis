import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Loader2, Search, Sparkles, X } from 'lucide-react';
import type { TasteArtist } from '@shared/types';
import { Artwork, Button } from '../components/primitives';
import {
  MAX_TASTE_ARTISTS,
  ONBOARDING_LANGUAGES,
  artistMeta,
  isSameArtist,
  loadTasteArtistCandidates,
} from '../lib/onboarding';
import { useAppStore } from '../stores/app';
import { toast, useUiStore } from '../stores/ui';

export function Onboarding() {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const setOnboardingOpen = useUiStore((state) => state.setOnboardingOpen);
  const editing = useRef(settings.onboardingComplete).current;

  const [step, setStep] = useState<1 | 2>(1);
  const [languages, setLanguages] = useState<string[]>(settings.tasteLanguages ?? []);
  const [artists, setArtists] = useState<TasteArtist[]>(settings.tasteArtists ?? []);
  const [candidates, setCandidates] = useState<TasteArtist[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setQuery('');
  }, [step]);

  useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const next = await loadTasteArtistCandidates(languages);
        const pinned = (settings.tasteArtists ?? []).filter(
          (saved) => !next.some((candidate) => isSameArtist(candidate, saved)),
        );
        if (!cancelled) setCandidates([...pinned.slice(0, MAX_TASTE_ARTISTS), ...next]);
      } catch (reason: any) {
        if (!cancelled) setError(reason?.message || 'Could not load artists.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // The language list is locked while step 2 is open, so step + retry are the
    // only reasons to rebuild the pool.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, retryKey]);

  const visibleArtists = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return candidates;
    return candidates.filter(
      (artist) =>
        artist.name.toLowerCase().includes(needle) || (artist.subtitle || '').toLowerCase().includes(needle),
    );
  }, [candidates, query]);

  const toggleLanguage = (id: string) => {
    setLanguages((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  const toggleArtist = (artist: TasteArtist) => {
    setArtists((current) => {
      if (current.some((saved) => isSameArtist(saved, artist))) {
        return current.filter((saved) => !isSameArtist(saved, artist));
      }
      if (current.length >= MAX_TASTE_ARTISTS) {
        toast(`You can pick up to ${MAX_TASTE_ARTISTS} artists.`, 'info');
        return current;
      }
      return [...current, artist];
    });
  };

  const finish = async (skipped = false) => {
    if (saving) return;
    setSaving(true);
    try {
      await updateSettings({
        tasteLanguages: languages,
        tasteArtists: artists,
        onboardingComplete: true,
      });
      setOnboardingOpen(false);
      if (!skipped) {
        toast(
          artists.length
            ? 'Your artists are saved and waiting on Home.'
            : 'Music preferences saved.',
          'success',
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const skip = () => {
    if (saving) return;
    if (editing) {
      setOnboardingOpen(false);
      return;
    }
    void finish(true);
  };

  const selectionNote =
    step === 1
      ? languages.length
        ? `${languages.length} ${languages.length === 1 ? 'language' : 'languages'} selected`
        : 'Choose at least one language to continue.'
      : loading
        ? 'Finding artists in the languages you picked…'
        : artists.length
          ? `${artists.length} of ${MAX_TASTE_ARTISTS} artists selected`
          : 'Optional — you can add artists later in Settings.';

  return (
    <section className="onboarding-page" aria-label="Music preferences">
      <header className="onboarding-topbar">
        <div className="onboarding-brand">
          <img src="./icon.png" alt="" draggable={false} />
          <span>Auralis</span>
          <span className="onboarding-brand-tag">Music</span>
        </div>
        <div className="onboarding-progress" role="status" aria-live="polite">
          <span className="onboarding-progress-bars" aria-hidden="true">
            <i className="is-on" />
            <i className={step === 2 ? 'is-on' : ''} />
          </span>
          <span>Step {step} of 2</span>
        </div>
        <button type="button" className="onboarding-skip" onClick={skip} disabled={saving}>
          {editing ? 'Close' : 'Skip for now'}
        </button>
      </header>

      <main className="onboarding-stage">
        <section className="onboarding-step" key={step}>
          <div className="onboarding-copy">
            <span className="onboarding-kicker">
              <Sparkles size={13} />
              {step === 1 ? 'Set the tone' : 'Make it yours'}
            </span>
            <h1>{step === 1 ? 'Which languages do you listen in?' : 'Who do you want on repeat?'}</h1>
            <p>
              {step === 1
                ? 'Pick every language you enjoy. We use them to find artists that belong on your Home shelf.'
                : 'Choose a few artists. Your picks show up on Home, and you can change them any time.'}
            </p>
          </div>

          <div className="onboarding-scroll" ref={scrollRef}>
            {step === 1 ? (
              <div className="onboarding-language-grid">
                {ONBOARDING_LANGUAGES.map((language) => {
                  const selected = languages.includes(language.id);
                  return (
                    <button
                      type="button"
                      key={language.id}
                      className={`onboarding-language ${selected ? 'is-selected' : ''}`}
                      aria-pressed={selected}
                      onClick={() => toggleLanguage(language.id)}
                    >
                      <span className="onboarding-language-text">
                        <strong>{language.native}</strong>
                        {language.native.toLowerCase() !== language.label.toLowerCase() ? (
                          <span>{language.label}</span>
                        ) : (
                          <span>{language.group === 'India' ? 'Indian language' : 'Global language'}</span>
                        )}
                      </span>
                      <span className="onboarding-check" aria-hidden="true">
                        {selected ? <Check size={13} /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <>
                {!loading && !error && candidates.length ? (
                  <div className="onboarding-search">
                    <Search size={15} />
                    <input
                      type="text"
                      value={query}
                      placeholder="Search artists"
                      aria-label="Search artists"
                      onChange={(event) => setQuery(event.target.value)}
                    />
                    {query ? (
                      <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
                        <X size={14} />
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {loading ? (
                  <div className="onboarding-artist-grid is-loading" aria-label="Loading artists">
                    {Array.from({ length: 12 }).map((_, index) => (
                      <div className="onboarding-artist-skeleton" key={index}>
                        <span />
                        <i />
                        <i />
                      </div>
                    ))}
                  </div>
                ) : error ? (
                  <div className="onboarding-error" role="alert">
                    <span className="onboarding-error-icon">
                      <AlertTriangle size={18} />
                    </span>
                    <div>
                      <strong>Artists did not load</strong>
                      <p>{error}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setRetryKey((value) => value + 1)}>
                      Try again
                    </Button>
                  </div>
                ) : visibleArtists.length ? (
                  <div className="onboarding-artist-grid">
                    {visibleArtists.map((artist) => {
                      const selected = artists.some((saved) => isSameArtist(saved, artist));
                      return (
                        <button
                          type="button"
                          key={`${artist.id}-${artist.name}`}
                          className={`onboarding-artist ${selected ? 'is-selected' : ''}`}
                          aria-pressed={selected}
                          onClick={() => toggleArtist(artist)}
                        >
                          <span className="onboarding-artist-art">
                            <Artwork src={artist.thumbnail} alt={artist.name} round />
                            <span className="onboarding-artist-check" aria-hidden="true">
                              {selected ? <Check size={13} /> : null}
                            </span>
                          </span>
                          <span className="onboarding-artist-name">{artist.name}</span>
                          <span className="onboarding-artist-meta">{artistMeta(artist.subtitle)}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="onboarding-empty">
                    <p>No artists match “{query.trim()}”.</p>
                    <button type="button" className="text-button" onClick={() => setQuery('')}>
                      Clear search
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>

      <footer className="onboarding-footer">
        <div className="onboarding-footer-inner">
          <p className="onboarding-selection" aria-live="polite">
            {selectionNote}
          </p>
          <div className="onboarding-actions">
            {step === 2 ? (
              <Button
                variant="ghost"
                icon={<ArrowLeft size={15} />}
                onClick={() => setStep(1)}
                disabled={saving}
              >
                Back
              </Button>
            ) : null}
            {step === 1 ? (
              <Button
                variant="primary"
                icon={<ArrowRight size={15} />}
                onClick={() => setStep(2)}
                disabled={!languages.length}
              >
                Continue
              </Button>
            ) : (
              <Button
                variant="primary"
                icon={saving ? <Loader2 size={15} className="spin" /> : <Check size={15} />}
                onClick={() => void finish()}
                disabled={saving}
              >
                {saving ? 'Saving…' : artists.length ? 'Finish' : 'Finish setup'}
              </Button>
            )}
          </div>
        </div>
      </footer>
    </section>
  );
}
