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

type LyricWord = NonNullable<LyricsLine['words']>[number];

const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/;

/** True when two adjacent word tokens need a visible space between them. */
function wordNeedsSpace(previous: string, next: string): boolean {
  if (!previous || !next) return false;
  if (/\s$/.test(previous) || /^\s/.test(next)) return false;
  // Punctuation attaches to the word before it; opening brackets attach after.
  if (/^[,.;:!?%)\]}\u2019\u201d]/.test(next)) return false;
  if (/[(\[{\u2018\u201c]$/.test(previous)) return false;
  // CJK scripts do not use inter-word spaces.
  if (CJK_RE.test(previous) || CJK_RE.test(next)) return false;
  return true;
}

/**
 * Word-level providers split a line into syllable tokens and rarely share a
 * boundary convention. Guessing from gaps or trailing spaces alone produces
 * garbage like "e nough" and "Ibeen". Every provider also ships the plain
 * line text, so the exact boundaries are derived from it by walking the
 * tokens against the text. Fall back to heuristics when they do not line up.
 */
function alignWordBoundaries(words: LyricWord[], text: string): boolean {
  let cursor = 0;
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    if (!word.text) return false;
    const found = text.indexOf(word.text, cursor);
    if (found === -1) return false;
    cursor = found + word.text.length;
    let end = cursor;
    while (end < text.length && text[end] === ' ') end++;
    word.space = index < words.length - 1 && end > cursor;
    cursor = end;
  }
  return true;
}

/** Normalise a syllable list against the plain line text. */
function normalizeWords(
  words: LyricWord[],
  rawText: string,
): { words: LyricWord[] | undefined; text: string } {
  const text = rawText.replace(/\s+/g, ' ').trim();
  const cleaned = words
    .map((word) => ({ ...word, text: String(word.text || '').replace(/\s+/g, ' ').trim() }))
    .filter((word) => word.text.length > 0);
  if (!cleaned.length) return { words: undefined, text };
  if (text && alignWordBoundaries(cleaned, text)) {
    return { words: cleaned, text };
  }
  // Fall back to heuristics: trust explicit space flags, else add spaces.
  const hasSignals = cleaned.some((word) => word.space === true);
  for (let index = 1; index < cleaned.length; index++) {
    const previous = cleaned[index - 1];
    previous.space = hasSignals
      ? Boolean(previous.space)
      : wordNeedsSpace(previous.text, cleaned[index].text);
  }
  return { words: cleaned, text: wordsToText(cleaned) };
}

function wordsToText(words: LyricWord[]): string {
  let out = '';
  for (let index = 0; index < words.length; index++) {
    if (index > 0 && words[index - 1].space) out += ' ';
    out += words[index].text;
  }
  return out.replace(/\s+/g, ' ').trim();
}

function normalizeAgent(singer: string | undefined): string | undefined {
  const value = String(singer || '').trim();
  if (!value) return undefined;
  // Apple Music / AMLL use bare ids such as "v1", "bgm" — they are internal
  // identifiers, not names worth showing.
  if (/^(v\d+|bgm?|bg|background|duet)$/i.test(value)) return undefined;
  return value;
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
    // Metadata such as "(From \"Brahmastra\")" is common in YouTube Music
    // titles but rarely part of the lyric-provider catalogue entry.
    .replace(/\s*[\(\[]\s*(?:from|feat\.?|ft\.?|with)\b[^)\]]*[\)\]]/gi, '')
    .replace(/\s*[\(\[]\s*(?:official|video|audio|lyrics?|visuali[sz]er|hd|hq|4k|remaster|remix|live|acoustic|version|edit|extended|radio|clean|explicit)[^)\]]*[\)\]]/gi, '')
    .replace(/\s*[-|]\s*(?:from|official|video|audio|lyrics?|visuali[sz]er)\b.*$/gi, '')
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
  // LRC files may carry a global `[offset:+/-ms]` adjustment. A positive
  // value shifts every timestamp later, which is how most players read it.
  const offsetMatch = (raw || '').match(/\[offset:\s*([+-]?\d+)\s*\]/i);
  const offset = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;
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
      stamps.push(Math.max(0, minutes * 60 + seconds + fraction / 1000 + offset));
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
    const wordMatches = Array.from(text.matchAll(wordRe));
    for (let index = 0; index < wordMatches.length; index++) {
      const wordMatch = wordMatches[index];
      const start = wordMatch.index ?? 0;
      const end = start + wordMatch[0].length;
      const gap = index === 0 ? '' : text.slice((wordMatches[index - 1].index ?? 0) + wordMatches[index - 1][0].length, start);
      words.push({
        text: wordMatch[1],
        start: Math.max(0, Number(wordMatch[2]) + offset),
        end: Math.max(0, Number(wordMatch[3]) + offset),
        space: /\s/.test(gap) ? true : undefined,
      });
    }
    const rawText = text.replace(wordRe, '').trim();
    const normalized = normalizeWords(words, rawText);
    const normalizedWords = normalized.words;
    text = normalized.text;
    for (const time of stamps) {
      lines.push({
        time,
        text,
        words: normalizedWords,
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

/**
 * A provider can claim to be synced while only a handful of lines carry
 * timestamps (for example when a parser misses one timestamp format). Treat
 * that as unsynced so the panel never highlights the wrong line.
 */
function isSynced(lines: LyricsLine[]): boolean {
  if (lines.length < 2) return false;
  const timed = lines.reduce((count, line) => count + (line.time > 0 ? 1 : 0), 0);
  return timed >= 2 && timed / lines.length >= 0.6;
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
    const beginRaw = (attrs.match(/\bbegin="([^"]+)"/) || [])[1];
    const endRaw = (attrs.match(/\bend="([^"]+)"/) || [])[1];
    const begin = beginRaw ? timeToSeconds(beginRaw) : 0;
    const end = endRaw ? timeToSeconds(endRaw) : 0;
    const spans: NonNullable<LyricsLine['words']> = [];
    const spanRe = /<span\b([^>]*)>([\s\S]*?)<\/span>/gi;
    const spanMatches = Array.from(body.matchAll(spanRe));
    for (let index = 0; index < spanMatches.length; index++) {
      const span = spanMatches[index];
      const sAttrs = span[1];
      const text = span[2].replace(/<[^>]+>/g, '');
      if (!text.trim()) continue;
      const start = span.index ?? 0;
      const gap = index === 0 ? '' : body.slice((spanMatches[index - 1].index ?? 0) + spanMatches[index - 1][0].length, start);
      const sBegin = (sAttrs.match(/\bbegin="([^"]+)"/) || [])[1];
      const sEnd = (sAttrs.match(/\bend="([^"]+)"/) || [])[1];
      spans.push({
        text,
        start: Math.max(0, sBegin ? timeToSeconds(sBegin) : begin),
        end: Math.max(0, sEnd ? timeToSeconds(sEnd) : end),
        space: /\s/.test(gap) ? true : undefined,
      });
    }
    const plain = body.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').trim();
    const { words: normalized, text } = normalizeWords(spans, plain);
    if (!text) continue;
    lines.push({ time: Math.max(0, begin), text, words: normalized });
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
  const url = `https://lyrics-api.boidu.dev/getLyrics?s=${encode(cleanTitle(track.title))}&a=${encode(primaryArtist(track))}` +
    (track.duration ? `&d=${track.duration}` : '') +
    (track.album?.name ? `&al=${encode(track.album.name)}` : '');
  const json = await fetchJson<any>(url);
  const ttml = (json?.ttml || '').trim();
  if (!ttml) return null;
  const lines = parseTtml(ttml);
  if (!lines.length) return null;
  return { provider: 'BetterLyrics', raw: ttml, synced: isSynced(lines), lines };
}

async function fromLyricsPlus(track: Track): Promise<ProviderOutput | null> {
  const bases = [
    'https://lyricsplus.binimum.org',
    'https://lyricsplus.atomix.one',
    'https://lyricsplus.prjktla.my.id',
    'https://lyricsplus-seven.vercel.app',
  ];
  for (const base of bases) {
    const url = `${base}/v2/lyrics/get?title=${encode(cleanTitle(track.title))}&artist=${encode(primaryArtist(track))}` +
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
              space: /\s$/.test(String(w.text)) ? true : undefined,
            }))
        : undefined;
      const { words: normalized, text } = normalizeWords(words ?? [], String(item.text || ''));
      return {
        time: Number(item.time || 0) / 1000,
        text: text || String(item.text || '').trim(),
        words: normalized,
        translation: item.translation?.text || undefined,
        romanized: item.transliteration?.text || undefined,
        agent: normalizeAgent(item.element?.singer),
        background: Boolean(item.syllabus?.some((w: any) => w.isBackground)),
      };
    }).filter((line: LyricsLine) => line.text);
    if (!lines.length) continue;
    return {
      provider: 'LyricsPlus',
      raw: JSON.stringify(json).slice(0, 200_000),
      synced: isSynced(lines),
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
  let raw = json.syncedLyrics || json.plainLyrics;
  if (!raw) return null;
  let lines = json.syncedLyrics ? parseLrc(json.syncedLyrics) : [];
  let synced = isSynced(lines);
  if (!synced && json.plainLyrics) {
    const plainLines = plainToLines(json.plainLyrics);
    if (plainLines.length) {
      lines = plainLines;
      raw = json.plainLyrics;
    }
  }
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
  return { provider: 'KuGou', raw: text, synced: isSynced(lines), lines };
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
      return { provider: 'Zemer', raw, synced: isSynced(lines), lines };
    }
  }
  return null;
}

