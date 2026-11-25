import { useId, type ReactNode } from 'react';
import type { PodcastArtVariant } from '../lib/podcastThemes';

interface SceneIds {
  vignette: string;
  grain: string;
  soft: string;
  glow: string;
  grid: string;
  redBeam: string;
  blueBeam: string;
  gold: string;
  paper: string;
  fade: string;
}

/**
 * Full-bleed, hand-built cinematic scenes. Each category gets its own
 * composition, lighting and palette; there are no remote images, no missing
 * assets and no extra network requests. The SVG is sliced to fill the hero,
 * so the illustration is the environment rather than a badge on the banner.
 */
export function PodcastScene({ art }: { art: PodcastArtVariant }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ids: SceneIds = {
    vignette: `${uid}-vignette`,
    grain: `${uid}-grain`,
    soft: `${uid}-soft`,
    glow: `${uid}-glow`,
    grid: `${uid}-grid`,
    redBeam: `${uid}-red-beam`,
    blueBeam: `${uid}-blue-beam`,
    gold: `${uid}-gold`,
    paper: `${uid}-paper`,
    fade: `${uid}-fade`,
  };

  return (
    <svg
      className={`podcasts-hero-scene is-${art}`}
      viewBox="0 0 1600 560"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={ids.vignette} cx="42%" cy="42%" r="82%">
          <stop offset="0%" stopColor="#000" stopOpacity="0" />
          <stop offset="62%" stopColor="#000" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.78" />
        </radialGradient>
        <linearGradient id={ids.redBeam} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff2d3f" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ff2d3f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={ids.blueBeam} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2d7dff" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#2d7dff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={ids.gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f6d78a" />
          <stop offset="52%" stopColor="var(--pc-accent)" />
          <stop offset="100%" stopColor="#8a5f22" />
        </linearGradient>
        <linearGradient id={ids.paper} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f4efe3" />
          <stop offset="100%" stopColor="#d8cfba" />
        </linearGradient>
        <linearGradient id={ids.fade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--pc-accent)" stopOpacity="0.24" />
          <stop offset="100%" stopColor="var(--pc-accent)" stopOpacity="0" />
        </linearGradient>
        <pattern id={ids.grid} width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M48 0H0V48" fill="none" stroke="var(--pc-accent)" strokeOpacity="0.14" strokeWidth="1" />
        </pattern>
        <filter id={ids.soft} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="28" />
        </filter>
        <filter id={ids.glow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <filter id={ids.grain} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.78" numOctaves="3" seed="7" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>

      <rect width="1600" height="560" fill="var(--pc-base)" />
      {sceneFor(art, ids)}
      <rect width="1600" height="560" fill={`url(#${ids.vignette})`} pointerEvents="none" />
      <rect
        width="1600"
        height="560"
        filter={`url(#${ids.grain})`}
        opacity="0.13"
        style={{ mixBlendMode: 'soft-light' }}
        pointerEvents="none"
      />
    </svg>
  );
}

function sceneFor(art: PodcastArtVariant, ids: SceneIds): ReactNode {
  switch (art) {
    case 'crime': return <CrimeScene ids={ids} />;
    case 'news': return <NewsScene ids={ids} />;
    case 'horror': return <HorrorScene ids={ids} />;
    case 'technology': return <TechnologyScene ids={ids} />;
    case 'comedy': return <ComedyScene ids={ids} />;
    case 'business': return <BusinessScene ids={ids} />;
    case 'history': return <HistoryScene ids={ids} />;
    case 'science': return <ScienceScene ids={ids} />;
    case 'health': return <HealthScene ids={ids} />;
    case 'society': return <SocietyScene ids={ids} />;
    case 'music': return <MusicScene ids={ids} />;
    case 'sports': return <SportsScene ids={ids} />;
    default: return <TrendingScene ids={ids} />;
  }
}

function EvidencePhoto({
  x,
  y,
  rotate = 0,
  width = 176,
  height = 122,
  label,
}: {
  x: number;
  y: number;
  rotate?: number;
  width?: number;
  height?: number;
  label: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <rect width={width} height={height} rx="4" fill="#e9e2d2" opacity="0.94" />
      <rect x="8" y="8" width={width - 16} height={height - 34} fill="#171316" />
      <path
        d={`M18 ${height - 48} l${width * 0.18} -${height * 0.24} ${width * 0.12} ${height * 0.12} ${width * 0.16} -${height * 0.3} ${width * 0.2} ${height * 0.42}`}
        fill="none"
        stroke="var(--pc-accent)"
        strokeOpacity="0.42"
        strokeWidth="2"
      />
      <path d={`M12 ${height - 19}h${width - 24}M12 ${height - 12}h${width * 0.58}`} stroke="#6f6359" strokeWidth="2" strokeLinecap="round" />
      <circle cx={width / 2} cy="4" r="5" fill="var(--pc-accent)" />
      <text x="12" y="20" fill="#d8cfc0" fontSize="8" fontWeight="800" letterSpacing="1.2">{label}</text>
    </g>
  );
}

function CrimeScene({ ids }: { ids: SceneIds }) {
  return (
    <g>
      <rect width="1600" height="560" fill="#07090d" />
      <ellipse cx="1250" cy="80" rx="320" ry="200" fill="#ff2d3f" opacity="0.34" filter={`url(#${ids.soft})`} />
      <ellipse cx="520" cy="520" rx="300" ry="180" fill="#2d7dff" opacity="0.28" filter={`url(#${ids.soft})`} />
      <polygon points="1320,-40 1600,-40 1600,430 1080,240" fill={`url(#${ids.redBeam})`} filter={`url(#${ids.soft})`} />
      <polygon points="-40,560 340,200 560,600 -40,600" fill={`url(#${ids.blueBeam})`} filter={`url(#${ids.soft})`} />

      <g transform="translate(930 34) rotate(-3 320 250)">
        <rect width="640" height="470" rx="8" fill="rgba(18, 12, 14, 0.82)" stroke="rgba(255,255,255,0.08)" />
        <g stroke="rgba(255,255,255,0.045)">
          <path d="M0 118h640M0 236h640M0 354h640M160 0v470M320 0v470M480 0v470" />
        </g>
        <EvidencePhoto x={42} y={62} rotate={-7} label="CASE 07 / A" />
        <EvidencePhoto x={300} y={40} rotate={5} label="CASE 07 / B" />
        <EvidencePhoto x={190} y={236} rotate={-2} label="EVIDENCE 03" />
        <g fill="none" stroke="var(--pc-accent)" strokeOpacity="0.75" strokeWidth="2.2">
          <path d="M150 104l224 40 96-66 72 118" />
          <path d="M300 80l112 220" />
        </g>
        <g fill="var(--pc-accent)">
          <circle cx="150" cy="104" r="6" className="pc-pulse" />
          <circle cx="374" cy="144" r="5" />
          <circle cx="470" cy="78" r="5" />
          <circle cx="542" cy="196" r="5" />
          <circle cx="412" cy="300" r="5" />
        </g>
        <text x="34" y="446" fill="var(--pc-accent)" fontSize="12" fontWeight="800" letterSpacing="3" opacity="0.8">
          UNSOLVED // FILE 07
        </text>
      </g>

      <g transform="rotate(-8 1180 430)">
        <rect x="740" y="410" width="660" height="44" fill="#d6a928" opacity="0.9" />
        <text x="1070" y="439" textAnchor="middle" fill="#171207" fontFamily="var(--font-display)" fontSize="13" fontWeight="900" letterSpacing="3">
          POLICE LINE • DO NOT CROSS • POLICE LINE • DO NOT CROSS
        </text>
      </g>
      <path d="M1160 560v-86c0-34 20-56 52-56s52 22 52 56v86z" fill="#050508" opacity="0.9" />
      <circle cx="1212" cy="392" r="27" fill="#050508" />
      <path d="M1180 470c18 14 48 14 64 0" stroke="var(--pc-accent)" strokeOpacity="0.18" fill="none" />
    </g>
  );
}

function NewsSheet({
  x,
  y,
  rotate,
  scale = 1,
  opacity = 1,
  breaking = false,
}: {
  x: number;
  y: number;
  rotate: number;
  scale?: number;
  opacity?: number;
  breaking?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`} opacity={opacity}>
      <rect width="360" height="470" rx="3" fill="url(#paper)" />
      <rect width="360" height="470" rx="3" fill="none" stroke="#b9b1a1" />
      <text x="22" y="48" fill="#111" fontFamily="var(--font-display)" fontSize="28" fontWeight="900" letterSpacing="-1.4">
        THE DAILY
      </text>
      <path d="M22 62h316M22 68h316" stroke="#171717" strokeWidth="2" />
      {breaking ? (
        <g>
          <rect x="22" y="80" width="92" height="22" fill="#b91c1c" />
          <text x="68" y="96" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="900" letterSpacing="1.4">
            BREAKING
          </text>
          <text x="126" y="97" fill="#3b3730" fontSize="10" fontWeight="700" letterSpacing="0.8">
            THE STORY CONTINUES
          </text>
        </g>
      ) : null}
      <text x="22" y="140" fill="#111" fontFamily="var(--font-display)" fontSize="25" fontWeight="900" letterSpacing="-1">
        HEADLINES
      </text>
      <text x="22" y="166" fill="#111" fontFamily="var(--font-display)" fontSize="25" fontWeight="900" letterSpacing="-1">
        THAT MATTER
      </text>
      <rect x="22" y="182" width="152" height="104" fill="#242321" />
      <path d="M32 268l30-38 18 20 32-44 40 62" stroke="#c9c4b8" strokeWidth="2" fill="none" />
      <g stroke="#8c867a" strokeWidth="2" strokeLinecap="round" opacity="0.7">
        <path d="M190 190h148M190 202h148M190 214h120M190 226h148M190 238h96M190 250h148M190 262h112" />
      </g>
      <g stroke="#9a9488" strokeWidth="2" strokeLinecap="round" opacity="0.6">
        <path d="M22 316h316M22 332h316M22 348h270M22 364h316M22 380h230M22 396h316M22 412h286M22 428h316" />
      </g>
      <rect x="22" y="304" width="3" height="126" fill="#b91c1c" />
    </g>
  );
}

function NewsScene({ ids }: { ids: SceneIds }) {
  return (
    <g>
      <rect width="1600" height="560" fill="#0a0b0d" />
      <ellipse cx="1080" cy="60" rx="360" ry="220" fill="#ffffff" opacity="0.09" filter={`url(#${ids.soft})`} />
      <g opacity="0.2" stroke="#ffffff" strokeWidth="1">
        <path d="M880 0v560M1080 0v560M1280 0v560M1480 0v560" />
        <path d="M800 110h800M800 250h800M800 390h800" />
      </g>
      <text x="1560" y="430" textAnchor="end" fill="#ffffff" opacity="0.045" fontFamily="var(--font-display)" fontSize="300" fontWeight="900" letterSpacing="-18">
        NEWS
      </text>
      <NewsSheet x={1010} y={70} rotate={7} scale={1.02} opacity={0.42} />
      <NewsSheet x={870} y={18} rotate={-5} scale={1.06} opacity={0.72} />
      <NewsSheet x={1050} y={54} rotate={3} breaking />
      <rect x="980" y="504" width="420" height="4" fill="#b91c1c" opacity="0.75" />
    </g>
  );
}

function HorrorScene({ ids }: { ids: SceneIds }) {
  return (
    <g>
      <rect width="1600" height="560" fill="#05030a" />
      <circle cx="1240" cy="120" r="86" fill="#c9b6ff" opacity="0.16" filter={`url(#${ids.soft})`} />
      <circle cx="1240" cy="120" r="58" fill="#d8ccff" opacity="0.22" />
      <circle cx="1240" cy="120" r="58" fill="none" stroke="#8b5cf6" strokeOpacity="0.36" />
      <g stroke="#120b1c" strokeWidth="8" strokeLinecap="round" fill="none">
        <path d="M900 480V300l-30-60M900 350l-48 20M900 398l42-52M900 442l-38 30" />
        <path d="M900 300l22-56M922 244l-4-40M922 244l30-20" strokeWidth="6" />
        <path d="M1480 490V320l26-52M1480 366l-36 18M1480 410l34-42" strokeWidth="7" />
      </g>
      <g fill="#07040d" stroke="#a78bfa" strokeOpacity="0.16">
        <path d="M1020 490V270l130-92 130 92v220z" />
        <path d="M1090 490V330h120v160" fill="#040208" />
        <rect x="1112" y="300" width="42" height="52" fill="#8b5cf6" fillOpacity="0.28" stroke="none" className="pc-pulse" />
        <rect x="1180" y="300" width="42" height="52" fill="#8b5cf6" fillOpacity="0.16" stroke="none" />
        <path d="M1140 178h20v-46h24v58" fill="none" />
      </g>
      <g fill="#a78bfa" opacity="0.08" filter={`url(#${ids.soft})`} className="pc-drift">
        <ellipse cx="1080" cy="450" rx="300" ry="64" />
        <ellipse cx="1400" cy="496" rx="310" ry="56" />
        <ellipse cx="1180" cy="524" rx="460" ry="48" />
      </g>
      <path d="M1000 560c90-70 210-96 330-84 80 8 150 36 270 84z" fill="#030207" />
      <ellipse cx="1300" cy="470" rx="26" ry="42" fill="#020104" />
      <circle cx="1300" cy="414" r="18" fill="#020104" />
      <path d="M1284 462c10 8 24 8 34 0" stroke="#a78bfa" strokeOpacity="0.14" fill="none" />
    </g>
  );
}

function TechnologyScene({ ids }: { ids: SceneIds }) {
  return (
    <g>
      <rect width="1600" height="560" fill="#030a14" />
      <rect width="1600" height="560" fill={`url(#${ids.grid})`} opacity="0.42" />
      <ellipse cx="1180" cy="260" rx="300" ry="220" fill="#0ea5e9" opacity="0.24" filter={`url(#${ids.soft})`} />
      <g stroke="#38bdf8" strokeOpacity="0.36" fill="none" strokeWidth="1.6">
        <path d="M700 560L900 320h220l180-240" />
        <path d="M800 560L960 350h180l200-290" />
        <path d="M1000 560l80-180h260L1600 180" />
        <path d="M1180 560v-140h420" />
        <path d="M760 430h840M860 340h740M980 250h620" strokeDasharray="4 14" />
      </g>
      <g transform="translate(1210 250)">
        <circle r="132" fill="#0ea5e9" opacity="0.08" />
        <circle r="104" fill="none" stroke="#38bdf8" strokeOpacity="0.34" strokeDasharray="6 18" className="pc-drift" />
        <circle r="78" fill="none" stroke="#38bdf8" strokeOpacity="0.2" />
        <rect x="-58" y="-58" width="116" height="116" rx="22" fill="#04121f" stroke="#38bdf8" strokeOpacity="0.7" strokeWidth="2" />
        <rect x="-32" y="-32" width="64" height="64" rx="12" fill="none" stroke="#38bdf8" strokeOpacity="0.45" />
        <circle r="12" fill="#38bdf8" className="pc-pulse" />
        <g stroke="#38bdf8" strokeWidth="2" strokeOpacity="0.55">
          <path d="M-82-16h24M-82 0h24M-82 16h24M58-16h24M58 0h24M58 16h24M-16-82v24M0-82v24M16-82v24M-16 58v24M0 58v24M16 58v24" />
        </g>
      </g>
      <g fill="#38bdf8" opacity="0.85">
        <circle cx="900" cy="320" r="5" />
        <circle cx="1120" cy="320" r="5" />
        <circle cx="1380" cy="80" r="5" />
        <circle cx="1600" cy="180" r="5" />
      </g>
      <text x="1600" y="520" textAnchor="end" fill="#38bdf8" opacity="0.06" fontFamily="var(--font-display)" fontSize="180" fontWeight="900" letterSpacing="-10">
        FUTURE
      </text>
    </g>
  );
}

function ComedyScene({ ids }: { ids: SceneIds }) {
  return (
    <g>
      <rect width="1600" height="560" fill="#140a08" />
      <g opacity="0.85">
        <polygon points="980,-20 1120,360 1040,360" fill="#fb7185" opacity="0.16" filter={`url(#${ids.soft})`} />
        <polygon points="1280,-20 1180,360 1270,360" fill="#fbbf24" opacity="0.18" filter={`url(#${ids.soft})`} />
        <polygon points="1500,-20 1330,360 1430,360" fill="#c084fc" opacity="0.16" filter={`url(#${ids.soft})`} />
      </g>
      <g>
        <path d="M940 0h660v380c-110-46-220 46-330 0s-220 46-330 0z" fill="#4c0f16" />
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <path
            key={index}
            d={`M${960 + index * 110} 0c28 120 28 260 0 380`}
            stroke="#7f1d2b"
            strokeWidth="34"
            fill="none"
            opacity="0.55"
          />
        ))}
      </g>
      <ellipse cx="1250" cy="470" rx="330" ry="62" fill="#fbbf24" opacity="0.1" filter={`url(#${ids.soft})`} />
      <path d="M1030 470h440l60 90H970z" fill="#1b0d0a" stroke="#fbbf24" strokeOpacity="0.22" />
      <g transform="translate(1250 300)">
        <path d="M0 60v180M-42 240h84" stroke="#fbbf24" strokeOpacity="0.6" strokeWidth="5" strokeLinecap="round" />
        <rect x="-16" y="0" width="32" height="66" rx="16" fill="#160d07" stroke="#fbbf24" strokeWidth="2" />
        <path d="M-22 18h44M-22 30h44M-22 42h44" stroke="#fbbf24" strokeOpacity="0.5" />
        <path d="M0 66v26" stroke="#fbbf24" strokeWidth="3" />
      </g>
      <text x="1260" y="112" textAnchor="middle" fill="#fbbf24" opacity="0.8" fontFamily="var(--font-display)" fontSize="54" fontWeight="900" letterSpacing="10">
        LIVE
      </text>
      <g fill="#fbbf24" opacity="0.55">
        <circle cx="1010" cy="140" r="4" className="pc-float" />
        <circle cx="1450" cy="170" r="3" />
        <circle cx="1100" cy="420" r="3" />
        <circle cx="1520" cy="402" r="4" className="pc-float" />
      </g>
    </g>
  );
}

