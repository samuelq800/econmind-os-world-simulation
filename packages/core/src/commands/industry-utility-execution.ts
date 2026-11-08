import { isManualIndustryUtilityPayload } from './authenticated-office-command-contract.js';
/** Common conditional execution DATA for the three adopted first-day utility
 * services. The fixed domain reducers establish actual labour, payment and
 * resource effects. Neither this preparation nor a source policy is delivery,
 * source admission, an actor mandate, a Clock or commit authority. */
import { DomainError, DOMAIN_ERROR_CODES } from '../errors.js';
import {
  canonicalSerialize,
  canonicalHashInput,
} from '../serialization/canonical.js';
import {
  canonicalSha256,
  validateCanonicalCommand,
  type CanonicalCommand,
  type Sha256Hex,
} from './command.js';
import {
  readFinanceSocialReplayContinuationView,
  type FinanceSocialReplayContinuationView,
} from './finance-social-replay-continuation.js';
import {
  bindAuthoritativeTransition,
  createFinalCommandReceipt,
} from './receipt.js';
import type { FinanceNativeBudgetCanonicalFrame } from './finance-budget-native.js';
import {
  createIndustryFirstDayWorkState,
  readIndustryFirstDayWorkState,
  replayIndustryFirstDayRunFrame,
} from '../industry/industry-first-day-work.js';

export const INDUSTRY_UTILITY_COMMANDS = Object.freeze({
  POWER: 'INDUSTRY_FIRST_DAY_POWER_EXECUTE_V1',
  WATER: 'INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1',
  LOGISTICS: 'INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTE_V1',
});
export const INDUSTRY_UTILITY_EVENTS = Object.freeze({
  POWER: 'INDUSTRY_FIRST_DAY_POWER_EXECUTED_V1',
  WATER: 'INDUSTRY_FIRST_DAY_WATER_EXECUTED_V1',
  LOGISTICS: 'INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTED_V1',
});
export const INDUSTRY_UTILITY_OPERATING_RECEIPT_EVENT =
  'POSTWAR_INDUSTRY_OPERATING_FACT_RECORDED_V1';
export type IndustryUtilityKind = keyof typeof INDUSTRY_UTILITY_COMMANDS;
export interface IndustryUtilitySource {
  readonly worldId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly facilityId: string;
  readonly operatorId: string;
  readonly runId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly sourceRef: string;
  readonly sourceRawSha256: string;
  readonly policyVersion: string;
  readonly policyRawSha256: string;
  readonly userAdoptionRawSha256: string;
  /** Immutable underlying rights, recipes, custody or power originals. Actual
   * registration/validity and completeness remain fixed source-guard duties. */
  readonly originals: readonly Readonly<{
    kind: string;
    reference: string;
    rawSha256: string;
  }>[];
}
export interface IndustryUtilityIntent {
  readonly schemaVersion: 'industry-first-day-utility-command-v1';
  readonly serviceKind: IndustryUtilityKind;
  readonly operationRef: string;
  readonly facilityId: string;
  readonly runId: string;
  readonly sourceRef: string;
  readonly sourceRawSha256: string;
  /** Exact, bounded input to the fixed service's own deterministic parser. */
  readonly operation: Readonly<Record<string, unknown>>;
}
function invalid(s: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'INDUSTRY_UTILITY_EXECUTION:' + s,
  );
}
const ref = (s: unknown): s is string =>
  typeof s === 'string' && /^[A-Za-z][A-Za-z0-9_.:-]{0,255}$/u.test(s);
const digest = (s: unknown): s is string =>
  typeof s === 'string' && /^sha256:[a-f0-9]{64}$/u.test(s);
const rawSha = (s: unknown): s is string =>
  typeof s === 'string' && /^[a-f0-9]{64}$/u.test(s);
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('EXACT_OBJECT_REQUIRED');
  return v as Record<string, unknown>;
}
function immutable<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(immutable);
    Object.freeze(v);
  }
  return v;
}
function utf8Bytes(v: string): number {
  let n = 0;
  for (const c of v) {
    const p = c.codePointAt(0)!;
    n += p <= 0x7f ? 1 : p <= 0x7ff ? 2 : p <= 0xffff ? 3 : 4;
  }
  return n;
}
/** Schema only. The private fixed issuer must additionally bind the actual
 * COMMITTED RUN, its audit identity and the current quota/source on the same
 * executor; copied fields or this parser cannot issue commit authority. */
