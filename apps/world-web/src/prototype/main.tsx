import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { PrototypeApp } from './App.js';
import './prototype.css';

const rootElement = document.getElementById('prototype-root');

if (rootElement === null) {
  throw new Error('Missing #prototype-root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <PrototypeApp />
  </StrictMode>,
);