function BusinessScene({ ids }: { ids: SceneIds }) {
  return (
    <g>
      <rect width="1600" height="560" fill="#060b14" />
      <ellipse cx="1220" cy="120" rx="320" ry="220" fill="#1e40af" opacity="0.24" filter={`url(#${ids.soft})`} />
      <g fill="#0d1a2e" stroke="#d4af37" strokeOpacity="0.14">
        <path d="M900 560V320h70v240z" />
        <path d="M990 560V240h80v320z" />
        <path d="M1090 560V180h90v380z" />
        <path d="M1200 560V120h100v440z" />
        <path d="M1320 560V220h90v340z" />
        <path d="M1430 560V300h90v260z" />
      </g>
      <g stroke="#d4af37" strokeOpacity="0.16">
        <path d="M840 460h740M840 380h740M840 300h740M840 220h740M840 140h740" />
      </g>
      <path d="M850 430L980 380l90 34 130-130 100 40 140-160 130-54" fill="none" stroke={`url(#${ids.gold})`} strokeWidth="4" strokeLinejoin="round" />
      <path d="M850 430L980 380l90 34 130-130 100 40 140-160 130-54V560H850z" fill={`url(#${ids.fade})`} opacity="0.7" />
      <g fill="#d4af37">
        <circle cx="980" cy="380" r="5" />
        <circle cx="1200" cy="284" r="6" className="pc-pulse" />
        <circle cx="1440" cy="170" r="5" />
      </g>
      <g transform="translate(1380 110) rotate(7)">
        <rect width="180" height="220" rx="6" fill="#f2ecdd" opacity="0.92" />
        <text x="18" y="40" fill="#0f172a" fontFamily="var(--font-display)" fontSize="18" fontWeight="800">
          QUARTERLY
        </text>
        <path d="M18 58h144M18 66h144" stroke="#0f172a" strokeWidth="2" />
        <g stroke="#64748b" strokeWidth="2">
          <path d="M18 92h144M18 108h144M18 124h120M18 140h144M18 156h96M18 172h144M18 188h128" />
        </g>
      </g>
      <text x="1600" y="520" textAnchor="end" fill="#d4af37" opacity="0.06" fontFamily="var(--font-display)" fontSize="200" fontWeight="900" letterSpacing="-12">
        MARKETS
      </text>
    </g>
  );
}

