/** Portable declaration integration, not account/source admission or actual cash. */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  B06_C01_DEFINITION_VERSION,
  inspectB06Country01TypedRegisterPreparation,
} from '../../apps/world-worker/src/preparation/b06-country01-typed-register-preparation.js';
import {
  createTestOnlyFinancialOpeningPackageRegistryLoader,
  type LoadedFinancialOpeningPackageRegistry,
} from '../../apps/world-worker/src/preparation/financial-opening-package-registry.js';
import { financialInputSha256 } from '../../apps/world-worker/src/preparation/formal-financial-opening-contract.js';
import {
  readEntityCashCountrySourceSlice as read,
  readIsolatedEntityCashPair,
  type EntityCashCountrySourceSlice,
  type EntityCashSliceInput,
} from '../../apps/world-worker/src/preparation/entity-native-cash-source-slice.js';
import {
  materializeFinancialOpeningPackageFixture,
  disposeFinancialOpeningPackageFixture,
  type OwnedFinancialOpeningPackageFixture,
} from '../support/financial-opening-package-fixture.js';
import {
  declaredEntityCashVector,
  originalEntityFixture,
} from '../support/entity-native-cash-candidate-fixture.js';

type TypedInput = NonNullable<EntityCashSliceInput['typedRegisterPreparation']>;
let fixture: OwnedFinancialOpeningPackageFixture;
let registry: LoadedFinancialOpeningPackageRegistry;
beforeAll(async () => {
  fixture = await materializeFinancialOpeningPackageFixture();
  registry = await (
    await createTestOnlyFinancialOpeningPackageRegistryLoader({
      fixtureRoot: fixture.fixtureRoot,
    })
  ).load();
  console.info(
    'TEST_ONLY_OWNED_REGISTRY_FIXTURE_IO',
    JSON.stringify(fixture.io),
  );
});
afterAll(async () => {
  if (fixture) await disposeFinancialOpeningPackageFixture(fixture);
});

const gov = 'ENTITY_GOVERNMENT_01',
  op = 'ENTITY_OPERATOR_01',
  hh = 'ENTITY_HOUSEHOLDS_01',
  bank = 'ENTITY_BANK_01',
  cb = 'ENTITY_CENTRAL_BANK_01';
const id = (owner: string) => 'U2544::ENTITY::' + owner + '::account';
const cashId = (owner: string) =>
  'U2544::ENTITY::' + owner + '::availableNativeCash';
const relations = [
  [
    'TGA',
    'TGA_ASSET',
    'TGA_ISSUANCE_LIABILITY',
    gov,
    cb,
    'TREASURY_DEPOSIT_AT_CB',
  ],
  [
    'RESERVE',
    'RESERVE_ASSET',
    'RESERVE_ISSUANCE_LIABILITY',
    bank,
    cb,
    'BANK_RESERVE_DEPOSIT_AT_CB',
  ],
  [
    'HOUSEHOLD_DEPOSIT',
    'HOUSEHOLD_DEPOSIT_ASSET',
    'HOUSEHOLD_DEPOSIT_ISSUANCE_LIABILITY',
    hh,
    bank,
    'HOUSEHOLD_DEPOSIT_AT_BANK',
  ],
  [
    'BUSINESS_DEPOSIT',
    'BUSINESS_DEPOSIT_ASSET',
    'BUSINESS_DEPOSIT_ISSUANCE_LIABILITY',
    op,
    bank,
    'BUSINESS_DEPOSIT_AT_BANK',
  ],
] as const;

