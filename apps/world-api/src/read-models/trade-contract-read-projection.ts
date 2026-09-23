/**
 * V21.3/V22 read integration preparation only.
 *
 * This module is a local, typed adapter contract. It is not a route, a
 * persistence implementation, or an authoritative source. In particular,
 * Foundation candidates are deliberately absent from its inputs: only a
 * durable final receipt and ledger facts may supply a visible numeric result.
 */
export const TRADE_CONTRACT_READ_PROJECTION_STATUS =
  'PREPARATION_ONLY' as const;

const REFERENCE = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
const CANONICAL_DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u;
const WORLD_VERSION = /^(?:0|[1-9]\d*)$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const MAX_DECIMAL_DIGITS = 120;

export interface ExactMoneyValue {
  readonly amount: string;
  readonly currency: string;
}

export interface ExactQuantityValue {
  readonly amount: string;
  readonly unit: string;
}

/** A signed ledger transition; values are serialized exactly, never as JS numbers. */
export type ExactNumericChange =
  | {
      readonly kind: 'MONEY';
      readonly before: ExactMoneyValue;
      readonly delta: ExactMoneyValue;
      readonly after: ExactMoneyValue;
    }
  | {
      readonly kind: 'QUANTITY';
      readonly before: ExactQuantityValue;
      readonly delta: ExactQuantityValue;
      readonly after: ExactQuantityValue;
    };

/**
 * Minimal immutable final-receipt evidence required before a derived result
 * may be exposed. It intentionally mirrors only the API boundary needs, not
 * a database schema or a Core candidate shape.
 */
export interface FinalCommittedReceiptEvidence {
  readonly receiptRef: string;
  readonly commandRef: string;
  readonly worldRef: string;
  readonly outcome: 'COMMITTED';
  readonly worldVersionBefore: string;
  readonly worldVersionAfter: string;
  readonly orderedEventRefs: readonly string[];
}

export type TradeContractResultDomain =
  'V21_TRADE_LOGISTICS' | 'V22_CONTRACT_RESULT';

/**
 * A caller supplies this only from a durable ledger/posting read. `sourceFactRef`
 * is retained for provenance; a Foundation result alone is never a ledger fact.
 */
export interface TradeContractLedgerChangeFact {
  readonly changeRef: string;
  readonly domain: TradeContractResultDomain;
  readonly worldRef: string;
  readonly receiptRef: string;
  readonly eventRef: string;
  readonly ledgerPostingRef: string;
  readonly sourceFactRef: string;
  readonly subjectRef: string;
  /** Domain-owned, versioned metric identifier; this adapter assigns no economics. */
  readonly metricRef: string;
  readonly numericChange: ExactNumericChange;
}

export interface TradeContractReadProjectionInput {
  readonly finalReceipt: FinalCommittedReceiptEvidence | null;
  /** Null or empty means the evidence boundary is not yet connected. */
  readonly ledgerChanges: readonly TradeContractLedgerChangeFact[] | null;
}

export interface TradeContractProjectionWatermark {
  readonly worldRef: string;
  readonly receiptRef: string;
  readonly worldVersionBefore: string;
  readonly worldVersionAfter: string;
}

export interface TradeContractProjectionRow {
  readonly changeRef: string;
  readonly domain: TradeContractResultDomain;
  readonly sourceFactRef: string;
  readonly receiptRef: string;
  readonly eventRef: string;
  readonly ledgerPostingRef: string;
  readonly subjectRef: string;
  readonly metricRef: string;
  readonly numericChange: ExactNumericChange;
}

export interface EvidenceUnavailableProjection {
  readonly status: typeof TRADE_CONTRACT_READ_PROJECTION_STATUS;
  readonly kind: 'EVIDENCE_UNAVAILABLE';
  readonly reason: 'MISSING_FINAL_RECEIPT' | 'MISSING_LEDGER_FACTS';
  readonly watermark: null;
  readonly rows: readonly [];
}

export interface EvidenceBackedProjection {
  readonly status: typeof TRADE_CONTRACT_READ_PROJECTION_STATUS;
  readonly kind: 'EVIDENCE_BACKED';
  readonly watermark: TradeContractProjectionWatermark;
  readonly rows: readonly TradeContractProjectionRow[];
}

