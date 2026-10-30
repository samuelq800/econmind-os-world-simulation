/** Fixed local/CI Treasury-FX source. JSON quotes and opening data are never
 * admission or actor authority. Every fresh use locks the registered original,
 * current complete durable prefix, and current Treasury entitlement. */
import { createHash } from 'node:crypto';
import {
  DomainError,
  DOMAIN_ERROR_CODES,
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createFinancialAccount,
  createWorldWriterCommitAssertion,
  financialAccountId,
  legalEntityId,
  countryId,
  worldId,
  Money,
  parseAuthoritativeEvent,
  parseWorldWriterLease,
  rebuildV08LedgersFromLineage,
  validateCanonicalCommand,
  isCommitAuthorizationProof,
  reauthorizeCommitAuthorizationProof,
  type AuthoritativeTransition,
  type CanonicalCommand,
  type CommitAuthorizationProof,
  type DecisionResultHead,
  type FinancialAccount,
  type FinancialLedgerState,
  type FinancialPostingBatch,
  type OpeningSeed,
} from '@econmind/core';
import { POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND } from '@econmind/core/authenticated-office-command-contract';
import {
  calculatePostwarDayOneTreasuryFx,
  applyPostwarDayOneTreasuryFx,
  assertPostwarDayOneTreasuryFxCommitBinding,
  POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_EVENT,
  type PostwarDayOneFxQuoteData,
  type PostwarDayOneTreasuryFxAccounts,
  type PostwarDayOneFxEncumbrances,
} from '@econmind/core/postwar-day-one-treasury-fx';
import type { FinanceSocialFxOriginal } from '@econmind/core/finance-budget-native';
import {
  prepareFinanceSocialLedger,
  replayPreparedFinanceSocialFxLedger,
} from '@econmind/core/finance-social-prepared-ledger';
import {
  createPostwarDayOneFxPolicy,
  type PostwarDayOneFxPolicy,
} from '../preparation/postwar-day-one-fx-policy.js';
import {
  readPostwarOperatingGenesisFromSeed,
  type PostwarGenesisFunding,
} from '../preparation/postwar-operating-genesis-adoption.js';
import type { PostwarSocialEmploymentStateDocument } from '../preparation/postwar-social-employment-state.js';
import { readPostwarDayOneFxCommittedQuoteForTreasuryFrom } from './postgres-postwar-day-one-fx-history-originals.js';
import { lockPostwarDayOneFxOriginalFrom } from './postgres-postwar-day-one-fx-originals.js';
import { readPostwarDayOneFxHistoryFrom } from './postwar-day-one-fx-history.js';
import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import { WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY } from './worker-authorization-sql.js';
import type {
  AtomicTransitionCandidateFactory,
  AtomicTransitionDraft,
} from './atomic-transition-repository.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import { readPostwarBeneficialHousingRentMixedOriginalsForDatabase } from './postwar-beneficial-housing-rent-mixed-source.js';
export const DAY_ONE_FX_SOURCE_PURPOSE =
  'POSTWAR_DAY_ONE_TREASURY_FX_SOURCE_RECHECK_V1' as const;
