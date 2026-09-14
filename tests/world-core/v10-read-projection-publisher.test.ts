import { describe, expect, it } from 'vitest';

import { WorldReadProjectionPublisher } from '../../apps/world-worker/src/index.js';

describe('V10.1 retired generic read-projection publisher', () => {
  it('fails before beginning a database transaction for every caller-supplied party payload', async () => {
    let transactionCalls = 0;
    const publisher = new WorldReadProjectionPublisher({
      database: {
        async transaction() {
          transactionCalls += 1;
          throw new Error('DATABASE_MUST_NOT_BE_REACHED');
        },
      } as never,
      workerId: 'WORKER_V10_RETIRED_GENERIC_TEST',
    });

    await expect(
      publisher.replace({
        assertion: {} as never,
        observedAtReal: '2026-09-14T00:00:00.000Z',
        projections: [
          {
            classification: 'NEGOTIATION_PARTY',
            scopeKey: 'PARTY_CALLER_SUPPLIED',
            payload: { callerSupplied: true },
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'TRANSITION_EVIDENCE_INVALID' });
    expect(transactionCalls).toBe(0);
  });
});
