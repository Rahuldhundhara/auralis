// Auralis backend API. No third-party dependencies: Node 20+ built-ins only.
// Deploy behind nginx; the landing page is served from ../site.

import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const INNERTUBE_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL0kn8m3XvR0';
const SEARCH_URL = `https://music.youtube.com/youtubei/v1/search?prettyPrint=false&key=${INNERTUBE_KEY}`;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const started = Date.now();
const cache = new Map(); // query -> { at, results }
const hits = new Map(); // ip -> [timestamps]
const CACHE_TTL = 10 * 60 * 1000;
const RATE_WINDOW = 60 * 1000;
const RATE_MAX = 30;

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'access-control-allow-origin': ALLOWED_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'cache-control': 'no-store',
  });
  res.end(data);
}

function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW);
  if (list.length >= RATE_MAX) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  return false;
}

function textOf(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.simpleText) return node.simpleText;
  if (Array.isArray(node.runs)) return node.runs.map((run) => run.text || '').join('');
  return '';
}

function thumbnailOf(node) {
  const thumbs = node?.thumbnail?.thumbnails || node?.thumbnailRenderer?.thumbnail?.thumbnails;
  if (!Array.isArray(thumbs) || thumbs.length === 0) return undefined;
  return thumbs[thumbs.length - 1]?.url;
}

/** Walk the InnerTube response and collect unique video renderers. */
function collectVideos(node, found = new Set(), out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const item of node) collectVideos(item, found, out);
    return out;
  }
  const candidate =
    node.videoRenderer ||
    node.musicVideoRenderer ||
    node.playlistVideoRenderer ||
    node.gridVideoRenderer ||
    node.videoWithContextRenderer ||
    node.lockupViewModel?.content?.lockupMetadataViewModel;
  if (candidate?.videoId && !found.has(candidate.videoId)) {
    found.add(candidate.videoId);
    const title =
      textOf(candidate.title) ||
      textOf(candidate.headline) ||
      textOf(candidate.metadata?.lockupMetadataViewModel?.title);
    const subtitle =
      textOf(candidate.shortBylineText?.runs?.[0]) ||
      textOf(candidate.shortBylineText) ||
      textOf(candidate.subtitle) ||
      textOf(candidate.metadata?.lockupMetadataViewModel?.secondaryText);
    if (title) {
      out.push({
        id: candidate.videoId,
        title,
        artist: subtitle,
        thumbnail: thumbnailOf(candidate),
      });
    }
  }

  // Current YouTube Music responses use musicResponsiveListItemRenderer.
  const row = node.musicResponsiveListItemRenderer;
  if (row && !found.has(row.playlistItemData?.videoId || '')) {
    const column = (index) => row.flexColumns?.[index]?.musicResponsiveListItemFlexColumnRenderer?.text;
    const videoId =
      row.playlistItemData?.videoId ||
      row.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint
        ?.watchEndpoint?.videoId ||
      column(0)?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;
    const title = textOf(column(0));
    if (videoId && title && !found.has(videoId)) {
      found.add(videoId);
      out.push({ id: videoId, title, artist: textOf(column(1)), thumbnail: thumbnailOf(row) });
    }
  }
  for (const value of Object.values(node)) collectVideos(value, found, out);
  return out;
}

async function searchMusic(query, limit) {
  const key = `${query.toLowerCase()}|${limit}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.results;

  const response = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': USER_AGENT,
      origin: 'https://music.youtube.com',
      referer: 'https://music.youtube.com/',
    },
    body: JSON.stringify({
      context: {
        client: { clientName: 'WEB_REMIX', clientVersion: '1.20260707.12.00', hl: 'en', gl: 'US' },
      },
      query,
    }),
  });
  if (!response.ok) throw new Error(`YouTube Music returned ${response.status}`);
  const payload = await response.json();
  const results = collectVideos(payload).slice(0, limit);
  cache.set(key, { at: Date.now(), results });
  if (cache.size > 500) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  return results;
}

async function verifyToken(req) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase is not configured on this server.');
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  return response.json();
}

const server = http.createServer(async (req, res) => {
  const requestId = randomUUID().slice(0, 8);
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') return json(res, 204, {});

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  if (rateLimited(ip) && url.pathname.startsWith('/api/')) {
    return json(res, 429, { error: 'rate limit exceeded', requestId });
  }

  try {
    if (url.pathname === '/health') {
      return json(res, 200, { ok: true, service: 'auralis-api', uptimeSec: Math.round((Date.now() - started) / 1000) });
    }

    if (url.pathname === '/api/me') {
      const user = await verifyToken(req);
      if (!user) return json(res, 401, { error: 'unauthorized', requestId });
      return json(res, 200, { id: user.id, email: user.email });
    }

    if (url.pathname === '/api/search') {
      const query = (url.searchParams.get('q') || '').trim();
      if (!query) return json(res, 400, { error: 'q is required', requestId });
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 50);
      const results = await searchMusic(query, limit);
      return json(res, 200, { query, results, cached: cache.has(`${query.toLowerCase()}|${limit}`) });
    }

    return json(res, 404, { error: 'not found', requestId });
  } catch (cause) {
    console.error(`[${requestId}]`, cause);
    return json(res, 500, { error: cause instanceof Error ? cause.message : 'internal error', requestId });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Auralis API listening on http://${HOST}:${PORT}`);
  console.log(`Supabase configured: ${Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)}`);
});
