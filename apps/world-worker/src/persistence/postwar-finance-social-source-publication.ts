/** Offline fixed-cfc derivation. No request facts, policy issuance, admission
 * signing, raw-seed reader grant or economic write is accepted here. */
import { createHash } from 'node:crypto';
import * as C from '@econmind/core';
import { readPostwarOperatingGenesisFromSeed } from '../preparation/postwar-operating-genesis-adoption.js';
import { readPostwarFinancialOfficeOriginalsFromSeed } from '../preparation/postwar-financial-office-originals.js';
import { validatePostwarSocialEmploymentStateDocument } from '../preparation/postwar-social-employment-state.js';
import {
  POSTWAR_DAY_ONE_FX_RETAINED_SOURCES,
  POSTWAR_DAY_ONE_FX_SEED_FINGERPRINT,
} from './postgres-postwar-day-one-fx-originals.js';
import type { SqlDatabase } from './sql-database.js';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(reason: string): never {
  throw Error('FINANCE_SOCIAL_SOURCE_PUBLICATION:' + reason);
}
export interface PostwarFinanceSocialCountryPublication {
  readonly countryId: string;
  readonly derivedText: string;
  readonly derivedSha256: string;
}
export interface PostwarFinanceSocialSourceDerivation {
  readonly schemaVersion: 'postwar-finance-social-derived-manifest-v1';
  readonly worldId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly canonicalSeedSha256: string;
  readonly retainedSources: Readonly<Record<string, string>>;
  readonly countries: readonly PostwarFinanceSocialCountryPublication[];
}
const derived = new WeakSet<object>();
/** Bounded-memory SHA of the genuine immutable seed intent, byte-identical to
 * Core canonicalSerialize. Large embedded JSON strings are escaped in chunks;
 * domain values still use Core's real serializer, never caller adapters. */
export function hashPostwarFinanceSocialSeedIntent(
  seed: C.OpeningSeed,
): string {
  if (!C.isValidatedOpeningSeed(seed)) invalid('GENUINE_CORE_SEED_REQUIRED');
  return hashSeedIntent(seed, '');
}
function hashSeedIntent(seed: C.OpeningSeed, prefix: string): string {
  const digest = createHash('sha256');
  digest.update(prefix);
  function emit(value: unknown): void {
    if (typeof value === 'string') {
      digest.update('"');
      for (let start = 0; start < value.length;) {
        let end = Math.min(start + 16384, value.length);
        if (end < value.length && /[\uD800-\uDBFF]/u.test(value[end - 1]!))
          end--;
        digest.update(JSON.stringify(value.slice(start, end)).slice(1, -1));
        start = end;
      }
      digest.update('"');
    } else if (Array.isArray(value)) {
      digest.update('[');
      value.forEach((x, i) => {
        if (i) digest.update(',');
        emit(x);
      });
      digest.update(']');
    } else if (
      value !== null &&
      typeof value === 'object' &&
      Object.getPrototypeOf(value) === Object.prototype
    ) {
      digest.update('{');
      Object.keys(value)
        .sort()
        .forEach((key, i) => {
          if (i) digest.update(',');
          emit(key);
          digest.update(':');
          emit((value as Record<string, unknown>)[key]);
        });
      digest.update('}');
    } else digest.update(C.canonicalSerialize(value));
  }
  const { fingerprint: _fingerprint, ...intent } = seed;
  void _fingerprint;
  emit(intent);
  return digest.digest('hex');
}
/** Exact fixed-source producer. Output is DATA_ONLY; SQL admits only the
 * separately retained fixed version manifest hashes, plus fresh DB authority. */
