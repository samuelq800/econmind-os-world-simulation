import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import {
  inspectOfficialOpeningDecisionSource,
  type OfficialOpeningSourceBytes,
} from '../../apps/world-worker/src/preparation/official-opening-decision-reconciliation.js';
import { createOfficialLabourSocialOpeningAdoption } from '../../apps/world-worker/src/preparation/official-labour-social-opening-adoption.js';
import {
  buildPostwarOperatingSupplies,
  appendPostwarOperatingSupplies,
  allocatePostwarOperatingSupplies,
  consumePostwarSupplyAllocation,
  isPostwarOperatingSupplies,
  POSTWAR_SUPPLIES_POLICY_SHA256,
  type PostwarOperatingSupplies,
  type PostwarSupplyAllocationRequest,
} from '../../apps/world-worker/src/preparation/postwar-operating-supplies.js';
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
const policyBytes = await read('config/postwar-genesis/supplies.v1.json');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const input = (scope: string) => ({
  source: inspected.source!,
  adoption,
  mappingBytes,
  countriesBytes: sourceBytes.datasets['data/countries.json']!,
  regionsBytes: sourceBytes.datasets['data/regions.json']!,
  worldId: `WORLD_TEST_ONLY_SUPPLIES_${scope}`,
  seedId: `SEED_TEST_ONLY_SUPPLIES_${scope}`,
  policyBytes,
});
const supply = (scope: string) => buildPostwarOperatingSupplies(input(scope));
const amount = (s: PostwarOperatingSupplies['stocks'][number]) =>
  C.canonicalDecimal(s.entry.quantity.amount);
const request = (
  supplies: PostwarOperatingSupplies,
  index: number,
  id: string,
  quantity: string,
): PostwarSupplyAllocationRequest => {
  const s = supplies.stocks[index]!;
  return {
    allocationId: `ALLOCATION_${id}`,
    consumerRef: `CONSUMER_${id}`,
    worldId: supplies.worldId,
    countryId: s.countryId,
    locationId: s.locationId,
    serviceAssetId: s.serviceAssetId,
    sourceId: s.entry.sourceId,
    entryId: s.entry.entryId,
    commodityId: s.entry.account.commodityId,
    unit: s.entry.account.unit,
    quantity,
  };
};
function originalSeed(s: PostwarOperatingSupplies) {
  const worldId = C.worldId(s.worldId),
    countryId = C.countryId('COUNTRY_01'),
    owner = C.legalEntityId('ENTITY_OPERATOR_01');
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_TEST_ONLY_ORIGINAL_TWELVE'),
      sourceKind: 'TEST_FIXTURE',
      locator: 'tests/world-core/postwar-operating-supplies.test.ts',
      sourceVersion: 'TEST_ONLY_PRESERVATION_V1',
      payload: {
        purpose:
          'Non-production 12-commodity/balanced-finance preservation fixture',
      },
    },
    sha,
  );
  const commodities = (
    JSON.parse(mappingBytes) as {
      mappings: { commodities: { coreCommodityId: string; unit: string }[] };
    }
  ).mappings.commodities;
  const inventoryEntries = commodities.map((c, index) => ({
    entryId: C.openingInventoryEntryId(`ORIGINAL_ENTRY_${c.coreCommodityId}`),
    sourceId: source.sourceId,
    account: C.createInventoryAccount({
      worldId,
      countryId,
      commodityId: C.commodityId(c.coreCommodityId),
      batchId: C.inventoryBatchId(`ORIGINAL_BATCH_${c.coreCommodityId}`),
      unit: c.unit,
      physicalLocationId: C.inventoryLocationId('ORIGINAL_WAREHOUSE_01'),
      bucket: 'AVAILABLE',
      reservationId: null,
      shipmentId: null,
      titleHolderId: owner,
      riskBearerId: owner,
      economicRecognitionId: null,
    }),
    quantity: C.Quantity.from(`${index + 1}.123456`, c.unit),
  }));
  const cash = C.createFinancialAccount({
    worldId,
    countryId,
    ownerId: owner,
    accountId: C.financialAccountId('ORIGINAL_CASH'),
    accountClass: 'CASH',
    currency: 'GCU',
    claimId: null,
    counterpartyEntityId: null,
  });
  const equity = C.createFinancialAccount({
    ...cash,
    accountId: C.financialAccountId('ORIGINAL_EQUITY'),
    accountClass: 'EQUITY',
  });
  const money = C.Money.from('17548540099.199997', 'GCU');
  return C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId(s.seedId),
      worldId,
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries,
      financialBatches: [
        {
          batchId: C.financialOpeningBatchId('ORIGINAL_BALANCED_FINANCE'),
          sourceId: source.sourceId,
          settlementCurrency: 'GCU',
          legs: [
            {
              legId: C.financialOpeningLegId('ORIGINAL_DEBIT'),
              account: cash,
              direction: 'DEBIT',
              amount: money,
              counterpartLegId: C.financialOpeningLegId('ORIGINAL_CREDIT'),
            },
            {
              legId: C.financialOpeningLegId('ORIGINAL_CREDIT'),
              account: equity,
              direction: 'CREDIT',
              amount: money,
              counterpartLegId: C.financialOpeningLegId('ORIGINAL_DEBIT'),
            },
          ],
        },
      ],
    },
    sha,
  );
}

