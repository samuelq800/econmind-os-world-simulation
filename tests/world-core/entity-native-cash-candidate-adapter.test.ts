import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  createTestOnlyFinancialOpeningPackageRegistryLoader,
  type LoadedFinancialOpeningPackageRegistry,
} from '../../apps/world-worker/src/preparation/financial-opening-package-registry.js';
import { readEntityNativeCashCandidates } from '../../apps/world-worker/src/preparation/entity-native-cash-candidate-adapter.js';
import { financialInputSha256 } from '../../apps/world-worker/src/preparation/formal-financial-opening-contract.js';
import {
  materializeFinancialOpeningPackageFixture,
  disposeFinancialOpeningPackageFixture,
  type OwnedFinancialOpeningPackageFixture,
} from '../support/financial-opening-package-fixture.js';
import {
  cashScope,
  declaredEntityCashVector,
  originalEntityFixture,
} from '../support/entity-native-cash-candidate-fixture.js';

let fixture: OwnedFinancialOpeningPackageFixture;
let registry: LoadedFinancialOpeningPackageRegistry;
beforeAll(async () => {
  fixture = await materializeFinancialOpeningPackageFixture();
  const load = await createTestOnlyFinancialOpeningPackageRegistryLoader({
    fixtureRoot: fixture.fixtureRoot,
  });
  registry = await load.load();
});
afterAll(async () => {
  if (fixture) await disposeFinancialOpeningPackageFixture(fixture);
});
function input() {
  return {
    registry,
    ...originalEntityFixture(),
    ...declaredEntityCashVector().input(),
  };
}

