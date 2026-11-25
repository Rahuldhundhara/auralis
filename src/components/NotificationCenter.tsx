import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellOff, CheckCheck, RefreshCw, Sparkles } from 'lucide-react';
import type { Card, PersonalizationPreferences, Track } from '@shared/types';
import { useAppStore } from '../stores/app';
import { usePlayerStore } from '../stores/player';
import { openCard } from '../lib/actions';
import { Artwork, IconButton, Spinner } from './primitives';

type NotificationKind = 'release' | 'artist' | 'taste';

interface NotificationItem {
  id: string;
  kind: NotificationKind;
  label: string;
  title: string;
  subtitle?: string;
  meta?: string;
  thumbnail?: string;
  card?: Card;
  track?: Track;
}

function uniqueById(items: NotificationItem[]): NotificationItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

async function buildNotifications(prefs: PersonalizationPreferences): Promise<NotificationItem[]> {
  const genres = (prefs.preferredGenres || []).filter(Boolean);
  const favoriteArtists = (prefs.favoriteArtists || []).filter((artist) => artist?.name);

  // Only stable, real release sources are used so notification ids survive
  // restarts and never re-notify for a recommendation that drifted.
  const [releasePage, artistPages] = await Promise.all([
    window.auralis.yt.newReleases().catch(() => null),
    Promise.all(
      favoriteArtists.slice(0, 4).map((artist) =>
        artist?.id ? window.auralis.yt.artist(artist.id).catch(() => null) : Promise.resolve(null),
      ),
    ),
  ]);

  const items: NotificationItem[] = [];
  const push = (item: NotificationItem) => items.push(item);

  for (const shelf of releasePage?.shelves || []) {
    for (const card of shelf.items) {
      if (!card?.id || card.type === 'video') continue;
      if (!['album', 'single', 'ep', 'song', 'playlist', 'artist'].includes(card.type)) continue;
      const haystack = `${card.title} ${card.subtitle || ''}`.toLowerCase();
      const matchedArtist = favoriteArtists.find((artist) =>
        haystack.includes((artist.name || '').toLowerCase()),
      );
      const matchedGenre = genres.find((genre) => haystack.includes(String(genre).toLowerCase()));
      push({
        id: `release:${card.id}`,
        kind: matchedArtist ? 'artist' : matchedGenre ? 'taste' : 'release',
        label: matchedArtist
          ? `New from ${matchedArtist.name}`
          : matchedGenre
            ? `New in ${matchedGenre}`
            : card.type === 'song'
              ? 'New song'
              : 'New release',
        title: card.title,
        subtitle: card.subtitle,
        meta:
          card.year ||
          (card.type === 'single' ? 'Single' : card.type === 'ep' ? 'EP' : card.type === 'album' ? 'Album' : 'Song'),
        thumbnail: card.thumbnail,
        card,
      });
    }
  }

  artistPages.forEach((page, index) => {
    const artist = favoriteArtists[index];
    if (!artist) return;
    const latest = (page?.shelves || []).filter((shelf) => /latest|new|release/i.test(shelf.title || ''));
    const pool = latest.length ? latest.flatMap((shelf) => shelf.items) : (page?.shelves || []).flatMap((shelf) => shelf.items);
    const chosen = pool
      .filter((card) => ['album', 'single', 'ep'].includes(card.type) && card.id)
      .slice(0, 2);
    chosen.forEach((card) =>
      push({
        id: `release:${card.id}`,
        kind: 'artist',
        label: `New from ${artist.name}`,
        title: card.title,
        subtitle: artist.name,
        meta: card.year || (card.type === 'single' ? 'Single' : 'Album'),
        thumbnail: card.thumbnail,
        card,
      }),
    );
  });

  return uniqueById(items).slice(0, 24);
}

