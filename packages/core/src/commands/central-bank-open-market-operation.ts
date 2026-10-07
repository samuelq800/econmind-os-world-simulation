// NON_ACTIVATED / PARALLEL_PREPARATION. No persistence or source acquisition.
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  calculateOpenMarketOperation,
  type CommercialBankLedgerSnapshot,
  type CentralBankLedgerSnapshot,
} from '../engine-kernels/bank-central-foundation.js';
import {
  createFoundationFact,
  type FoundationTraceRequest,
} from '../engine-kernels/foundation-provenance.js';
import {
  FINANCIAL_POSTING_SCHEMA_VERSION,
  createFinancialPostingBatch,
  applyFinancialPostingBatch,
  type FinancialLedgerState,
  type FinancialAccount,
  type FinancialAccountClass,
} from '../finance/financial-ledger.js';
import {
  financialPostingBatchId,
  financialPostingLegId,
  type FinancialAccountId,
} from '../ids.js';
import { Money } from '../numeric/money.js';
import { SimTime } from '../numeric/sim-time.js';
import {
  parseWorldDecimal,
  canonicalDecimal,
  assertWorldDecimalResult,
} from '../numeric/world-decimal.js';
import { isAuthoritativeFinancialLedgerState } from '../opening/ledger-authority.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';
import {
  canonicalSha256,
  validateCanonicalCommand,
  type CanonicalCommand,
  type Sha256Hex,
} from './command.js';
import {
  EVENT_SCHEMA_VERSION,
  parseAuthoritativeEvent,
  type AuthoritativeEvent,
} from '../events/event.js';
import { createAuthoritativeTransition } from './receipt.js';

export const CENTRAL_BANK_OMO_COMMAND = 'CORE_CENTRAL_BANK_OMO_V1' as const;
export const CENTRAL_BANK_OMO_CAPABILITY =
  'CENTRAL_BANK_MONETARY_POLICY' as const;
export const CENTRAL_BANK_OMO_EVENT = 'CENTRAL_BANK_OMO_SETTLED_V1' as const;

export interface CentralBankOmoIntent {
  readonly schemaVersion: 'central-bank-omo-intent-v1';
  readonly direction:
    'BUY_GOVERNMENT_SECURITIES' | 'SELL_GOVERNMENT_SECURITIES';
  readonly securityRef: string;
  readonly batchRef: string;
  readonly faceValue: { readonly amount: string; readonly currency: string };
  readonly settlementSimTime: string;
  readonly policyNote: string | null;
}

/** Server-owned instrument register: never an R/A aggregate or inventory unit. */
export interface OmoSecurityHolding {
  readonly securityRef: string;
  readonly batchRef: string;
  readonly issuerRef: string;
  readonly holderRef: string;
  readonly currency: string;
  readonly maturitySimTime: string;
  readonly faceValue: string;
  readonly encumberedFaceValue: string;
  readonly carryingValue: string;
}

export interface CentralBankOmoSourceFacts {
  readonly worldId: string;
  readonly countryId: string;
  readonly worldVersion: string;
  readonly currentSimTime: string;
  readonly currentEventSequence: string;
  readonly domesticTreasuryRef: string;
  readonly bank: CommercialBankLedgerSnapshot;
  readonly centralBank: CentralBankLedgerSnapshot;
  /** Every monetary field, including explicit zero accounts, must be present. */
  readonly bankAccounts: Readonly<Record<string, FinancialAccountId>>;
  readonly centralBankAccounts: Readonly<Record<string, FinancialAccountId>>;
  readonly holdings: readonly OmoSecurityHolding[];
  readonly quote: {
    readonly quoteRef: string;
    readonly securityRef: string;
    readonly batchRef: string;
    readonly issuerRef: string;
    readonly currency: string;
    readonly pricePerFace: string;
    readonly validAtSimTime: string;
    readonly sourceRef: string;
    readonly worldVersion: string;
  };
}

export interface CentralBankOmoSource {
  readonly facts: CentralBankOmoSourceFacts;
  readonly trace: FoundationTraceRequest;
  /** Only canonical opening + global append-only lineage grants this authority. */
  readonly financialState: FinancialLedgerState;
}

