import type {
  AccountInfo,
  BrowsePage,
  Card,
  NavEndpoint,
  NextResult,
  SearchResults,
  SearchSuggestion,
  SessionState,
  Shelf,
  Track,
} from '../../shared/types';
import { innertube } from './innertube';
import {
  parseBrowse,
  parseBrowseContinuation,
  parseDetailContinuation,
  parseDetailPage,
  parseLyrics,
  parseNext,
  parseRelated,
  parseSearch,
  parseSearchContinuation,
  parseTracksFromBrowse,
} from './ytm-parse';
import { settingsStore, sessionStore } from './store';
import { streams } from './streams';

export const SEARCH_FILTERS: Record<string, string> = {
  songs: 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D',
  videos: 'EgWKAQIQAWoKEAkQChAFEAMQBA%3D%3D',
  albums: 'EgWKAQIYAWoKEAkQChAFEAMQBA%3D%3D',
  artists: 'EgWKAQIgAWoKEAkQChAFEAMQBA%3D%3D',
  playlists: 'EgWKAQIoAWoKEAkQChAFEAMQBA%3D%3D',
  featuredPlaylists: 'EgeKAQQoADgBagwQDhAKEAMQBRAJEAQ%3D',
  communityPlaylists: 'EgeKAQQoAEABagoQAxAEEAoQCRAF',
  podcasts: 'EgWKAQJQAWoKEAkQChAFEAMQBA%3D%3D',
  episodes: 'EgWKAQJYAWoKEAkQChAFEAMQBA%3D%3D',
  profiles: 'EgWKAQJYAWoSEAUQCRADEAQQEBAVEAoQDhAR',
};

function syncLocale() {
  innertube.setLocale({
    hl: settingsStore.get().language || 'en',
    gl: settingsStore.get().region || 'US',
  });
}

function looksEmpty(page: BrowsePage): boolean {
  return !page.header && page.shelves.length === 0 && !page.continuation;
}

export class YtmService {
  private homeCache?: { at: number; page: BrowsePage };
  private searchCache = new Map<string, { at: number; result: SearchResults }>();
  private suggestionCache = new Map<string, { at: number; result: SearchSuggestion[] }>();

  private async browse(id?: string, params?: string, continuation?: string, login = false): Promise<any> {
    syncLocale();
    return innertube.browse(id, params, continuation, login);
  }

  async home(continuation?: string): Promise<BrowsePage> {
    if (continuation) {
      const raw = await this.browse(undefined, undefined, continuation);
      return parseBrowseContinuation(raw);
    }
    const cached = this.homeCache;
    if (cached && Date.now() - cached.at < 5 * 60_000) return cached.page;
    const raw = await this.browse('FEmusic_home', undefined, undefined, innertube.hasCookies);
    const page = parseBrowse(raw);
    if (page.shelves.length < 4) {
      try {
        const explore = parseBrowse(await this.browse('FEmusic_explore'));
        const titles = new Set(page.shelves.map((s) => s.title));
        for (const shelf of explore.shelves) {
          if (shelf.title && !titles.has(shelf.title)) page.shelves.push(shelf);
          if (page.shelves.length >= 8) break;
        }
      } catch {
        // Home still works without the supplemental shelves.
      }
    }
    this.homeCache = { at: Date.now(), page };
    return page;
  }

  async explore(): Promise<BrowsePage> {
    return parseBrowse(await this.browse('FEmusic_explore'));
  }

  async charts(): Promise<BrowsePage> {
    return parseBrowse(await this.browse('FEmusic_charts'));
  }

  async newReleases(): Promise<BrowsePage> {
    return parseBrowse(await this.browse('FEmusic_new_releases_albums'));
  }

  async moods(): Promise<BrowsePage> {
    return parseBrowse(await this.browse('FEmusic_moods_and_genres'));
  }

