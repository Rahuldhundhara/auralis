import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Clock3, Search, X } from 'lucide-react';
import type { SearchSuggestion } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { IconButton, Spinner } from './primitives';
import { taglinesForTrack } from '../lib/vibeTagline';

const VIBE_TAGLINES = [
  'Lost in the rhythm...',
  'Let the music find you.',
  'Your mood. Your music.',
  'Find your next favourite song.',
  'Some songs just understand.',
  'Discover sounds beyond the ordinary.',
  'A new vibe is waiting.',
  'Press play. Feel everything.',
  "What's your next soundtrack?",
  'Every mood has a melody.',
];

export function SearchField({
  autoFocus,
  large,
  onSubmitted,
  onActivate,
  activateOnFocus = false,
  trailing,
}: {
  autoFocus?: boolean;
  large?: boolean;
  onSubmitted?: () => void;
  onActivate?: () => void;
  activateOnFocus?: boolean;
  trailing?: ReactNode;
}) {
  const route = useNavStore((state) => state.entries[state.index]);
  const navigate = useNavStore((state) => state.navigate);
  const history = useAppStore((state) => state.library.searchHistory);
  const currentTrack = usePlayerStore((state) => state.current);
  const [value, setValue] = useState(route.page === 'search' ? route.q || '' : '');
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [taglineIndex, setTaglineIndex] = useState(() => Math.floor(Math.random() * VIBE_TAGLINES.length));
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  const taglinePool = currentTrack ? taglinesForTrack(currentTrack) : VIBE_TAGLINES;
  const activeTagline = taglinePool[taglineIndex % taglinePool.length];
  const [tagView, setTagView] = useState<{ current: string; previous: string | null; tick: number }>(() => ({
    current: activeTagline,
    previous: null,
    tick: 0,
  }));

  useEffect(() => {
    setTagView((prev) =>
      prev.current === activeTagline
        ? prev
        : { current: activeTagline, previous: prev.current, tick: prev.tick + 1 },
    );
  }, [activeTagline]);

  useEffect(() => {
    if (!tagView.previous) return;
    const timer = window.setTimeout(() => {
      setTagView((prev) => (prev.previous ? { ...prev, previous: null } : prev));
    }, 560);
    return () => window.clearTimeout(timer);
  }, [tagView.previous, tagView.tick]);

  useEffect(() => {
    setTaglineIndex(0);
  }, [currentTrack?.id]);

  useEffect(() => {
    if (open || focused || value.trim()) return;
    const timer = window.setInterval(() => {
      setTaglineIndex((i) => (i + 1) % taglinePool.length);
    }, 3500);
    return () => window.clearInterval(timer);
  }, [taglinePool, open, focused, value]);

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
  const showTagline = !open && !focused && !value.trim();

  return (
    <div
      ref={wrapRef}
      className={`search-field ${large ? 'is-large' : ''} ${open || focused ? 'is-open' : ''}`}
      onClick={(event) => {
        event.stopPropagation();
        inputRef.current?.focus();
        activate();
      }}
    >
      <Search size={large ? 20 : 17} className="search-icon" />
      {/* Rotating music tagline — only shown while idle */}
      {showTagline ? (
        <div className="search-tagline" aria-hidden="true">
          {tagView.previous ? (
            <span key={`out-${tagView.tick}`} className="tagline-out">
              {tagView.previous}
            </span>
          ) : null}
          <span key={`in-${tagView.tick}`} className="tagline-in">
            {tagView.current}
          </span>
        </div>
      ) : null}
      <input
        ref={inputRef}
        value={value}
        placeholder=""
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => {
          setFocused(true);
          setOpen(true);
          activate();
        }}
        onBlur={() => setFocused(false)}
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
            setFocused(false);
            inputRef.current?.blur();
          }
        }}
        aria-label="Search"
      />
      {loading ? <Spinner size={16} className="search-spinner" /> : null}
      {value ? (
        <IconButton
          label="Clear search"
          size="xs"
          className="search-clear"
          onClick={() => {
            setValue('');
            setOpen(true);
            inputRef.current?.focus();
          }}
        >
          <X size={15} />
        </IconButton>
      ) : null}
      {trailing}
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
