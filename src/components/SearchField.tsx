import { useEffect, useRef, useState } from 'react';
import { Clock3, Mic, Search, Square, X } from 'lucide-react';
import type { SearchSuggestion } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { toast } from '../stores/ui';
import { useVoiceSearch } from '../lib/useVoiceSearch';
import { IconButton, Spinner } from './primitives';

export function SearchField({
  autoFocus,
  large,
  onSubmitted,
  onActivate,
  activateOnFocus = false,
}: {
  autoFocus?: boolean;
  large?: boolean;
  onSubmitted?: () => void;
  onActivate?: () => void;
  activateOnFocus?: boolean;
}) {
  const route = useNavStore((state) => state.entries[state.index]);
  const navigate = useNavStore((state) => state.navigate);
  const history = useAppStore((state) => state.library.searchHistory);
  const [value, setValue] = useState(route.page === 'search' ? route.q || '' : '');
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const voice = useVoiceSearch((text) => {
    setValue(text);
    setOpen(true);
    setActiveIndex(-1);
    inputRef.current?.focus();
  });

  useEffect(() => {
    if (route.page === 'search') setValue(route.q || '');
  }, [route.page === 'search' ? route.q : null]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!voice.error) return;
    toast(voice.error, 'error');
    voice.clearError();
  }, [voice.error, voice.clearError]);

  useEffect(() => {
    // Leaving the search surface must never leave the microphone open.
    voice.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.page, route.page === 'search' ? route.q : null]);

  useEffect(() => {
    const query = value.trim();
    if (!query) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await window.auralis.yt.searchSuggestions(query);
        if (!cancelled) setSuggestions(result);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, open]);

  const submit = (query: string) => {
    const q = query.trim();
    if (!q) return;
    navigate({ page: 'search', q });
    setOpen(false);
    inputRef.current?.blur();
    onSubmitted?.();
  };

  const activate = () => {
    if (activateOnFocus && route.page !== 'search') onActivate?.();
  };

  const items = value.trim()
    ? suggestions.map((item) => item.text)
    : history.slice(0, 7);
  const heading = value.trim() ? 'Suggestions' : history.length ? 'Recent searches' : '';

  return (
    <div
      ref={wrapRef}
      className={`search-field ${large ? 'is-large' : ''} ${open ? 'is-open' : ''}`}
      onClick={() => {
        inputRef.current?.focus();
        activate();
      }}
    >
      <Search size={large ? 20 : 17} className="search-icon" />
      <input
        ref={inputRef}
        value={value}
        placeholder="Search songs, albums, artists, podcasts"
        spellCheck={false}
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => {
          setOpen(true);
          activate();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((index) => Math.min(items.length - 1, index + 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => Math.max(-1, index - 1));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            submit(activeIndex >= 0 && items[activeIndex] ? items[activeIndex] : value);
          } else if (event.key === 'Escape') {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        aria-label="Search"
      />
      {loading ? <Spinner size={16} className="search-spinner" /> : null}
      <IconButton
        label={
          voice.transcribing
            ? 'Transcribing voice search'
            : voice.recording
              ? 'Stop voice search'
              : 'Search with your voice'
        }
        size="xs"
        className={`search-mic ${voice.recording ? 'is-recording' : ''}`}
        disabled={voice.transcribing}
        onClick={(event) => {
          event.stopPropagation();
          if (voice.recording) voice.stop();
          else void voice.start();
        }}
      >
        {voice.transcribing ? <Spinner size={15} /> : voice.recording ? <Square size={13} fill="currentColor" /> : <Mic size={15} />}
      </IconButton>
      {value ? (
        <IconButton
          label="Clear search"
          size="xs"
          className="search-clear"
          onClick={() => {
            setValue('');
            inputRef.current?.focus();
          }}
        >
          <X size={15} />
        </IconButton>
      ) : null}
      {open && (items.length > 0 || loading) ? (
        <div className="search-popover">
          {heading ? <div className="search-popover-title">{heading}</div> : null}
          {items.map((item, index) => (
            <button
              type="button"
              key={`${item}-${index}`}
              className={`search-suggestion ${activeIndex === index ? 'is-active' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => submit(item)}
            >
              {value.trim() ? <Search size={15} /> : <Clock3 size={15} />}
              <span>{item}</span>
            </button>
          ))}
          {!items.length && loading ? <div className="search-empty-line">Looking for suggestions…</div> : null}
        </div>
      ) : null}
    </div>
  );
}
