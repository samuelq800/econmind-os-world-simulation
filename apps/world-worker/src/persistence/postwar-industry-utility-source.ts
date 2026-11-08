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
import type { SqlExecutor } from './sql-database.js';
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
  readonly socialConnection: Readonly<PostwarSocialRuntimeConnection>;
  readonly startupSeed: Readonly<OpeningSeed>;
  readonly startupBeneficialHousingRentSource?: PreparedBeneficialHousingRentSource;
}
export interface PostwarIndustryUtilityCompactSource {
  readonly schemaVersion: 'postwar-industry-utility-original-v1';
  readonly worldId: string;
  readonly countryId: 'COUNTRY_02';
  readonly facilityId: 'OPEN-02-REFINED_FUEL';
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
  readonly compactText: string;
  readonly compactSha256: string;
  readonly raw: Readonly<Record<string, string>>;
  readonly adoptionBytes: string;
  readonly scenario: Readonly<IndustryWaterScenarioState>;
}
const sourceOwners = new WeakMap<object, object>();
const proposals = new WeakMap<object, Original>(),
  preparedSources = new WeakMap<object, Original>(),
  installed = new WeakMap<object, PreparedPostwarIndustryUtilitySource>();
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
export async function loadPostwarIndustryUtilitySourceProposal(
  input: PostwarIndustryUtilitySourceInput,
): Promise<Readonly<PostwarIndustryUtilitySourceProposal>> {
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
  const physical = buildOfficialPhysicalOpeningAdoption({
      sourceBytes: context.sourceBytes,
      ownerDecisionBytes: context.ownerOriginalBytes,
    }),
    powers = physical.power.filter((p) => p.countryId === 'COUNTRY_02');
  if (powers.length !== 1) fail('ONE_ACTUAL_COUNTRY_POWER_ORIGINAL_REQUIRED');
  const p = powers[0]!,
    storage = physical.facilities.find((f) => f.id === p.storageFacilityId),
    grid = physical.facilities.find((f) => f.id === p.gridFacilityId),
    target = physical.facilities.find((f) => f.id === 'OPEN-02-REFINED_FUEL');
  if (
    !storage ||
    !grid ||
    !target ||
    !p.openingStorage ||
    storage.status !== 'ADOPTED_BUILT' ||
    grid.status !== 'ADOPTED_BUILT' ||
    target.operatorId !== 'ENTITY_OPERATOR_02' ||
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
    countryId: 'COUNTRY_02',
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
        reservationRef: 'RETAINED_OPENING_PUBLIC_OPTION_COUNTRY_02',
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
    countryId: 'COUNTRY_02',
    facilityId: 'OPEN-02-REFINED_FUEL',
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
  const compactText = canonicalSerialize(compact),
    token = Object.freeze({}) as PostwarIndustryUtilitySourceProposal;
  proposals.set(token, {
    social,
    baseline,
    compact,
    compactText,
    compactSha256: sha(compactText),
    raw: freeze(raw),
    adoptionBytes,
    scenario,
  });
  return token;
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
): Readonly<PreparedPostwarIndustryUtilitySource> | undefined {
  consumePreparedPostwarSocialFinancialReplayBase(baseline);
  return installed.get(baseline.prepared);
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
  const proposal = await loadPostwarIndustryUtilitySourceProposal(input),
    p = proposals.get(proposal)!,
    token = Object.freeze({}) as PreparedPostwarIndustryUtilitySource;
  preparedSources.set(token, {
    ...p,
    raw: Object.freeze({}),
    adoptionBytes: '',
  });
  const { workerRole } = readPostwarSocialRuntimeConnectionResources(p.social);
  try {
    await p.social.database.transaction(async (tx) => {
      const h = await tx.query<{
        world_version: string;
        event_sequence: string;
      }>(
        'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
        [p.compact.worldId],
      );
      if (h.rows.length !== 1) fail('ACTUAL_WORLD_HEAD_REQUIRED');
      let failure: unknown;
      try {
        await tx.query('set local role world_v2_industry_source_reader');
        await assertPostwarIndustryUtilityHistorySourceFrom(tx, {
          preparation: token,
          head: {
            worldVersion: h.rows[0]!.world_version,
            eventSequence: h.rows[0]!.event_sequence,
          },
        });
      } catch (e) {
        failure = e;
      }
      try {
        await tx.query('set local role "' + workerRole + '"');
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
    });
  } catch (e) {
    preparedSources.delete(token);
    throw e;
  }
  const old = installed.get(p.baseline.prepared);
  if (old) {
    const prior = consumePostwarIndustryUtilitySource(
      old,
      input.socialConnection,
    );
    if (prior.compactText !== p.compactText) {
      preparedSources.delete(token);
      fail('PREPARED_UTILITY_SOURCE_CHANGED');
    }
    preparedSources.delete(token);
    return old;
  }
  installed.set(p.baseline.prepared, token);
  return token;
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
  if (installed.get(p.baseline.prepared) === token)
    installed.delete(p.baseline.prepared);
}
export const POSTWAR_INDUSTRY_UTILITY_ADOPTION =
  DAY_ONE_STORAGE_SELF_USE_POLICY;

/** Semantic source absence only; SQL permissions/connection/transaction errors
 * are never converted to this recoverable missing-original classification. */
export class PostwarIndustryUtilitySourceMissing extends Error {
  readonly code = 'POSTWAR_INDUSTRY_UTILITY_SOURCE_MISSING';
  constructor(reason: string) {
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
    sourceCountryId: 'visual-territory-02',
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
        paymentFrames: [],
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
    token = readPostwarIndustryUtilitySourceForBase(input.baseline),
    runs = new Set<string>();
  let hasUtility = false;
  for (const frame of input.frames) {
    const c = frame.command;
    if (
      c.commandType === 'INDUSTRY_FIRST_DAY_POWER_EXECUTE_V1' ||
      c.commandType === 'INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1'
    ) {
      hasUtility = true;
      const body = row(JSON.parse(c.canonicalPayload));
      if (
        c.countryId === 'COUNTRY_02' &&
        body.facilityId === 'OPEN-02-REFINED_FUEL'
      )
        runs.add(text(body.runId));
    } else if (
      c.commandType === 'CORE_INDUSTRY_RUN_SCHEDULE_V1' &&
      c.countryId === 'COUNTRY_02'
    ) {
      const body = row(JSON.parse(c.canonicalPayload));
      if (body.facilityId === 'OPEN-02-REFINED_FUEL')
        runs.add(text(body.runId));
    }
  }
  if (!token) {
    if (hasUtility)
      throw new PostwarIndustryUtilitySourceMissing(
        'HISTORICAL_UTILITY_ORIGINAL_NOT_INSTALLED',
      );
    return Object.freeze({
      industryPowerOriginals: [],
      industryWaterOriginals: [],
    });
  }
  if (!runs.size)
    return Object.freeze({
      industryPowerOriginals: [],
      industryWaterOriginals: [],
    });
  if (b.pins.worldId !== input.worldId) fail('SAME_WORLD_SOURCE_REQUIRED');
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
  const values = [...runs].map((run) =>
    postwarIndustryUtilityOriginalsForRun(token, run),
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
