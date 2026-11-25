import { create } from 'zustand';
import type { Settings, Track } from '@shared/types';
import { useAppStore } from './app';
import { useUiStore } from './ui';
import { isTypingTarget, safeJson, shuffleArray } from '../lib/format';
import { prefetchLyrics } from '../lib/lyricsCache';

export type RepeatMode = 'off' | 'all' | 'one';

interface PlayerState {
  queue: Track[];
  index: number;
  current?: Track;
  playing: boolean;
  loading: boolean;
  buffering: boolean;
  position: number;
  duration: number;
  /** Furthest buffered position in seconds, when the media element exposes it. */
  buffered: number;
  volume: number;
  muted: boolean;
  rate: number;
  repeat: RepeatMode;
  shuffle: boolean;
  radio: boolean;
  radioSeed?: string;
  radioContinuation?: string;
  radioLoading: boolean;
  sleepTimerEnd?: number;
  sleepTimerEndOfTrack: boolean;
  error?: string;
  streamFormat?: string;
  /** True when the current track reached its natural end and playback stopped. */
  ended: boolean;
  init: () => void;
  playQueue: (
    tracks: Track[],
    startIndex?: number,
    options?: { radio?: boolean; seed?: string; startAt?: number },
  ) => void;
  playTrack: (track: Track) => void;
  startRadio: (track: Track) => Promise<void>;
  playAt: (index: number) => void;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  next: (fromEnded?: boolean) => void;
  previous: () => void;
  seek: (seconds: number) => void;
  seekBy: (delta: number) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  setRate: (value: number) => void;
  cycleRepeat: () => void;
  setRepeat: (mode: RepeatMode) => void;
  toggleShuffle: () => void;
  addToQueue: (track: Track, quiet?: boolean) => void;
  playNext: (track: Track, quiet?: boolean) => void;
  removeQueueAt: (index: number) => void;
  moveQueue: (from: number, to: number) => void;
  clearUpcoming: () => void;
  setSleepTimer: (minutes: number | 'end' | null) => void;
  clearSleepTimer: () => void;
  stop: () => void;
}

const STORAGE_KEY = 'auralis.player.v1';
const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

let audio: HTMLAudioElement | null = null;
let audioContext: AudioContext | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let preampNode: GainNode | null = null;
let bassNode: BiquadFilterNode | null = null;
let compressorNode: DynamicsCompressorNode | null = null;
let limiterNode: DynamicsCompressorNode | null = null;
let eqNodes: BiquadFilterNode[] = [];
let masterNode: GainNode | null = null;
let analyserNode: AnalyserNode | null = null;
let graphAttempted = false;
let initialized = false;
let loadToken = 0;
let activeSrc = '';
let prefetchTimer: number | undefined;
let lyricsTimer: number | undefined;
let bufferWatchTimer: number | undefined;
let bufferRetries = 0;
let bufferingUiTimer: number | undefined;
let retryCurrent: (() => void) | undefined;
/** The user's play/pause intent while a track is still resolving. */
let loadAutoplayIntent = true;
let pendingSeek = 0;
/** True while an explicit seek request is in flight. While true, `timeupdate`
 *  must not overwrite the optimistic seek position — the media element fires
 *  timeupdate with the pre-seek position until the seek lands, which is what
 *  made the progress bar visibly jump back after a drag. */
let seekInFlight = false;
/** The timestamp the latest user seek is heading to. Used to confirm the
 *  seek actually landed — for non-seekable streams `seeked` fires even
 *  though the element never moved. */
let seekTarget = 0;
/** Whether the most recent seek happened while playback was active. A seek
 *  near the end of a stream can leave the element paused at the target
 *  (readyState 1, no buffered data at EOF to resume from), so arrival
 *  callbacks must explicitly resume instead of relying on the browser's
 *  auto-resume — otherwise the song sits frozen and `ended` never fires.
 *  Cleared by an explicit user pause so a seek while paused stays paused. */
let seekResumePlayback = false;
/** The position the store must hold while a seek/load is still travelling to
 *  it. Set by both `seek()` and `load()` (to their target/startAt) and
 *  released by `timeupdate` once the element genuinely arrives.
 *
 * This is the root fix for "drag forward → song jumps back to the previous
 * position": mid-drag/sec transient `timeupdate` reports (pre-seek timestamps,
 * the element's 0 after `el.src = ''` during a reload, etc.) can never stomp
 * the pinned position, so the progress bar and the audible playback stay
 * locked to the timestamp the user actually picked. */
let positionHold: number | null = null;
let seekCheckTimer: number | undefined;
/** Monotonic id for the latest explicit seek. Older verification callbacks
 *  compare against it and bail, so a stale drag can never reload or move the
 *  position after the user has picked a newer timestamp. */
let seekEpoch = 0;
/** While a track has just ended, keep the "Song ended" state alive across the
 *  auto-advance load so it is actually visible. The next track's `playing`
 *  event (a real new song starting) clears it immediately. */
let endedGraceUntil = 0;
/** True while the user is actively dragging a seek bar. A verification timer
 *  must never reload the stream mid-drag — that disables the range input and
 *  aborts the native drag, leaving the song at an intermediate position. */
let seekDragging = false;
/** Wall-clock start of the current drag, used to recover if a pointer-up is
 *  ever missed (e.g. the bar unmounts mid-drag). Without this a stuck flag
 *  would loop the verification timer forever and block future seeks. */
let seekDraggingSince = 0;

/** Called on pointer down for a seek bar. */
export function beginSeekDrag() {
  seekDragging = true;
  seekDraggingSince = Date.now();
}

/** Called on pointer up / cancel for a seek bar. */
export function endSeekDrag() {
  seekDragging = false;
}
let recorded = false;
let playbackStartedAt = 0;
let lastPositionUpdate = 0;
let lastPersist = 0;
let persistTimer: number | undefined;
let volumeTimer: number | undefined;
let discordTimer: number | undefined;
let shuffleBackup: { queue: Track[]; index: number } | null = null;
let errorRetries = 0;
let mediaHandlersBound = false;

function mediaArtwork(track: Track | undefined) {
  if (!track?.thumbnail) return [];
  return [
    { src: track.thumbnail, sizes: '96x96', type: 'image/jpeg' },
    { src: track.thumbnail, sizes: '256x256', type: 'image/jpeg' },
    { src: track.thumbnail, sizes: '512x512', type: 'image/jpeg' },
  ];
}

function updateMediaSession(track: Track | undefined, playing: boolean) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = track
      ? new MediaMetadata({
          title: track.title,
          artist: (track.artists || []).map((artist) => artist.name).join(', '),
          album: track.album?.name || 'Auralis',
          artwork: mediaArtwork(track),
        })
      : null;
    navigator.mediaSession.playbackState = track ? (playing ? 'playing' : 'paused') : 'none';
  } catch {
    // Media Session is best-effort.
  }
}

