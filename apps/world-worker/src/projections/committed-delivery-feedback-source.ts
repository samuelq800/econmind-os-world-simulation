import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  countryId,
  createFinalCommandReceipt,
  deliverNarrowTreasuryGcuTransfer,
  DomainError,
  DOMAIN_ERROR_CODES,
  parseNarrowTreasuryGcuDeliveryTerms,
  parseNarrowTreasuryGcuShipmentTerms,
  parseNarrowTreasuryGcuTransferTerms,
  rebuildV08LedgersFromLineage,
  type DecisionResultHead,
  type FinalCommandReceipt,
  type OpeningSeed,
  type V08AuthoritativeLedgerTransition,
} from '@econmind/core';
import { validateCommittedDecisionLineage } from './office-decision-result-projector.js';
import {
  NARROW_TREASURY_GCU_DELIVERY_EVENT_TYPE,
  NARROW_TREASURY_GCU_DELIVERY_EVENT_SCHEMA,
} from '../persistence/narrow-treasury-gcu-delivery-draft.js';

const TEST_ONLY = 'ISOLATED_TEST_ONLY_NOT_ADMITTED' as const;
const sha = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');

export interface IsolatedForeignReader {
  readonly subject: string;
  readonly worldId: string;
  readonly countryId: string;
  readonly teamId: string;
  readonly officeId: string;
  readonly authorizationRevision: string;
  readonly currentAuthorizationRevision: string;
  readonly authenticated: boolean;
  readonly worldActive: boolean;
  readonly seatActive: boolean;
  readonly seatRevoked: boolean;
  readonly entitlement: Readonly<{
    worldId: string;
    countryId: string;
    teamId: string;
    officeId: string;
    subject: string;
    authorizationRevision: string;
    classification: string;
    scopeKey: string;
    active: boolean;
    revoked: boolean;
  }>;
  readonly sourceHead: DecisionResultHead;
  readonly heldSnapshotKey: string;
  readonly rlsReadPermitted: boolean;
}
export interface IsolatedForeignCommittedTransition extends V08AuthoritativeLedgerTransition {
  readonly receipt: FinalCommandReceipt;
}
export interface IsolatedForeignSnapshot {
  readonly seed: OpeningSeed;
  readonly openingSeedFingerprint: string;
  readonly sourceHead: DecisionResultHead;
  readonly heldSnapshotKey: string;
  readonly transitions: readonly IsolatedForeignCommittedTransition[];
  readonly reader: IsolatedForeignReader;
}
export interface IsolatedForeignSourceHandle {
  readonly schemaVersion: 'unit-test-only-committed-delivery-handle-v2';
  readonly admission: typeof TEST_ONLY;
}
interface PrivateSource {
  readonly readerBinding: string;
  readonly sourceHead: DecisionResultHead;
  readonly heldSnapshotKey: string;
  readonly scopeKey: string;
  readonly recipientCountryId: string;
  readonly counterpartyCountryId: string | null;
  readonly recipientSide: 'BUYER' | 'SELLER' | null;
  readonly status: 'VALIDATED' | 'UNAVAILABLE';
  readonly reason: 'NO_COMMITTED_DELIVERY' | 'CAUSE_CORRECTED' | null;
  // Raw causes never belong in a wire packet, error or handle.
  readonly deliveryEventId: string | null;
  readonly deliveryEventFingerprint: string | null;
}
const handles = new WeakMap<object, Readonly<PrivateSource>>();

