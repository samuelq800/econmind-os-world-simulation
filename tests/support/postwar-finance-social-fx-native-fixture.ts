/** TEST_ONLY cfc fixture. Importing this module never opens PG. Only the
 * coordinated native constructor clones the existing sealed cfc baseline.
 * Source facts use actual Core derivation and fixed controlled publishers;
 * budget policy, MATCH issuer and identities remain explicit test fixtures.
 * Local execution does not establish production admission or release approval. */
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import * as C from '@econmind/core';
import {
  validateFinanceNativeBudgetPolicy,
  type FinanceNativeBudgetPolicy,
} from '@econmind/core/finance-budget-native';
import {
  parseFinanceBudgetCapacityData,
  type FinanceBudgetCapacityProjection,
} from '@econmind/core/finance-budget-capacity-data';
import { readPostwarOperatingGenesisFromSeed } from '../../apps/world-worker/src/preparation/postwar-operating-genesis-adoption.js';
import { readPostwarFinancialOfficeOriginalsFromSeed } from '../../apps/world-worker/src/preparation/postwar-financial-office-originals.js';
import {
  validatePostwarSocialEmploymentStateDocument,
  type PostwarSocialEmploymentStateDocument,
} from '../../apps/world-worker/src/preparation/postwar-social-employment-state.js';
import {
  createPostwarSocialRuntimeConnection,
  loadPostwarSocialConnectionOpeningAdoption,
} from '../../apps/world-worker/src/runtime-preparation/social-runtime-connection.js';
import {
  createPostwarFinanceSocialRuntimeConnection,
  readPostwarFinanceSocialRuntimeBinding,
  type PostwarFinanceSocialRuntimeConnection,
} from '../../apps/world-worker/src/runtime-preparation/finance-social-runtime-connection.js';
import { createPostgresFinanceBudgetWorldCapacitySource } from '../../apps/world-worker/src/persistence/postgres-finance-budget-capacity-source.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { publishCfcFinanceSocialFixtureSources } from './postwar-finance-social-fixed-source-publisher.js';
import { publishPostwarDayOneFxOriginals } from '../../apps/world-worker/src/persistence/postgres-postwar-day-one-fx-originals.js';
import { publishPostwarMixedSocialMatchDue } from '../../apps/world-worker/src/persistence/postwar-social-mixed-match-publisher.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  createPostwarDayOneFxNativeFixture,
  POSTWAR_DAY_ONE_FX_PINS,
} from './postwar-day-one-fx-native-fixture.js';

const root = path.resolve(import.meta.dirname, '../..');
const sourceMarker =
  '/workspace/.cloud-setup/evidence/fx-cfc-runtime-20261029/reference-db.json';
const sha = (s: string | Buffer) =>
  createHash('sha256').update(s).digest('hex');
const ident = (s: string) => {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(s))
    throw Error('MIXED_OWNED_IDENTIFIER_REQUIRED');
  return '"' + s + '"';
};
function invalid(s: string): never {
  throw Error('CFC_FINANCE_SOCIAL_FX_FIXTURE:' + s);
}
type Doc = PostwarSocialEmploymentStateDocument;
type Country = Doc['countries'][number];
type Wage = Doc['inputs']['labour']['positions'][number];
type Funding = Doc['inputs']['fundingAccounts'][number];
export interface CfcMixedSmallCountryOriginal {
  readonly countryId: string;
  readonly state: Country['state'];
  readonly offers: Country['offers'];
  readonly matchBoundary: {
    readonly dayIndex: string;
    readonly validUntilDayIndex: string;
  };
  readonly scope: Readonly<Record<string, unknown>>;
  readonly fundingAccounts: readonly Funding[];
}
export interface CfcMixedSmallSourceData {
  readonly classification: 'ACTUAL_CFC_CORE_DERIVED_DATA_ONLY_NOT_AUTHORITY';
  readonly worldId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly operatingSourceId: string;
  readonly operatingSourcePayloadHash: string;
  readonly financialSourceId: string;
  readonly financialOriginalsSha256: string;
  readonly countries: readonly CfcMixedSmallCountryOriginal[];
  readonly capacity: FinanceBudgetCapacityProjection;
  readonly locator: {
    readonly wage: Wage;
    readonly funding: Funding;
    readonly servicePoolId: string;
  };
  readonly modelVersion: string;
}
/** Reusable DATA_ONLY builder, no SQL, permission flag or request authority.
 * The caller must independently bind stored canonical bytes/admission. */