function HistoryScene({ ids }: { ids: SceneIds }) {
  return (
    <g>
      <rect width="1600" height="560" fill="#0b0805" />
      <ellipse cx="1200" cy="140" rx="340" ry="220" fill="#925c2a" opacity="0.26" filter={`url(#${ids.soft})`} />
      <g transform="translate(980 34) rotate(4)">
        <path d="M0 20L30 0l30 20 30-20 30 20 30-20 30 20 30-20 30 20 30-20 30 20 30-20 30 20v440H0z" fill="#d9c39d" opacity="0.9" />
        <path d="M30 56h240M30 64h240" stroke="#6b4f2c" strokeWidth="2" />
        <text x="30" y="42" fill="#3b2a17" fontFamily="var(--font-display)" fontSize="20" fontWeight="800" letterSpacing="2">
          ARCHIVE 1887
        </text>
        <g transform="translate(30 86)">
          <rect width="110" height="120" fill="#3b2f24" />
          <circle cx="55" cy="52" r="34" fill="#8c6a45" opacity="0.7" />
          <path d="M8 120c14-40 32-52 48-52s38 14 54 52" fill="#1d1711" />
          <text x="0" y="136" fill="#4a3720" fontSize="8" fontWeight="800" letterSpacing="1">FIG. 01</text>
        </g>
        <g transform="translate(164 100) rotate(-3)">
          <rect width="106" height="120" fill="#2b241c" />
          <path d="M14 96l26-44 18 22 24-38 24 60" fill="none" stroke="#a98557" strokeWidth="2" />
          <text x="0" y="136" fill="#4a3720" fontSize="8" fontWeight="800" letterSpacing="1">FIELD NOTES</text>
        </g>
        <g stroke="#6b4f2c" strokeWidth="2" opacity="0.6">
          <path d="M30 260h240M30 276h240M30 292h200M30 308h240M30 324h170M30 340h240M30 356h220" />
        </g>
        <g transform="translate(190 370) rotate(-14)">
          <circle r="52" fill="none" stroke="#8b2f22" strokeWidth="4" opacity="0.7" />
          <text y="7" textAnchor="middle" fill="#8b2f22" fontSize="15" fontWeight="900" letterSpacing="1" opacity="0.8">FILED</text>
        </g>
      </g>
      <g fill="none" stroke="#d9a066" strokeOpacity="0.18">
        <ellipse cx="1180" cy="280" rx="300" ry="160" />
        <ellipse cx="1180" cy="280" rx="220" ry="160" />
        <path d="M880 280h600M1180 120v320" />
      </g>
      <circle cx="1180" cy="280" r="132" fill="#8a5a2b" opacity="0.12" />
      <text x="1600" y="520" textAnchor="end" fill="#d9a066" opacity="0.07" fontFamily="var(--font-display)" fontSize="190" fontWeight="900" letterSpacing="-10">
        ARCHIVE
      </text>
    </g>
  );
}

