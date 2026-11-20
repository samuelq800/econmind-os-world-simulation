/** Fixed capacity source adapter. Independent Workers-compatible modes read
 * the sealed small source and their complete bounded supported prefix. The
 * explicitly bound shared host reuses its genuine paired Social H0 baseline
 * and same-transaction complete pages. Neither path accepts a Ready flag,
 * caller ledger/state or new source/commit authority. */
import { createHash } from 'node:crypto';
import {
  DomainError,
  DOMAIN_ERROR_CODES,
  canonicalHashInput,
  canonicalSha256,
  countryId as canonicalCountryId,
  worldId as canonicalWorldId,
  validateCanonicalCommand,
  canonicalSerialize,
  Money,
  type CanonicalCommand,
} from '@econmind/core';
import {
  parseFinanceBudgetCapacityData,
  readFinanceBudgetCapacityData,
} from '@econmind/core/finance-budget-capacity-data';
import type {
  FinanceNativeBudgetPolicy,
  FinanceNativeBudgetSource,
} from '@econmind/core/finance-budget-native';
import { readBoundedFinanceBudgetHistoryFrom } from './bounded-finance-budget-history.js';
import { readBoundedMixedOfficeHistoryFrom } from './bounded-mixed-office-history.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import {
  isPostwarSocialRuntimeConnection,
  readPostwarSocialRuntimeConnectionResources,
  readPostwarSocialRuntimeFinancialReplayBase,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import { consumePreparedPostwarSocialFinancialReplayBase } from './prepared-postwar-social-source.js';
import { readPreparedFinanceSocialOpening } from '@econmind/core/finance-social-prepared-ledger';
import {
  readPagedFromPreparedSocialBaseOnHeldExecutor,
  releasePostwarPagedFinanceSocialReplay,
} from './postwar-paged-finance-social-replay.js';
declare const capacitySource: unique symbol;
export interface PostgresFinanceBudgetCapacitySource {
  readonly [capacitySource]: true;
}
const sources = new WeakMap<
  PostgresFinanceBudgetCapacitySource,
  {
    worldId: string;
    countryId: string;
    expectedRawSourceSHA256: string | null;
    historyMode: 'BUDGET_ONLY' | 'BUDGET_SOCIAL';
  }
>();
// A route is only a finite server selector over the original fixed adapters.
// It carries no policy, balance, currentness, SQL privilege or admission fact.
const worldSources = new WeakMap<
  PostgresFinanceBudgetCapacitySource,
  {
    readonly worldId: string;
    readonly sourcesByCountry: ReadonlyMap<
      string,
      PostgresFinanceBudgetCapacitySource
    >;
    readonly countryIds: readonly string[];
    readonly historyMode: 'BUDGET_SOCIAL';
  }
>();
const replayBoundSources = new WeakMap<
  PostgresFinanceBudgetCapacitySource,
  {
    source: PostgresFinanceBudgetCapacitySource;
    social: Readonly<PostwarSocialRuntimeConnection>;
  }
>();
/** Fixed same-World private-instance binding; no supplied ledger, callback,
 * copied reader or ready flag. Original independent source behavior is retained. */
export function bindPostgresFinanceBudgetCapacitySourceToSocialReplay(
  source: PostgresFinanceBudgetCapacitySource,
  social: Readonly<PostwarSocialRuntimeConnection>,
): PostgresFinanceBudgetCapacitySource {
  const scope = readPostgresFinanceBudgetCapacitySourceScope(source);
  if (!isPostwarSocialRuntimeConnection(social, scope.worldId))
    invalid('genuine same-World Social data preparation required');
  const countries =
    readPostwarSocialRuntimeConnectionResources(social).countryIds;
  if (scope.countryIds.some((c) => !countries.includes(c)))
    invalid('exact Social country roster required');
  const bound = Object.freeze({}) as PostgresFinanceBudgetCapacitySource;
  replayBoundSources.set(bound, {
    source: replayBoundSources.get(source)?.source ?? source,
    social,
  });
  return bound;
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), sha);
function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Budget capacity source: ' + message,
  );
}
export function createPostgresFinanceBudgetCapacitySource(config: {
  readonly worldId: string;
  readonly countryId: string;
  readonly expectedRawSourceSHA256?: string;
  /** Explicit server configuration; the original Budget-only mode stays default. */
  readonly historyMode?: 'BUDGET_ONLY' | 'BUDGET_SOCIAL';
}): PostgresFinanceBudgetCapacitySource {
  if (
    !config.worldId ||
    !config.countryId ||
    (config.historyMode !== undefined &&
      config.historyMode !== 'BUDGET_ONLY' &&
      config.historyMode !== 'BUDGET_SOCIAL') ||
    (config.expectedRawSourceSHA256 !== undefined &&
      !/^[a-f0-9]{64}$/u.test(config.expectedRawSourceSHA256))
  )
    invalid('exact server selectors/hash required');
  const port = Object.freeze({}) as PostgresFinanceBudgetCapacitySource;
  sources.set(port, {
    worldId: config.worldId,
    countryId: config.countryId,
    expectedRawSourceSHA256: config.expectedRawSourceSHA256 ?? null,
    historyMode: config.historyMode ?? 'BUDGET_ONLY',
  });
  return port;
}
export function isPostgresFinanceBudgetCapacitySource(
  value: unknown,
  worldId: string,
): value is PostgresFinanceBudgetCapacitySource {
  return (
    !!value &&
    typeof value === 'object' &&
    (sources.get(
      replayBoundSources.get(value as PostgresFinanceBudgetCapacitySource)
        ?.source ?? (value as PostgresFinanceBudgetCapacitySource),
    )?.worldId === worldId ||
      worldSources.get(
        replayBoundSources.get(value as PostgresFinanceBudgetCapacitySource)
          ?.source ?? (value as PostgresFinanceBudgetCapacitySource),
      )?.worldId === worldId)
  );
}

