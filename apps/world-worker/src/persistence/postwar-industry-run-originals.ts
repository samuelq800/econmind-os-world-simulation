/** Fixed Industry original DATA joins. Pure projection cannot grant a source,
 * labour booking, current actor, lease or payment authority. */
import {
  canonicalDecimal,
  WorldDecimal,
  assertWorldDecimalResult,
  INDUSTRY_FIRST_DAY_POLICY_VERSION,
  INDUSTRY_FIRST_DAY_POLICY_RAW_SHA256,
  INDUSTRY_FIRST_DAY_USER_ADOPTION_RAW_SHA256,
} from '@econmind/core';
import {
  type IndustryFirstDayWorkSiteSource,
  INDUSTRY_RUN_SCHEDULE_COMMAND,
  INDUSTRY_UTILISATION_TARGET_COMMAND,
  INDUSTRY_FIRST_DAY_WORK_COMMAND,
} from '@econmind/core/industry-first-day-work';
import type { FinanceNativeBudgetCanonicalFrame } from '@econmind/core/finance-budget-native';
import type { PreparedPostwarSocialFinancialReplayBase } from './prepared-postwar-social-source.js';
import { consumePreparedPostwarSocialFinancialReplayBase } from './prepared-postwar-social-source.js';
import {
  decodePostwarIndustryFirstDaySourceRow,
  type PostwarIndustryFirstDaySourceData,
} from './postwar-industry-first-day-source.js';
import { createHash } from 'node:crypto';
import { canonicalSerialize } from '@econmind/core';
import { projectPostwarIndustryPowerServiceSource } from './postwar-industry-utility-service-source.js';
import { readPostwarIndustryUtilitySourceForPowerFacility } from './postwar-industry-utility-source.js';
import { INDUSTRY_FIRST_DAY_READ_QUERY } from './postwar-industry-first-day-source.js';
import type { SqlExecutor } from './sql-database.js';
export const INDUSTRY_RUN_HISTORY_ORIGINAL_QUERY =
  'select * from world_v2.read_postwar_industry_run_original($1,$2,$3,$4,$5,$6::bigint,$7::bigint,$8,$9)';
