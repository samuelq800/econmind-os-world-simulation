/** Canonical receipt DATA, never an issuer, operating permission or payment.
 * No producer is installed by this contract. A future fixed canonical producer
 * must establish the real work/maintenance/delivery/purpose before recording it.
 * Existing ProtectedIndustryProductionGuard remains mandatory for new effects. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  parseCanonicalCommand,
  parseAuthoritativeEvent,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  validateFinalReceiptForCommand,
  type AuthoritativeTransition,
  type CanonicalCommand,
  type FinalCommandReceipt,
} from '@econmind/core';
export const INDUSTRY_OPERATING_RECEIPT_EVENT =
  'POSTWAR_INDUSTRY_OPERATING_FACT_RECORDED_V1' as const;
export const INDUSTRY_OPERATING_RECEIPT_KINDS = [
  'WORK',
  'MAINTENANCE',
  'PAID_COST',
  'POWER_DELIVERY',
  'WATER_DELIVERY',
  'LOGISTICS_DELIVERY',
  'OPERATING_PERMISSION',
  'TECHNOLOGY_RIGHT',
  'RECIPE',
] as const;
export type IndustryOperatingReceiptKind =
  (typeof INDUSTRY_OPERATING_RECEIPT_KINDS)[number];
export interface IndustryOperatingReceiptScope {
  readonly worldId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly facilityId: string;
  readonly operatorId: string;
}
export interface IndustryOperatingReceiptBody extends IndustryOperatingReceiptScope {
  readonly schemaVersion: 'postwar-industry-operating-receipt-v1';
  readonly kind: IndustryOperatingReceiptKind;
  readonly receiptId: string;
  readonly purpose: 'INDUSTRY_PRODUCTION_INPUT';
  readonly targetCommandId: string;
  readonly targetCommandFingerprint: string;
  readonly validFromTicks: string;
  readonly validUntilTicks: string;
  /** Exact pre-existing fact body. Matching these bytes is not original-use authorization. */
  readonly factCanonicalPayload: string;
}
export interface CommittedIndustryOperatingReceipt {
  readonly classification: 'COMMITTED_OPERATING_RECEIPT_DATA_NOT_ADMISSION';
  readonly body: Readonly<IndustryOperatingReceiptBody>;
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly receipt: FinalCommandReceipt;
  readonly eventId: string;
  readonly eventFingerprint: string;
  readonly eventPayloadHash: string;
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(s: string): never {
  throw Error('INDUSTRY_OPERATING_RECEIPT:' + s);
}
export const receiptObject = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : invalid('OBJECT_REQUIRED');
function exact(v: Record<string, unknown>, keys: readonly string[]) {
  if (
    Object.keys(v).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(v, k))
  )
    invalid('EXACT_FIELDS_REQUIRED');
}
const ref = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 512 && v.trim() === v;
const integer = (v: unknown): v is string =>
  typeof v === 'string' && /^(0|[1-9]\d*)$/u.test(v) && v.length <= 30;
