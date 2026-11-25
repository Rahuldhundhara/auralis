import type { AccountInfo, NavEndpoint } from '../../shared/types';
import { cookieValue, sanitizeCookieString, sessionStore } from './store';

const API_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL0kn8m3XvR0';
const ORIGIN = 'https://music.youtube.com';
const API_BASE = `${ORIGIN}/youtubei/v1`;
const CLIENT_NAME = 'WEB_REMIX';
const CLIENT_VERSION = '1.20260707.12.00';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export class InnertubeError extends Error {
  constructor(
    message: string,
    public status?: number,
    public endpoint?: string,
    public body?: string,
  ) {
    super(message);
    this.name = 'InnertubeError';
  }
}

export interface YtLocale {
  hl: string;
  gl: string;
}

export interface RequestOptions {
  /** Send the account cookies / auth headers for this request. */
  login?: boolean;
  timeoutMs?: number;
  extraHeaders?: Record<string, string>;
  /** Overrides the public API key for endpoints that use a different one. */
  apiKey?: string;
  /** Override the Innertube client profile for a single request. */
  client?: { name: string; version: string; id: string };
}

export function sha1Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const withPadding = new Uint8Array((((bytes.length + 8) >> 6) + 1) * 64);
  withPadding.set(bytes);
  withPadding[bytes.length] = 0x80;
  const view = new DataView(withPadding.buffer);
  view.setUint32(withPadding.length - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(withPadding.length - 4, bitLength >>> 0, false);
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);
  for (let offset = 0; offset < withPadding.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 80; index += 1) {
      const value = words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16];
      words[index] = (value << 1) | (value >>> 31);
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let index = 0; index < 80; index += 1) {
      let f: number;
      let k: number;
      if (index < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + words[index]) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((value) => value.toString(16).padStart(8, '0')).join('');
}

function sapisidHash(sapisid: string, origin: string): string {
  const ts = Math.floor(Date.now() / 1000);
  return `SAPISIDHASH ${ts}_${sha1Hex(`${ts} ${sapisid} ${origin}`)}`;
}

function findVisitorData(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return /^Cg[A-Za-z0-9_%-]{10,}$/.test(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVisitorData(item);
      if (found) return found;
    }
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      const found = findVisitorData(item);
      if (found) return found;
    }
  }
  return undefined;
}

export class Innertube {
  private visitorData = sessionStore.visitorData;
  private cookie = sessionStore.cookie;
  private dataSyncId = sessionStore.dataSyncId;
  private authUser = sessionStore.authUser;
  private locale: YtLocale;

  constructor(locale: YtLocale) {
    this.locale = locale;
  }

  setLocale(locale: YtLocale) {
    this.locale = locale;
  }

  get hasCookies(): boolean {
    return Boolean(this.cookie);
  }

  get sessionVisitorData(): string | undefined {
    return this.visitorData;
  }

  refreshSession() {
    this.cookie = sessionStore.cookie;
    this.dataSyncId = sessionStore.dataSyncId;
    this.authUser = sessionStore.authUser;
    this.visitorData = sessionStore.visitorData;
  }

  setCookies(raw: string) {
    const cookie = sanitizeCookieString(raw);
    sessionStore.cookie = cookie || null;
    sessionStore.authUser = '0';
    sessionStore.dataSyncId = undefined;
    sessionStore.account = undefined;
    this.refreshSession();
  }

  clearSession() {
    sessionStore.clear();
    this.refreshSession();
  }

  private context(login: boolean, client?: RequestOptions['client']): any {
    const ctx: any = {
      client: {
        clientName: client?.name || CLIENT_NAME,
        clientVersion: client?.version || CLIENT_VERSION,
        gl: this.locale.gl,
        hl: this.locale.hl,
        visitorData: this.visitorData,
      },
      request: {
        internalExperimentFlags: [],
        useSsl: true,
      },
      user: {
        lockedSafetyMode: false,
      },
    };
    if (login && this.dataSyncId) {
      ctx.user.onBehalfOfUser = this.dataSyncId;
    }
    return ctx;
  }

