import type { CSSProperties } from 'react';

export type PodcastArtVariant =
  | 'trending'
  | 'crime'
  | 'news'
  | 'horror'
  | 'technology'
  | 'comedy'
  | 'business'
  | 'history'
  | 'science'
  | 'health'
  | 'society'
  | 'music'
  | 'sports';

export interface PodcastTheme {
  id: string;
  label: string;
  query: string;
  eyebrow: string;
  title: string;
  tagline: string;
  description: string;
  art: PodcastArtVariant;
  accent: string;
  accentRgb: string;
  ink: string;
  muted: string;
  base: string;
  panel: string;
  border: string;
  searchBg: string;
  glowA: string;
  glowB: string;
}

/**
 * Every podcast category owns a complete visual world. The page only reads
 * these tokens, so adding a category never means scattering conditionals
 * through the layout.
 */
export const PODCAST_THEMES: Record<string, PodcastTheme> = {
  trending: {
    id: 'trending',
    label: 'Trending',
    query: 'podcast',
    eyebrow: 'Podcast discovery',
    title: 'Stories worth pressing play on',
    tagline: 'The world, one episode at a time.',
    description: 'True crime, comedy, news and more — every show plays in the same player as your music.',
    art: 'trending',
    accent: '#6ee7b7',
    accentRgb: '110, 231, 183',
    ink: '#f4fffa',
    muted: 'rgba(219, 242, 233, 0.62)',
    base: '#050b09',
    panel: 'rgba(7, 23, 17, 0.72)',
    border: 'rgba(110, 231, 183, 0.18)',
    searchBg: 'rgba(4, 13, 9, 0.66)',
    glowA: 'rgba(52, 211, 153, 0.20)',
    glowB: 'rgba(16, 185, 129, 0.14)',
  },
  crime: {
    id: 'crime',
    label: 'True crime',
    query: 'true crime podcast',
    eyebrow: 'True crime & mystery',
    title: 'Cases that keep you up at night',
    tagline: 'Every clue leaves a mark.',
    description: 'Investigations, cold cases and unsolved mysteries, told by the people who lived them.',
    art: 'crime',
    accent: '#f87171',
    accentRgb: '248, 113, 113',
    ink: '#fff1f1',
    muted: 'rgba(255, 226, 226, 0.58)',
    base: '#0a0607',
    panel: 'rgba(26, 9, 11, 0.74)',
    border: 'rgba(248, 113, 113, 0.22)',
    searchBg: 'rgba(16, 6, 7, 0.72)',
    glowA: 'rgba(185, 28, 28, 0.22)',
    glowB: 'rgba(120, 20, 30, 0.14)',
  },
  news: {
    id: 'news',
    label: 'News',
    query: 'news podcast',
    eyebrow: 'News & current affairs',
    title: 'The stories shaping today',
    tagline: 'Read between the headlines.',
    description: 'Headlines, analysis and the conversations behind the stories that move the world.',
    art: 'news',
    accent: '#f5f2e9',
    accentRgb: '245, 242, 233',
    ink: '#faf9f5',
    muted: 'rgba(226, 232, 240, 0.60)',
    base: '#0b0d10',
    panel: 'rgba(17, 20, 24, 0.78)',
    border: 'rgba(245, 242, 233, 0.18)',
    searchBg: 'rgba(13, 16, 20, 0.74)',
    glowA: 'rgba(255, 255, 255, 0.09)',
    glowB: 'rgba(220, 38, 38, 0.12)',
  },
  horror: {
    id: 'horror',
    label: 'Horror',
    query: 'horror paranormal podcast',
    eyebrow: 'Horror & paranormal',
    title: "Don't listen alone",
    tagline: 'The dark is listening.',
    description: 'Hauntings, unsolved mysteries and the things that go bump in the night.',
    art: 'horror',
    accent: '#c084fc',
    accentRgb: '192, 132, 252',
    ink: '#f7f0ff',
    muted: 'rgba(233, 213, 255, 0.56)',
    base: '#06040a',
    panel: 'rgba(17, 9, 28, 0.78)',
    border: 'rgba(192, 132, 252, 0.22)',
    searchBg: 'rgba(11, 6, 18, 0.74)',
    glowA: 'rgba(126, 34, 206, 0.25)',
    glowB: 'rgba(136, 19, 55, 0.14)',
  },
  technology: {
    id: 'technology',
    label: 'Technology',
    query: 'technology podcast',
    eyebrow: 'Technology & future',
    title: 'Tomorrow, decoded',
    tagline: 'The future, in your ears.',
    description: 'AI, startups, security and the ideas quietly building the next decade.',
    art: 'technology',
    accent: '#38bdf8',
    accentRgb: '56, 189, 248',
    ink: '#effaff',
    muted: 'rgba(207, 236, 255, 0.60)',
    base: '#030a14',
    panel: 'rgba(5, 20, 36, 0.78)',
    border: 'rgba(56, 189, 248, 0.22)',
    searchBg: 'rgba(3, 13, 24, 0.74)',
    glowA: 'rgba(14, 165, 233, 0.24)',
    glowB: 'rgba(34, 211, 238, 0.13)',
  },
  comedy: {
    id: 'comedy',
    label: 'Comedy',
    query: 'comedy podcast',
    eyebrow: 'Comedy & entertainment',
    title: 'Laugh until the credits roll',
    tagline: 'Your daily dose of nonsense.',
    description: 'Stand-up, panel shows and the funniest people on the internet, unfiltered.',
    art: 'comedy',
    accent: '#fbbf24',
    accentRgb: '251, 191, 36',
    ink: '#fff9ec',
    muted: 'rgba(255, 237, 213, 0.62)',
    base: '#120a05',
    panel: 'rgba(31, 16, 8, 0.76)',
    border: 'rgba(251, 191, 36, 0.22)',
    searchBg: 'rgba(20, 10, 5, 0.72)',
    glowA: 'rgba(249, 115, 22, 0.22)',
    glowB: 'rgba(168, 85, 247, 0.13)',
  },
  business: {
    id: 'business',
    label: 'Business',
    query: 'business podcast',
    eyebrow: 'Business & finance',
    title: 'Markets, moves and money',
    tagline: 'Where ambition meets insight.',
    description: 'Founders, investors and the decisions that move the economy.',
    art: 'business',
    accent: '#d4af37',
    accentRgb: '212, 175, 55',
    ink: '#faf6e8',
    muted: 'rgba(226, 232, 240, 0.60)',
    base: '#070b12',
    panel: 'rgba(12, 19, 31, 0.80)',
    border: 'rgba(212, 175, 55, 0.24)',
    searchBg: 'rgba(8, 13, 21, 0.76)',
    glowA: 'rgba(30, 64, 175, 0.20)',
    glowB: 'rgba(212, 175, 55, 0.12)',
  },
  history: {
    id: 'history',
    label: 'History',
    query: 'history podcast',
    eyebrow: 'History & archives',
    title: 'The past, brought back to life',
    tagline: 'Every era has a voice.',
    description: 'Archival stories, forgotten lives and the moments that shaped the present.',
    art: 'history',
    accent: '#d9a066',
    accentRgb: '217, 160, 102',
    ink: '#fff6e9',
    muted: 'rgba(238, 214, 184, 0.62)',
    base: '#0c0906',
    panel: 'rgba(31, 22, 14, 0.80)',
    border: 'rgba(217, 160, 102, 0.24)',
    searchBg: 'rgba(20, 14, 9, 0.76)',
    glowA: 'rgba(146, 92, 42, 0.24)',
    glowB: 'rgba(89, 58, 30, 0.14)',
  },
  science: {
    id: 'science',
    label: 'Science',
    query: 'science podcast',
    eyebrow: 'Science & discovery',
    title: 'The universe, explained',
    tagline: 'Curiosity has no ceiling.',
    description: 'Space, experiments and the ideas rewriting what we know about everything.',
    art: 'science',
    accent: '#67e8f9',
    accentRgb: '103, 232, 249',
    ink: '#eefdff',
    muted: 'rgba(207, 246, 255, 0.62)',
    base: '#040a14',
    panel: 'rgba(7, 22, 38, 0.80)',
    border: 'rgba(103, 232, 249, 0.24)',
    searchBg: 'rgba(4, 13, 23, 0.76)',
    glowA: 'rgba(8, 145, 178, 0.24)',
    glowB: 'rgba(99, 102, 241, 0.14)',
  },
  health: {
    id: 'health',
    label: 'Health',
    query: 'health podcast',
    eyebrow: 'Health & wellbeing',
    title: 'Better living, one episode at a time',
    tagline: 'Small changes, lasting impact.',
    description: 'Sleep, fitness, nutrition and the science of feeling well.',
    art: 'health',
    accent: '#5eead4',
    accentRgb: '94, 234, 212',
    ink: '#effffb',
    muted: 'rgba(204, 251, 241, 0.60)',
    base: '#03100e',
    panel: 'rgba(5, 26, 23, 0.76)',
    border: 'rgba(94, 234, 212, 0.22)',
    searchBg: 'rgba(4, 16, 14, 0.72)',
    glowA: 'rgba(20, 184, 166, 0.20)',
    glowB: 'rgba(74, 222, 128, 0.11)',
  },
  society: {
    id: 'society',
    label: 'Society',
    query: 'society culture podcast',
    eyebrow: 'Society & culture',
    title: 'People, culture and the world we share',
    tagline: 'Stories that connect us.',
    description: 'Documentaries and conversations about how we live together.',
    art: 'society',
    accent: '#fb923c',
    accentRgb: '251, 146, 60',
    ink: '#fff6ee',
    muted: 'rgba(254, 215, 170, 0.60)',
    base: '#09070d',
    panel: 'rgba(22, 12, 18, 0.78)',
    border: 'rgba(251, 146, 60, 0.22)',
    searchBg: 'rgba(13, 8, 12, 0.74)',
    glowA: 'rgba(244, 63, 94, 0.16)',
    glowB: 'rgba(59, 130, 246, 0.13)',
  },
  music: {
    id: 'music',
    label: 'Music',
    query: 'music podcast',
    eyebrow: 'Music & sound',
    title: 'Inside the sound',
    tagline: 'Turn it up and listen closer.',
    description: 'Artists, producers and the stories behind the records you love.',
    art: 'music',
    accent: '#a78bfa',
    accentRgb: '167, 139, 250',
    ink: '#f8f4ff',
    muted: 'rgba(221, 214, 254, 0.60)',
    base: '#090512',
    panel: 'rgba(20, 10, 34, 0.78)',
    border: 'rgba(167, 139, 250, 0.22)',
    searchBg: 'rgba(12, 7, 21, 0.74)',
    glowA: 'rgba(139, 92, 246, 0.22)',
    glowB: 'rgba(236, 72, 153, 0.12)',
  },
  sports: {
    id: 'sports',
    label: 'Sports',
    query: 'sports podcast',
    eyebrow: 'Sports & competition',
    title: 'Beyond the scoreboard',
    tagline: 'Every game has a story.',
    description: 'Athletes, rivalries and the moments that made the game.',
    art: 'sports',
    accent: '#a3e635',
    accentRgb: '163, 230, 53',
    ink: '#f8ffe9',
    muted: 'rgba(217, 249, 157, 0.60)',
    base: '#071008',
    panel: 'rgba(12, 27, 12, 0.78)',
    border: 'rgba(163, 230, 53, 0.22)',
    searchBg: 'rgba(7, 17, 8, 0.74)',
    glowA: 'rgba(132, 204, 22, 0.20)',
    glowB: 'rgba(249, 115, 22, 0.11)',
  },
};

export const PODCAST_CATEGORIES = Object.values(PODCAST_THEMES).map(({ id, label, query }) => ({
  id,
  label,
  query,
}));

export const DEFAULT_PODCAST_THEME = PODCAST_THEMES.trending;

export function podcastThemeVars(theme: PodcastTheme): CSSProperties {
  return {
    '--pc-accent': theme.accent,
    '--pc-accent-rgb': theme.accentRgb,
    '--pc-ink': theme.ink,
    '--pc-muted': theme.muted,
    '--pc-base': theme.base,
    '--pc-panel': theme.panel,
    '--pc-border': theme.border,
    '--pc-search': theme.searchBg,
  } as CSSProperties;
}

export function podcastPageBackground(theme: PodcastTheme): string {
  return [
    `radial-gradient(120% 82% at 16% -4%, ${theme.glowA}, transparent 62%)`,
    `radial-gradient(88% 72% at 88% 0%, ${theme.glowB}, transparent 58%)`,
    `radial-gradient(110% 58% at 82% 100%, ${theme.glowB}, transparent 68%)`,
    `linear-gradient(180deg, ${theme.base} 0%, #090b0e 54%, ${theme.base} 100%)`,
  ].join(', ');
}