function vector(requestedOwners: readonly string[] = [gov]) {
  const selectedRelations = relations.filter(
    (r) => requestedOwners.includes(r[3]) || requestedOwners.includes(r[4]),
  );
  const records = selectedRelations.flatMap(
    ([relation, asset, liability, holderId, issuerId, purpose]) =>
      (['ASSET', 'LIABILITY'] as const).map((accountClass) => ({
        role: accountClass === 'ASSET' ? asset : liability,
        sourceRecordId:
          'SYNTHETIC_RECORD_' + (accountClass === 'ASSET' ? asset : liability),
        accountId:
          'SYNTHETIC_ACCOUNT_' + (accountClass === 'ASSET' ? asset : liability),
        claimId: 'SYNTHETIC_CLAIM_' + relation,
        countryId: 'COUNTRY_01',
        ownerId: accountClass === 'ASSET' ? holderId : issuerId,
        holderId,
        issuerId,
        counterpartyEntityId: accountClass === 'ASSET' ? issuerId : holderId,
        accountClass,
        purpose,
        sourceHoldingKind: 'CLAIM',
        currency: 'XAA',
        sourceVersion: 'SYNTHETIC_EXISTING_READ_V1',
        valueDate: '2026-10-13',
        sourceCapabilityLocator: null,
      })),
  );
  const registers = requestedOwners.map((ownerId) => ({
    stableId: id(ownerId),
    ownerId,
    countryId: 'COUNTRY_01',
    adoptedDefinitionVersion: B06_C01_DEFINITION_VERSION,
    sourceVersion: 'SYNTHETIC_EXISTING_READ_V1',
    memberRoles: records
      .filter((r) => r.ownerId === ownerId)
      .map((r) => r.role),
  }));
  const source = { records, registers };
  function input(): TypedInput {
    const bytes = JSON.stringify(source);
    return {
      adoptedDefinitionVersion: B06_C01_DEFINITION_VERSION,
      requestedOriginalIds: requestedOwners.map(id),
      declaredNativeCurrency: 'XAA',
      documents: [
        {
          documentId: 'SYNTHETIC_TYPED_SOURCE',
          sourceId: 'SYNTHETIC_DECLARATION_NOT_ADOPTION',
          sourceVersion: 'SYNTHETIC_EXISTING_READ_V1',
          classification: 'SYNTHETIC_CANDIDATE',
          bytes,
          sha256: financialInputSha256(bytes),
          byteLength: Buffer.byteLength(bytes),
        },
      ],
      records: records.map((r, i) => ({
        role: r.role,
        sourceSchema: 'NORMALIZED_TYPED_ACCOUNT_V1',
        documentId: 'SYNTHETIC_TYPED_SOURCE',
        pointer: '/records/' + i,
      })),
      registers: registers.map((r, i) => ({
        stableId: r.stableId,
        documentId: 'SYNTHETIC_TYPED_SOURCE',
        pointer: '/registers/' + i,
      })),
    };
  }
  return { source, input };
}