export interface DayOneFxSourceCommitRequest {
  readonly phase: 'BEFORE_EVENTS';
  readonly purpose: typeof DAY_ONE_FX_SOURCE_PURPOSE;
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly currentHead: DecisionResultHead;
  readonly observedAtReal: string;
  readonly readBinding: unknown;
  readonly commitAuthorization: CommitAuthorizationProof;
  readonly financialPostingBatches: readonly FinancialPostingBatch[];
}
export interface DayOneFxSourceCommitAudit {
  readonly status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY';
  readonly purpose: typeof DAY_ONE_FX_SOURCE_PURPOSE;
  readonly commandFingerprint: string;
  readonly currentHead: DecisionResultHead;
  readonly readBindingFingerprint: string;
  readonly protectionMode: 'HELD_SOURCE_GUARDS';
}
export interface DayOneFxSourceCommitProtectionPort {
  assertCurrentFrom(
    tx: SqlExecutor,
    request: Readonly<DayOneFxSourceCommitRequest>,
  ): Promise<Readonly<DayOneFxSourceCommitAudit>>;
}
export interface PostwarDayOneFxPreparationInput {
  readonly seed: OpeningSeed;
  readonly policyBytes: string;
  readonly userReceiptBytes: string;
}
export interface PostwarDayOneFxRuntime {
  readonly sourceBoundary: 'REGISTERED_DAY_ONE_TREASURY_FX_NO_LEGACY_FALLBACK';
  readonly candidateFactory: AtomicTransitionCandidateFactory;
  readonly sourceCommitProtectionPort: DayOneFxSourceCommitProtectionPort;
  prepare(input: PostwarDayOneFxPreparationInput): Promise<void>;
  preflightCanonical(
    command: CanonicalCommand,
    observedAtReal: string,
  ): Promise<void>;
  quotes(): readonly PostwarDayOneFxQuoteData[];
  treasuryGcuAccountId(country: string): string;
  close(): Promise<void>;
}
const issuedPorts = new WeakSet<object>(),
  issuedRuntimes = new WeakSet<object>();
export const isPostwarDayOneFxSourceCommitProtectionPort = (
  v: unknown,
): v is DayOneFxSourceCommitProtectionPort =>
  typeof v === 'object' && v !== null && issuedPorts.has(v);
export const isPostwarDayOneFxRuntime = (
  v: unknown,
): v is PostwarDayOneFxRuntime =>
  typeof v === 'object' && v !== null && issuedRuntimes.has(v);
