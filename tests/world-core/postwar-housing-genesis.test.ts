import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseWorldDecimal } from '../../packages/core/src/index.js';
import {
  inspectOfficialOpeningDecisionSource,
  type OfficialOpeningSourceBytes,
} from '../../apps/world-worker/src/preparation/official-opening-decision-reconciliation.js';
import { createOfficialLabourSocialOpeningAdoption } from '../../apps/world-worker/src/preparation/official-labour-social-opening-adoption.js';
import {
  createPostwarWagePolicy,
  type PostwarWagePolicy,
} from '../../apps/world-worker/src/preparation/postwar-wage-policy.js';
import { preparePostwarSocialServiceGenesis } from '../../apps/world-worker/src/preparation/postwar-social-service-genesis.js';
import { createPostwarPublicSafetyGenesis } from '../../apps/world-worker/src/preparation/postwar-public-safety-genesis.js';
import { preparePostwarLabourGenesis } from '../../apps/world-worker/src/preparation/postwar-labour-genesis.js';
import { createPostwarMonetaryGenesis } from '../../apps/world-worker/src/preparation/postwar-monetary-genesis.js';
import {
  buildPostwarHousingGenesis,
  consumePostwarHousingMetrics,
  isPostwarHousingGenesis,
  POSTWAR_HOUSING_POLICY_SHA256,
} from '../../apps/world-worker/src/preparation/postwar-housing-genesis.js';

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
      Object.keys(mapping.source.dataFiles).map(async (p) => [
        p,
        await read(`artifacts/world-balanced-candidate-v1/${p}`),
      ]),
    ),
  ),
};
const inspected = inspectOfficialOpeningDecisionSource(sourceBytes);
if (!inspected.source) throw new Error(JSON.stringify(inspected.blockers));
const ownerDecisionBytes = await read(
  'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md',
);
const adoption = createOfficialLabourSocialOpeningAdoption({
  source: inspected.source,
  mappingBytes,
  ownerOriginalBytes: ownerDecisionBytes,
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
// Real pinned source + real generated service/police/labour/wage/FX constructors.
// The explicit world/seed scope is TEST_ONLY; no constructor writes financial history.
const worldId = 'WORLD_TEST_ONLY_POSTWAR_HOUSING';
const seedId = 'SEED_TEST_ONLY_POSTWAR_HOUSING';
const regionsBytes = sourceBytes.datasets['data/regions.json']!;
const countriesBytes = sourceBytes.datasets['data/countries.json']!;
const social = preparePostwarSocialServiceGenesis({
  adoption,
  mappingBytes,
  regionsBytes,
  worldId,
  seedId,
});
const safety = createPostwarPublicSafetyGenesis({
  worldId,
  seed: seedId,
  policyBytes: await read('config/postwar-genesis/public-safety.v1.json'),
  source: inspected.source,
  adoption,
  mappingBytes,
  countriesBytes,
  regionsBytes,
});
const labourPreparation = preparePostwarLabourGenesis({
  adoption,
  mappingBytes,
  regionsBytes,
  facilitiesBytes: sourceBytes.datasets['data/facilities.json']!,
  serviceDemands: [...social.demands, ...safety.demands],
});
const monetary = createPostwarMonetaryGenesis({
  source: inspected.source,
  countriesBytes,
  mappingBytes,
  valueDate: '2026-10-28',
});
const wagePolicy = createPostwarWagePolicy({
  policyBytes: await read('config/postwar-genesis/wage-policy.v1.json'),
  adoption,
  financeSource: inspected.source,
  monetaryBindings: monetary.bindings,
  labourPreparation,
});
const policyBytes = await read('config/postwar-genesis/housing.v1.json');
const input = { sourceBytes, ownerDecisionBytes, policyBytes, wagePolicy };
const genesis = buildPostwarHousingGenesis(input);
const sum = (values: readonly string[]) =>
  values.reduce((n, v) => n + BigInt(v), 0n);

describe('postwar housing genesis from the actual 122-region source', () => {
  it('preserves every original population, household and stock while allocating mutually exclusive cohorts exactly', () => {
    const original = JSON.parse(
      sourceBytes.datasets['data/population-services.json']!,
    ) as { population: number; households: number; housingUnits: number }[];
    expect(genesis.regions).toHaveLength(122);
    expect(new Set(genesis.regions.map((r) => r.countryId)).size).toBe(70);
    expect(genesis.totals.population).toBe(
      original.reduce((n, r) => n + BigInt(r.population), 0n).toString(),
    );
    expect(genesis.totals.households).toBe('4449317385');
    expect(genesis.totals.totalUnits).toBe('4682977321');
    for (const r of genesis.regions) {
      expect(sum(r.cohorts.map((c) => c.households))).toBe(
        BigInt(r.source.households),
      );
      expect(sum(r.cohorts.map((c) => c.population))).toBe(
        BigInt(r.source.population),
      );
      expect(r.cohorts.map((c) => c.tenure)).toEqual([
        'OWNER_OCCUPIER',
        'PRIVATE_RENTER',
        'PUBLIC_RENTER',
        'DISPLACED',
      ]);
      for (const c of r.cohorts)
        expect(BigInt(c.population)).toBeGreaterThanOrEqual(
          BigInt(c.households),
        );
      const s = r.stock;
      expect(BigInt(s.occupiedUnits)).toBeLessThanOrEqual(
        BigInt(s.habitableUnits),
      );
      expect(BigInt(s.habitableUnits)).toBeLessThan(BigInt(s.totalUnits));
      expect(sum([s.habitableUnits, s.uninhabitableUnits])).toBe(
        BigInt(s.totalUnits),
      );
      expect(sum([s.occupiedUnits, s.vacantHabitableUnits])).toBe(
        BigInt(s.habitableUnits),
      );
      expect(sum(r.titles.map((t) => t.units))).toBe(BigInt(s.totalUnits));
      expect(sum(r.titles.map((t) => t.habitableUnits))).toBe(
        BigInt(s.habitableUnits),
      );
      expect(sum(r.titles.map((t) => t.occupiedUnits))).toBe(
        BigInt(s.occupiedUnits),
      );
      for (const t of r.titles) {
        expect(BigInt(t.occupiedUnits)).toBeLessThanOrEqual(
          BigInt(t.habitableUnits),
        );
        expect(BigInt(t.habitableUnits)).toBeLessThanOrEqual(BigInt(t.units));
      }
      expect(sum(Object.values(r.displacedReasons))).toBe(
        BigInt(r.cohorts[3]!.households),
      );
      expect(r.demand.householdDemand.amount).toBe(r.source.households);
      expect(r.demand.migrationDemand.amount).toBe('0');
      expect(r.demand.temporaryProjectDemand.amount).toBe('0');
    }
    expect(
      sum([
        genesis.totals.ownerOccupierHouseholds,
        genesis.totals.renterHouseholds,
        genesis.totals.displacedHouseholds,
      ]),
    ).toBe(BigInt(genesis.totals.households));
  });
  it('uses differentiated country/region conditions with a concrete first-region calibration rather than uniform defaults', () => {
    const r = genesis.regions.find((r) => r.locationId === 'REGION_01_E1')!;
    expect(r.generated).toMatchObject({
      damageBps: '2080',
      accessVacancyBps: '296',
      renterShareBps: '3520',
      publicStockShareBps: '1070',
      classification: 'GENERATED_POLICY',
    });
    expect(r.stock).toEqual({
      totalUnits: '33141343',
      habitableUnits: '26247944',
      uninhabitableUnits: '6893399',
      occupiedUnits: '25471005',
      vacantHabitableUnits: '776939',
    });
    expect(r.cohorts.map((c) => c.households)).toEqual([
      '16505212',
      '6157264',
      '2808529',
      '5948546',
    ]);
    expect(
      new Set(genesis.regions.map((r) => r.generated.damageBps)).size,
    ).toBeGreaterThan(20);
    expect(
      new Set(genesis.regions.map((r) => r.generated.renterShareBps)).size,
    ).toBeGreaterThan(3);
    expect(
      new Set(genesis.regions.map((r) => r.stock.totalUnits)).size,
    ).toBeGreaterThan(100);
    for (const r of genesis.regions) {
      expect(BigInt(r.stock.uninhabitableUnits)).toBeGreaterThan(0n);
      expect(BigInt(r.stock.vacantHabitableUnits)).toBeGreaterThan(0n);
      expect(r.titles.map((t) => t.titleHolderId)).toEqual([
        `ENTITY_HOUSEHOLDS_${r.countryId.slice(-2)}`,
        `ENTITY_GOVERNMENT_${r.countryId.slice(-2)}`,
      ]);
      expect(r.titles.every((t) => t.basis === 'GENERATED_GENESIS_TITLE')).toBe(
        true,
      );
      expect(
        r.titles.every(
          (t) =>
            t.riskBearerId === t.titleHolderId &&
            t.operatorId === t.titleHolderId,
        ),
      ).toBe(true);
      for (const ref of r.source.references) {
        expect(ref.sha256).toMatch(/^[a-f0-9]{64}$/u);
        expect(ref.pointer).toMatch(/^\/\d+$/u);
      }
    }
  });
  it('inherits exact annual LC wages/FX, makes positive future rent schedules and never opens household self-rent contracts or t0 debt', () => {
    for (const r of genesis.regions) {
      const w = wagePolicy.countries.find((w) => w.countryId === r.countryId)!;
      expect(r.monetary).toMatchObject({
        currency: w.currency,
        period: 'SIM_YEAR',
        fxVersion: w.fxVersion,
        localCurrencyPerGcu: w.localCurrencyPerGcu,
        sourceReferences: w.sourceReferences,
      });
      expect(r.rentObligations).toHaveLength(2);
      for (const o of r.rentObligations) {
        expect(o.period).toBe(w.period);
        expect(o.perHousehold.currency).toBe(w.currency);
        expect(parseWorldDecimal(o.perHousehold.amount).greaterThan(0)).toBe(
          true,
        );
        expect(
          parseWorldDecimal(o.annualTotal.amount).equals(
            parseWorldDecimal(o.perHousehold.amount).times(o.households),
          ),
        ).toBe(true);
        const p = o.rationalPrice,
          numerator = BigInt(p.numerator),
          denominator = BigInt(p.denominator);
        const micro = BigInt(
          parseWorldDecimal(o.perHousehold.amount).times('1000000').toFixed(0),
        );
        expect(
          micro * denominator +
            BigInt(p.remainderNumeratorAfterSixDecimalFloor),
        ).toBe(numerator * 1000000n);
        expect(BigInt(p.remainderNumeratorAfterSixDecimalFloor)).toBeLessThan(
          denominator,
        );
        expect(o).toMatchObject({
          effectiveFrom: 'AFTER_T0',
          accruedAtT0: '0',
          paidAtT0: '0',
          outstandingDebtAtT0: '0',
          contractCreated: false,
          rightsClassification: 'GENESIS_RIGHTS_NOT_EXECUTED_LEASE',
          rightsVersion: 'POSTWAR_GENESIS_HOUSING_RIGHTS_V1',
          rightsPolicySha256: POSTWAR_HOUSING_POLICY_SHA256,
        });
        expect(o.landlordGroupRef).not.toBe(o.tenantGroupRef);
        expect(r.cohorts.some((c) => c.id === o.tenantGroupRef)).toBe(true);
        if (o.payerEntityId === o.beneficiaryEntityId) {
          expect(o.settlement).toBe(
            'REQUIRES_CORE_BENEFICIAL_GROUP_SETTLEMENT',
          );
          expect(o.landlordGroupRef).toBe(r.cohorts[0]!.id);
          expect(r.titles[0]!.beneficialOwnerGroupRef).toBe(o.landlordGroupRef);
        } else
          expect(o.settlement).toBe(
            'REQUIRES_AUTHORIZED_PROSPECTIVE_PUBLIC_RENT_COMMAND',
          );
      }
    }
    expect(genesis.generatedLeaseCount).toBe('0');
    expect(genesis.t0FinancialPostings).toEqual([]);
    expect(genesis.t0HistoricalRentPayments).toEqual([]);
  });
  it('is deterministic and immutable; replay produces identical obligation ids without adding contracts, debt or money', () => {
    const replay = buildPostwarHousingGenesis(input);
    expect(replay).toEqual(genesis);
    expect(replay.fingerprint).toBe(genesis.fingerprint);
    expect(
      new Set(replay.regions.flatMap((r) => r.rentObligations.map((o) => o.id)))
        .size,
    ).toBe(244);
    expect(Object.isFrozen(replay.regions[0]!.cohorts[0])).toBe(true);
    expect(createHash('sha256').update(policyBytes).digest('hex')).toBe(
      POSTWAR_HOUSING_POLICY_SHA256,
    );
    expect(isPostwarHousingGenesis(replay)).toBe(true);
    expect(isPostwarHousingGenesis(JSON.parse(JSON.stringify(replay)))).toBe(
      false,
    );
    expect(genesis.t0FinancialPostings).toEqual([]);
  });
  it('feeds existing Core housing metrics using one household demand and an explicitly supplied annual regional income', () => {
    const r = genesis.regions[0]!;
    const result = consumePostwarHousingMetrics(genesis, r.locationId, {
      amount: '1000000000000',
      currency: r.monetary.currency,
    });
    expect(result.unmetHousingUnits.amount).toBe(
      (BigInt(r.source.households) > BigInt(r.stock.habitableUnits)
        ? BigInt(r.source.households) - BigInt(r.stock.habitableUnits)
        : 0n
      ).toString(),
    );
    expect(result.vacancyRate).not.toBeNull();
    expect(() =>
      consumePostwarHousingMetrics(genesis, r.locationId, {
        amount: '1',
        currency: 'GCU',
      }),
    ).toThrow();
  });
  it('rejects modified policy/source and request-fabricated wage/genesis carriers', async () => {
    expect(() =>
      buildPostwarHousingGenesis({ ...input, policyBytes: policyBytes + ' ' }),
    ).toThrow('versioned policy bytes differ');
    expect(() =>
      buildPostwarHousingGenesis({
        ...input,
        wagePolicy: JSON.parse(JSON.stringify(wagePolicy)) as PostwarWagePolicy,
      }),
    ).toThrow('untrusted wage policy');
    const datasets = {
      ...sourceBytes.datasets,
      'data/population-services.json': sourceBytes.datasets[
        'data/population-services.json'
      ]!.replace('31419551', '31419552'),
    };
    expect(() =>
      buildPostwarHousingGenesis({
        ...input,
        sourceBytes: { ...sourceBytes, datasets },
      }),
    ).toThrow();
    expect(() =>
      consumePostwarHousingMetrics(
        JSON.parse(JSON.stringify(genesis)) as typeof genesis,
        genesis.regions[0]!.locationId,
        { amount: '1', currency: 'AAA' },
      ),
    ).toThrow('untrusted housing genesis');
    const evidenceDirectory = process.env.ECONMIND_POSTWAR_HOUSING_EVIDENCE_DIR;
    if (evidenceDirectory) {
      await mkdir(evidenceDirectory, { recursive: true });
      await writeFile(
        path.join(evidenceDirectory, 'housing-carrier.json'),
        JSON.stringify(
          {
            scope: {
              worldId,
              seedId,
              classification:
                'TEST_ONLY_GENERATED_POLICY_SOURCE_VALIDATION_NOT_RUNTIME_ADMISSION',
            },
            genesis,
          },
          null,
          2,
        ) + '\n',
        { mode: 0o600 },
      );
    }
  });
});
