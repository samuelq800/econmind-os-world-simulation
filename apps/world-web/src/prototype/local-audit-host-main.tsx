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
  }
}

const root = document.getElementById('local-audit-root');
if (!root) throw new Error('Missing local audit root');

const config = createLocalAuditHostConfig(window.__ECONMIND_LOCAL_AUDIT_HOST__);
// The audit entry never falls through to PrototypeApp's LOCAL_FIXTURE route.
createRoot(root).render(
  <StrictMode>
    {config ? (
      <LocalAuthorizedReadEntry config={config} />
    ) : (
      <main className="prototype-app" aria-label="Local audit unavailable">
        <div className="prototype-warning" role="alert">
          <strong>LOCAL AUDIT HOST · NOT CONNECTED</strong>
          <span>
            A trusted local identity and loopback bridge must be attached before
            this page loads. No World values or commands are available.
          </span>
        </div>
      </main>
    )}
  </StrictMode>,
);
