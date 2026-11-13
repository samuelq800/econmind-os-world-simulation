/** Server-only immutable preparation. No pool, role enrollment, HTTP callback,
 * authentication cache or readiness claim. Every use still requires the real
 * custody source lock and an independently read complete bounded history. */
import { createHash } from 'node:crypto';
import { readBoundedFinanceBudgetHistoryFrom } from './bounded-finance-budget-history.js';
import {
  DomainError,
  DOMAIN_ERROR_CODES,
  canonicalSerialize,
  canonicalSha256,
  canonicalHashInput,
  validateCanonicalCommand,
  type Sha256Hex,
  type CanonicalCommand,
} from '@econmind/core';
import {
  prepareFinanceBudgetLedger,
  replayPreparedFinanceBudgetLedger,
} from '@econmind/core/finance-budget-prepared-ledger';
import {
  validateFinanceNativeBudgetPolicy,
  type FinanceNativeBudgetSource,
  type FinanceNativeBudgetPolicy,
} from '@econmind/core/finance-budget-native';
import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import { readPostwarFinancialOfficeOriginalsFromSeed } from '../preparation/postwar-financial-office-originals.js';
import { readPostwarOperatingGenesisFromSeed } from '../preparation/postwar-operating-genesis-adoption.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';

declare const immutableBudgetSource: unique symbol;
export interface PreparedFinanceBudgetSource {
  readonly [immutableBudgetSource]: true;
}
type Base = Omit<
  FinanceNativeBudgetSource,
  'policy' | 'frames' | 'worldVersion' | 'eventSequence' | 'financialState'
> & {
  readonly worldId: string;
  readonly countryId: string;
  readonly governmentEntityId: string;
  readonly currency: string;
  readonly ledger: ReturnType<typeof prepareFinanceBudgetLedger>;
};
const originals = new WeakMap<PreparedFinanceBudgetSource, Base>();
export function isPreparedFinanceBudgetSource(
  value: unknown,
  worldId: string,
): value is PreparedFinanceBudgetSource {
  return (
    !!value &&
    typeof value === 'object' &&
    originals.get(value as PreparedFinanceBudgetSource)?.worldId === worldId
  );
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Prepared Budget source: ' + message,
  );
}
const text = (v: unknown): string => {
  if (typeof v !== 'string' || !v || v.trim() !== v)
    invalid('noncanonical durable field');
  return v;
};
const hash = (v: unknown, fn: Sha256Hex) =>
  canonicalSha256(canonicalHashInput(v), fn);

/** Explicit finite server preparation; only an actual admitted H0 original is
 * retained. Caller supplies selectors, never a source object or admitted flag. */
