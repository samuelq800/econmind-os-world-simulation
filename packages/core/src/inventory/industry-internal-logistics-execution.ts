/** Deterministic logistics frames. All preparations/tokens are conditional
 * replay DATA: the Worker still owns actual custody, source, actor and commit
 * cutoffs. A planned route, a manufacturing WORK token or budget is no delivery. */
import {
  canonicalSha256,
  validateCanonicalCommand,
  type CanonicalCommand,
  type Sha256Hex,
} from '../commands/command.js';
import {
  bindAuthoritativeTransition,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  validateFinalReceiptForCommand,
} from '../commands/receipt.js';
import type { FinanceNativeBudgetCanonicalFrame } from '../commands/finance-budget-native.js';
import {
  INDUSTRY_UTILITY_COMMANDS,
  INDUSTRY_UTILITY_EVENTS,
  INDUSTRY_UTILITY_OPERATING_RECEIPT_EVENT,
  industryUtilityOperatingReceiptFromRun,
  parseIndustryUtilityIntent,
  readIndustryUtilityExecution,
  type IndustryUtilityExecutionPreparation,
  type IndustryUtilitySource,
} from '../commands/industry-utility-execution.js';
import {
  readFinanceSocialReplayContinuationView,
  type FinanceSocialReplayContinuationView,
} from '../commands/finance-social-replay-continuation.js';
import type { IndustryFirstDayWorkState } from '../industry/industry-first-day-work.js';
import type { IndustryOperatingWageState } from '../commands/industry-operating-wage-payment.js';
import {
  EVENT_SCHEMA_VERSION,
  parseAuthoritativeEvent,
} from '../events/event.js';
import {
  createIndustryInternalLogisticsPlanningState,
  prepareIndustryInternalLogisticsPlan,
  readIndustryInternalLogisticsPlan,
  readIndustryInternalLogisticsSource,
  INDUSTRY_INTERNAL_LOGISTICS_POLICY_VERSION,
  INDUSTRY_INTERNAL_LOGISTICS_POLICY_RAW_SHA256,
  INDUSTRY_INTERNAL_LOGISTICS_ADOPTION_RAW_SHA256,
  IndustryInternalLogisticsError,
  type IndustryInternalLogisticsSource,
  type IndustryInternalLogisticsPlan,
  type IndustryInternalLogisticsPlanningState,
  type IndustryInternalLogisticsRequest,
} from './industry-internal-logistics.js';
import {
  createInventoryAccount,
  createReservationPosting,
  createShipmentPosting,
  createDeliveryPosting,
  applyInventoryPosting,
  parseInventoryLedgerSnapshot,
  INVENTORY_POSTING_SCHEMA_VERSION,
  type InventoryAccount,
  type InventoryLedgerState,
  type InventoryPosting,
} from './inventory-ledger.js';
import {
  createFinancialAccount,
  createFinancialPostingBatch,
  applyFinancialPostingBatch,
  parseFinancialLedgerSnapshot,
  FINANCIAL_POSTING_SCHEMA_VERSION,
  type FinancialLedgerState,
  type FinancialPostingBatch,
  type FinancialPostingLeg,
} from '../finance/financial-ledger.js';
import {
  inheritProductionDepositInstruments,
  isSettledOriginalProductionDeposit,
  readProductionWageDepositAccounts,
  bindBeneficialProductionDepositRecipients,
} from '../finance/production-deposit-funding.js';
import {
  authorizeFinancialLedgerState,
  authorizeInventoryLedgerState,
  isAuthoritativeFinancialLedgerState,
  isAuthoritativeInventoryLedgerState,
} from '../opening/ledger-authority.js';
import {
  readIndustryFirstDayWorkState,
  type IndustryFirstDayWorkAllocation,
} from '../industry/industry-first-day-work.js';
import {
  createBeneficialHousingRentState,
  type BeneficialHousingReclassificationReceipt,
} from '../finance/beneficial-housing-rent.js';
import { Money } from '../numeric/money.js';
import { Quantity } from '../numeric/quantity.js';
import { canonicalDecimal } from '../numeric/world-decimal.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';
import {
  financialAccountId,
  financialPostingBatchId,
  financialPostingLegId,
  inventoryLocationId,
  inventoryPostingId,
  inventoryReservationId,
  inventoryShipmentId,
} from '../ids.js';

type Frame = FinanceNativeBudgetCanonicalFrame;
type Head = Readonly<{ worldVersion: string; eventSequence: string }>;
type Allocation = IndustryFirstDayWorkAllocation;
export interface IndustryLogisticsLabourSource {
  readonly schemaVersion: 'industry-logistics-labour-source-v1';
  readonly sourceRef: string;
  readonly sourceRawSha256: string;
  readonly worldId: string;
  readonly countryId: string;
  readonly facilityId: string;
  readonly operatorId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly positions: readonly Readonly<{
    positionId: string;
    poolId: string;
    regionId: string;
    cohortRef: string;
    sourceStartOrdinal: string;
    startOrdinal: string;
    count: string;
    skill: 'LOW' | 'MEDIUM' | 'HIGH';
    sourceBucket: 'LOGISTICS';
    sourceObjectId: string;
    annualWage: string;
    currency: string;
    wageSourceRef: string;
    wageSourceRawSha256: string;
    householdAccountId: string;
  }>[];
}
/** This is an expense ORDER original, not a paid flag. PAY_INPUTS must produce
 * and apply the complete actual bank-deposit settlement before delivery. Its
 * actual source/issuer/admission must be held by the future fixed SQL cutoff. */
export interface IndustryLogisticsExpenseOrder {
  readonly schemaVersion: 'industry-logistics-service-expense-order-v1';
  readonly purpose: 'DISTINCT_LOGISTICS_SERVICE_WORK_WAGE';
  readonly inputRef: string;
  readonly worldId: string;
  readonly countryId: string;
  readonly facilityId: string;
  readonly operatorId: string;
  readonly runId: string;
  readonly seedFingerprint: string;
  readonly transferId: string;
  readonly workEventFingerprint: string;
  readonly householdAccountId: string;
  readonly amount: string;
  readonly currency: string;
}
export interface IndustryLogisticsExpenseOriginal {
  readonly reference: string;
  readonly rawText: string;
  readonly rawSha256: string;
}
type Action = 'BOOK' | 'SHIP' | 'SERVICE_WORK' | 'PAY_INPUTS' | 'DELIVER';
interface Transfer {
  readonly plan: IndustryInternalLogisticsPlan;
  readonly run: RunOriginal;
  readonly status: 'RESERVED' | 'IN_TRANSIT' | 'WORKED' | 'PAID' | 'DELIVERED';
  readonly reserved: Readonly<InventoryAccount>;
  readonly transit: Readonly<InventoryAccount>;
  readonly delivered: Readonly<InventoryAccount>;
  readonly work?: Readonly<{
    frame: Frame;
    allocations: readonly Allocation[];
    labour: Readonly<IndustryLogisticsLabourSource>;
  }>;
  readonly payments: readonly Readonly<{
    frame: Frame;
    batch: FinancialPostingBatch;
    original: IndustryLogisticsExpenseOriginal;
    expenseLegId: string;
    paymentLegId: string;
    amount: string;
    currency: string;
    householdAccountId: string;
  }>[];
}
type RunOriginal = Readonly<{
  source: Readonly<IndustryUtilitySource>;
  productionRun: ReturnType<
    typeof readIndustryFirstDayWorkState
  >['runs'][number];
}>;
export interface IndustryLogisticsReplayContext {
  readonly head: Head & Readonly<{ worldId?: string }>;
  readonly financial: FinancialLedgerState;
  readonly inventory: InventoryLedgerState;
  readonly industryWorkState: IndustryFirstDayWorkState;
  readonly industryWageState?: Readonly<IndustryOperatingWageState>;
}
declare const sourcesBrand: unique symbol;
export interface IndustryInternalLogisticsReplaySources {
  readonly [sourcesBrand]: true;
}
interface SourceData {
  readonly source: IndustryInternalLogisticsSource;
  readonly labourSource: Readonly<IndustryLogisticsLabourSource>;
  readonly utilitySources: readonly Readonly<IndustryUtilitySource>[];
  readonly expenseOriginals: readonly Readonly<IndustryLogisticsExpenseOriginal>[];
  readonly workOriginals: readonly Readonly<IndustryLogisticsExpenseOriginal>[];
  readonly beneficialReceipt?: BeneficialHousingReclassificationReceipt;
  readonly sourceFingerprint: string;
}
const replaySources = new WeakMap<object, Readonly<SourceData>>();
interface State {
  readonly sourceInputs: IndustryInternalLogisticsReplaySources;
  readonly runs: ReadonlyMap<string, RunOriginal>;
  readonly deliveries: ReadonlyMap<string, DeliveryData>;
  readonly source: IndustryInternalLogisticsSource;
  readonly labour: Readonly<IndustryLogisticsLabourSource>;
  readonly planning: IndustryInternalLogisticsPlanningState;
  readonly head: Head;
  readonly lastSimTime: bigint;
  readonly financial: FinancialLedgerState;
  readonly inventory: InventoryLedgerState;
  readonly wageState: Readonly<IndustryOperatingWageState> | undefined;
  readonly transfers: ReadonlyMap<string, Transfer>;
  readonly bookings: readonly Allocation[];
  readonly operationRefs: ReadonlyMap<string, string>;
  readonly seen: ReadonlyMap<
    string,
    Readonly<{
      fingerprint: string;
      frame: Frame;
      execution: IndustryFirstDayLogisticsExecution | null;
    }>
  >;
  readonly inputRefs: ReadonlySet<string>;
  readonly frames: readonly Frame[];
}
declare const stateBrand: unique symbol;
export interface IndustryInternalLogisticsExecutionState {
  readonly [stateBrand]: true;
}
declare const executionBrand: unique symbol;
export interface IndustryFirstDayLogisticsExecution {
  readonly [executionBrand]: true;
}
const states = new WeakMap<object, Readonly<State>>();
interface DeliveryData {
  classification: 'CORE_VALIDATED_LOGISTICS_REPLAY_DATA_NOT_DB_COMMIT_AUTHORITY';
  source: Readonly<IndustryUtilitySource>;
  productionRun: RunOriginal['productionRun'];
  frame: Frame;
  headBefore: Head;
  headAfter: Head;
  operatingFactCanonicalPayload: string;
  validFromTicks: string;
  validUntilTicks: string;
  serviceWorkFrame: Frame;
  paidInputFrames: readonly Frame[];
  actualQualifiedExpenses: readonly Readonly<{
    batchId: string;
    batchFingerprint: string;
    expenseLegId: string;
    paymentLegId: string;
    amount: string;
    currency: string;
  }>[];
}
const executions = new WeakMap<
  object,
  Readonly<DeliveryData & { replay: FinanceSocialReplayContinuationView }>