function automaticWaterGrantShape(
  command: CanonicalCommand,
  payload: Record<string, unknown>,
): boolean {
  const operation = object(payload.operation);
  return (
    command.commandType === INDUSTRY_UTILITY_COMMANDS.WATER &&
    command.officeId === null &&
    command.expectedWorldVersion !== null &&
    /^COMMAND_INDUSTRY_WATER_GRANT_[A-F0-9]{64}$/u.test(command.commandId) &&
    command.idempotencyKey !== null &&
    command.idempotencyKey.toString() === command.commandId &&
    payload.operationRef === command.commandId &&
    payload.serviceKind === 'WATER' &&
    rawSha(payload.sourceRawSha256) &&
    payload.sourceRef ===
      'INDUSTRY_UTILITY_' + payload.sourceRawSha256.toUpperCase() + '_WATER' &&
    Object.keys(operation).length === 1 &&
    operation.action === 'GRANT_RIGHT'
  );
}
export function parseIndustryUtilityIntent(
  command: CanonicalCommand,
  sha: Sha256Hex,
): Readonly<IndustryUtilityIntent> {
  validateCanonicalCommand(command, sha);
  const b = object(JSON.parse(command.canonicalPayload));
  const keys = [
    'schemaVersion',
    'serviceKind',
    'operationRef',
    'facilityId',
    'runId',
    'sourceRef',
    'sourceRawSha256',
    'operation',
  ];
  if (
    Object.keys(b).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(b, k)) ||
    b.schemaVersion !== 'industry-first-day-utility-command-v1' ||
    !Object.hasOwn(INDUSTRY_UTILITY_COMMANDS, String(b.serviceKind)) ||
    (!automaticWaterGrantShape(command, b) &&
      (command.officeId !== 'INDUSTRY' ||
        command.expectedWorldVersion === null ||
        command.idempotencyKey === null)) ||
    ![b.operationRef, b.facilityId, b.runId, b.sourceRef].every(ref) ||
    !rawSha(b.sourceRawSha256) ||
    // A whole first-day service may complete exactly at its end tick. Domain
    // reducers still reject new bookings or operations extending past it.
    BigInt(command.simTime.ticks) > 86400000n ||
    command.commandType !==
      INDUSTRY_UTILITY_COMMANDS[b.serviceKind as IndustryUtilityKind] ||
    utf8Bytes(command.canonicalPayload) > 16384
  )
    invalid('EXACT_FIXED_FIRST_DAY_INDUSTRY_INTENT_REQUIRED');
  const operation = object(b.operation);
  if (utf8Bytes(canonicalSerialize(operation)) > 12288)
    invalid('BOUNDED_DOMAIN_OPERATION_REQUIRED');
  return immutable({
    ...b,
    operation,
  }) as unknown as Readonly<IndustryUtilityIntent>;
}
export function parseIndustryUtilityAutomaticWaterGrantIntent(
  command: CanonicalCommand,
  sha: Sha256Hex,
): Readonly<IndustryUtilityIntent> {
  const intent = parseIndustryUtilityIntent(command, sha);
  if (!automaticWaterGrantShape(command, object(intent)))
    invalid('FIXED_AUTOMATIC_WATER_GRANT_SHAPE_REQUIRED');
  return intent;
}
/** Public manual scheduling is narrower than historical conditional DATA. */
export function parseIndustryUtilityManualIntent(
  command: CanonicalCommand,
  sha: Sha256Hex,
): Readonly<IndustryUtilityIntent> {
  const intent = parseIndustryUtilityIntent(command, sha);
  if (!isManualIndustryUtilityPayload(command.commandType, intent))
    invalid('FIXED_MANUAL_UTILITY_SCHEDULING_ACTION_REQUIRED');
  return intent;
}
function source(input: IndustryUtilitySource): Readonly<IndustryUtilitySource> {
  // Canonical copy prevents mutable caller objects or getters becoming retained
  // source identity. These are checked DATA pins, never proof of SQL custody.
  const s = object(JSON.parse(canonicalSerialize(input)));
  const refs = [
    'worldId',
    'countryId',
    'locationId',
    'facilityId',
    'operatorId',
    'runId',
    'seedId',
    'admissionRef',
    'sourceRef',
    'policyVersion',
  ] as const;
  if (
    Object.keys(s).length !== 15 ||
    !refs.every((k) => ref(s[k])) ||
    !digest(s.seedFingerprint) ||
    !rawSha(s.sourceRawSha256) ||
    !rawSha(s.policyRawSha256) ||
    !rawSha(s.userAdoptionRawSha256) ||
    !Array.isArray(s.originals) ||
    s.originals.length === 0 ||
    s.originals.length > 64
  )
    invalid('BOUNDED_EXACT_SOURCE_AND_ORIGINALS_REQUIRED');
  const identities = new Set<string>();
  for (const raw of s.originals) {
    const r = object(raw);
    if (
      Object.keys(r).length !== 3 ||
      !ref(r.kind) ||
      !ref(r.reference) ||
      !rawSha(r.rawSha256)
    )
      invalid('EXACT_IMMUTABLE_ORIGINAL_REQUIRED');
    const key = r.kind + '\n' + r.reference;
    if (identities.has(key)) invalid('DUPLICATE_ORIGINAL_REQUIRED_REJECTION');
    identities.add(key);
  }
  return immutable(s) as unknown as Readonly<IndustryUtilitySource>;
}
declare const utilityPreparation: unique symbol;
export interface IndustryUtilityExecutionPreparation {
  readonly [utilityPreparation]: true;
}
interface Data {
  readonly classification: 'COMPLETE_PREFIX_UTILITY_INPUT_DATA_NOT_DELIVERY_OR_AUTHORITY';
  readonly command: CanonicalCommand;
  readonly intent: Readonly<IndustryUtilityIntent>;
  readonly source: Readonly<IndustryUtilitySource>;
  readonly replay: Readonly<FinanceSocialReplayContinuationView>;
  readonly productionRun: ReturnType<
    typeof readIndustryFirstDayWorkState
  >['runs'][number];
  readonly sourceFingerprint: string;
}
export interface IndustryUtilityOperatingReceiptData {
  readonly schemaVersion: 'industry-utility-operating-receipt-v2';
  readonly classification: 'CONDITIONAL_DOMAIN_RECEIPT_DATA_NOT_DELIVERY_AUTHORITY';
  readonly kind: 'POWER_DELIVERY' | 'WATER_DELIVERY' | 'LOGISTICS_DELIVERY';
  readonly receiptId: string;
  readonly purpose: 'INDUSTRY_PRODUCTION_INPUT';
  readonly worldId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly facilityId: string;
  readonly operatorId: string;
  readonly runId: string;
  readonly productionRun: Readonly<{
    commandId: string;
    commandFingerprint: string;
    eventId: string;
    eventFingerprint: string;
  }>;
  readonly sourceFingerprint: string;
  readonly validFromTicks: string;
  readonly validUntilTicks: string;
  readonly factCanonicalPayload: string;
}
const preparations = new WeakMap<object, Readonly<Data>>();
export function prepareIndustryUtilityExecution(
  input: Readonly<{
    command: CanonicalCommand;
    replay: FinanceSocialReplayContinuationView;
    source: IndustryUtilitySource;
  }>,
  sha: Sha256Hex,
): IndustryUtilityExecutionPreparation {
  const intent = parseIndustryUtilityIntent(input.command, sha),
    replay = readFinanceSocialReplayContinuationView(input.replay, sha),
    original = source(input.source);
  if (
    !replay.complete ||
    !replay.result.financialState ||
    !replay.result.inventoryState ||
    !replay.result.industryWorkState ||
    !same(replay.head, replay.expectedHead) ||
    input.command.expectedWorldVersion !== replay.head.worldVersion ||
    input.command.worldId !== replay.worldId ||
    original.worldId !== replay.worldId ||
    original.seedFingerprint !== replay.seedFingerprint ||
    input.command.countryId !== original.countryId ||
    intent.facilityId !== original.facilityId ||
    intent.runId !== original.runId ||
    intent.sourceRef !== original.sourceRef ||
    intent.sourceRawSha256 !== original.sourceRawSha256
  )
    invalid('EXACT_COMPLETE_CURRENT_WORLD_SEED_SOURCE_AND_HEAD_REQUIRED');
  const state = replay.result.industryWorkState;
  if (!state) invalid('ACTUAL_COMMITTED_PRODUCTION_RUN_REQUIRED');
  const runs = readIndustryFirstDayWorkState(state).runs.filter(
    (r) =>
      r.terms.facilityId === intent.facilityId &&
      r.terms.runId === intent.runId &&
      r.source.countryId === original.countryId &&
      r.source.worldId === original.worldId &&
      r.source.locationId === original.locationId &&
      r.source.operatorId === original.operatorId &&
      r.source.seedId === original.seedId &&
      r.source.seedFingerprint === original.seedFingerprint &&
      r.source.admissionRef === original.admissionRef,
  );
  if (runs.length !== 1)
    invalid('EXACT_ACTUAL_COMMITTED_RUN_ORIGINAL_REQUIRED');
  const token = Object.freeze({}) as IndustryUtilityExecutionPreparation;
  preparations.set(
    token,
    Object.freeze({
      classification:
        'COMPLETE_PREFIX_UTILITY_INPUT_DATA_NOT_DELIVERY_OR_AUTHORITY',
      command: input.command,
      intent,
      source: original,
      replay,
      productionRun: runs[0]!,
      sourceFingerprint: canonicalSha256(canonicalHashInput(original), sha),
    }),
  );
  return token;
}
export function readIndustryUtilityExecution(
  preparation: IndustryUtilityExecutionPreparation,
  sha: Sha256Hex,
): Readonly<Data> {
  const d = preparations.get(preparation);
  if (!d) invalid('GENUINE_LIVE_UTILITY_PREPARATION_REQUIRED');
  validateCanonicalCommand(d.command, sha);
  readFinanceSocialReplayContinuationView(d.replay, sha);
  return d;
}
export function retireIndustryUtilityExecution(
  preparation: IndustryUtilityExecutionPreparation,
): void {
  preparations.delete(preparation);
}
/** Draft bytes only: recording these bytes is NOT proof of performed work or
 * paid inputs. Only the service's private calculation plus actual committed
 * full frame may establish delivery. A production guard must consume that
 * genuine domain token, not this serializable object. */