  async browsePage(id?: string, params?: string, continuation?: string): Promise<BrowsePage> {
    if (continuation) {
      const raw = await this.browse(id, params, continuation);
      return raw?.continuationContents ? parseBrowseContinuation(raw) : parseBrowse(raw);
    }
    if (!id && params) {
      const raw = await this.browse(undefined, params);
      return parseBrowse(raw);
    }
    if (!id) return { shelves: [] };
    const raw = await this.browse(id, params, undefined, id.startsWith('FEmusic_library'));
    return parseBrowse(raw);
  }

  async browseEndpoint(endpoint: NavEndpoint): Promise<BrowsePage> {
    if (endpoint.continuation) {
      const raw = await this.browse(undefined, undefined, endpoint.continuation);
      return parseBrowseContinuation(raw);
    }
    if (endpoint.browseId) return this.browsePage(endpoint.browseId, endpoint.params);
    if (endpoint.playlistId) return this.playlist(endpoint.playlistId);
    if (endpoint.videoId) {
      const next = await this.next(endpoint);
      const header = {
        type: 'generic' as const,
        title: next.title || 'Now playing',
        playlistId: endpoint.playlistId,
      };
      const tracks = next.tracks;
      return {
        header,
        shelves: tracks.length
          ? [{
              title: 'Tracks',
              style: 'list',
              items: tracks.map((track) => ({ type: track.type, id: track.id, title: track.title, subtitle: track.artists.map((a) => a.name).join(', '), thumbnail: track.thumbnail, track })),
            }]
          : [],
      };
    }
    return { shelves: [] };
  }

  async artist(id: string): Promise<BrowsePage> {
    const raw = await this.browse(id);
    const page = parseBrowse(raw, 'artist');
    if (page.header) {
      page.header.id = id;
      page.header.browseId = id;
      page.header.type = 'artist';
    }
    // The reference client builds artist "songs" from its local database. For parity we
    // derive a top-songs list from search results attributed to this artist.
    if (page.header && !page.shelves.some((s) => /top songs|songs/i.test(s.title || ''))) {
      try {
        const results = await this.search(page.header.title, 'songs');
        const exact = results.songs.filter((track) =>
          track.artists.some((a) => a.id === id || a.name.toLowerCase() === page.header!.title.toLowerCase()),
        );
        const tracks = (exact.length ? exact : results.songs).slice(0, 20);
        if (tracks.length) {
          const shelf: Shelf = {
            title: 'Top songs',
            style: 'list',
            items: tracks.map((track) => ({
              type: track.type,
              id: track.id,
              title: track.title,
              subtitle: track.artists.map((a) => a.name).join(', '),
              thumbnail: track.thumbnail,
              track,
              artists: track.artists,
            })),
          };
          page.shelves.unshift(shelf);
        }
      } catch {
        // artist page is still useful without the derived songs list
      }
    }
    return page;
  }

  private fallbackArtists(tracks: Track[], page: BrowsePage, type: 'album' | 'playlist' | 'podcast') {
    const name = page.header?.author?.name || page.header?.title || '';
    if (!name) return;
    for (const track of tracks) {
      if (!track.artists.length || track.artists.every((a) => !a.name)) {
        track.artists = [{ name }];
      }
    }
    if (type === 'album' && page.header) {
      for (const track of tracks) {
        if (!track.album) track.album = { id: page.header.browseId, name: page.header.title };
      }
    }
  }