>();
function invalid(code: string): never {
  throw new IndustryInternalLogisticsError(code);
}
const hash = (v: unknown, sha: Sha256Hex) =>
  canonicalSha256(canonicalHashInput(v), sha);
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('EXACT_DOMAIN_OBJECT_REQUIRED');
  return v as Record<string, unknown>;
}
function keys(v: Record<string, unknown>, names: readonly string[]) {
  if (
    Object.keys(v).length !== names.length ||
    names.some((k) => !Object.hasOwn(v, k))
  )
    invalid('EXACT_DOMAIN_FIELDS_REQUIRED');
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !/^[A-Za-z][A-Za-z0-9._:-]{0,255}$/u.test(v))
    invalid('EXACT_DOMAIN_REFERENCE_REQUIRED');
  return v;
}
function uint(v: unknown): bigint {
  if (typeof v !== 'string' || !/^(?:0|[1-9]\d{0,99})$/u.test(v))
    invalid('EXACT_DOMAIN_INTEGER_REQUIRED');
  return BigInt(v);
}
function rawHash(v: unknown): string {
  if (typeof v !== 'string' || !/^[a-f0-9]{64}$/u.test(v))
    invalid('EXACT_RAW_SHA_REQUIRED');
  return v;
}
function canonicalHash(v: unknown): string {
  if (typeof v !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(v))
    invalid('EXACT_CANONICAL_SHA_REQUIRED');
  return v;
}
type Rational = Readonly<{ n: bigint; d: bigint }>;
function rational(n: bigint, d = 1n): Rational {
  if (n < 0n || d <= 0n) invalid('NONNEGATIVE_EXACT_SERVICE_VALUE_REQUIRED');
  let a = n,
    b = d;
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return { n: n / a, d: d / a };
}
const add = (a: Rational, b: Rational) =>
  rational(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Rational, b: Rational) =>
  rational(a.n * b.d - b.n * a.d, a.d * b.d);
const atMost = (a: Rational, b: Rational) => a.n * b.d <= b.n * a.d;
function decimal(v: string): Rational {
  if (!/^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u.test(v))
    invalid('CANONICAL_SERVICE_DECIMAL_REQUIRED');
  const [w, f = ''] = v.split('.');
  return rational(BigInt(w! + f), 10n ** BigInt(f.length));
}
function current(state: IndustryInternalLogisticsExecutionState) {
  const s = states.get(state);
  if (!s) invalid('ISSUED_LOGISTICS_EXECUTION_STATE_REQUIRED');
  return s;
}
function issue(s: State): IndustryInternalLogisticsExecutionState {
  const t = Object.freeze({}) as IndustryInternalLogisticsExecutionState;
  states.set(t, Object.freeze(s));
  return t;
}
function advanceLedgers(
  s: State,
  frame: Frame,
  inventoryPostings: readonly InventoryPosting[],
  batches: readonly FinancialPostingBatch[],
) {
  // This helper is private and reached only after the fixed domain reducer has
  // recomputed the COMPLETE frame. No caller-selected version or unknown frame
  // can rebrand a snapshot. Posting writers validate their real journals.
  const after = frame.transition.worldVersionAfter;
  let financial = s.financial,
    inventory = s.inventory;
  for (const b of batches)
    financial = applyFinancialPostingBatch(financial, b).state;
  if (!batches.length) {
    if (!isAuthoritativeFinancialLedgerState(financial))
      invalid('GENUINE_CURRENT_FINANCIAL_REQUIRED');
    const next = authorizeFinancialLedgerState(
      parseFinancialLedgerSnapshot({ ...financial, worldVersion: after }),
    );
    inheritProductionDepositInstruments(next, financial);
    financial = next;
  }
  for (const p of inventoryPostings)
    inventory = applyInventoryPosting(inventory, p).state;
  if (!inventoryPostings.length) {
    if (!isAuthoritativeInventoryLedgerState(inventory))
      invalid('GENUINE_CURRENT_INVENTORY_REQUIRED');
    inventory = authorizeInventoryLedgerState(
      parseInventoryLedgerSnapshot({ ...inventory, worldVersion: after }),
    );
  }
  return { financial, inventory };
}
/** Source preparation binds actual immutable DATA. It grants no source
 * registration or spending right; fixed SQL/custodian cutoffs remain required. */
