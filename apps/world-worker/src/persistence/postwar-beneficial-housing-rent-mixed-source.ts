/** Fixed shared-host association of live, independently prepared H0 DATA.
 * Historical rent originals do not become current rent/source/Clock authority.
 * New rent commands still require the real publication + source guard; every
 * sibling office retains its own current admission/authority/head checks. */
import {
  canonicalSerialize,
  type BeneficialHousingReclassificationReceipt,
} from '@econmind/core';
import {
  replayPreparedFinanceSocialFxLedger,
  type PreparedFinanceSocialLedger,
} from '@econmind/core/finance-social-prepared-ledger';
import {
  readFinanceSocialSourceBinding,
  type FinanceSocialSourceBinding,
} from '../runtime-preparation/finance-social-runtime-connection.js';
import {
  readPostwarSocialRuntimeFinancialReplayBase,
  readPostwarSocialRuntimeConnectionResources,
} from '../runtime-preparation/social-runtime-connection.js';
import {
  consumePreparedPostwarSocialFinancialReplayBase,
  type PreparedPostwarSocialFinancialReplayBase,
} from './prepared-postwar-social-source.js';
import { consumeBeneficialHousingRentSource } from './postwar-beneficial-housing-rent-source.js';
import {
  readPostwarBeneficialHousingRentRuntimeResources,
  readPostwarBeneficialHousingRentSourcePreparation,
  type PostwarBeneficialHousingRentRuntime,
} from './postwar-beneficial-housing-rent-runtime.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import type { PreparedBeneficialHousingRentSource } from './postwar-beneficial-housing-rent-source.js';
import type { PreparedFinanceSocialFxReplayResult } from '@econmind/core/finance-social-prepared-ledger';
import { replayPreparedPostwarFinanceSocialFxFrom } from './prepared-postwar-finance-social-fx-replay.js';
import { createPostwarSocialSourceRoleScope } from './postwar-social-position-runtime.js';
import { lockRegisteredSourceFrom } from './postgres-social-operating-custody.js';
import type { decodeBoundedPostwarCanonicalPrefix } from './bounded-postwar-canonical-prefix.js';
interface Association {
  readonly shared: FinanceSocialSourceBinding;
  readonly rent: Readonly<PostwarBeneficialHousingRentRuntime>;
  readonly worldId: string;
}
const byRentRuntime = new WeakMap<object, Readonly<Association>>();
const byFinancialBase = new WeakMap<
  PreparedFinanceSocialLedger,
  Readonly<Association>
>();
const byDatabase = new WeakMap<
  SqlDatabase,
  Map<string, Readonly<Association>>
>();
const key = (worldId: string, seedId: string, seedFingerprint: string) =>
  canonicalSerialize([worldId, seedId, seedFingerprint]);
function invalid(reason: string): never {
  throw Error('BENEFICIAL_RENT_MIXED_SOURCE:' + reason);
}
function read(a: Readonly<Association>) {
  const shared = readFinanceSocialSourceBinding(a.shared),
    resources = readPostwarBeneficialHousingRentRuntimeResources(
      a.rent,
      a.worldId,
    );
  const b = consumePreparedPostwarSocialFinancialReplayBase(
    readPostwarSocialRuntimeFinancialReplayBase(
      shared.socialConnection,
      a.worldId,
    ),
  );
  const rent = consumeBeneficialHousingRentSource(
    readPostwarBeneficialHousingRentSourcePreparation(a.rent, a.worldId),
  );
  if (
    shared.worldId !== a.worldId ||
    resources.worldId !== a.worldId ||
    resources.workerId !== shared.workerId ||
    resources.database !== shared.database ||
    resources.clock !== shared.clock ||
    resources.workerRole !==
      readPostwarSocialRuntimeConnectionResources(shared.socialConnection)
        .workerRole ||
    rent.worldId !== b.pins.worldId ||
    rent.seedId !== b.pins.seedRef ||
    rent.seedFingerprint !== b.pins.contentHash
  )
    invalid(
      'EXACT_SHARED_WORLD_WORKER_DATABASE_CLOCK_AND_ADMITTED_CHILD_REQUIRED',
    );
  for (const r of rent.receipts) {
    if (
      b.sourceMetadata.filter((s) => s.sourceId === r.supplementalSourceId)
        .length !== 1
    )
      invalid('ACTUAL_CHILD_SOURCE_NOT_IN_GENUINE_SHARED_BASE');
  }
  return { shared, b, rent };
}
/** Called only after both actual source preparations. Exact private shared
 * identity prevents a copied connection or independent parent/child mismatch.
 * No record is indexed by country/World alone and no SQL grant is installed. */