const BANK_FIELDS: Readonly<Record<string, FinancialAccountClass>> =
  Object.freeze({
    reservesAtCentralBank: 'ASSET',
    settlementCash: 'CASH',
    loanAssets: 'ASSET',
    governmentSecurities: 'ASSET',
    otherAssets: 'ASSET',
    demandDeposits: 'LIABILITY',
    savingsDeposits: 'LIABILITY',
    timeDeposits: 'LIABILITY',
    wholesaleFunding: 'LIABILITY',
    centralBankRefinancingBorrowing: 'LIABILITY',
    centralBankEmergencyLiquidityBorrowing: 'LIABILITY',
    otherLiabilities: 'LIABILITY',
    equity: 'EQUITY',
  });
const CB_FIELDS: Readonly<Record<string, FinancialAccountClass>> =
  Object.freeze({
    governmentSecurities: 'ASSET',
    regularRefinancingLoans: 'ASSET',
    emergencyLiquidityLoans: 'ASSET',
    otherAssets: 'ASSET',
    currencyInCirculation: 'LIABILITY',
    commercialBankReserves: 'LIABILITY',
    treasuryDeposits: 'LIABILITY',
    centralBankBills: 'LIABILITY',
    otherLiabilities: 'LIABILITY',
    equity: 'EQUITY',
  });

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `CB-1: ${message}`,
  );
}
function ref(value: string): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(value)
  )
    invalid('missing/invalid source reference');
  return value;
}
function exact(value: string, positive = false) {
  const result = parseWorldDecimal(value);
  if (
    canonicalDecimal(result) !== value ||
    (positive ? !result.gt('0') : result.lt('0'))
  )
    invalid('noncanonical/nonpositive quantity');
  return result;
}
function keys(value: object, expected: readonly string[]) {
  if (Object.keys(value).sort().join('|') !== [...expected].sort().join('|'))
    invalid('missing or extra fields');
}
function immutable<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
function data<T>(value: T): T {
  return immutable(JSON.parse(canonicalSerialize(value)) as T);
}

export function parseCentralBankOmoIntent(
  command: CanonicalCommand,
  sha256Hex: Sha256Hex,
): CentralBankOmoIntent {
  validateCanonicalCommand(command, sha256Hex);
  if (
    command.commandType !== CENTRAL_BANK_OMO_COMMAND ||
    command.officeId !== 'CENTRAL_BANK' ||
    command.expectedWorldVersion === null ||
    command.idempotencyKey === null
  )
    invalid('requires versioned idempotent Central Bank command');
  const intent = JSON.parse(command.canonicalPayload) as CentralBankOmoIntent;
  if (intent === null || typeof intent !== 'object' || Array.isArray(intent))
    invalid('intent must be a record');
  keys(intent, [
    'schemaVersion',
    'direction',
    'securityRef',
    'batchRef',
    'faceValue',
    'settlementSimTime',
    ...(Object.hasOwn(intent, 'policyNote') ? ['policyNote'] : []),
  ]);
  if (
    intent.schemaVersion !== 'central-bank-omo-intent-v1' ||
    !['BUY_GOVERNMENT_SECURITIES', 'SELL_GOVERNMENT_SECURITIES'].includes(
      intent.direction,
    )
  )
    invalid('intent version/direction');
  ref(intent.securityRef);
  ref(intent.batchRef);
  if (intent.faceValue === null || typeof intent.faceValue !== 'object')
    invalid('face value missing');
  keys(intent.faceValue, ['amount', 'currency']);
  exact(intent.faceValue.amount, true);
  Money.from(intent.faceValue.amount, intent.faceValue.currency);
  if (
    typeof intent.settlementSimTime !== 'string' ||
    SimTime.fromTicks(intent.settlementSimTime).ticks !== command.simTime.ticks
  )
    invalid('only immediate command-time settlement supported');
  const policyNote = Object.hasOwn(intent, 'policyNote')
    ? intent.policyNote
    : null;
  if (
    policyNote !== null &&
    (typeof policyNote !== 'string' || policyNote.length > 1024)
  )
    invalid('invalid policy note');
  return immutable({ ...intent, policyNote });
}

/** Identity digest, not an attestation or a means to mint ledger authority. */
export function centralBankOmoSourceHash(
  facts: CentralBankOmoSourceFacts,
  sha256Hex: Sha256Hex,
): string {
  return canonicalSha256(canonicalHashInput(facts), sha256Hex).slice(7);
}

