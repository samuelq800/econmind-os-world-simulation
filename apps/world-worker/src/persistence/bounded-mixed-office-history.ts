/** Complete bounded Budget/Social replay, DATA_ONLY. No seed hydration, skipped
 * frame, admission, authorization or commit capability is created here. Call
 * only inside the existing Finance custody/lease/head transaction through its
 * final source recheck. Country originals come from fixed SQL, never requests. */
import { createHash } from 'node:crypto';
import {
  DomainError,
  DOMAIN_ERROR_CODES,
  canonicalSerialize,
  Money,
  type FinancialLedgerState,
  type SocialEmploymentServiceState,
  type SocialEmploymentWageOffer,
} from '@econmind/core';
import {
  prepareFinanceNativeBudgetMixedPrefix,
  readFinanceNativeBudgetMixedPrefix,
  type FinanceNativeBudgetMixedPrefixResult,
  type FinanceNativeBudgetMixedPrefixEvidence,
  type FinanceNativeBudgetState,
} from '@econmind/core/finance-budget-native';
import { type BoundedPostwarCanonicalFrame } from './bounded-postwar-fx-postings.js';
import { POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND } from '@econmind/core/authenticated-office-command-contract';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import {
  readPostwarSocialRuntimeFinancialReplayBase,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import { replayPreparedPostwarFinanceSocialFxFrom } from './prepared-postwar-finance-social-fx-replay.js';

import {
  readBoundedPostwarCanonicalPrefixFrom,
  BOUNDED_POSTWAR_PREFIX_LIMITS as BOUNDED_MIXED_OFFICE_LIMITS,
} from './bounded-postwar-canonical-prefix.js';
export { BOUNDED_POSTWAR_PREFIX_LIMITS as BOUNDED_MIXED_OFFICE_LIMITS } from './bounded-postwar-canonical-prefix.js';
export const BOUNDED_MIXED_SOCIAL_SOURCE_SCHEMA =
  'finance-budget-mixed-social-source-v1';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Bounded mixed prefix: ' + message,
  );
}
const text = (v: unknown): string => {
  if (typeof v !== 'string' || !v || v.trim() !== v)
    invalid('noncanonical durable field');
  return v;
};
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('sealed source object required');
  return v as Record<string, unknown>;
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
export interface BoundedMixedOfficeSourcePins {
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly canonicalSeedSha256: string;
}
export interface BoundedMixedOfficeFundingAccount {
  readonly countryId: string;
  readonly accountRef: string;
  readonly claimId: string;
  readonly payerEntityId: string;
  readonly issuerEntityId: string;
  readonly payerRole: 'GOV';
  readonly currency: string;
  readonly availableAmount: string;
  readonly reservedAmount: string;
}
/** Public data shape only; the private Core ledger provenance remains on the
 * actual object but is never exported as a transferable authority constructor. */
