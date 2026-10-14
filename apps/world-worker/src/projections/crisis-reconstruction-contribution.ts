import { createHash } from 'node:crypto';

import {
  canonicalSerialize,
  authSubject,
  canonicalHashInput,
  canonicalSha256,
  DOMAIN_ERROR_CODES,
  DomainError,
  Money,
  Quantity,
  SimTime,
  parseOpeningSeed,
  rebuildV08LedgersFromLineage,
  validateCanonicalCommand,
  validateAuthoritativeEvent,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  validateFinalReceiptForCommand,
  createInventoryPosting,
  createProductionConsumptionPosting,
  createFinancialPostingBatch,
  deliverNarrowTreasuryGcuTransfer,
  parseNarrowTreasuryGcuTransferTerms,
  parseNarrowTreasuryGcuDeliveryTerms,
  type CanonicalCommand,
  type InventoryPosting,
  type InventoryAccount,
  type FinancialPostingBatch,
} from '@econmind/core';

/** Pinned isolated port types. Structural declarations never grant authority. */
import type {
  OpeningSeed,
  V08AuthoritativeLedgerTransition,
  FinalCommandReceipt,
  AuthorizationCapability,
} from '@econmind/core';

export interface ExactQuantityValue {
  readonly amount: string;
  readonly unit: string;
}
export interface HeldIdentity {
  readonly worldId: string;
  readonly genesisRef: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly openingSourceId: string;
  readonly openingSourceVersion: string;
  readonly worldVersion: string;
  readonly eventSequence: string;
}
export interface SnapshotSourcePin {
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly canonicalFingerprint: string;
  readonly held: HeldIdentity;
}
/** Exact canonical source bytes, supplied in the SAME aggregate, not a hash-only
 * permission claim. sha256 binds {sourceId,sourceVersion,held,payload} bytes. */
export interface CanonicalSourceDocument {
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly held: HeldIdentity;
  readonly canonicalBytes: string;
  readonly canonicalFingerprint: string;
}
export interface CrisisSelection {
  readonly worldId: string;
  readonly genesisRef: string;
  readonly countryId: string;
  readonly officeId: string;
  readonly teamId: string;
  readonly authorizationRevision: string;
  readonly crisisId: string;
  readonly taskId: string;
  readonly metricId: string;
  readonly metricVersion: string;
}
export interface IsolatedCrisisRule {
  readonly pin: SnapshotSourcePin;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly ruleFingerprint: string;
  readonly selection: CrisisSelection;
  readonly metricMode: 'DELIVERED_INPUT';
  readonly commodityId: 'GRAIN';
  readonly target: ExactQuantityValue | null;
  readonly eligibleDestinationIds: readonly string[];
  readonly openingAllocationSliceRef: string;
  readonly deliveryAllocationSliceRef: string;
  readonly activityWindowRef: string;
  readonly disclosureRuleRef: string | null;
}
export interface CurrentAuthorizationFixture {
  readonly pin: SnapshotSourcePin;
  readonly authSubject: string;
  readonly seatRef: string;
  readonly entitlementRef: string;
  readonly countryId: string;
  readonly officeId: string;
  readonly teamId: string;
  readonly authorizationRevision: string;
  readonly capabilities: readonly AuthorizationCapability[];
  readonly membershipState: 'CURRENT_MECHANISM_ONLY' | 'REVOKED' | 'UNKNOWN';
  readonly entitlementState: 'ACTIVE_MECHANISM_ONLY' | 'REVOKED' | 'UNKNOWN';
  readonly disclosureRuleRef: string | null;
  readonly readableMetricIds: readonly string[];
}
/** Core canonical values are constructed/validated with existing factories.
 * A canonical COMMITTED receipt inside this fixture is NOT a durable DB commit.
 */
export interface CanonicalPrefixRecord extends V08AuthoritativeLedgerTransition {
  readonly receipt: Readonly<FinalCommandReceipt>;
}
export interface CompleteCanonicalPrefix {
  readonly pin: SnapshotSourcePin;
  readonly fromOpeningWorldVersion: '0';
  readonly completeness: 'COMPLETE_MECHANISM_PREFIX' | 'UNKNOWN';
  readonly records: readonly CanonicalPrefixRecord[];
}
/** Distinct source-owned credit identity, not just a destination/batch match.
 * A source explicitly excludes known candidates; absence is UNKNOWN, not zero.
 */
export interface LotAllocation {
  readonly allocationRef: string;
  readonly allocationFingerprint: string;
  readonly contributionLotRef: string;
  readonly crisisId: string;
  readonly taskId: string;
  readonly metricId: string;
  readonly metricVersion: string;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly countryId: string;
  readonly destinationId: string;
  readonly commodityId: 'GRAIN';
  readonly quantity: ExactQuantityValue;
  readonly disposition: 'ALLOCATED' | 'EXCLUDED_BY_SOURCE';
  readonly source:
    | { readonly kind: 'OPENING'; readonly openingEntryId: string }
    | {
        readonly kind: 'DELIVERY';
        readonly commandId: string;
        readonly commandFingerprint: string;
        readonly eventId: string;
        readonly eventFingerprint: string;
        readonly inventoryPostingId: string;
        readonly inventoryPostingFingerprint: string;
        readonly financialBatchId: string;
        readonly financialBatchFingerprint: string;
        readonly receiptCanonicalFingerprint: string;
        readonly transferCommandId: string;
        readonly transferFingerprint: string;
        readonly shipmentId: string;
      };
}
export interface AllocationSlice {
  readonly pin: SnapshotSourcePin;
  readonly sliceRef: string;
  readonly completeness: 'COMPLETE_MECHANISM_ALLOCATION' | 'UNKNOWN';
  readonly lots: readonly LotAllocation[];
}
export interface BoundActivityWindow {
  readonly pin: SnapshotSourcePin;
  readonly windowRef: string;
  readonly policyVersion: string;
  readonly basis: 'ACTUAL_REAL_ACTIVITY_COMMIT_CUTOFF';
  readonly startInclusiveAtReal: string;
  readonly endExclusiveAtReal: string;
  readonly observationSourceRef: string;
  readonly observationCanonicalFingerprint: string;
  readonly currentObservedAtReal: string;
}
/** A separate source-owned conjunction witness, never copied from the draft,
 * receipt recordedAtReal, intended SimTime, Event timestamp or Date.now().
 * Isolated fixture protocol is visibly distinct from any future real issuer.
 */
