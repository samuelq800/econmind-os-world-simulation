import type { BrowserFinalReceipt } from '../authorized-client/client.js';

/** E candidate's exact read request; transport and Bearer token belong to the host. */
export interface FinalReceiptLookupRequest {
  readonly schemaVersion: 'world-final-receipt-read-v1';
  readonly requestId: string;
  readonly operation: 'READ_FINAL_NARROW_TRANSFER_RECEIPT';
  readonly payload: {
    readonly worldId: string;
    readonly commandId: string;
    readonly idempotencyKey: string;
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Structural envelope check only; the controller verifies the receipt and original intent. */
export function parseFinalReceiptLookupResponse(
  value: unknown,
  requestId: string,
): BrowserFinalReceipt | null {
  const envelope = record(value);
  if (
    !envelope ||
    Object.keys(envelope).sort().join(',') !==
      'ok,receipt,requestId,schemaVersion' ||
    envelope.schemaVersion !== 'world-final-receipt-read-v1' ||
    envelope.requestId !== requestId ||
    envelope.ok !== true ||
    !record(envelope.receipt)
  )
    return null;
  return envelope.receipt as BrowserFinalReceipt;
}
