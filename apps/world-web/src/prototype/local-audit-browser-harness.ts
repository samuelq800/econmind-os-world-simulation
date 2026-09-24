import type { LocalAuditHostInjection } from './local-audit-host.js';

/**
 * Development-only browser runner seam. The caller supplies identity, loopback
 * origin and user-token callback in memory; nothing is read from URL or storage.
 */
export function attachLocalAuditBrowserHarness(
  input: LocalAuditHostInjection,
): () => void {
  if (
    !import.meta.env.DEV ||
    window.location.pathname !== '/local-audit-host.html' ||
    typeof window.__ECONMIND_LOCAL_AUDIT_REFRESH__ !== 'function'
  ) {
    throw new Error('LOCAL_AUDIT_BROWSER_HARNESS_UNAVAILABLE');
  }
  const injection: LocalAuditHostInjection = {
    currentIdentity: input.currentIdentity
      ? { ...input.currentIdentity }
      : null,
    bridgeOrigin: input.bridgeOrigin,
    getAccessToken: input.getAccessToken,
    narrowTransferDraft: input.narrowTransferDraft
      ? { ...input.narrowTransferDraft }
      : null,
    narrowTransferReceiptBinding: input.narrowTransferReceiptBinding
      ? { ...input.narrowTransferReceiptBinding }
      : null,
  };
  window.__ECONMIND_LOCAL_AUDIT_HOST__ = injection;
  window.__ECONMIND_LOCAL_AUDIT_REFRESH__();
  return () => {
    if (window.__ECONMIND_LOCAL_AUDIT_HOST__ !== injection) return;
    delete window.__ECONMIND_LOCAL_AUDIT_HOST__;
    window.__ECONMIND_LOCAL_AUDIT_REFRESH__?.();
  };
}
