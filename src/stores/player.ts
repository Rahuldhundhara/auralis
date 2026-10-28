import { create } from 'zustand';
import type { Settings, Track } from '@shared/types';
import { useAppStore } from './app';
import { useUiStore } from './ui';
import { isTypingTarget, safeJson, shuffleArray } from '../lib/format';

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
const MAX_QUEUE_TRACKS = 400;
const QUEUE_HISTORY = 50;

function boundedQueue(queue: Track[], index: number) {
  if (queue.length <= MAX_QUEUE_TRACKS) return { queue, index };
  const start = Math.max(
    0,
    Math.min(index - QUEUE_HISTORY, queue.length - MAX_QUEUE_TRACKS),
  );
  return {
    queue: queue.slice(start, start + MAX_QUEUE_TRACKS),
    index: index - start,
  };
}

let audio: HTMLAudioElement | null = null;
let audioContext: AudioContext | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let preampNode: GainNode | null = null;
let bassNode: BiquadFilterNode | null = null;
let compressorNode: DynamicsCompressorNode | null = null;
let limiterNode: DynamicsCompressorNode | null = null;
let eqNodes: BiquadFilterNode[] = [];
let masterNode: GainNode | null = null;
let graphAttempted = false;
let initialized = false;
let loadToken = 0;
let pendingSeek = 0;
let recorded = false;
let playbackStartedAt = 0;
let lastPositionUpdate = 0;
let lastPersist = 0;
let persistTimer: number | undefined;
let volumeTimer: number | undefined;
let discordTimer: number | undefined;
let prefetchTimer: number | undefined;
let prefetchIdle: number | undefined;
let shuffleBackup: { queue: Track[]; index: number } | null = null;
let errorRetries = 0;
let mediaHandlersBound = false;
let lastNativeSync = 0;

function mediaArtwork(track: Track | undefined) {
  if (!track?.thumbnail) return [];
  return [
    { src: track.thumbnail, sizes: '96x96', type: 'image/jpeg' },
    { src: track.thumbnail, sizes: '256x256', type: 'image/jpeg' },
    { src: track.thumbnail, sizes: '512x512', type: 'image/jpeg' },
  ];
}

/** The audio element is the only clock; the store mirrors it for the UI. */
export function currentPlaybackPosition(): number {
  if (audio && audio.src && Number.isFinite(audio.currentTime)) return audio.currentTime;
  return usePlayerStore.getState().position;
}

export function isTrackLiked(track?: Track): boolean {
  if (!track) return false;
  return useAppStore.getState().library.liked.some((item) => item.id === track.id);
}

/**
 * Pushes the single playback snapshot to Android's media session. Position
 * updates are throttled because the system already advances the reported
 * position while playing. State changes should pass `force`.
 */
export function syncNativeMediaState(force = false) {
  const state = usePlayerStore.getState();
  const now = Date.now();
  if (!force && now - lastNativeSync < 900) return;
  lastNativeSync = now;
  try {
    window.__auralisAndroidMediaState?.(state.current || null, state.playing, {
      position: currentPlaybackPosition(),
      duration: state.duration || state.current?.duration || 0,
      buffering: state.buffering || state.loading,
      liked: isTrackLiked(state.current),
    });
  } catch {
    // The native bridge is Android-only.
  }
}

function updateMediaSession(track: Track | undefined, playing: boolean) {
  syncNativeMediaState(true);
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
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  } catch {
    // Media Session is best-effort.
  }
}

function updatePositionState(force = false) {
  syncNativeMediaState(force);
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

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'auto';
  audio.crossOrigin = 'anonymous';
  audio.setAttribute('playsinline', 'true');
  attachAudioListeners();
  return audio;
}

function buildGraph() {
  if (graphAttempted || !audio) return;
  graphAttempted = true;
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
    limiterNode.attack.value = 0.002;
    limiterNode.release.value = 0.08;
    masterNode = audioContext.createGain();
    eqNodes = EQ_FREQUENCIES.map((frequency) => {
      const filter = audioContext!.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = frequency;
      filter.Q.value = 1.4;
      filter.gain.value = 0;
      return filter;
    });
    sourceNode.connect(preampNode);
    let node: AudioNode = preampNode;
    for (const filter of eqNodes) {
      node.connect(filter);
      node = filter;
    }
    node.connect(bassNode);
    bassNode.connect(compressorNode);
    compressorNode.connect(limiterNode);
    limiterNode.connect(masterNode);
    masterNode.connect(audioContext.destination);
    applyDsp(useAppStore.getState().settings);
  } catch {
    audioContext = null;
    sourceNode = null;
    preampNode = null;
    bassNode = null;
    compressorNode = null;
    limiterNode = null;
    masterNode = null;
    eqNodes = [];
  }
}

