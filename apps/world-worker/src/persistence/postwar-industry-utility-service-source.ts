/** POWER service labour originals, not performed WORK, paid wages or delivery.
 * A person-day here means the existing 480 person-minutes of labour. It is not
 * an invented MWh productivity coefficient or a manufacturing recipe. */
import {
  POSTWAR_WATER_STAFF_POLICY,
  postwarWaterServiceFacilityId,
} from '../preparation/postwar-water-staff-policy.js';
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  Money,
  INDUSTRY_FIRST_DAY_POLICY_VERSION,
  INDUSTRY_FIRST_DAY_POLICY_RAW_SHA256,
  INDUSTRY_FIRST_DAY_USER_ADOPTION_RAW_SHA256,
} from '@econmind/core';
import type { IndustryFirstDayWorkSiteSource } from '@econmind/core/industry-first-day-work';
import {
  consumePreparedPostwarSocialFinancialReplayBase,
  type PreparedPostwarSocialFinancialReplayBase,
} from './prepared-postwar-social-source.js';
import {
  consumePostwarIndustryUtilitySource,
  readPostwarIndustryUtilitySourceForPowerFacility,
  assertPostwarIndustryUtilitySourceFrom,
  PostwarIndustryUtilitySourceMissing,
  type PreparedPostwarIndustryUtilitySource,
} from './postwar-industry-utility-source.js';
import type { PostwarIndustryFirstDaySourceData } from './postwar-industry-first-day-source.js';
import type { SqlExecutor } from './sql-database.js';
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
function fail(reason: string): never {
  throw Error('INDUSTRY_POWER_SERVICE_SOURCE:' + reason);
}
interface Scope {
  readonly worldId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly operatorId: string;
  readonly storageId: string;
  readonly physicalSourceRef: string;
  readonly physicalSourceRawSha256: string;
  readonly utilityCompactSha256: string;
}
interface Position {
  readonly positionId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly employerId: string;
  readonly employerRole: string;
  readonly sourceBucket: string;
  readonly sourceObjectId: string;
  readonly skill: string;
  readonly filledCount: string;
  readonly personRange: Readonly<{
    poolId: string;
    startOrdinal: string;
    count: string;
  }>;
}
interface Wage {
  readonly positionId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly employerId: string;
  readonly employerRole: string;
  readonly skill: string;
  readonly wageAmount: string;
  readonly wageCurrency: string;
  readonly wagePeriod: string;
  readonly wageVersion: string;
  readonly payrollFundingRef: string;
}
interface Population {
  readonly positionId: string;
  readonly regionId: string;
  readonly sourcePoolId: string;
  readonly sourceStartOrdinal: string;
  readonly startOrdinal: string;
  readonly count: string;
  readonly cohortId: string;
}
interface Funding {
  readonly positionId: string;
  readonly payerEntityId: string;
  readonly accountRef: string;
  readonly currency: string;
}
const uint = (v: string) => {
  if (!/^(0|[1-9][0-9]*)$/u.test(v))
    fail('CANONICAL_POPULATION_COORDINATE_REQUIRED');
  return BigInt(v);
};
/** Pure derived DATA join. This function cannot issue a source admission or
 * private prepared baseline; callers of the runtime use the fixed issuer below.
 * Kept separate so the finite E03 joins and person-time units can be tested
 * without inventing a private Social/SQL authority for a tiny fixture. */