export interface ActualCommitEligibilityFixture {
  readonly witnessRef: string;
  readonly witnessCanonicalFingerprint: string;
  readonly sourceProtocol: 'ISOLATED_ACTUAL_COMMITTED_CUTOFF_FIXTURE_V1';
  readonly actualSourceRef: string;
  readonly windowRef: string;
  readonly commandId: string;
  readonly commandFingerprint: string;
  readonly transitionId: string;
  readonly worldVersionAfter: string;
  readonly eventIds: readonly string[];
  readonly receiptCanonicalFingerprint: string;
  readonly eligibilityObservedAtReal: string;
  readonly committedEligibility:
    | 'COMMITTED_WITHIN_WINDOW'
    | 'COMMITTED_BEFORE_START'
    | 'COMMITTED_AT_OR_AFTER_END'
    | 'UNKNOWN';
}
export interface EligibilitySlice {
  readonly pin: SnapshotSourcePin;
  readonly completeness: 'COMPLETE_MECHANISM_CUTOFFS' | 'UNKNOWN';
  readonly witnesses: readonly ActualCommitEligibilityFixture[];
}
/** No existing registered partial/return/refund contract is adopted by A1.
 * Known contradictions are integrity failures; unknown semantics is UNAVAILABLE.
 */
export interface AdjustmentSlice {
  readonly pin: SnapshotSourcePin;
  readonly semantics:
    'NO_ADJUSTMENTS_IN_COMPLETE_PREFIX' | 'UNSUPPORTED_OR_UNKNOWN';
  readonly sourceRefs: readonly {
    readonly adjustmentEventId: string;
    readonly originalContributionLotRef: string;
    readonly inventoryPostingId: string;
    readonly financialBatchId: string | null;
    readonly receiptCanonicalFingerprint: string;
  }[];
}
export interface IsolatedCrisisSnapshotBody {
  readonly schemaVersion: 'isolated-crisis-snapshot-v2';
  readonly sourceClass: 'FINITE_CANONICAL_MECHANISM_FIXTURE';
  readonly held: HeldIdentity;
  readonly selection: CrisisSelection;
  readonly sourceDocuments: readonly CanonicalSourceDocument[];
  readonly rule: IsolatedCrisisRule | null;
  readonly opening: Readonly<OpeningSeed> | null;
  readonly prefix: CompleteCanonicalPrefix | null;
  readonly currentAuthorization: CurrentAuthorizationFixture | null;
  readonly activityWindow: BoundActivityWindow | null;
  readonly openingAllocations: AllocationSlice | null;
  readonly deliveryAllocations: AllocationSlice | null;
  readonly eligibility: EligibilitySlice | null;
  readonly adjustments: AdjustmentSlice | null;
}
export interface IsolatedCrisisSnapshot {
  readonly schemaVersion: 'isolated-crisis-snapshot-envelope-v2';
  readonly admission: 'ISOLATED_TEST_ONLY_NOT_ADMITTED';
  readonly canonicalFingerprint: string;
  readonly body: IsolatedCrisisSnapshotBody;
}
/** Discussion seam only: ONE read, not readRule followed by readLineage.
 * No implementation/host/SQL/issuer is added by this declaration.
 */
export interface ProposedSingleSnapshotPort {
  readSnapshot(
    selection: CrisisSelection,
  ): Promise<Readonly<IsolatedCrisisSnapshot> | null>;
}
export interface FormalCrisisUnavailable {
  readonly status: 'UNAVAILABLE';
  readonly reason: 'FORMAL_CRISIS_SOURCE_PORT_NOT_INSTALLED';
}
export interface IsolatedCrisisResultEnvelope {
  readonly schemaVersion: 'isolated-crisis-contribution-test-envelope-v2';
  readonly admission: 'ISOLATED_TEST_ONLY_NOT_ADMITTED';
  readonly formalPublicationAllowed: false;
  readonly snapshotFingerprint: string;
  readonly result:
    | {
        readonly kind: 'TEST_ONLY_UNAVAILABLE' | 'TEST_ONLY_DENIED';
        readonly reason: string;
      }
    | {
        readonly kind: 'TEST_ONLY_DELIVERED_INPUT_RESULT';
        readonly metricMode: 'DELIVERED_INPUT';
        readonly commodityId: 'GRAIN';
        readonly eligible: ExactQuantityValue;
        readonly target: ExactQuantityValue;
        readonly gap: ExactQuantityValue;
        readonly historicalSettledCosts: readonly {
          readonly amount: string;
          readonly currency: 'GCU';
        }[];
        readonly contributingLotRefs: readonly string[];
        readonly sourceEventRefs: readonly string[];
        readonly formalClock: null;
        readonly formalClockStatus: 'UNBOUND';
      };
}

const sha256 = (bytes: string): string =>
  createHash('sha256').update(bytes, 'utf8').digest('hex');
const digest = (value: unknown): string =>
  `sha256:${sha256(canonicalSerialize(value))}`;
const same = (a: unknown, b: unknown): boolean =>
  canonicalSerialize(a) === canonicalSerialize(b);
const order = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

class UnavailableSourceContract extends Error {}

function integrity(reason: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.SETTLEMENT_MAPPING_INVALID, reason);
}
function requireIntegrity(
  condition: unknown,
  reason: string,
): asserts condition {
  if (!condition) integrity(reason);
}
function isolatedEnvironment(): boolean {
  return (
    process.env.NODE_ENV === 'test' &&
    process.env.VITEST === 'true' &&
    (process.env.ECONMIND_ENV === 'local' || process.env.ECONMIND_ENV === 'ci')
  );
}
function resultEnvelope(
  snapshotFingerprint: string,
  result: IsolatedCrisisResultEnvelope['result'],
): IsolatedCrisisResultEnvelope {
  return Object.freeze({
    schemaVersion: 'isolated-crisis-contribution-test-envelope-v2',
    admission: 'ISOLATED_TEST_ONLY_NOT_ADMITTED',
    formalPublicationAllowed: false,
    snapshotFingerprint,
    result: Object.freeze(result),
  });
}
function unavailable(
  reason: string,
  fingerprint = '',
): IsolatedCrisisResultEnvelope {
  return resultEnvelope(fingerprint, { kind: 'TEST_ONLY_UNAVAILABLE', reason });
}

