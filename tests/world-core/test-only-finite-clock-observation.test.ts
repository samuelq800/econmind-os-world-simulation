import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalSerialize } from '@econmind/core';
import {
  prepareTestOnlyFiniteClockPublication,
  createTestOnlyFiniteClockObservationBridge,
} from '../support/test-only-finite-clock-observation.js';
import { createUnregisteredDurableWorldClock } from '../../apps/world-worker/src/time/durable-world-clock.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const scope = {
  worldId: 'WORLD_TEST_OBSERVATION',
  workerId: 'WORKER_TEST',
  oldRegistrationRef: 'EXECUTION_BEFORE',
  fencingToken: '2',
  worldVersion: '6',
  eventSequence: '6',
  observationRef: 'CLOCK_OBSERVATION_' + 'A'.repeat(32),
};
const clock = {
  schemaVersion: 'world-clock-original-v1',
  worldId: scope.worldId,
  seedFingerprint: 'sha256:' + '1'.repeat(64),
  sourceRef: 'CLOCK_BEFORE',
  clockVersion: 'SIMULATION_CLOCK_V1',
  simTime: '0',
  issuerRef: 'TEST_ONLY',
  provenanceRef: 'TEST_ONLY_FROZEN',
};
const control = {
  schemaVersion: 'world-execution-control-original-v1',
  worldId: scope.worldId,
  seedFingerprint: clock.seedFingerprint,
  sourceRef: 'CONTROL_BEFORE',
  controlMode: 'MANUAL_FINITE',
  soleConsumerRef: 'CONSUMER',
  workerId: scope.workerId,
  consumerRole: 'restricted_test_worker',
  validFromReal: '2026-11-16T00:00:00.000Z',
  validUntilReal: '2026-11-16T01:00:00.000Z',
  issuerRef: 'TEST_ONLY',
  provenanceRef: 'TEST_ONLY',
};
const previous = {
  schemaVersion: 'world-command-execution-registration-v1',
  registrationRef: scope.oldRegistrationRef,
  worldId: scope.worldId,
  workerId: scope.workerId,
  seedId: 'SEED_TEST',
  seedFingerprint: clock.seedFingerprint,
  admissionRef: 'ADMISSION_TEST',
  modelVersion: 'TEST_MODEL',
  consumerRole: control.consumerRole,
  controlMode: 'MANUAL_FINITE',
  clockSourceRef: clock.sourceRef,
  clockSourceSha256: sha(canonicalSerialize(clock)),
  controlSourceRef: control.sourceRef,
  controlSourceSha256: sha(canonicalSerialize(control)),
  soleConsumerRef: control.soleConsumerRef,
  clockVersion: clock.clockVersion,
  simTime: clock.simTime,
  validFromReal: control.validFromReal,
  validUntilReal: control.validUntilReal,
};
const observation = {
  schemaVersion: 'test-only-finite-clock-observation-v1',
  classification: 'TEST_ONLY_ACTUAL_POSTGRES_OBSERVATION_NOT_PRODUCTION',
  worldId: scope.worldId,
  workerId: scope.workerId,
  fencingToken: scope.fencingToken,
  worldVersion: scope.worldVersion,
  eventSequence: scope.eventSequence,
  observationRef: scope.observationRef,
  clockVersion: 'SIMULATION_CLOCK_V1',
  startedRealMilliseconds: '1000',
  finishedRealMilliseconds: '1120',
  activeRealMilliseconds: '120',
  previousRegistrationText: canonicalSerialize(previous),
  previousClockText: canonicalSerialize(clock),
  previousControlText: canonicalSerialize(control),
};
function input(changes: Record<string, unknown> = {}) {
  const observationText = JSON.stringify({ ...observation, ...changes });
  return { scope, observationText, observationSha256: sha(observationText) };
}
describe('one-shot measured finite Clock preparation, no database or actual observation', () => {
  it('uses Core ten ticks per actual millisecond without a target time and preserves existing scope/control', () => {
    const p = prepareTestOnlyFiniteClockPublication(input());
    expect(p.registration.simTime).toBe('1200');
    expect(p.activeRealMilliseconds).toBe('120');
    expect(p.registration.controlSourceSha256).toBe(
      previous.controlSourceSha256,
    );
    expect(p.registration.validUntilReal).toBe(previous.validUntilReal);
    expect(p.registration.registrationRef).toBe(
      'EXECUTION_OBSERVED_' + 'A'.repeat(32),
    );
    expect(JSON.parse(p.clockText).provenanceRef).toContain(
      input().observationSha256.toUpperCase(),
    );
    expect(previous.simTime).toBe('0');
  });
  it.each([
    { finishedRealMilliseconds: '999', activeRealMilliseconds: '-1' },
    { finishedRealMilliseconds: '1111', activeRealMilliseconds: '111' },
    { finishedRealMilliseconds: '7000', activeRealMilliseconds: '6000' },
    { activeRealMilliseconds: '121' },
    { worldId: 'WORLD_OTHER' },
    { fencingToken: '3' },
    { worldVersion: '7' },
    { clockVersion: 'UNKNOWN' },
    { targetSimTime: '1115' },
  ])(
    'refuses regression, short/unbounded duration, scope drift and extra target %j',
    (changes) => {
      expect(() =>
        prepareTestOnlyFiniteClockPublication(input(changes)),
      ).toThrow();
    },
  );
  it('refuses changed old source and rejects crossing the adopted first day', () => {
    expect(() =>
      prepareTestOnlyFiniteClockPublication(
        input({
          previousClockText: canonicalSerialize({ ...clock, simTime: '1115' }),
        }),
      ),
    ).toThrow('PREDECESSOR');
    const c = canonicalSerialize({ ...clock, simTime: '86399999' }),
      p = canonicalSerialize({
        ...previous,
        simTime: '86399999',
        clockSourceSha256: sha(c),
      });
    expect(() =>
      prepareTestOnlyFiniteClockPublication(
        input({ previousClockText: c, previousRegistrationText: p }),
      ),
    ).toThrow('FIRST_DAY_BOUND');
  });
  it('keeps production factory denied without constructing timers or SQL', async () => {
    expect(await createUnregisteredDurableWorldClock().apply()).toMatchObject({
      status: 'DENIED',
      writes: 0,
    });
  });
  it('propagates unknown publication and requires explicit recovery; never retries/resamples', async () => {
    const calls: string[] = [];
    let committed = false;
    const p = prepareTestOnlyFiniteClockPublication(input());
    const db = {
      query: async () => {
        throw Error('unexpected outside transaction');
      },
      transaction: async (fn: Parameters<SqlDatabase['transaction']>[0]) =>
        fn({
          query: async (q: string) => {
            calls.push(q);
            if (q.startsWith('set local')) return { rows: [], rowCount: 0 };
            if (q.includes('publish_test_only')) {
              committed = true;
              throw Error('COMMIT_ACK_UNKNOWN');
            }
            if (q.includes('recover_test_only'))
              return {
                rows: [
                  {
                    observation_text: p.observationText,
                    observation_sha256: p.observationSha256,
                    published_registration_text: committed
                      ? p.registrationText
                      : null,
                  },
                ],
                rowCount: 1,
              };
            throw Error('unexpected observation/resubmit');
          },
        } as unknown as SqlExecutor),
    } as unknown as SqlDatabase;
    const b = createTestOnlyFiniteClockObservationBridge(db, scope);
    await expect(b.publish(p)).rejects.toThrow('COMMIT_ACK_UNKNOWN');
    const r = await b.recover();
    expect(r.status).toBe('PUBLISHED');
    expect(calls.filter((q) => q.includes('publish_test_only'))).toHaveLength(
      1,
    );
    expect(calls.some((q) => q.includes('observe_test_only'))).toBe(false);
    await expect(
      b.publish({ ...p, registrationText: 'forged' }),
    ).rejects.toThrow('PUBLICATION_CHANGED');
  });
});
