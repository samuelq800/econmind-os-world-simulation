// New mapper mechanism, not an admitted Industry source or production view.
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Money,
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createFinancialPostingBatch,
  createFinancialAccount,
  createProductionConsumptionPosting,
  parseOpeningSeed,
  parseCanonicalCommand,
  parseAuthoritativeEvent,
  financialPostingBatchId,
  financialPostingLegId,
  financialAccountId,
  inventoryPostingId,
  type ProductionConsumptionEvidence,
} from '@econmind/core';
import { canonicalSerialize as fixtureSerialize } from '../../packages/core/src/index.js';
import {
  createProductionSchemaFixture,
  createSchemaTransition,
} from '../support/production-schema-fixture.js';
import { evaluateIndustryProductionPrefixForTestOnly } from '../../apps/world-worker/src/projections/industry-production-source-port.js';
import { evaluateIndustryGoverningForTestOnly } from '../../apps/world-worker/src/projections/industry-production-governing-source.js';
import { evaluateIndustryDecisionProjectionForTestOnly as evaluate } from '../../apps/world-worker/src/projections/office-decision-result-projector.js';
import { assertDecisionResultPayload } from '../../apps/world-api/src/integration/office-decision-result-validator.js';

const sha = (v: string | Uint8Array) =>
  createHash('sha256').update(v).digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), sha);
const clone = <T>(v: T): T => JSON.parse(canonicalSerialize(v)) as T;
const PURPOSE = 'INDUSTRY_COMMITTED_PRODUCTION_OUTPUT_AFTER_ONLY';

/** Rehydrate the unchanged shared Core fixture into the actual package build.
 * Source TEST_FIXTURE classifications are preserved; no class-brand casts or
 * retagged genuine view. All Commands/Events/seed/postings are real constructors. */
