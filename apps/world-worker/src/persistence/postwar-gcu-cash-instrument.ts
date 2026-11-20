/** Server-only instrument classification from a genuine, lifetime-bound Core
 * lineage and its exact source contract. No FX, cash creation, reserve approval
 * or Trade payment is performed. Account class remains ASSET. */
import { createHash } from 'node:crypto';
import { canonicalSerialize, Money } from '@econmind/core';
import { validatePostwarFinancialOfficeOriginalDocument } from '../preparation/postwar-financial-office-originals.js';
import type { PostwarGenesisSourceDocument } from '../preparation/postwar-operating-genesis-adoption.js';
import type { SqlExecutor } from './sql-database.js';
import {
  readValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from './validated-canonical-lineage.js';

declare const instrument: unique symbol;
export interface PostwarGcuCashInstrumentEvidence {
  readonly [instrument]: true;
}
export interface PostwarGcuCashInstrumentFacts {
  readonly classification: 'SOURCE_DECLARED_GCU_CASH_INSTRUMENT_NOT_PAYMENT_AUTHORITY';
  readonly worldId: string;
  readonly countryId: string;
  readonly ownerId: string;
  readonly accountId: string;
  readonly accountClass: 'ASSET';
  readonly currency: 'GCU';
  readonly holdingId: string;
  readonly openingAmount: string;
  readonly ledgerBalance: string;
  readonly declaredUsableStatus: string;
  readonly seedFingerprint: string;
  readonly sourceId: string;
  readonly sourcePayloadHash: string;
  readonly contractFingerprint: string;
  readonly originalsSha256: string;
  readonly headWorldVersion: string;
  readonly headEventSequence: string;
}
const issued = new WeakMap<
  PostwarGcuCashInstrumentEvidence,
  {
    executor: SqlExecutor;
    view: ValidatedCanonicalLineageView;
    facts: PostwarGcuCashInstrumentFacts;
  }
>();
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
function invalid(reason: string): never {
  throw Error('POSTWAR_GCU_CASH_INSTRUMENT:' + reason);
}
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('SOURCE_RECORD_REQUIRED');
  return v as Record<string, unknown>;
}
/** A quote, arbitrary ASSET, claim or caller-supplied native/ready flag cannot
 * reach this issuer. Missing source holdings remain typed missing. */
