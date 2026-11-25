import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Check,
  CheckCircle2,
  Link2,
  Loader2,
  LogIn,
  Mic,
  MicOff,
  Plus,
  Search,
  Sparkles,
  Square,
  UserRound,
  CirclePlay,
} from 'lucide-react';
import type { Card, RecognizeResult } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { useUiStore, type DialogState } from '../stores/ui';
import { toast } from '../stores/ui';
import { useUiStore as useUi } from '../stores/ui';
import { platformName } from '../lib/platform';
import { EQ_PRESETS, applyPreset } from '../lib/eqPresets';
import { Artwork, Button, IconButton, Modal, Range, Spinner } from './primitives';
import { SearchField } from './SearchField';

function CreatePlaylistDialog({ track, onClose }: { track?: import('@shared/types').Track; onClose: () => void }) {
  const createPlaylist = useAppStore((state) => state.createPlaylist);
  const addToPlaylist = useAppStore((state) => state.addToPlaylist);
  const navigate = useNavStore((state) => state.navigate);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const playlist = await createPlaylist(name.trim(), description.trim());
      if (track) await addToPlaylist(playlist.id, track);
      toast(track ? `Created “${playlist.name}” and added the song.` : `Created “${playlist.name}”.`, 'success');
      navigate({ page: 'local', id: playlist.id });
      onClose();
    } catch (error: any) {
      toast(`Could not create the playlist: ${error?.message || error}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New playlist"
      subtitle={track ? `“${track.title}” will be added automatically.` : 'Give your playlist a name and an optional description.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!name.trim() || busy} icon={busy ? <Spinner size={16} /> : <Plus size={16} />}>
            {track ? 'Create and add' : 'Create playlist'}
          </Button>
        </>
      }
    >
      <div className="form-stack">
        <label className="field">
          <span>Name</span>
          <input autoFocus value={name} maxLength={100} onChange={(event) => setName(event.target.value)} placeholder="Late night drive" onKeyDown={(event) => event.key === 'Enter' && void submit()} />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea value={description} maxLength={500} rows={3} onChange={(event) => setDescription(event.target.value)} placeholder="What is this playlist for?" />
        </label>
      </div>
    </Modal>
  );
}

function RenamePlaylistDialog({ playlist, onClose }: { playlist: import('@shared/types').LocalPlaylist; onClose: () => void }) {
  const renamePlaylist = useAppStore((state) => state.renamePlaylist);
  const [name, setName] = useState(playlist.name);
  const [description, setDescription] = useState(playlist.description || '');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit playlist"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim() || busy}
            icon={busy ? <Spinner size={16} /> : undefined}
            onClick={async () => {
              setBusy(true);
              try {
                await renamePlaylist(playlist.id, name, description);
                toast('Playlist updated.', 'success');
                onClose();
              } catch (error: any) {
                toast(`Could not update the playlist: ${error?.message || error}`, 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="form-stack">
        <label className="field">
          <span>Name</span>
          <input autoFocus value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea value={description} maxLength={500} rows={3} onChange={(event) => setDescription(event.target.value)} />
        </label>
      </div>
    </Modal>
  );
}

function AddToPlaylistDialog({ track, onClose }: { track: import('@shared/types').Track; onClose: () => void }) {
  const playlists = useAppStore((state) => state.library.playlists);
  const addToPlaylist = useAppStore((state) => state.addToPlaylist);
  const openDialog = useUiStore((state) => state.openDialog);
  const [busyId, setBusyId] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title="Add to playlist" subtitle={`“${track.title}”`}>
      <div className="playlist-picker">
        <button
          type="button"
          className="playlist-picker-new"
          onClick={() => openDialog({ type: 'create-playlist', track })}
        >
          <span className="picker-new-icon">
            <Plus size={18} />
          </span>
          <span>New playlist</span>
        </button>
        {playlists.map((playlist) => {
          const contains = playlist.tracks.some((item) => item.id === track.id);
          return (
            <button
              type="button"
              key={playlist.id}
              className="playlist-picker-row"
              disabled={contains || busyId === playlist.id}
              onClick={async () => {
                setBusyId(playlist.id);
                try {
                  await addToPlaylist(playlist.id, track);
                  toast(`Added to “${playlist.name}”.`, 'success');
                  onClose();
                } catch (error: any) {
                  toast(`Could not add the song: ${error?.message || error}`, 'error');
                } finally {
                  setBusyId(null);
                }
              }}
            >
              <Artwork src={playlist.cover || playlist.tracks[0]?.thumbnail} alt={playlist.name} className="picker-art" />
              <span className="picker-text">
                <span className="picker-name">{playlist.name}</span>
                <span className="picker-meta">{playlist.tracks.length} songs</span>
              </span>
              {busyId === playlist.id ? <Spinner size={16} /> : contains ? <Check size={17} className="check-icon" /> : null}
            </button>
          );
        })}
        {!playlists.length ? <p className="dialog-hint">You have no playlists yet. Create one to start collecting songs.</p> : null}
      </div>
    </Modal>
  );
}

function CookieDialog({ onClose }: { onClose: () => void }) {
  const setCookies = useAppStore((state) => state.setCookies);
  const login = useAppStore((state) => state.login);
  const session = useAppStore((state) => state.session);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title="YouTube Music account"
      subtitle="Sign in with the Google window, or paste cookies from your browser."
      width={580}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!value.trim() || busy}
            icon={busy ? <Spinner size={16} /> : <Check size={16} />}
            onClick={async () => {
              setBusy(true);
              try {
                await setCookies(value);
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            Save cookies
          </Button>
        </>
      }
    >
      <div className="cookie-dialog">
        <div className="signin-box">
          <div className="signin-icon">
            <CirclePlay size={26} />
          </div>
          <div>
            <strong>{session.hasCookies ? 'A session is already connected' : 'Sign in with Google'}</strong>
            <p>A dedicated sign-in window opens. Auralis only keeps the YouTube cookies needed for your library.</p>
          </div>
          <Button
            variant="primary"
            icon={busy ? <Spinner size={16} /> : <LogIn size={16} />}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const next = await login();
                if (next.hasCookies) onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {session.hasCookies ? 'Reconnect' : 'Sign in'}
          </Button>
        </div>
        <details className="advanced-cookies">
          <summary>Advanced: paste cookies manually</summary>
          <p>
            Export cookies from a signed-in music.youtube.com tab as a Netscape cookies.txt file, then paste its text or a
            `name=value; name=value` string.
          </p>
          <textarea
            rows={6}
            value={value}
            spellCheck={false}
            onChange={(event) => setValue(event.target.value)}
            placeholder="# Netscape HTTP Cookie File… or SID=…; HSID=…; SSID=…; SAPISID=…"
          />
        </details>
      </div>
    </Modal>
  );
}

function YouTubePlaylistDialog({ track, onClose }: { track: import('@shared/types').Track; onClose: () => void }) {
  const session = useAppStore((state) => state.session);
  const login = useAppStore((state) => state.login);
  const [playlists, setPlaylists] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [addition, setAddition] = useState<string | null>(null);

  useEffect(() => {
    if (!session.hasCookies) return;
    let cancelled = false;
    setLoading(true);
    window.auralis.yt
      .library()
      .then((page) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const cards: Card[] = [];
        for (const shelf of page.shelves) {
          for (const item of shelf.items) {
            if (item.type !== 'playlist') continue;
            const id = item.browseId || item.id;
            if (!id || !id.startsWith('VL') || seen.has(id)) continue;
            seen.add(id);
            cards.push(item);
          }
        }
        setPlaylists(cards);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [session.hasCookies]);

  const addTo = async (playlistId: string) => {
    setAddition(playlistId);
    try {
      await window.auralis.yt.addToYTPlaylist(playlistId.replace(/^VL/, ''), track.id);
      toast('Added to your YouTube Music playlist.', 'success');
      onClose();
    } catch (error: any) {
      toast(`Could not add the song: ${error?.message || error}`, 'error');
    } finally {
      setAddition(null);
    }
  };

  const createAndAdd = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const playlistId = await window.auralis.yt.createYTPlaylist(title.trim());
      await window.auralis.yt.addToYTPlaylist(playlistId.replace(/^VL/, ''), track.id);
      toast(`Created “${title.trim()}” on YouTube Music.`, 'success');
      onClose();
    } catch (error: any) {
      toast(`Could not create the playlist: ${error?.message || error}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!session.hasCookies) {
    return (
      <Modal
        open
        onClose={onClose}
        title="YouTube Music playlist"
        subtitle="Sign in to save this song to your YouTube Music library."
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Not now
            </Button>
            <Button
              variant="primary"
              icon={<LogIn size={16} />}
              onClick={async () => {
                const next = await login();
                if (next.hasCookies) onClose();
              }}
            >
              Sign in
            </Button>
          </>
        }
      >
        <p className="dialog-hint">
          Auralis uses your own Google session. You can also save the song to a local playlist without signing in.
        </p>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Add to YouTube Music" subtitle={`“${track.title}”`} width={560}>
      <div className="yt-playlist-dialog">
        <div className="yt-create-row">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="New playlist name"
            maxLength={100}
            onKeyDown={(event) => event.key === 'Enter' && void createAndAdd()}
          />
          <Button variant="primary" size="sm" disabled={!title.trim() || busy} icon={busy ? <Spinner size={15} /> : <Plus size={15} />} onClick={() => void createAndAdd()}>
            Create
          </Button>
        </div>
        {loading ? (
          <div className="picker-loading">
            <Spinner size={18} /> Loading your playlists…
          </div>
        ) : (
          <div className="playlist-picker">
            {playlists.map((playlist) => (
              <button
                type="button"
                key={playlist.id}
                className="playlist-picker-row"
                disabled={addition === playlist.id}
                onClick={() => void addTo(playlist.browseId || playlist.id)}
              >
                <Artwork src={playlist.thumbnail} alt={playlist.title} className="picker-art" />
                <span className="picker-text">
                  <span className="picker-name">{playlist.title}</span>
                  <span className="picker-meta">{playlist.subtitle || 'YouTube Music playlist'}</span>
                </span>
                {addition === playlist.id ? <Spinner size={16} /> : null}
              </button>
            ))}
            {!playlists.length ? <p className="dialog-hint">No YouTube playlists found. Create one above.</p> : null}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Recognition                                                         */
/* ------------------------------------------------------------------ */

function recognitionError(err: any): string {
  const raw = String(err?.message || err || '').trim();
  const message = raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '');
  if (/no match/i.test(message)) {
    return 'No match found. Try singing or humming a longer, clearer part — or play the original nearby.';
  }
  if (/network|fetch|timeout|timed out|econn|socket/i.test(message)) {
    return 'Could not reach the recognition service. Check your connection and try again.';
  }
  return message || 'No match found. Try again with a clearer clip.';
}

function microphoneError(err: any): string {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return `Microphone access was denied. Allow microphone access in ${platformName()} settings and try again.`;
    case 'NotFoundError':
      return 'No microphone was found. Connect a microphone and try again.';
    case 'NotReadableError':
      return 'The microphone is busy in another app. Close it and try again.';
    case 'OverconstrainedError':
      return 'The selected microphone is unavailable. Try a different input device.';
    default:
      return err?.message || 'Could not start the microphone.';
  }
}

function RecognitionDialog({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState<'starting' | 'recording' | 'processing' | 'result' | 'error'>('starting');
  const [seconds, setSeconds] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [matching, setMatching] = useState(false);
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<RecognizeResult | null>(null);
  const [playing, setPlaying] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const timerRef = useRef<number | null>(null);
  const attemptTimerRef = useRef<number | null>(null);
  const meterRef = useRef<HTMLDivElement | null>(null);
  const attemptingRef = useRef(false);
  const stoppedRef = useRef(false);
  const pendingFinalRef = useRef(false);
  const sessionRef = useRef(0);
  const navigate = useNavStore((state) => state.navigate);
  const recognitionSettings = useAppStore((state) => state.settings.recognition);
  const hummingEnabled = Boolean(
    recognitionSettings?.acrcloudHost &&
      recognitionSettings?.acrcloudAccessKey &&
      recognitionSettings?.acrcloudAccessSecret,
  );

  // A hummed phrase needs a few seconds to become identifiable. We keep
  // listening and retry, so a match appears as soon as the melody is clear
  // instead of making everyone wait for a fixed countdown.
  const FIRST_ATTEMPT_MS = 3200;
  const RETRY_MS = 2800;
  const MAX_SECONDS = 30;
  const MIN_SAMPLES = 16_000 * 3;

  const clearTimers = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (attemptTimerRef.current) window.clearTimeout(attemptTimerRef.current);
    attemptTimerRef.current = null;
  };

  const cleanupCapture = () => {
    clearTimers();
    try {
      processorRef.current?.disconnect();
      sourceRef.current?.disconnect();
    } catch {
      /* nodes may already be disconnected */
    }
    processorRef.current = null;
    sourceRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    return () => {
      sessionRef.current += 1;
      stoppedRef.current = true;
      cleanupCapture();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Convert the captured microphone samples to the 16 kHz mono PCM that the
   *  recognisers expect. Resampling here means every attempt uses the whole
   *  clip so far, not just the last chunk. */
  const collectPcm = (): Int16Array | null => {
    const chunks = pcmChunksRef.current;
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const context = audioContextRef.current;
    if (!total || !context) return null;
    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    const ratio = (context.sampleRate || 48_000) / 16_000;
    const length = Math.max(0, Math.floor(total / ratio));
    if (!length) return null;
    const pcm = new Int16Array(length);
    for (let index = 0; index < length; index++) {
      const position = index * ratio;
      const left = Math.min(merged.length - 1, Math.floor(position));
      const right = Math.min(merged.length - 1, left + 1);
      const fraction = position - left;
      const sample = merged[left] * (1 - fraction) + merged[right] * fraction;
      pcm[index] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    }
    return pcm;
  };

  const fatalRecognitionError = (message: string) =>
    /acrcloud rejected|acrcloud:|credentials|access key|signature|host is missing/i.test(message);

  const attemptRecognition = async (final: boolean): Promise<boolean> => {
    if (attemptingRef.current) return false;
    const pcm = collectPcm();
    if (!pcm || pcm.length < MIN_SAMPLES) {
      if (final) {
        stoppedRef.current = true;
        cleanupCapture();
        setError('Auralis did not hear enough audio. Move closer to the microphone and try again.');
        setStage('error');
      }
      return false;
    }
    attemptingRef.current = true;
    setMatching(true);
    setAttempts((value) => value + 1);
    let terminal = false;
    try {
      const buffer = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer;
      const match = await window.auralis.recognize.fromPcm(buffer);
      terminal = true;
      stoppedRef.current = true;
      cleanupCapture();
      setResult(match);
      setStage('result');
      return true;
    } catch (err: any) {
      const message = recognitionError(err);
      if (final || fatalRecognitionError(message)) {
        terminal = true;
        stoppedRef.current = true;
        cleanupCapture();
        setError(message);
        setStage('error');
      } else {
        setHint('No match yet — keep singing or humming. Auralis is still listening.');
      }
      return false;
    } finally {
      attemptingRef.current = false;
      setMatching(false);
      // A "finish" press can arrive while an automatic check is in flight.
      // Run the final check with the complete clip once that request settles.
      if (pendingFinalRef.current && !terminal && !final) {
        pendingFinalRef.current = false;
        stoppedRef.current = true;
        clearTimers();
        void attemptRecognition(true);
      }
    }
  };

  const scheduleAttempt = (delay: number) => {
    attemptTimerRef.current = window.setTimeout(() => {
      if (stoppedRef.current) return;
      void attemptRecognition(false).then(() => {
        if (!stoppedRef.current) scheduleAttempt(RETRY_MS);
      });
    }, delay);
  };

  const startMic = async () => {
    const session = ++sessionRef.current;
    cleanupCapture();
    pcmChunksRef.current = [];
    setError('');
    setResult(null);
    setSeconds(0);
    setAttempts(0);
    setHint('');
    setMatching(false);
    setStage('starting');
    stoppedRef.current = false;
    attemptingRef.current = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('This device does not expose a microphone to Auralis.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const context = new AudioContext();
      audioContextRef.current = context;
      await context.resume().catch(() => {});
      const source = context.createMediaStreamSource(stream);
      sourceRef.current = source;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const processor = context.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input.length);
        copy.set(input);
        pcmChunksRef.current.push(copy);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let index = 0; index < data.length; index++) {
          const sample = (data[index] - 128) / 128;
          sum += sample * sample;
        }
        const level = Math.min(1, Math.sqrt(sum / data.length) * 6);
        meterRef.current?.style.setProperty('--mic-level', level.toFixed(3));
      };
      source.connect(analyser);
      source.connect(processor);
      // A ScriptProcessor only runs while connected to a destination; it
      // outputs silence, so nothing is echoed back to the speakers.
      processor.connect(context.destination);
      setStage('recording');
      const started = Date.now();
      timerRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - started) / 1000;
        setSeconds(Math.floor(elapsed));
        if (elapsed >= MAX_SECONDS && !stoppedRef.current) {
          finish();
        }
      }, 400);
      scheduleAttempt(FIRST_ATTEMPT_MS);
    } catch (err: any) {
      cleanupCapture();
      setError(microphoneError(err));
      setStage('error');
    }
  };

  // One click opens the dialog and starts listening immediately. The user only
  // has to sing, hum, or hold the device up to the original track.
  useEffect(() => {
    void startMic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = () => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    clearTimers();
    if (attemptingRef.current) {
      pendingFinalRef.current = true;
      return;
    }
    void attemptRecognition(true);
  };

  const close = () => {
    sessionRef.current += 1;
    stoppedRef.current = true;
    cleanupCapture();
    onClose();
  };

  const playResult = async () => {
    if (!result) return;
    setPlaying(true);
    try {
      if (result.youtubeVideoId) {
        const track = {
          id: result.youtubeVideoId,
          type: 'song' as const,
          title: result.title,
          artists: [{ name: result.artist }],
          album: result.album ? { name: result.album } : undefined,
          duration: 0,
          thumbnail: result.coverArt,
          source: 'youtube' as const,
        };
        usePlayerStore.getState().playQueue([track], 0);
        close();
        return;
      }
      const results = await window.auralis.yt.search(`${result.title} ${result.artist}`, 'songs');
      if (results.songs.length) {
        usePlayerStore.getState().playQueue(results.songs, 0);
        close();
      } else {
        toast('No matching song was found on YouTube Music.', 'error');
      }
    } catch (err: any) {
      toast(`Could not play the match: ${err?.message || err}`, 'error');
    } finally {
      setPlaying(false);
    }
  };

  return (
    <Modal
      open
      onClose={close}
      title="Identify a song"
      width={600}
      className="recognition-modal"
    >
      <div className="recognition-dialog">
        {stage === 'result' && result ? (
          <div className="recognize-result">
            <Artwork src={result.coverArt} alt={result.title} className="recognize-art" />
            <div className="recognize-info">
              <span className="recognize-label">
                <CheckCircle2 size={14} /> Match found
              </span>
              <h3>{result.title}</h3>
              <p>{result.artist}</p>
              <div className="recognize-meta">
                {result.album ? <span>{result.album}</span> : null}
                {result.releaseDate ? <span>{result.releaseDate}</span> : null}
                {result.genre ? <span>{result.genre}</span> : null}
              </div>
              <div className="recognize-actions">
                <Button variant="primary" icon={playing ? <Spinner size={15} /> : <Sparkles size={15} />} onClick={() => void playResult()} disabled={playing}>
                  Play in Auralis
                </Button>
                {result.shazamUrl ? (
                  <Button variant="outline" icon={<Link2 size={15} />} onClick={() => void window.auralis.app.openExternal(result.shazamUrl!)}>
                    Shazam
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  icon={<Search size={15} />}
                  onClick={() => {
                    navigate({ page: 'search', q: `${result.title} ${result.artist}` });
                    close();
                  }}
                >
                  Search
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className={`recognition-stage ${stage === 'starting' || stage === 'recording' ? 'is-listening' : ''}`}>
            <div
              ref={meterRef}
              className={`mic-orb ${stage === 'recording' ? 'is-recording' : ''} ${stage === 'starting' ? 'is-starting' : ''}`}
            >
              {stage === 'error' ? (
                <MicOff size={28} />
              ) : (
                <>
                  <Mic size={28} />
                  <div className="mic-bars" aria-hidden="true">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <i key={index} />
                    ))}
                  </div>
                </>
              )}
            </div>
            <h3>
              {stage === 'starting'
                ? 'Connecting microphone…'
                : stage === 'recording'
                  ? matching
                    ? 'Matching your melody…'
                    : 'Listening…'
                  : 'No match found'}
            </h3>
            <p>
              {stage === 'starting'
                ? 'Allow microphone access when your system asks.'
                : stage === 'recording'
                  ? hummingEnabled
                    ? 'Sing or hum the tune — Auralis starts matching after a few seconds and keeps listening until it finds it.'
                    : 'Sing, hum or play the song nearby. Auralis checks the melody continuously — no countdown to wait for.'
                  : 'Try a longer, clearer part — or play the original nearby.'}
            </p>
            {stage === 'recording' ? (
              <>
                <div className="recognition-live" role="status" aria-live="polite">
                  <span className="recognition-live-dot" />
                  {matching ? 'Checking the melody…' : `Listening · ${seconds}s`}
                  {attempts > 0 && !matching ? <span className="recognition-live-attempts">{attempts} check{attempts === 1 ? '' : 's'}</span> : null}
                </div>
                <div className="recognition-progress is-indeterminate" aria-hidden="true">
                  <span />
                </div>
                {hint ? <p className="recognition-hint">{hint}</p> : null}
              </>
            ) : null}
            {stage === 'error' ? <div className="recognize-error">{error}</div> : null}
            <div className="recognize-controls">
              {stage === 'starting' || stage === 'recording' ? (
                <>
                  <Button variant="ghost" size="lg" onClick={close}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="lg"
                    icon={<AudioLines size={16} />}
                    onClick={finish}
                    disabled={stage !== 'recording' || matching || seconds < 2}
                  >
                    Identify now
                  </Button>
                </>
              ) : stage === 'processing' ? (
                <Button variant="ghost" size="lg" onClick={close}>
                  Cancel
                </Button>
              ) : (
                <>
                  <Button variant="ghost" size="lg" onClick={close}>
                    Close
                  </Button>
                  <Button variant="primary" size="lg" icon={<AudioLines size={17} />} onClick={() => void startMic()}>
                    Try again
                  </Button>
                </>
              )}
            </div>
            {stage === 'starting' || stage === 'recording' ? (
              <p className="privacy-note">
                <MicOff size={13} />
                {hummingEnabled
                  ? 'Audio is sent to ACRCloud only while you are identifying. Nothing is stored.'
                  : 'Audio is fingerprinted on this PC. Add ACRCloud keys in Settings → Integrations for singing and humming.'}
              </p>
            ) : null}
          </div>
        )}

        {stage === 'result' ? (
          <div className="recognition-footer-actions">
            <Button variant="ghost" onClick={() => void startMic()}>
              Try another
            </Button>
            <Button variant="ghost" onClick={close}>
              Close
            </Button>
            {result?.lyrics ? (
              <details className="recognize-lyrics">
                <summary>Preview lyrics</summary>
                <p>{result.lyrics.slice(0, 600)}</p>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/* Host                                                                */
/* ------------------------------------------------------------------ */

function DialogContent({ dialog, onClose }: { dialog: DialogState; onClose: () => void }) {
  switch (dialog.type) {
    case 'create-playlist':
      return <CreatePlaylistDialog track={dialog.track} onClose={onClose} />;
    case 'import-playlist':
      return <ImportPlaylistDialog onClose={onClose} />;
    case 'rename-playlist':
      return <RenamePlaylistDialog playlist={dialog.playlist} onClose={onClose} />;
    case 'add-to-playlist':
      return <AddToPlaylistDialog track={dialog.track} onClose={onClose} />;
    case 'confirm':
      return <ConfirmDialog dialog={dialog} onClose={onClose} />;
    case 'recognition':
      return <RecognitionDialog onClose={onClose} />;
    case 'cookie':
      return <CookieDialog onClose={onClose} />;
    case 'yt-playlist':
      return <YouTubePlaylistDialog track={dialog.track} onClose={onClose} />;
    case 'eq':
      return <EqualizerDialog onClose={onClose} />;
    default:
      return null;
  }
}

function ImportPlaylistDialog({ onClose }: { onClose: () => void }) {
  const importPlaylist = useAppStore((state) => state.importPlaylist);
  const navigate = useNavStore((state) => state.navigate);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await importPlaylist(url.trim());
      toast(`Imported ${result.imported} songs${result.skipped ? `, skipped ${result.skipped} duplicates` : ''}.`, 'success');
      navigate({ page: 'local', id: result.playlist.id });
      onClose();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Import a playlist"
      subtitle="Copy a YouTube or YouTube Music playlist into your local library. Your source playlist is never changed."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={!url.trim() || busy}
            icon={busy ? <Spinner size={16} /> : <Link2 size={16} />}
          >
            {busy ? 'Importing…' : 'Import playlist'}
          </Button>
        </>
      }
    >
      <div className="form-stack">
        <label className="field">
          <span>Playlist link or ID</span>
          <input
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void submit()}
            placeholder="https://music.youtube.com/playlist?list=..."
            spellCheck={false}
          />
        </label>
        <p className="dialog-hint">
          Auralis reads every page of the public playlist and saves a local copy with the original order. Private playlists use your signed-in session. Spotify, Apple Music and other services are not supported by this importer.
        </p>
        {error ? <p className="form-error">{error}</p> : null}
      </div>
    </Modal>
  );
}

function EqualizerDialog({ onClose }: { onClose: () => void }) {
  const settings = useAppStore((state) => state.settings);
  const update = useAppStore((state) => state.updateSettings);
  const eq = settings.eq;
  const setBand = (index: number, value: number) => {
    const bands = [...eq.bands];
    bands[index] = value;
    void update({ eq: { ...eq, bands } });
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Equalizer"
      subtitle="Real-time DSP: 10 peaking bands, an 80 Hz bass shelf and automatic headroom."
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => void update({ eq: { ...eq, enabled: !eq.enabled } })}
          >
            {eq.enabled ? 'Disable EQ' : 'Enable EQ'}
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className={`eq-panel ${eq.enabled ? '' : 'is-disabled'}`}>
        <div className="eq-presets" role="group" aria-label="Equalizer presets">
          {EQ_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="eq-preset"
              onClick={() => void update({ eq: applyPreset(eq, preset) })}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="eq-head">
          <span>Bass boost · 80 Hz shelf</span>
          <span className="eq-value">{eq.bassBoost > 0 ? '+' : ''}{(eq.bassBoost || 0).toFixed(1)} dB</span>
        </div>
        <Range
          min={-12}
          max={12}
          step={0.5}
          value={eq.bassBoost || 0}
          onValueChange={(value) => void update({ eq: { ...eq, bassBoost: value } })}
          aria-label="Bass boost"
        />
        <div className="eq-head">
          <span>Preamp</span>
          <span className="eq-value">{eq.preamp > 0 ? '+' : ''}{eq.preamp.toFixed(1)} dB</span>
        </div>
        <Range
          min={-12}
          max={12}
          step={0.5}
          value={eq.preamp}
          onValueChange={(value) => void update({ eq: { ...eq, preamp: value } })}
          aria-label="Preamp"
        />
        <div className="eq-bands">
          {[31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map((frequency, index) => (
            <div className="eq-band" key={frequency}>
              <span className="eq-frequency">{frequency >= 1000 ? `${frequency / 1000}k` : frequency}</span>
              <Range
                className="eq-range"
                min={-12}
                max={12}
                step={0.5}
                value={eq.bands[index] || 0}
                onValueChange={(value) => setBand(index, value)}
                aria-label={`${frequency} Hz`}
              />
              <span className="eq-value">
                {eq.bands[index] > 0 ? '+' : ''}
                {(eq.bands[index] || 0).toFixed(1)}
              </span>
            </div>
          ))}
        </div>
        <div className="eq-footer">
          <span>31 Hz – 16 kHz · ±12 dB · limiter active</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void update({
                eq: { ...eq, bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], preamp: 0, bassBoost: 0 },
              })
            }
          >
            Flatten
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmDialog({ dialog, onClose }: { dialog: Extract<DialogState, { type: 'confirm' }>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={dialog.title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={dialog.danger ? 'danger' : 'primary'}
            disabled={busy}
            icon={busy ? <Spinner size={16} /> : undefined}
            onClick={async () => {
              setBusy(true);
              try {
                await dialog.onConfirm();
                onClose();
              } catch (error: any) {
                toast(error?.message || 'Action failed.', 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            {dialog.confirmLabel || 'Confirm'}
          </Button>
        </>
      }
    >
      <p className="confirm-message">{dialog.message}</p>
    </Modal>
  );
}

export function DialogHost() {
  const dialog = useUiStore((state) => state.dialog);
  const closeDialog = useUiStore((state) => state.closeDialog);
  if (!dialog) return null;
  return <DialogContent key={dialog.type === 'confirm' ? dialog.title : dialog.type} dialog={dialog} onClose={closeDialog} />;
}