function ScienceScene({ ids }: { ids: SceneIds }) {
  return (
    <g>
      <rect width="1600" height="560" fill="#030813" />
      <ellipse cx="1230" cy="220" rx="320" ry="240" fill="#0891b2" opacity="0.2" filter={`url(#${ids.soft})`} />
      <g fill="#e0f2fe" opacity="0.6">
        <circle cx="880" cy="80" r="1.8" /><circle cx="980" cy="150" r="1.5" /><circle cx="1080" cy="60" r="2" />
        <circle cx="1360" cy="90" r="1.7" /><circle cx="1500" cy="180" r="1.4" /><circle cx="1420" cy="390" r="1.8" />
        <circle cx="960" cy="440" r="1.5" /><circle cx="1120" cy="500" r="1.8" /><circle cx="1540" cy="480" r="1.5" />
      </g>
      <g transform="translate(1240 250)">
        <ellipse rx="210" ry="62" fill="none" stroke="#67e8f9" strokeOpacity="0.34" transform="rotate(-18)" />
        <ellipse rx="210" ry="62" fill="none" stroke="#67e8f9" strokeOpacity="0.16" transform="rotate(18)" />
        <circle r="104" fill="#0e7490" opacity="0.18" />
        <circle r="104" fill="none" stroke="#67e8f9" strokeOpacity="0.42" />
        <path d="M-104 0c28 24 62 34 104 34s76-10 104-34M-104 0c28-24 62-34 104-34s76 10 104 34" fill="none" stroke="#67e8f9" strokeOpacity="0.18" />
        <circle cx="-150" cy="-46" r="7" fill="#67e8f9" className="pc-pulse" />
        <circle cx="146" cy="52" r="5" fill="#67e8f9" />
      </g>
      <g transform="translate(940 330)" fill="none" stroke="#67e8f9" strokeOpacity="0.5">
        <ellipse rx="118" ry="42" />
        <ellipse rx="118" ry="42" transform="rotate(60)" />
        <ellipse rx="118" ry="42" transform="rotate(120)" />
        <circle r="7" fill="#67e8f9" />
      </g>
      <path d="M1480 420h80v-70h60v70h50v110h-190z" fill="#061422" stroke="#67e8f9" strokeOpacity="0.35" />
      <path d="M1510 420v-40h20v40" fill="#67e8f9" fillOpacity="0.22" />
      <text x="1600" y="520" textAnchor="end" fill="#67e8f9" opacity="0.06" fontFamily="var(--font-display)" fontSize="180" fontWeight="900" letterSpacing="-10">
        SCIENCE
      </text>
    </g>
  );
}

