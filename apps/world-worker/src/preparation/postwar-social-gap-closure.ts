/** Read-only overlay over the immutable 1066 selected-source composite gaps.
 * Generated policy coverage is separate from admission, custody and execution. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  parseOpeningSeed,
  parseWorldDecimal,
  type OpeningSeed,
} from '@econmind/core';
import type { preparePostwarWorldGenesis } from './postwar-world-genesis.js';
import { consumeLabourSocialOpeningAdoption } from './official-labour-social-opening-adoption.js';
import {
  readPostwarOperatingGenesisFromSeed,
  type PostwarOperatingGenesisCarrier,
} from './postwar-operating-genesis-adoption.js';
import { validatePostwarSocialEmploymentStateDocument } from './postwar-social-employment-state.js';
import { validatePostwarPhysicalServiceReceiptFromSeed } from './postwar-physical-service-receipt.js';
import { consumePostwarFinalizedSocialServiceGenesis } from './postwar-social-service-genesis.js';
import {
  assertPostwarSocialSupportPolicyBytes,
  POSTWAR_SOCIAL_SUPPORT_POLICY_PATH,
} from './postwar-social-support.js';

type Prepared = Awaited<ReturnType<typeof preparePostwarWorldGenesis>>;
type Check = { field: string; met: boolean; evidence: string };
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const data = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_key, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
  );
const equal = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
const whole = (value: string) => BigInt(value);
const sum = (values: readonly string[]) =>
  values.reduce((a, b) => a + whole(b), 0n);
const check = (field: string, met: boolean, evidence: string): Check => ({
  field,
  met,
  evidence,
});
function invalid(reason: string): never {
  throw Error(`POSTWAR_SOCIAL_GAP_OVERLAY: ${reason}`);
}

export function auditPostwarSocialGapClosure(input: {
  readonly prepared: Prepared;
  readonly finalSeed?: OpeningSeed;
}) {
  const p = input.prepared,
    adoption = p.context.labourSocial;
  consumeLabourSocialOpeningAdoption(adoption);
  consumePostwarFinalizedSocialServiceGenesis(p.socialFinalized, p.social);
  const gaps = adoption.gaps;
  const countryFields = [
    'employmentByRegionAndSkill',
    'wageAmountCurrencyPeriodVersion',
    'payrollFundingAndObligation',
    'educationInitialQueueAndProgramme',
    'educationStaffAndFiscalCapacity',
    'healthcareInitialDemandAndBacklog',
    'healthcareInputsAndFiscalCapacity',
    'housingOccupancyHabitabilityAndRent',
    'welfareEligibilityRulesAndPayments',
    'publicSafetyPositionsAndInitialQueue',
  ];
  if (
    gaps.length !== 1066 ||
    gaps.filter((g) => g.locationId === null).length !== 700 ||
    gaps.filter((g) => g.field === 'staffingByOccupationAndSkill').length !==
      244 ||
    gaps.filter((g) => g.field === 'titleAndTenure').length !== 122 ||
    new Set(
      gaps.map((g) =>
        JSON.stringify([g.countryId, g.locationId, g.sourceObjectId, g.field]),
      ),
    ).size !== 1066
  )
    invalid('original 1066 composite denominator differs');
  for (const countryId of adoption.countryIds)
    if (
      countryFields.some(
        (field) =>
          gaps.filter((g) => g.countryId === countryId && g.field === field)
            .length !== 1,
      )
    )
      invalid('70-country ten-group denominator differs');
  let readback: ReturnType<typeof readPostwarOperatingGenesisFromSeed> | null =
    null;
  let carrier: PostwarOperatingGenesisCarrier | null = null;
  let physicalValidated = false,
    e03Validated = false;
  if (input.finalSeed) {
    const seed = parseOpeningSeed(data(input.finalSeed), sha);
    readback = readPostwarOperatingGenesisFromSeed(seed);
    if (seed.worldId !== p.social.worldId || seed.seedId !== p.social.seedId)
      invalid('final seed world/seed differs');
    const originals = seed.sources.filter(
      (s) =>
        (JSON.parse(s.canonicalPayload) as { schemaVersion?: string })
          .schemaVersion === 'postwar-operating-genesis-seed-source-v1',
    );
    if (originals.length !== 1) invalid('one source carrier required');
    carrier = (
      JSON.parse(originals[0]!.canonicalPayload) as {
        carrier: PostwarOperatingGenesisCarrier;
      }
    ).carrier;
    if (!readback.socialEmployment) invalid('full E03 source absent');
    const employment = validatePostwarSocialEmploymentStateDocument(
      readback.socialEmployment,
    );
    if (
      employment.inputs.worldId !== p.social.worldId ||
      employment.inputs.seedId !== p.social.seedId ||
      !equal(employment.inputs.sourcePositions, data(p.labour.positions))
    )
      invalid('E03 actual labour binding differs');
    e03Validated = true;
    if (!carrier.physicalServiceReceiptDocumentId)
      invalid('physical receipt absent');
    validatePostwarPhysicalServiceReceiptFromSeed({
      seed,
      documentId: carrier.physicalServiceReceiptDocumentId,
      context: p.context,
    });
    physicalValidated = true;
  }
  const raw = (name: string, expected: unknown) => {
    const found =
      carrier?.documents.filter(
        (d) => d.documentId === `RAW_${name.toUpperCase()}`,
      ) ?? [];
    return (
      found.length === 1 &&
      sha(found[0]!.bytes) === found[0]!.sha256 &&
      equal(JSON.parse(found[0]!.bytes), data(expected))
    );
  };
  const persisted = {
    labour: raw('labour', p.labour),
    population: raw('population', p.populationFacts),
    social: raw('socialPrepared', p.social),
    finalized: raw('socialFinalized', p.socialFinalized),
    funding: raw('funding', p.funding),
    wages: raw('wages', p.wages),
    housing: raw('housing', p.housing),
    safety: raw('publicSafety', p.safetyFinalized),
  };
  const supportDocs =
    carrier?.documents.filter(
      (d) => d.path === POSTWAR_SOCIAL_SUPPORT_POLICY_PATH,
    ) ?? [];
  let supportPolicy = false;
  if (supportDocs.length === 1) {
    assertPostwarSocialSupportPolicyBytes(supportDocs[0]!.bytes);
    supportPolicy = sha(supportDocs[0]!.bytes) === supportDocs[0]!.sha256;
  }
  const facts = readback?.facts;
  const regionsFor = (countryId: string) =>
    p.social.regions.filter((r) => r.countryId === countryId);
  const service = (locationId: string, kind: 'SCHOOL' | 'MEDICAL' | 'POLICE') =>
    facts?.services.find((s) => s.regionId === locationId && s.kind === kind);
  const position = (positionId: string) =>
    facts?.positions.find((p) => p.positionId === positionId);
  const checksFor = (
    field: string,
    countryId: string,
    locationId: string | null,
    sourceObjectId: string,
  ): Check[] => {
    const regions = regionsFor(countryId),
      ids = new Set(regions.map((r) => r.locationId));
    const allPositions = p.labour.positions.filter(
      (p) => p.countryId === countryId,
    );
    const finalized = p.socialFinalized.regions.filter(
      (r) => r.countryId === countryId,
    );
    const housing = p.housing.regions.filter((r) => r.countryId === countryId);
    const programmes = p.safetyFinalized.programmes.filter(
      (r) => r.countryId === countryId,
    );
    const base = [
      check(
        'canonicalFinalSeedReadback',
        readback !== null,
        'readPostwarOperatingGenesisFromSeed: full source hashes, source population/funding/operating facts',
      ),
    ];
    switch (field) {
      case 'employmentByRegionAndSkill':
        return [
          ...base,
          check(
            'sourceBoundExactRegionSkillPopulation',
            persisted.labour && persisted.population && e03Validated,
            'RAW_LABOUR/RAW_POPULATION + re-derived full Core E03 labour',
          ),
          check(
            'allActualPositionCountsPersisted',
            allPositions.length > 0 &&
              allPositions.every(
                (p) => position(p.positionId)?.filledCount === p.filledCount,
              ),
            'canonical facts.positions filledCount + source-preserved employed/unemployed',
          ),
        ];
      case 'wageAmountCurrencyPeriodVersion':
        return [
          ...base,
          check(
            'versionedSourceCalibratedWagesPersisted',
            persisted.wages && e03Validated,
            'RAW_WAGES + full E03 wages',
          ),
          check(
            'everyPositionHasPositiveActualCurrencyAnnualVersion',
            allPositions.length > 0 &&
              allPositions.every((p) => {
                const w =
                  input.prepared.funding.wagesByPositionId[p.positionId];
                return (
                  w !== undefined &&
                  parseWorldDecimal(w.wageAmount).gt('0') &&
                  w.wageCurrency ===
                    input.prepared.wages.countries.find(
                      (c) => c.countryId === countryId,
                    )?.currency &&
                  w.wagePeriod === 'SIM_YEAR' &&
                  Boolean(w.wageVersion)
                );
              }),
            'funding.wagesByPositionId + actual source currency/FX; no free labour',
          ),
        ];
      case 'payrollFundingAndObligation':
        return [
          ...base,
          check(
            'oneSharedFinancialAllocationPersisted',
            persisted.funding && e03Validated,
            'RAW_FUNDING + source actual TGA/deposit backed E03 payroll refs',
          ),
          check(
            'eachFilledJobHasUnpaidFirstDayObligation',
            allPositions
              .filter((p) => whole(p.filledCount) > 0n)
              .every((p) => {
                const fact = position(p.positionId);
                return Boolean(
                  fact?.wageObligationId &&
                  facts?.obligations.some(
                    (o) =>
                      o.obligationId === fact.wageObligationId &&
                      o.kind === 'WAGE' &&
                      o.state === 'OPEN_UNPAID' &&
                      o.payerEntityId === p.employerId &&
                      o.coveredCount === p.filledCount,
                  ) &&
                  facts?.events.some(
                    (e) => e.obligationId === fact.wageObligationId,
                  ),
                );
              }),
            'canonical WAGE obligations + initial due events, payments not fabricated',
          ),
        ];
      case 'educationInitialQueueAndProgramme':
        return [
          ...base,
          check(
            'allAgeProgrammeDemandAndActualStudentPartitionsPersisted',
            persisted.social && persisted.finalized && persisted.population,
            'RAW_SOCIALPREPARED/RAW_SOCIALFINALIZED/RAW_POPULATION',
          ),
          check(
            'everyExistingBasicSchoolHasItsFullInitialQueue',
            regions.every((r) => {
              const s = service(r.locationId, 'SCHOOL'),
                f = finalized.find((f) => f.locationId === r.locationId);
              return (
                r.studentCohorts.length === 12 &&
                r.studentCohorts.every(
                  (c) => whole(c.requiredSimDays) > whole(c.elapsedSimDays),
                ) &&
                s?.serviceId === r.schoolAssetId &&
                s.demandCount ===
                  sum(r.studentCohorts.map((c) => c.applicants)).toString() &&
                s.allocatedCount === f?.students.actualEnrollment
              );
            }),
            'source BASIC only, age6..17 applicant queues, finite programme duration; college/clinic not renamed',
          ),
        ];
      case 'educationStaffAndFiscalCapacity':
        return [
          ...base,
          check(
            'samePolicyCashAndPhysicalInputsPersisted',
            supportPolicy &&
              persisted.finalized &&
              persisted.funding &&
              physicalValidated,
            'literal-pinned support policy + actual physical receipt + shared funding',
          ),
          check(
            'allSchoolsHaveStaffInputBudgetBounds',
            regions.every((r) => {
              const s = service(r.locationId, 'SCHOOL'),
                f = finalized.find((f) => f.locationId === r.locationId);
              return Boolean(
                s &&
                f &&
                s.capacityCount === f.students.capacity &&
                s.staffing.length > 0 &&
                s.inputAllocations?.length &&
                s.capacityBounds.length >= 4 &&
                whole(s.allocatedCount) <= whole(s.capacityCount),
              );
            }),
            'canonical school teachers×26, seats/materials/operational utilities/same-purpose LC budget',
          ),
        ];
      case 'healthcareInitialDemandAndBacklog':
        return [
          ...base,
          check(
            'initialDemandBacklogOccupancyAndOneDayStatePersisted',
            persisted.social && persisted.finalized,
            'RAW_SOCIALPREPARED + RAW_SOCIALFINALIZED one-day source queue/occupied patients',
          ),
          check(
            'allHospitalEpisodesRemainUndeliveredAtGenesis',
            regions.every((r) => {
              const s = service(r.locationId, 'MEDICAL');
              return (
                s?.serviceId === r.hospitalAssetId &&
                s.demandCount === r.healthcare.queuedEpisodes &&
                s.allocatedCount === '0' &&
                s.unallocatedCount === r.healthcare.queuedEpisodes &&
                whole(r.healthcare.occupiedBeds) <= whole(r.sourceHospitalBeds)
              );
            }),
            'canonical initial EPISODE queue, initial delivered0; occupancy is not service delivery',
          ),
        ];
      case 'healthcareInputsAndFiscalCapacity':
        return [
          ...base,
          check(
            'sourceClinicalBreakdownCashAndPhysicalInputsPersisted',
            supportPolicy &&
              persisted.labour &&
              persisted.finalized &&
              persisted.funding &&
              physicalValidated,
            'same policy/staff/finite medicine/equipment/water/power/shared budget',
          ),
          check(
            'allHospitalsHaveAllCapacityBounds',
            regions.every((r) => {
              const s = service(r.locationId, 'MEDICAL'),
                f = finalized.find((f) => f.locationId === r.locationId);
              return Boolean(
                s &&
                f &&
                s.capacityCount === f.healthcare.potentialEpisodesPerSimDay &&
                s.staffing.length >= 4 &&
                s.inputAllocations?.length &&
                s.capacityBounds.length >= 5,
              );
            }),
            'capacity can be zero: known unmet need is preserved, no fake ready requirement',
          ),
        ];
      case 'housingOccupancyHabitabilityAndRent':
        return [
          ...base,
          check(
            'allHousingStockTitleTenureAndProspectiveRentRulesPersisted',
            persisted.housing &&
              housing.length === regions.length &&
              housing.every(
                (h) =>
                  sum(h.cohorts.map((c) => c.households)) ===
                    whole(h.source.households) &&
                  sum(h.titles.map((t) => t.units)) ===
                    whole(h.source.totalUnits) &&
                  whole(h.stock.occupiedUnits) <=
                    whole(h.stock.habitableUnits) &&
                  h.rentObligations.every(
                    (o) =>
                      o.contractCreated === false &&
                      o.paidAtT0 === '0' &&
                      Boolean(o.rightsPolicySha256),
                  ),
              ),
            'RAW_HOUSING source stock + generated title/tenure/finite habitability/prospective rent rules, not leases',
          ),
          check(
            'actualHousingPartitionAndHousingBenefitPolicyPersisted',
            persisted.safety &&
              housing.every((h) =>
                facts?.housing.some((c) => c.regionId === h.locationId),
              ) &&
              programmes.some((p) => p.programmeType === 'HOUSING_BENEFIT'),
            'canonical complete household partition + bounded housing benefit programme; no t0 payment',
          ),
        ];
      case 'welfareEligibilityRulesAndPayments':
        return [
          ...base,
          check(
            'eligibilityAgeAndActualAdminFundingPolicyPersisted',
            persisted.safety &&
              persisted.population &&
              persisted.funding &&
              programmes.length === regions.length * 9,
            'RAW_PUBLICSAFETY/RAW_POPULATION/RAW_FUNDING; explicit overlapping eligibility, not extra people',
          ),
          check(
            'allWelfarePaymentStatesAndDueObligationsExplicit',
            programmes.every(
              (p) =>
                p.paid === '0' &&
                p.actualPaidCost === '0' &&
                whole(p.scheduled) <= whole(p.approved) &&
                whole(p.approved) <= whole(p.verified) &&
                whole(p.verified) <= whole(p.applied) &&
                Boolean(
                  facts?.services.some(
                    (s) =>
                      s.serviceId === p.programmeId && s.kind === 'WELFARE',
                  ),
                ) &&
                (whole(p.scheduled) === 0n ||
                  facts?.obligations.some(
                    (o) =>
                      o.obligationId === p.initialObligationId &&
                      o.kind === 'WELFARE' &&
                      o.state === 'OPEN_UNPAID',
                  )),
            ),
            'scheduled unpaid/awaiting funding/administration are known states, not paid benefits',
          ),
        ];
      case 'publicSafetyPositionsAndInitialQueue':
        return [
          ...base,
          check(
            'actualSafetyRoleStaffAndIncidentQueuesPersisted',
            persisted.safety &&
              persisted.labour &&
              p.safetyFinalized.staffing.some((s) => ids.has(s.locationId)) &&
              p.safetyFinalized.incidents.some((c) => ids.has(c.locationId)),
            'RAW_PUBLICSAFETY + actual lawful source-constrained POLICE jobs and limited-foot capacity',
          ),
          check(
            'allRegionsHaveUndispatchedInitialCaseEffort',
            regions.every((r) => {
              const s = service(r.locationId, 'POLICE');
              return Boolean(
                s &&
                s.allocatedCount === '0' &&
                s.demandCount === s.unallocatedCount &&
                s.staffing.length,
              );
            }),
            'canonical case/effort queue; no handled cases invented',
          ),
        ];
      case 'staffingByOccupationAndSkill': {
        const asset = adoption.capacities.find(
          (a) =>
            a.sourceFacilityId === sourceObjectId &&
            a.core.locationId === locationId,
        );
        const demands = p.social.demands.filter(
            (d) => d.sourceObjectId === sourceObjectId,
          ),
          teachers = asset?.sourceProjectId === 'PROJECT-31';
        const lawful =
          demands.length === (teachers ? 1 : 6) &&
          demands.every((d) =>
            d.occupation === 'TEACHER' || d.occupation === 'DOCTOR'
              ? d.skill === 'HIGH'
              : d.occupation === 'MEDICAL_TECHNICIAN'
                ? d.skill === 'MEDIUM'
                : d.occupation === 'NURSE'
                  ? ['MEDIUM', 'HIGH'].includes(d.skill)
                  : d.occupation === 'SUPPORT' &&
                    ['LOW', 'MEDIUM'].includes(d.skill),
          );
        return [
          ...base,
          check(
            'generatedDemandPreservesEntireSourceStaffTarget',
            persisted.labour &&
              persisted.social &&
              asset !== undefined &&
              sum(demands.map((d) => d.requiredCount)) ===
                whole(asset.requiredStaffTarget ?? '-1'),
            'exact source facility target; original generic skill proposal/conflict remains in raw audit',
          ),
          check(
            'lawfulOccupationSkillBreakdownAndActualFillsPersisted',
            e03Validated &&
              lawful &&
              demands.every((d) => position(d.positionId) !== undefined),
            'TEACHER/DOCTOR HIGH; TECH MEDIUM; NURSE MED/HIGH; SUPPORT LOW/MED; demand is not filled',
          ),
        ];
      }
      case 'titleAndTenure': {
        const h = p.housing.regions.find(
          (h) =>
            h.sourceFacilityId === sourceObjectId &&
            h.locationId === locationId,
        );
        return [
          ...base,
          check(
            'completeGeneratedTitlePartitionAndTenurePersisted',
            persisted.housing &&
              h !== undefined &&
              sum(h.titles.map((t) => t.units)) ===
                whole(h.source.totalUnits) &&
              h.titles.every((t) =>
                Boolean(
                  t.titleHolderId &&
                  t.riskBearerId &&
                  t.operatorId &&
                  t.beneficialOwnerGroupRef,
                ),
              ) &&
              sum(h.cohorts.map((c) => c.households)) ===
                whole(h.source.households),
            'RAW_HOUSING generated aggregate rights preserve original source bytes; not a retrospective source-owner assertion',
          ),
          check(
            'allHouseholdTenuresMaterializedAsPolicyFacts',
            h !== undefined &&
              Boolean(facts?.housing.some((c) => c.regionId === h.locationId)),
            'canonical housing facts, private beneficial settlement/rent contracts remain runtime prerequisites',
          ),
        ];
      }
      default:
        invalid(`unmapped original composite ${field}`);
    }
  };
  const rows = gaps.map((originalGap) => {
    const checks = checksFor(
      originalGap.field,
      originalGap.countryId,
      originalGap.locationId,
      originalGap.sourceObjectId,
    );
    const complete = checks.length > 0 && checks.every((c) => c.met);
    return {
      gapKey: JSON.stringify([
        originalGap.countryId,
        originalGap.locationId,
        originalGap.sourceObjectId,
        originalGap.field,
      ]),
      originalGap,
      sourceChecks: checks,
      sourceLevel: complete
        ? ('GENERATED_POLICY_COVERED_NOT_ADMITTED' as const)
        : ('PARTIAL_OR_NOT_VALIDATED' as const),
      wholeCompositeCovered: complete,
      originalRawGapChanged: false as const,
      runtimeLevel: 'NOT_PROVEN' as const,
      runtimeBlockers: [
        'SIGNED_OPENING_ADMISSION_NOT_OBSERVED',
        'SERVER_ISSUER_AND_CURRENTNESS_CUSTODY_NOT_PROVEN',
        'REGISTERED_EXECUTION_BINDING_NOT_PROVEN',
      ],
    };
  });
  const byField = Object.fromEntries(
    [...new Set(gaps.map((g) => g.field))].map((field) => {
      const same = rows.filter((r) => r.originalGap.field === field);
      return [
        field,
        {
          original: same.length,
          sourcePolicyCovered: same.filter((r) => r.wholeCompositeCovered)
            .length,
          runtimeClosed: 0,
        },
      ];
    }),
  );
  const covered = rows.filter((r) => r.wholeCompositeCovered).length;
  return {
    schemaVersion: 'postwar-social-gap-closure-overlay-v1' as const,
    worldId: p.social.worldId,
    seedId: p.social.seedId,
    sourceChecksumsSha256: adoption.sourceChecksumsSha256,
    finalSeedFingerprint: readback?.seedFingerprint ?? null,
    validation: {
      canonicalReadback: readback ? 'PASS' : 'NOT_RUN',
      physicalReceipt: physicalValidated ? 'PASS' : 'NOT_RUN',
      fullCoreE03: e03Validated ? 'PASS' : 'NOT_RUN',
    },
    summary: {
      originalCompositeGaps: 1066,
      countryGroups: 700,
      facilityGroups: 366,
      sourcePolicyCoveredCompositeGaps: covered,
      sourcePolicyUncoveredCompositeGaps: 1066 - covered,
      runtimeClosedCompositeGaps: 0,
      originalRawGapsChanged: 0,
      byField,
    },
    rows,
    sourceAdmitted: false as const,
    executionAuthorized: false as const,
    worldStarted: false as const,
  };
}
