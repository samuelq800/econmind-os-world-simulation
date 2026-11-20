import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalSerialize, parseWorldDecimal } from '@econmind/core';
import { loadPostwarSourceContext } from '../../apps/world-worker/src/preparation/postwar-source-context.js';
import { preparePostwarSocialServiceGenesis } from '../../apps/world-worker/src/preparation/postwar-social-service-genesis.js';
import {
  createPostwarUtilityInputs,
  allocatePostwarUtilityInputs,
  consumePostwarUtilityInputs,
  consumePostwarUtilityAllocation,
  POSTWAR_UTILITY_POLICY_PATH,
  type UtilityRational,
} from '../../apps/world-worker/src/preparation/postwar-utility-inputs.js';

const root = path.resolve(import.meta.dirname, '../..');
const context = await loadPostwarSourceContext(root);
const worldId = 'WORLD_POSTWAR_UTILITY_TEST',
  seedId = 'SEED_POSTWAR_UTILITY_TEST';
const social = preparePostwarSocialServiceGenesis({
  adoption: context.labourSocial,
  mappingBytes: context.mappingBytes,
  regionsBytes: context.regionsBytes,
  worldId,
  seedId,
});
const input = {
  sourceBytes: context.sourceBytes,
  ownerDecisionBytes: context.ownerOriginalBytes,
  adoption: context.labourSocial,
  social,
  worldId,
  seedId,
  openingGregorianTimestamp: '2026-10-28T00:00:00.000Z',
  policyBytes: await readFile(
    path.join(root, POSTWAR_UTILITY_POLICY_PATH),
    'utf8',
  ),
};
const utilities = createPostwarUtilityInputs(input);
const allocation = allocatePostwarUtilityInputs(utilities);
const d = parseWorldDecimal;
const rawRows = (name: string) =>
  JSON.parse(
    context.sourceBytes.datasets[`data/${name}.json`]!,
    (_key, value, context) =>
      typeof value === 'number' ? context.source : value,
  ) as Record<string, unknown>[];
const equalSum = (a: UtilityRational, b: UtilityRational, total: string) =>
  expect(
    BigInt(a.numerator) * BigInt(b.denominator) +
      BigInt(b.numerator) * BigInt(a.denominator),
  ).toBe(
    (BigInt(total.replace('.', '')) *
      BigInt(a.denominator) *
      BigInt(b.denominator)) /
      10n ** BigInt(total.split('.')[1]?.length ?? 0),
  );

