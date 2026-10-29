/** Exact first-day domestic Treasury FX. DATA_ONLY quotes/drafts never grant
 * source custody, a bank mandate or Treasury authority. No official GCU asset
 * or reserve account can enter this six-leg domestic settlement. */
import {
  canonicalSerialize,
  canonicalHashInput,
} from '../serialization/canonical.js';
import { Money } from '../numeric/money.js';
import { canonicalDecimal } from '../numeric/world-decimal.js';
import { SimTime, isSimTime } from '../numeric/sim-time.js';
import { SIMULATION_TICKS_PER_DAY } from '../time/simulation-clock.js';
import {
  validateCanonicalCommand,
  type CanonicalCommand,
  type Sha256Hex,
} from '../commands/command.js';
import {
  bindAuthoritativeTransition,
  isCommitAuthorizationProof,
  reauthorizeCommitAuthorizationProof,
  validateFinalReceiptForCommand,
  type FinalCommandReceipt,
  type CommitAuthorizationProof,
  type AuthoritativeTransition,
} from '../commands/receipt.js';
import {
  POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND,
  POSTWAR_DAY_ONE_TREASURY_FX_PAYLOAD_SCHEMA,
  type PostwarDayOneTreasuryFxPayload,
} from '../commands/authenticated-fx-command-contract.js';
import {
  createFinancialAccount,
  createFinancialPostingBatch,
  applyFinancialPostingBatch,
  parseFinancialLedgerSnapshot,
  FINANCIAL_POSTING_SCHEMA_VERSION,
  type FinancialAccount,
  type FinancialLedgerState,
  type FinancialPostingBatch,
  type FinancialPostingLeg,
} from './financial-ledger.js';
import {
  isAuthoritativeFinancialLedgerState,
  authorizeFinancialLedgerState,
} from '../opening/ledger-authority.js';
import { inheritProductionDepositInstruments } from './production-deposit-funding.js';
import { financialPostingBatchId, financialPostingLegId } from '../ids.js';
export const POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_EVENT =
  'POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_V1';
export const POSTWAR_DAY_ONE_FX_POLICY_VERSION =
  'POSTWAR_DAY_ONE_FX_20261029_V1';