export function bindPostwarBeneficialHousingRentMixedSource(input: {
  readonly shared: FinanceSocialSourceBinding;
  readonly rent: Readonly<PostwarBeneficialHousingRentRuntime>;
}): void {
  const shared = readFinanceSocialSourceBinding(input.shared),
    a = Object.freeze({ ...input, worldId: shared.worldId });
  const { b, rent } = read(a);
  const empty = replayPreparedFinanceSocialFxLedger({
    prepared: b.prepared,
    frames: [],
    socialCountries: b.document.countries.map((c) => ({
      countryId: c.countryId,
      state: c.state,
      offers: c.offers,
    })),
    openingEncumbrances: [],
    fxOriginals: [],
    expectedHead: { worldVersion: '0', eventSequence: '0' },
    sha256Hex: shared.sha256Hex,
  });
  if (
    canonicalSerialize(empty.financial) !==
    canonicalSerialize(rent.openingFinancial)
  )
    invalid('EXACT_SAME_GENUINE_CHILD_H0_FINANCIAL_BASE_REQUIRED');
  const prior = byFinancialBase.get(b.prepared);
  if (prior && (prior.shared !== a.shared || prior.rent !== a.rent))
    invalid('LIVE_RENT_ORIGINALS_ALREADY_BOUND');
  let worlds = byDatabase.get(shared.database);
  if (!worlds) {
    worlds = new Map();
    byDatabase.set(shared.database, worlds);
  }
  const id = key(rent.worldId, rent.seedId, rent.seedFingerprint),
    databasePrior = worlds.get(id);
  if (
    databasePrior &&
    (databasePrior.shared !== a.shared || databasePrior.rent !== a.rent)
  )
    invalid('EXACT_DATABASE_SOURCE_ALREADY_BOUND');
  const priorRuntime = byRentRuntime.get(input.rent);
  if (priorRuntime && priorRuntime.shared !== a.shared)
    invalid('RENT_RUNTIME_ALREADY_ASSOCIATED');
  byRentRuntime.set(input.rent, a);
  byFinancialBase.set(b.prepared, a);
  worlds.set(id, a);
}
/** Inert historical original DATA for a genuine Social/Finance H0 base. A
 * missing installation stays undefined; a retired/mismatched association fails. */
export function readPostwarBeneficialHousingRentMixedOriginalsForSocialBase(
  value: Readonly<PreparedPostwarSocialFinancialReplayBase>,
): readonly Readonly<BeneficialHousingReclassificationReceipt>[] | undefined {
  const base = consumePreparedPostwarSocialFinancialReplayBase(value),
    a = byFinancialBase.get(base.prepared);
  if (!a) return undefined;
  const current = read(a);
  if (current.b.prepared !== base.prepared)
    invalid('EXACT_LIVE_FINANCIAL_PREPARATION_REQUIRED');
  return current.rent.receipts;
}
/** Fixed FX siblings use the exact same server-owned DB identity + seed pins;
 * an independent runtime cannot borrow originals from another database. */
export function readPostwarBeneficialHousingRentMixedOriginalsForDatabase(input: {
  readonly database: SqlDatabase;
  readonly worldId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
}): readonly Readonly<BeneficialHousingReclassificationReceipt>[] | undefined {
  const a = byDatabase
    .get(input.database)
    ?.get(key(input.worldId, input.seedId, input.seedFingerprint));
  if (!a) return undefined;
  const current = read(a);
  if (
    current.rent.worldId !== input.worldId ||
    current.rent.seedId !== input.seedId ||
    current.rent.seedFingerprint !== input.seedFingerprint
  )
    invalid('EXACT_DATABASE_CHILD_BINDING_REQUIRED');
  return current.rent.receipts;
}

