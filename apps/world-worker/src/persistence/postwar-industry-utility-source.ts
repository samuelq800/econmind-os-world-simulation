/** Fixed adopted water/power originals. Startup calculations are immutable
 * DATA; only an actual compact SQL registration can install a runtime source. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  canonicalSerialize,
  canonicalDecimal,
  WorldDecimal,
  assertWorldDecimalResult,
  type OpeningSeed,
} from '@econmind/core';
import {
  createIndustryFirstDayWaterScenario,
  INDUSTRY_FIRST_DAY_WATER_SCENARIO_POLICY as WATER_POLICY,
  type IndustryWaterScenarioState,
} from '@econmind/core/industry-first-day-water-scenario';
import {
  DAY_ONE_STORAGE_SELF_USE_POLICY,
  type DayOneStorageOpening,
} from '@econmind/core/postwar-day-one-storage-self-use';
import type { PreparedBeneficialHousingRentSource } from './postwar-beneficial-housing-rent-source.js';
import { readPostwarBeneficialHousingRentChildOperatingView } from './postwar-beneficial-housing-rent-child-view.js';
import { readPostwarOperatingGenesisFromSeed } from '../preparation/postwar-operating-genesis-adoption.js';
import { loadPostwarSourceContext } from '../preparation/postwar-source-context.js';
import { buildOfficialPhysicalOpeningAdoption } from '../preparation/official-physical-opening-adoption.js';
import {
  consumePreparedPostwarSocialFinancialReplayBase,
  type PreparedPostwarSocialFinancialReplayBase,
  type PostwarSocialPreparationPins,
} from './prepared-postwar-social-source.js';
import {
  isPostwarSocialRuntimeConnection,
  readPostwarSocialRuntimeFinancialReplayBase,
  readPostwarSocialRuntimeConnectionResources,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import type { SqlExecutor, SqlDatabase } from './sql-database.js';
import type { PostwarPhysicalSourceContext } from '../preparation/postwar-physical-service-receipt.js';
import {
  selectPostwarIndustryRefinerySite,
  readPostwarIndustryRefineryCoverage,
  type PostwarIndustryRefinerySite,
} from './postwar-industry-refinery-sites.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function fail(s: string): never {
  throw Error('INDUSTRY_UTILITY_SOURCE:' + s);
}
function row(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    fail('SOURCE_OBJECT_REQUIRED');
  return v as Record<string, unknown>;
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v) fail('SOURCE_TEXT_REQUIRED');
  return v;
}
function decimal(v: unknown) {
  return canonicalDecimal(assertWorldDecimalResult(new WorldDecimal(text(v))));
}
function freeze<T>(v: T): Readonly<T> {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
/** Immutable source identity excludes read constraints such as minimum head.
 * This is deterministic DATA derivation, never preparation or authorization. */
export function derivePostwarIndustryUtilityScenarioRef(
  pins: PostwarSocialPreparationPins,
): string {
  return (
    'INDUSTRY_FIRST_DAY_' +
    sha(
      canonicalSerialize({
        worldId: pins.worldId,
        seedRef: pins.seedRef,
        contentHash: pins.contentHash,
        admissionRef: pins.admissionRef,
      }),
    ).toUpperCase()
  );
}
export const INDUSTRY_UTILITY_PUBLISH_QUERY =
  'select * from world_v2.publish_postwar_industry_utility_source($1,$2,$3::jsonb,$4)';
export const INDUSTRY_UTILITY_READ_QUERY =
  'select * from world_v2.read_postwar_industry_utility_source($1,$2,$3,$4::bigint,$5::bigint)';
export interface PostwarIndustryUtilitySourceInput {
  readonly repositoryRoot: string;
  /** Controlled server selection, independently matched to actual adopted originals.
   * Omission preserves the original C2 entry point, not a first-site fallback. */
  readonly site?: Readonly<{ countryId: string; facilityId: string }>;
  readonly socialConnection: Readonly<PostwarSocialRuntimeConnection>;
  readonly startupSeed: Readonly<OpeningSeed>;
  readonly startupBeneficialHousingRentSource?: PreparedBeneficialHousingRentSource;
}
export interface PostwarIndustryUtilityCompactSource {
  readonly schemaVersion: 'postwar-industry-utility-original-v1';
  readonly worldId: string;
  readonly countryId: string;
  readonly facilityId: string;
  readonly locationId: string;
  readonly operatorId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly openingGregorianTimestamp: string;
  readonly sourceChecksumsSha256: string;
  readonly adoptionRawSha256: string;
  readonly power: Readonly<DayOneStorageOpening>;
  readonly water: Readonly<{
    sourceRegionId: string;
    basinRef: string;
    rawQuotaPerDay: string;
    allocationRawSha256: string;
  }>;
  readonly sourcePins: Readonly<Record<string, string>>;
}
declare const proposed: unique symbol;
export interface PostwarIndustryUtilitySourceProposal {
  readonly [proposed]: true;
}
declare const prepared: unique symbol;
export interface PreparedPostwarIndustryUtilitySource {
  readonly [prepared]: true;
}
interface Original {
  readonly social: Readonly<PostwarSocialRuntimeConnection>;
  readonly baseline: Readonly<PreparedPostwarSocialFinancialReplayBase>;
  readonly compact: Readonly<PostwarIndustryUtilityCompactSource>;
  readonly sourceCountryId: string;
  readonly compactText: string;
  readonly compactSha256: string;
  readonly raw: Readonly<Record<string, string>>;
  readonly adoptionBytes: string;
  readonly scenario: Readonly<IndustryWaterScenarioState>;
}
const sourceOwners = new WeakMap<object, object>();
const proposals = new WeakMap<object, Original>(),
  preparedSources = new WeakMap<object, Original>(),
  installed = new WeakMap<
    object,
    Map<string, PreparedPostwarIndustryUtilitySource>
  >();
