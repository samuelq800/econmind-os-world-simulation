import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  DomainError,
  DOMAIN_ERROR_CODES,
} from '@econmind/core';
import {
  readIsolatedCommittedDeliveryFeedbackForTestOnly,
  requireIsolatedForeignTestRuntime,
  type IsolatedForeignReader,
  type IsolatedForeignSourceHandle,
} from './committed-delivery-feedback-source.js';

const RULE = {
  schemaVersion: 'foreign-delivery-display-rule-v2',
  modelRef: 'FOREIGN_DELIVERY_FACT_RESPONSE',
  version: '2',
  ruleId: 'FOREIGN_BILATERAL_DELIVERY_ACK_V2',
  policyRef: 'BILATERAL_TRADE_DELIVERY_MINIMAL_V2',
  policyVersion: '2',
  origin: 'GOVERNMENT_SIMULATION',
  actorKind: 'SYSTEM_SIMULATED',
  semantics: 'LAST_VERIFIED_BILATERAL_DELIVERY_NOT_CURRENT_POSITION',
  sourceEventType: 'NARROW_TREASURY_GCU_DELIVERED_V1',
  receiptOutcome: 'COMMITTED',
  scope: 'ORIGINAL_BUYER_OR_SELLER_TRADE_OFFICE_PRIVATE',
  readPredicate:
    'CURRENT_AUTHENTICATED_SUBJECT_ACTIVE_WORLD_OWN_TRADE_SEAT_REVISION_UNREVOKED_EXACT_OFFICE_PRIVATE_ENTITLEMENT_SAME_SNAPSHOT_RLS_BILATERAL_RECIPIENT',
  commandCapabilityRequiredForThisAckRead: false,
  opaqueSourceRefDomain: 'FOREIGN_ACK_SOURCE_REF_V2',
  rawCauseReferences: 'SERVER_ONLY',
  buyerText:
    '外方回应 · 系统模拟：已核验来自交易对方的最近一次跨国交付与结算。此提示不是对方玩家发言，也不表示新的合作承诺。',
  sellerText:
    '外方回应 · 系统模拟：已核验发往交易对方的最近一次跨国交付与结算。此提示不是对方玩家发言，也不表示新的合作承诺。',
  forbidden: [
    'RAW_COMMAND_EVENT_RECEIPT_POSTING_REFS',
    'PLAYER_IDENTITY',
    'PLAYER_MESSAGE',
    'CONSENT_OR_SIGNATURE',
    'AMOUNT_PRICE_QUANTITY_COMMODITY',
    'PRIVATE_INVENTORY_ACCOUNT_ROUTE',
    'MACRO_BUFF_OR_RELATIONSHIP_SCORE',
    'PUBLIC_BROADCAST',
    'CALLER_ADMITTED_MARKER',
  ],
  itemsPerScope: '1_LATEST_REGISTERED_COMPLETION',
  newItemTrigger: 'NEW_VALID_COMPLETION_TUPLE_ONLY_NOT_EACH_READ',
  correctedOrRevoked:
    'UNAVAILABLE_OR_ORIGINAL_INTEGRITY_ERROR_NO_OLDER_FALLBACK',
} as const;
const RULE_HASH =
  'sha256:0e7d16fb443ac9ef2030a8f7fcabc25e8e2b7fe741fe39b0d61c0f4deeab272c';
function hash(value: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
freeze(RULE);
function invalid(): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Foreign feedback model validation failed',
  );
}
const MODEL = freeze({
  modelRef: RULE.modelRef,
  version: RULE.version,
  rulesHash: RULE_HASH,
  ruleId: RULE.ruleId,
  policyRef: RULE.policyRef,
  policyVersion: RULE.policyVersion,
});
interface ProjectionInput {
  readonly handle: IsolatedForeignSourceHandle;
  readonly reader: IsolatedForeignReader;
}
function project(input: ProjectionInput) {
  requireIsolatedForeignTestRuntime();
  canonicalSerialize(input);
  const keys = Reflect.ownKeys(input);
  if (keys.length !== 2 || !keys.includes('handle') || !keys.includes('reader'))
    invalid();
  const source = readIsolatedCommittedDeliveryFeedbackForTestOnly(
    input.handle,
    input.reader,
  );
  const snapshot = {
    schemaVersion: 'unit-test-only-foreign-feedback-v2' as const,
    admission: 'ISOLATED_TEST_ONLY_NOT_ADMITTED' as const,
    classification: 'OFFICE_PRIVATE' as const,
    scopeKey: source.scopeKey,
    countryId: source.recipientCountryId,
    officeId: 'TRADE' as const,
    sourceHead: { ...source.sourceHead },
  };
  if (source.status === 'UNAVAILABLE')
    return freeze({
      ...snapshot,
      government: {
        status: 'UNAVAILABLE' as const,
        reason: source.reason,
        items: [],
      },
    });
  const sourceRef = hash(
    canonicalSerialize([
      RULE.opaqueSourceRefDomain,
      source.sourceHead.worldId,
      RULE.policyVersion,
      source.scopeKey,
      source.deliveryEventId,
      source.deliveryEventFingerprint,
    ]),
  );
  const item = {
    feedbackId: hash(
      canonicalSerialize([
        'FOREIGN_FEEDBACK_ID_V2',
        source.sourceHead.worldId,
        sourceRef,
        RULE.modelRef,
        RULE.version,
        RULE.ruleId,
        RULE.policyRef,
        RULE.policyVersion,
        RULE.origin,
        'OFFICE_PRIVATE',
        source.scopeKey,
      ]),
    ),
    sourceRef,
    origin: RULE.origin,
    actorKind: RULE.actorKind,
    semantics: RULE.semantics,
    recipientSide: source.recipientSide,
    recipientCountryId: source.recipientCountryId,
    counterpartyCountryId: source.counterpartyCountryId,
    model: MODEL,
    text: source.recipientSide === 'BUYER' ? RULE.buyerText : RULE.sellerText,
  };
  return freeze({
    ...snapshot,
    government: { status: 'CURRENT' as const, items: [item] },
  });
}

/** Always closed: no caller object/environment can adopt a formal model/source. */
export function projectForeignDeliveryFeedback(_input?: unknown) {
  void _input;
  return freeze({
    status: 'UNAVAILABLE' as const,
    reason: 'MODEL_NOT_ADMITTED' as const,
    items: [],
  });
}
/** Direct isolated import only; never exported by an index or mounted by a host. */
export function createIsolatedForeignDeliveryFeedbackProjectorForTestOnly(
  ...unexpected: never[]
) {
  requireIsolatedForeignTestRuntime();
  if (unexpected.length || hash(canonicalSerialize(RULE)) !== RULE_HASH)
    invalid();
  return Object.freeze({
    admission: 'ISOLATED_TEST_ONLY_NOT_ADMITTED' as const,
    model: MODEL,
    project,
    validateWireItem(value: unknown, input: ProjectionInput): boolean {
      requireIsolatedForeignTestRuntime();
      const expected = project(input).government.items[0];
      if (!expected || value === null || typeof value !== 'object')
        return false;
      try {
        const keys = Reflect.ownKeys(value);
        const allowed = Object.keys(expected);
        if (
          keys.length !== allowed.length ||
          allowed.some((key) => !keys.includes(key))
        )
          return false;
        // Exact content equality also checks nested own keys, canonical SHA256,
        // V2 version/hash, opaque refs, party scope and the fixed caption.
        return canonicalSerialize(value) === canonicalSerialize(expected);
      } catch {
        return false;
      }
    },
  });
}
