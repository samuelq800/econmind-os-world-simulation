import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canonicalDecimal,
  canonicalSerialize,
  parseWorldDecimal,
} from '@econmind/core';
import {
  inspectOfficialOpeningDecisionSource,
  type OfficialOpeningSourceBytes,
} from '../../apps/world-worker/src/preparation/official-opening-decision-reconciliation.js';
import { createOfficialLabourSocialOpeningAdoption } from '../../apps/world-worker/src/preparation/official-labour-social-opening-adoption.js';
import { createPostwarMonetaryGenesis } from '../../apps/world-worker/src/preparation/postwar-monetary-genesis.js';
import {
  createPostwarSocialServiceFundingRequests,
  preparePostwarSocialServiceGenesis,
} from '../../apps/world-worker/src/preparation/postwar-social-service-genesis.js';
import {
  createPostwarPublicSafetyFundingRequests,
  createPostwarPublicSafetyGenesis,
} from '../../apps/world-worker/src/preparation/postwar-public-safety-genesis.js';
import {
  preparePostwarLabourGenesis,
  materializePostwarLabourGenesis,
} from '../../apps/world-worker/src/preparation/postwar-labour-genesis.js';
import { loadOwnerNonHostSourceAdoption } from '../../apps/world-worker/src/preparation/owner-non-host-source-adoption.js';
import {
  createPostwarFinancialGenesis,
  readPostwarLiquidFundingAccountsFromSeed,
} from '../../apps/world-worker/src/preparation/postwar-financial-genesis.js';
import {
  createPostwarWagePolicy,
  POSTWAR_WAGE_POLICY_PATH,
} from '../../apps/world-worker/src/preparation/postwar-wage-policy.js';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => readFile(path.join(root, file), 'utf8');
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
const worldId = 'WORLD_POSTWAR_FUNDING_TEST';
const seed = 'POSTWAR_FUNDING_TEST_20261028';
const regionsBytes = sourceBytes.datasets['data/regions.json']!;
const countriesBytes = sourceBytes.datasets['data/countries.json']!;
const social = preparePostwarSocialServiceGenesis({
  adoption,
  mappingBytes,
  regionsBytes,
  worldId,
  seedId: seed,
});
const safety = createPostwarPublicSafetyGenesis({
  source,
  adoption,
  mappingBytes,
  regionsBytes,
  countriesBytes,
  worldId,
  seed,
  policyBytes: await read('config/postwar-genesis/public-safety.v1.json'),
});
const labourPreparation = preparePostwarLabourGenesis({
  adoption,
  mappingBytes,
  regionsBytes,
  facilitiesBytes: sourceBytes.datasets['data/facilities.json']!,
  serviceDemands: [...social.demands, ...safety.demands],
});
const monetary = createPostwarMonetaryGenesis({
  source,
  countriesBytes,
  mappingBytes,
  valueDate: '2026-10-28',
});
const input = {
  policyBytes: await read(POSTWAR_WAGE_POLICY_PATH),
  adoption,
  financeSource: source,
  labourPreparation,
  monetaryBindings: monetary.bindings,
};
const policy = createPostwarWagePolicy(input);
const ownerAdoption = await loadOwnerNonHostSourceAdoption({
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
  adoption: ownerAdoption,
  monetary,
  worldId,
  seedId: 'SEED_POSTWAR_FUNDING_TEST',
  sourceId: 'SOURCE_POSTWAR_FUNDING_TEST',
  genesisVersion: 'POSTWAR_FUNDING_TEST_20261028_V1',
});
import {
  createPostwarFundingGenesis,
  consumePostwarFundingGenesis,
  type PostwarPublicFundingRequest,
} from '../../apps/world-worker/src/preparation/postwar-funding-genesis.js';

const socialRequests = createPostwarSocialServiceFundingRequests(
  social,
  policy,
);
const welfareRequests = createPostwarPublicSafetyFundingRequests({
  genesis: safety,
  labour: labourPreparation,
  social,
  wages: policy,
});
const fundingInput = {
  source,
  openingSeed: financial.baselineSeed,
  monetary,
  labourPreparation,
  wages: policy,
  publicRequests: [...socialRequests.requests, ...welfareRequests],
};
const funding = createPostwarFundingGenesis(fundingInput);
const decimal = parseWorldDecimal;

