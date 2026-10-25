import { innertube } from '../electron/services/innertube';
import {
  parseBrowse,
  parseDetailPage,
  parseLyrics,
  parseNext,
  parseSearch,
  parseTracksFromBrowse,
  parseTranscript,
} from '../electron/services/ytm-parse';

const line = (title: string) => console.log(`\n=== ${title} ===`);

async function main() {
  line('HOME');
  const homeRaw = await innertube.browse('FEmusic_home');
  const home = parseBrowse(homeRaw);
  console.log('shelves', home.shelves.length, home.shelves.map((s) => `${s.title || '(untitled)'}:${s.items.length}`));
  const firstSong = home.shelves.flatMap((s) => s.items).find((i) => i.track);
  console.log('first playable', firstSong?.title, firstSong?.track?.id);

  line('SEARCH');
  const searchRaw = await innertube.search('Kesariya Arijit Singh', 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D');
  const search = parseSearch(searchRaw);
  console.log('songs', search.songs.length, search.songs[0]?.title, search.songs[0]?.artists, search.songs[0]?.duration);
  console.log('albums', search.albums.length, 'artists', search.artists.length, 'top', search.top?.title);

  const videoId = search.songs[0]?.id;
  if (!videoId) return;

  line('NEXT');
  const nextRaw = await innertube.next({ videoId });
  const next = parseNext(nextRaw);
  console.log('queue', next.tracks.length, 'index', next.currentIndex, 'title', next.title);
  console.log('lyrics endpoint', next.lyricsEndpoint, 'related', next.relatedEndpoint);
  console.log('first', next.tracks[0]?.title, next.tracks[0]?.artists.map((a) => a.name));

  if (next.lyricsEndpoint) {
    line('LYRICS');
    const lyricsRaw = await innertube.lyrics(next.lyricsEndpoint);
    const lyrics = parseLyrics(lyricsRaw);
    console.log(lyrics?.slice(0, 300));
  }

  line('TRANSCRIPT');
  try {
    const t = parseTranscript(await innertube.transcript(videoId));
    console.log(t?.slice(0, 300) || 'none');
  } catch (error) {
    console.log('transcript failed', (error as Error).message);
  }

  line('ALBUM');
  const albumId = search.albums[0]?.id;
  if (albumId) {
    const raw = await innertube.browse(albumId);
    const page = parseDetailPage(raw, 'album');
    const tracks = parseTracksFromBrowse(raw);
    console.log('album', page.header?.title, page.header?.year, page.header?.playlistId, 'shelves', page.shelves.length, 'tracks', tracks.tracks.length, tracks.tracks[0]?.title);
  }

  line('PLAYLIST');
  const playlistId = search.playlists[0]?.id;
  if (playlistId) {
    const raw = await innertube.browse(playlistId.startsWith('VL') ? playlistId : `VL${playlistId}`);
    const page = parseDetailPage(raw, 'playlist');
    const tracks = parseTracksFromBrowse(raw);
    console.log('playlist', page.header?.title, page.header?.trackCount, page.header?.playlistId, 'tracks', tracks.tracks.length, tracks.tracks[0]?.title);
  }

  line('ARTIST');
  const artistId = search.artists[0]?.id;
  if (artistId) {
    const raw = await innertube.browse(artistId);
    const page = parseBrowse(raw, 'artist');
    console.log('artist', page.header?.title, page.header?.thumbnail?.slice(0, 50), 'shelves', page.shelves.length, page.shelves.map((s) => `${s.title}:${s.items.length}`));
    const tracks = parseTracksFromBrowse(raw);
    console.log('artist tracks', tracks.tracks.length, tracks.tracks[0]?.title);
  }

  line('EXPLORE');
  const explore = parseBrowse(await innertube.browse('FEmusic_explore'));
  console.log('explore', explore.shelves.map((s) => `${s.title}:${s.items.length}`), 'chips', explore.chips?.length);

  line('CHARTS');
  const charts = parseBrowse(await innertube.browse('FEmusic_charts'));
  console.log('charts', charts.shelves.map((s) => `${s.title}:${s.items.length}`));

  line('ACCOUNT (anonymous)');
  console.log(await innertube.loadAccount());
}

main().catch((error) => {
  console.error('FAILED', error);
  process.exitCode = 1;
});