export function NotificationBell() {
  const ready = useAppStore((state) => state.ready);
  const personalization = useAppStore((state) => state.settings.personalization);
  const notificationsRead = useAppStore((state) => state.settings.notificationsRead);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const read = useMemo(() => new Set(notificationsRead || []), [notificationsRead]);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await buildNotifications(personalization);
      setItems(next);
    } catch (err: any) {
      setError(err?.message || 'Could not load new releases.');
    } finally {
      setLoading(false);
    }
  }, [personalization]);

  useEffect(() => {
    // Wait for settings (personalization + read state) to load from disk
    // before building notifications; otherwise the first render uses the
    // empty fallback profile and marks items read against it.
    if (!ready) return;
    void load();
  }, [ready, load]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const unread = useMemo(() => items.filter((item) => !read.has(item.id)).length, [items, read]);

  const saveRead = useCallback(
    (next: Set<string>) => {
      void updateSettings({ notificationsRead: Array.from(next).slice(-500) });
    },
    [updateSettings],
  );

  const markRead = (id: string) => {
    if (read.has(id)) return;
    const next = new Set(read);
    next.add(id);
    saveRead(next);
  };

  const markAllRead = () => {
    const next = new Set(read);
    items.forEach((item) => next.add(item.id));
    saveRead(next);
  };

  const openItem = (item: NotificationItem) => {
    markRead(item.id);
    setOpen(false);
    if (item.track) {
      usePlayerStore.getState().playQueue([item.track], 0);
      return;
    }
    if (item.card) openCard(item.card);
  };

  return (
    <div className="notification-center">
      <button
        ref={buttonRef}
        type="button"
        className={`top-bell ${open ? 'is-open' : ''} ${unread ? 'has-unread' : ''}`}
        onClick={() => setOpen((value) => !value)}
        title={unread ? `${unread} new notification${unread === 1 ? '' : 's'}` : 'Notifications'}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell size={17} />
        {unread ? <span className="top-bell-count">{unread > 9 ? '9+' : unread}</span> : null}
      </button>

      {open ? (
        <div className="notification-panel" ref={panelRef} role="dialog" aria-label="Notifications">
          <header className="notification-head">
            <div>
              <span className="eyebrow">
                <Sparkles size={12} /> What's new
              </span>
              <h2>New for you</h2>
            </div>
            <div className="notification-head-actions">
              <IconButton label="Refresh notifications" size="sm" onClick={() => void load()} disabled={loading}>
                <RefreshCw size={15} className={loading ? 'spin' : ''} />
              </IconButton>
              <button type="button" className="notification-mark-all" onClick={markAllRead} disabled={!unread}>
                <CheckCheck size={14} /> Mark all read
              </button>
            </div>
          </header>

          {loading && !items.length ? (
            <div className="notification-loading">
              <Spinner size={20} /> Checking for new releases…
            </div>
          ) : error && !items.length ? (
            <div className="notification-empty">
              <BellOff size={24} />
              <strong>Could not load notifications</strong>
              <span>{error}</span>
              <button type="button" onClick={() => void load()}>
                Try again
              </button>
            </div>
          ) : !items.length ? (
            <div className="notification-empty">
              <BellOff size={24} />
              <strong>You're all caught up</strong>
              <span>New releases from your favourite artists and genres will appear here.</span>
            </div>
          ) : (
            <div className="notification-list">
              {items.map((item) => {
                const isUnread = !read.has(item.id);
                return (
                  <button
                    type="button"
                    key={item.id}
                    data-id={item.id}
                    className={`notification-item ${isUnread ? 'is-unread' : ''}`}
                    onClick={() => openItem(item)}
                  >
                    <Artwork src={item.thumbnail} alt="" className="notification-art" />
                    <span className="notification-copy">
                      <span className="notification-label">{item.label}</span>
                      <strong>{item.title}</strong>
                      {item.subtitle ? <span className="notification-subtitle">{item.subtitle}</span> : null}
                      {item.meta ? <span className="notification-meta">{item.meta}</span> : null}
                    </span>
                    {isUnread ? <span className="notification-unread-dot" aria-label="Unread" /> : null}
                  </button>
                );
              })}
            </div>
          )}

          <footer className="notification-foot">
            {personalization.favoriteArtists.length || personalization.preferredGenres.length
              ? 'Based on your favourite artists and genres.'
              : 'Pick favourite artists and genres in Customize Your Taste for sharper picks.'}
          </footer>
        </div>
      ) : null}
    </div>
  );
}
