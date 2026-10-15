import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestOnlyFinancialOpeningPackageRegistryLoader,
  type LoadedFinancialOpeningPackageRegistry,
} from '../../apps/world-worker/src/preparation/financial-opening-package-registry.js';
import {
  readNativeCashSourceCandidate,
  type NativeCashCandidateDocument,
} from '../../apps/world-worker/src/preparation/native-cash-source-candidate.js';
import {
  disposeFinancialOpeningPackageFixture,
  materializeFinancialOpeningPackageFixture,
  type OwnedFinancialOpeningPackageFixture,
} from '../support/financial-opening-package-fixture.js';

const expected = {
  worldId: 'WORLD_TEST_ONLY_NATIVE_CANDIDATE',
  worldVersion: '0',
  sourceVersion: 'SYNTHETIC_NATIVE_V1',
  asOf: '2026-10-15T00:00:00.000Z',
};
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
let fixture: OwnedFinancialOpeningPackageFixture | undefined;
let registry: LoadedFinancialOpeningPackageRegistry;
let mappingsBytes: string;
let mappingCount: number;
function finiteMappings() {
  return JSON.stringify({
    status: 'REFERENCE_CROSSWALK_NOT_ACCOUNT_BINDING',
    rows: [
      {
        entityId: 'ENTITY_GOVERNMENT_01',
        countryId: 'COUNTRY_01',
        legacyCountryId: 'visual-territory-01',
        legacyEntityId: 'GOV-01',
        sourceClass: 'REFERENCE_MAPPING_NOT_LEGAL_ACCOUNT_OR_CURRENT_AUTHORITY',
        actualAccount: null,
        actualHolderAdmission: null,
        actualCurrentAuthorization: null,
      },
      {
        entityId: 'ENTITY_BANK_01',
        countryId: 'COUNTRY_01',
        legacyCountryId: 'visual-territory-01',
        legacyEntityId: 'BANK-01',
        sourceClass: 'REFERENCE_MAPPING_NOT_LEGAL_ACCOUNT_OR_CURRENT_AUTHORITY',
        actualAccount: null,
        actualHolderAdmission: null,
        actualCurrentAuthorization: null,
      },
    ],
  });
}
function payload() {
  return {
    schemaVersion: 'native-cash-source-candidate-v1',
    ...expected,
    accounts: [
      {
        worldId: expected.worldId,
        accountId: 'ACCOUNT_SYNTHETIC_NATIVE_ONLY',
        ownerId: 'ENTITY_GOVERNMENT_01',
        countryId: 'COUNTRY_01',
        accountClass: 'CASH',
        currency: 'XAA',
        claimId: null,
        counterpartyEntityId: null,
      },
    ],
    balances: [
      {
        accountId: 'ACCOUNT_SYNTHETIC_NATIVE_ONLY',
        amount: '100.5',
        currency: 'XAA',
        asOf: expected.asOf,
      },
    ],
    entityBindings: [
      {
        entityId: 'ENTITY_GOVERNMENT_01',
        accountId: 'ACCOUNT_SYNTHETIC_NATIVE_ONLY',
        sourceHoldingKind: 'CASH',
      },
    ],
    encumbranceAtoms: [
      {
        atomId: 'ATOM_A',
        accountId: 'ACCOUNT_SYNTHETIC_NATIVE_ONLY',
        amount: '10.25',
        currency: 'XAA',
        asOf: expected.asOf,
      },
      {
        atomId: 'ATOM_B',
        accountId: 'ACCOUNT_SYNTHETIC_NATIVE_ONLY',
        amount: '2.25',
        currency: 'XAA',
        asOf: expected.asOf,
      },
    ],
    restrictionBasis: 'DECLARED_DISJOINT_CASH_ATOMS',
    restrictionsComplete: true,
    restrictions: [
      {
        restrictionId: 'FREEZE_A',
        kind: 'FROZEN',
        accountId: 'ACCOUNT_SYNTHETIC_NATIVE_ONLY',
        atomIds: ['ATOM_A'],
      },
      {
        restrictionId: 'PLEDGE_A',
        kind: 'PLEDGED',
        accountId: 'ACCOUNT_SYNTHETIC_NATIVE_ONLY',
        atomIds: ['ATOM_A'],
      },
      {
        restrictionId: 'EARMARK_B',
        kind: 'EARMARK',
        accountId: 'ACCOUNT_SYNTHETIC_NATIVE_ONLY',
        atomIds: ['ATOM_B'],
      },
    ],
  };
}
type Payload = ReturnType<typeof payload>;
function document(value = payload()): NativeCashCandidateDocument {
  const bytes = JSON.stringify(value);
  return {
    documentId: 'SYNTHETIC_NATIVE_SOURCE',
    classification: 'SYNTHETIC_CANDIDATE',
    sourceVersion: expected.sourceVersion,
    asOf: expected.asOf,
    bytes,
    sha256: sha(bytes),
  };
}
function read(value: Payload | null = payload()) {
  return readNativeCashSourceCandidate({
    registry,
    mappingsBytes,
    document: value === null ? null : document(value),
    expected,
  });
}
const selected = (result: ReturnType<typeof read>) =>
  result.rows.find((row) => row.entityId === 'ENTITY_GOVERNMENT_01')!;

