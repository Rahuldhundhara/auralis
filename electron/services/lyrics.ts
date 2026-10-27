import type {
  LyricsLine,
  LyricsResult,
  Track,
  TranslationResult,
  TranslationSettings,
} from '../../shared/types';
import { innertube } from './innertube';
import { parseLyrics, parseNext } from './ytm-parse';
import { settingsStore } from './store';
import { streams } from './streams';

export type ProviderName =
  | 'YouTube'
  | 'YouTubeSubtitle'
  | 'BetterLyrics'
  | 'Paxsenix'
  | 'LyricsPlus'
  | 'LrcLib'
  | 'KuGou'
  | 'Zemer';

interface ProviderOutput {
  provider: string;
  raw: string;
  synced: boolean;
  lines: LyricsLine[];
}

const API_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
};

async function fetchText(url: string, timeoutMs = 15000): Promise<string | null> {
  try {
    const response = await fetch(url, { headers: API_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function fetchJson<T = any>(url: string, timeoutMs = 15000): Promise<T | null> {
  const text = await fetchText(url, timeoutMs);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s*[([].*?(official|video|audio|lyrics?|visuali[sz]er|hd|hq|4k|remaster|remix|live|acoustic|version|edit|extended|radio|clean|explicit).*?[)\]]/gi, '')
    .replace(/\s*[-|]\s*(official|video|audio|lyrics?|visuali[sz]er).*$/gi, '')
    .replace(/\s*\(feat\..*?\)/gi, '')
    .replace(/\s*\(ft\..*?\)/gi, '')
    .replace(/\s*\b(feat|ft)\.\s.*$/gi, '')
    .replace(/\s*\([^)]*\b(19|20)\d{2}\b[^)]*\)/g, '')
    .trim();
}

function primaryArtist(track: Track): string {
  return (track.artists || []).map((a) => a.name).filter(Boolean)[0] || '';
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

/** Parses LRC, including extended word and agent tags. */
export function parseLrc(raw: string): LyricsLine[] {
  const lines: LyricsLine[] = [];
  const timeRe = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  const wordRe = /<([^<>|]+):(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?)(?::([01]))?>/g;
  const sorted = (raw || '').replace(/\r\n/g, '\n').split('\n');
  for (const original of sorted) {
    const stamps: number[] = [];
    let match: RegExpExecArray | null;
    timeRe.lastIndex = 0;
    let lastIndex = 0;
    while ((match = timeRe.exec(original))) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] ? Number(match[3].padEnd(3, '0')) : 0;
      stamps.push(minutes * 60 + seconds + fraction / 1000);
      lastIndex = timeRe.lastIndex;
    }
    if (!stamps.length) continue;
    let text = original.slice(lastIndex).trim();
    if (/^\[[a-z]+:.*\]$/i.test(text)) continue;
    let agent: string | undefined;
    let background = false;
    const agentMatch = text.match(/^\{(?:agent:)?([^}]+)\}/);
    if (agentMatch) {
      if (/^(bg|background)$/i.test(agentMatch[1])) background = true;
      else agent = agentMatch[1];
      text = text.slice(agentMatch[0].length).trim();
    }
    if (text.startsWith('{bg}')) {
      background = true;
      text = text.slice(4).trim();
    }
    const words: NonNullable<LyricsLine['words']> = [];
    wordRe.lastIndex = 0;
    let wordMatch: RegExpExecArray | null;
    while ((wordMatch = wordRe.exec(text))) {
      words.push({
        text: wordMatch[1],
        start: Number(wordMatch[2]),
        end: Number(wordMatch[3]),
      });
    }
    if (words.length) text = words.map((w) => w.text).join('');
    for (const time of stamps) {
      lines.push({
        time,
        text,
        words: words.length ? words : undefined,
        agent,
        background: background || undefined,
      });
    }
  }
  lines.sort((a, b) => a.time - b.time);
  // Extended LRCs may include translation/romanization on lines starting with `{tr}` / `{ro}`.
  return lines;
}

