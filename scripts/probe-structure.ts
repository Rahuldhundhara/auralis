import { innertube } from '../electron/services/innertube';
import { parseBrowse, parseDetailPage, parseTracksFromBrowse } from '../electron/services/ytm-parse';

type NodeInfo = { path: string; type: string; count?: number };

function walk(node: any, path = '$', depth = 0, out: NodeInfo[] = []): NodeInfo[] {
  if (!node || typeof node !== 'object' || depth > 14) return out;
  if (Array.isArray(node)) {
    node.slice(0, 3).forEach((child, i) => walk(child, `${path}[${i}]`, depth + 1, out));
    return out;
  }
  const keys = Object.keys(node);
  const rendererKey = keys.find((k) => k.endsWith('Renderer'));
  if (rendererKey) out.push({ path, type: rendererKey, count: Array.isArray(node[rendererKey]?.contents) ? node[rendererKey].contents.length : undefined });
  for (const key of keys) walk(node[key], `${path}.${key}`, depth + 1, out);
  return out;
}

const main = async () => {
  for (const [label, id, kind] of [
    ['album', 'MPREb_qQGEE0NawlN', 'album'],
    ['playlist', 'VLPLLlUPygAcL2VX4glMNhtJkLeFO7vAPwl-', 'playlist'],
    ['artist', 'UC9zY_E8mcAo_Oq772LEZq8Q', 'artist'],
  ] as const) {
    try {
      const r = await innertube.browse(id);
      const infos = walk(r);
      console.log(`\n===== ${label} ${id}`);
      console.log(
        infos
          .filter((i) => !i.path.includes('responseContext'))
          .slice(0, 60)
          .map((i) => `${i.path.replace(/\$\.[^.]*/, '')} -> ${i.type}${i.count != null ? ` (${i.count})` : ''}`)
          .join('\n'),
      );
      const page = parseDetailPage(r, kind as any);
      console.log('HEADER', JSON.stringify(page.header));
      console.log('SHELVES', page.shelves.map((s) => `${s.style}:${s.title}=${s.items.length}`).join(' | '));
      const tracks = parseTracksFromBrowse(r);
      console.log('TRACKS', tracks.tracks.length, tracks.tracks.slice(0, 3).map((t) => `${t.title} - ${t.artists.map((a) => a.name).join(',')} ${t.duration}s`));
      console.log('CONT', tracks.continuation?.slice(0, 40));
    } catch (e) {
      console.log(label, 'FAIL', (e as Error).message);
    }
  }
};
main();
