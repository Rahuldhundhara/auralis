import { useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const unsubscribe = window.auralis.window.onStateChange((state) => {
      if (state === 'maximized') setMaximized(true);
      if (state === 'unmaximized') setMaximized(false);
    });
    return unsubscribe;
  }, []);

  return (
    <header
      className="titlebar"
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest('button')) return;
        void window.auralis.app.toggleMaximize().then(setMaximized);
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
          onClick={() => void window.auralis.app.minimize()}
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          className="window-btn"
          aria-label={maximized ? 'Restore' : 'Maximize'}
          title={maximized ? 'Restore' : 'Maximize'}
          onClick={() => void window.auralis.app.toggleMaximize().then(setMaximized)}
        >
          {maximized ? <Copy size={13} /> : <Square size={12} />}
        </button>
        <button
          type="button"
          className="window-btn is-close"
          aria-label="Close"
          title="Close"
          onClick={() => void window.auralis.app.close()}
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
}