async function fromYouTubeSubtitle(track: Track): Promise<ProviderOutput | null> {
  const raw = await streams.fetchSubtitles(track.id, 10_000);
  if (!raw) return null;
  const lines = parseLrc(raw);
  if (!lines.length) return null;
  return { provider: 'YouTubeSubtitle', raw, synced: isSynced(lines), lines };
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
  private pending = new Map<string, Promise<LyricsResult | null>>();

  async fetch(track: Track, providers?: string[], force = false): Promise<LyricsResult | null> {
    const configured = providers?.length
      ? providers
      : settingsStore.get().lyricsProviders;
    const key = `${track.id}:${cleanTitle(track.title).toLowerCase()}:${primaryArtist(track).toLowerCase()}:${configured.join(',')}`;
    const cached = this.cache.get(key);
    if (!force && cached) {
      const ttl = cached.result ? 30 * 60_000 : 2 * 60_000;
      if (Date.now() - cached.at < ttl) return cached.result;
    }
    // Background prefetch and an immediately opened lyrics panel share one
    // request instead of hitting every provider twice.
    const running = this.pending.get(key);
    if (running) return running;
    const task = this.fetchUncached(track, configured, key);
    this.pending.set(key, task);
    try {
      return await task;
    } finally {
      this.pending.delete(key);
    }
  }

  private async fetchUncached(
    track: Track,
    configured: string[],
    key: string,
  ): Promise<LyricsResult | null> {
    const tasks = configured
      .map((name, rank) => {
        const provider = PROVIDERS[name];
        return provider ? { name, rank, task: provider(track).catch(() => null) } : undefined;
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (!tasks.length) return null;

    const output = await new Promise<ProviderOutput | null>((resolve) => {
      let settled = 0;
      let finished = false;
      let best: { output: ProviderOutput; rank: number } | null = null;
      let graceTimer: ReturnType<typeof setTimeout> | undefined;

      const finish = () => {
        if (finished) return;
        finished = true;
        if (graceTimer) clearTimeout(graceTimer);
        clearTimeout(overallTimer);
        resolve(best?.output ?? null);
      };

      const consider = (output: ProviderOutput | null, rank: number) => {
        if (!output?.lines.length) return;
        if (!best || (output.synced && !best.output.synced) || (Boolean(output.synced) === best.output.synced && rank < best.rank)) {
          best = { output, rank };
        }
        // Do not make a synced provider wait behind a slower, unsynced one,
        // but give already-in-flight providers a short window to win. LrcLib
        // and BetterLyrics commonly need ~0.5s more than YouTube's plain
        // lyrics, so keep the unsynced grace long enough to prefer timed
        // lyrics while still returning quickly when none exists.
        if (best.output.synced) {
          if (graceTimer) clearTimeout(graceTimer);
          graceTimer = setTimeout(finish, 220);
        } else if (!graceTimer) {
          graceTimer = setTimeout(finish, 1_200);
        }
      };

      const overallTimer = setTimeout(finish, 12_000);
      for (const entry of tasks) {
        entry.task.then((result) => {
          settled += 1;
          consider(result, entry.rank);
          if (settled === tasks.length) finish();
        });
      }
    });

    if (!output) {
      this.cache.set(key, { at: Date.now(), result: null });
      return null;
    }

    const result: LyricsResult = {
      provider: output.provider,
      synced: output.synced,
      lines: output.lines,
      raw: output.raw,
    };
    this.cache.set(key, { at: Date.now(), result });
    return result;
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
