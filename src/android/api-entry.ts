import api, { installNativeEventHandler } from './api';
import { installFetchProxy } from './http';
import { nativeBridge } from './store';

function installTimeoutPolyfill() {
  try {
    if (typeof AbortSignal !== 'undefined' && !(AbortSignal as any).timeout) {
      (AbortSignal as any).timeout = (milliseconds: number) => {
        const controller = new AbortController();
        window.setTimeout(() => controller.abort(), Math.max(0, Number(milliseconds) || 0));
        return controller.signal;
      };
    }
  } catch {
    // Modern WebViews already provide AbortSignal.timeout.
  }
}

function installMediaBridge() {
  window.__auralisAndroidMediaState = (track, playing) => {
    const bridge = nativeBridge();
    if (!bridge) return;
    if (!track) {
      try {
        if (typeof bridge.stopPlayback === 'function') bridge.stopPlayback();
        else bridge.setPlayback(false, '', '', '');
      } catch {
        // The playback service may not be running.
      }
      return;
    }
    const artist = (track.artists || [])
      .map((entry) => entry.name)
      .filter(Boolean)
      .join(', ');
    try {
      bridge.setPlayback(playing, track.title || 'Auralis', artist || 'Music', track.thumbnail || '');
    } catch {
      // Notification updates are best-effort.
    }
  };
}

installTimeoutPolyfill();
installFetchProxy();
installNativeEventHandler();
installMediaBridge();
window.auralis = api;
