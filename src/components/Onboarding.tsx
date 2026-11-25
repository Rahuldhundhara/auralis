import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Search, Sparkles, X } from 'lucide-react';
import type { ArtistRef, Card } from '@shared/types';
import { useAppStore } from '../stores/app';
import { LANGUAGE_NAMES, type LanguageCode, t, tStep } from '../lib/i18n';
import { Artwork } from './primitives';
import { GenreGrid } from './GenreSelector';
import {
  ARTIST_CATEGORIES,
  getResolvedArtistArt,
  orderCatalogForPreferences,
  resolveArtistArt,
  resolveArtistArtBatch,
  type ArtistCategoryId,
  type CatalogArtist,
} from '../lib/artistCatalog';

const TOTAL_STEPS = 3;

/** Step 2 requires at least this many genres to continue (matches the
 *  reference onboarding design). */
const MIN_GENRES = 2;

const LANGUAGE_FLAGS: Record<string, string> = {
  en: '🇬🇧', hi: '🇮🇳', pa: '🇮🇳', ta: '🇮🇳', te: '🇮🇳', es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪', ja: '🇯🇵', ko: '🇰🇷',
  pt: '🇵🇹', ar: '🇸🇦', zh: '🇨🇳', ru: '🇷🇺', id: '🇮🇩', tr: '🇹🇷',
};

/** Native-script display names (second line of each language card). */
const LANGUAGE_NATIVE: Record<string, string> = {
  en: 'English', hi: 'हिन्दी', pa: 'ਪੰਜਾਬੀ', ta: 'தமிழ்', te: 'తెలుగు', es: 'Español', fr: 'Français',
  de: 'Deutsch', ja: '日本語', ko: '한국어', pt: 'Português', ar: 'العربية', zh: '中文', ru: 'Русский',
  id: 'Bahasa Indonesia', tr: 'Türkçe',
};

type Step = 1 | 2 | 3;

interface OnboardingProps {
  /** Called after preferences were saved (first-run) or the user closed (edit mode). */
  onComplete: () => void;
  /** True when opened from "Customize Taste" — prefill, close-without-saving allowed. */
  editing?: boolean;
}