function updatePositionState() {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  const state = usePlayerStore.getState();
  if (!state.duration || !Number.isFinite(state.duration)) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: state.duration,
      position: Math.min(state.position, state.duration),
      playbackRate: state.rate || 1,
    });
  } catch {
    // ignore
  }
}

/**
 * YouTube Music occasionally omits `thumbnail` (and sometimes `duration`)
 * from the renderer a track came from — playlist panels and search rows for
 * region/age-restricted videos are the two known cases. When metadata is
 * missing, ask the watch endpoint for the track's own metadata once and
 * merge it into the live queue, the current track and the local library
 * mirrors (recent / liked / downloads) so the player bar, Explore hero,
 * Now Playing and the recent lists all settle on the same real cover.
 *
 * Never blocks playback: a no-op when the track already carries artwork, and
 * silent on network failure (the `Artwork` fallback covers that case, which
 * is the only legitimate time to show one).
 */
async function hydrateMissingMetadata(
  track: Track,
  isCurrent: () => boolean,
): Promise<void> {
  if (track.thumbnail && track.duration > 0) return;
  try {
    const result = await window.auralis.yt.next({ videoId: track.id });
    if (!isCurrent()) return;
    const remote =
      (result?.tracks || []).find((item) => item?.id === track.id) ||
      (result?.tracks || [])[0];
    if (!remote) return;
    const patch: Partial<Track> = {};
    if (!track.thumbnail && remote.thumbnail) patch.thumbnail = remote.thumbnail;
    if (!(track.duration > 0) && remote.duration > 0) patch.duration = remote.duration;
    if (!(track.artists?.length > 0) && remote.artists?.length) patch.artists = remote.artists;
    if (!track.album?.name && remote.album?.name) patch.album = remote.album;
    if (Object.keys(patch).length === 0) return;
    const patchTrack = (item: Track) =>
      item?.id === track.id ? { ...item, ...patch } : item;
    usePlayerStore.setState({
      queue: usePlayerStore.getState().queue.map(patchTrack),
      current: patchTrack(usePlayerStore.getState().current ?? track),
    });
    const current = usePlayerStore.getState().current;
    if (current) updateMediaSession(current, Boolean(usePlayerStore.getState().playing));
    // Keep the local library mirrors in sync so Recently Played / Liked /
    // Downloads show the same cover without waiting for the next refresh.
    // Functional update — never clobber a concurrent library write.
    useAppStore.setState((state) => ({
      library: {
        ...state.library,
        recent: state.library.recent.map(patchTrack),
        liked: state.library.liked.map(patchTrack),
        downloads: state.library.downloads.map((item) =>
          item?.track?.id === track.id ? { ...item, track: { ...item.track, ...patch } } : item,
        ),
      },
    }));
  } catch {
    // Best-effort hydration; the artwork fallback covers the rest.
  }
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'auto';
  audio.crossOrigin = 'anonymous';
  audio.setAttribute('playsinline', 'true');
  attachAudioListeners();
  return audio;
}

/** The media element advances at ~60 Hz; lyric highlighting can read it directly. */
export function getAudioPosition(): number {
  const value = audio?.currentTime;
  return Number.isFinite(value) ? (value as number) : 0;
}

/** True while a seek/load is still travelling to its optimistic target. */
export function isSeeking(): boolean {
  return seekInFlight || positionHold !== null;
}

let spectrumBuffer: Uint8Array<ArrayBuffer> | null = null;
let waveformBuffer: Uint8Array<ArrayBuffer> | null = null;

/** Live frequency data for the sidebar visualizer (null until audio graph is ready). */
export function getAudioSpectrum(): Uint8Array<ArrayBuffer> | null {
  if (!analyserNode) return null;
  if (!spectrumBuffer || spectrumBuffer.length !== analyserNode.frequencyBinCount) {
    spectrumBuffer = new Uint8Array(analyserNode.frequencyBinCount);
  }
  analyserNode.getByteFrequencyData(spectrumBuffer);
  return spectrumBuffer;
}

/** Overall time-domain loudness (0–1), used for beat-accurate bar punches. */
export function getAudioEnergy(): number {
  if (!analyserNode) return 0;
  if (!waveformBuffer || waveformBuffer.length !== analyserNode.fftSize) {
    waveformBuffer = new Uint8Array(analyserNode.fftSize);
  }
  analyserNode.getByteTimeDomainData(waveformBuffer);
  let sum = 0;
  for (let i = 0; i < waveformBuffer.length; i++) {
    const sample = (waveformBuffer[i] - 128) / 128;
    sum += sample * sample;
  }
  return Math.min(1, Math.sqrt(sum / waveformBuffer.length) * 3.6);
}

function buildGraph() {
  if (graphAttempted || !audio) return;
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    audioContext = new Ctor();
    sourceNode = audioContext.createMediaElementSource(audio);
    preampNode = audioContext.createGain();
    bassNode = audioContext.createBiquadFilter();
    bassNode.type = 'lowshelf';
    bassNode.frequency.value = 80;
    bassNode.gain.value = 0;
    compressorNode = audioContext.createDynamicsCompressor();
    limiterNode = audioContext.createDynamicsCompressor();
    limiterNode.threshold.value = -1;
    limiterNode.knee.value = 0;
    limiterNode.ratio.value = 20;
    limiterNode.attack.value = 0.003;
    limiterNode.release.value = 0.12;
    masterNode = audioContext.createGain();
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.smoothingTimeConstant = 0.55;
    analyserNode.minDecibels = -88;
    analyserNode.maxDecibels = -12;
    eqNodes = EQ_FREQUENCIES.map((frequency) => {
      const filter = audioContext!.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = frequency;
      filter.Q.value = 1.4;
      filter.gain.value = 0;
      return filter;
    });
    sourceNode.connect(preampNode);
    preampNode.connect(bassNode);
    let node: AudioNode = bassNode;
    for (const filter of eqNodes) {
      node.connect(filter);
      node = filter;
    }
    node.connect(compressorNode);
    compressorNode.connect(limiterNode);
    limiterNode.connect(masterNode);
    masterNode.connect(analyserNode);
    analyserNode.connect(audioContext.destination);
    graphAttempted = true;
    applyDsp(useAppStore.getState().settings);
  } catch {
    audioContext = null;
    sourceNode = null;
    preampNode = null;
    bassNode = null;
    compressorNode = null;
    limiterNode = null;
    masterNode = null;
    analyserNode = null;
    eqNodes = [];
  }
}

