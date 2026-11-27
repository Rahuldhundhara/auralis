import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Loader2, Search, Sparkles, X } from 'lucide-react';
import type { TasteArtist } from '@shared/types';
import { Artwork } from '../components/primitives';
import { useAppStore } from '../stores/app';
import { toast } from '../stores/ui';
import {
  artistMeta,
  isSameArtist,
  languageCover,
  loadTasteArtistCandidates,
  MAX_TASTE_ARTISTS,
  ONBOARDING_GENRES,
  ONBOARDING_LANGUAGES,
  sortLanguagesForRegion,
} from '../lib/onboarding';

const COVERS_KEY = 'auralis.onboardingCovers.v1';
const COVERS_TTL = 7 * 24 * 60 * 60_000;

function savedCovers(): Record<string, string> {
  try {
    const raw = localStorage.getItem(COVERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { at: number; covers: Record<string, string> };
    if (Date.now() - parsed.at > COVERS_TTL) return {};
    return parsed.covers || {};
  } catch {
    return {};
  }
}

export function OnboardingPage() {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const [step, setStep] = useState<1 | 2>(1);
  const [languages, setLanguages] = useState<string[]>(settings.tasteLanguages || []);
  const [genres, setGenres] = useState<string[]>(settings.tasteGenres || []);
  const [artists, setArtists] = useState<TasteArtist[]>(settings.tasteArtists || []);
  const [covers, setCovers] = useState<Record<string, string>>(savedCovers);
  const [candidates, setCandidates] = useState<TasteArtist[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const orderedLanguages = useMemo(
    () => sortLanguagesForRegion(ONBOARDING_LANGUAGES, settings.region),
    [settings.region],
  );

  useEffect(() => {
    if (Object.keys(covers).length >= orderedLanguages.length) return;
    let cancelled = false;
    void Promise.allSettled(orderedLanguages.map((language) => languageCover(language))).then((results) => {
      if (cancelled) return;
      const next: Record<string, string> = { ...covers };
      results.forEach((entry, index) => {
        if (entry.status === 'fulfilled' && entry.value) next[orderedLanguages[index].id] = entry.value;
      });
      setCovers(next);
      try {
        localStorage.setItem(COVERS_KEY, JSON.stringify({ at: Date.now(), covers: next }));
      } catch {
        // best effort
      }
    });
    return () => {
      cancelled = true;
    };
    // Covers are fetched once; user choices do not affect them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedLanguages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadTasteArtistCandidates(languages)
      .then((next) => {
        if (!cancelled) setCandidates(next);
      })
      .catch((cause: any) => {
        if (cancelled) return;
        // A saved artist shelf still gives a usable, rights-cleared pool when
        // the catalogue is unreachable on first launch.
        const saved = (useAppStore.getState().library.savedArtists || [])
          .filter((card) => card.thumbnail)
          .slice(0, 24)
          .map((card) => ({
            id: card.browseId || card.id,
            name: card.title,
            thumbnail: card.thumbnail,
            subtitle: card.subtitle,
          }));
        if (saved.length >= 3) {
          setCandidates(saved);
          setError(null);
        } else {
          setError(cause?.message || 'Could not load artists.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleArtists = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return candidates;
    return candidates.filter(
      (artist) => artist.name.toLowerCase().includes(needle) || (artist.subtitle || '').toLowerCase().includes(needle),
    );
  }, [candidates, query]);

  const toggleLanguage = (id: string) => {
    setLanguages((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  };

  const toggleGenre = (id: string) => {
    setGenres((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
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

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateSettings({
        tasteLanguages: languages,
        tasteGenres: genres,
        tasteArtists: artists,
        onboardingComplete: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const note =
    step === 1
      ? languages.length
        ? `${languages.length} ${languages.length === 1 ? 'language' : 'languages'} selected`
        : 'Choose at least one language to continue.'
      : loading
        ? 'Finding artists in the languages you picked…'
        : artists.length >= 3
          ? `${artists.length} of ${MAX_TASTE_ARTISTS} artists selected`
          : 'Choose at least 3 artists for better recommendations.';

  return (
    <div className="onboard-taste">
      <div className="onboard-logo-bg" aria-hidden="true">
        <img src="./icon.png" alt="" draggable={false} />
      </div>
      <div className="onboard-taste-inner">
        <header className="onboard-taste-head">
          <div className="onboard-brand-row">
            <img src="./icon.png" alt="" draggable={false} />
            <div><strong>Auralis</strong><span>Music, your way</span></div>
          </div>
          <div className="onboard-progress" aria-label={`Step ${step} of 2`}>
            <i className={step === 1 ? 'is-on' : 'is-done'} />
            <i className={step === 2 ? 'is-on' : ''} />
            <span>Step {step} of 2</span>
          </div>
          {step === 2 ? (
            <button type="button" className="onboard-back" onClick={() => setStep(1)} disabled={saving}>
              <ArrowLeft size={16} /> Back
            </button>
          ) : null}
        </header>

        <section className="onboard-taste-copy">
          <span className="onboard-kicker">
            <Sparkles size={13} /> {step === 1 ? 'Set the tone' : 'Make it yours'}
          </span>
          <h1>{step === 1 ? 'Which languages do you listen in?' : 'Who do you want on repeat?'}</h1>
          <p>
            {step === 1
              ? 'Pick every language you enjoy. We use them to find artists that belong on your Home shelf.'
              : 'Choose at least 3 artists. Your picks shape your recommendations and can be changed any time.'}
          </p>
        </section>

        <div className="onboard-taste-scroll">
          {step === 1 ? (
            <>
              <div className="onboard-language-grid">
                {orderedLanguages.map((language) => {
                  const selected = languages.includes(language.id);
                  const cover = covers[language.id];
                  return (
                    <button
                      type="button"
                      key={language.id}
                      className={`onboard-language ${selected ? 'is-selected' : ''}`}
                      aria-pressed={selected}
                      onClick={() => toggleLanguage(language.id)}
                      style={cover ? { backgroundImage: `linear-gradient(180deg, rgba(5,5,8,.18), rgba(5,5,8,.88)), url(${cover})` } : undefined}
                    >
                      <span className="onboard-language-name">
                        <strong>{language.native}</strong>
                        <small>{language.label} · {language.area}</small>
                      </span>
                      <span className="onboard-check" aria-hidden="true">{selected ? <Check size={14} /> : null}</span>
                    </button>
                  );
                })}
              </div>
              <div className="onboard-genres">
                <span className="onboard-section-label">Genres you enjoy</span>
                <div className="onboard-genre-chips">
                  {ONBOARDING_GENRES.map((genre) => (
                    <button
                      type="button"
                      key={genre.id}
                      className={genres.includes(genre.id) ? 'is-selected' : ''}
                      aria-pressed={genres.includes(genre.id)}
                      onClick={() => toggleGenre(genre.id)}
                    >
                      {genre.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {!loading && !error && candidates.length > 0 ? (
                <div className="onboard-artist-search">
                  <Search size={16} />
                  <input
                    type="text"
                    value={query}
                    placeholder="Search artists"
                    aria-label="Search artists"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  {query ? (
                    <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={15} /></button>
                  ) : null}
                </div>
              ) : null}
              {loading ? (
                <div className="onboard-artist-grid is-loading" aria-label="Loading artists">
                  {Array.from({ length: 12 }).map((_, index) => (
                    <div className="onboard-artist-skeleton" key={index}><span /><i /><i /></div>
                  ))}
                </div>
              ) : error ? (
                <div className="onboard-error" role="alert">
                  <AlertTriangle size={18} />
                  <div><strong>Artists did not load</strong><span>{error}</span></div>
                  <button type="button" onClick={() => setRetryKey((value) => value + 1)}>Try again</button>
                </div>
              ) : (
                <div className="onboard-artist-grid">
                  {visibleArtists.map((artist) => {
                    const selected = artists.some((saved) => isSameArtist(saved, artist));
                    return (
                      <button
                        type="button"
                        key={`${artist.id}-${artist.name}`}
                        className={`onboard-artist ${selected ? 'is-selected' : ''}`}
                        aria-pressed={selected}
                        onClick={() => toggleArtist(artist)}
                      >
                        <span className="onboard-artist-art">
                          <Artwork src={artist.thumbnail} alt={artist.name} round />
                          <span className="onboard-check">{selected ? <Check size={14} /> : null}</span>
                        </span>
                        <strong>{artist.name}</strong>
                        <small>{artistMeta(artist.subtitle)}</small>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <footer className="onboard-taste-footer">
          <p>{note}</p>
          {step === 1 ? (
            <button type="button" className="onboard-primary" disabled={!languages.length} onClick={() => setStep(2)}>
              Continue <ArrowRight size={17} />
            </button>
          ) : (
            <button
              type="button"
              className="onboard-primary"
              disabled={saving || artists.length < 3}
              onClick={() => void finish()}
            >
              {saving ? <Loader2 size={17} className="spin" /> : <Check size={17} />}
              {saving ? 'Saving…' : 'Finish setup'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