/** Explicit deployment selector, normally taken from the actually adopted
 * Social country roster. Never take this configuration from an intake request.
 * Each selected country still has to supply its actual admitted SQL original,
 * policy, current actor and lease when the original fixed reader runs. */
export function createPostgresFinanceBudgetWorldCapacitySource(config: {
  readonly worldId: string;
  readonly countries: readonly {
    readonly countryId: string;
    readonly expectedRawSourceSHA256?: string;
  }[];
  readonly historyMode: 'BUDGET_SOCIAL';
}): PostgresFinanceBudgetCapacitySource {
  if (
    !config ||
    typeof config.worldId !== 'string' ||
    config.historyMode !== 'BUDGET_SOCIAL' ||
    !Array.isArray(config.countries) ||
    config.countries.length < 1 ||
    config.countries.length > 70
  )
    invalid(
      'finite adopted country selectors and explicit mixed history required',
    );
  canonicalWorldId(config.worldId);
  const sourcesByCountry = new Map<
    string,
    PostgresFinanceBudgetCapacitySource
  >();
  for (const country of config.countries) {
    if (!country || typeof country.countryId !== 'string')
      invalid('exact configured country required');
    canonicalCountryId(country.countryId);
    if (sourcesByCountry.has(country.countryId))
      invalid('duplicate configured country');
    sourcesByCountry.set(
      country.countryId,
      createPostgresFinanceBudgetCapacitySource({
        worldId: config.worldId,
        countryId: country.countryId,
        historyMode: 'BUDGET_SOCIAL',
        ...(country.expectedRawSourceSHA256 === undefined
          ? {}
          : { expectedRawSourceSHA256: country.expectedRawSourceSHA256 }),
      }),
    );
  }
  const port = Object.freeze({}) as PostgresFinanceBudgetCapacitySource;
  worldSources.set(port, {
    worldId: config.worldId,
    sourcesByCountry,
    countryIds: Object.freeze([...sourcesByCountry.keys()].sort()),
    historyMode: 'BUDGET_SOCIAL',
  });
  return port;
}

export function isPostgresFinanceBudgetWorldCapacitySource(
  value: unknown,
  worldId: string,
): value is PostgresFinanceBudgetCapacitySource {
  return (
    !!value &&
    typeof value === 'object' &&
    worldSources.get(
      replayBoundSources.get(value as PostgresFinanceBudgetCapacitySource)
        ?.source ?? (value as PostgresFinanceBudgetCapacitySource),
    )?.worldId === worldId
  );
}