export function deriveCfcMixedSmallSourceData(input: {
  readonly seed: C.OpeningSeed;
  readonly admissionRef: string;
  readonly canonicalSeedSHA256: string;
}): CfcMixedSmallSourceData {
  const { seed } = input;
  if (
    seed.worldId !== POSTWAR_DAY_ONE_FX_PINS.worldId ||
    seed.seedId !== POSTWAR_DAY_ONE_FX_PINS.seedId ||
    seed.fingerprint !== POSTWAR_DAY_ONE_FX_PINS.seedFingerprint ||
    !/^ADMISSION_[A-F0-9]{64}$/u.test(input.admissionRef) ||
    !/^[a-f0-9]{64}$/u.test(input.canonicalSeedSHA256)
  )
    invalid('EXACT_ACTUAL_CFC_PINS_REQUIRED');
  if (!C.isValidatedOpeningSeed(seed))
    invalid('GENUINE_CORE_VALIDATED_SEED_REQUIRED');
  const view = readPostwarOperatingGenesisFromSeed(seed);
  if (!view.socialEmployment || !view.financialOfficeOriginalsDocument)
    invalid('ACTUAL_FULL_E03_AND_FINANCIAL_ORIGINALS_REQUIRED');
  const document = validatePostwarSocialEmploymentStateDocument(
      view.socialEmployment,
    ),
    financial = readPostwarFinancialOfficeOriginalsFromSeed(seed);
  const operating = seed.sources.filter(
    (s) => s.sourceId === 'SOURCE_POSTWAR_OPERATING_V1',
  );
  if (
    operating.length !== 1 ||
    document.countries.length !== 70 ||
    document.inputs.worldId !== seed.worldId ||
    document.inputs.seedId !== seed.seedId
  )
    invalid('EXACT_OPERATING_ORIGINAL_AND_70_COUNTRIES_REQUIRED');
  const countries: CfcMixedSmallCountryOriginal[] = [];
  const globalIds = new Map<string, string>();
  for (const country of document.countries) {
    const cid = country.countryId;
    const wages = document.inputs.labour.positions.filter(
      (w) => w.countryId === cid,
    );
    const funding = document.inputs.fundingAccounts.filter(
      (f) => f.countryId === cid,
    );
    const positions = new Set(
      country.state.labour.positions.map((p) => p.positionId),
    );
    const cohorts = [
      ...new Set([
        ...document.inputs.populationPositionRefs
          .filter((r) => positions.has(r.positionId))
          .map((r) => r.cohortId),
        ...country.dutyAssignments.map((r) => r.cohortId),
      ]),
    ].sort();
    for (const id of [
      ...positions,
      ...country.state.servicePools.map((p) => p.poolId),
      ...funding.flatMap((f) => [f.accountRef, f.claimId]),
      ...cohorts,
    ]) {
      if (globalIds.has(id) && globalIds.get(id) !== cid)
        invalid('GLOBAL_SOURCE_IDENTIFIER_COLLISION');
      globalIds.set(id, cid);
    }
    const scope = {
      countryId: cid,
      positions: country.state.labour.positions,
      aggregates: country.state.labour.aggregates,
      servicePools: country.state.servicePools,
      offers: country.offers,
      minimumWage: country.minimumWage,
      populationAvailability:
        country.validationReadFacts.facts.populationAvailability,
      wages: [...wages].sort((a, b) =>
        a.positionId.localeCompare(b.positionId),
      ),
      funding: [...funding].sort((a, b) =>
        a.accountRef.localeCompare(b.accountRef),
      ),
      cohorts,
    };
    if (Buffer.byteLength(C.canonicalSerialize(scope)) > 262144)
      invalid('COUNTRY_SOURCE_EXCEEDS_256KIB');
    countries.push({
      countryId: cid,
      state: country.state,
      offers: country.offers,
      matchBoundary: {
        dayIndex: country.validationReadFacts.facts.boundary.dayIndex,
        validUntilDayIndex: country.minimumWage.validUntilDayIndex,
      },
      scope,
      fundingAccounts: funding.filter((f) => f.payerRole === 'GOV'),
    });
  }
  const cid = 'COUNTRY_01',
    country = countries.find((c) => c.countryId === cid);
  const rosterSource = seed.sources.find(
    (s) => s.sourceId === financial.financialSourceId,
  );
  if (!country || !rosterSource)
    invalid('ACTUAL_C01_FINANCIAL_SOURCE_REQUIRED');
  const roster = (
    JSON.parse(rosterSource.canonicalPayload) as {
      assembly: {
        countries: {
          countryId: string;
          roster: { government: string; centralBank: string };
        }[];
      };
    }
  ).assembly.countries.filter((c) => c.countryId === cid);
  const originalCountry = financial.contract.countries.filter(
    (c) => c.countryId === cid,
  );
  if (roster.length !== 1 || originalCountry.length !== 1)
    invalid('ACTUAL_C01_ROSTER_REQUIRED');
  const gov = roster[0]!.roster.government,
    cb = roster[0]!.roster.centralBank,
    currency = originalCountry[0]!.localCurrency;
  const legs = seed.financialBatches
    .filter((b) => b.sourceId === financial.financialSourceId)
    .flatMap((b) => b.legs);
  const assets = legs.filter(
    (l) =>
      l.direction === 'DEBIT' &&
      l.account.countryId === cid &&
      l.account.ownerId === gov &&
      l.account.counterpartyEntityId === cb &&
      l.account.currency === currency &&
      l.account.accountClass === 'ASSET' &&
      l.account.claimId !== null,
  );
  if (assets.length !== 1) invalid('ACTUAL_TGA_ASSET_REQUIRED');
  const asset = assets[0]!;
  const mirrors = legs.filter(
    (l) =>
      l.legId === asset.counterpartLegId &&
      l.counterpartLegId === asset.legId &&
      l.direction === 'CREDIT' &&
      l.account.countryId === cid &&
      l.account.ownerId === cb &&
      l.account.counterpartyEntityId === gov &&
      l.account.claimId === asset.account.claimId &&
      l.account.currency === currency &&
      l.account.accountClass === 'LIABILITY' &&
      l.amount.amount.equals(asset.amount.amount),
  );
  if (mirrors.length !== 1) invalid('ACTUAL_RECIPROCAL_TGA_CLAIM_REQUIRED');
  const allocations = [...view.facts.funding]
    .filter((f) => f.accountId === asset.account.accountId)
    .sort((a, b) => a.fundingId.localeCompare(b.fundingId));
  let total = C.Money.from('0', currency);
  for (const f of allocations) {
    if (
      f.countryId !== cid ||
      f.payerEntityId !== gov ||
      f.currency !== currency
    )
      invalid('EXACT_REAL_FUNDING_SCOPE_REQUIRED');
    total = total.add(C.Money.from(f.ceilingAmount, currency));
  }
  const funds = country.fundingAccounts.filter(
    (f) =>
      f.payerEntityId === gov &&
      f.currency === currency &&
      f.accountRef === asset.account.accountId &&
      f.claimId === asset.account.claimId &&
      f.issuerEntityId === cb,
  );
  if (
    funds.length !== 1 ||
    !C.Money.from(funds[0]!.reservedAmount, currency).amount.equals(
      total.amount,
    ) ||
    total.amount.greaterThan(asset.amount.amount)
  )
    invalid('ORIGINAL_RESERVATIONS_AND_TREASURY_MUST_MATCH');
  const capacity: FinanceBudgetCapacityProjection = {
    schemaVersion: 'finance-budget-capacity-source-v1',
    worldId: seed.worldId,
    countryId: cid,
    seedId: seed.seedId,
    seedFingerprint: seed.fingerprint,
    admissionRef: input.admissionRef,
    modelVersion: seed.replayBinding.modelVersion,
    openingWorldVersion: '0',
    governmentEntityId: gov,
    centralBankEntityId: cb,
    financialSourceId: financial.financialSourceId,
    canonicalSeedSha256: 'sha256:' + input.canonicalSeedSHA256,
    financialOriginalsSha256:
      'sha256:' + view.financialOfficeOriginalsDocument.sha256,
    treasury: {
      assetAccount: asset.account,
      liabilityAccount: mirrors[0]!.account,
      assetLegId: asset.legId,
      liabilityLegId: mirrors[0]!.legId,
      assetAmount: asset.amount.toCanonicalValue().amount,
      liabilityAmount: mirrors[0]!.amount.toCanonicalValue().amount,
    },
    openingFunding: {
      totalAmount: total.toCanonicalValue().amount,
      recordCount: String(allocations.length),
      recordsSha256: 'sha256:' + sha(C.canonicalSerialize(allocations)),
    },
  };
  parseFinanceBudgetCapacityData(capacity);
  const wage = document.inputs.labour.positions
    .filter(
      (w) =>
        w.countryId === cid &&
        w.owner === 'PUBLIC_SERVICE' &&
        w.employerRole === 'GOV' &&
        w.employerId === gov &&
        w.occupation === 'GENERAL' &&
        w.wagePeriod === 'SIM_YEAR' &&
        ['PUBLIC_SAFETY', 'PUBLIC_ADMINISTRATION'].includes(w.classificationId),
    )
    .sort((a, b) => a.positionId.localeCompare(b.positionId))
    .find(
      (w) =>
        country.state.labour.aggregates.some(
          (a) =>
            a.locationId === w.locationId &&
            a.skill === w.skill &&
            a.status === 'UNEMPLOYED_SEARCHING' &&
            BigInt(a.count) > 0n,
        ) &&
        C.Money.from(funds[0]!.remainingAmount, currency)
          .amount.mul(360)
          .greaterThan(C.Money.from(w.wageAmount, currency).amount),
    );
  if (!wage) invalid('REAL_GOV_VACANCY_WAGE_AND_AVAILABLE_FUNDING_REQUIRED');
  const pools = country.state.servicePools.filter(
    (p) => p.locationId === wage.locationId && p.skill === wage.skill,
  );
  if (pools.length !== 1) invalid('EXACT_ACTUAL_SERVICE_POOL_REQUIRED');
  return {
    classification: 'ACTUAL_CFC_CORE_DERIVED_DATA_ONLY_NOT_AUTHORITY',
    worldId: seed.worldId,
    seedId: seed.seedId,
    seedFingerprint: seed.fingerprint,
    operatingSourceId: operating[0]!.sourceId,
    operatingSourcePayloadHash: operating[0]!.payloadHash,
    financialSourceId: financial.financialSourceId,
    financialOriginalsSha256: view.financialOfficeOriginalsDocument.sha256,
    countries,
    capacity,
    locator: { wage, funding: funds[0]!, servicePoolId: pools[0]!.poolId },
    modelVersion: seed.replayBinding.modelVersion,
  };
}