function HealthScene({ ids }: { ids: SceneIds }) {
  return (
    <g>
      <rect width="1600" height="560" fill="#03100e" />
      <ellipse cx="1180" cy="260" rx="320" ry="220" fill="#14b8a6" opacity="0.2" filter={`url(#${ids.soft})`} />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M820 300h130l34-78 44 160 38-82h120l30 44 28-92 38 48h270" stroke="#5eead4" strokeOpacity="0.28" strokeWidth="16" filter={`url(#${ids.glow})`} />
        <path d="M820 300h130l34-78 44 160 38-82h120l30 44 28-92 38 48h270" stroke="#5eead4" strokeWidth="4" />
      </g>
      <g transform="translate(1240 180)" fill="none" stroke="#5eead4" strokeOpacity="0.3">
        <circle r="88" className="pc-pulse" />
        <circle r="130" strokeDasharray="5 16" />
        <path d="M-60 0h120M0-60v120" />
      </g>
      <g transform="translate(1400 360) rotate(24)">
        <path d="M0 90C0 36 34 0 92-6 88 48 54 84 0 90z" fill="#5eead4" fillOpacity="0.14" stroke="#5eead4" strokeOpacity="0.45" />
        <path d="M12 78C28 52 50 30 76 12" fill="none" stroke="#5eead4" strokeOpacity="0.4" />
      </g>
      <text x="1600" y="520" textAnchor="end" fill="#5eead4" opacity="0.06" fontFamily="var(--font-display)" fontSize="180" fontWeight="900" letterSpacing="-10">
        WELLBEING
      </text>
    </g>
  );
}

