import type {
  Card,
  DownloadItem,
  LibraryData,
  LocalPlaylist,
  PlayEvent,
  Track,
} from '../../shared/types';
import { deleteLocalFile } from './http';
import { libraryStore, newId } from './store';

let changeHandler: ((data: LibraryData) => void) | null = null;

export function setLibraryChangeHandler(handler: (data: LibraryData) => void) {
  changeHandler = handler;
}

function commit(data: LibraryData): LibraryData {
  libraryStore.set(data);
  changeHandler?.(data);
  return data;
}

function clip(value: string | undefined, length = 300): string {
  return (value || '').trim().slice(0, length);
}

export const libraryService = {
  get(): LibraryData {
    return libraryStore.get();
  },

  like(track: Track): LibraryData {
    const data = libraryStore.get();
    if (data.liked.some((item) => item.id === track.id)) return data;
    return commit({ ...data, liked: [{ ...track }, ...data.liked] });
  },

  unlike(trackId: string): LibraryData {
    const data = libraryStore.get();
    return commit({ ...data, liked: data.liked.filter((item) => item.id !== trackId) });
  },

  isLiked(trackId: string): boolean {
    return libraryStore.get().liked.some((item) => item.id === trackId);
  },

  addRecent(track: Track): LibraryData {
    const data = libraryStore.get();
    const recent = [{ ...track }, ...data.recent.filter((item) => item.id !== track.id)].slice(0, 100);
    return commit({ ...data, recent });
  },

  recordEvent(input: Omit<PlayEvent, 'playedAt'> & { playedAt?: number }): LibraryData {
    const data = libraryStore.get();
    const event: PlayEvent = {
      trackId: input.trackId,
      title: clip(input.title, 200),
      artist: clip(input.artist, 200),
      album: input.album ? clip(input.album, 200) : undefined,
      duration: Math.max(0, Math.round(input.duration || 0)),
      playedAt: input.playedAt || Date.now(),
      completed: Boolean(input.completed),
    };
    const events = [event, ...data.events].slice(0, 500);
    return commit({ ...data, events });
  },

  clearRecent(): LibraryData {
    const data = libraryStore.get();
    return commit({ ...data, recent: [] });
  },

  addSearchHistory(query: string): LibraryData {
    const value = clip(query, 120);
    if (!value) return libraryStore.get();
    const data = libraryStore.get();
    const searchHistory = [value, ...data.searchHistory.filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 25);
    return commit({ ...data, searchHistory });
  },

  clearSearchHistory(): LibraryData {
    const data = libraryStore.get();
    return commit({ ...data, searchHistory: [] });
  },

  saveAlbum(album: Card): LibraryData {
    const data = libraryStore.get();
    if (data.savedAlbums.some((item) => item.id === album.id)) return data;
    return commit({ ...data, savedAlbums: [{ ...album, type: album.type === 'single' || album.type === 'ep' ? album.type : 'album' }, ...data.savedAlbums] });
  },

  removeAlbum(albumId: string): LibraryData {
    const data = libraryStore.get();
    return commit({ ...data, savedAlbums: data.savedAlbums.filter((item) => item.id !== albumId) });
  },

  saveArtist(artist: Card): LibraryData {
    const data = libraryStore.get();
    if (data.savedArtists.some((item) => item.id === artist.id)) return data;
    return commit({ ...data, savedArtists: [{ ...artist, type: 'artist', round: true }, ...data.savedArtists] });
  },

  removeArtist(artistId: string): LibraryData {
    const data = libraryStore.get();
    return commit({ ...data, savedArtists: data.savedArtists.filter((item) => item.id !== artistId) });
  },

  createPlaylist(name: string, description = ''): LocalPlaylist {
    const data = libraryStore.get();
    const now = Date.now();
    const playlist: LocalPlaylist = {
      id: newId('pl'),
      name: clip(name, 100) || 'New playlist',
      description: clip(description, 500),
      createdAt: now,
      updatedAt: now,
      tracks: [],
    };
    commit({ ...data, playlists: [playlist, ...data.playlists] });
    return playlist;
  },

  renamePlaylist(id: string, name: string, description?: string): LocalPlaylist {
    const data = libraryStore.get();
    let output: LocalPlaylist | undefined;
    const playlists = data.playlists.map((playlist) => {
      if (playlist.id !== id) return playlist;
      output = {
        ...playlist,
        name: clip(name, 100) || playlist.name,
        description: description === undefined ? playlist.description : clip(description, 500),
        updatedAt: Date.now(),
      };
      return output;
    });
    if (!output) throw new Error('Playlist not found.');
    commit({ ...data, playlists });
    return output;
  },

  deletePlaylist(id: string): LibraryData {
    const data = libraryStore.get();
    return commit({ ...data, playlists: data.playlists.filter((playlist) => playlist.id !== id) });
  },

  addToPlaylist(id: string, track: Track): LocalPlaylist {
    const data = libraryStore.get();
    let output: LocalPlaylist | undefined;
    const playlists = data.playlists.map((playlist) => {
      if (playlist.id !== id) return playlist;
      if (playlist.tracks.some((item) => item.id === track.id)) {
        output = playlist;
        return playlist;
      }
      output = {
        ...playlist,
        cover: playlist.cover || track.thumbnail,
        tracks: [...playlist.tracks, { ...track }],
        updatedAt: Date.now(),
      };
      return output;
    });
    if (!output) throw new Error('Playlist not found.');
    commit({ ...data, playlists });
    return output;
  },

  removeFromPlaylist(id: string, trackId: string): LocalPlaylist {
    const data = libraryStore.get();
    let output: LocalPlaylist | undefined;
    const playlists = data.playlists.map((playlist) => {
      if (playlist.id !== id) return playlist;
      output = {
        ...playlist,
        tracks: playlist.tracks.filter((track) => track.id !== trackId),
        updatedAt: Date.now(),
      };
      return output;
    });
    if (!output) throw new Error('Playlist not found.');
    commit({ ...data, playlists });
    return output;
  },

  reorderPlaylist(id: string, from: number, to: number): LocalPlaylist {
    const data = libraryStore.get();
    let output: LocalPlaylist | undefined;
    const playlists = data.playlists.map((playlist) => {
      if (playlist.id !== id) return playlist;
      const tracks = [...playlist.tracks];
      if (from < 0 || from >= tracks.length || to < 0 || to >= tracks.length) return playlist;
      const [moved] = tracks.splice(from, 1);
      tracks.splice(to, 0, moved);
      output = { ...playlist, tracks, updatedAt: Date.now() };
      return output;
    });
    if (!output) throw new Error('Playlist not found.');
    commit({ ...data, playlists });
    return output;
  },

  getDownloads(): DownloadItem[] {
    return libraryStore.get().downloads;
  },

  async removeDownload(id: string, deleteFile = true): Promise<DownloadItem[]> {
    const data = libraryStore.get();
    const target = data.downloads.find((item) => item.id === id);
    if (deleteFile && target?.path) {
      await deleteLocalFile(target.path);
    }
    const downloads = data.downloads.filter((item) => item.id !== id);
    commit({ ...data, downloads });
    return downloads;
  },

  async clearDownloads(deleteFiles = true): Promise<DownloadItem[]> {
    const data = libraryStore.get();
    if (deleteFiles) {
      await Promise.allSettled(data.downloads.map((item) => (item.path ? deleteLocalFile(item.path) : Promise.resolve())));
    }
    commit({ ...data, downloads: [] });
    return [];
  },
};
