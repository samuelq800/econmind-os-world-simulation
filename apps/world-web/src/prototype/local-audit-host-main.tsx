import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { LocalAuthorizedReadEntry } from './LocalAuthorizedReadEntry.js';
import {
  createLocalAuditHostConfig,
  type LocalAuditHostInjection,
} from './local-audit-host.js';
import './prototype.css';
import './six-offices.css';

declare global {
  interface Window {
    __ECONMIND_LOCAL_AUDIT_HOST__?: LocalAuditHostInjection;
    /** Development-only hook for an external browser audit runner. */
    __ECONMIND_LOCAL_AUDIT_REFRESH__?: () => void;
  }
}

const root = document.getElementById('local-audit-root');
if (!root) throw new Error('Missing local audit root');

const reactRoot = createRoot(root);
let hostGeneration = 0;

function renderHost() {
  hostGeneration += 1;
  const config = createLocalAuditHostConfig(
    window.__ECONMIND_LOCAL_AUDIT_HOST__,
  );
  // The audit entry never falls through to PrototypeApp's LOCAL_FIXTURE route.
  reactRoot.render(
    <StrictMode>
      {config ? (
        <LocalAuthorizedReadEntry key={hostGeneration} config={config} />
      ) : (
        <main className="prototype-app" aria-label="Local audit unavailable">
          <div className="prototype-warning" role="alert">
            <strong>LOCAL AUDIT HOST · NOT CONNECTED</strong>
            <span>
              A trusted local identity and loopback bridge must be attached
              before this page loads. No World values or commands are available.
            </span>
          </div>
        </main>
      )}
    </StrictMode>,
  );
}

renderHost();
if (import.meta.env.DEV) {
  window.__ECONMIND_LOCAL_AUDIT_REFRESH__ = renderHost;
}
