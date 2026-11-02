import { useEffect, useRef, useState } from 'react';
import { Maximize2, Pause, Play, RotateCcw } from 'lucide-react';
import type { StreamInfo } from '@shared/types';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { formatDuration } from '../lib/format';
import { Button, IconButton, Modal, Range, Spinner } from './primitives';
import { VolumeControl } from './PlayerBar';

export function VideoPlayer() {
  const track = useUiStore((state) => state.videoTrack);
  const close = useUiStore((state) => state.closeVideo);
  const current = usePlayerStore((state) => state.current);
  const playing = usePlayerStore((state) => state.playing);
  const position = usePlayerStore((state) => state.position);
  const duration = usePlayerStore((state) => state.duration);
  const toggle = usePlayerStore((state) => state.toggle);
  const seek = usePlayerStore((state) => state.seek);
  const [stream, setStream] = useState<StreamInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef(0);

  const load = async () => {
    if (!track) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(undefined);
    try {
      const info = await window.auralis.player.resolveVideo(track);
      if (requestId !== requestRef.current) return;
      setStream(info);
    } catch (reason: any) {
      if (requestId !== requestRef.current) return;
      setError(reason?.message || 'This video could not be loaded. Audio playback will continue.');
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!track) return;
    setStream(null);
    setError(undefined);
    void load();
    return () => {
      requestRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id]);

  useEffect(() => {
    if (!track) return;
    if (current?.id !== track.id) close();
    // The video surface follows the audio queue. Closing it when the queue
    // moves on avoids showing a stale frame beside a different song.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, track?.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    if (playing) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [playing, stream]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    if (Math.abs(video.currentTime - position) > 0.65) {
      try {
        video.currentTime = position;
      } catch {
        // Metadata may not be available yet; loadedmetadata will sync again.
      }
    }
  }, [position, stream]);

  if (!track) return null;

  const seekTo = (seconds: number) => {
    seek(seconds);
    const video = videoRef.current;
    if (video) {
      try {
        video.currentTime = seconds;
      } catch {
        // The next metadata event will resync.
      }
    }
  };

  const fullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void video.requestFullscreen?.().catch(() => {});
  };

  return (
    <Modal
      open
      onClose={close}
      title={track.title}
      subtitle="Music video · audio continues through the player"
      width={1080}
      className="video-modal"
      footer={
        <div className="video-controls">
          <IconButton label={playing ? 'Pause' : 'Play'} onClick={toggle}>
            {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </IconButton>
          <span className="video-time">{formatDuration(position)}</span>
          <Range
            className="video-seek"
            min={0}
            max={Math.max(duration, 1)}
            step={0.1}
            value={Math.min(position, Math.max(duration, 1))}
            onValueChange={seekTo}
            aria-label="Video position"
          />
          <span className="video-time">{formatDuration(duration)}</span>
          <VolumeControl />
          <IconButton label="Fullscreen" onClick={fullscreen}>
            <Maximize2 size={18} />
          </IconButton>
        </div>
      }
    >
      <div className="video-player">
        {stream ? (
          <video
            ref={videoRef}
            className="video-surface"
            src={stream.url}
            muted
            playsInline
            preload="auto"
            onLoadedMetadata={() => {
              const video = videoRef.current;
              if (video && position > 0.5) video.currentTime = position;
            }}
            onError={() => setError('The video stream stopped. Audio playback is still available.')}
            onClick={toggle}
          />
        ) : null}
        {loading ? (
          <div className="video-message" role="status">
            <Spinner size={26} />
            <span>Loading video…</span>
          </div>
        ) : error ? (
          <div className="video-message" role="alert">
            <span>{error}</span>
            <Button variant="outline" size="sm" icon={<RotateCcw size={15} />} onClick={() => void load()}>
              Retry video
            </Button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
