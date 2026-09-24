import { describe, expect, it } from 'vitest';

import {
  createLocalTrustedPostgresReadExecutor,
  parseSupabaseAuthSubject,
  WORLD_V2_ENTITLED_PROJECTION_QUERY,
  type ParameterizedPgReadRequest,
} from '../../apps/world-api/src/index.js';

const SUBJECT = parseSupabaseAuthSubject(
  '550e8400-e29b-41d4-a716-446655440351',
);

describe('local trusted PostgreSQL read binding', () => {
  it('sets only a handler-attached verified subject in a transaction-local RLS GUC', async () => {
    const calls: Array<readonly [string, readonly unknown[] | undefined]> = [];
    const executor = createLocalTrustedPostgresReadExecutor({
      pool: {
        async connect() {
          return {
            async query(text: string, values?: readonly unknown[]) {
              calls.push([text, values]);
              if (text === WORLD_V2_ENTITLED_PROJECTION_QUERY) {
                return { rows: [{ world_id: 'WORLD_ALPHA' }] };
              }
              return { rows: [] };
            },
            release() {},
          };
        },
      } as never,
    });
    const request: ParameterizedPgReadRequest = {
      text: WORLD_V2_ENTITLED_PROJECTION_QUERY,
      values: [SUBJECT, 'WORLD_ALPHA', 'COUNTRY', 'COUNTRY_ALPHA', '0', '0'],
      verifiedAuthSubject: SUBJECT,
    };

    await expect(executor.query(request)).resolves.toEqual({
      rows: [{ world_id: 'WORLD_ALPHA' }],
    });
    expect(calls).toEqual([
      ['begin', undefined],
      ["select set_config('request.jwt.claim.sub', $1, true)", [SUBJECT]],
      [WORLD_V2_ENTITLED_PROJECTION_QUERY, request.values],
      ['commit', undefined],
    ]);
  });

  it('refuses an unverified or mismatched subject before it can open a database connection', async () => {
    let connections = 0;
    const executor = createLocalTrustedPostgresReadExecutor({
      pool: {
        async connect() {
          connections += 1;
          throw new Error('connection must not be opened');
        },
      } as never,
    });
    const base = {
      text: WORLD_V2_ENTITLED_PROJECTION_QUERY,
      values: [SUBJECT, 'WORLD_ALPHA', 'COUNTRY', 'COUNTRY_ALPHA', '0', '0'],
    } as const;

    await expect(executor.query(base)).rejects.toThrow(
      'verified server JWT subject is required',
    );
    await expect(
      executor.query({
        ...base,
        verifiedAuthSubject: parseSupabaseAuthSubject(
          '550e8400-e29b-41d4-a716-446655440352',
        ),
      }),
    ).rejects.toThrow('query subject does not match the verified server JWT');
    expect(connections).toBe(0);
  });
});