export function industryUtilityOperatingReceiptDraft(
  input: Readonly<{
    preparation: IndustryUtilityExecutionPreparation;
    validFromTicks: string;
    validUntilTicks: string;
    factCanonicalPayload: string;
  }>,
  sha: Sha256Hex,
): Readonly<IndustryUtilityOperatingReceiptData> {
  const d = readIndustryUtilityExecution(input.preparation, sha);
  return industryUtilityOperatingReceiptFromRun(
    {
      command: d.command,
      source: d.source,
      productionRun: d.productionRun,
      validFromTicks: input.validFromTicks,
      validUntilTicks: input.validUntilTicks,
      factCanonicalPayload: input.factCanonicalPayload,
    },
    sha,
  );
}
/** Pure serialization only. Historical domain reducers already validate their
 * full prefix state; they cannot construct a fake "complete" view mid-page.
 * This DATA helper deliberately issues no committed delivery token. */
export function industryUtilityOperatingReceiptFromRun(
  input: Readonly<{
    command: CanonicalCommand;
    source: IndustryUtilitySource;
    productionRun: Data['productionRun'];
    validFromTicks: string;
    validUntilTicks: string;
    factCanonicalPayload: string;
  }>,
  sha: Sha256Hex,
): Readonly<IndustryUtilityOperatingReceiptData> {
  const intent = parseIndustryUtilityIntent(input.command, sha),
    original = source(input.source),
    run = input.productionRun,
    frame = run.frame;
  const expectedWorldVersion = input.command.expectedWorldVersion;
  if (expectedWorldVersion === null)
    invalid('EXACT_COMMITTED_RUN_SERIALIZATION_DATA_REQUIRED');
  // Reuse the actual deterministic RUN reducer for terms, capacity, source,
  // complete frame and FINAL validation. This isolated DATA calculation does
  // not claim the supplied row is in a database or issue service work/delivery.
  const replayed = replayIndustryFirstDayRunFrame(
    { state: createIndustryFirstDayWorkState([run.source]), frame },
    sha,
  );
  const canonicalRun = readIndustryFirstDayWorkState(replayed.state).runs[0];
  bindAuthoritativeTransition(
    { command: frame.command, transition: frame.transition },
    sha,
  );
  const committed = createFinalCommandReceipt({
    command: frame.command,
    transition: frame.transition,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: frame.command.simTime,
    recordedAtReal: frame.receipt.recordedAtReal,
  });
  if (
    !same(committed, frame.receipt) ||
    !same(frame.events, frame.transition.events) ||
    !canonicalRun ||
    !same(canonicalRun.terms, run.terms) ||
    !same(canonicalRun.source, run.source) ||
    frame.events[0]?.correctsEventId !== null ||
    frame.events.length !== 1 ||
    frame.command.commandType !== 'CORE_INDUSTRY_RUN_SCHEDULE_V1' ||
    frame.events[0]?.eventType !== 'INDUSTRY_FIRST_DAY_RUN_SCHEDULED_V1' ||
    frame.financialPostingBatches.length !== 0 ||
    frame.inventoryPostings.length !== 0 ||
    frame.command.worldId !== original.worldId ||
    frame.command.countryId !== original.countryId ||
    run.terms.facilityId !== original.facilityId ||
    run.terms.runId !== original.runId ||
    run.source.seedFingerprint !== original.seedFingerprint ||
    run.source.seedId !== original.seedId ||
    run.source.worldId !== original.worldId ||
    run.source.countryId !== original.countryId ||
    run.source.admissionRef !== original.admissionRef ||
    run.source.operatorId !== original.operatorId ||
    run.source.locationId !== original.locationId ||
    input.command.worldId !== original.worldId ||
    input.command.countryId !== original.countryId ||
    intent.facilityId !== original.facilityId ||
    intent.runId !== original.runId ||
    intent.sourceRef !== original.sourceRef ||
    intent.sourceRawSha256 !== original.sourceRawSha256 ||
    BigInt(frame.transition.worldVersionAfter) > BigInt(expectedWorldVersion) ||
    frame.command.simTime.ticks > input.command.simTime.ticks
  )
    invalid('EXACT_COMMITTED_RUN_SERIALIZATION_DATA_REQUIRED');
  const d = {
    command: input.command,
    source: original,
    intent,
    productionRun: run,
    sourceFingerprint: canonicalSha256(canonicalHashInput(original), sha),
  };
  if (
    !/^(0|[1-9]\d*)$/u.test(input.validFromTicks) ||
    !/^(0|[1-9]\d*)$/u.test(input.validUntilTicks) ||
    BigInt(input.validFromTicks) >= BigInt(input.validUntilTicks) ||
    BigInt(input.validUntilTicks) > 86400000n ||
    BigInt(input.validFromTicks) > d.command.simTime.ticks ||
    // This is completion evidence, not an extension of source/right validity
    // or permission for production to consume after the adopted window.
    BigInt(input.validUntilTicks) < d.command.simTime.ticks ||
    utf8Bytes(input.factCanonicalPayload) > 49152 ||
    canonicalSerialize(JSON.parse(input.factCanonicalPayload)) !==
      input.factCanonicalPayload
  )
    invalid('EXACT_CANONICAL_FIRST_DAY_RECEIPT_DRAFT_REQUIRED');
  const event = d.productionRun.frame.events[0];
  if (!event) invalid('ACTUAL_COMMITTED_RUN_EVENT_REQUIRED');
  const body = {
    schemaVersion: 'industry-utility-operating-receipt-v2' as const,
    classification:
      'CONDITIONAL_DOMAIN_RECEIPT_DATA_NOT_DELIVERY_AUTHORITY' as const,
    kind: `${d.intent.serviceKind}_DELIVERY` as IndustryUtilityOperatingReceiptData['kind'],
    purpose: 'INDUSTRY_PRODUCTION_INPUT' as const,
    worldId: d.source.worldId,
    countryId: d.source.countryId,
    locationId: d.source.locationId,
    facilityId: d.source.facilityId,
    operatorId: d.source.operatorId,
    runId: d.source.runId,
    productionRun: Object.freeze({
      commandId: d.productionRun.frame.command.commandId,
      commandFingerprint: d.productionRun.frame.command.fingerprint,
      eventId: event.eventId,
      eventFingerprint: event.fingerprint,
    }),
    sourceFingerprint: d.sourceFingerprint,
    validFromTicks: input.validFromTicks,
    validUntilTicks: input.validUntilTicks,
    factCanonicalPayload: input.factCanonicalPayload,
  };
  return immutable({
    ...body,
    receiptId:
      'UTILITY_RECEIPT_' +
      canonicalSha256(canonicalHashInput(body), sha).slice(7).toUpperCase(),
  });
}
/** Full canonical group validation only. Domain reducers must independently
 * recompute their delivery, resource debit, paid labour and exact journals.
 * This function deliberately cannot issue a delivery or payment receipt. */