function reconcileSnapshot(input: {
  snapshot: CommercialBankLedgerSnapshot | CentralBankLedgerSnapshot;
  accounts: Readonly<Record<string, FinancialAccountId>>;
  fields: Readonly<Record<string, FinancialAccountClass>>;
  ownerRef: string;
  source: CentralBankOmoSource;
}): Readonly<Record<string, FinancialAccount>> {
  const { snapshot, accounts, fields, source, ownerRef } = input;
  keys(accounts, Object.keys(fields));
  const mapped = new Set<string>();
  const result: Record<string, FinancialAccount> = {};
  const snapshotRecord = snapshot as unknown as Record<
    string,
    { amount: string; currency: string }
  >;
  for (const [field, accountClass] of Object.entries(fields)) {
    const id = accounts[field];
    const account = source.financialState.accounts.find(
      (entry) => entry.accountId === id,
    );
    const value = snapshotRecord[field];
    if (
      account === undefined ||
      value === undefined ||
      mapped.has(account.accountId) ||
      account.ownerId !== ownerRef ||
      account.countryId !== source.facts.countryId ||
      account.worldId !== source.facts.worldId ||
      account.currency !== snapshot.currency ||
      account.accountClass !== accountClass ||
      value.currency !== account.currency
    )
      invalid('complete snapshot/account identity mismatch');
    keys(value, ['amount', 'currency']);
    const declared = Money.from(value.amount, value.currency);
    const posted =
      source.financialState.positions.find(
        (position) => position.account.accountId === id,
      )?.netDebitBalance ?? Money.from('0', account.currency);
    const signed =
      accountClass === 'LIABILITY' || accountClass === 'EQUITY'
        ? Money.from('0', account.currency).subtract(declared)
        : declared;
    if (!signed.amount.eq(posted.amount))
      invalid('snapshot differs from authoritative posted position');
    mapped.add(account.accountId);
    result[field] = account;
  }
  if (
    source.financialState.accounts.some(
      (account) =>
        account.ownerId === ownerRef && !mapped.has(account.accountId),
    )
  )
    invalid('unmapped BANK/CB account requires full valuation/register source');
  return Object.freeze(result);
}

