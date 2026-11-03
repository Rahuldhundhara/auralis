export function formatDuration(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function formatLongDuration(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours && minutes) return `${hours} hr ${minutes} min`;
  if (hours) return `${hours} hr`;
  return `${minutes} min`;
}

export function formatCount(value: number | undefined): string {
  if (!value || value < 0) return '';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(value);
}

export function formatDate(timestamp: number | string | undefined): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return String(timestamp);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function timeAgo(timestamp: number | undefined): string {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return 'just now';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(timestamp);
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const HERO_TAGLINES = [
  'Your playlist called — it wants a rematch.',
  'Warning: may cause spontaneous kitchen dancing.',
  'Today’s forecast: a 100% chance of earworms.',
  'Headphones on. World off.',
  'One more song. We both know how that ends.',
  'Now auditioning: your next favourite song.',
  'Turn it up — your neighbour’s taste needs help.',
  'No skips, no stress, just good noise.',
  'Music: cheaper than therapy, louder too.',
  'Warning: chorus ahead.',
  'Today’s mood: lo-fi and unbothered.',
  'Your queue is judging your dance moves.',
  'Less scrolling, more humming.',
  'Auralis: now with 100% more spontaneous singing.',
  'The beat is not going to drop itself.',
  'Queue up. Zone out. Repeat.',
  'Your next earworm starts here.',
  'Side effects may include humming in public.',
  'Good music, questionable dance moves.',
  'Press play. Regret nothing.',
  'Today’s special: one banger after another.',
  'Your speakers have been waiting for this.',
  'All killer, no filler.',
  'Let the bass handle the paperwork.',
  'This is your sign to turn it up.',
  'A tiny concert, exclusively for your ears.',
  'Wrong lyrics, right energy.',
  'Music first. Adulting later.',
  'The soundtrack to absolutely nothing important.',
  'Your ears called. They’re ready.',
];

function pickHomeTagline(): string {
  let previous = -1;
  try {
    previous = Number(localStorage.getItem('auralis.home.tagline'));
  } catch {
    // Storage is unavailable in some test environments.
  }
  let index = Math.floor(Math.random() * HERO_TAGLINES.length);
  if (HERO_TAGLINES.length > 1 && index === previous) {
    index = (index + 1) % HERO_TAGLINES.length;
  }
  try {
    localStorage.setItem('auralis.home.tagline', String(index));
  } catch {
    // The tagline is still random when storage is unavailable.
  }
  return HERO_TAGLINES[index];
}

/** Chosen once per app launch, so the greeting feels fresh without changing mid-session. */
export const homeTagline = pickHomeTagline();

export function artistsLine(artists?: { name: string }[]): string {
  return (artists || []).map((artist) => artist.name).filter(Boolean).join(', ');
}

export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function initials(value: string | undefined): string {
  return (value || 'A')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function clip(value: string, length: number): string {
  if (value.length <= length) return value;
  return `${value.slice(0, length - 1).trimEnd()}…`;
}

export function shuffleArray<T>(items: T[]): T[] {
  const output = [...items];
  for (let i = output.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

export function safeJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
