import { describe, expect, it, vi } from 'vitest';

import type { FinalReceiptLookupRequest } from '../../apps/world-web/src/prototype/final-receipt-lookup.js';
import {
  createLocalAuditHostConfig,
  type LocalAuditHostInjection,
} from '../../apps/world-web/src/prototype/local-audit-host.js';

const request: FinalReceiptLookupRequest = {
  schemaVersion: 'world-final-receipt-read-v1',
  requestId: '123e4567-e89b-42d3-a456-426614174000',
  operation: 'READ_FINAL_NARROW_TRANSFER_RECEIPT',
  payload: {
    worldId: 'WORLD_TEST',
    commandId: 'COMMAND_43',
    idempotencyKey: 'KEY_43',
  },
};

const userJwt = `eyJhbGciOiJub25lIn0.${Buffer.from(
  JSON.stringify({ role: 'authenticated', sub: 'user-1' }),
).toString('base64url')}.signature`;
const serviceJwt = `eyJhbGciOiJub25lIn0.${Buffer.from(
  JSON.stringify({ role: 'service_role', sub: 'service-1' }),
).toString('base64url')}.signature`;

const injection: LocalAuditHostInjection = {
  currentIdentity: null,
  bridgeOrigin: 'http://127.0.0.1:4102',
  getAccessToken: async () => userJwt,
};

describe('local browser audit host', () => {
  it('fails closed without trusted injection or a strict loopback origin', () => {
    expect(createLocalAuditHostConfig(null)).toBeNull();
    for (const bridgeOrigin of [
      'https://127.0.0.1:4102',
      'http://example.com:4102',
      'http://127.0.0.1:4102/path',
      'http://127.0.0.1:4102/?token=secret',
      'http://127.0.0.1:80',
    ]) {
      expect(
        createLocalAuditHostConfig({ ...injection, bridgeOrigin }),
      ).toBeNull();
    }
  });

  it('sends the exact E receipt-read envelope only to the local bridge with a user token', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        schemaVersion: request.schemaVersion,
        requestId: request.requestId,
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Not found', retryable: false },
      }),
    );
    const config = createLocalAuditHostConfig(injection, fetcher);
    expect(config).not.toBeNull();
    await config?.lookupFinalReceipt?.(request);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:4102/local/v1/narrow-transfer-receipt');
    expect(options).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: {
        Authorization: `Bearer ${userJwt}`,
        'Content-Type': 'application/json',
      },
    });
    expect(JSON.parse(String(options?.body))).toEqual(request);
    expect(Object.keys(JSON.parse(String(options?.body)).payload)).toEqual([
      'worldId',
      'commandId',
      'idempotencyKey',
    ]);
  });

  it('does not send without an access token, and does not promote 401 or 404', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ ok: false }, { status: 404 }),
    );
    const noToken = createLocalAuditHostConfig(
      { ...injection, getAccessToken: async () => null },
      fetcher,
    );
    expect(await noToken?.lookupFinalReceipt?.(request)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    const serviceToken = createLocalAuditHostConfig(
      { ...injection, getAccessToken: async () => serviceJwt },
      fetcher,
    );
    expect(await serviceToken?.getAccessToken()).toBeNull();
    expect(await serviceToken?.lookupFinalReceipt?.(request)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    const config = createLocalAuditHostConfig(injection, fetcher);
    expect(await config?.lookupFinalReceipt?.(request)).toBeNull();
    fetcher.mockResolvedValueOnce(
      Response.json({ ok: false }, { status: 401 }),
    );
    expect(await config?.lookupFinalReceipt?.(request)).toBeNull();
  });
});