describe('finite selected-source public utility constraints', () => {
  it('binds all 70 existing storage assets and 122 local raw-water accounts, preserving OP/GOV scope and source hashes', () => {
    expect(utilities.accounts).toHaveLength(192);
    expect(allocation.regions).toHaveLength(122);
    expect(utilities.requests).toHaveLength(488);
    expect(new Set(utilities.accounts.map((row) => row.accountRef)).size).toBe(
      192,
    );
    const powers = rawRows('power');
    const facilities = rawRows('facilities');
    for (const account of utilities.accounts) {
      expect(account.validity).toEqual({
        fromSimulationTicks: '0',
        untilSimulationTicks: '86400000',
      });
      expect(
        account.sourceReferences.every(
          (ref) =>
            /^[a-f0-9]{64}$/u.test(ref.sha256) && ref.pointer.startsWith('/'),
        ),
      ).toBe(true);
      expect(account.beneficiaryId).toBe(
        context.labourSocial.employers.find(
          (row) => row.countryId === account.countryId && row.role === 'GOV',
        )!.employerId,
      );
      if (account.utility === 'POWER') {
        expect(account.ownerId).toBe(
          context.labourSocial.employers.find(
            (row) => row.countryId === account.countryId && row.role === 'OP',
          )!.employerId,
        );
        const facility = facilities.find(
          (row) => row.id === account.physicalObjectId,
        )!;
        expect(facility.projectId).toBe('PROJECT-13');
        expect(facility.capacityUnit).toBe('MWh');
        expect(facility.scenarioRole).toBe('OPENING_PORTFOLIO');
        const power = powers.find(
          (row) => row.countryId === facility.countryId,
        )!;
        expect(account.basis.initialStoredEnergyMWh).toBe(
          d(String(power.storageMWh))
            .mul(String(power.openingStateOfChargeFraction))
            .toFixed(),
        );
        expect(account.basis.energyCapacityMWh).toBe(facility.capacity);
        expect(account.basis.generatedOrChargedEnergyMWh).toBe('0');
        expect(account.basis.maximumDischargeHours).toBe('6');
        expect(account.basis.purchaseCondition).toBe(
          'PAYMENT_AND_AUTHORIZED_DISCHARGE_BEFORE_ANY_DELIVERY',
        );
        expect(
          d(account.availableAmount).lte(
            d(String(account.basis.initialStoredEnergyMWh))
              .mul('0.1')
              .mul('0.85'),
          ),
        ).toBe(true);
      } else {
        expect(account.ownerId).toBe(account.beneficiaryId);
        expect(account.basis.originalRightRefs).toHaveLength(3);
      }
    }
  });

  it('keeps one shared basin ceiling after ecology and all original quotas, without reusing household domestic rights', () => {
    expect(utilities.calendar).toEqual({ month: '10', daysInMonth: '31' });
    expect(utilities.preservedWaterConflicts.length).toBeGreaterThan(0);
    const basins = new Set(
      utilities.accounts
        .filter((row) => row.utility === 'WATER')
        .map((row) => row.basinRef),
    );
    for (const basinRef of basins) {
      const members = utilities.accounts.filter(
        (row) => row.basinRef === basinRef,
      );
      const original = members[0]!.basis
        .basinOriginalQuotaPerDayM3 as UtilityRational;
      const monthly = members[0]!.basis
        .basinMonthlyAfterEcologyM3 as UtilityRational;
      const budget = members[0]!.basis
        .basinUnallocatedPerDayM3 as UtilityRational;
      const amount = members.reduce(
        (sum, row) => sum.add(row.availableAmount),
        d('0'),
      );
      expect(amount.mul(budget.denominator).lte(budget.numerator)).toBe(true);
      if (BigInt(budget.numerator) > 0n)
        expect(
          amount
            .add(d(original.numerator).div(original.denominator))
            .mul('31')
            .lte(d(monthly.numerator).div(monthly.denominator)),
        ).toBe(true);
      for (const account of members) {
        const local = account.basis.localSourceHeadroomM3 as UtilityRational;
        expect(
          d(account.availableAmount)
            .mul(local.denominator)
            .lte(local.numerator),
        ).toBe(true);
        expect(account.authority).toBe(
          'GENERATED_GOV_RAW_WATER_RIGHT_FROM_UNALLOCATED_LOCAL_SURPLUS',
        );
        expect(account.basis.deliveryStatus).toBe(
          'GENERATED_LIMITED_LOCAL_TREATMENT_AVAILABLE_ACTUAL_DELIVERY_ZERO',
        );
      }
    }
  });

  it('reserves finite recipe amounts once globally and conserves stored source energy as exact rationals', () => {
    expect(allocation.grants).toHaveLength(488);
    expect(
      allocation.grants.some((row) => BigInt(row.potentialCount) > 0n),
    ).toBe(true);
    for (const account of allocation.accounts) {
      const grants = allocation.grants.filter(
        (row) => row.accountRef === account.accountRef,
      );
      const used = grants.reduce(
        (sum, row) => sum.add(row.reservedPhysicalAmount),
        d('0'),
      );
      expect(used.toFixed()).toBe(account.reservedAmount);
      expect(used.add(account.remainingAmount).toFixed()).toBe(
        account.availableAmount,
      );
      expect(used.lte(account.availableAmount)).toBe(true);
      for (const grant of grants) {
        expect(
          d(grant.potentialCount)
            .mul(grant.recipeAmount)
            .eq(grant.reservedPhysicalAmount),
        ).toBe(true);
        expect(BigInt(grant.potentialCount) <= BigInt(grant.count)).toBe(true);
      }
      if (account.utility === 'POWER') {
        const basis = utilities.accounts.find(
          (row) => row.accountRef === account.accountRef,
        )!.basis;
        const reserved = account.sourceEnergyReservedMWh!,
          left = account.sourceEnergyUnreservedMWh!,
          cap = basis.publicOptionSourceEnergyMWh as UtilityRational;
        equalSum(reserved, left, String(basis.initialStoredEnergyMWh));
        expect(
          BigInt(reserved.numerator) * BigInt(cap.denominator) <=
            BigInt(cap.numerator) * BigInt(reserved.denominator),
        ).toBe(true);
      }
    }
  });

  it('generates bounded source-differentiated initial capacity while delivery and payment history remain zero', () => {
    expect(utilities).toMatchObject({
      actualWaterDelivered: '0',
      actualPowerDelivered: '0',
      paymentsCreated: false,
      sourceAdmitted: false,
    });
    expect(allocation.actualDelivered).toBe('0');
    for (const grant of allocation.grants) {
      const profile = utilities.initialAvailability.find(
        (row) => row.locationId === grant.locationId,
      )!;
      const expected =
        grant.utility === 'POWER'
          ? (BigInt(grant.potentialCount) *
              BigInt(profile.powerConnectionBps)) /
            10000n
          : (BigInt(grant.potentialCount) *
              BigInt(profile.waterTreatmentBps) *
              BigInt(profile.qualityCompliantShareBps)) /
            100000000n;
      expect(grant.actualOperationalCount).toBe(expected.toString());
      expect(
        BigInt(grant.actualOperationalCount) <= BigInt(grant.potentialCount),
      ).toBe(true);
      expect(
        d(grant.operatingCostGcu).eq(
          d(grant.actualOperationalCount)
            .mul(grant.recipeAmount)
            .mul(grant.utility === 'POWER' ? '80' : '0.02'),
        ),
      ).toBe(true);
      expect(grant.operatingFundingBasis).toBe(
        'EXISTING_SOCIAL_NON_PAYROLL_OPERATING_ALLOCATION_NO_EXTRA_GRANT',
      );
      expect(grant.availabilityClassification).toBe(
        'GENERATED_POLICY_NOT_OBSERVED_NETWORK_OR_WATER_QUALITY',
      );
      expect(grant.actualDelivered).toBe('0');
      expect(grant.blockers.length).toBeGreaterThan(0);
    }
    expect(
      allocation.grants
        .find((row) => row.utility === 'WATER')!
        .blockers.some(
          (row) =>
            row.code ===
            'GENERATED_T0_TREATMENT_CAPACITY_NOT_ACTUAL_WATER_DELIVERY',
        ),
    ).toBe(true);
    expect(utilities.initialAvailability).toHaveLength(122);
    expect(
      new Set(
        utilities.initialAvailability.map((row) => row.powerConnectionBps),
      ).size,
    ).toBeGreaterThan(1);
    expect(
      new Set(
        utilities.initialAvailability.map(
          (row) => row.qualityCompliantShareBps,
        ),
      ).size,
    ).toBeGreaterThan(1);
    expect(
      allocation.regions.some(
        (row) => BigInt(row.operationalWaterEpisodes) > 0n,
      ),
    ).toBe(true);
    expect(
      allocation.regions.some(
        (row) => BigInt(row.operationalPowerEpisodes) > 0n,
      ),
    ).toBe(true);
    for (const profile of utilities.initialAvailability) {
      expect(
        BigInt(profile.powerConnectionBps) >= 2000n &&
          BigInt(profile.powerConnectionBps) <= 8000n,
      ).toBe(true);
      expect(
        BigInt(profile.waterTreatmentBps) >= 1500n &&
          BigInt(profile.waterTreatmentBps) <= 7500n,
      ).toBe(true);
      expect(
        BigInt(profile.qualityCompliantShareBps) >= 3500n &&
          BigInt(profile.qualityCompliantShareBps) <= 9000n,
      ).toBe(true);
    }
    expect(
      allocation.grants
        .find((row) => row.utility === 'POWER')!
        .blockers.some(
          (row) =>
            row.code === 'STORAGE_DISCHARGE_ROUTE_AND_PAYMENT_NOT_EXECUTED',
        ),
    ).toBe(true);
  });

  it('shares each school/hospital operating purpose across water and power rather than creating duplicate budget grants', () => {
    expect(
      new Set(allocation.grants.map((grant) => grant.operatingPurposeId)).size,
    ).toBe(244);
    for (const region of allocation.regions) {
      const grants = allocation.grants.filter(
        (grant) => grant.locationId === region.locationId,
      );
      expect(grants).toHaveLength(4);
      expect(
        new Set(grants.map((grant) => grant.operatingPurposeId)).size,
      ).toBe(2);
      for (const kind of ['BASIC_EDUCATION', 'HOSPITAL'] as const) {
        const sameService = grants.filter((grant) => grant.kind === kind);
        expect(sameService[0]!.operatingPurposeId).toBe(
          sameService[1]!.operatingPurposeId,
        );
      }
    }
  });
  it('rejects duplicate, excess, cross-country and foreign asset/utility requests without debiting another plan', () => {
    const request = utilities.requests[0]!;
    expect(() =>
      allocatePostwarUtilityInputs(utilities, [request, request]),
    ).toThrow('Duplicate');
    expect(() =>
      allocatePostwarUtilityInputs(utilities, [
        { ...request, count: (BigInt(request.count) + 1n).toString() },
      ]),
    ).toThrow('exceeds');
    expect(() =>
      allocatePostwarUtilityInputs(utilities, [
        { ...request, countryId: 'COUNTRY_70' },
      ]),
    ).toThrow('Foreign');
    expect(() =>
      allocatePostwarUtilityInputs(utilities, [
        { ...request, serviceAssetId: 'UNRELATED_SERVICE' },
      ]),
    ).toThrow('Foreign');
    expect(() =>
      allocatePostwarUtilityInputs(utilities, [
        {
          ...request,
          utility: request.utility === 'POWER' ? 'WATER' : 'POWER',
        },
      ]),
    ).toThrow('Foreign');
    expect(() => consumePostwarUtilityInputs({ ...utilities })).toThrow(
      'Issued',
    );
    expect(() => consumePostwarUtilityAllocation({ ...allocation })).toThrow(
      'Issued',
    );
    expect(
      allocatePostwarUtilityInputs(
        utilities,
        [...utilities.requests].reverse(),
      ),
    ).toEqual(allocation);
    expect(JSON.parse(canonicalSerialize(allocation))).toEqual(
      JSON.parse(JSON.stringify(allocation)),
    );
  });

  it('uses actual Gregorian leap-month days and rejects mixed World/seed, altered policy or source data', () => {
    const leap = createPostwarUtilityInputs({
      ...input,
      openingGregorianTimestamp: '2028-02-01T00:00:00.000Z',
    });
    expect(leap.calendar).toEqual({ month: '2', daysInMonth: '29' });
    expect(leap.sourceFingerprint).not.toBe(utilities.sourceFingerprint);
    expect(() =>
      createPostwarUtilityInputs({ ...input, worldId: 'WORLD_OTHER' }),
    ).toThrow('Mixed');
    expect(() =>
      createPostwarUtilityInputs({ ...input, seedId: 'SEED_OTHER' }),
    ).toThrow('Mixed');
    expect(() =>
      createPostwarUtilityInputs({
        ...input,
        policyBytes: input.policyBytes + '\n',
      }),
    ).toThrow('Pinned');
    expect(() =>
      createPostwarUtilityInputs({
        ...input,
        sourceBytes: {
          ...context.sourceBytes,
          datasets: {
            ...context.sourceBytes.datasets,
            'data/power.json': '[]',
          },
        },
      }),
    ).toThrow();
  });
});
