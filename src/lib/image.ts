/** Route remote artwork through the local proxy so images always load
 *  (the CDN rejects requests without a YouTube Music referer/UA). */
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