  private detailPage(raw: any, type: 'album' | 'playlist' | 'podcast', id: string): BrowsePage {
    const page = parseDetailPage(raw, type);
    const parsed = parseTracksFromBrowse(raw);
    const header = page.header || {
      type,
      title: '',
    };
    header.id = id;
    header.browseId = id;
    if (!header.playlistId && parsed.tracks[0]?.playlistId) header.playlistId = parsed.tracks[0].playlistId;
    page.header = header;
    if (header.title === '') delete page.header;
    this.fallbackArtists(parsed.tracks, page, type);
    const tracksShelf = page.shelves.find((s) => s.style === 'list' && s.items.some((i) => i.track));
    if (!tracksShelf && parsed.tracks.length) {
      page.shelves.unshift({
        title: type === 'album' ? 'Tracks' : 'Songs',
        style: 'list',
        items: parsed.tracks.map((track) => ({
          type: track.type,
          id: track.id,
          title: track.title,
          subtitle: track.artists.map((a) => a.name).join(', '),
          thumbnail: track.thumbnail,
          track,
          artists: track.artists,
        })),
      });
    } else if (tracksShelf) {
      // Prefer parsed tracks (keeps library tokens) over card-only rows.
      const byId = new Map(parsed.tracks.map((t) => [t.id, t]));
      tracksShelf.items = tracksShelf.items.map((item) => {
        const track = byId.get(item.id);
        return track ? { ...item, track, subtitle: track.artists.map((a) => a.name).join(', ') } : item;
      });
    }
    page.continuation = parsed.continuation || page.continuation;
    return page;
  }

  async album(id: string): Promise<BrowsePage> {
    const raw = await this.browse(id);
    return this.detailPage(raw, 'album', id);
  }

  async playlist(id: string): Promise<BrowsePage> {
    const browseId = id.startsWith('VL') ? id : `VL${id}`;
    const raw = await this.browse(browseId);
    return this.detailPage(raw, 'playlist', browseId.replace(/^VL/, ''));
  }

  async podcast(id: string): Promise<BrowsePage> {
    const browseId = id.startsWith('MPSP') ? id : id;
    const raw = await this.browse(browseId);
    return this.detailPage(raw, 'podcast', browseId);
  }

  async detailContinuation(continuation: string): Promise<{ tracks: Track[]; continuation?: string }> {
    const raw = await this.browse(undefined, undefined, continuation);
    return parseDetailContinuation(raw);
  }

  async search(query: string, filter?: string, continuation?: string): Promise<SearchResults> {
    if (continuation) {
      const raw = await innertube.search(query, filter, continuation);
      return parseSearchContinuation(raw);
    }
    const key = `${query.trim().toLowerCase()}\u0000${filter || ''}`;
    const cached = this.searchCache.get(key);
    if (cached && Date.now() - cached.at < 2 * 60_000) return structuredClone(cached.result);
    const params = filter ? SEARCH_FILTERS[filter] || filter : undefined;
    const raw = await innertube.search(query, params);
    const result = parseSearch(raw);
    this.searchCache.set(key, { at: Date.now(), result });
    if (this.searchCache.size > 40) {
      const oldest = [...this.searchCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) this.searchCache.delete(oldest[0]);
    }
    return structuredClone(result);
  }

  async searchSuggestions(query: string): Promise<SearchSuggestion[]> {
    const key = query.trim().toLowerCase();
    const cached = this.suggestionCache.get(key);
    if (cached && Date.now() - cached.at < 60_000) return cached.result;
    const suggestions = await innertube.searchSuggestions(query);
    const result = suggestions.map((text) => ({ text }));
    this.suggestionCache.set(key, { at: Date.now(), result });
    if (this.suggestionCache.size > 80) {
      const oldest = [...this.suggestionCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) this.suggestionCache.delete(oldest[0]);
    }
    return result;
  }

  async next(endpoint: NavEndpoint, continuation?: string): Promise<NextResult> {
    const raw = await innertube.next(endpoint, continuation);
    const result = parseNext(raw);
    if (result.currentIndex === undefined && result.tracks.length) {
      const idx = result.tracks.findIndex((t) => t.id === endpoint.videoId);
      if (idx >= 0) result.currentIndex = idx;
    }
    return result;
  }

  async nextContinuation(continuation: string): Promise<NextResult> {
    const raw = await innertube.next({}, continuation);
    return parseNext(raw);
  }

  async lyrics(endpoint: NavEndpoint): Promise<string | null> {
    const raw = await innertube.lyrics(endpoint);
    return parseLyrics(raw);
  }