function invalid(): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Foreign source integrity validation failed',
  );
}
function denied(): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
    'Foreign private read denied',
  );
}
function exact(value: object, keys: readonly string[]): void {
  const actual = Reflect.ownKeys(value);
  if (
    actual.length !== keys.length ||
    keys.some((key) => !actual.includes(key))
  )
    invalid();
}
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
function head(value: DecisionResultHead): void {
  exact(value, ['worldId', 'worldVersion', 'eventSequence']);
  if (
    !nonempty(value.worldId) ||
    !/^(?:0|[1-9]\d{0,18})$/u.test(value.worldVersion) ||
    !/^(?:0|[1-9]\d{0,18})$/u.test(value.eventSequence)
  )
    invalid();
}
function scope(country: string): string {
  return (
    'OFFICE_' +
    Buffer.from(countryId(country), 'utf8').toString('hex').toUpperCase() +
    '_5452414445'
  );
}
export function requireIsolatedForeignTestRuntime(): void {
  if (
    process.env.NODE_ENV !== 'test' ||
    process.env.VITEST !== 'true' ||
    !['local', 'ci'].includes(process.env.ECONMIND_ENV ?? 'local')
  )
    throw new Error('ISOLATED_TEST_RUNTIME_REQUIRED');
}
function checkReader(
  reader: IsolatedForeignReader,
  sourceHead: DecisionResultHead,
  heldSnapshotKey: string,
): string {
  // Reject accessors, hidden/symbol keys and non-domain objects before using data.
  canonicalSerialize(reader);
  exact(reader, [
    'subject',
    'worldId',
    'countryId',
    'teamId',
    'officeId',
    'authorizationRevision',
    'currentAuthorizationRevision',
    'authenticated',
    'worldActive',
    'seatActive',
    'seatRevoked',
    'entitlement',
    'sourceHead',
    'heldSnapshotKey',
    'rlsReadPermitted',
  ]);
  head(reader.sourceHead);
  exact(reader.entitlement, [
    'worldId',
    'countryId',
    'teamId',
    'officeId',
    'subject',
    'authorizationRevision',
    'classification',
    'scopeKey',
    'active',
    'revoked',
  ]);
  const e = reader.entitlement;
  if (
    !nonempty(reader.subject) ||
    !nonempty(reader.teamId) ||
    !nonempty(reader.authorizationRevision) ||
    !nonempty(heldSnapshotKey) ||
    reader.authenticated !== true ||
    reader.worldActive !== true ||
    reader.seatActive !== true ||
    reader.seatRevoked !== false ||
    reader.rlsReadPermitted !== true ||
    reader.officeId !== 'TRADE' ||
    reader.authorizationRevision !== reader.currentAuthorizationRevision ||
    reader.worldId !== sourceHead.worldId ||
    canonicalSerialize(reader.sourceHead) !== canonicalSerialize(sourceHead) ||
    reader.heldSnapshotKey !== heldSnapshotKey ||
    e.active !== true ||
    e.revoked !== false ||
    e.subject !== reader.subject ||
    e.worldId !== reader.worldId ||
    e.countryId !== reader.countryId ||
    e.teamId !== reader.teamId ||
    e.officeId !== 'TRADE' ||
    e.classification !== 'OFFICE_PRIVATE' ||
    e.authorizationRevision !== reader.authorizationRevision ||
    e.scopeKey !== scope(reader.countryId)
  )
    denied();
  return canonicalSerialize([
    reader.subject,
    reader.worldId,
    reader.countryId,
    reader.teamId,
    reader.officeId,
    reader.authorizationRevision,
    e.scopeKey,
  ]);
}

/** Complete isolated prefix consumer; not a SQL loader or source/admission issuer.
 * Original Core replay owns economic validation. The narrow Core factory is
 * rerun only to compare the supplied committed Posting semantics, never to write.
 */