export function derivePostwarIndustryPowerServiceSiteData(
  input: Readonly<{
    scope: Scope;
    sourcePositions: readonly Position[];
    wagePositions: readonly Wage[];
    populationPositionRefs: readonly Population[];
    positionFunding: readonly Funding[];
  }>,
): Readonly<{
  siteSource: IndustryFirstDayWorkSiteSource;
  firstdayOriginal: PostwarIndustryFirstDaySourceData;
}> {
  const s = input.scope,
    all = input.sourcePositions.filter(
      (p) =>
        p.countryId === s.countryId &&
        p.locationId === s.locationId &&
        p.employerId === s.operatorId &&
        p.sourceObjectId === s.storageId,
    );
  if (!all.length || all.length > 3)
    throw new PostwarIndustryUtilitySourceMissing(
      'ACTUAL_POWER_SERVICE_POSITION_SET_MISSING',
    );
  const seen = new Set<string>(),
    positions: IndustryFirstDayWorkSiteSource['positions'][number][] = [];
  let filled = 0n;
  for (const p of all) {
    if (
      p.sourceBucket !== 'POWER' ||
      p.employerRole !== 'OP' ||
      seen.has(p.positionId) ||
      !['LOW', 'MEDIUM', 'HIGH'].includes(p.skill) ||
      p.positionId !==
        'POSTWAR_SOURCE_' + sha(s.storageId + '/' + p.skill).toUpperCase()
    )
      fail('ACTUAL_DISTINCT_POWER_NOT_MANUFACTURING_POSITION_REQUIRED');
    seen.add(p.positionId);
    const wages = input.wagePositions.filter(
        (w) => w.positionId === p.positionId,
      ),
      people = input.populationPositionRefs.filter(
        (r) => r.positionId === p.positionId,
      ),
      funding = input.positionFunding.filter(
        (f) => f.positionId === p.positionId,
      );
    if (wages.length !== 1 || people.length !== 1 || funding.length !== 1)
      fail('EXACT_POWER_WAGE_PEOPLE_FUNDING_JOIN_REQUIRED');
    const w = wages[0]!,
      r = people[0]!,
      f = funding[0]!;
    if (
      w.countryId !== s.countryId ||
      w.locationId !== s.locationId ||
      w.employerId !== s.operatorId ||
      w.employerRole !== 'OP' ||
      w.skill !== p.skill ||
      w.wagePeriod !== 'SIM_YEAR' ||
      !w.wageVersion ||
      !w.payrollFundingRef ||
      !Money.from(w.wageAmount, w.wageCurrency).amount.isPositive() ||
      f.payerEntityId !== s.operatorId ||
      f.currency !== w.wageCurrency ||
      !f.accountRef ||
      p.personRange.poolId !== r.sourcePoolId ||
      p.personRange.startOrdinal !== r.sourceStartOrdinal ||
      p.personRange.count !== p.filledCount ||
      r.count !== p.filledCount ||
      r.regionId !== s.locationId ||
      !r.cohortId
    )
      fail('ACTUAL_POWER_EMPLOYMENT_WAGE_OR_POPULATION_SCOPE_DIFFERS');
    const count = uint(p.filledCount);
    uint(r.sourceStartOrdinal);
    uint(r.startOrdinal);
    if (!count) continue;
    filled += count;
    positions.push(
      Object.freeze({
        positionId: p.positionId,
        poolId: r.sourcePoolId,
        sourceStartOrdinal: r.sourceStartOrdinal,
        startOrdinal: r.startOrdinal,
        count: r.count,
        regionId: r.regionId,
        cohortRef: r.cohortId,
        skill: p.skill as 'LOW' | 'MEDIUM' | 'HIGH',
      }),
    );
  }
  if (!filled)
    throw new PostwarIndustryUtilitySourceMissing(
      'ACTUAL_FILLED_POWER_SERVICE_STAFF_MISSING',
    );
  const rawText = canonicalSerialize(all),
    rawSha256 = sha(rawText),
    sourceRef = 'INDUSTRY_POWER_STAFF_' + rawSha256.toUpperCase();
  const siteSource: IndustryFirstDayWorkSiteSource = Object.freeze({
    worldId: s.worldId,
    countryId: s.countryId,
    locationId: s.locationId,
    facilityId: s.storageId,
    operatorId: s.operatorId,
    seedId: s.seedId,
    seedFingerprint: s.seedFingerprint,
    admissionRef: s.admissionRef,
    sourceRef,
    sourceRawSha256: rawSha256,
    policyVersion: INDUSTRY_FIRST_DAY_POLICY_VERSION,
    policyRawSha256: INDUSTRY_FIRST_DAY_POLICY_RAW_SHA256,
    userAdoptionRawSha256: INDUSTRY_FIRST_DAY_USER_ADOPTION_RAW_SHA256,
    outputUnit: 'person-day',
    capacityPerSimDay: filled.toString(),
    labourPersonDaysPerOutput: '1',
    positions: Object.freeze(positions),
  });
  const data = Object.freeze({
    schemaVersion: 'postwar-industry-power-service-source-v1',
    serviceKind: 'POWER',
    sourceSemantics: 'EXISTING_E03_SERVICE_LABOUR_NOT_MANUFACTURING_RECIPE',
    worldId: s.worldId,
    seedId: s.seedId,
    seedFingerprint: s.seedFingerprint,
    admissionRef: s.admissionRef,
    countryId: s.countryId,
    locationId: s.locationId,
    facilityId: s.storageId,
    staffSourceObjectId: s.storageId,
    operatorId: s.operatorId,
    sourceRef,
    sourceRawSha256: rawSha256,
    physicalSourceRef: s.physicalSourceRef,
    physicalSourceRawSha256: s.physicalSourceRawSha256,
    utilityCompactSha256: s.utilityCompactSha256,
    policyVersion: siteSource.policyVersion,
    outputUnit: 'person-day',
    capacityPerSimDay: filled.toString(),
    labourPersonDaysPerOutput: '1',
    timeUnitDefinition:
      'ONE_PERSON_DAY_IS_480_PERSON_MINUTES_NOT_MWH_PRODUCTIVITY',
  });
  return Object.freeze({
    siteSource,
    firstdayOriginal: Object.freeze({
      classification:
        'ADOPTED_OPENING_RULE_SOURCE_NOT_EXECUTION_OR_COMMIT_AUTHORITY',
      rawText,
      rawSha256,
      sourceRef,
      head: Object.freeze({ worldVersion: '0', eventSequence: '0' }),
      data,
    }),
  });
}
export function projectPostwarIndustryPowerServiceSource(
  input: Readonly<{
    baseline: Readonly<PreparedPostwarSocialFinancialReplayBase>;
    preparation: Readonly<PreparedPostwarIndustryUtilitySource>;
  }>,
) {
  const b = consumePreparedPostwarSocialFinancialReplayBase(input.baseline),
    p = consumePostwarIndustryUtilitySource(input.preparation),
    c = p.compact;
  if (
    p.baseline.prepared !== b.prepared ||
    c.worldId !== b.pins.worldId ||
    c.seedId !== b.pins.seedRef ||
    c.seedFingerprint !== b.pins.contentHash ||
    c.admissionRef !== b.pins.admissionRef ||
    sha(p.compactText) !== p.compactSha256 ||
    c.sourceChecksumsSha256 !== b.document.inputs.sourceChecksumsSha256 ||
    c.power.operatorId !== c.operatorId ||
    c.power.countryId !== c.countryId ||
    c.power.worldId !== c.worldId ||
    c.power.seedFingerprint !== c.seedFingerprint ||
    c.power.storageOwnerId !== c.operatorId ||
    c.power.gridOwnerId !== c.operatorId
  )
    fail('SAME_ACTUAL_PREPARED_STORAGE_OPERATOR_E03_AND_ADMISSION_REQUIRED');
  const d = b.document.inputs;
  return derivePostwarIndustryPowerServiceSiteData({
    scope: {
      worldId: c.worldId,
      seedId: c.seedId,
      seedFingerprint: c.seedFingerprint,
      admissionRef: c.admissionRef,
      countryId: c.countryId,
      locationId: c.locationId,
      operatorId: c.operatorId,
      storageId: c.power.storageId,
      physicalSourceRef: c.power.sourceRef,
      physicalSourceRawSha256: c.power.sourceRawSha256,
      utilityCompactSha256: p.compactSha256,
    },
    sourcePositions: d.sourcePositions,
    wagePositions: d.labour.positions,
    populationPositionRefs: d.populationPositionRefs,
    positionFunding: d.positionFunding,
  });
}
/** CURRENT commands only. Existing registered utility RPC provides actual
 * same-head source locks. Historical callers use the pure projection only
 * after their complete actual-frame/host/admission prefix scope is established. */