describe('one globally shared postwar funding reservation', () => {
  it('feeds actual source-funded references into the genuine Core labour materializer', () => {
    const materialized = materializePostwarLabourGenesis(labourPreparation, {
      wagesByPositionId: funding.wagesByPositionId,
    });
    expect(materialized.wagesPaid).toBe(false);
    expect(materialized.unmatched).toBe('0');
    expect(materialized.state.positions).toHaveLength(
      labourPreparation.positions.length,
    );
    expect(
      funding.allocations.every((row) =>
        /^PW_FUNDING_[A-F0-9]{64}$/u.test(row.fundingRef),
      ),
    ).toBe(true);
  });
  it('joins only unchanged GOV TGA and OP business deposit assets across all 70 countries', () => {
    expect(funding.accounts).toHaveLength(140);
    const seedAccounts = readPostwarLiquidFundingAccountsFromSeed(
      financial.baselineSeed,
    );
    expect(
      new Set(funding.accounts.map((account) => account.accountRef)).size,
    ).toBe(140);
    for (const account of funding.accounts) {
      const seedAccount = seedAccounts.find(
        (row) => row.accountId === account.accountRef,
      )!;
      expect(seedAccount).toMatchObject({
        ownerId: account.payerEntityId,
        currency: account.currency,
        availableAmount: account.availableAmount,
        claimId: account.claimId,
        issuerEntityId: account.issuerEntityId,
        counterpartAccountId: account.counterpartAccountId,
        sourceId: account.openingSourceId,
      });
      expect(account.accountNature).toBe(
        'CANONICAL_OPENING_SEED_FINANCIAL_ASSET',
      );
      const binding = monetary.bindings.find(
        (row) => row.countryId === account.countryId,
      )!;
      const rawIndex = source.financeOriginals.findIndex(
        (row) => row.countryId === binding.sourceCountryId,
      );
      const field =
        account.payerRole === 'GOV'
          ? 'treasuryCentralBankBalance'
          : 'businessBankDeposits';
      const raw = source.financeOriginals[rawIndex]![field] as string;
      expect(account.sourceBalanceRef).toBe(
        `data/finance.json#/${rawIndex}/${field}`,
      );
      expect(account.originalGcuAmount).toBe(raw);
      expect(account.availableAmount).toBe(
        canonicalDecimal(decimal(raw).mul(binding.localCurrencyPerGcu)),
      );
      expect(account.currency).toBe(binding.localCurrency);
      const reservations = funding.allocations
        .filter((allocation) => allocation.accountRef === account.accountRef)
        .reduce((sum, row) => sum.add(row.amount), decimal('0'));
      expect(canonicalDecimal(reservations)).toBe(
        canonicalDecimal(decimal(account.reservedAmount)),
      );
      expect(reservations.lte(account.availableAmount)).toBe(true);
      expect(canonicalDecimal(reservations.add(account.remainingAmount))).toBe(
        account.availableAmount,
      );
      expect(account.sourceBalanceRef).not.toMatch(
        /bankReserveAssets|householdBankDeposits/u,
      );
      if (account.payerRole === 'OP')
        expect(account.reservedPublicAmount).toBe('0.00');
    }
  });

  it('covers exactly the first simulation day of each filled position and materializes a unique source-bound payroll reference', () => {
    expect(funding.positionFunding).toHaveLength(
      labourPreparation.positions.length,
    );
    const refs = new Set<string>();
    for (const reservation of funding.positionFunding) {
      const position = labourPreparation.positions.find(
        (row) => row.positionId === reservation.positionId,
      )!;
      const wage = policy.wagesByPositionId[position.positionId]!;
      expect(reservation.periodDays).toBe('1');
      expect(reservation.period).toBe('SIM_DAY');
      const exact = reservation.exactFirstDayPayrollLC;
      const reserved = decimal(reservation.amount);
      expect(reserved.mul(exact.denominator).gte(exact.numerator)).toBe(true);
      expect(
        reserved.minus('0.01').mul(exact.denominator).lt(exact.numerator),
      ).toBe(true);
      expect(
        decimal(exact.numerator)
          .mul('360')
          .eq(
            decimal(exact.denominator)
              .mul(wage.wageAmount)
              .mul(position.filledCount),
          ),
      ).toBe(true);
      expect(funding.wagesByPositionId[position.positionId]).toEqual({
        wageAmount: wage.wageAmount,
        wageCurrency: wage.wageCurrency,
        wagePeriod: wage.wagePeriod,
        wageVersion: wage.wageVersion,
        payrollFundingRef: reservation.fundingRef,
      });
      refs.add(reservation.fundingRef);
    }
    expect(refs.size).toBe(labourPreparation.positions.length);
  });

  it('shares one GOV remainder fairly across oversized public demands without creating grants or using payer mirrors', () => {
    const account = funding.accounts.find((row) => row.payerRole === 'GOV')!;
    const region = labourPreparation.regions.find(
      (row) => row.countryId === account.countryId,
    )!;
    const request = (purposeId: string): PostwarPublicFundingRequest => ({
      requestId: purposeId,
      purposeId,
      countryId: account.countryId,
      locationId: region.locationId,
      kind: 'OPERATING',
      currency: account.currency,
      amount: canonicalDecimal(decimal(account.availableAmount).mul('10')),
      periodDays: '1',
    });
    // TEST_ONLY oversized public demands exercise ordinary insufficient-coverage behavior.
    const partialInput = {
      ...fundingInput,
      publicRequests: [
        request('TEST_ONLY_PUBLIC_A'),
        request('TEST_ONLY_PUBLIC_B'),
      ],
    };
    const partial = createPostwarFundingGenesis(partialInput);
    const grants = partial.allocations.filter(
      (row) => row.kind === 'OPERATING',
    );
    expect(grants).toHaveLength(2);
    expect(
      decimal(grants[0]!.amount).minus(grants[1]!.amount).abs().lte('0.01'),
    ).toBe(true);
    expect(
      grants.every((row) => decimal(row.uncoveredReservationAmount).gt('0')),
    ).toBe(true);
    const exhausted = partial.accounts.find(
      (row) => row.accountRef === account.accountRef,
    )!;
    expect(decimal(exhausted.remainingAmount).lt('0.01')).toBe(true);
    expect(
      createPostwarFundingGenesis({
        ...partialInput,
        publicRequests: [...partialInput.publicRequests].reverse(),
      }),
    ).toEqual(partial);
  });

  it('rejects duplicate purposes, negative amounts, country/currency/payer/source-ref substitutions and payroll double-reservation', () => {
    const request = fundingInput.publicRequests[0]!;
    const other = monetary.bindings.find(
      (row) => row.countryId !== request.countryId,
    )!;
    for (const changed of [
      { ...request, amount: '-0.01' },
      { ...request, countryId: other.countryId, currency: other.localCurrency },
      { ...request, currency: 'GCU' },
      { ...request, payerEntityId: 'ENTITY_BANK_01' },
      {
        ...request,
        sourceBalanceRef: 'data/finance.json#/0/bankReserveAssets',
      },
      { ...request, accountRef: 'UNRELATED_ACCOUNT' },
      {
        ...request,
        requestId: labourPreparation.positions[0]!.positionId,
        purposeId: labourPreparation.positions[0]!.positionId,
      },
    ])
      expect(() =>
        createPostwarFundingGenesis({
          ...fundingInput,
          publicRequests: [changed],
        }),
      ).toThrow();
    expect(() =>
      createPostwarFundingGenesis({
        ...fundingInput,
        publicRequests: [request, request],
      }),
    ).toThrow('Duplicate public purpose');
    expect(() =>
      createPostwarFundingGenesis({ ...fundingInput, wages: { ...policy } }),
    ).toThrow('Mixed/untrusted');
    expect(() =>
      createPostwarFundingGenesis({
        ...fundingInput,
        monetary: { ...monetary },
      }),
    ).toThrow('Issued monetary');
    expect(() => consumePostwarFundingGenesis({ ...funding })).toThrow(
      'Issued shared funding',
    );
  });

  it('is deterministic, leaves every source balance unchanged, and produces reservations without any payments', () => {
    const before = JSON.stringify({
      source,
      monetary,
      labourPreparation,
      policy,
    });
    expect(createPostwarFundingGenesis(fundingInput)).toEqual(funding);
    expect(
      JSON.stringify({ source, monetary, labourPreparation, policy }),
    ).toBe(before);
    expect(funding).toMatchObject({
      moneyCreated: false,
      balancesChanged: false,
      paymentsGenerated: false,
      sourceAdmitted: false,
    });
    expect(consumePostwarFundingGenesis(funding)).toBe(funding);
    expect(Object.isFrozen(funding.allocations)).toBe(true);
    expect(JSON.parse(canonicalSerialize(funding))).toEqual(
      JSON.parse(JSON.stringify(funding)),
    );
  });
});
