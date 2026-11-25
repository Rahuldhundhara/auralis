import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App, { ErrorBoundary } from './App';
import { isAndroidShell } from './lib/platform';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Auralis could not find its root element.');

// Android uses the same renderer as the Windows app, but swaps the desktop
// title bar and left rail for an app-style top bar and bottom navigation.
if (isAndroidShell) document.documentElement.classList.add('is-android');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