const legacySite = Object.freeze({
  countryId: 'COUNTRY_02',
  facilityId: 'OPEN-02-REFINED_FUEL',
});
function siteKey(site: Readonly<{ countryId: string; facilityId: string }>) {
  return canonicalSerialize([site.countryId, site.facilityId]);
}
/** Uses the existing validated operating view/financial original, including
 * child->parent proof. It never guesses simulation date from real wall time. */
export function readPostwarIndustryUtilityOpeningDateFromSeed(
  input: Pick<
    PostwarIndustryUtilitySourceInput,
    'startupSeed' | 'startupBeneficialHousingRentSource'
  >,
): string {
  const view = input.startupBeneficialHousingRentSource
    ? readPostwarBeneficialHousingRentChildOperatingView({
        seed: input.startupSeed,
        preparation: input.startupBeneficialHousingRentSource,
      }).parentView
    : readPostwarOperatingGenesisFromSeed(input.startupSeed);
  const original = view.financialOfficeOriginalsDocument;
  if (!original || sha(original.bytes) !== original.sha256)
    fail('VALIDATED_FINANCIAL_VALUE_DATE_ORIGINAL_REQUIRED');
  const date = text(row(row(JSON.parse(original.bytes)).contract).valueDate);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
    new Date(date + 'T00:00:00.000Z').toISOString().slice(0, 10) !== date
  )
    fail('ACTUAL_GENESIS_VALUE_DATE_REQUIRED');
  return date + 'T00:00:00.000Z';
}
async function loadUtilityStartup(input: PostwarIndustryUtilitySourceInput) {
  const social = input.socialConnection;
  if (
    !path.isAbsolute(input.repositoryRoot) ||
    !isPostwarSocialRuntimeConnection(social, social?.worldId)
  )
    fail('GENUINE_SOCIAL_AND_FIXED_REPOSITORY_REQUIRED');
  const baseline = readPostwarSocialRuntimeFinancialReplayBase(
      social,
      social.worldId,
    ),
    b = consumePreparedPostwarSocialFinancialReplayBase(baseline),
    seed = input.startupSeed;
  if (
    seed.worldId !== b.pins.worldId ||
    seed.seedId !== b.pins.seedRef ||
    seed.fingerprint !== b.pins.contentHash
  )
    fail('ACTUAL_PREPARED_CHILD_OR_PARENT_SEED_REQUIRED');
  const [context, adoptionBytes, utilityPolicy] = await Promise.all([
    loadPostwarSourceContext(input.repositoryRoot),
    readFile(
      path.join(input.repositoryRoot, WATER_POLICY.userAdoptionPath),
      'utf8',
    ),
    readFile(
      path.join(
        input.repositoryRoot,
        'config/postwar-genesis/utilities.v1.json',
      ),
      'utf8',
    ),
  ]);
  if (
    sha(context.sourceBytes.checksumsBytes) !==
      b.document.inputs.sourceChecksumsSha256 ||
    sha(adoptionBytes) !== WATER_POLICY.userAdoptionSha256
  )
    fail('ACTUAL_E03_SOURCE_AND_ADOPTION_PINS_REQUIRED');
  const raw: Record<string, string> = {};
  for (const name of [
    'power',
    'facilities',
    'recipes',
    'water-allocations',
    'population-services',
    'seasonal-water',
    'geography',
    'regions',
    'countries',
  ]) {
    const bytes = context.sourceBytes.datasets['data/' + name + '.json'];
    if (typeof bytes !== 'string') fail('FIXED_RAW_SOURCE_MISSING:' + name);
    raw[name] = bytes;
  }
  const openingGregorianTimestamp =
      readPostwarIndustryUtilityOpeningDateFromSeed(input),
    scenario = createIndustryFirstDayWaterScenario(
      {
        modelRef:
          'INDUSTRY_WATER_' +
          sha(
            canonicalSerialize([b.pins.worldId, b.pins.contentHash]),
          ).toUpperCase(),
        adoptionRecordBytes: adoptionBytes,
        raw: {
          allocations: raw['water-allocations']!,
          population: raw['population-services']!,
          seasonal: raw['seasonal-water']!,
          geography: raw.geography!,
          regions: raw.regions!,
          countries: raw.countries!,
          facilities: raw.facilities!,
          recipes: raw.recipes!,
          utilityPolicy,
        },
        year: openingGregorianTimestamp.slice(0, 4),
        month: BigInt(openingGregorianTimestamp.slice(5, 7)).toString(),
      },
      sha,
    );
  return {
    social,
    baseline,
    b,
    context,
    adoptionBytes,
    utilityPolicy,
    raw,
    openingGregorianTimestamp,
    scenario,
    physical: buildOfficialPhysicalOpeningAdoption({
      sourceBytes: context.sourceBytes,
      ownerDecisionBytes: context.ownerOriginalBytes,
    }),
    refinerySites: readPostwarIndustryRefineryCoverage(context).sites,
  };
}
/** Pure derived DATA over the real pinned originals; neither this DTO nor its
 * pins are a prepared source, registration, currentness or execution proof. */