export function prepareIndustryInternalLogisticsReplaySources(
  input: {
    readonly source: IndustryInternalLogisticsSource;
    readonly labourSource: IndustryLogisticsLabourSource;
    readonly utilitySources: readonly IndustryUtilitySource[];
    readonly expenseOriginals?: readonly IndustryLogisticsExpenseOriginal[];
    readonly workOriginals?: readonly IndustryLogisticsExpenseOriginal[];
    readonly beneficialReceipt?: BeneficialHousingReclassificationReceipt;
  },
  sha: Sha256Hex,
): IndustryInternalLogisticsReplaySources {
  const p = readIndustryInternalLogisticsSource(input.source),
    l = freeze(
      JSON.parse(
        canonicalSerialize(input.labourSource),
      ) as IndustryLogisticsLabourSource,
    ),
    utilitySources = freeze(
      JSON.parse(
        canonicalSerialize(input.utilitySources),
      ) as IndustryUtilitySource[],
    );
  if (!utilitySources.length || utilitySources.length > 256)
    invalid('BOUNDED_ACTUAL_LOGISTICS_RUN_SOURCES_REQUIRED');
  for (const u of utilitySources) {
    for (const k of [
      'worldId',
      'countryId',
      'facilityId',
      'operatorId',
      'seedId',
      'seedFingerprint',
    ] as const)
      if (p[k] !== u[k] || l[k] !== u[k])
        invalid('SAME_ACTUAL_LOGISTICS_WORLD_SITE_OP_SEED_REQUIRED');
    if (
      u.policyVersion !== INDUSTRY_INTERNAL_LOGISTICS_POLICY_VERSION ||
      u.policyRawSha256 !== INDUSTRY_INTERNAL_LOGISTICS_POLICY_RAW_SHA256 ||
      u.userAdoptionRawSha256 !==
        INDUSTRY_INTERNAL_LOGISTICS_ADOPTION_RAW_SHA256
    )
      invalid('EXACT_ADOPTED_LOGISTICS_EXECUTION_POLICY_REQUIRED');
    if (
      l.schemaVersion !== 'industry-logistics-labour-source-v1' ||
      l.admissionRef !== u.admissionRef ||
      !l.positions.length ||
      l.positions.length > 256 ||
      !u.originals.some(
        (o) =>
          o.kind === 'LOGISTICS_LABOUR' &&
          o.reference === l.sourceRef &&
          o.rawSha256 === l.sourceRawSha256,
      )
    )
      invalid('ACTUAL_BOUND_LOGISTICS_LABOUR_ORIGINAL_REQUIRED');
    text(u.sourceRef);
    rawHash(u.sourceRawSha256);
    text(u.runId);
    text(u.locationId);
  }
  text(l.sourceRef);
  rawHash(l.sourceRawSha256);
  for (const position of l.positions) {
    for (const k of [
      'positionId',
      'poolId',
      'regionId',
      'cohortRef',
      'wageSourceRef',
      'householdAccountId',
    ] as const)
      text(position[k]);
    const employment = p.logisticsEmploymentSources.find(
      (o) => o.sourceObjectId === position.sourceObjectId,
    );
    if (
      position.sourceBucket !== 'LOGISTICS' ||
      !employment ||
      position.positionId !==
        'POSTWAR_SOURCE_' +
          sha(position.sourceObjectId + '/' + position.skill).toUpperCase() ||
      uint(position.count) > uint(employment.labourBySkill[position.skill])
    )
      invalid('ACTUAL_LOGISTICS_NOT_MANUFACTURING_POSITION_REQUIRED');
    rawHash(position.wageSourceRawSha256);
    uint(position.sourceStartOrdinal);
    uint(position.startOrdinal);
    if (
      !uint(position.count) ||
      !['LOW', 'MEDIUM', 'HIGH'].includes(position.skill) ||
      !Money.from(position.annualWage, position.currency).amount.isPositive()
    )
      invalid('ACTUAL_POSITIVE_SOURCE_EMPLOYMENT_AND_WAGE_REQUIRED');
  }
  if (input.beneficialReceipt) {
    createBeneficialHousingRentState(input.beneficialReceipt);
    if (
      input.beneficialReceipt.worldId !== p.worldId ||
      input.beneficialReceipt.countryId !== p.countryId
    )
      invalid('GENUINE_SAME_WORLD_BENEFICIAL_LOGISTICS_RECIPIENTS_REQUIRED');
  }
  const workOriginals = freeze(
    JSON.parse(
      canonicalSerialize(input.workOriginals ?? []),
    ) as IndustryLogisticsExpenseOriginal[],
  );
  if (workOriginals.length > 256) invalid('BOUNDED_WORK_ORDERS_REQUIRED');
  const workRefs = new Set<string>();
  for (const o of workOriginals) {
    if (
      workRefs.has(o.reference) ||
      o.rawText.length > 65536 ||
      sha(o.rawText) !== o.rawSha256
    )
      invalid('EXACT_UNIQUE_WORK_ORDER_BYTES_REQUIRED');
    text(o.reference);
    rawHash(o.rawSha256);
    workRefs.add(o.reference);
  }
  const expenseOriginals = freeze(
    JSON.parse(
      canonicalSerialize(input.expenseOriginals ?? []),
    ) as IndustryLogisticsExpenseOriginal[],
  );
  if (expenseOriginals.length > 256)
    invalid('BOUNDED_LOGISTICS_EXPENSE_ORIGINALS_REQUIRED');
  const refs = new Set<string>();
  for (const original of expenseOriginals) {
    text(original.reference);
    rawHash(original.rawSha256);
    if (
      refs.has(original.reference) ||
      original.rawText.length > 16384 ||
      sha(original.rawText) !== original.rawSha256
    )
      invalid('EXACT_UNIQUE_LOGISTICS_EXPENSE_BYTES_REQUIRED');
    refs.add(original.reference);
  }
  const token = Object.freeze({}) as IndustryInternalLogisticsReplaySources;
  replaySources.set(
    token,
    Object.freeze({
      source: input.source,
      labourSource: l,
      utilitySources,
      expenseOriginals,
      workOriginals,
      ...(input.beneficialReceipt
        ? { beneficialReceipt: input.beneficialReceipt }
        : {}),
      sourceFingerprint: hash(
        {
          source: p,
          labourSource: l,
          utilitySources,
          expenseOriginals,
          workOriginals,
          ...(input.beneficialReceipt
            ? { beneficialReceipt: input.beneficialReceipt }
            : {}),
        },
        sha,
      ),
    }),
  );
  return token;
}
export function readIndustryInternalLogisticsReplaySources(
  token: IndustryInternalLogisticsReplaySources,
) {
  const d = replaySources.get(token);
  if (!d) invalid('GENUINE_LOGISTICS_REPLAY_SOURCE_DATA_REQUIRED');
  const p = readIndustryInternalLogisticsSource(d.source);
  return Object.freeze({
    ...p,
    admissionRef: d.labourSource.admissionRef,
    sourceFingerprint: d.sourceFingerprint,
    labourSource: d.labourSource,
    utilitySources: d.utilitySources,
    expenseOriginals: d.expenseOriginals,
    workOriginals: d.workOriginals,
    ...(d.beneficialReceipt ? { beneficialReceipt: d.beneficialReceipt } : {}),
  });
}
export function mergeIndustryInternalLogisticsReplaySources(
  existing: readonly IndustryInternalLogisticsReplaySources[],
  incoming: readonly IndustryInternalLogisticsReplaySources[],
  sha: Sha256Hex,
): readonly IndustryInternalLogisticsReplaySources[] {
  const scoped = new Map<string, IndustryInternalLogisticsReplaySources>(),
    routes = new Map<string, string>();
  for (const token of [...existing, ...incoming]) {
    const d = readIndustryInternalLogisticsReplaySources(token),
      key = canonicalSerialize([d.worldId, d.countryId, d.facilityId]),
      route = canonicalSerialize([d.worldId, d.countryId, d.routeRef]);
    if (routes.has(route) && routes.get(route) !== key)
      invalid('PUBLIC_ROUTE_CAPACITY_CANNOT_BE_INSTALLED_PER_FACILITY_TWICE');
    routes.set(route, key);
    const previous = scoped.get(key);
    if (!previous) {
      scoped.set(key, token);
      continue;
    }
    const old = readIndustryInternalLogisticsReplaySources(previous),
      oldData = replaySources.get(previous)!;
    if (
      !same(
        readIndustryInternalLogisticsSource(oldData.source),
        readIndustryInternalLogisticsSource(replaySources.get(token)!.source),
      ) ||
      !same(old.labourSource, d.labourSource) ||
      !same(old.beneficialReceipt ?? null, d.beneficialReceipt ?? null)
    )
      invalid('IMMUTABLE_LOGISTICS_SOURCE_REFERENCE_CONFLICT');
    const originals = new Map<string, IndustryUtilitySource>(),
      expenses = new Map<string, IndustryLogisticsExpenseOriginal>();
    for (const source of [...old.utilitySources, ...d.utilitySources]) {
      const id = canonicalSerialize([source.runId, source.sourceRef]);
      if (originals.has(id) && !same(originals.get(id), source))
        invalid('IMMUTABLE_LOGISTICS_SOURCE_REFERENCE_CONFLICT');
      originals.set(id, source);
    }
    for (const expense of [...old.expenseOriginals, ...d.expenseOriginals]) {
      if (
        expenses.has(expense.reference) &&
        !same(expenses.get(expense.reference), expense)
      )
        invalid('IMMUTABLE_LOGISTICS_EXPENSE_REFERENCE_CONFLICT');
      expenses.set(expense.reference, expense);
    }
    const works = new Map<string, IndustryLogisticsExpenseOriginal>();
    for (const original of [...old.workOriginals, ...d.workOriginals]) {
      if (
        works.has(original.reference) &&
        !same(works.get(original.reference), original)
      )
        invalid('IMMUTABLE_WORK_ORDER_REFERENCE_CONFLICT');
      works.set(original.reference, original);
    }
    scoped.set(
      key,
      prepareIndustryInternalLogisticsReplaySources(
        {
          source: oldData.source,
          labourSource: old.labourSource,
          utilitySources: [...originals.values()],
          expenseOriginals: [...expenses.values()],
          workOriginals: [...works.values()],
          ...(old.beneficialReceipt
            ? { beneficialReceipt: old.beneficialReceipt }
            : {}),
        },
        sha,
      ),
    );
  }
  return Object.freeze([...scoped.values()]);
}
function contextState(input: {
  readonly state?: IndustryInternalLogisticsExecutionState;
  readonly sourceInputs: IndustryInternalLogisticsReplaySources;
  readonly context: IndustryLogisticsReplayContext;
}): IndustryInternalLogisticsExecutionState {
  const data = replaySources.get(input.sourceInputs);
  if (!data) invalid('GENUINE_LOGISTICS_REPLAY_SOURCE_DATA_REQUIRED');
  const p = readIndustryInternalLogisticsSource(data.source),
    c = input.context;
  if (
    !isAuthoritativeFinancialLedgerState(c.financial) ||
    !isAuthoritativeInventoryLedgerState(c.inventory) ||
    c.financial.worldId !== p.worldId ||
    c.inventory.worldId !== p.worldId ||
    c.financial.worldVersion !== c.head.worldVersion ||
    c.inventory.worldVersion !== c.head.worldVersion ||
    (c.head.worldId !== undefined && c.head.worldId !== p.worldId)
  )
    invalid('SAME_ACTUAL_LOGISTICS_CONTEXT_LEDGERS_REQUIRED');
  const known = readIndustryFirstDayWorkState(c.industryWorkState),
    runs = new Map<string, RunOriginal>();
  if (known.worldId !== p.worldId)
    invalid('SAME_ACTUAL_WORLD_WORK_PREFIX_REQUIRED');
  for (const source of data.utilitySources) {
    const actual = known.runs.filter(
      (r) =>
        r.terms.runId === source.runId &&
        r.terms.facilityId === source.facilityId &&
        r.source.worldId === source.worldId &&
        r.source.countryId === source.countryId &&
        r.source.operatorId === source.operatorId &&
        r.source.locationId === source.locationId &&
        r.source.seedId === source.seedId &&
        r.source.seedFingerprint === source.seedFingerprint &&
        r.source.admissionRef === source.admissionRef,
    );
    if (actual.length !== 1 || runs.has(source.runId))
      invalid('ACTUAL_UNIQUE_COMMITTED_LOGISTICS_TARGET_RUN_REQUIRED');
    runs.set(
      source.runId,
      Object.freeze({ source, productionRun: actual[0]! }),
    );
  }
  if (data.beneficialReceipt)
    bindBeneficialProductionDepositRecipients(
      c.financial,
      data.beneficialReceipt,
    );
  const old = input.state ? current(input.state) : undefined;
  if (old && !same(readIndustryInternalLogisticsSource(old.source), p))
    invalid('LOGISTICS_CONTEXT_SOURCE_IDENTITY_CHANGED');
  const ownWork = old
    ? [...old.transfers.values()].flatMap((t) => t.work?.allocations ?? [])
    : [];
  return issue(
    old
      ? {
          ...old,
          sourceInputs: input.sourceInputs,
          runs,
          labour: data.labourSource,
          head: Object.freeze({
            worldVersion: c.head.worldVersion,
            eventSequence: c.head.eventSequence,
          }),
          financial: c.financial,
          inventory: c.inventory,
          wageState: c.industryWageState,
          bookings: Object.freeze([...known.bookings, ...ownWork]),
        }
      : {
          sourceInputs: input.sourceInputs,
          runs,
          deliveries: new Map(),
          source: data.source,
          labour: data.labourSource,
          planning: createIndustryInternalLogisticsPlanningState(data.source),
          head: Object.freeze({
            worldVersion: c.head.worldVersion,
            eventSequence: c.head.eventSequence,
          }),
          lastSimTime: 0n,
          financial: c.financial,
          inventory: c.inventory,
          wageState: c.industryWageState,
          transfers: new Map(),
          bookings: known.bookings,
          operationRefs: new Map(),
          seen: new Map(),
          inputRefs: new Set(),
          frames: Object.freeze([]),
        },
  );
}
export function createIndustryInternalLogisticsExecutionState(
  input: {
    readonly preparation: IndustryUtilityExecutionPreparation;
    readonly state?: IndustryInternalLogisticsExecutionState;
    readonly sourceInputs: IndustryInternalLogisticsReplaySources;
  },
  sha: Sha256Hex,
): IndustryInternalLogisticsExecutionState {
  const d = readIndustryUtilityExecution(input.preparation, sha),
    financial = d.replay.result.financialState,
    inventory = d.replay.result.inventoryState,
    industryWorkState = d.replay.result.industryWorkState;
  if (
    d.intent.serviceKind !== 'LOGISTICS' ||
    !financial ||
    !inventory ||
    !industryWorkState
  )
    invalid('GENUINE_COMPLETE_LOGISTICS_PREPARATION_REQUIRED');
  const prior = d.replay.result.industryLogisticsState ?? [];
  if (input.state && !prior.includes(input.state))
    invalid('ACTUAL_COMPLETE_PREFIX_LOGISTICS_STATE_REQUIRED');
  if (
    !input.state &&
    prior.some((state) =>
      same(
        readIndustryInternalLogisticsExecutionState(state).source,
        readIndustryInternalLogisticsSource(
          replaySources.get(input.sourceInputs)!.source,
        ),
      ),
    )
  )
    invalid('EXISTING_LOGISTICS_STATE_CANNOT_BE_RESET');
  const token = contextState({
    ...(input.state ? { state: input.state } : {}),
    sourceInputs: input.sourceInputs,
    context: {
      head: d.replay.head,
      financial,
      inventory,
      industryWorkState,
      ...(d.replay.result.industryWageState
        ? { industryWageState: d.replay.result.industryWageState }
        : {}),
    },
  });
  const state = current(token),
    last = d.replay.lastPage.frames.at(-1);
  if (
    !last ||
    last.transition.worldVersionAfter !== d.replay.head.worldVersion ||
    last.events.at(-1)?.sequence !== d.replay.head.eventSequence
  )
    invalid('COMPLETE_TERMINAL_FRAME_WITNESS_REQUIRED');
  return issue({ ...state, lastSimTime: last.command.simTime.ticks });
}
function intersects(a: Allocation, b: Allocation) {
  return (
    a.regionId === b.regionId &&
    uint(a.startOrdinal) < uint(b.startOrdinal) + uint(b.count) &&
    uint(b.startOrdinal) < uint(a.startOrdinal) + uint(a.count)
  );
}
function validateWork(
  s: State,
  t: Transfer,
  raw: unknown,
  now: bigint,
): readonly Allocation[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > 256)
    invalid('BOUNDED_DISTINCT_SERVICE_WORK_REQUIRED');
  const plan = readIndustryInternalLogisticsPlan(t.plan),
    out: Allocation[] = [];
  for (const value of raw) {
    const a = object(value);
    keys(a, [
      'positionId',
      'poolId',
      'sourceStartOrdinal',
      'populationLineage',
      'regionId',
      'cohortRef',
      'startOrdinal',
      'count',
      'skill',
      'startsAtSimTime',
      'endsAtSimTime',
      'personMilliseconds',
      'personMinutes',
    ]);
    const count = uint(a.count),
      start = uint(a.startsAtSimTime),
      end = uint(a.endsAtSimTime),
      ordinal = uint(a.startOrdinal);
    if (
      !count ||
      end <= start ||
      start < uint(plan.request.startsAtSimTime) ||
      end > uint(plan.request.endsAtSimTime) ||
      end > now ||
      a.populationLineage !== 'POSTWAR_REGIONAL_POPULATION_ORDINAL_V1' ||
      uint(a.personMilliseconds) !== count * (end - start) ||
      !same(a.personMinutes, {
        numerator: a.personMilliseconds,
        denominator: '60000',
      })
    )
      invalid('ACTUAL_ELAPSED_EXACT_LOGISTICS_PERSON_TIME_REQUIRED');
    const positions = s.labour.positions.filter(
      (p) =>
        p.positionId === a.positionId &&
        p.poolId === a.poolId &&
        p.regionId === a.regionId &&
        p.cohortRef === a.cohortRef &&
        p.sourceStartOrdinal === a.sourceStartOrdinal &&
        p.skill === a.skill &&
        uint(p.startOrdinal) <= ordinal &&
        ordinal + count <= uint(p.startOrdinal) + uint(p.count),
    );
    if (positions.length !== 1)
      invalid('ACTUAL_LOGISTICS_EMPLOYEE_ORDINAL_RANGE_REQUIRED');
    const allocation = freeze(JSON.parse(canonicalSerialize(a)) as Allocation),
      prior = [...s.bookings, ...out].filter((b) => intersects(allocation, b));
    if (
      prior.some(
        (b) => start < uint(b.endsAtSimTime) && uint(b.startsAtSimTime) < end,
      )
    )
      invalid('SERVICE_AND_MANUFACTURING_OR_PRIOR_SERVICE_TIME_OVERLAP');
    const boundaries = new Set([ordinal, ordinal + count]);
    for (const b of prior) {
      const lo = uint(b.startOrdinal),
        hi = lo + uint(b.count);
      if (lo > ordinal && lo < ordinal + count) boundaries.add(lo);
      if (hi > ordinal && hi < ordinal + count) boundaries.add(hi);
    }
    for (const at of boundaries) {
      if (at === ordinal + count) continue;
      let duration = end - start;
      for (const b of prior)
        if (
          uint(b.startOrdinal) <= at &&
          at < uint(b.startOrdinal) + uint(b.count)
        )
          duration += uint(b.endsAtSimTime) - uint(b.startsAtSimTime);
      if (duration > 28800000n)
        invalid('DISTINCT_ACTUAL_WORKER_480_MINUTE_DAILY_LIMIT');
    }
    out.push(allocation);
  }
  return Object.freeze(out);
}
function original(
  s: State,
  t: Transfer,
  op: Record<string, unknown>,
  input: IndustryLogisticsExpenseOriginal | undefined,
  sha: Sha256Hex,
) {
  if (!input) invalid('QUALIFIED_INDEPENDENT_SERVICE_EXPENSE_ORDER_REQUIRED');
  if (
    input.rawText.length > 16384 ||
    sha(input.rawText) !== input.rawSha256 ||
    input.reference !== op.expenseOrderRef ||
    input.rawSha256 !== op.expenseOrderSha256 ||
    s.inputRefs.has(input.reference)
  )
    invalid('ACTUAL_UNIQUE_IMMUTABLE_LOGISTICS_EXPENSE_ORIGINAL_REQUIRED');
  const o = object(JSON.parse(input.rawText));
  keys(o, [
    'schemaVersion',
    'purpose',
    'inputRef',
    'worldId',
    'countryId',
    'facilityId',
    'operatorId',
    'runId',
    'seedFingerprint',
    'transferId',
    'workEventFingerprint',
    'householdAccountId',
    'amount',
    'currency',
  ]);
  if (
    canonicalSerialize(o) !== input.rawText ||
    o.schemaVersion !== 'industry-logistics-service-expense-order-v1' ||
    o.purpose !== 'DISTINCT_LOGISTICS_SERVICE_WORK_WAGE' ||
    o.inputRef !== input.reference ||
    !t.work
  )
    invalid('DISTINCT_LOGISTICS_SERVICE_WORK_EXPENSE_ORIGINAL_REQUIRED');
  const p = readIndustryInternalLogisticsPlan(t.plan),
    d = t.run;
  for (const k of [
    'worldId',
    'countryId',
    'facilityId',
    'operatorId',
    'seedFingerprint',
  ] as const)
    if (o[k] !== d.source[k]) invalid('EXACT_LOGISTICS_EXPENSE_SCOPE_REQUIRED');
  if (
    o.runId !== p.request.runId ||
    o.transferId !== p.request.transferId ||
    o.workEventFingerprint !== t.work.frame.events[0]!.fingerprint ||
    op.workEventFingerprint !== o.workEventFingerprint
  )
    invalid('ACTUAL_PRIOR_INDEPENDENT_WORK_ORIGIN_REQUIRED');
  const account = text(o.householdAccountId),
    currency = text(o.currency),
    amount = Money.from(String(o.amount), currency);
  if (
    !amount.amount.isPositive() ||
    canonicalDecimal(amount.amount) !== o.amount
  )
    invalid('ACTUAL_POSITIVE_QUALIFIED_PAID_AMOUNT_REQUIRED');
  let earned = rational(0n);
  for (const a of t.work.allocations) {
    const p = t.work.labour.positions.find(
      (p) =>
        p.positionId === a.positionId &&
        p.poolId === a.poolId &&
        p.regionId === a.regionId &&
        p.cohortRef === a.cohortRef &&
        uint(p.startOrdinal) <= uint(a.startOrdinal) &&
        uint(a.startOrdinal) + uint(a.count) <=
          uint(p.startOrdinal) + uint(p.count),
    );
    if (!p) invalid('ACTUAL_SERVICE_WAGE_SOURCE_REQUIRED');
    const beneficiary = replaySources.get(s.sourceInputs)!.beneficialReceipt;
    let personMilliseconds = uint(a.personMilliseconds);
    if (beneficiary) {
      const subaccount = beneficiary.subaccounts.find(
        (r) => r.account.accountId === account,
      );
      if (!subaccount) invalid('ACTUAL_CHILD_BENEFICIAL_SUBACCOUNT_REQUIRED');
      const groups = beneficiary.groups.filter(
        (g) => g.groupId === subaccount.groupId && g.locationId === a.regionId,
      );
      let people = 0n;
      for (const g of groups) {
        const left =
          uint(g.firstPersonOrdinal) > uint(a.startOrdinal)
            ? uint(g.firstPersonOrdinal)
            : uint(a.startOrdinal);
        const right =
          uint(g.firstPersonOrdinal) + uint(g.population) <
          uint(a.startOrdinal) + uint(a.count)
            ? uint(g.firstPersonOrdinal) + uint(g.population)
            : uint(a.startOrdinal) + uint(a.count);
        if (right > left) people += right - left;
      }
      personMilliseconds =
        people * (uint(a.endsAtSimTime) - uint(a.startsAtSimTime));
      if (!personMilliseconds) continue;
    } else if (p.householdAccountId !== account) continue;
    if (p.currency !== currency) invalid('EXACT_SOURCE_WAGE_CURRENCY_REQUIRED');
    const annual = decimal(p.annualWage);
    earned = add(
      earned,
      rational(annual.n * personMilliseconds, annual.d * 360n * 480n * 60000n),
    );
  }
  let paid = decimal(String(o.amount));
  for (const previous of t.payments)
    if (previous.householdAccountId === account) {
      if (previous.currency !== currency)
        invalid('EXACT_PAID_INPUT_CURRENCY_REQUIRED');
      paid = add(paid, decimal(previous.amount));
    }
  if (!earned.n || !atMost(paid, earned))
    invalid('ACTUAL_SERVICE_WAGE_LIABILITY_CAP_EXCEEDED');
  let runPaid = decimal(String(o.amount));
  for (const prior of s.wageState?.runPayments ?? [])
    if (
      prior.countryId === d.source.countryId &&
      prior.operatorId === d.source.operatorId &&
      prior.facilityId === d.source.facilityId &&
      prior.runId === d.source.runId
    ) {
      if (prior.currency !== currency)
        invalid('EXACT_RUN_EXPENSE_CURRENCY_REQUIRED');
      runPaid = add(
        runPaid,
        rational(uint(prior.amount.numerator), uint(prior.amount.denominator)),
      );
    }
  for (const prior of s.transfers.values())
    if (
      readIndustryInternalLogisticsPlan(prior.plan).request.runId ===
      d.source.runId
    )
      for (const cost of prior.payments) {
        if (cost.currency !== currency)
          invalid('EXACT_RUN_EXPENSE_CURRENCY_REQUIRED');
        runPaid = add(runPaid, decimal(cost.amount));
      }
  if (
    d.productionRun.terms.maximumExpense.currency !== currency ||
    !atMost(runPaid, decimal(d.productionRun.terms.maximumExpense.amount))
  )
    invalid('ACTUAL_COMMITTED_RUN_MAXIMUM_EXPENSE_EXCEEDED');
  // An actual expense order may settle part of an exact wage liability. The
  // unpaid rational remainder is retained; no new rounding/price is invented.
  return {
    data: o as unknown as IndustryLogisticsExpenseOrder,
    input: freeze({ ...input }),
    earned,
    paid,
    unpaid: sub(earned, paid),
  };
}
function paymentBatch(
  s: State,
  frame: Frame,
  order: IndustryLogisticsExpenseOrder,
  sha: Sha256Hex,
) {
  const common = [...s.runs.values()][0]!.source;
  const accounts = readProductionWageDepositAccounts({
    financial: s.financial,
    countryId: common.countryId,
    operatorId: common.operatorId,
    householdAccountId: order.householdAccountId,
  });
  if (accounts.payeeAsset.ownerId === accounts.payerAsset.ownerId)
    invalid('NO_INTERNAL_SELF_PAYMENT');
  const amount = Money.from(order.amount, order.currency),
    suffix = sha(frame.command.fingerprint).toUpperCase();
  if (
    accounts.payerAsset.currency !== order.currency ||
    accounts.payeeAsset.currency !== order.currency
  )
    invalid('SOURCE_DEPOSIT_CURRENCY_REQUIRED');
  const expense = createFinancialAccount({
    ...accounts.payerAsset,
    accountId: financialAccountId('LOGISTICS_EXPENSE_' + suffix),
    accountClass: 'EXPENSE',
    claimId: null,
    counterpartyEntityId: null,
  });
  const revenue = createFinancialAccount({
    ...accounts.payeeAsset,
    accountId: financialAccountId('LOGISTICS_WAGE_INCOME_' + suffix),
    accountClass: 'REVENUE',
    claimId: null,
    counterpartyEntityId: null,
  });
  const leg = (
    i: number,
    account: FinancialPostingLeg['account'],
    direction: FinancialPostingLeg['direction'],
    counterpartyAccountId: FinancialPostingLeg['counterpartyAccountId'],
  ): FinancialPostingLeg => ({
    legId: financialPostingLegId('LOGISTICS_LEG_' + suffix + '_' + i),
    account,
    direction,
    amount,
    counterpartyAccountId,
  });
  const batch = createFinancialPostingBatch(
    {
      schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
      batchId: financialPostingBatchId('LOGISTICS_PAID_' + suffix),
      worldId: frame.command.worldId,
      causationCommandId: frame.command.commandId,
      causationEventIds: frame.events.map((e) => e.eventId),
      worldVersionBefore: s.head.worldVersion,
      worldVersionAfter: frame.transition.worldVersionAfter,
      simTime: frame.command.simTime,
      settlementCurrency: order.currency,
      command: frame.command,
      transition: frame.transition,
      legs: [
        leg(1, expense, 'DEBIT', accounts.payerAsset.accountId),
        leg(2, accounts.payerAsset, 'CREDIT', expense.accountId),
        leg(
          3,
          accounts.payerLiability,
          'DEBIT',
          accounts.payeeLiability.accountId,
        ),
        leg(4, accounts.payeeAsset, 'DEBIT', revenue.accountId),
        leg(
          5,
          accounts.payeeLiability,
          'CREDIT',
          accounts.payerLiability.accountId,
        ),
        leg(6, revenue, 'CREDIT', accounts.payeeAsset.accountId),
      ],
    },
    sha,
  );
  const result = applyFinancialPostingBatch(s.financial, batch);
  if (
    !isSettledOriginalProductionDeposit({
      financial: result.state,
      batch,
      expense: batch.legs[0]!,
      payment: batch.legs[1]!,
    })
  )
    invalid('ACTUAL_COMPLETE_BANK_DEPOSIT_SETTLEMENT_REQUIRED');
  if (
    result.state.positions.some(
      (p) =>
        p.account.accountId === accounts.payerAsset.accountId &&
        p.netDebitBalance.amount.isNegative(),
    )
  )
    invalid('ACTUAL_OPERATOR_DEPOSIT_INSUFFICIENT');
  return {
    batch,
    expenseLegId: batch.legs[0]!.legId,
    paymentLegId: batch.legs[1]!.legId,
  };
}
function makeFrame(
  s: State,
  command: CanonicalCommand,
  payload: unknown,
  observedAtReal: string,
  sha: Sha256Hex,
  receipt?: unknown,
): Frame {
  const after = (uint(s.head.worldVersion) + 1n).toString();
  const payloads =
    receipt === undefined
      ? [payload]
      : [payload, { operatingReceipt: receipt }];
  const events = payloads.map((p, i) =>
    parseAuthoritativeEvent(
      {
        schemaVersion: EVENT_SCHEMA_VERSION,
        eventId:
          'EVENT_LOGISTICS_' +
          sha(
            canonicalSerialize([command.fingerprint, String(i)]),
          ).toUpperCase(),
        eventType:
          i === 0
            ? INDUSTRY_UTILITY_EVENTS.LOGISTICS
            : INDUSTRY_UTILITY_OPERATING_RECEIPT_EVENT,
        worldId: command.worldId,
        worldVersion: after,
        sequence: (uint(s.head.eventSequence) + BigInt(i) + 1n).toString(),
        simTime: command.simTime.toCanonicalValue(),
        causationCommandId: command.commandId,
        correlationId: command.correlationId,
        correctsEventId: null,
        recordedAtReal: observedAtReal,
        payload: p,
      },
      sha,
    ),
  );
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: s.head.worldVersion,
    worldVersionAfter: after,
    events,
  });
  return Object.freeze({
    command,
    transition,
    events: transition.events,
    receipt: createFinalCommandReceipt({
      command,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: command.simTime,
      recordedAtReal: observedAtReal,
    }),
    financialPostingBatches: Object.freeze([]),
    inventoryPostings: Object.freeze([]),
  });
}
export function prepareIndustryInternalLogisticsFrame(
  input: {
    readonly state: IndustryInternalLogisticsExecutionState;
    readonly command: CanonicalCommand;
    readonly observedAtReal: string;
    readonly expenseOriginal?: IndustryLogisticsExpenseOriginal;
  },
  sha: Sha256Hex,
) {
  const s = current(input.state),
    command = validateCanonicalCommand(input.command, sha),
    intent = parseIndustryUtilityIntent(command, sha),
    op = object(intent.operation),
    action = String(op.action) as Action;
  if (
    command.commandType !== INDUSTRY_UTILITY_COMMANDS.LOGISTICS ||
    intent.serviceKind !== 'LOGISTICS'
  )
    invalid('UNKNOWN_LOGISTICS_PREFIX_FAMILY');
  const prior = s.seen.get(command.commandId);
  if (prior) {
    if (prior.fingerprint !== command.fingerprint)
      invalid('LOGISTICS_COMMAND_IDEMPOTENCY_CONFLICT');
    return Object.freeze({
      outcome: 'EXACT_DUPLICATE' as const,
      state: input.state,
      financial: s.financial,
      inventory: s.inventory,
      frame: prior.frame,
      execution: prior.execution,
    });
  }
  const d = s.runs.get(intent.runId);
  if (!d) invalid('ACTUAL_COMMITTED_LOGISTICS_TARGET_RUN_REQUIRED');
  const source = readIndustryInternalLogisticsSource(s.source),
    now = command.simTime.ticks;
  if (
    command.worldId !== d.source.worldId ||
    command.countryId !== d.source.countryId ||
    intent.facilityId !== d.source.facilityId ||
    intent.sourceRef !== d.source.sourceRef ||
    intent.sourceRawSha256 !== d.source.sourceRawSha256 ||
    command.expectedWorldVersion !== s.head.worldVersion ||
    now < s.lastSimTime ||
    now > 86400000n
  )
    invalid('ACTUAL_CURRENT_LOGISTICS_HEAD_SCOPE_AND_TIME_REQUIRED');
  if (s.operationRefs.has(intent.operationRef))
    invalid('LOGISTICS_OPERATION_REF_REUSE');
  const transferId = text(op.transferId),
    transfers = new Map(s.transfers),
    old = transfers.get(transferId);
  let transfer = old,
    planning = s.planning,
    bookings = s.bookings,
    payment: ReturnType<typeof original> | undefined;
  let posting: InventoryPosting | undefined,
    batch: FinancialPostingBatch | undefined;
  let eventPayload: unknown,
    operatingReceipt: unknown,
    operatingFactCanonicalPayload: string | undefined;
  if (action === 'BOOK') {
    keys(op, ['action', 'transferId', 'request']);
    if (old) invalid('TRANSFER_ALREADY_BOOKED');
    const request = object(
      op.request,
    ) as unknown as IndustryInternalLogisticsRequest;
    if (
      request.transferId !== transferId ||
      request.runId !== intent.runId ||
      uint(request.startsAtSimTime) < now ||
      uint(request.startsAtSimTime) <
        uint(d.productionRun.terms.startsAtSimTime) ||
      uint(request.endsAtSimTime) > uint(d.productionRun.terms.endsAtSimTime)
    )
      invalid('ACTUAL_RUN_BOUND_LOGISTICS_BOOKING_WINDOW_REQUIRED');
    const p = prepareIndustryInternalLogisticsPlan({
      source: s.source,
      state: s.planning,
      request,
    });
    planning = p.state;
    const available = s.inventory.balances.filter(
      (b) =>
        b.account.batchId === source.batchId &&
        b.account.physicalLocationId === source.fromLocationId &&
        b.account.bucket === 'AVAILABLE' &&
        b.account.titleHolderId === source.titleHolderId &&
        b.account.riskBearerId === source.riskBearerId &&
        b.account.economicRecognitionId === source.economicRecognitionId,
    );
    if (
      available.length !== 1 ||
      available[0]!.account.unit !== request.quantity.unit ||
      available[0]!.quantity.amount.lessThan(request.quantity.amount)
    )
      invalid('CURRENT_ACTUAL_SAME_TITLE_RISK_AVAILABLE_STOCK_REQUIRED');
    const a = available[0]!.account,
      key = sha(
        canonicalSerialize([command.worldId, transferId]),
      ).toUpperCase();
    const reserved = createInventoryAccount({
      ...a,
      bucket: 'RESERVED',
      reservationId: inventoryReservationId('LOGISTICS_RESERVATION_' + key),
    });
    const transit = createInventoryAccount({
      ...a,
      bucket: 'IN_TRANSIT',
      shipmentId: inventoryShipmentId('LOGISTICS_SHIPMENT_' + key),
      physicalLocationId: inventoryLocationId('LOGISTICS_TRANSIT_' + key),
    });
    const delivered = createInventoryAccount({
      ...a,
      bucket: 'AVAILABLE',
      physicalLocationId: inventoryLocationId(source.toLocationId),
    });
    transfer = {
      plan: p.plan,
      run: d,
      status: 'RESERVED',
      reserved,
      transit,
      delivered,
      payments: Object.freeze([]),
    };
    eventPayload = {
      schemaVersion: 'industry-logistics-stage-v1',
      action,
      transferId,
      plan: readIndustryInternalLogisticsPlan(p.plan),
    };
  } else {
    if (!old) invalid('ACTUAL_PRIOR_LOGISTICS_BOOKING_REQUIRED');
    const p = readIndustryInternalLogisticsPlan(old.plan);
    // performedPersonMilliseconds is cumulative execution state, not a term
    // of this already committed run. Later legitimate work must not rewrite
    // or invalidate the immutable logistics contract.
    if (
      p.request.runId !== intent.runId ||
      !same(
        {
          source: old.run.source,
          terms: old.run.productionRun.terms,
          frame: old.run.productionRun.frame,
          runSource: old.run.productionRun.source,
        },
        {
          source: d.source,
          terms: d.productionRun.terms,
          frame: d.productionRun.frame,
          runSource: d.productionRun.source,
        },
      )
    )
      invalid('EXACT_LOGISTICS_TRANSFER_RUN_REQUIRED');
    if (action === 'SHIP') {
      keys(op, ['action', 'transferId']);
      if (
        old.status !== 'RESERVED' ||
        now < uint(p.request.startsAtSimTime) ||
        now >= uint(p.request.endsAtSimTime)
      )
        invalid('ACTUAL_RESERVED_SHIPMENT_WINDOW_REQUIRED');
      transfer = { ...old, status: 'IN_TRANSIT' };
      eventPayload = {
        schemaVersion: 'industry-logistics-stage-v1',
        action,
        transferId,
        from: old.reserved,
        to: old.transit,
        quantity: p.request.quantity,
      };
    } else if (action === 'SERVICE_WORK') {
      let actualAllocations: unknown = op.allocations;
      let workOrder: IndustryLogisticsExpenseOriginal | undefined;
      if (Object.hasOwn(op, 'workOrderRef')) {
        keys(op, ['action', 'transferId', 'workOrderRef', 'workOrderSha256']);
        workOrder = replaySources
          .get(s.sourceInputs)!
          .workOriginals.find(
            (o) =>
              o.reference === op.workOrderRef &&
              o.rawSha256 === op.workOrderSha256,
          );
        if (!workOrder) invalid('REGISTERED_LOGISTICS_WORK_ORDER_REQUIRED');
        const order = object(JSON.parse(workOrder.rawText));
        keys(order, [
          'schemaVersion',
          'purpose',
          'inputRef',
          'worldId',
          'countryId',
          'facilityId',
          'operatorId',
          'runId',
          'seedFingerprint',
          'transferId',
          'labourSourceRef',
          'labourSourceRawSha256',
          'allocations',
        ]);
        if (
          canonicalSerialize(order) !== workOrder.rawText ||
          order.schemaVersion !== 'industry-logistics-service-work-order-v1' ||
          order.purpose !== 'DISTINCT_LOGISTICS_SERVICE_WORK' ||
          order.inputRef !== workOrder.reference ||
          order.transferId !== transferId ||
          order.runId !== intent.runId ||
          order.labourSourceRef !== s.labour.sourceRef ||
          order.labourSourceRawSha256 !== s.labour.sourceRawSha256
        )
          invalid('EXACT_REGISTERED_SERVICE_WORK_ORDER_REQUIRED');
        for (const k of [
          'worldId',
          'countryId',
          'facilityId',
          'operatorId',
          'seedFingerprint',
        ] as const)
          if (order[k] !== source[k])
            invalid('WORK_ORDER_ADMITTED_SCOPE_CHANGED');
        actualAllocations = order.allocations;
      } else keys(op, ['action', 'transferId', 'allocations']);
      if (
        old.status !== 'IN_TRANSIT' ||
        old.work ||
        now < uint(p.request.endsAtSimTime)
      )
        invalid('ACTUAL_SHIPPED_ELAPSED_INDEPENDENT_SERVICE_REQUIRED');
      const allocations = validateWork(s, old, actualAllocations, now);
      bookings = Object.freeze([...s.bookings, ...allocations]);
      eventPayload = {
        schemaVersion: 'industry-logistics-service-work-v1',
        ...(workOrder
          ? {
              workOrderRef: workOrder.reference,
              workOrderSha256: workOrder.rawSha256,
            }
          : {}),
        action,
        transferId,
        runId: intent.runId,
        seedId: source.seedId,
        seedFingerprint: source.seedFingerprint,
        labourSourceRef: s.labour.sourceRef,
        labourSourceRawSha256: s.labour.sourceRawSha256,
        allocations,
        personMilliseconds: allocations
          .reduce((a, b) => a + uint(b.personMilliseconds), 0n)
          .toString(),
        completedAtSimTime: now.toString(),
        purpose: 'INDEPENDENT_INTERNAL_LOGISTICS_NOT_MANUFACTURING',
      };
    } else if (action === 'PAY_INPUTS') {
      keys(op, [
        'action',
        'transferId',
        'workEventFingerprint',
        'expenseOrderRef',
        'expenseOrderSha256',
      ]);
      if (!old.work || old.status === 'DELIVERED')
        invalid('ACTUAL_UNCONSUMED_LOGISTICS_WORK_REQUIRED');
      canonicalHash(op.workEventFingerprint);
      rawHash(op.expenseOrderSha256);
      text(op.expenseOrderRef);
      payment = original(
        s,
        old,
        op,
        input.expenseOriginal ??
          replaySources
            .get(s.sourceInputs)!
            .expenseOriginals.find(
              (o) =>
                o.reference === op.expenseOrderRef &&
                o.rawSha256 === op.expenseOrderSha256,
            ),
        sha,
      );
      eventPayload = {
        schemaVersion: 'industry-logistics-paid-input-v1',
        action,
        transferId,
        workEventFingerprint: payment.data.workEventFingerprint,
        inputRef: payment.data.inputRef,
        inputRawSha256: payment.input.rawSha256,
        amount: payment.data.amount,
        currency: payment.data.currency,
        householdAccountId: payment.data.householdAccountId,
        remainingExactWageLiability: {
          numerator: payment.unpaid.n.toString(),
          denominator: payment.unpaid.d.toString(),
        },
        budgetReferenceIsNotExpense: true,
      };
    } else if (action === 'DELIVER') {
      keys(op, ['action', 'transferId']);
      if (
        old.status !== 'PAID' ||
        !old.work ||
        !old.payments.length ||
        now < uint(p.request.endsAtSimTime)
      )
        invalid('ACTUAL_DISTINCT_SERVICE_WORK_AND_PAID_INPUTS_REQUIRED');
      const paidInputs = old.payments.map((payment) => ({
        commandId: payment.frame.command.commandId,
        commandFingerprint: payment.frame.command.fingerprint,
        eventId: payment.frame.events[0]!.eventId,
        eventFingerprint: payment.frame.events[0]!.fingerprint,
        batchId: payment.batch.batchId,
        batchFingerprint: payment.batch.fingerprint,
        expenseLegId: payment.expenseLegId,
        paymentLegId: payment.paymentLegId,
        amount: payment.amount,
        currency: payment.currency,
        inputRef: payment.original.reference,
        inputRawSha256: payment.original.rawSha256,
      }));
      operatingFactCanonicalPayload = canonicalSerialize({
        schemaVersion: 'industry-logistics-named-handover-v1',
        transferId,
        runId: intent.runId,
        worldId: source.worldId,
        countryId: source.countryId,
        facilityId: source.facilityId,
        operatorId: source.operatorId,
        commodityId: source.commodityId,
        batchId: source.batchId,
        quantity: p.request.quantity,
        from: source.fromLocationId,
        to: source.toLocationId,
        titleHolderId: source.titleHolderId,
        riskBearerId: source.riskBearerId,
        economicRecognitionId: source.economicRecognitionId,
        tonnes: p.tonnes,
        tonneKilometres: p.tonneKilometres,
        routeRef: source.routeRef,
        rawRouteFromId: source.rawRouteFromId,
        rawRouteToId: source.rawRouteToId,
        rawRouteStatus: source.rawRouteStatus,
        routeNature: source.routeNature,
        serviceWork: {
          commandId: old.work.frame.command.commandId,
          commandFingerprint: old.work.frame.command.fingerprint,
          eventId: old.work.frame.events[0]!.eventId,
          eventFingerprint: old.work.frame.events[0]!.fingerprint,
        },
        paidInputs,
        handedOverAtSimTime: now.toString(),
        budgetReference: p.budgetReference,
      });
      operatingReceipt = industryUtilityOperatingReceiptFromRun(
        {
          command,
          source: d.source,
          productionRun: d.productionRun,
          validFromTicks: p.request.startsAtSimTime,
          validUntilTicks: '86400000',
          factCanonicalPayload: operatingFactCanonicalPayload,
        },
        sha,
      );
      transfer = { ...old, status: 'DELIVERED' };
      eventPayload = {
        schemaVersion: 'industry-logistics-stage-v1',
        action,
        transferId,
        from: old.transit,
        to: old.delivered,
        quantity: p.request.quantity,
        handoverFactSha256: hash(
          JSON.parse(operatingFactCanonicalPayload),
          sha,
        ),
      };
    } else invalid('UNKNOWN_LOGISTICS_PREFIX_ACTION');
  }
  if (!transfer) invalid('ACTUAL_LOGISTICS_TRANSFER_REQUIRED');
  let frame = makeFrame(
    s,
    command,
    eventPayload,
    input.observedAtReal,
    sha,
    operatingReceipt,
  );
  const plan = readIndustryInternalLogisticsPlan(transfer.plan),
    postings: InventoryPosting[] = [],
    batches: FinancialPostingBatch[] = [];
  if (action === 'BOOK' || action === 'SHIP' || action === 'DELIVER') {
    const available = createInventoryAccount({
      ...transfer.reserved,
      bucket: 'AVAILABLE',
      reservationId: null,
    });
    const movement = {
      schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
      postingId: inventoryPostingId(
        'LOGISTICS_POSTING_' + sha(command.fingerprint).toUpperCase(),
      ),
      worldId: command.worldId,
      causationCommandId: command.commandId,
      causationEventIds: frame.events.map((e) => e.eventId),
      worldVersionBefore: s.head.worldVersion,
      worldVersionAfter: frame.transition.worldVersionAfter,
      simTime: command.simTime,
      command,
      transition: frame.transition,
      quantity: Quantity.from(
        plan.request.quantity.amount,
        plan.request.quantity.unit,
      ),
      source:
        action === 'BOOK'
          ? available
          : action === 'SHIP'
            ? transfer.reserved
            : transfer.transit,
      destination:
        action === 'BOOK'
          ? transfer.reserved
          : action === 'SHIP'
            ? transfer.transit
            : transfer.delivered,
    };
    posting = (
      action === 'BOOK'
        ? createReservationPosting
        : action === 'SHIP'
          ? createShipmentPosting
          : createDeliveryPosting
    )(movement, sha);
    postings.push(posting);
  }
  if (action === 'SERVICE_WORK') {
    transfer = {
      ...transfer,
      status: 'WORKED',
      work: {
        frame,
        allocations: object(eventPayload).allocations as readonly Allocation[],
        labour: s.labour,
      },
    };
  }
  if (payment) {
    const result = paymentBatch(s, frame, payment.data, sha);
    batch = result.batch;
    batches.push(batch);
    const previous = transfer.payments;
    const entry = {
      frame: Object.freeze({
        ...frame,
        financialPostingBatches: Object.freeze([batch]),
      }),
      batch,
      original: payment.input,
      expenseLegId: result.expenseLegId,
      paymentLegId: result.paymentLegId,
      amount: payment.data.amount,
      currency: payment.data.currency,
      householdAccountId: payment.data.householdAccountId,
    };
    transfer = {
      ...transfer,
      status: 'PAID',
      payments: Object.freeze([...previous, Object.freeze(entry)]),
    };
  }
  frame = Object.freeze({
    ...frame,
    inventoryPostings: Object.freeze(postings),
    financialPostingBatches: Object.freeze(batches),
  });
  const ledgers = advanceLedgers(s, frame, postings, batches),
    head = Object.freeze({
      worldVersion: frame.transition.worldVersionAfter,
      eventSequence: frame.events.at(-1)!.sequence,
    });
  const deliveries = new Map(s.deliveries);
  if (action === 'DELIVER') {
    if (!transfer.work || !operatingFactCanonicalPayload)
      invalid('ACTUAL_LOGISTICS_HANDOVER_EVIDENCE_REQUIRED');
    deliveries.set(
      command.commandId,
      freeze({
        classification:
          'CORE_VALIDATED_LOGISTICS_REPLAY_DATA_NOT_DB_COMMIT_AUTHORITY',
        source: d.source,
        productionRun: d.productionRun,
        frame,
        headBefore: s.head,
        headAfter: head,
        operatingFactCanonicalPayload,
        validFromTicks: plan.request.startsAtSimTime,
        validUntilTicks: '86400000',
        serviceWorkFrame: transfer.work.frame,
        paidInputFrames: transfer.payments.map((p) => p.frame),
        actualQualifiedExpenses: transfer.payments.map((p) => ({
          batchId: p.batch.batchId,
          batchFingerprint: p.batch.fingerprint,
          expenseLegId: p.expenseLegId,
          paymentLegId: p.paymentLegId,
          amount: p.amount,
          currency: p.currency,
        })),
      }),
    );
  }
  const execution = null;
  transfers.set(transferId, Object.freeze(transfer));
  const seen = new Map(s.seen);
  seen.set(
    command.commandId,
    Object.freeze({ fingerprint: command.fingerprint, frame, execution }),
  );
  const operationRefs = new Map(s.operationRefs);
  operationRefs.set(intent.operationRef, command.commandId);
  const inputRefs = new Set(s.inputRefs);
  if (payment) inputRefs.add(payment.input.reference);
  const state = issue({
    ...s,
    ...ledgers,
    planning,
    head,
    deliveries,
    lastSimTime: now,
    transfers,
    bookings,
    seen,
    operationRefs,
    inputRefs,
    frames: Object.freeze([...s.frames, frame]),
  });
  return Object.freeze({
    outcome: 'APPLIED_CONDITIONAL_REPLAY_DATA' as const,
    state,
    financial: ledgers.financial,
    inventory: ledgers.inventory,
    frame,
    execution,
  });
}
/** Historical reduction does not issue delivery tokens. The global fixed Core
 * fold must first validate EVERY sibling frame and its actual journals. */
