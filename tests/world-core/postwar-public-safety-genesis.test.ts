import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseWorldDecimal } from '@econmind/core';
import {
  inspectOfficialOpeningDecisionSource,
  type OfficialOpeningSourceBytes,
} from '../../apps/world-worker/src/preparation/official-opening-decision-reconciliation.js';
import { createOfficialLabourSocialOpeningAdoption } from '../../apps/world-worker/src/preparation/official-labour-social-opening-adoption.js';
import { preparePostwarSocialServiceGenesis } from '../../apps/world-worker/src/preparation/postwar-social-service-genesis.js';
import { preparePostwarLabourGenesis } from '../../apps/world-worker/src/preparation/postwar-labour-genesis.js';
import { createPostwarMonetaryGenesis } from '../../apps/world-worker/src/preparation/postwar-monetary-genesis.js';
import {
  createPostwarWagePolicy,
  POSTWAR_WAGE_POLICY_PATH,
} from '../../apps/world-worker/src/preparation/postwar-wage-policy.js';
import { loadOwnerNonHostSourceAdoption } from '../../apps/world-worker/src/preparation/owner-non-host-source-adoption.js';
import { createPostwarFinancialGenesis } from '../../apps/world-worker/src/preparation/postwar-financial-genesis.js';
import { createPostwarFundingGenesis } from '../../apps/world-worker/src/preparation/postwar-funding-genesis.js';
import {
  createPostwarPublicSafetyGenesis,
  finalizePostwarPublicSafetyGenesis,
  createPostwarPublicSafetyFundingRequests,
  consumePostwarPublicSafetyGenesis,
  postwarIncidentCaseId,
  type PostwarPublicSafetyFundingInput,
} from '../../apps/world-worker/src/preparation/postwar-public-safety-genesis.js';