function legacy(
  declaredInput: EntityCashSliceInput['declaredInput'] = null,
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
function subset(
  typed: TypedInput,
  requestedIds: readonly string[] = typed.requestedOriginalIds,
): EntityCashSliceInput {
  const base = legacy();
  const originalFields = base.originalFields.filter((r) =>
    requestedIds.includes(r.stableId),
  );
  const requestedOwners = new Set(originalFields.map((r) => r.ownerId));
  const mapping = JSON.parse(base.mappings.bytes) as {
    status: string;
    rows: Record<string, unknown>[];
  };
  const bytes = JSON.stringify({
    ...mapping,
    rows: mapping.rows.filter((r) => requestedOwners.has(String(r.entityId))),
  });
  return {
    ...base,
    mappings: { ...base.mappings, bytes, sha256: financialInputSha256(bytes) },
    originalFields,
    typedRegisterPreparation: typed,
  };
}
function typedRow(result: EntityCashCountrySourceSlice, owner = gov) {
  const row = result.rows.find((r) => r.stableId === id(owner));
  if (
    !row ||
    !('typedRegisterPreparation' in row) ||
    !row.typedRegisterPreparation
  )
    throw Error('EXPECTED_EXISTING_TYPED_ROW');
  return row.typedRegisterPreparation;
}
function pair(slice: EntityCashCountrySourceSlice) {
  return {
    slice,
    purpose: 'CANDIDATE_DIAGNOSTIC' as const,
    payerEntityId: gov,
    payeeEntityId: op,
    currency: 'XAA',
    scope: slice.declaredScope,
  };
}
function noAuthority(result: EntityCashCountrySourceSlice) {
  expect(result).toMatchObject({
    actualScope: null,
    accountIdsIssued: 0,
    actualUnknownClosed: 0,
    sourceAdoption: false,
    productionAuthority: false,
    admissionAllowed: false,
    activationAllowed: false,
    runtimeConnected: false,
    formalClock: null,
  });
  for (const row of result.rows) {
    expect(row).toMatchObject({
      actualValue: null,
      actualCurrency: null,
      actualPeriod: null,
      actualWorldHead: null,
      actualAdmission: null,
      currentPermission: 'UNKNOWN',
    });
    expect(Object.values(row.originalFieldStages)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    if ('typedRegisterPreparation' in row && row.typedRegisterPreparation) {
      const typed = row.typedRegisterPreparation;
      expect(typed).toMatchObject({
        actualTypedRegisterBinding: null,
        actualValue: null,
        actualCurrency: null,
        actualOpening: null,
        actualAdmission: null,
      });
      expect(Object.values(typed.originalFieldStages)).toEqual([
        false,
        false,
        false,
        false,
      ]);
      expect(typed.admissionBlockers).toHaveLength(4);
      expect(typed).not.toHaveProperty('candidateValue');
    }
  }
}

describe('existing original-ID read consumes independent typed preparation', () => {
  it.each([
    { owner: gov, own: 1, ends: 2 },
    { owner: op, own: 1, ends: 2 },
    { owner: hh, own: 1, ends: 2 },
    { owner: bank, own: 3, ends: 6 },
    { owner: cb, own: 2, ends: 4 },
  ])(
    'positive subset $owner uses only its own $own roles and necessary mirrors',
    ({ owner, own, ends }) => {
      const v = vector([owner]),
        input = subset(v.input()),
        result = read(input);
      expect(result.schemaVersion).toBe(
        'entity-native-cash-country-source-slice-v2',
      );
      expect(input.originalFields).toHaveLength(1);
      expect(JSON.parse(input.mappings.bytes).rows).toHaveLength(1);
      expect(v.input().records).toHaveLength(ends);
      expect(v.input().registers).toHaveLength(1);
      expect(result.rows).toHaveLength(1);
      const typed = typedRow(result, owner);
      expect(typed.shapeStatus).toBe('COMPLETE_DECLARED_SHAPE');
      expect(typed.candidateTypedRegister?.ownRoles).toHaveLength(own);
      expect(typed).toEqual(
        inspectB06Country01TypedRegisterPreparation({
          registry,
          ...v.input(),
        }).rows[0],
      );
      expect(Object.isFrozen(typed)).toBe(true);
      expect(result.rows[0]?.candidateValue).toBeNull();
      noAuthority(result);
    },
  );

  it('mixed subset preserves Gov positive while HH missing mirror remains incomplete', () => {
    const v = vector([gov, hh]),
      typed = v.input();
    const result = read(
      subset({
        ...typed,
        records: typed.records.filter(
          (r) => r.role !== 'HOUSEHOLD_DEPOSIT_ISSUANCE_LIABILITY',
        ),
      }),
    );
    expect(typedRow(result).candidateTypedRegister).not.toBeNull();
    expect(typedRow(result, hh).candidateTypedRegister).toBeNull();
    expect(typedRow(result, hh).shapeIssues).toContain(
      'REQUIRED_ROLE_NOT_SUPPLIED:HOUSEHOLD_DEPOSIT_ISSUANCE_LIABILITY',
    );
    noAuthority(result);
  });
  it('explicit FULL_BUNDLE remains available but is never the per-ID default', () => {
    const v = vector([gov, op, hh, bank, cb]);
    const result = read(subset({ ...v.input(), selectionMode: 'FULL_BUNDLE' }));
    expect(result.rows).toHaveLength(5);
    for (const owner of [gov, op, hh, bank, cb])
      expect(typedRow(result, owner).candidateTypedRegister).not.toBeNull();
    expect(() =>
      read(subset({ ...vector().input(), selectionMode: 'FULL_BUNDLE' })),
    ).toThrow('FULL_BUNDLE_SCOPE_REQUIRED');
  });
  it('source row mapping keeps the exact supplied mapping document pointer', () => {
    const typed = vector([gov, hh]).input(),
      input = subset(typed);
    const mappings = JSON.parse(input.mappings.bytes) as { rows: unknown[] };
    mappings.rows.reverse();
    const bytes = JSON.stringify(mappings);
    const result = read({
      ...input,
      mappings: {
        ...input.mappings,
        bytes,
        sha256: financialInputSha256(bytes),
      },
    });
    expect(
      result.rows.find((r) => r.ownerId === gov)?.sourcePointers.mapping
        .pointer,
    ).toBe('/rows/1');
  });
  it('runtime extra registry/provider properties are not read or used as authority', () => {
    const typed = vector().input();
    let invoked = 0;
    for (const name of ['registry', 'trustedAdmissionProvider', 'provider'])
      Object.defineProperty(typed, name, {
        get() {
          invoked++;
          throw Error('CALLER_OVERRIDE');
        },
      });
    const result = read(subset(typed));
    expect(invoked).toBe(0);
    expect(typedRow(result).candidateTypedRegister).not.toBeNull();
    noAuthority(result);
  });
  it('an alleged inner genuine registry cannot rescue an invalid outer registry', () => {
    const typed = Object.assign(vector().input(), { registry });
    expect(() => read({ ...subset(typed), registry: { ...registry } })).toThrow(
      'GENUINE_REGISTRY_REQUIRED',
    );
  });
  it('typed positive does not synthesize the missing other endpoint in an original-ID subset', () => {
    const result = read(subset(vector().input()));
    expect(typedRow(result).candidateTypedRegister).not.toBeNull();
    expect(() => readIsolatedEntityCashPair(pair(result))).toThrow(
      'PAIR_ENTITY_OUTSIDE_SOURCE_SLICE',
    );
  });
  it('all ten identity rows may be requested without requiring their data to be complete', () => {
    const base = legacy(),
      result = read({
        ...base,
        typedRegisterPreparation: vector().input(),
      });
    expect(result.rows).toHaveLength(10);
    expect(typedRow(result).candidateTypedRegister).not.toBeNull();
    const opRow = result.rows.find((r) => r.stableId === id(op))!;
    expect(
      'typedRegisterPreparation' in opRow && opRow.typedRegisterPreparation,
    ).toBeNull();
    for (const row of result.rows.filter((r) => r.batchId === 'B07'))
      expect(row).not.toHaveProperty('typedRegisterPreparation');
    expect(readIsolatedEntityCashPair(pair(result))).toMatchObject({
      status: 'BLOCKED_BOTH_ENDPOINTS_REQUIRE_COMPLETE_CANDIDATE_CASH',
      payer: null,
      payee: null,
      paymentExecuted: false,
    });
    noAuthority(result);
  });
  it('omitted and null option preserve identical legacy-v1 output, with no typed slot', () => {
    const a = read(legacy()),
      b = read({ ...legacy(), typedRegisterPreparation: null });
    expect(a).toEqual(b);
    expect(a.schemaVersion).toBe('entity-native-cash-country-source-slice-v1');
    expect(a.rows).toHaveLength(10);
    for (const row of a.rows)
      expect(row).not.toHaveProperty('typedRegisterPreparation');
    noAuthority(a);
  });
  it('legacy exact-ten and exact-five checks are not weakened by the new version', () => {
    const one = subset(vector().input());
    expect(() => read({ ...one, typedRegisterPreparation: null })).toThrow(
      'EXACT_FIVE_ENTITY_MAPPING_REQUIRED',
    );
    expect(() =>
      read({
        ...legacy(),
        originalFields: legacy().originalFields.slice(0, 9),
      }),
    ).toThrow('EXACT_TEN_ORIGINAL_IDS_REQUIRED');
  });
  it('constructed CASH positive remains exact 100.5 minus restriction UNION10.25 =90.25 in both versions', () => {
    const input = legacy(declaredEntityCashVector().input());
    const old = read(input),
      next = read({
        ...input,
        typedRegisterPreparation: vector([gov, op]).input(),
      });
    expect(readIsolatedEntityCashPair(pair(next))).toEqual(
      readIsolatedEntityCashPair(pair(old)),
    );
    expect(readIsolatedEntityCashPair(pair(next)).status).toBe(
      'DECLARED_PAIR_READBACK_NOT_ADMITTED',
    );
    for (const result of [old, next]) {
      for (const row of result.rows.filter((r) => r.batchId === 'B07')) {
        expect(row.candidateCalculation).toMatchObject({
          balance: { amount: '100.5', currency: 'XAA' },
          restrictedUnion: { amount: '10.25', currency: 'XAA' },
          available: { amount: '90.25', currency: 'XAA' },
        });
      }
      noAuthority(result);
    }
    expect(typedRow(next).candidateTypedRegister).not.toBeNull();
  });
  it('FORMAL_SETTLEMENT still rejects even a genuine v2 slice with complete CASH', () => {
    const result = read({
      ...legacy(declaredEntityCashVector().input()),
      typedRegisterPreparation: vector().input(),
    });
    expect(() =>
      readIsolatedEntityCashPair({
        ...pair(result),
        purpose: 'FORMAL_SETTLEMENT',
      }),
    ).toThrow('SOURCE_ADMISSION_AND_CURRENT_AUTHORIZATION_REQUIRED');
  });
  it('a clone or typed-only object cannot acquire the legacy genuine slice brand', () => {
    const result = read(subset(vector().input()));
    for (const slice of [{ ...result }, typedRow(result)])
      expect(() =>
        readIsolatedEntityCashPair({
          ...pair(result),
          slice: slice as EntityCashCountrySourceSlice,
        }),
      ).toThrow('GENUINE_ENTITY_CASH_SLICE_REQUIRED');
  });
  it.each([
    { name: 'missing own role', remove: 'TGA_ASSET' },
    { name: 'missing necessary mirror', remove: 'TGA_ISSUANCE_LIABILITY' },
  ])('$name gives the existing per-ID incomplete result', ({ remove }) => {
    const typed = vector().input();
    const result = read(
      subset({
        ...typed,
        records: typed.records.filter((r) => r.role !== remove),
      }),
    );
    expect(typedRow(result).candidateTypedRegister).toBeNull();
    expect(typedRow(result).shapeIssues).toContain(
      'REQUIRED_ROLE_NOT_SUPPLIED:' + remove,
    );
  });
  it('missing register retains source witnesses, not a synthesized account/register', () => {
    const typed = vector().input(),
      result = read(subset({ ...typed, registers: [] }));
    expect(typedRow(result).candidateTypedRegister).toBeNull();
    expect(typedRow(result).sourceReferenceWitnesses).toHaveLength(2);
    expect(typedRow(result).shapeIssues).toContain(
      'REGISTER_DECLARATION_NOT_SUPPLIED',
    );
  });
  it.each([
    { name: 'hash', code: 'DOCUMENT_PIN_MISMATCH' },
    { name: 'bytes', code: 'DOCUMENT_PIN_MISMATCH' },
    { name: 'pointer', code: 'JSON_POINTER_MISSING' },
    { name: 'definition', code: 'DEFINITION_VERSION_MISMATCH' },
  ])(
    'invalid $name is not converted to a positive typed result',
    ({ name, code }) => {
      const typed = vector().input(),
        doc = typed.documents[0]!;
      const changed: TypedInput =
        name === 'hash'
          ? { ...typed, documents: [{ ...doc, sha256: '0'.repeat(64) }] }
          : name === 'bytes'
            ? { ...typed, documents: [{ ...doc, bytes: doc.bytes + ' ' }] }
            : name === 'pointer'
              ? {
                  ...typed,
                  records: [{ ...typed.records[0]!, pointer: '/records/999' }],
                }
              : { ...typed, adoptedDefinitionVersion: 'NOT_ADOPTED' };
      expect(() => read(subset(changed))).toThrow(code);
    },
  );
  it('source version mismatch stays incomplete without a fabricated adoption result', () => {
    const v = vector();
    v.source.records[0]!.sourceVersion = 'WRONG_VERSION';
    const result = read(subset(v.input()));
    expect(typedRow(result).shapeIssues).toContain(
      'TGA_ASSET:RECORD_SOURCE_VERSION_MISMATCH',
    );
    expect(typedRow(result).actualAdmission).toBeNull();
  });
  it('foreign COUNTRY01 definition cannot be applied to COUNTRY02', () => {
    expect(() =>
      read({ ...subset(vector().input()), countryId: 'COUNTRY_02' }),
    ).toThrow('TYPED_COUNTRY01_SCOPE_REQUIRED');
  });
  it('v2 does not process CASH selections for owners outside the requested original rows', () => {
    expect(() =>
      read({
        ...subset(vector().input()),
        declaredInput: declaredEntityCashVector().input(),
      }),
    ).toThrow('SELECTION_NOT_ORIGINAL_NATIVE_ENTITY');
  });
  it('typed reference currency cannot silently become GCU or an FX conversion', () => {
    expect(() =>
      read(subset({ ...vector().input(), declaredNativeCurrency: 'GCU' })),
    ).toThrow('DECLARED_NATIVE_CURRENCY_MISMATCH');
  });
  it.each([
    { name: 'empty', ids: [] },
    { name: 'duplicate', ids: [id(gov), id(gov)] },
    { name: 'B07-as-typed', ids: [cashId(gov)] },
    { name: 'unrequested-account', ids: [id(hh)] },
    {
      name: 'other-country',
      ids: ['U2544::ENTITY::ENTITY_GOVERNMENT_02::account'],
    },
  ])('rejects $name typed ID scope', ({ name, ids }) => {
    const typed = { ...vector().input(), requestedOriginalIds: ids };
    expect(() =>
      read({ ...subset(vector().input()), typedRegisterPreparation: typed }),
    ).toThrow(
      name === 'empty' || name === 'duplicate'
        ? 'REQUESTED_ID_SCOPE_INVALID'
        : 'TYPED_REQUESTED_ID_OUTSIDE_READ_SUBSET',
    );
  });
  it('empty or duplicated v2 original rows never become a subset positive', () => {
    const input = subset(vector().input());
    expect(() => read({ ...input, originalFields: [] })).toThrow(
      'EXPLICIT_ORIGINAL_ID_SUBSET_REQUIRED',
    );
    expect(() =>
      read({
        ...input,
        originalFields: [input.originalFields[0]!, input.originalFields[0]!],
      }),
    ).toThrow('EXPLICIT_ORIGINAL_ID_SUBSET_REQUIRED');
  });
  it('requested owner mapping must be unique and remain reference-only', () => {
    const input = subset(vector().input()),
      mapping = JSON.parse(input.mappings.bytes) as {
        rows: Record<string, unknown>[];
      };
    function updated() {
      const bytes = JSON.stringify(mapping);
      return {
        ...input,
        mappings: {
          ...input.mappings,
          bytes,
          sha256: financialInputSha256(bytes),
        },
      };
    }
    mapping.rows.push({ ...mapping.rows[0]! });
    expect(() => read(updated())).toThrow('REQUESTED_OWNER_MAPPING_REQUIRED');
    mapping.rows.pop();
    mapping.rows[0]!.actualAccount = 'CALLER_CLAIMED_AUTHORITY';
    expect(() => read(updated())).toThrow('MAPPING_IS_NOT_REFERENCE_ONLY');
  });
  it('H/D holding identities and local draft keys remain references, not Core account IDs', () => {
    const v = vector([hh]),
      typed = v.input();
    const records = v.source.records.map((r) => ({
      holdingId: 'DRAFT_LOCAL_' + r.role,
      draftKey: 'DRAFT_KEY_' + r.role,
      accountId: 'ALLEGED_CORE_ACCOUNT',
      sharedClaimId: r.claimId,
      holderId: r.ownerId,
      assetHolderId: r.holderId,
      issuerId: r.issuerId,
      counterpartyId: r.counterpartyEntityId,
      role: r.accountClass,
      countryId: r.countryId,
      nativeCurrency: r.currency,
      version: r.sourceVersion,
      valueDate: r.valueDate,
      tool: 'HOUSEHOLD_DEPOSIT',
    }));
    const bytes = JSON.stringify({ records, registers: v.source.registers });
    const result = read(
      subset({
        ...typed,
        documents: [
          {
            ...typed.documents[0]!,
            bytes,
            sha256: financialInputSha256(bytes),
            byteLength: Buffer.byteLength(bytes),
          },
        ],
        records: typed.records.map((r) => ({
          ...r,
          sourceSchema: 'PAIRED_HOLDING_REFERENCE_V1',
        })),
      }),
    );
    const row = typedRow(result, hh);
    expect(row.candidateTypedRegister).toBeNull();
    expect(
      row.sourceReferenceWitnesses.every((w) => w.declaredAccountId === null),
    ).toBe(true);
    expect(
      row.sourceReferenceWitnesses.every((w) =>
        w.sourceRecordId?.startsWith('DRAFT_LOCAL_'),
      ),
    ).toBe(true);
    noAuthority(result);
  });
  it('the existing production source contains one direct inspector call, no provider or new settlement route', () => {
    const source = readFileSync(
      new URL(
        '../../apps/world-worker/src/preparation/entity-native-cash-source-slice.ts',
        import.meta.url,
      ),
      'utf8',
    );
    expect(
      source.match(/typed = inspectB06Country01TypedRegisterPreparation\(/gu),
    ).toHaveLength(1);
    expect(source).not.toMatch(/trustedAdmissionProvider\s*:/u);
    expect(source).not.toMatch(/acceptedTypedRegisterBinding/u);
    expect(
      financialInputSha256(
        source.slice(
          source.indexOf('export function readIsolatedEntityCashPair('),
        ),
      ),
    ).toBe('e4a94bf6f41969a0524fd362d7d0dfd5159bbaf06d53890ad8ca31af0d9e1a98');
  });

  // T12 genuine accepted-provider construction is a future independent design,
  // deliberately NOT represented as a passing test or a fabricated provider.
  it.skipIf(process.env.F_B06_TYPED_EXISTING_READ_PRIVATE !== '1')(
    'private pinned A four-reference read reaches the existing API without accepted account binding',
    () => {
      const bytes = readFileSync(
        '/Users/samuel/Documents/econclub/.econmind-artifacts/unknown2544-resume-20261021/A/TYPED_SOURCE_ISSUANCE_AND_ADMISSION_CHAIN.json',
        'utf8',
      );
      expect(Buffer.byteLength(bytes)).toBe(30063);
      expect(financialInputSha256(bytes)).toBe(
        'c426f0d0215f9d410e569a0decf0475978ea0088f1683c6623b6b3b7551dbc56',
      );
      const requested = [gov, bank, cb];
      const roles = [
        'TGA_ISSUANCE_LIABILITY',
        'TGA_ASSET',
        'RESERVE_ISSUANCE_LIABILITY',
        'RESERVE_ASSET',
      ] as const;
      const input: TypedInput = {
        adoptedDefinitionVersion: B06_C01_DEFINITION_VERSION,
        requestedOriginalIds: requested.map(id),
        declaredNativeCurrency: 'XAA',
        documents: [
          {
            documentId: 'A_FIXED_SMALL_REFERENCE',
            sourceId: 'A_FIXED_SMALL_REFERENCE',
            sourceVersion: 'LCFX_CB_REGION_20261013_V2_PROPOSED',
            classification: 'CONSTRUCTED_CANDIDATE',
            bytes,
            sha256: financialInputSha256(bytes),
            byteLength: Buffer.byteLength(bytes),
          },
        ],
        records: roles.map((role, i) => ({
          role,
          documentId: 'A_FIXED_SMALL_REFERENCE',
          pointer: '/newSourceLeaves/' + i,
          sourceSchema: 'A_TYPED_HOLDING_REFERENCE_V1',
        })),
        registers: [],
      };
      const result = read(subset(input));
      expect(result.rows).toHaveLength(3);
      const witnesses = typedRow(result, cb).sourceReferenceWitnesses;
      expect(witnesses).toHaveLength(4);
      expect(witnesses.map((w) => w.origin.pointer).sort()).toEqual([
        '/newSourceLeaves/0',
        '/newSourceLeaves/1',
        '/newSourceLeaves/2',
        '/newSourceLeaves/3',
      ]);
      for (const w of witnesses) {
        expect(w.declaredAccountId).toBeNull();
        expect(w.ownerField).toBe('recordOwnerEntityId');
        expect(w.beneficialHolderField).toBe('beneficialHolderEntityId');
        expect(w.currency).toBe('XAA');
      }
      expect(
        typedRow(result).sourceReferenceWitnesses.find(
          (w) => w.role === 'TGA_ASSET',
        ),
      ).toMatchObject({
        ownerId: gov,
        holderId: gov,
        issuerId: cb,
        sourceRecordId: 'SCENE_TGA_01_V2_ASSET',
      });
      for (const owner of requested)
        expect(typedRow(result, owner).candidateTypedRegister).toBeNull();
      noAuthority(result);
      console.info(
        'PRIVATE_REFERENCE_ONLY_NO_UPSTREAM_DEREFERENCE',
        JSON.stringify({
          bytes: 30063,
          sourceLeaves: 4,
          accountBindingsAccepted: 0,
          directOriginal825645BPathRead: false,
          directOld17PrivatePathsRead: false,
          testOnlyFixtureIo: fixture.io,
        }),
      );
    },
  );
});