  async transcript(videoId: string): Promise<string | null> {
    const caption = await streams.fetchSubtitles(videoId).catch(() => null);
    return caption;
  }

  async library(): Promise<BrowsePage> {
    return parseBrowse(await this.browse('FEmusic_library_landing', undefined, undefined, true));
  }

  async libraryPage(id: string, params?: string, continuation?: string): Promise<BrowsePage> {
    if (continuation) return parseBrowseContinuation(await this.browse(id, params, continuation, true));
    return parseBrowse(await this.browse(id, params, undefined, true));
  }

  async history(): Promise<BrowsePage> {
    return parseBrowse(await this.browse('FEmusic_history', undefined, undefined, true));
  }

  async likedSongs(continuation?: string): Promise<BrowsePage> {
    if (continuation) {
      return parseBrowseContinuation(await this.browse('VLLM', undefined, continuation, true));
    }
    return parseBrowse(await this.browse('VLLM', undefined, undefined, true));
  }

  async account(): Promise<AccountInfo | null> {
    if (!innertube.hasCookies) return null;
    return innertube.loadAccount();
  }

  session(): SessionState {
    return {
      hasCookies: innertube.hasCookies,
      account: sessionStore.account,
      visitorData: sessionStore.visitorData,
      authUser: sessionStore.authUser,
    };
  }

  async setCookies(cookie: string): Promise<SessionState> {
    innertube.setCookies(cookie);
    this.homeCache = undefined;
    if (innertube.hasCookies) {
      await innertube.loadAccount().catch(() => null);
    }
    return this.session();
  }

  clearSession(): SessionState {
    innertube.clearSession();
    this.homeCache = undefined;
    return this.session();
  }

  async rate(videoId: string, rating: 'like' | 'dislike' | 'none'): Promise<boolean> {
    await innertube.rateVideo(videoId, rating);
    return true;
  }

  async subscribe(channelId: string, subscribe: boolean, params?: string): Promise<boolean> {
    await innertube.subscribe(channelId, subscribe, params);
    return true;
  }

  async addToYTPlaylist(playlistId: string, videoId: string): Promise<boolean> {
    await innertube.addToPlaylist(playlistId, videoId);
    return true;
  }

  async removeFromYTPlaylist(playlistId: string, videoId: string, setVideoId: string): Promise<boolean> {
    await innertube.removeFromPlaylist(playlistId, videoId, setVideoId);
    return true;
  }

  async createYTPlaylist(title: string): Promise<string> {
    const raw = await innertube.createPlaylist(title);
    const id = raw?.playlistId || raw?.playlistEditResults?.[0]?.playlistId;
    if (!id) throw new Error('YouTube did not return a playlist id.');
    return id;
  }

  async renameYTPlaylist(playlistId: string, title: string): Promise<boolean> {
    await innertube.renamePlaylist(playlistId, title);
    return true;
  }

  async deleteYTPlaylist(playlistId: string): Promise<boolean> {
    await innertube.deletePlaylist(playlistId);
    return true;
  }

  async addToLibrary(videoId: string): Promise<boolean> {
    await innertube.likeVideo(videoId, true);
    return true;
  }

  async removeFromLibrary(videoId: string): Promise<boolean> {
    await innertube.rateVideo(videoId, 'none');
    return true;
  }

  async related(endpoint: NavEndpoint): Promise<BrowsePage> {
    if (endpoint.browseId) {
      return parseRelated(await this.browse(endpoint.browseId, endpoint.params));
    }
    return { shelves: [] };
  }
}

export const ytm = new YtmService();

/** Convenience mapping for UI cards from a raw next response. */
export function cardsFromTracks(tracks: Track[]): Card[] {
  return tracks.map((track) => ({
    type: track.type,
    id: track.id,
    title: track.title,
    subtitle: track.artists.map((a) => a.name).join(', '),
    thumbnail: track.thumbnail,
    track,
    artists: track.artists,
  }));
}