function deriveUtilityData(
  input: Readonly<{
    sourceContext: PostwarPhysicalSourceContext;
    site: Readonly<{ countryId: string; facilityId: string }>;
    pins: Readonly<{
      worldId: string;
      seedRef: string;
      contentHash: string;
      admissionRef: string;
    }>;
    openingGregorianTimestamp: string;
    utilityPolicyBytes: string;
  }>,
  physical: ReturnType<typeof buildOfficialPhysicalOpeningAdoption>,
  selected: Readonly<PostwarIndustryRefinerySite>,
) {
  const context = input.sourceContext,
    b = { pins: input.pins },
    openingGregorianTimestamp = input.openingGregorianTimestamp,
    utilityPolicy = input.utilityPolicyBytes;
  if (
    sha(utilityPolicy) !==
    '27bbb6a7fddc97b83b74cc4f3ef13455a3238f1998d10c34016123ba19cf6872'
  )
    fail('EXACT_PUBLIC_OPTION_POLICY_REQUIRED');
  const raw: Record<string, string> = {};
  for (const key of [
    'power',
    'facilities',
    'recipes',
    'water-allocations',
    'population-services',
    'seasonal-water',
    'geography',
    'regions',
    'countries',
  ]) {
    const value = context.sourceBytes.datasets['data/' + key + '.json'];
    if (typeof value !== 'string') fail('FIXED_RAW_SOURCE_MISSING:' + key);
    raw[key] = value;
  }
  const powers = physical.power.filter(
    (p) => p.countryId === selected.countryId,
  );
  if (powers.length !== 1) fail('ONE_ACTUAL_COUNTRY_POWER_ORIGINAL_REQUIRED');
  const p = powers[0]!,
    storage = physical.facilities.find((f) => f.id === p.storageFacilityId),
    grid = physical.facilities.find((f) => f.id === p.gridFacilityId),
    target = physical.facilities.find((f) => f.id === selected.facilityId);
  if (
    !storage ||
    !grid ||
    !target ||
    !p.openingStorage ||
    storage.status !== 'ADOPTED_BUILT' ||
    grid.status !== 'ADOPTED_BUILT' ||
    target.operatorId !== selected.operatorId ||
    storage.operatorId !== target.operatorId ||
    grid.operatorId !== target.operatorId ||
    storage.titleHolderId !== target.operatorId ||
    grid.titleHolderId !== target.operatorId ||
    storage.riskBearerId !== target.operatorId ||
    grid.riskBearerId !== target.operatorId
  )
    fail('ACTUAL_SAME_OPERATOR_TITLE_RISK_AND_EXISTING_STORAGE_GRID_REQUIRED');
  const parse = JSON.parse as (
    raw: string,
    reviver: (
      key: string,
      value: unknown,
      context: { source?: string },
    ) => unknown,
  ) => unknown;
  const allocations = parse(raw['water-allocations']!, (_k, v, c) =>
    typeof v === 'number' ? c.source : v,
  );
  if (!Array.isArray(allocations)) fail('ACTUAL_WATER_ALLOCATIONS_REQUIRED');
  const waters = allocations
    .map(row)
    .filter(
      (w) =>
        w.regionId === target.source.regionId &&
        w.countryId === target.source.countryId,
    );
  if (waters.length !== 1) fail('ONE_ACTUAL_TARGET_WATER_ALLOCATION_REQUIRED');
  const water = waters[0]!,
    sourcePins = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, sha(v)]),
    );
  const soc = decimal(p.openingStorage.stateOfCharge.amount),
    retained = canonicalDecimal(
      assertWorldDecimalResult(new WorldDecimal(soc).times('0.1')),
    );
  // Conservatively retain the pre-existing finite GOV public option. This is
  // not a payment/delivery claim, nor additional supply for Industry.
  const power: DayOneStorageOpening = {
    scenarioRef: derivePostwarIndustryUtilityScenarioRef(b.pins),
    worldId: b.pins.worldId,
    seedFingerprint: b.pins.contentHash,
    countryId: selected.countryId,
    storageId: storage.id,
    gridId: grid.id,
    operatorId: target.operatorId,
    storageOwnerId: storage.titleHolderId!,
    gridOwnerId: grid.titleHolderId!,
    sourceRef: 'INDUSTRY_STORAGE_' + sha(raw.power!).toUpperCase(),
    sourceRawSha256: sourcePins.power!,
    originalEnergyCapacityMWh: decimal(p.openingStorage.energyCapacity.amount),
    originalOpeningSocMWh: soc,
    originalStorageDischargeMW: decimal(p.source.storageDischargeMW),
    originalGridMW: decimal(grid.source.capacity),
    originalLossFraction: decimal(p.source.lossFraction),
    originalEfficiency: '0.9',
    protectedReservations: [
      {
        reservationRef: 'RETAINED_OPENING_PUBLIC_OPTION_' + selected.countryId,
        kind: 'PUBLIC_PRIORITY',
        fromSimTime: '0',
        throughSimTime: '21600000',
        storedEnergyMWh: retained,
        outputMWh: canonicalDecimal(
          assertWorldDecimalResult(new WorldDecimal(retained).times('0.85')),
        ),
        sourceRef: 'POSTWAR_UTILITIES_20261028_V1',
        sourceRawSha256: sha(utilityPolicy),
      },
    ],
  };
  const compact: Readonly<PostwarIndustryUtilityCompactSource> = freeze({
    schemaVersion: 'postwar-industry-utility-original-v1',
    worldId: b.pins.worldId,
    countryId: selected.countryId,
    facilityId: selected.facilityId,
    locationId: target.regionId,
    operatorId: target.operatorId,
    seedId: b.pins.seedRef,
    seedFingerprint: b.pins.contentHash,
    admissionRef: b.pins.admissionRef,
    openingGregorianTimestamp,
    sourceChecksumsSha256: sha(context.sourceBytes.checksumsBytes),
    adoptionRawSha256: WATER_POLICY.userAdoptionSha256,
    power,
    water: {
      sourceRegionId: text(water.regionId),
      basinRef: text(water.basinId),
      rawQuotaPerDay: decimal(water.industryM3Day),
      allocationRawSha256: sourcePins['water-allocations']!,
    },
    sourcePins,
  });
  return freeze({
    compact,
    raw,
    sourceCountryId: text(target.source.countryId),
  });
}
export function derivePostwarIndustryUtilityCompactSourceData(
  input: Parameters<typeof deriveUtilityData>[0],
) {
  return deriveUtilityData(
    input,
    buildOfficialPhysicalOpeningAdoption({
      sourceBytes: input.sourceContext.sourceBytes,
      ownerDecisionBytes: input.sourceContext.ownerOriginalBytes,
    }),
    selectPostwarIndustryRefinerySite(input.sourceContext, input.site),
  );
}
/** All applicable real source scopes; still DATA, never SQL/actor authority. */
export function derivePostwarIndustryUtilityCompactSourceDataSet(
  input: Omit<Parameters<typeof deriveUtilityData>[0], 'site'>,
) {
  const physical = buildOfficialPhysicalOpeningAdoption({
      sourceBytes: input.sourceContext.sourceBytes,
      ownerDecisionBytes: input.sourceContext.ownerOriginalBytes,
    }),
    coverage = readPostwarIndustryRefineryCoverage(input.sourceContext);
  return Object.freeze({
    notApplicableCountries: coverage.notApplicableCountries,
    sites: Object.freeze(
      coverage.sites.map((site) =>
        deriveUtilityData({ ...input, site }, physical, site),
      ),
    ),
  });
}
function issueUtilityProposal(
  startup: Awaited<ReturnType<typeof loadUtilityStartup>>,
  site: Readonly<{ countryId: string; facilityId: string }>,
): Readonly<PostwarIndustryUtilitySourceProposal> {
  const {
    social,
    baseline,
    b,
    context,
    adoptionBytes,
    raw,
    openingGregorianTimestamp,
    scenario,
  } = startup;
  const { compact, sourceCountryId } = deriveUtilityData(
    {
      sourceContext: context,
      site,
      pins: b.pins,
      openingGregorianTimestamp,
      utilityPolicyBytes: startup.utilityPolicy,
    },
    startup.physical,
    startup.refinerySites.find(
      (s) => s.countryId === site.countryId && s.facilityId === site.facilityId,
    ) ?? selectPostwarIndustryRefinerySite(context, site),
  );
  const compactText = canonicalSerialize(compact),
    token = Object.freeze({}) as PostwarIndustryUtilitySourceProposal;
  proposals.set(token, {
    social,
    baseline,
    compact,
    sourceCountryId,
    compactText,
    compactSha256: sha(compactText),
    raw: freeze(raw),
    adoptionBytes,
    scenario,
  });
  return token;
}
export async function loadPostwarIndustryUtilitySourceProposal(
  input: PostwarIndustryUtilitySourceInput,
): Promise<Readonly<PostwarIndustryUtilitySourceProposal>> {
  return issueUtilityProposal(
    await loadUtilityStartup(input),
    input.site ?? legacySite,
  );
}
/** One genuine startup validation; each result is still a scoped opaque DATA
 * proposal. SQL publication independently verifies every original and admission. */