function SocietyScene({ ids }: { ids: SceneIds }) {
  return (
    <g>
      <rect width="1600" height="560" fill="#09070d" />
      <ellipse cx="1200" cy="140" rx="320" ry="200" fill="#fb923c" opacity="0.18" filter={`url(#${ids.soft})`} />
      <g fill="#160f18" stroke="#fb923c" strokeOpacity="0.12">
        <path d="M900 560V300h90v260z" /><path d="M1010 560V220h100v340z" />
        <path d="M1130 560V260h110v300z" /><path d="M1260 560V180h110v380z" />
        <path d="M1390 560V280h110v280z" /><path d="M1520 560V220h80v340z" />
      </g>
      <g fill="#fb923c" opacity="0.28">
        {[0, 1, 2, 3, 4].flatMap((row) =>
          [0, 1, 2, 3, 4].map((col) => <rect key={`${row}-${col}`} x={928 + col * 132} y={240 + row * 58} width="8" height="12" />),
        )}
      </g>
      <g fill="#050308" opacity="0.92">
        <circle cx="960" cy="500" r="26" /><path d="M918 560v-34c0-24 18-38 42-38s42 14 42 38v34z" />
        <circle cx="1100" cy="486" r="24" /><path d="M1062 560v-34c0-22 16-34 38-34s38 12 38 34v34z" />
        <circle cx="1250" cy="508" r="28" /><path d="M1206 560v-32c0-24 18-38 44-38s44 14 44 38v32z" />
        <circle cx="1410" cy="480" r="23" /><path d="M1374 560v-36c0-20 15-32 36-32s36 12 36 32v36z" />
        <circle cx="1540" cy="506" r="26" /><path d="M1498 560v-32c0-23 17-36 42-36s42 13 42 36v32z" />
      </g>
      <g fill="none" stroke="#fb923c" strokeOpacity="0.22">
        <path d="M960 500c80-90 160-90 200-14s140 60 250-6" />
        <path d="M1100 486c110-40 200 20 310 22" strokeDasharray="4 12" />
      </g>
      <text x="1600" y="520" textAnchor="end" fill="#fb923c" opacity="0.06" fontFamily="var(--font-display)" fontSize="160" fontWeight="900" letterSpacing="-10">
        CULTURE
      </text>
    </g>
  );
}

