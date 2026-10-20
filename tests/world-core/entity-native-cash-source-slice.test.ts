/** Isolated source-reader mechanisms only; these vectors never close B06/B07. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestOnlyFinancialOpeningPackageRegistryLoader,
  type LoadedFinancialOpeningPackageRegistry,
} from '../../apps/world-worker/src/preparation/financial-opening-package-registry.js';
import { financialInputSha256 } from '../../apps/world-worker/src/preparation/formal-financial-opening-contract.js';
import {
  readEntityCashCountrySourceSlice,
  readIsolatedEntityCashPair,
  type EntityCashCountrySourceSlice,
  type EntityCashSliceInput,
} from '../../apps/world-worker/src/preparation/entity-native-cash-source-slice.js';
import {
  disposeFinancialOpeningPackageFixture,
  materializeFinancialOpeningPackageFixture,
  type OwnedFinancialOpeningPackageFixture,
} from '../support/financial-opening-package-fixture.js';
import {
  declaredEntityCashVector,
  originalEntityFixture,
} from '../support/entity-native-cash-candidate-fixture.js';

let fixture: OwnedFinancialOpeningPackageFixture;
let registry: LoadedFinancialOpeningPackageRegistry;
beforeAll(async () => {
  fixture = await materializeFinancialOpeningPackageFixture();
  registry = await (
    await createTestOnlyFinancialOpeningPackageRegistryLoader({
      fixtureRoot: fixture.fixtureRoot,
    })
  ).load();
});
afterAll(async () => {
  if (fixture) await disposeFinancialOpeningPackageFixture(fixture);
});
function input(
  declaredInput: EntityCashSliceInput['declaredInput'] = declaredEntityCashVector().input(),
): EntityCashSliceInput {
  const original = originalEntityFixture();
  return {
    registry,
    countryId: 'COUNTRY_01',
    mappings: {
      documentId: 'TEST_ONLY_REFERENCE_MAPPING',
      bytes: original.mappingsBytes,
      sha256: financialInputSha256(original.mappingsBytes),
    },
    originalFields: original.originalFields.filter(
      (r) => r.countryId === 'COUNTRY_01',
    ),
    declaredInput,
  };
}
function pair(
  slice: EntityCashCountrySourceSlice,
  payerEntityId = 'ENTITY_GOVERNMENT_01',
  payeeEntityId = 'ENTITY_OPERATOR_01',
) {
  return {
    slice,
    purpose: 'CANDIDATE_DIAGNOSTIC' as const,
    payerEntityId,
    payeeEntityId,
    currency: 'XAA',
    scope: slice.declaredScope,
  };
}

describe('bounded B06/B07 original COUNTRY01 source slice, not admission', () => {
  it('keeps ten exact original IDs, five economic entities and independent parent batches', () => {
    const r = readEntityCashCountrySourceSlice(input());
    expect(r.rows).toHaveLength(10);
    expect(new Set(r.rows.map((row) => row.stableId)).size).toBe(10);
    expect(new Set(r.rows.map((row) => row.ownerId)).size).toBe(5);
    for (const batch of ['B06', 'B07'])
      expect(r.rows.filter((row) => row.batchId === batch)).toHaveLength(5);
    expect(
      r.rows.every(
        (row) =>
          row.actualValue === null &&
          row.actualAdmission === null &&
          row.actualCurrency === null &&
          row.actualPeriod === null &&
          row.actualWorldHead === null,
      ),
    ).toBe(true);
    expect(
      r.rows.every((row) =>
        Object.values(row.originalFieldStages).every((v) => v === false),
      ),
    ).toBe(true);
    expect(r.actualUnknownClosed).toBe(0);
    expect(
      r.sourceAdoption ||
        r.productionAuthority ||
        r.admissionAllowed ||
        r.activationAllowed ||
        r.runtimeConnected,
    ).toBe(false);
  });
  it('does not manufacture scope, account identities, zero cash or restriction sets for absent sources', () => {
    const r = readEntityCashCountrySourceSlice(input(null));
    expect(r.declaredScope).toBeNull();
    expect(r.actualScope).toBeNull();
    expect(r.builderInvoked).toBe(false);
    expect(r.accountIdsIssued).toBe(0);
    expect(
      r.rows.every(
        (row) => row.candidateValue === null && row.candidateValueDate === null,
      ),
    ).toBe(true);
    for (const row of r.rows.filter((row) => row.batchId === 'B07'))
      expect(row.candidateCalculation).toEqual({
        balance: null,
        restrictedUnion: null,
        available: null,
      });
    const result = readIsolatedEntityCashPair(pair(r));
    expect(result.payer).toBeNull();
    expect(result.payee).toBeNull();
    expect(result.actualSpendable).toBeNull();
    expect(result.paymentExecuted).toBe(false);
  });
  it('uses the existing exact journal and restriction UNION without adding frozen+pledged+earmark three times', () => {
    const r = readEntityCashCountrySourceSlice(input());
    const cash = r.rows.filter((row) => row.batchId === 'B07');
    expect(
      cash.every(
        (row) => row.candidateCalculation?.restrictedUnion?.amount === '10.25',
      ),
    ).toBe(true);
    expect(
      cash.every(
        (row) => row.candidateCalculation?.balance?.amount === '100.5',
      ),
    ).toBe(true);
    expect(
      cash.every(
        (row) => row.candidateCalculation?.available?.amount === '90.25',
      ),
    ).toBe(true);
    const result = readIsolatedEntityCashPair(pair(r));
    expect(result.status).toBe('DECLARED_PAIR_READBACK_NOT_ADMITTED');
    expect(result.payer?.entityId).toBe('ENTITY_GOVERNMENT_01');
    expect(result.payee?.entityId).toBe('ENTITY_OPERATOR_01');
    expect(result.actualSpendable).toBeNull();
    expect(result.admissionAllowed).toBe(false);
  });
  it('retains B06 candidate account with B07 absent and atomically withholds both diagnostic endpoints', () => {
    const v = declaredEntityCashVector();
    const r = readEntityCashCountrySourceSlice(
      input({
        ...v.input(),
        selections: v.selections.map((s) => ({ ...s, cash: null })),
      }),
    );
    expect(
      r.rows
        .filter((row) => row.batchId === 'B06')
        .every((row) => row.candidateValue !== null),
    ).toBe(true);
    expect(
      r.rows
        .filter((row) => row.batchId === 'B07')
        .every((row) => row.candidateValue === null),
    ).toBe(true);
    const result = readIsolatedEntityCashPair(pair(r));
    expect(result.payer).toBeNull();
    expect(result.payee).toBeNull();
  });
  it.each(['payer', 'payee'] as const)(
    'withholds both ends if only %s cash evidence is missing',
    (side) => {
      const v = declaredEntityCashVector(),
        missing =
          side === 'payer' ? 'ENTITY_GOVERNMENT_01' : 'ENTITY_OPERATOR_01';
      const r = readEntityCashCountrySourceSlice(
        input({
          ...v.input(),
          selections: v.selections.map((s) =>
            s.entityId === missing ? { ...s, cash: null } : s,
          ),
        }),
      );
      const result = readIsolatedEntityCashPair(pair(r));
      expect(result.status).toBe(
        'BLOCKED_BOTH_ENDPOINTS_REQUIRE_COMPLETE_CANDIDATE_CASH',
      );
      expect(result.payer).toBeNull();
      expect(result.payee).toBeNull();
    },
  );
  it.each(['TGA_CLAIM', 'CB_RESERVE_CLAIM', 'DEPOSIT_CLAIM'])(
    'does not pool %s into cash',
    (purpose) => {
      const v = declaredEntityCashVector();
      v.source.rows[0]!.account.purpose = purpose;
      const r = readEntityCashCountrySourceSlice(input(v.input()));
      expect(
        r.rows.find(
          (row) =>
            row.ownerId === 'ENTITY_GOVERNMENT_01' && row.batchId === 'B06',
        )!.candidateValue,
      ).toBeNull();
      const result = readIsolatedEntityCashPair(pair(r));
      expect(result.payer).toBeNull();
      expect(result.payee).toBeNull();
    },
  );
  it('rejects unknown restrictions rather than guessing disjointness', () => {
    const v = declaredEntityCashVector();
    v.source.rows[0]!.cash.restrictionsComplete = false;
    expect(() => readEntityCashCountrySourceSlice(input(v.input()))).toThrow(
      'RESTRICTION_COMPLETENESS_OR_OVERLAP_UNKNOWN',
    );
  });
  it('does not clip restrictions exceeding balance to zero available cash', () => {
    const v = declaredEntityCashVector();
    v.source.rows[0]!.cash.encumbranceAtoms[0]!.amount = '101';
    const r = readEntityCashCountrySourceSlice(input(v.input()));
    expect(
      r.rows.find(
        (row) =>
          row.ownerId === 'ENTITY_GOVERNMENT_01' && row.batchId === 'B07',
      )!.candidateValue,
    ).toBeNull();
    expect(readIsolatedEntityCashPair(pair(r)).payer).toBeNull();
  });
  it('never treats a balanced journal, fixture or hash as source admission or current authority', () => {
    const r = readEntityCashCountrySourceSlice(input());
    expect(() =>
      readIsolatedEntityCashPair({ ...pair(r), purpose: 'FORMAL_SETTLEMENT' }),
    ).toThrow('SOURCE_ADMISSION_AND_CURRENT_AUTHORIZATION_REQUIRED');
    expect(() =>
      readIsolatedEntityCashPair({ ...pair(r), slice: { ...r } }),
    ).toThrow('GENUINE_ENTITY_CASH_SLICE_REQUIRED');
    expect(Object.isFrozen(r.rows)).toBe(true);
  });
  it('rejects currency conversion, foreign or same endpoints', () => {
    const r = readEntityCashCountrySourceSlice(input());
    expect(() =>
      readIsolatedEntityCashPair({ ...pair(r), currency: 'GCU' }),
    ).toThrow('PAIR_NATIVE_CURRENCY_MISMATCH');
    expect(() =>
      readIsolatedEntityCashPair(pair(r, 'ENTITY_GOVERNMENT_02')),
    ).toThrow('PAIR_ENTITY_OUTSIDE_SOURCE_SLICE');
    expect(() =>
      readIsolatedEntityCashPair(pair(r, 'ENTITY_OPERATOR_01')),
    ).toThrow('DISTINCT_ENDPOINTS_REQUIRED');
  });
  it.each(['worldId', 'worldVersion', 'sourceVersion', 'asOf'] as const)(
    'rejects wrong paired-read %s',
    (field) => {
      const r = readEntityCashCountrySourceSlice(input());
      expect(() =>
        readIsolatedEntityCashPair({
          ...pair(r),
          scope: { ...r.declaredScope!, [field]: 'NOT_CURRENT' },
        }),
      ).toThrow('PAIR_WORLD_HEAD_SOURCE_DATE_MISMATCH');
    },
  );
  it('rejects foreign, duplicated or incomplete original ID subsets', () => {
    const x = input();
    expect(() =>
      readEntityCashCountrySourceSlice({
        ...x,
        originalFields: x.originalFields.slice(1),
      }),
    ).toThrow('EXACT_TEN_ORIGINAL_IDS_REQUIRED');
    expect(() =>
      readEntityCashCountrySourceSlice({
        ...x,
        originalFields: [x.originalFields[0]!, ...x.originalFields.slice(0, 9)],
      }),
    ).toThrow('EXACT_TEN_ORIGINAL_IDS_REQUIRED');
    expect(() =>
      readEntityCashCountrySourceSlice({
        ...x,
        originalFields: x.originalFields.map((r, i) =>
          i === 0 ? { ...r, countryId: 'COUNTRY_02' } : r,
        ),
      }),
    ).toThrow('EXACT_TEN_ORIGINAL_IDS_REQUIRED');
  });
  it('rejects forged registry, stale mapping bytes, ambiguous mapping and foreign native selection', () => {
    const x = input();
    expect(() =>
      readEntityCashCountrySourceSlice({ ...x, registry: { ...registry } }),
    ).toThrow('GENUINE_REGISTRY_REQUIRED');
    expect(() =>
      readEntityCashCountrySourceSlice({
        ...x,
        mappings: { ...x.mappings, bytes: x.mappings.bytes + ' ' },
      }),
    ).toThrow('MAPPING_PIN_MISMATCH');
    const document = JSON.parse(x.mappings.bytes);
    document.rows.push(document.rows[0]);
    const bytes = JSON.stringify(document);
    expect(() =>
      readEntityCashCountrySourceSlice({
        ...x,
        mappings: { ...x.mappings, bytes, sha256: financialInputSha256(bytes) },
      }),
    ).toThrow('MAPPING_COUNT_BUDGET');
    const v = declaredEntityCashVector();
    expect(() =>
      readEntityCashCountrySourceSlice(
        input({
          ...v.input(),
          selections: [{ ...v.selections[0]!, nativeCurrency: 'GCU' }],
        }),
      ),
    ).toThrow('SELECTION_NOT_ORIGINAL_NATIVE_ENTITY');
  });
});
