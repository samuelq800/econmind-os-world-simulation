/** Fixed conditional WATER command/replay. A draft is never delivery. Only
 * an entry in a genuine COMPLETE after-prefix can issue the read-only delivery
 * token consumed by the production-water bridge. Native custody/authorization
 * and source revocation checks remain mandatory at every World commit. */
import { DomainError, DOMAIN_ERROR_CODES } from '../errors.js';
import {
  canonicalSerialize,
  canonicalHashInput,
} from '../serialization/canonical.js';
import {
  canonicalSha256,
  type CanonicalCommand,
  type Sha256Hex,
} from './command.js';
import { parseAuthoritativeEvent } from '../events/event.js';
import {
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  bindAuthoritativeTransition,
} from './receipt.js';
import type { FinanceNativeBudgetCanonicalFrame } from './finance-budget-native.js';
import {
  readFinanceSocialReplayContinuationView,
  type FinanceSocialReplayContinuationView,
} from './finance-social-replay-continuation.js';
import {
  parseIndustryUtilityIntent,
  readIndustryUtilityExecution,
  industryUtilityOperatingReceiptFromRun,
  type IndustryUtilityExecutionPreparation,
  type IndustryUtilitySource,
} from './industry-utility-execution.js';
import {
  readIndustryFirstDayPowerReplayDelivery,
  type IndustryFirstDayPowerState,
} from './industry-first-day-power-execution.js';
import {
  readIndustryFirstDayWorkState,
  readIndustryCompletedWork,
  type IndustryFirstDayWorkState,
} from '../industry/industry-first-day-work.js';
import type { IndustryOperatingWageState } from './industry-operating-wage-payment.js';
import {
  createFinancialPostingBatch,
  type FinancialPostingBatch,
  type FinancialLedgerState,
} from '../finance/financial-ledger.js';
import { isSettledOriginalProductionDeposit } from '../finance/production-deposit-funding.js';
import type { InventoryLedgerState } from '../inventory/inventory-ledger.js';
import type { ProductionWaterAccount } from '../inventory/production-water-consumption.js';
import { createWaterRight, type WaterRight } from '../water/foundation.js';
import {
  compareWater,
  volumeFromDecimal,
  waterFraction,
  waterVolume,
  waterVolumeAsQuantity,
  zeroWater,
  type WaterFraction,
} from '../water/exact-volume.js';
import { CONSERVATIVE_OPENING_WATER_SOURCES } from '../water/conservative-opening-basis.js';
import {
  INDUSTRY_FIRST_DAY_WATER_SCENARIO_POLICY as POLICY,
  calculateIndustryFirstDayWaterScenarioPeriod,
  discardIndustryWaterScenarioPreGrantInterval,
  readIndustryFirstDayWaterScenarioExecutionScope,
  type IndustryWaterScenarioState,
  type IndustryWaterScenarioRecord,
  type IndustryWaterScenarioProtectedClaim,
} from '../water/industry-first-day-scenario.js';

const COMMAND = 'INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1',
  EVENT = 'INDUSTRY_FIRST_DAY_WATER_EXECUTED_V1',
  RECEIPT_EVENT = 'POSTWAR_INDUSTRY_OPERATING_FACT_RECORDED_V1';
