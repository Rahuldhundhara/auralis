import { isAndroidShell } from './platform';

/**
 * Hosts whose artwork is routed through the auralis-media image proxy.
 * Everything else (local files, already-proxied URLs, unknown CDNs) passes
 * through untouched, so a missing proxy can never break an image that would
 * otherwise load.
 */
const PROXY_HOSTS = /(^|\.)(ytimg\.com|googleusercontent\.com|ggpht\.com)$/i;
const PROXIED_PREFIX = 'auralis-media://image/';
const LOCAL_MEDIA_PREFIX = 'auralis-media://local/';

/**
 * Renderer-safe base64url: Vite does not polyfill Node's Buffer, so the URL
 * payload is encoded with TextEncoder + btoa instead.
 */
function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Wraps a remote artwork URL in the main-process image proxy:
 * auralis-media://image/<base64url>. The proxy adds the YouTube Music
 * referer, retries transient failures and caches responses in memory and
 * on disk, so covers survive restarts and load instantly on repeat visits.
 */
export function proxiedArtwork(src?: string): string | undefined {
  if (!src) return undefined;
  // The Android WebView shell has no Electron protocol handler; it loads
  // artwork directly from the network.
  if (isAndroidShell) return src;
  if (src.startsWith(PROXIED_PREFIX) || src.startsWith(LOCAL_MEDIA_PREFIX) || src.startsWith('data:')) return src;
  try {
    const url = new URL(src);
    if (url.protocol !== 'https:' || !PROXY_HOSTS.test(url.hostname)) return src;
    return `${PROXIED_PREFIX}${base64UrlEncode(src)}`;
  } catch {
    return src;
  }
}

/**
 * Rewrites a YouTube artwork URL to the decode size the current view needs.
 * Parsers clamp thumbnails to card size; the full Now Playing cover asks for
 * a larger variant of the same URL, so only one image is decoded at a time.
 */
export function sizedArtwork(src: string | undefined, size: number): string | undefined {
  if (!src || !/googleusercontent\.com|ggpht\.com|ytimg\.com/i.test(src)) return src;
  let output = src;
  if (/=w\d+-h\d+/.test(output)) output = output.replace(/=w\d+-h\d+/, `=w${size}-h${size}`);
  else if (/=s\d+/.test(output)) output = output.replace(/=s\d+/, `=s${size}`);
  if (/ytimg\.com\/vi\//i.test(output)) {
    const poster =
      size >= 960 ? 'maxresdefault' : size >= 640 ? 'sddefault' : size >= 480 ? 'hqdefault' : 'mqdefault';
    output = output.replace(
      /\/(maxresdefault|hq720|sddefault|hqdefault|mqdefault)\.(jpg|webp)(?=($|[?&]))/i,
      `/${poster}.$2`,
    );
  }
  return output;
}