export function parseIndustryOperatingReceiptBody(
  value: unknown,
): Readonly<IndustryOperatingReceiptBody> {
  const b = receiptObject(value);
  exact(b, [
    'schemaVersion',
    'kind',
    'receiptId',
    'purpose',
    'targetCommandId',
    'targetCommandFingerprint',
    'worldId',
    'countryId',
    'locationId',
    'facilityId',
    'operatorId',
    'validFromTicks',
    'validUntilTicks',
    'factCanonicalPayload',
  ]);
  if (
    b.schemaVersion !== 'postwar-industry-operating-receipt-v1' ||
    b.purpose !== 'INDUSTRY_PRODUCTION_INPUT' ||
    !(INDUSTRY_OPERATING_RECEIPT_KINDS as readonly unknown[]).includes(
      b.kind,
    ) ||
    ![
      b.receiptId,
      b.worldId,
      b.countryId,
      b.locationId,
      b.facilityId,
      b.operatorId,
      b.targetCommandId,
    ].every(ref) ||
    !/^sha256:[a-f0-9]{64}$/u.test(String(b.targetCommandFingerprint)) ||
    !integer(b.validFromTicks) ||
    !integer(b.validUntilTicks) ||
    BigInt(b.validFromTicks) >= BigInt(b.validUntilTicks) ||
    typeof b.factCanonicalPayload !== 'string' ||
    Buffer.byteLength(b.factCanonicalPayload) > 65536
  )
    invalid('BOUNDED_SCOPED_PURPOSE_REQUIRED');
  const fact: unknown = JSON.parse(b.factCanonicalPayload);
  if (canonicalSerialize(fact) !== b.factCanonicalPayload)
    invalid('EXACT_CANONICAL_FACT_REQUIRED');
  return Object.freeze({
    ...b,
  }) as unknown as Readonly<IndustryOperatingReceiptBody>;
}
function parserInput(v: Record<string, unknown>) {
  const { canonicalPayload, payloadHash, fingerprint, ...rest } = v;
  void payloadHash;
  void fingerprint;
  if (
    typeof canonicalPayload !== 'string' ||
    Buffer.byteLength(canonicalPayload) > 65536
  )
    invalid('BOUNDED_CANONICAL_BYTES_REQUIRED');
  return { ...rest, payload: JSON.parse(canonicalPayload) as unknown };
}
/** Wire originates only in fixed SQL below. All command/event/receipt hashes and
 * complete event group are reconstructed by existing Core, not a ready flag. */
export function decodeCommittedIndustryOperatingReceipt(
  value: unknown,
): Readonly<CommittedIndustryOperatingReceipt> {
  const row = receiptObject(value);
  exact(row, ['targetEventId', 'command', 'events', 'receipt']);
  const c = receiptObject(row.command);
  const command = parseCanonicalCommand(parserInput(c), sha);
  if (canonicalSerialize(command) !== canonicalSerialize(c))
    invalid('STORED_COMMAND_HASH_OR_BYTES_MISMATCH');
  if (
    !Array.isArray(row.events) ||
    row.events.length < 1 ||
    row.events.length > 16
  )
    invalid('COMPLETE_BOUNDED_EVENTS_REQUIRED');
  const events = row.events.map((v) => {
    const original = receiptObject(v),
      event = parseAuthoritativeEvent(parserInput(original), sha);
    if (canonicalSerialize(event) !== canonicalSerialize(original))
      invalid('STORED_EVENT_HASH_OR_BYTES_MISMATCH');
    return event;
  });
  const r = receiptObject(row.receipt);
  if (
    !integer(r.worldVersionBefore) ||
    !integer(r.worldVersionAfter) ||
    !ref(r.recordedAtReal)
  )
    invalid('ACTUAL_COMMITTED_RECEIPT_REQUIRED');
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: r.worldVersionBefore,
    worldVersionAfter: r.worldVersionAfter,
    events,
  });
  const receipt = createFinalCommandReceipt({
    command,
    transition,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: command.simTime,
    recordedAtReal: r.recordedAtReal,
  });
  // SimTime in SQL is text. Compare the full canonical wire, including audit,
  // idempotency, reason, event order, versions and no extra fields.
  if (canonicalSerialize(receipt) !== canonicalSerialize(r))
    invalid('EXACT_COMMITTED_RECEIPT_REQUIRED');
  validateFinalReceiptForCommand({ command, receipt, transition });
  const targets = events.filter(
    (e) =>
      e.eventId === row.targetEventId &&
      e.eventType === INDUSTRY_OPERATING_RECEIPT_EVENT,
  );
  if (targets.length !== 1) invalid('EXACT_RECEIPT_EVENT_REQUIRED');
  const event = targets[0]!,
    payload = receiptObject(JSON.parse(event.canonicalPayload));
  exact(payload, ['operatingReceipt']);
  const body = parseIndustryOperatingReceiptBody(payload.operatingReceipt);
  if (
    body.worldId !== command.worldId ||
    body.countryId !== command.countryId ||
    event.worldId !== body.worldId
  )
    invalid('CANONICAL_SCOPE_MISMATCH');
  return Object.freeze({
    classification: 'COMMITTED_OPERATING_RECEIPT_DATA_NOT_ADMISSION',
    body,
    command,
    transition,
    receipt,
    eventId: event.eventId,
    eventFingerprint: event.fingerprint,
    eventPayloadHash: event.payloadHash,
  });
}
