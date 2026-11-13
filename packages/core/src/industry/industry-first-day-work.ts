/** Deterministic run/work DATA replay. Native SQL cutoff, actual current actor,
 * elapsed time, source admission and canonical persistence remain required.
 * A private DATA token is neither a source issuer nor execution authority. */
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  validateCanonicalCommand,
  canonicalSha256,
  type Sha256Hex,
} from '../commands/command.js';
import {
  bindAuthoritativeTransition,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  validateFinalReceiptForCommand,
} from '../commands/receipt.js';
import {
  EVENT_SCHEMA_VERSION,
  parseAuthoritativeEvent,
} from '../events/event.js';
import type { FinanceNativeBudgetCanonicalFrame } from '../commands/finance-budget-native.js';
import {
  canonicalSerialize,
  canonicalHashInput,
} from '../serialization/canonical.js';
import { Money } from '../numeric/money.js';
import { Quantity } from '../numeric/quantity.js';
import { WorldDecimal } from '../numeric/world-decimal.js';
import {
  INDUSTRY_FIRST_DAY_POLICY_VERSION,
  INDUSTRY_FIRST_DAY_POLICY_RAW_SHA256,
  INDUSTRY_FIRST_DAY_USER_ADOPTION_RAW_SHA256,
} from '../inventory/production-operating-basis.js';
export const INDUSTRY_UTILISATION_TARGET_COMMAND =
  'CORE_INDUSTRY_UTILISATION_TARGET_SET_V1' as const;
export const INDUSTRY_UTILISATION_TARGET_EVENT =
  'INDUSTRY_UTILISATION_TARGET_SET_V1' as const;
/** Desired utilisation only. No run, reservation, labour, payment or output. */
export interface IndustryUtilisationTargetTerms {
  readonly schemaVersion: 'postwar-industry-utilisation-target-v1';
  readonly facilityId: string;
  readonly targetPercent: string;
  readonly startsAtSimTime: string;
  readonly endsAtSimTime: string;
  readonly policyVersion: typeof INDUSTRY_FIRST_DAY_POLICY_VERSION;
  readonly sourceRef: string;
  readonly sourceRawSha256: string;
}
interface UtilisationTarget {
  readonly terms: Readonly<IndustryUtilisationTargetTerms>;
  readonly frame: FinanceNativeBudgetCanonicalFrame;
  readonly source: Readonly<IndustryFirstDayWorkSiteSource>;
}
export const INDUSTRY_RUN_SCHEDULE_COMMAND =
  'CORE_INDUSTRY_RUN_SCHEDULE_V1' as const;
export const INDUSTRY_RUN_SCHEDULED_EVENT =
  'INDUSTRY_FIRST_DAY_RUN_SCHEDULED_V1' as const;
export const INDUSTRY_FIRST_DAY_WORK_COMMAND =
  'CORE_INDUSTRY_FIRST_DAY_WORK_V1' as const;
export const INDUSTRY_FIRST_DAY_WORK_EVENT =
  'INDUSTRY_FIRST_DAY_WORK_COMPLETED_V1' as const;