export function Onboarding({ onComplete, editing = false }: OnboardingProps) {
  const update = useAppStore((state) => state.updateSettings);
  const savedPersonalization = useAppStore((state) => state.settings.personalization);

  const [step, setStep] = useState<Step>(1);
  const [selectedLanguages, setSelectedLanguages] = useState<LanguageCode[]>(() => [
    (savedPersonalization.uiLanguage || 'en') as LanguageCode,
  ]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(() => [
    ...(savedPersonalization.preferredGenres || []),
  ]);
  const [selectedArtists, setSelectedArtists] = useState<ArtistRef[]>(() => [
    ...(savedPersonalization.favoriteArtists || []),
  ]);
  const [activeCategory, setActiveCategory] = useState<ArtistCategoryId | 'all'>('all');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Card[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [curating, setCurating] = useState(false);
  const [artRev, setArtRev] = useState(0);
  const searchTimer = useRef<number | undefined>(undefined);
  const curateTimer = useRef<number | undefined>(undefined);

  // Dynamic UI language: the onboarding UI itself follows the first selected
  // language so users can preview the interface in their language immediately.
  const primaryLanguage = selectedLanguages[0] as LanguageCode;
  const stepLabel = () => tStep('onboarding.stepLabel', primaryLanguage, step, TOTAL_STEPS);

  const isLanguageSelected = (code: string) => selectedLanguages.includes(code as LanguageCode);
  const toggleLanguage = (code: string) => {
    setSelectedLanguages((prev) => (prev.includes(code as LanguageCode)
      ? prev.filter((c) => c !== code)
      : [...prev, code as LanguageCode]));
  };

  const isGenreSelected = (genre: string) => selectedGenres.includes(genre);
  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) => (prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]));
  };

  const isArtistSelected = (artist: ArtistRef) =>
    Boolean(artist.id) && selectedArtists.some((entry) => entry.id === artist.id);
  const toggleArtist = (artist: ArtistRef) => {
    if (!artist.id) return;
    setSelectedArtists((prev) => (isArtistSelected(artist)
      ? prev.filter((entry) => entry.id !== artist.id)
      : [...prev, { id: artist.id, name: artist.name }]));
  };

  /* --------------------------------------------------------------
   * Step 3: curated catalog + secondary search
   * -------------------------------------------------------------- */

  const orderedCatalog = orderCatalogForPreferences(selectedLanguages, selectedGenres);

  const catalogMatches = query.trim()
    ? orderedCatalog.filter((artist) => artist.name.toLowerCase().includes(query.trim().toLowerCase()))
    : orderedCatalog.filter(
        (artist) => activeCategory === 'all' || artist.category === activeCategory,
      );

  // Resolve real artwork for the visible batch (initials fallback until then).
  // Each artist bumps a throttled render as soon as its photo arrives, so the
  // grid fills in progressively instead of all at once after the whole batch.
  const visibleNames = catalogMatches.slice(0, 28).map((artist) => artist.name);
  useEffect(() => {
    if (step !== 3 || !visibleNames.length) return;
    let cancelled = false;
    let queued = false;
    const bump = () => {
      if (cancelled || queued) return;
      queued = true;
      window.setTimeout(() => {
        queued = false;
        if (!cancelled) setArtRev((value) => value + 1);
      }, 90);
    };
    void resolveArtistArtBatch(visibleNames, 8, bump);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, activeCategory, query, selectedLanguages.join(','), selectedGenres.join(',')]);

  // Warm the artist photos while the user is still choosing genres, so the
  // grid is already populated the moment step 3 opens.
  useEffect(() => {
    if (step < 2) return;
    const warm = orderedCatalog.slice(0, 28).map((artist) => artist.name);
    void resolveArtistArtBatch(warm, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Secondary path: supplement the catalog with live YTM search results so
  // artists outside the curated collection are still findable.
  const handleSearch = useCallback(async (nextQuery: string) => {
    if (!nextQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await window.auralis.yt.search(nextQuery, 'artists');
      setSearchResults(Array.isArray(results?.artists) ? results.artists : []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (step !== 3) return;
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      handleSearch(query);
    }, 320);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [query, handleSearch, step]);

  // Pre-resolve a curated artist's browse id when it first becomes selected so
  // the personalized "Your Favourite Artists" shelf can open the artist page.
  useEffect(() => {
    const last = selectedArtists[selectedArtists.length - 1];
    if (!last?.id || !last.id.startsWith('catalog:')) return;
    void resolveArtistArt(last.name).then((resolved) => {
      if (!resolved.browseId) return;
      setSelectedArtists((prev) => prev.map((artist) =>
        artist.id === last.id ? { ...artist, id: resolved.browseId as string } : artist,
      ));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedArtists.length]);

  useEffect(() => () => {
    if (curateTimer.current) window.clearTimeout(curateTimer.current);
  }, []);

  const goBack = () => {
    if (step === 1) return;
    setStep((step - 1) as Step);
  };

  const goNext = () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      if (selectedGenres.length < MIN_GENRES) return;
      setStep(3);
    } else {
      complete();
    }
  };

  const skipArtists = () => {
    if (step !== 3) return;
    complete();
  };

  const complete = async () => {
    if (saving || curating) return;
    setSaving(true);
    try {
      // Show the equalizer curation state FIRST, then persist. Saving first
      // would synchronously flip `onboardingCompleted` and unmount this card
      // before the transition could be seen.
      setCurating(true);
      curateTimer.current = window.setTimeout(() => {
        void (async () => {
          try {
            await update({
              personalization: {
                onboardingCompleted: true,
                preferredGenres: selectedGenres,
                favoriteArtists: selectedArtists.filter((artist) => artist.id),
                uiLanguage: primaryLanguage,
              },
            });
            onComplete();
          } catch (error: any) {
            console.error('[onboarding] failed to save preferences:', error);
          } finally {
            setSaving(false);
          }
        })();
      }, 1400);
    } catch (error: any) {
      console.error('[onboarding] failed to start curation:', error);
      setSaving(false);
    }
  };

  const canNext = step === 2 ? selectedGenres.length >= MIN_GENRES : true;

  // Merge catalog matches with live search results (deduped by name). Catalog
  // entries carry their resolved browse id / thumbnail when available.
  const searchNames = new Set(catalogMatches.map((artist) => artist.name.toLowerCase()));
  const liveExtras = query.trim()
    ? searchResults.filter((card) => !searchNames.has((card.title || '').toLowerCase()))
    : [];

  const catalogCard = (artist: CatalogArtist) => {
    const saved = selectedArtists.find(
      (entry) => entry.name.toLowerCase() === artist.name.toLowerCase(),
    );
    const resolvedArt = artist.thumbnail ? null : getResolvedArtistArt(artist.name);
    return {
      artist,
      thumbnail: artist.thumbnail || resolvedArt?.thumbnail,
      id: artist.browseId || resolvedArt?.browseId || `catalog:${artist.key}`,
      active: Boolean(saved),
    };
  };

  const curatingLanguages =
    selectedLanguages.map((code) => LANGUAGE_NAMES[code] || code).join(', ') ||
    LANGUAGE_NAMES.en;
  const curatingSubtitle = t('onboarding.curating.subtitle', primaryLanguage).replace(
    '{{languages}}',
    curatingLanguages,
  );

  return (
    <div
      className="onboarding-layer"
      role="dialog"
      aria-modal="true"
      aria-label={t('onboarding.title', primaryLanguage)}
    >
      <div className="onboarding-backdrop" aria-hidden="true" />
      <div className="onboarding-card">
        {editing && !curating ? (
          <button
            type="button"
            className="onboarding-close"
            aria-label="Close"
            onClick={onComplete}
          >
            <X size={16} />
          </button>
        ) : null}

        {/* Header — reference layout: step badge, title stack, progress bars */}
        <div className="onboarding-head">
          <span className="onboarding-step-badge">{stepLabel()}</span>
          <div className="onboarding-head-copy">
            <h1 className="onboarding-title">Welcome to Auralis</h1>
            <p className="onboarding-subtitle">{t('onboarding.subtitle', primaryLanguage)}</p>
          </div>
          <div className="onboarding-progress" key={artRev}>
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={`onboarding-progress-bar ${n <= step ? 'is-filled' : ''}`}
              />
            ))}
          </div>
        </div>

        {curating ? (
          <div className="onboarding-curating" role="status" aria-live="polite">
            <div className="onboarding-curating-glow" aria-hidden="true" />
            <div className="onboarding-curating-mark" aria-hidden="true">
              <Sparkles size={26} />
            </div>
            <div className="onboarding-curating-copy">
              <h2 className="onboarding-curating-title">
                {t('onboarding.curating.title', primaryLanguage)}
              </h2>
              <p className="onboarding-curating-sub">{curatingSubtitle}</p>
            </div>
            <div className="onboarding-curating-eq" aria-hidden="true">
              {Array.from({ length: 5 }).map((_, index) => (
                <span key={index} style={{ animationDelay: `${index * 0.12}s` }} />
              ))}
            </div>
            <div className="onboarding-curating-track" aria-hidden="true">
              <span />
            </div>
            <p className="onboarding-curating-hint">
              {t('onboarding.curating.hint', primaryLanguage)}
            </p>
          </div>
        ) : (
        /* Body */
        <div className="onboarding-body" key={step}>
          {step === 1 && (
            <>
              <h2>{t('onboarding.step.language', primaryLanguage)}</h2>
              <p className="onboarding-desc">{t('onboarding.language.description', primaryLanguage)}</p>
              <div className="onboarding-language-grid">
                {Object.entries(LANGUAGE_NAMES).map(([code, name]) => {
                  const active = isLanguageSelected(code);
                  return (
                    <button
                      key={code}
                      type="button"
                      className={`onboarding-language ${active ? 'is-active' : ''}`}
                      onClick={() => toggleLanguage(code)}
                      aria-pressed={active}
                    >
                      <span className="onboarding-language-flag">{LANGUAGE_FLAGS[code] || '🌐'}</span>
                      <div className="onboarding-language-text">
                        <span className="onboarding-language-name">{name}</span>
                        <span className="onboarding-language-native">{LANGUAGE_NATIVE[code] || code.toUpperCase()}</span>
                      </div>
                      {active ? <Check size={16} className="onboarding-language-check" /> : null}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <h2>{t('onboarding.step.genres', primaryLanguage)}</h2>
              <p className="onboarding-desc">{t('onboarding.genres.description', primaryLanguage)}</p>
              <GenreGrid selected={selectedGenres} onToggle={toggleGenre} />
              <p className={`onboarding-hint ${selectedGenres.length >= MIN_GENRES ? 'is-ready' : ''}`}>
                {selectedGenres.length >= MIN_GENRES
                  ? `${selectedGenres.length} selected`
                  : t('onboarding.genres.minimum', primaryLanguage)}
              </p>
            </>
          )}
          {step === 3 && (
            <>
              <h2>{t('onboarding.step.artists', primaryLanguage)}</h2>
              <p className="onboarding-desc">{t('onboarding.artists.description', primaryLanguage)}</p>

              {/* Category filter chips — secondary once searching */}
              {!query.trim() ? (
                <div className="onboarding-category-chips" role="tablist" aria-label="Artist categories">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeCategory === 'all'}
                    className={`chip ${activeCategory === 'all' ? 'is-selected' : ''}`}
                    onClick={() => setActiveCategory('all')}
                  >
                    For You
                  </button>
                  {ARTIST_CATEGORIES.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      role="tab"
                      aria-selected={activeCategory === category.id}
                      className={`chip ${activeCategory === category.id ? 'is-selected' : ''}`}
                      onClick={() => setActiveCategory(category.id)}
                    >
                      {category.label}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="onboarding-artist-search">
                <Search size={16} className="onboarding-search-icon" />
                <input
                  type="search"
                  className="onboarding-search-input"
                  placeholder={t('onboarding.artists.search.placeholder', primaryLanguage)}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  autoFocus
                />
                {searching ? <Search size={16} className="onboarding-search-spin" /> : null}
              </div>

              {/* Curated catalog — the primary selection surface */}
              <div className="onboarding-catalog-label">
                {query.trim()
                  ? t('onboarding.artists.curatedLabel', primaryLanguage)
                  : t('onboarding.artists.catalogLabel', primaryLanguage)}
              </div>
              <div className="onboarding-artist-grid">
                {catalogMatches.slice(0, 28).map((artist) => {
                  const { active, thumbnail, id } = catalogCard(artist);
                  return (
                    <button
                      key={artist.key}
                      type="button"
                      className={`onboarding-artist ${active ? 'is-active' : ''}`}
                      onClick={() => toggleArtist({ id, name: artist.name })}
                      aria-pressed={active}
                    >
                      <span className="onboarding-artist-face">
                        <Artwork src={thumbnail} alt={artist.name} round className="onboarding-artist-art" />
                        {active ? <span className="onboarding-artist-check" aria-hidden="true"><Check size={14} /></span> : null}
                      </span>
                      <span className="onboarding-artist-name">{artist.name}</span>
                      <span className="onboarding-artist-sub">
                        {ARTIST_CATEGORIES.find((c) => c.id === artist.category)?.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Live search extras — artists outside the curated collection */}
              {query.trim() && liveExtras.length ? (
                <>
                  <div className="onboarding-catalog-label onboarding-live-label">
                    {t('onboarding.artists.liveLabel', primaryLanguage)}
                  </div>
                  <div className="onboarding-artist-grid">
                    {liveExtras.slice(0, 12).map((card) => {
                      const id = card.browseId || card.id;
                      if (!id) return null;
                      const active = isArtistSelected({ id, name: card.title });
                      return (
                        <button
                          key={id}
                          type="button"
                          className={`onboarding-artist ${active ? 'is-active' : ''}`}
                          onClick={() => toggleArtist({ id, name: card.title })}
                          aria-pressed={active}
                        >
                          <span className="onboarding-artist-face">
                            <Artwork src={card.thumbnail} alt={card.title} round className="onboarding-artist-art" />
                            {active ? <span className="onboarding-artist-check" aria-hidden="true"><Check size={14} /></span> : null}
                          </span>
                          <span className="onboarding-artist-name">{card.title}</span>
                          <span className="onboarding-artist-sub">{card.subtitle || ''}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}

              {query.trim() && !catalogMatches.length && !liveExtras.length && !searching ? (
                <p className="onboarding-empty">{t('onboarding.artists.noResults', primaryLanguage)}</p>
              ) : null}
              {selectedArtists.length ? (
                <p className="onboarding-hint onboarding-artist-hint">
                  {selectedArtists.length} {t('onboarding.artists.selected', primaryLanguage)}
                </p>
              ) : null}
            </>
          )}
        </div>
        )}

        {/* Footer */}
        {!curating ? (
        <div className="onboarding-foot">
          <div className="onboarding-foot-left">
            <button
              type="button"
              className={`onboarding-nav onboarding-nav-back ${step === 1 ? 'is-hidden' : ''}`}
              disabled={step === 1 || saving}
              onClick={goBack}
            >
              <ArrowLeft size={15} />
              <span>{t('onboarding.button.back', primaryLanguage)}</span>
            </button>
            {step === 3 ? (
              <button
                type="button"
                className="onboarding-nav onboarding-nav-skip"
                onClick={skipArtists}
                disabled={saving}
              >
                {t('onboarding.button.skip', primaryLanguage)}
              </button>
            ) : null}
          </div>
          <div className="onboarding-foot-right">
            {saving ? <span className="onboarding-saving">{t('onboarding.button.complete', primaryLanguage)}…</span> : null}
            <button
              type="button"
              className="onboarding-nav onboarding-nav-primary"
              disabled={!canNext || saving}
              onClick={goNext}
            >
              <span>{step === 3 ? t('onboarding.button.done', primaryLanguage) : t('onboarding.button.next', primaryLanguage)}</span>
              <span className="onboarding-nav-arrow" aria-hidden="true">
                <ArrowRight size={15} />
              </span>
            </button>
          </div>
        </div>
        ) : null}
      </div>
    </div>
  );
}