const proposals = [
  'financial-posting-decimal-validation',
  'social-operating-custody',
  'postwar-social-startup-seed-header',
  'social-operating-match-publisher',
  'social-intake-authorization',
  'finance-budget-custody',
  'finance-budget-capacity-source',
  'finance-budget-mixed-source',
  'postwar-day-one-fx-history-read',
  'postwar-bounded-journal-read',
  'postwar-social-mixed-match-publisher',
] as const;
const fixedRoles = [
  'world_v2_social_source_owner',
  'world_v2_social_source_publisher',
  'world_v2_social_source_reader',
  'world_v2_social_intake_lock_reader',
  'world_v2_finance_budget_source_owner',
  'world_v2_finance_budget_source_publisher',
  'world_v2_finance_budget_source_reader',
  'world_v2_day_one_fx_history_owner',
];

export async function createPostwarFinanceSocialFxNativeFixture(
  input: { readonly evidenceDirectory?: string } = {},
) {
  if (process.env.ECONMIND_POSTWAR_DAY_ONE_FX_NATIVE !== '1')
    invalid('EXPLICIT_CFC_NATIVE_OPT_IN_REQUIRED');
  const evidenceDirectory =
    input.evidenceDirectory ??
    '/workspace/.cloud-setup/evidence/fx-cfc-mixed-native-20261029';
  if (
    !evidenceDirectory.startsWith('/workspace/.cloud-setup/evidence/fx-cfc-') ||
    path.resolve(evidenceDirectory) !== evidenceDirectory
  )
    invalid('OWNED_CFC_EVIDENCE_DIRECTORY_REQUIRED');
  await mkdir(evidenceDirectory, { recursive: true });
  // A copied descriptor is not source data or authority. The base helper checks
  // actual Docker ownership, volume/network/seal and actual cfc H0 metadata.
  const markerBytes = await readFile(sourceMarker);
  const existing = await readFile(
    path.join(evidenceDirectory, 'reference-db.json'),
  ).catch(() => null);
  if (existing && !existing.equals(markerBytes))
    invalid('EXISTING_CACHE_DESCRIPTOR_DIFFERS');
  if (!existing)
    await writeFile(
      path.join(evidenceDirectory, 'reference-db.json'),
      markerBytes,
      { flag: 'wx' },
    );
  const base = await createPostwarDayOneFxNativeFixture({
    repositoryRoot: root,
    evidenceDirectory,
    environment: 'ci',
  });
  const databaseErrors: {
    pool: string;
    statement: string;
    causes: unknown[];
  }[] = [];
  const recordError = (pool: string, statement: unknown, error: unknown) => {
    const causes: unknown[] = [];
    let current = error;
    while (current instanceof Error && causes.length < 8) {
      const detail = current as Error & { code?: unknown; where?: unknown };
      causes.push({
        name: detail.name,
        message: detail.message,
        code: detail.code,
        where: detail.where,
        stack: detail.stack,
      });
      current = current.cause;
    }
    databaseErrors.push({
      pool,
      statement:
        typeof statement === 'string' ? statement : 'ACTUAL_QUERY_CONFIG',
      causes,
    });
  };
  const observePool = (pool: Pool, label: string): Pool =>
    new Proxy(pool, {
      get(target, key, receiver) {
        if (key === 'query')
          return async (...args: unknown[]) => {
            try {
              return await Reflect.apply(target.query, target, args);
            } catch (error) {
              recordError(label, args[0], error);
              throw error;
            }
          };
        if (key === 'connect')
          return async () => {
            const client = await target.connect();
            return new Proxy(client, {
              get(t, k, r) {
                if (k === 'query')
                  return async (...args: unknown[]) => {
                    try {
                      return await Reflect.apply(t.query, t, args);
                    } catch (error) {
                      recordError(label, args[0], error);
                      throw error;
                    }
                  };
                const value: unknown = Reflect.get(t, k, r);
                return typeof value === 'function' ? value.bind(t) : value;
              },
            });
          };
        const value: unknown = Reflect.get(target, key, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  const worker = observePool(base.worker, 'worker'),
    intakePool = observePool(base.intakePool, 'intake');
  const suffix = base.workerRole.slice('fx_test_worker_'.length),
    readRole = 'mixed_read_' + suffix,
    sourceRole = 'mixed_social_source_' + suffix;
  const pools: Pool[] = [];
  let connection: Readonly<PostwarFinanceSocialRuntimeConnection> | undefined;
  const createdFixed: string[] = [];
  let cleaned: Promise<void> | undefined;
  const open = (user: string) => {
    const raw = new Pool({
      host: base.marker.socket,
      port: base.marker.port,
      database: base.clone.database,
      user,
      password: async () => '',
      ssl: false,
      max: 1,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 1000,
      options: '-c request.jwt.claim.sub=' + base.marker.subject,
    });
    raw.on('error', (e) => base.idleErrors.push(e.message));
    let ending: Promise<void> | undefined;
    const p = new Proxy(raw, {
      get(t, k, r) {
        if (k === 'end') return () => (ending ??= t.end());
        const v: unknown = Reflect.get(t, k, r);
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
    pools.push(p);
    return p;
  };
  const cleanup = () =>
    (cleaned ??= (async () => {
      const errors: unknown[] = [];
      try {
        await connection?.stop();
      } catch (e) {
        errors.push(e);
      }
      for (const p of pools)
        try {
          await p.end();
        } catch (e) {
          errors.push(e);
        }
      try {
        await base.cleanup();
      } catch (e) {
        errors.push(e);
      }
      const admin = new Pool({
        host: base.marker.socket,
        port: base.marker.port,
        database: 'postgres',
        user: 'postgres',
        password: async () => '',
        ssl: false,
        max: 1,
      });
      admin.on('error', () => undefined);
      try {
        for (const role of [readRole, sourceRole, ...createdFixed])
          await admin.query('drop role if exists ' + ident(role));
      } catch (e) {
        errors.push(e);
      } finally {
        await admin.end().catch((e: unknown) => errors.push(e));
      }
      if (errors.length)
        throw new AggregateError(
          errors,
          'MIXED_CFC_OWNED_FIXTURE_CLEANUP_FAILED',
        );
    })());
  try {
    const present = (
      await base.clone.installer.query<{ rolname: string }>(
        'select rolname from pg_roles where rolname=any($1::text[])',
        [fixedRoles],
      )
    ).rows.map((r) => r.rolname);
    createdFixed.push(...fixedRoles.filter((r) => !present.includes(r)));
    const installed: Record<string, string> = {};
    for (const name of proposals) {
      const bytes = await readFile(
        path.join(root, 'database/proposals/' + name + '.sql'),
      );
      await base.clone.installer.query(bytes.toString());
      installed[name] = sha(bytes);
    }
    await base.clone.installer.query(
      'create role ' +
        ident(readRole) +
        ' login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;create role ' +
        ident(sourceRole) +
        ' login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant usage on schema world_v2 to ' +
        ident(readRole) +
        ',' +
        ident(sourceRole) +
        ';grant world_v2_social_source_reader to ' +
        ident(sourceRole) +
        ';grant world_v2_social_source_reader,world_v2_finance_budget_source_reader to ' +
        ident(base.workerRole) +
        ';grant world_v2_finance_budget_source_reader,world_v2_social_intake_lock_reader to ' +
        ident(base.intakeRole) +
        ';grant insert,update on world_v2.current_materialization to ' +
        ident(base.workerRole) +
        ';grant update(command_id)on world_v2.command_submission to ' +
        ident(base.workerRole) +
        ';grant select(world_id,seed_id,seed_fingerprint,replay_binding)on world_v2.opening_seed to ' +
        ident(base.intakeRole) +
        ';',
    );
    // Offline only. One actual artifact parse; never SELECT canonical::jsonb or
    // execute old whole-seed SQL publishers. Reuse the same genuine seed for
    // both offline preparations, then release it; online readers get no raw seed.
    let seed: C.OpeningSeed | undefined = C.parseOpeningSeed(
      JSON.parse(await readFile(base.artifacts.seedFile, 'utf8')),
      sha,
    );
    const small = deriveCfcMixedSmallSourceData({
      seed,
      admissionRef: base.marker.admissionRef,
      canonicalSeedSHA256: String(base.header.canonical_intent_sha256),
    });
    const controlledSourcePublication =
      await publishCfcFinanceSocialFixtureSources({
        seed,
        installer: base.clone.installer,
      });
    const publishedCapacitySourceSHA256 =
      controlledSourcePublication.sourceRows.find(
        (row) =>
          row.countryId === base.marker.countryId &&
          row.function === 'publish_postwar_finance_source_bounded',
      )?.sourceSha256;
    if (
      typeof publishedCapacitySourceSHA256 !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(publishedCapacitySourceSHA256)
    )
      invalid('ACTUAL_PUBLISHED_CAPACITY_SHA_REQUIRED');
    const normativeBytes = await readFile(
      path.join(root, 'specs/extracted/FINANCE.md'),
      'utf8',
    );
    const normativeSha = sha(normativeBytes);
    if (
      normativeSha !==
      '6152e2c87a5545e1c354c8a6dbe8b948bbfcb3d396ef54624d9326d0bc1b8385'
    )
      invalid('EXACT_FINANCE_ORIGINAL_REQUIRED');
    const c01Policy: FinanceNativeBudgetPolicy = {
      schemaVersion: 'finance-native-budget-policy-v1',
      ruleRef: 'FINANCE_ORDINARY_SELF_ADMINISTRATION_FULL_V1',
      ruleRevision: 'TEST_ONLY_MIXED_CFC_RULE_V1',
      sourceDocumentSHA256: 'sha256:' + normativeSha,
      normativeUnits: [
        'FINANCE-U0247',
        'FINANCE-U0252',
        'FINANCE-U0265',
        'FINANCE-U0295',
      ],
      worldId: base.marker.worldId,
      countryId: base.marker.countryId,
      governmentEntityId: small.capacity.governmentEntityId,
      currency: small.capacity.treasury.assetAccount.currency,
      envelopeRef: 'ENVELOPE_MIXED_CFC_' + suffix.toUpperCase(),
      effectivePeriodRef: 'PERIOD_MIXED_CFC_' + suffix.toUpperCase(),
      periodRevision: 'PERIOD_REV_MIXED_CFC_' + suffix.toUpperCase(),
      validFromSimTime: '0',
      validUntilSimTime: '86400000',
      requestingOfficeId: 'FINANCE',
      programmeOwnerOfficeId: 'FINANCE',
      classification: 'ORDINARY_DEPARTMENTAL',
      funding: 'FULL_UNCONDITIONAL',
      requiredApprovalOffices: ['FINANCE'],
    };
    validateFinanceNativeBudgetPolicy(c01Policy);
    const policyText = C.canonicalSerialize(c01Policy),
      policyRef = 'POLICY_MIXED_CFC_' + suffix.toUpperCase();
    const setup = new PostgresSqlDatabase(base.clone.installer);
    // Source originals were published through the real fixed-role entry above.
    // Only budget policy, MATCH issuer and test identities remain TEST_ONLY;
    // this does not claim production admission/release or human approval.
    await setup.transaction(async (tx) => {
      const h = (
        await tx.query<{
          world_version: string;
          event_sequence: string;
          seed_fingerprint: string;
          admission_ref: string;
          canonical_sha: string;
        }>(
          "select h.world_version::text,h.event_sequence::text,a.seed_fingerprint,a.admission_ref,encode(sha256(convert_to(s.canonical_payload,'UTF8')),'hex')canonical_sha from world_v2.world_head h join world_v2.runtime_opening_admission a using(world_id)join world_v2.opening_seed s using(world_id)where h.world_id=$1 for share of h,a",
          [base.marker.worldId],
        )
      ).rows;
      if (
        h.length !== 1 ||
        h[0]!.world_version !== '0' ||
        h[0]!.event_sequence !== '0' ||
        h[0]!.seed_fingerprint !== small.seedFingerprint ||
        h[0]!.admission_ref !== base.marker.admissionRef ||
        h[0]!.canonical_sha !== base.header.canonical_intent_sha256
      )
        invalid('ACTUAL_LOCKED_CFC_H0_HEADER_REQUIRED');
      await tx.query(
        'insert into world_v2.finance_budget_policy_original values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [
          policyRef,
          small.worldId,
          c01Policy.countryId,
          c01Policy.envelopeRef,
          c01Policy.effectivePeriodRef,
          small.seedFingerprint,
          base.marker.admissionRef,
          'TEST_ONLY_ACTUAL_CFC_OFFLINE_REGISTRAR',
          policyText,
          sha(policyText),
          normativeSha,
        ],
      );
      // The finite day-zero rule is verified against the actual country source;
      // no old H3/c427 automatic command or publisher authority is copied.
      const c = small.countries.find(
        (c) => c.countryId === c01Policy.countryId,
      )!;
      if (
        c.matchBoundary.dayIndex !== '0' ||
        c.matchBoundary.validUntilDayIndex !== '1' ||
        c.state.servicePools.length === 0 ||
        c.state.servicePools.some(
          (p) => p.ruleVersion !== 'SOCIAL_JOB_MATCH_RULE_V1',
        )
      )
        invalid('ACTUAL_MATCH_RULE_REQUIRED');
      await tx.query(
        "insert into world_v2.social_operating_match_publisher select r.world_id,r.country_id,'SOCIAL_MATCH_GRANT_'||upper(q.hash),r.registration_ref,r.admission_ref,'world_v2_social_source_publisher','ACTOR_SOCIAL_MATCH_'||upper(q.hash),(substr(q.hash,1,8)||'-'||substr(q.hash,9,4)||'-4'||substr(q.hash,14,3)||'-a'||substr(q.hash,18,3)||'-'||substr(q.hash,21,12))::uuid,'SOCIAL_JOB_MATCH_RULE_V1',0,1,1 from world_v2.social_operating_source_registration r cross join lateral(select encode(sha256(convert_to(jsonb_build_array(r.world_id,r.country_id,r.registration_ref,'SOCIAL_JOB_MATCH_RULE_V1')::text,'UTF8')),'hex')hash)q where r.world_id=$1 and r.country_id=$2",
        [small.worldId, c01Policy.countryId],
      );
      const auth = (
        await tx.query<{ team_id: string; authorization_version: string }>(
          "select team_id,authorization_version from world_v2.current_commit_authorization where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id='FINANCE'and capability='FINANCE_TREASURY'and active",
          [small.worldId, base.marker.subject, c01Policy.countryId],
        )
      ).rows;
      if (auth.length !== 1)
        invalid('EXISTING_CFC_FINANCE_TREASURY_IDENTITY_REQUIRED');
      // The sealed TEST_ONLY baseline already grants these offices. Verify its
      // coherent identities rather than expanding or silently replacing authority.
      for (const [office, capability] of [
        ['FINANCE', 'FINANCE_BUDGET'],
        ['SOCIAL', 'SOCIAL_LABOUR'],
      ]) {
        const current = (
          await tx.query<{ team_id: string; authorization_version: string }>(
            'select team_id,authorization_version from world_v2.current_commit_authorization where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id=$4 and capability=$5 and active',
            [
              small.worldId,
              base.marker.subject,
              c01Policy.countryId,
              office,
              capability,
            ],
          )
        ).rows;
        if (
          current.length !== 1 ||
          current[0]!.team_id !== auth[0]!.team_id ||
          current[0]!.authorization_version !== auth[0]!.authorization_version
        )
          invalid('EXISTING_CFC_COHERENT_OFFICE_AUTHORITY_REQUIRED');
        const seat = (
          await tx.query<{ team_id: string; authorization_revision: string }>(
            `select s.team_id,s.authorization_revision from world_v2.runtime_read_seat s join world_v2.projection_entitlement e on e.world_id=s.world_id and e.auth_subject=s.auth_subject and e.classification='OFFICE_PRIVATE' and e.scope_key='OFFICE_'||upper(encode(convert_to(s.country_id,'UTF8'),'hex'))||'_'||upper(encode(convert_to(s.office_id,'UTF8'),'hex')) and e.authorization_version=s.authorization_revision and e.active and e.revoked_at is null where s.world_id=$1 and s.auth_subject=$2::uuid and s.country_id=$3 and s.office_id=$4`,
            [small.worldId, base.marker.subject, c01Policy.countryId, office],
          )
        ).rows;
        if (
          seat.length !== 1 ||
          seat[0]!.team_id !== auth[0]!.team_id ||
          seat[0]!.authorization_revision !== auth[0]!.authorization_version
        )
          invalid('EXISTING_CFC_COHERENT_OFFICE_SEAT_AND_ENTITLEMENT_REQUIRED');
      }
    });
    const publisherFor = (
      role:
        | 'world_v2_day_one_fx_source_publisher'
        | 'world_v2_social_source_publisher',
    ): SqlDatabase => ({
      query: setup.query.bind(setup),
      transaction: (fn) =>
        setup.transaction(async (tx) => {
          await tx.query('set local role ' + role);
          return fn(tx);
        }),
    });
    const [policyBytes, userReceiptBytes] = await Promise.all([
      readFile(
        path.join(root, 'config/postwar-genesis/day-one-fx.v1.json'),
        'utf8',
      ),
      readFile(
        path.join(
          root,
          'docs/governance/owner-inputs/2026-10-29/DAY_ONE_FX_USER_ADOPTION.original.json',
        ),
        'utf8',
      ),
    ]);
    const publication = await publishPostwarDayOneFxOriginals({
      database: publisherFor('world_v2_day_one_fx_source_publisher'),
      seed,
      policyBytes,
      userReceiptBytes,
    });
    const fxQuote = publication.quotes.find(
      (q) => q.countryId === c01Policy.countryId,
    );
    if (!fxQuote) invalid('ACTUAL_C01_QUOTE_REQUIRED');
    let ticks = '0';
    const clock = Object.freeze({
      nowReal: () => new Date().toISOString(),
      simTime: async () => ticks,
    });
    const setSimTime = (next: string) => {
      if (!/^(0|[1-9][0-9]*)$/u.test(next) || BigInt(next) < BigInt(ticks))
        invalid('MONOTONIC_TEST_ONLY_SERVER_TIME_REQUIRED');
      ticks = next;
    };
    const adoption = await loadPostwarSocialConnectionOpeningAdoption(root);
    connection = createPostwarFinanceSocialRuntimeConnection({
      socialConnection: createPostwarSocialRuntimeConnection({
        worldId: small.worldId,
        workerId: base.workerId,
        workerPool: worker,
        workerRole: base.workerRole,
        openingAdoption: adoption,
      }),
      capacitySource: createPostgresFinanceBudgetWorldCapacitySource({
        worldId: small.worldId,
        countries: [
          {
            countryId: c01Policy.countryId,
            expectedRawSourceSHA256: publishedCapacitySourceSHA256,
          },
        ],
        historyMode: 'BUDGET_SOCIAL',
      }),
      intakePool,
      clock,
      environment: 'ci',
      treasuryFx: { workerRole: base.workerRole },
    });
    // Product-owned phase ordering: no source DTO or caller Ready is minted.
    await connection.prepareTreasuryFx({ seed, policyBytes, userReceiptBytes });
    await connection.prepare({
      observedAtReal: clock.nowReal(),
      admittedWorldPins: {
        worldId: small.worldId,
        seedRef: small.seedId,
        contentHash: small.seedFingerprint,
        admissionRef: base.marker.admissionRef,
      },
      modelVersion: small.modelVersion,
      startupSeed: seed,
    });
    seed = undefined;
    const ports = readPostwarFinanceSocialRuntimeBinding(connection);
    if (!ports.treasuryFx || ports.runtime.consumer.state() !== 'PREPARED')
      invalid('ONE_DUAL_PREPARED_CONSUMER_REQUIRED');
    const fxGovernmentGcuAccountId = ports.treasuryFx.treasuryGcuAccountId(
      c01Policy.countryId,
    );
    // This cfc consumer fixture installs no UI projection schema. Its extra
    // read identity therefore retains schema USAGE only, no invented membership.
    const readPool = open(readRole),
      sourcePool = open(sourceRole);
    const permissions = (
      await base.clone.installer.query<Record<string, unknown>>(
        "select r as role,has_column_privilege(r,'world_v2.opening_seed','canonical_payload','SELECT')raw_seed,has_column_privilege(r,'world_v2.current_commit_authorization','authorization_version','UPDATE')authority_update,has_column_privilege(r,'world_v2.projection_entitlement','active','UPDATE')entitlement_update,pg_has_role(r,'world_v2_social_source_reader','MEMBER')social_reader,pg_has_role(r,'world_v2_finance_budget_source_reader','MEMBER')finance_reader,pg_has_role(r,'world_v2_social_intake_lock_reader','MEMBER')social_intake_lock,pg_has_role(r,'world_v2_day_one_fx_source_reader','MEMBER')fx_reader,pg_has_role(r,'world_v2_social_source_owner','MEMBER')social_owner,pg_has_role(r,'world_v2_social_source_publisher','MEMBER')social_publisher from unnest($1::text[])r",
        [[base.workerRole, base.intakeRole, readRole, sourceRole]],
      )
    ).rows;
    for (const p of permissions) {
      if (
        p.raw_seed !== false ||
        p.authority_update !== false ||
        p.entitlement_update !== false ||
        p.social_owner !== false ||
        p.social_publisher !== false
      )
        invalid('NO_AUTHORITY_DML_OR_OWNER_PUBLISHER_MEMBERSHIP');
      if (
        p.role === base.intakeRole &&
        (p.raw_seed !== false ||
          p.social_reader !== false ||
          p.social_intake_lock !== true ||
          p.finance_reader !== true ||
          p.fx_reader !== true)
      )
        invalid('LOW_INTAKE_BOUNDARY_REQUIRED');
    }
    const publishDueMatches = async (planCommandId?: string) => {
      const plans = planCommandId
        ? [{ command_id: planCommandId }]
        : (
            await base.clone.installer.query<{ command_id: string }>(
              "select s.command_id from world_v2.command_submission s join world_v2.command_receipt r using(world_id,command_id)where s.world_id=$1 and s.command_type='CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1'and r.outcome='COMMITTED'order by r.world_version_after,s.command_id",
              [small.worldId],
            )
          ).rows;
      const commands: C.CanonicalCommand[] = [];
      for (const p of plans)
        commands.push(
          await publishPostwarMixedSocialMatchDue({
            socialConnection: ports.socialConnection,
            publisherDatabase: setup,
            worldId: small.worldId,
            countryId: c01Policy.countryId,
            planCommandId: p.command_id,
            workerRole: base.workerRole,
            observedAtReal: await clock.nowReal(),
          }),
        );
      return commands;
    };
    const provenance = {
      classification:
        'CONTROLLED_SOURCE_PUBLICATION_WITH_TEST_ONLY_POLICY_ISSUER_AND_IDENTITIES',
      seedFingerprint: small.seedFingerprint,
      admissionRef: base.marker.admissionRef,
      canonicalSeedSHA256: base.header.canonical_intent_sha256,
      operatingSourceId: small.operatingSourceId,
      operatingSourcePayloadHash: small.operatingSourcePayloadHash,
      financialSourceId: small.financialSourceId,
      countryCount: small.countries.length,
      maximumScopeBytes: Math.max(
        ...small.countries.map((c) =>
          Buffer.byteLength(C.canonicalSerialize(c.scope)),
        ),
      ),
      capacitySourceSHA256: publishedCapacitySourceSHA256,
      controlledSourcePublication,
      policyRef,
      installedProposalSHA256: installed,
      oldC427Copied: false,
      wholeSeedPgJsonParse: false,
      controlledPublisherEntryUsed: true,
      productionAdmissionOrReleaseApproved: false,
    };
    await writeFile(
      path.join(evidenceDirectory, 'mixed-fixture-provenance.json'),
      JSON.stringify(provenance, null, 2) + '\n',
    );
    return {
      ...base,
      worker,
      intakePool,
      database: ports.database,
      databaseErrors,
      connection,
      c01Policy,
      policyRef,
      locators: { COUNTRY_01: small.locator },
      fxQuote,
      fxTreasuryAccountId: small.capacity.treasury.assetAccount.accountId,
      fxGovernmentGcuAccountId,
      fxBankGcuAccountId: fxQuote.dealerGcuAccountId,
      clock,
      setSimTime,
      publishDueMatches,
      readPool,
      sourcePool,
      readRole,
      sourceRole,
      permissions,
      provenance,
      cleanup,
    };
  } catch (error) {
    recordError(
      'fixture',
      'ACTUAL_MIXED_SETUP_TRANSACTION_OR_CORE_CAUSE',
      error,
    );
    await writeFile(
      path.join(evidenceDirectory, 'mixed-fixture-failure.json'),
      JSON.stringify(
        { classification: 'ACTUAL_TEST_ONLY_SETUP_FAILURE', databaseErrors },
        null,
        2,
      ) + '\n',
    ).catch(() => undefined);
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'MIXED_CFC_SETUP_AND_CLEANUP_FAILED',
        { cause: cleanupError },
      );
    }
    throw error;
  }
}
