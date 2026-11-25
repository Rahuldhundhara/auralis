import { nativeBridge } from './store';

export interface VoiceEvent {
  type: 'ready' | 'partial' | 'final' | 'error' | 'cancelled';
  text?: string;
  message?: string;
}

type VoiceHandler = (event: VoiceEvent) => void;

let handler: VoiceHandler | null = null;
let installed = false;

function install() {
  if (installed) return;
  installed = true;
  window.__auralisVoiceResult = (payload) => {
    let event: VoiceEvent;
    try {
      event = JSON.parse(payload) as VoiceEvent;
    } catch {
      event = { type: 'error', message: 'Voice search could not understand the response.' };
    }
    const current = handler;
    if (!current) return;
    if (event.type === 'final' || event.type === 'error' || event.type === 'cancelled') {
      handler = null;
    }
    current(event);
  };
}

/** Starts Android's on-device speech recognizer. Returns false when unavailable. */
export function startVoiceSearch(onEvent: VoiceHandler): boolean {
  const bridge = nativeBridge();
  if (!bridge?.startVoiceSearch) return false;
  install();
  handler = onEvent;
  try {
    bridge.startVoiceSearch();
    return true;
  } catch {
    handler = null;
    return false;
  }
}

export function cancelVoiceSearch() {
  handler = null;
  try {
    nativeBridge()?.cancelVoiceSearch?.();
  } catch {
    // Voice search is Android-only and the bridge may be absent.
  }
}

export function voiceSearchAvailable(): boolean {
  try {
    return typeof nativeBridge()?.startVoiceSearch === 'function';
  } catch {
    return false;
  }
}
