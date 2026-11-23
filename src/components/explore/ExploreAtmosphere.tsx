import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Music2 } from 'lucide-react';
import { getPlayerAnalyser } from '../../stores/player';
import { Artwork } from '../primitives';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* -------------------------------------------------------------------------- */
/* Left rail: mirrored low-bin spectrum                                       */
/* -------------------------------------------------------------------------- */

export function VerticalWaveform({ playing }: { playing: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const width = 30;
    const height = 148;
    const rows = 19;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.scale(dpr, dpr);

    const levels = new Float32Array(rows);
    const reduce = prefersReducedMotion();
    let frame = 0;
    let spectrum = new Uint8Array(32);
    const rowHeight = height / rows;

    const paint = (time: number) => {
      const analyser = getPlayerAnalyser();
      if (analyser) {
        if (spectrum.length !== analyser.frequencyBinCount) spectrum = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(spectrum);
      }
      // Low bins drive the middle rows; mirrored outward so the bar breathes
      // around the centre instead of only from one end.
      for (let row = 0; row < rows; row += 1) {
        const distance = Math.abs(row - (rows - 1) / 2) / ((rows - 1) / 2);
        const bin = Math.min(spectrum.length - 1, 1 + Math.round(distance * 22));
        const live = analyser && playing ? spectrum[bin] / 255 : 0;
        const wobble = 0.13 + 0.06 * Math.sin(time * 0.0016 + row * 0.52) + 0.025 * Math.sin(time * 0.0007 + row * 1.7);
        const target = playing ? Math.pow(live, 0.85) : wobble;
        levels[row] += (target - levels[row]) * (playing ? 0.55 : 0.14);
      }

      context.clearRect(0, 0, width, height);
      for (let row = 0; row < rows; row += 1) {
        const level = Math.max(0, Math.min(1, levels[row]));
        const half = 1.6 + level * 12;
        const centerY = rowHeight * (row + 0.5);
        const alpha = 0.45 + level * 0.55;
        context.beginPath();
        context.strokeStyle = `rgba(45, 235, 162, ${alpha})`;
        context.lineWidth = 2.2;
        context.lineCap = 'round';
        context.shadowBlur = 5;
        context.shadowColor = 'rgba(45, 235, 162, 0.7)';
        context.moveTo(width / 2 - half, centerY);
        context.lineTo(width / 2 + half, centerY);
        context.stroke();
      }
    };

    if (reduce) {
      paint(0);
    } else {
      const tick = (time: number) => {
        paint(time);
        frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
    }
    return () => window.cancelAnimationFrame(frame);
  }, [playing]);

  return <canvas ref={canvasRef} className="explore-feature-rail-wave" aria-hidden="true" />;
}

/* -------------------------------------------------------------------------- */
/* Cream ECG line next to the Play pill                                       */
/* -------------------------------------------------------------------------- */