function verify(input: IsolatedForeignSnapshot): Readonly<PrivateSource> {
  canonicalSerialize(input);
  exact(input, [
    'seed',
    'openingSeedFingerprint',
    'sourceHead',
    'heldSnapshotKey',
    'transitions',
    'reader',
  ]);
  head(input.sourceHead);
  const readerBinding = checkReader(
    input.reader,
    input.sourceHead,
    input.heldSnapshotKey,
  );
  if (
    input.seed.worldId !== input.sourceHead.worldId ||
    input.seed.openingWorldVersion !== '0' ||
    input.openingSeedFingerprint !== input.seed.fingerprint
  )
    invalid();
  validateCommittedDecisionLineage({ ...input, sha256Hex: sha });
  for (const value of input.transitions) {
    const canonicalReceipt = createFinalCommandReceipt({
      command: value.command,
      transition: value.transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: value.command.simTime,
      recordedAtReal: value.receipt.recordedAtReal,
    });
    if (
      canonicalSerialize(canonicalReceipt) !== canonicalSerialize(value.receipt)
    )
      invalid();
  }
  rebuildV08LedgersFromLineage({
    seed: input.seed,
    transitions: input.transitions,
    sha256Hex: sha,
  });
  const prefix: IsolatedForeignCommittedTransition[] = [];
  let registeredCount = 0;
  let latest: Readonly<{
    eventId: string;
    eventFingerprint: string;
    buyer: string;
    seller: string;
  }> | null = null;
  for (const value of input.transitions) {
    const { command, transition } = value;
    const registered =
      command.commandType.startsWith('CORE_GOODS_DELIVERY_') ||
      transition.events.some((event) =>
        event.eventType.startsWith('NARROW_TREASURY_GCU_DELIVERED_'),
      );
    if (registered) {
      registeredCount++;
      // Locate registered completion before any positive schema/receipt filters.
      // A broken latest (even for an unknown schema) is an integrity error.
      if (
        command.commandType !== 'CORE_GOODS_DELIVERY_V1' ||
        transition.events.length !== 1
      )
        invalid();
      const event = transition.events[0]!;
      if (
        event.eventType !== NARROW_TREASURY_GCU_DELIVERY_EVENT_TYPE ||
        event.correctsEventId !== null
      )
        invalid();
      const payload = JSON.parse(command.canonicalPayload) as Record<
        string,
        unknown
      >;
      const parent = prefix.find(
        (item) => item.command.commandId === payload.transferCommandId,
      )?.command;
      if (!parent) invalid();
      const terms = parseNarrowTreasuryGcuTransferTerms(parent);
      const delivery = parseNarrowTreasuryGcuDeliveryTerms({
        deliveryCommand: command,
        transferCommand: parent,
        sha256Hex: sha,
      });
      const shipments = prefix.filter(
        (item) =>
          item.command.commandType === 'CORE_GOODS_SHIPMENT_V1' &&
          (JSON.parse(item.command.canonicalPayload) as Record<string, unknown>)
            .shipmentId === delivery.shipmentId,
      );
      if (shipments.length !== 1) invalid();
      parseNarrowTreasuryGcuShipmentTerms({
        shipmentCommand: shipments[0]!.command,
        transferCommand: parent,
        sha256Hex: sha,
      });
      const expectedPayload = {
        schemaVersion: NARROW_TREASURY_GCU_DELIVERY_EVENT_SCHEMA,
        shipmentId: delivery.shipmentId,
        transferCommandId: parent.commandId,
        transferFingerprint: parent.fingerprint,
      };
      if (event.canonicalPayload !== canonicalSerialize(expectedPayload))
        invalid();
      if (terms.buyerCountryId === terms.sellerCountryId) denied();
      if (
        value.inventoryPostings.length !== 1 ||
        value.financialPostingBatches.length !== 1
      )
        invalid();
      const inventory = value.inventoryPostings[0]!;
      const financial = value.financialPostingBatches[0]!;
      const before = rebuildV08LedgersFromLineage({
        seed: input.seed,
        transitions: prefix,
        sha256Hex: sha,
      });
      const sources = before.inventory.balances.filter(
        ({ account }) =>
          account.bucket === 'IN_TRANSIT' &&
          account.shipmentId === delivery.shipmentId,
      );
      const buyer = financial.legs.filter(
        (leg) => leg.account.accountId === delivery.buyerTreasuryAccountId,
      );
      const seller = financial.legs.filter(
        (leg) => leg.account.accountId === delivery.sellerSettlementAccountId,
      );
      if (sources.length !== 1 || buyer.length !== 1 || seller.length !== 1)
        invalid();
      const expected = deliverNarrowTreasuryGcuTransfer({
        buyerTreasury: buyer[0]!.account,
        buyerTreasuryLegId: buyer[0]!.legId,
        sellerSettlement: seller[0]!.account,
        sellerSettlementLegId: seller[0]!.legId,
        source: sources[0]!.account,
        inventoryState: before.inventory,
        financialState: before.financial,
        deliveryCommand: command,
        transferCommand: parent,
        transition,
        causationEventIds: transition.eventIds,
        financialBatchId: financial.batchId,
        inventoryPostingId: inventory.postingId,
        sha256Hex: sha,
      });
      if (
        canonicalSerialize(expected.posting) !==
          canonicalSerialize(inventory) ||
        canonicalSerialize(expected.settlement) !==
          canonicalSerialize(financial)
      )
        invalid();
      if (
        [terms.buyerCountryId, terms.sellerCountryId].includes(
          countryId(input.reader.countryId),
        )
      )
        latest = {
          eventId: event.eventId,
          eventFingerprint: event.fingerprint,
          buyer: terms.buyerCountryId,
          seller: terms.sellerCountryId,
        };
    }
    prefix.push(value);
  }
  if (registeredCount > 0 && latest === null) denied();
  const corrected =
    latest !== null &&
    input.transitions.some((value) =>
      value.transition.events.some(
        (event) => event.correctsEventId === latest!.eventId,
      ),
    );
  // A country with no bilateral history cannot learn other parties' identities.
  const available = latest !== null && !corrected;
  const side =
    latest === null
      ? null
      : latest.buyer === input.reader.countryId
        ? 'BUYER'
        : 'SELLER';
  return Object.freeze({
    readerBinding,
    sourceHead: Object.freeze({ ...input.sourceHead }),
    heldSnapshotKey: input.heldSnapshotKey,
    scopeKey: scope(input.reader.countryId),
    recipientCountryId: input.reader.countryId,
    counterpartyCountryId: available
      ? side === 'BUYER'
        ? latest!.seller
        : latest!.buyer
      : null,
    recipientSide: available ? side : null,
    status: available ? 'VALIDATED' : 'UNAVAILABLE',
    reason: available
      ? null
      : corrected
        ? 'CAUSE_CORRECTED'
        : 'NO_COMMITTED_DELIVERY',
    deliveryEventId: available ? latest!.eventId : null,
    deliveryEventFingerprint: available ? latest!.eventFingerprint : null,
  });
}