/** Complete sibling replay for the actual rent runtime. Registration locks are
 * reacquired in the same held transaction under its existing fixed Social
 * reader, then restored before the automatic rent writer continues. No role
 * membership, callback registry, current balance or admission is invented. */
export async function replayPostwarBeneficialHousingRentMixedFrom(input: {
  readonly runtime: Readonly<PostwarBeneficialHousingRentRuntime>;
  readonly preparation: PreparedBeneficialHousingRentSource;
  readonly executor: SqlExecutor;
  readonly countryId: string;
  readonly admissionRef?: string;
  readonly prefix: ReturnType<typeof decodeBoundedPostwarCanonicalPrefix>;
}): Promise<PreparedFinanceSocialFxReplayResult | null> {
  const a = byRentRuntime.get(input.runtime);
  if (!a) return null;
  const { shared, b, rent } = read(a);
  if (
    consumeBeneficialHousingRentSource(input.preparation) !== rent ||
    (input.admissionRef !== undefined &&
      input.admissionRef !== b.pins.admissionRef) ||
    !b.document.countries.some((c) => c.countryId === input.countryId)
  )
    invalid('EXACT_LIVE_CHILD_PREPARATION_AND_ADMISSION_REQUIRED');
  const role = readPostwarSocialRuntimeConnectionResources(
    shared.socialConnection,
  ).workerRole;
  const roles = createPostwarSocialSourceRoleScope({ workerRole: role });
  return roles.withSourceReaderFrom(input.executor, async () => {
    const registration = await lockRegisteredSourceFrom(
        input.executor,
        a.worldId,
        input.countryId,
      ),
      row = registration.rows[0];
    if (
      registration.rows.length !== 1 ||
      !row ||
      row.world_id !== a.worldId ||
      row.country_id !== input.countryId ||
      row.seed_fingerprint !== rent.seedFingerprint ||
      row.admission_ref !== b.pins.admissionRef ||
      b.sourceMetadata.filter(
        (s) =>
          s.sourceId === row.source_id &&
          s.payloadHash === row.source_payload_hash,
      ).length !== 1
    )
      invalid('ACTUAL_SHARED_HOST_SOURCE_AND_ADMISSION_REQUIRED');
    return replayPreparedPostwarFinanceSocialFxFrom({
      executor: input.executor,
      baseline: b,
      worldId: a.worldId,
      hostCountryId: input.countryId,
      officeId: 'SOCIAL',
      seedId: rent.seedId,
      seedFingerprint: rent.seedFingerprint,
      admissionRef: b.pins.admissionRef,
      frames: input.prefix.frames,
      expectedHead: input.prefix.head,
    });
  });
}

/** Sole owner cleanup after active steps drain, before either source closes.
 * It releases only this exact private association, never a lease or SQL grant. */
export function releasePostwarBeneficialHousingRentMixedSource(input: {
  readonly shared: FinanceSocialSourceBinding;
  readonly rent: Readonly<PostwarBeneficialHousingRentRuntime>;
}): void {
  const a = byRentRuntime.get(input.rent);
  if (!a) return;
  if (a.shared !== input.shared) invalid('EXACT_SHARED_RENT_OWNER_REQUIRED');
  const d = readFinanceSocialSourceBinding(input.shared);
  const baseline = readPostwarSocialRuntimeFinancialReplayBase(
    d.socialConnection,
    a.worldId,
  );
  if (byFinancialBase.get(baseline.prepared) === a)
    byFinancialBase.delete(baseline.prepared);
  const worlds = byDatabase.get(d.database);
  if (worlds)
    for (const [id, value] of worlds) if (value === a) worlds.delete(id);
  byRentRuntime.delete(input.rent);
}