function MusicScene({ ids }: { ids: SceneIds }) {
  return (
    <g>
      <rect width="1600" height="560" fill="#080512" />
      <ellipse cx="1220" cy="220" rx="320" ry="220" fill="#a78bfa" opacity="0.24" filter={`url(#${ids.soft})`} />
      <g transform="translate(1230 270)">
        <circle r="150" fill="#0d0719" stroke="#a78bfa" strokeOpacity="0.32" />
        {[124, 98, 72, 46].map((radius) => (
          <circle key={radius} r={radius} fill="none" stroke="#a78bfa" strokeOpacity="0.16" />
        ))}
        <circle r="18" fill="#a78bfa" opacity="0.6" />
        <circle r="5" fill="#0d0719" />
        <path d="M-150 0a150 150 0 0 1 150-150" fill="none" stroke="#c084fc" strokeOpacity="0.5" strokeWidth="3" />
      </g>
      <g stroke="#a78bfa" strokeWidth="4" strokeLinecap="round" opacity="0.5">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => (
          <path key={index} d={`M${900 + index * 70} 490v-${40 + ((index * 37) % 150)}`} />
        ))}
      </g>
      <g fill="#c084fc" opacity="0.55">
        <circle cx="1000" cy="120" r="4" className="pc-float" />
        <circle cx="1500" cy="160" r="3" />
        <circle cx="1100" cy="420" r="3" />
      </g>
      <text x="1600" y="520" textAnchor="end" fill="#a78bfa" opacity="0.06" fontFamily="var(--font-display)" fontSize="180" fontWeight="900" letterSpacing="-10">
        SOUND
      </text>
    </g>
  );
}