export function classifyPostwarGcuCashInstrumentFrom(
  executor: SqlExecutor,
  view: ValidatedCanonicalLineageView,
  input: Readonly<{
    countryId: string;
    holdingId: string;
    originalsDocument: PostwarGenesisSourceDocument;
  }>,
):
  | Readonly<{ status: 'MISSING'; reason: 'NO_DECLARED_GCU_CASH_INSTRUMENT' }>
  | Readonly<{
      status: 'CLASSIFIED';
      evidence: PostwarGcuCashInstrumentEvidence;
    }> {
  const lineage = readValidatedCanonicalLineageFrom(executor, view);
  const originals = validatePostwarFinancialOfficeOriginalDocument(
    input.originalsDocument,
    lineage.seed,
  );
  const countries = originals.contract.countries.filter(
    (c) => c.countryId === input.countryId,
  );
  if (countries.length !== 1) invalid('EXACT_SOURCE_COUNTRY_REQUIRED');
  const country = countries[0]!;
  const holdings = country.cbRegister.holdings.filter(
    (h) => h.holdingId === input.holdingId,
  );
  if (!holdings.length)
    return Object.freeze({
      status: 'MISSING',
      reason: 'NO_DECLARED_GCU_CASH_INSTRUMENT',
    });
  if (holdings.length !== 1) invalid('UNIQUE_HOLDING_REQUIRED');
  const h = holdings[0]!;
  if (
    h.category !== 'FX_CASH_AND_DEPOSITS' ||
    h.kind !== 'CASH' ||
    h.currency !== 'GCU' ||
    h.counterpartyId !== null ||
    country.localCurrency === 'GCU'
  )
    invalid('EXPLICIT_FOREIGN_GCU_CASH_REQUIRED');
  if (
    country.cbRegister.categories.filter(
      (c) => c.category === h.category && c.disposition === 'DECLARED',
    ).length !== 1 ||
    h.localCurrencyPerUnit !== country.openingFx.localCurrencyPerGcu
  )
    invalid('DECLARED_CATEGORY_AND_EXACT_VALUATION_REQUIRED');
  const opening = Money.from(h.amount, 'GCU');
  if (!opening.amount.isPositive()) invalid('POSITIVE_SOURCE_CASH_REQUIRED');
  const source = lineage.seed.sources.find(
    (s) => s.sourceId === originals.financialSourceId,
  )!;
  const assembly = record(record(JSON.parse(source.canonicalPayload)).assembly);
  if (!Array.isArray(assembly.countries))
    invalid('SOURCE_COUNTRY_ROSTER_REQUIRED');
  const rows = assembly.countries
    .map(record)
    .filter((c) => c.countryId === input.countryId);
  if (rows.length !== 1 || record(rows[0]!.roster).centralBank !== h.holderId)
    invalid('EXACT_CENTRAL_BANK_HOLDER_REQUIRED');
  // This is the actual formal producer identity, bound to source holding ID.
  const accountId =
    'ACCOUNT_' +
    sha(
      canonicalSerialize([
        lineage.worldId,
        input.countryId,
        'CB_' + h.holdingId,
        'GCU',
      ]),
    ).toUpperCase();
  const batches = lineage.seed.financialBatches.filter(
    (b) =>
      b.sourceId === source.sourceId &&
      b.legs.some((l) => l.account.accountId === accountId),
  );
  if (batches.length !== 1) invalid('EXACT_PRODUCER_SOURCE_BATCH_REQUIRED');
  const legs = batches[0]!.legs.filter(
    (l) => l.account.accountId === accountId,
  );
  if (legs.length !== 1) invalid('UNIQUE_PRODUCER_CASH_LEG_REQUIRED');
  const leg = legs[0]!,
    a = leg.account;
  if (
    a.worldId !== lineage.worldId ||
    a.countryId !== input.countryId ||
    a.ownerId !== h.holderId ||
    a.accountClass !== 'ASSET' ||
    a.currency !== 'GCU' ||
    a.claimId !== null ||
    a.counterpartyEntityId !== null ||
    leg.direction !== 'DEBIT' ||
    !leg.amount.amount.equals(opening.amount)
  )
    invalid('PRODUCER_ACCOUNT_OR_ORIGINAL_AMOUNT_DIFFERS');
  const ledger = lineage.ledgers.financial;
  const current = ledger.accounts.filter((x) => x.accountId === accountId);
  if (
    current.length !== 1 ||
    canonicalSerialize(current[0]) !== canonicalSerialize(a)
  )
    invalid('EXACT_CURRENT_LEDGER_ACCOUNT_REQUIRED');
  const balance =
    ledger.positions.find((p) => p.account.accountId === accountId)
      ?.netDebitBalance ?? Money.from('0', 'GCU');
  if (balance.currency !== 'GCU' || balance.amount.isNegative())
    invalid('NONNEGATIVE_GCU_LEDGER_BALANCE_REQUIRED');
  const facts: PostwarGcuCashInstrumentFacts = Object.freeze({
    classification: 'SOURCE_DECLARED_GCU_CASH_INSTRUMENT_NOT_PAYMENT_AUTHORITY',
    worldId: lineage.worldId,
    countryId: input.countryId,
    ownerId: h.holderId,
    accountId,
    accountClass: 'ASSET',
    currency: 'GCU',
    holdingId: h.holdingId,
    openingAmount: opening.toCanonicalValue().amount,
    ledgerBalance: balance.toCanonicalValue().amount,
    declaredUsableStatus: h.usableStatus,
    seedFingerprint: lineage.seed.fingerprint,
    sourceId: source.sourceId,
    sourcePayloadHash: source.payloadHash,
    contractFingerprint: originals.contractFingerprint,
    originalsSha256: input.originalsDocument.sha256,
    headWorldVersion: lineage.headWorldVersion,
    headEventSequence: lineage.headEventSequence,
  });
  const evidence = Object.freeze({}) as PostwarGcuCashInstrumentEvidence;
  issued.set(evidence, { executor, view, facts });
  return Object.freeze({ status: 'CLASSIFIED', evidence });
}
/** Scope, executor and lexical lineage lifetime remain exact. This describes a
 * CB holding; it does not credit a Treasury/OP account or authorize its transfer. */
export function consumePostwarGcuCashInstrumentFrom(
  executor: SqlExecutor,
  view: ValidatedCanonicalLineageView,
  evidence: PostwarGcuCashInstrumentEvidence,
  scope: Readonly<{
    worldId: string;
    countryId: string;
    ownerId: string;
    accountId: string;
  }>,
): PostwarGcuCashInstrumentFacts {
  const lineage = readValidatedCanonicalLineageFrom(executor, view);
  const value = issued.get(evidence);
  if (
    !value ||
    value.executor !== executor ||
    value.view !== view ||
    value.facts.seedFingerprint !== lineage.seed.fingerprint ||
    value.facts.headWorldVersion !== lineage.headWorldVersion ||
    Object.keys(scope).sort().join('|') !==
      'accountId|countryId|ownerId|worldId' ||
    Object.entries(scope).some(
      ([k, v]) => value.facts[k as keyof PostwarGcuCashInstrumentFacts] !== v,
    )
  )
    invalid('GENUINE_SAME_LIFETIME_SCOPE_EVIDENCE_REQUIRED');
  return value.facts;
}
