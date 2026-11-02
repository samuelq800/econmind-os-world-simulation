/** TEST_ONLY conditional kernel receipts. They are not completed work facts,
 * payroll recognition permissions, runtime registration or actual c427 income. */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import {
  POSTWAR_OPENING_PAYROLL_COMMAND,
  POSTWAR_OPENING_PAYROLL_POLICY,
  POSTWAR_PAYROLL_RECOGNITION_COMMAND,
  POSTWAR_PAYROLL_RECOGNITION_EVENT,
  preparePostwarOpeningPayroll,
  replayPostwarOpeningPayroll,
  type OpeningPayrollSource,
  type OpeningPayrollRecognition,
} from '../../packages/core/src/commands/postwar-opening-payroll.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const now = '2026-10-28T00:00:00.000Z';
const day = C.SIMULATION_TICKS_PER_DAY;
function fixture() {
  const worldId = C.worldId('WORLD_TEST_ONLY_PAYROLL');
  const countryId = C.countryId('COUNTRY_01');
  const bank = C.legalEntityId('ENTITY_TEST_ONLY_BANK');
  const op = C.legalEntityId('ENTITY_TEST_ONLY_OP');
  const hh = C.legalEntityId('ENTITY_TEST_ONLY_HH');
  const accounts = [op, hh].map((ownerId, index) => {
    const asset = C.createFinancialAccount({
      worldId,
      countryId,
      ownerId,
      accountId: C.financialAccountId(`ACCOUNT_TEST_ONLY_ASSET_${index}`),
      accountClass: 'ASSET',
      currency: 'AAA',
      claimId: C.financialClaimId(`CLAIM_TEST_ONLY_${index}`),
      counterpartyEntityId: bank,
    });
    const liability = C.createFinancialAccount({
      ...asset,
      accountId: C.financialAccountId(`ACCOUNT_TEST_ONLY_LIABILITY_${index}`),
      ownerId: bank,
      accountClass: 'LIABILITY',
      counterpartyEntityId: ownerId,
    });
    return { asset, liability };
  });
  const opening = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_TEST_ONLY_PAYROLL'),
      sourceKind: 'TEST_FIXTURE',
      locator: 'tests/world-core/postwar-opening-payroll.test.ts',
      sourceVersion: 'TEST_ONLY_V1',
      payload: { meaning: 'TEST_ONLY_NOT_WORK_DONE_OR_AUTHORITY' },
    },
    sha,
  );
  const seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_TEST_ONLY_PAYROLL'),
      worldId,
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [opening],
      inventoryEntries: [],
      financialBatches: accounts.map(({ asset, liability }, i) => ({
        batchId: C.financialOpeningBatchId(`OPENING_TEST_ONLY_${i}`),
        sourceId: opening.sourceId,
        settlementCurrency: 'AAA',
        legs: [
          {
            legId: C.financialOpeningLegId(`OPENING_ASSET_${i}`),
            account: asset,
            direction: 'DEBIT',
            amount: C.Money.from(i === 0 ? '100' : '20', 'AAA'),
            counterpartLegId: C.financialOpeningLegId(`OPENING_LIABILITY_${i}`),
          },
          {
            legId: C.financialOpeningLegId(`OPENING_LIABILITY_${i}`),
            account: liability,
            direction: 'CREDIT',
            amount: C.Money.from(i === 0 ? '100' : '20', 'AAA'),
            counterpartLegId: C.financialOpeningLegId(`OPENING_ASSET_${i}`),
          },
        ],
      })),
    },
    sha,
  );
  const source: OpeningPayrollSource = {
    worldId,
    countryId,
    seedFingerprint: seed.fingerprint,
    sourceRevision: `POSTWAR_E03_${'1'.repeat(64)}`,
    obligationId: 'OBLIGATION_TEST_ONLY_FIRST_DAY',
    positionId: 'POSITION_TEST_ONLY_FILLED',
    coveredCount: '1',
    annualWage: '100.000001',
    wageVersion: 'WAGE_TEST_ONLY_V1',
    currency: 'AAA',
    reservedAmount: '0.28',
    payerEntityId: op,
    employerRole: 'OP',
    payeeEntityId: hh,
    bankEntityId: bank,
    payerAsset: accounts[0]!.asset,
    payerLiability: accounts[0]!.liability,
    payeeAsset: accounts[1]!.asset,
    payeeLiability: accounts[1]!.liability,
  };
  const payload = {
    schemaVersion: 'postwar-completed-payroll-day-recognition-v1',
    worldId,
    countryId,
    seedFingerprint: seed.fingerprint,
    sourceRevision: source.sourceRevision,
    obligationId: source.obligationId,
    positionId: source.positionId,
    coveredCount: source.coveredCount,
    periodStartSimTime: '0',
    periodEndSimTime: day,
    workOriginalRef: `sha256:${'2'.repeat(64)}`,
  };
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      commandType: POSTWAR_PAYROLL_RECOGNITION_COMMAND,
      commandId: 'COMMAND_TEST_ONLY_RECOGNITION',
      worldId,
      countryId,
      actorId: 'ACTOR_TEST_ONLY',
      authSubject: '11111111-1111-4111-8111-111111111111',
      correlationId: 'CORRELATION_TEST_ONLY',
      expectedWorldVersion: '0',
      idempotencyKey: 'TEST_ONLY_RECOGNITION',
      officeId: null,
      payload,
      simTime: day,
      submittedAtReal: now,
    },
    sha,
  );
  const event = C.parseAuthoritativeEvent(
    {
      schemaVersion: C.EVENT_SCHEMA_VERSION,
      eventType: POSTWAR_PAYROLL_RECOGNITION_EVENT,
      eventId: 'EVENT_TEST_ONLY_RECOGNITION',
      worldId,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: '1',
      sequence: '1',
      simTime: day,
      correctsEventId: null,
      recordedAtReal: now,
      payload,
    },
    sha,
  );
  const transition = C.createAuthoritativeTransition({
    command,
    worldVersionBefore: '0',
    worldVersionAfter: '1',
    events: [event],
  });
  const step = {
    command,
    transition,
    inventoryPostings: [],
    financialPostingBatches: [],
  };
  const recognition: OpeningPayrollRecognition = {
    evidenceClass: 'TEST_ONLY',
    step,
  };
  const financial = C.rebuildV08LedgersFromLineage({
    seed,
    transitions: [step],
    sha256Hex: sha,
  }).financial;
  const logical = C.canonicalSha256(
    C.canonicalHashInput({
      seed: source.seedFingerprint,
      obligation: source.obligationId,
      policy: POSTWAR_OPENING_PAYROLL_POLICY.version,
    }),
    sha,
  )
    .slice(7)
    .toUpperCase();
  const paymentCommand = C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      commandType: POSTWAR_OPENING_PAYROLL_COMMAND,
      commandId: 'COMMAND_TEST_ONLY_PAYROLL',
      worldId,
      countryId,
      actorId: 'ACTOR_TEST_ONLY',
      authSubject: '11111111-1111-4111-8111-111111111111',
      correlationId: 'CORRELATION_TEST_ONLY',
      expectedWorldVersion: '1',
      idempotencyKey: `PAYROLL_${logical}`,
      officeId: null,
      payload: {
        schemaVersion: 'postwar-opening-payroll-command-v1',
        obligationId: source.obligationId,
        recognitionEventId: event.eventId,
        policyVersion: POSTWAR_OPENING_PAYROLL_POLICY.version,
      },
      simTime: day,
      submittedAtReal: now,
    },
    sha,
  );
  return {
    seed,
    source,
    recognition,
    financial,
    command: paymentCommand,
    eventSequence: '2',
    observedAtReal: now,
    sha256Hex: sha,
  };
}
describe('TEST_ONLY first-day OP LC-deposit payroll; no real work or authority issued', () => {
  it('posts six balanced legs, preserves deposit mirrors, and retains the exact unpaid rational remainder', () => {
    const f = fixture(),
      r = preparePostwarOpeningPayroll(f),
      batch = r.step.financialPostingBatches[0]!;
    expect(r.evidenceClass).toBe('TEST_ONLY');
    expect(r.paidDepositClaimAmount).toBe('0.277777');
    expect(r.unpaidRemainder).toEqual({
      numerator: '281',
      denominator: '360000000',
    });
    expect(r.obligationState).toBe('PARTIALLY_PAID_EXACT_REMAINDER_OPEN');
    expect(batch.legs).toHaveLength(6);
    const byEntity = new Map<string, C.Money>();
    for (const leg of batch.legs) {
      const before =
        byEntity.get(leg.account.ownerId) ?? C.Money.from('0', 'AAA');
      byEntity.set(
        leg.account.ownerId,
        leg.direction === 'DEBIT'
          ? before.add(leg.amount)
          : before.subtract(leg.amount),
      );
    }
    expect([...byEntity.values()].every((v) => v.amount.isZero())).toBe(true);
    expect(
      batch.legs.filter((l) => l.account.accountClass === 'CASH'),
    ).toHaveLength(0);
    expect(
      batch.legs.filter((l) =>
        ['EXPENSE', 'REVENUE'].includes(l.account.accountClass),
      ),
    ).toHaveLength(2);
    expect(
      batch.legs
        .filter((l) => ['EXPENSE', 'REVENUE'].includes(l.account.accountClass))
        .every((l) => l.account.claimId === null),
    ).toBe(true);
    const earnedN = BigInt(r.exactEarned.numerator),
      earnedD = BigInt(r.exactEarned.denominator),
      remainderN = BigInt(r.unpaidRemainder.numerator),
      remainderD = BigInt(r.unpaidRemainder.denominator);
    expect(
      277777n * earnedD * remainderD + remainderN * 1000000n * earnedD,
    ).toBe(earnedN * 1000000n * remainderD);
    const rebuilt = C.rebuildV08LedgersFromLineage({
      seed: f.seed,
      transitions: [f.recognition.step, r.step],
      sha256Hex: sha,
    });
    expect(C.canonicalSerialize(rebuilt.financial)).toBe(
      C.canonicalSerialize(r.financial),
    );
    expect(
      C.canonicalSerialize(
        replayPostwarOpeningPayroll({ ...f, step: r.step }).financial,
      ),
    ).toBe(C.canonicalSerialize(r.financial));
  });
  it('does not infer completed work from a filled opening position, a reservation or the due time', () => {
    const f = fixture();
    expect(() =>
      preparePostwarOpeningPayroll({
        ...f,
        recognition: undefined as unknown as OpeningPayrollRecognition,
      }),
    ).toThrow('COMPLETED_DAY_RECOGNITION_REQUIRED');
    const original = f.recognition.step;
    expect(() =>
      preparePostwarOpeningPayroll({
        ...f,
        recognition: {
          evidenceClass: 'TEST_ONLY',
          step: {
            ...original,
            command: {
              ...original.command,
              commandType: C.commandType('OPENING_RESERVED_NOT_ACCRUED'),
            },
          },
        },
      }),
    ).toThrow();
  });
  it('refuses altered original identity, insufficient reserved funds and a different bank mirror', () => {
    const f = fixture();
    expect(() =>
      preparePostwarOpeningPayroll({
        ...f,
        source: { ...f.source, coveredCount: '2' },
      }),
    ).toThrow('RECOGNITION_ORIGINAL_SCOPE_DIFFERS');
    expect(() =>
      preparePostwarOpeningPayroll({
        ...f,
        source: { ...f.source, reservedAmount: '0.1' },
      }),
    ).toThrow('FUNDS_OR_RESERVATION_INSUFFICIENT');
    expect(() =>
      preparePostwarOpeningPayroll({
        ...f,
        source: { ...f.source, bankEntityId: 'OTHER_BANK' },
      }),
    ).toThrow('SAME_BANK_DEPOSIT_CLAIM_ROLES_REQUIRED');
  });
  it('rejects replay payload/posting corruption and never pays the same stable obligation twice', () => {
    const f = fixture(),
      r = preparePostwarOpeningPayroll(f);
    expect(() =>
      replayPostwarOpeningPayroll({
        ...f,
        step: { ...r.step, financialPostingBatches: [] },
      }),
    ).toThrow('PAYROLL_REPLAY_DIFFERS');
    const c = C.parseCanonicalCommand(
      {
        schemaVersion: f.command.schemaVersion,
        commandType: f.command.commandType,
        worldId: f.command.worldId,
        countryId: f.command.countryId,
        actorId: f.command.actorId,
        authSubject: f.command.authSubject,
        correlationId: f.command.correlationId,
        idempotencyKey: f.command.idempotencyKey,
        officeId: f.command.officeId,
        submittedAtReal: f.command.submittedAtReal,
        simTime: day,
        payload: JSON.parse(f.command.canonicalPayload),
        expectedWorldVersion: '2',
        commandId: 'COMMAND_TEST_ONLY_DOUBLE_PAY',
      },
      sha,
    );
    expect(() =>
      preparePostwarOpeningPayroll({
        ...f,
        command: c,
        financial: r.financial,
        eventSequence: '3',
      }),
    ).toThrow();
  });
});