function applyDsp(settings: Settings) {
  const enabled = settings.eq.enabled;
  if (preampNode && audioContext) {
    preampNode.gain.setTargetAtTime(Math.pow(10, (enabled ? settings.eq.preamp : 0) / 20), audioContext.currentTime, 0.02);
  }
  if (bassNode && audioContext) {
    bassNode.gain.setTargetAtTime(enabled ? settings.eq.bassBoost || 0 : 0, audioContext.currentTime, 0.03);
  }
  eqNodes.forEach((filter, index) => {
    const gain = enabled ? settings.eq.bands[index] || 0 : 0;
    filter.gain.setTargetAtTime(gain, audioContext?.currentTime || 0, 0.03);
  });
  if (compressorNode && audioContext) {
    const normalize = settings.normalize;
    compressorNode.threshold.setTargetAtTime(normalize ? -24 : 0, audioContext.currentTime, 0.05);
    compressorNode.knee.setTargetAtTime(normalize ? 30 : 0, audioContext.currentTime, 0.05);
    compressorNode.ratio.setTargetAtTime(normalize ? 4 : 1, audioContext.currentTime, 0.05);
    compressorNode.attack.setTargetAtTime(normalize ? 0.004 : 0.003, audioContext.currentTime, 0.05);
    compressorNode.release.setTargetAtTime(0.25, audioContext.currentTime, 0.05);
  }
  if (masterNode && audioContext) {
    // Automatic headroom: if the user boosts bands, reduce the master gain
    // by the same amount so the limiter is a safety net rather than the sound.
    const maxBoost = enabled
      ? Math.max(0, settings.eq.preamp, settings.eq.bassBoost || 0, ...settings.eq.bands)
      : 0;
    masterNode.gain.setTargetAtTime(Math.pow(10, -maxBoost / 20), audioContext.currentTime, 0.03);
  }
}

function playableTrack(track: Track): Track {
  if (track.localPath) return track;
  const download = useAppStore.getState().library.downloads.find(
    (item) => item.track.id === track.id && item.status === 'done' && item.path,
  );
  if (download?.path) return { ...track, localPath: download.path, source: 'download' };
  return track;
}

function persistNow() {
  const state = usePlayerStore.getState();
  if (!state.queue.length) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  const payload = {
    queue: state.queue,
    index: state.index,
    position: state.position,
    radio: state.radio,
    radioSeed: state.radioSeed,
    radioContinuation: state.radioContinuation,
    repeat: state.repeat,
    shuffle: state.shuffle,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // storage may be full with huge queues; pruning thumbnails is not worth it here
  }
  lastPersist = Date.now();
}

function schedulePersist() {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(persistNow, 700);
}

function finalizePlayback(completed = false) {
  const state = usePlayerStore.getState();
  if (!state.current || recorded) return;
  const listened = Math.max(state.position, audio?.currentTime || 0);
  if (listened < 4) return;
  recorded = true;
  const duration = state.duration || state.current.duration || 0;
  const isComplete = completed || (duration > 0 && listened >= duration * 0.9);
  useAppStore.getState().recordEvent(state.current, isComplete).catch(() => {});
  const settings = useAppStore.getState().settings;
  if (
    settings.lastfm.enabled &&
    settings.lastfm.scrobble &&
    settings.lastfm.sessionKey &&
    listened >= Math.min(duration * (settings.scrobbleThreshold || 0.5), 240)
  ) {
    window.auralis.lastfm.scrobble(state.current, playbackStartedAt || Date.now() - listened * 1000).catch(() => {});
  }
}

function notifyDiscord() {
  const state = usePlayerStore.getState();
  window.clearTimeout(discordTimer);
  discordTimer = window.setTimeout(() => {
    window.auralis.discord.update(state.current || null, state.playing).catch(() => {});
  }, 900);
}

function clearBufferWatch() {
  window.clearTimeout(bufferWatchTimer);
  bufferWatchTimer = undefined;
}

/** Brief network hiccups are normal; don't flash the player spinner for every
 *  `waiting` event. Only surface buffering once playback has actually been
 *  stalled for a moment. */
function clearBufferingUi() {
  window.clearTimeout(bufferingUiTimer);
  bufferingUiTimer = undefined;
  if (usePlayerStore.getState().buffering) {
    usePlayerStore.setState({ buffering: false });
  }
}

function markBuffering() {
  if (bufferingUiTimer) return;
  const state = usePlayerStore.getState();
  if (!state.playing || !audio || audio.paused) return;
  bufferingUiTimer = window.setTimeout(() => {
    bufferingUiTimer = undefined;
    const current = usePlayerStore.getState();
    if (!current.playing || !audio || audio.paused) return;
    usePlayerStore.setState({ buffering: true });
    armBufferWatch();
  }, 900);
}

function armBufferWatch() {
  clearBufferWatch();
  bufferWatchTimer = window.setTimeout(() => {
    bufferWatchTimer = undefined;
    const state = usePlayerStore.getState();
    // Ignore the short wait that happens while the initial stream is being
    // opened. Only recover when playback has actually stalled.
    if (!state.buffering || !state.playing || !state.current || !audio || audio.paused) return;
    if (bufferRetries >= 3) return;
    bufferRetries += 1;
    const position = Math.max(0, audio.currentTime || state.position);
    console.warn('[auralis] playback stalled; retrying the stream', {
      trackId: state.current.id,
      position,
      attempt: bufferRetries,
    });
    retryCurrent?.();
  }, 6_000);
}