export function derivePostwarFinanceSocialSources(
  seed: C.OpeningSeed,
): PostwarFinanceSocialSourceDerivation {
  if (
    !C.isValidatedOpeningSeed(seed) ||
    seed.fingerprint !== POSTWAR_DAY_ONE_FX_SEED_FINGERPRINT ||
    seed.worldId !== 'WORLD_POSTWAR_GCU_OPENING_20261029_V1' ||
    seed.seedId !== 'SEED_POSTWAR_GCU_OPENING_20261029_V1'
  )
    invalid('FIXED_ADOPTED_CORE_SEED_REQUIRED');
  const canonicalSeedSha256 = hashPostwarFinanceSocialSeedIntent(seed);
  // Constructor identity alone is insufficient: Core constructors support DI digests.
  if (seed.fingerprint !== 'sha256:' + shaSeedFingerprint(seed))
    invalid('ACTUAL_SEED_FINGERPRINT_REQUIRED');
  const retainedSources = Object.fromEntries(
    seed.sources.map((s) => [s.sourceId, s.payloadHash]),
  );
  if (
    C.canonicalSerialize(retainedSources) !==
    C.canonicalSerialize(POSTWAR_DAY_ONE_FX_RETAINED_SOURCES)
  )
    invalid('EXACT_FOUR_SOURCE_PINS_REQUIRED');
  const view = readPostwarOperatingGenesisFromSeed(seed);
  if (!view.socialEmployment || !view.financialOfficeOriginalsDocument)
    invalid('FULL_OPERATING_AND_FINANCIAL_ORIGINALS_REQUIRED');
  const financialOriginalsDocument = view.financialOfficeOriginalsDocument;
  const document = validatePostwarSocialEmploymentStateDocument(
    view.socialEmployment,
  );
  const financial = readPostwarFinancialOfficeOriginalsFromSeed(seed);
  const operating = seed.sources.filter(
    (s) => s.sourceId === 'SOURCE_POSTWAR_OPERATING_V1',
  );
  if (
    operating.length !== 1 ||
    document.countries.length !== 70 ||
    document.inputs.worldId !== seed.worldId ||
    document.inputs.seedId !== seed.seedId
  )
    invalid('EXACT_70_COUNTRY_DOCUMENT_REQUIRED');
  const source = seed.sources.find(
    (s) => s.sourceId === financial.financialSourceId,
  );
  if (!source) invalid('FINANCIAL_SOURCE_REQUIRED');
  const assembly = JSON.parse(source.canonicalPayload) as {
    assembly: {
      countries: {
        countryId: string;
        roster: { government: string; centralBank: string };
      }[];
    };
  };
  const legs = seed.financialBatches
    .filter((b) => b.sourceId === financial.financialSourceId)
    .flatMap((b) => b.legs);
  const ids = new Map<string, string>();
  const countries = document.countries
    .map((country) => {
      const cid = country.countryId;
      const wages = document.inputs.labour.positions
        .filter((w) => w.countryId === cid)
        .sort((a, b) => a.positionId.localeCompare(b.positionId));
      const funding = document.inputs.fundingAccounts
        .filter((f) => f.countryId === cid)
        .sort((a, b) => a.accountRef.localeCompare(b.accountRef));
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
        if (ids.has(id) && ids.get(id) !== cid)
          invalid('GLOBAL_IDENTIFIER_COLLISION');
        ids.set(id, cid);
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
        wages,
        funding,
        cohorts,
      };
      const roster = assembly.assembly.countries.filter(
        (c) => c.countryId === cid,
      );
      const originals = financial.contract.countries.filter(
        (c) => c.countryId === cid,
      );
      if (roster.length !== 1 || originals.length !== 1)
        invalid('EXACT_COUNTRY_FINANCIAL_ORIGINAL_REQUIRED');
      const gov = roster[0]!.roster.government,
        cb = roster[0]!.roster.centralBank,
        currency = originals[0]!.localCurrency;
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
      if (assets.length !== 1) invalid('EXACT_TGA_ASSET_REQUIRED');
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
      if (mirrors.length !== 1) invalid('EXACT_RECIPROCAL_TGA_REQUIRED');
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
          invalid('FUNDING_SCOPE_DIFFERS');
        total = total.add(C.Money.from(f.ceilingAmount, currency));
      }
      const funds = funding.filter(
        (f) =>
          f.payerRole === 'GOV' &&
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
        invalid('EXACT_RESERVATIONS_REQUIRED');
      // Admission is installed independently and injected only inside the definer.
      const capacity = {
        schemaVersion: 'finance-budget-capacity-source-v1',
        worldId: seed.worldId,
        countryId: cid,
        seedId: seed.seedId,
        seedFingerprint: seed.fingerprint,
        modelVersion: seed.replayBinding.modelVersion,
        openingWorldVersion: '0',
        governmentEntityId: gov,
        centralBankEntityId: cb,
        financialSourceId: financial.financialSourceId,
        canonicalSeedSha256: 'sha256:' + canonicalSeedSha256,
        financialOriginalsSha256: 'sha256:' + financialOriginalsDocument.sha256,
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
      const capacityOriginal = capacity;
      const body = {
        schemaVersion: 'postwar-finance-social-country-original-v1',
        countryId: cid,
        worldId: seed.worldId,
        seedId: seed.seedId,
        seedFingerprint: seed.fingerprint,
        canonicalSeedSha256,
        operatingSourceId: operating[0]!.sourceId,
        operatingSourcePayloadHash: operating[0]!.payloadHash,
        state: country.state,
        offers: country.offers,
        fundingAccounts: funding.filter((f) => f.payerRole === 'GOV'),
        scope,
        capacity: capacityOriginal,
      };
      const derivedText = C.canonicalSerialize(body);
      if (
        Buffer.byteLength(derivedText) > 524288 ||
        Buffer.byteLength(C.canonicalSerialize(scope)) > 262144
      )
        invalid('BOUNDED_COUNTRY_ORIGINAL_REQUIRED');
      return Object.freeze({
        countryId: cid,
        derivedText,
        derivedSha256: sha(derivedText),
      });
    })
    .sort((a, b) => a.countryId.localeCompare(b.countryId));
  if (new Set(countries.map((c) => c.countryId)).size !== 70)
    invalid('EXACT_COUNTRY_SET_REQUIRED');
  const result = Object.freeze({
    schemaVersion: 'postwar-finance-social-derived-manifest-v1' as const,
    worldId: seed.worldId,
    seedId: seed.seedId,
    seedFingerprint: seed.fingerprint,
    canonicalSeedSha256,
    retainedSources: Object.freeze(retainedSources),
    countries: Object.freeze(countries),
  });
  derived.add(result);
  return result;
}
function shaSeedFingerprint(seed: C.OpeningSeed): string {
  return hashSeedIntent(seed, 'SHA-256\n');
}
/** Caller supplies only an issued derivation and two separately owned fixed
 * publisher connections. No request pool or arbitrary SQL/rows is accepted. */
