import { afterEach, describe, expect, it } from 'vitest';

import {
  WORLD_COMMAND_API_SCHEMA_VERSION,
  WORLD_READ_API_SCHEMA_VERSION,
  createAuthenticatedNarrowTransferCommandHandler,
  createLocalNonproductionWorldHttpBridge,
  parseSupabaseAuthSubject,
  startLocalNonproductionWorldHttpBridge,
  type RunningLocalNonproductionWorldHttpBridge,
} from '../../apps/world-api/src/index.js';

const AUTH_SUBJECT = parseSupabaseAuthSubject(
  '550e8400-e29b-41d4-a716-446655440000',
);
const ENVIRONMENT = { ECONMIND_ENV: 'local' } as NodeJS.ProcessEnv;
const REQUEST_ID = '550e8400-e29b-41d4-a716-446655440001';

let running: RunningLocalNonproductionWorldHttpBridge | undefined;

afterEach(async () => {
  await running?.shutdown();
  running = undefined;
});

function commandRequest(
  input: {
    readonly countryId?: string;
    readonly buyerFinanceApprovalRef?: string;
  } = {},
) {
  return {
    schemaVersion: WORLD_COMMAND_API_SCHEMA_VERSION,
    requestId: REQUEST_ID,
    operation: 'SUBMIT_NARROW_TREASURY_GCU_TRANSFER',
    payload: {
      worldId: 'WORLD_TWO_COUNTRY',
      countryId: input.countryId ?? 'COUNTRY_SELLER',
      officeId: 'TRADE',
      commandId: 'COMMAND_NARROW_TRANSFER_1',
      idempotencyKey: 'IDEMPOTENCY_NARROW_TRANSFER_1',
      proposalRef: 'PROPOSAL_NARROW_TRANSFER_1',
      buyerCountryId: 'COUNTRY_BUYER',
      buyerFinanceApprovalRef:
        input.buyerFinanceApprovalRef ?? 'APPROVAL_BUYER_FINANCE_1',
    },
  } as const;
}

function commandHandler(input: {
  readonly approval: 'APPROVED' | 'MISSING';
  readonly countryId?: string;
  readonly receiptCalls: { value: number };
}) {
  return createAuthenticatedNarrowTransferCommandHandler({
    approvalReader: {
      async readCurrent() {
        if (input.approval === 'MISSING') return null;
        return {
          worldId: 'WORLD_TWO_COUNTRY',
          buyerCountryId: 'COUNTRY_BUYER',
          officeId: 'FINANCE' as const,
          proposalRef: 'PROPOSAL_NARROW_TRANSFER_1',
          approvalRef: 'APPROVAL_BUYER_FINANCE_1',
          status: 'APPROVED' as const,
        };
      },
    },
    policy: {
      expectedIssuer: 'https://issuer.example.test',
      expectedAudience: 'authenticated',
      nowEpochSeconds: 1_000,
    },
    receiptPort: {
      async acceptOrRead(request) {
        input.receiptCalls.value += 1;
        return {
          source: 'DURABLE_FINAL_COMMAND_RECEIPT' as const,
          worldId: request.request.payload.worldId,
          commandId: request.request.payload.commandId,
          idempotencyKey: request.request.payload.idempotencyKey,
          commandFingerprint: `sha256:${'a'.repeat(64)}`,
          outcome: 'COMMITTED' as const,
          reasonCode: null,
          worldVersionAfter: '1',
          eventIds: ['EVENT_NARROW_TRANSFER_1'],
          recordedAtReal: '2026-09-23T00:00:00.000Z',
        };
      },
    },
    scopeReader: {
      async resolve() {
        return {
          authSubject: AUTH_SUBJECT,
          worldId: 'WORLD_TWO_COUNTRY',
          countryId: input.countryId ?? 'COUNTRY_SELLER',
          officeId: 'TRADE',
          capability: 'TRADE_TREASURY',
          authorizationVersion: 'AUTH_REVISION_1',
        };
      },
    },
    verifier: {
      async verify() {
        return {
          sub: AUTH_SUBJECT,
          iss: 'https://issuer.example.test',
          aud: 'authenticated',
          iat: 900,
          exp: 1_100,
        };
      },
    },
  });
}