function fail(reason: string): never {
  throw Error('INDUSTRY_RUN_ORIGINAL:' + reason);
}
function object(x: unknown): Record<string, unknown> {
  if (!x || typeof x !== 'object' || Array.isArray(x))
    fail('EXACT_SOURCE_OBJECT_REQUIRED');
  return x as Record<string, unknown>;
}
function text(x: unknown): string {
  if (typeof x !== 'string' || !x) fail('EXACT_SOURCE_TEXT_REQUIRED');
  return x;
}
function decimal(x: unknown): string {
  return canonicalDecimal(assertWorldDecimalResult(new WorldDecimal(text(x))));
}
/** Actual firstday raw bytes + private, genuine prepared E03 coordinates. */
export function projectPostwarIndustryRunSiteSource(
  original: Readonly<PostwarIndustryFirstDaySourceData>,
  baseline: Readonly<PreparedPostwarSocialFinancialReplayBase>,
): Readonly<IndustryFirstDayWorkSiteSource> {
  const b = consumePreparedPostwarSocialFinancialReplayBase(baseline),
    d = original.data;
  if (
    d.worldId !== b.pins.worldId ||
    d.seedId !== b.pins.seedRef ||
    d.seedFingerprint !== b.pins.contentHash ||
    d.admissionRef !== b.pins.admissionRef
  )
    fail('GENUINE_BASE_AND_REGISTERED_SOURCE_DIFFER');
  if (d.serviceKind === 'POWER') {
    const preparation = readPostwarIndustryUtilitySourceForPowerFacility(
      baseline,
      { countryId: text(d.countryId), facilityId: text(d.facilityId) },
    );
    if (!preparation) fail('REGISTERED_POWER_SOURCE_NOT_PREPARED');
    const projected = projectPostwarIndustryPowerServiceSource({
      baseline,
      preparation,
    });
    if (
      original.sourceRef !== projected.firstdayOriginal.sourceRef ||
      original.rawText !== projected.firstdayOriginal.rawText ||
      original.rawSha256 !== projected.firstdayOriginal.rawSha256 ||
      canonicalSerialize(original.data) !==
        canonicalSerialize(projected.firstdayOriginal.data)
    )
      fail('EXACT_PRIVATE_POWER_SERVICE_ORIGINAL_REQUIRED');
    return projected.siteSource;
  }
  const f = object(d.sourceFacility),
    recipe = object(d.recipe),
    countryId = text(d.countryId),
    locationId = text(d.locationId),
    facilityId = text(d.facilityId),
    operatorId = text(d.operatorId);
  if (
    f.id !== facilityId ||
    f.recipeId !== recipe.id ||
    f.commodityId !== recipe.commodityId ||
    f.conditionFraction !== '1' ||
    f.capacityUnit !== text(recipe.outputUnit) + '/sim-day'
  )
    fail('ACTUAL_FACILITY_RECIPE_SCOPE_REQUIRED');
  const sources = b.document.inputs.sourcePositions.filter(
    (p) => p.sourceObjectId === facilityId,
  );
  if (sources.length === 0 || sources.length > 3)
    fail('EXACT_ACTUAL_FACILITY_POSITION_SET_REQUIRED');
  const positions = sources.map((p) => {
    const contracts = b.document.inputs.labour.positions.filter(
        (c) => c.positionId === p.positionId,
      ),
      people = b.document.inputs.populationPositionRefs.filter(
        (c) => c.positionId === p.positionId,
      );
    if (contracts.length !== 1 || people.length !== 1)
      fail('ACTUAL_WAGE_POPULATION_POSITION_JOIN_REQUIRED');
    const c = contracts[0]!,
      pop = people[0]!;
    if (
      p.countryId !== countryId ||
      p.locationId !== locationId ||
      p.employerId !== operatorId ||
      p.employerRole !== 'OP' ||
      p.sourceBucket !== 'INDUSTRY' ||
      c.employerId !== operatorId ||
      c.countryId !== countryId ||
      c.locationId !== locationId ||
      c.skill !== p.skill ||
      pop.regionId !== locationId ||
      pop.sourcePoolId !== p.personRange.poolId ||
      pop.sourceStartOrdinal !== p.personRange.startOrdinal ||
      pop.count !== p.filledCount ||
      p.personRange.count !== p.filledCount
    )
      fail('ACTUAL_OP_REGION_SKILL_POPULATION_SCOPE_REQUIRED');
    if (p.skill !== 'LOW' && p.skill !== 'MEDIUM' && p.skill !== 'HIGH')
      fail('ACTUAL_SKILL_REQUIRED');
    return Object.freeze({
      positionId: p.positionId,
      poolId: pop.sourcePoolId,
      sourceStartOrdinal: pop.sourceStartOrdinal,
      startOrdinal: pop.startOrdinal,
      count: pop.count,
      regionId: pop.regionId,
      cohortRef: pop.cohortId,
      skill: p.skill,
    });
  });
  if (new Set(positions.map((p) => p.skill)).size !== positions.length)
    fail('UNIQUE_SITE_SKILL_REQUIRED');
  return Object.freeze({
    worldId: b.pins.worldId,
    countryId,
    locationId,
    facilityId,
    operatorId,
    seedId: b.pins.seedRef,
    seedFingerprint: b.pins.contentHash,
    admissionRef: b.pins.admissionRef,
    sourceRef: original.sourceRef,
    sourceRawSha256: original.rawSha256,
    policyVersion: INDUSTRY_FIRST_DAY_POLICY_VERSION,
    policyRawSha256: INDUSTRY_FIRST_DAY_POLICY_RAW_SHA256,
    userAdoptionRawSha256: INDUSTRY_FIRST_DAY_USER_ADOPTION_RAW_SHA256,
    outputUnit: text(recipe.outputUnit),
    capacityPerSimDay: decimal(f.capacity),
    labourPersonDaysPerOutput: decimal(recipe.workersPerDailyOutputUnit),
    positions: Object.freeze(positions),
  });
}
/** Fixed historical DATA only: source revocation blocks new Industry actions,
 * but does not erase a committed run/earned work. RPC checks actual stored
 * committed command and current host/admission; Core replays every frame. */
export async function readPostwarIndustryRunPageOriginalsFrom(
  tx: SqlExecutor,
  input: Readonly<{
    baseline: Readonly<PreparedPostwarSocialFinancialReplayBase>;
    worldId: string;
    hostCountryId: string;
    officeId: 'SOCIAL' | 'FINANCE';
    expectedHead: Readonly<{ worldVersion: string; eventSequence: string }>;
    frames: readonly FinanceNativeBudgetCanonicalFrame[];
  }>,
): Promise<
  Readonly<{
    industryWorkSources: readonly Readonly<IndustryFirstDayWorkSiteSource>[];
  }>