export type TradeContractReadProjection =
  EvidenceUnavailableProjection | EvidenceBackedProjection;

export interface TradeContractReadQuery {
  readonly worldRef: string;
  readonly receiptRef?: string;
  readonly domain?: TradeContractResultDomain;
  readonly subjectRef?: string;
}

interface ParsedDecimal {
  readonly coefficient: bigint;
  readonly scale: number;
}

function fail(message: string): never {
  throw new Error(`Trade/contract read projection: ${message}`);
}

function assertReference(value: string, label: string): void {
  if (!REFERENCE.test(value)) fail(`${label} must be a stable reference`);
}

function assertWorldVersion(value: string, label: string): void {
  if (!WORLD_VERSION.test(value)) {
    fail(`${label} must be a canonical non-negative WorldVersion`);
  }
}

function parseDecimal(value: string, label: string): ParsedDecimal {
  if (
    !CANONICAL_DECIMAL.test(value) ||
    value.replace(/[-.]/gu, '').length > MAX_DECIMAL_DIGITS
  ) {
    fail(`${label} must be an exact canonical decimal`);
  }
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [integer, fraction = ''] = unsigned.split('.');
  const coefficient = BigInt(`${negative ? '-' : ''}${integer}${fraction}`);
  return { coefficient, scale: fraction.length };
}

function assertExactTransition(
  before: string,
  delta: string,
  after: string,
  label: string,
): void {
  const values = [
    parseDecimal(before, `${label}.before`),
    parseDecimal(delta, `${label}.delta`),
    parseDecimal(after, `${label}.after`),
  ] as const;
  const scale = Math.max(...values.map((value) => value.scale));
  const coefficientAtScale = (value: ParsedDecimal): bigint =>
    value.coefficient * 10n ** BigInt(scale - value.scale);
  if (
    coefficientAtScale(values[0]) + coefficientAtScale(values[1]) !==
    coefficientAtScale(values[2])
  ) {
    fail(`${label} must satisfy exact before + delta = after`);
  }
}

function assertNumericChange(value: ExactNumericChange, label: string): void {
  if (value.kind === 'MONEY') {
    const currencies = [
      value.before.currency,
      value.delta.currency,
      value.after.currency,
    ];
    if (!currencies.every((currency) => CURRENCY.test(currency))) {
      fail(`${label} money currency must be canonical`);
    }
    if (new Set(currencies).size !== 1) {
      fail(`${label} money currencies must match`);
    }
    assertExactTransition(
      value.before.amount,
      value.delta.amount,
      value.after.amount,
      label,
    );
    return;
  }
  const units = [value.before.unit, value.delta.unit, value.after.unit];
  if (units.some((unit) => unit.length === 0)) {
    fail(`${label} quantity unit must be non-empty`);
  }
  if (new Set(units).size !== 1) {
    fail(`${label} quantity units must match`);
  }
  assertExactTransition(
    value.before.amount,
    value.delta.amount,
    value.after.amount,
    label,
  );
}

function unavailable(
  reason: EvidenceUnavailableProjection['reason'],
): EvidenceUnavailableProjection {
  return Object.freeze({
    status: TRADE_CONTRACT_READ_PROJECTION_STATUS,
    kind: 'EVIDENCE_UNAVAILABLE',
    reason,
    watermark: null,
    rows: Object.freeze([]) as readonly [],
  });
}

/**
 * Builds a derived projection from final authoritative evidence only. Invalid
 * non-null evidence is rejected; absent evidence produces no numeric result.
 */
