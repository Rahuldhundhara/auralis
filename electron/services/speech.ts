import type { TranslationSettings } from '../../shared/types';
import { settingsStore } from './store';

const MAX_AUDIO_BYTES = 24 * 1024 * 1024;

function speechSettings(): TranslationSettings {
  return settingsStore.get().translation;
}

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/audio/transcriptions`;
}

/**
 * Transcribes a short voice-search recording through the user's configured
 * OpenAI-compatible endpoint. No key or audio is sent anywhere unless the user
 * explicitly starts voice search.
 */
export async function transcribeSpeech(audio: ArrayBuffer, mimeType = 'audio/webm'): Promise<string> {
  const settings = speechSettings();
  if (!settings.openaiApiKey.trim()) {
    throw new Error('Voice search needs an OpenAI-compatible API key in Settings → Lyrics → Translation.');
  }
  if (!audio || audio.byteLength === 0) throw new Error('The microphone did not capture any audio.');
  if (audio.byteLength > MAX_AUDIO_BYTES) throw new Error('The voice recording is too large. Try a shorter phrase.');

  const form = new FormData();
  const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
  form.append('file', new Blob([Buffer.from(audio)], { type: mimeType }), `voice-search.${extension}`);
  form.append('model', process.env.AURALIS_SPEECH_MODEL || 'whisper-1');
  form.append('response_format', 'json');
  form.append('temperature', '0');

  const response = await fetch(endpoint(settings.openaiBaseUrl), {
    method: 'POST',
    headers: { Authorization: `Bearer ${settings.openaiApiKey.trim()}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).trim().slice(0, 240);
    throw new Error(`Speech recognition returned HTTP ${response.status}${detail ? `: ${detail}` : '.'}`);
  }
  const json: any = await response.json().catch(() => null);
  const text = String(json?.text || '').trim();
  if (!text) throw new Error('No speech was recognized. Try again in a quieter place.');
  return text;
}