export function replayIndustryInternalLogisticsFrame(
  input: {
    readonly state?: IndustryInternalLogisticsExecutionState;
    readonly sourceInputs: IndustryInternalLogisticsReplaySources;
    readonly context: IndustryLogisticsReplayContext;
    readonly frame: Frame;
    readonly expenseOriginal?: IndustryLogisticsExpenseOriginal;
  },
  sha: Sha256Hex,
) {
  bindAuthoritativeTransition(
    { command: input.frame.command, transition: input.frame.transition },
    sha,
  );
  validateFinalReceiptForCommand({
    receipt: input.frame.receipt,
    command: input.frame.command,
    transition: input.frame.transition,
  });
  const state = contextState(input);
  const supplied = replaySources.get(input.sourceInputs)!;
  const operation = object(
    parseIndustryUtilityIntent(input.frame.command, sha).operation,
  );
  const expense =
    input.expenseOriginal ??
    supplied.expenseOriginals.find(
      (o) =>
        o.reference === operation.expenseOrderRef &&
        o.rawSha256 === operation.expenseOrderSha256,
    );
  const result = prepareIndustryInternalLogisticsFrame(
    {
      state,
      command: input.frame.command,
      observedAtReal: input.frame.receipt.recordedAtReal,
      ...(expense ? { expenseOriginal: expense } : {}),
    },
    sha,
  );
  if (!same(result.frame, input.frame))
    invalid('EXACT_COMPLETE_LOGISTICS_FRAME_AND_BOTH_JOURNALS_REQUIRED');
  return result;
}
/** Only an actually issued complete global replay view containing this exact
 * private domain state can seal delivery DATA. A candidate state alone cannot. */
