import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../stores/app';

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

function speechCtor(): (new () => SpeechRecognitionLike) | null {
  const scope = window as any;
  return scope.SpeechRecognition || scope.webkitSpeechRecognition || null;
}

function recorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || '';
}

export function useVoiceSearch(onText: (text: string) => void) {
  const language = useAppStore((state) => state.settings.language || 'en');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | undefined>(undefined);
  const cancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    cancelledRef.current = true;
    window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = undefined;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      try {
        recognition.abort();
      } catch {
        // already stopped
      }
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // already stopped
      }
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecording(false);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const start = useCallback(async () => {
    if (recording || transcribing) return;
    cancelledRef.current = false;
    setError(undefined);
    const Ctor = speechCtor();
    if (Ctor) {
      const recognition = new Ctor();
      recognitionRef.current = recognition;
      recognition.lang = language;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      let finalText = '';
      recognition.onresult = (event: any) => {
        let interim = '';
        for (let index = event.resultIndex; index < event.results.length; index++) {
          const result = event.results[index];
          const text = result?.[0]?.transcript || '';
          if (result?.isFinal) finalText += text;
          else interim += text;
        }
        const text = (finalText || interim).trim();
        if (text) onText(text);
      };
      recognition.onerror = (event: any) => {
        const code = event?.error || 'unknown';
        setError(
          code === 'not-allowed'
            ? 'Microphone access was denied. Allow it in your system settings.'
            : code === 'no-speech'
              ? 'No speech was heard. Try again.'
              : `Voice recognition failed (${code}).`,
        );
        cleanup();
      };
      recognition.onend = () => {
        setRecording(false);
        recognitionRef.current = null;
      };
      try {
        recognition.start();
        setRecording(true);
        stopTimerRef.current = window.setTimeout(() => {
          try {
            recognition.stop();
          } catch {
            cleanup();
          }
        }, 12_000);
        return;
      } catch (err: any) {
        recognitionRef.current = null;
        setError(err?.message || 'Voice recognition could not start.');
        return;
      }
    }

    // Chromium's built-in recognizer is not available in every Electron
    // build. Fall back to a real recording + the user's configured
    // OpenAI-compatible transcription endpoint.
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Voice search is not available in this build. Add an OpenAI-compatible API key or use Identify a song.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = recorderMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError('The microphone recording failed.');
        cleanup();
      };
      recorder.onstop = async () => {
        const mime = recorder.mimeType || mimeType || 'audio/webm';
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        if (cancelledRef.current) return;
        const blob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];
        if (!blob.size) {
          setError('No audio was captured. Try again.');
          return;
        }
        setTranscribing(true);
        try {
          const text = await window.auralis.speech.transcribe(await blob.arrayBuffer(), mime);
          onText(text);
        } catch (err: any) {
          setError(err?.message || 'Speech recognition failed.');
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start();
      setRecording(true);
      stopTimerRef.current = window.setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, 10_000);
    } catch (err: any) {
      cleanup();
      setError(
        err?.name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow it in your system settings.'
          : err?.name === 'NotFoundError'
            ? 'No microphone was found.'
            : err?.message || 'Could not start the microphone.',
      );
    }
  }, [cleanup, language, onText, recording, transcribing]);

  return { start, stop, recording, transcribing, error, clearError: () => setError(undefined) };
}
