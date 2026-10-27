import { useEffect, useMemo, useRef, useState } from 'react';
import { Languages, LocateFixed, RefreshCw, Search } from 'lucide-react';
import type { LyricsLine, LyricsResult, Track } from '@shared/types';
import { useAppStore } from '../stores/app';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { toast } from '../stores/ui';
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

export function LyricsPanel({ track, active = true }: { track?: Track; active?: boolean }) {
  const position = usePlayerStore((state) => state.position);
  const settings = useAppStore((state) => state.settings);
  const [result, setResult] = useState<LyricsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [translations, setTranslations] = useState<string[]>([]);
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | undefined>();
  const [view, setView] = useState<'both' | 'original' | 'translated'>('both');
  const [follow, setFollow] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const autoTranslatedRef = useRef('');
  const loadRequestRef = useRef(0);
  const translateRequestRef = useRef(0);

  const load = async () => {
    if (!track) return;
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(undefined);
    setTranslationError(undefined);
    setTranslations([]);
    autoTranslatedRef.current = '';
    try {
      const data = await window.auralis.lyrics.fetch(track);
      if (requestId !== loadRequestRef.current) return;
      setResult(data);
      setFollow(true);
    } catch (err: any) {
      if (requestId !== loadRequestRef.current) return;
      setError(err?.message || 'Could not load lyrics.');
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!active || !track) return;
    setResult(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, track?.id, track?.title]);

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

  const translate = async () => {
    if (!result || translating) return;
    const requestId = ++translateRequestRef.current;
    setTranslating(true);
    setTranslationError(undefined);
    try {
      const response = await window.auralis.lyrics.translate(
        result.lines.map((line) => line.text),
        settings.translation.targetLanguage,
      );
      if (requestId !== translateRequestRef.current) return;
      if (!response.lines.length) throw new Error('The translator returned no lyrics.');
      setTranslations(response.lines);
      setView('both');
      toast(`Translated with ${response.provider}.`, 'success');
    } catch (err: any) {
      if (requestId !== translateRequestRef.current) return;
      const message = err?.message || String(err);
      setTranslationError(message);
      toast(`Translation failed: ${message}`, 'error');
    } finally {
      if (requestId === translateRequestRef.current) setTranslating(false);
    }
  };

  const translationReady =
    settings.translation.enabled &&
    (settings.translation.provider === 'deepl'
      ? Boolean(settings.translation.deeplApiKey.trim())
      : Boolean(settings.translation.openaiApiKey.trim()));

  useEffect(() => {
    if (!result?.lines.length || !translationReady) return;
    const marker = `${track?.id || ''}:${settings.translation.provider}:${settings.translation.targetLanguage}`;
    if (translations.length) {
      autoTranslatedRef.current = marker;
      return;
    }
    if (translating || autoTranslatedRef.current === marker) return;
    autoTranslatedRef.current = marker;
    void translate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    result,
    translations.length,
    translating,
    translationReady,
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
            <>
              <div className="lyrics-view-toggle" role="group" aria-label="Lyrics language view">
                {(['original', 'both', 'translated'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={view === mode ? 'is-active' : ''}
                    aria-pressed={view === mode}
                    onClick={() => setView(mode)}
                  >
                    {mode === 'original' ? 'Original' : mode === 'both' ? 'Both' : 'Translated'}
                  </button>
                ))}
              </div>
              <IconButton
                label="Hide translation"
                size="sm"
                active
                onClick={() => {
                  translateRequestRef.current++;
                  setTranslations([]);
                  setTranslationError(undefined);
                  setTranslating(false);
                  setView('both');
                }}
              >
                <Languages size={17} />
              </IconButton>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              icon={translating ? <Spinner size={15} /> : <Languages size={15} />}
              onClick={() => void translate()}
              disabled={translating || !result}
              title={settings.translation.provider === 'deepl' ? 'Translate with DeepL' : 'Translate with OpenAI'}
            >
              {translating ? 'Translating…' : translationError ? 'Retry translation' : 'Translate'}
            </Button>
          )}
          <IconButton label="Refresh lyrics" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </IconButton>
        </div>
      </div>

      {translationError ? (
        <div className="lyrics-translation-error" role="status">
          <span>{translationError}</span>
          <button type="button" className="text-button" onClick={() => void translate()} disabled={translating}>
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="lyrics-loading">
          <Spinner size={22} />
          <span>Finding lyrics…</span>
        </div>
      ) : error ? (
        <EmptyState icon={<Search size={24} />} title="Lyrics unavailable" message={error} compact />
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
        >
          <div className="lyrics-spacer" />
          {result.lines.map((line, lineIndex) => {
            const isActive = lineIndex === index;
            const translation = line.translation || translations[lineIndex] || '';
            const showOriginal = view !== 'translated' || !translation;
            return (
              <div
                key={`${line.time}-${lineIndex}`}
                ref={isActive ? activeRef : undefined}
                className={`lyric-line ${isActive ? 'is-active' : ''} ${line.background ? 'is-background' : ''} ${line.agent ? 'has-agent' : ''}`}
                onClick={() => {
                  if (synced) usePlayerStore.getState().seek(Math.max(0, line.time - 0.1));
                }}
              >
                {line.agent ? <span className="lyric-agent">{line.agent}</span> : null}
                {showOriginal ? (
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
                ) : null}
                {line.romanized && showOriginal ? <span className="lyric-romanized">{line.romanized}</span> : null}
                {translation && view !== 'original' ? (
                  <span className={`lyric-translation ${view === 'translated' ? 'is-primary' : ''}`}>{translation}</span>
                ) : null}
              </div>
            );
          })}
          <div className="lyrics-spacer" />
          <div className="lyrics-credit">
            Lyrics from {result.provider}
            {!settings.translation.enabled && translations.length === 0
              ? ' · Add a translation provider in Settings → Lyrics'
              : ''}
          </div>
        </div>
      )}
    </div>
  );
}
