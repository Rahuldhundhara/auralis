/** Target languages offered by the lyrics translator. */
export const TRANSLATION_LANGUAGES: Array<[string, string]> = [
  ['EN', 'English'],
  ['HI', 'Hindi'],
  ['ES', 'Spanish'],
  ['FR', 'French'],
  ['DE', 'German'],
  ['JA', 'Japanese'],
  ['KO', 'Korean'],
  ['PT', 'Portuguese'],
  ['AR', 'Arabic'],
  ['ZH', 'Chinese'],
  ['RU', 'Russian'],
  ['TR', 'Turkish'],
  ['IT', 'Italian'],
  ['ID', 'Indonesian'],
  ['BN', 'Bengali'],
  ['TA', 'Tamil'],
  ['TE', 'Telugu'],
  ['MR', 'Marathi'],
  ['UR', 'Urdu'],
  ['VI', 'Vietnamese'],
  ['TH', 'Thai'],
  ['NL', 'Dutch'],
  ['PL', 'Polish'],
];

/** Maps two-letter app language codes to the tags translation services expect. */
export function translationLanguageTag(language: string): string {
  const value = (language || 'en').trim().toLowerCase();
  if (value === 'zh') return 'zh-CN';
  if (value === 'pt') return 'pt';
  return value.split(/[-_]/)[0] || 'en';
}