export async function publishPostwarFinanceSocialSources(input: {
  readonly derivation: PostwarFinanceSocialSourceDerivation;
  readonly financeDatabase: SqlDatabase;
  readonly socialDatabase: SqlDatabase;
}) {
  const d = input.derivation;
  if (!derived.has(d)) invalid('ISSUED_DERIVATION_REQUIRED');
  if (input.financeDatabase === input.socialDatabase)
    invalid('DISTINCT_FIXED_PUBLISHER_CONNECTIONS_REQUIRED');
  const results = [];
  // Each country/function is independently immutable and retryable. Separate
  // source owners never gain membership or cross-table INSERT privileges.
  for (const country of d.countries) {
    for (const [database, fn] of [
      [input.socialDatabase, 'publish_postwar_social_source_bounded'],
      [input.financeDatabase, 'publish_postwar_finance_source_bounded'],
    ] as const) {
      const r = await database.transaction((tx) =>
        tx.query('select * from world_v2.' + fn + '($1)', [
          country.derivedText,
        ]),
      );
      if (
        r.rows.length !== 1 ||
        typeof r.rows[0]?.source_ref !== 'string' ||
        typeof r.rows[0]?.source_sha256 !== 'string'
      )
        invalid('EXACT_PUBLICATION_READBACK_REQUIRED');
      results.push(
        Object.freeze({
          countryId: country.countryId,
          function: fn,
          sourceRef: r.rows[0]!.source_ref,
          sourceSha256: r.rows[0]!.source_sha256,
        }),
      );
    }
  }
  return Object.freeze({
    classification: 'FIXED_SOURCE_PUBLICATION_NOT_ACTIVATION' as const,
    seedFingerprint: d.seedFingerprint,
    results: Object.freeze(results),
  });
}
