import type { EqSettings } from '@shared/types';

export interface EqPreset {
  id: string;
  label: string;
  bands: number[];
  bassBoost?: number;
  preamp?: number;
}

export const EQ_PRESETS: EqPreset[] = [
  { id: 'flat', label: 'Flat', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bassBoost: 0, preamp: 0 },
  { id: 'bass', label: 'Bass boost', bands: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0], bassBoost: 5, preamp: -2 },
  { id: 'rock', label: 'Rock', bands: [4, 3, 2, 0, -1, 0, 2, 3, 4, 4], bassBoost: 2, preamp: -2 },
  { id: 'pop', label: 'Pop', bands: [-1, 0, 1, 3, 4, 3, 1, 0, 1, 2], bassBoost: 0, preamp: -1 },
  { id: 'vocal', label: 'Vocal', bands: [-2, -1, 0, 1, 3, 4, 4, 2, 0, -1], bassBoost: 0, preamp: -1 },
  { id: 'acoustic', label: 'Acoustic', bands: [2, 1, 0, 1, 2, 2, 1, 2, 3, 2], bassBoost: 1, preamp: -1 },
  { id: 'electronic', label: 'Electronic', bands: [5, 4, 2, 0, -2, 1, 2, 4, 5, 4], bassBoost: 3, preamp: -3 },
  { id: 'treble', label: 'Treble boost', bands: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6], bassBoost: 0, preamp: -1 },
];

export function applyPreset(eq: EqSettings, preset: EqPreset): EqSettings {
  return {
    ...eq,
    enabled: true,
    bands: [...preset.bands],
    bassBoost: preset.bassBoost ?? 0,
    preamp: preset.preamp ?? 0,
  };
}