beforeAll(async () => {
  mappingsBytes = finiteMappings();
  const crosswalkPath = process.env.F_NATIVE_CROSSWALK;
  if (crosswalkPath) {
    const metadata = await lstat(crosswalkPath);
    expect(metadata.isFile() && !metadata.isSymbolicLink()).toBe(true);
    expect(metadata.size).toBe(247422);
    mappingsBytes = await readFile(crosswalkPath, 'utf8');
    expect(sha(mappingsBytes)).toBe(
      'a311bd7db628c0bff9a0785c951d2c4046bba097589b1c7902794b44a4b85654',
    );
  }
  mappingCount = (JSON.parse(mappingsBytes) as { rows: unknown[] }).rows.length;
  fixture = await materializeFinancialOpeningPackageFixture();
  registry = await (
    await createTestOnlyFinancialOpeningPackageRegistryLoader({
      fixtureRoot: fixture.fixtureRoot,
    })
  ).load();
});
afterAll(async () => {
  const reportDirectory = process.env.F_NATIVE_REPORT_DIRECTORY;
  try {
    if (reportDirectory && registry && fixture) {
      const absolute = path.resolve(reportDirectory);
      expect(
        absolute.endsWith(
          '/unknown2544-closure-20261015/outputs/F/source-adapter-v1',
        ),
      ).toBe(true);
      const reports = {
        'SYNTHETIC_CANDIDATE_READBACK.json': read(),
        'REAL_MAPPING_NO_CASH_READBACK.json': read(null),
        'FIXTURE_IO.json': {
          fixture: fixture.io,
          registryReader: registry.testOnlyReadReceipt,
          mappingBytes: Buffer.byteLength(mappingsBytes),
          mappingCount,
          actualClosure: 0,
          note: 'Exact-byte fixture is TEST_ONLY; no source-adoption/World/current seat. This IO receipt does not measure compiler/test runner binary or all-pipeline IO.',
        },
      };
      for (const [name, report] of Object.entries(reports))
        await writeFile(
          path.join(absolute, name),
          JSON.stringify(report, null, 2) + '\n',
          { flag: 'wx' },
        );
    }
  } finally {
    if (fixture) await disposeFinancialOpeningPackageFixture(fixture);
  }
});

