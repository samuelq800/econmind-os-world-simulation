/** One actual selected-source assembly. No DB writer, signer, grant, payment,
 * queue dispatch or Clock. Every office view derives from the returned seed. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  canonicalDecimal,
  Money,
  type OpeningSeed,
} from '@econmind/core';
import type { preparePostwarWorldGenesis } from './postwar-world-genesis.js';
import {
  POSTWAR_OPERATING_USER_RECEIPT,
  POSTWAR_SELECTED_SOURCE_PINS,
  adoptPostwarOperatingGenesis,
  readPostwarOperatingGenesisFromSeed,
  requirePostwarSha256OpeningSeed,
  type PostwarOperatingGenesisCarrier,
  type PostwarOperatingGenesisFacts,
  type PostwarGenesisSourceDocument,
  type PostwarNewWorldScope,
} from './postwar-operating-genesis-adoption.js';
import { consumePostwarLabourGenesis } from './postwar-labour-genesis.js';
import { consumePostwarFundingGenesis } from './postwar-funding-genesis.js';
import {
  consumePostwarFinalizedSocialServiceGenesis,
  type PostwarFinalizedSocialServiceGenesis,
} from './postwar-social-service-genesis.js';
import { finalizePostwarSocialSupport } from './postwar-social-support.js';
import {
  createPostwarPopulationFacts,
  consumePostwarPopulationFacts,
  type PostwarPopulationFacts,
} from './postwar-population-facts.js';
import {
  createPostwarSocialEmploymentState,
  consumePostwarSocialEmploymentState,
} from './postwar-social-employment-state.js';
import { consumePostwarPublicSafetyGenesis } from './postwar-public-safety-genesis.js';
import {
  consumePostwarSupplyAllocation,
  appendPostwarOperatingSupplies,
} from './postwar-operating-supplies.js';
import {
  consumePostwarUtilityInputs,
  consumePostwarUtilityAllocation,
} from './postwar-utility-inputs.js';
import { isPostwarHousingGenesis } from './postwar-housing-genesis.js';
import { readPostwarLiquidFundingAccountsFromSeed } from './postwar-financial-genesis.js';
import {
  createPostwarPhysicalServiceReceipt,
  validatePostwarPhysicalServiceReceiptFromSeed,
} from './postwar-physical-service-receipt.js';
import { createPostwarFinancialOfficeOriginalDocument } from './postwar-financial-office-originals.js';

type Prepared = Awaited<ReturnType<typeof preparePostwarWorldGenesis>> &
  Readonly<{
    socialFinalized?: PostwarFinalizedSocialServiceGenesis;
    populationFacts?: PostwarPopulationFacts;
  }>;
const sha = (bytes: string) =>
  createHash('sha256').update(bytes, 'utf8').digest('hex');
const count = (n: string) => {
  if (!/^(0|[1-9][0-9]*)$/u.test(n))
    throw Error('POSTWAR_ASSEMBLY_NONCANONICAL_COUNT');
  return BigInt(n);
};
const sum = (rows: readonly string[]) =>
  rows.reduce((a, b) => a + count(b), 0n).toString();
const min = (...values: string[]) =>
  values
    .map(count)
    .reduce((a, b) => (a < b ? a : b))
    .toString();
const canonicalMoney = (amount: string, currency: string) =>
  canonicalDecimal(Money.from(amount, currency).amount);
const rawBytes = (value: unknown) =>
  JSON.stringify(value, (_key, v) =>
    typeof v === 'bigint' ? v.toString() : v,
  );
const same = (a: unknown, b: unknown, reason: string) => {
  if (canonicalSerialize(a) !== canonicalSerialize(b))
    throw Error('POSTWAR_ASSEMBLY:' + reason);
};
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export async function assemblePostwarGenesisCarrier(
  input: Readonly<{
    prepared: Prepared;
    socialFinalized?: PostwarFinalizedSocialServiceGenesis;
    populationFacts?: PostwarPopulationFacts;
    newWorldScope: PostwarNewWorldScope;
  }>,
) {
  const p = input.prepared,
    labour = consumePostwarLabourGenesis(p.labour),
    funding = consumePostwarFundingGenesis(p.funding);
  const socialFinalized = consumePostwarFinalizedSocialServiceGenesis(
    input.socialFinalized ??
      p.socialFinalized ??
      finalizePostwarSocialSupport({
        social: p.social,
        socialRequests: p.socialRequests,
        wages: p.wages,
        funding: p.funding,
        supplies: p.supplies,
        supplyAllocations: p.supplyAllocations,
        utilities: p.utilities,
        utilityAllocations: p.utilityAllocations,
        labour: p.labour,
      }),
    p.social,
  );
  consumePostwarPublicSafetyGenesis(p.safetyFinalized);
  if (!isPostwarHousingGenesis(p.housing))
    throw Error('POSTWAR_REAL_HOUSING_REQUIRED');
  const supplyPlan = consumePostwarSupplyAllocation(
    p.supplies,
    p.supplyAllocations,
  );
  consumePostwarUtilityInputs(p.utilities);
  consumePostwarUtilityAllocation(p.utilityAllocations);
  const supplySeed = requirePostwarSha256OpeningSeed(p.supplySeed);
  same(
    supplySeed,
    appendPostwarOperatingSupplies(p.financial.baselineSeed, p.supplies),
    'supplies seed differs from exact original financial + same finite supplies',
  );
  const population = createPostwarPopulationFacts({
    labourPreparation: p.labour,
    socialPrepared: p.social,
    socialFinalized,
  });
  const suppliedPopulation = input.populationFacts ?? p.populationFacts;
  if (suppliedPopulation)
    same(
      consumePostwarPopulationFacts(suppliedPopulation),
      population,
      'population normalizer differs from actual finalized enrollment',
    );
  const employment = consumePostwarSocialEmploymentState(
    createPostwarSocialEmploymentState({
      labourPreparation: p.labour,
      labourState: p.materializedLabour.state,
      populationFacts: population,
      wages: p.wages,
      funding: p.funding,
    }),
  );
  const moneyAccounts = readPostwarLiquidFundingAccountsFromSeed(supplySeed);
  const household = new Map(
    moneyAccounts
      .filter((a) => a.kind === 'HOUSEHOLD_BANK_DEPOSIT')
      .map((a) => [a.countryId, a.ownerId]),
  );
  const facts: {
    -readonly [
      K in keyof PostwarOperatingGenesisFacts
    ]: PostwarOperatingGenesisFacts[K] extends readonly (infer R)[]
      ? R[]
      : never;
  } = {
    regions: [],
    people: [...population.people],
    positions: [],
    services: [],
    housing: [],
    funding: [],
    obligations: [],
    events: [],
  };
  facts.regions.push(
    ...population.regions.map((r) => ({
      regionId: r.regionId,
      countryId: r.countryId,
      sourceRegionId: r.sourceRegionId,
    })),
  );
  for (const account of funding.accounts)
    facts.funding.push({
      fundingId: account.accountRef,
      accountId: account.accountRef,
      countryId: account.countryId,
      payerEntityId: account.payerEntityId,
      currency: account.currency,
      ceilingAmount: canonicalMoney(account.reservedAmount, account.currency),
    });
  const positionRefs = new Map(
    population.positionPopulationRefs.map((r) => [r.positionId, r]),
  );
  const payrolls = new Map(
    funding.positionFunding.map((r) => [r.positionId, r]),
  );
  for (const position of labour.positions) {
    const ref = positionRefs.get(position.positionId),
      payroll = payrolls.get(position.positionId);
    if (!ref || !payroll || ref.count !== position.filledCount)
      throw Error('POSTWAR_POSITION_POPULATION_OR_FUNDING_MISSING');
    const obligationId =
      count(position.filledCount) > 0n
        ? `FIRST_DAY_${position.positionId}`
        : null;
    facts.positions.push({
      positionId: position.positionId,
      regionId: position.locationId,
      employerId: position.employerId,
      sector: position.sourceBucket,
      cohortId: ref.cohortId,
      startOrdinal: ref.startOrdinal,
      filledCount: position.filledCount,
      requestedCount: position.requiredCount,
      wageObligationId: obligationId,
    });
    if (obligationId) {
      const payee = household.get(position.countryId);
      if (!payee) throw Error('POSTWAR_REAL_HOUSEHOLD_PAYEE_MISSING');
      const amount = canonicalMoney(payroll.amount, payroll.currency);
      facts.obligations.push({
        obligationId,
        regionId: position.locationId,
        kind: 'WAGE',
        payerEntityId: position.employerId,
        payeeEntityId: payee,
        currency: payroll.currency,
        unitAmount: amount,
        units: '1',
        amount,
        periodDays: '1',
        dueSimDay: '1',
        fundingId: payroll.accountRef,
        state: 'OPEN_UNPAID',
        basis: 'FIRST_DAY_AGGREGATE_RESERVATION_NOT_ACCRUED',
        coveredCount: position.filledCount,
        accruedAtOpening: '0',
        exactFirstDayPayroll: payroll.exactFirstDayPayrollLC,
      });
      facts.events.push({
        eventId: `DUE_${obligationId}`,
        obligationId,
        dueSimDay: '1',
        state: 'INITIAL_OPEN',
      });
    }
  }
  const socialPolicyBytes = await readFile(
    path.join(
      p.input.repositoryRoot,
      'config/postwar-genesis/social-services.v1.json',
    ),
    'utf8',
  );
  const supportPolicyBytes = await readFile(
    path.join(
      p.input.repositoryRoot,
      'config/postwar-genesis/social-support.v1.json',
    ),
    'utf8',
  );
  const regionMappingBytes = await readFile(
    path.join(
      p.input.repositoryRoot,
      'config/postwar-genesis/region-mapping.v1.json',
    ),
    'utf8',
  );
  const excerpt = JSON.parse(regionMappingBytes) as {
    fullMappingSha256: string;
    mappings: {
      sourceRegionId: string;
      normalizedRegionId: string;
      coreCountryId: string;
    }[];
  };
  const fullMapping = JSON.parse(p.context.mappingBytes) as {
    mappings: {
      regions: {
        sourceRegionId: string;
        normalizedRegionId: string;
        coreCountryId: string;
      }[];
    };
  };
  const actualExcerpt = fullMapping.mappings.regions
    .map(({ sourceRegionId, normalizedRegionId, coreCountryId }) => ({
      sourceRegionId,
      normalizedRegionId,
      coreCountryId,
    }))
    .sort((a, b) => (a.sourceRegionId < b.sourceRegionId ? -1 : 1));
  same(
    excerpt.mappings,
    actualExcerpt,
    'compact mapping differs from actual full pinned source',
  );
  if (
    sha(regionMappingBytes) !== POSTWAR_SELECTED_SOURCE_PINS.regionMapping ||
    sha(p.context.mappingBytes) !== excerpt.fullMappingSha256
  )
    throw Error('POSTWAR_COMPACT_MAPPING_HASH_MISMATCH');
  const physical = createPostwarPhysicalServiceReceipt({
    context: p.context,
    social: p.social,
    utilities: p.utilities,
    utilityAllocations: p.utilityAllocations,
    supplies: p.supplies,
    supplyAllocations: p.supplyAllocations,
    suppliesSeed: supplySeed,
    worldId: p.input.worldId,
    seedId: p.input.seedId,
    openingGregorianTimestamp: p.utilities.openingGregorianTimestamp,
    policyBytes: {
      utilities: p.policyBytes.utilities,
      supplies: p.policyBytes.supplies,
      social: socialPolicyBytes,
    },
  });
  const socialPolicy = JSON.parse(socialPolicyBytes) as {
    education: { studentsPerFilledQualifiedTeacher: string };
    healthcare: Record<string, string>;
  };
  const allPeopleFor = (regionId: string) =>
    population.people
      .filter((c) => c.regionId === regionId)
      .map((c) => c.cohortId);
  const staffFor = (regionId: string, occupation: string, units: string) =>
    labour.positions
      .filter(
        (position) =>
          position.locationId === regionId &&
          position.occupation === occupation &&
          p.social.demands.some(
            (demand) => demand.positionId === position.positionId,
          ),
      )
      .map((position) => ({
        positionId: position.positionId,
        unitsPerStaff: units,
        capacityGroup: occupation,
      }));
  const allocationsFor = (
    regionId: string,
    kind: 'MEDICINE' | 'SCHOOL_MATERIALS',
    unitsPerService: string,
  ) => {
    const stock = p.supplies.stocks.find(
      (stock) => stock.locationId === regionId && stock.kind === kind,
    );
    if (!stock) throw Error('POSTWAR_ACTUAL_FINITE_STOCK_MISSING');
    const grant = supplyPlan.grants.find(
      (grant) => grant.entryId === stock.entry.entryId,
    );
    if (!grant) throw Error('POSTWAR_ACTUAL_FINITE_GRANT_MISSING');
    return [
      {
        allocationId: grant.allocationId,
        sourceId: grant.sourceId,
        entryId: grant.entryId,
        commodityId: grant.commodityId,
        unit: grant.unit,
        quantity: grant.quantity,
        unitsPerService,
      },
    ];
  };
  for (const region of socialFinalized.regions) {
    const original = p.social.regions.find(
      (r) => r.locationId === region.locationId,
    )!;
    const eligibility = population.servicePopulationRefs.filter(
      (r) =>
        r.regionId === region.locationId &&
        r.populationUse === 'ELIGIBLE_SUBSET',
    );
    const applicantRefs = [
      ...new Set(
        eligibility.flatMap((r) => r.populationRefs.map((r) => r.cohortId)),
      ),
    ];
    const demand = sum(original.studentCohorts.map((c) => c.applicants)),
      allocated = region.students.actualEnrollment;
    const teachingCapacity = (
      count(region.students.employedTeachers) *
      count(socialPolicy.education.studentsPerFilledQualifiedTeacher)
    ).toString();
    const capacity = region.students.capacity;
    const material = allocationsFor(region.locationId, 'SCHOOL_MATERIALS', '1');
    const utility = p.utilityAllocations.regions.find(
      (r) => r.locationId === region.locationId,
    )!;
    const budgetSeats = canonicalDecimal(
      Money.from(
        region.funding.educationBudgetAvailable,
        region.funding.currency,
      )
        .amount.dividedBy(region.funding.educationUnitCost)
        .floor(),
    );
    same(
      capacity,
      min(
        original.sourceSchoolSeats,
        teachingCapacity,
        region.funding.educationMaterialSeats,
        budgetSeats,
      ),
      'education capacity not rederived',
    );
    facts.services.push({
      serviceId: original.schoolAssetId,
      regionId: region.locationId,
      kind: 'SCHOOL',
      populationUse: 'ELIGIBLE_SUBSET',
      measureUnit: 'PERSON',
      cohortIds: applicantRefs,
      demandCount: demand,
      allocatedCount: allocated,
      unallocatedCount: (count(demand) - count(allocated)).toString(),
      capacityCount: capacity,
      capacityBounds: [
        {
          reference: 'ORIGINAL_SCHOOL_SEATS',
          count: original.sourceSchoolSeats,
        },
        { reference: 'ACTUAL_QUALIFIED_TEACHERS', count: teachingCapacity },
        {
          reference: 'FUNDED_MATERIAL_AND_UTILITY_SEATS',
          count: region.funding.educationMaterialSeats,
        },
        { reference: 'REAL_SHARED_OPERATING_BUDGET', count: budgetSeats },
      ],
      staffing: staffFor(
        region.locationId,
        'TEACHER',
        socialPolicy.education.studentsPerFilledQualifiedTeacher,
      ),
      obligationIds: [],
      inputAllocations: material,
    });
    const h = socialPolicy.healthcare;
    const medStaff = [
      ...staffFor(region.locationId, 'DOCTOR', h.doctorsCasesPerSimDay!),
      ...staffFor(region.locationId, 'NURSE', h.nursesCasesPerSimDay!),
      ...staffFor(
        region.locationId,
        'MEDICAL_TECHNICIAN',
        h.techniciansCasesPerSimDay!,
      ),
      ...staffFor(region.locationId, 'SUPPORT', h.supportCasesPerSimDay!),
    ];
    const queued = region.healthcare.queuedEpisodes;
    const facility = (
      count(original.sourceHospitalBeds) *
      count(h.facilityEpisodesPerBedSimDay!)
    ).toString();
    const medCapacity = min(
      queued,
      region.healthcare.staffCapacity,
      facility,
      region.healthcare.supplyCapacity,
      region.healthcare.budgetCapacity,
    );
    same(
      medCapacity,
      region.healthcare.potentialEpisodesPerSimDay,
      'health capacity not rederived',
    );
    if (
      count(region.funding.educationMaterialSeats) >
        count(utility.operationalEducationWaterStudentDays) ||
      count(region.funding.educationMaterialSeats) >
        count(utility.operationalEducationPowerStudentDays) ||
      count(region.funding.waterEpisodes) >
        count(utility.operationalWaterEpisodes) ||
      count(region.funding.powerEpisodes) >
        count(utility.operationalPowerEpisodes)
    )
      throw Error('POSTWAR_FINITE_UTILITY_ALLOCATION_EXCEEDED');
    facts.services.push({
      serviceId: original.hospitalAssetId,
      regionId: region.locationId,
      kind: 'MEDICAL',
      populationUse: 'ELIGIBLE_SUBSET',
      measureUnit: 'EPISODE',
      populationCount: original.demography.population,
      cohortIds: allPeopleFor(region.locationId),
      demandCount: queued,
      allocatedCount: '0',
      unallocatedCount: queued,
      capacityCount: medCapacity,
      capacityBounds: [
        { reference: 'REAL_INITIAL_EPISODE_QUEUE', count: queued },
        {
          reference: 'ACTUAL_CLINICAL_STAFF',
          count: region.healthcare.staffCapacity,
        },
        { reference: 'ORIGINAL_HOSPITAL_FACILITY', count: facility },
        {
          reference: 'FINITE_SUPPLY_AND_UTILITIES',
          count: region.healthcare.supplyCapacity,
        },
        {
          reference: 'REAL_SHARED_CARE_BUDGET',
          count: region.healthcare.budgetCapacity,
        },
      ],
      staffing: medStaff,
      obligationIds: [],
      inputAllocations: allocationsFor(
        region.locationId,
        'MEDICINE',
        h.dosesPerEpisode!,
      ),
    });
  }
  const safetyPolicy = JSON.parse(p.policyBytes.safety) as {
    caseHandlingPerOfficerPerWindow: string;
    applicationsPerAdministratorPerWindow: string;
  };
  for (const region of population.regions) {
    const incidents = p.safetyFinalized.incidents.filter(
      (c) => c.locationId === region.regionId,
    );
    const staff = p.safetyFinalized.staffing.filter(
      (s) =>
        s.locationId === region.regionId &&
        s.function !== 'WELFARE_ADMINISTRATION' &&
        s.function !== 'ADMIN_SUPPORT',
    );
    const demand = sum(
      incidents.map((c) =>
        (count(c.count) * count(c.requiredStaffPerCase)).toString(),
      ),
    );
    const capacity = min(
      demand,
      sum(staff.map((s) => s.potentialCaseEffortPerWindow)),
    );
    facts.services.push({
      serviceId: `POLICE_${region.regionId}`,
      regionId: region.regionId,
      kind: 'POLICE',
      measureUnit: 'CASE',
      populationUse: 'ELIGIBLE_SUBSET',
      populationCount: region.population,
      cohortIds: allPeopleFor(region.regionId),
      demandCount: demand,
      allocatedCount: '0',
      unallocatedCount: demand,
      capacityCount: capacity,
      capacityBounds: [
        { reference: 'ORIGINAL_OPEN_CASE_EFFORT', count: demand },
        {
          reference: 'FUNDED_LIMITED_FOOT_STAFF_EFFORT',
          count: sum(staff.map((s) => s.potentialCaseEffortPerWindow)),
        },
      ],
      staffing: staff.map((s) => ({
        positionId: s.positionId,
        unitsPerStaff: safetyPolicy.caseHandlingPerOfficerPerWindow,
        capacityGroup: 'POLICE_CASE_EFFORT',
      })),
      obligationIds: [],
    });
    const programmes = p.safetyFinalized.programmes.filter(
      (programme) => programme.locationId === region.regionId,
    );
    const admin = labour.positions.filter(
      (position) =>
        position.locationId === region.regionId &&
        p.safetyFinalized.staffing.some(
          (s) =>
            s.positionId === position.positionId &&
            s.function === 'WELFARE_ADMINISTRATION',
        ),
    );
    for (const programme of programmes) {
      const obligationIds: string[] = [];
      if (count(programme.scheduled) > 0n) {
        const grant = funding.allocations.find(
            (a) => a.purposeId === programme.programmeId,
          ),
          payee = household.get(programme.countryId);
        if (!grant || !payee || !programme.initialObligationId)
          throw Error('POSTWAR_ACTUAL_WELFARE_FUNDING_MISSING');
        const unit = canonicalMoney(
            programme.benefitAmount,
            programme.benefitCurrency,
          ),
          amount = canonicalDecimal(
            Money.from(unit, programme.benefitCurrency).amount.times(
              programme.scheduled,
            ),
          );
        facts.obligations.push({
          obligationId: programme.initialObligationId,
          regionId: region.regionId,
          kind: 'WELFARE',
          payerEntityId: grant.payerEntityId,
          payeeEntityId: payee,
          currency: programme.benefitCurrency,
          unitAmount: unit,
          units: programme.scheduled,
          amount,
          periodDays: programme.paymentFrequencySimDays,
          dueSimDay: programme.dueSimDay,
          fundingId: grant.accountRef,
          state: 'OPEN_UNPAID',
        });
        facts.events.push({
          eventId: `DUE_${programme.initialObligationId}`,
          obligationId: programme.initialObligationId,
          dueSimDay: programme.dueSimDay,
          state: 'INITIAL_OPEN',
        });
        obligationIds.push(programme.initialObligationId);
      }
      facts.services.push({
        serviceId: programme.programmeId,
        regionId: region.regionId,
        kind: 'WELFARE',
        populationUse: 'ELIGIBLE_SUBSET',
        measureUnit: 'PERSON',
        cohortIds: allPeopleFor(region.regionId),
        demandCount: programme.applied,
        allocatedCount: programme.verified,
        unallocatedCount: programme.pendingApplications,
        capacityCount: programme.verified,
        capacityBounds: [
          {
            reference: 'ACTUALLY_DISTRIBUTED_ADMINISTRATION',
            count: programme.verified,
          },
        ],
        staffing: admin.map((position) => ({
          positionId: position.positionId,
          unitsPerStaff: safetyPolicy.applicationsPerAdministratorPerWindow,
          capacityGroup: 'WELFARE_ADMINISTRATION',
        })),
        obligationIds,
      });
    }
  }
  for (const region of p.housing.regions) {
    let cursor = 0n;
    for (const cohort of region.cohorts) {
      if (count(cohort.households) === 0n) continue;
      const rental =
        cohort.tenure === 'PRIVATE_RENTER' || cohort.tenure === 'PUBLIC_RENTER';
      const rent = region.rentObligations.find((o) => o.cohortId === cohort.id);
      facts.housing.push({
        housingCohortId: cohort.id,
        regionId: region.locationId,
        startHouseholdOrdinal: cursor.toString(),
        households: cohort.households,
        tenure:
          cohort.tenure === 'OWNER_OCCUPIER'
            ? 'OWNER_OCCUPIED'
            : rental
              ? 'RENTAL'
              : 'UNHOUSED',
        occupiedUnits: cohort.tenure === 'DISPLACED' ? '0' : cohort.households,
        tenantEntityId: cohort.householdEntityId,
        landlordEntityId: rental ? (rent?.beneficiaryEntityId ?? null) : null,
        rentObligationId: null,
        rentRuleReference: rental ? (rent?.id ?? null) : null,
        rentState: rental ? 'RULE_ONLY_NOT_CONTRACT' : 'NOT_RENTAL',
      });
      cursor += count(cohort.households);
    }
    same(
      cursor.toString(),
      region.source.households,
      'housing complete partition',
    );
  }
  const docs: PostwarGenesisSourceDocument[] = [];
  const add = (documentId: string, docPath: string, bytes: string) => {
    const document: PostwarGenesisSourceDocument = {
      documentId,
      path: docPath,
      bytes,
      sha256: sha(bytes),
      provenanceKind: 'GENERATED_POLICY',
    };
    docs.push(document);
    return document;
  };
  for (const [name, bytes] of Object.entries(p.policyBytes))
    add(
      `POLICY_${name.toUpperCase()}`,
      `config/postwar-genesis/${name === 'wages' ? 'wage-policy' : name === 'safety' ? 'public-safety' : name}.v1.json`,
      bytes,
    );
  add(
    'POLICY_SOCIAL',
    'config/postwar-genesis/social-services.v1.json',
    socialPolicyBytes,
  );
  add(
    'POLICY_SOCIAL_SUPPORT',
    'config/postwar-genesis/social-support.v1.json',
    supportPolicyBytes,
  );
  const outputNames = {
    labour,
    population,
    socialPrepared: p.social,
    socialFinalized,
    funding,
    wages: p.wages,
    monetary: p.monetary,
    housing: p.housing,
    publicSafety: p.safetyFinalized,
    supplies: p.supplies,
    supplyAllocations: p.supplyAllocations,
    utilities: p.utilities,
    utilityAllocations: p.utilityAllocations,
  };
  for (const [name, value] of Object.entries(outputNames))
    add(
      `RAW_${name.toUpperCase()}`,
      `generated/postwar/${p.input.genesisVersion}/${name}.json`,
      rawBytes(value),
    );
  for (const document of p.financial.contract.documents)
    add(document.documentId, document.sourcePath, document.bytes);
  add(
    'FINANCIAL_ADOPTION_RECEIPT',
    'generated/postwar/financial-adoption.json',
    p.financial.receiptBytes,
  );
  add(
    'FINANCIAL_USER_INSTRUCTION',
    'generated/postwar/financial-user-instruction.json',
    p.financial.instructionBytes,
  );
  docs.push(createPostwarFinancialOfficeOriginalDocument(p.financial));
  for (const document of physical.documents)
    if (!docs.some((d) => d.path === document.path)) docs.push(document);
  const policy = add(
    'OPERATING_ASSEMBLY_POLICY',
    `generated/postwar/${p.input.genesisVersion}/assembly-policy.json`,
    canonicalSerialize({
      schemaVersion: 'postwar-genesis-assembly-policy-v1',
      version: p.input.genesisVersion,
      authorization: POSTWAR_OPERATING_USER_RECEIPT,
      sourcePins: POSTWAR_SELECTED_SOURCE_PINS,
      firstPayroll: 'ONE_DAY_AGGREGATE_CENT_CEILING_NOT_ACCRUED',
      futureAnnualWages: 'ORIGINAL_SIM_YEAR_RATE_IN_FULL_CORE_LABOUR_BODY',
      initialPayments: 'NONE',
      serviceCapacity: 'ACTUAL_STAFF_FINITE_SUPPLIES_UTILITIES_SHARED_FUNDS',
      housingRent: 'PROSPECTIVE_RIGHTS_RULES_NOT_PAID_OR_EXECUTED_LEASES',
    }),
  );
  const output = add(
    'OPERATING_NORMALIZED_FACTS',
    `generated/postwar/${p.input.genesisVersion}/facts.json`,
    canonicalSerialize(facts),
  );
  const carrier: PostwarOperatingGenesisCarrier = {
    schemaVersion: 'postwar-operating-genesis-v1',
    provenanceKind: 'GENERATED_POLICY',
    genesisVersion: p.input.genesisVersion,
    worldId: p.input.worldId,
    openingSimDay: '0',
    policyReceipt: POSTWAR_OPERATING_USER_RECEIPT,
    policyDocumentId: policy.documentId,
    outputDocumentId: output.documentId,
    documents: docs,
    sourcePins: POSTWAR_SELECTED_SOURCE_PINS,
    selectedSource: {
      regionsBytes: p.context.regionsBytes,
      countriesBytes: p.context.countriesBytes,
      selectionBytes: p.context.selectionBytes,
      employmentBytes: p.context.employmentBytes,
      regionMappingBytes,
    },
    facts,
    socialEmployment: employment,
    physicalServiceReceiptDocumentId: physical.receiptDocumentId,
  };
  const adoption = adoptPostwarOperatingGenesis({
    carrier,
    baselineSeed: supplySeed,
    sourceId: 'SOURCE_POSTWAR_OPERATING_V1',
    newWorldScope: input.newWorldScope,
  });
  if (!adoption.seed)
    throw Error(
      'POSTWAR_REAL_CARRIER_ADOPTION_REJECTED:' +
        canonicalSerialize(adoption.blockers),
    );
  const finalSeed: OpeningSeed = adoption.seed;
  validatePostwarPhysicalServiceReceiptFromSeed({
    seed: finalSeed,
    documentId: physical.receiptDocumentId,
    context: p.context,
  });
  const readback = readPostwarOperatingGenesisFromSeed(finalSeed);
  same(
    readback.socialEmployment,
    employment,
    'full Core E03 source changed during seed materialization',
  );
  return freeze({
    carrier,
    adoption,
    finalSeed,
    sourceDocuments: docs,
    socialFinalized,
    populationFacts: population,
    socialEmployment: employment,
    physicalReceipt: physical,
    readback,
    paymentsPosted: false as const,
    tasksDispatched: false as const,
    worldStarted: false as const,
  });
}