async function post(
  path: string,
  body: unknown,
  authorization = 'Bearer token',
) {
  if (running === undefined) throw new Error('bridge is not running');
  return fetch(`${running.origin}${path}`, {
    method: 'POST',
    headers: {
      authorization,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('local nonproduction authenticated World HTTP bridge', () => {
  it('exposes no read or command behavior until server dependencies are bound', async () => {
    running = await startLocalNonproductionWorldHttpBridge({
      bridge: createLocalNonproductionWorldHttpBridge({
        environment: ENVIRONMENT,
      }),
    });

    const read = await post('/local/v1/world-read', {});
    const command = await post('/local/v1/narrow-transfer-command', {});

    await expect(read.json()).resolves.toEqual({
      availability: 'NOT_AVAILABLE',
      operation: 'READ_WORLD_PROJECTION',
      reason: 'SERVER_DEPENDENCIES_UNBOUND',
      service: 'world-api',
    });
    await expect(command.json()).resolves.toEqual({
      availability: 'NOT_AVAILABLE',
      operation: 'SUBMIT_NARROW_TRANSFER',
      reason: 'SERVER_DEPENDENCIES_UNBOUND',
      service: 'world-api',
    });
    expect(read.status).toBe(503);
    expect(command.status).toBe(503);
  });

  it('keeps read access HTTP-wired only through the injected authenticated handler', async () => {
    let seenAuthorization: unknown;
    running = await startLocalNonproductionWorldHttpBridge({
      bridge: createLocalNonproductionWorldHttpBridge({
        environment: ENVIRONMENT,
        readHandler: {
          async handle(input) {
            seenAuthorization = input.authorization;
            return {
              schemaVersion: WORLD_READ_API_SCHEMA_VERSION,
              requestId: REQUEST_ID,
              ok: false,
              error: {
                code: 'AUTHORIZATION_DENIED',
                message: 'test server scope denied',
                retryable: false,
              },
            } as const;
          },
        },
      }),
    });

    const response = await post('/local/v1/world-read', {
      schemaVersion: WORLD_READ_API_SCHEMA_VERSION,
      requestId: REQUEST_ID,
      operation: 'READ_WORLD_PROJECTION',
      payload: {
        worldId: 'WORLD_TWO_COUNTRY',
        classification: 'COUNTRY',
        scopeKey: 'COUNTRY_SELLER',
      },
    });

    expect(response.status).toBe(403);
    expect(seenAuthorization).toBe('Bearer token');
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'AUTHORIZATION_DENIED' },
      ok: false,
    });
  });

  it('requires current server scope and Buyer Finance approval before it delegates to the durable receipt port', async () => {
    const receiptCalls = { value: 0 };
    running = await startLocalNonproductionWorldHttpBridge({
      bridge: createLocalNonproductionWorldHttpBridge({
        commandHandler: commandHandler({
          approval: 'APPROVED',
          countryId: 'COUNTRY_SELLER',
          receiptCalls,
        }),
        environment: ENVIRONMENT,
      }),
    });

    const crossScope = await post(
      '/local/v1/narrow-transfer-command',
      commandRequest({ countryId: 'COUNTRY_BUYER' }),
    );
    expect(crossScope.status).toBe(403);
    expect(receiptCalls.value).toBe(0);

    await running.shutdown();
    running = await startLocalNonproductionWorldHttpBridge({
      bridge: createLocalNonproductionWorldHttpBridge({
        commandHandler: commandHandler({
          approval: 'MISSING',
          receiptCalls,
        }),
        environment: ENVIRONMENT,
      }),
    });
    const missingBuyerFinance = await post(
      '/local/v1/narrow-transfer-command',
      commandRequest(),
    );
    expect(missingBuyerFinance.status).toBe(403);
    expect(receiptCalls.value).toBe(0);
  });

  it('does not cache command responses and exposes only a receipt returned by the durable port', async () => {
    const receiptCalls = { value: 0 };
    running = await startLocalNonproductionWorldHttpBridge({
      bridge: createLocalNonproductionWorldHttpBridge({
        commandHandler: commandHandler({ approval: 'APPROVED', receiptCalls }),
        environment: ENVIRONMENT,
      }),
    });

    const [first, retry] = await Promise.all([
      post('/local/v1/narrow-transfer-command', commandRequest()),
      post('/local/v1/narrow-transfer-command', commandRequest()),
    ]);

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(receiptCalls.value).toBe(2);
    await expect(first.json()).resolves.toMatchObject({
      ok: true,
      receipt: {
        source: 'DURABLE_FINAL_COMMAND_RECEIPT',
        commandId: 'COMMAND_NARROW_TRANSFER_1',
        idempotencyKey: 'IDEMPOTENCY_NARROW_TRANSFER_1',
      },
    });
  });

  it('rejects production, Supabase-bearing and non-loopback bridge configuration', () => {
    expect(() =>
      createLocalNonproductionWorldHttpBridge({
        environment: { ECONMIND_ENV: 'production' },
      }),
    ).toThrow('ECONMIND_ENV must be local or ci');
    expect(() =>
      createLocalNonproductionWorldHttpBridge({
        environment: {
          ECONMIND_ENV: 'local',
          SUPABASE_URL: 'https://example.supabase.co',
        },
      }),
    ).toThrow('SUPABASE_URL must be absent');
    expect(() =>
      createLocalNonproductionWorldHttpBridge({
        bindHost: '0.0.0.0' as '127.0.0.1',
        environment: ENVIRONMENT,
      }),
    ).toThrow('bindHost must be a loopback host');
  });
});