function rights(input: {
  facts: CentralBankOmoSourceFacts;
  intent: CentralBankOmoIntent;
}) {
  const { facts, intent } = input;
  const bank = facts.bank.bankRef;
  const cb = facts.centralBank.centralBankRef;
  const quote = facts.quote;
  keys(quote, [
    'quoteRef',
    'securityRef',
    'batchRef',
    'issuerRef',
    'currency',
    'pricePerFace',
    'validAtSimTime',
    'sourceRef',
    'worldVersion',
  ]);
  ref(quote.quoteRef);
  ref(quote.sourceRef);
  ref(quote.issuerRef);
  ref(facts.domesticTreasuryRef);
  if (
    quote.issuerRef !== facts.domesticTreasuryRef ||
    facts.domesticTreasuryRef === bank ||
    facts.domesticTreasuryRef === cb
  )
    invalid('domestic government issuer required; secondary-market only');
  const price = exact(quote.pricePerFace, true);
  if (
    quote.securityRef !== intent.securityRef ||
    quote.batchRef !== intent.batchRef ||
    quote.currency !== intent.faceValue.currency ||
    quote.validAtSimTime !== facts.currentSimTime ||
    quote.worldVersion !== facts.worldVersion
  )
    invalid('quote is missing, stale or mismatched');
  const sums = new Map([
    [bank, parseWorldDecimal('0')],
    [cb, parseWorldDecimal('0')],
  ]);
  const identities = new Set<string>();
  for (const holding of facts.holdings) {
    keys(holding, [
      'securityRef',
      'batchRef',
      'issuerRef',
      'holderRef',
      'currency',
      'maturitySimTime',
      'faceValue',
      'encumberedFaceValue',
      'carryingValue',
    ]);
    ref(holding.securityRef);
    ref(holding.batchRef);
    ref(holding.issuerRef);
    ref(holding.holderRef);
    const identity = `${holding.batchRef}:${holding.holderRef}`;
    if (
      identities.has(identity) ||
      !sums.has(holding.holderRef) ||
      holding.currency !== quote.currency ||
      holding.issuerRef !== facts.domesticTreasuryRef
    )
      invalid('mixed/duplicate/foreign held batch');
    identities.add(identity);
    const face = exact(holding.faceValue);
    const encumbered = exact(holding.encumberedFaceValue);
    const carrying = exact(holding.carryingValue);
    SimTime.fromTicks(holding.maturitySimTime);
    if (encumbered.gt(face) || (face.isZero() && !carrying.isZero()))
      invalid('held/encumbered carrying mismatch');
    sums.set(
      holding.holderRef,
      assertWorldDecimalResult(sums.get(holding.holderRef)!.plus(carrying)),
    );
  }
  if (
    !sums.get(bank)!.eq(facts.bank.governmentSecurities.amount) ||
    !sums.get(cb)!.eq(facts.centralBank.governmentSecurities.amount)
  )
    invalid(
      'held register differs from government securities posted aggregate',
    );
  const heldBank = facts.holdings.find(
    (holding) =>
      holding.batchRef === intent.batchRef && holding.holderRef === bank,
  );
  const heldCb = facts.holdings.find(
    (holding) =>
      holding.batchRef === intent.batchRef && holding.holderRef === cb,
  );
  if (heldBank === undefined || heldCb === undefined)
    invalid(
      'real held batch for both owners (explicit zero permitted) required',
    );
  for (const holding of [heldBank, heldCb]) {
    if (
      holding.securityRef !== quote.securityRef ||
      holding.issuerRef !== quote.issuerRef ||
      SimTime.fromTicks(holding.maturitySimTime).ticks <=
        SimTime.fromTicks(facts.currentSimTime).ticks ||
      holding.maturitySimTime !== heldBank.maturitySimTime
    )
      invalid('instrument/issuer/maturity mismatch');
    if (
      !assertWorldDecimalResult(exact(holding.faceValue).mul(price)).eq(
        holding.carryingValue,
      )
    )
      invalid('SECURITY_VALUATION_REPOST_OR_PNL_REQUIRED');
  }
  const buying = intent.direction === 'BUY_GOVERNMENT_SECURITIES';
  const seller = buying ? heldBank : heldCb;
  const face = exact(intent.faceValue.amount, true);
  if (exact(seller.faceValue).minus(seller.encumberedFaceValue).lt(face))
    invalid('seller lacks actual unencumbered securities');
  const settlement = assertWorldDecimalResult(face.mul(price));
  const after = facts.holdings.map((holding) => {
    if (holding !== heldBank && holding !== heldCb) return holding;
    const delta = holding === seller ? face.negated() : face;
    const moneyDelta = holding === seller ? settlement.negated() : settlement;
    return {
      ...holding,
      faceValue: canonicalDecimal(
        assertWorldDecimalResult(exact(holding.faceValue).plus(delta)),
      ),
      carryingValue: canonicalDecimal(
        assertWorldDecimalResult(exact(holding.carryingValue).plus(moneyDelta)),
      ),
    };
  });
  return immutable({
    before: facts.holdings,
    after,
    settlementAmount: {
      amount: canonicalDecimal(settlement),
      currency: quote.currency,
    },
  });
}

