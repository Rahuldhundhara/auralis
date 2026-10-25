import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FolderOpen,
  HardDrive,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  Shuffle,
  Trash2,
  X,
} from 'lucide-react';
import type { DownloadItem } from '@shared/types';
import { useAppStore } from '../stores/app';
import { useNavStore } from '../stores/nav';
import { usePlayerStore } from '../stores/player';
import { confirmDialog, toast, useUiStore } from '../stores/ui';
import { formatBytes, formatDate, formatDuration, shuffleArray } from '../lib/format';
import { Artwork, Button, EmptyState, IconButton } from '../components/primitives';

type Filter = 'all' | 'done' | 'active' | 'failed';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'done', label: 'Completed' },
  { id: 'active', label: 'In progress' },
  { id: 'failed', label: 'Needs attention' },
];

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function statusLabel(item: DownloadItem): string {
  if (item.status === 'done') return 'Downloaded';
  if (item.status === 'downloading') return `Downloading ${Math.round(item.progress || 0)}%`;
  if (item.status === 'queued') return 'Queued';
  if (item.status === 'cancelled') return 'Cancelled';
  return 'Failed';
}

export function DownloadsPage() {
  const downloads = useAppStore((state) => state.library.downloads);
  const appInfo = useAppStore((state) => state.appInfo);
  const settings = useAppStore((state) => state.settings);
  const removeDownload = useAppStore((state) => state.removeDownload);
  const clearDownloads = useAppStore((state) => state.clearDownloads);
  const refreshLibrary = useAppStore((state) => state.refreshLibrary);
  const navigate = useNavStore((state) => state.navigate);
  const openMenu = useUiStore((state) => state.openMenu);
  const [filter, setFilter] = useState<Filter>('all');

  const done = useMemo(() => downloads.filter((item) => item.status === 'done'), [downloads]);
  const active = useMemo(() => downloads.filter((item) => item.status === 'downloading' || item.status === 'queued'), [downloads]);
  const failed = useMemo(() => downloads.filter((item) => item.status === 'error' || item.status === 'cancelled'), [downloads]);
  const totalBytes = done.reduce((sum, item) => sum + (item.size || 0), 0);
  const folder = settings.downloadDir || appInfo?.downloadsDir || '';
  const filtering: Record<Filter, DownloadItem[]> = {
    all: downloads,
    done,
    active,
    failed,
  };
  const visible = filtering[filter];

  const play = (item: DownloadItem, shuffle = false) => {
    if (item.status !== 'done') return;
    const queue = shuffle ? shuffleArray(done.map((entry) => entry.track)) : done.map((entry) => entry.track);
    const start = shuffle ? 0 : Math.max(0, queue.findIndex((track) => track.id === item.track.id));
    usePlayerStore.getState().playQueue(queue, start);
  };

  const openFolder = () => {
    if (!folder) return;
    void window.auralis.shell.openPath(folder).then((error) => {
      if (error) toast(error, 'error');
    });
  };

  const remove = (item: DownloadItem, deleteFile: boolean) => {
    const run = async () => {
      await removeDownload(item.id, deleteFile);
      toast(deleteFile ? `Deleted “${item.track.title}” from disk.` : 'Removed from the download list.', 'success');
    };
    if (deleteFile) {
      confirmDialog({
        title: 'Delete download?',
        message: `The file will be deleted from “${folder}”. The song stays in your library and can be downloaded again.`,
        confirmLabel: 'Delete file',
        danger: true,
        onConfirm: run,
      });
    } else {
      void run();
    }
  };

  const clearAll = () => {
    confirmDialog({
      title: 'Clear all downloads?',
      message: `${downloads.length} entries will be removed and ${done.length} files will be deleted from disk. This cannot be undone.`,
      confirmLabel: 'Delete everything',
      danger: true,
      onConfirm: async () => {
        await clearDownloads(true);
        toast('Downloads cleared.', 'success');
      },
    });
  };

  const rowMenu = (event: React.MouseEvent, item: DownloadItem) => {
    const items: any[] = [];
    if (item.status === 'done') {
      items.push({ label: 'Play', icon: Play, onClick: () => play(item) });
      items.push({ label: 'Play next', icon: Play, onClick: () => usePlayerStore.getState().playNext(item.track) });
      items.push({ label: 'Add to queue', icon: Play, onClick: () => usePlayerStore.getState().addToQueue(item.track) });
      items.push({ separator: true });
      items.push({ label: 'Show in folder', icon: FolderOpen, onClick: () => void window.auralis.app.showItemInFolder(item.path) });
      items.push({ label: 'Open file', icon: Play, onClick: () => void window.auralis.shell.openPath(item.path) });
    }
    if (item.status === 'downloading' || item.status === 'queued') {
      items.push({
        label: 'Cancel download',
        icon: X,
        onClick: () => {
          void window.auralis.player.cancelDownload(item.id);
          toast('Download cancelled.', 'info');
        },
      });
    }
    if (item.status === 'error' || item.status === 'cancelled') {
      items.push({
        label: 'Try again',
        icon: RefreshCw,
        onClick: () => {
          void useAppStore.getState().downloadTrack(item.track).then(() => refreshLibrary());
        },
      });
    }
    items.push({ separator: true });
    items.push({ label: 'Remove from list', icon: X, onClick: () => remove(item, false) });
    items.push({ label: 'Delete file', icon: Trash2, danger: true, onClick: () => remove(item, true) });
    openMenu(event.clientX, event.clientY, items);
  };

  return (
    <div className="page downloads-page">
      <header className="page-hero downloads-hero">
        <div>
          <span className="eyebrow">
            <Download size={14} /> Offline listening
          </span>
          <h1>Downloads</h1>
          <p>Every file is stored on this PC, so your music keeps playing when the internet does not.</p>
          <div className="downloads-stats">
            <div className="download-stat">
              <span className="download-stat-icon">
                <CheckCircle2 size={18} />
              </span>
              <div>
                <strong>{done.length}</strong>
                <span>Ready offline</span>
              </div>
            </div>
            <div className="download-stat">
              <span className="download-stat-icon">
                <HardDrive size={18} />
              </span>
              <div>
                <strong>{formatBytes(totalBytes) || '0 B'}</strong>
                <span>On disk</span>
              </div>
            </div>
            <div className="download-stat">
              <span className="download-stat-icon">
                <Download size={18} />
              </span>
              <div>
                <strong>{active.length}</strong>
                <span>In progress</span>
              </div>
            </div>
            {failed.length ? (
              <div className="download-stat is-warning">
                <span className="download-stat-icon">
                  <AlertCircle size={18} />
                </span>
                <div>
                  <strong>{failed.length}</strong>
                  <span>Needs attention</span>
                </div>
              </div>
            ) : null}
          </div>
          <div className="downloads-actions">
            <Button
              variant="primary"
              icon={<Play size={17} fill="currentColor" />}
              disabled={!done.length}
              onClick={() => done.length && usePlayerStore.getState().playQueue(done.map((item) => item.track), 0)}
            >
              Play downloads
            </Button>
            <Button
              variant="secondary"
              icon={<Shuffle size={17} />}
              disabled={!done.length}
              onClick={() => done.length && usePlayerStore.getState().playQueue(shuffleArray(done.map((item) => item.track)), 0)}
            >
              Shuffle
            </Button>
            <Button variant="outline" icon={<FolderOpen size={17} />} onClick={openFolder} disabled={!folder}>
              Open folder
            </Button>
            <Button variant="ghost" icon={<Trash2 size={16} />} onClick={clearAll} disabled={!downloads.length}>
              Clear all
            </Button>
          </div>
          {folder ? (
            <button type="button" className="download-path" onClick={openFolder} title="Open downloads folder">
              <FolderOpen size={14} /> {folder}
            </button>
          ) : null}
        </div>
      </header>

      <div className="downloads-toolbar">
        <div className="library-tabs compact-tabs" role="tablist">
          {FILTERS.map((entry) => {
            const count =
              entry.id === 'all' ? downloads.length : entry.id === 'done' ? done.length : entry.id === 'active' ? active.length : failed.length;
            return (
              <button
                type="button"
                role="tab"
                key={entry.id}
                aria-selected={filter === entry.id}
                className={`library-tab ${filter === entry.id ? 'is-active' : ''}`}
                onClick={() => setFilter(entry.id)}
              >
                {entry.label}
                <span className="tab-count">{count}</span>
              </button>
            );
          })}
        </div>
        <Button variant="ghost" size="sm" icon={<RefreshCw size={15} />} onClick={() => void refreshLibrary()}>
          Refresh
        </Button>
      </div>

      {visible.length ? (
        <div className="download-list">
          {visible.map((item) => {
            const pending = item.status === 'downloading' || item.status === 'queued';
            return (
              <div className={`download-row ${pending ? 'is-active' : ''} ${item.status === 'error' ? 'is-error' : ''}`} key={item.id}>
                <button
                  type="button"
                  className="download-main"
                  onClick={() => (item.status === 'done' ? play(item) : undefined)}
                  disabled={item.status !== 'done'}
                >
                  <div className="download-art-wrap">
                    <Artwork src={item.track.thumbnail} alt={item.track.title} className="download-art" />
                    {item.status === 'done' ? (
                      <span className="download-play">
                        <Play size={16} fill="currentColor" />
                      </span>
                    ) : pending ? (
                      <span className="download-play is-pending">
                        <Pause size={15} />
                      </span>
                    ) : (
                      <span className="download-play is-error">
                        <AlertCircle size={15} />
                      </span>
                    )}
                  </div>
                  <div className="download-text">
                    <span className="download-title">{item.track.title}</span>
                    <span className="download-artist">
                      {item.track.artists.map((artist) => artist.name).join(', ')}
                      {item.track.album?.name ? ` · ${item.track.album.name}` : ''}
                    </span>
                    <span className="download-file">
                      {item.path ? fileName(item.path) : statusLabel(item)}
                      {item.size ? ` · ${formatBytes(item.size)}` : ''}
                      {item.track.duration ? ` · ${formatDuration(item.track.duration)}` : ''}
                    </span>
                    {pending ? (
                      <span className="download-progress">
                        <span style={{ width: `${Math.round(item.progress || 0)}%` }} />
                      </span>
                    ) : null}
                    {item.error ? <span className="download-error">{item.error}</span> : null}
                  </div>
                </button>
                <div className="download-meta">
                  <span className={`download-status status-${item.status}`}>{statusLabel(item)}</span>
                  <span className="download-date">{formatDate(item.createdAt)}</span>
                </div>
                <div className="download-actions">
                  {item.status === 'done' ? (
                    <>
                      <IconButton label="Show in folder" size="sm" onClick={() => void window.auralis.app.showItemInFolder(item.path)}>
                        <FolderOpen size={16} />
                      </IconButton>
                      <IconButton label="Play" size="sm" onClick={() => play(item)}>
                        <Play size={16} />
                      </IconButton>
                    </>
                  ) : pending ? (
                    <IconButton
                      label="Cancel download"
                      size="sm"
                      onClick={() => {
                        void window.auralis.player.cancelDownload(item.id);
                        toast('Download cancelled.', 'info');
                      }}
                    >
                      <X size={16} />
                    </IconButton>
                  ) : (
                    <IconButton
                      label="Try again"
                      size="sm"
                      onClick={() => {
                        void useAppStore.getState().downloadTrack(item.track);
                      }}
                    >
                      <RefreshCw size={16} />
                    </IconButton>
                  )}
                  <IconButton label="More options" size="sm" onClick={(event) => rowMenu(event, item)}>
                    <MoreHorizontal size={17} />
                  </IconButton>
                  <IconButton label="Delete download" size="sm" onClick={() => remove(item, true)}>
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Download size={28} />}
          title={filter === 'all' ? 'No downloads yet' : `No ${FILTERS.find((entry) => entry.id === filter)?.label.toLowerCase()} downloads`}
          message="Use the download button on any song, album or playlist. Files are saved locally and play even without a connection."
          action={
            <Button variant="primary" onClick={() => navigate({ page: 'explore' })}>
              Find music to download
            </Button>
          }
        />
      )}
    </div>
  );
}