function plainToLines(raw: string): LyricsLine[] {
  return (raw || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((text) => text.trim())
    .filter((text) => text && !/^\[[a-z]+:.*\]$/i.test(text))
    .map((text) => ({ time: 0, text }));
}

/** Basic TTML parser (line and word timing). */
export function parseTtml(raw: string): LyricsLine[] {
  if (!raw) return [];
  const lines: LyricsLine[] = [];
  const pRe = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  while ((match = pRe.exec(raw))) {
    const attrs = match[1];
    const body = match[2];
    const begin = Number((attrs.match(/\bbegin="([^"]+)"/) || [])[1]) || 0;
    const end = Number((attrs.match(/\bend="([^"]+)"/) || [])[1]) || 0;
    const spans: NonNullable<LyricsLine['words']> = [];
    const spanRe = /<span\b([^>]*)>([\s\S]*?)<\/span>/gi;
    let span: RegExpExecArray | null;
    while ((span = spanRe.exec(body))) {
      const sAttrs = span[1];
      const text = span[2].replace(/<[^>]+>/g, '');
      if (!text.trim()) continue;
      const sBegin = (sAttrs.match(/\bbegin="([^"]+)"/) || [])[1];
      const sEnd = (sAttrs.match(/\bend="([^"]+)"/) || [])[1];
      spans.push({
        text,
        start: sBegin ? timeToSeconds(sBegin) : begin,
        end: sEnd ? timeToSeconds(sEnd) : end,
      });
    }
    const text = body.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').trim();
    if (!text) continue;
    lines.push({ time: begin, text, words: spans.length ? spans : undefined });
  }
  if (!lines.length) return plainToLines(raw.replace(/<[^>]+>/g, ''));
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

function timeToSeconds(value: string): number {
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    if (trimmed.includes('.')) return Number(trimmed);
    return Number(trimmed);
  }
  const parts = trimmed.split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(trimmed) || 0;
}

async function fromYouTube(track: Track): Promise<ProviderOutput | null> {
  try {
    const next = parseNext(await innertube.next({ videoId: track.id }));
    if (!next.lyricsEndpoint) return null;
    const raw = parseLyrics(await innertube.lyrics(next.lyricsEndpoint));
    if (!raw) return null;
    return { provider: 'YouTube', raw, synced: false, lines: plainToLines(raw) };
  } catch {
    return null;
  }
}

async function fromBetterLyrics(track: Track): Promise<ProviderOutput | null> {
  const url = `https://lyrics-api.boidu.dev/getLyrics?s=${encode(track.title)}&a=${encode(primaryArtist(track))}` +
    (track.duration ? `&d=${track.duration}` : '') +
    (track.album?.name ? `&al=${encode(track.album.name)}` : '');
  const json = await fetchJson<any>(url);
  const ttml = (json?.ttml || '').trim();
  if (!ttml) return null;
  const lines = parseTtml(ttml);
  if (!lines.length) return null;
  return { provider: 'BetterLyrics', raw: ttml, synced: lines.some((l) => l.time > 0), lines };
}

async function fromLyricsPlus(track: Track): Promise<ProviderOutput | null> {
  const bases = [
    'https://lyricsplus.binimum.org',
    'https://lyricsplus.atomix.one',
    'https://lyricsplus.prjktla.my.id',
    'https://lyricsplus-seven.vercel.app',
  ];
  for (const base of bases) {
    const url = `${base}/v2/lyrics/get?title=${encode(track.title)}&artist=${encode(primaryArtist(track))}` +
      (track.duration ? `&duration=${track.duration}` : '') +
      (track.album?.name ? `&album=${encode(track.album.name)}` : '');
    const json = await fetchJson<any>(url, 12000);
    const items = json?.lyrics;
    if (!Array.isArray(items) || !items.length) continue;
    const lines: LyricsLine[] = items.map((item: any) => {
      const words = Array.isArray(item.syllabus)
        ? item.syllabus
            .filter((w: any) => String(w.text || '').length)
            .map((w: any) => ({
              text: String(w.text),
              start: Number(w.time || 0) / 1000,
              end: (Number(w.time || 0) + Number(w.duration || 0)) / 1000,
            }))
        : undefined;
      return {
        time: Number(item.time || 0) / 1000,
        text: String(item.text || words?.map((w: { text: string }) => w.text).join('') || '').trim(),
        words: words?.length ? words : undefined,
        translation: item.translation?.text || undefined,
        romanized: item.transliteration?.text || undefined,
        agent: item.element?.singer || undefined,
        background: Boolean(item.syllabus?.some((w: any) => w.isBackground)),
      };
    }).filter((line: LyricsLine) => line.text);
    if (!lines.length) continue;
    return {
      provider: 'LyricsPlus',
      raw: JSON.stringify(json).slice(0, 200_000),
      synced: String(json?.type || '').toLowerCase() === 'word' || lines.some((l) => l.time > 0),
      lines,
    };
  }
  return null;
}

async function fromLrcLib(track: Track): Promise<ProviderOutput | null> {
  const params = new URLSearchParams({
    track_name: cleanTitle(track.title),
    artist_name: primaryArtist(track),
  });
  if (track.album?.name) params.set('album_name', track.album.name);
  if (track.duration) params.set('duration', String(Math.round(track.duration)));
  let json = await fetchJson<any>(`https://lrclib.net/api/get?${params.toString()}`);
  if (!json) {
    const search = await fetchJson<any[]>(
      `https://lrclib.net/api/search?track_name=${encode(cleanTitle(track.title))}&artist_name=${encode(primaryArtist(track))}`,
    );
    if (Array.isArray(search) && search.length) {
      json = search
        .filter((entry) => entry.syncedLyrics || entry.plainLyrics)
        .sort((a, b) => Math.abs((a.duration || 0) - track.duration) - Math.abs((b.duration || 0) - track.duration))[0];
    }
  }
  if (!json || json.instrumental) return null;
  const raw = json.syncedLyrics || json.plainLyrics;
  if (!raw) return null;
  const synced = Boolean(json.syncedLyrics);
  const lines = synced ? parseLrc(raw) : plainToLines(raw);
  if (!lines.length) return null;
  return { provider: 'LrcLib', raw, synced, lines };
}

async function fromKuGou(track: Track): Promise<ProviderOutput | null> {
  const query = `${cleanTitle(track.title)} - ${primaryArtist(track)}`;
  const candidates = await fetchJson<any>(
    `https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=${encode(query)}&duration=${Math.round((track.duration || 0) * 1000)}`,
  );
  const candidate = candidates?.candidates?.[0];
  if (!candidate?.id || !candidate?.accesskey) return null;
  const json = await fetchJson<any>(
    `https://lyrics.kugou.com/download?ver=1&client=pc&id=${encode(String(candidate.id))}&accesskey=${encode(String(candidate.accesskey))}&fmt=lrc&charset=utf8`,
  );
  if (!json?.content) return null;
  const raw = Buffer.from(json.content, 'base64').toString('utf8');
  let text = raw;
  if (/^lrc\d*\s*$/i.test(raw.slice(0, 20).trim()) && raw.includes('\n')) {
    const nl = raw.indexOf('\n');
    text = raw.slice(nl + 1);
  }
  const lines = parseLrc(text);
  if (!lines.length) return null;
  return { provider: 'KuGou', raw: text, synced: true, lines };
}

async function fromZemer(track: Track): Promise<ProviderOutput | null> {
  const json = await fetchJson<any>(`https://search.zemer.io/lyrics/resolve?videoId=${encode(track.id)}`);
  if (!json?.sources?.length) return null;
  const ranked = [...json.sources].sort((a: any, b: any) => {
    const rank = (s: any) => (s.type === 'jkaraoke' ? 0 : s.type === 'lrclib' ? 1 : s.type === 'bookmark' ? 2 : 3);
    return Number(Boolean(a.synced) ? 0 : 1) - Number(Boolean(b.synced) ? 0 : 1) || rank(a) - rank(b);
  });
  for (const source of ranked) {
    let raw: string | null = source.syncedLrc || source.plain || null;
    if (!raw && source.type === 'lrclib' && source.trackId) {
      const entry = await fetchJson<any>(`https://lrclib.net/api/get/${source.trackId}`);
      raw = entry?.syncedLyrics || entry?.plainLyrics || null;
    }
    if (!raw) continue;
    const lines = /\[\d{1,3}:\d{2}/.test(raw) ? parseLrc(raw) : plainToLines(raw);
    if (lines.length) {
      return { provider: 'Zemer', raw, synced: lines.some((l) => l.time > 0), lines };
    }
  }
  return null;
}

async function fromYouTubeSubtitle(track: Track): Promise<ProviderOutput | null> {
  const raw = await streams.fetchSubtitles(track.id);
  if (!raw) return null;
  const lines = parseLrc(raw);
  if (!lines.length) return null;
  return { provider: 'YouTubeSubtitle', raw, synced: true, lines };
}

const PROVIDERS: Record<string, (track: Track) => Promise<ProviderOutput | null>> = {
  YouTube: fromYouTube,
  BetterLyrics: fromBetterLyrics,
  LyricsPlus: fromLyricsPlus,
  LrcLib: fromLrcLib,
  KuGou: fromKuGou,
  Zemer: fromZemer,
  YouTubeSubtitle: fromYouTubeSubtitle,
  // Paxsenix needs an Apple Music token; it is attempted after the other
  // providers so a tokenless failure never blocks an available result.
  Paxsenix: async () => null,
};

export class LyricsService {
  private cache = new Map<string, { at: number; result: LyricsResult | null }>();

  async fetch(track: Track, providers?: string[]): Promise<LyricsResult | null> {
    const configured = providers?.length
      ? providers
      : settingsStore.get().lyricsProviders;
    const key = `${track.id}:${track.title}:${configured.join(',')}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < 30 * 60_000) return cached.result;

    for (const name of configured) {
      const provider = PROVIDERS[name];
      if (!provider) continue;
      const result = await provider(track).catch(() => null);
      if (result && result.lines.length) {
        const output: LyricsResult = {
          provider: result.provider,
          synced: result.synced,
          lines: result.lines,
          raw: result.raw,
        };
        this.cache.set(key, { at: Date.now(), result: output });
        return output;
      }
    }
    this.cache.set(key, { at: Date.now(), result: null });
    return null;
  }

  async translate(lines: string[], targetLanguage?: string): Promise<TranslationResult> {
    const settings = settingsStore.get().translation;
    const language = targetLanguage || settings.targetLanguage;
    if (!lines.some((line) => line.trim())) return { lines: lines.map(() => ''), provider: settings.provider };
    if (settings.provider === 'deepl' && settings.deeplApiKey.trim()) {
      const translated = await this.translateDeepL(lines, language, settings.deeplApiKey.trim());
      return { lines: translated, provider: 'deepl' };
    }
    if (settings.provider === 'openai' && settings.openaiApiKey.trim()) {
      const translated = await this.translateOpenAI(lines, language, settings);
      return { lines: translated, provider: 'openai' };
    }
    throw new Error(
      `Add ${settings.provider === 'deepl' ? 'a DeepL API key' : 'an OpenAI-compatible API key'} in Settings → Lyrics to translate.`,
    );
  }

  private async translateDeepL(lines: string[], language: string, apiKey: string): Promise<string[]> {
    const endpoint = apiKey.endsWith(':fx')
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';
    const target = deeplLanguage(language);
    const output: string[] = [];
    // DeepL accepts at most 50 text entries per request. Keep batches small so
    // normal songs do not fail with HTTP 400.
    for (let offset = 0; offset < lines.length; offset += 40) {
      const batch = lines.slice(offset, offset + 40);
      const requestBatch = batch.map((line) => (line.trim() ? line : ' '));
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `DeepL-Auth-Key ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: requestBatch,
          target_lang: target,
          preserve_formatting: true,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).trim().slice(0, 200);
        throw new Error(`DeepL returned HTTP ${response.status}${detail ? `: ${detail}` : '.'}`);
      }
      const json: any = await response.json();
      const translations = Array.isArray(json?.translations) ? json.translations : [];
      if (translations.length !== batch.length) {
        throw new Error(`DeepL returned ${translations.length} translations for ${batch.length} lyric lines.`);
      }
      output.push(...translations.map((entry: any, index: number) => (batch[index].trim() ? String(entry?.text || '') : '')));
    }
    return output;
  }

  private async translateOpenAI(
    lines: string[],
    language: string,
    settings: TranslationSettings,
  ): Promise<string[]> {
    const output: string[] = [];
    // Align by index, not by newline count. Providers often merge or omit
    // blank lines, which previously shifted every following translation.
    for (let offset = 0; offset < lines.length; offset += 25) {
      const batch = lines.slice(offset, offset + 25);
      const response = await fetch(`${settings.openaiBaseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.openaiApiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: settings.openaiModel || 'gpt-4o-mini',
          temperature: 0,
          messages: [
            {
              role: 'system',
              content:
                `Translate every line to ${language}. Keep the same number of lines and the same order. ` +
                'Keep empty lines empty. Do not merge lines, add numbering, or add commentary. ' +
                'Return JSON only in the form {"lines":["translated line", ...]}.',
            },
            { role: 'user', content: JSON.stringify({ lines: batch }) },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).trim().slice(0, 200);
        throw new Error(`OpenAI returned HTTP ${response.status}${detail ? `: ${detail}` : '.'}`);
      }
      const json: any = await response.json();
      const choice = json?.choices?.[0];
      if (choice?.finish_reason === 'length') throw new Error('The translation was cut off. Try fewer lyrics at once.');
      const content = String(choice?.message?.content || '').trim();
      const parsed = parseTranslationContent(content);
      if (parsed.length !== batch.length) {
        throw new Error(`The translator returned ${parsed.length} lines for ${batch.length} lyric lines.`);
      }
      output.push(...parsed);
    }
    return output;
  }
}

function deeplLanguage(code: string): string {
  const normalized = (code || 'en').toLowerCase();
  const map: Record<string, string> = {
    en: 'EN-US',
    pt: 'PT-BR',
    zh: 'ZH-HANS',
    ja: 'JA',
    ko: 'KO',
    hi: 'HI',
    es: 'ES',
    fr: 'FR',
    de: 'DE',
    it: 'IT',
    ar: 'AR',
    ru: 'RU',
    tr: 'TR',
    id: 'ID',
    nl: 'NL',
    pl: 'PL',
    sv: 'SV',
    da: 'DA',
    fi: 'FI',
    no: 'NB',
    cs: 'CS',
    el: 'EL',
    he: 'HE',
    hu: 'HU',
    ro: 'RO',
    sk: 'SK',
    uk: 'UK',
    vi: 'VI',
    th: 'TH',
    ms: 'MS',
    bn: 'BN',
    ta: 'TA',
    te: 'TE',
    ur: 'UR',
  };
  return map[normalized] || normalized.toUpperCase();
}

function parseTranslationContent(content: string): string[] {
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!cleaned) return [];
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed.map((line) => String(line ?? ''));
    if (Array.isArray(parsed?.lines)) return parsed.lines.map((line: any) => String(line ?? ''));
  } catch {
    // Fall back to one-line-per-row below.
  }
  return cleaned.split(/\r?\n/).map((line) => line.replace(/^\s*\d+[.)]\s*/, ''));
}

export const lyricsService = new LyricsService();
