/** Actual tiny deterministic journals. TEST_ONLY principals/orders; no native
 * actor/SQL admission or production deployment is claimed. */
import { describe, it, expect } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import {
  createIndustryInternalLogisticsExecutionState,
  prepareIndustryInternalLogisticsFrame,
  readIndustryInternalLogisticsExecutionState,
  sealIndustryFirstDayLogisticsExecution,
  readIndustryFirstDayLogisticsExecution,
} from '../../packages/core/src/inventory/industry-internal-logistics-execution.js';
import {
  prepareFinanceSocialReplayContinuation,
  appendFinanceSocialReplayPage,
  readFinanceSocialReplayContinuation,
} from '../../packages/core/src/commands/finance-social-replay-continuation.js';
import { prepareIndustryUtilityExecution } from '../../packages/core/src/commands/industry-utility-execution.js';
import {
  createIndustryLogisticsExecutionFixture,
  logisticsSha as sha,
  logisticsAt as at,
} from '../support/industry-logistics-execution-fixture.js';
function shipped(beneficial = false) {
  const f = createIndustryLogisticsExecutionFixture({ beneficial });
  const book = prepareIndustryInternalLogisticsFrame(
    {
      state: f.state,
      command: f.command(f.state, f.book, 'BOOK'),
      observedAtReal: at,
    },
    sha,
  );
  const ship = prepareIndustryInternalLogisticsFrame(
    {
      state: book.state,
      command: f.command(
        book.state,
        { action: 'SHIP', transferId: f.request.transferId },
        'SHIP',
      ),
      observedAtReal: at,
    },
    sha,
  );
  return { f, book, ship };
}
function workOrder(
  f: ReturnType<typeof createIndustryLogisticsExecutionFixture>,
) {
  const reference = 'TEST_ONLY_CONTROLLED_WORK_ORDER';
  const rawText = C.canonicalSerialize({
    schemaVersion: 'industry-logistics-service-work-order-v1',
    purpose: 'DISTINCT_LOGISTICS_SERVICE_WORK',
    inputRef: reference,
    worldId: f.world,
    countryId: f.country,
    facilityId: f.workSource.facilityId,
    operatorId: f.operator,
    runId: f.request.runId,
    seedFingerprint: f.seed.fingerprint,
    transferId: f.request.transferId,
    labourSourceRef: f.labour.sourceRef,
    labourSourceRawSha256: f.labour.sourceRawSha256,
    allocations: [f.allocation],
  });
  return { reference, rawText, rawSha256: sha(rawText) };
}
describe('fixed logistics orders and existing child wage claims', () => {
  it('resolves a controlled work reference and reruns the actual independent labour allocation', () => {
    const { f, ship } = shipped(),
      order = workOrder(f),
      source = f.sourceInput([], [order]);
    const command = f.command(
      ship.state,
      {
        action: 'SERVICE_WORK',
        transferId: f.request.transferId,
        workOrderRef: order.reference,
        workOrderSha256: order.rawSha256,
      },
      'CONTROLLED_WORK',
      '60000',
    );
    const frames = [
        f.scheduled.frame,
        ...readIndustryInternalLogisticsExecutionState(ship.state).frames,
      ],
      head = { worldVersion: '3', eventSequence: '3' };
    const view = readFinanceSocialReplayContinuation(
      appendFinanceSocialReplayPage({
        continuation: prepareFinanceSocialReplayContinuation(
          {
            opening: f.opening,
            expectedHead: head,
            socialCountries: [f.social],
            fxOriginals: [],
            openingEncumbrances: [],
            industryWorkSources: [f.workSource],
            industryLogisticsSources: [source],
          },
          sha,
        ),
        sha256Hex: sha,
        page: {
          schemaVersion: 'finance-social-replay-page-v1',
          worldId: f.world,
          seedFingerprint: f.seed.fingerprint,
          fromHead: { worldVersion: '0', eventSequence: '0' },
          throughHead: head,
          expectedHead: head,
          frames,
          framesSha256: C.canonicalSha256(C.canonicalHashInput(frames), sha),
        },
      }),
    );
    const preparation = prepareIndustryUtilityExecution(
        { command, replay: view, source: f.utilitySource },
        sha,
      ),
      prior = view.result.industryLogisticsState![0]!;
    expect(() =>
      createIndustryInternalLogisticsExecutionState(
        { preparation, sourceInputs: source },
        sha,
      ),
    ).toThrow(/CANNOT_BE_RESET/);
    const state = createIndustryInternalLogisticsExecutionState(
      { preparation, sourceInputs: source, state: prior },
      sha,
    );
    const result = prepareIndustryInternalLogisticsFrame(
      { state, command, observedAtReal: at },
      sha,
    );
    expect(
      JSON.parse(result.frame.events[0]!.canonicalPayload).workOrderRef,
    ).toBe(order.reference);
    expect(
      readIndustryInternalLogisticsExecutionState(result.state).bookings,
    ).toHaveLength(1);
    expect(() =>
      prepareIndustryInternalLogisticsFrame(
        { state: ship.state, command, observedAtReal: at },
        sha,
      ),
    ).toThrow(/REGISTERED_LOGISTICS_WORK_ORDER/);
    const bad = { ...order, rawSha256: 'f'.repeat(64) };
    expect(() => f.sourceInput([], [bad])).toThrow(/WORK_ORDER_BYTES/);
  });
  it('pays only the actual child beneficiary range with all six reciprocal legs', () => {
    const { f, ship } = shipped(true);
    const work = prepareIndustryInternalLogisticsFrame(
      {
        state: ship.state,
        command: f.command(
          ship.state,
          {
            action: 'SERVICE_WORK',
            transferId: f.request.transferId,
            allocations: [f.allocation],
          },
          'WORK',
          '60000',
        ),
        observedAtReal: at,
      },
      sha,
    );
    const receipt = f.child!.receipt,
      sub = receipt.subaccounts.find((s) => s.groupId === 'TEST_GROUP_ONE')!;
    const original = f.expense(work.frame.events[0]!.fingerprint),
      raw = C.canonicalSerialize({
        ...JSON.parse(original.rawText),
        householdAccountId: sub.account.accountId,
      });
    const order = { ...original, rawText: raw, rawSha256: sha(raw) };
    const command = f.command(
      work.state,
      {
        action: 'PAY_INPUTS',
        transferId: f.request.transferId,
        workEventFingerprint: work.frame.events[0]!.fingerprint,
        expenseOrderRef: order.reference,
        expenseOrderSha256: order.rawSha256,
      },
      'CHILD_PAY',
      '60000',
    );
    const payment = prepareIndustryInternalLogisticsFrame(
      {
        state: work.state,
        command,
        observedAtReal: at,
        expenseOriginal: order,
      },
      sha,
    );
    const batch = payment.frame
      .financialPostingBatches[0] as C.FinancialPostingBatch;
    expect(batch.legs).toHaveLength(6);
    expect(batch.legs[3]!.account.accountId).toBe(sub.account.accountId);
    const balances = payment.financial.positions;
    expect(
      balances
        .find((p) => p.account.accountId === f.hh.asset.accountId)
        ?.netDebitBalance.amount.isZero() ?? true,
    ).toBe(true);
    expect(
      balances
        .find((p) => p.account.accountId === sub.account.accountId)!
        .netDebitBalance.amount.toString(),
    ).toBe('26');
    expect(
      C.aggregateBeneficialHousingLiquidClaim(payment.financial, receipt)
        .availableAmount,
    ).toBe('101');
    const other = receipt.subaccounts.find(
        (s) => s.groupId === 'TEST_GROUP_TWO',
      )!,
      wrongRaw = C.canonicalSerialize({
        ...JSON.parse(raw),
        householdAccountId: other.account.accountId,
      });
    const wrong = { ...order, rawText: wrongRaw, rawSha256: sha(wrongRaw) };
    expect(() =>
      prepareIndustryInternalLogisticsFrame(
        {
          state: work.state,
          command: f.command(
            work.state,
            {
              action: 'PAY_INPUTS',
              transferId: f.request.transferId,
              workEventFingerprint: work.frame.events[0]!.fingerprint,
              expenseOrderRef: wrong.reference,
              expenseOrderSha256: wrong.rawSha256,
            },
            'WRONG_CHILD_PAY',
            '60000',
          ),
          observedAtReal: at,
          expenseOriginal: wrong,
        },
        sha,
      ),
    ).toThrow(/WAGE_LIABILITY_CAP/);
    const delivery = prepareIndustryInternalLogisticsFrame(
      {
        state: payment.state,
        command: f.command(
          payment.state,
          { action: 'DELIVER', transferId: f.request.transferId },
          'CHILD_DELIVER',
          '60000',
        ),
        observedAtReal: at,
      },
      sha,
    );
    const frames = [
        f.scheduled.frame,
        ...readIndustryInternalLogisticsExecutionState(delivery.state).frames,
      ],
      head = {
        worldVersion: delivery.frame.transition.worldVersionAfter,
        eventSequence: delivery.frame.events.at(-1)!.sequence,
      };
    const full = readFinanceSocialReplayContinuation(
      appendFinanceSocialReplayPage({
        continuation: prepareFinanceSocialReplayContinuation(
          {
            opening: f.opening,
            expectedHead: head,
            socialCountries: [f.social],
            fxOriginals: [],
            openingEncumbrances: [],
            industryWorkSources: [f.workSource],
            industryLogisticsSources: [f.sourceInput([order])],
          },
          sha,
        ),
        sha256Hex: sha,
        page: {
          schemaVersion: 'finance-social-replay-page-v1',
          worldId: f.world,
          seedFingerprint: f.seed.fingerprint,
          fromHead: { worldVersion: '0', eventSequence: '0' },
          throughHead: head,
          expectedHead: head,
          frames,
          framesSha256: C.canonicalSha256(C.canonicalHashInput(frames), sha),
        },
      }),
    );
    const token = sealIndustryFirstDayLogisticsExecution(
      { replay: full, frame: delivery.frame },
      sha,
    );
    expect(
      readIndustryFirstDayLogisticsExecution(token)
        .operatingFactCanonicalPayload,
    ).toContain('named-handover');
    expect(full.result.financialState!.appliedBatches).toHaveLength(1);
  });
  it('cannot silently discard an existing same-source private logistics state', () => {
    const { f, book } = shipped();
    const missing = { ...f.prep };
    expect(() =>
      createIndustryInternalLogisticsExecutionState(
        { preparation: missing, sourceInputs: f.sources, state: book.state },
        sha,
      ),
    ).toThrow();
  });
  it('requires current genuine employment and releases only actual paid cash from the opening aggregate', () => {
    const { f, ship } = shipped();
    const work = prepareIndustryInternalLogisticsFrame(
      {
        state: ship.state,
        command: f.command(
          ship.state,
          {
            action: 'SERVICE_WORK',
            transferId: f.request.transferId,
            allocations: [f.allocation],
          },
          'WORK',
          '60000',
        ),
        observedAtReal: at,
      },
      sha,
    );
    const order = f.expense(work.frame.events[0]!.fingerprint),
      payment = prepareIndustryInternalLogisticsFrame(
        {
          state: work.state,
          command: f.command(
            work.state,
            {
              action: 'PAY_INPUTS',
              transferId: f.request.transferId,
              workEventFingerprint: work.frame.events[0]!.fingerprint,
              expenseOrderRef: order.reference,
              expenseOrderSha256: order.rawSha256,
            },
            'PAY',
            '60000',
          ),
          observedAtReal: at,
          expenseOriginal: order,
        },
        sha,
      );
    const frames = [
        f.scheduled.frame,
        ...readIndustryInternalLogisticsExecutionState(payment.state).frames,
      ],
      head = {
        worldVersion: payment.frame.transition.worldVersionAfter,
        eventSequence: payment.frame.events.at(-1)!.sequence,
      };
    const replay = (
      socialCountries: readonly (typeof f.social)[],
      openingAmount = '80',
    ) =>
      readFinanceSocialReplayContinuation(
        appendFinanceSocialReplayPage({
          continuation: prepareFinanceSocialReplayContinuation(
            {
              opening: f.opening,
              expectedHead: head,
              socialCountries,
              fxOriginals: [],
              openingEncumbrances: [
                {
                  reference: f.op.asset.accountId,
                  accountId: f.op.asset.accountId,
                  currency: 'XBB',
                  amount: openingAmount,
                },
              ],
              industryWorkSources: [f.workSource],
              industryLogisticsSources: [f.sourceInput([order])],
            },
            sha,
          ),
          sha256Hex: sha,
          page: {
            schemaVersion: 'finance-social-replay-page-v1',
            worldId: f.world,
            seedFingerprint: f.seed.fingerprint,
            fromHead: { worldVersion: '0', eventSequence: '0' },
            throughHead: head,
            expectedHead: head,
            frames,
            framesSha256: C.canonicalSha256(C.canonicalHashInput(frames), sha),
          },
        }),
      );
    expect(replay([f.social]).complete).toBe(true);
    expect(() => replay([])).toThrow(/CURRENT_LABOUR_COUNTRY_REQUIRED/);
    const separation = C.applyLabourFacts({
      boundary: C.createE01DailyBoundary('0'),
      populationAvailability: [
        {
          countryId: f.country,
          locationId: 'REGION_02_E1',
          workingAgeAvailable: '11',
        },
      ],
      state: f.social.state.labour,
      facts: [
        {
          kind: 'LABOUR_SEPARATION',
          factId: 'ACTUAL_TEST_ONLY_LOGISTICS_SEPARATION',
          countryId: f.country,
          locationId: 'REGION_02_E1',
          dayIndex: '0',
          positionId: f.allocation.positionId,
          skill: 'LOW',
          count: '1',
        },
      ],
    });
    const unemployed = {
      ...f.social,
      state: { ...f.social.state, labour: separation.state },
    };
    expect(() => replay([unemployed])).toThrow(
      /CURRENT_LOGISTICS_EMPLOYMENT_REQUIRED/,
    );
    expect(() => replay([f.social], '0.5')).toThrow(
      /LOGISTICS_PAYMENT_EXCEEDS_OPENING_RESERVATION/,
    );
  });
});