export function assertIndustryUtilityCanonicalFrame(
  preparation: IndustryUtilityExecutionPreparation,
  frame: FinanceNativeBudgetCanonicalFrame,
  sha: Sha256Hex,
): void {
  const d = readIndustryUtilityExecution(preparation, sha),
    { command, transition } = frame;
  bindAuthoritativeTransition({ command, transition }, sha);
  if (
    !same(command, d.command) ||
    !same(frame.events, transition.events) ||
    transition.worldVersionBefore !== d.replay.head.worldVersion ||
    (transition.events.length !== 1 && transition.events.length !== 2) ||
    transition.events[0]?.eventType !==
      INDUSTRY_UTILITY_EVENTS[d.intent.serviceKind] ||
    (transition.events.length === 2 &&
      transition.events[1]?.eventType !==
        INDUSTRY_UTILITY_OPERATING_RECEIPT_EVENT) ||
    transition.events.some(
      (e, i) =>
        e.sequence !==
          String(BigInt(d.replay.head.eventSequence) + BigInt(i) + 1n) ||
        e.correctsEventId !== null ||
        e.simTime.ticks !== command.simTime.ticks,
    )
  )
    invalid('EXACT_DOMAIN_AND_OPERATING_RECEIPT_GROUP_REQUIRED');
  const actual = createFinalCommandReceipt({
    command,
    transition,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: command.simTime,
    recordedAtReal: frame.receipt.recordedAtReal,
  });
  if (!same(actual, frame.receipt))
    invalid('EXACT_COMMITTED_FINAL_RECEIPT_REQUIRED');
  // BOOK/SHIP/WORK/PAY stages have only their domain event. They must not be
  // labelled as delivered. A final delivery may additionally record the fixed
  // operating receipt after the domain reducer proves actual resource effects.
  if (transition.events.length === 1) return;
  const envelope = object(JSON.parse(transition.events[1]!.canonicalPayload));
  if (
    Object.keys(envelope).length !== 1 ||
    !Object.hasOwn(envelope, 'operatingReceipt')
  )
    invalid('EXACT_OPERATING_RECEIPT_ENVELOPE_REQUIRED');
  const body = object(envelope.operatingReceipt);
  const expected = industryUtilityOperatingReceiptDraft(
    {
      preparation,
      validFromTicks: String(body.validFromTicks),
      validUntilTicks: String(body.validUntilTicks),
      factCanonicalPayload: String(body.factCanonicalPayload),
    },
    sha,
  );
  if (!same(body, expected))
    invalid('EXACT_SCOPED_RUN_AND_SOURCE_RECEIPT_REQUIRED');
}
