/** Real, known Core economic calculations in a tiny TEST_ONLY world. These
 * originals are not official securities/capital, admission or source authority. */
import * as C from '../../packages/core/src/index.js';
import {
  prepareFinanceSocialReplayContinuation,
  readFinanceSocialReplayContinuation,
  type FinanceSocialReplayContinuation,
} from '../../packages/core/src/commands/finance-social-replay-continuation.js';
import type { FinanceNativeBudgetCanonicalFrame } from '../../packages/core/src/commands/finance-budget-native.js';
import { createFinanceSocialContinuationFixture } from './finance-social-continuation-fixture.js';
import { testOnlyCaptainOriginal } from './captain-finance-social-fixture.js';
import {
  mixedFxFrame,
  mixedSha as sha,
} from './finance-social-fx-replay-fixture.js';
const at = '2026-10-29T00:00:00.000Z';
function captainFrame(
  cursor: FinanceSocialReplayContinuation,
  identity: string,
): FinanceNativeBudgetCanonicalFrame {
  const current = readFinanceSocialReplayContinuation(cursor),
    country = current.result.captainCountries?.find(
      (c) => c.countryId === 'COUNTRY_01',
    );
  if (
    !country ||
    country.state.worldVersion !== current.head.worldVersion ||
    country.state.lastEventSequence !== current.head.eventSequence
  )
    throw Error('REAL_CURRENT_CAPTAIN_CURSOR_REQUIRED');
  const state = country.state,
    world = current.worldId;
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      worldId: world,
      countryId: 'COUNTRY_01',
      officeId: 'CAPTAIN',
      actorId: 'ACTOR_TEST_ONLY_CAPACITY',
      authSubject: '11111111-1111-4111-8111-111111111111',
      commandType: C.CAPTAIN_POLITICAL_CAPITAL_COMMAND,
      commandId: 'COMMAND_CAPACITY_CAPTAIN_' + identity,
      idempotencyKey: 'KEY_CAPACITY_CAPTAIN_' + identity,
      expectedWorldVersion: current.head.worldVersion,
      simTime: '1',
      correlationId: 'CORRELATION_CAPACITY_' + identity,
      submittedAtReal: at,
      payload: {
        schemaVersion: C.CAPTAIN_POLITICAL_CAPITAL_PAYLOAD_SCHEMA,
        fromBucket: 'FISCAL_REFORM',
        toBucket: 'INDUSTRIAL_STRATEGY',
        amount: { amount: '2', unit: 'political_capital' },
        reasonFactRef: 'REASON_TEST_ONLY_COUNTRY_01',
      },
    },
    sha,
  );
  const trace: C.FoundationTraceRequest = {
    traceRef: 'TRACE_CAPACITY_' + identity,
    calculationVersion: 'CAPTAIN_TEST_ONLY_V1',
    snapshot: {
      lineageRef: world,
      sourceVersion: 'WORLD_VERSION_' + current.head.worldVersion,
      snapshotRef: 'SNAPSHOT_CAPACITY_' + identity,
      snapshotHash: '0'.repeat(64),
      predecessorSnapshotHash: null,
    },
    snapshotAt: { amount: '1', unit: 'sim_millisecond' },
  };
  const facts = (t: C.FoundationTraceRequest) => ({
    capitalFact: C.createFoundationFact({
      trace: t,
      factRef: 'CAPACITY_CAPITAL_' + identity,
      sourceRef: 'CAPTAIN_SOURCE_TEST_ONLY',
      predecessorFactRefs: ['GENESIS_TEST_ONLY_COUNTRY_01'],
      payload: state.capital,
    }),
    reasonFact: C.createFoundationFact({
      trace: t,
      factRef: 'REASON_TEST_ONLY_COUNTRY_01',
      sourceRef: 'REASON_SOURCE_TEST_ONLY',
      predecessorFactRefs: ['REASON_ORIGINAL_TEST_ONLY_COUNTRY_01'],
      payload: {
        countryRef: 'COUNTRY_01',
        recordRef: 'RECORD_TEST_ONLY_COUNTRY_01',
        reason:
          'TEST_ONLY transfer from original existing capital; no generation',
      },
    }),
  });
  const scope = {
      worldId: world,
      countryId: 'COUNTRY_01',
      worldVersion: current.head.worldVersion,
      lastEventSequence: current.head.eventSequence,
    },
    bound = {
      ...trace,
      snapshot: {
        ...trace.snapshot,
        snapshotHash: C.captainPoliticalCapitalSourceHash(
          { ...scope, ...facts(trace) },
          sha,
        ),
      },
    },
    source = { ...scope, trace: bound, ...facts(bound) },
    prepared = C.prepareCaptainPoliticalCapitalEvent({
      command,
      source,
      eventId: 'EVENT_CAPACITY_CAPTAIN_' + identity,
      recordedAtReal: at,
      sha256Hex: sha,
    }),
    transition = C.createAuthoritativeTransition({
      command,
      worldVersionBefore: current.head.worldVersion,
      worldVersionAfter: prepared.event.worldVersion,
      events: [prepared.event],
    }),
    receipt = C.createFinalCommandReceipt({
      command,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: command.simTime,
      recordedAtReal: at,
    });
  return {
    command,
    transition,
    receipt,
    events: [prepared.event],
    financialPostingBatches: [],
    inventoryPostings: [],
  };
}
export async function createPagedCaptainBudgetCapacityFrames() {
  const f = createFinanceSocialContinuationFixture(),
    captain = testOnlyCaptainOriginal(),
    expectedHead = { worldVersion: '260', eventSequence: '262' };
  let cursor = prepareFinanceSocialReplayContinuation(
    {
      opening: f.opening,
      socialCountries: [f.social],
      captainCountries: [captain],
      openingEncumbrances: f.openingEncumbrances,
      fxOriginals: f.fxOriginals,
      expectedHead,
    },
    sha,
  );
  const frames: FinanceNativeBudgetCanonicalFrame[] = [];
  const append = (frame: FinanceNativeBudgetCanonicalFrame) => {
    cursor = f.append(cursor, [frame]);
    frames.push(frame);
  };
  append(captainFrame(cursor, 'FIRST'));
  append(
    await mixedFxFrame({
      financial:
        readFinanceSocialReplayContinuation(cursor).result.financialState!,
      original: f.f,
      sequence: '2',
      identity: 'CAPACITY_FX',
      treasuryReservedAmount: '200',
    }),
  );
  for (let i = 0; i < 256; i++)
    append(await f.budget(cursor, 'CAPACITY_' + i.toString().padStart(3, '0')));
  append(
    await f.budget(cursor, 'CAPACITY_LINE', 'APPROVE_NEW_LINE', 'CAPACITY_255'),
  );
  append(captainFrame(cursor, 'LAST'));
  const final = readFinanceSocialReplayContinuation(cursor);
  if (
    final.head.worldVersion !== expectedHead.worldVersion ||
    final.head.eventSequence !== expectedHead.eventSequence
  )
    throw Error('EXACT_CORE_CAPACITY_HEAD_REQUIRED');
  return {
    seed: f.f.seed,
    captain,
    frames,
    final,
    expectedHead,
    sourceMetadata: f.f.seed.sources.map((s) => ({
      sourceId: s.sourceId,
      payloadHash: s.payloadHash,
    })),
    serializedFrames: C.canonicalSerialize(frames),
    serializedSeed: C.canonicalSerialize(f.f.seed),
    pages: [frames.slice(0, 256), frames.slice(256)],
    classification:
      'TEST_ONLY_REAL_CORE_257_BUDGET_2_CAPTAIN_1_FX_NOT_OFFICIAL_ADMISSION' as const,
  };
}
