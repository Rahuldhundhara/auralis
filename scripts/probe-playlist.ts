import { innertube } from '../electron/services/innertube';

const main = async () => {
  for (const id of ['VLPLw-VjHDlEOgvtnnnqWlTqByAtC7tXF', 'VLPLLlUPygAcL2VX4glMNhtJkLeFO7vAPwl-', 'VLPLBCz1Uc1WqXj6WJ7h8b8b8b8b8b8b8b8b8b8b']) {
    try {
      const r = await innertube.browse(id);
      console.log('\n===', id);
      console.log('keys', Object.keys(r));
      const t = r?.contents?.twoColumnBrowseResultsRenderer;
      console.log('twoCol keys', t && Object.keys(t));
      console.log('tabs', t?.tabs?.map((x: any) => Object.keys(x.tabRenderer || {})));
      const sl = t?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer;
      console.log('tab section types', sl?.contents?.map((x: any) => Object.keys(x)[0]));
      console.log('secondary types', t?.secondaryContents?.sectionListRenderer?.contents?.map((x: any) => Object.keys(x)[0]));
      console.log('header renderer keys', JSON.stringify(sl?.contents?.[0]).slice(0, 500));
      console.log('json.header keys', r?.header && Object.keys(r.header));
      console.log('microformat', r?.microformatDataRenderer?.title, r?.microformatDataRenderer?.urlCanonical);
    } catch (e) {
      console.log(id, 'FAIL', (e as Error).message);
    }
  }
};
main();