export async function loadPostwarIndustryUtilitySourceProposals(
  input: Omit<PostwarIndustryUtilitySourceInput, 'site'>,
): Promise<readonly Readonly<PostwarIndustryUtilitySourceProposal>[]> {
  const startup = await loadUtilityStartup(input);
  return Object.freeze(
    startup.refinerySites.map((site) => issueUtilityProposal(startup, site)),
  );
}
export async function publishPostwarIndustryUtilitySourcesFrom(
  tx: SqlExecutor,
  input: { readonly proposal: Readonly<PostwarIndustryUtilitySourceProposal> },
): Promise<Readonly<{ sourceRef: string; sourceSha256: string }>> {
  const p = proposals.get(input.proposal);
  if (!p) fail('GENUINE_FIXED_SOURCE_PROPOSAL_REQUIRED');
  consumePreparedPostwarSocialFinancialReplayBase(p.baseline);
  const r = await tx.query<{ source_ref: string; source_sha256: string }>(
    INDUSTRY_UTILITY_PUBLISH_QUERY,
    [p.compact.worldId, p.compactText, p.raw, p.adoptionBytes],
  );
  if (
    r.rows.length !== 1 ||
    r.rows[0]?.source_sha256 !== p.compactSha256 ||
    r.rows[0]?.source_ref !==
      'INDUSTRY_UTILITY_' + p.compactSha256.toUpperCase()
  )
    fail('ACTUAL_FIXED_PUBLICATION_REQUIRED');
  return Object.freeze({
    sourceRef: r.rows[0].source_ref,
    sourceSha256: r.rows[0].source_sha256,
  });
}
export function consumePostwarIndustryUtilitySource(
  preparation: Readonly<PreparedPostwarIndustryUtilitySource>,
  social?: Readonly<PostwarSocialRuntimeConnection>,
) {
  const p = preparedSources.get(preparation);
  if (!p || (social && p.social !== social))
    fail('GENUINE_LIVE_SAME_SOCIAL_UTILITY_SOURCE_REQUIRED');
  consumePreparedPostwarSocialFinancialReplayBase(p.baseline);
  return p;
}
export function readPostwarIndustryUtilitySourceForBase(
  baseline: Readonly<PreparedPostwarSocialFinancialReplayBase>,
  site: Readonly<{ countryId: string; facilityId: string }> = legacySite,
): Readonly<PreparedPostwarIndustryUtilitySource> | undefined {
  consumePreparedPostwarSocialFinancialReplayBase(baseline);
  return installed.get(baseline.prepared)?.get(siteKey(site));
}
export function readPostwarIndustryUtilitySourceForPowerFacility(
  baseline: Readonly<PreparedPostwarSocialFinancialReplayBase>,
  scope: Readonly<{ countryId: string; facilityId: string }>,
): Readonly<PreparedPostwarIndustryUtilitySource> | undefined {
  consumePreparedPostwarSocialFinancialReplayBase(baseline);
  const matches = [
    ...(installed.get(baseline.prepared)?.values() ?? []),
  ].filter((token) => {
    const c = consumePostwarIndustryUtilitySource(token).compact;
    return (
      c.countryId === scope.countryId && c.power.storageId === scope.facilityId
    );
  });
  if (matches.length > 1)
    throw new PostwarIndustryUtilitySourceMissing(
      'AMBIGUOUS_REGISTERED_POWER_SERVICE_SCOPE',
    );
  return matches[0];
}
async function assertUtilitySourcePacketFrom(
  query: string,
  tx: SqlExecutor,
  input: {
    readonly preparation: Readonly<PreparedPostwarIndustryUtilitySource>;
    readonly head: { worldVersion: string; eventSequence: string };
  },
): Promise<void> {
  const p = consumePostwarIndustryUtilitySource(input.preparation),
    r = await tx.query<{
      source_text: string;
      source_sha256: string;
      source_ref: string;
      world_version: string;
      event_sequence: string;
    }>(query, [
      p.compact.worldId,
      p.compact.countryId,
      p.compact.facilityId,
      input.head.worldVersion,
      input.head.eventSequence,
    ]);
  if (r.rows.length !== 1)
    throw new PostwarIndustryUtilitySourceMissing(
      'REGISTERED_UTILITY_SOURCE_MISSING',
    );
  const s = r.rows[0]!;
  if (
    s.source_text !== p.compactText ||
    s.source_sha256 !== p.compactSha256 ||
    s.source_ref !== 'INDUSTRY_UTILITY_' + p.compactSha256.toUpperCase() ||
    s.world_version !== input.head.worldVersion ||
    s.event_sequence !== input.head.eventSequence ||
    sha(s.source_text) !== s.source_sha256
  )
    fail('ACTUAL_CURRENT_UTILITY_SOURCE_OR_HEAD_DIFFERS');
}
export function assertPostwarIndustryUtilitySourceFrom(
  tx: SqlExecutor,
  input: Parameters<typeof assertUtilitySourcePacketFrom>[2],
): Promise<void> {
  return assertUtilitySourcePacketFrom(INDUSTRY_UTILITY_READ_QUERY, tx, input);
}
export function assertPostwarIndustryUtilityHistorySourceFrom(
  tx: SqlExecutor,
  input: Parameters<typeof assertUtilitySourcePacketFrom>[2],
): Promise<void> {
  return assertUtilitySourcePacketFrom(
    'select * from world_v2.read_postwar_industry_utility_history_source($1,$2,$3,$4::bigint,$5::bigint)',
    tx,
    input,
  );
}
export async function preparePostwarIndustryUtilitySource(
  input: PostwarIndustryUtilitySourceInput,
): Promise<Readonly<PreparedPostwarIndustryUtilitySource>> {
  return prepareUtilityProposal(
    await loadPostwarIndustryUtilitySourceProposal(input),
  );
}
/** Fixed bounded startup DATA read, not a source token or caller authority.
 * Absence is a successful SQL result; errors never become an empty registry. */
