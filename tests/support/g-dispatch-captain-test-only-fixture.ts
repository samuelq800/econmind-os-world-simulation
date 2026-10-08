// TEST_ONLY builders derived from existing fixed Core fixtures. No official genesis, readiness or runtime admission.
import { createHash } from 'node:crypto';
import {
  CAPTAIN_POLITICAL_CAPITAL_COMMAND,
  CAPTAIN_POLITICAL_CAPITAL_PAYLOAD_SCHEMA,
  COMMAND_SCHEMA_VERSION,
  POLITICAL_CAPITAL_BUCKETS,
  captainPoliticalCapitalSourceHash,
  createFoundationFact,
  parseCanonicalCommand,
  type CanonicalCommand,
  type CaptainPoliticalCapitalSourceSnapshot,
  type FoundationTraceRequest,
} from '@econmind/core';
const digest = (text: string) =>
  createHash('sha256').update(text).digest('hex');
const WORLD = 'WORLD_TEST_ONLY_CAP_ADAPTER_01';
const COUNTRY = 'COUNTRY_01';
const SUBJECT = '11111111-1111-4111-8111-111111111111';
const q = (amount: string) => ({ amount, unit: 'political_capital' });
const payload = {
  schemaVersion: CAPTAIN_POLITICAL_CAPITAL_PAYLOAD_SCHEMA,
  fromBucket: 'FISCAL_REFORM',
  toBucket: 'INDUSTRIAL_STRATEGY',
  amount: q('2.75'),
  reasonFactRef: 'FACT.TEST_ONLY.ADAPTER.REASON',
};
export function captainTestOnlyCommand(
  overrides: Record<string, unknown> = {},
): CanonicalCommand {
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandId: 'COMMAND_TEST_ONLY_ADAPTER_01',
      commandType: CAPTAIN_POLITICAL_CAPITAL_COMMAND,
      actorId: 'ACTOR_TEST_ONLY_ADAPTER_01',
      authSubject: SUBJECT,
      correlationId: 'CORRELATION_TEST_ONLY_ADAPTER_01',
      worldId: WORLD,
      countryId: COUNTRY,
      officeId: 'CAPTAIN',
      expectedWorldVersion: '0',
      idempotencyKey: 'IDEM_TEST_ONLY_ADAPTER_01',
      simTime: '16000',
      submittedAtReal: '2026-10-08T00:00:00.000Z',
      payload,
      ...overrides,
    },
    digest,
  );
}

/** Actual explicit TEST_ONLY quantities and reason, not an official/admitted genesis issuer. */
export function captainTestOnlySnapshot(): CaptainPoliticalCapitalSourceSnapshot {
  const capital = {
    capitalRef: 'CAPITAL.TEST_ONLY.ADAPTER',
    countryRef: COUNTRY,
    opening: q('35'),
    generated: q('7'),
    total: q('42'),
    available: q('38'),
    spent: q('4'),
    closing: q('38'),
    buckets: POLITICAL_CAPITAL_BUCKETS.map((bucket, i) => ({
      bucket,
      balance: q(['11.5', '6.25', '4', '5', '3', '2', '6.25'][i]!),
    })),
  };
  const reason = {
    countryRef: COUNTRY,
    recordRef: 'CABINET.TEST_ONLY.ADAPTER.RECORD',
    reason: 'TEST_ONLY existing support reallocation record.',
  };
  const trace: FoundationTraceRequest = {
    traceRef: 'TRACE.TEST_ONLY.ADAPTER',
    calculationVersion: 'CAP_ADAPTER_TEST_ONLY.1',
    snapshot: {
      lineageRef: WORLD,
      sourceVersion: 'WORLD_VERSION_0',
      snapshotRef: 'SNAPSHOT.TEST_ONLY.ADAPTER',
      snapshotHash: 'a'.repeat(64),
      predecessorSnapshotHash: 'b'.repeat(64),
    },
    snapshotAt: { amount: '16000', unit: 'sim_millisecond' },
  };
  const facts = (t: FoundationTraceRequest) => ({
    capitalFact: createFoundationFact({
      trace: t,
      factRef: 'FACT.TEST_ONLY.ADAPTER.CAPITAL',
      sourceRef: 'SOURCE.TEST_ONLY.OPERATING.CAPITAL',
      predecessorFactRefs: ['TEST_ONLY.OPERATING.PREDECESSOR'],
      payload: capital,
    }),
    reasonFact: createFoundationFact({
      trace: t,
      factRef: payload.reasonFactRef,
      sourceRef: 'SOURCE.TEST_ONLY.CABINET.RECORD',
      predecessorFactRefs: ['TEST_ONLY.REASON.PREDECESSOR'],
      payload: reason,
    }),
  });
  const scope = {
    worldId: WORLD,
    countryId: COUNTRY,
    worldVersion: '0',
    lastEventSequence: '0',
  };
  const bound = {
    ...trace,
    snapshot: {
      ...trace.snapshot,
      snapshotHash: captainPoliticalCapitalSourceHash(
        { ...scope, ...facts(trace) },
        digest,
      ),
    },
  };
  return { ...scope, trace: bound, ...facts(bound) };
}
