/** Hosted, portable mechanism declarations. None are actual account sources. */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  B06_C01_DEFINITION_RECEIPT_SHA256,
  B06_C01_DEFINITION_VERSION,
  B06_C01_ORIGINAL_IDS,
  inspectB06Country01TypedRegisterPreparation as inspect,
  type B06Country01TypedRole,
  type B06TypedRegisterPreparationInput,
} from '../../apps/world-worker/src/preparation/b06-country01-typed-register-preparation.js';
import {
  createTestOnlyFinancialOpeningPackageRegistryLoader,
  type LoadedFinancialOpeningPackageRegistry,
} from '../../apps/world-worker/src/preparation/financial-opening-package-registry.js';
import { financialInputSha256 } from '../../apps/world-worker/src/preparation/formal-financial-opening-contract.js';
import {
  readEntityCashCountrySourceSlice,
  readIsolatedEntityCashPair,
  type EntityCashCountrySourceSlice,
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

const gov = 'ENTITY_GOVERNMENT_01',
  op = 'ENTITY_OPERATOR_01',
  hh = 'ENTITY_HOUSEHOLDS_01',
  bank = 'ENTITY_BANK_01',
  cb = 'ENTITY_CENTRAL_BANK_01';
const owners = [gov, op, hh, bank, cb];
const pairs = [
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
const id = (owner: string) => `U2544::ENTITY::${owner}::account`;
function vector() {
  const records = pairs.flatMap(
    ([relation, asset, liability, holderId, issuerId, purpose]) =>
      (['ASSET', 'LIABILITY'] as const).map((accountClass) => {
        const role = accountClass === 'ASSET' ? asset : liability;
        return {
          role,
          sourceRecordId: `SOURCE_SYNTHETIC_${role}`,
          accountId: `ACCOUNT_DECLARED_SYNTHETIC_${role}`,
          claimId: `CLAIM_DECLARED_SYNTHETIC_${relation}`,
          countryId: 'COUNTRY_01',
          ownerId: accountClass === 'ASSET' ? holderId : issuerId,
          holderId,
          issuerId,
          counterpartyEntityId: accountClass === 'ASSET' ? issuerId : holderId,
          accountClass,
          purpose,
          sourceHoldingKind: 'CLAIM',
          currency: 'XAA',
          sourceVersion: 'SYNTHETIC_TYPED_V1',
          valueDate: '2026-10-13',
          sourceCapabilityLocator: null,
        };
      }),
  );
  const registers = owners.map((ownerId) => ({
    stableId: id(ownerId),
    ownerId,
    countryId: 'COUNTRY_01',
    adoptedDefinitionVersion: B06_C01_DEFINITION_VERSION,
    sourceVersion: 'SYNTHETIC_TYPED_V1',
    memberRoles: records
      .filter((r) => r.ownerId === ownerId)
      .map((r) => r.role),
  }));
  const source = { records, registers };
  const input = (): B06TypedRegisterPreparationInput => {
    const bytes = JSON.stringify(source);
    return {
      registry,
      adoptedDefinitionVersion: B06_C01_DEFINITION_VERSION,
      requestedOriginalIds: owners.map(id),
      declaredNativeCurrency: 'XAA',
      documents: [
        {
          documentId: 'SYNTHETIC_SOURCE_ONLY',
          sourceId: 'SYNTHETIC_DECLARATION',
          sourceVersion: 'SYNTHETIC_TYPED_V1',
          classification: 'SYNTHETIC_CANDIDATE',
          bytes,
          sha256: financialInputSha256(bytes),
          byteLength: Buffer.byteLength(bytes),
        },
      ],
      records: records.map((r, index) => ({
        role: r.role,
        documentId: 'SYNTHETIC_SOURCE_ONLY',
        pointer: `/records/${index}`,
        sourceSchema: 'NORMALIZED_TYPED_ACCOUNT_V1',
      })),
      registers: registers.map((r, index) => ({
        stableId: r.stableId,
        documentId: 'SYNTHETIC_SOURCE_ONLY',
        pointer: `/registers/${index}`,
      })),
    };
  };
  return { source, input };
}
function row(result: ReturnType<typeof inspect>, owner = gov) {
  return result.rows.find((r) => r.ownerId === owner)!;
}
function noAuthority(result: ReturnType<typeof inspect>) {
  expect(result).toMatchObject({
    sourceAdoption: false,
    recordSetAdopted: false,
    admissionAllowed: false,
    activationAllowed: false,
    formalSettlementAllowed: false,
    runtimeConnected: false,
    currentPermissionIssued: false,
    actualUnknownClosed: 0,
    accountIdsIssued: 0,
    claimIdsIssued: 0,
    formalClock: null,
    trustedAdmissionProvider: 'NOT_AVAILABLE',
  });
  for (const r of result.rows) {
    expect(r).not.toHaveProperty('candidateValue');
    expect(r.actualValue).toBeNull();
    expect(r.actualTypedRegisterBinding).toBeNull();
    expect(r.actualCurrency).toBeNull();
    expect(r.actualOpening).toBeNull();
    expect(r.actualAdmission).toBeNull();
    expect(Object.values(r.originalFieldStages)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(r.admissionBlockers).toHaveLength(4);
  }
}
function oldSlice(complete: boolean) {
  const original = originalEntityFixture();
  return readEntityCashCountrySourceSlice({
    registry,
    countryId: 'COUNTRY_01',
    mappings: {
      documentId: 'SYNTHETIC_MAPPING_ONLY',
      bytes: original.mappingsBytes,
      sha256: financialInputSha256(original.mappingsBytes),
    },
    originalFields: original.originalFields.filter(
      (r) => r.countryId === 'COUNTRY_01',
    ),
    declaredInput: complete ? declaredEntityCashVector().input() : null,
  });
}
function oldPair(slice: EntityCashCountrySourceSlice) {
  return {
    slice,
    purpose: 'CANDIDATE_DIAGNOSTIC' as const,
    payerEntityId: gov,
    payeeEntityId: op,
    currency: 'XAA',
    scope: slice.declaredScope,
  };
}

describe('COUNTRY01 definition-scoped typed register preparation, never admission', () => {
  it('archives the exact owner bytes and binds only its five-ID structural definition', () => {
    const bytes = readFileSync(
      new URL(
        '../../docs/governance/owner-inputs/2026-10-21/OWNER_B06_C01_DEFINITION_ADOPTION.json',
        import.meta.url,
      ),
      'utf8',
    );
    expect(Buffer.byteLength(bytes)).toBe(3947);
    expect(financialInputSha256(bytes)).toBe(B06_C01_DEFINITION_RECEIPT_SHA256);
    const receipt = JSON.parse(bytes);
    expect(receipt.adoptedDefinitionVersion).toBe(B06_C01_DEFINITION_VERSION);
    expect(receipt.exactStableIds).toEqual(B06_C01_ORIGINAL_IDS);
    expect(receipt.recordSetAdoptionGranted).toBe(false);
    const result = inspect(vector().input());
    for (const owner of owners)
      expect(row(result, owner).candidateTypedRegister!.ownRoles).toEqual(
        receipt.roles[owner],
      );
    noAuthority(result);
  });
  it('maps all eight existing typed sides into independent owner registers of 1/1/1/3/2', () => {
    const result = inspect(vector().input());
    expect(
      result.rows.map((r) => r.candidateTypedRegister!.ownRoles.length),
    ).toEqual([1, 1, 1, 3, 2]);
    expect(
      result.rows.every((r) => r.shapeStatus === 'COMPLETE_DECLARED_SHAPE'),
    ).toBe(true);
    expect(
      row(result, cb)
        .sourceReferenceWitnesses.filter((r) => r.ownerId === cb)
        .every((r) => r.accountClass === 'LIABILITY'),
    ).toBe(true);
    noAuthority(result);
  });
  it('allows one legal original ID without a five-ID data prerequisite', () => {
    const input = vector().input();
    const result = inspect({
      ...input,
      requestedOriginalIds: [id(gov)],
      records: input.records.slice(0, 2),
      registers: input.registers.slice(0, 1),
    });
    expect(result.rows).toHaveLength(1);
    expect(row(result).candidateTypedRegister).not.toBeNull();
    expect(
      row(result).candidateTypedRegister!.necessaryMirrorContext.map(
        (r) => r.role,
      ),
    ).toEqual(['TGA_ISSUANCE_LIABILITY']);
    noAuthority(result);
  });
  it('preserves GOV positive shape while unrelated reserve/H/D and other registers are incomplete', () => {
    const input = vector().input();
    const result = inspect({ ...input, records: input.records.slice(0, 2) });
    expect(row(result).candidateTypedRegister).not.toBeNull();
    for (const owner of [op, hh, bank, cb]) {
      expect(row(result, owner).shapeStatus).toBe('INCOMPLETE');
      expect(row(result, owner).candidateTypedRegister).toBeNull();
    }
    expect(row(result, cb).shapeIssues).toContain(
      'REQUIRED_ROLE_NOT_SUPPLIED:RESERVE_ISSUANCE_LIABILITY',
    );
    noAuthority(result);
  });
  it('keeps optional explicit full-bundle aggregation separate from per-original progress', () => {
    const input = vector().input();
    expect(
      inspect({ ...input, selectionMode: 'FULL_BUNDLE' }).bundleShapeStatus,
    ).toBe('COMPLETE_DECLARED_BUNDLE');
    const partial = inspect({
      ...input,
      selectionMode: 'FULL_BUNDLE',
      records: input.records.slice(0, 2),
    });
    expect(partial.bundleShapeStatus).toBe('INCOMPLETE_BUNDLE');
    expect(row(partial).candidateTypedRegister).not.toBeNull();
    expect(() =>
      inspect({
        ...input,
        requestedOriginalIds: [id(gov)],
        selectionMode: 'FULL_BUNDLE',
      }),
    ).toThrow('FULL_BUNDLE_SCOPE_REQUIRED');
    noAuthority(partial);
  });
  it.each(
    [
      [],
      [id(gov), id(gov)],
      ['U2544::ENTITY::ENTITY_GOVERNMENT_02::account'],
      ['U2544::ENTITY::ENTITY_GOVERNMENT_01::availableNativeCash'],
      ['UNKNOWN'],
    ].map((requestedOriginalIds) => ({ requestedOriginalIds })),
  )(
    'rejects foreign/duplicate/non-B06 scope without broadening other345: %j',
    ({ requestedOriginalIds }) => {
      expect(() =>
        inspect({ ...vector().input(), requestedOriginalIds }),
      ).toThrow('REQUESTED_ID_SCOPE_INVALID');
    },
  );
  it('rejects unknown definition versions and selection modes', () => {
    expect(() =>
      inspect({
        ...vector().input(),
        adoptedDefinitionVersion: 'CALLER_APPROVED',
      }),
    ).toThrow('DEFINITION_VERSION_MISMATCH');
    expect(() =>
      inspect({ ...vector().input(), selectionMode: 'AUTO' as 'PER_ORIGINAL' }),
    ).toThrow('SELECTION_MODE_INVALID');
  });
  it('requires each owner own roles and necessary mirrors, not another owner full register', () => {
    const input = vector().input();
    const missingMirror = inspect({
      ...input,
      requestedOriginalIds: [id(gov)],
      records: input.records.slice(0, 1),
    });
    expect(row(missingMirror).shapeIssues).toContain(
      'REQUIRED_ROLE_NOT_SUPPLIED:TGA_ISSUANCE_LIABILITY',
    );
    expect(row(missingMirror).candidateTypedRegister).toBeNull();
    const onlyMonetary = inspect({
      ...input,
      records: input.records.slice(0, 4),
    });
    expect(row(onlyMonetary, cb).candidateTypedRegister).not.toBeNull();
    expect(row(onlyMonetary, bank).candidateTypedRegister).toBeNull();
    noAuthority(onlyMonetary);
  });
  it('does not substitute a one-member BANK register for its own three-role shape', () => {
    const v = vector();
    v.source.registers[3]!.memberRoles = ['RESERVE_ASSET'];
    const r = inspect(v.input());
    expect(row(r, bank).shapeIssues).toContain(
      'OWNER_ROLE_MEMBERSHIP_MISMATCH',
    );
    expect(row(r).candidateTypedRegister).not.toBeNull();
    noAuthority(r);
  });
  it('rejects duplicate roles and reused origin rows', () => {
    const input = vector().input();
    expect(() =>
      inspect({ ...input, records: [input.records[0]!, input.records[0]!] }),
    ).toThrow('DUPLICATE_ROLE_SELECTION');
    expect(() =>
      inspect({
        ...input,
        records: [
          { ...input.records[1]!, pointer: '/records/0' },
          input.records[0]!,
        ],
      }),
    ).toThrow('SOURCE_ROW_REUSED');
  });
  it('rejects duplicate immutable source/account identities and cross-relationship claim reuse', () => {
    const v = vector();
    v.source.records[1]!.sourceRecordId = v.source.records[0]!.sourceRecordId;
    expect(() => inspect(v.input())).toThrow('DUPLICATE_SOURCE_RECORD_ID');
    const w = vector();
    w.source.records[1]!.accountId = w.source.records[0]!.accountId;
    expect(() => inspect(w.input())).toThrow('DUPLICATE_DECLARED_ACCOUNT_ID');
    const x = vector();
    x.source.records[2]!.claimId = x.source.records[0]!.claimId;
    expect(() => inspect(x.input())).toThrow(
      'CLAIM_ID_REUSED_ACROSS_RELATIONSHIPS',
    );
  });
  it('withholds inconsistent mirrored claim/date scopes without clipping or inventing a counterleg', () => {
    const v = vector();
    v.source.records[1]!.claimId = 'DECLARED_DIFFERENT_CLAIM';
    const r = inspect(v.input());
    expect(row(r).shapeIssues).toContain(
      'RECIPROCAL_CLAIM_SCOPE_MISMATCH:TGA_ASSET',
    );
    expect(row(r).candidateTypedRegister).toBeNull();
    noAuthority(r);
    const w = vector();
    w.source.records[1]!.valueDate = '2026-10-14';
    expect(row(inspect(w.input())).candidateTypedRegister).toBeNull();
  });
  it('rejects role/owner/holder/issuer/counterparty substitutions and CASH relabelling per affected ID', () => {
    const v = vector();
    Object.assign(v.source.records[1]!, {
      holderId: cb,
      counterpartyEntityId: cb,
    });
    const r = inspect(v.input());
    expect(row(r).candidateTypedRegister).toBeNull();
    expect(
      row(r).shapeIssues.some((x) => x.includes('ROLE_holderId_MISMATCH')),
    ).toBe(true);
    const w = vector();
    w.source.records[0]!.accountClass = 'CASH' as 'ASSET';
    expect(row(inspect(w.input())).shapeIssues).toContain(
      'TGA_ASSET:ROLE_accountClass_MISMATCH',
    );
    noAuthority(r);
  });
  it('retains incomplete/null results for absent register or missing immutable binding identity', () => {
    const input = vector().input();
    const r = inspect({ ...input, documents: [], records: [], registers: [] });
    expect(
      r.rows.every(
        (x) =>
          x.candidateTypedRegister === null && x.shapeStatus === 'INCOMPLETE',
      ),
    ).toBe(true);
    const v = vector();
    Object.assign(v.source.records[0]!, {
      sourceRecordId: null,
      accountId: null,
    });
    const missing = inspect(v.input());
    expect(row(missing).shapeIssues).toContain(
      'TGA_ASSET:SOURCE_RECORD_ID_MISSING',
    );
    noAuthority(missing);
  });
  it('binds exact document bytes, length and pointer instead of a caller supplied digest alone', () => {
    const input = vector().input(),
      document = input.documents[0]!;
    expect(() =>
      inspect({
        ...input,
        documents: [{ ...document, bytes: document.bytes + ' ' }],
      }),
    ).toThrow('DOCUMENT_PIN_MISMATCH');
    expect(() =>
      inspect({
        ...input,
        documents: [{ ...document, byteLength: document.byteLength + 1 }],
      }),
    ).toThrow('DOCUMENT_PIN_MISMATCH');
    expect(() =>
      inspect({
        ...input,
        records: [{ ...input.records[0]!, pointer: '/records/999' }],
      }),
    ).toThrow('JSON_POINTER_MISSING');
    expect(() =>
      inspect({
        ...input,
        records: [{ ...input.records[0]!, documentId: 'ABSENT' }],
      }),
    ).toThrow('ORIGIN_DOCUMENT_AND_ROW_REQUIRED');
  });
  it('does not quietly refresh stale source versions or invalid source dates', () => {
    const v = vector();
    v.source.records[0]!.sourceVersion = 'OLD';
    v.source.records[0]!.valueDate = '2026-02-30';
    const r = inspect(v.input());
    expect(row(r).candidateTypedRegister).toBeNull();
    expect(row(r).shapeIssues).toContain(
      'TGA_ASSET:RECORD_SOURCE_VERSION_MISMATCH',
    );
    expect(row(r).shapeIssues).toContain(
      'TGA_ASSET:SOURCE_VALUE_DATE_MISSING_OR_INVALID',
    );
    noAuthority(r);
  });
  it('enforces bounded declaration cardinality and document size', () => {
    const input = vector().input();
    expect(() =>
      inspect({
        ...input,
        documents: Array.from({ length: 17 }, () => input.documents[0]!),
      }),
    ).toThrow('DECLARATION_COUNT_BUDGET');
    expect(() =>
      inspect({
        ...input,
        documents: [
          { ...input.documents[0]!, bytes: 'x'.repeat(2 * 1024 * 1024 + 1) },
        ],
      }),
    ).toThrow('SOURCE_BYTES_BUDGET');
  });
  it('requires a genuine existing registry but does not turn that read-integrity brand into adoption', () => {
    const input = vector().input();
    expect(() => inspect({ ...input, registry: { ...registry } })).toThrow(
      'GENUINE_REGISTRY_REQUIRED',
    );
    noAuthority(inspect(input));
    expect(() =>
      inspect({
        ...input,
        documents: [
          {
            ...input.documents[0]!,
            classification: 'ADOPTED' as 'CONSTRUCTED_CANDIDATE',
          },
        ],
      }),
    ).toThrow('DECLARED_CANDIDATE_CLASSIFICATION_REQUIRED');
  });
  it('ignores alleged authority/receipt/provider payloads instead of minting a public capability', () => {
    let called = false;
    const forged = {
      ...vector().input(),
      sourceAdopted: true,
      recordSetAdopted: true,
      authority: {
        approved: true,
        recordSet: [...B06_C01_ORIGINAL_IDS],
        signatureStatus: 'VALID',
      },
      provider: () => {
        called = true;
        return true;
      },
      definitionReceipt: { definitionAdopted: true },
      opening: { worldId: 'CALLER_WORLD', state: 'INACTIVE' },
      admittedCurrency: 'XAA',
    };
    noAuthority(inspect(forged));
    expect(called).toBe(false);
  });
  it('does not adopt caller-declared active/opening dates or same-code nominal currency', () => {
    const claimed = {
      ...vector().input(),
      opening: { state: 'ACTIVE', epoch: '2026-10-21', head: '0' },
      currencyAdopted: true,
    };
    const r = inspect(claimed);
    noAuthority(r);
    expect(row(r).admissionBlockers).toContain(
      'EXISTING_LAWFUL_INACTIVE_OPENING_NOT_PROVISIONED',
    );
    expect(row(r).admissionBlockers).toContain(
      'ADMITTED_ACCOUNT_CURRENCY_NOT_PROVISIONED',
    );
  });
  it('separates source GCU/nominal LC and refuses native currency mismatch without FX', () => {
    const input = vector().input();
    expect(() => inspect({ ...input, declaredNativeCurrency: 'GCU' })).toThrow(
      'DECLARED_NATIVE_CURRENCY_MISMATCH',
    );
    const v = vector();
    v.source.records[0]!.currency = 'GCU';
    const r = inspect(v.input());
    expect(row(r).shapeIssues).toContain(
      'TGA_ASSET:RECORD_NATIVE_CURRENCY_MISMATCH',
    );
    noAuthority(r);
  });
  it('needs neither B07 amounts/journal nor B16 player roster to inspect structure', () => {
    const v = vector();
    expect(JSON.stringify(v.source)).not.toMatch(
      /openingBalance|closingBalance|roster|userId/u,
    );
    const r = inspect(v.input());
    expect(row(r).candidateTypedRegister).not.toBeNull();
    noAuthority(r);
  });
  it('never constructs Core accounts, invokes the financial producer or installs a writer', () => {
    const code = readFileSync(
      new URL(
        '../../apps/world-worker/src/preparation/b06-country01-typed-register-preparation.ts',
        import.meta.url,
      ),
      'utf8',
    );
    expect(code).not.toMatch(
      /createFinancialAccount\s*\(|produceFormalFinancialOpening\s*\(|CanonicalOpeningSeed|setTimeout\s*\(|Date\.now|Math\.random|from ['"]node:(?:fs|net|http)/u,
    );
    const r = inspect(vector().input());
    noAuthority(r);
    expect(r.accountIdsIssued).toBe(0);
  });
  it('is deterministic under request/selection/document ordering without inventing source bytes', () => {
    const input = vector().input();
    expect(
      inspect({
        ...input,
        requestedOriginalIds: [...input.requestedOriginalIds].reverse(),
        records: [...input.records].reverse(),
        registers: [...input.registers].reverse(),
        documents: [...input.documents].reverse(),
      }),
    ).toEqual(inspect(input));
  });
  it('keeps typed references out of legacy candidateValue and the actual old paired CASH reader', () => {
    const typed = inspect(vector().input());
    const slice = oldSlice(false);
    expect(slice.rows.every((r) => r.candidateValue === null)).toBe(true);
    expect(typed.rows.every((r) => r.candidateTypedRegister !== null)).toBe(
      true,
    );
    const pair = readIsolatedEntityCashPair(oldPair(slice));
    expect(pair.status).toBe(
      'BLOCKED_BOTH_ENDPOINTS_REQUIRE_COMPLETE_CANDIDATE_CASH',
    );
    expect(pair.payer).toBeNull();
    expect(pair.payee).toBeNull();
    expect(pair.paymentExecuted).toBe(false);
    noAuthority(typed);
  });
  it('rejects a typed result or merged copy as a genuine old slice, without sharing its brand', () => {
    const typed = inspect(vector().input()),
      slice = oldSlice(false);
    expect(() =>
      readIsolatedEntityCashPair({
        ...oldPair(slice),
        slice: typed as unknown as EntityCashCountrySourceSlice,
      }),
    ).toThrow('GENUINE_ENTITY_CASH_SLICE_REQUIRED');
    expect(() =>
      readIsolatedEntityCashPair({
        ...oldPair(slice),
        slice: {
          ...slice,
          rows: typed.rows,
        } as unknown as EntityCashCountrySourceSlice,
      }),
    ).toThrow('GENUINE_ENTITY_CASH_SLICE_REQUIRED');
  });
  it('retains the real existing TEST_ONLY CASH diagnostic positive without formal payment', () => {
    const slice = oldSlice(true);
    const request = oldPair(slice);
    const pair = readIsolatedEntityCashPair(request);
    expect(pair.status).toBe('DECLARED_PAIR_READBACK_NOT_ADMITTED');
    expect(pair.payer!.declaredAvailable).toMatchObject({
      amount: '90.25',
      currency: 'XAA',
    });
    expect(pair.paymentExecuted).toBe(false);
    expect(() =>
      readIsolatedEntityCashPair({ ...request, purpose: 'FORMAL_SETTLEMENT' }),
    ).toThrow('SOURCE_ADMISSION_AND_CURRENT_AUTHORIZATION_REQUIRED');
  });
  it('explicitly maps raw paired holderId to record owner, assetHolderId to beneficial holder', () => {
    const v = vector();
    const normal = v.source.records[1]!;
    Object.assign(normal, {
      holdingId: 'SOURCE_HOLDING_CB_TGA',
      sharedClaimId: 'SOURCE_TGA_CLAIM',
      holderId: cb,
      assetHolderId: gov,
      issuerId: cb,
      counterpartyId: gov,
      role: 'LIABILITY',
      tool: 'TGA',
      nativeCurrency: 'XAA',
      version: 'SYNTHETIC_TYPED_V1',
    });
    const input = v.input();
    const r = inspect({
      ...input,
      records: [
        {
          ...input.records[1]!,
          role: 'TGA_ISSUANCE_LIABILITY',
          sourceSchema: 'PAIRED_HOLDING_REFERENCE_V1',
        },
      ],
    });
    const witness = row(r).sourceReferenceWitnesses[0]!;
    expect(witness.ownerId).toBe(cb);
    expect(witness.holderId).toBe(gov);
    expect(witness.ownerField).toBe('holderId');
    expect(witness.beneficialHolderField).toBe('assetHolderId');
    expect(witness.declaredAccountId).toBeNull();
    expect(row(r).candidateTypedRegister).toBeNull();
    noAuthority(r);
  });
  it('reads four constructed holding references but never turns them into account IDs or creates H/D records', () => {
    const v = vector();
    const leaves = v.source.records.slice(0, 4).map((r, index) => ({
      sourceRecordIdentity: `CONSTRUCTED_HOLDING_${index}`,
      sharedSourceClaimIdentity: r.claimId,
      sourceVersion: r.sourceVersion,
      recordOwnerEntityId: r.ownerId,
      beneficialHolderEntityId: r.holderId,
      economicLiabilityIssuerEntityId: r.issuerId,
      counterpartyEntityId: r.counterpartyEntityId,
      role: r.accountClass,
      tool: index < 2 ? 'TGA' : 'RESERVE',
      sourceCurrencyReference: 'XAA',
      sourceValueDate: r.valueDate,
      accountId: 'UNTRUSTED_HOLDING_IS_NOT_ACCOUNT',
      isActualCoreAccountId: true,
    }));
    const bytes = JSON.stringify({
      schemaVersion: 'A_B06_C01_TYPED_SOURCE_ISSUANCE_ADMISSION_CHAIN_V1',
      scope: {
        originalIds: [...B06_C01_ORIGINAL_IDS],
        definitionVersion: B06_C01_DEFINITION_VERSION,
      },
      newSourceLeaves: leaves,
    });
    const r = inspect({
      ...v.input(),
      documents: [
        {
          documentId: 'HOLDING_SUMMARY',
          sourceId: 'CONSTRUCTED_REFERENCE',
          sourceVersion: 'SYNTHETIC_TYPED_V1',
          classification: 'CONSTRUCTED_CANDIDATE',
          bytes,
          byteLength: Buffer.byteLength(bytes),
          sha256: financialInputSha256(bytes),
        },
      ],
      registers: [],
      records: v
        .input()
        .records.slice(0, 4)
        .map((s, i) => ({
          ...s,
          documentId: 'HOLDING_SUMMARY',
          pointer: `/newSourceLeaves/${i}`,
          sourceSchema: 'A_TYPED_HOLDING_REFERENCE_V1',
        })),
    });
    expect(
      row(r).sourceReferenceWitnesses.every(
        (w) => w.declaredAccountId === null,
      ),
    ).toBe(true);
    expect(row(r).shapeIssues).toContain(
      'TGA_ASSET:HOLDING_IDENTITY_NOT_ACCOUNT_BINDING',
    );
    expect(row(r, hh).sourceReferenceWitnesses).toEqual([]);
    expect(row(r, op).sourceReferenceWitnesses).toEqual([]);
    noAuthority(r);
  });
  it('leaves V2 draft-like aliases as unissued declarations even when caller fills identifiers', () => {
    const v = vector();
    v.source.records[0]!.accountId = 'DRAFT_C01_TGA_ASSET_V2';
    const r = inspect(v.input());
    expect(row(r).candidateTypedRegister).not.toBeNull();
    noAuthority(r);
  });
  it('keeps output deeply frozen and historical ACCOUNT/350/2544 meaning untouched', () => {
    const result = inspect(vector().input());
    expect(Object.isFrozen(result.rows)).toBe(true);
    expect(
      Object.isFrozen(row(result).candidateTypedRegister!.memberOrigins),
    ).toBe(true);
    expect(row(result).unit).toBe('ACCOUNT');
    expect(result.rows.map((r) => r.stableId)).toEqual(B06_C01_ORIGINAL_IDS);
    noAuthority(result);
  });
  it('refuses unsupported role/schema and duplicate or foreign register declarations', () => {
    const input = vector().input();
    expect(() =>
      inspect({
        ...input,
        records: [
          { ...input.records[0]!, role: 'OTHER' as B06Country01TypedRole },
        ],
      }),
    ).toThrow('TYPED_ROLE_OUTSIDE_POLICY');
    expect(() =>
      inspect({
        ...input,
        records: [
          {
            ...input.records[0]!,
            sourceSchema: 'AUTO' as 'NORMALIZED_TYPED_ACCOUNT_V1',
          },
        ],
      }),
    ).toThrow('SOURCE_SCHEMA_UNSUPPORTED');
    expect(() =>
      inspect({
        ...input,
        registers: [input.registers[0]!, input.registers[0]!],
      }),
    ).toThrow('DUPLICATE_REGISTER_SELECTION');
    expect(() =>
      inspect({
        ...input,
        registers: [{ ...input.registers[0]!, stableId: 'OTHER' }],
      }),
    ).toThrow('REGISTER_OUTSIDE_POLICY');
  });
  it('does not let a foreign record/register or caller capability locator certify an original binding', () => {
    const v = vector();
    v.source.records[0]!.countryId = 'COUNTRY_02';
    v.source.registers[0]!.countryId = 'COUNTRY_02';
    const r = inspect(v.input());
    expect(row(r).shapeIssues).toContain('TGA_ASSET:RECORD_COUNTRY_MISMATCH');
    expect(row(r).shapeIssues).toContain('REGISTER_SCOPE_OR_VERSION_MISMATCH');
    expect(row(r, hh).candidateTypedRegister).not.toBeNull();
    const w = vector();
    Object.assign(w.source.records[0]!, {
      sourceCapabilityLocator: 'CALLER_SAYS_AUTHORIZED',
    });
    noAuthority(inspect(w.input()));
    noAuthority(r);
  });
});
