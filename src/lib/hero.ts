import { useEffect, useState, type CSSProperties } from 'react';
import type { Track } from '@shared/types';

export interface HeroCopy {
  title: string;
  artists: string;
  album?: string;
  version?: string;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface HeroPalette {
  primary: Rgb;
  secondary: Rgb;
  accent: Rgb;
}

const VERSION_WORDS =
  /\b(remix|rework|live|acoustic|instrumental|karaoke|edit|version|mix|demo|radio|extended|deluxe|remaster|remastered|sped up|slowed|reprise|cover)\b/i;

const TAGLINES = [
  'Sometimes music says it all.',
  "This one's for you.",
  'Let the music find you.',
  'Right song, right now.',
  'A little louder, a little lighter.',
  'Let the night sound better.',
  'Press play and stay awhile.',
];

const DEFAULT_PALETTE: HeroPalette = {
  primary: { r: 14, g: 92, b: 70 },
  secondary: { r: 12, g: 66, b: 58 },
  accent: { r: 66, g: 236, b: 170 },
};

const paletteCache = new Map<string, HeroPalette>();

/** Deterministic per track id, never per render. */
export function heroTagline(trackId?: string): string {
  if (!trackId) return TAGLINES[2];
  let hash = 0;
  for (let index = 0; index < trackId.length; index += 1) {
    hash = (hash * 31 + trackId.charCodeAt(index)) >>> 0;
  }
  return TAGLINES[hash % TAGLINES.length];
}

function clean(value: string): string {
  return value
    .replace(/[\u2018\u2019\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, '')
    .trim();
}

function unquote(value: string): string {
  return clean(value.replace(/^["'\s]+|["'\s]+$/g, ''));
}

function trailingGroups(input: string): Array<{ text: string; start: number }> {
  const output: Array<{ text: string; start: number }> = [];
  let depth = 0;
  let start = -1;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '(') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === ')') {
      if (depth > 0) depth -= 1;
      if (depth === 0 && start >= 0) {
        output.push({ text: input.slice(start + 1, index), start });
        start = -1;
      }
    }
  }
  return output;
}

function splitVersion(input: string): { text: string; version?: string } {
  let text = input;
  let version: string | undefined;

  // Peel only groups that sit at the end, so "(I Can't Get No) Satisfaction"
  // keeps its leading parenthetical as part of the title.
  for (;;) {
    const groups = trailingGroups(text);
    const last = groups[groups.length - 1];
    if (!last) break;
    if (text.slice(last.start + last.text.length + 2).trim()) break;
    const inner = clean(last.text);
    if (!inner) break;
    const fromMatch = inner.match(/^from\s+(.+)$/i);
    if (fromMatch) {
      version = version || `From ${unquote(fromMatch[1])}`;
      text = clean(text.slice(0, last.start));
      continue;
    }
    if (VERSION_WORDS.test(inner) || /\s[-–—]\s/.test(inner)) {
      version = version || inner;
      text = clean(text.slice(0, last.start));
      continue;
    }
    break;
  }

  // A trailing " - Live" / " - Remix" is a version, not part of the title.
  let depth = 0;
  let splitAt = -1;
  for (let index = 0; index < text.length - 2; index += 1) {
    const char = text[index];
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && /\s[-–—]\s/.test(text.slice(index, index + 3))) splitAt = index;
  }
  if (splitAt > 0) {
    const left = clean(text.slice(0, splitAt));
    const right = clean(text.slice(splitAt + 3));
    if (left && right && (VERSION_WORDS.test(right) || right.length <= 22)) {
      text = left;
      version = version || right;
    }
  }

  return { text: clean(text), version: clean(version || '') || undefined };
}

export function heroCopy(track?: Track): HeroCopy {
  if (!track) {
    return { title: 'Auralis Discover', artists: '' };
  }
  let parsedAlbum: string | undefined;
  let working = clean(track.title);
  const albumGroups = trailingGroups(working).filter((group) => /^from\s+/i.test(clean(group.text)));
  if (albumGroups.length) {
    // Album groups are rendered on the mint line instead of the title.
    const group = albumGroups[albumGroups.length - 1];
    parsedAlbum = unquote(clean(group.text).replace(/^from\s+/i, ''));
    working = clean(working.slice(0, group.start) + working.slice(group.start + group.text.length + 2));
  }
  const split = splitVersion(working);
  const title = split.text || clean(track.title) || 'Unknown track';
  // The "(From ...)" context wins over the album ref: YouTube Music often sets
  // album.name to the song itself for soundtrack uploads, which would repeat
  // the title on the mint line instead of naming the film or album.
  const album = parsedAlbum || unquote(track.album?.name || '');
  const artists = track.artists
    .map((artist) => clean(artist.name))
    .filter(Boolean)
    .join(', ');
  return {
    title,
    artists,
    album: album && album.toLowerCase() !== title.toLowerCase() ? album : undefined,
    version: split.version && split.version.toLowerCase() !== album.toLowerCase() ? split.version : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* Artwork palette                                                            */
/* -------------------------------------------------------------------------- */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === red) h = ((green - blue) / delta) % 6;
  else if (max === green) h = (blue - red) / delta + 2;
  else h = (red - green) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = l - chroma / 2;
  let red = 0;
  let green = 0;
  let blue = 0;
  if (hue < 60) [red, green, blue] = [chroma, x, 0];
  else if (hue < 120) [red, green, blue] = [x, chroma, 0];
  else if (hue < 180) [red, green, blue] = [0, chroma, x];
  else if (hue < 240) [red, green, blue] = [0, x, chroma];
  else if (hue < 300) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];
  return {
    r: Math.round((red + m) * 255),
    g: Math.round((green + m) * 255),
    b: Math.round((blue + m) * 255),
  };
}

