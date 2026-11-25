import { useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';

/**
 * Frameless-window controls. The app shell mounts these inside the top bar so
 * the layout can use a 0px title bar without losing the window chrome; the
 * splash screen keeps its own copy in the compact title bar.
 */
export function WindowControls({ className = '' }: { className?: string }) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const unsubscribe = window.auralis.window.onStateChange((state) => {
      if (state === 'maximized') setMaximized(true);
      if (state === 'unmaximized') setMaximized(false);
    });
    return unsubscribe;
  }, []);

  return (
    <div className={`window-controls ${className}`.trim()}>
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
  );
}