function attachAudioListeners() {
  if (!audio) return;
  audio.addEventListener('loadedmetadata', () => {
    if (!audio) return;
    const state = usePlayerStore.getState();
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      usePlayerStore.setState({ duration: audio.duration });
    }
    if (pendingSeek !== 0) {
      // Always honour a pending seek target. Clamp only against a known
      // finite duration — some proxy streams report Infinity duration, and
      // skipping the seek there made playback restart from ~0 (the classic
      // "drag forward, song jumps back" symptom).
      const clampedSeek = Number.isFinite(audio.duration) && audio.duration > 0
        ? Math.min(pendingSeek, Math.max(0, audio.duration - 0.5))
        : pendingSeek;
      try { audio.currentTime = clampedSeek; } catch { /* best effort */ }
      pendingSeek = 0;
    }
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
      // Probe duration via progress / timeupdate when it lands.
      usePlayerStore.setState({ loading: false, buffering: false });
      updatePositionState();
      return;
    }
    // Start (or resume) playback from `pendingSeek` when the caller asked for it.
    if (!audio.paused || state.playing) audio.play().catch(() => {});
    updatePositionState();
    void state;
  });
  audio.addEventListener('progress', () => {
    if (!audio) return;
    try {
      const ranges = audio.buffered;
      if (ranges.length) usePlayerStore.setState({ buffered: ranges.end(ranges.length - 1) });
    } catch {
      // buffered ranges are not available for every stream
    }
  });
  audio.addEventListener('durationchange', () => {
    if (!audio || !Number.isFinite(audio.duration)) return;
    usePlayerStore.setState({ duration: audio.duration });
    updatePositionState();
  });
  audio.addEventListener('timeupdate', () => {
    if (!audio) return;
    const state = usePlayerStore.getState();
    const position = audio.currentTime || 0;
    const duration = Number.isFinite(audio.duration) ? audio.duration : state.duration;
    // While a seek/load is still travelling to its target (`positionHold`),
    // the element reports stale timestamps — most notably 0 right after a
    // reload clears `el.src` mid-resolve. Never let those reports overwrite
    // the pinned position; that feedback loop is exactly what made the song
    // visibly jump back to its previous position after dragging. Release the
    // hold only once the element genuinely arrives at the target.
    if (positionHold !== null) {
      if (Math.abs(position - positionHold) <= 1) {
        positionHold = null;
      } else {
        usePlayerStore.setState({ duration });
        return;
      }
    } else if (seekInFlight) {
      usePlayerStore.setState({ duration });
      return;
    }
    usePlayerStore.setState({ position, duration });
    if (Date.now() - lastPositionUpdate > 1000) {
      lastPositionUpdate = Date.now();
      updatePositionState();
    }
    if (Date.now() - lastPersist > 5000) schedulePersist();
  });
  audio.addEventListener('play', () => {
    clearBufferingUi();
    usePlayerStore.setState({ playing: true, buffering: false, error: undefined });
    updateMediaSession(usePlayerStore.getState().current, true);
    updatePositionState();
    notifyDiscord();
  });
  audio.addEventListener('pause', () => {
    clearBufferWatch();
    clearBufferingUi();
    usePlayerStore.setState({ playing: false, buffering: false });
    updateMediaSession(usePlayerStore.getState().current, false);
    updatePositionState();
    notifyDiscord();
  });
  audio.addEventListener('seeked', () => {
    if (!audio) return;
    if (!seekInFlight && positionHold === null) {
      // The browser can pause the element while a seek near the end is still
      // landing (the `pause` event clears the store's playing flag). The
      // seek intent flag survives that event, so resume here when playback
      // was active for the seek.
      if (seekResumePlayback && audio.paused) void audio.play().catch(() => {});
      updatePositionState();
      return;
    }
    // Confirm we are actually at the target for a hold to make sense (a hold
    // can also come from a mid-drag error retry reload).
    const arrived = Math.abs((audio.currentTime || 0) - seekTarget) <= 1;
    if (arrived) {
      seekInFlight = false;
      positionHold = null;
      window.clearTimeout(seekCheckTimer);
      seekCheckTimer = undefined;
      if (audio) usePlayerStore.setState({ position: audio.currentTime || 0 });
      if (seekResumePlayback && audio.paused) void audio.play().catch(() => {});
    }
    updatePositionState();
  });
  audio.addEventListener('waiting', () => {
    markBuffering();
  });
  audio.addEventListener('stalled', () => {
    const state = usePlayerStore.getState();
    if (!state.playing) return;
    markBuffering();
  });
  audio.addEventListener('playing', () => {
    clearBufferWatch();
    clearBufferingUi();
    bufferRetries = 0;
    // A new song has actually started — clear the "Song ended" state.
    endedGraceUntil = 0;
    usePlayerStore.setState({ buffering: false, loading: false, playing: true, ended: false });
    updatePositionState();
  });
  audio.addEventListener('canplay', () => {
    clearBufferWatch();
    clearBufferingUi();
    usePlayerStore.setState({ loading: false, buffering: false });
  });
  audio.addEventListener('ended', () => {
    clearBufferWatch();
    clearBufferingUi();
    const state = usePlayerStore.getState();
    if (audio) {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      const position = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      const tolerance = Math.max(3, Math.min(10, duration * 0.08));
      // A truncated proxy response can look like a real end-of-track to the
      // media element. Retry once near the current position instead of
      // silently skipping to the next song.
      if (state.current && duration > 0 && position > 0 && position < duration - tolerance && errorRetries < 1) {
        const token = loadToken;
        errorRetries += 1;
        console.warn('[auralis] stream ended early; retrying the current track', {
          trackId: state.current.id,
          position,
          duration,
        });
        retryCurrent?.();
        if (loadToken !== token) return;
      }
    }
    finalizePlayback(true);
    pendingSeek = 0;
    // Mark the track as finished so the lyrics panel can show the
    // "Song ended" indicator. Loading the next track clears it.
    endedGraceUntil = Date.now() + 2500;
    usePlayerStore.setState({ ended: true, playing: false });
    if (state.sleepTimerEndOfTrack) {
      usePlayerStore.setState({ sleepTimerEndOfTrack: false, sleepTimerEnd: undefined });
      useUiStore.getState().toast('Sleep timer ended at the end of the track. Playback paused.', 'info');
      return;
    }
    if (state.repeat === 'one') {
      recorded = false;
      playbackStartedAt = Date.now();
      seekInFlight = false;
      positionHold = null;
      seekTarget = 0;
      if (audio) {
        audio.currentTime = 0;
        usePlayerStore.setState({ ended: false, position: 0 });
        void audio.play();
      }
      return;
    }
    state.next(true);
  });
  audio.addEventListener('error', () => {
    clearBufferWatch();
    clearBufferingUi();
    seekInFlight = false;
    if (!audio || !audio.src) return;
    if (!activeSrc || audio.src !== activeSrc) return;
    const state = usePlayerStore.getState();
    if (!state.current) return;
    if (errorRetries < 1) {
      errorRetries++;
      const track = state.current;
      window.auralis.player.invalidate(track.id).catch(() => {});
      window.setTimeout(() => {
        const current = usePlayerStore.getState();
        if (current.current?.id === track.id) retryCurrent?.();
      }, 700);
      return;
    }
    usePlayerStore.setState({
      loading: false,
      buffering: false,
      playing: false,
      error: 'Could not play this track. Try a different audio quality or update yt-dlp in Settings → About.',
    });
    useUiStore.getState().toast(`Playback failed for “${state.current.title}”.`, 'error');
  });
}

function setupMediaSession() {
  if (mediaHandlersBound || !('mediaSession' in navigator)) return;
  mediaHandlersBound = true;
  const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
    ['play', () => usePlayerStore.getState().play()],
    ['pause', () => usePlayerStore.getState().pause()],
    ['previoustrack', () => usePlayerStore.getState().previous()],
    ['nexttrack', () => usePlayerStore.getState().next()],
    ['stop', () => usePlayerStore.getState().stop()],
    ['seekbackward', (details) => usePlayerStore.getState().seekBy(-(details.seekOffset || 10))],
    ['seekforward', (details) => usePlayerStore.getState().seekBy(details.seekOffset || 10)],
    ['seekto', (details) => {
      if (typeof details.seekTime === 'number') usePlayerStore.getState().seek(details.seekTime);
    }],
  ];
  for (const [action, handler] of handlers) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // action unsupported
    }
  }
}

function bindKeyboard() {
  window.addEventListener('keydown', (event) => {
    if (isTypingTarget(event.target) || event.altKey || event.metaKey) return;
    if (event.code === 'Space') {
      event.preventDefault();
      usePlayerStore.getState().toggle();
    } else if (event.key === 'ArrowRight' && event.ctrlKey) {
      event.preventDefault();
      usePlayerStore.getState().next();
    } else if (event.key === 'ArrowLeft' && event.ctrlKey) {
      event.preventDefault();
      usePlayerStore.getState().previous();
    } else if (event.key === 'ArrowRight') {
      usePlayerStore.getState().seekBy(5);
    } else if (event.key === 'ArrowLeft') {
      usePlayerStore.getState().seekBy(-5);
    } else if (event.key.toLowerCase() === 'm') {
      usePlayerStore.getState().toggleMute();
    } else if (event.key.toLowerCase() === 'l') {
      const current = usePlayerStore.getState().current;
      if (current) {
        useAppStore.getState().toggleLike(current).catch(() => {});
      }
    }
  });
}