export interface IndustryFirstDayRunTerms {
  readonly schemaVersion: 'postwar-industry-run-schedule-v1';
  readonly runId: string;
  readonly facilityId: string;
  readonly quantity: Readonly<{ amount: string; unit: string }>;
  readonly startsAtSimTime: string;
  readonly endsAtSimTime: string;
  readonly maximumExpense: Readonly<{ amount: string; currency: string }>;
  readonly policyVersion: typeof INDUSTRY_FIRST_DAY_POLICY_VERSION;
  readonly sourceRef: string;
  readonly sourceRawSha256: string;
}
export interface IndustryFirstDayWorkAllocation {
  readonly positionId: string;
  readonly poolId: string;
  readonly sourceStartOrdinal: string;
  readonly populationLineage: 'POSTWAR_REGIONAL_POPULATION_ORDINAL_V1';
  readonly regionId: string;
  readonly cohortRef: string;
  readonly startOrdinal: string;
  readonly count: string;
  readonly skill: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly startsAtSimTime: string;
  readonly endsAtSimTime: string;
  readonly personMilliseconds: string;
  readonly personMinutes: Readonly<{ numerator: string; denominator: '60000' }>;
}
export interface IndustryFirstDayWorkSiteSource {
  readonly worldId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly facilityId: string;
  readonly operatorId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly sourceRef: string;
  readonly sourceRawSha256: string;
  readonly policyVersion: typeof INDUSTRY_FIRST_DAY_POLICY_VERSION;
  readonly policyRawSha256: typeof INDUSTRY_FIRST_DAY_POLICY_RAW_SHA256;
  readonly userAdoptionRawSha256: typeof INDUSTRY_FIRST_DAY_USER_ADOPTION_RAW_SHA256;
  readonly outputUnit: string;
  readonly capacityPerSimDay: string;
  readonly labourPersonDaysPerOutput: string;
  readonly positions: readonly Readonly<{
    positionId: string;
    poolId: string;
    sourceStartOrdinal: string;
    startOrdinal: string;
    count: string;
    regionId: string;
    cohortRef: string;
    skill: 'LOW' | 'MEDIUM' | 'HIGH';
  }>[];
}
export interface IndustryCompletedWorkData {
  readonly schemaVersion: 'postwar-industry-completed-work-v1';
  readonly worldId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly facilityId: string;
  readonly operatorId: string;
  readonly runId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly schedule: Readonly<{
    commandId: string;
    commandFingerprint: string;
    eventId: string;
    eventFingerprint: string;
  }>;
  readonly policy: Readonly<{
    version: typeof INDUSTRY_FIRST_DAY_POLICY_VERSION;
    rawSha256: string;
    userAdoptionRawSha256: string;
    sourceRef: string;
    sourceRawSha256: string;
  }>;
  readonly completedAtSimTime: string;
  readonly allocations: readonly Readonly<IndustryFirstDayWorkAllocation>[];
}
declare const workState: unique symbol;
export interface IndustryFirstDayWorkState {
  readonly [workState]: true;
}
declare const completedWork: unique symbol;
export interface IndustryCompletedWork {
  readonly [completedWork]: true;
}
interface Run {
  readonly terms: IndustryFirstDayRunTerms;
  readonly frame: FinanceNativeBudgetCanonicalFrame;
  readonly source: IndustryFirstDayWorkSiteSource;
  readonly performed: bigint;
}
interface State {
  readonly worldId: string;
  readonly sources: readonly IndustryFirstDayWorkSiteSource[];
  readonly runs: ReadonlyMap<string, Run>;
  readonly utilisationTargets: ReadonlyMap<string, UtilisationTarget>;
  readonly bookings: readonly IndustryFirstDayWorkAllocation[];
  readonly seen: ReadonlyMap<
    string,
    {
      fingerprint: string;
      state: IndustryFirstDayWorkState;
      work: IndustryCompletedWork | null;
    }
  >;
}
const states = new WeakMap<object, State>();
const works = new WeakMap<
  object,
  Readonly<{
    classification: 'CORE_VALIDATED_WORK_DATA_NOT_SOURCE_AUTHORITY';
    data: IndustryCompletedWorkData;
    frame: FinanceNativeBudgetCanonicalFrame;
    sourceFingerprint: string;
  }>
