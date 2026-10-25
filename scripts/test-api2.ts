import { innertube } from '../electron/services/innertube';
import { parseBrowse, parseSearch, parseDetailPage, parseTracksFromBrowse } from '../electron/services/ytm-parse';

const main = async () => {
  const raw = await innertube.search('Kesariya Arijit Singh');
  const s = parseSearch(raw);
  console.log('no params:', { songs: s.songs.length, albums: s.albums.length, artists: s.artists.length, playlists: s.playlists.length, videos: s.videos.length, top: s.top?.title });
  console.log('song ctx', s.songs[0] && { id: s.songs[0].id, playlistId: s.songs[0].playlistId, setVideoId: s.songs[0].setVideoId });

  const albumRaw = await innertube.search('Kesariya Arijit Singh', 'EgWKAQIYAWoKEAkQChAFEAMQBA%3D%3D');
  const albums = parseSearch(albumRaw);
  console.log('album filter:', albums.albums.length, albums.albums[0]);

  const artistRaw = await innertube.search('Arijit Singh', 'EgWKAQIgAWoKEAkQChAFEAMQBA%3D%3D');
  const artists = parseSearch(artistRaw);
  console.log('artist filter:', artists.artists.length, artists.artists[0]);

  const plRaw = await innertube.search('Kesariya Arijit Singh', 'EgWKAQIoAWoKEAkQChAFEAMQBA%3D%3D');
  const pls = parseSearch(plRaw);
  console.log('playlist filter:', pls.playlists.length, pls.playlists[0]);

  const albumId = albums.albums[0]?.id || (await innertube.browse('FEmusic_explore'), parseBrowse(await innertube.browse('FEmusic_new_releases_albums')).shelves[0]?.items[0]?.id);
  console.log('albumId', albumId);
  if (albumId) {
    const r = await innertube.browse(albumId);
    const page = parseDetailPage(r, 'album');
    const tracks = parseTracksFromBrowse(r);
    console.log('ALBUM', page.header, 'tracks', tracks.tracks.length, tracks.tracks.slice(0,2));
    console.log('shelves', page.shelves.map(x => [x.title, x.items.length, x.style]));
  }

  const artistId = artists.artists[0]?.id;
  console.log('artistId', artistId);
  if (artistId) {
    const r = await innertube.browse(artistId);
    const page = parseBrowse(r, 'artist');
    console.log('ARTIST', page.header, 'shelves', page.shelves.map(x => [x.title, x.items.length, x.style]));
    const tracks = parseTracksFromBrowse(r);
    console.log('tracks', tracks.tracks.length, tracks.tracks.slice(0,2).map(t => t.title));
    console.log('raw header', JSON.stringify(r.header).slice(0, 500));
  }

  const plId = pls.playlists[0]?.id;
  console.log('plId', plId);
  if (plId) {
    const r = await innertube.browse(plId.startsWith('VL') ? plId : 'VL' + plId);
    const page = parseDetailPage(r, 'playlist');
    const tracks = parseTracksFromBrowse(r);
    console.log('PLAYLIST', page.header, 'tracks', tracks.tracks.length, tracks.tracks[0]);
    console.log('shelves', page.shelves.map(x => [x.title, x.items.length, x.style]));
  }

  if (s.songs[0]) {
    const song = s.songs[0];
    for (const pid of [song.playlistId, 'RDAMVM' + song.id]) {
      if (!pid) continue;
      try {
        const nr = await innertube.next({ videoId: song.id, playlistId: pid });
        const nt = (await import('../electron/services/ytm-parse')).parseNext(nr);
        console.log('NEXT with', pid, 'tracks', nt.tracks.length, nt.tracks.slice(0,3).map(t=>t.title), 'index', nt.currentIndex, 'title', nt.title);
      } catch (e) { console.log('NEXT fail', pid, (e as Error).message); }
    }
  }
};
main().catch(e => { console.error(e); process.exitCode = 1; });