export function CreamWaveform({ playing }: { playing: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const width = 360;
    const height = 44;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.scale(dpr, dpr);

    const points = 150;
    const reduce = prefersReducedMotion();
    let spectrum = new Uint8Array(64);
    let frame = 0;
    let last = 0;

    const paint = (time: number) => {
      const analyser = getPlayerAnalyser();
      if (analyser) {
        if (spectrum.length !== analyser.frequencyBinCount) spectrum = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(spectrum);
      }
      let total = 0;
      const bins = Math.min(48, spectrum.length);
      for (let index = 0; index < bins; index += 1) total += spectrum[index];
      const energy = analyser ? total / (bins * 255) : 0;
      const beat = analyser ? spectrum[2] / 255 : 0;

      context.clearRect(0, 0, width, height);
      context.beginPath();
      for (let point = 0; point <= points; point += 1) {
        const p = point / points;
        const triangle = Math.abs(((p * 26) % 2) - 1) * 2 - 1;
        const envelope = 0.62 + 0.38 * Math.pow(Math.sin(Math.PI * Math.min(1, p * 1.04)), 0.8);
        const amplitude = playing
          ? 0.42 + Math.min(1, energy * 1.7 + beat * 0.55) * envelope
          : (0.4 + 0.16 * Math.abs(Math.sin(p * 6 + time * 0.0016))) * envelope * 0.35;
        const wobble = Math.sin(p * 11 + time * 0.0024) * 0.22;
        const y = height / 2 + (triangle * amplitude + wobble) * 15;
        const x = p * width;
        if (point === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = playing ? 'rgba(233, 228, 201, 0.95)' : 'rgba(233, 228, 201, 0.45)';
      context.lineWidth = 1.5;
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.shadowBlur = playing ? 5 : 2;
      context.shadowColor = 'rgba(233, 228, 201, 0.45)';
      context.stroke();
    };

    if (reduce) {
      paint(0);
    } else {
      const tick = (time: number) => {
        if (time - last >= 32) {
          paint(time);
          last = time;
        }
        frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
    }
    return () => window.cancelAnimationFrame(frame);
  }, [playing]);

  return (
    <canvas
      ref={canvasRef}
      className={`explore-feature-wave-canvas ${playing ? 'is-live' : ''}`}
      aria-hidden="true"
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Teal energy sweep                                                          */
/* -------------------------------------------------------------------------- */

const SWEEP_PATHS = [
  'M-40 232 C 170 228, 300 176, 432 192 C 562 208, 612 118, 730 82 C 852 46, 880 176, 1240 158',
  'M-40 246 C 190 242, 330 202, 458 214 C 585 226, 640 148, 756 118 C 872 88, 905 190, 1240 178',
  'M-40 196 C 160 194, 300 142, 420 158 C 548 175, 606 60, 726 30 C 846 0, 872 128, 1240 118',
  'M-40 262 C 200 260, 360 238, 500 246 C 640 254, 700 190, 814 176 C 922 162, 980 228, 1240 214',
  'M-40 118 C 150 116, 280 84, 400 96 C 530 110, 590 10, 716 -16 C 840 -40, 862 92, 1240 76',
];

const SWEEP_WIDTHS = [1.15, 0.8, 0.65, 0.55, 0.45];
const SWEEP_OPACITIES = [1, 0.7, 0.5, 0.4, 0.35];

export function EnergySweep() {
  const gradientId = `explore-sweep-${useId().replace(/:/g, '')}`;
  return (
    <svg
      className="explore-feature-sweep"
      viewBox="0 0 1200 320"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#1fe3a4" stopOpacity="0" />
          <stop offset="24%" stopColor="#1fe3a4" stopOpacity="0.32" />
          <stop offset="48%" stopColor="#2cf0b2" stopOpacity="0.6" />
          <stop offset="68%" stopColor="#3dffc2" stopOpacity="0.95" />
          <stop offset="86%" stopColor="#2cf0b2" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#2cf0b2" stopOpacity="0" />
        </linearGradient>
      </defs>
      {SWEEP_PATHS.map((path, index) => (
        <path
          key={path}
          d={path}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={SWEEP_WIDTHS[index]}
          opacity={SWEEP_OPACITIES[index]}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Seeded glow dots + notes                                                   */
/* -------------------------------------------------------------------------- */

function seeded(index: number, seed = 1): number {
  const value = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

const NOTE_GLYPHS = ['♪', '♫', '♩'];

export function GlowField() {
  return (
    <div className="explore-feature-glow" aria-hidden="true">
      {Array.from({ length: 26 }, (_, index) => {
        const x = 36 + seeded(index, 2) * 58;
        const y = 18 + seeded(index + 31, 3) * 58;
        const size = 0.8 + seeded(index + 13, 4) * 2.4;
        return (
          <span
            key={`dot-${index}`}
            className="explore-feature-dot"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: `${size}px`,
              height: `${size}px`,
              opacity: 0.35 + seeded(index + 9, 5) * 0.55,
            }}
          />
        );
      })}
      {Array.from({ length: 8 }, (_, index) => {
        const glyph = NOTE_GLYPHS[index % NOTE_GLYPHS.length];
        return (
          <span
            key={`note-${index}`}
            className="explore-feature-note"
            style={{
              left: `${51 + seeded(index + 61, 7) * 45}%`,
              top: `${24 + seeded(index + 91, 8) * 50}%`,
              fontSize: `${9 + seeded(index + 17, 9) * 4}px`,
              '--note-opacity': 0.3 + seeded(index + 27, 10) * 0.5,
              animationDuration: `${5.5 + seeded(index + 5, 11) * 6.5}s`,
              animationDelay: `${-seeded(index + 33, 12) * 10}s`,
            } as CSSProperties}
          >
            {glyph}
          </span>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Vinyl + cover stack                                                        */
/* -------------------------------------------------------------------------- */

export function Vinyl() {
  return (
    <div className="explore-feature-vinyl" aria-hidden="true">
      <svg viewBox="0 0 204 204">
        <defs>
          <radialGradient id="explore-vinyl-sheen" cx="38%" cy="30%" r="74%">
            <stop offset="0%" stopColor="#1c4b37" />
            <stop offset="48%" stopColor="#0f2c22" />
            <stop offset="100%" stopColor="#050f0b" />
          </radialGradient>
        </defs>
        <circle cx="102" cy="102" r="100" fill="url(#explore-vinyl-sheen)" stroke="#133028" strokeWidth="2" />
        {[52, 46, 39, 32, 25].map((radius, index) => (
          <circle
            key={radius}
            cx="102"
            cy="102"
            r={radius}
            fill="none"
            stroke={['#173a2d', '#0e2b21', '#1b4232', '#103026', '#1d4733'][index]}
            strokeWidth="1"
          />
        ))}
        <path d="M42 82 A 74 74 0 0 1 88 32" fill="none" stroke="#2c5a45" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
        <path d="M52 132 A 66 66 0 0 0 132 158" fill="none" stroke="#27533f" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        <circle cx="102" cy="102" r="18" fill="#123528" stroke="#1f503c" />
        <circle cx="102" cy="102" r="3.5" fill="#0a1f16" />
        <circle cx="112" cy="112" r="2" fill="#1fe3a4" opacity="0.55" />
      </svg>
    </div>
  );
}

interface CoverLayer {
  src: string;
  key: number;
}

export function CoverStack({ src, alt }: { src?: string; alt: string }) {
  const [layers, setLayers] = useState<CoverLayer[]>(() => (src ? [{ src, key: 0 }] : []));
  const sequence = useRef(0);
  const lastSrc = useRef(src);

  useEffect(() => {
    if (!src) {
      lastSrc.current = undefined;
      setLayers([]);
      return;
    }
    if (lastSrc.current === src) return;
    lastSrc.current = src;
    const key = (sequence.current += 1);
    setLayers((previous) => [...previous.slice(-1), { src, key }]);
    // Once the new cover has faded in, drop the old layer entirely so a stale
    // image can never sit under the current one.
    const timer = window.setTimeout(() => {
      setLayers((previous) => previous.filter((layer) => layer.key === key));
    }, 850);
    return () => window.clearTimeout(timer);
  }, [src]);

  return (
    <div className="explore-feature-cover">
      {layers.length ? (
        layers.map((layer, index) => (
          <div
            key={`${layer.src}-${layer.key}`}
            className={`explore-feature-cover-layer ${index === layers.length - 1 ? 'is-current' : 'is-old'}`}
          >
            <Artwork src={layer.src} alt={alt} className="explore-feature-cover-art" />
          </div>
        ))
      ) : (
        <div className="explore-feature-cover-fallback" aria-hidden="true">
          <Music2 size={42} />
        </div>
      )}
    </div>
  );
}
