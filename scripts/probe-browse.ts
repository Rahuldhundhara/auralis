import { innertube } from '../electron/services/innertube';

const main = async () => {
  for (const [label, id] of [
    ['album', 'MPREb_qQGEE0NawlN'],
    ['albumVL', 'VLMPREb_qQGEE0NawlN'],
    ['playlist', 'VLPLLlUPygAcL2VX4glMNhtJkLeFO7vAPwl-'],
    ['playlist2', 'PLLlUPygAcL2VX4glMNhtJkLeFO7vAPwl-'],
  ]) {
    try {
      const r = await innertube.browse(id);
      console.log('\n===', label, id, 'keys', Object.keys(r));
      console.log('contents keys', r?.contents && Object.keys(r.contents));
      console.log('header keys', r?.header && Object.keys(r.header));
      console.log('sample', JSON.stringify(r).slice(0, 900));
    } catch (e) {
      console.log(label, 'FAIL', (e as Error).message);
    }
  }
};
main();
