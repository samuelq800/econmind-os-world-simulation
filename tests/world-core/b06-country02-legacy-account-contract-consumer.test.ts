/** PREPARATION_ONLY_NOT_V09_2_STARTED. Mechanisms, not source issuance/adoption.
 * A intent MANIFEST: 872d9398c55332a923dc7040ac3761386467fecfcce481f9a62ff9abf55d9914
 * B scope FREEZE: 80e056fb6884e1e5f3c222effdd17dd8b0aaedec2091fdb31d7340e2eb1b4958
 * Root GO: 561f64054f51f708ea3da409e2e923054bc1a23ef666d9d824b74fbbb64628ea
 * The A dossier/ISSUED_POSITIVE is NOT a FinancialAccount. These inline,
 * explicitly synthetic Core-native vectors are not a converter for that dossier.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createFinancialAccount,
  type FinancialAccount,
} from '../../packages/core/src/index.js';
import {
  createTestOnlyFinancialOpeningPackageRegistryLoader,
  registryArray,
  registryRow,
  registryString,
  resolveFinancialRegistrySource,
  type LoadedFinancialOpeningPackageRegistry,
} from '../../apps/world-worker/src/preparation/financial-opening-package-registry.js';
import { financialInputSha256 } from '../../apps/world-worker/src/preparation/formal-financial-opening-contract.js';
import {
  readEntityCashCountrySourceSlice,
  readIsolatedEntityCashPair,
  type EntityCashCountrySourceSlice,
  type EntityCashSliceInput,
} from '../../apps/world-worker/src/preparation/entity-native-cash-source-slice.js';
import { B06_C01_DEFINITION_VERSION } from '../../apps/world-worker/src/preparation/b06-country01-typed-register-preparation.js';
import {
  disposeFinancialOpeningPackageFixture,
  materializeFinancialOpeningPackageFixture,
  type OwnedFinancialOpeningPackageFixture,
} from '../support/financial-opening-package-fixture.js';
import { originalEntityFixture } from '../support/entity-native-cash-candidate-fixture.js';

const scope = {
  worldId: 'WORLD_SYNTHETIC_C02_CONTRACT_ONLY',
  worldVersion: '0',
  sourceVersion: 'SYNTHETIC_C02_CONTRACT_ONLY_V1',
  asOf: '2026-10-23T00:00:00.000Z',
};
const gov = 'ENTITY_GOVERNMENT_02';
const owners = [
  gov,
  'ENTITY_OPERATOR_02',
  'ENTITY_HOUSEHOLDS_02',
  'ENTITY_BANK_02',
  'ENTITY_CENTRAL_BANK_02',
];
// The cast is deliberately at the untrusted-input boundary. Core must validate
// runtime fields, not let branded TypeScript inputs make negative tests vacuous.
function core(input: Record<string, unknown>) {
  return createFinancialAccount(input as unknown as FinancialAccount);
}
function syntheticAccount(currency: string): Record<string, unknown> {
  return {
    worldId: scope.worldId,
    accountId: 'ACCOUNT_SYNTHETIC_GOV02_CONTRACT_ONLY',
    ownerId: gov,
    countryId: 'COUNTRY_02',
    accountClass: 'CASH',
    currency,
    claimId: null,
    counterpartyEntityId: null,
  };
}

describe('C02 eight-field Core shape only', () => {
  // No hooks, loader, fixture I/O or assertion of adopted currency here.
  const syntaxCurrency = 'USD';
  it('returns exactly eight frozen fields and strips issuer/purpose/holding extras', () => {
    const input: Record<string, unknown> = {
      ...syntheticAccount(syntaxCurrency),
      issuerId: 'ENTITY_CENTRAL_BANK_02',
      purpose: 'CASH_ON_HAND',
      sourceHoldingKind: 'CASH',
    };
    const result = core(input);
    expect(result).toEqual(syntheticAccount(syntaxCurrency));
    expect(Object.keys(result).sort()).toEqual(
      Object.keys(syntheticAccount(syntaxCurrency)).sort(),
    );
    expect(Object.keys(result)).toHaveLength(8);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result).not.toBe(input);
    input.ownerId = 'ENTITY_BANK_02';
    expect(result.ownerId).toBe(gov);
    expect(result).not.toHaveProperty('balance');
    expect(result).not.toHaveProperty('actualSpendable');
  });
  it.each(['claimId', 'counterpartyEntityId'] as const)(
    'requires explicit nullable %s, never omission',
    (key) => {
      expect(core(syntheticAccount(syntaxCurrency))[key]).toBeNull();
      const missing = syntheticAccount(syntaxCurrency);
      delete missing[key];
      expect(() => core(missing)).toThrow();
      expect(() => core({ ...missing, [key]: undefined })).toThrow();
    },
  );
  it('rejects omission of both nullable fields rather than defaulting them', () => {
    const missing = syntheticAccount(syntaxCurrency);
    delete missing.claimId;
    delete missing.counterpartyEntityId;
    expect(() => core(missing)).toThrow();
  });
  it.each([
    { claimId: 'CLAIM_SYNTHETIC_C02' },
    { counterpartyEntityId: 'ENTITY_BANK_02' },
  ])('rejects a one-sided claim pair %j', (patch) => {
    expect(() =>
      core({ ...syntheticAccount(syntaxCurrency), ...patch }),
    ).toThrow('Claim and counterparty entity identities must appear together');
  });
  it.each([
    ['worldId', 'not a world'],
    ['accountId', ''],
    ['ownerId', 'bad owner'],
    ['countryId', 'country_02'],
    ['accountClass', 'NOT_A_CLASS'],
    ['currency', 'TEST_ONLY_NOT_A_CURRENCY'],
    ['currency', 'usd'],
  ])('rejects malformed %s=%s', (key, value) => {
    expect(() =>
      core({ ...syntheticAccount(syntaxCurrency), [key]: value }),
    ).toThrow();
  });
  it.each(['ASSET', 'LIABILITY', 'DEPOSIT'])(
    'accepts valid paired %s at Core without calling it free cash',
    (accountClass) => {
      const result = core({
        ...syntheticAccount(syntaxCurrency),
        accountClass,
        claimId: 'CLAIM_SYNTHETIC_C02',
        counterpartyEntityId: 'ENTITY_BANK_02',
      });
      expect(result.accountClass).toBe(accountClass);
      expect(result.claimId).toBe('CLAIM_SYNTHETIC_C02');
      expect(result).not.toHaveProperty('availableNativeCash');
    },
  );
});

describe('C02 single-source existing consumer', () => {
  let fixture: OwnedFinancialOpeningPackageFixture | undefined;
  let registry: LoadedFinancialOpeningPackageRegistry;
  let currency: string;
  const original = originalEntityFixture();

  beforeAll(async () => {
    fixture = await materializeFinancialOpeningPackageFixture();
    // Actual opaque helper-created root, recorded BEFORE it is supplied to loader.
    console.info(
      'F_C02_OWNED_FIXTURE_BEFORE_USE',
      JSON.stringify({
        fixtureRoot: fixture.fixtureRoot,
        io: fixture.io,
        accounting:
          'Helper content-byte receipt; not OS I/O or metadata syscall totals',
      }),
    );
    registry = await (
      await createTestOnlyFinancialOpeningPackageRegistryLoader({
        fixtureRoot: fixture.fixtureRoot,
      })
    ).load();
    console.info(
      'F_C02_LOADER_RECEIPT',
      JSON.stringify({
        bytesRead: registry.bytesRead,
        receipt: registry.testOnlyReadReceipt,
      }),
    );
    const native = resolveFinancialRegistrySource(registry, {
      sourceId: 'native_lc',
      selector: { kind: 'JSON_POINTER', pointer: '/countries' },
    });
    expect(native.status).toBe('VERIFIED_LEAF');
    if (native.status !== 'VERIFIED_LEAF')
      throw new Error('C02_NATIVE_FIXTURE_NOT_RESOLVED');
    const rows = registryArray(native.value, 'native.countries')
      .map((r) => registryRow(r, 'native.country'))
      .filter((r) => r.countryId === 'COUNTRY_02');
    expect(rows).toHaveLength(1);
    currency = registryString(rows[0]!.currencyCode, 'currencyCode');
    expect(
      registry.countries.find((r) => r.countryId === 'COUNTRY_02')!
        .nativeCurrency,
    ).toBe(currency);
    console.info('F_C02_REFERENCE_CURRENCY_NOT_ADOPTION', currency);
  });
  afterAll(async () => {
    if (fixture) {
      await disposeFinancialOpeningPackageFixture(fixture);
      console.info('F_C02_OWNED_CLEANUP_COMPLETE', fixture.fixtureRoot);
    }
  });

  function vector() {
    const source = {
      schemaVersion: 'entity-native-cash-source-v1',
      ...scope,
      // Explicit SYNTHETIC_CANDIDATE projection; no A dossier/provider input.
      account: {
        account: syntheticAccount(currency),
        issuerId: 'ENTITY_CENTRAL_BANK_02',
        purpose: 'NATIVE_CASH_SETTLEMENT',
        sourceHoldingKind: 'CASH',
      },
    };
    const input = (): NonNullable<EntityCashSliceInput['declaredInput']> => {
      const bytes = JSON.stringify(source);
      return {
        expected: scope,
        documents: [
          {
            documentId: 'SYNTHETIC_GOV02_CONTRACT_ONLY',
            classification: 'SYNTHETIC_CANDIDATE',
            sourceVersion: scope.sourceVersion,
            asOf: scope.asOf,
            bytes,
            sha256: financialInputSha256(bytes),
          },
        ],
        selections: [
          {
            entityId: gov,
            countryId: 'COUNTRY_02',
            nativeCurrency: currency,
            account: {
              documentId: 'SYNTHETIC_GOV02_CONTRACT_ONLY',
              pointer: '/account',
            },
            cash: null,
          },
        ],
      };
    };
    return { source, input };
  }
  function input(
    declaredInput: EntityCashSliceInput['declaredInput'] = vector().input(),
  ): EntityCashSliceInput {
    return {
      registry,
      countryId: 'COUNTRY_02',
      mappings: {
        documentId: 'TEST_ONLY_UNCHANGED_REFERENCE_MAPPING',
        bytes: original.mappingsBytes,
        sha256: financialInputSha256(original.mappingsBytes),
      },
      originalFields: original.originalFields.filter(
        (r) => r.countryId === 'COUNTRY_02',
      ),
      declaredInput,
    };
  }
  function pair(slice: EntityCashCountrySourceSlice) {
    return {
      slice,
      purpose: 'CANDIDATE_DIAGNOSTIC' as const,
      payerEntityId: gov,
      payeeEntityId: 'ENTITY_OPERATOR_02',
      currency,
      scope: slice.declaredScope,
    };
  }
  function remainsUnadmitted(r: EntityCashCountrySourceSlice) {
    expect(r.actualUnknownClosed).toBe(0);
    expect(r.accountIdsIssued).toBe(0);
    expect(r.actualScope).toBeNull();
    expect(r.formalClock).toBeNull();
    for (const flag of [
      'sourceAdoption',
      'productionAuthority',
      'admissionAllowed',
      'activationAllowed',
      'runtimeConnected',
    ] as const)
      expect(r[flag]).toBe(false);
    for (const row of r.rows) {
      for (const key of [
        'actualValue',
        'actualCurrency',
        'actualPeriod',
        'actualWorldHead',
        'actualAdmission',
      ] as const)
        expect(row[key]).toBeNull();
      expect(Object.values(row.originalFieldStages)).toEqual([
        false,
        false,
        false,
        false,
      ]);
      expect(row.currentPermission).toBe('UNKNOWN');
      expect(row).not.toHaveProperty('typedRegisterPreparation');
    }
  }
  it('preserves exact ten metadata IDs and all five owners, with one B06 and no B07 candidates', () => {
    const x = input();
    expect(x.mappings.bytes).toBe(original.mappingsBytes);
    const mappings = (
      JSON.parse(x.mappings.bytes) as {
        rows: { countryId: string; entityId: string }[];
      }
    ).rows.filter((r) => r.countryId === 'COUNTRY_02');
    expect(mappings.map((r) => r.entityId).sort()).toEqual([...owners].sort());
    expect(x.declaredInput!.documents).toHaveLength(1);
    expect(x.declaredInput!.selections).toHaveLength(1);
    expect(x.declaredInput!.selections[0]!.cash).toBeNull();
    const r = readEntityCashCountrySourceSlice(x);
    expect(r.rows.map((row) => row.stableId).sort()).toEqual(
      owners
        .flatMap((owner) =>
          ['account', 'availableNativeCash'].map(
            (field) => `U2544::ENTITY::${owner}::${field}`,
          ),
        )
        .sort(),
    );
    expect(
      r.rows.filter(
        (row) => row.batchId === 'B06' && row.candidateValue !== null,
      ),
    ).toHaveLength(1);
    const selected = r.rows.find(
      (row) => row.ownerId === gov && row.batchId === 'B06',
    )!;
    expect(selected.candidateValue).toEqual(core(syntheticAccount(currency)));
    expect(selected.reason).toBe('EXPLICIT_CASH_SOURCE_NOT_SUPPLIED');
    expect(
      r.rows.filter(
        (row) => row.batchId === 'B06' && row.candidateValue === null,
      ),
    ).toHaveLength(4);
    const cash = r.rows.filter((row) => row.batchId === 'B07');
    expect(cash).toHaveLength(5);
    for (const row of cash) {
      expect(row.candidateValue).toBeNull();
      expect(row.candidateCalculation).toEqual({
        balance: null,
        restrictedUnion: null,
        available: null,
      });
    }
    remainsUnadmitted(r);
  });
  it('hides both incomplete diagnostic endpoints and refuses formal settlement', () => {
    const r = readEntityCashCountrySourceSlice(input());
    const result = readIsolatedEntityCashPair(pair(r));
    expect(result.status).toBe(
      'BLOCKED_BOTH_ENDPOINTS_REQUIRE_COMPLETE_CANDIDATE_CASH',
    );
    expect(result.payer).toBeNull();
    expect(result.payee).toBeNull();
    expect(result.actualSpendable).toBeNull();
    expect(result.admissionAllowed).toBe(false);
    expect(result.currentPermissionIssued).toBe(false);
    expect(result.paymentExecuted).toBe(false);
    expect(() =>
      readIsolatedEntityCashPair({ ...pair(r), purpose: 'FORMAL_SETTLEMENT' }),
    ).toThrow('SOURCE_ADMISSION_AND_CURRENT_AUTHORIZATION_REQUIRED');
  });
  it('absent declared source keeps identities, cash and dates null, never zero', () => {
    const r = readEntityCashCountrySourceSlice(input(null));
    expect(r.builderInvoked).toBe(false);
    expect(r.declaredScope).toBeNull();
    for (const row of r.rows) {
      expect(row.candidateValue).toBeNull();
      expect(row.candidateValueDate).toBeNull();
    }
    remainsUnadmitted(r);
  });
  it.each(['claimId', 'counterpartyEntityId'] as const)(
    'rejects omitted account %s in the same consumer',
    (key) => {
      const v = vector();
      delete v.source.account.account[key];
      expect(() =>
        readEntityCashCountrySourceSlice(input(v.input())),
      ).toThrow();
    },
  );
  it.each(['ASSET', 'LIABILITY', 'DEPOSIT', 'CASH'])(
    'Core-valid paired %s remains unusable as legacy CASH',
    (accountClass) => {
      const v = vector();
      Object.assign(v.source.account.account, {
        accountClass,
        claimId: 'CLAIM_SYNTHETIC_C02',
        counterpartyEntityId: 'ENTITY_BANK_02',
      });
      expect(core(v.source.account.account).accountClass).toBe(accountClass);
      const r = readEntityCashCountrySourceSlice(input(v.input()));
      expect(
        r.rows.find((row) => row.ownerId === gov && row.batchId === 'B06')!
          .reason,
      ).toBe('NOT_NATIVE_CASH');
      expect(r.rows.every((row) => row.candidateValue === null)).toBe(true);
      expect(readIsolatedEntityCashPair(pair(r)).actualSpendable).toBeNull();
      remainsUnadmitted(r);
    },
  );
  it('refuses C02 typed-register mode without extending or copying the C01 suite', () => {
    expect(() =>
      readEntityCashCountrySourceSlice({
        ...input(),
        typedRegisterPreparation: {
          adoptedDefinitionVersion: B06_C01_DEFINITION_VERSION,
          requestedOriginalIds: [`U2544::ENTITY::${gov}::account`],
          declaredNativeCurrency: currency,
          documents: [],
          records: [],
          registers: [],
        },
      }),
    ).toThrow('TYPED_COUNTRY01_SCOPE_REQUIRED');
  });
  it.each(['ownerId', 'countryId', 'currency', 'worldId'] as const)(
    'rejects source account %s binding mismatch',
    (key) => {
      const v = vector();
      v.source.account.account[key] =
        key === 'ownerId'
          ? 'ENTITY_BANK_02'
          : key === 'countryId'
            ? 'COUNTRY_03'
            : key === 'currency'
              ? currency === 'USD'
                ? 'EUR'
                : 'USD'
              : 'WORLD_OTHER';
      expect(() => readEntityCashCountrySourceSlice(input(v.input()))).toThrow(
        'ACCOUNT_OWNERSHIP_COUNTRY_CURRENCY_MISMATCH',
      );
    },
  );
  it.each(['sourceVersion', 'asOf', 'worldId', 'worldVersion'] as const)(
    'rejects declared envelope %s mismatch with recomputed hash',
    (key) => {
      const v = vector();
      v.source[key] =
        key === 'asOf'
          ? '2026-10-22T00:00:00.000Z'
          : key === 'worldVersion'
            ? '1'
            : 'OTHER';
      expect(() => readEntityCashCountrySourceSlice(input(v.input()))).toThrow(
        'SOURCE_SCOPE_VERSION_ASOF_MISMATCH',
      );
    },
  );
  it('rejects stale source and mapping hashes and cloned registry identity', () => {
    const v = vector().input();
    const d = v.documents[0]!;
    expect(() =>
      readEntityCashCountrySourceSlice(
        input({ ...v, documents: [{ ...d, bytes: d.bytes + ' ' }] }),
      ),
    ).toThrow('SOURCE_HASH_MISMATCH');
    const x = input();
    expect(() =>
      readEntityCashCountrySourceSlice({
        ...x,
        mappings: { ...x.mappings, bytes: x.mappings.bytes + ' ' },
      }),
    ).toThrow('MAPPING_PIN_MISMATCH');
    expect(() =>
      readEntityCashCountrySourceSlice({ ...x, registry: { ...registry } }),
    ).toThrow('GENUINE_REGISTRY_REQUIRED');
  });
  it.each(['entityId', 'countryId', 'nativeCurrency'] as const)(
    'rejects foreign selection %s',
    (key) => {
      const v = vector().input();
      expect(() =>
        readEntityCashCountrySourceSlice(
          input({
            ...v,
            selections: [
              {
                ...v.selections[0]!,
                [key]:
                  key === 'entityId'
                    ? 'ENTITY_GOVERNMENT_03'
                    : key === 'countryId'
                      ? 'COUNTRY_03'
                      : currency === 'USD'
                        ? 'EUR'
                        : 'USD',
              },
            ],
          }),
        ),
      ).toThrow('SELECTION_NOT_ORIGINAL_NATIVE_ENTITY');
    },
  );
  it('refuses five-account-only metadata without inventing B07 rows', () => {
    const x = input();
    expect(() =>
      readEntityCashCountrySourceSlice({
        ...x,
        originalFields: x.originalFields.filter(
          (r) => r.missingField === 'account',
        ),
      }),
    ).toThrow('EXACT_TEN_ORIGINAL_IDS_REQUIRED');
  });
});
