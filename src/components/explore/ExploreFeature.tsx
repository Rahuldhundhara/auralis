import { Pause, Play, Sparkles } from 'lucide-react';
import { usePlayerStore } from '../../stores/player';
import { heroCopy, heroTagline, paletteVars, useHeroPalette } from '../../lib/hero';
import { CoverStack, CreamWaveform, EnergySweep, GlowField, VerticalWaveform, Vinyl } from './ExploreAtmosphere';

export function ExploreFeature() {
  const current = usePlayerStore((state) => state.current);
  const playing = usePlayerStore((state) => state.playing);
  const toggle = usePlayerStore((state) => state.toggle);
  const palette = useHeroPalette(current?.thumbnail);
  const copy = heroCopy(current);
  const tagline = heroTagline(current?.id);
  const railLabel = current && playing ? 'Now playing' : 'Featured track';

  return (
    <section className="explore-feature" style={paletteVars(palette)} aria-label="Featured track">
      <EnergySweep />
      <GlowField />
      <div className="explore-feature-rail">
        <span className="explore-feature-rail-label">{railLabel}</span>
        <span className="explore-feature-rail-divider" />
        <VerticalWaveform playing={Boolean(current && playing)} />
      </div>
      <div className="explore-feature-copy">
        <p className="explore-feature-tagline">{tagline}</p>
        <h1>{copy.title}</h1>
        {copy.artists ? <p className="explore-feature-version">{copy.artists}</p> : null}
        {copy.version ? <p className="explore-feature-variant">{copy.version}</p> : null}
        {copy.album ? <p className="explore-feature-album">(From &ldquo;{copy.album}&rdquo;)</p> : null}
        <div className="explore-feature-actions">
          <button
            type="button"
            className="explore-feature-play"
            onClick={() => toggle()}
            disabled={!current}
          >
            {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
            {playing ? 'Pause' : 'Play'}
          </button>
          <div className={`explore-feature-wave ${playing ? 'is-live' : ''}`} aria-hidden="true">
            <CreamWaveform playing={playing} />
          </div>
        </div>
      </div>
      <div className="explore-feature-art">
        <Vinyl />
        <CoverStack src={current?.thumbnail} alt={copy.title} />
      </div>
      <Sparkles className="explore-feature-sparkle" size={19} aria-hidden="true" />
    </section>
  );
}