function restoreSession() {
  const saved = safeJson<{
    queue: Track[];
    index: number;
    position: number;
    radio: boolean;
    radioSeed?: string;
    radioContinuation?: string;
    repeat: RepeatMode;
    shuffle: boolean;
  } | null>(localStorage.getItem(STORAGE_KEY), null);
  if (!saved || !Array.isArray(saved.queue) || !saved.queue.length) return;
  const index = Math.min(Math.max(0, saved.index || 0), saved.queue.length - 1);
  const track = saved.queue[index];
  pendingSeek = Math.max(0, saved.position || 0);
  usePlayerStore.setState({
    queue: saved.queue,
    index,
    current: track,
    duration: track.duration || 0,
    position: pendingSeek,
    buffered: pendingSeek,
    radio: Boolean(saved.radio),
    radioSeed: saved.radioSeed,
    radioContinuation: saved.radioContinuation,
    repeat: saved.repeat || 'off',
    shuffle: Boolean(saved.shuffle),
    ended: false,
  });
  updateMediaSession(track, false);
  void hydrateMissingMetadata(track, () => usePlayerStore.getState().current?.id === track.id);
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  const load = async (
    track: Track,
    autoplay = true,
    startAt = 0,
    isRetry = false,
  ) => {
    clearBufferWatch();
    clearBufferingUi();
    window.clearTimeout(lyricsTimer);
    lyricsTimer = undefined;
    if (!isRetry) {
      finalizePlayback(false);
      errorRetries = 0;
      bufferRetries = 0;
    }
    const el = ensureAudio();
    const playable = playableTrack(track);
    buildGraph();
    if (analyserNode) {
      // Ensure the media element source path is live before setting src.
      void audioContext?.resume();
    }
    window.clearTimeout(prefetchTimer);
    prefetchTimer = undefined;
    // A fresh load supersedes any in-flight seek: cancel its verification
    // timer so a stale drag position can never force a reload of this track.
    window.clearTimeout(seekCheckTimer);
    seekCheckTimer = undefined;
    seekInFlight = false;
    seekDragging = false;
    // Invalidate any in-flight seek verification from the previous track.
    seekEpoch += 1;
    // Pin the store position to this load's startAt until the element
    // genuinely arrives there. Without the pin, transient `timeupdate`
    // reports (e.g. 0 right after `el.src = ''` below, or a mid-drag
    // error/retry reload) overwrite the target and playback visibly jumps
    // back to the previous timestamp.
    positionHold = startAt;
    loadToken++;
    const token = loadToken;
    recorded = false;
    playbackStartedAt = Date.now();
    pendingSeek = startAt;
    // A fresh load owns the resume intent (autoplay) so a previous track's
    // seek can never resurrect playback after a track change. The intent can
    // still be changed while the stream resolves by pressing play/pause.
    // Retries reuse the current intent so a paused track stays paused.
    loadAutoplayIntent = isRetry ? loadAutoplayIntent : autoplay;
    seekResumePlayback = loadAutoplayIntent;
    activeSrc = '';
    // Drop any previous source immediately so the old track cannot bleed
    // through while the new stream is being resolved.
    el.src = '';
    el.pause();
    set({
      current: playable,
      loading: true,
      playing: false,
      buffering: false,
      position: startAt,
      buffered: startAt,
      duration: track.duration || 0,
      error: undefined,
      streamFormat: undefined,
      ended: Date.now() < endedGraceUntil ? get().ended : false,
    });
    updateMediaSession(playable, false);
    updatePositionState();
    schedulePersist();
    useAppStore.getState().addRecent(track).catch(() => {});
    // If the API left this track without artwork, backfill it from the watch
    // endpoint so the bar/hero/Now Playing flip from the fallback to the real
    // cover the moment it arrives.
    void hydrateMissingMetadata(track, () => loadToken === token && get().current?.id === track.id);
    const settings = useAppStore.getState().settings;
    if (settings.lastfm.enabled && settings.lastfm.nowPlaying && settings.lastfm.sessionKey) {
      window.auralis.lastfm.nowPlaying(track).catch(() => {});
    }
    notifyDiscord();
    try {
      // A stalled stream URL is often already expired or throttled. Drop it
      // before resolving again so the retry does not receive the same URL.
      if (isRetry) await window.auralis.player.invalidate(track.id).catch(() => {});
      const stream = await window.auralis.player.resolve(playable);
      if (token !== loadToken || get().current?.id !== track.id) return;
      audioContext?.resume().catch(() => {});
      el.src = stream.url;
      activeSrc = stream.url;
      el.playbackRate = settings.playbackRate || 1;
      el.volume = settings.muted ? 0 : settings.volume;
      el.muted = settings.muted;
      set({ streamFormat: stream.format });
      if (autoplay && loadAutoplayIntent) {
        try {
          if (audioContext?.state !== 'running') {
            try {
              await audioContext?.resume();
            } catch {
              // best effort — context may already be running
            }
          }
          await el.play();
        } catch (error: any) {
          set({ playing: false, loading: false, error: error?.message || 'Playback was blocked.' });
        }
      } else {
        set({ loading: false, playing: false, buffering: false });
      }
      lyricsTimer = window.setTimeout(() => {
        const current = usePlayerStore.getState();
        if (current.current?.id === track.id) void prefetchLyrics(playable);
      }, 700);
      const nextIndex = get().index + 1;
      const nextTrack = get().queue[nextIndex];
      if (nextTrack) {
        prefetchTimer = window.setTimeout(() => {
          const current = usePlayerStore.getState();
          if (current.queue[current.index + 1]?.id === nextTrack.id) {
            const next = playableTrack(nextTrack);
            // Resolve the URL for a fast fallback and, in parallel, place the
            // complete track in the local stream cache. If the cache wins, the
            // next transition never touches the network at all.
            void window.auralis.player.prefetch(next).catch(() => {});
            void window.auralis.player.cache(next).catch(() => {});
          }
        }, 250);
      }
    } catch (error: any) {
      if (token !== loadToken) return;
      const state = get();
      const nextIndex = state.index + 1;
      // If this track cannot be resolved and there is another track in the
      // queue, skip straight to it instead of stopping playback.
      if (nextIndex < state.queue.length) {
        set({ index: nextIndex, error: undefined });
        void load(state.queue[nextIndex], true, 0);
        return;
      }
      set({
        loading: false,
        playing: false,
        error: error?.message || 'Could not resolve this track.',
      });
      useUiStore.getState().toast(`Could not play “${track.title}”: ${error?.message || error}`, 'error');
    }
  };

  retryCurrent = () => {
    const state = get();
    if (!state.current) return;
    // A user seek/drag is active: the seek machinery (verification timer +
    // pendingSeek on loadedmetadata) owns recovery right now. A retry here
    // would reset the element (`el.src = ''`), abort the in-flight native
    // drag, and freeze progress at an intermediate timestamp — the exact
    // "drag, then it jumps back" loop. Defer entirely to the seek path.
    if (seekInFlight || positionHold !== null) return;
    // Retry from the store position (which equals the element's position
    // whenever no hold is active), never from the element's transient value.
    const resumeAt = state.position || audio?.currentTime || 0;
    void load(state.current, true, Math.max(0, resumeAt), true);
  };

  const radioTracksForQueue = (tracks: Track[]) => {
    // Keep the shuffle backup in sync so turning shuffle off does not drop
    // the radio tracks that were appended while shuffle was on.
    if (shuffleBackup) shuffleBackup.queue = [...shuffleBackup.queue, ...tracks];
    return get().shuffle ? shuffleArray(tracks) : tracks;
  };

  const appendRadioPage = async (
    seed: string,
    continuation?: string,
  ): Promise<'added' | 'ended' | 'busy' | 'stale' | 'error'> => {
    if (get().radioLoading) return 'busy';
    set({ radioLoading: true });
    let nextToken = continuation;
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await window.auralis.yt.next(
          { videoId: seed, playlistId: `RDAMVM${seed}` },
          nextToken,
        );
        if (get().radioSeed !== seed) return 'stale';
        const existing = new Set(get().queue.map((track) => track.id));
        const extra = result.tracks.filter((track) => {
          if (existing.has(track.id)) return false;
          existing.add(track.id);
          return true;
        });
        nextToken = result.continuation;
        if (!extra.length) {
          if (!nextToken) break;
          continue;
        }
        const queue = [...get().queue, ...radioTracksForQueue(extra)];
        const nextIndex = get().index + 1;
        set({
          queue,
          index: nextIndex,
          radio: true,
          radioSeed: seed,
          radioContinuation: nextToken,
          radioLoading: false,
        });
        void load(queue[nextIndex], true, 0);
        persistNow();
        return 'added';
      }
      set({ radioLoading: false, radioContinuation: nextToken });
      return 'ended';
    } catch (error: any) {
      set({ radioLoading: false });
      useUiStore.getState().toast(`Could not load related songs: ${error?.message || error}`, 'error');
      return 'error';
    }
  };

  return {
    queue: [],
    index: 0,
    current: undefined,
    playing: false,
    loading: false,
    buffering: false,
    position: 0,
    duration: 0,
    buffered: 0,
    volume: 0.9,
    muted: false,
    rate: 1,
    repeat: 'off',
    shuffle: false,
    radio: false,
    radioSeed: undefined,
    radioContinuation: undefined,
    radioLoading: false,
    sleepTimerEnd: undefined,
    sleepTimerEndOfTrack: false,
    error: undefined,
    streamFormat: undefined,
    ended: false,

    init: () => {
      if (initialized) return;
      initialized = true;
      const settings = useAppStore.getState().settings;
      const el = ensureAudio();
      el.volume = settings.volume;
      el.muted = settings.muted;
      el.playbackRate = settings.playbackRate;
      set({ volume: settings.volume, muted: settings.muted, rate: settings.playbackRate });
      buildGraph();
      restoreSession();
      setupMediaSession();
      bindKeyboard();

      window.auralis.events.onMediaKey((key) => {
        if (key === 'play-pause') get().toggle();
        else if (key === 'next') get().next();
        else if (key === 'previous') get().previous();
        else if (key === 'stop') get().stop();
        else if (key === 'like') {
          const track = get().current;
          if (track) {
            void useAppStore
              .getState()
              .toggleLike(track)
              .then((liked) => useUiStore.getState().toast(liked ? 'Added to liked songs.' : 'Removed from liked songs.', 'success'))
              .catch((error: any) => useUiStore.getState().toast(`Could not update liked songs: ${error?.message || error}`, 'error'));
          }
        }
      });

      useAppStore.subscribe((state, previous) => {
        if (state.settings === previous.settings) return;
        const current = state.settings;
        if (audio) {
          audio.volume = current.muted ? 0 : current.volume;
          audio.muted = current.muted;
          audio.playbackRate = current.playbackRate || 1;
        }
        set({ volume: current.volume, muted: current.muted, rate: current.playbackRate || 1 });
        applyDsp(current);
        if (state.settings.discord.enabled !== previous.settings.discord.enabled) notifyDiscord();
      });

      window.addEventListener('beforeunload', () => {
        finalizePlayback(false);
        persistNow();
      });
    },

    playQueue: (tracks, startIndex = 0, options = {}) => {
      const list = tracks.filter((track) => track && track.id);
      if (!list.length) return;
      let queue = list;
      let index = Math.min(Math.max(0, startIndex), list.length - 1);
      if (get().shuffle) {
        const current = list[index];
        queue = [current, ...shuffleArray(list.filter((_, itemIndex) => itemIndex !== index))];
        index = 0;
        shuffleBackup = { queue: list, index: Math.min(Math.max(0, startIndex), list.length - 1) };
      } else {
        shuffleBackup = null;
      }
      set({
        queue,
        index,
        radio: Boolean(options.radio),
        radioSeed: options.seed,
        radioContinuation: undefined,
        radioLoading: false,
      });
      const startAt = options.startAt || 0;
      void load(queue[index], true, startAt);
      persistNow();
    },

    playTrack: (track) => {
      get().playQueue([track], 0);
    },

    startRadio: async (track) => {
      const player = get();
      if (player.current?.id === track.id && player.radio && player.radioSeed === track.id && player.radioLoading) return;
      useUiStore.getState().toast(`Starting radio for “${track.title}”…`);
      get().playQueue([track], 0, { radio: true, seed: track.id });
      set({ radioLoading: true });
      try {
        const result = await window.auralis.yt.next({
          videoId: track.id,
          playlistId: `RDAMVM${track.id}`,
        });
        if (get().radioSeed !== track.id) return;
        const existing = new Set(get().queue.map((item) => item.id));
        const extra = result.tracks.filter((item) => {
          if (existing.has(item.id)) return false;
          existing.add(item.id);
          return true;
        });
        set({
          queue: [...get().queue, ...radioTracksForQueue(extra)],
          radioContinuation: result.continuation,
          radioLoading: false,
        });
        schedulePersist();
        const nextTrack = get().queue[get().index + 1];
        if (nextTrack) {
          window.setTimeout(() => {
            const next = playableTrack(nextTrack);
            void window.auralis.player.prefetch(next).catch(() => {});
            void window.auralis.player.cache(next).catch(() => {});
          }, 1200);
        }
      } catch (error: any) {
        set({ radioLoading: false });
        useUiStore.getState().toast(`Radio is starting from this song only: ${error?.message || error}`, 'error');
      }
    },

    playAt: (index) => {
      const { queue } = get();
      if (index < 0 || index >= queue.length) return;
      set({ index });
      void load(queue[index], true, 0);
      persistNow();
    },

    toggle: () => {
      const state = get();
      if (state.loading) {
        // A stream can take a moment to resolve. Remember the user's intent
        // instead of ignoring the button, so pressing pause while loading
        // keeps the track paused when it arrives.
        loadAutoplayIntent = !loadAutoplayIntent;
        seekResumePlayback = loadAutoplayIntent;
        return;
      }
      if (state.playing) {
        get().pause();
        return;
      }
      if (state.current && audio?.src) {
        get().play();
        return;
      }
      if (state.queue.length) {
        void load(state.current || state.queue[state.index] || state.queue[0], true, state.position || pendingSeek);
        return;
      }
      useUiStore.getState().toast('Nothing in the queue yet. Pick a song to start listening.');
    },

    play: () => {
      loadAutoplayIntent = true;
      const state = get();
      if (state.current && audio?.src) {
        if (audioContext?.state !== 'running') {
          audioContext?.resume().catch(() => {});
        }
        // Pressing play after the track ended restarts it from the top.
        if (state.ended || (Number.isFinite(audio.duration) && audio.duration > 0 && audio.currentTime >= audio.duration - 0.25)) {
          get().seek(0);
        }
        set({ ended: false });
        if (audio.paused || audio.readyState < 1) {
          audio.play().then(() => {}).catch((error) => {
            set({ error: error?.message || 'Playback failed.' });
          });
        }
      } else {
        get().toggle();
      }
    },

    pause: () => {
      // An intentional pause cancels resume-on-seek: a seek issued while
      // paused must stay paused (and must not be resurrected by arrival
      // callbacks).
      loadAutoplayIntent = false;
      seekResumePlayback = false;
      audio?.pause();
      finalizePlayback(false);
      schedulePersist();
    },

    next: (fromEnded = false) => {
      if (!fromEnded) finalizePlayback(false);
      const state = get();
      if (!state.queue.length) return;
      if (state.index + 1 < state.queue.length) {
        set({ index: state.index + 1 });
        void load(state.queue[state.index + 1], true, 0);
        persistNow();
        return;
      }
      if (state.radio && state.radioSeed) {
        if (state.radioLoading) return;
        void appendRadioPage(state.radioSeed, state.radioContinuation).then((result) => {
          if (result === 'ended' || result === 'error') {
            set({ playing: false, position: state.duration || state.position });
            if (audio) audio.currentTime = 0;
            if (result === 'ended') useUiStore.getState().toast('The radio station has ended.');
            persistNow();
          }
        });
        return;
      }
      if (state.repeat === 'all') {
        set({ index: 0 });
        void load(state.queue[0], true, 0);
        persistNow();
        return;
      }
      // Albums, playlists and one-off picks should not stop at their last
      // track. Seed a radio station from the track that just ended so the
      // listening session continues with related songs.
      const seed = state.current?.id || state.queue[state.index]?.id;
      if (seed) {
        set({ radio: true, radioSeed: seed });
        void appendRadioPage(seed).then((result) => {
          if (result === 'ended' || result === 'error') {
            set({ playing: false, position: state.duration || state.position });
            if (audio) audio.currentTime = 0;
            if (result === 'ended') useUiStore.getState().toast('No related songs were found.');
            persistNow();
          }
        });
        return;
      }
      set({ playing: false, position: state.duration || state.position });
      if (audio) audio.currentTime = 0;
      persistNow();
    },

    previous: () => {
      const state = get();
      if (state.position > 5 && audio) {
        get().seek(0);
        return;
      }
      if (state.index > 0) {
        const index = state.index - 1;
        set({ index });
        void load(state.queue[index], true, 0);
        persistNow();
      } else if (state.repeat === 'all' && state.queue.length) {
        const index = state.queue.length - 1;
        set({ index });
        void load(state.queue[index], true, 0);
      } else {
        get().seek(0);
      }
    },

    seek: (seconds) => {
      if (!Number.isFinite(seconds)) return;
      const duration = get().duration || (audio && Number.isFinite(audio.duration) ? audio.duration : 0) || 0;
      // Never clamp a legitimate seek to the very end of the track — the
      // media element cannot start playback from exactly `duration`.
      const upper = duration > 0 ? Math.max(0, duration - 0.25) : Number.MAX_SAFE_INTEGER;
      const target = Math.min(upper, Math.max(0, seconds));
      // Every seek gets a monotonic epoch. Async callbacks from an older
      // seek can then prove they are stale and must not touch the position,
      // the verification timer or the stream.
      const epoch = ++seekEpoch;
      // Stamp the intent first: while this seek is in flight, `timeupdate`
      // reports pre-seek timestamps and must not touch the store position.
      pendingSeek = target;
      seekTarget = target;
      seekInFlight = true;
      seekResumePlayback = get().playing;
      // Pin the store position to the target until the element genuinely
      // arrives there (see `positionHold`).
      positionHold = target;
      // Optimistic UI update so the bar lands on the selected timestamp now.
      set({ position: target, ended: false });

      // Drive the element whenever it already holds this track's stream. We
      // deliberately do NOT require `audio.seekable.length > 0`: Chromium
      // reports an empty seekable range until metadata settles, yet
      // assigning currentTime still starts the range fetch. Requiring it
      // here silently dropped fast forward seeks.
      const loading = get().loading;
      if (audio && !loading && audio.src && audio.readyState >= 1) {
        try { audio.currentTime = target; } catch { /* verified below */ }
      }

      // A single shared verification timer. Dragging resets it, so only the
      // final position is ever verified and no intermediate reloads stack up.
      window.clearTimeout(seekCheckTimer);
      const trackId = get().current?.id;
      const tokenAtSeek = loadToken;
      let waited = 0;
      const verifySeek = () => {
        seekCheckTimer = undefined;
        if (epoch !== seekEpoch) return;        // a newer seek owns position
        if (!audio) return;
        if (loadToken !== tokenAtSeek) return;  // a new track owns position
        const current = get().current;
        if (!current || current.id !== trackId) return;
        // Never reload while the user is still dragging. Keep the position
        // pinned and re-check shortly; the pointer-up handler re-stamps the
        // final target and schedules a fresh verification. Recover after a
        // long stall in case a pointer-up event was missed.
        if (seekDragging) {
          if (Date.now() - seekDraggingSince > 8000) {
            seekDragging = false;
          } else {
            seekCheckTimer = window.setTimeout(verifySeek, 400);
            return;
          }
        }
        const at = audio.currentTime || 0;
        if (Math.abs(at - target) <= 1) {
          seekInFlight = false;
          positionHold = null;
          set({ position: at });
          // A seek near the end can leave the element paused with no buffered
          // data to auto-resume from. If playback was active, resume
          // explicitly so the track plays out and `ended` fires normally.
          if (seekResumePlayback && audio.paused) void audio.play().catch(() => {});
          return;
        }
        // The element is still fetching the target byte range (or still
        // starting the stream). Reloading now would abort that range request
        // and reset the element to 0 — the exact jump-back the user reports.
        // Wait for the in-flight seek instead of destroying it.
        if (audio.seeking || audio.readyState < 1) {
          waited += 1;
          if (waited <= 12) {
            seekCheckTimer = window.setTimeout(verifySeek, 750);
            return;
          }
        }
        // The element finished a seek but landed somewhere else, or the
        // stream is genuinely not seekable. Re-open it at the requested
        // offset; `load` applies `pendingSeek` on metadata.
        seekInFlight = false;
        void load(current, !audio.paused, target, true);
      };
      seekCheckTimer = window.setTimeout(verifySeek, 750);

      updatePositionState();
    },

    seekBy: (delta) => get().seek(get().position + delta),

    setVolume: (value) => {
      const volume = Math.min(1, Math.max(0, value));
      if (audio) {
        audio.volume = volume;
        audio.muted = volume === 0;
      }
      set({ volume, muted: volume === 0 });
      window.clearTimeout(volumeTimer);
      volumeTimer = window.setTimeout(() => {
        useAppStore.getState().updateSettings({ volume, muted: volume === 0 }).catch(() => {});
      }, 250);
    },

    toggleMute: () => {
      const muted = !get().muted;
      if (audio) audio.muted = muted;
      set({ muted });
      useAppStore.getState().updateSettings({ muted }).catch(() => {});
    },

    setRate: (value) => {
      const rate = Math.min(2, Math.max(0.5, value));
      if (audio) audio.playbackRate = rate;
      set({ rate });
      updatePositionState();
      useAppStore.getState().updateSettings({ playbackRate: rate }).catch(() => {});
    },

    cycleRepeat: () => {
      const current = get().repeat;
      const repeat: RepeatMode = current === 'off' ? 'all' : current === 'all' ? 'one' : 'off';
      set({ repeat });
      schedulePersist();
      useUiStore.getState().toast(
        repeat === 'off' ? 'Repeat off' : repeat === 'all' ? 'Repeat queue' : 'Repeat this song',
      );
    },

    setRepeat: (repeat) => {
      set({ repeat });
      schedulePersist();
    },

    toggleShuffle: () => {
      const state = get();
      if (!state.shuffle) {
        if (!state.queue.length) {
          set({ shuffle: true });
          return;
        }
        const current = state.queue[state.index];
        shuffleBackup = { queue: state.queue, index: state.index };
        const queue = [current, ...shuffleArray(state.queue.filter((_, index) => index !== state.index))];
        set({ shuffle: true, queue, index: 0 });
      } else {
        if (shuffleBackup) {
          const found = shuffleBackup.queue.findIndex((track) => track.id === state.current?.id);
          set({ shuffle: false, queue: shuffleBackup.queue, index: found >= 0 ? found : 0 });
          shuffleBackup = null;
        } else {
          set({ shuffle: false });
        }
      }
      schedulePersist();
    },

    addToQueue: (track, quiet = false) => {
      const state = get();
      if (!state.current) {
        get().playQueue([...state.queue, track], state.queue.length, { radio: state.radio, seed: state.radioSeed });
        return;
      }
      set({ queue: [...state.queue, track] });
      if (!quiet) useUiStore.getState().toast(`Added “${track.title}” to the queue.`, 'success');
      schedulePersist();
    },

    playNext: (track, quiet = false) => {
      const state = get();
      const queue = [...state.queue];
      queue.splice(state.index + 1, 0, track);
      if (shuffleBackup) shuffleBackup.queue = [...shuffleBackup.queue, track];
      set({ queue });
      if (!quiet) useUiStore.getState().toast(`“${track.title}” will play next.`, 'success');
      schedulePersist();
    },

    removeQueueAt: (index) => {
      const state = get();
      if (index < 0 || index >= state.queue.length) return;
      const removingCurrent = index === state.index;
      const queue = state.queue.filter((_, itemIndex) => itemIndex !== index);
      if (!queue.length) {
        audio?.pause();
        if (audio) audio.removeAttribute('src');
        positionHold = null;
        seekInFlight = false;
        set({
          queue: [],
          index: 0,
          current: undefined,
          playing: false,
          position: 0,
          duration: 0,
          buffered: 0,
          radio: false,
          radioSeed: undefined,
          radioContinuation: undefined,
          radioLoading: false,
        });
        persistNow();
        return;
      }
      if (removingCurrent) {
        finalizePlayback(false);
        const nextIndex = Math.min(index, queue.length - 1);
        set({ queue, index: nextIndex });
        void load(queue[nextIndex], true, 0);
      } else {
        set({ queue, index: index < state.index ? state.index - 1 : state.index });
      }
      schedulePersist();
    },

    moveQueue: (from, to) => {
      const state = get();
      if (from < 0 || from >= state.queue.length || to < 0 || to >= state.queue.length) return;
      const queue = [...state.queue];
      const [moved] = queue.splice(from, 1);
      queue.splice(to, 0, moved);
      let index = state.index;
      if (state.index === from) index = to;
      else if (from < state.index && to >= state.index) index--;
      else if (from > state.index && to <= state.index) index++;
      set({ queue, index });
      schedulePersist();
    },

    clearUpcoming: () => {
      const state = get();
      if (!state.queue.length) return;
      const queue = state.queue.slice(0, state.index + 1);
      set({ queue, radio: false, radioSeed: undefined, radioContinuation: undefined, radioLoading: false });
      schedulePersist();
      useUiStore.getState().toast('Upcoming tracks cleared.');
    },

    setSleepTimer: (minutes) => {
      if (minutes === null) {
        set({ sleepTimerEnd: undefined, sleepTimerEndOfTrack: false });
        useUiStore.getState().toast('Sleep timer off.');
        return;
      }
      if (minutes === 'end') {
        if (!get().current) {
          useUiStore.getState().toast('Start a song before setting an end-of-track timer.');
          return;
        }
        set({ sleepTimerEnd: undefined, sleepTimerEndOfTrack: true });
        useUiStore.getState().toast('Sleep timer set for the end of this track.');
        return;
      }
      const duration = Math.max(1, Math.round(minutes));
      set({ sleepTimerEnd: Date.now() + duration * 60_000, sleepTimerEndOfTrack: false });
      useUiStore.getState().toast(`Sleep timer set for ${duration} minutes.`);
    },

    clearSleepTimer: () => set({ sleepTimerEnd: undefined, sleepTimerEndOfTrack: false }),

    stop: () => {
      clearBufferWatch();
      positionHold = null;
      seekInFlight = false;
      seekDragging = false;
      seekResumePlayback = false;
      seekTarget = 0;
      seekEpoch += 1;
      finalizePlayback(false);
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      set({ playing: false, position: 0, buffered: 0, ended: false });
      updateMediaSession(get().current, false);
      notifyDiscord();
      persistNow();
    },
  };
});

export { EQ_FREQUENCIES, applyDsp };