export function sealIndustryFirstDayLogisticsExecution(
  input: {
    readonly replay: FinanceSocialReplayContinuationView;
    readonly frame: Frame;
  },
  sha: Sha256Hex,
): IndustryFirstDayLogisticsExecution {
  const replay = readFinanceSocialReplayContinuationView(input.replay, sha);
  const rows = replay.result.industryLogisticsState;
  if (!replay.complete || !rows)
    invalid('COMPLETE_ACTUAL_LOGISTICS_PREFIX_REQUIRED');
  const matches = rows.flatMap((token) => {
    const s = current(token);
    const d = s.deliveries.get(input.frame.command.commandId);
    return d && same(d.frame, input.frame) ? [{ s, d }] : [];
  });
  if (matches.length !== 1)
    invalid('EXACT_FULL_PREFIX_LOGISTICS_DELIVERY_FRAME_REQUIRED');
  const { s, d } = matches[0]!;
  if (
    replay.worldId !== d.source.worldId ||
    replay.seedFingerprint !== d.source.seedFingerprint ||
    !same(replay.head, s.head) ||
    s.financial !== replay.result.financialState ||
    s.inventory !== replay.result.inventoryState
  )
    invalid('SAME_ACTUAL_CURRENT_LOGISTICS_WORLD_AND_LEDGERS_REQUIRED');
  const token = Object.freeze({}) as IndustryFirstDayLogisticsExecution;
  executions.set(token, Object.freeze({ ...d, replay }));
  return token;
}
/** Fixed global reducer calls this only after a sibling's complete actual
 * reduction. It carries resource/history DATA; it does not seal delivery or
 * create economic effects, source currentness or commit authority. */