export async function readPostwarIndustryUtilityRegisteredPacket(
  input: Readonly<{
    database: SqlDatabase;
    workerRole: string;
    worldId: string;
    countryId: string;
    facilityId: string;
  }>,
) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/u.test(input.workerRole))
    fail('FIXED_WORKER_ROLE_REQUIRED');
  return input.database.transaction(async (tx) => {
    await tx.query('set transaction isolation level repeatable read');
    const h = await tx.query<{ world_version: string; event_sequence: string }>(
      'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
      [input.worldId],
    );
    if (h.rows.length !== 1) fail('ACTUAL_WORLD_HEAD_REQUIRED');
    const head = Object.freeze({
      worldVersion: h.rows[0]!.world_version,
      eventSequence: h.rows[0]!.event_sequence,
    });
    let failure: unknown,
      source:
        | Readonly<{
            source_text: string;
            source_sha256: string;
            source_ref: string;
            world_version: string;
            event_sequence: string;
          }>
        | undefined;
    try {
      await tx.query('set local role world_v2_industry_source_reader');
      const r = await tx.query<NonNullable<typeof source>>(
        'select * from world_v2.read_postwar_industry_utility_history_source($1,$2,$3,$4::bigint,$5::bigint)',
        [
          input.worldId,
          input.countryId,
          input.facilityId,
          head.worldVersion,
          head.eventSequence,
        ],
      );
      if (r.rows.length > 1) fail('EXACT_REGISTERED_UTILITY_PACKET_REQUIRED');
      source = r.rows[0] && Object.freeze({ ...r.rows[0] });
    } catch (e) {
      failure = e;
    }
    try {
      await tx.query('set local role "' + input.workerRole + '"');
    } catch (restore) {
      if (failure !== undefined)
        throw new AggregateError(
          [failure, restore],
          'Utility source role restore failed',
          { cause: restore },
        );
      throw restore;
    }
    if (failure !== undefined) throw failure;
    return Object.freeze({ head, source });
  });
}
async function prepareUtilityProposal(
  proposal: Readonly<PostwarIndustryUtilitySourceProposal>,
): Promise<Readonly<PreparedPostwarIndustryUtilitySource>> {
  const p = proposals.get(proposal);
  if (!p) fail('GENUINE_FIXED_SOURCE_PROPOSAL_REQUIRED');
  const token = Object.freeze({}) as PreparedPostwarIndustryUtilitySource;
  preparedSources.set(token, {
    ...p,
    raw: Object.freeze({}),
    adoptionBytes: '',
  });
  const { workerRole } = readPostwarSocialRuntimeConnectionResources(p.social);
  try {
    const packet = await readPostwarIndustryUtilityRegisteredPacket({
      database: p.social.database,
      workerRole,
      worldId: p.compact.worldId,
      countryId: p.compact.countryId,
      facilityId: p.compact.facilityId,
    });
    // Semantic absence is raised only after the actual read transaction and
    // role restoration have succeeded. Adapter failures retain their outcome.
    if (!packet.source)
      throw new PostwarIndustryUtilitySourceMissing(
        'REGISTERED_UTILITY_SOURCE_MISSING',
      );
    const source = packet.source;
    if (
      source.source_text !== p.compactText ||
      source.source_sha256 !== p.compactSha256 ||
      source.source_ref !==
        'INDUSTRY_UTILITY_' + p.compactSha256.toUpperCase() ||
      source.world_version !== packet.head.worldVersion ||
      source.event_sequence !== packet.head.eventSequence ||
      sha(source.source_text) !== source.source_sha256
    )
      fail('ACTUAL_CURRENT_UTILITY_SOURCE_OR_HEAD_DIFFERS');
  } catch (e) {
    preparedSources.delete(token);
    throw e;
  }
  const bySite =
      installed.get(p.baseline.prepared) ??
      new Map<string, PreparedPostwarIndustryUtilitySource>(),
    key = siteKey(p.compact),
    old = bySite.get(key);
  if (old) {
    const prior = consumePostwarIndustryUtilitySource(old, p.social);
    if (prior.compactText !== p.compactText) {
      preparedSources.delete(token);
      fail('PREPARED_UTILITY_SOURCE_CHANGED');
    }
    preparedSources.delete(token);
    return old;
  }
  bySite.set(key, token);
  installed.set(p.baseline.prepared, bySite);
  return token;
}
/** Loads all real source scopes once, installs only the actual registered
 * intersection. Missing rows are distinct from SQL/permission/admission errors. */