/** Immutable selector metadata only, not proof that any SQL source is ready. */
export function readPostgresFinanceBudgetCapacitySourceScope(
  source: PostgresFinanceBudgetCapacitySource,
): Readonly<{
  kind: 'COUNTRY' | 'FINITE_WORLD';
  worldId: string;
  countryIds: readonly string[];
  historyMode: 'BUDGET_ONLY' | 'BUDGET_SOCIAL';
}> {
  const actualSource = replayBoundSources.get(source)?.source ?? source;
  const world = worldSources.get(actualSource);
  if (world)
    return Object.freeze({
      kind: 'FINITE_WORLD',
      worldId: world.worldId,
      countryIds: world.countryIds,
      historyMode: world.historyMode,
    });
  const fixed = sources.get(actualSource);
  if (!fixed) invalid('genuine server capacity source required');
  return Object.freeze({
    kind: 'COUNTRY',
    worldId: fixed.worldId,
    countryIds: Object.freeze([fixed.countryId]),
    historyMode: fixed.historyMode,
  });
}
export async function readPostgresFinanceBudgetCapacitySourceFrom(input: {
  readonly source: PostgresFinanceBudgetCapacitySource;
  readonly executor: SqlExecutor;
  readonly database: SqlDatabase;
  readonly command: CanonicalCommand;
  readonly policy: FinanceNativeBudgetPolicy;
  readonly sourceRow: Readonly<Record<string, unknown>>;
  readonly workerId: string;
  readonly observedAtReal: string;
}): Promise<Readonly<FinanceNativeBudgetSource>> {
  const c = input.command,
    tx = input.executor;
  validateCanonicalCommand(c, sha);
  const replayBinding = replayBoundSources.get(input.source);
  const actualSource = replayBinding?.source ?? input.source;
  const world = worldSources.get(actualSource);
  const fixed =
    world?.worldId === c.worldId
      ? world.sourcesByCountry.get(c.countryId)
      : actualSource;
  const config = fixed === undefined ? undefined : sources.get(fixed);
  if (
    !config ||
    config.worldId !== c.worldId ||
    config.countryId !== c.countryId
  )
    invalid('exact source scope required');
  await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
    c.authSubject,
  ]);
  const rows = await tx.query<{
    capacity_ref: string;
    source_text: string;
    source_sha256: string;
    canonical_seed_sha256: string;
  }>(
    'select * from world_v2.read_finance_budget_capacity($1,$2,$3,$4,$5,$6::timestamptz)',
    [
      c.worldId,
      c.countryId,
      input.policy.envelopeRef,
      input.policy.effectivePeriodRef,
      input.workerId,
      input.observedAtReal,
    ],
  );
  if (rows.rows.length !== 1) invalid('sealed source unavailable');
  const row = rows.rows[0]!;
  if (
    typeof row.source_text !== 'string' ||
    Buffer.byteLength(row.source_text) > 65536 ||
    sha(row.source_text) !== row.source_sha256 ||
    (config.expectedRawSourceSHA256 !== null &&
      config.expectedRawSourceSHA256 !== row.source_sha256)
  )
    invalid('sealed source bytes/hash mismatch');
  const data = parseFinanceBudgetCapacityData(JSON.parse(row.source_text)),
    p = readFinanceBudgetCapacityData(data);
  if (
    p.worldId !== c.worldId ||
    p.countryId !== c.countryId ||
    p.seedId !== input.sourceRow.seed_id ||
    p.seedFingerprint !== input.sourceRow.seed_fingerprint ||
    p.admissionRef !== input.sourceRow.admission_ref ||
    p.governmentEntityId !== input.policy.governmentEntityId ||
    p.treasury.assetAccount.currency !== input.policy.currency ||
    p.canonicalSeedSha256 !== 'sha256:' + row.canonical_seed_sha256
  )
    invalid('sealed source differs from actual admitted policy');
  if (replayBinding !== undefined) {
    const b = consumePreparedPostwarSocialFinancialReplayBase(
        readPostwarSocialRuntimeFinancialReplayBase(
          replayBinding.social,
          c.worldId,
        ),
      ),
      opening = readPreparedFinanceSocialOpening(b.prepared),
      allocations = b.funding
        .filter((f) => f.accountId === p.treasury.assetAccount.accountId)
        .sort((a, b) => a.fundingId.localeCompare(b.fundingId));
    if (
      opening.seedId !== p.seedId ||
      opening.seedFingerprint !== p.seedFingerprint ||
      b.pins.admissionRef !== p.admissionRef ||
      b.sourceMetadata.filter((s) => s.sourceId === p.financialSourceId)
        .length !== 1
    )
      invalid('genuine paired source differs from sealed opening');
    for (const [account, amount, negative] of [
      [p.treasury.assetAccount, p.treasury.assetAmount, false],
      [p.treasury.liabilityAccount, p.treasury.liabilityAmount, true],
    ] as const) {
      const positions = opening.financial.positions.filter(
          (x) => x.account.accountId === account.accountId,
        ),
        expected = Money.from(amount, account.currency);
      if (
        positions.length !== 1 ||
        canonicalSerialize(positions[0]!.account) !==
          canonicalSerialize(account) ||
        !positions[0]!.netDebitBalance.amount.equals(
          negative ? expected.amount.negated() : expected.amount,
        )
      )
        invalid(
          'actual H0 TGA or reciprocal claim differs from sealed capacity',
        );
    }
    let total = Money.from('0', p.treasury.assetAccount.currency);
    for (const f of allocations) {
      if (
        f.countryId !== c.countryId ||
        f.payerEntityId !== p.governmentEntityId ||
        f.currency !== total.currency
      )
        invalid('opening funding differs from exact actual treasury scope');
      total = total.add(Money.from(f.ceilingAmount, f.currency));
    }
    let recordsHash = 'sha256:' + sha(canonicalSerialize(allocations));
    if (recordsHash !== p.openingFunding.recordsSha256) {
      // The original SQL publisher retained the PostgreSQL jsonb-text digest;
      // the newer fixed manifest publisher retains canonical JSON instead.
      // Re-encode the very same genuine H0 records, without substituting rows,
      // rounding amounts or accepting a caller-supplied hash/representation.
      const encoded = await tx.query<{ sha256: string }>(
        "select encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex') as sha256",
        [canonicalSerialize(allocations)],
      );
      if (
        encoded.rows.length !== 1 ||
        !/^[a-f0-9]{64}$/u.test(encoded.rows[0]?.sha256 ?? '')
      )
        invalid('exact original SQL funding representation required');
      recordsHash = 'sha256:' + encoded.rows[0]!.sha256;
    }
    if (
      String(allocations.length) !== p.openingFunding.recordCount ||
      recordsHash !== p.openingFunding.recordsSha256 ||
      total.toCanonicalValue().amount !== p.openingFunding.totalAmount
    )
      invalid('complete unique opening funding differs from sealed capacity');
    const paged = await readPagedFromPreparedSocialBaseOnHeldExecutor(tx, {
      socialConnection: replayBinding.social,
      worldId: c.worldId,
      hostCountryId: c.countryId,
    });
    try {
      if (
        paged.seedPins.seedFingerprint !== p.seedFingerprint ||
        paged.seedPins.admissionRef !== p.admissionRef ||
        paged.view.head.worldVersion !== c.expectedWorldVersion ||
        !paged.view.result.financialState ||
        c.simTime.ticks < BigInt(paged.metadata.maxCommandSimTimeTicks)
      )
        invalid('actual paged prefix/source/head differs from current command');
      const reservations = paged.view.result.socialReservations.filter(
        (r) =>
          r.countryId === c.countryId ||
          r.accountId === p.treasury.assetAccount.accountId,
      );
      for (const r of reservations)
        if (
          r.countryId !== c.countryId ||
          r.accountId !== p.treasury.assetAccount.accountId ||
          r.employerId !== p.governmentEntityId ||
          r.currency !== p.treasury.assetAccount.currency
        )
          invalid('mixed reservation differs from exact treasury scope');
      const encumbrances = Object.freeze([
        Object.freeze({
          reference:
            'OPENING_FUNDING_TOTAL_' +
            p.openingFunding.recordsSha256.slice(7).toUpperCase(),
          accountId: p.treasury.assetAccount.accountId,
          amount: p.openingFunding.totalAmount,
          currency: p.treasury.assetAccount.currency,
        }),
        ...reservations.map((r) =>
          Object.freeze({
            reference: r.reservationId,
            accountId: r.accountId,
            amount: r.amount,
            currency: r.currency,
          }),
        ),
      ]);
      return Object.freeze({
        policy: input.policy,
        financialState: paged.view.result.financialState,
        mixedPrefixEvidence: paged.view.lastPage.evidence,
        frames: null,
        pagedPrefix: Object.freeze({
          evidence: paged.view.lastPage.evidence,
          lastPageFrames: paged.view.lastPage.frames,
        }),
        binding: Object.freeze({
          seedRef: p.seedId,
          seedFingerprint: p.seedFingerprint,
          admissionRef: p.admissionRef,
          financialSourceId: p.financialSourceId,
          originalsSHA256: p.financialOriginalsSha256,
          policyHash: hash(input.policy),
          treasuryAccountId: p.treasury.assetAccount.accountId,
          treasuryClaimId: p.treasury.assetAccount.claimId!,
          openingEncumbranceHash: hash(encumbrances),
          capacityProjectionFingerprint: hash(p),
          mixedSourceBindingsFingerprint: hash({
            schemaVersion: 'finance-paged-source-bindings-v1',
            seedPins: paged.seedPins,
            sourceMetadata: b.sourceMetadata,
            pageChainFingerprint: paged.metadata.pageChainFingerprint,
          }),
        }),
        openingEncumbrances: encumbrances,
        worldVersion: paged.view.head.worldVersion,
        eventSequence: paged.view.head.eventSequence,
      });
    } finally {
      releasePostwarPagedFinanceSocialReplay(paged);
    }
  }
  const mixed =
    config.historyMode === 'BUDGET_SOCIAL'
      ? await readBoundedMixedOfficeHistoryFrom({
          executor: tx,
          database: input.database,
          worldId: c.worldId,
          countryId: c.countryId,
          expectedWorldVersion: c.expectedWorldVersion,
          workerId: input.workerId,
          observedAtReal: input.observedAtReal,
          envelopeRef: input.policy.envelopeRef,
          effectivePeriodRef: input.policy.effectivePeriodRef,
          sourcePins: {
            seedId: p.seedId,
            seedFingerprint: p.seedFingerprint,
            admissionRef: p.admissionRef,
            canonicalSeedSha256: p.canonicalSeedSha256,
          },
        })
      : null;
  if (mixed !== null) {
    const accounts = mixed.fundingAccounts.filter(
      (a) =>
        a.countryId === c.countryId ||
        a.accountRef === p.treasury.assetAccount.accountId,
    );
    if (accounts.length !== 1)
      invalid('unique target actual GOV treasury source required');
    const a = accounts[0]!;
    if (
      a.countryId !== c.countryId ||
      a.accountRef !== p.treasury.assetAccount.accountId ||
      a.claimId !== p.treasury.assetAccount.claimId ||
      a.payerEntityId !== p.governmentEntityId ||
      a.issuerEntityId !== p.centralBankEntityId ||
      a.payerRole !== 'GOV' ||
      a.currency !== p.treasury.assetAccount.currency ||
      a.availableAmount !== p.treasury.assetAmount ||
      a.reservedAmount !== p.openingFunding.totalAmount
    )
      invalid('mixed original differs from sealed treasury/funding capacity');
  }
  const prefix =
    mixed ??
    (await readBoundedFinanceBudgetHistoryFrom({
      executor: tx,
      database: input.database,
      worldId: c.worldId,
      expectedWorldVersion: c.expectedWorldVersion,
    }));
  const reservations = (mixed?.socialReservations ?? []).filter(
    (r) =>
      r.countryId === c.countryId ||
      r.accountId === p.treasury.assetAccount.accountId,
  );
  for (const r of reservations)
    if (
      r.countryId !== c.countryId ||
      r.accountId !== p.treasury.assetAccount.accountId ||
      r.employerId !== p.governmentEntityId ||
      r.currency !== p.treasury.assetAccount.currency
    )
      invalid('mixed reservation differs from exact treasury scope');
  const openingEncumbrances = Object.freeze([
    Object.freeze({
      reference:
        'OPENING_FUNDING_TOTAL_' +
        p.openingFunding.recordsSha256.slice(7).toUpperCase(),
      accountId: p.treasury.assetAccount.accountId,
      amount: p.openingFunding.totalAmount,
      currency: p.treasury.assetAccount.currency,
    }),
    ...reservations.map((r) =>
      Object.freeze({
        reference: r.reservationId,
        accountId: r.accountId,
        amount: r.amount,
        currency: r.currency,
      }),
    ),
  ]);
  return Object.freeze({
    policy: input.policy,
    ...(mixed?.financialState
      ? { financialState: mixed.financialState }
      : { capacityData: data }),
    ...(mixed === null
      ? {}
      : { mixedPrefixEvidence: mixed.mixedPrefixEvidence }),
    binding: Object.freeze({
      seedRef: p.seedId,
      seedFingerprint: p.seedFingerprint,
      admissionRef: p.admissionRef,
      financialSourceId: p.financialSourceId,
      originalsSHA256: p.financialOriginalsSha256,
      policyHash: hash(input.policy),
      treasuryAccountId: p.treasury.assetAccount.accountId,
      treasuryClaimId: p.treasury.assetAccount.claimId!,
      openingEncumbranceHash: hash(openingEncumbrances),
      capacityProjectionFingerprint: hash(p),
      ...(mixed === null
        ? {}
        : { mixedSourceBindingsFingerprint: hash(mixed.sourceBindings) }),
    }),
    openingEncumbrances,
    frames: prefix.frames,
    worldVersion: prefix.head.world_version,
    eventSequence: prefix.head.event_sequence,
  });
}