> {
  const b = consumePreparedPostwarSocialFinancialReplayBase(input.baseline);
  if (b.pins.worldId !== input.worldId)
    fail('SAME_WORLD_GENUINE_BASE_REQUIRED');
  const found = new Map<string, Readonly<IndustryFirstDayWorkSiteSource>>();
  for (const frame of input.frames) {
    if (
      frame.command.commandType !== INDUSTRY_RUN_SCHEDULE_COMMAND &&
      frame.command.commandType !== INDUSTRY_UTILISATION_TARGET_COMMAND &&
      frame.command.commandType !== INDUSTRY_FIRST_DAY_WORK_COMMAND
    )
      continue;
    const r = await tx.query<{
      source_text: string;
      source_sha256: string;
      source_ref: string;
      world_version: string;
      event_sequence: string;
    }>(INDUSTRY_RUN_HISTORY_ORIGINAL_QUERY, [
      input.worldId,
      input.hostCountryId,
      input.officeId,
      frame.command.commandId,
      frame.command.fingerprint,
      input.expectedHead.worldVersion,
      input.expectedHead.eventSequence,
      b.pins.contentHash,
      b.pins.admissionRef,
    ]);
    if (r.rows.length !== 1 || !r.rows[0])
      fail('ACTUAL_COMMITTED_STAGE_ORIGINAL_REQUIRED');
    const event = object(
      JSON.parse(frame.events[0]?.canonicalPayload ?? 'null'),
    );
    const facility =
      frame.command.commandType === INDUSTRY_RUN_SCHEDULE_COMMAND ||
      frame.command.commandType === INDUSTRY_UTILISATION_TARGET_COMMAND
        ? text(object(event.terms).facilityId)
        : text(event.facilityId);
    const original = decodePostwarIndustryRunSourceRow(r.rows[0], {
      baseline: input.baseline,
      worldId: input.worldId,
      countryId: frame.command.countryId,
      facilityId: facility,
      head: input.expectedHead,
      expectedPins: {
        seedId: b.pins.seedRef,
        seedFingerprint: b.pins.contentHash,
        admissionRef: b.pins.admissionRef,
      },
    });
    const projected = projectPostwarIndustryRunSiteSource(
        original,
        input.baseline,
      ),
      key = projected.countryId + '\0' + projected.facilityId;
    const prior = found.get(key);
    if (prior && prior.sourceRawSha256 !== projected.sourceRawSha256)
      fail('IMMUTABLE_RUN_SOURCE_CHANGED');
    found.set(key, projected);
  }
  return Object.freeze({
    industryWorkSources: Object.freeze([...found.values()]),
  });
}

/** One fixed decoder for registered manufacturing and actual POWER staff DATA.
 * The service branch re-derives the entire E03 array using the private live
 * baseline; a caller-supplied service label or ref cannot mint a source. */
export function decodePostwarIndustryRunSourceRow(
  row: Parameters<typeof decodePostwarIndustryFirstDaySourceRow>[0],
  input: Parameters<typeof decodePostwarIndustryFirstDaySourceRow>[1] & {
    readonly baseline: Readonly<PreparedPostwarSocialFinancialReplayBase>;
  },
): Readonly<PostwarIndustryFirstDaySourceData> {
  if (!row.source_ref.startsWith('INDUSTRY_POWER_STAFF_'))
    return decodePostwarIndustryFirstDaySourceRow(row, input);
  const preparation = readPostwarIndustryUtilitySourceForPowerFacility(
    input.baseline,
    { countryId: input.countryId, facilityId: input.facilityId },
  );
  if (!preparation) fail('REGISTERED_POWER_SOURCE_NOT_PREPARED');
  const expected = projectPostwarIndustryPowerServiceSource({
    baseline: input.baseline,
    preparation,
  });
  const site = expected.siteSource;
  if (
    site.worldId !== input.worldId ||
    site.countryId !== input.countryId ||
    site.facilityId !== input.facilityId ||
    site.seedId !== input.expectedPins.seedId ||
    site.seedFingerprint !== input.expectedPins.seedFingerprint ||
    site.admissionRef !== input.expectedPins.admissionRef ||
    row.source_ref !== expected.firstdayOriginal.sourceRef ||
    row.source_text !== expected.firstdayOriginal.rawText ||
    row.source_sha256 !== expected.firstdayOriginal.rawSha256 ||
    createHash('sha256').update(row.source_text).digest('hex') !==
      row.source_sha256 ||
    row.world_version !== input.head.worldVersion ||
    row.event_sequence !== input.head.eventSequence
  )
    fail('ACTUAL_REGISTERED_POWER_BYTES_HEAD_OR_ADMISSION_DIFFERS');
  return Object.freeze({
    ...expected.firstdayOriginal,
    head: Object.freeze({ ...input.head }),
  });
}
export async function readPostwarIndustryRunSourceFrom(
  tx: SqlExecutor,
  input: Parameters<typeof decodePostwarIndustryRunSourceRow>[1],
): Promise<Readonly<PostwarIndustryFirstDaySourceData> | null> {
  const result = await tx.query<
    Parameters<typeof decodePostwarIndustryRunSourceRow>[0]
  >(INDUSTRY_FIRST_DAY_READ_QUERY, [
    input.worldId,
    input.countryId,
    input.facilityId,
    input.head.worldVersion,
    input.head.eventSequence,
  ]);
  if (!result.rows.length) return null;
  if (result.rows.length !== 1) fail('UNIQUE_ACTUAL_RUN_SOURCE_REQUIRED');
  return decodePostwarIndustryRunSourceRow(result.rows[0]!, input);
}
