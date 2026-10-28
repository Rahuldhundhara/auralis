import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Languages, LocateFixed, RefreshCw, Search, Settings2 } from 'lucide-react';
import type { LyricsLine, LyricsResult, Track } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { Button, EmptyState, IconButton, Spinner } from './primitives';

function activeLineIndex(lines: LyricsLine[], position: number): number {
  if (!lines.length || !lines.some((line) => line.time > 0)) return -1;
  let active = -1;
  for (let index = 0; index < lines.length; index++) {
    if (lines[index].time <= position + 0.12) active = index;
    else break;
  }
  return active;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  const value = String(error ?? '').trim();
  return value || 'The translation service did not return a usable response.';
}

export function LyricsPanel({ track, active = true }: { track?: Track; active?: boolean }) {
  const position = usePlayerStore((state) => state.position);
  const settings = useAppStore((state) => state.settings);
  const navigate = useNavStore((state) => state.navigate);
  const [result, setResult] = useState<LyricsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [translations, setTranslations] = useState<string[]>([]);
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | undefined>();
  const [showTranslation, setShowTranslation] = useState(true);
  const [follow, setFollow] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const autoTranslatedRef = useRef('');
  const loadRequest = useRef(0);
  const translateRequest = useRef(0);

  const load = async (force = false) => {
    if (!track) return;
    const token = ++loadRequest.current;
    setLoading(true);
    setError(undefined);
    setTranslations([]);
    setTranslationError(undefined);
    setShowTranslation(true);
    autoTranslatedRef.current = '';
    translateRequest.current += 1;
    try {
      const data = await window.auralis.lyrics.fetch(track, undefined, force);
      if (token !== loadRequest.current) return;
      setResult(data);
      setFollow(true);
    } catch (err: any) {
      if (token !== loadRequest.current) return;
      setError(err?.message || 'Could not load lyrics.');
    } finally {
      if (token === loadRequest.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!active || !track) return;
    setResult(null);
    void load();
    return () => {
      loadRequest.current += 1;
      translateRequest.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, track?.id]);

  const index = useMemo(() => (result ? activeLineIndex(result.lines, position) : -1), [result, position]);
  const synced = Boolean(result?.synced);

  useEffect(() => {
    if (!follow || index < 0) return;
    const container = scrollRef.current;
    const element = activeRef.current;
    if (!container || !element) return;
    const target = element.offsetTop - container.clientHeight / 2 + element.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [index, follow]);

  const translationReady =
    settings.translation.provider === 'deepl'
      ? Boolean(settings.translation.deeplApiKey.trim())
      : Boolean(settings.translation.openaiApiKey.trim());

  const translate = async () => {
    if (!result) return;
    if (!translationReady) {
      setTranslationError('Add a DeepL API key or an OpenAI-compatible key in Settings → Lyrics, then try again.');
      return;
    }
    const token = ++translateRequest.current;
    setTranslating(true);
    setTranslationError(undefined);
    try {
      const response = await window.auralis.lyrics.translate(
        result.lines.map((line) => line.text),
        settings.translation.targetLanguage,
      );
      if (token !== translateRequest.current) return;
      const lines = response.lines.map((line) => String(line ?? '').trim());
      if (lines.length !== result.lines.length) {
        throw new Error(
          `The provider returned ${lines.length} translated lines for ${result.lines.length} lyric lines, so they cannot be aligned safely. Try again or use a different provider.`,
        );
      }
      setTranslations(lines);
      setShowTranslation(true);
    } catch (err) {
      if (token !== translateRequest.current) return;
      setTranslationError(errorMessage(err));
    } finally {
      if (token === translateRequest.current) setTranslating(false);
    }
  };

  // A new track/provider/language always starts from a clean translation state.
  useEffect(() => {
    translateRequest.current += 1;
    setTranslations([]);
    setTranslationError(undefined);
    setShowTranslation(true);
    autoTranslatedRef.current = '';
  }, [
    track?.id,
    settings.translation.provider,
    settings.translation.targetLanguage,
    settings.translation.openaiBaseUrl,
    settings.translation.openaiModel,
  ]);

  useEffect(() => {
    if (!result?.lines.length || !translationReady || !settings.translation.enabled) return;
    if (translations.length || translating) return;
    const marker = `${track?.id || ''}:${settings.translation.provider}:${settings.translation.targetLanguage}`;
    if (autoTranslatedRef.current === marker) return;
    autoTranslatedRef.current = marker;
    void translate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    result,
    translations.length,
    translating,
    translationReady,
    settings.translation.enabled,
    settings.translation.provider,
    settings.translation.targetLanguage,
    track?.id,
  ]);

  if (!track) {
    return (
      <EmptyState
        icon={<LocateFixed size={26} />}
        title="Nothing playing"
        message="Start a song and its lyrics will appear here."
      />
    );
  }

  return (
    <div className="lyrics-panel">
      <div className="lyrics-toolbar">
        <div className="lyrics-meta">
          {result?.provider ? <span className="lyrics-provider">{result.provider}</span> : null}
          {result && !synced ? <span className="lyrics-provider is-muted">Unsynced</span> : null}
        </div>
        <div className="lyrics-actions">
          {synced && !follow ? (
            <Button variant="ghost" size="sm" icon={<LocateFixed size={15} />} onClick={() => setFollow(true)}>
              Follow
            </Button>
          ) : null}
          {translations.length ? (
            <div className="lyrics-language-toggle" role="group" aria-label="Lyrics language">
              <button
                type="button"
                aria-pressed={!showTranslation}
                className={!showTranslation ? 'is-active' : ''}
                onClick={() => setShowTranslation(false)}
              >
                Original
              </button>
              <button
                type="button"
                aria-pressed={showTranslation}
                className={showTranslation ? 'is-active' : ''}
                onClick={() => setShowTranslation(true)}
              >
                Translated
              </button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              icon={translating ? <Spinner size={15} /> : <Languages size={15} />}
              onClick={() => void translate()}
              disabled={translating || !result}
              title={
                translationReady
                  ? settings.translation.provider === 'deepl'
                    ? 'Translate with DeepL'
                    : 'Translate with OpenAI'
                  : 'Configure a translation provider in Settings → Lyrics'
              }
            >
              Translate
            </Button>
          )}
          <IconButton label="Refresh lyrics" size="sm" onClick={() => void load(true)} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </IconButton>
        </div>
      </div>

      {!translationReady && result ? (
        <div className="lyrics-translation-note">
          <AlertCircle size={14} />
          <span>
            Translation needs a DeepL or OpenAI-compatible key. No lyrics are uploaded until you translate.
          </span>
          <button
            type="button"
            className="text-button"
            onClick={() => navigate({ page: 'settings', tab: 'lyrics' })}
          >
            <Settings2 size={13} /> Set up
          </button>
        </div>
      ) : null}

      {translationError ? (
        <div className="lyrics-translation-error" role="alert">
          <AlertCircle size={14} />
          <span>{translationError}</span>
          <button type="button" className="text-button" onClick={() => void translate()} disabled={translating}>
            {translating ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      ) : null}

      {translating ? (
        <div className="lyrics-translation-status" role="status">
          <Spinner size={13} /> Translating lyrics…
        </div>
      ) : null}

      {loading ? (
        <div className="lyrics-loading">
          <Spinner size={22} />
          <span>Finding lyrics…</span>
        </div>
      ) : error ? (
        <EmptyState
          icon={<Search size={24} />}
          title="Lyrics unavailable"
          message={error}
          compact
          action={
            <Button variant="outline" size="sm" onClick={() => void load(true)}>
              Try again
            </Button>
          }
        />
      ) : !result ? (
        <EmptyState
          icon={<Search size={24} />}
          title="No lyrics found"
          message="Try adding or reordering providers in Settings → Lyrics, or search the web for this song."
          compact
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void window.auralis.app.openExternal(
                  `https://www.google.com/search?q=${encodeURIComponent(`${track.title} ${track.artists.map((a) => a.name).join(' ')} lyrics`)}`,
                )
              }
            >
              Search the web
            </Button>
          }
        />
      ) : (
        <div
          ref={scrollRef}
          className={`lyrics-scroll ${synced ? 'is-synced' : 'is-plain'}`}
          onWheel={() => {
            if (synced) setFollow(false);
          }}
          onTouchMove={() => {
            if (synced) setFollow(false);
          }}
        >
          <div className="lyrics-spacer" />
          {result.lines.map((line, lineIndex) => {
            const isActive = lineIndex === index;
            return (
              <div
                key={`${line.time}-${lineIndex}`}
                ref={isActive ? activeRef : undefined}
                className={`lyric-line ${isActive ? 'is-active' : ''} ${line.background ? 'is-background' : ''} ${line.agent ? 'has-agent' : ''}`}
                role={synced ? 'button' : undefined}
                tabIndex={synced ? 0 : undefined}
                onClick={() => {
                  if (synced) usePlayerStore.getState().seek(Math.max(0, line.time - 0.1));
                }}
                onKeyDown={(event) => {
                  if (!synced || (event.key !== 'Enter' && event.key !== ' ')) return;
                  event.preventDefault();
                  usePlayerStore.getState().seek(Math.max(0, line.time - 0.1));
                }}
              >
                {line.agent ? <span className="lyric-agent">{line.agent}</span> : null}
                <span className="lyric-text">
                  {line.words?.length && isActive
                    ? line.words.map((word, wordIndex) => (
                        <span
                          key={`${word.text}-${wordIndex}`}
                          className={
                            word.start <= position && word.end >= position
                              ? 'lyric-word is-active'
                              : word.end < position
                                ? 'lyric-word is-sung'
                                : 'lyric-word'
                          }
                        >
                          {word.text}
                        </span>
                      ))
                    : line.text || '♪'}
                </span>
                {line.romanized ? <span className="lyric-romanized">{line.romanized}</span> : null}
                {showTranslation && line.translation ? (
                  <span className="lyric-translation">{line.translation}</span>
                ) : null}
                {showTranslation && translations[lineIndex] ? (
                  <span className="lyric-translation">{translations[lineIndex]}</span>
                ) : null}
              </div>
            );
          })}
          <div className="lyrics-spacer" />
          <div className="lyrics-credit">
            Lyrics from {result.provider}
            {translations.length && showTranslation
              ? ` · Translated with ${settings.translation.provider === 'deepl' ? 'DeepL' : 'OpenAI'}`
              : ''}
          </div>
        </div>
      )}
    </div>
  );
}
