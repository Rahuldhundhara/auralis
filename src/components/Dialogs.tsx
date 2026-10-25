import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Check,
  CheckCircle2,
  FileAudio,
  Link2,
  Loader2,
  LogIn,
  Mic,
  MicOff,
  Music2,
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
import { Artwork, Button, IconButton, Modal, Spinner } from './primitives';
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

async function pcmFromAudio(arrayBuffer: ArrayBuffer): Promise<Int16Array> {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(arrayBuffer.slice(0));
    const targetRate = 16000;
    const ratio = buffer.sampleRate / targetRate;
    const length = Math.max(1, Math.floor(buffer.length / ratio));
    const output = new Int16Array(length);
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    for (let index = 0; index < length; index++) {
      const position = index * ratio;
      const lower = Math.floor(position);
      const upper = Math.min(buffer.length - 1, lower + 1);
      const fraction = position - lower;
      let sample = 0;
      for (const channel of channels) {
        sample += channel[lower] * (1 - fraction) + channel[upper] * fraction;
      }
      sample /= channels.length || 1;
      output[index] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    }
    return output;
  } finally {
    void context.close();
  }
}

function RecognitionDialog({ onClose }: { onClose: () => void }) {
  const current = usePlayerStore((state) => state.current);
  const [mode, setMode] = useState<'mic' | 'file' | 'current'>('mic');
  const [stage, setStage] = useState<'idle' | 'recording' | 'processing' | 'result' | 'error'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<RecognizeResult | null>(null);
  const [playing, setPlaying] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavStore((state) => state.navigate);

  const cleanupRecording = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  };

  useEffect(() => () => cleanupRecording(), []);

  const recognizePcm = async (pcm: Int16Array) => {
    setStage('processing');
    try {
      const buffer = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer;
      const match = await window.auralis.recognize.fromPcm(buffer);
      setResult(match);
      setStage('result');
    } catch (err: any) {
      setError(err?.message || 'No match found.');
      setStage('error');
    }
  };

  const startMic = async () => {
    setError('');
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        cleanupRecording();
        setStage('processing');
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          const pcm = await pcmFromAudio(await blob.arrayBuffer());
          await recognizePcm(pcm);
        } catch (err: any) {
          setError(err?.message || 'Could not read the recording.');
          setStage('error');
        }
      };
      recorder.start();
      setStage('recording');
      setSeconds(0);
      const started = Date.now();
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        setSeconds(elapsed);
        if (elapsed >= 12) {
          if (recorder.state === 'recording') recorder.stop();
          if (timerRef.current) window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }, 250);
    } catch (err: any) {
      setError(
        err?.name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow microphone access in Windows settings and try again.'
          : err?.message || 'Could not start the microphone.',
      );
      setStage('error');
    }
  };

  const stopMic = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const handleFile = async (file: File) => {
    setError('');
    setResult(null);
    setStage('processing');
    try {
      const pcm = await pcmFromAudio(await file.arrayBuffer());
      await recognizePcm(pcm);
    } catch (err: any) {
      setError(err?.message || 'Could not read that audio file.');
      setStage('error');
    }
  };

  const recognizeCurrent = async () => {
    if (!current) return;
    setError('');
    setResult(null);
    setStage('processing');
    try {
      const match = await window.auralis.recognize.fromVideoId(current.id);
      setResult(match);
      setStage('result');
    } catch (err: any) {
      setError(err?.message || 'No match found.');
      setStage('error');
    }
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
        onClose();
        return;
      }
      const results = await window.auralis.yt.search(`${result.title} ${result.artist}`, 'songs');
      if (results.songs.length) {
        usePlayerStore.getState().playQueue(results.songs, 0);
        onClose();
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
      onClose={() => {
        cleanupRecording();
        onClose();
      }}
      title="Identify music"
      subtitle="Auralis fingerprints a short clip right on this PC, then asks Shazam what it is."
      width={620}
      className="recognition-modal"
    >
      <div className="recognition-dialog">
        <div className="recognition-tabs" role="tablist">
          <button type="button" className={mode === 'mic' ? 'is-active' : ''} onClick={() => { setMode('mic'); setStage('idle'); }}>
            <Mic size={16} /> Microphone
          </button>
          <button type="button" className={mode === 'file' ? 'is-active' : ''} onClick={() => { setMode('file'); setStage('idle'); }}>
            <FileAudio size={16} /> Audio file
          </button>
          <button type="button" className={mode === 'current' ? 'is-active' : ''} onClick={() => { setMode('current'); setStage('idle'); }}>
            <Music2 size={16} /> Now playing
          </button>
        </div>

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
                    onClose();
                  }}
                >
                  Search
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="recognition-stage">
            {mode === 'mic' ? (
              <>
                <div className={`mic-orb ${stage === 'recording' ? 'is-recording' : ''}`}>
                  {stage === 'recording' ? (
                    <div className="mic-bars">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <i key={index} style={{ animationDelay: `${index * 0.11}s` }} />
                      ))}
                    </div>
                  ) : stage === 'processing' ? (
                    <Loader2 size={40} className="spin" />
                  ) : (
                    <Mic size={40} />
                  )}
                </div>
                <h3>
                  {stage === 'recording' ? `Listening… ${seconds}s` : stage === 'processing' ? 'Identifying…' : 'Tap to listen'}
                </h3>
                <p>
                  {stage === 'recording'
                    ? 'Hold your phone or speaker near the microphone. Recording stops after 12 seconds.'
                    : stage === 'processing'
                      ? 'Fingerprinting the clip and asking Shazam.'
                      : 'Play the song nearby and let Auralis listen for up to 12 seconds.'}
                </p>
                {stage === 'error' ? <div className="recognize-error">{error}</div> : null}
                <div className="recognize-controls">
                  {stage === 'recording' ? (
                    <Button variant="danger" size="lg" icon={<Square size={16} />} onClick={stopMic}>
                      Stop and identify
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="lg"
                      icon={<AudioLines size={18} />}
                      disabled={stage === 'processing'}
                      onClick={() => void startMic()}
                    >
                      Start listening
                    </Button>
                  )}
                </div>
                {stage === 'idle' ? (
                  <p className="privacy-note">
                    <MicOff size={13} /> Audio is processed locally into a fingerprint; the original recording is never uploaded.
                  </p>
                ) : null}
              </>
            ) : mode === 'file' ? (
              <>
                <div className="mic-orb">
                  <FileAudio size={40} />
                </div>
                <h3>{stage === 'processing' ? 'Identifying…' : 'Choose an audio clip'}</h3>
                <p>Pick a song or recording. Auralis analyses the first 12 seconds that contain audio.</p>
                {stage === 'error' ? <div className="recognize-error">{error}</div> : null}
                <input
                  ref={fileRef}
                  type="file"
                  accept="audio/*,video/*"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleFile(file);
                    event.target.value = '';
                  }}
                />
                <div className="recognize-controls">
                  <Button variant="primary" icon={<FileAudio size={17} />} onClick={() => fileRef.current?.click()} disabled={stage === 'processing'}>
                    Choose file
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="mic-orb">
                  {stage === 'processing' ? <Loader2 size={40} className="spin" /> : <Music2 size={40} />}
                </div>
                <h3>{stage === 'processing' ? 'Listening to the current track…' : 'Identify the current track'}</h3>
                <p>{current ? `“${current.title}” by ${current.artists.map((artist) => artist.name).join(', ')}` : 'Nothing is playing right now.'}</p>
                {stage === 'error' ? <div className="recognize-error">{error}</div> : null}
                <div className="recognize-controls">
                  <Button variant="primary" icon={<AudioLines size={17} />} disabled={!current || stage === 'processing'} onClick={() => void recognizeCurrent()}>
                    Identify this song
                  </Button>
                </div>
                <p className="privacy-note">
                  <FileAudio size={13} /> Downloads a short clip with yt-dlp. This can take a moment.
                </p>
              </>
            )}
          </div>
        )}

        {stage === 'result' ? (
          <div className="recognition-footer-actions">
            <Button
              variant="ghost"
              onClick={() => {
                setStage('idle');
                setResult(null);
              }}
            >
              Try another
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

/* ------------------------------------------------------------------ */
/* Host                                                                */
/* ------------------------------------------------------------------ */

function DialogContent({ dialog, onClose }: { dialog: DialogState; onClose: () => void }) {
  switch (dialog.type) {
    case 'create-playlist':
      return <CreatePlaylistDialog track={dialog.track} onClose={onClose} />;
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
      return (
        <Modal open onClose={onClose} title="Equalizer" subtitle="Fine-tune your sound in Settings → Playback.">
          <p className="dialog-hint">The equalizer lives with the rest of your playback settings.</p>
        </Modal>
      );
    default:
      return null;
  }
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