/** Normal entry stays closed even in a test environment or with caller markers. */
export function loadCommittedDeliveryFeedbackSource(_input?: unknown) {
  void _input;
  return Object.freeze({
    status: 'UNAVAILABLE',
    reason: 'SOURCE_NOT_ADMITTED',
  } as const);
}
export function createIsolatedCommittedDeliveryFeedbackSourceForTestOnly(
  ...unexpected: never[]
) {
  requireIsolatedForeignTestRuntime();
  if (unexpected.length) invalid();
  return Object.freeze({
    load(
      input: IsolatedForeignSnapshot,
    ): Readonly<IsolatedForeignSourceHandle> {
      requireIsolatedForeignTestRuntime();
      let checked: Readonly<PrivateSource>;
      try {
        checked = verify(input);
      } catch (error) {
        // Preserve the original error code/fail-closed outcome, never raw cause IDs.
        if (error instanceof DomainError)
          throw new DomainError(error.code, 'Foreign source validation failed');
        invalid();
      }
      const handle = Object.freeze({
        schemaVersion: 'unit-test-only-committed-delivery-handle-v2',
        admission: TEST_ONLY,
      } as const);
      handles.set(handle, checked);
      return handle;
    },
  });
}

/** Worker-private test handle consumer. Never a public reader or wire serializer. */
export function readIsolatedCommittedDeliveryFeedbackForTestOnly(
  handle: IsolatedForeignSourceHandle,
  reader: IsolatedForeignReader,
): Readonly<PrivateSource> {
  requireIsolatedForeignTestRuntime();
  const source = handles.get(handle);
  if (!source) denied();
  if (
    checkReader(reader, source.sourceHead, source.heldSnapshotKey) !==
    source.readerBinding
  )
    denied();
  return source;
}