export async function preparePostwarIndustryUtilitySources(
  input: Omit<PostwarIndustryUtilitySourceInput, 'site'>,
): Promise<readonly Readonly<PreparedPostwarIndustryUtilitySource>[]> {
  const proposals = await loadPostwarIndustryUtilitySourceProposals(input),
    values: PreparedPostwarIndustryUtilitySource[] = [],
    created: PreparedPostwarIndustryUtilitySource[] = [];
  try {
    for (const proposal of proposals) {
      const p = consumeUtilityProposal(proposal),
        old = readPostwarIndustryUtilitySourceForBase(p.baseline, p.compact);
      try {
        const token = await prepareUtilityProposal(proposal);
        values.push(token);
        if (!old) created.push(token);
      } catch (e) {
        if (
          e instanceof PostwarIndustryUtilitySourceMissing &&
          e.reason === 'REGISTERED_UTILITY_SOURCE_MISSING'
        )
          continue;
        throw e;
      }
    }
    return Object.freeze(values);
  } catch (error) {
    for (const token of created)
      retireUnownedPostwarIndustryUtilitySource(token);
    throw error;
  }
}
function consumeUtilityProposal(
  proposal: Readonly<PostwarIndustryUtilitySourceProposal>,
): Original {
  const p = proposals.get(proposal);
  if (!p) fail('GENUINE_FIXED_SOURCE_PROPOSAL_REQUIRED');
  return p;
}
export function takePostwarIndustryUtilitySourceOwnership(
  token: Readonly<PreparedPostwarIndustryUtilitySource>,
  owner: object,
): void {
  consumePostwarIndustryUtilitySource(token);
  const previous = sourceOwners.get(token);
  if (previous && previous !== owner) fail('UTILITY_SOURCE_ALREADY_OWNED');
  sourceOwners.set(token, owner);
}
export function retirePostwarIndustryUtilitySource(
  token: Readonly<PreparedPostwarIndustryUtilitySource>,
  owner?: object,
): void {
  const held = sourceOwners.get(token);
  if (held && held !== owner) fail('UTILITY_SOURCE_OWNERSHIP_TRANSFERRED');
  sourceOwners.delete(token);
  const p = preparedSources.get(token);
  if (!p) return;
  preparedSources.delete(token);
  const bySite = installed.get(p.baseline.prepared),
    key = siteKey(p.compact);
  if (bySite?.get(key) === token) bySite.delete(key);
  if (bySite?.size === 0) installed.delete(p.baseline.prepared);
}
export const POSTWAR_INDUSTRY_UTILITY_ADOPTION =
  DAY_ONE_STORAGE_SELF_USE_POLICY;

/** Semantic source absence only; SQL permissions/connection/transaction errors
 * are never converted to this recoverable missing-original classification. */