describe('finite generated postwar operating supplies, not original 12-commodity observations', () => {
  it('creates differentiated bounded real GOV AVAILABLE opening entries with explicit assumption provenance', () => {
    const s = supply('BOUNDED');
    expect(s.stocks).toHaveLength(244);
    expect(new Set(s.stocks.map((v) => v.locationId)).size).toBe(122);
    expect(new Set(s.stocks.map((v) => v.countryId)).size).toBe(70);
    expect(s.source.sourceKind).toBe('DOCUMENTED_ASSUMPTION');
    expect(s.classification).toBe(
      'GENERATED_POLICY_NEW_DOMAIN_PHYSICAL_ENDOWMENT',
    );
    expect(sha(policyBytes)).toBe(POSTWAR_SUPPLIES_POLICY_SHA256);
    expect(
      new Set(s.stocks.map((v) => v.coverageSimDays)).size,
    ).toBeGreaterThan(2);
    for (const v of s.stocks) {
      expect(BigInt(v.coverageSimDays)).toBeGreaterThanOrEqual(3n);
      expect(BigInt(v.coverageSimDays)).toBeLessThanOrEqual(21n);
      expect(BigInt(amount(v))).toBe(
        BigInt(v.dailyBasis) * BigInt(v.coverageSimDays),
      );
      expect(BigInt(amount(v))).toBeGreaterThan(0n);
      expect(v.entry.sourceId).toBe(s.source.sourceId);
      expect(v.entry.account).toMatchObject({
        worldId: s.worldId,
        countryId: v.countryId,
        titleHolderId: `ENTITY_GOVERNMENT_${v.countryId.slice(-2)}`,
        riskBearerId: `ENTITY_GOVERNMENT_${v.countryId.slice(-2)}`,
        bucket: 'AVAILABLE',
        reservationId: null,
        shipmentId: null,
      });
      expect(v.entry.account.unit).toBe(
        v.kind === 'MEDICINE' ? 'medical_dose' : 'student_day_material',
      );
      expect(
        v.sourceReferences.some(
          (r) => r.sha256 === POSTWAR_SUPPLIES_POLICY_SHA256,
        ),
      ).toBe(true);
    }
    const medical = s.stocks.find(
      (v) => v.locationId === 'REGION_01_E1' && v.kind === 'MEDICINE',
    )!;
    const materials = s.stocks.find(
      (v) => v.locationId === 'REGION_01_E1' && v.kind === 'SCHOOL_MATERIALS',
    )!;
    expect(medical).toMatchObject({
      dailyBasis: '1899125',
      coverageSimDays: '14',
      recoveryBps: '6252',
    });
    expect(amount(medical)).toBe('26587750');
    expect(amount(materials)).toBe('294680638');
    for (const kind of ['MEDICINE', 'SCHOOL_MATERIALS'] as const)
      expect(
        s.stocks
          .filter((v) => v.kind === kind)
          .reduce((n, v) => n + BigInt(amount(v)), 0n)
          .toString(),
      ).toBe(s.totals[kind].amount);
    expect(s.serviceReadinessEstablished).toBe(false);
    expect(s.remainingPrerequisites).toContain('FINITE_AUTHORIZED_WATER');
    expect(s.remainingPrerequisites).toContain('FINITE_AUTHORIZED_POWER');
    expect(s.financialBatches).toEqual([]);
    expect(s.historicalProcurementOrServiceEvents).toEqual([]);
  });
  it('appends to a real Core OpeningSeed, reconstructs finite inventory, preserves all original 12 entries and balanced financial bytes, and replays idempotently', () => {
    const s = supply('APPEND'),
      seed = originalSeed(s),
      priorFinance = C.canonicalSerialize(seed.financialBatches),
      priorInventory = C.canonicalSerialize(seed.inventoryEntries),
      priorSeed = C.canonicalSerialize(seed);
    const augmented = appendPostwarOperatingSupplies(seed, s);
    expect(augmented.inventoryEntries).toHaveLength(256);
    expect(augmented.sources).toHaveLength(2);
    expect(C.canonicalSerialize(augmented.financialBatches)).toBe(priorFinance);
    expect(
      C.canonicalSerialize(
        augmented.inventoryEntries.filter(
          (e) => e.sourceId === seed.sources[0]!.sourceId,
        ),
      ),
    ).toBe(priorInventory);
    expect(C.canonicalSerialize(seed)).toBe(priorSeed);
    const before = C.rebuildV08LedgersFromLineage({ seed, sha256Hex: sha }),
      after = C.rebuildV08LedgersFromLineage({
        seed: augmented,
        sha256Hex: sha,
      });
    expect(C.canonicalSerialize(after.financial)).toBe(
      C.canonicalSerialize(before.financial),
    );
    expect(
      after.inventory.balances.filter(
        (b) =>
          b.account.unit === 'medical_dose' ||
          b.account.unit === 'student_day_material',
      ),
    ).toHaveLength(244);
    expect(appendPostwarOperatingSupplies(augmented, s)).toBe(augmented);
    expect(
      C.canonicalSerialize(
        appendPostwarOperatingSupplies(
          seed,
          buildPostwarOperatingSupplies(input('APPEND')),
        ),
      ),
    ).toBe(C.canonicalSerialize(augmented));
  });
  it('rejects cross-world, partial, overlapping and extra supplementary source/commodity grants rather than minting twice', () => {
    const s = supply('CONFLICT'),
      seed = originalSeed(s),
      augmented = appendPostwarOperatingSupplies(seed, s);
    expect(() =>
      appendPostwarOperatingSupplies(seed, supply('OTHER_WORLD')),
    ).toThrow('seed/world scope differs');
    const partial = C.createOpeningSeed(
      {
        ...augmented,
        inventoryEntries: augmented.inventoryEntries.filter(
          (e) => e.entryId !== s.stocks[0]!.entry.entryId,
        ),
      },
      sha,
    );
    expect(() => appendPostwarOperatingSupplies(partial, s)).toThrow(
      'partial/duplicate',
    );
    const template = s.stocks[0]!.entry,
      extra = {
        ...template,
        entryId: C.openingInventoryEntryId('EXTRA_UNAUTHORIZED_ENTRY'),
        account: C.createInventoryAccount({
          ...template.account,
          batchId: C.inventoryBatchId('EXTRA_UNAUTHORIZED_BATCH'),
        }),
      };
    const doubled = C.createOpeningSeed(
      {
        ...augmented,
        inventoryEntries: [...augmented.inventoryEntries, extra],
      },
      sha,
    );
    expect(() => appendPostwarOperatingSupplies(doubled, s)).toThrow(
      'supplemental commodity grant conflicts',
    );
  });
  it('globally allocates one stock across multiple consumers at exact capacity and refuses a second plan even through reconstructed supply capability', () => {
    const s = supply('ALLOCATE'),
      q = BigInt(amount(s.stocks[0]!));
    const requests = [
      request(s, 0, 'A', (q / 2n).toString()),
      request(s, 0, 'B', (q - q / 2n).toString()),
    ];
    const plan = allocatePostwarOperatingSupplies(s, requests);
    expect(
      plan.remaining.find((r) => r.entryId === s.stocks[0]!.entry.entryId)!
        .amount,
    ).toBe('0');
    expect(plan.consumesInventory).toBe(false);
    expect(allocatePostwarOperatingSupplies(s, [...requests].reverse())).toBe(
      plan,
    );
    expect(consumePostwarSupplyAllocation(s, plan)).toBe(plan);
    expect(
      allocatePostwarOperatingSupplies(
        buildPostwarOperatingSupplies(input('ALLOCATE')),
        requests,
      ),
    ).toBe(plan);
    expect(() =>
      allocatePostwarOperatingSupplies(
        buildPostwarOperatingSupplies(input('ALLOCATE')),
        [request(s, 0, 'DOUBLE', '1')],
      ),
    ).toThrow('allocation already bound');
    expect(() =>
      consumePostwarSupplyAllocation(s, JSON.parse(JSON.stringify(plan))),
    ).toThrow('genuine single supply allocation');
    expect(amount(s.stocks[0]!)).toBe(q.toString());
  });
  it('rejects aggregate overuse and every source/world/country/location/service/commodity/unit boundary without binding a failed plan', () => {
    const s = supply('NEGATIVE'),
      q = amount(s.stocks[0]!),
      r = request(s, 0, 'VALID', '1');
    expect(() =>
      allocatePostwarOperatingSupplies(s, [
        request(s, 0, 'A', q),
        request(s, 0, 'B', '1'),
      ]),
    ).toThrow('global allocation exceeds');
    for (const [field, value] of Object.entries({
      worldId: 'WORLD_WRONG',
      countryId: 'COUNTRY_70',
      locationId: 'REGION_70_E1',
      serviceAssetId: 'OTHER_CLINIC',
      sourceId: 'OTHER_SOURCE',
      entryId: 'OTHER_ENTRY',
      commodityId: 'GRAIN',
      unit: 'tonne',
    }))
      expect(() =>
        allocatePostwarOperatingSupplies(s, [{ ...r, [field]: value }]),
      ).toThrow();
    expect(() =>
      allocatePostwarOperatingSupplies(s, [
        r,
        { ...r, allocationId: 'ALLOCATION_OTHER' },
      ]),
    ).toThrow('duplicate consumer');
    expect(() =>
      allocatePostwarOperatingSupplies(s, [{ ...r, quantity: '0' }]),
    ).toThrow('positive finite');
    expect(() =>
      allocatePostwarOperatingSupplies(s, [{ ...r, quantity: '1.0' }]),
    ).toThrow('canonical whole');
    expect(() =>
      allocatePostwarOperatingSupplies(s, [{ ...r, ready: true } as typeof r]),
    ).toThrow('closed allocation shape');
    expect(allocatePostwarOperatingSupplies(s, [r]).grants).toEqual([r]);
  });
  it('rejects source/policy/request-forged carriers and exports repeatable bytes without any original source mutation', async () => {
    const s = supply('DETERMINISM'),
      again = supply('DETERMINISM');
    expect(C.canonicalSerialize(again)).toBe(C.canonicalSerialize(s));
    expect(Object.isFrozen(s.stocks[0]!.entry)).toBe(true);
    expect(isPostwarOperatingSupplies(JSON.parse(JSON.stringify(s)))).toBe(
      false,
    );
    expect(() =>
      buildPostwarOperatingSupplies({
        ...input('INVALID'),
        policyBytes: policyBytes + ' ',
      }),
    ).toThrow('pinned generated');
    expect(() =>
      buildPostwarOperatingSupplies({
        ...input('INVALID'),
        countriesBytes: input('INVALID').countriesBytes + ' ',
      }),
    ).toThrow('source dataset bytes differ');
    expect(() =>
      appendPostwarOperatingSupplies(
        originalSeed(s),
        JSON.parse(JSON.stringify(s)),
      ),
    ).toThrow('genuine supplemental');
    for (const name of ['countries', 'regions'])
      expect(
        sha(
          await read(`artifacts/world-balanced-candidate-v1/data/${name}.json`),
        ),
      ).toBe(sha(sourceBytes.datasets[`data/${name}.json`]!));
    const directory = process.env.ECONMIND_POSTWAR_SUPPLIES_EVIDENCE_DIR;
    if (directory) {
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, 'supplies-carrier.json'),
        C.canonicalSerialize(s) + '\n',
        { mode: 0o600 },
      );
    }
  });
});
