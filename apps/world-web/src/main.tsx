import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './brand-shell/entry.js';

import { App } from './App.js';

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Missing #root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