/** Validates source evidence before the Worker invokes its draft factory. */
export function validateCentralBankOmoSource(input: {
  command: CanonicalCommand;
  source: CentralBankOmoSource;
  sha256Hex: Sha256Hex;
}) {
  const { command, source, sha256Hex } = input;
  const intent = parseCentralBankOmoIntent(command, sha256Hex);
  // Reject accessors/extra non-data at the server source boundary before reads.
  const facts = data(source.facts);
  const trace = data(source.trace);
  if (
    facts === null ||
    typeof facts !== 'object' ||
    facts.bank === null ||
    typeof facts.bank !== 'object' ||
    facts.centralBank === null ||
    typeof facts.centralBank !== 'object' ||
    facts.quote === null ||
    typeof facts.quote !== 'object' ||
    !Array.isArray(facts.holdings)
  )
    invalid('complete source records required');
  keys(facts, [
    'worldId',
    'countryId',
    'worldVersion',
    'currentSimTime',
    'currentEventSequence',
    'domesticTreasuryRef',
    'bank',
    'centralBank',
    'bankAccounts',
    'centralBankAccounts',
    'holdings',
    'quote',
  ]);
  if (
    typeof facts.currentEventSequence !== 'string' ||
    !/^(?:0|[1-9]\d*)$/u.test(facts.currentEventSequence)
  )
    invalid('current authoritative Event sequence missing');
  keys(facts.bank, [
    ...Object.keys(BANK_FIELDS),
    'bankRef',
    'centralBankRef',
    'currency',
    'nonPerformingLoans',
  ]);
  keys(facts.centralBank, [
    ...Object.keys(CB_FIELDS),
    'centralBankRef',
    'commercialBankRef',
    'currency',
  ]);
  if (
    !isAuthoritativeFinancialLedgerState(source.financialState) ||
    facts.worldId !== command.worldId ||
    facts.countryId !== command.countryId ||
    facts.worldVersion !== command.expectedWorldVersion ||
    source.financialState.worldId !== command.worldId ||
    source.financialState.worldVersion !== facts.worldVersion ||
    facts.currentSimTime !== intent.settlementSimTime ||
    facts.bank.currency !== facts.centralBank.currency ||
    facts.bank.currency !== intent.faceValue.currency ||
    facts.bank.currency === 'GCU' ||
    facts.bank.bankRef === facts.centralBank.centralBankRef
  )
    invalid('same current World/version/LC/full-ledger source required');
  if (
    trace.snapshot.sourceVersion !== `WORLD_VERSION.${facts.worldVersion}` ||
    trace.snapshot.snapshotHash !==
      centralBankOmoSourceHash(facts, sha256Hex) ||
    trace.snapshotAt.amount !== facts.currentSimTime ||
    trace.snapshotAt.unit !== 'sim_millisecond'
  )
    invalid('source lineage/hash/time mismatch');
  const stableSource = { facts, trace, financialState: source.financialState };
  const bankAccounts = reconcileSnapshot({
    snapshot: facts.bank,
    accounts: facts.bankAccounts,
    fields: BANK_FIELDS,
    ownerRef: facts.bank.bankRef,
    source: stableSource,
  });
  const cbAccounts = reconcileSnapshot({
    snapshot: facts.centralBank,
    accounts: facts.centralBankAccounts,
    fields: CB_FIELDS,
    ownerRef: facts.centralBank.centralBankRef,
    source: stableSource,
  });
  const reserveAsset = bankAccounts.reservesAtCentralBank!;
  const reserveLiability = cbAccounts.commercialBankReserves!;
  if (
    reserveAsset.claimId === null ||
    reserveAsset.claimId !== reserveLiability.claimId ||
    reserveAsset.counterpartyEntityId !== reserveLiability.ownerId ||
    reserveLiability.counterpartyEntityId !== reserveAsset.ownerId
  )
    invalid('R reserve asset/liability must be the same actual mirrored claim');
  const transfer = rights({ facts, intent });
  const fact = <T>(kind: string, payload: T) =>
    createFoundationFact({
      trace,
      factRef: `CB1.${kind}`,
      sourceRef: trace.snapshot.snapshotRef,
      predecessorFactRefs: [trace.snapshot.lineageRef],
      payload,
    });
  const kernel = calculateOpenMarketOperation({
    trace,
    commercialBankFact: fact('Bank', facts.bank),
    centralBankFact: fact('CentralBank', facts.centralBank),
    operationFact: fact('Operation', {
      bankRef: facts.bank.bankRef,
      centralBankRef: facts.centralBank.centralBankRef,
      operationRef: command.commandId,
      securityRef: intent.securityRef,
      direction: intent.direction,
      settlementAmount: transfer.settlementAmount,
    }),
    outputRef: 'CB1.Output',
  });
  return Object.freeze({
    intent,
    facts,
    trace,
    bankAccounts,
    cbAccounts,
    transfer,
    kernel,
  });
}