export class PostwarIndustryUtilitySourceMissing extends Error {
  readonly code = 'POSTWAR_INDUSTRY_UTILITY_SOURCE_MISSING';
  constructor(readonly reason: string) {
    super('INDUSTRY_UTILITY_SOURCE:' + reason);
    this.name = 'PostwarIndustryUtilitySourceMissing';
  }
}
export function utilitySourceForRun(
  preparation: Readonly<PreparedPostwarIndustryUtilitySource>,
  kind: 'POWER' | 'WATER',
  runId: string,
): import('@econmind/core/industry-utility-execution').IndustryUtilitySource {
  const p = consumePostwarIndustryUtilitySource(preparation),
    c = p.compact,
    b = consumePreparedPostwarSocialFinancialReplayBase(p.baseline),
    positions = b.document.inputs.sourcePositions.filter(
      (x) =>
        x.countryId === c.countryId &&
        x.locationId === c.locationId &&
        x.employerId === c.operatorId &&
        x.sourceObjectId === c.power.storageId,
    ),
    staffSha = sha(canonicalSerialize(positions));
  const ref = 'INDUSTRY_UTILITY_' + p.compactSha256.toUpperCase(),
    sourceRef = ref + '_' + kind,
    authority = {
      kind: 'WATER_GRANT_AUTHORITY',
      reference: ref,
      rawSha256: p.compactSha256,
    };
  const base = {
    worldId: c.worldId,
    countryId: c.countryId,
    locationId: c.locationId,
    facilityId: c.facilityId,
    operatorId: c.operatorId,
    runId,
    seedId: c.seedId,
    seedFingerprint: c.seedFingerprint,
    admissionRef: c.admissionRef,
    sourceRef,
    sourceRawSha256: p.compactSha256,
    policyVersion:
      kind === 'POWER'
        ? DAY_ONE_STORAGE_SELF_USE_POLICY.policyVersion
        : WATER_POLICY.version,
    policyRawSha256:
      kind === 'POWER'
        ? DAY_ONE_STORAGE_SELF_USE_POLICY.policyRawSha256
        : sha(canonicalSerialize(WATER_POLICY)),
    userAdoptionRawSha256: WATER_POLICY.userAdoptionSha256,
  };
  if (kind === 'POWER')
    return freeze({
      ...base,
      originals: [
        {
          kind: 'STORAGE_PHYSICAL_ORIGINAL',
          reference: c.power.sourceRef,
          rawSha256: c.power.sourceRawSha256,
        },
        {
          kind: 'POWER_SERVICE_WORK_SITE',
          reference: 'INDUSTRY_POWER_STAFF_' + staffSha.toUpperCase(),
          rawSha256: staffSha,
        },
      ],
    });
  const eligibility = utilityWaterGrantEligibility(preparation);
  return freeze({
    ...base,
    originals: [
      authority,
      {
        kind: 'WATER_GRANT_ELIGIBILITY',
        reference: 'WATER_ELIGIBILITY_' + p.compactSha256.toUpperCase(),
        rawSha256: sha(eligibility),
      },
    ],
  });
}
function utilityWaterGrantEligibility(
  preparation: Readonly<PreparedPostwarIndustryUtilitySource>,
): string {
  const p = consumePostwarIndustryUtilitySource(preparation),
    c = p.compact,
    ref = 'INDUSTRY_UTILITY_' + p.compactSha256.toUpperCase();
  return canonicalSerialize({
    schemaVersion: 'industry-first-day-water-grant-eligibility-original-v1',
    worldId: c.worldId,
    seedId: c.seedId,
    seedFingerprint: c.seedFingerprint,
    admissionRef: c.admissionRef,
    countryId: c.countryId,
    locationId: c.locationId,
    operatorId: c.operatorId,
    sourceCountryId: p.sourceCountryId,
    sourceRegionId: c.water.sourceRegionId,
    basinRef: c.water.basinRef,
    maximumRawQuotaPerDay: {
      amount: c.water.rawQuotaPerDay,
      unit: 'm3/sim-day',
    },
    validFromTicks: '0',
    validUntilTicks: '86400000',
    sourceRef: ref + '_WATER',
    userAdoptionRawSha256: WATER_POLICY.userAdoptionSha256,
    sourceAllocationRawSha256: c.water.allocationRawSha256,
    grantAuthorityOriginalRef: ref,
    grantAuthorityOriginalRawSha256: p.compactSha256,
  });
}
export function postwarIndustryUtilityOriginalsForRun(
  preparation: Readonly<PreparedPostwarIndustryUtilitySource>,
  runId: string,
  paymentFrames: readonly import('@econmind/core/finance-budget-native').FinanceNativeBudgetCanonicalFrame[] = [],
): Readonly<{
  industryPowerOriginals: readonly import('@econmind/core/industry-first-day-power-execution').IndustryFirstDayPowerOriginal[];
  industryWaterOriginals: readonly import('@econmind/core/industry-first-day-water-execution').IndustryFirstDayWaterReplayOriginal[];
}> {
  const p = consumePostwarIndustryUtilitySource(preparation),
    power = utilitySourceForRun(preparation, 'POWER', runId),
    water = utilitySourceForRun(preparation, 'WATER', runId),
    staff = power.originals.find((x) => x.kind === 'POWER_SERVICE_WORK_SITE')!;
  return freeze({
    industryPowerOriginals: [
      {
        source: power,
        opening: p.compact.power,
        serviceFacilityId: p.compact.power.storageId,
        serviceRunId: 'UTILITY_POWER_SERVICE_' + runId,
        serviceWorkSourceRef: staff.reference,
        serviceWorkSourceRawSha256: staff.rawSha256,
        paymentFrames,
      },
    ],
    industryWaterOriginals: [
      {
        source: water,
        scenario: p.scenario,
        grantEligibilityOriginal: {
          reference: 'WATER_ELIGIBILITY_' + p.compactSha256.toUpperCase(),
          rawText: utilityWaterGrantEligibility(preparation),
        },
      },
    ],
  });
}

/** Complete page input is retained. This selects only immutable source DATA,
 * not frames to execute or grants; Core still replays every foreign family. */
export async function readPostwarIndustryUtilityPageOriginalsFrom(
  tx: SqlExecutor,
  input: Readonly<{
    baseline: Readonly<PreparedPostwarSocialFinancialReplayBase>;
    worldId: string;
    officeId: 'SOCIAL' | 'FINANCE';
    expectedHead: { worldVersion: string; eventSequence: string };
    frames: readonly import('@econmind/core/finance-budget-native').FinanceNativeBudgetCanonicalFrame[];
  }>,
): Promise<
  Readonly<{
    industryPowerOriginals: readonly import('@econmind/core/industry-first-day-power-execution').IndustryFirstDayPowerOriginal[];
    industryWaterOriginals: readonly import('@econmind/core/industry-first-day-water-execution').IndustryFirstDayWaterReplayOriginal[];
  }>
