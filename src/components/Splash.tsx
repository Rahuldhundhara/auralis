import a from '../assets/splash/a.png';
import arc1 from '../assets/splash/arc1.png';
import arc2 from '../assets/splash/arc2.png';
import arc3 from '../assets/splash/arc3.png';
import arc4 from '../assets/splash/arc4.png';
import letter0 from '../assets/splash/letter-letter0.png';
import letter1 from '../assets/splash/letter-letter1.png';
import letter2 from '../assets/splash/letter-letter2.png';
import letter3 from '../assets/splash/letter-letter3.png';
import letter4 from '../assets/splash/letter-letter4.png';
import letter5 from '../assets/splash/letter-letter5.png';
import letter6 from '../assets/splash/letter-letter6.png';
import play from '../assets/splash/play.png';

const LAYERS: Array<{ src: string; className: string }> = [
  { src: a, className: 'splash-layer splash-a' },
  { src: arc1, className: 'splash-layer splash-arc splash-arc1' },
  { src: arc2, className: 'splash-layer splash-arc splash-arc2' },
  { src: arc3, className: 'splash-layer splash-arc splash-arc3' },
  { src: arc4, className: 'splash-layer splash-arc splash-arc4' },
  { src: play, className: 'splash-layer splash-play' },
  { src: letter0, className: 'splash-layer splash-letter splash-letter0' },
  { src: letter1, className: 'splash-layer splash-letter splash-letter1' },
  { src: letter2, className: 'splash-layer splash-letter splash-letter2' },
  { src: letter3, className: 'splash-layer splash-letter splash-letter3' },
  { src: letter4, className: 'splash-layer splash-letter splash-letter4' },
  { src: letter5, className: 'splash-layer splash-letter splash-letter5' },
  { src: letter6, className: 'splash-layer splash-letter splash-letter6' },
];

export function Splash() {
  return (
    <div className="splash" role="status" aria-label="Auralis is starting">
      <div className="splash-stage" aria-hidden="true">
        <div className="splash-glow" />
        {LAYERS.map((layer) => (
          <img
            key={layer.className}
            src={layer.src}
            alt=""
            draggable={false}
            className={layer.className}
          />
        ))}
        <div className="splash-scan" />
      </div>
      <p className="splash-caption">Warming up your library…</p>
    </div>
  );
}