function applyDsp(settings: Settings) {
  if (preampNode && audioContext) {
    preampNode.gain.setTargetAtTime(Math.pow(10, (settings.eq.enabled ? settings.eq.preamp : 0) / 20), audioContext.currentTime, 0.02);
  }
  eqNodes.forEach((filter, index) => {
    const gain = settings.eq.enabled ? settings.eq.bands[index] || 0 : 0;
    filter.gain.setTargetAtTime(gain, audioContext?.currentTime || 0, 0.03);
  });
  if (bassNode && audioContext) {
    const boost = settings.eq.enabled ? Math.max(0, Math.min(12, settings.eq.bassBoost ?? 0)) : 0;
    const frequency = Math.max(40, Math.min(160, settings.eq.bassFrequency ?? 80));
    bassNode.frequency.setTargetAtTime(frequency, audioContext.currentTime, 0.04);
    bassNode.gain.setTargetAtTime(boost, audioContext.currentTime, 0.03);
  }
  if (compressorNode && audioContext) {
    const enabled = settings.normalize;
    compressorNode.threshold.setTargetAtTime(enabled ? -24 : 0, audioContext.currentTime, 0.05);
    compressorNode.knee.setTargetAtTime(enabled ? 30 : 0, audioContext.currentTime, 0.05);
    compressorNode.ratio.setTargetAtTime(enabled ? 4 : 1, audioContext.currentTime, 0.05);
    compressorNode.attack.setTargetAtTime(enabled ? 0.004 : 0.003, audioContext.currentTime, 0.05);
    compressorNode.release.setTargetAtTime(enabled ? 0.25 : 0.25, audioContext.currentTime, 0.05);
  }
  if (limiterNode && audioContext) {
    const enabled = settings.eq.limiter !== false;
    limiterNode.threshold.setTargetAtTime(enabled ? -1 : 0, audioContext.currentTime, 0.02);
    limiterNode.ratio.setTargetAtTime(enabled ? 20 : 1, audioContext.currentTime, 0.02);
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
    duration: state.duration,
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

function cancelPrefetch() {
  window.clearTimeout(prefetchTimer);
  window.clearTimeout(prefetchIdle);
  prefetchTimer = undefined;
  prefetchIdle = undefined;
}

function schedulePrefetch(track: Track | undefined, token: number) {
  cancelPrefetch();
  if (!track) return;
  // Resolve the next song as soon as the current one is audible. yt-dlp
  // stream URLs stay cached for 90 minutes, so starting early keeps the
  // transition instant without changing what is downloaded.
  prefetchTimer = window.setTimeout(() => {
    prefetchTimer = undefined;
    if (token !== loadToken) return;
    const state = usePlayerStore.getState();
    if (state.queue[state.index + 1]?.id !== track.id) return;
    window.auralis.player.prefetch(playableTrack(track)).catch(() => {});
    const after = state.queue[state.index + 2];
    if (!after || after.id === track.id || after.localPath) return;
    prefetchIdle = window.setTimeout(() => {
      prefetchIdle = undefined;
      const latest = usePlayerStore.getState();
      if (token !== loadToken) return;
      if (latest.queue[latest.index + 1]?.id !== track.id) return;
      window.auralis.player.prefetch(playableTrack(after)).catch(() => {});
    }, 4200);
  }, 350);
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

function attachAudioListeners() {
  if (!audio) return;
  audio.addEventListener('loadedmetadata', () => {
    if (!audio) return;
    const state = usePlayerStore.getState();
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      usePlayerStore.setState({ duration: audio.duration });
    }
    if (pendingSeek > 0 && Number.isFinite(audio.duration)) {
      audio.currentTime = Math.min(pendingSeek, Math.max(0, audio.duration - 0.5));
      pendingSeek = 0;
    }
    usePlayerStore.setState({ loading: false });
    updatePositionState();
    void state;
  });
  audio.addEventListener('timeupdate', () => {
    if (!audio) return;
    const state = usePlayerStore.getState();
    const position = audio.currentTime || 0;
    usePlayerStore.setState({ position, duration: Number.isFinite(audio.duration) ? audio.duration : state.duration });
    if (Date.now() - lastPositionUpdate > 1000) {
      lastPositionUpdate = Date.now();
      updatePositionState();
    }
    if (Date.now() - lastPersist > 15000) schedulePersist();
  });
  audio.addEventListener('play', () => {
    usePlayerStore.setState({ playing: true, buffering: false, error: undefined });
    updateMediaSession(usePlayerStore.getState().current, true);
    notifyDiscord();
  });
  audio.addEventListener('pause', () => {
    usePlayerStore.setState({ playing: false, buffering: false });
    updateMediaSession(usePlayerStore.getState().current, false);
    notifyDiscord();
  });
  audio.addEventListener('waiting', () => usePlayerStore.setState({ buffering: true }));
  audio.addEventListener('playing', () => usePlayerStore.setState({ buffering: false, loading: false, playing: true }));
  audio.addEventListener('canplay', () => usePlayerStore.setState({ loading: false, buffering: false }));
  audio.addEventListener('ended', () => {
    const state = usePlayerStore.getState();
    finalizePlayback(true);
    if (state.sleepTimerEndOfTrack) {
      usePlayerStore.setState({ sleepTimerEndOfTrack: false, sleepTimerEnd: undefined });
      useUiStore.getState().toast('Sleep timer ended at the end of the track. Playback paused.', 'info');
      return;
    }
    if (state.repeat === 'one') {
      recorded = false;
      playbackStartedAt = Date.now();
      if (audio) {
        audio.currentTime = 0;
        void audio.play();
      }
      return;
    }
    state.next(true);
  });
  audio.addEventListener('error', () => {
    if (!audio || !audio.src) return;
    const state = usePlayerStore.getState();
    if (!state.current) return;
    if (errorRetries < 1) {
      errorRetries++;
      const track = state.current;
      window.auralis.player.invalidate(track.id).catch(() => {});
      window.setTimeout(() => {
        const current = usePlayerStore.getState();
        if (current.current?.id === track.id) {
          current.playAt(current.index);
        }
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

async function toggleLikeFromNotification(action: 'like' | 'unlike' | 'toggle', trackId?: string) {
  const state = usePlayerStore.getState();
  const track =
    (trackId ? state.current?.id === trackId ? state.current : state.queue.find((item) => item.id === trackId) : undefined) ||
    (trackId ? useAppStore.getState().library.liked.find((item) => item.id === trackId) : undefined) ||
    state.current;
  if (!track) return;
  try {
    const library = useAppStore.getState();
    if (action === 'like') await library.likeTrack(track);
    else if (action === 'unlike') await library.unlikeTrack(track.id);
    else await library.toggleLike(track);
    const liked = isTrackLiked(track);
    useUiStore.getState().toast(
      liked ? `Liked “${track.title}”.` : `Removed “${track.title}” from Liked Songs.`,
      'success',
    );
  } catch {
    useUiStore.getState().toast('Could not update Liked Songs. Check your connection and try again.', 'error');
  } finally {
    syncNativeMediaState(true);
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
    } else if (event.key.toLowerCase() === 'q') {
      const ui = useUiStore.getState();
      ui.setQueueOpen(!ui.queueOpen);
    }
  });
}

function restoreSession() {
  const saved = safeJson<{
    queue: Track[];
    index: number;
    position: number;
    duration?: number;
    radio: boolean;
    radioSeed?: string;
    radioContinuation?: string;
    repeat: RepeatMode;
    shuffle: boolean;
  } | null>(localStorage.getItem(STORAGE_KEY), null);
  if (!saved || !Array.isArray(saved.queue) || !saved.queue.length) return;
  const savedIndex = Math.min(Math.max(0, saved.index || 0), saved.queue.length - 1);
  const restored = boundedQueue(saved.queue, savedIndex);
  const index = restored.index;
  const track = restored.queue[index];
  pendingSeek = Math.max(0, saved.position || 0);
  const restoredDuration = Math.max(0, saved.duration || track.duration || 0);
  usePlayerStore.setState({
    queue: restored.queue,
    index,
    current: track,
    duration: restoredDuration,
    position: pendingSeek,
    radio: Boolean(saved.radio),
    radioSeed: saved.radioSeed,
    radioContinuation: saved.radioContinuation,
    repeat: saved.repeat || 'off',
    shuffle: Boolean(saved.shuffle),
  });
  updateMediaSession(track, false);
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  const load = async (
    track: Track,
    autoplay = true,
    startAt = 0,
    isRetry = false,
  ) => {
    if (!isRetry) {
      finalizePlayback(false);
      errorRetries = 0;
    }
    const el = ensureAudio();
    buildGraph();
    cancelPrefetch();
    loadToken++;
    const token = loadToken;
    recorded = false;
    playbackStartedAt = Date.now();
    pendingSeek = startAt;
    el.pause();
    set({
      current: track,
      loading: true,
      playing: false,
      buffering: false,
      position: startAt,
      duration: track.duration || 0,
      error: undefined,
      streamFormat: undefined,
    });
    updateMediaSession(track, false);
    schedulePersist();
    useAppStore.getState().addRecent(track).catch(() => {});
    const settings = useAppStore.getState().settings;
    if (settings.lastfm.enabled && settings.lastfm.nowPlaying && settings.lastfm.sessionKey) {
      window.auralis.lastfm.nowPlaying(track).catch(() => {});
    }
    notifyDiscord();
    try {
      const stream = await window.auralis.player.resolve(playableTrack(track));
      if (token !== loadToken || get().current?.id !== track.id) return;
      audioContext?.resume().catch(() => {});
      el.src = stream.url;
      el.playbackRate = settings.playbackRate || 1;
      el.volume = settings.muted ? 0 : settings.volume;
      el.muted = settings.muted;
      el.load();
      set({ streamFormat: stream.format });
      if (autoplay) {
        try {
          await el.play();
        } catch (error: any) {
          set({ playing: false, loading: false, error: error?.message || 'Playback was blocked.' });
        }
      } else {
        set({ loading: false });
      }
      const nextTrack = get().queue[get().index + 1];
      schedulePrefetch(nextTrack, token);
    } catch (error: any) {
      if (token !== loadToken) return;
      set({
        loading: false,
        playing: false,
        error: error?.message || 'Could not resolve this track.',
      });
      useUiStore.getState().toast(`Could not play “${track.title}”: ${error?.message || error}`, 'error');
    }
  };

  const radioTracksForQueue = (tracks: Track[]) => {
    // Keep the shuffle backup in sync so turning shuffle off does not drop
    // the radio tracks that were appended while shuffle was on.
    if (shuffleBackup) {
      shuffleBackup.queue = [...shuffleBackup.queue, ...tracks].slice(-MAX_QUEUE_TRACKS);
    }
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
        const bounded = boundedQueue(queue, nextIndex);
        set({
          queue: bounded.queue,
          index: bounded.index,
          radio: true,
          radioSeed: seed,
          radioContinuation: nextToken,
          radioLoading: false,
        });
        void load(bounded.queue[bounded.index], true, 0);
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

      window.auralis.events.onMediaKey((payload) => {
        let action = payload;
        let positionMs: number | undefined;
        let trackId: string | undefined;
        if (payload && payload.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(payload);
            if (parsed && typeof parsed === 'object') {
              action = String(parsed.action || '');
              positionMs = typeof parsed.position === 'number' ? parsed.position : undefined;
              trackId = typeof parsed.trackId === 'string' ? parsed.trackId : undefined;
            }
          } catch {
            // Fall back to the legacy plain-text action.
          }
        }
        if (action === 'play-pause') get().toggle();
        else if (action === 'next') get().next();
        else if (action === 'previous') get().previous();
        else if (action === 'stop') get().stop();
        else if (action === 'seek' && typeof positionMs === 'number' && Number.isFinite(positionMs)) {
          get().seek(Math.max(0, positionMs / 1000));
        } else if (action === 'like' || action === 'unlike') {
          void toggleLikeFromNotification(action, trackId);
        }
      });

      useAppStore.subscribe((state, previous) => {
        if (state.settings !== previous.settings) {
          const current = state.settings;
          if (audio) {
            audio.volume = current.muted ? 0 : current.volume;
            audio.muted = current.muted;
            audio.playbackRate = current.playbackRate || 1;
          }
          set({ volume: current.volume, muted: current.muted, rate: current.playbackRate || 1 });
          applyDsp(current);
          if (state.settings.discord.enabled !== previous.settings.discord.enabled) notifyDiscord();
        }
        if (state.library.liked !== previous.library.liked) syncNativeMediaState(true);
      });

      window.addEventListener('beforeunload', () => {
        finalizePlayback(false);
        persistNow();
      });
    },

    playQueue: (tracks, startIndex = 0, options = {}) => {
      const list = tracks.filter((track) => track && track.id);
      if (!list.length) return;
      let index = Math.min(Math.max(0, startIndex), list.length - 1);
      const state = get();
      const sameQueue =
        state.queue.length === list.length &&
        state.index === index &&
        list.every((track, itemIndex) => state.queue[itemIndex]?.id === track.id);
      if (sameQueue && !options.radio && !options.startAt) {
        // Tapping the already loaded song should not restart it or resolve it
        // again. This keeps repeated taps cheap and prevents native workers
        // from piling up when the same card is tapped over and over.
        if (!state.playing && !state.loading) get().play();
        return;
      }
      let queue = list;
      if (state.shuffle) {
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
        const merged = [...get().queue, ...radioTracksForQueue(extra)];
        const bounded = boundedQueue(merged, get().index);
        set({
          queue: bounded.queue,
          index: bounded.index,
          radioContinuation: result.continuation,
          radioLoading: false,
        });
        schedulePersist();
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
      if (state.playing) {
        get().pause();
        return;
      }
      if (state.current && audio?.src) {
        audioContext?.resume().catch(() => {});
        void audio.play().catch((error) => {
          set({ error: error?.message || 'Playback failed.' });
        });
        return;
      }
      if (state.queue.length) {
        void load(state.current || state.queue[state.index] || state.queue[0], true, state.position || pendingSeek);
        return;
      }
      useUiStore.getState().toast('Nothing in the queue yet. Pick a song to start listening.');
    },

    play: () => {
      const state = get();
      if (state.current && audio?.src) {
        audioContext?.resume().catch(() => {});
        void audio.play().catch(() => {});
      } else {
        get().toggle();
      }
    },

    pause: () => {
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
      if (!audio) return;
      const duration = get().duration || audio.duration || 0;
      const target = Math.max(0, Math.min(seconds, duration || seconds));
      audio.currentTime = target;
      set({ position: target });
      updatePositionState(true);
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
      const bounded = boundedQueue([...state.queue, track], state.index);
      set({ queue: bounded.queue, index: bounded.index });
      if (!quiet) useUiStore.getState().toast(`Added “${track.title}” to the queue.`, 'success');
      schedulePersist();
    },

    playNext: (track, quiet = false) => {
      const state = get();
      const queue = [...state.queue];
      queue.splice(state.index + 1, 0, track);
      const bounded = boundedQueue(queue, state.index);
      if (shuffleBackup) {
        shuffleBackup.queue = [...shuffleBackup.queue, track].slice(-MAX_QUEUE_TRACKS);
      }
      set({ queue: bounded.queue, index: bounded.index });
      if (!quiet) useUiStore.getState().toast(`“${track.title}” will play next.`, 'success');
      schedulePersist();
    },

    removeQueueAt: (index) => {
      const state = get();
      if (index < 0 || index >= state.queue.length) return;
      const removingCurrent = index === state.index;
      const queue = state.queue.filter((_, itemIndex) => itemIndex !== index);
      if (!queue.length) {
        cancelPrefetch();
        audio?.pause();
        if (audio) audio.removeAttribute('src');
        set({
          queue: [],
          index: 0,
          current: undefined,
          playing: false,
          position: 0,
          duration: 0,
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
      cancelPrefetch();
      finalizePlayback(false);
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      set({ playing: false, position: 0 });
      updateMediaSession(get().current, false);
      notifyDiscord();
      persistNow();
    },
  };
});

export { EQ_FREQUENCIES, applyDsp };
