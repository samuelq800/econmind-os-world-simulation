import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  Money,
  canonicalDecimal,
  canonicalSerialize,
  parseWorldDecimal,
  SIMULATION_DAYS_PER_YEAR,
  SIMULATION_TICKS_PER_DAY,
} from '@econmind/core';
import {
  inspectOfficialOpeningDecisionSource,
  type OfficialOpeningSourceBytes,
} from '../../apps/world-worker/src/preparation/official-opening-decision-reconciliation.js';
import { createOfficialLabourSocialOpeningAdoption } from '../../apps/world-worker/src/preparation/official-labour-social-opening-adoption.js';
import { createPostwarMonetaryGenesis } from '../../apps/world-worker/src/preparation/postwar-monetary-genesis.js';
import { preparePostwarSocialServiceGenesis } from '../../apps/world-worker/src/preparation/postwar-social-service-genesis.js';
import { createPostwarPublicSafetyGenesis } from '../../apps/world-worker/src/preparation/postwar-public-safety-genesis.js';
import { preparePostwarLabourGenesis } from '../../apps/world-worker/src/preparation/postwar-labour-genesis.js';
import {
  createPostwarWagePolicy,
  isPostwarWagePolicy,
  lookupPostwarWage,
  POSTWAR_WAGE_POLICY_PATH,
  type PostwarWageRational,
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
const worldId = 'WORLD_POSTWAR_WAGE_TEST';
const seed = 'POSTWAR_WAGE_TEST_20261028';
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
const decimal = parseWorldDecimal;
const rationalEqual = (
  a: PostwarWageRational,
  numerator: bigint,
  denominator: bigint,
) =>
  expect(BigInt(a.numerator) * denominator).toBe(
    numerator * BigInt(a.denominator),
  );

describe('source-calibrated postwar generated wage policy', () => {
  it('uses actual 70-country monetary bindings and complete source-bound labour allocation, retaining source differences', () => {
    expect(policy.countries).toHaveLength(70);
    expect(Object.keys(policy.wagesByPositionId)).toHaveLength(
      labourPreparation.positions.length,
    );
    expect(
      new Set(policy.countries.map((row) => row.localCurrencyPerGcu)).size,
    ).toBeGreaterThan(1);
    expect(new Set(policy.countries.map((row) => row.currency)).size).toBe(70);
    expect(SIMULATION_DAYS_PER_YEAR).toBe('360');
    expect(BigInt(SIMULATION_TICKS_PER_DAY) / 3_600_000n).toBe(24n);
    for (const country of policy.countries) {
      const binding = monetary.bindings.find(
        (row) => row.countryId === country.countryId,
      )!;
      expect(country).toMatchObject({
        currency: binding.localCurrency,
        localCurrencyPerGcu: binding.localCurrencyPerGcu,
        fxVersion: binding.fxVersion,
        valueDate: binding.valueDate,
        period: 'SIM_YEAR',
      });
      const raw = source.financeOriginals.find(
        (row) => row.countryId === binding.sourceCountryId,
      )!;
      expect(country.calibration.sourceDailyIncomeGcu).toBe(
        raw.dailyLabourIncomeReference,
      );
      expect(country.calibration.sourceEmployedCount).toBe(
        adoption.employmentTargets.find(
          (row) => row.countryId === country.countryId,
        )!.employed,
      );
      const expectedLC = decimal(country.calibration.sourceDailyIncomeGcu)
        .mul('360')
        .mul(binding.localCurrencyPerGcu);
      expect(country.calibration.sourceAnnualTargetLC).toBe(
        canonicalDecimal(expectedLC),
      );
      expect(country.sourceReferences).toEqual(
        expect.arrayContaining(binding.sourceReferences),
      );
    }
  });

  it('measures every generated wage and exact country payroll residual without rounding the source envelope', () => {
    for (const country of policy.countries) {
      let payroll = decimal('0');
      for (const position of labourPreparation.positions.filter(
        (row) => row.countryId === country.countryId,
      )) {
        const wage = policy.wagesByPositionId[position.positionId]!;
        expect(wage.wagePeriod).toBe('SIM_YEAR');
        expect(decimal(wage.wageAmount).gt('0')).toBe(true);
        expect(wage.wageAmount.split('.')[1]?.length ?? 0).toBeLessThanOrEqual(
          6,
        );
        expect(Money.from(wage.wageAmount, wage.wageCurrency).currency).toBe(
          country.currency,
        );
        expect(lookupPostwarWage(policy, position)).toEqual(wage);
        payroll = payroll.add(
          decimal(wage.wageAmount).mul(position.filledCount),
        );
      }
      const calibration = country.calibration;
      expect(canonicalDecimal(payroll)).toBe(calibration.actualAnnualPayrollLC);
      expect(canonicalDecimal(payroll.add(calibration.residualLC))).toBe(
        calibration.sourceAnnualTargetLC,
      );
      expect(decimal(calibration.residualLC).gte('0')).toBe(true);
      expect(
        decimal(calibration.residualLC).lt(
          decimal(calibration.sourceEmployedCount).div('1000000'),
        ),
      ).toBe(true);
      const wageLow = decimal(country.wagesBySkill.LOW.wageAmount);
      expect(decimal(country.wagesBySkill.MEDIUM.wageAmount).gt(wageLow)).toBe(
        true,
      );
      expect(
        decimal(country.wagesBySkill.HIGH.wageAmount).gt(
          country.wagesBySkill.MEDIUM.wageAmount,
        ),
      ).toBe(true);
      // Actual generated mean is a rational of the quantized payroll, not the slightly higher calibration target.
      const [whole, fraction = ''] =
        calibration.actualAnnualPayrollLC.split('.');
      rationalEqual(
        country.meanAnnualWageLC,
        BigInt(whole! + fraction),
        10n ** BigInt(fraction.length) *
          BigInt(calibration.sourceEmployedCount),
      );
      const actualGcu = calibration.actualAnnualPayrollGcu;
      expect(
        decimal(actualGcu.numerator)
          .mul(country.localCurrencyPerGcu)
          .eq(
            decimal(actualGcu.denominator).mul(
              calibration.actualAnnualPayrollLC,
            ),
          ),
      ).toBe(true);
    }
  });

  it('is deterministic and leaves all source/adoption balances unchanged without payments or funding invention', () => {
    const original = JSON.stringify({
      source,
      adoption,
      monetary,
      labourPreparation,
    });
    expect(createPostwarWagePolicy(input)).toEqual(policy);
    expect(
      JSON.stringify({ source, adoption, monetary, labourPreparation }),
    ).toBe(original);
    expect(policy).toMatchObject({
      classification: 'GENERATED_POLICY',
      moneyCreated: false,
      wagesPaid: false,
      sourceAdmitted: false,
      worldClockStarted: false,
    });
    expect(Object.isFrozen(policy.countries[0]!.wagesBySkill.HIGH)).toBe(true);
    expect(isPostwarWagePolicy(policy)).toBe(true);
    expect(isPostwarWagePolicy({ ...policy })).toBe(false);
    expect(JSON.parse(canonicalSerialize(policy))).toEqual(
      JSON.parse(JSON.stringify(policy)),
    );
    expect(JSON.stringify(policy)).not.toContain('payrollFundingRef');
  });

  it('rejects source/policy/preparation substitutes and missing monetary country data', () => {
    expect(() =>
      createPostwarWagePolicy({
        ...input,
        policyBytes: input.policyBytes + '\n',
      }),
    ).toThrow('Pinned generated policy bytes');
    expect(() =>
      createPostwarWagePolicy({ ...input, financeSource: { ...source } }),
    ).toThrow('Verified selected source');
    expect(() =>
      createPostwarWagePolicy({
        ...input,
        labourPreparation: { ...labourPreparation },
      }),
    ).toThrow();
    expect(() =>
      createPostwarWagePolicy({
        ...input,
        monetaryBindings: input.monetaryBindings.slice(1),
      }),
    ).toThrow('Complete unique');
    expect(() =>
      createPostwarWagePolicy({
        ...input,
        monetaryBindings: input.monetaryBindings.map((row, i) =>
          i ? row : { ...row, localCurrencyPerGcu: '0' },
        ),
      }),
    ).toThrow('Positive LC');
    expect(() =>
      createPostwarWagePolicy({
        ...input,
        monetaryBindings: input.monetaryBindings.map((row, i) =>
          i ? row : { ...row, sourceCountryId: 'visual-territory-02' },
        ),
      }),
    ).toThrow('Country source/Core');
    expect(() =>
      lookupPostwarWage({ ...policy }, labourPreparation.positions[0]!),
    ).toThrow('Genuine generated policy');
  });
});