function invalid(s: string): never {
  throw Error('POSTWAR_DAY_ONE_FX_INVALID: ' + s);
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v || v.trim() !== v)
    invalid('exact text required');
  return v;
}
function row(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('record required');
  return v as Record<string, unknown>;
}
function decimal(v: string): { n: bigint; scale: number } {
  if (!/^(0|[1-9]\d*)(\.\d+)?$/u.test(v))
    invalid('nonnegative exact decimal required');
  const [w, f = ''] = v.split('.');
  if (f.length > 24) invalid('decimal precision exceeds policy');
  return { n: BigInt(w! + f), scale: f.length };
}
function format(n: bigint, scale: number): string {
  const digits = n.toString().padStart(scale + 1, '0');
  return scale
    ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`
        .replace(/0+$/u, '')
        .replace(/\.$/u, '')
    : digits;
}
function same(a: unknown, b: unknown, s: string) {
  if (canonicalSerialize(a) !== canonicalSerialize(b)) invalid(s);
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function digest(v: unknown): string {
  const s = text(v);
  if (!/^[a-f0-9]{64}$/u.test(s)) invalid('raw SHA-256 required');
  return s;
}
const hash = (v: unknown, sha: Sha256Hex) => sha(canonicalHashInput(v));
export interface PostwarDayOneFxQuoteData {
  readonly schemaVersion: 'postwar-day-one-fx-quote-v1';
  readonly policyVersion: typeof POSTWAR_DAY_ONE_FX_POLICY_VERSION;
  readonly worldId: string;
  readonly seedFingerprint: string;
  readonly countryId: string;
  readonly localCurrency: string;
  readonly localCurrencyPerGcu: string;
  readonly governmentEntityId: string;
  readonly centralBankEntityId: string;
  readonly bankEntityId: string;
  readonly dealerGcuAccountId: string;
  readonly financialSourceId: string;
  readonly financialSourcePayloadHash: string;
  readonly gcuSourceId: string;
  readonly gcuSourcePayloadHash: string;
  readonly baselineFxVersion: string;
  readonly baselineSourceSha256: string;
  readonly policySha256: string;
  readonly userReceiptSha256: string;
  readonly validFromSimTime: '0';
  readonly validUntilSimTime: typeof SIMULATION_TICKS_PER_DAY;
  readonly spreadBps: '0';
  readonly gcuQuantum: '0.000001';
  readonly quoteRef: string;
  readonly quoteSha256: string;
}
const quoteKeys = [
  'schemaVersion',
  'policyVersion',
  'worldId',
  'seedFingerprint',
  'countryId',
  'localCurrency',
  'localCurrencyPerGcu',
  'governmentEntityId',
  'centralBankEntityId',
  'bankEntityId',
  'dealerGcuAccountId',
  'financialSourceId',
  'financialSourcePayloadHash',
  'gcuSourceId',
  'gcuSourcePayloadHash',
  'baselineFxVersion',
  'baselineSourceSha256',
  'policySha256',
  'userReceiptSha256',
  'validFromSimTime',
  'validUntilSimTime',
  'spreadBps',
  'gcuQuantum',
  'quoteRef',
  'quoteSha256',
];
export function createPostwarDayOneFxQuoteData(
  input: Omit<PostwarDayOneFxQuoteData, 'quoteRef' | 'quoteSha256'>,
  sha: Sha256Hex,
): PostwarDayOneFxQuoteData {
  const body = {
    ...input,
    quoteRef: 'DAY_ONE_FX_' + hash(input, sha).slice(0, 48).toUpperCase(),
  };
  return parsePostwarDayOneFxQuoteData(
    { ...body, quoteSha256: hash(body, sha) },
    sha,
  );
}
export function parsePostwarDayOneFxQuoteData(
  value: unknown,
  sha: Sha256Hex,
): PostwarDayOneFxQuoteData {
  const q = row(value);
  same(
    Object.keys(q).sort(),
    [...quoteKeys].sort(),
    'exact quote fields required',
  );
  for (const k of quoteKeys) text(q[k]);
  if (
    q.schemaVersion !== 'postwar-day-one-fx-quote-v1' ||
    q.policyVersion !== POSTWAR_DAY_ONE_FX_POLICY_VERSION ||
    q.validFromSimTime !== '0' ||
    q.validUntilSimTime !== SIMULATION_TICKS_PER_DAY ||
    q.spreadBps !== '0' ||
    q.gcuQuantum !== '0.000001'
  )
    invalid('fixed authorized policy/day/zero-spread required');
  if (decimal(text(q.localCurrencyPerGcu)).n <= 0n || q.localCurrency === 'GCU')
    invalid('source LC_PER_GCU units required');
  for (const k of [
    'baselineSourceSha256',
    'policySha256',
    'userReceiptSha256',
    'quoteSha256',
  ])
    digest(q[k]);
  for (const k of [
    'seedFingerprint',
    'financialSourcePayloadHash',
    'gcuSourcePayloadHash',
  ])
    if (!/^sha256:[0-9a-f]{64}$/u.test(text(q[k])))
      invalid('canonical source hash required');
  if (
    new Set([q.governmentEntityId, q.centralBankEntityId, q.bankEntityId])
      .size !== 3
  )
    invalid('distinct actual government/CB/bank required');
  const { quoteSha256, ...body } = q;
  if (hash(body, sha) !== quoteSha256) invalid('quote hash mismatch');
  return freeze({ ...q }) as unknown as PostwarDayOneFxQuoteData;
}
export function parsePostwarDayOneTreasuryFxPayload(
  value: unknown,
): PostwarDayOneTreasuryFxPayload {
  const p = row(value);
  same(
    Object.keys(p).sort(),
    [
      'schemaVersion',
      'quoteRef',
      'payerTreasuryAccountId',
      'payerGcuAccountId',
      'dealerGcuAccountId',
      'localAmount',
      'localCurrency',
      'expectedQuoteSha256',
    ].sort(),
    'exact Treasury intent fields required',
  );
  for (const key of Object.keys(p)) text(p[key]);
  if (
    p.schemaVersion !== POSTWAR_DAY_ONE_TREASURY_FX_PAYLOAD_SCHEMA ||
    decimal(text(p.localAmount)).n <= 0n
  )
    invalid('positive LC maximum required');
  digest(p.expectedQuoteSha256);
  if (
    new Set([
      p.payerTreasuryAccountId,
      p.payerGcuAccountId,
      p.dealerGcuAccountId,
    ]).size !== 3
  )
    invalid('distinct account selectors required');
  return freeze({ ...p }) as unknown as PostwarDayOneTreasuryFxPayload;
}
export interface PostwarDayOneTreasuryFxAccounts {
  readonly treasuryAsset: FinancialAccount;
  readonly treasuryLiability: FinancialAccount;
  readonly bankSettlementAsset: FinancialAccount;
  readonly bankSettlementLiability: FinancialAccount;
  readonly bankGcuAsset: FinancialAccount;
  readonly treasuryGcuAsset: FinancialAccount;
}
export interface PostwarDayOneFxEncumbrances {
  readonly worldVersion: string;
  readonly treasuryReservedAmount: string;
  readonly bankGcuReservedAmount: string;
  readonly sourceRef: string;
  readonly sourceSha256: string;
}
export interface PostwarDayOneTreasuryFxDraft {
  readonly schemaVersion: 'postwar-day-one-treasury-fx-draft-v1';
  readonly quote: PostwarDayOneFxQuoteData;
  readonly payload: PostwarDayOneTreasuryFxPayload;
  readonly worldVersionBefore: string;
  readonly simTime: string;
  readonly requestedLocalMaximum: string;
  readonly actualLocalDebit: string;
  readonly filledGcu: string;
  readonly unusedLocalMaximum: string;
  readonly encumbrances: PostwarDayOneFxEncumbrances;
  readonly accounts: PostwarDayOneTreasuryFxAccounts;
  readonly eventPayload: Readonly<Record<string, unknown>>;
  readonly fingerprint: string;
}
const drafts = new WeakMap<
  PostwarDayOneTreasuryFxDraft,
  FinancialLedgerState
>();
export function calculatePostwarDayOneTreasuryFx(
  input: {
    readonly quote: unknown;
    readonly payload: unknown;
    readonly simTime: SimTime;
    readonly financial: FinancialLedgerState;
    readonly accounts: PostwarDayOneTreasuryFxAccounts;
    readonly encumbrances: PostwarDayOneFxEncumbrances;
  },
  sha: Sha256Hex,
): PostwarDayOneTreasuryFxDraft {
  const q = parsePostwarDayOneFxQuoteData(input.quote, sha),
    p = parsePostwarDayOneTreasuryFxPayload(input.payload),
    f = input.financial,
    a = input.accounts,
    e = input.encumbrances;
  if (
    !isAuthoritativeFinancialLedgerState(f) ||
    !isSimTime(input.simTime) ||
    input.simTime.ticks >= BigInt(SIMULATION_TICKS_PER_DAY) ||
    f.worldId !== q.worldId
  )
    invalid('actual ledger and unexpired first simulation day required');
  if (
    p.quoteRef !== q.quoteRef ||
    p.expectedQuoteSha256 !== q.quoteSha256 ||
    p.localCurrency !== q.localCurrency ||
    p.payerTreasuryAccountId !== a.treasuryAsset.accountId ||
    p.payerGcuAccountId !== a.treasuryGcuAsset.accountId ||
    p.dealerGcuAccountId !== a.bankGcuAsset.accountId ||
    p.dealerGcuAccountId !== q.dealerGcuAccountId
  )
    invalid('intent/quote/original accounts mismatch');
  if (!e || e.worldVersion !== f.worldVersion)
    invalid('current complete encumbrance evidence required');
  text(e.sourceRef);
  digest(e.sourceSha256);
  decimal(e.treasuryReservedAmount);
  decimal(e.bankGcuReservedAmount);
  if (new Set(Object.values(a).map((x) => x.accountId)).size !== 6)
    invalid('six distinct accounts required');
  for (const v of Object.values(a)) {
    createFinancialAccount(v);
    if (v.worldId !== q.worldId || v.countryId !== q.countryId)
      invalid('foreign original account');
  }
  const current = (account: FinancialAccount, allowNew = false) => {
    const existing = f.accounts.find((x) => x.accountId === account.accountId);
    if (!existing) {
      if (!allowNew) invalid('existing original account required');
      return Money.from('0', account.currency);
    }
    same(existing, account, 'account identity changed');
    return (
      f.positions.find((x) => x.account.accountId === account.accountId)
        ?.netDebitBalance ?? Money.from('0', account.currency)
    );
  };
  const mirror = (
    asset: FinancialAccount,
    liability: FinancialAccount,
    owner: string,
  ) => {
    if (
      asset.accountClass !== 'ASSET' ||
      liability.accountClass !== 'LIABILITY' ||
      asset.ownerId !== owner ||
      asset.counterpartyEntityId !== q.centralBankEntityId ||
      liability.ownerId !== q.centralBankEntityId ||
      liability.counterpartyEntityId !== owner ||
      asset.claimId === null ||
      asset.claimId !== liability.claimId ||
      asset.currency !== q.localCurrency ||
      liability.currency !== q.localCurrency
    )
      invalid('actual domestic CB claim mirror required');
    const av = current(asset),
      lv = current(liability);
    if (av.amount.isNegative() || !av.amount.equals(lv.amount.negated()))
      invalid('current claim mirror imbalance');
    return av;
  };
  const treasury = mirror(
    a.treasuryAsset,
    a.treasuryLiability,
    q.governmentEntityId,
  );
  mirror(a.bankSettlementAsset, a.bankSettlementLiability, q.bankEntityId);
  if (a.treasuryAsset.claimId === a.bankSettlementAsset.claimId)
    invalid('TGA and bank settlement claims must differ');
  for (const [account, owner] of [
    [a.bankGcuAsset, q.bankEntityId],
    [a.treasuryGcuAsset, q.governmentEntityId],
  ] as const)
    if (
      account.accountClass !== 'CASH' ||
      account.currency !== 'GCU' ||
      account.ownerId !== owner ||
      account.claimId !== null ||
      account.counterpartyEntityId !== null
    )
      invalid('private-bank GCU cash and government GCU cash only');
  const bank = current(a.bankGcuAsset),
    govGcu = current(a.treasuryGcuAsset, true);
  if (bank.amount.isNegative() || govGcu.amount.isNegative())
    invalid('negative original cash');
  const maximum = decimal(p.localAmount),
    rate = decimal(q.localCurrencyPerGcu);
  const micro =
    (maximum.n * 10n ** BigInt(rate.scale + 6)) /
    (rate.n * 10n ** BigInt(maximum.scale));
  if (micro === 0n) invalid('maximum cannot fill one GCU quantum');
  const filledGcu = format(micro, 6),
    actualLocalDebit = format(micro * rate.n, 6 + rate.scale);
  const debit = Money.from(actualLocalDebit, q.localCurrency),
    gcu = Money.from(filledGcu, 'GCU');
  if (
    treasury
      .subtract(Money.from(e.treasuryReservedAmount, q.localCurrency))
      .amount.lessThan(debit.amount) ||
    bank
      .subtract(Money.from(e.bankGcuReservedAmount, 'GCU'))
      .amount.lessThan(gcu.amount)
  )
    invalid('insufficient actual unreserved balances');
  const unusedLocalMaximum = canonicalDecimal(
    Money.from(p.localAmount, q.localCurrency).subtract(debit).amount,
  );
  const body = {
    schemaVersion: 'postwar-day-one-treasury-fx-draft-v1' as const,
    quote: q,
    payload: p,
    worldVersionBefore: f.worldVersion,
    simTime: input.simTime.toCanonicalValue(),
    requestedLocalMaximum: p.localAmount,
    actualLocalDebit,
    filledGcu,
    unusedLocalMaximum,
    encumbrances: { ...e },
    accounts: { ...a },
  };
  const eventPayload = freeze({
    ...body,
    schemaVersion: 'postwar-day-one-treasury-fx-settled-v1',
    fee: '0',
    officialGcuReserveEffect: '0',
  });
  const draft = freeze({
    ...body,
    eventPayload,
    fingerprint: 'sha256:' + hash(eventPayload, sha),
  });
  drafts.set(draft, f);
  return draft;
}
export async function applyPostwarDayOneTreasuryFx(
  input: {
    readonly draft: PostwarDayOneTreasuryFxDraft;
    readonly financial: FinancialLedgerState;
    readonly command: CanonicalCommand;
    readonly transition: AuthoritativeTransition;
    readonly commitAuthorization: CommitAuthorizationProof;
  },
  sha: Sha256Hex,
): Promise<
  Readonly<{
    financial: FinancialLedgerState;
    postingBatches: readonly FinancialPostingBatch[];
  }>
> {
  const {
    draft: d,
    command: c,
    transition: t,
    financial: f,
    commitAuthorization: proof,
  } = input;
  if (drafts.get(d) !== f)
    invalid('genuine draft must bind exact actual prior ledger');
  validateCanonicalCommand(c, sha);
  if (
    !isCommitAuthorizationProof(proof) ||
    proof.capability !== 'FINANCE_TREASURY' ||
    proof.commandId !== c.commandId ||
    proof.commandFingerprint !== c.fingerprint ||
    proof.worldId !== c.worldId ||
    proof.countryId !== c.countryId ||
    proof.officeId !== 'FINANCE'
  )
    invalid('genuine current Treasury commit authorization required');
  await reauthorizeCommitAuthorizationProof(proof);
  const result = settleDraftForTransition(d, c, t, f, sha);
  settlements.set(result, { command: c, transition: t, proof, draft: d });
  return result;
}
function settleDraftForTransition(
  d: PostwarDayOneTreasuryFxDraft,
  c: CanonicalCommand,
  t: AuthoritativeTransition,
  f: FinancialLedgerState,
  sha: Sha256Hex,
): PostwarDayOneTreasuryFxSettlement {
  if (drafts.get(d) !== f) invalid('exact replay draft/ledger required');
  validateCanonicalCommand(c, sha);
  if (
    c.commandType !== POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND ||
    c.officeId !== 'FINANCE' ||
    c.worldId !== d.quote.worldId ||
    c.countryId !== d.quote.countryId ||
    c.expectedWorldVersion !== f.worldVersion ||
    c.simTime.toCanonicalValue() !== d.simTime
  )
    invalid('actual command scope/head/time mismatch');
  same(
    parsePostwarDayOneTreasuryFxPayload(JSON.parse(c.canonicalPayload)),
    d.payload,
    'command payload changed',
  );
  const binding = bindAuthoritativeTransition(
    { command: c, transition: t },
    sha,
  );
  if (
    t.events.length !== 1 ||
    t.events[0]!.eventType !== POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_EVENT
  )
    invalid('one exact Treasury FX event required');
  same(
    JSON.parse(t.events[0]!.canonicalPayload),
    d.eventPayload,
    'settlement event changed',
  );
  const id = hash({ command: c.fingerprint, draft: d.fingerprint }, sha)
      .slice(0, 40)
      .toUpperCase(),
    a = d.accounts;
  const leg = (
    name: string,
    account: FinancialAccount,
    direction: 'DEBIT' | 'CREDIT',
    amount: string,
    counterparty: FinancialAccount,
  ): FinancialPostingLeg => ({
    legId: financialPostingLegId('FX_' + id + '_' + name),
    account,
    direction,
    amount: Money.from(amount, account.currency),
    counterpartyAccountId: counterparty.accountId,
  });
  const batch = (currency: string, legs: readonly FinancialPostingLeg[]) =>
    createFinancialPostingBatch(
      {
        schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
        batchId: financialPostingBatchId('BATCH_FX_' + id + '_' + currency),
        worldId: c.worldId,
        causationCommandId: c.commandId,
        causationEventIds: t.eventIds,
        worldVersionBefore: t.worldVersionBefore,
        worldVersionAfter: t.worldVersionAfter,
        simTime: c.simTime,
        command: c,
        transition: t,
        settlementCurrency: currency,
        legs,
      },
      sha,
    );
  const lc = batch(d.quote.localCurrency, [
    leg(
      'TGA_ASSET',
      a.treasuryAsset,
      'CREDIT',
      d.actualLocalDebit,
      a.treasuryLiability,
    ),
    leg(
      'TGA_LIABILITY',
      a.treasuryLiability,
      'DEBIT',
      d.actualLocalDebit,
      a.treasuryAsset,
    ),
    leg(
      'BANK_SETTLEMENT',
      a.bankSettlementAsset,
      'DEBIT',
      d.actualLocalDebit,
      a.bankSettlementLiability,
    ),
    leg(
      'BANK_SETTLEMENT_LIABILITY',
      a.bankSettlementLiability,
      'CREDIT',
      d.actualLocalDebit,
      a.bankSettlementAsset,
    ),
  ]);
  const gcu = batch('GCU', [
    leg('BANK_GCU', a.bankGcuAsset, 'CREDIT', d.filledGcu, a.treasuryGcuAsset),
    leg('GOV_GCU', a.treasuryGcuAsset, 'DEBIT', d.filledGcu, a.bankGcuAsset),
  ]);
  // Identical to Core lineage's private financialStateAtVersion convention:
  // both batches share ONE validated transition, never two public commits.
  const afterLc = applyFinancialPostingBatch(f, lc).state;
  const intermediate = authorizeFinancialLedgerState(
    parseFinancialLedgerSnapshot({
      ...afterLc,
      worldVersion: binding.worldVersionBefore,
    }),
  );
  inheritProductionDepositInstruments(intermediate, afterLc);
  const financial = applyFinancialPostingBatch(intermediate, gcu).state;
  const result = Object.freeze({
    financial,
    postingBatches: Object.freeze([lc, gcu]),
  });
  return result;
}

export interface PostwarDayOneTreasuryFxSettlement {
  readonly financial: FinancialLedgerState;
  readonly postingBatches: readonly FinancialPostingBatch[];
}
const settlements = new WeakMap<
  PostwarDayOneTreasuryFxSettlement,
  {
    command: CanonicalCommand;
    transition: AuthoritativeTransition;
    proof: CommitAuthorizationProof;
    draft: PostwarDayOneTreasuryFxDraft;
  }
>();
/** Commit adapter check, not a source-admission substitute. Source custody must
 * still hold/recheck the fixed quote, originals, reservations and actor. */
export function assertPostwarDayOneTreasuryFxCommitBinding(
  input: {
    readonly settlement: PostwarDayOneTreasuryFxSettlement;
    readonly command: CanonicalCommand;
    readonly transition: AuthoritativeTransition;
    readonly financialPostingBatches: readonly FinancialPostingBatch[];
    readonly commitAuthorization: unknown;
  },
  sha: Sha256Hex,
): void {
  const meta = settlements.get(input.settlement);
  if (
    !meta ||
    meta.proof !== input.commitAuthorization ||
    !isCommitAuthorizationProof(input.commitAuthorization)
  )
    invalid('genuine exact Treasury settlement required');
  same(
    bindAuthoritativeTransition(
      { command: meta.command, transition: meta.transition },
      sha,
    ),
    bindAuthoritativeTransition(
      { command: input.command, transition: input.transition },
      sha,
    ),
    'settlement transition changed',
  );
  same(
    input.settlement.postingBatches,
    input.financialPostingBatches,
    'settlement posting batches changed',
  );
  if (
    input.settlement.postingBatches.length !== 2 ||
    input.settlement.financial.worldVersion !==
      input.transition.worldVersionAfter
  )
    invalid('complete same-transition two-currency settlement required');
}

/** Replay only: accepts persisted JSON batches as DATA_ONLY and compares all
 * canonical bytes/fingerprints to newly re-derived Core batches. This result
 * is never registered as a commit settlement and needs no current actor. The
 * held DB lineage owner must supply the complete ordered prefix, quote/source
 * and encumbrances valid AT THIS FRAME, not today's state or caller hints. */
export function replayPostwarDayOneTreasuryFxFrame(
  input: {
    readonly financialBefore: FinancialLedgerState;
    readonly frame: {
      readonly command: CanonicalCommand;
      readonly transition: AuthoritativeTransition;
      readonly receipt: FinalCommandReceipt;
      readonly financialPostingBatches: readonly unknown[];
      readonly inventoryPostings: readonly unknown[];
    };
    readonly quote: unknown;
    readonly accounts: PostwarDayOneTreasuryFxAccounts;
    readonly encumbrances: PostwarDayOneFxEncumbrances;
  },
  sha: Sha256Hex,
): Readonly<{
  financial: FinancialLedgerState;
  postingBatches: readonly FinancialPostingBatch[];
}> {
  if (input.frame.inventoryPostings.length !== 0)
    invalid('Treasury FX has no inventory effect');
  validateFinalReceiptForCommand({
    command: input.frame.command,
    transition: input.frame.transition,
    receipt: input.frame.receipt,
  });
  if (input.frame.receipt.outcome !== 'COMMITTED')
    invalid('persisted FX frame must be COMMITTED');
  const draft = calculatePostwarDayOneTreasuryFx(
    {
      quote: input.quote,
      payload: JSON.parse(input.frame.command.canonicalPayload),
      simTime: input.frame.command.simTime,
      financial: input.financialBefore,
      accounts: input.accounts,
      encumbrances: input.encumbrances,
    },
    sha,
  );
  const result = settleDraftForTransition(
    draft,
    input.frame.command,
    input.frame.transition,
    input.financialBefore,
    sha,
  );
  same(
    result.postingBatches,
    input.frame.financialPostingBatches,
    'persisted complete FX batches/fingerprints differ from replay',
  );
  return result;
}
