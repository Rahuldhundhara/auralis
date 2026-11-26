import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Check, Languages, LocateFixed, RefreshCw, Search } from 'lucide-react';
import type { LyricsLine, LyricsResult, Track } from '@shared/types';
import { useAppStore } from '../stores/app';
import { getAudioPosition, isSeeking, usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { toast } from '../stores/ui';
import { fetchLyrics, peekLyrics } from '../lib/lyricsCache';
import { Button, EmptyState, IconButton, Spinner } from './primitives';

function activeLineIndex(lines: LyricsLine[], position: number): number {
  if (!lines.length || !lines.some((line) => line.time > 0)) return -1;
  let active = -1;
  for (let index = 0; index < lines.length; index++) {
    // A tiny lead only compensates for the 40ms render cadence. Word-level
    // timing below uses the exact audio timestamp.
    if (lines[index].time <= position + 0.03) active = index;
    else break;
  }
  return active;
}

const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/;

/** True when the provider marked a word boundary after this word. */
function hasExplicitSpaces(words: NonNullable<LyricsLine['words']>): boolean {
  return words.some((word) => word.space === true);
}

/** Some providers split words without keeping the spaces. Restore them when
 *  rendering so cached lyrics never collapse into one long line. */
function wordNeedsSpace(words: NonNullable<LyricsLine['words']>, index: number): boolean {
  const previous = words[index - 1];
  const next = words[index];
  if (!previous || !next) return false;
  // Trust explicit boundaries exclusively when the provider gives them.
  if (hasExplicitSpaces(words)) return Boolean(previous.space);
  const prev = previous.text;
  const nextText = next.text;
  if (!prev || !nextText) return false;
  if (/\s$/.test(prev) || /^\s/.test(nextText)) return false;
  // Punctuation attaches to the word before it; opening brackets attach after.
  if (/^[,.;:!?%)\]}\u2019\u201d]/.test(nextText)) return false;
  if (/[(\[{\u2018\u201c]$/.test(prev)) return false;
  // CJK scripts do not use inter-word spaces.
  if (CJK_RE.test(prev) || CJK_RE.test(nextText)) return false;
  return true;
}


export function LyricsPanel({ track, active = true }: { track?: Track; active?: boolean }) {
  const position = usePlayerStore((state) => state.position);
  const playing = usePlayerStore((state) => state.playing);
  const ended = usePlayerStore((state) => state.ended);
  const positionRef = useRef(position);
  positionRef.current = position;
  const settings = useAppStore((state) => state.settings);
  const initialCache = peekLyrics(track);
  const [result, setResult] = useState<LyricsResult | null>(initialCache?.result ?? null);
  const [smoothPosition, setSmoothPosition] = useState(position);
  const [loading, setLoading] = useState(!initialCache);
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

  const load = async (force = false) => {
    if (!track) return;
    const requestId = ++loadRequestRef.current;
    if (!force) {
      const cached = peekLyrics(track);
      if (cached) {
        setResult(cached.result);
        setError(undefined);
        setLoading(false);
        setFollow(true);
        return;
      }
    }
    setLoading(true);
    setError(undefined);
    setTranslationError(undefined);
    setTranslations([]);
    autoTranslatedRef.current = '';
    try {
      const data = await fetchLyrics(track, force);
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
    loadRequestRef.current += 1;
    const cached = peekLyrics(track);
    setError(undefined);
    setTranslations([]);
    setTranslationError(undefined);
    autoTranslatedRef.current = '';
    if (cached) {
      setResult(cached.result);
      setLoading(false);
      setFollow(true);
      return;
    }
    setResult(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, track?.id, track?.title]);

  useEffect(() => {
    if (!active || !playing) {
      setSmoothPosition(positionRef.current);
      return;
    }
    let frame = 0;
    let last = 0;
    const tick = (time: number) => {
      // 10 Hz is enough for karaoke highlighting and avoids re-rendering the
      // panel 25 times a second while music is playing.
      if (time - last >= 100 && !document.hidden) {
        last = time;
        // The store position is the user's chosen timestamp during a seek and
        // the element's real position otherwise. When the two diverge (a seek
        // is still fetching its byte range), follow the store so the active
        // lyric jumps to the new timestamp immediately instead of waiting for
        // the audio element to catch up.
        // While a seek is in flight the element still reports the old
        // timestamp. Follow the store's optimistic target until the element
        // genuinely lands, then return to the real audio clock.
        const audioPos = getAudioPosition();
        const storePos = usePlayerStore.getState().position;
        const next = isSeeking() ? storePos : audioPos;
        setSmoothPosition((prev) => (Math.abs(prev - next) > 0.12 ? next : prev));
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [active, playing]);

  const playbackPosition = active && playing ? smoothPosition : position;
  const index = useMemo(
    () => (result ? activeLineIndex(result.lines, playbackPosition) : -1),
    [result, playbackPosition],
  );
  const synced = Boolean(result?.synced);

  // A seek is a large jump in the store position. Re-enable follow so the
  // lyrics immediately snap back to the new timestamp even if the user had
  // scrolled away earlier.
  const lastPositionRef = useRef(position);
  useEffect(() => {
    const jump = Math.abs(position - lastPositionRef.current);
    lastPositionRef.current = position;
    if (jump > 1.2) setFollow(true);
  }, [position]);

  useEffect(() => {
    if (!follow || index < 0) return;
    const container = scrollRef.current;
    const element = activeRef.current;
    if (!container || !element) return;
    // offsetTop is relative to the nearest positioned ancestor, which is not
    // necessarily the scroll container. Use client rects so the active line is
    // always centred even when the lyrics panel sits inside a dialog.
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const target =
      container.scrollTop +
      (elementRect.top - containerRect.top) -
      container.clientHeight * 0.4 +
      elementRect.height / 2;
    // Seeks can move the active line far away; snap instantly instead of
    // animating through every line in between. Normal playback stays smooth.
    const jump = Math.abs(target - container.scrollTop);
    container.scrollTo({
      top: Math.max(0, target),
      behavior: jump > container.clientHeight * 0.7 ? 'auto' : 'smooth',
    });
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
      <div className={`lyrics-toolbar ${!follow ? 'is-visible' : ''}`}>
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
          <IconButton label="Refresh lyrics" size="sm" onClick={() => void load(true)} disabled={loading}>
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
                className={`lyric-line ${isActive ? 'is-active' : ''} ${line.words?.length ? 'has-words' : ''} ${line.background ? 'is-background' : ''} ${line.agent ? 'has-agent' : ''}`}
                onClick={() => {
                  if (synced) usePlayerStore.getState().seek(Math.max(0, line.time - 0.1));
                }}
              >
                {line.agent ? <span className="lyric-agent">{line.agent}</span> : null}
                {showOriginal ? (
                  <span className="lyric-text">
                    {line.words?.length && isActive
                      ? (() => {
                          const words = line.words!;
                          const nextLineTime = result.lines[lineIndex + 1]?.time ?? line.time + 4;
                          return words.map((word, wordIndex) => {
                            const nextStart = words[wordIndex + 1]?.start ?? nextLineTime;
                            const start = word.start;
                            // Some providers omit word end times. Fall back to
                            // the next word (or the next line) so a word is
                            // never highlighted for the rest of the song.
                            const end = word.end > start ? word.end : Math.max(start + 0.12, nextStart);
                            const progress =
                              end > start
                                ? Math.min(1, Math.max(0, (playbackPosition - start) / (end - start)))
                                : playbackPosition >= start
                                  ? 1
                                  : 0;
                            const sung = playbackPosition >= end;
                            const current = playbackPosition >= start && playbackPosition < end;
                            return (
                              <span
                                key={`${word.text}-${wordIndex}`}
                                className={`lyric-word ${sung ? 'is-sung' : ''} ${current ? 'is-active' : ''}`}
                                style={{ '--word-progress': `${(progress * 100).toFixed(1)}%` } as CSSProperties}
                              >
                                {wordIndex > 0 && wordNeedsSpace(words, wordIndex) ? ' ' : null}
                                {word.text}
                              </span>
                            );
                          });
                        })()
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

      {ended ? (
        <div className="lyrics-ended" role="status" aria-live="polite">
          <span className="lyrics-ended-mark" aria-hidden="true">
            <Check size={16} />
          </span>
          <span className="lyrics-ended-copy">
            <strong>Song ended</strong>
            <span>Press play to listen again.</span>
          </span>
          <span className="lyrics-ended-bars" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
      ) : null}
    </div>
  );
}