/** No formal port/issuer/allowlist is installed by this module. */
export function readFormalCrisisContribution(): FormalCrisisUnavailable {
  return Object.freeze({
    status: 'UNAVAILABLE',
    reason: 'FORMAL_CRISIS_SOURCE_PORT_NOT_INSTALLED',
  });
}

function semantic(
  value: object,
  ownFingerprint?: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => key !== 'pin' && key !== ownFingerprint,
    ),
  );
}
function exactUtc(value: string): number {
  requireIntegrity(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value),
    'NON_CANONICAL_ACTIVITY_UTC',
  );
  const milliseconds = Date.parse(value);
  requireIntegrity(
    Number.isFinite(milliseconds) &&
      new Date(milliseconds).toISOString() === value,
    'INVALID_ACTIVITY_UTC',
  );
  return milliseconds;
}
function boundedMetadata(value: unknown, key = ''): boolean {
  if (typeof value === 'string')
    return (
      ['canonicalBytes', 'canonicalPayload'].includes(key) ||
      value.length <= 1024
    );
  if (value === null || typeof value !== 'object') return true;
  if (Array.isArray(value))
    return value.every((item) => boundedMetadata(item, key));
  return Object.entries(value).every(([name, item]) =>
    boundedMetadata(item, name),
  );
}
function withinLimits(body: IsolatedCrisisSnapshotBody): boolean {
  const records = body.prefix?.records ?? [];
  return (
    body.sourceDocuments.length <= 32 &&
    body.sourceDocuments.every(
      (d) => Buffer.byteLength(d.canonicalBytes, 'utf8') <= 1048576,
    ) &&
    body.sourceDocuments.reduce(
      (sum, d) => sum + Buffer.byteLength(d.canonicalBytes, 'utf8'),
      0,
    ) <= 8388608 &&
    records.length <= 256 &&
    records.reduce((n, r) => n + r.transition.events.length, 0) <= 1024 &&
    records.reduce((n, r) => n + r.inventoryPostings.length, 0) <= 1024 &&
    records.reduce((n, r) => n + r.financialPostingBatches.length, 0) <= 1024 &&
    (body.openingAllocations?.lots.length ?? 0) <= 512 &&
    (body.deliveryAllocations?.lots.length ?? 0) <= 512 &&
    (body.eligibility?.witnesses.length ?? 0) <= 512 &&
    (body.adjustments?.sourceRefs.length ?? 0) <= 512 &&
    boundedMetadata(body)
  );
}
function checkSources(body: IsolatedCrisisSnapshotBody): void {
  const documents = new Map<string, CanonicalSourceDocument>();
  const sourceKey = (sourceId: string, sourceVersion: string): string =>
    canonicalSerialize([sourceId, sourceVersion]);
  for (const doc of body.sourceDocuments) {
    requireIntegrity(
      !documents.has(sourceKey(doc.sourceId, doc.sourceVersion)),
      'DUPLICATE_SOURCE_DOCUMENT',
    );
    requireIntegrity(same(doc.held, body.held), 'SOURCE_HELD_SCOPE_MISMATCH');
    requireIntegrity(
      `sha256:${sha256(doc.canonicalBytes)}` === doc.canonicalFingerprint,
      'SOURCE_DOCUMENT_HASH_MISMATCH',
    );
    const parsed: unknown = JSON.parse(doc.canonicalBytes);
    requireIntegrity(
      canonicalSerialize(parsed) === doc.canonicalBytes,
      'NON_CANONICAL_SOURCE_BYTES',
    );
    const row = parsed as {
      sourceId: string;
      sourceVersion: string;
      held: HeldIdentity;
      payload: unknown;
    };
    requireIntegrity(
      same(parsed, {
        sourceId: doc.sourceId,
        sourceVersion: doc.sourceVersion,
        held: body.held,
        payload: row.payload,
      }),
      'SOURCE_DOCUMENT_ENVELOPE_MISMATCH',
    );
    documents.set(sourceKey(doc.sourceId, doc.sourceVersion), doc);
  }
  function check(pin: SnapshotSourcePin, payload: unknown): void {
    requireIntegrity(
      same(pin.held, body.held),
      'COMPONENT_HELD_SCOPE_MISMATCH',
    );
    const doc = documents.get(sourceKey(pin.sourceId, pin.sourceVersion));
    requireIntegrity(
      doc &&
        doc.sourceVersion === pin.sourceVersion &&
        doc.canonicalFingerprint === pin.canonicalFingerprint,
      'SOURCE_PIN_UNRESOLVED',
    );
    requireIntegrity(
      doc.canonicalBytes ===
        canonicalSerialize({
          sourceId: pin.sourceId,
          sourceVersion: pin.sourceVersion,
          held: body.held,
          payload,
        }),
      'SOURCE_SEMANTIC_PAYLOAD_MISMATCH',
    );
  }
  for (const value of [
    body.prefix,
    body.currentAuthorization,
    body.activityWindow,
    body.openingAllocations,
    body.deliveryAllocations,
    body.eligibility,
    body.adjustments,
  ])
    if (value) check(value.pin, semantic(value));
  if (body.rule) {
    const payload = semantic(body.rule, 'ruleFingerprint');
    requireIntegrity(
      digest(payload) === body.rule.ruleFingerprint,
      'RULE_FINGERPRINT_MISMATCH',
    );
    check(body.rule.pin, payload);
  }
  if (body.opening) {
    const doc = documents.get(
      sourceKey(body.held.openingSourceId, body.held.openingSourceVersion),
    );
    requireIntegrity(
      doc && doc.sourceVersion === body.held.openingSourceVersion,
      'OPENING_DOCUMENT_UNRESOLVED',
    );
    requireIntegrity(
      doc.canonicalBytes ===
        canonicalSerialize({
          sourceId: doc.sourceId,
          sourceVersion: doc.sourceVersion,
          held: body.held,
          payload: semantic(body.opening, 'fingerprint'),
        }),
      'OPENING_DOCUMENT_PAYLOAD_MISMATCH',
    );
  }
}