function SportsScene({ ids }: { ids: SceneIds }) {
  return (
    <g>
      <rect width="1600" height="560" fill="#050d07" />
      <ellipse cx="1200" cy="100" rx="340" ry="200" fill="#a3e635" opacity="0.18" filter={`url(#${ids.soft})`} />
      <g fill="none" stroke="#a3e635" strokeOpacity="0.24">
        <path d="M820 500c120-90 460-90 700 0" strokeWidth="3" />
        <path d="M900 470c100-60 380-60 500 0" />
        <path d="M1000 440h300M1060 410h180" />
        <path d="M1240 560V200M1240 200l-80 60M1240 200l80 60" />
      </g>
      <g transform="translate(1240 300)">
        <circle r="74" fill="#0a180b" stroke="#a3e635" strokeOpacity="0.5" strokeWidth="2" />
        <path d="M0-74l18 14-6 22h-24l-6-22zM0 74l18-14-6-22h-24l-6 22zM-70-12l16 8v18l-18 8M70-12l-16 8v18l18 8" fill="none" stroke="#a3e635" strokeOpacity="0.62" strokeWidth="2" />
        <path d="M-14-14l-10 10 6 14h16l6-14z" fill="#a3e635" fillOpacity="0.4" />
      </g>
      <g fill="#a3e635" opacity="0.6">
        <circle cx="940" cy="130" r="4" className="pc-pulse" />
        <circle cx="1520" cy="180" r="3" />
        <circle cx="1080" cy="380" r="3" />
      </g>
      <text x="1600" y="520" textAnchor="end" fill="#a3e635" opacity="0.06" fontFamily="var(--font-display)" fontSize="170" fontWeight="900" letterSpacing="-10">
        GAME DAY
      </text>
    </g>
  );
}

function TrendingScene({ ids }: { ids: SceneIds }) {
  return (
    <g>
      <rect width="1600" height="560" fill="#04100c" />
      <ellipse cx="1180" cy="200" rx="340" ry="240" fill="#10b981" opacity="0.22" filter={`url(#${ids.soft})`} />
      <g fill="none" stroke="#6ee7b7" strokeOpacity="0.24">
        <circle cx="1220" cy="260" r="150" className="pc-drift" />
        <circle cx="1220" cy="260" r="110" strokeDasharray="4 14" />
        <circle cx="1220" cy="260" r="70" />
      </g>
      <g stroke="#6ee7b7" strokeLinecap="round" strokeWidth="7" opacity="0.6">
        <path d="M900 460v-60M980 460v-110M1060 460v-80M1140 460v-160M1220 460v-120M1300 460v-200M1380 460v-140M1460 460v-240" />
      </g>
      <path d="M880 420l100-60 90 20 100-100 100 40 120-140 130-40" fill="none" stroke="#6ee7b7" strokeWidth="3" opacity="0.8" />
      <g fill="#6ee7b7">
        <circle cx="980" cy="360" r="5" /><circle cx="1170" cy="280" r="6" className="pc-pulse" /><circle cx="1490" cy="140" r="5" />
      </g>
      <text x="1600" y="520" textAnchor="end" fill="#6ee7b7" opacity="0.06" fontFamily="var(--font-display)" fontSize="180" fontWeight="900" letterSpacing="-10">
        TRENDING
      </text>
    </g>
  );
}
