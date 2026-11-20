/** Common conditional DATA only. Dedicated service tests must prove actual
 * resource/labour/payment effects; these fixtures issue no utility delivery. */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import {
  prepareFinanceSocialReplayContinuation,
  appendFinanceSocialReplayPage,
  readFinanceSocialReplayContinuation,
  readFinanceSocialReplayContinuationView,
  retireFinanceSocialReplayContinuation,
} from '../../packages/core/src/commands/finance-social-replay-continuation.js';
import {
  INDUSTRY_UTILITY_COMMANDS,
  INDUSTRY_UTILITY_EVENTS,
  INDUSTRY_UTILITY_OPERATING_RECEIPT_EVENT,
  prepareIndustryUtilityExecution,
  readIndustryUtilityExecution,
  retireIndustryUtilityExecution,
  parseIndustryUtilityIntent,
  industryUtilityOperatingReceiptDraft,
  industryUtilityOperatingReceiptFromRun,
  assertIndustryUtilityCanonicalFrame,
  type IndustryUtilityKind,
} from '../../packages/core/src/commands/industry-utility-execution.js';
import { prepareIndustryOperatingWagePayment } from '../../packages/core/src/commands/industry-operating-wage-payment.js';
import { createIndustryOperatingWageCanonicalFixture } from '../support/industry-operating-wage-canonical-fixture.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function fixture() {
  const f = createIndustryOperatingWageCanonicalFixture(false),
    paid = prepareIndustryOperatingWagePayment(f),
    payment = {
      ...paid.step,
      events: paid.step.transition.events,
      receipt: C.createFinalCommandReceipt({
        command: f.command,
        transition: paid.step.transition,
        outcome: 'COMMITTED',
        reasonCode: null,
        simTime: f.command.simTime,
        recordedAtReal: f.observedAtReal,
      }),
    },
    frames = [f.schedule, f.workFrame, payment],
    h = { worldVersion: '3', eventSequence: '3' },
    opening = C.rebuildV08LedgersFromLineage({
      seed: f.f.seed,
      sha256Hex: sha,
    }),
    start = prepareFinanceSocialReplayContinuation(
      {
        opening,
        expectedHead: h,
        socialCountries: [],
        fxOriginals: [],
        industryWorkSources: [f.site],
        industryWageSources: [f.source],
        openingEncumbrances: [
          {
            reference: f.source.openingEncumbranceRef,
            accountId: f.f.op.asset.accountId,
            currency: 'XAA',
            amount: '100',
          },
        ],
      },
      sha,
    ),
    cursor = appendFinanceSocialReplayPage({
      continuation: start,
      sha256Hex: sha,
      page: {
        schemaVersion: 'finance-social-replay-page-v1',
        worldId: f.f.worldId,
        seedFingerprint: f.f.seed.fingerprint,
        fromHead: { worldVersion: '0', eventSequence: '0' },
        throughHead: h,
        expectedHead: h,
        frames,
        framesSha256: C.canonicalSha256(C.canonicalHashInput(frames), sha),
      },
    }),
    view = readFinanceSocialReplayContinuation(cursor),
    source = {
      worldId: f.f.worldId,
      countryId: f.f.countryId,
      locationId: f.site.locationId,
      facilityId: f.site.facilityId,
      operatorId: f.site.operatorId,
      runId: f.source.runId,
      seedId: f.site.seedId,
      seedFingerprint: f.site.seedFingerprint,
      admissionRef: f.site.admissionRef,
      sourceRef: 'TEST_ONLY_UTILITY_SOURCE_NOT_CUSTODY',
      sourceRawSha256: 'a'.repeat(64),
      policyVersion: 'TEST_ONLY_SERVICE_POLICY_NOT_ADOPTION',
      policyRawSha256: 'b'.repeat(64),
      userAdoptionRawSha256: 'c'.repeat(64),
      originals: [
        {
          kind: 'TEST_ONLY_LABOUR_ORIGINAL',
          reference: f.site.sourceRef,
          rawSha256: f.site.sourceRawSha256,
        },
      ],
    };
  const command = (
    kind: IndustryUtilityKind = 'POWER',
    change: Record<string, unknown> = {},
    body: Record<string, unknown> = {},
  ) =>
    C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        commandId: 'UTILITY_TEST_ONLY',
        commandType: INDUSTRY_UTILITY_COMMANDS[kind],
        worldId: f.f.worldId,
        countryId: f.f.countryId,
        officeId: 'INDUSTRY',
        actorId: f.command.actorId,
        authSubject: f.command.authSubject,
        expectedWorldVersion: '3',
        idempotencyKey: 'UTILITY_TEST_ONLY',
        correlationId: f.command.correlationId,
        simTime: f.command.simTime.toCanonicalValue(),
        submittedAtReal: f.observedAtReal,
        payload: {
          schemaVersion: 'industry-first-day-utility-command-v1',
          serviceKind: kind,
          operationRef: 'TEST_ONLY_OPERATION',
          facilityId: source.facilityId,
          runId: source.runId,
          sourceRef: source.sourceRef,
          sourceRawSha256: source.sourceRawSha256,
          operation: { action: 'BOOK' },
          ...body,
        },
        ...change,
      },
      sha,
    );
  return { f, view, cursor, source, command };
}
describe('fixed first-day utilities conditional common boundary', () => {
  it('reconstructs identical conditional receipt bytes from verified RUN DATA without forging a complete replay view or reissuing delivery', () => {
    const f = fixture(),
      command = f.command('LOGISTICS'),
      preparation = prepareIndustryUtilityExecution(
        { command, replay: f.view, source: f.source },
        sha,
      ),
      actual = readIndustryUtilityExecution(preparation, sha),
      input = {
        command,
        source: actual.source,
        productionRun: actual.productionRun,
        validFromTicks: '0',
        validUntilTicks: '86400000',
        factCanonicalPayload: C.canonicalSerialize({
          stage: 'TEST_ONLY_DATA_NOT_SERVICE',
        }),
      },
      fromData = industryUtilityOperatingReceiptFromRun(input, sha),
      fromPrivate = industryUtilityOperatingReceiptDraft(
        { ...input, preparation },
        sha,
      );
    expect(fromData).toEqual(fromPrivate);
    retireIndustryUtilityExecution(preparation);
    expect(() =>
      industryUtilityOperatingReceiptDraft({ ...input, preparation }, sha),
    ).toThrow('GENUINE_LIVE');
    expect(industryUtilityOperatingReceiptFromRun(input, sha)).toEqual(
      fromData,
    );
    expect(fromData.classification).toBe(
      'CONDITIONAL_DOMAIN_RECEIPT_DATA_NOT_DELIVERY_AUTHORITY',
    );
    expect('actualDelivered' in fromData).toBe(false);
    expect('executionToken' in fromData).toBe(false);
  });
  it('rejects altered RUN terms, source, complete receipt, event group, foreign scope and a future schedule in the pure DATA serializer', () => {
    const f = fixture(),
      command = f.command('WATER'),
      preparation = prepareIndustryUtilityExecution(
        { command, replay: f.view, source: f.source },
        sha,
      ),
      d = readIndustryUtilityExecution(preparation, sha),
      run = d.productionRun,
      input = {
        command,
        source: d.source,
        productionRun: run,
        validFromTicks: '0',
        validUntilTicks: '86400000',
        factCanonicalPayload: '{}',
      };
    for (const productionRun of [
      {
        ...run,
        terms: {
          ...run.terms,
          maximumExpense: { amount: '999', currency: 'XAA' },
        },
      },
      { ...run, source: { ...run.source, operatorId: 'ENTITY_FOREIGN' } },
      { ...run, source: { ...run.source, seedId: 'SEED_FOREIGN' } },
      {
        ...run,
        frame: {
          ...run.frame,
          receipt: { ...run.frame.receipt, reasonCode: 'CHANGED' },
        },
      },
      { ...run, frame: { ...run.frame, events: [] } },
    ])
      expect(() =>
        industryUtilityOperatingReceiptFromRun(
          { ...input, productionRun },
          sha,
        ),
      ).toThrow();
    expect(() =>
      industryUtilityOperatingReceiptFromRun(
        { ...input, source: { ...input.source, locationId: 'REGION_FOREIGN' } },
        sha,
      ),
    ).toThrow('EXACT_COMMITTED');
    expect(() =>
      industryUtilityOperatingReceiptFromRun(
        {
          ...input,
          command: f.command('WATER', { expectedWorldVersion: '0' }),
        },
        sha,
      ),
    ).toThrow('EXACT_COMMITTED');
    expect(() =>
      industryUtilityOperatingReceiptFromRun(
        { ...input, factCanonicalPayload: '{ "not": "canonical" }' },
        sha,
      ),
    ).toThrow('EXACT_CANONICAL');
  });
  it('retains actual complete RUN/WORK/WAGE ledgers and exact committed RUN, without issuing delivery or consuming labour again', () => {
    const f = fixture(),
      before = C.canonicalSerialize(f.view.result);
    for (const kind of ['POWER', 'WATER', 'LOGISTICS'] as const) {
      const p = prepareIndustryUtilityExecution(
          { command: f.command(kind), replay: f.view, source: f.source },
          sha,
        ),
        d = readIndustryUtilityExecution(p, sha);
      expect(d.replay.result.financialState).toBe(f.view.result.financialState);
      expect(d.productionRun.frame.command).toBe(f.f.schedule.command);
      expect(d.intent.serviceKind).toBe(kind);
      expect('actualDelivered' in d).toBe(false);
      expect('paidServiceWork' in d).toBe(false);
      retireIndustryUtilityExecution(p);
    }
    expect(C.canonicalSerialize(f.view.result)).toBe(before);
  });
  it('rejects forged/copied replay views and keeps only genuine immutable DATA valid after cursor retirement', () => {
    const f = fixture();
    expect(() =>
      readFinanceSocialReplayContinuationView({ ...f.view }, sha),
    ).toThrow('genuine issued replay view');
    expect(() =>
      prepareIndustryUtilityExecution(
        { command: f.command(), replay: { ...f.view }, source: f.source },
        sha,
      ),
    ).toThrow();
    retireFinanceSocialReplayContinuation(f.cursor);
    expect(readFinanceSocialReplayContinuationView(f.view, sha)).toBe(f.view);
    expect(() => readIndustryUtilityExecution({} as never, sha)).toThrow(
      'GENUINE_LIVE',
    );
  });
  it('rejects wrong office, family, future day, missing idempotency and future-production fingerprint fields', () => {
    const f = fixture();
    for (const change of [
      { officeId: 'FINANCE' },
      { commandType: INDUSTRY_UTILITY_COMMANDS.WATER },
      { simTime: '86400001' },
      { idempotencyKey: null },
    ]) {
      expect(() =>
        parseIndustryUtilityIntent(f.command('POWER', change), sha),
      ).toThrow('EXACT_FIXED');
    }
    expect(() =>
      parseIndustryUtilityIntent(
        f.command(
          'POWER',
          {},
          { targetProductionCommandFingerprint: 'sha256:' + 'a'.repeat(64) },
        ),
        sha,
      ),
    ).toThrow('EXACT_FIXED');
  });
  it('permits completion exactly at the first-day end without extending the receipt or source window', () => {
    const f = fixture(),
      command = f.command(
        'LOGISTICS',
        { simTime: '86400000' },
        { operation: { action: 'DELIVER' } },
      ),
      p = prepareIndustryUtilityExecution(
        { command, replay: f.view, source: f.source },
        sha,
      );
    expect(parseIndustryUtilityIntent(command, sha).operation).toEqual({
      action: 'DELIVER',
    });
    const receipt = industryUtilityOperatingReceiptDraft(
      {
        preparation: p,
        validFromTicks: '0',
        validUntilTicks: '86400000',
        factCanonicalPayload: '{}',
      },
      sha,
    );
    expect(receipt.validUntilTicks).toBe('86400000');
    expect(() =>
      industryUtilityOperatingReceiptDraft(
        {
          preparation: p,
          validFromTicks: '0',
          validUntilTicks: '86400001',
          factCanonicalPayload: '{}',
        },
        sha,
      ),
    ).toThrow('EXACT_CANONICAL_FIRST_DAY');
    expect(() =>
      parseIndustryUtilityIntent(
        f.command('LOGISTICS', { simTime: '86400001' }),
        sha,
      ),
    ).toThrow('EXACT_FIXED');
    retireIndustryUtilityExecution(p);
  });
  it('rejects foreign seed/head/country, uncommitted run and duplicate immutable originals', () => {
    const f = fixture();
    for (const source of [
      { ...f.source, seedFingerprint: 'sha256:' + 'd'.repeat(64) },
      { ...f.source, countryId: 'COUNTRY_02' },
      { ...f.source, runId: 'UNSCHEDULED_RUN' },
      {
        ...f.source,
        originals: [...f.source.originals, ...f.source.originals],
      },
    ]) {
      expect(() =>
        prepareIndustryUtilityExecution(
          { command: f.command(), replay: f.view, source },
          sha,
        ),
      ).toThrow();
    }
    expect(() =>
      prepareIndustryUtilityExecution(
        {
          command: f.command('POWER', { expectedWorldVersion: '2' }),
          replay: f.view,
          source: f.source,
        },
        sha,
      ),
    ).toThrow('EXACT_COMPLETE');
  });
  it('binds a conditional v2 receipt to actual RUN and exact source, validates the complete two-event canonical group and full FINAL', () => {
    const f = fixture(),
      command = f.command('WATER'),
      p = prepareIndustryUtilityExecution(
        { command, replay: f.view, source: f.source },
        sha,
      ),
      receipt = industryUtilityOperatingReceiptDraft(
        {
          preparation: p,
          validFromTicks: '0',
          validUntilTicks: '86400000',
          factCanonicalPayload: C.canonicalSerialize({
            testOnly: 'NO_DELIVERY_ISSUED',
          }),
        },
        sha,
      ),
      events = [
        {
          type: INDUSTRY_UTILITY_EVENTS.WATER,
          payload: { conditionalTestData: true },
        },
        {
          type: INDUSTRY_UTILITY_OPERATING_RECEIPT_EVENT,
          payload: { operatingReceipt: receipt },
        },
      ].map((x, i) =>
        C.parseAuthoritativeEvent(
          {
            schemaVersion: C.EVENT_SCHEMA_VERSION,
            eventId: 'UTILITY_TEST_EVENT_' + i,
            eventType: x.type,
            worldId: command.worldId,
            causationCommandId: command.commandId,
            correlationId: command.correlationId,
            correctsEventId: null,
            sequence: String(4 + i),
            worldVersion: '4',
            simTime: command.simTime.toCanonicalValue(),
            recordedAtReal: f.f.observedAtReal,
            payload: x.payload,
          },
          sha,
        ),
      ),
      transition = C.createAuthoritativeTransition({
        command,
        worldVersionBefore: '3',
        worldVersionAfter: '4',
        events,
      }),
      frame = {
        command,
        events,
        transition,
        financialPostingBatches: [],
        inventoryPostings: [],
        receipt: C.createFinalCommandReceipt({
          command,
          transition,
          outcome: 'COMMITTED',
          reasonCode: null,
          simTime: command.simTime,
          recordedAtReal: f.f.observedAtReal,
        }),
      };
    expect(receipt.productionRun.commandFingerprint).toBe(
      f.f.schedule.command.fingerprint,
    );
    expect('targetProductionCommandFingerprint' in receipt).toBe(false);
    assertIndustryUtilityCanonicalFrame(p, frame, sha);
    const bookingTransition = C.createAuthoritativeTransition({
      command,
      worldVersionBefore: '3',
      worldVersionAfter: '4',
      events: [events[0]!],
    });
    // A booking stage records its domain event and FINAL only. It does not
    // acquire a WATER_DELIVERY merely because common canonical validation ran.
    assertIndustryUtilityCanonicalFrame(
      p,
      {
        ...frame,
        events: bookingTransition.events,
        transition: bookingTransition,
        receipt: C.createFinalCommandReceipt({
          command,
          transition: bookingTransition,
          outcome: 'COMMITTED',
          reasonCode: null,
          simTime: command.simTime,
          recordedAtReal: f.f.observedAtReal,
        }),
      },
      sha,
    );
    expect(() =>
      assertIndustryUtilityCanonicalFrame(
        p,
        { ...frame, receipt: { ...frame.receipt, reasonCode: 'CHANGED' } },
        sha,
      ),
    ).toThrow('EXACT_COMMITTED');
    expect(() =>
      assertIndustryUtilityCanonicalFrame(
        p,
        { ...frame, events: [...events].reverse() },
        sha,
      ),
    ).toThrow('EXACT_DOMAIN');
    retireIndustryUtilityExecution(p);
    expect(() =>
      industryUtilityOperatingReceiptDraft(
        {
          preparation: p,
          validFromTicks: '0',
          validUntilTicks: '1',
          factCanonicalPayload: '{}',
        },
        sha,
      ),
    ).toThrow('GENUINE_LIVE');
  });
});