import { readPostwarCaptainHistoryOriginalsFrom } from './postwar-captain-history-originals.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), sha);
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'POSTWAR_DAY_ONE_FX_RUNTIME:' + reason,
  );
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function time(v: unknown): string {
  const s = v instanceof Date ? v.toISOString() : String(v);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString() !== s
  )
    invalid('CANONICAL_OBSERVATION_REQUIRED');
  return s;
}
const one = <T>(rows: readonly T[], why: string): T => {
  if (rows.length !== 1) invalid(why);
  return rows[0]!;
};
function capture(c: CanonicalCommand) {
  validateCanonicalCommand(c, sha);
  if (
    c.commandType !== POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND ||
    c.officeId !== 'FINANCE' ||
    c.expectedWorldVersion === null ||
    c.idempotencyKey === null
  )
    invalid('EXACT_TREASURY_COMMAND_REQUIRED');
  return c;
}
function govGcu(q: PostwarDayOneFxQuoteData): FinancialAccount {
  return createFinancialAccount({
    worldId: worldId(q.worldId),
    countryId: countryId(q.countryId),
    ownerId: legalEntityId(q.governmentEntityId),
    accountId: financialAccountId(
      'ACCOUNT_DAY_ONE_GOV_GCU_' +
        sha(
          canonicalHashInput({
            worldId: q.worldId,
            government: q.governmentEntityId,
          }),
        )
          .slice(0, 40)
          .toUpperCase(),
    ),
    accountClass: 'CASH',
    currency: 'GCU',
    claimId: null,
    counterpartyEntityId: null,
  });
}
function accounts(
  f: FinancialLedgerState,
  q: PostwarDayOneFxQuoteData,
): PostwarDayOneTreasuryFxAccounts {
  const asset = (owner: string) =>
    one(
      f.accounts.filter(
        (a) =>
          a.countryId === q.countryId &&
          a.ownerId === owner &&
          a.accountClass === 'ASSET' &&
          a.counterpartyEntityId === q.centralBankEntityId &&
          a.currency === q.localCurrency &&
          a.claimId !== null,
      ),
      'EXACT_ORIGINAL_CB_CLAIM_ASSET_REQUIRED',
    );
  const treasuryAsset = asset(q.governmentEntityId),
    bankSettlementAsset = asset(q.bankEntityId);
  const mirror = (a: FinancialAccount) =>
    one(
      f.accounts.filter(
        (b) =>
          b.accountClass === 'LIABILITY' &&
          b.ownerId === q.centralBankEntityId &&
          b.counterpartyEntityId === a.ownerId &&
          b.claimId === a.claimId &&
          b.countryId === q.countryId &&
          b.currency === q.localCurrency,
      ),
      'EXACT_ORIGINAL_CB_CLAIM_LIABILITY_REQUIRED',
    );
  const bankGcuAsset = one(
    f.accounts.filter((a) => a.accountId === q.dealerGcuAccountId),
    'ACTUAL_BANK_GCU_SOURCE_REQUIRED',
  );
  return {
    treasuryAsset,
    treasuryLiability: mirror(treasuryAsset),
    bankSettlementAsset,
    bankSettlementLiability: mirror(bankSettlementAsset),
    bankGcuAsset,
    treasuryGcuAsset:
      f.accounts.find((a) => a.accountId === govGcu(q).accountId) ?? govGcu(q),
  };
}
/** No SQL, Clock, source admission or permission is issued by construction. */
export function createPostwarDayOneFxRuntime(config: {
  readonly database: SqlDatabase;
  readonly workerId: string;
  readonly workerRole: string;
  readonly worldId: string;
}): PostwarDayOneFxRuntime {
  if (
    !/^[a-z][a-z0-9_]{0,62}$/u.test(config.workerRole) ||
    [
      'postgres',
      'anon',
      'authenticated',
      'service_role',
      'world_v2_day_one_fx_source_owner',
      'world_v2_day_one_fx_source_publisher',
      'world_v2_day_one_fx_source_reader',
    ].includes(config.workerRole) ||
    !/^\w+$/u.test(config.workerId)
  )
    invalid('SCOPED_FIXED_WORKER_REQUIRED');
  const database = config.database;
  let prepared: {
      policy: PostwarDayOneFxPolicy;
      ledger: ReturnType<typeof prepareFinanceSocialLedger>;
      financialAccounts: readonly FinancialAccount[];
      social: PostwarSocialEmploymentStateDocument;
      funding: readonly PostwarGenesisFunding[];
    } | null = null,
    closed = false,
    preparing = false;
  const active = new WeakSet<SqlExecutor>(),
    pending = new Set<Promise<unknown>>();
  const track = <T>(fn: () => Promise<T>): Promise<T> => {
    if (closed)
      return Promise.reject(
        new DomainError(
          DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
          'FX_SOURCE_RETIRED',
        ),
      );
    const p = Promise.resolve().then(fn);
    pending.add(p);
    void p.then(
      () => pending.delete(p),
      () => pending.delete(p),
    );
    return p;
  };
  async function derive(
    tx: SqlExecutor,
    command: CanonicalCommand,
    at: string,
  ) {
    capture(command);
    time(at);
    if (command.worldId !== config.worldId) invalid('FIXED_WORLD_REQUIRED');
    const p = prepared;
    if (!p) invalid('SOURCE_NOT_PREPARED');
    const quote = one(
      p.policy.quotes.filter((q) => q.countryId === command.countryId),
      'COUNTRY_SOURCE_REQUIRED',
    );
    const original = await lockPostwarDayOneFxOriginalFrom(tx, {
      worldId: command.worldId,
      countryId: command.countryId,
      seedFingerprint: p.policy.seedFingerprint,
      quoteRef: quote.quoteRef,
      observedAtReal: at,
    });
    if (
      !same(original.quote, quote) ||
      original.seedFingerprint !== p.policy.seedFingerprint
    )
      invalid('REGISTERED_ORIGINAL_DIFFERS_FROM_VERIFIED_SOURCE');
    const history = await readPostwarDayOneFxHistoryFrom({
      executor: tx,
      database,
      worldId: command.worldId,
      expectedWorldVersion: command.expectedWorldVersion,
    });
    if (
      !same(original.head, {
        worldVersion: history.head.worldVersion,
        eventSequence: history.head.eventSequence,
      })
    )
      invalid('ACTUAL_SOURCE_HEAD_MISMATCH');
    if (
      history.frames.some(
        (f) => f.command.simTime.ticks > command.simTime.ticks,
      )
    )
      invalid('COMMAND_PRECEDES_ACTUAL_PREFIX');
    // Every committed frame is retained. Each historical FX original is read
    // from the real fixed custody witness; a startup quote is only immutable
    // data and cannot establish historical registration or current permission.
    const fxOriginals: FinanceSocialFxOriginal[] = [];
    for (const frame of history.frames) {
      if (
        frame.command.commandType !== POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND
      )
        continue;
      const event = frame.events[0];
      if (
        !event ||
        frame.events.length !== 1 ||
        event.eventType !== POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_EVENT
      )
        invalid('EXACT_COMMITTED_FX_EVENT_REQUIRED');
      const payload = JSON.parse(frame.command.canonicalPayload) as Record<
        string,
        unknown
      >;
      if (
        typeof payload.quoteRef !== 'string' ||
        typeof payload.expectedQuoteSha256 !== 'string'
      )
        invalid('HISTORICAL_QUOTE_IDENTITY_REQUIRED');
      const historical = await readPostwarDayOneFxCommittedQuoteForTreasuryFrom(
        tx,
        {
          worldId: command.worldId,
          hostCountryId: command.countryId,
          sourceCountryId: frame.command.countryId,
          seedFingerprint: p.policy.seedFingerprint,
          admissionRef: original.admissionRef,
          eventId: event.eventId,
          eventPayloadHash: event.payloadHash,
          quoteRef: payload.quoteRef,
          quoteSha256: payload.expectedQuoteSha256,
        },
      );
      const q = one(
        p.policy.quotes.filter((q) => q.countryId === frame.command.countryId),
        'HISTORICAL_VERIFIED_COUNTRY_REQUIRED',
      );
      if (
        !same(historical.quote, q) ||
        !same(historical.observedHead, {
          worldVersion: history.head.worldVersion,
          eventSequence: history.head.eventSequence,
        }) ||
        historical.trace.commandId !== frame.command.commandId ||
        historical.trace.commandFingerprint !== frame.command.fingerprint ||
        historical.trace.seedId !== original.seedId ||
        historical.trace.hostSourceRef !== original.registrationRef ||
        historical.trace.worldVersion !== event.worldVersion ||
        historical.trace.eventSequence !== event.sequence
      )
        invalid('ACTUAL_HISTORICAL_QUOTE_PREFIX_OR_SOURCE_DIFFERS');
      const asset = (owner: string) =>
        one(
          p.financialAccounts.filter(
            (a) =>
              a.worldId === q.worldId &&
              a.countryId === q.countryId &&
              a.ownerId === owner &&
              a.accountClass === 'ASSET' &&
              a.counterpartyEntityId === q.centralBankEntityId &&
              a.currency === q.localCurrency &&
              a.claimId !== null,
          ),
          'EXACT_ORIGINAL_HISTORICAL_CLAIM_ASSET_REQUIRED',
        );
      const mirror = (a: FinancialAccount) =>
        one(
          p.financialAccounts.filter(
            (b) =>
              b.worldId === q.worldId &&
              b.countryId === q.countryId &&
              b.ownerId === q.centralBankEntityId &&
              b.accountClass === 'LIABILITY' &&
              b.counterpartyEntityId === a.ownerId &&
              b.currency === q.localCurrency &&
              b.claimId === a.claimId,
          ),
          'EXACT_ORIGINAL_HISTORICAL_CLAIM_MIRROR_REQUIRED',
        );
      const treasuryAsset = asset(q.governmentEntityId),
        bankSettlementAsset = asset(q.bankEntityId);
      const bankGcuAsset = one(
        p.financialAccounts.filter(
          (a) =>
            a.accountId === q.dealerGcuAccountId &&
            a.countryId === q.countryId &&
            a.ownerId === q.bankEntityId &&
            a.accountClass === 'CASH' &&
            a.currency === 'GCU',
        ),
        'EXACT_ORIGINAL_BANK_GCU_REQUIRED',
      );
      const seen = fxOriginals.find((o) => o.quote.quoteRef === q.quoteRef);
      if (seen) {
        if (!same(seen.quote, q)) invalid('IMMUTABLE_HISTORICAL_QUOTE_CHANGED');
      } else
        fxOriginals.push({
          quote: q,
          treasuryAsset,
          treasuryLiability: mirror(treasuryAsset),
          bankSettlementAsset,
          bankSettlementLiability: mirror(bankSettlementAsset),
          bankGcuAsset,
        });
    }
    const frames = history.frames;
    const captainCountries = frames.some(
      (f) => f.command.commandType === 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1',
    )
      ? await readPostwarCaptainHistoryOriginalsFrom(tx, {
          worldId: command.worldId,
          hostCountryId: command.countryId,
          officeId: 'TREASURY_FX',
          seedFingerprint: p.policy.seedFingerprint,
          admissionRef: original.admissionRef,
          expectedHead: history.head,
          frames,
        })
      : undefined;
    const beneficialHousingRentReceipts =
      readPostwarBeneficialHousingRentMixedOriginalsForDatabase({
        database,
        worldId: command.worldId,
        seedId: original.seedId,
        seedFingerprint: original.seedFingerprint,
      });
    const mixed = replayPreparedFinanceSocialFxLedger({
      prepared: p.ledger,
      ...(beneficialHousingRentReceipts === undefined
        ? {}
        : { beneficialHousingRentReceipts }),
      frames,
      socialCountries: p.social.countries.map((c) => ({
        countryId: c.countryId,
        state: c.state,
        offers: c.offers,
      })),
      openingEncumbrances: p.funding.map((f) => ({
        reference: f.fundingId,
        accountId: f.accountId,
        amount: Money.from(f.ceilingAmount, f.currency).toCanonicalValue()
          .amount,
        currency: f.currency,
      })),
      fxOriginals,
      ...(captainCountries === undefined ? {} : { captainCountries }),
      expectedHead: {
        worldVersion: history.head.worldVersion,
        eventSequence: history.head.eventSequence,
      },
      sha256Hex: sha,
    });
    const financial = mixed.financial;
    const reservations = (
      q: PostwarDayOneFxQuoteData,
      a: PostwarDayOneTreasuryFxAccounts,
      version: string,
      prior: unknown,
    ): PostwarDayOneFxEncumbrances => {
      let total = Money.from('0', q.localCurrency);
      const refs = new Set<string>();
      const add = (
        ref: string,
        account: string,
        owner: string,
        country: string,
        currency: string,
        amount: string,
        claim: string | null,
      ) => {
        if (account !== a.treasuryAsset.accountId && country !== q.countryId)
          return;
        if (
          account !== a.treasuryAsset.accountId ||
          owner !== q.governmentEntityId ||
          country !== q.countryId ||
          currency !== q.localCurrency ||
          (claim !== null && claim !== a.treasuryAsset.claimId) ||
          refs.has(ref)
        )
          invalid('EXACT_UNIQUE_TREASURY_RESERVATION_REQUIRED');
        refs.add(ref);
        const value = Money.from(amount, currency);
        if (value.amount.isNegative()) invalid('NEGATIVE_RESERVATION');
        total = total.add(value);
      };
      for (const r of p.funding.filter(
        (r) =>
          r.payerEntityId === q.governmentEntityId ||
          r.accountId === a.treasuryAsset.accountId,
      ))
        add(
          r.fundingId,
          r.accountId,
          r.payerEntityId,
          r.countryId,
          r.currency,
          r.ceilingAmount,
          null,
        );
      for (const r of mixed.budgetEncumbrances)
        add(
          r.reference,
          r.accountId,
          r.governmentEntityId,
          r.countryId,
          r.currency,
          r.amount,
          r.claimId,
        );
      for (const r of mixed.socialReservations.filter(
        (r) =>
          r.employerId === q.governmentEntityId ||
          r.accountId === a.treasuryAsset.accountId,
      ))
        add(
          r.reservationId,
          r.accountId,
          r.employerId,
          r.countryId,
          r.currency,
          r.amount,
          null,
        );
      // Exhaustive known prefix above proves no family has reserved BANK GCU.
      // FX consumes actual cash and introduces no additional reservation.
      return freeze({
        worldVersion: version,
        treasuryReservedAmount: total.toCanonicalValue().amount,
        bankGcuReservedAmount: '0',
        sourceRef:
          'FX_ENCUMBRANCES_' +
          sha(canonicalHashInput(prior)).slice(0, 40).toUpperCase(),
        sourceSha256: sha(
          canonicalHashInput({
            opening: p.funding,
            budget: mixed.budgetEncumbrances,
            social: mixed.socialReservations,
            prior,
          }),
        ),
      });
    };
    if (financial.worldVersion !== history.head.worldVersion)
      invalid('COMPLETE_FINANCIAL_HEAD_REQUIRED');
    const a = accounts(financial, quote),
      encumbrances = reservations(
        quote,
        a,
        financial.worldVersion,
        history.frames.map((x) => ({
          command: x.command,
          transition: x.transition,
          receipt: x.receipt,
        })),
      );
    const draft = calculatePostwarDayOneTreasuryFx(
      {
        quote,
        payload: JSON.parse(command.canonicalPayload),
        simTime: command.simTime,
        financial,
        accounts: a,
        encumbrances,
      },
      sha,
    );
    const binding = freeze({
      schemaVersion: 'postwar-day-one-fx-read-binding-v1',
      commandFingerprint: command.fingerprint,
      currentHead: history.head,
      registrationRef: original.registrationRef,
      admissionRef: original.admissionRef,
      seedFingerprint: original.seedFingerprint,
      sourceRevision: original.sourceRevision,
      quoteSha256: quote.quoteSha256,
      prefixFingerprint: hash(history.frames),
      encumbrancesHash: hash(encumbrances),
      accountsHash: hash(a),
      draftFingerprint: draft.fingerprint,
    });
    return { financial, draft, binding, history };
  }
  async function proofFrom(
    tx: SqlExecutor,
    c: CanonicalCommand,
    proof: CommitAuthorizationProof | null,
  ) {
    if (
      !isCommitAuthorizationProof(proof) ||
      proof.capability !== 'FINANCE_TREASURY' ||
      proof.commandFingerprint !== c.fingerprint ||
      proof.commandId !== c.commandId ||
      proof.worldId !== c.worldId ||
      proof.countryId !== c.countryId ||
      proof.officeId !== 'FINANCE'
    )
      invalid('GENUINE_TREASURY_COMMIT_AUTHORIZATION_REQUIRED');
    const rows = await tx.query<{
      team_id: string;
      authorization_version: string;
    }>(WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY, [
      c.worldId,
      c.authSubject,
      c.countryId,
      'FINANCE',
      'FINANCE_TREASURY',
    ]);
    if (
      rows.rows.length !== 1 ||
      rows.rows[0]!.team_id !== proof.teamId ||
      rows.rows[0]!.authorization_version !== proof.authorizationVersion
    )
      invalid('CURRENT_TREASURY_MEMBERSHIP_CHANGED');
    await reauthorizeCommitAuthorizationProof(proof);
    return proof;
  }
  const sourceCommitProtectionPort: DayOneFxSourceCommitProtectionPort =
    Object.freeze({
      async assertCurrentFrom(
        tx: SqlExecutor,
        request: Readonly<DayOneFxSourceCommitRequest>,
      ): Promise<Readonly<DayOneFxSourceCommitAudit>> {
        if (active.has(tx)) invalid('NON_REENTRANT_SOURCE_GUARD_REQUIRED');
        active.add(tx);
        try {
          const c = capture(request.command);
          if (
            request.phase !== 'BEFORE_EVENTS' ||
            request.purpose !== DAY_ONE_FX_SOURCE_PURPOSE ||
            request.currentHead.worldId !== c.worldId
          )
            invalid('EXACT_SOURCE_PURPOSE_SCOPE_REQUIRED');
          const proof = await proofFrom(tx, c, request.commitAuthorization);
          const fresh = await derive(tx, c, request.observedAtReal);
          if (
            !same(fresh.binding, request.readBinding) ||
            !same(fresh.history.head, request.currentHead)
          )
            invalid('PREPARED_ORIGINAL_PREFIX_OR_ENCUMBRANCE_CHANGED');
          const settlement = await applyPostwarDayOneTreasuryFx(
            {
              draft: fresh.draft,
              financial: fresh.financial,
              command: c,
              transition: request.transition,
              commitAuthorization: proof,
            },
            sha,
          );
          assertPostwarDayOneTreasuryFxCommitBinding(
            {
              settlement,
              command: c,
              transition: request.transition,
              financialPostingBatches: request.financialPostingBatches,
              commitAuthorization: proof,
            },
            sha,
          );
          if (!same(settlement.postingBatches, request.financialPostingBatches))
            invalid('ACTUAL_SIX_LEGS_DIFFER_FROM_FRESH_SOURCE');
          await proofFrom(tx, c, proof);
          return freeze({
            status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY',
            purpose: DAY_ONE_FX_SOURCE_PURPOSE,
            commandFingerprint: c.fingerprint,
            currentHead: request.currentHead,
            readBindingFingerprint: hash(request.readBinding),
            protectionMode: 'HELD_SOURCE_GUARDS',
          });
        } finally {
          active.delete(tx);
        }
      },
    });
  const candidateFactory: AtomicTransitionCandidateFactory = Object.freeze({
    async prepare(
      input: Parameters<AtomicTransitionCandidateFactory['prepare']>[0],
    ) {
      const command = capture(input.command);
      return track(() =>
        database.transaction(async (tx) => {
          const proof = await proofFrom(tx, command, input.commitAuthorization);
          const durable = new DurableV08LedgerLineageReader({
            database,
            sha256Hex: sha,
          });
          if (
            !same(
              await durable.readCommandFrom(
                tx,
                command.worldId,
                command.commandId,
              ),
              command,
            )
          )
            invalid('ACTUAL_SUBMISSION_DIFFERS');
          const fresh = await derive(tx, command, input.observedAtReal);
          const rows = await tx.query<Record<string, unknown>>(
            'select world_id,holder_id,fencing_token::text,acquired_at_real,renewed_at_real,lease_expires_at_real from world_v2.world_writer_lease where world_id=$1 and holder_id=$2 and lease_expires_at_real>$3::timestamptz for share',
            [command.worldId, config.workerId, input.observedAtReal],
          );
          const l = one(rows.rows, 'ACTUAL_WRITER_LEASE_REQUIRED');
          const lease = parseWorldWriterLease({
            schemaVersion: 'world-writer-lease-v1',
            worldId: String(l.world_id),
            holderId: String(l.holder_id),
            fencingToken: String(l.fencing_token),
            acquiredAtReal: time(l.acquired_at_real),
            renewedAtReal: time(l.renewed_at_real),
            expiresAtReal: time(l.lease_expires_at_real),
          });
          const q = await tx.query<Record<string, unknown>>(
            'select authority_kind,queue_state,claimed_by,claim_fencing_token::text,available_at_sim_time::text from world_v2.command_queue where world_id=$1 and command_id=$2 for share',
            [command.worldId, command.commandId],
          );
          const claim = one(q.rows, 'ACTUAL_CLAIM_REQUIRED');
          if (
            claim.authority_kind !== 'DISCRETIONARY_USER' ||
            claim.queue_state !== 'CLAIMED' ||
            claim.claimed_by !== lease.holderId ||
            claim.claim_fencing_token !== lease.fencingToken ||
            BigInt(String(claim.available_at_sim_time)) > command.simTime.ticks
          )
            invalid('ACTUAL_DISCRETIONARY_CLAIM_AND_FENCE_REQUIRED');
          const event = parseAuthoritativeEvent(
            {
              schemaVersion: 'event-v1',
              eventId: 'TREASURY_FX_EVENT_' + command.commandId,
              eventType: POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_EVENT,
              worldId: command.worldId,
              causationCommandId: command.commandId,
              correlationId: command.correlationId,
              worldVersion: (
                BigInt(fresh.history.head.worldVersion) + 1n
              ).toString(),
              sequence: (
                BigInt(fresh.history.head.eventSequence) + 1n
              ).toString(),
              simTime: command.simTime.toCanonicalValue(),
              recordedAtReal: input.observedAtReal,
              correctsEventId: null,
              payload: fresh.draft.eventPayload,
            },
            sha,
          );
          const transition = createAuthoritativeTransition({
            command,
            worldVersionBefore: fresh.history.head.worldVersion,
            worldVersionAfter: event.worldVersion,
            events: [event],
          });
          const settlement = await applyPostwarDayOneTreasuryFx(
            {
              draft: fresh.draft,
              financial: fresh.financial,
              command,
              transition,
              commitAuthorization: proof,
            },
            sha,
          );
          const draft: AtomicTransitionDraft = freeze({
            transition,
            financialPostingBatches: settlement.postingBatches,
            inventoryPostings: [],
            currentMaterializations: [],
            outboxMessages: [],
            receipt: createFinalCommandReceipt({
              command,
              transition,
              outcome: 'COMMITTED',
              reasonCode: null,
              simTime: command.simTime,
              recordedAtReal: input.observedAtReal,
            }),
            authorityKind: 'DISCRETIONARY_USER',
            commitAssertion: createWorldWriterCommitAssertion(
              lease,
              command.expectedWorldVersion!,
            ),
            observedAtReal: input.observedAtReal,
            officeOperatingSourceReadBinding: fresh.binding,
          });
          return draft;
        }),
      );
    },
  });
  issuedPorts.add(sourceCommitProtectionPort);
  const runtime: PostwarDayOneFxRuntime = Object.freeze({
    sourceBoundary: 'REGISTERED_DAY_ONE_TREASURY_FX_NO_LEGACY_FALLBACK',
    candidateFactory,
    sourceCommitProtectionPort,
    async prepare(input: PostwarDayOneFxPreparationInput) {
      if (closed || prepared || preparing)
        invalid('SINGLE_LIVE_STARTUP_PREPARATION_REQUIRED');
      preparing = true;
      try {
        const policy = createPostwarDayOneFxPolicy(input);
        if (policy.worldId !== config.worldId)
          invalid('STARTUP_WORLD_MISMATCH');
        const opening = readPostwarOperatingGenesisFromSeed(input.seed);
        if (!opening.socialEmployment) invalid('REAL_SOCIAL_OPENING_REQUIRED');
        const financial = rebuildV08LedgersFromLineage({
          seed: input.seed,
          sha256Hex: sha,
        }).financial;
        prepared = Object.freeze({
          policy,
          ledger: prepareFinanceSocialLedger(financial),
          financialAccounts: financial.accounts,
          social: opening.socialEmployment,
          funding: opening.facts.funding,
        });
      } finally {
        preparing = false;
      }
    },
    preflightCanonical: (command: CanonicalCommand, observedAtReal: string) =>
      track(() =>
        database.transaction(async (tx) => {
          await derive(tx, command, observedAtReal);
        }),
      ),
    quotes() {
      if (!prepared || closed) invalid('SOURCE_NOT_PREPARED');
      return prepared.policy.quotes;
    },
    treasuryGcuAccountId(country: string) {
      if (!prepared || closed) invalid('SOURCE_NOT_PREPARED');
      return govGcu(
        one(
          prepared.policy.quotes.filter((q) => q.countryId === country),
          'COUNTRY_SOURCE_REQUIRED',
        ),
      ).accountId;
    },
    async close() {
      closed = true;
      await Promise.allSettled([...pending]);
      prepared = null;
    },
  });
  issuedRuntimes.add(runtime);
  return runtime;
}