> {
  const b = consumePreparedPostwarSocialFinancialReplayBase(input.baseline),
    tokens = [...(installed.get(input.baseline.prepared)?.values() ?? [])],
    runs = new Map<PreparedPostwarIndustryUtilitySource, Set<string>>();
  if (b.pins.worldId !== input.worldId) fail('SAME_WORLD_SOURCE_REQUIRED');
  const add = (token: PreparedPostwarIndustryUtilitySource, run: string) => {
    const own = runs.get(token) ?? new Set<string>();
    own.add(run);
    runs.set(token, own);
  };
  for (const frame of input.frames) {
    const c = frame.command;
    if (
      c.commandType === 'INDUSTRY_FIRST_DAY_POWER_EXECUTE_V1' ||
      c.commandType === 'INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1'
    ) {
      const body = row(JSON.parse(c.canonicalPayload)),
        token = readPostwarIndustryUtilitySourceForBase(input.baseline, {
          countryId: c.countryId,
          facilityId: text(body.facilityId),
        });
      if (!token)
        throw new PostwarIndustryUtilitySourceMissing(
          'HISTORICAL_UTILITY_ORIGINAL_NOT_INSTALLED',
        );
      add(token, text(body.runId));
    } else if (c.commandType === 'CORE_INDUSTRY_RUN_SCHEDULE_V1') {
      const body = row(JSON.parse(c.canonicalPayload)),
        facility = text(body.facilityId),
        run = text(body.runId);
      const token = readPostwarIndustryUtilitySourceForBase(input.baseline, {
        countryId: c.countryId,
        facilityId: facility,
      });
      if (token) add(token, run);
      else if (run.startsWith('UTILITY_POWER_SERVICE_')) {
        const matches = tokens.filter((t) => {
          const p = consumePostwarIndustryUtilitySource(t);
          return (
            p.compact.countryId === c.countryId &&
            p.compact.power.storageId === facility
          );
        });
        if (matches.length !== 1)
          throw new PostwarIndustryUtilitySourceMissing(
            'HISTORICAL_POWER_SERVICE_ORIGINAL_NOT_INSTALLED',
          );
        add(matches[0]!, run.slice('UTILITY_POWER_SERVICE_'.length));
      }
    } else if (c.commandType === 'CORE_INDUSTRY_OPERATING_WAGE_PAY_V1') {
      const source = row(
        row(JSON.parse(frame.events[0]?.canonicalPayload ?? 'null')).source,
      );
      if (
        typeof source.runId === 'string' &&
        source.runId.startsWith('UTILITY_POWER_SERVICE_')
      ) {
        const matches = tokens.filter((t) => {
          const p = consumePostwarIndustryUtilitySource(t);
          return (
            p.compact.countryId === source.countryId &&
            p.compact.power.storageId === source.facilityId
          );
        });
        if (matches.length !== 1)
          throw new PostwarIndustryUtilitySourceMissing(
            'HISTORICAL_POWER_PAYMENT_ORIGINAL_NOT_INSTALLED',
          );
        add(matches[0]!, source.runId.slice('UTILITY_POWER_SERVICE_'.length));
      }
    }
  }
  if (!runs.size)
    return Object.freeze({
      industryPowerOriginals: [],
      industryWaterOriginals: [],
    });
  const expectedRole =
      input.officeId === 'SOCIAL'
        ? 'world_v2_social_source_reader'
        : 'world_v2_finance_budget_source_reader',
    session = await tx.query<{ role_name: string }>(
      'select current_user as role_name',
    );
  if (session.rows.length !== 1 || session.rows[0]?.role_name !== expectedRole)
    fail('ACTUAL_FIXED_PAGE_READER_REQUIRED');
  let failure: unknown;
  try {
    await tx.query('set local role world_v2_industry_source_reader');
    for (const token of runs.keys())
      await assertPostwarIndustryUtilityHistorySourceFrom(tx, {
        preparation: token,
        head: input.expectedHead,
      });
  } catch (e) {
    failure = e;
  }
  try {
    await tx.query('set local role "' + expectedRole + '"');
  } catch (restore) {
    if (failure !== undefined)
      throw new AggregateError(
        [failure, restore],
        'Utility page role restore failed',
        { cause: restore },
      );
    throw restore;
  }
  if (failure !== undefined) throw failure;
  const values = [...runs].flatMap(([token, ownRuns]) =>
    [...ownRuns].map((run) =>
      postwarIndustryUtilityOriginalsForRun(
        token,
        run,
        input.frames.filter((frame) => {
          if (
            frame.command.commandType !== 'CORE_INDUSTRY_OPERATING_WAGE_PAY_V1'
          )
            return false;
          const body = row(
              JSON.parse(frame.events[0]?.canonicalPayload ?? 'null'),
            ),
            source = row(body.source);
          return (
            source.runId === 'UTILITY_POWER_SERVICE_' + run &&
            source.countryId ===
              consumePostwarIndustryUtilitySource(token).compact.countryId &&
            source.facilityId ===
              consumePostwarIndustryUtilitySource(token).compact.power.storageId
          );
        }),
      ),
    ),
  );
  return Object.freeze({
    industryPowerOriginals: Object.freeze(
      values.flatMap((x) => x.industryPowerOriginals),
    ),
    industryWaterOriginals: Object.freeze(
      values.flatMap((x) => x.industryWaterOriginals),
    ),
  });
}
/** Cleanup only; ownership metadata cannot establish source readiness. */
export function retireUnownedPostwarIndustryUtilitySource(
  token: Readonly<PreparedPostwarIndustryUtilitySource>,
): void {
  if (!sourceOwners.has(token)) retirePostwarIndustryUtilitySource(token);
}