export async function readPostwarIndustryPowerServiceSourceFrom(
  tx: SqlExecutor,
  input: Readonly<{
    baseline: Readonly<PreparedPostwarSocialFinancialReplayBase>;
    worldId: string;
    countryId: string;
    facilityId: string;
    expectedHead: Readonly<{ worldVersion: string; eventSequence: string }>;
  }>,
) {
  const b = consumePreparedPostwarSocialFinancialReplayBase(input.baseline);
  if (b.pins.worldId !== input.worldId) fail('SAME_ACTUAL_WORLD_REQUIRED');
  if (
    !b.document.inputs.sourcePositions.some(
      (p) =>
        p.countryId === input.countryId &&
        p.sourceObjectId === input.facilityId &&
        p.sourceBucket === 'POWER',
    )
  )
    return null;
  const preparation = readPostwarIndustryUtilitySourceForPowerFacility(
    input.baseline,
    { countryId: input.countryId, facilityId: input.facilityId },
  );
  if (!preparation)
    throw new PostwarIndustryUtilitySourceMissing(
      'REGISTERED_POWER_SOURCE_NOT_PREPARED',
    );
  const p = consumePostwarIndustryUtilitySource(preparation);
  if (
    p.compact.countryId !== input.countryId ||
    p.compact.power.storageId !== input.facilityId
  )
    throw new PostwarIndustryUtilitySourceMissing(
      'POWER_SERVICE_SCOPE_NOT_ADOPTED',
    );
  await assertPostwarIndustryUtilitySourceFrom(tx, {
    preparation,
    head: input.expectedHead,
  });
  const projected = projectPostwarIndustryPowerServiceSource({
    baseline: input.baseline,
    preparation,
  });
  return Object.freeze({
    ...projected,
    firstdayOriginal: Object.freeze({
      ...projected.firstdayOriginal,
      head: Object.freeze({ ...input.expectedHead }),
    }),
  });
}