function productionFixture() {
  const f = createProductionSchemaFixture(),
    source = f.make();
  const seed = parseOpeningSeed(
    JSON.parse(fixtureSerialize(f.seed)) as unknown,
    sha,
  );
  function transition(old: ReturnType<typeof createSchemaTransition>) {
    const c = old.command,
      {
        canonicalPayload,
        fingerprint: _f,
        payloadHash: _p,
        simTime,
        ...intent
      } = c;
    void _f;
    void _p;
    const command = parseCanonicalCommand(
      {
        ...intent,
        payload: JSON.parse(canonicalPayload) as unknown,
        simTime: simTime.toCanonicalValue(),
      },
      sha,
    );
    const events = old.transition.events.map((e) => {
      const {
        canonicalPayload: payload,
        fingerprint: _ef,
        payloadHash: _ep,
        simTime: time,
        ...event
      } = e;
      void _ef;
      void _ep;
      return parseAuthoritativeEvent(
        {
          ...event,
          payload: JSON.parse(payload) as unknown,
          simTime: time.toCanonicalValue(),
        },
        sha,
      );
    });
    return {
      command,
      transition: createAuthoritativeTransition({
        command,
        events,
        worldVersionBefore: old.transition.worldVersionBefore,
        worldVersionAfter: old.transition.worldVersionAfter,
      }),
    };
  }
  const paid = transition(f.paidLineage),
    produced = transition(source);
  const old = f.funding;
  const funding = createFinancialPostingBatch(
    {
      ...old,
      command: paid.command,
      transition: paid.transition,
      worldId: paid.command.worldId,
      causationCommandId: paid.command.commandId,
      causationEventIds: paid.transition.eventIds,
      batchId: financialPostingBatchId(old.batchId),
      simTime: paid.command.simTime,
      legs: old.legs.map((leg) => ({
        ...leg,
        legId: financialPostingLegId(leg.legId),
        account: createFinancialAccount(
          JSON.parse(fixtureSerialize(leg.account)) as Parameters<
            typeof createFinancialAccount
          >[0],
        ),
        counterpartyAccountId:
          leg.counterpartyAccountId === null
            ? null
            : financialAccountId(leg.counterpartyAccountId),
        amount: Money.from(
          leg.amount.toCanonicalValue().amount,
          leg.amount.currency,
        ),
      })),
    },
    sha,
  );
  const posting = createProductionConsumptionPosting(
    {
      ...produced,
      postingId: inventoryPostingId(source.posting.postingId),
      evidence: JSON.parse(
        fixtureSerialize(source.posting.evidence),
      ) as ProductionConsumptionEvidence,
    },
    sha,
  );
  const later = transition(
    createSchemaTransition(2, 3, 'TEST_LATER_UNRELATED_EVENT', {
      TEST_ONLY: true,
    }),
  );
  const rows = [
    { ...paid, inventoryPostings: [], financialPostingBatches: [funding] },
    { ...produced, inventoryPostings: [posting], financialPostingBatches: [] },
    { ...later, inventoryPostings: [], financialPostingBatches: [] },
  ].map((row) => ({
    ...row,
    receipt: createFinalCommandReceipt({
      command: row.command,
      transition: row.transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: row.command.simTime,
      recordedAtReal: row.transition.events[0]!.recordedAtReal,
    }),
  }));
  const head = { worldId: seed.worldId, worldVersion: '3', eventSequence: '3' };
  const selectors = {
    worldId: seed.worldId,
    countryId: produced.command.countryId,
    commandId: produced.command.commandId,
    eventId: produced.transition.events[0]!.eventId,
    postingId: posting.postingId,
    expectedPublicationHead: head,
  };
  const sourceCandidate = evaluateIndustryProductionPrefixForTestOnly({
    seed,
    sourceHead: head,
    transitions: rows,
    selectors,
    sha256Hex: sha,
  });
  if (sourceCandidate.result.status !== 'EVALUATED_TEST_ONLY')
    throw new Error('Expected actual constructor-backed prefix');
  const scope = {
    worldId: seed.worldId,
    countryId: produced.command.countryId,
    officeId: 'INDUSTRY',
    classification: 'OFFICE_PRIVATE' as const,
  };
  const targetHistory = {
    commandId: produced.command.commandId,
    commandFingerprint: produced.command.fingerprint,
    eventId: produced.transition.events[0]!.eventId,
    eventFingerprint: produced.transition.events[0]!.fingerprint,
    postingId: posting.postingId,
    postingFingerprint: posting.fingerprint,
  };
  const worldBinding = {
    seedId: seed.seedId,
    seedFingerprint: seed.fingerprint,
    modelVersion: seed.replayBinding.modelVersion,
    replayBindingFingerprint: hash(seed.replayBinding),
  };
  const sourceBinding = {
    sourceId: seed.sources[0]!.sourceId,
    sourceRevision: '1',
    sourceFingerprint: seed.sources[0]!.payloadHash,
    ownerAdoptionRef: 'TEST_ONLY_ADOPTION',
    ownerAdoptionFingerprint: hash({ testOnly: true }),
    admissionRef: 'TEST_ONLY_ADMISSION',
    admissionRevision: '1',
  };
  const accounts = sourceCandidate.result.inventoryAccountWitnesses;
  const records = accounts.map((account, i) => ({
    schemaVersion: 'industry-production-governing-record-v1',
    recordId: `TEST_RECORD_${i}`,
    revision: '1',
    sourceBinding,
    scope,
    purpose: PURPOSE,
    ownerBinding: {
      historicalTitleHolderId: account.titleHolderId,
      historicalRiskBearerId: account.riskBearerId,
      currentAuthorityHolderId: account.titleHolderId,
      authorityRecordRef: `TEST_HISTORY_${i}`,
      authorityRecordFingerprint: hash({ i: String(i) }),
    },
    account,
    targetHistory,
    effectivity: {
      from: { worldVersion: '0', eventSequence: '0' },
      until: null,
    },
    revokedAt: null,
    sourceUnits: ['TEST_ONLY_NORMATIVE_UNIT'],
  }));
  const raw = records.map((r) => ({
    recordId: r.recordId,
    revision: r.revision,
    bytes: new TextEncoder().encode(canonicalSerialize(r)),
  }));
  const request = {
    publicationHead: head,
    worldBinding,
    scope,
    purpose: PURPOSE,
    targetHistory,
  };
  const witness = {
    publicationHead: head,
    targetCutoff: sourceCandidate.result.targetCutoff,
    targetHistory,
    accounts,
  };
  const snapshot = {
    schemaVersion: 'industry-production-governing-custodied-snapshot-v1',
    publicationHead: head,
    worldBinding,
    sourceAuthority: {
      issuerId: 'TEST_ONLY_ISSUER',
      custodianId: 'TEST_ONLY_CUSTODIAN',
      ...sourceBinding,
    },
    manifest: {
      manifestId: 'TEST_ONLY_MANIFEST',
      revision: '1',
      contentFingerprint: hash({ inertManifestIdentity: true }),
      scope,
      purpose: PURPOSE,
      targetHistory,
      entries: raw.map((r, i) => ({
        recordId: r.recordId,
        revision: r.revision,
        rawByteLength: String(r.bytes.length),
        rawSHA256: sha(r.bytes),
        currentAuthorityHolderId:
          records[i]!.ownerBinding.currentAuthorityHolderId,
        authorityRecordRef: records[i]!.ownerBinding.authorityRecordRef,
        authorityRecordFingerprint:
          records[i]!.ownerBinding.authorityRecordFingerprint,
      })),
    },
    records: raw,
  };
  const governingCandidate = evaluateIndustryGoverningForTestOnly({
    request,
    witness,
    snapshot,
  });
  return {
    schemaVersion: 'g-industry-decision-test-input-v1',
    scope,
    sourceCandidate,
    governingCandidate,
  };
}
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('VITEST', 'true');
  vi.stubEnv('ECONMIND_ENV', 'local');
});
afterEach(() => vi.unstubAllEnvs());

