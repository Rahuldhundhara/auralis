type AndroidWindow = Window & { AuralisNative?: unknown };

/**
 * True inside the Android WebView shell. The Windows desktop app uses Electron
 * and its user agent never contains "Android", so desktop copy stays untouched.
 */
export const isAndroidShell =
  typeof navigator !== 'undefined' &&
  (/Android/i.test(navigator.userAgent) ||
    Boolean((window as AndroidWindow).AuralisNative));