>();
function invalid(m: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'INDUSTRY_FIRST_DAY_WORK:' + m,
  );
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v || v.trim() !== v || v.length > 512)
    invalid('EXACT_REFERENCE_REQUIRED');
  return v;
}
function whole(v: unknown): bigint {
  if (typeof v !== 'string' || !/^(0|[1-9]\d*)$/u.test(v) || v.length > 100)
    invalid('CANONICAL_INTEGER_REQUIRED');
  return BigInt(v);
}
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('RECORD_REQUIRED');
  return v as Record<string, unknown>;
}
function exact(v: Record<string, unknown>, keys: readonly string[]) {
  if (
    Object.keys(v).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(v, k))
  )
    invalid('EXACT_FIELDS_REQUIRED');
}
function equal(a: unknown, b: unknown) {
  return canonicalSerialize(a) === canonicalSerialize(b);
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
const hash = (v: unknown, sha: Sha256Hex) =>
  canonicalSha256(canonicalHashInput(v), sha);
function source(s: IndustryFirstDayWorkSiteSource): void {
  for (const k of [
    'worldId',
    'countryId',
    'locationId',
    'facilityId',
    'operatorId',
    'seedId',
    'admissionRef',
    'sourceRef',
  ] as const)
    text(s[k]);
  if (
    !/^sha256:[a-f0-9]{64}$/u.test(s.seedFingerprint) ||
    !/^[a-f0-9]{64}$/u.test(s.sourceRawSha256) ||
    s.policyVersion !== INDUSTRY_FIRST_DAY_POLICY_VERSION ||
    s.policyRawSha256 !== INDUSTRY_FIRST_DAY_POLICY_RAW_SHA256 ||
    s.userAdoptionRawSha256 !== INDUSTRY_FIRST_DAY_USER_ADOPTION_RAW_SHA256 ||
    s.positions.length < 1 ||
    s.positions.length > 100
  )
    invalid('EXACT_ADOPTED_SOURCE_REQUIRED');
  if (
    !Quantity.from(s.capacityPerSimDay, s.outputUnit).amount.greaterThan('0') ||
    !new WorldDecimal(s.labourPersonDaysPerOutput).greaterThan('0')
  )
    invalid('POSITIVE_BOUNDED_SOURCE_CAPACITY_REQUIRED');
  const ids = new Set<string>();
  for (const p of s.positions) {
    for (const k of ['positionId', 'poolId', 'regionId', 'cohortRef'] as const)
      text(p[k]);
    whole(p.sourceStartOrdinal);
    whole(p.startOrdinal);
    if (
      whole(p.count) === 0n ||
      ids.has(p.positionId) ||
      p.regionId !== s.locationId ||
      !['LOW', 'MEDIUM', 'HIGH'].includes(p.skill)
    )
      invalid('EXACT_DISTINCT_SOURCE_POSITION_REQUIRED');
    ids.add(p.positionId);
  }
}
export function createIndustryFirstDayWorkState(
  input: readonly IndustryFirstDayWorkSiteSource[],
): IndustryFirstDayWorkState {
  if (input.length < 1 || input.length > 2048)
    invalid('BOUNDED_SOURCE_SET_REQUIRED');
  input.forEach(source);
  const worldId = input[0]!.worldId,
    keys = new Set<string>();
  for (const s of input) {
    const key = s.countryId + '\0' + s.facilityId;
    if (s.worldId !== worldId || keys.has(key))
      invalid('UNIQUE_SAME_WORLD_SITE_REQUIRED');
    keys.add(key);
  }
  const token = Object.freeze({}) as IndustryFirstDayWorkState;
  states.set(token, {
    worldId,
    sources: freeze(
      input.map((s) => ({
        ...s,
        positions: s.positions.map((p) => ({ ...p })),
      })),
    ),
    runs: new Map(),
    utilisationTargets: new Map(),
    bookings: [],
    seen: new Map(),
  });
  return token;
}
export function isIndustryCompletedWork(
  v: unknown,
): v is IndustryCompletedWork {
  return !!v && typeof v === 'object' && works.has(v);
}
export function readIndustryCompletedWork(v: IndustryCompletedWork) {
  const r = works.get(v);
  if (!r) invalid('ISSUED_WORK_REPLAY_REQUIRED');
  return r;
}
function frame(f: FinanceNativeBudgetCanonicalFrame, sha: Sha256Hex) {
  validateCanonicalCommand(f.command, sha);
  bindAuthoritativeTransition(
    { command: f.command, transition: f.transition },
    sha,
  );
  validateFinalReceiptForCommand({
    command: f.command,
    transition: f.transition,
    receipt: f.receipt,
  });
  if (
    f.receipt.outcome !== 'COMMITTED' ||
    f.transition.events.length !== 1 ||
    !equal(f.events, f.transition.events) ||
    f.financialPostingBatches.length ||
    f.inventoryPostings.length
  )
    invalid('EXACT_ZERO_POSTING_COMMITTED_STAGE_REQUIRED');
}
export function parseIndustryUtilisationTargetIntent(
  command: FinanceNativeBudgetCanonicalFrame['command'],
  sha: Sha256Hex,
): Readonly<IndustryUtilisationTargetTerms> {
  const c = validateCanonicalCommand(command, sha);
  if (
    c.commandType !== INDUSTRY_UTILISATION_TARGET_COMMAND ||
    c.officeId !== 'INDUSTRY' ||
    c.authSubject === null ||
    c.idempotencyKey === null ||
    c.expectedWorldVersion === null
  )
    invalid('MANUAL_UTILISATION_TARGET_SCOPE_REQUIRED');
  const p = record(JSON.parse(c.canonicalPayload));
  exact(p, [
    'schemaVersion',
    'facilityId',
    'targetPercent',
    'startsAtSimTime',
    'endsAtSimTime',
    'policyVersion',
    'sourceRef',
    'sourceRawSha256',
  ]);
  for (const key of ['facilityId', 'sourceRef'])
    if (!/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(text(p[key])))
      invalid('CANONICAL_TARGET_REFERENCE_REQUIRED');
  const percentage = new WorldDecimal(text(p.targetPercent));
  const starts = whole(p.startsAtSimTime),
    ends = whole(p.endsAtSimTime);
  if (
    p.schemaVersion !== 'postwar-industry-utilisation-target-v1' ||
    p.policyVersion !== INDUSTRY_FIRST_DAY_POLICY_VERSION ||
    !/^[a-f0-9]{64}$/u.test(text(p.sourceRawSha256)) ||
    percentage.toFixed() !== p.targetPercent ||
    percentage.lessThan('0') ||
    percentage.greaterThan('100') ||
    starts < c.simTime.ticks ||
    ends <= starts ||
    ends > 86400000n
  )
    invalid('FINITE_FIRST_DAY_TARGET_PERCENT_AND_WINDOW_REQUIRED');
  return freeze(p) as unknown as Readonly<IndustryUtilisationTargetTerms>;
}
export function parseIndustryRunScheduleIntent(
  command: FinanceNativeBudgetCanonicalFrame['command'],
  sha: Sha256Hex,
): Readonly<IndustryFirstDayRunTerms> {
  const c = validateCanonicalCommand(command, sha);
  if (
    c.commandType !== INDUSTRY_RUN_SCHEDULE_COMMAND ||
    c.officeId !== 'INDUSTRY' ||
    c.idempotencyKey === null ||
    c.expectedWorldVersion === null
  )
    invalid('MANUAL_SCHEDULE_SCOPE_REQUIRED');
  const p = record(JSON.parse(c.canonicalPayload));
  exact(p, [
    'schemaVersion',
    'runId',
    'facilityId',
    'quantity',
    'startsAtSimTime',
    'endsAtSimTime',
    'maximumExpense',
    'policyVersion',
    'sourceRef',
    'sourceRawSha256',
  ]);
  for (const k of ['runId', 'facilityId', 'sourceRef'] as const)
    if (!/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(text(p[k])))
      invalid('CANONICAL_RUN_SOURCE_REFERENCE_REQUIRED');
  const q = record(p.quantity),
    e = record(p.maximumExpense);
  exact(q, ['amount', 'unit']);
  exact(e, ['amount', 'currency']);
  const quantity = Quantity.from(text(q.amount), text(q.unit)),
    money = Money.from(text(e.amount), text(e.currency));
  const start = whole(p.startsAtSimTime),
    end = whole(p.endsAtSimTime);
  if (
    p.schemaVersion !== 'postwar-industry-run-schedule-v1' ||
    p.policyVersion !== INDUSTRY_FIRST_DAY_POLICY_VERSION ||
    !/^[a-f0-9]{64}$/u.test(text(p.sourceRawSha256)) ||
    !quantity.amount.greaterThan('0') ||
    quantity.amount.toFixed() !== q.amount ||
    !money.amount.greaterThan('0') ||
    money.toCanonicalValue().amount !== e.amount ||
    start < c.simTime.ticks ||
    end <= start ||
    end > 86400000n
  )
    invalid('FINITE_EXACT_SCHEDULE_WINDOW_BUDGET_REQUIRED');
  return freeze(p) as unknown as Readonly<IndustryFirstDayRunTerms>;
}
export function replayIndustryFirstDayRunFrame(
  input: Readonly<{
    state: IndustryFirstDayWorkState;
    frame: FinanceNativeBudgetCanonicalFrame;
  }>,
  sha: Sha256Hex,
): Readonly<{
  state: IndustryFirstDayWorkState;
  work: IndustryCompletedWork | null;
}> {
  const prior = states.get(input.state);
  if (!prior) invalid('ISSUED_WORK_STATE_REQUIRED');
  const f = input.frame,
    c = f.command;
  frame(f, sha);
  if (c.worldId !== prior.worldId || c.expectedWorldVersion === null)
    invalid('SAME_WORLD_STAGE_REQUIRED');
  const previous = prior.seen.get(c.commandId);
  if (previous) {
    if (previous.fingerprint !== c.fingerprint) invalid('COMMAND_ID_REUSED');
    return Object.freeze({ state: input.state, work: previous.work });
  }
  const runs = new Map(prior.runs),
    utilisationTargets = new Map(prior.utilisationTargets),
    bookings = [...prior.bookings];
  let work: IndustryCompletedWork | null = null;
  if (c.commandType === INDUSTRY_UTILISATION_TARGET_COMMAND) {
    const terms = parseIndustryUtilisationTargetIntent(c, sha);
    const s = prior.sources.find(
      (v) => v.countryId === c.countryId && v.facilityId === terms.facilityId,
    );
    if (
      !s ||
      terms.policyVersion !== s.policyVersion ||
      terms.sourceRef !== s.sourceRef ||
      terms.sourceRawSha256 !== s.sourceRawSha256
    )
      invalid('EXACT_TARGET_SITE_SOURCE_REQUIRED');
    if (
      f.events[0]!.eventType !== INDUSTRY_UTILISATION_TARGET_EVENT ||
      !equal(JSON.parse(f.events[0]!.canonicalPayload), targetPayload(terms, s))
    )
      invalid('EXACT_TARGET_SOURCE_EVENT_REQUIRED');
    // The latest explicit target for a facility is the current intention.
    // Earlier commands remain in canonical history; committed runs are untouched.
    utilisationTargets.set(c.countryId + '\0' + terms.facilityId, {
      terms,
      frame: f,
      source: s,
    });
  } else if (c.commandType === INDUSTRY_RUN_SCHEDULE_COMMAND) {
    if (
      c.officeId !== 'INDUSTRY' ||
      c.authSubject === null ||
      f.events[0]!.eventType !== INDUSTRY_RUN_SCHEDULED_EVENT
    )
      invalid('MANUAL_SCHEDULE_REQUIRED');
    parseIndustryRunScheduleIntent(c, sha);
    const p = record(JSON.parse(c.canonicalPayload));
    exact(p, [
      'schemaVersion',
      'runId',
      'facilityId',
      'quantity',
      'startsAtSimTime',
      'endsAtSimTime',
      'maximumExpense',
      'policyVersion',
      'sourceRef',
      'sourceRawSha256',
    ]);
    const s = prior.sources.find(
      (s) => s.countryId === c.countryId && s.facilityId === p.facilityId,
    );
    if (!s) invalid('ACTUAL_SITE_SOURCE_REQUIRED');
    const quantity = record(p.quantity),
      expense = record(p.maximumExpense);
    exact(quantity, ['amount', 'unit']);
    exact(expense, ['amount', 'currency']);
    const q = Quantity.from(text(quantity.amount), text(quantity.unit)),
      max = Money.from(text(expense.amount), text(expense.currency));
    const starts = whole(p.startsAtSimTime),
      ends = whole(p.endsAtSimTime);
    if (
      p.schemaVersion !== 'postwar-industry-run-schedule-v1' ||
      p.policyVersion !== s.policyVersion ||
      p.sourceRef !== s.sourceRef ||
      p.sourceRawSha256 !== s.sourceRawSha256 ||
      q.unit !== s.outputUnit ||
      !q.amount.greaterThan('0') ||
      !max.amount.greaterThan('0') ||
      starts < c.simTime.ticks ||
      ends <= starts ||
      ends > 86400000n
    )
      invalid('FINITE_FUTURE_OPENING_SCHEDULE_REQUIRED');
    const bound = new WorldDecimal(s.capacityPerSimDay).times(
      (ends - starts).toString(),
    );
    if (q.amount.times('86400000').greaterThan(bound))
      invalid('SCHEDULE_EXCEEDS_ACTUAL_WINDOW_CAPACITY');
    const terms = p as unknown as IndustryFirstDayRunTerms;
    const key = c.countryId + '\0' + text(p.runId);
    if (runs.has(key)) invalid('RUN_ALREADY_SCHEDULED');
    if (
      !equal(JSON.parse(f.events[0]!.canonicalPayload), {
        schemaVersion: 'postwar-industry-run-scheduled-v1',
        terms,
        source: {
          worldId: s.worldId,
          countryId: s.countryId,
          facilityId: s.facilityId,
          operatorId: s.operatorId,
          seedId: s.seedId,
          seedFingerprint: s.seedFingerprint,
          admissionRef: s.admissionRef,
          sourceRef: s.sourceRef,
          sourceRawSha256: s.sourceRawSha256,
        },
      })
    )
      invalid('EXACT_SCHEDULE_SOURCE_EVENT_REQUIRED');
    runs.set(key, { terms, frame: f, source: s, performed: 0n });
  } else if (c.commandType === INDUSTRY_FIRST_DAY_WORK_COMMAND) {
    if (
      c.officeId !== null ||
      f.events[0]!.eventType !== INDUSTRY_FIRST_DAY_WORK_EVENT
    )
      invalid('FIXED_AUTOMATIC_WORK_REQUIRED');
    const p = record(JSON.parse(c.canonicalPayload));
    exact(p, [
      'schemaVersion',
      'runId',
      'scheduleCommandFingerprint',
      'allocations',
    ]);
    const key = c.countryId + '\0' + text(p.runId),
      run = runs.get(key);
    if (
      !run ||
      c.actorId !== run.frame.command.actorId ||
      c.authSubject !== run.frame.command.authSubject ||
      p.schemaVersion !== 'postwar-industry-work-command-v1' ||
      p.scheduleCommandFingerprint !== run.frame.command.fingerprint ||
      !Array.isArray(p.allocations) ||
      p.allocations.length < 1 ||
      p.allocations.length > 64
    )
      invalid('ACTUAL_COMMITTED_RUN_REQUIRED');
    const s = run.source,
      allocations: IndustryFirstDayWorkAllocation[] = [];
    let performed = 0n;
    for (const raw of p.allocations) {
      const a = record(raw);
      exact(a, [
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
      const pos = s.positions.find((x) => x.positionId === a.positionId);
      if (!pos) invalid('ACTUAL_SOURCE_POSITION_REQUIRED');
      const relative = whole(a.sourceStartOrdinal),
        absolute = whole(a.startOrdinal),
        count = whole(a.count),
        start = whole(a.startsAtSimTime),
        end = whole(a.endsAtSimTime),
        ms = whole(a.personMilliseconds),
        minutes = record(a.personMinutes);
      exact(minutes, ['numerator', 'denominator']);
      if (
        count === 0n ||
        relative < whole(pos.sourceStartOrdinal) ||
        relative + count > whole(pos.sourceStartOrdinal) + whole(pos.count) ||
        absolute !==
          whole(pos.startOrdinal) + relative - whole(pos.sourceStartOrdinal) ||
        a.poolId !== pos.poolId ||
        a.regionId !== pos.regionId ||
        a.cohortRef !== pos.cohortRef ||
        a.skill !== pos.skill ||
        a.populationLineage !== 'POSTWAR_REGIONAL_POPULATION_ORDINAL_V1' ||
        start < whole(run.terms.startsAtSimTime) ||
        end > whole(run.terms.endsAtSimTime) ||
        end > c.simTime.ticks ||
        end <= start ||
        end - start > 28800000n ||
        ms !== count * (end - start) ||
        minutes.numerator !== ms.toString() ||
        minutes.denominator !== '60000'
      )
        invalid('EXACT_ELAPSED_DISTINCT_PERSON_TIME_REQUIRED');
      const entry = a as unknown as IndustryFirstDayWorkAllocation;
      const overlaps = bookings.filter(
        (b) =>
          b.regionId === entry.regionId &&
          whole(b.startOrdinal) < absolute + count &&
          absolute < whole(b.startOrdinal) + whole(b.count),
      );
      if (
        overlaps.some(
          (b) =>
            whole(b.startsAtSimTime) < end && start < whole(b.endsAtSimTime),
        )
      )
        invalid('WORKER_TIME_ALREADY_BOOKED');
      // Piecewise ordinal intersections enforce 480 minutes for each actual person,
      // even when previous bookings partitioned this range differently.
      const cuts = [
        absolute,
        absolute + count,
        ...overlaps.flatMap((b) => [
          whole(b.startOrdinal) > absolute ? whole(b.startOrdinal) : absolute,
          whole(b.startOrdinal) + whole(b.count) < absolute + count
            ? whole(b.startOrdinal) + whole(b.count)
            : absolute + count,
        ]),
      ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      for (const point of cuts.slice(0, -1)) {
        const used = overlaps
          .filter(
            (b) =>
              whole(b.startOrdinal) <= point &&
              point < whole(b.startOrdinal) + whole(b.count),
          )
          .reduce(
            (n, b) => n + whole(b.endsAtSimTime) - whole(b.startsAtSimTime),
            0n,
          );
        if (used + end - start > 28800000n)
          invalid('FIRST_DAY_WORKER_480_MINUTES_EXCEEDED');
      }
      bookings.push(entry);
      allocations.push(entry);
      performed += ms;
    }
    const maxWork = new WorldDecimal(run.terms.quantity.amount)
      .times(s.labourPersonDaysPerOutput)
      .times('28800000');
    if (
      !maxWork.isInteger() ||
      new WorldDecimal((run.performed + performed).toString()).greaterThan(
        maxWork,
      )
    )
      invalid('WORK_EXCEEDS_FINITE_RUN_DEMAND');
    const data: IndustryCompletedWorkData = {
      schemaVersion: 'postwar-industry-completed-work-v1',
      worldId: s.worldId,
      countryId: s.countryId,
      locationId: s.locationId,
      facilityId: s.facilityId,
      operatorId: s.operatorId,
      runId: run.terms.runId,
      seedId: s.seedId,
      seedFingerprint: s.seedFingerprint,
      admissionRef: s.admissionRef,
      schedule: {
        commandId: run.frame.command.commandId,
        commandFingerprint: run.frame.command.fingerprint,
        eventId: run.frame.events[0]!.eventId,
        eventFingerprint: run.frame.events[0]!.fingerprint,
      },
      policy: {
        version: s.policyVersion,
        rawSha256: s.policyRawSha256,
        userAdoptionRawSha256: s.userAdoptionRawSha256,
        sourceRef: s.sourceRef,
        sourceRawSha256: s.sourceRawSha256,
      },
      completedAtSimTime: c.simTime.toCanonicalValue(),
      allocations,
    };
    if (!equal(JSON.parse(f.events[0]!.canonicalPayload), data))
      invalid('EXACT_ACTUAL_WORK_EVENT_REQUIRED');
    work = Object.freeze({}) as IndustryCompletedWork;
    works.set(
      work,
      freeze({
        classification: 'CORE_VALIDATED_WORK_DATA_NOT_SOURCE_AUTHORITY',
        data,
        frame: f,
        sourceFingerprint: hash(s, sha),
      }),
    );
    runs.set(key, { ...run, performed: run.performed + performed });
  } else invalid('UNKNOWN_INDUSTRY_STAGE');
  const state = Object.freeze({}) as IndustryFirstDayWorkState,
    seen = new Map(prior.seen);
  seen.set(c.commandId, { fingerprint: c.fingerprint, state, work });
  states.set(state, {
    ...prior,
    runs,
    utilisationTargets,
    bookings: freeze(bookings),
    seen,
  });
  return Object.freeze({ state, work });
}

/** Server consumers use this only after the actual complete prefix has been
 * read and replayed. It is not a source-currentness or actor/readiness check. */
export function readIndustryFirstDayWorkState(
  value: IndustryFirstDayWorkState,
) {
  const s = states.get(value);
  if (!s) invalid('ISSUED_WORK_STATE_REQUIRED');
  return Object.freeze({
    classification:
      'CORE_VALIDATED_RUN_WORK_STATE_NOT_CURRENT_SOURCE_AUTHORITY' as const,
    worldId: s.worldId,
    runs: Object.freeze(
      [...s.runs.values()].map((r) =>
        Object.freeze({
          terms: r.terms,
          frame: r.frame,
          source: r.source,
          performedPersonMilliseconds: r.performed.toString(),
        }),
      ),
    ),
    utilisationTargets: Object.freeze(
      [...s.utilisationTargets.values()].map((value) =>
        Object.freeze({
          terms: value.terms,
          frame: value.frame,
          source: value.source,
          effect:
            'TARGET_INTENT_ONLY_NO_RESERVED_CAPACITY_OR_PRODUCTION' as const,
        }),
      ),
    ),
    bookings: s.bookings,
    completedWorks: Object.freeze(
      [...s.seen.values()].flatMap((v) => (v.work ? [v.work] : [])),
    ),
  });
}
function stageFrame(
  input: Readonly<{
    command: FinanceNativeBudgetCanonicalFrame['command'];
    head: { worldVersion: string; eventSequence: string };
    observedAtReal: string;
    eventType: string;
    payload: unknown;
  }>,
  sha: Sha256Hex,
): FinanceNativeBudgetCanonicalFrame {
  const command = validateCanonicalCommand(input.command, sha);
  if (command.expectedWorldVersion !== input.head.worldVersion)
    invalid('EXACT_ACTUAL_STAGE_HEAD_REQUIRED');
  const after = (whole(input.head.worldVersion) + 1n).toString(),
    sequence = (whole(input.head.eventSequence) + 1n).toString();
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId:
        'EVENT_INDUSTRY_' +
        sha(
          canonicalSerialize([
            command.worldId,
            command.fingerprint,
            input.eventType,
          ]),
        ).toUpperCase(),
      eventType: input.eventType,
      worldId: command.worldId,
      worldVersion: after,
      sequence,
      simTime: command.simTime.toCanonicalValue(),
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      correctsEventId: null,
      recordedAtReal: input.observedAtReal,
      payload: input.payload,
    },
    sha,
  );
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: input.head.worldVersion,
    worldVersionAfter: after,
    events: [event],
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
      recordedAtReal: input.observedAtReal,
    }),
    financialPostingBatches: Object.freeze([]),
    inventoryPostings: Object.freeze([]),
  });
}
function targetPayload(
  terms: Readonly<IndustryUtilisationTargetTerms>,
  source: Readonly<IndustryFirstDayWorkSiteSource>,
) {
  return {
    schemaVersion: 'postwar-industry-utilisation-target-set-v1',
    terms,
    source: {
      worldId: source.worldId,
      countryId: source.countryId,
      facilityId: source.facilityId,
      operatorId: source.operatorId,
      seedId: source.seedId,
      seedFingerprint: source.seedFingerprint,
      admissionRef: source.admissionRef,
      sourceRef: source.sourceRef,
      sourceRawSha256: source.sourceRawSha256,
    },
  };
}
export function prepareIndustryUtilisationTargetFrame(
  input: Readonly<{
    state: IndustryFirstDayWorkState;
    command: FinanceNativeBudgetCanonicalFrame['command'];
    head: { worldVersion: string; eventSequence: string };
    observedAtReal: string;
  }>,
  sha: Sha256Hex,
) {
  const prior = states.get(input.state);
  if (!prior) invalid('ISSUED_WORK_STATE_REQUIRED');
  const terms = parseIndustryUtilisationTargetIntent(input.command, sha);
  const source = prior.sources.find(
    (s) =>
      s.countryId === input.command.countryId &&
      s.facilityId === terms.facilityId,
  );
  if (!source) invalid('ACTUAL_TARGET_SITE_SOURCE_REQUIRED');
  const frame = stageFrame(
    {
      ...input,
      eventType: INDUSTRY_UTILISATION_TARGET_EVENT,
      payload: targetPayload(terms, source),
    },
    sha,
  );
  return Object.freeze({
    frame,
    ...replayIndustryFirstDayRunFrame({ state: input.state, frame }, sha),
  });
}
export function prepareIndustryRunScheduleFrame(
  input: Readonly<{
    state: IndustryFirstDayWorkState;
    command: FinanceNativeBudgetCanonicalFrame['command'];
    head: { worldVersion: string; eventSequence: string };
    observedAtReal: string;
  }>,
  sha: Sha256Hex,
) {
  const s = states.get(input.state);
  if (!s) invalid('ISSUED_WORK_STATE_REQUIRED');
  const terms = parseIndustryRunScheduleIntent(input.command, sha),
    source = s.sources.find(
      (s) =>
        s.countryId === input.command.countryId &&
        s.facilityId === terms.facilityId,
    );
  if (!source) invalid('ACTUAL_SITE_SOURCE_REQUIRED');
  const frame = stageFrame(
    {
      ...input,
      eventType: INDUSTRY_RUN_SCHEDULED_EVENT,
      payload: {
        schemaVersion: 'postwar-industry-run-scheduled-v1',
        terms,
        source: {
          worldId: source.worldId,
          countryId: source.countryId,
          facilityId: source.facilityId,
          operatorId: source.operatorId,
          seedId: source.seedId,
          seedFingerprint: source.seedFingerprint,
          admissionRef: source.admissionRef,
          sourceRef: source.sourceRef,
          sourceRawSha256: source.sourceRawSha256,
        },
      },
    },
    sha,
  );
  return Object.freeze({
    frame,
    ...replayIndustryFirstDayRunFrame({ state: input.state, frame }, sha),
  });
}
export function prepareIndustryFirstDayWorkFrame(
  input: Readonly<{
    state: IndustryFirstDayWorkState;
    command: FinanceNativeBudgetCanonicalFrame['command'];
    head: { worldVersion: string; eventSequence: string };
    observedAtReal: string;
  }>,
  sha: Sha256Hex,
) {
  const s = states.get(input.state);
  if (!s) invalid('ISSUED_WORK_STATE_REQUIRED');
  const command = validateCanonicalCommand(input.command, sha),
    p = record(JSON.parse(command.canonicalPayload)),
    run = s.runs.get(command.countryId + '\0' + text(p.runId));
  if (command.commandType !== INDUSTRY_FIRST_DAY_WORK_COMMAND || !run)
    invalid('ACTUAL_COMMITTED_RUN_REQUIRED');
  const source = run.source;
  // The reducer below closes/validates allocations, elapsed time, exact source
  // positions and the private accumulated booking state before issuing DATA.
  const payload = {
    schemaVersion: 'postwar-industry-completed-work-v1',
    worldId: source.worldId,
    countryId: source.countryId,
    locationId: source.locationId,
    facilityId: source.facilityId,
    operatorId: source.operatorId,
    runId: run.terms.runId,
    seedId: source.seedId,
    seedFingerprint: source.seedFingerprint,
    admissionRef: source.admissionRef,
    schedule: {
      commandId: run.frame.command.commandId,
      commandFingerprint: run.frame.command.fingerprint,
      eventId: run.frame.events[0]!.eventId,
      eventFingerprint: run.frame.events[0]!.fingerprint,
    },
    policy: {
      version: source.policyVersion,
      rawSha256: source.policyRawSha256,
      userAdoptionRawSha256: source.userAdoptionRawSha256,
      sourceRef: source.sourceRef,
      sourceRawSha256: source.sourceRawSha256,
    },
    completedAtSimTime: command.simTime.toCanonicalValue(),
    allocations: p.allocations,
  };
  const frame = stageFrame(
    { ...input, eventType: INDUSTRY_FIRST_DAY_WORK_EVENT, payload },
    sha,
  );
  return Object.freeze({
    frame,
    ...replayIndustryFirstDayRunFrame({ state: input.state, frame }, sha),
  });
}

export function extendIndustryFirstDayWorkSources(
  state: IndustryFirstDayWorkState,
  incoming: readonly IndustryFirstDayWorkSiteSource[],
): IndustryFirstDayWorkState {
  const prior = states.get(state);
  if (!prior) invalid('ISSUED_WORK_STATE_REQUIRED');
  const sources = [...prior.sources];
  for (const value of incoming) {
    source(value);
    if (value.worldId !== prior.worldId) invalid('SAME_WORLD_SITE_REQUIRED');
    const found = sources.find(
      (s) =>
        s.countryId === value.countryId && s.facilityId === value.facilityId,
    );
    if (found) {
      if (!equal(found, value)) invalid('IMMUTABLE_SITE_ORIGINAL_CHANGED');
    } else sources.push(value);
  }
  const validated = createIndustryFirstDayWorkState(sources),
    next = states.get(validated)!;
  states.set(validated, { ...prior, sources: next.sources });
  return validated;
}
export function isIndustryFirstDayWorkState(
  v: unknown,
): v is IndustryFirstDayWorkState {
  return !!v && typeof v === 'object' && states.has(v);
}
