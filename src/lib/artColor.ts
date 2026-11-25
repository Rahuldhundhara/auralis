import { proxiedArtwork } from './image';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface ArtPalette {
  /** The most common usable colour in the artwork. */
  primary: Rgb;
  /** A second, visually distinct colour for the atmospheric glow. */
  secondary: Rgb;
  /** The most saturated colour, for small accents. */
  accent: Rgb;
  /** Average saturation (0-255) of the primary bucket. */
  sat: number;
}

const FALLBACK: ArtPalette = {
  primary: { r: 16, g: 185, b: 129 },
  secondary: { r: 13, g: 148, b: 136 },
  accent: { r: 110, g: 231, b: 183 },
  sat: 120,
};

const paletteCache = new Map<string, Promise<ArtPalette | null>>();
const MAX_CACHE = 140;

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function luminance(color: Rgb): number {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

function distance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/** Lift very dark artwork colours so glows remain visible on the dark shell. */
function glow(color: Rgb, minLum = 54): Rgb {
  const lum = luminance(color);
  if (lum >= minLum) return color;
  const lift = (minLum - lum) / 255;
  return {
    r: clampChannel(color.r + (255 - color.r) * lift * 0.9),
    g: clampChannel(color.g + (255 - color.g) * lift * 0.9),
    b: clampChannel(color.b + (255 - color.b) * lift * 0.9),
  };
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function rgbToHsl(color: Rgb): Hsl {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return {
    r: clampChannel((r + m) * 255),
    g: clampChannel((g + m) * 255),
    b: clampChannel((b + m) * 255),
  };
}

/**
 * Turn the raw dominant artwork colour into a deep, saturated atmosphere.
 * Album covers are frequently washed out (a pale sage-green sleeve, a beige
 * portrait), and dropping that exact RGB behind the hero produces a muddy
 * grey panel. Keeping the artwork's hue while deepening and enriching it
 * gives the reference's dark-green / amber / blue hero while still changing
 * with every track.
 */
export function atmospherePalette(color: Rgb): Pick<ArtPalette, 'primary' | 'secondary' | 'accent'> {
  const hsl = rgbToHsl(color);
  // Nearly monochrome covers have no reliable hue; use the app's signature
  // green rather than an arbitrary red/blue cast.
  const hue = hsl.s < 0.06 ? 158 : hsl.h;
  const saturation = Math.min(0.72, Math.max(0.38, hsl.s * 1.35));
  return {
    primary: hslToRgb(hue, saturation, 0.29),
    secondary: hslToRgb(hue - 12, saturation * 0.94, 0.21),
    accent: hslToRgb(hue + 6, Math.min(0.82, saturation + 0.14), 0.56),
  };
}

interface Bucket {
  count: number;
  r: number;
  g: number;
  b: number;
  sat: number;
}

/**
 * Pull the dominant colours out of an album cover.
 *
 * The image is downscaled to a tiny canvas, near-black / near-white and
 * low-saturation pixels are ignored, and the remaining pixels are grouped
 * into coarse colour buckets. The two most common distinct buckets become
 * the hero's primary and secondary atmosphere colours.
 *
 * Artwork is fetched through the same `auralis-media://` proxy as the
 * visible images, so the canvas is never tainted by the YouTube CDN.
 */
export async function extractPalette(imgUrl?: string): Promise<ArtPalette | null> {
  if (!imgUrl) return null;
  const url = proxiedArtwork(imgUrl);
  if (!url) return null;

  const cached = paletteCache.get(url);
  if (cached) return cached;

  const request = new Promise<ArtPalette | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const size = 48;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const pixels = ctx.getImageData(0, 0, size, size).data;

        const saturated = new Map<number, Bucket>();
        const neutral = new Map<number, Bucket>();

        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] < 128) continue;
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          if (lum < 18 || lum > 246) continue;
          const sat = max - min;
          const target = sat >= 14 ? saturated : neutral;
          // 5 bits per channel keeps neighbouring shades together without
          // collapsing genuinely different colours into one bucket.
          const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
          const bucket = target.get(key);
          if (bucket) {
            bucket.count += 1;
            bucket.r += r;
            bucket.g += g;
            bucket.b += b;
            bucket.sat += sat;
          } else {
            target.set(key, { count: 1, r, g, b, sat });
          }
        }

        // Prefer colourful artwork, but fall back to neutral artwork (many
        // covers are black-and-white or monochrome) rather than giving up.
        const source = saturated.size ? saturated : neutral;
        const ranked = [...source.values()]
          .sort((a, b) => b.count - a.count)
          .slice(0, 12)
          .map((bucket) => ({
            r: clampChannel(bucket.r / bucket.count),
            g: clampChannel(bucket.g / bucket.count),
            b: clampChannel(bucket.b / bucket.count),
            count: bucket.count,
            sat: bucket.sat / bucket.count,
          }));

        if (!ranked.length) return resolve(FALLBACK);

        const primary = glow(ranked[0]);
        let secondary: Rgb | null = ranked.find((entry) => distance(entry, primary) > 58) || null;
        if (!secondary) {
          // Artwork with one dominant colour: derive a second tone by
          // rotating the hue slightly so the atmosphere still has depth.
          secondary = {
            ...primary,
            r: clampChannel(primary.r * 0.72 + 26),
            g: clampChannel(primary.g * 0.86 + 18),
            b: clampChannel(primary.b * 0.94 + 34),
          };
        }
        const accentEntry =
          ranked
            .filter((entry) => entry.sat >= 18)
            .sort((a, b) => b.sat - a.sat)[0] || ranked[0];

        const palette: ArtPalette = {
          primary,
          secondary: glow({
            r: clampChannel(secondary.r),
            g: clampChannel(secondary.g),
            b: clampChannel(secondary.b),
          }),
          accent: glow(
            {
              r: clampChannel(accentEntry.r),
              g: clampChannel(accentEntry.g),
              b: clampChannel(accentEntry.b),
            },
            70,
          ),
          sat: Math.round(ranked[0].sat),
        };
        resolve(palette);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });

  if (paletteCache.size >= MAX_CACHE) {
    const oldest = paletteCache.keys().next().value;
    if (oldest) paletteCache.delete(oldest);
  }
  paletteCache.set(url, request);
  return request;
}

/** Backwards-compatible average colour helper used by the Home hero. */
export async function extractAverageColor(
  imgUrl: string,
): Promise<{ r: number; g: number; b: number; sat: number } | null> {
  const palette = await extractPalette(imgUrl);
  if (!palette) return null;
  return { ...palette.primary, sat: palette.sat };
}
