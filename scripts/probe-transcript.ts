import { innertube } from '../electron/services/innertube';

function find(node: any, key: string, depth = 0): any {
  if (!node || typeof node !== 'object' || depth > 12) return undefined;
  if (node[key]) return node[key];
  for (const v of Object.values(node)) {
    const f = find(v, key, depth + 1);
    if (f) return f;
  }
}
const main = async () => {
  const next = await innertube.next({ videoId: 'JSVI34QZzLw' });
  console.log('keys', Object.keys(next));
  console.log('transcript endpoints', JSON.stringify(find(next, 'getTranscriptEndpoint')));
  const tabs = next?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs;
  console.log('tabs', tabs?.map((t: any) => ({ title: t.tabRenderer?.title, keys: Object.keys(t.tabRenderer || {}) })));
  console.log('next keys', next?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs?.[1]?.tabRenderer?.content && Object.keys(next.contents.singleColumnMusicWatchNextResultsRenderer.tabbedRenderer.watchNextTabbedResultsRenderer.tabs[1].tabRenderer.content));
  console.log('search transcript str', JSON.stringify(next).includes('transcript'));
};
main();
