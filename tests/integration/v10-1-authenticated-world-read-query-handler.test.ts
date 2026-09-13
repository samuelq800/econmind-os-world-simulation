import { describe, expect, it } from 'vitest';

import {
  createAuthenticatedWorldReadQueryHandler,
  createWorldReadRequest,
  type ParameterizedPgReadExecutor,
} from '../../apps/world-api/src/index.js';
import { createV101AuthorizationProjectionFixture } from '../support/v101-authorization-projection-fixture.js';

const policy = {
  jwt: {
    expectedIssuer: 'https://issuer.example.test',
    expectedAudience: 'world-api',
    nowEpochSeconds: 1_800_000_000,
  },
  timeoutMs: 25,
} as const;

function verifiedClaims(subject: string) {
  return {
    sub: subject,
    iss: policy.jwt.expectedIssuer,
    aud: policy.jwt.expectedAudience,
    iat: 1_799_999_000,
    exp: 1_800_001_000,
  };
}

function row(input: {
  readonly classification: 'COUNTRY' | 'NEGOTIATION_PARTY';
  readonly scopeKey: string;
  readonly payload: object;
}) {
  return {
    world_id: 'WORLD_TRANSFER_TEST',
    classification: input.classification,
    scope_key: input.scopeKey,
    schema_version: 'world-projection-read-v1',
    world_version: '0',
    event_sequence: '0',
    payload: input.payload,
    generated_at: '2026-09-13T00:00:00.000Z',
  };
}

describe('V10.1 authenticated World read query handler', () => {
  it('serves a fixture-derived Country projection only after server verification', async () => {
    const fixture = createV101AuthorizationProjectionFixture();
    const scopeKey = fixture.authoritative.countries[0]!.countryId;
    const calls: readonly string[][] = [];
    const executor: ParameterizedPgReadExecutor = {
      async query(query) {
        (calls as string[][]).push([...query.values]);
        return {
          rows: [
            row({
              classification: 'COUNTRY',
              scopeKey,
              payload: {
                fixtureStatus: fixture.authoritative.fixtureStatus,
                countryId: scopeKey,
              },
            }),
          ],
        };
      },
    };
    const handler = createAuthenticatedWorldReadQueryHandler({
      executor,
      policy,
      verifier: {
        async verify() {
          return verifiedClaims(fixture.principals.sellerTrade.authSubject);
        },
      },
    });

    await expect(
      handler.handle({
        authorization: 'Bearer opaque-untrusted-token',
        request: createWorldReadRequest({
          requestId: '123e4567-e89b-42d3-a456-426614174111',
          worldId: fixture.authoritative.watermark.worldId,
          classification: 'COUNTRY',
          scopeKey,
        }),
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        classification: 'COUNTRY',
        scopeKey,
        watermark: { worldVersion: '0', eventSequence: '0' },
      },
    });
    expect(calls).toEqual([
      [
        fixture.principals.sellerTrade.authSubject,
        fixture.authoritative.watermark.worldId,
        'COUNTRY',
        scopeKey,
        '0',
        '0',
      ],
    ]);
  });

  it('supports an entitled negotiation-party read through the same query boundary', async () => {
    const fixture = createV101AuthorizationProjectionFixture();
    const scopeKey = fixture.authoritative.negotiationParties[0]!.partyId;
    const handler = createAuthenticatedWorldReadQueryHandler({
      executor: {
        async query() {
          return {
            rows: [
              row({
                classification: 'NEGOTIATION_PARTY',
                scopeKey,
                payload: { partyId: scopeKey },
              }),
            ],
          };
        },
      },
      policy,
      verifier: {
        async verify() {
          return verifiedClaims(fixture.principals.sellerTrade.authSubject);
        },
      },
    });

    await expect(
      handler.handle({
        authorization: 'Bearer opaque-untrusted-token',
        request: createWorldReadRequest({
          requestId: '123e4567-e89b-42d3-a456-426614174112',
          worldId: fixture.authoritative.watermark.worldId,
          classification: 'NEGOTIATION_PARTY',
          scopeKey,
        }),
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { classification: 'NEGOTIATION_PARTY', scopeKey },
    });
  });

  it('returns a redacted error response without querying for a forged identity', async () => {
    let queries = 0;
    const handler = createAuthenticatedWorldReadQueryHandler({
      executor: {
        async query() {
          queries += 1;
          return { rows: [] };
        },
      },
      policy,
      verifier: {
        async verify() {
          throw new Error('signature details must not escape');
        },
      },
    });
    const request = createWorldReadRequest({
      requestId: '123e4567-e89b-42d3-a456-426614174113',
      worldId: 'WORLD_TRANSFER_TEST',
      classification: 'COUNTRY',
      scopeKey: 'COUNTRY_SELLER_TEST',
    });

    await expect(
      handler.handle({
        authorization: 'Bearer forged-token',
        request,
      }),
    ).resolves.toEqual({
      schemaVersion: 'world-read-api-v1',
      requestId: request.requestId,
      ok: false,
      error: {
        code: 'AUTHENTICATION_INVALID',
        message: 'Bearer authentication is invalid',
        retryable: false,
      },
    });
    expect(queries).toBe(0);
  });

  it('does not disclose whether an absent projection was unauthorized or stale', async () => {
    const handler = createAuthenticatedWorldReadQueryHandler({
      executor: {
        async query() {
          return { rows: [] };
        },
      },
      policy,
      verifier: {
        async verify() {
          return verifiedClaims('123e4567-e89b-42d3-a456-426614174000');
        },
      },
    });
    await expect(
      handler.handle({
        authorization: 'Bearer opaque-untrusted-token',
        request: createWorldReadRequest({
          requestId: '123e4567-e89b-42d3-a456-426614174114',
          worldId: 'WORLD_TRANSFER_TEST',
          classification: 'COUNTRY',
          scopeKey: 'COUNTRY_SELLER_TEST',
        }),
        minimumWatermark: { worldVersion: '1', eventSequence: '0' },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'World projection is unavailable',
        retryable: false,
      },
    });
  });
});