const hash = (v: unknown, sha: Sha256Hex) =>
  canonicalSha256(canonicalHashInput(v), sha);
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
function invalid(s: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'INDUSTRY_WATER_EXECUTION:' + s,
  );
}
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('EXACT_OBJECT_REQUIRED');
  return v as Record<string, unknown>;
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v || v.trim() !== v)
    invalid('EXACT_TEXT_REQUIRED');
  return v;
}
function exact(v: object, keys: readonly string[]) {
  if (Object.keys(v).sort().join('|') !== [...keys].sort().join('|'))
    invalid('EXACT_FIXED_OPERATION_REQUIRED');
}
function freeze<T>(v: T): Readonly<T> {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function q(n: string, d: string): WaterFraction {
  return waterFraction(n, d);
}
const zero = q('0', '1');
function add(a: WaterFraction, b: WaterFraction) {
  return q(
    (
      BigInt(a.numerator) * BigInt(b.denominator) +
      BigInt(b.numerator) * BigInt(a.denominator)
    ).toString(),
    (BigInt(a.denominator) * BigInt(b.denominator)).toString(),
  );
}
function cmp(a: WaterFraction, b: WaterFraction) {
  const d =
    BigInt(a.numerator) * BigInt(b.denominator) -
    BigInt(b.numerator) * BigInt(a.denominator);
  return d < 0n ? -1 : d > 0n ? 1 : 0;
}
function minus(a: WaterFraction, b: WaterFraction) {
  if (cmp(a, b) < 0) invalid('POWER_ALREADY_CONSUMED');
  return q(
    (
      BigInt(a.numerator) * BigInt(b.denominator) -
      BigInt(b.numerator) * BigInt(a.denominator)
    ).toString(),
    (BigInt(a.denominator) * BigInt(b.denominator)).toString(),
  );
}
export interface IndustryFirstDayWaterReplayOriginal {
  readonly source: IndustryUtilitySource;
  /** First initialization only. This private mathematical state is not a grant. */
  readonly scenario?: Readonly<IndustryWaterScenarioState>;
  readonly grantEligibilityOriginal?: Readonly<{
    reference: string;
    rawText: string;
  }>;
  readonly serviceFacilityId?: string;
  readonly serviceRunId?: string;
  readonly serviceWorkSourceRef?: string;
  readonly serviceWorkSourceRawSha256?: string;
  readonly paymentFrames?: readonly FinanceNativeBudgetCanonicalFrame[];
  /** Immutable source DATA at each exact command. Later original additions
   * must not replace the snapshot used to rederive an earlier grant/frame. */
  readonly commandSources?: readonly Readonly<{
    commandFingerprint: string;
    source: IndustryUtilitySource;
  }>[];
}
export interface IndustryFirstDayWaterReplayContext {
  readonly head: Readonly<{ worldVersion: string; eventSequence: string }>;
  readonly financial: FinancialLedgerState;
  readonly inventory: InventoryLedgerState;
  readonly industryWorkState?: IndustryFirstDayWorkState;
  readonly industryWageState?: Readonly<IndustryOperatingWageState>;
  readonly industryPowerState?: IndustryFirstDayPowerState;
}
interface Grant {
  readonly right: WaterRight;
  readonly sourceRegionId: string;
  readonly sourceCountryId: string;
  readonly sourceRef: string;
  readonly frame: FinanceNativeBudgetCanonicalFrame;
}
export interface IndustryFirstDayWaterReplayDelivery {
  readonly classification: 'CORE_REPLAYED_COMMITTED_WATER_DATA_NOT_DB_AUTHORITY';
  readonly source: IndustryUtilitySource;
  readonly worldId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly frame: FinanceNativeBudgetCanonicalFrame;
  readonly accounts: readonly ProductionWaterAccount[];
  readonly operatingFactCanonicalPayload: string;
  readonly allocationSourceHash: string;
  readonly validFromTicks: string;
  readonly validUntilTicks: string;
  readonly scenarioRecord: Readonly<IndustryWaterScenarioRecord>;
  readonly actualPaidInput: Readonly<{
    workEventFingerprint: string;
    paymentEventFingerprint: string;
    batchFingerprint: string;
    amount: string;
    currency: string;
  }>;
  readonly powerUses: readonly Readonly<{
    eventFingerprint: string;
    amount: WaterFraction;
  }>[];
}
declare const waterState: unique symbol;
export interface IndustryFirstDayWaterExecutionState {
  readonly [waterState]: true;
}
interface State {
  readonly worldId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly scenario: Readonly<IndustryWaterScenarioState>;
  readonly originals: ReadonlyMap<string, IndustryFirstDayWaterReplayOriginal>;
  readonly originalPins: ReadonlyMap<string, string>;
  readonly grants: ReadonlyMap<string, Grant>;
  readonly entries: ReadonlyMap<string, IndustryFirstDayWaterReplayDelivery>;
  readonly commands: ReadonlyMap<string, string>;
  readonly usedPaidInputs: ReadonlySet<string>;
  readonly powerUses: ReadonlyMap<string, WaterFraction>;
}
const states = new WeakMap<object, State>();
function lookup(v: IndustryFirstDayWaterExecutionState) {
  const s = states.get(v);
  if (!s) invalid('GENUINE_WATER_REPLAY_STATE_REQUIRED');
  return s;
}
function issue(s: State): IndustryFirstDayWaterExecutionState {
  const v = Object.freeze({}) as IndustryFirstDayWaterExecutionState;
  states.set(v, s);
  return v;
}
function key(s: IndustryUtilitySource) {
  return s.sourceRef + '\n' + s.facilityId + '\n' + s.runId;
}
function original(
  s: IndustryUtilitySource,
  kind: string,
  reference: string,
  rawSha256: string,
) {
  const found = s.originals.filter(
    (x) =>
      x.kind === kind && x.reference === reference && x.rawSha256 === rawSha256,
  );
  if (found.length !== 1) invalid('ACTUAL_IMMUTABLE_ORIGINAL_REQUIRED:' + kind);
}
function validateSource(s: IndustryUtilitySource, sha: Sha256Hex) {
  exact(s, [
    'worldId',
    'countryId',
    'locationId',
    'facilityId',
    'operatorId',
    'runId',
    'seedId',
    'seedFingerprint',
    'admissionRef',
    'sourceRef',
    'sourceRawSha256',
    'policyVersion',
    'policyRawSha256',
    'userAdoptionRawSha256',
    'originals',
  ]);
  if (
    s.policyVersion !== POLICY.version ||
    s.policyRawSha256 !== sha(canonicalSerialize(POLICY)) ||
    s.userAdoptionRawSha256 !== POLICY.userAdoptionSha256 ||
    !/^sha256:[a-f0-9]{64}$/u.test(s.seedFingerprint) ||
    !/^[a-f0-9]{64}$/u.test(s.sourceRawSha256)
  )
    invalid('EXACT_ADOPTED_POLICY_SOURCE_REQUIRED');
  if (
    !Array.isArray(s.originals) ||
    s.originals.length < 1 ||
    s.originals.length > 64
  )
    invalid('BOUNDED_SOURCE_ORIGINALS_REQUIRED');
  const ids = new Set<string>();
  for (const o of s.originals) {
    exact(o, ['kind', 'reference', 'rawSha256']);
    if (
      !/^[a-f0-9]{64}$/u.test(o.rawSha256) ||
      ids.has(o.kind + '\n' + o.reference)
    )
      invalid('EXACT_UNIQUE_ORIGINAL_PINS_REQUIRED');
    ids.add(o.kind + '\n' + o.reference);
  }
}
function extend(
  s: State,
  inputs: readonly IndustryFirstDayWaterReplayOriginal[],
  sha: Sha256Hex,
): State {
  const originals = new Map(s.originals),
    pins = new Map(s.originalPins);
  for (const raw of inputs) {
    const source = freeze(
      JSON.parse(canonicalSerialize(raw.source)) as IndustryUtilitySource,
    );
    validateSource(source, sha);
    if (
      source.worldId !== s.worldId ||
      source.seedId !== s.seedId ||
      source.seedFingerprint !== s.seedFingerprint ||
      source.admissionRef !== s.admissionRef
    )
      invalid('ORIGINAL_WORLD_SEED_ADMISSION_CHANGED');
    if (
      raw.scenario &&
      (raw.scenario.baselineFingerprint !== s.scenario.baselineFingerprint ||
        raw.scenario.modelRef !== s.scenario.modelRef)
    )
      invalid('SCENARIO_BASELINE_CANNOT_RESET');
    for (const o of source.originals) {
      const k = o.kind + '\n' + o.reference,
        old = pins.get(k);
      if (old && old !== o.rawSha256) invalid('IMMUTABLE_ORIGINAL_REF_CHANGED');
      pins.set(k, o.rawSha256);
    }
    const snapshots = new Map(
      s.originals
        .get(key(source))
        ?.commandSources?.map((x) => [x.commandFingerprint, x]),
    );
    for (const snapshot of raw.commandSources ?? []) {
      validateSource(snapshot.source, sha);
      if (
        !/^sha256:[a-f0-9]{64}$/u.test(snapshot.commandFingerprint) ||
        !same(
          { ...source, originals: [] },
          { ...snapshot.source, originals: [] },
        )
      )
        invalid('EXACT_COMMAND_SOURCE_SNAPSHOT_REQUIRED');
      for (const pin of snapshot.source.originals) {
        if (pins.get(pin.kind + '\n' + pin.reference) !== pin.rawSha256)
          invalid('COMMAND_SNAPSHOT_REQUIRES_ACTUAL_IMMUTABLE_ORIGINAL');
      }
      const old = snapshots.get(snapshot.commandFingerprint);
      if (old && !same(old, snapshot))
        invalid('IMMUTABLE_COMMAND_SOURCE_SNAPSHOT_CHANGED');
      snapshots.set(snapshot.commandFingerprint, freeze(snapshot));
    }
    const k = key(source),
      prev = originals.get(k),
      saved: IndustryFirstDayWaterReplayOriginal = freeze({
        ...raw,
        source,
        commandSources: [...snapshots.values()],
        ...(raw.paymentFrames ? { paymentFrames: [...raw.paymentFrames] } : {}),
      });
    if (prev) {
      // Current protected-claim snapshots may append distinct immutable refs;
      // they cannot rewrite the fixed rule or the service source identity.
      const immutableFields = (o: IndustryFirstDayWaterReplayOriginal) => ({
        source: { ...o.source, originals: [] },
        serviceFacilityId: o.serviceFacilityId ?? null,
        serviceRunId: o.serviceRunId ?? null,
        serviceWorkSourceRef: o.serviceWorkSourceRef ?? null,
        serviceWorkSourceRawSha256: o.serviceWorkSourceRawSha256 ?? null,
        grantEligibilityOriginal: o.grantEligibilityOriginal ?? null,
      });
      const previousFields = immutableFields(prev),
        nextFields = immutableFields(saved);
      if (!same(previousFields.source, nextFields.source))
        invalid('SAME_SOURCE_SCOPE_CHANGED');
      for (const field of [
        'serviceFacilityId',
        'serviceRunId',
        'serviceWorkSourceRef',
        'serviceWorkSourceRawSha256',
        'grantEligibilityOriginal',
      ] as const) {
        if (
          previousFields[field] !== null &&
          nextFields[field] !== null &&
          !same(previousFields[field], nextFields[field])
        )
          invalid('SAME_SOURCE_SCOPE_CHANGED');
      }
      const payments = new Map(
        (prev.paymentFrames ?? []).map((f) => [f.command.fingerprint, f]),
      );
      for (const f of raw.paymentFrames ?? []) {
        const old = payments.get(f.command.fingerprint);
        if (old && !same(old, f)) invalid('IMMUTABLE_PAYMENT_FRAME_CHANGED');
        payments.set(f.command.fingerprint, f);
      }
      originals.set(
        k,
        freeze({
          ...prev,
          ...saved,
          ...Object.fromEntries(
            Object.entries(prev).filter(
              ([field, value]) =>
                value !== undefined &&
                saved[field as keyof IndustryFirstDayWaterReplayOriginal] ===
                  undefined,
            ),
          ),
          paymentFrames: [...payments.values()],
        }),
      );
    } else originals.set(k, saved);
  }
  return { ...s, originals, originalPins: pins };
}
export function createIndustryFirstDayWaterExecutionState(
  input: {
    scenario: Readonly<IndustryWaterScenarioState>;
    source: IndustryUtilitySource;
  },
  sha: Sha256Hex,
): IndustryFirstDayWaterExecutionState {
  readIndustryFirstDayWaterScenarioExecutionScope(input.scenario);
  if (
    input.scenario.records.length ||
    input.scenario.regionCursors.some((r) => r.throughTicks !== '0')
  )
    invalid('FRESH_GLOBAL_SCENARIO_REQUIRED_NOT_RESTORED_FROM_DTO');
  const s: State = {
    worldId: input.source.worldId,
    seedId: input.source.seedId,
    seedFingerprint: input.source.seedFingerprint,
    admissionRef: input.source.admissionRef,
    scenario: input.scenario,
    originals: new Map(),
    originalPins: new Map(),
    grants: new Map(),
    entries: new Map(),
    commands: new Map(),
    usedPaidInputs: new Set(),
    powerUses: new Map(),
  };
  return issue(extend(s, [{ source: input.source }], sha));
}
export function extendIndustryFirstDayWaterExecutionOriginals(
  input: {
    state: IndustryFirstDayWaterExecutionState;
    originals: readonly IndustryFirstDayWaterReplayOriginal[];
  },
  sha: Sha256Hex,
) {
  return issue(extend(lookup(input.state), input.originals, sha));
}
export function readIndustryFirstDayWaterExecutionState(
  state: IndustryFirstDayWaterExecutionState,
  sha: Sha256Hex,
) {
  const s = lookup(state);
  return freeze({
    classification: 'WATER_REPLAY_STATE_DATA_NOT_AUTHORITY' as const,
    worldId: s.worldId,
    seedId: s.seedId,
    seedFingerprint: s.seedFingerprint,
    admissionRef: s.admissionRef,
    scenarioBaselineFingerprint: s.scenario.baselineFingerprint,
    scenarioModelRef: s.scenario.modelRef,
    sourceOriginalsFingerprint: hash([...s.originalPins], sha),
    registeredRights: [...s.grants.values()].map((g) => g.right),
    committedDeliveryEventFingerprints: [...s.entries.keys()],
    scenarioState: s.scenario,
  });
}
function scope(s: State, source: IndustryUtilitySource) {
  const data = readIndustryFirstDayWaterScenarioExecutionScope(s.scenario),
    suffix = source.countryId.slice('COUNTRY_'.length),
    sourceCountryId = 'visual-territory-' + suffix,
    sourceRegionId = source.locationId.replace(
      /^REGION_([0-9]{2})_/u,
      'visual-territory-$1-',
    );
  const targets = data.targets.filter(
      (t) =>
        t.id === source.facilityId &&
        t.sourceCountryId === sourceCountryId &&
        t.sourceRegionId === sourceRegionId &&
        t.sourceOperatorId === 'OP-' + suffix,
    ),
    profiles = data.profiles.filter(
      (p) =>
        p.sourceRegionId === sourceRegionId &&
        p.sourceCountryId === sourceCountryId,
    );
  if (
    !/^COUNTRY_(0[1-9]|[1-6][0-9]|70)$/u.test(source.countryId) ||
    source.operatorId !== 'ENTITY_OPERATOR_' + suffix ||
    targets.length !== 1 ||
    profiles.length !== 1
  )
    invalid('EXACT_EXISTING_OPERATOR_REFINERY_REGION_REQUIRED');
  return {
    target: targets[0]!,
    profile: profiles[0]!,
    sourceCountryId,
    sourceRegionId,
  };
}
function productionRun(
  ctx: IndustryFirstDayWaterReplayContext,
  source: IndustryUtilitySource,
) {
  if (!ctx.industryWorkState) invalid('ACTUAL_COMMITTED_RUN_PREFIX_REQUIRED');
  const found = readIndustryFirstDayWorkState(
    ctx.industryWorkState,
  ).runs.filter(
    (r) =>
      r.terms.runId === source.runId &&
      r.terms.facilityId === source.facilityId &&
      r.source.worldId === source.worldId &&
      r.source.countryId === source.countryId &&
      r.source.locationId === source.locationId &&
      r.source.operatorId === source.operatorId &&
      r.source.seedId === source.seedId &&
      r.source.seedFingerprint === source.seedFingerprint &&
      r.source.admissionRef === source.admissionRef,
  );
  if (found.length !== 1) invalid('EXACT_ACTUAL_RUN_ORIGINAL_REQUIRED');
  return found[0]!;
}
function sourceGrant(
  s: State,
  o: IndustryFirstDayWaterReplayOriginal,
  command: CanonicalCommand,
  sha: Sha256Hex,
) {
  if (!o.grantEligibilityOriginal)
    invalid('ACTUAL_GRANT_ELIGIBILITY_ORIGINAL_REQUIRED');
  const source = o.source,
    { profile, sourceCountryId, sourceRegionId } = scope(s, source),
    raw = o.grantEligibilityOriginal.rawText,
    g = object(JSON.parse(raw));
  if (raw.length > 12000 || canonicalSerialize(g) !== raw)
    invalid('CANONICAL_GRANT_ORIGINAL_REQUIRED');
  exact(g, [
    'schemaVersion',
    'worldId',
    'seedId',
    'seedFingerprint',
    'admissionRef',
    'countryId',
    'locationId',
    'operatorId',
    'sourceCountryId',
    'sourceRegionId',
    'basinRef',
    'maximumRawQuotaPerDay',
    'validFromTicks',
    'validUntilTicks',
    'sourceRef',
    'userAdoptionRawSha256',
    'sourceAllocationRawSha256',
    'grantAuthorityOriginalRef',
    'grantAuthorityOriginalRawSha256',
  ]);
  original(
    source,
    'WATER_GRANT_ELIGIBILITY',
    o.grantEligibilityOriginal.reference,
    sha(raw),
  );
  original(
    source,
    'WATER_GRANT_AUTHORITY',
    text(g.grantAuthorityOriginalRef),
    text(g.grantAuthorityOriginalRawSha256),
  );
  if (
    g.schemaVersion !==
      'industry-first-day-water-grant-eligibility-original-v1' ||
    g.worldId !== s.worldId ||
    g.seedId !== s.seedId ||
    g.seedFingerprint !== s.seedFingerprint ||
    g.admissionRef !== s.admissionRef ||
    g.countryId !== source.countryId ||
    g.locationId !== source.locationId ||
    g.operatorId !== source.operatorId ||
    g.sourceCountryId !== sourceCountryId ||
    g.sourceRegionId !== sourceRegionId ||
    g.basinRef !== profile.basinRef ||
    g.sourceRef !== source.sourceRef ||
    g.userAdoptionRawSha256 !== POLICY.userAdoptionSha256 ||
    g.sourceAllocationRawSha256 !==
      CONSERVATIVE_OPENING_WATER_SOURCES.allocations
  )
    invalid('EXACT_ACTUAL_GRANT_ORIGINAL_SCOPE_REQUIRED');
  const cap = object(g.maximumRawQuotaPerDay),
    quota = volumeFromDecimal(text(cap.amount));
  exact(cap, ['amount', 'unit']);
  const fromText = text(g.validFromTicks),
    untilText = text(g.validUntilTicks);
  if (
    !/^(0|[1-9][0-9]{0,8})$/u.test(fromText) ||
    !/^(0|[1-9][0-9]{0,8})$/u.test(untilText)
  )
    invalid('CANONICAL_BOUNDED_RIGHT_PERIOD_REQUIRED');
  const from = BigInt(fromText),
    until = BigInt(untilText);
  if (
    cap.unit !== 'm3/sim-day' ||
    quota.numerator === '0' ||
    compareWater(quota, profile.originalIndustrialQuota) > 0 ||
    from > command.simTime.ticks ||
    command.simTime.ticks >= until ||
    until > 86400000n ||
    from < 0n
  )
    invalid('BOUNDED_CURRENT_GRANTED_QUOTA_AND_PERIOD_REQUIRED');
  const amount = waterVolumeAsQuantity(quota);
  if (!amount) invalid('EXACT_SOURCE_QUOTA_DECIMAL_REQUIRED');
  const rightRef =
    'INDUSTRY_WATER_RIGHT_' +
    hash(
      [
        s.worldId,
        s.seedFingerprint,
        sourceRegionId,
        source.operatorId,
        POLICY.version,
      ],
      sha,
    )
      .slice(7)
      .toUpperCase();
  const right = createWaterRight({
    rightRef,
    countryRef: source.countryId,
    regionRef: source.locationId,
    basinRef: profile.basinRef,
    holderRef: source.operatorId,
    purpose: 'OTHER_INDUSTRY',
    quotaPerDay: { amount: amount.amount, unit: 'm3/sim-day' },
    sourceRef: source.sourceRef,
    validity: {
      fromTicks: command.simTime.toCanonicalValue(),
      untilTicks: until.toString(),
    },
  });
  return { right, sourceCountryId, sourceRegionId };
}
function paidService(
  s: State,
  o: IndustryFirstDayWaterReplayOriginal,
  ctx: IndustryFirstDayWaterReplayContext,
  op: Record<string, unknown>,
  from: string,
  until: string,
  now: bigint,
  sha: Sha256Hex,
) {
  if (
    !ctx.industryWorkState ||
    !ctx.industryWageState ||
    !o.serviceFacilityId ||
    !o.serviceRunId ||
    !o.serviceWorkSourceRef ||
    !o.serviceWorkSourceRawSha256 ||
    !o.serviceFacilityId.startsWith('UTILITY_WATER_') ||
    o.serviceFacilityId === o.source.facilityId
  )
    invalid('DISTINCT_WATER_SERVICE_WORK_SOURCE_REQUIRED');
  const wf = text(op.workEventFingerprint),
    pf = text(op.paymentEventFingerprint),
    known = readIndustryFirstDayWorkState(ctx.industryWorkState),
    works = known.completedWorks.filter(
      (w) => readIndustryCompletedWork(w).frame.events[0]?.fingerprint === wf,
    );
  if (works.length !== 1 || !ctx.industryWageState.paidWork.includes(wf))
    invalid('ACTUAL_PAID_WATER_SERVICE_WORK_REQUIRED');
  const w = readIndustryCompletedWork(works[0]!),
    d = w.data;
  if (
    d.worldId !== s.worldId ||
    d.seedFingerprint !== s.seedFingerprint ||
    d.admissionRef !== s.admissionRef ||
    d.countryId !== o.source.countryId ||
    d.locationId !== o.source.locationId ||
    d.operatorId !== o.source.operatorId ||
    d.facilityId !== o.serviceFacilityId ||
    d.runId !== o.serviceRunId ||
    d.policy.sourceRef !== o.serviceWorkSourceRef ||
    d.policy.sourceRawSha256 !== o.serviceWorkSourceRawSha256 ||
    BigInt(d.completedAtSimTime) > now
  )
    invalid('WATER_SERVICE_WORK_NOT_MANUFACTURING_REQUIRED');
  original(
    o.source,
    'WATER_SERVICE_WORK_SOURCE',
    o.serviceWorkSourceRef,
    o.serviceWorkSourceRawSha256,
  );
  const points = [
    ...new Set([
      BigInt(from),
      BigInt(until),
      ...d.allocations
        .flatMap((a) => [BigInt(a.startsAtSimTime), BigInt(a.endsAtSimTime)])
        .filter((t) => t > BigInt(from) && t < BigInt(until)),
    ]),
  ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const t of points)
    if (
      t < BigInt(until) &&
      !d.allocations.some(
        (a) =>
          BigInt(a.count) > 0n &&
          BigInt(a.startsAtSimTime) <= t &&
          BigInt(a.endsAtSimTime) > t,
      )
    )
      invalid('ACTUAL_SERVICE_WORK_MUST_COVER_WATER_INTERVAL');
  const selected = (o.paymentFrames ?? []).filter(
    (f) => f.events[0]?.fingerprint === pf,
  );
  if (selected.length !== 1)
    invalid('ACTUAL_SELECTED_SERVICE_WAGE_FRAME_REQUIRED');
  const p = selected[0]!,
    e = p.events[0]!;
  if (
    p.events.length !== 1 ||
    e.eventType !== 'INDUSTRY_OPERATING_WAGE_PAID_V1' ||
    p.command.commandType !== 'CORE_INDUSTRY_OPERATING_WAGE_PAY_V1' ||
    p.financialPostingBatches.length !== 1 ||
    p.inventoryPostings.length ||
    p.command.simTime.ticks > now ||
    BigInt(p.transition.worldVersionAfter) > BigInt(ctx.head.worldVersion)
  )
    invalid('ACTUAL_PRIOR_SERVICE_PAYMENT_REQUIRED');
  bindAuthoritativeTransition(
    { command: p.command, transition: p.transition },
    sha,
  );
  if (
    !same(p.events, p.transition.events) ||
    !same(
      p.receipt,
      createFinalCommandReceipt({
        command: p.command,
        transition: p.transition,
        outcome: 'COMMITTED',
        reasonCode: null,
        simTime: p.command.simTime,
        recordedAtReal: p.receipt.recordedAtReal,
      }),
    )
  )
    invalid('EXACT_COMMITTED_SERVICE_PAYMENT_RECEIPT_REQUIRED');
  const body = object(JSON.parse(e.canonicalPayload)),
    src = object(body.source);
  if (
    body.workEventFingerprint !== wf ||
    body.workEventId !== w.frame.events[0]!.eventId ||
    src.facilityId !== d.facilityId ||
    src.runId !== d.runId ||
    src.operatorId !== d.operatorId ||
    src.countryId !== d.countryId ||
    src.seedFingerprint !== s.seedFingerprint ||
    src.admissionRef !== s.admissionRef
  )
    invalid('EXACT_PAID_SERVICE_WORK_ORIGIN_REQUIRED');
  const raw = p.financialPostingBatches[0] as FinancialPostingBatch,
    batch = createFinancialPostingBatch(
      { ...raw, command: p.command, transition: p.transition, legs: raw.legs },
      sha,
    );
  if (
    !same(raw, batch) ||
    ctx.financial.appliedBatches.filter(
      (b) => b.batchId === batch.batchId && b.fingerprint === batch.fingerprint,
    ).length !== 1
  )
    invalid('PAYMENT_ALREADY_APPLIED_IN_GENUINE_FINANCIAL_PREFIX_REQUIRED');
  const expense = batch.legs.filter(
      (l) =>
        l.account.ownerId === o.source.operatorId &&
        l.account.accountClass === 'EXPENSE' &&
        l.direction === 'DEBIT',
    ),
    payment = batch.legs.filter(
      (l) =>
        l.account.ownerId === o.source.operatorId &&
        l.account.accountClass === 'ASSET' &&
        l.direction === 'CREDIT',
    );
  if (
    expense.length !== 1 ||
    payment.length !== 1 ||
    !expense[0]!.amount.amount.isPositive() ||
    !expense[0]!.amount.amount.equals(payment[0]!.amount.amount) ||
    body.paidAmount !== expense[0]!.amount.toCanonicalValue().amount ||
    !isSettledOriginalProductionDeposit({
      financial: ctx.financial,
      batch,
      payment: payment[0]!,
      expense: expense[0]!,
    })
  )
    invalid('ACTUAL_PAID_SERVICE_EXPENSE_AND_DEPOSIT_MIRRORS_REQUIRED');
  if (s.usedPaidInputs.has(wf) || s.usedPaidInputs.has(pf))
    invalid('WATER_SERVICE_PAID_INPUT_ALREADY_ASSIGNED');
  return freeze({
    workEventFingerprint: wf,
    paymentEventFingerprint: pf,
    batchFingerprint: batch.fingerprint,
    amount: expense[0]!.amount.toCanonicalValue().amount,
    currency: batch.settlementCurrency,
  });
}
interface Calculation {
  readonly next: State;
  readonly payload: unknown;
  readonly receipt: ReturnType<
    typeof industryUtilityOperatingReceiptFromRun
  > | null;
  readonly delivery: Omit<IndustryFirstDayWaterReplayDelivery, 'frame'> | null;
  readonly grant: Omit<Grant, 'frame'> | null;
}
function calculate(
  state: IndustryFirstDayWaterExecutionState,
  command: CanonicalCommand,
  ctx: IndustryFirstDayWaterReplayContext,
  sha: Sha256Hex,
): Calculation {
  const s = lookup(state),
    intent = parseIndustryUtilityIntent(command, sha),
    op = object(intent.operation),
    baseOriginal = s.originals.get(
      [intent.sourceRef, intent.facilityId, intent.runId].join('\n'),
    ),
    o = baseOriginal
      ? {
          ...baseOriginal,
          source:
            baseOriginal.commandSources?.find(
              (x) => x.commandFingerprint === command.fingerprint,
            )?.source ?? baseOriginal.source,
        }
      : undefined;
  if (
    command.commandType !== COMMAND ||
    intent.serviceKind !== 'WATER' ||
    !o ||
    command.worldId !== s.worldId ||
    command.countryId !== o.source.countryId ||
    command.expectedWorldVersion !== ctx.head.worldVersion ||
    intent.sourceRawSha256 !== o.source.sourceRawSha256
  )
    invalid('EXACT_WATER_SOURCE_AND_PRIOR_HEAD_REQUIRED');
  const source = o.source,
    run = productionRun(ctx, source),
    sc = scope(s, source),
    grantKey = sc.sourceRegionId + '\n' + source.operatorId;
  if (op.action === 'GRANT_RIGHT') {
    exact(op, ['action']);
    if (s.grants.has(grantKey))
      invalid('RIGHT_ALREADY_COMMITTED_RESTORE_ORIGINAL');
    const grant = {
        ...sourceGrant(s, o, command, sha),
        sourceRef: source.sourceRef,
      },
      scenario = discardIndustryWaterScenarioPreGrantInterval(
        {
          state: s.scenario,
          sourceRegionId: sc.sourceRegionId,
          throughTicks: command.simTime.toCanonicalValue(),
        },
        sha,
      );
    return {
      next: { ...s, scenario },
      payload: freeze({
        schemaVersion: 'industry-first-day-water-execution-v1',
        stage: 'RIGHT_GRANTED',
        policy: POLICY,
        sourceFingerprint: hash(source, sha),
        grant,
        grantEligibilityOriginal: o.grantEligibilityOriginal,
        beforeStateHash: hash(
          {
            scenario: s.scenario,
            rights: [...s.grants.values()].map((g) => g.right),
          },
          sha,
        ),
        afterScenarioHash: hash(scenario, sha),
      }),
      receipt: null,
      delivery: null,
      grant,
    };
  }
  if (op.action !== 'DELIVER') invalid('FIXED_WATER_STAGE_REQUIRED');
  exact(op, [
    'action',
    'workEventFingerprint',
    'paymentEventFingerprint',
    'powerEventFingerprints',
    'additionalProtectedClaims',
  ]);
  const g = s.grants.get(grantKey);
  if (!g || g.right.sourceRef !== source.sourceRef || !g.right.validity)
    invalid('ACTUAL_PRIOR_COMMITTED_WATER_RIGHT_REQUIRED');
  const rightOrigin = g.frame.events[0]!;
  original(
    source,
    'WATER_RIGHT_COMMIT',
    rightOrigin.eventId,
    sha(rightOrigin.canonicalPayload),
  );
  if (
    [...s.entries.values()].some(
      (e) =>
        e.source.countryId === source.countryId &&
        e.source.facilityId === source.facilityId &&
        e.source.runId === source.runId,
    )
  )
    invalid('RUN_WATER_ALREADY_DELIVERED');
  const c = readIndustryFirstDayWaterScenarioExecutionScope(
    s.scenario,
  ).regionCursors.find((r) => r.sourceRegionId === sc.sourceRegionId);
  if (!c) invalid('ACTUAL_REGION_CURSOR_REQUIRED');
  const until = command.simTime.toCanonicalValue(),
    from = c.throughTicks;
  if (
    BigInt(from) < BigInt(g.right.validity.fromTicks) ||
    command.simTime.ticks >= BigInt(g.right.validity.untilTicks) ||
    command.simTime.ticks > BigInt(run.terms.endsAtSimTime) ||
    BigInt(from) < BigInt(run.terms.startsAtSimTime)
  )
    invalid('ACTUAL_RIGHT_RUN_PERIOD_EXPIRED_OR_OUT_OF_SCOPE');
  if (!Array.isArray(op.additionalProtectedClaims))
    invalid('COMPLETE_CURRENT_PROTECTED_CLAIMS_REQUIRED');
  const claims =
    op.additionalProtectedClaims as unknown as readonly IndustryWaterScenarioProtectedClaim[];
  const claimSource = source.originals.filter(
    (x) => x.kind === 'WATER_CURRENT_PROTECTED_SET',
  );
  if (
    claimSource.length !== 1 ||
    claimSource[0]!.rawSha256 !==
      sha(
        canonicalSerialize({
          worldId: s.worldId,
          seedFingerprint: s.seedFingerprint,
          head: ctx.head,
          fromTicks: from,
          untilTicks: until,
          claims,
        }),
      )
  )
    invalid('ACTUAL_CURRENT_PROTECTED_SET_ORIGINAL_REQUIRED');
  const paid = paidService(
    s,
    o,
    ctx,
    op,
    from,
    until,
    command.simTime.ticks,
    sha,
  );
  const result = calculateIndustryFirstDayWaterScenarioPeriod(
    {
      state: s.scenario,
      operation: {
        operationRef: intent.operationRef,
        predecessorRef: s.scenario.predecessorRef,
        untilTicks: until,
        observedAtTicks: until,
        demands: [
          {
            demandRef:
              'WATER_DEMAND_' +
              hash([source.countryId, source.facilityId, source.runId], sha)
                .slice(7)
                .toUpperCase(),
            sourceCountryId: sc.sourceCountryId,
            sourceRegionId: sc.sourceRegionId,
            sourceOperatorId: sc.target.sourceOperatorId,
            facilityId: source.facilityId,
            runId: source.runId,
            requestedOutputAmount: run.terms.quantity.amount,
          },
        ],
        additionalProtectedClaims: claims,
      },
    },
    sha,
  );
  const line = result.record.lines[0];
  if (
    result.replayed ||
    result.record.lines.length !== 1 ||
    !line ||
    line.unservedRequest.numerator !== '0' ||
    line.deliveredModelQuantity.numerator === '0'
  )
    invalid('FULL_ACTUAL_RUN_WATER_REQUIRED_REPLAN_WITH_NEW_INTENT');
  const intervalRawQuota = waterVolume(
    (
      BigInt(g.right.quotaPerDay.amount.replace('.', '')) *
      (BigInt(until) - BigInt(from))
    ).toString(),
    (
      10n ** BigInt(g.right.quotaPerDay.amount.split('.')[1]?.length ?? 0) *
      86400000n
    ).toString(),
  );
  if (compareWater(line.abstracted, intervalRawQuota) > 0)
    invalid('ACTUAL_GRANTED_RAW_QUOTA_EXCEEDED');
  if (
    !ctx.industryPowerState ||
    !Array.isArray(op.powerEventFingerprints) ||
    !op.powerEventFingerprints.length ||
    op.powerEventFingerprints.length > 64 ||
    new Set(op.powerEventFingerprints).size !== op.powerEventFingerprints.length
  )
    invalid('ACTUAL_DISTINCT_POWER_DELIVERIES_REQUIRED');
  let remaining: WaterFraction = q(
    line.additionalWaterElectricityRequirement.numerator,
    line.additionalWaterElectricityRequirement.denominator,
  );
  const powerUses = new Map(s.powerUses),
    used: Readonly<{ eventFingerprint: string; amount: WaterFraction }>[] = [];
  for (const fp of op.powerEventFingerprints) {
    const power = readIndustryFirstDayPowerReplayDelivery(
      ctx.industryPowerState,
      text(fp),
      sha,
    );
    if (
      power.worldId !== s.worldId ||
      power.seedFingerprint !== s.seedFingerprint ||
      power.admissionRef !== s.admissionRef ||
      power.countryId !== source.countryId ||
      power.operatorId !== source.operatorId ||
      power.facilityId !== source.facilityId ||
      power.runId !== source.runId ||
      power.purpose !== 'PROCESS_WATER_PUMPING_SELF_USE' ||
      BigInt(power.fromSimTime) > BigInt(from) ||
      BigInt(power.throughSimTime) < BigInt(until) ||
      BigInt(power.frame.transition.worldVersionAfter) >
        BigInt(ctx.head.worldVersion) ||
      power.frame.command.simTime.ticks > command.simTime.ticks
    )
      invalid('EXACT_ALREADY_DELIVERED_WATER_POWER_SCOPE_REQUIRED');
    const event = power.frame.events[0]!;
    original(
      source,
      'POWER_DELIVERY',
      event.eventId,
      sha(event.canonicalPayload),
    );
    const available = minus(
        power.deliveredMWh,
        powerUses.get(text(fp)) ?? zero,
      ),
      take = cmp(available, remaining) < 0 ? available : remaining;
    if (take.numerator !== '0') {
      powerUses.set(text(fp), add(powerUses.get(text(fp)) ?? zero, take));
      used.push(freeze({ eventFingerprint: text(fp), amount: take }));
      remaining = minus(remaining, take);
    }
  }
  if (remaining.numerator !== '0')
    invalid('SUFFICIENT_ACTUAL_POWER_MUST_PRECEDE_WATER_DELIVERY');
  const validFromTicks = until,
    validUntilTicks = g.right.validity.untilTicks,
    account: ProductionWaterAccount = freeze({
      accountRef:
        'WATER_DELIVERY_' +
        hash([s.worldId, command.fingerprint, g.right.rightRef], sha)
          .slice(7)
          .toUpperCase(),
      basinRef: g.right.basinRef,
      countryRef: source.countryId,
      regionRef: source.locationId,
      holderRef: source.operatorId,
      rightRef: g.right.rightRef,
      demandRef: line.demand.demandRef,
      operationRef: intent.operationRef,
      purpose: 'OTHER_INDUSTRY',
      sourceRef: source.sourceRef,
      fromTicks: from,
      untilTicks: until,
      delivered: line.deliveredModelQuantity,
      consumed: zeroWater(),
      available: line.deliveredModelQuantity,
      targetRunId: source.runId,
      facilityRef: source.facilityId,
      sourceRecipeRef: sc.target.recipeRef,
      expiresAtTicks: validUntilTicks,
    });
  const allocationSourceHash = hash(
      {
        source,
        grantFrameHash: hash(g.frame, sha),
        scenarioRecord: result.record,
        powerUses: used,
        paid,
      },
      sha,
    ),
    fact = canonicalSerialize({
      capacityRef: account.accountRef,
      availableBefore: waterVolumeAsQuantity(account.delivered),
      deliveredExact: account.delivered,
      rawAbstractedExact: line.abstracted,
      notDeliveredExact: line.modelUnavailableAfterAbstraction,
      additionalElectricityExact: line.additionalWaterElectricityRequirement,
      sourceRecipeRef: sc.target.recipeRef,
      targetRunId: source.runId,
      facilityRef: source.facilityId,
      policyVersion: POLICY.version,
      allocationSourceHash,
    });
  if (!waterVolumeAsQuantity(account.delivered))
    invalid('DELIVERED_RECIPE_QUANTITY_MUST_BE_EXACT_DECIMAL');
  const receipt = industryUtilityOperatingReceiptFromRun(
      {
        command,
        source,
        productionRun: run,
        validFromTicks,
        validUntilTicks,
        factCanonicalPayload: fact,
      },
      sha,
    ),
    usedPaid = new Set(s.usedPaidInputs);
  usedPaid.add(paid.workEventFingerprint);
  usedPaid.add(paid.paymentEventFingerprint);
  const delivery: Omit<IndustryFirstDayWaterReplayDelivery, 'frame'> = freeze({
    classification: 'CORE_REPLAYED_COMMITTED_WATER_DATA_NOT_DB_AUTHORITY',
    source,
    worldId: s.worldId,
    seedId: s.seedId,
    seedFingerprint: s.seedFingerprint,
    admissionRef: s.admissionRef,
    accounts: [account],
    operatingFactCanonicalPayload: fact,
    allocationSourceHash,
    validFromTicks,
    validUntilTicks,
    scenarioRecord: result.record,
    actualPaidInput: paid,
    powerUses: used,
  });
  return {
    next: { ...s, scenario: result.state, powerUses, usedPaidInputs: usedPaid },
    payload: freeze({
      schemaVersion: 'industry-first-day-water-execution-v1',
      stage: 'WATER_DELIVERED',
      policy: POLICY,
      sourceFingerprint: hash(source, sha),
      allocationSourceHash,
      record: result.record,
      accounts: [account],
      actualPaidInput: paid,
      powerUses: used,
    }),
    receipt,
    delivery,
    grant: null,
  };
}
function transition(
  command: CanonicalCommand,
  sequence: string,
  recordedAtReal: string,
  c: Calculation,
  sha: Sha256Hex,
) {
  const after = (BigInt(command.expectedWorldVersion!) + 1n).toString(),
    events = [
      parseAuthoritativeEvent(
        {
          schemaVersion: 'event-v1',
          eventId: 'EVENT_WATER_' + command.fingerprint.slice(7).toUpperCase(),
          eventType: EVENT,
          worldId: command.worldId,
          causationCommandId: command.commandId,
          correlationId: command.correlationId,
          worldVersion: after,
          sequence: (BigInt(sequence) + 1n).toString(),
          simTime: command.simTime.toCanonicalValue(),
          recordedAtReal,
          correctsEventId: null,
          payload: c.payload,
        },
        sha,
      ),
    ];
  if (c.receipt)
    events.push(
      parseAuthoritativeEvent(
        {
          schemaVersion: 'event-v1',
          eventId:
            'EVENT_WATER_RECEIPT_' + command.fingerprint.slice(7).toUpperCase(),
          eventType: RECEIPT_EVENT,
          worldId: command.worldId,
          causationCommandId: command.commandId,
          correlationId: command.correlationId,
          worldVersion: after,
          sequence: (BigInt(sequence) + 2n).toString(),
          simTime: command.simTime.toCanonicalValue(),
          recordedAtReal,
          correctsEventId: null,
          payload: { operatingReceipt: c.receipt },
        },
        sha,
      ),
    );
  return createAuthoritativeTransition({
    command,
    events,
    worldVersionBefore: command.expectedWorldVersion!,
    worldVersionAfter: after,
  });
}
export function prepareIndustryFirstDayWaterExecution(
  input: {
    preparation: IndustryUtilityExecutionPreparation;
    state: IndustryFirstDayWaterExecutionState;
  },
  sha: Sha256Hex,
) {
  const d = readIndustryUtilityExecution(input.preparation, sha),
    r = d.replay.result;
  const installed = lookup(input.state).originals.get(key(d.source));
  const commandSource =
    installed?.commandSources?.find(
      (snapshot) => snapshot.commandFingerprint === d.command.fingerprint,
    )?.source ?? installed?.source;
  if (!commandSource || !same(commandSource, d.source))
    invalid('EXACT_INSTALLED_COMMAND_SOURCE_PREPARATION_REQUIRED');
  if (
    r.industryWaterState !== input.state ||
    !r.financialState ||
    !r.inventoryState
  )
    invalid('EXACT_WATER_STATE_IN_GENUINE_BEFORE_PREFIX_REQUIRED');
  const c = calculate(
    input.state,
    d.command,
    {
      head: d.replay.head,
      financial: r.financialState,
      inventory: r.inventoryState,
      ...(r.industryWorkState
        ? { industryWorkState: r.industryWorkState }
        : {}),
      ...(r.industryWageState
        ? { industryWageState: r.industryWageState }
        : {}),
      ...(r.industryPowerState
        ? { industryPowerState: r.industryPowerState }
        : {}),
    },
    sha,
  );
  return freeze({
    classification: 'DRAFT_WATER_TRANSITION_NOT_COMMITTED_DELIVERY' as const,
    step: {
      command: d.command,
      transition: transition(
        d.command,
        d.replay.head.eventSequence,
        d.command.submittedAtReal,
        c,
        sha,
      ),
      financialPostingBatches: [],
      inventoryPostings: [],
    },
  });
}
export function replayIndustryFirstDayWaterExecutionFrame(
  input: {
    state: IndustryFirstDayWaterExecutionState;
    frame: FinanceNativeBudgetCanonicalFrame;
    sourceInputs: IndustryFirstDayWaterReplayOriginal;
    prior: IndustryFirstDayWaterReplayContext;
  },
  sha: Sha256Hex,
) {
  const expanded = extend(lookup(input.state), [input.sourceInputs], sha),
    s = input.state,
    frame = input.frame;
  bindAuthoritativeTransition(
    { command: frame.command, transition: frame.transition },
    sha,
  );
  if (
    !same(frame.events, frame.transition.events) ||
    frame.financialPostingBatches.length ||
    frame.inventoryPostings.length ||
    !same(
      frame.receipt,
      createFinalCommandReceipt({
        command: frame.command,
        transition: frame.transition,
        outcome: 'COMMITTED',
        reasonCode: null,
        simTime: frame.command.simTime,
        recordedAtReal: frame.receipt.recordedAtReal,
      }),
    )
  )
    invalid('FULL_COMMITTED_WATER_FRAME_AND_ZERO_JOURNALS_REQUIRED');
  const previous = expanded.commands.get(frame.command.commandId),
    fingerprint = hash(frame, sha);
  if (previous) {
    if (previous !== fingerprint) invalid('WATER_REPLAY_CONFLICT');
    return {
      state: s,
      financial: input.prior.financial,
      inventory: input.prior.inventory,
    };
  }
  const temporary = issue(expanded),
    c = calculate(temporary, frame.command, input.prior, sha),
    tr = transition(
      frame.command,
      input.prior.head.eventSequence,
      frame.events[0]!.recordedAtReal,
      c,
      sha,
    );
  if (!same(tr, frame.transition))
    invalid('WATER_RESOURCE_EVENT_OR_RECEIPT_REDERIVATION_DIFFERS');
  const grants = new Map(expanded.grants),
    entries = new Map(expanded.entries),
    commands = new Map(expanded.commands);
  commands.set(frame.command.commandId, fingerprint);
  if (c.grant)
    grants.set(
      c.grant.sourceRegionId + '\n' + c.grant.right.holderRef,
      freeze({ ...c.grant, frame }),
    );
  if (c.delivery)
    entries.set(frame.events[0]!.fingerprint, freeze({ ...c.delivery, frame }));
  return {
    state: issue({ ...c.next, grants, entries, commands }),
    financial: input.prior.financial,
    inventory: input.prior.inventory,
  };
}
export function readIndustryFirstDayWaterReplayDelivery(
  state: IndustryFirstDayWaterExecutionState,
  eventFingerprint: string,
  sha: Sha256Hex,
) {
  const s = lookup(state),
    e = s.entries.get(eventFingerprint);
  if (!e || s.commands.get(e.frame.command.commandId) !== hash(e.frame, sha))
    invalid('ACTUAL_REPLAYED_WATER_DELIVERY_REQUIRED');
  return e;
}
declare const actualWater: unique symbol;
export interface IndustryFirstDayWaterExecution {
  readonly [actualWater]: true;
}
const deliveries = new WeakMap<
  object,
  {
    view: FinanceSocialReplayContinuationView;
    state: IndustryFirstDayWaterExecutionState;
    entry: IndustryFirstDayWaterReplayDelivery;
  }
>();
export function confirmIndustryFirstDayWaterExecution(
  input: {
    replay: FinanceSocialReplayContinuationView;
    eventFingerprint: string;
  },
  sha: Sha256Hex,
): IndustryFirstDayWaterExecution {
  const view = readFinanceSocialReplayContinuationView(input.replay, sha),
    state = view.result.industryWaterState;
  if (!view.complete || !state)
    invalid('GENUINE_COMPLETE_AFTER_WATER_PREFIX_REQUIRED');
  const entry = readIndustryFirstDayWaterReplayDelivery(
    state,
    input.eventFingerprint,
    sha,
  );
  if (
    entry.worldId !== view.worldId ||
    entry.seedFingerprint !== view.seedFingerprint ||
    BigInt(entry.frame.transition.worldVersionAfter) >
      BigInt(view.head.worldVersion) ||
    BigInt(entry.frame.events.at(-1)!.sequence) >
      BigInt(view.head.eventSequence)
  )
    invalid('EXACT_WATER_DELIVERY_IN_COMPLETE_PREFIX_REQUIRED');
  const token = Object.freeze({}) as IndustryFirstDayWaterExecution;
  deliveries.set(token, { view, state, entry });
  return token;
}
export function readIndustryFirstDayWaterExecution(
  token: IndustryFirstDayWaterExecution,
  sha: Sha256Hex,
) {
  const d = deliveries.get(token);
  if (!d) invalid('GENUINE_CONFIRMED_WATER_EXECUTION_REQUIRED');
  const view = readFinanceSocialReplayContinuationView(d.view, sha);
  if (!view.complete || view.result.industryWaterState !== d.state)
    invalid('CONFIRMED_WATER_PREFIX_IDENTITY_CHANGED');
  return readIndustryFirstDayWaterReplayDelivery(
    d.state,
    d.entry.frame.events[0]!.fingerprint,
    sha,
  );
}
