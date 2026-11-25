import { useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let alive = true;
    void window.auralis.app
      .windowState()
      .then((state) => {
        if (alive) setMaximized(state.maximized);
      })
      .catch(() => {
        // The window:state event below will still keep this in sync.
      });
    const unsubscribe = window.auralis.window.onStateChange((state) => {
      if (state === 'maximized') setMaximized(true);
      if (state === 'unmaximized') setMaximized(false);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const minimize = () => {
    void window.auralis.app.minimize().catch(() => {});
  };

  const toggleMaximize = async () => {
    try {
      setMaximized(await window.auralis.app.toggleMaximize());
    } catch {
      // Keep the last known state; the window:state event will correct it.
    }
  };

  const close = async () => {
    try {
      await window.auralis.app.close();
    } catch {
      window.close();
    }
  };

  return (
    <header
      className="titlebar"
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest('button')) return;
        void toggleMaximize();
      }}
    >
      <div className="titlebar-brand">
        <img src="./icon.png" alt="" className="titlebar-logo" draggable={false} />
        <span className="titlebar-name">Auralis</span>
        <span className="titlebar-tag">Music</span>
      </div>
      <div className="titlebar-drag" />
      <div className="window-controls">
        <button
          type="button"
          className="window-btn"
          aria-label="Minimize"
          title="Minimize"
          onClick={minimize}
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          className="window-btn"
          aria-label={maximized ? 'Restore' : 'Maximize'}
          title={maximized ? 'Restore' : 'Maximize'}
          onClick={() => void toggleMaximize()}
        >
          {maximized ? <Copy size={13} /> : <Square size={12} />}
        </button>
        <button
          type="button"
          className="window-btn is-close"
          aria-label="Close"
          title="Close"
          onClick={() => void close()}
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
}