export function prepareCentralBankOmoTransition(input: {
  readonly command: CanonicalCommand;
  readonly source: CentralBankOmoSource;
  readonly eventId: string;
  readonly eventSequence: string;
  readonly financialBatchId: string;
  readonly observedAtReal: string;
  readonly sha256Hex: Sha256Hex;
}) {
  const { command, source, sha256Hex } = input;
  const checked = validateCentralBankOmoSource(input);
  if (
    input.eventSequence !==
    (BigInt(checked.facts.currentEventSequence) + 1n).toString()
  )
    invalid('OMO Event must extend the current global sequence');
  const after = (BigInt(checked.facts.worldVersion) + 1n).toString();
  const payload = {
    schemaVersion: 'central-bank-omo-settlement-v1',
    commandFingerprint: command.fingerprint,
    intent: checked.intent,
    source: checked.facts,
    trace: checked.trace,
    rights: checked.transfer,
    kernelReplayHash: canonicalSha256(
      checked.kernel.replayProof.hashInput,
      sha256Hex,
    ),
  };
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: input.eventId,
      eventType: CENTRAL_BANK_OMO_EVENT,
      worldId: command.worldId,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: after,
      sequence: input.eventSequence,
      simTime: command.simTime.toCanonicalValue(),
      recordedAtReal: input.observedAtReal,
      correctsEventId: null,
      payload,
    },
    sha256Hex,
  );
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: checked.facts.worldVersion,
    worldVersionAfter: after,
    events: [event],
  });
  const buy = checked.intent.direction === 'BUY_GOVERNMENT_SECURITIES';
  const amount = Money.from(
    checked.transfer.settlementAmount.amount,
    checked.transfer.settlementAmount.currency,
  );
  const reserveAsset = checked.bankAccounts.reservesAtCentralBank!;
  const reserveLiability = checked.cbAccounts.commercialBankReserves!;
  const directions = [
    buy ? 'DEBIT' : 'CREDIT',
    buy ? 'CREDIT' : 'DEBIT',
    buy ? 'DEBIT' : 'CREDIT',
    buy ? 'CREDIT' : 'DEBIT',
  ] as const;
  const accounts = [
    checked.cbAccounts.governmentSecurities!,
    reserveLiability,
    reserveAsset,
    checked.bankAccounts.governmentSecurities!,
  ];
  const posting = createFinancialPostingBatch(
    {
      schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
      batchId: financialPostingBatchId(input.financialBatchId),
      worldId: command.worldId,
      causationCommandId: command.commandId,
      causationEventIds: transition.eventIds,
      worldVersionBefore: checked.facts.worldVersion,
      worldVersionAfter: after,
      simTime: command.simTime,
      command,
      transition,
      settlementCurrency: amount.currency,
      legs: accounts.map((account, index) => ({
        legId: financialPostingLegId(
          `${input.financialBatchId}_LEG_${index + 1}`,
        ),
        account,
        amount,
        direction: directions[index]!,
        counterpartyAccountId:
          index === 1
            ? reserveAsset.accountId
            : index === 2
              ? reserveLiability.accountId
              : null,
      })),
    },
    sha256Hex,
  );
  const financial = applyFinancialPostingBatch(source.financialState, posting);
  if (financial.receipt.outcome !== 'APPLIED')
    invalid('new draft cannot reuse applied posting');
  reconcileSnapshot({
    snapshot: checked.kernel.commercialBank,
    accounts: checked.facts.bankAccounts,
    fields: BANK_FIELDS,
    ownerRef: checked.facts.bank.bankRef,
    source: { ...source, financialState: financial.state },
  });
  reconcileSnapshot({
    snapshot: checked.kernel.centralBank,
    accounts: checked.facts.centralBankAccounts,
    fields: CB_FIELDS,
    ownerRef: checked.facts.centralBank.centralBankRef,
    source: { ...source, financialState: financial.state },
  });
  return Object.freeze({
    event,
    transition,
    posting,
    financial,
    holdingsAfter: checked.transfer.after,
  });
}

/** Root supplies the canonical global lineage; no SQL or second financial writer. */
export function replayCentralBankOmoRights(input: {
  readonly command: CanonicalCommand;
  readonly event: AuthoritativeEvent;
  readonly source: CentralBankOmoSource;
  readonly financialBatchId: string;
  readonly holdings: readonly OmoSecurityHolding[];
  readonly applied: readonly {
    readonly eventId: string;
    readonly fingerprint: string;
  }[];
  readonly sha256Hex: Sha256Hex;
}) {
  const canonical = prepareCentralBankOmoTransition({
    ...input,
    eventId: input.event.eventId,
    eventSequence: input.event.sequence,
    observedAtReal: input.event.recordedAtReal,
  });
  if (canonicalSerialize(canonical.event) !== canonicalSerialize(input.event))
    invalid(
      'rights replay does not match canonical command/source/kernel Event',
    );
  const prior = input.applied.find(
    (entry) => entry.eventId === input.event.eventId,
  );
  if (prior !== undefined) {
    if (prior.fingerprint !== input.event.fingerprint)
      invalid('conflicting securities Event retry');
    // Other transitions may have changed rights since this already-applied event.
    return Object.freeze({
      holdings: input.holdings,
      applied: input.applied,
      outcome: 'EXACT_DUPLICATE' as const,
    });
  }
  if (
    canonicalSerialize(input.holdings) !==
    canonicalSerialize(input.source.facts.holdings)
  )
    invalid('rights replay predecessor mismatch');
  return Object.freeze({
    holdings: canonical.holdingsAfter,
    applied: Object.freeze([
      ...input.applied,
      Object.freeze({
        eventId: input.event.eventId,
        fingerprint: input.event.fingerprint,
      }),
    ]),
    outcome: 'APPLIED' as const,
  });
}
