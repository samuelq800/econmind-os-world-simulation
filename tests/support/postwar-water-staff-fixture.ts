/** TEST_ONLY E03 rows; these are not a prepared runtime authority. */
import { createHash } from 'node:crypto';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export function actualPowerStaffDataFixture() {
  const scope = {
    worldId: 'WORLD_TEST_ONLY_POWER_SERVICE',
    seedId: 'SEED_TEST_ONLY_POWER_SERVICE',
    seedFingerprint: 'sha256:' + 'a'.repeat(64),
    admissionRef: 'ADMISSION_TEST_ONLY',
    countryId: 'COUNTRY_02',
    locationId: 'REGION_02_E1',
    operatorId: 'ENTITY_OPERATOR_02',
    storageId: 'POWER-02-13',
    physicalSourceRef: 'TEST_ONLY_PHYSICAL_STORAGE',
    physicalSourceRawSha256: 'b'.repeat(64),
    utilityCompactSha256: 'c'.repeat(64),
  };
  const sourcePositions = (['LOW', 'MEDIUM', 'HIGH'] as const).map(
    (skill, i) => ({
      positionId:
        'POSTWAR_SOURCE_' + sha(scope.storageId + '/' + skill).toUpperCase(),
      countryId: scope.countryId,
      locationId: scope.locationId,
      employerId: scope.operatorId,
      employerRole: 'OP',
      sourceBucket: 'POWER',
      sourceObjectId: scope.storageId,
      skill,
      filledCount: ['2', '1', '0'][i]!,
      personRange: {
        poolId: 'TEST_POWER_POOL_' + skill,
        startOrdinal: '0',
        count: ['2', '1', '0'][i]!,
      },
    }),
  );
  const wagePositions = sourcePositions.map((p, i) => ({
    positionId: p.positionId,
    countryId: p.countryId,
    locationId: p.locationId,
    employerId: p.employerId,
    employerRole: 'OP',
    skill: p.skill,
    wageAmount: ['72000', '144000', '216000'][i]!,
    wageCurrency: 'XBB',
    wagePeriod: 'SIM_YEAR',
    wageVersion: 'TEST_ONLY_RETAINED_POWER_WAGE',
    payrollFundingRef: 'TEST_POWER_PAYROLL_' + p.skill,
  }));
  const populationPositionRefs = sourcePositions.map((p, i) => ({
    positionId: p.positionId,
    regionId: p.locationId,
    sourcePoolId: p.personRange.poolId,
    sourceStartOrdinal: '0',
    startOrdinal: ['0', '2', '3'][i]!,
    count: p.filledCount,
    cohortId: 'TEST_POWER_COHORT_' + p.skill,
  }));
  const positionFunding = sourcePositions.map((p) => ({
    positionId: p.positionId,
    payerEntityId: p.employerId,
    accountRef: 'TEST_ONLY_ORIGINAL_OP_DEPOSIT',
    currency: 'XBB',
  }));
  return {
    scope,
    sourcePositions,
    wagePositions,
    populationPositionRefs,
    positionFunding,
  };
}