describe('offline native source -> existing Core account/snapshot -> candidate readback', () => {
  it('reads real registry and optional fixed 350 mappings without inventing missing cash', () => {
    const result = read(null);
    expect(result.rows).toHaveLength(mappingCount);
    expect(
      result.rows.every(
        (row) =>
          row.status === 'UNKNOWN' &&
          row.actualAvailableCash === null &&
          row.candidateBalance === null,
      ),
    ).toBe(true);
    expect(selected(result).archiveNativeClaim).toMatchObject({
      currency: 'XAA',
      unit: 'LC',
    });
  });
  it('runs positive synthetic hydration and overlap union with Core Money, never admission', () => {
    const result = read();
    expect(selected(result)).toMatchObject({
      status: 'DECLARED_CANDIDATE_NOT_ADOPTED',
      candidateBalance: { amount: '100.5', currency: 'XAA' },
      candidateRestricted: { amount: '12.5', currency: 'XAA' },
      candidateAvailable: { amount: '88', currency: 'XAA' },
      actualAvailableCash: null,
      currentPermission: 'UNKNOWN',
    });
    expect(result).toMatchObject({
      admissionAllowed: false,
      activationAllowed: false,
      authoritativeStateCreated: false,
      actualUnknownClosed: 0,
      currentPermissionIssued: false,
      formalClock: null,
    });
    expect(result.candidateSource?.signatureStatus).toBe(
      'NOT_VERIFIED_HASH_IS_NOT_SIGNATURE',
    );
    expect(Object.isFrozen(result.rows)).toBe(true);
  });
  it('keeps bank reserve/account identity separate from native cash and permission', () => {
    expect(
      read().rows.find((row) => row.entityId === 'ENTITY_BANK_01'),
    ).toMatchObject({
      status: 'UNKNOWN',
      actualAvailableCash: null,
      currentPermission: 'UNKNOWN',
      candidateAccount: null,
    });
  });
  it('rejects a copied registry object even if its flags and hashes look genuine', () => {
    expect(() =>
      readNativeCashSourceCandidate({
        registry: { ...registry },
        mappingsBytes,
        document: document(),
        expected,
      }),
    ).toThrow('GENUINE_REGISTRY_REQUIRED');
  });
  it('rejects changed bytes under a stale hash', () => {
    const doc = document();
    expect(() =>
      readNativeCashSourceCandidate({
        registry,
        mappingsBytes,
        document: { ...doc, bytes: doc.bytes + ' ' },
        expected,
      }),
    ).toThrow('SOURCE_HASH_MISMATCH');
  });
  it('rejects wrong source version', () => {
    const value = payload();
    value.sourceVersion = 'WRONG_VERSION';
    expect(() => read(value)).toThrow('SOURCE_SCOPE_VERSION_ASOF_MISMATCH');
  });
  it('rejects three empty source versions even when they agree', () => {
    const value = payload();
    value.sourceVersion = '';
    expect(() =>
      readNativeCashSourceCandidate({
        registry,
        mappingsBytes,
        document: { ...document(value), sourceVersion: '' },
        expected: { ...expected, sourceVersion: '' },
      }),
    ).toThrow();
  });
  it('rejects three whitespace-only source versions even when they agree', () => {
    const version = ' \t\n';
    const value = payload();
    value.sourceVersion = version;
    expect(() =>
      readNativeCashSourceCandidate({
        registry,
        mappingsBytes,
        document: { ...document(value), sourceVersion: version },
        expected: { ...expected, sourceVersion: version },
      }),
    ).toThrow();
  });
  it.each(['expected', 'document', 'snapshot'] as const)(
    'rejects an empty, blank, missing or wrongly typed %s source version',
    (location) => {
      for (const invalid of ['', ' \t', undefined, null, 7, true]) {
        const value = payload();
        const doc = { ...document(value) };
        const scope = { ...expected };
        if (location === 'snapshot') {
          const snapshot: Record<string, unknown> = { ...value };
          if (invalid === undefined) delete snapshot.sourceVersion;
          else snapshot.sourceVersion = invalid;
          doc.bytes = JSON.stringify(snapshot);
          doc.sha256 = sha(doc.bytes);
        } else {
          const target = location === 'expected' ? scope : doc;
          const untrusted = target as unknown as Record<string, unknown>;
          if (invalid === undefined) delete untrusted.sourceVersion;
          else untrusted.sourceVersion = invalid;
        }
        expect(() =>
          readNativeCashSourceCandidate({
            registry,
            mappingsBytes,
            document: doc,
            expected: scope,
          }),
        ).toThrow();
      }
    },
  );
  it('rejects a numeric snapshot version even if its lexeme matches string metadata', () => {
    const snapshot = { ...payload(), sourceVersion: 7 };
    const bytes = JSON.stringify(snapshot);
    expect(() =>
      readNativeCashSourceCandidate({
        registry,
        mappingsBytes,
        document: {
          ...document(),
          sourceVersion: '7',
          bytes,
          sha256: sha(bytes),
        },
        expected: { ...expected, sourceVersion: '7' },
      }),
    ).toThrow();
  });
  it('preserves exact nonblank version strings without trimming or defaulting', () => {
    for (const version of ['7', ' SYNTHETIC_NATIVE_V1 ']) {
      const value = payload();
      value.sourceVersion = version;
      const doc = { ...document(value), sourceVersion: version };
      const result = readNativeCashSourceCandidate({
        registry,
        mappingsBytes,
        document: doc,
        expected: { ...expected, sourceVersion: version },
      });
      expect(selected(result).candidateAvailable).toEqual({
        amount: '88',
        currency: 'XAA',
      });
      expect(result.candidateSource?.sourceVersion).toBe(version);
      expect(() =>
        readNativeCashSourceCandidate({
          registry,
          mappingsBytes,
          document: doc,
          expected: { ...expected, sourceVersion: version + ' ' },
        }),
      ).toThrow('SOURCE_SCOPE_VERSION_ASOF_MISMATCH');
    }
  });
  it('rejects wrong asOf rather than merging different valuation days', () => {
    const value = payload();
    value.balances[0]!.asOf = '2026-10-16T00:00:00.000Z';
    expect(() => read(value)).toThrow('BALANCE_ACCOUNT_CURRENCY_ASOF_MISMATCH');
  });
  it('rejects wrong candidate World/head', () => {
    const value = payload();
    value.worldId = 'WORLD_OTHER';
    expect(() => read(value)).toThrow('SOURCE_SCOPE_VERSION_ASOF_MISMATCH');
  });
  it('uses the Core snapshot validator to reject cross-World accounts', () => {
    const value = payload();
    value.accounts[0]!.worldId = 'WORLD_OTHER';
    expect(() => read(value)).toThrow(
      'Hydrated financial account belongs to a different World',
    );
  });
  it('does not treat Core implicit zero as explicit observed balance', () => {
    const value = payload();
    value.balances = [];
    expect(selected(read(value))).toMatchObject({
      status: 'UNKNOWN',
      reason: 'EXPLICIT_BALANCE_NOT_SUPPLIED',
      candidateBalance: null,
    });
  });
  it('can read a declared explicit zero, still never actual zero or authority', () => {
    const value = payload();
    value.balances[0]!.amount = '0';
    value.encumbranceAtoms = [];
    value.restrictions = [];
    expect(selected(read(value))).toMatchObject({
      status: 'DECLARED_CANDIDATE_NOT_ADOPTED',
      candidateAvailable: { amount: '0', currency: 'XAA' },
      actualAvailableCash: null,
    });
  });
  it('does not convert foreign-currency balances or rename GCU as native', () => {
    const value = payload();
    value.balances[0]!.currency = 'GCU';
    expect(() => read(value)).toThrow('BALANCE_ACCOUNT_CURRENCY_ASOF_MISMATCH');
  });
  it('denies wrong owner and country without exposing candidate quantities', () => {
    for (const field of ['ownerId', 'countryId'] as const) {
      const value = payload();
      value.accounts[0]![field] =
        field === 'ownerId' ? 'ENTITY_BANK_01' : 'COUNTRY_02';
      expect(selected(read(value))).toMatchObject({
        status: 'UNKNOWN',
        reason: 'ACCOUNT_OWNERSHIP_COUNTRY_CURRENCY_MISMATCH',
        candidateAvailable: null,
      });
    }
  });
  it('rejects claims/deposits/assets as actual native cash', () => {
    const value = payload();
    value.entityBindings[0]!.sourceHoldingKind = 'CLAIM';
    expect(selected(read(value)).reason).toBe('NOT_NATIVE_CASH');
    const asset = payload();
    asset.accounts[0]!.accountClass = 'ASSET';
    expect(selected(read(asset)).reason).toBe('NOT_NATIVE_CASH');
  });
  it('rejects duplicate restriction identities, not double-subtract or silently repair', () => {
    const value = payload();
    value.restrictions.push(structuredClone(value.restrictions[0]!));
    expect(() => read(value)).toThrow('DUPLICATE_RESTRICTIONID');
  });
  it('rejects duplicate encumbrance atom identities', () => {
    const value = payload();
    value.encumbranceAtoms.push(structuredClone(value.encumbranceAtoms[0]!));
    expect(() => read(value)).toThrow('DUPLICATE_ATOMID');
  });
  it('rejects duplicate balance/account identities through the same pipeline', () => {
    const value = payload();
    value.balances.push(structuredClone(value.balances[0]!));
    expect(() => read(value)).toThrow('DUPLICATE_ACCOUNTID');
  });
  it('unknown restriction completeness/overlap never becomes a computed amount', () => {
    const incomplete = payload();
    incomplete.restrictionsComplete = false;
    expect(selected(read(incomplete)).candidateAvailable).toBe(null);
    const overlap = payload();
    overlap.restrictionBasis = 'UNKNOWN';
    expect(selected(read(overlap)).reason).toBe(
      'RESTRICTION_COMPLETENESS_OR_OVERLAP_UNKNOWN',
    );
  });
  it('rejects restriction currency/asOf/scope mismatch', () => {
    for (const field of ['currency', 'asOf', 'accountId'] as const) {
      const value = payload();
      value.encumbranceAtoms[0]![field] = 'WRONG';
      expect(() => read(value)).toThrow(
        'RESTRICTION_CURRENCY_ASOF_SCOPE_MISMATCH',
      );
    }
  });
  it('rejects missing and repeated restriction atom references', () => {
    const missing = payload();
    missing.restrictions[0]!.atomIds = ['ABSENT'];
    expect(() => read(missing)).toThrow('RESTRICTION_ATOM_SCOPE_MISMATCH');
    const duplicate = payload();
    duplicate.restrictions[0]!.atomIds = ['ATOM_A', 'ATOM_A'];
    expect(() => read(duplicate)).toThrow('RESTRICTION_ATOM_IDS_INVALID');
  });
  it('does not clamp over-restricted cash to zero', () => {
    const value = payload();
    value.encumbranceAtoms[0]!.amount = '1000';
    expect(selected(read(value))).toMatchObject({
      status: 'UNKNOWN',
      reason: 'RESTRICTIONS_EXCEED_BALANCE',
      candidateAvailable: null,
    });
  });
  it('uses existing exact Money arithmetic above 2^53', () => {
    const value = payload();
    value.balances[0]!.amount = '9007199254740993.25';
    value.encumbranceAtoms[0]!.amount = '0.125';
    value.encumbranceAtoms[1]!.amount = '0.125';
    expect(selected(read(value)).candidateAvailable).toEqual({
      amount: '9007199254740993',
      currency: 'XAA',
    });
  });
  it('repeated readback is deterministic and does not mutate input or issue CURRENT', () => {
    const value = payload(),
      before = JSON.stringify(value);
    expect(read(value)).toEqual(read(value));
    expect(JSON.stringify(value)).toBe(before);
    expect(
      read(value).rows.every((row) => row.currentPermission === 'UNKNOWN'),
    ).toBe(true);
  });
});
