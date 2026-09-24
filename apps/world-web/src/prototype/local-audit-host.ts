import type {
  AuthorizedBrowserIdentity,
  NarrowTransferDraft,
} from '../authorized-client/client.js';
import type { FinalReceiptLookupRequest } from './final-receipt-lookup.js';
import type {
  LocalAuthorizedReadConfig,
  TrustedNarrowTransferReceiptBinding,
} from './local-authorized-read.js';

const RECEIPT_PATH = '/local/v1/narrow-transfer-receipt';
const MAX_RESPONSE_BYTES = 1024 * 1024;

/** Supplied in memory by a trusted local audit harness before this page loads. */
export interface LocalAuditHostInjection {
  readonly currentIdentity: AuthorizedBrowserIdentity | null;
  readonly bridgeOrigin: string;
  readonly getAccessToken: () => Promise<string | null>;
  readonly narrowTransferDraft?: NarrowTransferDraft | null;
  readonly narrowTransferReceiptBinding?: TrustedNarrowTransferReceiptBinding | null;
}

function loopbackOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    const port = Number(url.port);
    if (
      url.protocol !== 'http:' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !Number.isInteger(port) ||
      port < 1024 ||
      port > 65535 ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Browser-side guard only; E remains the authority for JWT signature and scope. */
function userAccessToken(value: string | null): string | null {
  if (!value || /[\r\n]/u.test(value)) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      atob(parts[1]!.replace(/-/gu, '+').replace(/_/gu, '/')),
    ) as Record<string, unknown>;
    return payload.role === 'authenticated' &&
      typeof payload.sub === 'string' &&
      payload.sub.length > 0
      ? value
      : null;
  } catch {
    return null;
  }
}

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_RESPONSE_BYTES) return null;
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  try {
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

export function createLocalAuditHostConfig(
  injection: LocalAuditHostInjection | null | undefined,
  fetchImpl: typeof fetch = fetch,
): LocalAuthorizedReadConfig | null {
  if (
    !injection ||
    typeof injection.getAccessToken !== 'function' ||
    typeof injection.bridgeOrigin !== 'string'
  )
    return null;
  const origin = loopbackOrigin(injection.bridgeOrigin);
  if (!origin) return null;
  const getUserAccessToken = async () =>
    userAccessToken(await injection.getAccessToken());
  return {
    currentIdentity: injection.currentIdentity,
    bridgeOrigin: origin,
    getAccessToken: getUserAccessToken,
    narrowTransferDraft: injection.narrowTransferDraft ?? null,
    narrowTransferReceiptBinding:
      injection.narrowTransferReceiptBinding ?? null,
    async lookupFinalReceipt(request: FinalReceiptLookupRequest) {
      const token = await getUserAccessToken();
      if (!token) return null;
      try {
        const response = await fetchImpl(`${origin}${RECEIPT_PATH}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
        });
        if (response.status !== 200) return null;
        return await boundedJson(response);
      } catch {
        return null;
      }
    },
  };
}