export function synchronizeIndustryInternalLogisticsExecutionState(
  state: IndustryInternalLogisticsExecutionState,
  context: IndustryLogisticsReplayContext,
  _sha?: Sha256Hex,
): IndustryInternalLogisticsExecutionState {
  void _sha;
  const s = current(state);
  if (
    uint(context.head.worldVersion) < uint(s.head.worldVersion) ||
    uint(context.head.eventSequence) < uint(s.head.eventSequence)
  )
    invalid('LOGISTICS_REPLAY_CONTEXT_CANNOT_ROLL_BACK');
  return contextState({ state, sourceInputs: s.sourceInputs, context });
}
export function readIndustryInternalLogisticsExecutionState(
  state: IndustryInternalLogisticsExecutionState,
) {
  const s = current(state);
  return Object.freeze({
    classification:
      'CORE_VALIDATED_LOGISTICS_STATE_NOT_SOURCE_OR_COMMIT_AUTHORITY' as const,
    head: s.head,
    financial: s.financial,
    inventory: s.inventory,
    source: readIndustryInternalLogisticsSource(s.source),
    labourSource: s.labour,
    bookings: s.bookings,
    frames: s.frames,
    transfers: Object.freeze([...s.transfers.values()]),
  });
}
/** Actual cash releases only. The caller must match each account to its
 * genuine opening aggregate and its applied batch; unearned carry and route
 * budgets never appear here. A state DTO cannot issue these records. */
