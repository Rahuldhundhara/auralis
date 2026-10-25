import { innertube } from '../electron/services/innertube';

function summarize(node: any, depth = 0): any {
  if (!node || typeof node !== 'object' || depth > 6) return undefined;
  const out: any = {};
  for (const [k, v] of Object.entries(node)) {
    if (['thumbnail', 'thumbnails', 'menu', 'buttons', 'trackingParams', 'responseContext'].includes(k)) continue;
    if (v && typeof v === 'object') {
      if (Array.isArray(v)) out[k] = v.map((x) => summarize(x, depth + 1)).filter(Boolean).slice(0, 8);
      else {
        const simple = summarize(v, depth + 1);
        if (simple && Object.keys(simple).length) out[k] = simple;
      }
    } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      if (v !== '' && v !== false) out[k] = v;
    }
  }
  return out;
}

const main = async () => {
  for (const [label, id] of [
    ['album', 'MPREb_qQGEE0NawlN'],
    ['playlist', 'VLPLLlUPygAcL2VX4glMNhtJkLeFO7vAPwl-'],
  ]) {
    const r = await innertube.browse(id);
    const sl = r?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer;
    const header = sl?.contents?.find((c: any) => c.musicResponsiveHeaderRenderer)?.musicResponsiveHeaderRenderer;
    console.log(`\n===== ${label} header`);
    console.log(JSON.stringify(summarize(header), null, 1).slice(0, 5000));
    const second = r?.contents?.twoColumnBrowseResultsRenderer?.secondaryContents?.sectionListRenderer;
    console.log('secondary keys', second && Object.keys(second));
    console.log('secondary first', JSON.stringify(summarize(second?.contents?.[0], 0)).slice(0, 800));
  }
};
main();
