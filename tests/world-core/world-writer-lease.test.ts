import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  SimTime,
  acquireWorldWriterLease,
  assertWorldWriterCanCommit,
  createWorldWriterCommitAssertion,
  isWorldWriterLease,
  parseWorldWriterLease,
  workerId,
  worldId,
  worldWriterLeaseRequest,
  type WorldWriterCommitAssertion,
  type WorldWriterLease,
} from '../../packages/core/src/index.js';

const AT_0 = '2026-09-11T00:00:00.000Z';
const AT_HALF_SECOND = '2026-09-11T00:00:00.500Z';
const AT_1_SECOND = '2026-09-11T00:00:01.000Z';
const AT_2_SECONDS = '2026-09-11T00:00:02.000Z';
const AT_3_SECONDS = '2026-09-11T00:00:03.000Z';

function request(
  holder: 'WORKER_1' | 'WORKER_2',
  observedAtReal: string,
  expiresAtReal: string,
  world = 'WORLD_1',
) {
  return worldWriterLeaseRequest(
    worldId(world),
    workerId(holder),
    observedAtReal,
    expiresAtReal,
  );
}

describe('V09.1 single-World writer lease domain boundary', () => {
  it('issues one initial fence and renews without recycling or reducing it', () => {
    const acquired = acquireWorldWriterLease(
      null,
      request('WORKER_1', AT_0, AT_1_SECOND),
    );
    const renewed = acquireWorldWriterLease(
      acquired.lease,
      request('WORKER_1', AT_HALF_SECOND, AT_2_SECONDS),
    );

    expect(acquired).toMatchObject({
      kind: 'ACQUIRED',
      lease: {
        acquiredAtReal: AT_0,
        expiresAtReal: AT_1_SECOND,
        fencingToken: '1',
        holderId: 'WORKER_1',
        renewedAtReal: AT_0,
        worldId: 'WORLD_1',
      },
    });
    expect(renewed).toMatchObject({
      kind: 'RENEWED',
      lease: {
        acquiredAtReal: AT_0,
        expiresAtReal: AT_2_SECONDS,
        fencingToken: '1',
        renewedAtReal: AT_HALF_SECOND,
      },
    });
    expect(Object.isFrozen(acquired.lease)).toBe(true);
    expect(isWorldWriterLease(renewed.lease)).toBe(true);
  });

  it('rejects an active competing Worker and preserves per-World isolation', () => {
    const first = acquireWorldWriterLease(
      null,
      request('WORKER_1', AT_0, AT_1_SECOND),
    );
    expect(() =>
      acquireWorldWriterLease(
        first.lease,
        request('WORKER_2', AT_HALF_SECOND, AT_2_SECONDS),
      ),
    ).toThrowError(
      expect.objectContaining({ code: DOMAIN_ERROR_CODES.WRITER_LEASE_HELD }),
    );

    const secondWorld = acquireWorldWriterLease(
      null,
      request('WORKER_2', AT_HALF_SECOND, AT_2_SECONDS, 'WORLD_2'),
    );
    expect(secondWorld.lease).toMatchObject({
      fencingToken: '1',
      holderId: 'WORKER_2',
      worldId: 'WORLD_2',
    });
  });

  it('fences an expired or superseded writer and independently rejects stale WorldVersion', () => {
    const initial = acquireWorldWriterLease(
      null,
      request('WORKER_1', AT_0, AT_1_SECOND),
    );
    const oldAssertion = createWorldWriterCommitAssertion(initial.lease, '4');
    const takeover = acquireWorldWriterLease(
      initial.lease,
      request('WORKER_2', AT_1_SECOND, AT_3_SECONDS),
    );
    const currentAssertion = createWorldWriterCommitAssertion(
      takeover.lease,
      '4',
    );

    expect(takeover).toMatchObject({
      kind: 'TAKEN_OVER',
      lease: { fencingToken: '2', holderId: 'WORKER_2' },
    });
    expect(() =>
      assertWorldWriterCanCommit(
        takeover.lease,
        oldAssertion,
        AT_1_SECOND,
        '4',
      ),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.WRITER_FENCE_STALE,
      }),
    );
    expect(() =>
      assertWorldWriterCanCommit(initial.lease, oldAssertion, AT_1_SECOND, '4'),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.WRITER_LEASE_EXPIRED,
      }),
    );
    expect(() =>
      assertWorldWriterCanCommit(
        takeover.lease,
        currentAssertion,
        AT_1_SECOND,
        '3',
      ),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.WORLD_VERSION_MISMATCH,
      }),
    );
    expect(() =>
      assertWorldWriterCanCommit(
        takeover.lease,
        currentAssertion,
        AT_3_SECONDS,
        '4',
      ),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.WRITER_LEASE_EXPIRED,
      }),
    );
  });

  it('accepts only inert canonical prior records and rejects forged lease or commit facts', () => {
    const restored = parseWorldWriterLease({
      acquiredAtReal: AT_0,
      expiresAtReal: AT_1_SECOND,
      fencingToken: '9',
      holderId: 'WORKER_1',
      renewedAtReal: AT_HALF_SECOND,
      schemaVersion: 'world-writer-lease-v1',
      worldId: 'WORLD_1',
    });
    expect(restored).toMatchObject({ fencingToken: '9', holderId: 'WORKER_1' });
    expect(() =>
      parseWorldWriterLease({
        acquiredAtReal: AT_0,
        expiresAtReal: AT_1_SECOND,
        fencingToken: '9',
        holderId: 'WORKER_1',
        ignored: true,
        renewedAtReal: AT_HALF_SECOND,
        schemaVersion: 'world-writer-lease-v1',
        worldId: 'WORLD_1',
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.WRITER_LEASE_INVALID,
      }),
    );

    expect(() =>
      parseWorldWriterLease({
        acquiredAtReal: AT_0,
        expiresAtReal: AT_1_SECOND,
        fencingToken: '9223372036854775808',
        holderId: 'WORKER_1',
        renewedAtReal: AT_HALF_SECOND,
        schemaVersion: 'world-writer-lease-v1',
        worldId: 'WORLD_1',
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.WRITER_LEASE_INVALID,
      }),
    );

    const forgedLease = {
      ...restored,
      fencingToken: '10',
    } as WorldWriterLease;
    expect(() =>
      acquireWorldWriterLease(
        forgedLease,
        request('WORKER_1', AT_HALF_SECOND, AT_2_SECONDS),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.WRITER_LEASE_INVALID,
      }),
    );

    const legitimateAssertion = createWorldWriterCommitAssertion(restored, '0');
    const forgedAssertion = {
      ...legitimateAssertion,
      fencingToken: '10',
    } as WorldWriterCommitAssertion;
    expect(() =>
      assertWorldWriterCanCommit(
        restored,
        forgedAssertion,
        AT_HALF_SECOND,
        '0',
      ),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.WRITER_LEASE_INVALID,
      }),
    );
  });

  it('uses operational liveness without changing SimTime or replay input', () => {
    const before = SimTime.fromTicks('10000');
    const acquired = acquireWorldWriterLease(
      null,
      request('WORKER_1', AT_0, AT_1_SECOND),
    );
    const assertion = createWorldWriterCommitAssertion(acquired.lease, '0');

    assertWorldWriterCanCommit(acquired.lease, assertion, AT_HALF_SECOND, '0');
    expect(before.toCanonicalValue()).toBe('10000');
  });
});
