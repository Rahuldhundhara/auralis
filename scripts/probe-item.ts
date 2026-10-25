import { innertube } from '../electron/services/innertube';
import { textOf } from '../electron/services/ytm-parse';

const main = async () => {
  const r = await innertube.browse('MPREb_qQGEE0NawlN');
  const shelf = r.contents.twoColumnBrowseResultsRenderer.secondaryContents.sectionListRenderer.contents[0].musicShelfRenderer;
  const item = shelf.contents[0].musicResponsiveListItemRenderer;
  console.log('album flex:');
  for (const col of item.flexColumns) {
    const t = col.musicResponsiveListItemFlexColumnRenderer?.text;
    console.log(' -', JSON.stringify(t?.runs?.map((x: any) => ({ text: x.text, nav: x.navigationEndpoint?.browseEndpoint?.browseId, pt: x.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType }))));
  }
  console.log('album fixed:', item.fixedColumns?.map((c: any) => textOf(c.musicResponsiveListItemFixedColumnRenderer?.text)));
  console.log('album nav', JSON.stringify(item.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint)?.slice(0, 400));

  const r2 = await innertube.browse('VLPLLlUPygAcL2VX4glMNhtJkLeFO7vAPwl-');
  const shelf2 = r2.contents.twoColumnBrowseResultsRenderer.secondaryContents.sectionListRenderer.contents[0].musicPlaylistShelfRenderer;
  const item2 = shelf2.contents[0].musicResponsiveListItemRenderer;
  console.log('\nplaylist flex:');
  for (const col of item2.flexColumns) {
    const t = col.musicResponsiveListItemFlexColumnRenderer?.text;
    console.log(' -', JSON.stringify(t?.runs?.map((x: any) => ({ text: x.text, nav: x.navigationEndpoint?.browseEndpoint?.browseId, pt: x.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType }))));
  }
  console.log('playlist fixed:', item2.fixedColumns?.map((c: any) => textOf(c.musicResponsiveListItemFixedColumnRenderer?.text)));
};
main();