export async function preparePostgresFinanceBudgetSource(config: {
  readonly database: SqlDatabase;
  readonly worldId: string;
  readonly countryId: string;
  readonly workerId: string;
  readonly envelopeRef: string;
  readonly effectivePeriodRef: string;
  readonly observedAtReal: string;
  readonly sha256Hex: Sha256Hex;
}): Promise<PreparedFinanceBudgetSource> {
  return config.database.transaction(async (tx) => {
    const identity = await tx.query<{ subject: string }>(
      "select current_setting('request.jwt.claim.sub',true)as subject",
    );
    if (identity.rows.length !== 1 || !identity.rows[0]?.subject)
      invalid('verified backend subject required');
    const locked = await tx.query<Record<string, unknown>>(
      'select * from world_v2.lock_finance_budget_policy($1,$2,$3,$4,$5,$6,$7::uuid)',
      [
        config.worldId,
        config.countryId,
        config.envelopeRef,
        config.effectivePeriodRef,
        config.workerId,
        config.observedAtReal,
        identity.rows[0].subject,
      ],
    );
    if (locked.rows.length !== 1) invalid('current source original required');
    const original = locked.rows[0]!,
      bytes = text(original.policy_text),
      policy = JSON.parse(bytes) as FinanceNativeBudgetPolicy;
    validateFinanceNativeBudgetPolicy(policy);
    if (
      canonicalSerialize(policy) !== bytes ||
      sha(bytes) !== original.policy_sha256 ||
      policy.worldId !== config.worldId ||
      policy.countryId !== config.countryId
    )
      invalid('actual policy original mismatch');
    const lineage = await new DurableV08LedgerLineageReader({
      database: config.database,
      sha256Hex: sha,
    }).readValidatedLineageFrom(tx, config.worldId);
    if (
      lineage.headWorldVersion !== '0' ||
      lineage.headEventSequence !== '0' ||
      lineage.transitions.length ||
      lineage.seed.seedId !== original.seed_id ||
      lineage.seed.fingerprint !== original.seed_fingerprint
    )
      invalid('preparation requires admitted canonical H0');
    const seed = lineage.seed,
      document = readPostwarFinancialOfficeOriginalsFromSeed(seed);
    const country = document.contract.countries.filter(
      (c) => c.countryId === config.countryId,
    );
    const financial = seed.sources.filter(
      (s) => s.sourceId === document.financialSourceId,
    );
    if (
      country.length !== 1 ||
      financial.length !== 1 ||
      country[0]!.localCurrency !== policy.currency
    )
      invalid('financial original country mismatch');
    const roster = (
      JSON.parse(financial[0]!.canonicalPayload) as {
        assembly: {
          countries: {
            countryId: string;
            roster: { government: string; centralBank: string };
          }[];
        };
      }
    ).assembly.countries.filter((c) => c.countryId === config.countryId);
    if (
      roster.length !== 1 ||
      roster[0]!.roster.government !== policy.governmentEntityId
    )
      invalid('actual GOV roster mismatch');
    const gov = roster[0]!.roster.government,
      cb = roster[0]!.roster.centralBank;
    const assets = seed.financialBatches
      .filter((b) => b.sourceId === document.financialSourceId)
      .flatMap((b) => b.legs)
      .filter(
        (l) =>
          l.direction === 'DEBIT' &&
          l.account.countryId === config.countryId &&
          l.account.ownerId === gov &&
          l.account.counterpartyEntityId === cb &&
          l.account.currency === policy.currency &&
          l.account.accountClass === 'ASSET',
      );
    if (assets.length !== 1 || !assets[0]!.account.claimId)
      invalid('unique actual treasury required');
    const asset = assets[0]!;
    const mirror = seed.financialBatches
      .filter((b) => b.sourceId === document.financialSourceId)
      .flatMap((b) => b.legs)
      .filter(
        (l) =>
          l.direction === 'CREDIT' &&
          l.account.countryId === config.countryId &&
          l.account.ownerId === cb &&
          l.account.counterpartyEntityId === gov &&
          l.account.accountClass === 'LIABILITY' &&
          l.account.currency === policy.currency &&
          l.account.claimId === asset.account.claimId,
      );
    if (
      mirror.length !== 1 ||
      !mirror[0]!.amount.amount.equals(asset.amount.amount)
    )
      invalid('actual treasury mirror required');
    const operating = readPostwarOperatingGenesisFromSeed(seed);
    const funding = operating.facts.funding
      .filter(
        (f) =>
          f.countryId === config.countryId &&
          f.accountId === asset.account.accountId &&
          f.payerEntityId === gov,
      )
      .map((f) =>
        Object.freeze({
          reference: f.fundingId,
          accountId: f.accountId,
          amount: f.ceilingAmount,
          currency: f.currency,
        }),
      )
      .sort((a, b) =>
        a.reference < b.reference ? -1 : a.reference > b.reference ? 1 : 0,
      );
    const token = Object.freeze({}) as PreparedFinanceBudgetSource;
    originals.set(
      token,
      Object.freeze({
        worldId: config.worldId,
        countryId: config.countryId,
        governmentEntityId: gov,
        currency: policy.currency,
        ledger: prepareFinanceBudgetLedger(lineage.ledgers.financial),
        openingEncumbrances: Object.freeze(funding),
        binding: Object.freeze({
          seedRef: seed.seedId,
          seedFingerprint: seed.fingerprint,
          admissionRef: text(original.admission_ref),
          financialSourceId: document.financialSourceId,
          originalsSHA256: 'sha256:' + sha(canonicalSerialize(document)),
          policyHash: hash(policy, sha),
          treasuryAccountId: asset.account.accountId,
          treasuryClaimId: asset.account.claimId!,
          openingEncumbranceHash: hash(funding, sha),
        }),
      }),
    );
    return token;
  });
}

/** Current actor/admission/policy/lease checks are owned by custody BEFORE
 * calling this. This method also binds their real row to the immutable base. */
export async function readPreparedFinanceBudgetSourceFrom(input: {
  readonly prepared: PreparedFinanceBudgetSource;
  readonly executor: SqlExecutor;
  readonly database: SqlDatabase;
  readonly command: CanonicalCommand;
  readonly policy: FinanceNativeBudgetPolicy;
  readonly sourceRow: Readonly<Record<string, unknown>>;
  readonly sha256Hex: Sha256Hex;
}): Promise<FinanceNativeBudgetSource> {
  const base = originals.get(input.prepared),
    c = input.command,
    tx = input.executor;
  validateCanonicalCommand(c, sha);
  if (
    !base ||
    base.worldId !== c.worldId ||
    base.countryId !== c.countryId ||
    base.governmentEntityId !== input.policy.governmentEntityId ||
    base.currency !== input.policy.currency ||
    base.binding.seedRef !== input.sourceRow.seed_id ||
    base.binding.seedFingerprint !== input.sourceRow.seed_fingerprint ||
    base.binding.admissionRef !== input.sourceRow.admission_ref
  )
    invalid('prepared original differs from current source');
  const { head, frames } = await readBoundedFinanceBudgetHistoryFrom({
    executor: tx,
    database: input.database,
    worldId: c.worldId,
    expectedWorldVersion: c.expectedWorldVersion,
  });
  const ledger = replayPreparedFinanceBudgetLedger({
    prepared: base.ledger,
    frames,
    sha256Hex: sha,
  });
  return Object.freeze({
    policy: input.policy,
    binding: Object.freeze({
      ...base.binding,
      policyHash: hash(input.policy, sha),
    }),
    openingEncumbrances: base.openingEncumbrances,
    financialState: ledger,
    frames,
    worldVersion: head.world_version,
    eventSequence: head.event_sequence,
  });
}
