import { WindowControls } from './WindowControls';

/**
 * Compact window chrome for the splash and sign-in screens only. The app shell
 * moves these controls into the top bar so content can start at the window's
 * top edge.
 */
export function TitleBar() {
  return (
    <header
      className="titlebar"
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest('button')) return;
        void window.auralis.app.toggleMaximize();
      }}
    >
      <div className="titlebar-brand">
        <img src="./icon.png" alt="" className="titlebar-logo" draggable={false} />
        <span className="titlebar-name">Auralis</span>
        <span className="titlebar-tag">Music</span>
      </div>
      <div className="titlebar-drag" />
      <WindowControls />
    </header>
  );
}