export function atmospherePalette(base: Rgb): HeroPalette {
  const hsl = rgbToHsl(base);
  const neutral = hsl.s < 0.12;
  const hue = neutral ? 158 : hsl.h;
  const saturation = neutral ? 0.46 : clamp(hsl.s, 0.38, 0.72);
  return {
    primary: hslToRgb(hue, saturation, 0.29),
    secondary: hslToRgb(hue - 12, saturation, 0.21),
    accent: hslToRgb(hue + 6, saturation, 0.56),
  };
}

function dominantColor(image: HTMLImageElement): Rgb | undefined {
  const canvas = document.createElement('canvas');
  canvas.width = 44;
  canvas.height = 44;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return undefined;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let data: Uint8ClampedArray;
  try {
    data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return undefined;
  }
  const buckets = new Map<number, { r: number; g: number; b: number; count: number; weight: number }>();
  let fallback: { r: number; g: number; b: number; count: number; weight: number } | undefined;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha < 180) continue;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const light = (max + min) / 510;
    const saturation = max === min ? 0 : (max - min) / (255 - Math.abs(2 * light * 255 - 255));
    if (light < 0.1 || light > 0.93) continue;
    const bucket = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const weight = 0.35 + saturation;
    const entry = buckets.get(bucket) || { r: 0, g: 0, b: 0, count: 0, weight: 0 };
    entry.r += r;
    entry.g += g;
    entry.b += b;
    entry.count += 1;
    entry.weight += weight;
    buckets.set(bucket, entry);
    if (!fallback && saturation > 0.08) fallback = { r, g, b, count: 1, weight: saturation };
  }
  let best: { r: number; g: number; b: number; count: number; weight: number } | undefined;
  for (const entry of buckets.values()) {
    if (!best || entry.weight > best.weight) best = entry;
  }
  const chosen = best || fallback;
  if (!chosen) return undefined;
  return {
    r: chosen.r / chosen.count,
    g: chosen.g / chosen.count,
    b: chosen.b / chosen.count,
  };
}

export function useHeroPalette(src?: string): HeroPalette {
  const [palette, setPalette] = useState<HeroPalette>(DEFAULT_PALETTE);
  useEffect(() => {
    if (!src) {
      setPalette(DEFAULT_PALETTE);
      return;
    }
    const cached = paletteCache.get(src);
    if (cached) {
      setPalette(cached);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      if (cancelled) return;
      const dominant = dominantColor(image);
      const next = dominant ? atmospherePalette(dominant) : DEFAULT_PALETTE;
      paletteCache.set(src, next);
      setPalette(next);
    };
    image.onerror = () => {
      if (!cancelled) setPalette(DEFAULT_PALETTE);
    };
    image.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);
  return palette;
}

export function paletteVars(palette: HeroPalette): CSSProperties {
  return {
    '--hero-r': palette.primary.r,
    '--hero-g': palette.primary.g,
    '--hero-b': palette.primary.b,
    '--hero2-r': palette.secondary.r,
    '--hero2-g': palette.secondary.g,
    '--hero2-b': palette.secondary.b,
    '--hero-accent-r': palette.accent.r,
    '--hero-accent-g': palette.accent.g,
    '--hero-accent-b': palette.accent.b,
  } as CSSProperties;
}

export { DEFAULT_PALETTE };
