/**
 * Visible artwork uses the original CDN URL. Chromium's own image cache is
 * reliable here, and routing dozens of eager images through a custom protocol
 * left some of them stuck in a pending state on Linux.
 */
export function displayArtwork(url?: string): string | undefined {
  if (!url) return undefined;
  if (/^(auralis-media|data|blob|file|https?):/i.test(url)) return url;
  try {
    const absolute = new URL(url, window.location.href);
    return absolute.protocol === 'http:' || absolute.protocol === 'https:' ? absolute.href : url;
  } catch {
    return url;
  }
}

/**
 * Canvas-based colour extraction still needs a same-origin response, so that
 * one image is routed through the local proxy with CORS headers.
 */
export function proxiedArtwork(url?: string): string | undefined {
  if (!url) return undefined;
  if (/^(auralis-media|data|blob|file):/.test(url)) return url;
  try {
    const base64 = window.btoa(unescape(encodeURIComponent(url)));
    return `auralis-media://image/${base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
  } catch {
    return url;
  }
}
