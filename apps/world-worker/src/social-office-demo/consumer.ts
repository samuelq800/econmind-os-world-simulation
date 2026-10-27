/** Read-only presentation of D's complete protected replay result; never a grant or a ledger. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  Money,
  parseCanonicalCommand,
  parseSocialEmploymentServiceCommand,
  type FinancialLedgerState,
  type InventoryLedgerState,
  type SocialOfficeStateV1,
} from '@econmind/core';
import type { SocialOfficeDemoScenario } from './scenario-input.js';

// The one narrow server-only package entry. Browser ownership rules deny it.
export { PostgresSqlDatabase } from '../persistence/postgres-sql-database.js';
export { createSocialOfficeSimulatedAtomicRepository } from '../persistence/social-office-atomic-repository.js';
export type { SocialOfficeAtomicResult } from '../persistence/social-office-atomic-repository.js';
export { withSocialOfficeSimulatedTransaction } from '../persistence/social-office-resource-protection.js';
export { SOCIAL_DEMO_EXECUTION_IDENTITY_V1 } from './source-facts.js';
export type { SocialOfficeDemoScenario } from './scenario-input.js';

export interface SocialOfficeDemoProjectionData {
  readonly schemaVersion: string;
  readonly sourceClass: string;
  readonly scope: {
    readonly worldId: string;
    readonly countryId: string;
    readonly locationId: string;
  };
  readonly head: {
    readonly worldVersion: string;
    readonly eventSequence: string;
  };
  readonly source: {
    readonly generation: string;
    readonly manifestHash: string;
    readonly asOf: { readonly simTime: string };
  };
  readonly social: SocialOfficeStateV1;
  readonly inventory: InventoryLedgerState;
  readonly financial: FinancialLedgerState;
}
function fail(s: string): never {
  throw Error(`SOCIAL_DEMO_PROJECTION: ${s}`);
}
function uint(s: string): bigint {
  if (!/^(?:0|[1-9]\d*)$/u.test(s)) fail('complete canonical count required');
  return BigInt(s);
}
const sum = (xs: readonly string[]) =>
  xs.reduce((a, b) => a + uint(b), 0n).toString();
function budget(s: SocialOfficeStateV1, budgetId: string) {
  const rows = s.budgetCommitments.filter((b) => b.budgetId === budgetId);
  if (rows.length !== 1) fail('approved budget absent or ambiguous');
  const b = rows[0]!;
  if (
    b.approvedAmount.currency !== 'XAA' ||
    b.committedAmount.currency !== 'XAA'
  )
    fail('budget currency mismatch');
  const remaining = Money.from(b.approvedAmount.amount, 'XAA').subtract(
    Money.from(b.committedAmount.amount, 'XAA'),
  );
  if (remaining.amount.isNegative()) fail('budget overcommitted');
  return {
    committed: b.committedAmount.amount,
    remaining: remaining.toCanonicalValue().amount,
  };
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}

/** Call only after the real D repository has returned its authorized full-prefix snapshot. */
export function projectSocialOfficeDemoResult(
  input: SocialOfficeDemoProjectionData,
  scenario: Readonly<SocialOfficeDemoScenario>,
) {
  if (
    input.schemaVersion !== 'social-office-simulated-projection-v1' ||
    input.sourceClass !== 'SIMULATED_OPENING' ||
    input.scope.worldId !== scenario.scope.worldId ||
    input.scope.countryId !== scenario.scope.countryId ||
    input.scope.locationId !== scenario.scope.locationId ||
    input.social.worldId !== input.scope.worldId ||
    input.social.countryId !== input.scope.countryId ||
    input.social.locationId !== input.scope.locationId ||
    input.inventory.worldId !== input.scope.worldId ||
    input.financial.worldId !== input.scope.worldId ||
    input.inventory.worldVersion !== input.head.worldVersion ||
    input.financial.worldVersion !== input.head.worldVersion
  )
    fail('mixed or incomplete protected replay snapshot');
  uint(input.head.worldVersion);
  uint(input.head.eventSequence);
  uint(input.source.generation);
  const selectorTime = uint(input.source.asOf.simTime),
    dayIndex = (selectorTime / 86400000n).toString();
  if (
    !/^[a-f0-9]{64}$/u.test(input.source.manifestHash) ||
    selectorTime % 86400000n !== 0n ||
    !['0', '1', '10'].includes(dayIndex)
  )
    fail('source selector mismatch');
  const state = input.social,
    labour = state.employment.labour.aggregates.filter(
      (a) =>
        a.countryId === input.scope.countryId &&
        a.locationId === input.scope.locationId,
    );
  if (labour.length === 0) fail('complete Labour slice absent');
  const position = state.employment.labour.positions.filter(
    (p) =>
      p.positionId === 'POSITION_SIM_CLINIC_NURSE_02' &&
      p.countryId === input.scope.countryId &&
      p.locationId === input.scope.locationId,
  );
  const pools = state.employment.servicePools.filter(
    (p) => p.poolId === 'SIM_EMP_POOL_MEDIUM_D1',
  );
  if (position.length !== 1 || pools.length !== 1)
    fail('original vacancy or service pool absent');
  const p = position[0]!,
    pool = pools[0]!;
  const vacancies = uint(p.requiredCount) - uint(p.employedCount),
    freeSlots =
      uint(pool.capacitySlots) -
      uint(pool.usedSlots) -
      uint(pool.reservedSlots);
  if (vacancies < 0n || freeSlots < 0n)
    fail('invalid joined employment availability');
  const plans = state.employment.plans.filter((x) => {
    const digest = (s: string) => createHash('sha256').update(s).digest('hex');
    const command = parseCanonicalCommand(
      JSON.parse(x.canonicalCommand) as unknown,
      digest,
    );
    const parsed = parseSocialEmploymentServiceCommand(command, digest);
    if (
      parsed.kind !== 'PLAN' ||
      command.commandId !== x.planCommandId ||
      command.fingerprint !== x.planFingerprint
    )
      fail('original plan identity mismatch');
    return (
      parsed.intent.positionId === p.positionId &&
      parsed.intent.servicePoolId === pool.poolId
    );
  });
  if (plans.length > 1)
    fail('multiple plans outside selected single-vacancy demonstration');
  const plan = plans[0];
  const programmes = state.programmes.filter(
    (x) => x.programmeId === 'SIM_VOCATIONAL_PROGRAMME_V1',
  );
  if (programmes.length !== 1) fail('original programme absent');
  const cohorts = state.cohorts
    .filter((c) => c.programmeId === programmes[0]!.programmeId)
    .map((c) => {
      const retained = uint(c.originalEnrolled) - uint(c.graduates);
      if (retained < 0n) fail('invalid original cohort');
      return {
        cohortId: c.cohortId,
        state: c.state,
        enrolled: c.originalEnrolled,
        graduates: c.graduates,
        retained: retained.toString(),
      };
    });
  const students = sum(cohorts.map((c) => c.retained)),
    freeSeats = uint(programmes[0]!.seats) - uint(students);
  if (freeSeats < 0n) fail('invalid course seat holdings');
  const edu = budget(state, 'SIM_BUDGET_EDUCATION_COURSE_V1'),
    clinicBudget = budget(state, 'SIM_BUDGET_CLINIC_SERVICE_V1');
  const originalMedicine = scenario.seed.inventoryEntries.filter(
    (e) =>
      e.account.commodityId === 'MEDICINE_SIM_V1' &&
      e.account.batchId === 'SIM_MEDICINE_BATCH_V1' &&
      e.account.unit === 'medical_dose' &&
      e.account.bucket === 'AVAILABLE',
  );
  if (originalMedicine.length !== 1)
    fail('known original medicine account absent');
  const medicine = input.inventory.balances.filter(
    (b) =>
      canonicalSerialize(b.account) ===
      canonicalSerialize(originalMedicine[0]!.account),
  );
  if (medicine.length > 1) fail('ambiguous inventory account');
  // Core's COMPLETE reconstructed ledger omits exactly-zero positions. The known
  // original account and the same full-prefix/head are required above; this is
  // its established sparse-ledger zero, never a default for a missing source.
  const medicineAvailable =
    medicine.length === 0
      ? '0'
      : medicine[0]!.quantity.toCanonicalValue().amount;
  uint(medicineAvailable);
  const served = state.appliedOperations.filter(
    (o) => o.result.kind === 'SERVE',
  );
  if (served.length > 1)
    fail('multiple care windows outside selected demonstration');
  const actions: (
    'PLAN' | 'ADMIT' | 'SERVE' | 'GRADUATE_OLD' | 'GRADUATE_NEW'
  )[] = [];
  if (dayIndex === '0') {
    if (!plan) actions.push('PLAN');
    if (!cohorts.some((c) => c.cohortId === 'SIM_COHORT_NEW_01'))
      actions.push('ADMIT');
    if (served.length === 0) actions.push('SERVE');
  }
  if (
    cohorts.some(
      (c) => c.cohortId === 'SIM_COHORT_RETURNING_01' && c.state === 'OPEN',
    )
  )
    actions.push('GRADUATE_OLD');
  if (
    cohorts.some(
      (c) => c.cohortId === 'SIM_COHORT_NEW_01' && c.state === 'OPEN',
    )
  )
    actions.push('GRADUATE_NEW');
  return freeze({
    schemaVersion: 'g-social-office-projection-v1' as const,
    sourceClass: 'SIMULATED_OPENING' as const,
    sourceAdmitted: false as const,
    worldId: 'WORLD_SOCIAL_SINGLE_DEMO_V1' as const,
    countryId: 'COUNTRY_01' as const,
    worldVersion: input.head.worldVersion,
    eventSequence: input.head.eventSequence,
    dayIndex,
    sourceGeneration: input.source.generation,
    sourceManifestHash: input.source.manifestHash,
    labour: {
      total: sum(labour.map((a) => a.count)),
      employed: sum(
        labour.filter((a) => a.status === 'EMPLOYED').map((a) => a.count),
      ),
      student: sum(
        labour.filter((a) => a.status === 'STUDENT').map((a) => a.count),
      ),
      searching: sum(
        labour
          .filter((a) => a.status === 'UNEMPLOYED_SEARCHING')
          .map((a) => a.count),
      ),
      low: sum(labour.filter((a) => a.skill === 'LOW').map((a) => a.count)),
      medium: sum(
        labour.filter((a) => a.skill === 'MEDIUM').map((a) => a.count),
      ),
      high: sum(labour.filter((a) => a.skill === 'HIGH').map((a) => a.count)),
    },
    employment: {
      vacancies: vacancies.toString(),
      freeServiceSlots: freeSlots.toString(),
      planState: plan?.state ?? 'NONE',
      matched: plan?.matched ?? null,
      planCommandId: plan?.planCommandId ?? null,
      settlementCommandId: plan?.settlementCommandId ?? null,
    },
    college: {
      students,
      graduates: sum(cohorts.map((c) => c.graduates)),
      freeSeats: freeSeats.toString(),
      budgetCommitted: edu.committed,
      budgetRemaining: edu.remaining,
      currency: 'XAA' as const,
      cohorts,
    },
    clinic: {
      served: served[0]?.result.units ?? null,
      backlog: state.clinic.backlog,
      medicineAvailable,
      budgetCommitted: clinicBudget.committed,
      budgetRemaining: clinicBudget.remaining,
      currency: 'XAA' as const,
    },
    availableActions: actions,
  });
}