export function readIndustryInternalLogisticsPaidOpeningReleases(
  state: IndustryInternalLogisticsExecutionState,
) {
  const s = current(state),
    source = readIndustryInternalLogisticsSource(s.source);
  return Object.freeze(
    [...s.transfers.values()].flatMap((t) =>
      t.payments.map((p) => {
        const payment = p.batch.legs[1];
        if (
          !payment ||
          payment.direction !== 'CREDIT' ||
          payment.account.ownerId !== source.operatorId ||
          payment.account.countryId !== source.countryId ||
          payment.amount.currency !== p.currency ||
          canonicalDecimal(payment.amount.amount) !== p.amount ||
          !s.financial.appliedBatches.some(
            (b) =>
              b.batchId === p.batch.batchId &&
              b.fingerprint === p.batch.fingerprint,
          )
        )
          invalid('ACTUAL_REPLAYED_LOGISTICS_CASH_RELEASE_REQUIRED');
        return Object.freeze({
          reservationId: 'LOGISTICS_PAID_' + p.frame.command.commandId,
          accountId: payment.account.accountId,
          countryId: source.countryId,
          operatorId: source.operatorId,
          currency: p.currency,
          amount: p.amount,
          batchId: p.batch.batchId,
          batchFingerprint: p.batch.fingerprint,
        });
      }),
    ),
  );
}
export function readIndustryFirstDayLogisticsExecution(
  token: IndustryFirstDayLogisticsExecution,
) {
  const data = executions.get(token);
  if (!data) invalid('GENUINE_LOGISTICS_DELIVERY_REPLAY_TOKEN_REQUIRED');
  return data;
}