describe('per-original B06/B07 inactive candidate adapter', () => {
  it('v2 separates positive candidate checks from unchanged original stages and drops legacy flat stage properties', () => {
    const x = input();
    const r = readEntityNativeCashCandidates({
      ...x,
      originalFields: x.originalFields.map((row) => ({
        ...row,
        engineeringWired: true,
        validationPassed: true,
        sourceComplete: true,
        formallyAdopted: true,
      })),
    });
    expect(r.schemaVersion).toBe(
      'entity-native-cash-original-candidate-readback-v2',
    );
    expect(r.rows.filter((row) => row.candidateValidationPassed)).toHaveLength(
      10,
    );
    for (const row of r.rows) {
      expect(row.candidateEngineeringWired).toBe(true);
      expect(row.originalFieldStages).toEqual({
        sourceComplete: false,
        engineeringWired: false,
        validationPassed: false,
        formallyAdopted: false,
      });
      for (const key of [
        'sourceComplete',
        'engineeringWired',
        'validationPassed',
        'formallyAdopted',
      ])
        expect(Object.hasOwn(row, key)).toBe(false);
      expect(Object.isFrozen(row.originalFieldStages)).toBe(true);
    }
    expect(r.axesMeaning.engineeringWired).toContain('Actual original-field');
    expect(r.candidateAxesMeaning.candidateEngineeringWired).toContain(
      'Offline builder',
    );
    expect(r.actualUnknownClosed).toBe(0);
    expect(r.runtimeConnected).toBe(false);
  });
  it('covers 350 accounts and 350 cash fields, including every economic entity class', () => {
    const r = readEntityNativeCashCandidates(input());
    expect(r.rows).toHaveLength(700);
    expect(new Set(r.rows.map((row) => row.stableId)).size).toBe(700);
    for (const batchId of ['B06', 'B07']) {
      expect(r.rows.filter((row) => row.batchId === batchId)).toHaveLength(350);
      expect(
        r.rows.filter(
          (row) => row.batchId === batchId && row.candidateSourceComplete,
        ),
      ).toHaveLength(5);
    }
    for (const row of r.rows.filter(
      (row) => row.batchId === 'B07' && row.candidateValue !== null,
    )) {
      expect(row.candidateValue).toEqual({ amount: '90.25', currency: 'XAA' });
      expect(row.availableCalculation?.restrictedUnion?.amount).toBe('10.25');
    }
    expect(r.rows.filter((row) => row.candidateValue === null)).toHaveLength(
      690,
    );
    expect(
      r.rows.every(
        (row) =>
          row.actualValue === null &&
          !row.originalFieldStages.sourceComplete &&
          !row.originalFieldStages.engineeringWired &&
          !row.originalFieldStages.validationPassed &&
          !row.originalFieldStages.formallyAdopted &&
          row.candidateEngineeringWired &&
          row.currentPermission === 'UNKNOWN',
      ),
    ).toBe(true);
    expect(
      r.sourceAdoption ||
        r.runtimeConnected ||
        r.authoritativeStateCreated ||
        r.admissionAllowed ||
        r.activationAllowed ||
        r.currentPermissionIssued,
    ).toBe(false);
    expect(r.actualUnknownClosed).toBe(0);
    expect(r.formalClock).toBeNull();
  });
  it('does not fill missing balance or claim buckets with zero', () => {
    const r = readEntityNativeCashCandidates({
      ...input(),
      documents: [],
      selections: [],
    });
    expect(r.sourceDocument).toBeNull();
    expect(
      r.rows.every(
        (row) => row.candidateValue === null && !row.candidateValidationPassed,
      ),
    ).toBe(true);
  });
  it('separates an available account candidate from missing cash proof', () => {
    const v = declaredEntityCashVector();
    const r = readEntityNativeCashCandidates({
      ...input(),
      selections: [{ ...v.selections[0]!, cash: null }],
    });
    expect(
      r.rows.find(
        (row) =>
          row.ownerId === 'ENTITY_GOVERNMENT_01' && row.batchId === 'B06',
      )!.candidateValue,
    ).not.toBeNull();
    expect(
      r.rows.find(
        (row) =>
          row.ownerId === 'ENTITY_GOVERNMENT_01' && row.batchId === 'B07',
      )!.candidateValue,
    ).toBeNull();
  });
  it('retains explicit zero only when a complete zero journal and restrictions prove it', () => {
    const v = declaredEntityCashVector();
    for (const row of v.source.rows) {
      row.cash.openingBalance = '0';
      row.cash.closingBalance = '0';
      row.cash.flows = [];
      row.cash.encumbranceAtoms = [];
      row.cash.restrictions = [];
    }
    const r = readEntityNativeCashCandidates({ ...input(), ...v.input() });
    const zero = r.rows.filter(
      (row) => row.batchId === 'B07' && row.candidateValue !== null,
    );
    expect(zero).toHaveLength(5);
    expect(
      zero.every(
        (row) => (row.candidateValue as { amount: string }).amount === '0',
      ),
    ).toBe(true);
  });
  it('rejects a foreign ID, duplicate original, missing batch or wrong role coverage', () => {
    const x = input();
    expect(() =>
      readEntityNativeCashCandidates({
        ...x,
        originalFields: [
          x.originalFields[0]!,
          ...x.originalFields.slice(1, -1),
          x.originalFields[0]!,
        ],
      }),
    ).toThrow('ORIGINAL_FIELD_BATCH_IDENTITY_MISMATCH');
    expect(() =>
      readEntityNativeCashCandidates({ ...x, batches: x.batches.slice(1) }),
    ).toThrow('ORIGINAL_B06_B07_COVERAGE_REQUIRED');
    const m = JSON.parse(x.mappingsBytes);
    m.rows[0].entityId = 'ENTITY_GOVERNMENT_71';
    expect(() =>
      readEntityNativeCashCandidates({
        ...x,
        mappingsBytes: JSON.stringify(m),
      }),
    ).toThrow('ORIGINAL_FIVE_ENTITY_ROLES_REQUIRED');
  });
  it('does not accept GCU as native currency or a fabricated registry', () => {
    const x = input();
    expect(() =>
      readEntityNativeCashCandidates({
        ...x,
        selections: [{ ...x.selections[0]!, nativeCurrency: 'GCU' }],
      }),
    ).toThrow('SELECTION_NOT_ORIGINAL_NATIVE_ENTITY');
    expect(() =>
      readEntityNativeCashCandidates({ ...x, registry: { ...registry } }),
    ).toThrow('GENUINE_REGISTRY_REQUIRED');
  });
  it('reuses existing oracle to reject over-restriction and duplicate atom identities', () => {
    const v = declaredEntityCashVector();
    v.source.rows[0]!.cash.encumbranceAtoms[0]!.amount = '101';
    const r = readEntityNativeCashCandidates({ ...input(), ...v.input() });
    const row = r.rows.find(
      (r) => r.batchId === 'B07' && r.ownerId === 'ENTITY_GOVERNMENT_01',
    )!;
    expect(row.candidateValue).toBeNull();
    expect(row.candidateValidationPassed).toBe(false);
    expect(row.reason).toBe('RESTRICTIONS_EXCEED_BALANCE');
    v.source.rows[0]!.cash.encumbranceAtoms.push(
      v.source.rows[0]!.cash.encumbranceAtoms[0]!,
    );
    expect(() =>
      readEntityNativeCashCandidates({ ...input(), ...v.input() }),
    ).toThrow('DUPLICATE_ATOMID');
  });
  it.runIf(process.env.F700_ORIGINAL_PROFILE === '1')(
    'matches pinned original 700 IDs and accepted B06/B07, without promoting missing sources',
    async () => {
      const crosswalkBytes = await readFile(
        '/Users/samuel/Documents/econclub/.econmind-artifacts/unknown2544-closure-20261015/outputs/F/first-batch-v1/ENTITY_CROSSWALK.json',
        'utf8',
      );
      const ledgerBytes = await readFile(
        '/Users/samuel/Documents/Codex/2026-10-13/task/unknown2544-completion-v1/UNKNOWN_LEDGER.json',
        'utf8',
      );
      const batchBytes = await readFile(
        '/Users/samuel/Documents/econclub/.econmind-artifacts/unknown2544-resume-20261018/input-approved17/execution_batches.json',
        'utf8',
      );
      expect(financialInputSha256(crosswalkBytes)).toBe(
        'a311bd7db628c0bff9a0785c951d2c4046bba097589b1c7902794b44a4b85654',
      );
      expect(financialInputSha256(ledgerBytes)).toBe(
        'cedd88979d3cd8dd148d151906ebf5ddee76a76c5c706659676796f58b3a9ccb',
      );
      expect(financialInputSha256(batchBytes)).toBe(
        'de8d1d9c52400d675b276f2e9df14ba79870647b579da29630a10746a28fa741',
      );
      const originalFields = JSON.parse(ledgerBytes).records.filter(
        (r: Record<string, unknown>) =>
          r.scope === 'ENTITY' &&
          ['account', 'availableNativeCash'].includes(String(r.missingField)),
      );
      const batches = JSON.parse(batchBytes).filter((b: { batchId: string }) =>
        ['B06', 'B07'].includes(b.batchId),
      );
      const r = readEntityNativeCashCandidates({
        registry,
        mappingsBytes: crosswalkBytes,
        originalFields,
        batches,
        expected: cashScope,
        documents: [],
        selections: [],
      });
      expect(r.rows).toHaveLength(700);
      expect(
        r.rows.every(
          (row) => row.actualValue === null && row.candidateValue === null,
        ),
      ).toBe(true);
      expect(r.rows.map((row) => row.stableId).sort()).toEqual(
        batches.flatMap((b: { stableIds: string[] }) => b.stableIds).sort(),
      );
    },
  );
});