function rehydrate(record: CanonicalPrefixRecord): CanonicalPrefixRecord {
  const command = validateCanonicalCommand(record.command, sha256);
  const events = record.transition.events.map((e) =>
    validateAuthoritativeEvent(e, sha256),
  );
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: record.transition.worldVersionBefore,
    worldVersionAfter: record.transition.worldVersionAfter,
    events,
  });
  requireIntegrity(
    same(transition, record.transition),
    'TRANSITION_CANONICAL_CONTENT_MISMATCH',
  );
  const receiptWire = JSON.parse(canonicalSerialize(record.receipt)) as {
    simTime: string;
  };
  const receipt = createFinalCommandReceipt({
    command,
    transition,
    outcome: record.receipt.outcome,
    reasonCode: record.receipt.reasonCode,
    simTime: SimTime.fromTicks(receiptWire.simTime),
    recordedAtReal: record.receipt.recordedAtReal,
  });
  validateFinalReceiptForCommand({ receipt, command, transition });
  requireIntegrity(
    same(receipt, record.receipt),
    'RECEIPT_CANONICAL_CONTENT_MISMATCH',
  );
  requireIntegrity(
    receipt.outcome === 'COMMITTED',
    'PREFIX_RECEIPT_NOT_COMMITTED',
  );
  const inventoryPostings = record.inventoryPostings.map((posting) => {
    requireIntegrity(
      'operation' in posting,
      'UNSUPPORTED_INVENTORY_POSTING_CONTRACT',
    );
    if (posting.operation === 'PRODUCE_AND_CONSUME') {
      const rebuilt = createProductionConsumptionPosting(
        {
          postingId: posting.postingId,
          command,
          transition,
          evidence: posting.evidence,
        },
        sha256,
      );
      requireIntegrity(
        same(rebuilt, posting),
        'PRODUCTION_CANONICAL_CONTENT_MISMATCH',
      );
      return rebuilt;
    }
    if (
      !['RESERVE', 'RELEASE', 'SHIP', 'DELIVER'].includes(posting.operation)
    ) {
      const { fingerprint, ...intent } = posting;
      requireIntegrity(
        canonicalSha256(canonicalHashInput(intent), sha256) === fingerprint,
        'UNKNOWN_POSTING_CANONICAL_HASH_MISMATCH',
      );
      throw new UnavailableSourceContract(
        'INVENTORY_POSTING_CONTRACT_UNAVAILABLE',
      );
    }
    const raw = posting as InventoryPosting;
    const rebuilt = createInventoryPosting(
      {
        ...raw,
        command,
        transition,
        simTime: command.simTime,
        entries: raw.entries.map((entry) => ({
          account: entry.account,
          delta: Quantity.from(entry.delta.amount.toString(), entry.delta.unit),
        })),
      },
      sha256,
    );
    requireIntegrity(
      same(rebuilt, raw),
      'INVENTORY_CANONICAL_CONTENT_MISMATCH',
    );
    return rebuilt;
  });
  const financialPostingBatches = record.financialPostingBatches.map(
    (batch) => {
      const rebuilt = createFinancialPostingBatch(
        {
          ...batch,
          command,
          transition,
          simTime: command.simTime,
          legs: batch.legs.map((leg) => ({
            ...leg,
            amount: Money.from(
              leg.amount.amount.toString(),
              leg.amount.currency,
            ),
          })),
        },
        sha256,
      );
      requireIntegrity(
        same(rebuilt, batch),
        'FINANCIAL_CANONICAL_CONTENT_MISMATCH',
      );
      return rebuilt;
    },
  );
  return {
    command,
    transition,
    receipt,
    inventoryPostings,
    financialPostingBatches,
  };
}

