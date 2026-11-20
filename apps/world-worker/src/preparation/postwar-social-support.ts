/** Joins issued source-bound preparations into one finite first-day service
 * calculation. No extra budget, commodity, inventory consumption or service. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  canonicalSerialize,
  canonicalDecimal,
  parseWorldDecimal,
} from '@econmind/core';
import {
  consumePostwarSocialServiceGenesis,
  createPostwarSocialServiceFundingRequests,
  postwarSocialServiceFundingPurpose,
  finalizePostwarSocialServiceGenesis,
  type PostwarSocialServiceGenesis,
  type PostwarSocialSupport,
} from './postwar-social-service-genesis.js';
import {
  consumePostwarLabourGenesis,
  type PostwarLabourGenesisPreparation,
} from './postwar-labour-genesis.js';
import {
  consumePostwarFundingGenesis,
  type PostwarFundingGenesis,
} from './postwar-funding-genesis.js';
import {
  isPostwarOperatingSupplies,
  consumePostwarSupplyAllocation,
  type PostwarOperatingSupplies,
  type PostwarSupplyAllocation,
} from './postwar-operating-supplies.js';
import {
  consumePostwarUtilityInputs,
  consumePostwarUtilityAllocation,
  type PostwarUtilityInputs,
  type PostwarUtilityAllocation,
} from './postwar-utility-inputs.js';
import type { PostwarWagePolicy } from './postwar-wage-policy.js';

export const POSTWAR_SOCIAL_SUPPORT_POLICY_PATH =
  'config/postwar-genesis/social-support.v1.json';
const policyBytes = readFileSync(
  new URL(
    '../../../../config/postwar-genesis/social-support.v1.json',
    import.meta.url,
  ),
  'utf8',
);
export const POSTWAR_SOCIAL_SUPPORT_POLICY_SHA256 =
  '1333f6a95c54a33b53e6964bf12c267734afae7da175fc4eddafa179607453cf';
export function assertPostwarSocialSupportPolicyBytes(bytes: string): void {
  if (
    createHash('sha256').update(bytes).digest('hex') !==
    POSTWAR_SOCIAL_SUPPORT_POLICY_SHA256
  )
    invalid('pinned social support policy bytes differ');
}
assertPostwarSocialSupportPolicyBytes(policyBytes);
const policy = JSON.parse(policyBytes) as {
  equipment: {
    maximumEpisodesPerPhysicalBedSimDay: string;
    undisruptedAvailableBps: string;
    disruptionPenaltyDivisor: string;
    minimumAvailableBps: string;
  };
};
function invalid(reason: string): never {
  throw Error(`POSTWAR_SOCIAL_SUPPORT: ${reason}`);
}
function whole(value: string): bigint {
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) invalid('whole service count required');
  return BigInt(value);
}
const min = (...values: bigint[]) => values.reduce((a, b) => (a < b ? a : b));
const equal = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);

export interface PostwarSocialSupportInput {
  readonly social: PostwarSocialServiceGenesis;
  readonly socialRequests: ReturnType<
    typeof createPostwarSocialServiceFundingRequests
  >;
  readonly wages: PostwarWagePolicy;
  readonly funding: PostwarFundingGenesis;
  readonly supplies: PostwarOperatingSupplies;
  readonly supplyAllocations: PostwarSupplyAllocation;
  readonly utilities: PostwarUtilityInputs;
  readonly utilityAllocations: PostwarUtilityAllocation;
  readonly labour: PostwarLabourGenesisPreparation;
}
export function finalizePostwarSocialSupport(input: PostwarSocialSupportInput) {
  const social = consumePostwarSocialServiceGenesis(input.social),
    labour = consumePostwarLabourGenesis(input.labour),
    funding = consumePostwarFundingGenesis(input.funding);
  const utilities = consumePostwarUtilityInputs(input.utilities),
    utilityPlan = consumePostwarUtilityAllocation(input.utilityAllocations);
  if (!isPostwarOperatingSupplies(input.supplies))
    invalid('genuine finite supplies required');
  const supplies = input.supplies,
    supplyPlan = consumePostwarSupplyAllocation(
      supplies,
      input.supplyAllocations,
    );
  const expectedRequests = createPostwarSocialServiceFundingRequests(
    social,
    input.wages,
  );
  if (!equal(input.socialRequests, expectedRequests))
    invalid('source-wage requests differ');
  for (const bound of [supplies, utilities])
    if (
      bound.worldId !== social.worldId ||
      bound.seedId !== social.seedId ||
      bound.sourceChecksumsSha256 !== social.sourceChecksumsSha256
    )
      invalid('world/seed/source differs');
  if (
    labour.sourceChecksumsSha256 !== social.sourceChecksumsSha256 ||
    utilityPlan.sourceFingerprint !== utilities.sourceFingerprint ||
    supplyPlan.suppliesFingerprint !== supplies.fingerprint
  )
    invalid('allocation source binding differs');
  for (const demand of social.demands) {
    const actual = labour.positions.find(
      (p) => p.positionId === demand.positionId,
    );
    // Labour adds execution carriers; every original demand field must still match.
    if (
      !actual ||
      Object.entries(demand).some(
        ([key, value]) => !equal(actual[key as keyof typeof actual], value),
      )
    )
      invalid('actual labour demand binding differs');
    const covered = funding.positionFunding.find(
      (p) => p.positionId === demand.positionId,
    );
    if (
      !covered ||
      covered.filledCount !== actual!.filledCount ||
      covered.payerEntityId !== demand.employerId
    )
      invalid('first-day payroll binding differs');
  }
  const usedFunding = new Set<string>(),
    usedGrants = new Set<string>();
  const countryTotals = new Map<
    string,
    {
      countryId: string;
      currency: string;
      sourceRef: string;
      educationAmount: string;
      healthcareAmount: string;
    }
  >();
  const support: PostwarSocialSupport[] = social.regions.map((region) => {
    const country = funding.accounts.find(
      (a) => a.countryId === region.countryId && a.payerRole === 'GOV',
    );
    if (!country) invalid('same country GOV account required');
    const prices = expectedRequests.unitCostsByCountry.find(
      (p) => p.countryId === region.countryId,
    )!;
    const scope = (service: 'EDUCATION' | 'HOSPITAL') => {
      const purpose = postwarSocialServiceFundingPurpose(
        social,
        region.locationId,
        service,
      );
      const request = expectedRequests.requests.find(
        (r) => r.purposeId === purpose,
      )!;
      const rows = funding.allocations.filter((a) => a.purposeId === purpose);
      if (rows.length !== 1)
        invalid('exactly one shared operating allocation required');
      const allocation = rows[0]!;
      if (
        allocation.kind !== 'OPERATING' ||
        allocation.countryId !== region.countryId ||
        allocation.locationId !== region.locationId ||
        allocation.currency !== country.currency ||
        allocation.periodDays !== '1' ||
        allocation.payerEntityId !== country.payerEntityId ||
        allocation.accountRef !== country.accountRef ||
        usedFunding.has(allocation.fundingRef)
      )
        invalid('shared operating budget scope/reuse differs');
      usedFunding.add(allocation.fundingRef);
      // Funding reservation rounds upward to cents; compare its exact original request.
      const cents = parseWorldDecimal(request.amount)
        .times('100')
        .ceil()
        .dividedBy('100');
      if (
        !parseWorldDecimal(allocation.requestedReservationAmount).equals(cents)
      )
        invalid('operating request reservation differs');
      const assetId =
        service === 'EDUCATION' ? region.schoolAssetId : region.hospitalAssetId;
      const kind = service === 'EDUCATION' ? 'BASIC_EDUCATION' : 'HOSPITAL';
      const grants = utilityPlan.grants.filter(
        (g) =>
          g.countryId === region.countryId &&
          g.locationId === region.locationId &&
          g.kind === kind,
      );
      if (
        grants.length !== 2 ||
        new Set(grants.map((g) => g.utility)).size !== 2
      )
        invalid('both finite utility grants required');
      let tariff = parseWorldDecimal('0');
      for (const grant of grants) {
        if (
          grant.serviceAssetId !== assetId ||
          grant.operatingPurposeId !== purpose ||
          grant.operatingFundingBasis !==
            'EXISTING_SOCIAL_NON_PAYROLL_OPERATING_ALLOCATION_NO_EXTRA_GRANT'
        )
          invalid('utility purpose/asset binding differs');
        const utilityRequest = utilities.requests.find(
          (r) => r.requestId === grant.requestId,
        );
        if (
          !utilityRequest ||
          utilityRequest.count !==
            (service === 'EDUCATION'
              ? region.studentCohorts
                  .reduce((sum, c) => sum + whole(c.desiredEnrollment), 0n)
                  .toString()
              : region.healthcare.newDemand)
        )
          invalid('utility demand binding differs');
        const count = whole(grant.actualOperationalCount);
        if (count > 0n)
          tariff = tariff.plus(
            parseWorldDecimal(grant.operatingCostGcu).dividedBy(
              count.toString(),
            ),
          );
        else {
          if (!parseWorldDecimal(grant.operatingCostGcu).isZero())
            invalid('zero operational utility with positive cost');
          tariff = tariff.plus(
            parseWorldDecimal(grant.recipeAmount).times(
              grant.utility === 'POWER' ? '80' : '0.02',
            ),
          );
        }
      }
      const unitCost = canonicalDecimal(
        parseWorldDecimal(
          service === 'EDUCATION'
            ? prices.educationUnitCost
            : prices.healthcareUnitCost,
        ).plus(tariff.times(country.localCurrencyPerGcu)),
      );
      const water = grants.find((g) => g.utility === 'WATER')!,
        power = grants.find((g) => g.utility === 'POWER')!;
      const supplyKind =
        service === 'EDUCATION' ? 'SCHOOL_MATERIALS' : 'MEDICINE';
      const stock = supplies.stocks.filter(
        (s) =>
          s.kind === supplyKind &&
          s.countryId === region.countryId &&
          s.locationId === region.locationId &&
          s.serviceAssetId === assetId,
      );
      if (
        stock.length !== 1 ||
        stock[0]!.entry.account.titleHolderId !== country.payerEntityId
      )
        invalid('same GOV finite service stock required');
      const entry = stock[0]!;
      const supplyGrants = supplyPlan.grants.filter(
        (g) =>
          g.entryId === entry.entry.entryId &&
          g.consumerRef === assetId &&
          g.serviceAssetId === assetId,
      );
      let supply = 0n;
      for (const grant of supplyGrants) {
        if (
          usedGrants.has(grant.allocationId) ||
          grant.worldId !== social.worldId ||
          grant.sourceId !== supplies.source.sourceId ||
          grant.countryId !== region.countryId ||
          grant.locationId !== region.locationId ||
          grant.unit !==
            (service === 'EDUCATION'
              ? 'student_day_material'
              : 'medical_dose') ||
          grant.commodityId !== entry.entry.account.commodityId
        )
          invalid('finite first-day supply grant scope/reuse differs');
        usedGrants.add(grant.allocationId);
        supply += whole(grant.quantity);
      }
      // Never convert the entire multi-day reserve stock into one day of supply.
      supply = min(supply, whole(entry.dailyBasis));
      return {
        allocation,
        unitCost,
        supply,
        water: whole(water.actualOperationalCount),
        power: whole(power.actualOperationalCount),
      };
    };
    const edu = scope('EDUCATION'),
      care = scope('HOSPITAL');
    const equipment = policy.equipment;
    const recovery =
      BigInt(equipment.undisruptedAvailableBps) -
      whole(region.disruptionBps) / BigInt(equipment.disruptionPenaltyDivisor);
    const equipmentBps =
      recovery < BigInt(equipment.minimumAvailableBps)
        ? BigInt(equipment.minimumAvailableBps)
        : recovery;
    const equipmentEpisodes =
      (whole(region.sourceHospitalBeds) *
        BigInt(equipment.maximumEpisodesPerPhysicalBedSimDay) *
        equipmentBps) /
      10000n;
    const totals = countryTotals.get(region.countryId) ?? {
      countryId: region.countryId,
      currency: country.currency,
      sourceRef: `POSTWAR_SHARED_FUNDING_${funding.fingerprint}`,
      educationAmount: '0',
      healthcareAmount: '0',
    };
    totals.educationAmount = canonicalDecimal(
      parseWorldDecimal(totals.educationAmount).plus(edu.allocation.amount),
    );
    totals.healthcareAmount = canonicalDecimal(
      parseWorldDecimal(totals.healthcareAmount).plus(care.allocation.amount),
    );
    countryTotals.set(region.countryId, totals);
    return {
      countryId: region.countryId,
      locationId: region.locationId,
      currency: country.currency,
      sourceRef: canonicalSerialize({
        funding: funding.fingerprint,
        supplies: supplyPlan.fingerprint,
        utilities: utilityPlan.fingerprint,
        equipmentPolicy: POSTWAR_SOCIAL_SUPPORT_POLICY_SHA256,
      }),
      educationBudgetRef: edu.allocation.fundingRef,
      educationBudgetAvailable: edu.allocation.amount,
      educationUnitCost: edu.unitCost,
      educationMaterialSeats: min(edu.supply, edu.water, edu.power).toString(),
      healthcareBudgetRef: care.allocation.fundingRef,
      healthcareBudgetAvailable: care.allocation.amount,
      healthcareUnitCost: care.unitCost,
      medicineDoses: care.supply.toString(),
      equipmentEpisodes: equipmentEpisodes.toString(),
      waterEpisodes: care.water.toString(),
      powerEpisodes: care.power.toString(),
      costProvenance: 'GENERATED_POLICY' as const,
    };
  });
  return finalizePostwarSocialServiceGenesis({
    prepared: social,
    filledPositions: labour.positions,
    support,
    countryBudgets: [...countryTotals.values()],
  });
}