  async request(endpoint: string, body: any, options: RequestOptions = {}): Promise<any> {
    const login = options.login !== false && Boolean(this.cookie);
    const url = `${API_BASE}/${endpoint}?prettyPrint=false&key=${options.apiKey || API_KEY}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: '*/*',
      'Accept-Language': `${this.locale.hl},en;q=0.8`,
      'User-Agent': USER_AGENT,
      Origin: ORIGIN,
      'X-Origin': ORIGIN,
      Referer: `${ORIGIN}/`,
      'X-YouTube-Client-Name': options.client?.id || '67',
      'X-YouTube-Client-Version': options.client?.version || CLIENT_VERSION,
      'X-Goog-Api-Format-Version': '2',
      ...options.extraHeaders,
    };
    if (this.visitorData) headers['X-Goog-Visitor-Id'] = this.visitorData;
    if (this.cookie) headers.Cookie = this.cookie;
    if (login && this.cookie) {
      const sapisid =
        cookieValue(this.cookie, 'SAPISID') ||
        cookieValue(this.cookie, '__Secure-3PAPISID') ||
        cookieValue(this.cookie, '__Secure-1PAPISID');
      if (sapisid) headers.Authorization = sapisidHash(sapisid, ORIGIN);
      headers['X-Goog-AuthUser'] = this.authUser || '0';
    }

    const payload = body?.context ? body : { context: this.context(login, options.client), ...body };
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(options.timeoutMs ?? 25000),
      });
    } catch (error: any) {
      if (error?.name === 'TimeoutError') {
        throw new InnertubeError('YouTube Music request timed out.', undefined, endpoint);
      }
      throw new InnertubeError(
        `Network error contacting YouTube Music: ${error?.message || error}`,
        undefined,
        endpoint,
      );
    }

    const text = await response.text();
    if (!response.ok) {
      let message = `YouTube Music returned HTTP ${response.status}.`;
      if (response.status === 401 || response.status === 403) {
        message =
          response.status === 401
            ? 'Sign-in required. Add your YouTube cookies in Settings → Account.'
            : 'YouTube refused the request (403). Your cookies may have expired.';
      }
      throw new InnertubeError(message, response.status, endpoint, text.slice(0, 500));
    }

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new InnertubeError('YouTube Music returned invalid JSON.', response.status, endpoint, text.slice(0, 300));
    }

    const visitor = json?.responseContext?.visitorData;
    if (typeof visitor === 'string' && visitor && visitor !== this.visitorData) {
      this.visitorData = visitor;
      sessionStore.visitorData = visitor;
    }
    if (json?.playabilityStatus && json.playabilityStatus.status !== 'OK') {
      const reason = json.playabilityStatus.reason || json.playabilityStatus.status;
      if (json.streamingData) return json;
      throw new InnertubeError(reason || 'This track is unavailable in your region.', response.status, endpoint);
    }
    return json;
  }

  browse(browseId?: string, params?: string, continuation?: string, login = false): Promise<any> {
    return this.request('browse', {
      browseId: browseId ?? undefined,
      params: params ?? undefined,
      continuation: continuation ?? undefined,
    }, { login });
  }

  async browseEndpoint(endpoint: NavEndpoint, login = false): Promise<any> {
    if (endpoint.continuation) return this.browse(undefined, undefined, endpoint.continuation, login);
    if (endpoint.browseId) return this.browse(endpoint.browseId, endpoint.params, undefined, login);
    if (endpoint.videoId || endpoint.playlistId) {
      return this.next(endpoint);
    }
    throw new InnertubeError('Unsupported browse endpoint.');
  }

  search(query: string, params?: string, continuation?: string): Promise<any> {
    return this.request('search', {
      query: continuation ? undefined : query,
      params: continuation ? undefined : (params ?? undefined),
      continuation: continuation ?? undefined,
    }, {
      login: true,
      extraHeaders: continuation ? { 'X-Goog-Continuation': continuation } : undefined,
    });
  }

  async searchSuggestions(input: string): Promise<string[]> {
    const data = await this.request('music/get_search_suggestions', {
      input,
      context: this.context(false),
    }, { login: false, timeoutMs: 10000 });
    const sections = data?.contents?.[0]?.searchSuggestionsSectionRenderer?.contents || [];
    const out: string[] = [];
    const walk = (node: any) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (typeof node === 'object') {
        if (typeof node.searchSuggestionRenderer?.suggestion?.runs?.length === 'number') {
          const text = (node.searchSuggestionRenderer.suggestion.runs || []).map((r: any) => r.text || '').join('');
          if (text) out.push(text);
        }
        for (const value of Object.values(node)) walk(value);
      }
    };
    walk(sections);
    return [...new Set(out)].slice(0, 10);
  }

  next(endpoint: NavEndpoint, continuation?: string): Promise<any> {
    return this.request('next', {
      videoId: endpoint.videoId,
      playlistId: endpoint.playlistId,
      playlistSetVideoId: endpoint.playlistSetVideoId,
      index: endpoint.index,
      params: endpoint.params,
      continuation,
    }, { login: true });
  }

  player(videoId: string, playlistId?: string): Promise<any> {
    return this.request('player', {
      videoId,
      playlistId,
      playbackContext: {
        contentPlaybackContext: {
          signatureTimestamp: 20000,
          html5Preference: 'HTML5_PREF_WANTS',
        },
      },
      contentCheckOk: true,
      racyCheckOk: true,
    }, { login: false });
  }

  lyrics(endpoint: NavEndpoint): Promise<any> {
    return this.browse(endpoint.browseId, endpoint.params);
  }

  async transcript(videoId: string): Promise<any> {
    const params = btoa(`\n\x0b${videoId}`);
    return this.request('get_transcript', {
      params,
    }, {
      login: false,
      apiKey: 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30',
      client: { name: 'WEB', version: '2.20260708.00.00', id: '1' },
    });
  }

  accountMenu(): Promise<any> {
    return this.request('account/account_menu', {
      context: this.context(true),
    }, { login: true });
  }

  accountsList(): Promise<any> {
    return this.request('account/accounts_list', {
      context: this.context(true),
      requestType: 'ACCOUNTS_LIST_REQUEST_TYPE_CHANNEL_SWITCHER',
      callCircumstance: 'SWITCHING_USERS_FULL',
    }, { login: true });
  }

  likeVideo(videoId: string, like: boolean): Promise<any> {
    if (!like) return this.rateVideo(videoId, 'none');
    return this.request('like/like', {
      target: { videoId },
      context: this.context(true),
    }, { login: true });
  }

  rateVideo(videoId: string, rating: 'like' | 'dislike' | 'none'): Promise<any> {
    const endpoint = rating === 'like' ? 'like/like' : rating === 'dislike' ? 'like/dislike' : 'like/removelike';
    return this.request(endpoint, {
      target: { videoId },
      context: this.context(true),
    }, { login: true });
  }

  subscribe(channelId: string, subscribe: boolean, params = 'EgIIAhgA'): Promise<any> {
    return this.request(subscribe ? 'subscription/subscribe' : 'subscription/unsubscribe', {
      channelIds: [channelId],
      params,
      context: this.context(true),
    }, { login: true });
  }

  feedback(tokens: string[]): Promise<any> {
    return this.request('feedback', {
      feedbackTokens: tokens,
      isFeedbackTokenUnencrypted: false,
      shouldMerge: false,
      context: this.context(true),
    }, { login: true });
  }

  editPlaylist(playlistId: string, actions: any[]): Promise<any> {
    return this.request('browse/edit_playlist', {
      playlistId: playlistId.replace(/^VL/, ''),
      actions,
      context: this.context(true),
    }, { login: true });
  }

  addToPlaylist(playlistId: string, videoId: string): Promise<any> {
    return this.editPlaylist(playlistId, [
      {
        action: 'ACTION_ADD_VIDEO',
        addedVideoId: videoId,
      },
    ]);
  }

  addPlaylistToPlaylist(playlistId: string, addedPlaylistId: string): Promise<any> {
    return this.editPlaylist(playlistId, [
      {
        action: 'ACTION_ADD_PLAYLIST',
        addedPlaylistId: addedPlaylistId.replace(/^VL/, ''),
      },
    ]);
  }

  removeFromPlaylist(playlistId: string, videoId: string, setVideoId: string): Promise<any> {
    return this.editPlaylist(playlistId, [
      {
        action: 'ACTION_REMOVE_VIDEO',
        setVideoId,
        removedVideoId: videoId,
      },
    ]);
  }

  movePlaylistItem(playlistId: string, setVideoId: string, successorSetVideoId?: string): Promise<any> {
    return this.editPlaylist(playlistId, [
      {
        action: 'ACTION_MOVE_VIDEO_BEFORE',
        setVideoId,
        movedSetVideoIdSuccessor: successorSetVideoId,
      },
    ]);
  }

  createPlaylist(title: string): Promise<any> {
    return this.request('playlist/create', {
      title,
      privacyStatus: 'PRIVATE',
      context: this.context(true),
    }, { login: true });
  }

  renamePlaylist(playlistId: string, title: string): Promise<any> {
    return this.editPlaylist(playlistId, [{ action: 'ACTION_SET_PLAYLIST_NAME', playlistName: title }]);
  }

  deletePlaylist(playlistId: string): Promise<any> {
    return this.request('playlist/delete', {
      playlistId: playlistId.replace(/^VL/, ''),
      context: this.context(true),
    }, { login: true });
  }

  likePlaylist(playlistId: string, like: boolean): Promise<any> {
    return this.request(like ? 'like/like' : 'like/removelike', {
      target: { playlistId: playlistId.replace(/^VL/, '') },
      context: this.context(true),
    }, { login: true });
  }

  getQueue(videoIds: string[] | undefined, playlistId: string | undefined): Promise<any> {
    return this.request('music/get_queue', {
      videoIds,
      playlistId,
      context: this.context(true),
    }, { login: true });
  }

  /**
   * Fetches the account identity for the current cookies and, when available, the
   * datasync id used by `context.user.onBehalfOfUser` for personalized responses.
   */
  async loadAccount(): Promise<AccountInfo | null> {
    if (!this.cookie) return null;
    try {
      const menu = await this.accountMenu();
      const header =
        menu?.actions?.[0]?.openPopupAction?.popup?.multiPageMenuRenderer?.header?.activeAccountHeaderRenderer;
      if (!header) return null;
      const text = (runs: any) => (runs?.runs || []).map((r: any) => r?.text || '').join('');
      const info: AccountInfo = {
        name: text(header.accountName) || 'Account',
        email: text(header.email) || undefined,
        channelHandle: text(header.channelHandle) || undefined,
        thumbnailUrl: header.accountPhoto?.thumbnails?.slice(-1)?.[0]?.url,
      };
      try {
        const list = await this.accountsList();
        const item = findAccountItem(list);
        if (item?.dataSyncId) {
          this.dataSyncId = item.dataSyncId;
          sessionStore.dataSyncId = item.dataSyncId;
        }
        if (item?.channelHandle && !info.channelHandle) info.channelHandle = item.channelHandle;
        if (item?.thumbnailUrl && !info.thumbnailUrl) info.thumbnailUrl = item.thumbnailUrl;
      } catch {
        // accounts_list is optional; basic account menu data is still useful.
      }
      sessionStore.account = info;
      return info;
    } catch (error) {
      console.warn('[innertube] account load failed', (error as Error).message);
      return sessionStore.account ?? null;
    }
  }
}

function findAccountItem(json: any): {
  dataSyncId?: string;
  channelHandle?: string;
  thumbnailUrl?: string;
  isSelected?: boolean;
} | null {
  let best: any = null;
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.accountItemRenderer) {
      const item = node.accountItemRenderer;
      const sync = item.serviceEndpoint?.selectActiveIdentityEndpoint?.datasyncIdToken?.datasyncId;
      const pageId = item.serviceEndpoint?.selectActiveIdentityEndpoint?.pageIdToken?.pageId;
      const candidate = {
        dataSyncId: sync || pageId,
        channelHandle: (item.channelHandle?.runs || []).map((r: any) => r.text).join('') || undefined,
        thumbnailUrl: item.accountPhoto?.thumbnails?.slice(-1)?.[0]?.url,
        isSelected: Boolean(item.isSelected),
      };
      if (!best || (candidate.isSelected && !best.isSelected)) best = candidate;
    }
    for (const value of Object.values(node)) visit(value);
  };
  visit(json);
  return best;
}

export const innertube = new Innertube({ hl: 'en', gl: 'US' });
