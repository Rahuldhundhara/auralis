/**
 * The renderer has no direct access to Node's process.platform. These helpers
 * keep Windows copy byte-for-byte identical while giving Linux/macOS builds
 * accurate labels. appInfo.platform remains the authoritative runtime value
 * once the main process has answered.
 */
export function platformId(): 'win32' | 'linux' | 'darwin' | 'unknown' {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/Windows/i.test(ua)) return 'win32';
  if (/Linux/i.test(ua)) return 'linux';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'darwin';
  return 'unknown';
}

export function platformName(): 'Windows' | 'Linux' | 'macOS' | 'desktop' {
  switch (platformId()) {
    case 'win32':
      return 'Windows';
    case 'linux':
      return 'Linux';
    case 'darwin':
      return 'macOS';
    default:
      return 'desktop';
  }
}