interface CreditSource {
  readonly key: string;
  readonly countryId: string;
  readonly destinationId: string;
  readonly commodityId: string;
  readonly quantity: Quantity;
  readonly creditedAccount: InventoryAccount;
  readonly delivery?: CanonicalPrefixRecord;
  readonly posting?: InventoryPosting;
  readonly batch?: FinancialPostingBatch;
  readonly transfer?: CanonicalCommand;
  readonly shipmentId?: string;
}
function creditSources(
  seed: OpeningSeed,
  records: readonly CanonicalPrefixRecord[],
  selection: CrisisSelection,
): Map<string, CreditSource> {
  const credits = new Map<string, CreditSource>();
  for (const entry of seed.inventoryEntries)
    if (
      entry.account.countryId === selection.countryId &&
      entry.account.commodityId === 'GRAIN' &&
      entry.account.bucket === 'AVAILABLE'
    )
      credits.set(`OPENING:${entry.entryId}`, {
        key: `OPENING:${entry.entryId}`,
        countryId: entry.account.countryId,
        destinationId: entry.account.physicalLocationId,
        commodityId: entry.account.commodityId,
        quantity: entry.quantity,
        creditedAccount: entry.account,
      });
  for (const [index, record] of records.entries()) {
    for (const posting of record.inventoryPostings) {
      requireIntegrity('operation' in posting, 'UNSUPPORTED_POSTING_CONTRACT');
      if (posting.operation !== 'DELIVER') continue;
      const positive = posting.entries.find((e) => e.delta.amount.isPositive());
      requireIntegrity(positive, 'DELIVERY_CREDIT_ABSENT');
      if (
        positive.account.countryId !== selection.countryId ||
        positive.account.commodityId !== 'GRAIN'
      )
        continue;
      requireIntegrity(
        record.command.commandType === 'CORE_GOODS_DELIVERY_V1',
        'UNKNOWN_DELIVERY_COMMAND_CONTRACT',
      );
      const payload = JSON.parse(record.command.canonicalPayload) as {
        transferCommandId: string;
      };
      const transfer = records.find(
        (r) => r.command.commandId === payload.transferCommandId,
      )?.command;
      requireIntegrity(transfer, 'DELIVERY_PARENT_TRANSFER_ABSENT');
      const terms = parseNarrowTreasuryGcuTransferTerms(transfer);
      const delivery = parseNarrowTreasuryGcuDeliveryTerms({
        deliveryCommand: record.command,
        transferCommand: transfer,
        sha256Hex: sha256,
      });
      const source = posting.entries.find((e) => e.delta.amount.isNegative());
      requireIntegrity(
        source &&
          record.inventoryPostings.length === 1 &&
          record.financialPostingBatches.length === 1,
        'DELIVERY_DUAL_FACTS_INCOMPLETE',
      );
      const before = rebuildV08LedgersFromLineage({
        seed,
        transitions: records.slice(0, index),
        sha256Hex: sha256,
      });
      const batch = record.financialPostingBatches[0]!;
      const buyer = batch.legs.find(
        (l) => l.account.accountId === delivery.buyerTreasuryAccountId,
      )?.account;
      const seller = batch.legs.find(
        (l) => l.account.accountId === delivery.sellerSettlementAccountId,
      )?.account;
      requireIntegrity(buyer && seller, 'DELIVERY_CASH_ACCOUNT_MISMATCH');
      const actual = deliverNarrowTreasuryGcuTransfer({
        buyerTreasury: buyer,
        sellerSettlement: seller,
        causationEventIds: record.transition.eventIds,
        deliveryCommand: record.command,
        financialBatchId: batch.batchId,
        financialState: before.financial,
        inventoryState: before.inventory,
        inventoryPostingId: posting.postingId,
        sellerSettlementLegId: batch.legs.find(
          (l) => l.account.accountId === seller.accountId,
        )!.legId,
        buyerTreasuryLegId: batch.legs.find(
          (l) => l.account.accountId === buyer.accountId,
        )!.legId,
        source: source.account,
        transferCommand: transfer,
        transition: record.transition,
        sha256Hex: sha256,
      });
      requireIntegrity(
        same(actual.posting, posting) && same(actual.settlement, batch),
        'NARROW_DELIVERY_FACTORY_MISMATCH',
      );
      requireIntegrity(
        terms.quantity.unit === positive.delta.unit,
        'DELIVERY_UNIT_MISMATCH',
      );
      const key = `DELIVERY:${posting.postingId}`;
      credits.set(key, {
        key,
        countryId: positive.account.countryId,
        destinationId: positive.account.physicalLocationId,
        commodityId: positive.account.commodityId,
        quantity: positive.delta,
        creditedAccount: positive.account,
        delivery: record,
        posting,
        batch,
        transfer,
        shipmentId: delivery.shipmentId,
      });
    }
  }
  return credits;
}

/** One read; clone once via Core canonical serialization, then only validate the
 * detached immutable-value representation. This never creates source authority. */
export async function readIsolatedCrisisContribution(
  port: ProposedSingleSnapshotPort,
  requestedSelection: CrisisSelection,
): Promise<IsolatedCrisisResultEnvelope> {
  if (!isolatedEnvironment())
    return unavailable('ISOLATED_ENVIRONMENT_REQUIRED');
  const selection = Object.freeze(
    JSON.parse(canonicalSerialize(requestedSelection)) as CrisisSelection,
  );
  const raw = await port.readSnapshot(selection);
  if (raw === null) return unavailable('SINGLE_SNAPSHOT_UNAVAILABLE');
  const bytes = canonicalSerialize(raw);
  if (Buffer.byteLength(bytes, 'utf8') > 16777216)
    return unavailable('ISOLATED_SCOPE_LIMIT_EXCEEDED');
  const snapshot = JSON.parse(bytes) as IsolatedCrisisSnapshot;
  if (!isolatedEnvironment())
    return unavailable('ISOLATED_ENVIRONMENT_REQUIRED');
  try {
    return deriveIsolatedSnapshot(snapshot, selection);
  } catch (error) {
    if (error instanceof UnavailableSourceContract)
      return unavailable(error.message, snapshot.canonicalFingerprint);
    throw error;
  }
}

