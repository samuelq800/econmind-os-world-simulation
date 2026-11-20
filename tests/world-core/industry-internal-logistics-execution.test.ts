/** Tiny real Core calculations and full frames, TEST_ONLY principals/originals.
 * These tests make no native DB, admission, actor or production claim. */
import { describe, it, expect } from 'vitest';
import { canonicalSerialize as serializeWorkerFrame } from '@econmind/core';
import * as C from '../../packages/core/src/index.js';
import {
  prepareIndustryInternalLogisticsFrame,
  replayIndustryInternalLogisticsFrame,
  readIndustryInternalLogisticsExecutionState,
  readIndustryFirstDayLogisticsExecution,
  sealIndustryFirstDayLogisticsExecution,
  mergeIndustryInternalLogisticsReplaySources,
  readIndustryInternalLogisticsReplaySources,
  prepareIndustryInternalLogisticsReplaySources,
  type IndustryInternalLogisticsExecutionState,
  type IndustryLogisticsExpenseOriginal,
} from '../../packages/core/src/inventory/industry-internal-logistics-execution.js';
import {
  prepareFinanceSocialReplayContinuation,
  appendFinanceSocialReplayPage,
  readFinanceSocialReplayContinuation,
} from '../../packages/core/src/commands/finance-social-replay-continuation.js';
import {
  prepareIndustryRunScheduleFrame,
  prepareIndustryFirstDayWorkFrame,
  INDUSTRY_FIRST_DAY_WORK_COMMAND,
} from '../../packages/core/src/industry/industry-first-day-work.js';
import {
  createIndustryLogisticsExecutionFixture,
  logisticsSha as sha,
  logisticsAt as at,
} from '../support/industry-logistics-execution-fixture.js';
import type { FinanceNativeBudgetCanonicalFrame } from '../../packages/core/src/commands/finance-budget-native.js';
import { decodePostwarBoundedReplayFrameData } from '../../apps/world-worker/src/persistence/postgres-postwar-bounded-prefix-pages.js';
type Fixture = ReturnType<typeof createIndustryLogisticsExecutionFixture>;
function context(f: Fixture, state: IndustryInternalLogisticsExecutionState) {
  const s = readIndustryInternalLogisticsExecutionState(state);
  return {
    head: s.head,
    financial: s.financial,
    inventory: s.inventory,
    industryWorkState: f.scheduled.state,
  };
}
function step(
  f: Fixture,
  state: IndustryInternalLogisticsExecutionState,
  operation: Record<string, unknown>,
  id: string,
  time = '0',
  expenseOriginal?: IndustryLogisticsExpenseOriginal,
) {
  const input = {
    state,
    command: f.command(state, operation, id, time),
    observedAtReal: at,
    ...(expenseOriginal ? { expenseOriginal } : {}),
  };
  const candidate = prepareIndustryInternalLogisticsFrame(input, sha);
  expect(candidate.execution).toBeNull();
  const result = replayIndustryInternalLogisticsFrame(
    {
      state,
      sourceInputs: expenseOriginal
        ? f.sourceInput([expenseOriginal])
        : f.sources,
      context: context(f, state),
      frame: candidate.frame,
      ...(expenseOriginal ? { expenseOriginal } : {}),
    },
    sha,
  );
  expect(result.execution).toBeNull();
  return result;
}
function chain() {
  const f = createIndustryLogisticsExecutionFixture(),
    b = step(f, f.state, f.book, 'BOOK'),
    s = step(
      f,
      b.state,
      { action: 'SHIP', transferId: f.request.transferId },
      'SHIP',
    ),
    w = step(
      f,
      s.state,
      {
        action: 'SERVICE_WORK',
        transferId: f.request.transferId,
        allocations: [f.allocation],
      },
      'WORK',
      '60000',
    ),
    original = f.expense(w.frame.events[0]!.fingerprint);
  const p = step(
    f,
    w.state,
    {
      action: 'PAY_INPUTS',
      transferId: f.request.transferId,
      workEventFingerprint: w.frame.events[0]!.fingerprint,
      expenseOrderRef: original.reference,
      expenseOrderSha256: original.rawSha256,
    },
    'PAY',
    '60000',
    original,
  );
  const d = step(
    f,
    p.state,
    { action: 'DELIVER', transferId: f.request.transferId },
    'DELIVER',
    '60000',
  );
  return {
    f,
    b,
    s,
    w,
    p,
    d,
    original,
    frames: [f.scheduled.frame, b.frame, s.frame, w.frame, p.frame, d.frame],
  };
}
function fullView(
  c: ReturnType<typeof chain>,
  extra: readonly FinanceNativeBudgetCanonicalFrame[] = [],
) {
  const frames = [...c.frames, ...extra],
    last = frames.at(-1)!,
    head = {
      worldVersion: last.transition.worldVersionAfter,
      eventSequence: last.events.at(-1)!.sequence,
    };
  const start = prepareFinanceSocialReplayContinuation(
    {
      opening: c.f.opening,
      expectedHead: head,
      socialCountries: [c.f.social],
      fxOriginals: [],
      openingEncumbrances: [],
      industryWorkSources: [c.f.workSource],
      industryLogisticsSources: [c.f.sourceInput([c.original])],
    },
    sha,
  );
  return readFinanceSocialReplayContinuation(
    appendFinanceSocialReplayPage({
      continuation: start,
      sha256Hex: sha,
      page: {
        schemaVersion: 'finance-social-replay-page-v1',
        worldId: c.f.world,
        seedFingerprint: c.f.seed.fingerprint,
        fromHead: { worldVersion: '0', eventSequence: '0' },
        throughHead: head,
        expectedHead: head,
        frames,
        framesSha256: C.canonicalSha256(C.canonicalHashInput(frames), sha),
      },
    }),
  );
}
describe('independent internal logistics full Core frames and named handover', () => {
  it('round-trips every genuine logistics stage through the bounded paged frame decoder', () => {
    const c = chain();
    for (const frame of c.frames) {
      const decoded = decodePostwarBoundedReplayFrameData({
        worldId: c.f.world,
        fromHead: {
          worldVersion: frame.transition.worldVersionBefore,
          eventSequence: String(BigInt(frame.events[0]!.sequence) - 1n),
        },
        frame: JSON.parse(C.canonicalSerialize(frame)),
      });
      expect(serializeWorkerFrame(decoded)).toBe(C.canonicalSerialize(frame));
    }
    expect(c.b.frame.inventoryPostings[0]!.operation).toBe('RESERVE');
    expect(c.s.frame.inventoryPostings[0]!.operation).toBe('SHIP');
    expect(c.d.frame.inventoryPostings[0]!.operation).toBe('DELIVER');
    expect(c.p.frame.financialPostingBatches[0]!.legs).toHaveLength(6);
  });
  it('rejects missing, duplicate, altered and wrong-stage journals at the bounded decoder', () => {
    const c = chain();
    const decode = (frame: FinanceNativeBudgetCanonicalFrame) =>
      decodePostwarBoundedReplayFrameData({
        worldId: c.f.world,
        fromHead: {
          worldVersion: frame.transition.worldVersionBefore,
          eventSequence: String(BigInt(frame.events[0]!.sequence) - 1n),
        },
        frame: JSON.parse(C.canonicalSerialize(frame)),
      });
    for (const frame of [c.b.frame, c.s.frame, c.d.frame]) {
      expect(() => decode({ ...frame, inventoryPostings: [] })).toThrow();
      expect(() =>
        decode({
          ...frame,
          inventoryPostings: [
            ...frame.inventoryPostings,
            ...frame.inventoryPostings,
          ],
        }),
      ).toThrow();
      expect(() =>
        decode({
          ...frame,
          inventoryPostings: [
            {
              ...frame.inventoryPostings[0]!,
              fingerprint: 'sha256:' + '0'.repeat(64),
            },
          ],
        }),
      ).toThrow();
    }
    expect(() =>
      decode({ ...c.p.frame, financialPostingBatches: [] }),
    ).toThrow();
    expect(() =>
      decode({
        ...c.p.frame,
        financialPostingBatches: [
          ...c.p.frame.financialPostingBatches,
          ...c.p.frame.financialPostingBatches,
        ],
      }),
    ).toThrow();
    for (const frame of [c.b.frame, c.s.frame, c.w.frame, c.d.frame])
      expect(() =>
        decode({
          ...frame,
          financialPostingBatches: c.p.frame.financialPostingBatches,
        }),
      ).toThrow();
    for (const frame of [c.f.scheduled.frame, c.w.frame, c.p.frame])
      expect(() =>
        decode({ ...frame, inventoryPostings: c.b.frame.inventoryPostings }),
      ).toThrow();
    expect(() =>
      decode({ ...c.b.frame, inventoryPostings: c.s.frame.inventoryPostings }),
    ).toThrow();
  });
  it('executes actual reserve/transit/site journal movements without changing batch, title or risk', () => {
    const c = chain(),
      initial = c.f.seed.inventoryEntries[0]!,
      book = readIndustryInternalLogisticsExecutionState(c.b.state),
      ship = readIndustryInternalLogisticsExecutionState(c.s.state),
      end = readIndustryInternalLogisticsExecutionState(c.d.state);
    expect(initial.account.physicalLocationId).toBe('LOCATION_WAREHOUSE_02');
    expect(
      book.inventory.balances.some(
        (b) =>
          b.account.bucket === 'RESERVED' && b.quantity.amount.equals('1.08'),
      ),
    ).toBe(true);
    expect(
      ship.inventory.balances.some(
        (b) =>
          b.account.bucket === 'IN_TRANSIT' && b.quantity.amount.equals('1.08'),
      ),
    ).toBe(true);
    const destination = end.inventory.balances.find(
      (b) => b.account.physicalLocationId === 'LOCATION_ACTUAL_REFINERY_TEST',
    )!;
    expect(destination.quantity.toCanonicalValue()).toEqual({
      amount: '1.08',
      unit: 'barrel',
    });
    expect(destination.account).toMatchObject({
      batchId: initial.account.batchId,
      titleHolderId: initial.account.titleHolderId,
      riskBearerId: initial.account.riskBearerId,
      economicRecognitionId: initial.account.economicRecognitionId,
      bucket: 'AVAILABLE',
    });
    expect(
      end.inventory.balances
        .reduce((sum, b) => sum.add(b.quantity), C.Quantity.from('0', 'barrel'))
        .toCanonicalValue().amount,
    ).toBe('3191522.33351');
    expect(c.frames.slice(1).map((f) => f.inventoryPostings.length)).toEqual([
      1, 1, 0, 0, 1,
    ]);
    expect(
      c.frames.slice(1).map((f) => f.financialPostingBatches.length),
    ).toEqual([0, 0, 0, 1, 0]);
    expect(c.d.frame.events).toHaveLength(2);
  });
  it('uses distinct prior service WORK and six real deposit settlement legs; budget reference is never paid', () => {
    const c = chain(),
      state = readIndustryInternalLogisticsExecutionState(c.p.state),
      work = JSON.parse(c.w.frame.events[0]!.canonicalPayload) as Record<
        string,
        unknown
      >;
    expect(work).toMatchObject({
      purpose: 'INDEPENDENT_INTERNAL_LOGISTICS_NOT_MANUFACTURING',
      personMilliseconds: '60000',
    });
    expect(
      state.financial.positions
        .find((p) => p.account.accountId === c.f.op.asset.accountId)!
        .netDebitBalance.toCanonicalValue(),
    ).toEqual({ amount: '99', currency: 'XBB' });
    expect(
      state.financial.positions
        .find((p) => p.account.accountId === c.f.hh.asset.accountId)!
        .netDebitBalance.toCanonicalValue(),
    ).toEqual({ amount: '101', currency: 'XBB' });
    expect(c.p.frame.financialPostingBatches).toHaveLength(1);
    expect(
      JSON.parse(C.canonicalSerialize(c.p.frame.financialPostingBatches[0]))
        .legs,
    ).toHaveLength(6);
    const fact = JSON.parse(
      JSON.parse(c.d.frame.events[1]!.canonicalPayload).operatingReceipt
        .factCanonicalPayload,
    );
    expect(fact.paidInputs[0]).toMatchObject({
      amount: '1',
      currency: 'XBB',
      inputRef: c.original.reference,
    });
    expect(fact.budgetReference).toMatchObject({
      currency: 'GCU',
      isPriceOrExpense: false,
    });
    expect(fact.budgetReference.amount).not.toBe('1');
  });
  it('requires complete global replay before sealing delivery; copied states/views/frames cannot mint the token', () => {
    const c = chain();
    expect(c.d.execution).toBeNull();
    const view = fullView(c),
      token = sealIndustryFirstDayLogisticsExecution(
        { replay: view, frame: c.d.frame },
        sha,
      ),
      data = readIndustryFirstDayLogisticsExecution(token);
    expect(data.frame.command.commandId).toBe('DELIVER');
    expect(data.actualQualifiedExpenses[0]).toMatchObject({
      amount: '1',
      currency: 'XBB',
    });
    expect(() =>
      readIndustryFirstDayLogisticsExecution({ ...token }),
    ).toThrow();
    expect(() =>
      sealIndustryFirstDayLogisticsExecution(
        { replay: { ...view }, frame: c.d.frame },
        sha,
      ),
    ).toThrow();
    expect(() =>
      sealIndustryFirstDayLogisticsExecution(
        { replay: view, frame: { ...c.d.frame, inventoryPostings: [] } },
        sha,
      ),
    ).toThrow();
  });
  it('keeps actual handover after a correctly reduced later sibling RUN updates global head', () => {
    const c = chain(),
      h = readIndustryInternalLogisticsExecutionState(c.d.state).head;
    const originalTerms = JSON.parse(
      c.f.scheduled.frame.command.canonicalPayload,
    ) as Record<string, unknown>;
    const command = c.f.rawCommand(
      c.f.scheduled.frame.command.commandType,
      'SECOND_RUN',
      h.worldVersion,
      '60000',
      { ...originalTerms, runId: 'SECOND_RUN', startsAtSimTime: '60000' },
    );
    const sibling = prepareIndustryRunScheduleFrame(
      { state: c.f.scheduled.state, command, head: h, observedAtReal: at },
      sha,
    );
    const view = fullView(c, [sibling.frame]),
      token = sealIndustryFirstDayLogisticsExecution(
        { replay: view, frame: c.d.frame },
        sha,
      );
    expect(readIndustryFirstDayLogisticsExecution(token).replay.head).toEqual({
      worldVersion: '7',
      eventSequence: '8',
    });
  });
  it('rejects later genuine manufacturing WORK reusing completed logistics person/time in the full prefix', () => {
    const c = chain(),
      head = readIndustryInternalLogisticsExecutionState(c.d.state).head,
      prior = c.f.scheduled.frame.command;
    const allocation = {
      ...c.f.allocation,
      positionId: c.f.workSource.positions[0]!.positionId,
      poolId: c.f.workSource.positions[0]!.poolId,
      count: '4',
      endsAtSimTime: '57600',
      personMilliseconds: '230400',
      personMinutes: { numerator: '230400', denominator: '60000' },
    };
    const command = C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        commandType: INDUSTRY_FIRST_DAY_WORK_COMMAND,
        commandId: 'MANUFACTURING_DOUBLE_TIME',
        worldId: prior.worldId,
        countryId: prior.countryId,
        officeId: null,
        actorId: prior.actorId,
        authSubject: prior.authSubject,
        expectedWorldVersion: head.worldVersion,
        idempotencyKey: 'MANUFACTURING_DOUBLE_TIME',
        correlationId: 'MANUFACTURING_DOUBLE_TIME',
        simTime: '60000',
        submittedAtReal: at,
        payload: {
          schemaVersion: 'postwar-industry-work-command-v1',
          runId: c.f.request.runId,
          scheduleCommandFingerprint: prior.fingerprint,
          allocations: [allocation],
        },
      },
      sha,
    );
    const actual = prepareIndustryFirstDayWorkFrame(
      { state: c.f.scheduled.state, command, head, observedAtReal: at },
      sha,
    );
    expect(actual.work).toBeTruthy();
    expect(() => fullView(c, [actual.frame])).toThrow(
      'ACTUAL_UTILITY_WORKER_TIME_OVERLAP',
    );
  });
  it('preserves the immutable logistics contract when a legitimate later WORK changes the RUN performed counter', () => {
    const f = createIndustryLogisticsExecutionFixture(),
      book = { ...f.book, request: { ...f.request, endsAtSimTime: '1000000' } },
      b = step(f, f.state, book, 'BOOK_LONG'),
      head = readIndustryInternalLogisticsExecutionState(b.state).head,
      prior = f.scheduled.frame.command;
    const allocation = {
      ...f.allocation,
      positionId: f.workSource.positions[0]!.positionId,
      poolId: f.workSource.positions[0]!.poolId,
      count: '4',
      endsAtSimTime: '57600',
      personMilliseconds: '230400',
      personMinutes: { numerator: '230400', denominator: '60000' },
    };
    const command = C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        commandType: INDUSTRY_FIRST_DAY_WORK_COMMAND,
        commandId: 'LEGITIMATE_MANUFACTURING_WORK',
        worldId: prior.worldId,
        countryId: prior.countryId,
        officeId: null,
        actorId: prior.actorId,
        authSubject: prior.authSubject,
        expectedWorldVersion: head.worldVersion,
        idempotencyKey: 'LEGITIMATE_MANUFACTURING_WORK',
        correlationId: 'LEGITIMATE_MANUFACTURING_WORK',
        simTime: '60000',
        submittedAtReal: at,
        payload: {
          schemaVersion: 'postwar-industry-work-command-v1',
          runId: f.request.runId,
          scheduleCommandFingerprint: prior.fingerprint,
          allocations: [allocation],
        },
      },
      sha,
    );
    const work = prepareIndustryFirstDayWorkFrame(
        { state: f.scheduled.state, command, head, observedAtReal: at },
        sha,
      ),
      frames = [f.scheduled.frame, b.frame, work.frame],
      through = { worldVersion: '3', eventSequence: '3' };
    const start = prepareFinanceSocialReplayContinuation(
      {
        opening: f.opening,
        expectedHead: through,
        socialCountries: [f.social],
        fxOriginals: [],
        openingEncumbrances: [],
        industryWorkSources: [f.workSource],
        industryLogisticsSources: [f.sources],
      },
      sha,
    );
    const view = readFinanceSocialReplayContinuation(
      appendFinanceSocialReplayPage({
        continuation: start,
        sha256Hex: sha,
        page: {
          schemaVersion: 'finance-social-replay-page-v1',
          worldId: f.world,
          seedFingerprint: f.seed.fingerprint,
          fromHead: { worldVersion: '0', eventSequence: '0' },
          throughHead: through,
          expectedHead: through,
          frames,
          framesSha256: C.canonicalSha256(C.canonicalHashInput(frames), sha),
        },
      }),
    );
    const actual = view.result.industryLogisticsState![0]!;
    const ship = prepareIndustryInternalLogisticsFrame(
      {
        state: actual,
        command: f.command(
          actual,
          { action: 'SHIP', transferId: f.request.transferId },
          'SHIP_AFTER_REAL_WORK',
          '60000',
        ),
        observedAtReal: at,
      },
      sha,
    );
    expect(ship.frame.inventoryPostings).toHaveLength(1);
    expect(
      readIndustryInternalLogisticsExecutionState(ship.state).transfers[0]!
        .status,
    ).toBe('IN_TRANSIT');
  });
  it('cannot relabel an existing manufacturing position as a logistics position', () => {
    const f = createIndustryLogisticsExecutionFixture();
    expect(() =>
      prepareIndustryInternalLogisticsReplaySources(
        {
          source: f.planningSource,
          labourSource: {
            ...f.labour,
            positions: f.labour.positions.map((p) => ({
              ...p,
              sourceObjectId: 'OPEN-02-REFINED_FUEL',
              positionId:
                'POSTWAR_SOURCE_' +
                sha('OPEN-02-REFINED_FUEL/' + p.skill).toUpperCase(),
            })),
          },
          utilitySources: [f.utilitySource],
        },
        sha,
      ),
    ).toThrow('ACTUAL_LOGISTICS_NOT_MANUFACTURING_POSITION_REQUIRED');
  });
  it('rejects early service/delivery or raw ready flags instead of performing future work or creating receipts', () => {
    const f = createIndustryLogisticsExecutionFixture(),
      b = step(f, f.state, f.book, 'BOOK'),
      s = step(
        f,
        b.state,
        { action: 'SHIP', transferId: f.request.transferId },
        'SHIP',
      );
    expect(() =>
      prepareIndustryInternalLogisticsFrame(
        {
          state: s.state,
          command: f.command(
            s.state,
            {
              action: 'SERVICE_WORK',
              transferId: f.request.transferId,
              allocations: [f.allocation],
            },
            'EARLY',
            '59999',
          ),
          observedAtReal: at,
        },
        sha,
      ),
    ).toThrow('ACTUAL_SHIPPED_ELAPSED_INDEPENDENT_SERVICE_REQUIRED');
    expect(() =>
      step(
        f,
        s.state,
        { action: 'DELIVER', transferId: f.request.transferId },
        'NO_WORK',
        '60000',
      ),
    ).toThrow('ACTUAL_DISTINCT_SERVICE_WORK_AND_PAID_INPUTS_REQUIRED');
    expect(() =>
      step(
        f,
        s.state,
        {
          action: 'DELIVER',
          transferId: f.request.transferId,
          ready: true,
          paid: true,
        },
        'FLAGS',
        '60000',
      ),
    ).toThrow('EXACT_DOMAIN_FIELDS_REQUIRED');
  });
  it('rejects missing, modified, oversized or unrelated wage expense order instead of treating manufacturing payment as logistics', () => {
    const c = chain(),
      op = {
        action: 'PAY_INPUTS',
        transferId: c.f.request.transferId,
        workEventFingerprint: c.w.frame.events[0]!.fingerprint,
        expenseOrderRef: c.original.reference,
        expenseOrderSha256: c.original.rawSha256,
      };
    expect(() => step(c.f, c.w.state, op, 'MISSING', '60000')).toThrow(
      'QUALIFIED_INDEPENDENT_SERVICE_EXPENSE_ORDER_REQUIRED',
    );
    expect(() =>
      step(c.f, c.w.state, op, 'MUTATED', '60000', {
        ...c.original,
        rawText: c.original.rawText + ' ',
      }),
    ).toThrow('ACTUAL_UNIQUE_IMMUTABLE_LOGISTICS_EXPENSE_ORIGINAL_REQUIRED');
    const over = c.f.expense(c.w.frame.events[0]!.fingerprint, '2', 'OVER');
    expect(() =>
      step(
        c.f,
        c.w.state,
        {
          ...op,
          expenseOrderRef: over.reference,
          expenseOrderSha256: over.rawSha256,
        },
        'OVER',
        '60000',
        over,
      ),
    ).toThrow('ACTUAL_SERVICE_WAGE_LIABILITY_CAP_EXCEEDED');
    const other = c.f.expense(
      c.f.scheduled.frame.events[0]!.fingerprint,
      '1',
      'MANUFACTURING',
    );
    expect(() =>
      step(
        c.f,
        c.w.state,
        {
          ...op,
          workEventFingerprint: c.f.scheduled.frame.events[0]!.fingerprint,
          expenseOrderRef: other.reference,
          expenseOrderSha256: other.rawSha256,
        },
        'WRONG_WORK',
        '60000',
        other,
      ),
    ).toThrow('ACTUAL_PRIOR_INDEPENDENT_WORK_ORIGIN_REQUIRED');
  });
  it('preserves exact unpaid wage liability, only actual settled amount enters cost, and never charges the same input twice', () => {
    const c = chain(),
      half = c.f.expense(c.w.frame.events[0]!.fingerprint, '0.5', 'HALF');
    const op = {
      action: 'PAY_INPUTS',
      transferId: c.f.request.transferId,
      workEventFingerprint: c.w.frame.events[0]!.fingerprint,
      expenseOrderRef: half.reference,
      expenseOrderSha256: half.rawSha256,
    };
    const paid = step(c.f, c.w.state, op, 'HALF_PAY', '60000', half),
      payload = JSON.parse(paid.frame.events[0]!.canonicalPayload);
    expect(payload.remainingExactWageLiability).toEqual({
      numerator: '1',
      denominator: '2',
    });
    expect(() =>
      step(c.f, paid.state, op, 'DUPLICATE_INPUT', '60000', half),
    ).toThrow('ACTUAL_UNIQUE_IMMUTABLE_LOGISTICS_EXPENSE_ORIGINAL_REQUIRED');
    const second = c.f.expense(
      c.w.frame.events[0]!.fingerprint,
      '0.5',
      'SECOND_HALF',
    );
    const fully = step(
      c.f,
      paid.state,
      {
        ...op,
        expenseOrderRef: second.reference,
        expenseOrderSha256: second.rawSha256,
      },
      'SECOND_PAY',
      '60000',
      second,
    );
    expect(
      JSON.parse(fully.frame.events[0]!.canonicalPayload)
        .remainingExactWageLiability,
    ).toEqual({ numerator: '0', denominator: '1' });
  });
  it('rejects duplicate service minutes for another transfer, while duplicate exact command replays consume nothing twice', () => {
    const f = createIndustryLogisticsExecutionFixture(),
      a = step(f, f.state, f.book, 'BOOK'),
      second = {
        ...f.book,
        transferId: 'SECOND_TRANSFER',
        request: { ...f.request, transferId: 'SECOND_TRANSFER' },
      };
    const b = step(f, a.state, second, 'SECOND_BOOK'),
      s1 = step(
        f,
        b.state,
        { action: 'SHIP', transferId: f.request.transferId },
        'SHIP1',
      ),
      s2 = step(
        f,
        s1.state,
        { action: 'SHIP', transferId: 'SECOND_TRANSFER' },
        'SHIP2',
      );
    const worked = step(
      f,
      s2.state,
      {
        action: 'SERVICE_WORK',
        transferId: f.request.transferId,
        allocations: [f.allocation],
      },
      'WORK1',
      '60000',
    );
    expect(() =>
      step(
        f,
        worked.state,
        {
          action: 'SERVICE_WORK',
          transferId: 'SECOND_TRANSFER',
          allocations: [f.allocation],
        },
        'DOUBLE_WORK',
        '60000',
      ),
    ).toThrow('SERVICE_AND_MANUFACTURING_OR_PRIOR_SERVICE_TIME_OVERLAP');
    const before = readIndustryInternalLogisticsExecutionState(worked.state);
    const duplicate = replayIndustryInternalLogisticsFrame(
      {
        state: worked.state,
        sourceInputs: f.sources,
        context: context(f, worked.state),
        frame: worked.frame,
      },
      sha,
    );
    expect(duplicate.outcome).toBe('EXACT_DUPLICATE');
    expect(
      readIndustryInternalLogisticsExecutionState(duplicate.state).bookings,
    ).toEqual(before.bookings);
  });
  it('recomputes complete journals and receipt, rejecting missing or extra economic effects', () => {
    const c = chain();
    expect(() =>
      replayIndustryInternalLogisticsFrame(
        {
          state: c.f.state,
          sourceInputs: c.f.sources,
          context: context(c.f, c.f.state),
          frame: { ...c.b.frame, inventoryPostings: [] },
        },
        sha,
      ),
    ).toThrow('EXACT_COMPLETE_LOGISTICS_FRAME_AND_BOTH_JOURNALS_REQUIRED');
    expect(() =>
      replayIndustryInternalLogisticsFrame(
        {
          state: c.b.state,
          sourceInputs: c.f.sources,
          context: context(c.f, c.b.state),
          frame: {
            ...c.s.frame,
            financialPostingBatches: c.p.frame.financialPostingBatches,
          },
        },
        sha,
      ),
    ).toThrow('EXACT_COMPLETE_LOGISTICS_FRAME_AND_BOTH_JOURNALS_REQUIRED');
    expect(() =>
      replayIndustryInternalLogisticsFrame(
        {
          state: c.p.state,
          sourceInputs: c.f.sources,
          context: context(c.f, c.p.state),
          frame: {
            ...c.d.frame,
            receipt: { ...c.d.frame.receipt, outcome: 'REJECTED' },
          },
        },
        sha,
      ),
    ).toThrow();
  });
  it('merges private immutable source/input originals by actual references, rejects copies and conflicts', () => {
    const c = chain(),
      merged = mergeIndustryInternalLogisticsReplaySources(
        [c.f.sources],
        [c.f.sourceInput([c.original])],
        sha,
      );
    expect(merged).toHaveLength(1);
    expect(
      readIndustryInternalLogisticsReplaySources(merged[0]!).expenseOriginals,
    ).toHaveLength(1);
    expect(() =>
      readIndustryInternalLogisticsReplaySources({ ...c.f.sources }),
    ).toThrow('GENUINE_LOGISTICS_REPLAY_SOURCE_DATA_REQUIRED');
    const bad = { ...c.original, rawText: c.original.rawText + ' ' };
    bad.rawSha256 = sha(bad.rawText);
    expect(() =>
      mergeIndustryInternalLogisticsReplaySources(
        [merged[0]!],
        [c.f.sourceInput([bad])],
        sha,
      ),
    ).toThrow('IMMUTABLE_LOGISTICS_EXPENSE_REFERENCE_CONFLICT');
  });
});
