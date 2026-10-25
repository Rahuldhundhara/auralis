import { innertube } from '../electron/services/innertube';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

async function main() {
  for (const id of ['JSVI34QZzLw', 'dQw4w9WgXcQ']) {
    const html = await fetch(`https://music.youtube.com/watch?v=${id}`, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } }).then(r => r.text());
    const m = html.match(/"getTranscriptEndpoint":\{"params":"([^"]+)"/);
    console.log(id, 'page len', html.length, 'params', m?.[1]);
    if (!m) continue;
    try {
      const r = await (innertube as any).request('get_transcript', { params: m[1] }, {
        login: false,
        apiKey: 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30',
        client: { name: 'WEB', version: '2.20260708.00.00', id: '1' },
      });
      console.log('OK', Object.keys(r));
    } catch (e: any) {
      console.log('FAIL', e.status, e.body?.slice(0, 200));
    }
  }
}
main();