// Actual selected 70-country/122-region inputs and genuine shared constructors.
// Funding below is explicit TEST_ONLY server reservations, not a production grant.
const root = path.resolve(import.meta.dirname, '../..');
const read = (relative: string) => readFile(path.join(root, relative), 'utf8');
const mappingBytes = await read(
  'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
);
const mapping = JSON.parse(mappingBytes) as {
  source: { dataFiles: Record<string, unknown> };
};
const sourceBytes: OfficialOpeningSourceBytes = {
  mappingBytes,
  checksumsBytes: await read(
    'artifacts/world-balanced-candidate-v1/CHECKSUMS.json',
  ),
  coverageBytes: await read(
    'docs/reports/world-connection/C_OFFICIAL_WORLD_COMPLETE_COVERAGE.json',
  ),
  proposalBytes: await read(
    'artifacts/E_OPENING_SEMANTIC_MAPPING_PROPOSAL_2026_10_07.md',
  ),
  datasets: Object.fromEntries(
    await Promise.all(
      Object.keys(mapping.source.dataFiles).map(async (name) => [
        name,
        await read(`artifacts/world-balanced-candidate-v1/${name}`),
      ]),
    ),
  ),
};
const inspection = inspectOfficialOpeningDecisionSource(sourceBytes);
if (!inspection.source) throw new Error(JSON.stringify(inspection.blockers));
const source = inspection.source;
const adoption = createOfficialLabourSocialOpeningAdoption({
  source,
  mappingBytes,
  ownerOriginalBytes: await read(
    'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md',
  ),
  ownerReceiptBytes: await read(
    'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json',
  ),
  datasets: {
    employment: sourceBytes.datasets['data/employment.json']!,
    'population-services':
      sourceBytes.datasets['data/population-services.json']!,
    regions: sourceBytes.datasets['data/regions.json']!,
    facilities: sourceBytes.datasets['data/facilities.json']!,
  },
});
const input = {
  source,
  adoption,
  mappingBytes,
  countriesBytes: sourceBytes.datasets['data/countries.json']!,
  regionsBytes: sourceBytes.datasets['data/regions.json']!,
  policyBytes: await read('config/postwar-genesis/public-safety.v1.json'),
  worldId: 'WORLD_POSTWAR_SAFETY_TEST',
  seed: 'POSTWAR_SAFETY_SEED_01',
};
const genesis = createPostwarPublicSafetyGenesis(input);
const social = preparePostwarSocialServiceGenesis({
  adoption,
  mappingBytes,
  regionsBytes: input.regionsBytes,
  worldId: input.worldId,
  seedId: input.seed,
});
const labour = preparePostwarLabourGenesis({
  adoption,
  mappingBytes,
  regionsBytes: input.regionsBytes,
  facilitiesBytes: sourceBytes.datasets['data/facilities.json']!,
  serviceDemands: [...social.demands, ...genesis.demands],
});
const monetary = createPostwarMonetaryGenesis({
  source,
  countriesBytes: input.countriesBytes,
  mappingBytes,
  valueDate: '2026-10-28',
});
const wages = createPostwarWagePolicy({
  policyBytes: await read(POSTWAR_WAGE_POLICY_PATH),
  adoption,
  financeSource: source,
  labourPreparation: labour,
  monetaryBindings: monetary.bindings,
});
const finalizeInput = { genesis, labour, social, wages };
const emptyFunding = { balances: [], allocations: [] };
const unfunded = finalizePostwarPublicSafetyGenesis({
  ...finalizeInput,
  funding: emptyFunding,
});
const countryId = 'COUNTRY_01';
const countryWage = wages.countries.find(
  (country) => country.countryId === countryId,
)!;
const financeIndex = source.financeOriginals.findIndex(
  (entry) => entry.countryId === countryWage.sourceCountryId,
);
const balance = {
  countryId,
  payerEntityId: adoption.employers.find(
    (employer) => employer.countryId === countryId && employer.role === 'GOV',
  )!.employerId,
  accountRef: 'TEST_ONLY_EXISTING_GOV_ACCOUNT_01',
  currency: countryWage.currency,
  availableAmount: parseWorldDecimal(
    String(source.financeOriginals[financeIndex]!.treasuryCentralBankBalance),
  )
    .mul(countryWage.localCurrencyPerGcu)
    .toDecimalPlaces(6, 1)
    .toFixed(6),
  sourceBalanceRef: `data/finance.json#/${financeIndex}/treasuryCentralBankBalance`,
};
const programme = unfunded.programmes.find(
  (programme) =>
    programme.countryId === countryId &&
    programme.programmeType === 'UNEMPLOYMENT_INSURANCE',
)!;
const regionalPositions = unfunded.staffing.filter(
  (position) => position.locationId === programme.locationId,
);
const allocations: PostwarPublicSafetyFundingInput['allocations'][number][] =
  regionalPositions.map((position) => ({
    ...balance,
    purposeId: position.positionId,
    fundingRef: `TEST_ONLY_${position.positionId}`,
    period: 'SIM_DAY' as const,
    amount: parseWorldDecimal(position.payrollPerPersonPerSimDay)
      .mul(position.filledCount)
      .toFixed(6),
  }));
allocations.push({
  ...balance,
  purposeId: programme.programmeId,
  fundingRef: `TEST_ONLY_${programme.programmeId}`,
  period: 'SIM_30_DAYS',
  amount: parseWorldDecimal(programme.benefitAmount).mul('100').toFixed(6),
});
const funding: PostwarPublicSafetyFundingInput = {
  balances: [balance],
  allocations,
};
const funded = finalizePostwarPublicSafetyGenesis({
  ...finalizeInput,
  funding,
});
const total = (values: readonly string[]) =>
  values.reduce((sum, value) => sum + BigInt(value), 0n);