export interface BoundedMixedOfficeHistory {
  readonly classification: 'COMPLETE_BOUNDED_CORE_REPLAY_DATA_ONLY';
  readonly head: Readonly<{ world_version: string; event_sequence: string }>;
  readonly frames: readonly BoundedPostwarCanonicalFrame[];
  readonly state: FinanceNativeBudgetState;
  readonly mixedPrefixEvidence: FinanceNativeBudgetMixedPrefixEvidence;
  readonly socialReservations: FinanceNativeBudgetMixedPrefixResult['socialReservations'];
  readonly sourceBindings: readonly Readonly<{
    countryId: string;
    sourceSha256: string;
    sourceRef: string;
  }>[];
  readonly fundingAccounts: readonly BoundedMixedOfficeFundingAccount[];
  readonly financialState?: Readonly<FinancialLedgerState>;
  readonly prefixBytes: number;
  readonly sourceBytes: number;
}
export async function readBoundedMixedOfficeHistoryFrom(input: {
  readonly executor: SqlExecutor;
  readonly database: SqlDatabase;
  readonly worldId: string;
  readonly countryId: string;
  readonly expectedWorldVersion: string | null;
  readonly workerId: string;
  readonly observedAtReal: string;
  readonly envelopeRef: string;
  readonly effectivePeriodRef: string;
  readonly sourcePins: BoundedMixedOfficeSourcePins;
  readonly preparedSocialConnection?: Readonly<PostwarSocialRuntimeConnection>;
}): Promise<Readonly<BoundedMixedOfficeHistory>> {
  const tx = input.executor,
    limit = BOUNDED_MIXED_OFFICE_LIMITS;
  const prefix = await readBoundedPostwarCanonicalPrefixFrom(tx, {
    worldId: input.worldId,
    countryId: input.countryId,
    officeId: 'FINANCE',
  });
  const head = {
    world_version: prefix.head.worldVersion,
    event_sequence: prefix.head.eventSequence,
  };
  if (head.world_version !== input.expectedWorldVersion)
    invalid('stale head or bounded replay capacity exceeded');
  const frames = prefix.frames,
    prefixBytes = prefix.prefixBytes;
  const participants = new Set<string>([input.countryId]);
  for (const f of frames)
    if (f.command.commandType !== POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND)
      participants.add(f.command.countryId);
  let sourceBytes = 0;
  const countries: {
      countryId: string;
      state: SocialEmploymentServiceState;
      offers: readonly SocialEmploymentWageOffer[];
    }[] = [],
    funding: BoundedMixedOfficeFundingAccount[] = [],
    sourceBindings: {
      countryId: string;
      sourceSha256: string;
      sourceRef: string;
    }[] = [];
  for (const country of [...participants].sort()) {
    const rows = await tx.query<{
      source_ref: string;
      source_text: string;
      source_sha256: string;
    }>(
      'select * from world_v2.read_finance_budget_mixed_social_original($1,$2,$3,$4,$5,$6,$7::timestamptz)',
      [
        input.worldId,
        input.countryId,
        country,
        input.envelopeRef,
        input.effectivePeriodRef,
        input.workerId,
        input.observedAtReal,
      ],
    );
    if (rows.rows.length !== 1)
      invalid('sealed participant country source required');
    const row = rows.rows[0]!,
      bytes = text(row.source_text);
    sourceBytes += Buffer.byteLength(bytes);
    if (
      Buffer.byteLength(bytes) > limit.countryBytes ||
      sourceBytes > limit.totalCountryBytes ||
      sha(bytes) !== row.source_sha256
    )
      invalid('sealed country bytes/hash capacity mismatch');
    const p = object(JSON.parse(bytes));
    if (
      p.schemaVersion !== BOUNDED_MIXED_SOCIAL_SOURCE_SCHEMA ||
      p.worldId !== input.worldId ||
      p.countryId !== country ||
      p.seedId !== input.sourcePins.seedId ||
      p.seedFingerprint !== input.sourcePins.seedFingerprint ||
      p.admissionRef !== input.sourcePins.admissionRef ||
      p.canonicalSeedSha256 !== input.sourcePins.canonicalSeedSha256 ||
      !Array.isArray(p.offers) ||
      !Array.isArray(p.fundingAccounts)
    )
      invalid('sealed source admission/scope mismatch');
    const state = object(p.state);
    if (
      state.schemaVersion !== 'social-employment-service-state-v1' ||
      state.worldId !== input.worldId ||
      !Array.isArray(state.plans) ||
      state.plans.length !== 0 ||
      !Array.isArray(state.appliedOperations) ||
      state.appliedOperations.length !== 0
    )
      invalid('genuine H0 country state required');
    countries.push({
      countryId: country,
      state: state as unknown as SocialEmploymentServiceState,
      offers: p.offers as unknown as readonly SocialEmploymentWageOffer[],
    });
    for (const raw of p.fundingAccounts) {
      const a = object(raw);
      if (
        a.countryId !== country ||
        a.payerRole !== 'GOV' ||
        funding.some(
          (f) => f.accountRef === a.accountRef || f.claimId === a.claimId,
        )
      )
        invalid('unique actual GOV country account required');
      for (const key of [
        'accountRef',
        'claimId',
        'payerEntityId',
        'issuerEntityId',
        'currency',
      ])
        text(a[key]);
      for (const key of ['availableAmount', 'reservedAmount']) {
        const raw = text(a[key]);
        if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(raw))
          invalid('canonical actual account capacity required');
        const amount = Money.from(raw, text(a.currency));
        if (amount.amount.isNegative())
          invalid('canonical actual account capacity required');
        // The immutable original may retain cents ("18174961792.80").
        // Normalize its exact decimal value for the calculation DTO only;
        // source_text/source_sha256 and the original provenance stay intact.
        a[key] = amount.toCanonicalValue().amount;
      }
      funding.push(a as unknown as BoundedMixedOfficeFundingAccount);
    }
    sourceBindings.push({
      countryId: country,
      sourceSha256: text(row.source_sha256),
      sourceRef: text(row.source_ref),
    });
  }
  const hasFx = frames.some(
    (f) => f.command.commandType === POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND,
  );
  if (hasFx && !input.preparedSocialConnection)
    invalid('genuine prepared H0 baseline required for FX financial effects');
  const baseline = hasFx
    ? readPostwarSocialRuntimeFinancialReplayBase(
        input.preparedSocialConnection!,
        input.worldId,
      )
    : null;
  if (baseline)
    for (const country of countries) {
      const expected = baseline.document.countries.filter(
        (c) => c.countryId === country.countryId,
      );
      if (
        expected.length !== 1 ||
        canonicalSerialize(expected[0]!.state) !==
          canonicalSerialize(country.state) ||
        canonicalSerialize(expected[0]!.offers) !==
          canonicalSerialize(country.offers)
      )
        invalid('prepared country baseline differs from actual sealed source');
    }
  const fxReplay = baseline
    ? await replayPreparedPostwarFinanceSocialFxFrom({
        executor: tx,
        baseline,
        worldId: input.worldId,
        hostCountryId: input.countryId,
        officeId: 'FINANCE',
        seedId: input.sourcePins.seedId,
        seedFingerprint: input.sourcePins.seedFingerprint,
        admissionRef: input.sourcePins.admissionRef,
        frames,
        expectedHead: {
          worldVersion: head.world_version,
          eventSequence: head.event_sequence,
        },
      })
    : null;
  const mixedPrefixEvidence =
    fxReplay?.mixedPrefixEvidence ??
    prepareFinanceNativeBudgetMixedPrefix(
      { worldId: input.worldId, frames, socialCountries: countries },
      sha,
    );
  const result =
    fxReplay ??
    readFinanceNativeBudgetMixedPrefix(
      mixedPrefixEvidence,
      input.worldId,
      frames,
      sha,
    );
  if (
    result.budgetState.worldVersion !== head.world_version ||
    result.budgetState.eventSequence !== head.event_sequence
  )
    invalid('computed complete prefix differs from actual head');
  const totals = new Map(
    funding.map((a) => [
      a.accountRef,
      Money.from(a.reservedAmount, a.currency),
    ]),
  );
  for (const c of [
    ...result.budgetEncumbrances.map((c) => ({
      ...c,
      ownerId: c.governmentEntityId,
    })),
    ...result.socialReservations.map((r) => ({
      ...r,
      ownerId: r.employerId,
      claimId: null,
    })),
  ]) {
    const a = funding.find(
      (a) =>
        a.accountRef === c.accountId &&
        a.countryId === c.countryId &&
        a.payerEntityId === c.ownerId &&
        a.currency === c.currency &&
        (c.claimId === null || a.claimId === c.claimId),
    );
    if (!a) invalid('exact actual capacity account/owner/claim required');
    totals.set(
      a.accountRef,
      totals.get(a.accountRef)!.add(Money.from(c.amount, c.currency)),
    );
  }
  for (const a of funding) {
    const current = fxReplay?.financial.positions.find(
      (p) => p.account.accountId === a.accountRef,
    );
    if (
      fxReplay &&
      (!current ||
        current.account.countryId !== a.countryId ||
        current.account.ownerId !== a.payerEntityId ||
        current.account.claimId !== a.claimId ||
        current.account.currency !== a.currency ||
        current.account.counterpartyEntityId !== a.issuerEntityId ||
        current.account.accountClass !== 'ASSET')
    )
      invalid(
        'actual replayed treasury account differs from immutable funding original',
      );
    const available =
      current?.netDebitBalance ?? Money.from(a.availableAmount, a.currency);
    if (totals.get(a.accountRef)!.amount.greaterThan(available.amount))
      invalid('global fiscal capacity overbooked');
  }
  return freeze({
    classification: 'COMPLETE_BOUNDED_CORE_REPLAY_DATA_ONLY' as const,
    head,
    frames,
    state: result.budgetState,
    mixedPrefixEvidence,
    socialReservations: result.socialReservations,
    sourceBindings,
    fundingAccounts: funding,
    ...(fxReplay ? { financialState: fxReplay.financial } : {}),
    prefixBytes,
    sourceBytes,
  });
}