export function buildTradeContractReadProjection(
  input: TradeContractReadProjectionInput,
): TradeContractReadProjection {
  if (input.finalReceipt === null) return unavailable('MISSING_FINAL_RECEIPT');
  if (input.ledgerChanges === null || input.ledgerChanges.length === 0) {
    return unavailable('MISSING_LEDGER_FACTS');
  }

  const receipt = input.finalReceipt;
  assertReference(receipt.receiptRef, 'receiptRef');
  assertReference(receipt.commandRef, 'commandRef');
  assertReference(receipt.worldRef, 'worldRef');
  if (receipt.outcome !== 'COMMITTED') {
    fail('only a COMMITTED final receipt can expose numeric results');
  }
  assertWorldVersion(receipt.worldVersionBefore, 'worldVersionBefore');
  assertWorldVersion(receipt.worldVersionAfter, 'worldVersionAfter');
  if (
    BigInt(receipt.worldVersionAfter) !==
    BigInt(receipt.worldVersionBefore) + 1n
  ) {
    fail('a committed receipt must advance WorldVersion exactly once');
  }
  if (receipt.orderedEventRefs.length === 0) {
    fail('a committed receipt must contain at least one event reference');
  }
  const eventRefs = new Set<string>();
  for (const eventRef of receipt.orderedEventRefs) {
    assertReference(eventRef, 'orderedEventRef');
    if (eventRefs.has(eventRef)) {
      fail('a committed receipt cannot repeat an event reference');
    }
    eventRefs.add(eventRef);
  }

  const changeRefs = new Set<string>();
  const postingRefs = new Set<string>();
  const rows = input.ledgerChanges.map((change) => {
    if (
      change.domain !== 'V21_TRADE_LOGISTICS' &&
      change.domain !== 'V22_CONTRACT_RESULT'
    ) {
      fail('ledger change domain must be V21 trade/logistics or V22 contract');
    }
    assertReference(change.changeRef, 'changeRef');
    assertReference(change.worldRef, 'change.worldRef');
    assertReference(change.receiptRef, 'change.receiptRef');
    assertReference(change.eventRef, 'change.eventRef');
    assertReference(change.ledgerPostingRef, 'change.ledgerPostingRef');
    assertReference(change.sourceFactRef, 'change.sourceFactRef');
    assertReference(change.subjectRef, 'change.subjectRef');
    assertReference(change.metricRef, 'change.metricRef');
    if (change.worldRef !== receipt.worldRef) {
      fail('ledger change World must match its final receipt');
    }
    if (change.receiptRef !== receipt.receiptRef) {
      fail('ledger change receipt must match its final receipt');
    }
    if (!eventRefs.has(change.eventRef)) {
      fail('ledger change event must be listed by its final receipt');
    }
    if (changeRefs.has(change.changeRef)) {
      fail('ledger change references must be unique');
    }
    if (postingRefs.has(change.ledgerPostingRef)) {
      fail('ledger posting references must be unique');
    }
    changeRefs.add(change.changeRef);
    postingRefs.add(change.ledgerPostingRef);
    assertNumericChange(change.numericChange, `change ${change.changeRef}`);
    return Object.freeze({
      changeRef: change.changeRef,
      domain: change.domain,
      sourceFactRef: change.sourceFactRef,
      receiptRef: change.receiptRef,
      eventRef: change.eventRef,
      ledgerPostingRef: change.ledgerPostingRef,
      subjectRef: change.subjectRef,
      metricRef: change.metricRef,
      numericChange: change.numericChange,
    });
  });

  return Object.freeze({
    status: TRADE_CONTRACT_READ_PROJECTION_STATUS,
    kind: 'EVIDENCE_BACKED',
    watermark: Object.freeze({
      worldRef: receipt.worldRef,
      receiptRef: receipt.receiptRef,
      worldVersionBefore: receipt.worldVersionBefore,
      worldVersionAfter: receipt.worldVersionAfter,
    }),
    rows: Object.freeze(rows),
  });
}

/** Pure typed query helper; authorization, persistence and transport remain future owners. */
export function queryTradeContractReadProjection(
  projection: TradeContractReadProjection,
  query: TradeContractReadQuery,
): readonly TradeContractProjectionRow[] {
  assertReference(query.worldRef, 'query.worldRef');
  if (query.receiptRef !== undefined) {
    assertReference(query.receiptRef, 'query.receiptRef');
  }
  if (query.subjectRef !== undefined) {
    assertReference(query.subjectRef, 'query.subjectRef');
  }
  if (
    projection.kind !== 'EVIDENCE_BACKED' ||
    projection.watermark.worldRef !== query.worldRef ||
    (query.receiptRef !== undefined &&
      projection.watermark.receiptRef !== query.receiptRef)
  ) {
    return Object.freeze([]);
  }
  return Object.freeze(
    projection.rows.filter(
      (row) =>
        (query.domain === undefined || row.domain === query.domain) &&
        (query.subjectRef === undefined || row.subjectRef === query.subjectRef),
    ),
  );
}