describe('generated postwar police and welfare genesis from actual selected sources', () => {
  it('builds bounded nonempty queues, six lawful police functions and nine welfare programmes for all regions', () => {
    expect(genesis.regions).toHaveLength(122);
    expect(genesis.incidents).toHaveLength(732);
    expect(genesis.programmes).toHaveLength(1098);
    expect(genesis.demands).toHaveLength(1342);
    expect(
      new Set(genesis.regions.map((region) => region.lineage.countryId)).size,
    ).toBe(70);
    expect(
      genesis.incidents.every(
        (cohort) =>
          BigInt(cohort.count) > 0n &&
          cohort.status === 'OPEN' &&
          cohort.resolvedCases === '0',
      ),
    ).toBe(true);
    expect(
      genesis.programmes.every(
        (programme) =>
          BigInt(programme.eligible) > 0n &&
          BigInt(programme.applied) > 0n &&
          programme.paid === '0',
      ),
    ).toBe(true);
    expect(
      new Set(genesis.positions.map((position) => position.function)).size,
    ).toBe(7);
    expect(genesis.summary).toMatchObject({
      countries: 70,
      regions: 122,
      paid: '0',
    });
    expect(
      genesis.regions[0]!.sourceReferences.find(
        (reference) => reference.namespace === 'GENERATED_POLICY',
      ),
    ).toMatchObject({ pointer: '', sha256: genesis.policySHA256 });
    expect(genesis.generatedPaymentOrHiringEvents).toBe(false);
    expect(genesis.runtimeAdmitted).toBe(false);
  });

  it('preserves country variation, exact population, source otherDomesticServices and shared skill-pool person ranges', () => {
    expect(
      new Set(genesis.regions.map((region) => region.pressureBps)).size,
    ).toBeGreaterThan(30);
    const policy = JSON.parse(input.policyBytes);
    expect(policy).not.toHaveProperty('populationLossPressureBps');
    const sourceCountries = JSON.parse(input.countriesBytes) as {
      id: string;
      stockBufferDays: number;
    }[];
    for (const region of genesis.regions) {
      const sourceCountry = sourceCountries.find(
        (country) => country.id === region.lineage.sourceCountryId,
      )!;
      const reference = parseWorldDecimal(policy.stockBufferReferenceDays);
      const buffer = parseWorldDecimal(String(sourceCountry.stockBufferDays));
      const expectedStress = buffer.greaterThanOrEqualTo(reference)
        ? '0'
        : reference
            .minus(buffer)
            .mul('10000')
            .div(reference)
            .floor()
            .toFixed(0);
      expect(region.stockBufferStressBps).toBe(expectedStress);
      expect(
        region.sourceReferences.some(
          (reference) =>
            reference.path === 'data/countries.json' &&
            reference.pointer.endsWith('/stockBufferDays'),
        ),
      ).toBe(true);
    }
    for (const country of adoption.employmentTargets) {
      const positions = genesis.demands.filter(
        (position) => position.countryId === country.countryId,
      );
      expect(
        total(positions.map((position) => position.requiredCount)),
      ).toBeLessThanOrEqual(
        (BigInt(country.otherDomesticServices) * 200n) / 10000n,
      );
      expect(
        positions.every(
          (position) =>
            position.sourceBucket === 'OTHER_DOMESTIC_SERVICES' &&
            position.owner === 'PUBLIC_SERVICE' &&
            position.occupation === 'GENERAL' &&
            position.employerRole === 'GOV',
        ),
      ).toBe(true);
      const actual = labour.countries.find(
        (entry) => entry.countryId === country.countryId,
      )!;
      expect(actual.employed).toBe(country.employed);
      expect(actual.unemployed).toBe(country.unemployed);
      expect(
        BigInt(actual.ordinaryServiceEmployment) +
          BigInt(actual.publicServiceFromDomesticServices),
      ).toBe(BigInt(country.otherDomesticServices));
    }
    const pools = new Map<string, { start: bigint; end: bigint }[]>();
    for (const position of labour.positions) {
      const start = BigInt(position.personRange.startOrdinal),
        end = start + BigInt(position.personRange.count);
      const ranges = pools.get(position.personRange.poolId) ?? [];
      if (end > start) ranges.push({ start, end });
      pools.set(position.personRange.poolId, ranges);
    }
    for (const ranges of pools.values()) {
      ranges.sort((a, b) =>
        a.start < b.start ? -1 : a.start > b.start ? 1 : 0,
      );
      for (let i = 1; i < ranges.length; i++)
        expect(ranges[i]!.start).toBeGreaterThanOrEqual(ranges[i - 1]!.end);
    }
  });

  it('retries with stable IDs and bounded ordinal case expansion while world, seed or policy changes change identities', () => {
    expect(createPostwarPublicSafetyGenesis(input).fingerprint).toBe(
      genesis.fingerprint,
    );
    expect(
      createPostwarPublicSafetyGenesis({
        ...input,
        seed: 'POSTWAR_SAFETY_SEED_02',
      }).incidents[0]!.cohortId,
    ).not.toBe(genesis.incidents[0]!.cohortId);
    expect(
      createPostwarPublicSafetyGenesis({
        ...input,
        worldId: 'WORLD_POSTWAR_SAFETY_02',
      }).demands[0]!.positionId,
    ).not.toBe(genesis.demands[0]!.positionId);
    const cohort = genesis.incidents[0]!;
    expect(postwarIncidentCaseId(genesis, cohort.cohortId, '0')).toBe(
      postwarIncidentCaseId(genesis, cohort.cohortId, '0'),
    );
    expect(postwarIncidentCaseId(genesis, cohort.cohortId, '1')).not.toBe(
      postwarIncidentCaseId(genesis, cohort.cohortId, '0'),
    );
    expect(() =>
      postwarIncidentCaseId(genesis, cohort.cohortId, cohort.count),
    ).toThrow('outside cohort');
    expect(() =>
      postwarIncidentCaseId({ ...genesis }, cohort.cohortId, '0'),
    ).toThrow('Constructor-owned');
    expect(Object.isFrozen(genesis.incidents[0]!.populationLineage)).toBe(true);
  });

  it('keeps unstaffed or unfunded agencies unavailable despite nonzero demands, open cases and eligibility', () => {
    expect(
      unfunded.staffing.every(
        (position) =>
          BigInt(position.filledCount) > 0n &&
          position.availableCount === '0' &&
          position.fundedCount === '0',
      ),
    ).toBe(true);
    expect(
      unfunded.deploymentCapacity.every(
        (region) =>
          region.state === 'UNAVAILABLE' &&
          region.potentialCaseEffortPerSimDay === '0',
      ),
    ).toBe(true);
    expect(
      unfunded.programmes.every(
        (programme) =>
          programme.approved === '0' &&
          programme.scheduled === '0' &&
          programme.paid === '0' &&
          programme.status === 'AWAITING_ADMINISTRATION',
      ),
    ).toBe(true);
    expect(
      unfunded.incidents.every(
        (incident) =>
          incident.resolvedCases === '0' &&
          incident.responseTimeSimDays === null,
      ),
    ).toBe(true);
  });

  it('rebinds final welfare to actual shared unemployed/children/elderly cohorts rather than adding people', () => {
    for (const programme of unfunded.programmes) {
      const actual = labour.regions.find(
        (region) => region.locationId === programme.locationId,
      )!;
      const age = social.regions.find(
        (region) => region.locationId === programme.locationId,
      )!.demography;
      expect(programme.populationLineage.regionUnemployed).toBe(
        actual.unemployed,
      );
      expect(programme.populationLineage.unemploymentBinding).toBe(
        'SHARED_LABOUR_FINALIZED_PARTITION',
      );
      const limit =
        programme.programmeType === 'PENSION'
          ? age.elderly
          : programme.programmeType === 'FAMILY_CHILD_SUPPORT'
            ? age.children
            : programme.programmeType === 'UNEMPLOYMENT_INSURANCE'
              ? actual.unemployed
              : actual.population;
      expect(BigInt(programme.eligible)).toBeLessThanOrEqual(BigInt(limit));
      expect(BigInt(programme.applied)).toBeLessThanOrEqual(
        BigInt(programme.eligible),
      );
      expect(programme.populationAccounting).toBe(
        'PROGRAMME_ELIGIBILITY_MAY_OVERLAP_NOT_UNIQUE_PEOPLE',
      );
    }
  });

  it('uses only actual filled/funded staff, reduces capacity without equipment, and schedules benefits without inventing payment history', () => {
    const region = funded.deploymentCapacity.find(
      (region) => region.locationId === programme.locationId,
    )!;
    expect(region.state).toBe('LIMITED_FOOT_SERVICE');
    expect(BigInt(region.potentialCaseEffortPerSimDay)).toBeGreaterThan(0n);
    expect(region.fullEquipmentReady).toBe(false);
    for (const position of funded.staffing.filter(
      (position) => position.locationId === programme.locationId,
    )) {
      expect(position.fundedCount).toBe(position.filledCount);
      expect(position.payrollCoverageSimDays).toBe('1');
      expect(position.equipmentReady).toBe(false);
      expect(
        BigInt(position.availableCount) +
          BigInt(position.unavailableCount) +
          BigInt(position.deployedCount),
      ).toBe(BigInt(position.filledCount));
    }
    const benefit = funded.programmes.find(
      (entry) => entry.programmeId === programme.programmeId,
    )!;
    expect(benefit.approved).toBe('100');
    expect(benefit.scheduled).toBe('100');
    expect(benefit.paid).toBe('0');
    expect(benefit.delayedRecipients).toBe('0');
    expect(benefit.actualPaidCost).toBe('0');
    expect(benefit.status).toBe('SCHEDULED_UNPAID');
    expect(benefit.dueSimDay).toBe('30');
    expect(benefit.initialObligationId).toMatch(/^PW_OBLIGATION_/u);
    expect(funded.paymentEventsGenerated).toBe(false);
    expect(funded.moneyCreated).toBe(false);
    expect(consumePostwarPublicSafetyGenesis(funded)).toBe(funded);
    expect(
      finalizePostwarPublicSafetyGenesis({ ...finalizeInput, funding })
        .fingerprint,
    ).toBe(funded.fingerprint);
  });

  it('requests only programme welfare funds while global position payroll is not reserved again', () => {
    const requests = createPostwarPublicSafetyFundingRequests(finalizeInput);
    expect(requests).toHaveLength(1098);
    expect(
      requests.every(
        (request) =>
          request.kind === 'WELFARE' &&
          request.requestId === request.purposeId &&
          request.periodDays === '30',
      ),
    ).toBe(true);
    expect(
      requests.every(
        (request) =>
          !genesis.demands.some(
            (position) => position.positionId === request.purposeId,
          ),
      ),
    ).toBe(true);
    expect(
      requests.find((request) => request.purposeId === programme.programmeId)
        ?.amount,
    ).toBe(
      parseWorldDecimal(programme.benefitAmount)
        .mul(programme.applied)
        .toFixed(),
    );
  });

  it('connects actual shared global payroll and welfare reservations without a second office cash pot', async () => {
    const owner = await loadOwnerNonHostSourceAdoption({
      repositoryRoot: root,
      ownerDocumentPath: path.join(
        root,
        'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md',
      ),
      rootReceiptPath: path.join(
        root,
        'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json',
      ),
      scope: { environment: 'NON_ACTIVATED_PREPARATION', worldId: null },
    });
    const financial = createPostwarFinancialGenesis({
      adoption: owner,
      monetary,
      worldId: input.worldId,
      seedId: 'SEED_POSTWAR_SAFETY_TEST',
      sourceId: 'SOURCE_POSTWAR_SAFETY_TEST',
      genesisVersion: 'POSTWAR_SAFETY_TEST_V1',
    });
    const global = createPostwarFundingGenesis({
      source,
      openingSeed: financial.baselineSeed,
      monetary,
      labourPreparation: labour,
      wages,
      publicRequests: createPostwarPublicSafetyFundingRequests(finalizeInput),
    });
    const purposes = new Set([
      ...genesis.demands.map((position) => position.positionId),
      ...genesis.programmes.map((programme) => programme.programmeId),
    ]);
    const result = finalizePostwarPublicSafetyGenesis({
      ...finalizeInput,
      funding: {
        balances: global.balances.filter(
          (account) => account.payerRole === 'GOV',
        ),
        allocations: global.allocations.filter((allocation) =>
          purposes.has(allocation.purposeId),
        ),
      },
    });
    expect(
      result.staffing.every(
        (position) =>
          position.fundedCount === position.filledCount &&
          position.payrollCoverageSimDays === '1',
      ),
    ).toBe(true);
    expect(
      result.programmes.some((programme) => BigInt(programme.scheduled) > 0n),
    ).toBe(true);
    expect(
      result.programmes.every(
        (programme) =>
          programme.paid === '0' && programme.actualPaidCost === '0',
      ),
    ).toBe(true);
    for (const account of global.accounts)
      expect(
        parseWorldDecimal(account.reservedAmount).lessThanOrEqualTo(
          account.availableAmount,
        ),
      ).toBe(true);
    expect(global.moneyCreated).toBe(false);
    expect(global.balancesChanged).toBe(false);
    expect(global.paymentsGenerated).toBe(false);
  });

  it('rejects TEST_ONLY wrong GOV/currency, overdraw, duplicated allocations, wrong country and non-genuine constructors', () => {
    expect(() =>
      finalizePostwarPublicSafetyGenesis({
        ...finalizeInput,
        genesis: { ...genesis },
        funding,
      }),
    ).toThrow('Constructor-owned');
    expect(() =>
      finalizePostwarPublicSafetyGenesis({
        ...finalizeInput,
        labour: { ...labour },
        funding,
      }),
    ).toThrow('preparation');
    expect(() =>
      finalizePostwarPublicSafetyGenesis({
        ...finalizeInput,
        wages: { ...wages },
        funding,
      }),
    ).toThrow('Genuine wage');
    expect(() => consumePostwarPublicSafetyGenesis({ ...funded })).toThrow(
      'Finalizer-owned',
    );
    expect(() =>
      finalizePostwarPublicSafetyGenesis({
        ...finalizeInput,
        funding: {
          ...funding,
          balances: [{ ...balance, payerEntityId: 'ENTITY_OPERATOR_01' }],
        },
      }),
    ).toThrow('same selected GOV');
    expect(() =>
      finalizePostwarPublicSafetyGenesis({
        ...finalizeInput,
        funding: { ...funding, balances: [{ ...balance, currency: 'GCU' }] },
      }),
    ).toThrow('same selected GOV');
    expect(() =>
      finalizePostwarPublicSafetyGenesis({
        ...finalizeInput,
        funding: { ...funding, allocations: [...allocations, allocations[0]!] },
      }),
    ).toThrow('duplicate');
    expect(() =>
      finalizePostwarPublicSafetyGenesis({
        ...finalizeInput,
        funding: {
          ...funding,
          allocations: [
            {
              ...allocations[0]!,
              amount: parseWorldDecimal(balance.availableAmount)
                .plus('1')
                .toFixed(6),
            },
          ],
        },
      }),
    ).toThrow('overdraw');
    expect(() =>
      finalizePostwarPublicSafetyGenesis({
        ...finalizeInput,
        funding: {
          ...funding,
          balances: [
            balance,
            { ...balance, accountRef: 'SECOND_ACCOUNT_SAME_CASH' },
          ],
        },
      }),
    ).toThrow('exceeds existing');
    expect(() =>
      finalizePostwarPublicSafetyGenesis({
        ...finalizeInput,
        funding: {
          ...funding,
          allocations: [
            {
              ...allocations[0]!,
              purposeId: genesis.demands.find(
                (position) => position.countryId !== countryId,
              )!.positionId,
            },
          ],
        },
      }),
    ).toThrow('Cross-country');
  });

  it('rejects modified original source bytes and unversioned or economically invalid generated parameters', () => {
    expect(() =>
      createPostwarPublicSafetyGenesis({
        ...input,
        countriesBytes: input.countriesBytes + '\n',
      }),
    ).toThrow('Source bytes');
    expect(() =>
      createPostwarPublicSafetyGenesis({
        ...input,
        mappingBytes: input.mappingBytes + '\n',
      }),
    ).toThrow('mismatch');
    expect(() =>
      createPostwarPublicSafetyGenesis({ ...input, source: { ...source } }),
    ).toThrow('Verified source');
    const policy = JSON.parse(input.policyBytes);
    expect(() =>
      createPostwarPublicSafetyGenesis({
        ...input,
        policyBytes: JSON.stringify({ ...policy, provenance: 'SOURCE_MAPPED' }),
      }),
    ).toThrow('GENERATED_POLICY');
    expect(() =>
      createPostwarPublicSafetyGenesis({
        ...input,
        policyBytes: JSON.stringify({
          ...policy,
          maxOtherDomesticServicesShareBps: '10001',
        }),
      }),
    ).toThrow('out of range');
    expect(() =>
      createPostwarPublicSafetyGenesis({
        ...input,
        policyBytes: JSON.stringify({
          ...policy,
          functions: policy.functions.map((item: object, index: number) =>
            index === 0 ? { ...item, shareBps: '3501' } : item,
          ),
        }),
      }),
    ).toThrow('partition personnel');
  });
});
