/** Owner-adopted finite scenario staffing, not performed labour, payment,
 * professional certification or physical-network evidence. */
export const POSTWAR_WATER_STAFF_POLICY = Object.freeze({
  version: 'INDUSTRY_WATER_STAFF_20261113_V1',
  userAdoptionPath:
    'docs/governance/owner-inputs/2026-11-13/INDUSTRY_WATER_STAFF_USER_ADOPTION.original.json',
  userAdoptionRawSha256:
    'fa2ee807b63d903722bc896a439d12a4dfa1502294a0f626cfd37bf0efe5f406',
  workerSource: 'EXISTING_SAME_COUNTRY_SAME_OP_POWER_POSITION',
  minimumConcurrentPersonsPerExtractionPoint: '1',
  maximumSharedMinutesPerPersonFirstDay: '480',
  actualPaidServiceRequired: true,
  overlappingPowerManufacturingLogisticsWorkAllowed: false,
  newPeopleAllowed: false,
  volumeBasedLabourCoefficient: null,
});
export function postwarWaterServiceFacilityId(
  targetFacilityId: string,
): string {
  if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,239}$/u.test(targetFacilityId))
    throw Error('WATER_STAFF_ACTUAL_TARGET_FACILITY_REQUIRED');
  return 'UTILITY_WATER_' + targetFacilityId;
}