function deriveIsolatedSnapshot(
  snapshot: IsolatedCrisisSnapshot,
  selection: CrisisSelection,
): IsolatedCrisisResultEnvelope {
  requireIntegrity(
    snapshot.schemaVersion === 'isolated-crisis-snapshot-envelope-v2' &&
      snapshot.admission === 'ISOLATED_TEST_ONLY_NOT_ADMITTED',
    'SNAPSHOT_ENVELOPE_INVALID',
  );
  const body = snapshot.body,
    fingerprint = snapshot.canonicalFingerprint;
  requireIntegrity(
    body.schemaVersion === 'isolated-crisis-snapshot-v2' &&
      body.sourceClass === 'FINITE_CANONICAL_MECHANISM_FIXTURE',
    'SNAPSHOT_SOURCE_CLASS_INVALID',
  );
  requireIntegrity(digest(body) === fingerprint, 'SNAPSHOT_HASH_MISMATCH');
  if (!withinLimits(body))
    return unavailable('ISOLATED_SCOPE_LIMIT_EXCEEDED', fingerprint);
  requireIntegrity(
    same(body.selection, selection) &&
      body.held.worldId === selection.worldId &&
      body.held.genesisRef === selection.genesisRef,
    'SNAPSHOT_SELECTION_SCOPE_MISMATCH',
  );
  checkSources(body);
  const auth = body.currentAuthorization;
  if (!auth)
    return unavailable('CURRENT_AUTHORIZATION_SOURCE_UNAVAILABLE', fingerprint);
  requireIntegrity(
    ['CURRENT_MECHANISM_ONLY', 'REVOKED', 'UNKNOWN'].includes(
      auth.membershipState,
    ) &&
      ['ACTIVE_MECHANISM_ONLY', 'REVOKED', 'UNKNOWN'].includes(
        auth.entitlementState,
      ),
    'CURRENT_AUTHORIZATION_STATE_INVALID',
  );
  if (auth.membershipState === 'UNKNOWN' || auth.entitlementState === 'UNKNOWN')
    return unavailable('CURRENT_AUTHORIZATION_UNKNOWN', fingerprint);
  if (
    auth.membershipState === 'REVOKED' ||
    auth.entitlementState === 'REVOKED' ||
    auth.countryId !== selection.countryId ||
    auth.officeId !== selection.officeId ||
    auth.teamId !== selection.teamId ||
    auth.authorizationRevision !== selection.authorizationRevision
  )
    return resultEnvelope(fingerprint, {
      kind: 'TEST_ONLY_DENIED',
      reason: 'CURRENT_SCOPED_READ_DENIED',
    });
  if (
    !auth.authSubject ||
    !auth.seatRef ||
    !auth.entitlementRef ||
    !auth.disclosureRuleRef
  )
    return unavailable('CURRENT_READ_DISCLOSURE_UNAVAILABLE', fingerprint);
  authSubject(auth.authSubject);
  if (!auth.readableMetricIds.includes(selection.metricId))
    return resultEnvelope(fingerprint, {
      kind: 'TEST_ONLY_DENIED',
      reason: 'METRIC_READ_DENIED',
    });
  const {
    rule,
    opening,
    prefix,
    activityWindow: window,
    openingAllocations: openingSlice,
    deliveryAllocations: deliverySlice,
    eligibility,
    adjustments,
  } = body;
  if (!rule || !opening || !prefix)
    return unavailable('RULE_OPENING_PREFIX_UNAVAILABLE', fingerprint);
  requireIntegrity(
    same(rule.selection, selection) &&
      rule.metricMode === 'DELIVERED_INPUT' &&
      rule.commodityId === 'GRAIN',
    'RULE_SELECTION_MISMATCH',
  );
  if (!rule.disclosureRuleRef)
    return unavailable('METRIC_DISCLOSURE_UNAVAILABLE', fingerprint);
  requireIntegrity(
    auth.disclosureRuleRef === rule.disclosureRuleRef,
    'METRIC_DISCLOSURE_BINDING_MISMATCH',
  );
  const seed = parseOpeningSeed(opening, sha256);
  requireIntegrity(
    seed.worldId === body.held.worldId &&
      seed.seedId === body.held.seedId &&
      seed.fingerprint === body.held.seedFingerprint &&
      seed.sources.some(
        (s) =>
          s.sourceId === body.held.openingSourceId &&
          s.sourceVersion === body.held.openingSourceVersion,
      ),
    'OPENING_HELD_IDENTITY_MISMATCH',
  );
  const records = prefix.records.map(rehydrate);
  const rebuilt = rebuildV08LedgersFromLineage({
    seed,
    transitions: records,
    sha256Hex: sha256,
  });
  const sequence = records.at(-1)?.transition.events.at(-1)?.sequence ?? '0';
  requireIntegrity(
    prefix.fromOpeningWorldVersion === '0' &&
      rebuilt.worldVersion === body.held.worldVersion &&
      sequence === body.held.eventSequence,
    'PREFIX_HELD_WATERMARK_INCOMPLETE',
  );
  requireIntegrity(
    ['COMPLETE_MECHANISM_PREFIX', 'UNKNOWN'].includes(prefix.completeness),
    'PREFIX_COMPLETENESS_CONTRACT_INVALID',
  );
  if (prefix.completeness === 'UNKNOWN')
    return unavailable('CANONICAL_PREFIX_COMPLETENESS_UNKNOWN', fingerprint);
  const sources = creditSources(seed, records, selection);
  if (
    !openingSlice ||
    !deliverySlice ||
    !eligibility ||
    !adjustments ||
    !window
  )
    return unavailable(
      'ALLOCATION_WINDOW_ELIGIBILITY_UNAVAILABLE',
      fingerprint,
    );
  requireIntegrity(
    openingSlice.sliceRef === rule.openingAllocationSliceRef &&
      deliverySlice.sliceRef === rule.deliveryAllocationSliceRef &&
      window.windowRef === rule.activityWindowRef,
    'RULE_SLICE_BINDING_MISMATCH',
  );
  requireIntegrity(
    ['COMPLETE_MECHANISM_ALLOCATION', 'UNKNOWN'].includes(
      openingSlice.completeness,
    ) &&
      ['COMPLETE_MECHANISM_ALLOCATION', 'UNKNOWN'].includes(
        deliverySlice.completeness,
      ) &&
      ['COMPLETE_MECHANISM_CUTOFFS', 'UNKNOWN'].includes(
        eligibility.completeness,
      ) &&
      ['NO_ADJUSTMENTS_IN_COMPLETE_PREFIX', 'UNSUPPORTED_OR_UNKNOWN'].includes(
        adjustments.semantics,
      ),
    'SLICE_SEMANTIC_CONTRACT_INVALID',
  );
  requireIntegrity(
    openingSlice.lots.every((a) => a.source.kind === 'OPENING') &&
      deliverySlice.lots.every((a) => a.source.kind === 'DELIVERY'),
    'ALLOCATION_SLICE_SOURCE_KIND_MISMATCH',
  );
  const start = exactUtc(window.startInclusiveAtReal),
    end = exactUtc(window.endExclusiveAtReal),
    observed = exactUtc(window.currentObservedAtReal);
  requireIntegrity(
    start < end &&
      window.basis === 'ACTUAL_REAL_ACTIVITY_COMMIT_CUTOFF' &&
      Boolean(window.policyVersion) &&
      Boolean(window.observationSourceRef),
    'ACTIVITY_WINDOW_INVALID',
  );
  requireIntegrity(
    window.observationCanonicalFingerprint ===
      digest({
        observationSourceRef: window.observationSourceRef,
        held: body.held,
        currentObservedAtReal: window.currentObservedAtReal,
      }),
    'WINDOW_OBSERVATION_HASH_MISMATCH',
  );
  const witnesses = new Map<string, ActualCommitEligibilityFixture>();
  for (const w of eligibility.witnesses) {
    requireIntegrity(
      w.witnessCanonicalFingerprint ===
        digest(semantic(w, 'witnessCanonicalFingerprint')),
      'ELIGIBILITY_WITNESS_HASH_MISMATCH',
    );
    requireIntegrity(
      w.sourceProtocol === 'ISOLATED_ACTUAL_COMMITTED_CUTOFF_FIXTURE_V1' &&
        Boolean(w.actualSourceRef) &&
        w.windowRef === window.windowRef,
      'ELIGIBILITY_SOURCE_CONTRACT_MISMATCH',
    );
    const r = records.find((r) => r.command.commandId === w.commandId);
    requireIntegrity(
      r &&
        r.command.fingerprint === w.commandFingerprint &&
        r.transition.transitionId === w.transitionId &&
        r.transition.worldVersionAfter === w.worldVersionAfter &&
        same(r.transition.eventIds, w.eventIds) &&
        digest(r.receipt) === w.receiptCanonicalFingerprint,
      'ELIGIBILITY_CANONICAL_CONJUNCTION_MISMATCH',
    );
    const time = exactUtc(w.eligibilityObservedAtReal);
    requireIntegrity(
      time <= observed,
      'ELIGIBILITY_AFTER_SNAPSHOT_OBSERVATION',
    );
    const expected =
      time < start
        ? 'COMMITTED_BEFORE_START'
        : time >= end
          ? 'COMMITTED_AT_OR_AFTER_END'
          : 'COMMITTED_WITHIN_WINDOW';
    requireIntegrity(
      w.committedEligibility === 'UNKNOWN' ||
        w.committedEligibility === expected,
      'ELIGIBILITY_CUTOFF_CLASSIFICATION_MISMATCH',
    );
    const prior = witnesses.get(w.commandId);
    requireIntegrity(
      !prior || same(prior, w),
      'CONFLICTING_ELIGIBILITY_WITNESSES',
    );
    witnesses.set(w.commandId, w);
  }
  const allocations = new Map<string, LotAllocation>(),
    lots = new Map<string, LotAllocation>(),
    sourceTotals = new Map<string, Quantity>(),
    covered = new Set<string>();
  for (const a of [...openingSlice.lots, ...deliverySlice.lots]) {
    requireIntegrity(
      ['ALLOCATED', 'EXCLUDED_BY_SOURCE'].includes(a.disposition),
      'ALLOCATION_DISPOSITION_INVALID',
    );
    requireIntegrity(
      a.allocationFingerprint === digest(semantic(a, 'allocationFingerprint')),
      'ALLOCATION_HASH_MISMATCH',
    );
    const prior = allocations.get(a.allocationRef);
    if (prior) {
      requireIntegrity(same(prior, a), 'CONFLICTING_ALLOCATION_IDENTITY');
      continue;
    }
    allocations.set(a.allocationRef, a);
    requireIntegrity(
      a.crisisId === selection.crisisId &&
        a.taskId === selection.taskId &&
        a.metricId === selection.metricId &&
        a.metricVersion === selection.metricVersion &&
        a.ruleId === rule.ruleId &&
        a.ruleVersion === rule.ruleVersion &&
        a.countryId === selection.countryId &&
        a.commodityId === 'GRAIN',
      'ALLOCATION_RULE_SCOPE_MISMATCH',
    );
    const key =
      a.source.kind === 'OPENING'
        ? `OPENING:${a.source.openingEntryId}`
        : `DELIVERY:${a.source.inventoryPostingId}`;
    const source = sources.get(key);
    requireIntegrity(source, 'ALLOCATION_CANONICAL_SOURCE_ABSENT');
    requireIntegrity(
      a.destinationId === source.destinationId &&
        a.quantity.unit === source.quantity.unit,
      'ALLOCATION_DESTINATION_UNIT_MISMATCH',
    );
    if (a.disposition === 'ALLOCATED')
      requireIntegrity(
        rule.eligibleDestinationIds.includes(a.destinationId),
        'ALLOCATION_DESTINATION_NOT_ELIGIBLE',
      );
    if (a.source.kind === 'DELIVERY') {
      const reference = a.source;
      const r = source.delivery,
        p = source.posting,
        b = source.batch,
        t = source.transfer;
      requireIntegrity(
        r &&
          p &&
          b &&
          t &&
          reference.commandId === r.command.commandId &&
          reference.commandFingerprint === r.command.fingerprint &&
          r.transition.events.some(
            (e) =>
              e.eventId === reference.eventId &&
              e.fingerprint === reference.eventFingerprint,
          ) &&
          reference.inventoryPostingFingerprint === p.fingerprint &&
          reference.financialBatchId === b.batchId &&
          reference.financialBatchFingerprint === b.fingerprint &&
          reference.receiptCanonicalFingerprint === digest(r.receipt) &&
          reference.transferCommandId === t.commandId &&
          reference.transferFingerprint === t.fingerprint &&
          reference.shipmentId === source.shipmentId,
        'DELIVERY_ALLOCATION_CANONICAL_LINK_MISMATCH',
      );
    }
    const lot = lots.get(a.contributionLotRef);
    if (lot) {
      requireIntegrity(
        same(
          semantic(lot, 'allocationFingerprint'),
          semantic(a, 'allocationFingerprint'),
        ),
        'CONTRIBUTION_LOT_REUSED_OR_CHANGED',
      );
      continue;
    }
    lots.set(a.contributionLotRef, a);
    const quantity = Quantity.from(a.quantity.amount, a.quantity.unit);
    requireIntegrity(
      quantity.amount.isPositive() &&
        quantity.amount.lessThanOrEqualTo(source.quantity.amount),
      'ALLOCATION_QUANTITY_EXCEEDS_CANONICAL_CREDIT',
    );
    const total = (
      sourceTotals.get(key) ?? Quantity.from('0', quantity.unit)
    ).add(quantity);
    requireIntegrity(
      total.amount.lessThanOrEqualTo(source.quantity.amount),
      'AGGREGATE_ALLOCATION_EXCEEDS_CANONICAL_CREDIT',
    );
    sourceTotals.set(key, total);
    covered.add(key);
  }
  // Verify known correction references before declaring their positive semantics
  // unsupported. No refund/return quantity or cash is fabricated here.
  const adjustmentsSeen = new Set<string>();
  const reversalTotals = new Map<string, Quantity>();
  for (const ref of adjustments.sourceRefs) {
    requireIntegrity(
      !adjustmentsSeen.has(ref.adjustmentEventId),
      'DUPLICATE_CORRECTION_REFERENCE',
    );
    adjustmentsSeen.add(ref.adjustmentEventId);
    const lot = lots.get(ref.originalContributionLotRef);
    const r = records.find((r) =>
      r.transition.eventIds.some((id) => id === ref.adjustmentEventId),
    );
    requireIntegrity(
      lot && r && digest(r.receipt) === ref.receiptCanonicalFingerprint,
      'CORRECTION_ORIGINAL_RECEIPT_LINK_INVALID',
    );
    const p = r.inventoryPostings.find(
      (p) => p.postingId === ref.inventoryPostingId,
    );
    requireIntegrity(p && 'operation' in p, 'CORRECTION_POSTING_LINK_INVALID');
    if (ref.financialBatchId !== null)
      requireIntegrity(
        r.financialPostingBatches.some(
          (b) => b.batchId === ref.financialBatchId,
        ),
        'CORRECTION_FINANCIAL_LINK_INVALID',
      );
    const negative = p.entries.filter(
      (e) =>
        e.account.countryId === selection.countryId &&
        e.delta.amount.isNegative(),
    );
    const originalKey =
      lot.source.kind === 'OPENING'
        ? `OPENING:${lot.source.openingEntryId}`
        : `DELIVERY:${lot.source.inventoryPostingId}`;
    const original = sources.get(originalKey)!;
    requireIntegrity(negative.length > 0, 'CORRECTION_CREDIT_DEBIT_ABSENT');
    for (const e of negative) {
      requireIntegrity(
        same(e.account, original.creditedAccount) &&
          e.delta.unit === lot.quantity.unit,
        'CORRECTION_CANONICAL_CREDIT_ACCOUNT_MISMATCH',
      );
      const magnitude = Quantity.from(
        e.delta.toCanonicalValue().amount.slice(1),
        e.delta.unit,
      );
      const reversed = (
        reversalTotals.get(lot.contributionLotRef) ??
        Quantity.from('0', lot.quantity.unit)
      ).add(magnitude);
      requireIntegrity(
        reversed.amount.lessThanOrEqualTo(
          Quantity.from(lot.quantity.amount, lot.quantity.unit).amount,
        ),
        'CORRECTION_OVER_REVERSES_ORIGINAL_CREDIT',
      );
      reversalTotals.set(lot.contributionLotRef, reversed);
    }
  }
  requireIntegrity(
    adjustments.semantics !== 'NO_ADJUSTMENTS_IN_COMPLETE_PREFIX' ||
      adjustments.sourceRefs.length === 0,
    'NO_ADJUSTMENT_CONTRACT_CONTRADICTION',
  );
  if (adjustments.semantics === 'UNSUPPORTED_OR_UNKNOWN')
    return unavailable('ADJUSTMENT_CONTRACT_UNSUPPORTED', fingerprint);
  if (
    records.some((r) =>
      r.transition.events.some((e) => e.correctsEventId !== null),
    )
  )
    return unavailable('CORRECTION_CONTRACT_UNSUPPORTED', fingerprint);
  if (
    openingSlice.completeness === 'UNKNOWN' ||
    deliverySlice.completeness === 'UNKNOWN' ||
    eligibility.completeness === 'UNKNOWN'
  )
    return unavailable(
      'ALLOCATION_OR_ELIGIBILITY_COMPLETENESS_UNKNOWN',
      fingerprint,
    );
  if ([...sources.keys()].some((key) => !covered.has(key)))
    return unavailable('CANONICAL_CANDIDATE_ALLOCATION_ABSENT', fingerprint);
  if (rule.target === null)
    return unavailable('TARGET_SOURCE_UNAVAILABLE', fingerprint);
  const target = Quantity.from(rule.target.amount, rule.target.unit);
  requireIntegrity(
    target.unit === 'tonne' && !target.amount.isNegative(),
    'TARGET_UNIT_OR_QUANTITY_INVALID',
  );
  let eligibleQuantity = Quantity.from('0', target.unit);
  const contributingLotRefs: string[] = [],
    sourceEventRefs = new Set<string>(),
    costs = new Map<string, { amount: string; currency: 'GCU' }>();
  for (const a of [...lots.values()].sort((a, b) =>
    order(a.contributionLotRef, b.contributionLotRef),
  )) {
    const quantity = Quantity.from(a.quantity.amount, a.quantity.unit);
    requireIntegrity(
      quantity.unit === target.unit,
      'CONTRIBUTION_TARGET_UNIT_MISMATCH',
    );
    if (a.source.kind === 'DELIVERY') {
      const w = witnesses.get(a.source.commandId);
      if (!w || w.committedEligibility === 'UNKNOWN')
        return unavailable(
          'ACTUAL_COMMITTED_ELIGIBILITY_UNAVAILABLE',
          fingerprint,
        );
      if (w.committedEligibility !== 'COMMITTED_WITHIN_WINDOW') continue;
      if (a.disposition === 'ALLOCATED') {
        const source = sources.get(`DELIVERY:${a.source.inventoryPostingId}`)!;
        const amount = source
          .batch!.legs.find((l) => l.direction === 'DEBIT')!
          .amount.toCanonicalValue();
        requireIntegrity(
          amount.currency === 'GCU',
          'HISTORICAL_SETTLEMENT_CURRENCY_INVALID',
        );
        costs.set(source.batch!.batchId, {
          amount: amount.amount,
          currency: 'GCU',
        });
        sourceEventRefs.add(a.source.eventId);
      }
    }
    if (a.disposition === 'EXCLUDED_BY_SOURCE') continue;
    eligibleQuantity = eligibleQuantity.add(quantity);
    contributingLotRefs.push(a.contributionLotRef);
  }
  const residual = target.subtract(eligibleQuantity);
  const gap = residual.amount.isNegative()
    ? Quantity.from('0', target.unit)
    : residual;
  return resultEnvelope(fingerprint, {
    kind: 'TEST_ONLY_DELIVERED_INPUT_RESULT',
    metricMode: 'DELIVERED_INPUT',
    commodityId: 'GRAIN',
    eligible: eligibleQuantity.toCanonicalValue(),
    target: target.toCanonicalValue(),
    gap: gap.toCanonicalValue(),
    historicalSettledCosts: [...costs.entries()]
      .sort(([a], [b]) => order(a, b))
      .map(([, cost]) => cost),
    contributingLotRefs,
    sourceEventRefs: [...sourceEventRefs].sort(order),
    formalClock: null,
    formalClockStatus: 'UNBOUND',
  });
}