/** A service workplace over the same people, never a second population pool.
 * Eligibility is not availability: RUN/WORK selects actual unoccupied ranges
 * against the shared Core person-time bookings, and DELIVER requires paid
 * coverage of the entire extraction interval. */
export function derivePostwarIndustryWaterServiceSiteData(
  input: Parameters<typeof derivePostwarIndustryPowerServiceSiteData>[0] & {
    readonly targetFacilityId: string;
  },
) {
  const power = derivePostwarIndustryPowerServiceSiteData(input),
    facilityId = postwarWaterServiceFacilityId(input.targetFacilityId),
    sourcePositions: unknown = JSON.parse(power.firstdayOriginal.rawText),
    rawText = canonicalSerialize({
      schemaVersion: 'postwar-industry-water-service-staff-v1',
      worldId: input.scope.worldId,
      countryId: input.scope.countryId,
      locationId: input.scope.locationId,
      operatorId: input.scope.operatorId,
      facilityId,
      targetFacilityId: input.targetFacilityId,
      staffSourceObjectId: input.scope.storageId,
      policyVersion: POSTWAR_WATER_STAFF_POLICY.version,
      userAdoptionRawSha256: POSTWAR_WATER_STAFF_POLICY.userAdoptionRawSha256,
      sourcePositions,
    }),
    rawSha256 = sha(rawText),
    sourceRef = 'INDUSTRY_WATER_STAFF_' + rawSha256.toUpperCase();
  return Object.freeze({
    siteSource: Object.freeze({
      ...power.siteSource,
      facilityId,
      sourceRef,
      sourceRawSha256: rawSha256,
    }),
    firstdayOriginal: Object.freeze({
      ...power.firstdayOriginal,
      rawText,
      rawSha256,
      sourceRef,
      data: Object.freeze({
        ...power.firstdayOriginal.data,
        schemaVersion: 'postwar-industry-water-service-source-v1',
        serviceKind: 'WATER',
        sourceSemantics:
          'ADOPTED_EXISTING_POWER_STAFF_NOT_NEW_PEOPLE_OR_COMPLETED_WATER_SERVICE',
        facilityId,
        targetFacilityId: input.targetFacilityId,
        sourceRef,
        sourceRawSha256: rawSha256,
        staffingPolicy: POSTWAR_WATER_STAFF_POLICY,
        timeUnitDefinition:
          'ONE_PERSON_DAY_IS_480_PERSON_MINUTES_NOT_WATER_VOLUME_PRODUCTIVITY',
      }),
    }),
  });
}
export function projectPostwarIndustryWaterServiceSource(
  input: Parameters<typeof projectPostwarIndustryPowerServiceSource>[0],
) {
  // Validate all private storage/OP/E03/admission pins via the existing issuer.
  projectPostwarIndustryPowerServiceSource(input);
  const p = consumePostwarIndustryUtilitySource(input.preparation),
    c = p.compact,
    d = consumePreparedPostwarSocialFinancialReplayBase(input.baseline).document
      .inputs;
  return derivePostwarIndustryWaterServiceSiteData({
    scope: {
      worldId: c.worldId,
      seedId: c.seedId,
      seedFingerprint: c.seedFingerprint,
      admissionRef: c.admissionRef,
      countryId: c.countryId,
      locationId: c.locationId,
      operatorId: c.operatorId,
      storageId: c.power.storageId,
      physicalSourceRef: c.power.sourceRef,
      physicalSourceRawSha256: c.power.sourceRawSha256,
      utilityCompactSha256: p.compactSha256,
    },
    targetFacilityId: c.facilityId,
    sourcePositions: d.sourcePositions,
    wagePositions: d.labour.positions,
    populationPositionRefs: d.populationPositionRefs,
    positionFunding: d.positionFunding,
  });
}