describe('new Industry consumer mapper, explicitly inert A/C constructor mechanism', () => {
  it('maps T<H into the existing paired wire with one output-after metric and no stock', () => {
    const input = productionFixture(),
      out = evaluate(input);
    expect(out).toMatchObject({
      kind: 'G_INDUSTRY_DECISION_PROJECTION_TEST_ONLY',
      sourceAdmitted: false,
      productionAuthority: false,
      runtimeConnected: false,
    });
    expect(out.result.decisionResult).toMatchObject({
      status: 'COMMITTED',
      businessState: 'APPLIED',
      afterState: null,
      metrics: [
        {
          key: 'PRODUCTION_OUTPUT',
          unit: 'tonne',
          after: '3',
          before: null,
          delta: null,
          status: 'AFTER_ONLY',
        },
      ],
    });
    expect(out.result.decisionResult.sourceHead.worldVersion).toBe('3');
    expect(out.result.decisionResult.cause?.worldVersionAfter).toBe('2');
    expect(Object.isFrozen(out.result.decisionResult.metrics)).toBe(true);
    const result = out.result.decisionResult;
    expect(() =>
      assertDecisionResultPayload({
        value: result,
        ...result.sourceHead,
        countryId: result.countryId,
        officeId: 'INDUSTRY',
        financialDetail: 'NOT_AUTHORIZED',
        activitySchema: 'world-activity-projection-v2',
        economicVisibilitySchema: 'economic-read-visibility-v2',
        industryProductionResult: out.result.industryProductionResult,
        lastOfficeActivity: {
          eventCount: '1',
          eventSequence: result.cause!.eventSequence,
          worldVersion: result.cause!.worldVersionAfter,
        },
      }),
    ).not.toThrow();
  });
  it.each([
    'commandId',
    'commandFingerprint',
    'eventId',
    'eventFingerprint',
  ] as const)('rejects changed four-cause %s', (key) => {
    const input = clone(productionFixture()),
      result = input.governingCandidate.result.resultSummary;
    if (result.status !== 'AUTHORIZED_RESULT_ONLY')
      throw new Error('Expected inert authorization');
    Object.assign(result.causeBinding, {
      [key]: key.endsWith('Fingerprint')
        ? hash({ wrong: true })
        : 'WRONG_CAUSE',
    });
    expect(() => evaluate(input)).toThrow('four-cause');
  });
  it.each(['worldId', 'worldVersion', 'eventSequence'] as const)(
    'rejects changed governing head %s',
    (key) => {
      const input = clone(productionFixture()),
        result = input.governingCandidate.result.resultSummary;
      if (result.status !== 'AUTHORIZED_RESULT_ONLY')
        throw new Error('Expected inert authorization');
      Object.assign(result.sourceHead, {
        [key]: key === 'worldId' ? 'WRONG_WORLD' : '4',
      });
      expect(() => evaluate(input)).toThrow('head differs');
    },
  );
  it.each(['0', '-1', '01', '1e3', '1.0', '0.0', '9'.repeat(121)])(
    'refuses unsupported finite amount %s',
    (amount) => {
      const input = clone(productionFixture());
      if (input.sourceCandidate.result.status !== 'EVALUATED_TEST_ONLY')
        throw new Error('Expected source');
      Object.assign(input.sourceCandidate.result.actualOutput, { amount });
      expect(() => evaluate(input)).toThrow('positive tonne');
    },
  );
  it.each(['0.125', '1.5', '9'.repeat(120)])(
    'preserves existing finite wire grammar %s as inert data',
    (amount) => {
      const input = clone(productionFixture());
      if (input.sourceCandidate.result.status !== 'EVALUATED_TEST_ONLY')
        throw new Error('Expected source');
      Object.assign(input.sourceCandidate.result.actualOutput, { amount });
      expect(evaluate(input).result.decisionResult.metrics[0]!.after).toBe(
        amount,
      );
    },
  );
  it.each([
    'ADMITTED_SOURCE_UNAVAILABLE',
    'OWNER_MAPPING_UNAVAILABLE',
    'SCOPE_NOT_AUTHORIZED',
  ])('clears successful metric and binding on %s', (reason) => {
    const input = clone(productionFixture());
    Object.assign(input.governingCandidate, {
      result: {
        disclosure: { status: 'NOT_AUTHORIZED', reason },
        resultSummary: { status: 'NOT_AUTHORIZED' },
      },
    });
    const out = evaluate(input).result;
    expect(out.decisionResult.status).toBe(
      reason === 'ADMITTED_SOURCE_UNAVAILABLE'
        ? 'SOURCE_UNAVAILABLE'
        : 'NOT_AUTHORIZED',
    );
    expect(out.decisionResult.metrics).toEqual([]);
    expect(out.decisionResult.cause).toBe(null);
    expect(out.industryProductionResult).toEqual({ status: 'NOT_AUTHORIZED' });
  });
  it('never retains an old authorized summary when the selected source is missing', () => {
    const input = clone(productionFixture());
    Object.assign(input.sourceCandidate, {
      result: {
        status: 'SOURCE_UNAVAILABLE',
        reason: 'PRODUCTION_TARGET_NOT_FOUND',
        publicationHead: input.sourceCandidate.result.publicationHead,
      },
    });
    expect(evaluate(input).result).toMatchObject({
      decisionResult: {
        status: 'SOURCE_UNAVAILABLE',
        cause: null,
        metrics: [],
      },
      industryProductionResult: { status: 'NOT_AUTHORIZED' },
    });
  });
  it('still rejects malformed unused C metadata when A source is missing', () => {
    const input = clone(productionFixture());
    Object.assign(input.sourceCandidate, {
      result: {
        status: 'SOURCE_UNAVAILABLE',
        reason: 'PRODUCTION_TARGET_NOT_FOUND',
        publicationHead: input.sourceCandidate.result.publicationHead,
      },
    });
    Object.assign(input.governingCandidate.result.resultSummary, {
      unexpected: true,
    });
    expect(() => evaluate(input)).toThrow('unknown');
  });
  it('owns results and rejects unexpected wrapper fields and production/test retagging', () => {
    const input = productionFixture(),
      out = evaluate(input);
    expect(() => evaluate({ ...input, sourceAdmitted: true })).toThrow(
      'unknown',
    );
    const changed = clone(input);
    Object.assign(changed.sourceCandidate, { sourceAdmitted: true });
    expect(() => evaluate(changed)).toThrow('Inert A');
    Object.assign(input.scope, { countryId: 'MUTATED_COUNTRY' });
    expect(out.result.decisionResult.countryId).not.toBe('MUTATED_COUNTRY');
  });
  it('refuses production evaluation before accessing getters', () => {
    vi.stubEnv('NODE_ENV', 'production');
    let calls = 0;
    const input = Object.defineProperty({}, 'scope', {
      get() {
        calls++;
        return {};
      },
    });
    expect(() => evaluate(input)).toThrow('TEST_RUNTIME_REQUIRED');
    expect(calls).toBe(0);
  });
});
