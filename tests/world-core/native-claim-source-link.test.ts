import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  linkNativeClaimSources,
  type NativeClaimLinkDocument,
} from '../../apps/world-worker/src/preparation/native-claim-source-link.js';
import { financialInputSha256 } from '../../apps/world-worker/src/preparation/formal-financial-opening-contract.js';

// Finite mechanism vector; never an opening, actual holding or funding source.
function vector(tool: 'TGA' | 'RESERVE' = 'RESERVE') {
  const version = 'MECHANISM_LINK_V1',
    date = '2026-10-13',
    currency = 'XAA';
  const holder = tool === 'TGA' ? 'ENTITY_GOVERNMENT_01' : 'ENTITY_BANK_01';
  const owner = tool === 'TGA' ? 'GOV-01' : 'BANK-01';
  const field =
    tool === 'TGA' ? 'treasuryCentralBankBalance' : 'bankReserveAssets';
  const selection = {
    countryId: 'COUNTRY_01',
    holderEntityId: holder,
    issuerEntityId: 'ENTITY_CENTRAL_BANK_01',
    nativeOwnerLabel: owner,
    sourceSharedClaimId: 'CLAIM_MECHANISM_ONLY',
    tool,
  };
  const common = {
    countryId: 'COUNTRY_01',
    tool,
    category:
      tool === 'TGA'
        ? 'TREASURY_GOVERNMENT_DEPOSIT'
        : 'COMMERCIAL_BANK_RESERVE_ACCOUNTS',
    sharedClaimId: selection.sourceSharedClaimId,
    assetHolderId: holder,
    issuerId: selection.issuerEntityId,
    nativeAmount: '12.25',
    nativeCurrency: currency,
    bookLC: '12.25',
    bookLocalCurrency: currency,
    bookLcPerNativeUnit: '1',
    valueDate: date,
    version,
    adoptionClass: 'CONSTRUCTED_CANDIDATE_NOT_ADOPTED',
  };
  const positions = {
    version,
    valueDate: date,
    positions: [
      {
        ...common,
        role: 'ASSET',
        category: null as string | null,
        holderId: holder,
        counterpartyId: selection.issuerEntityId,
        holdingId: 'HOLDING_VECTOR_ASSET',
      },
      {
        ...common,
        role: 'LIABILITY',
        holderId: selection.issuerEntityId,
        counterpartyId: holder,
        holdingId: 'HOLDING_VECTOR_LIABILITY',
      },
    ],
  };
  const native = {
    version: 'MECHANISM_NATIVE_V2',
    countries: [
      {
        countryId: 'COUNTRY_01',
        currencyCode: currency,
        LCperGCU: '2.5',
        valuesNative: { [field]: { amount: '12.25', currency, unit: 'LC' } },
        ownerBucketsNative: {} as Record<string, unknown>,
        originalGcuLineage: {
          pointer: '/countryFinance/0',
          source: { sha256: '', bytes: 0 },
        },
      },
    ],
  };
  const fx = {
    version,
    valueDate: date,
    countries: [
      {
        countryId: 'COUNTRY_01',
        currencyCode: currency,
        LCperGCU: '2.5',
        valueDate: date,
      },
    ],
  };
  const joint = {
    version,
    valueDate: date,
    countryFinance: [
      {
        countryId: 'COUNTRY_01',
        currencyCode: currency,
        LCperGCU: '2.5',
        valuesLocalCurrency: { [field]: '12.25' },
        valuesGcuReference: { [field]: '4.9' },
      },
    ],
  };
  const reference = {
    countryId: 'COUNTRY_01',
    sourceClass: 'REFERENCE_MAPPING_NOT_LEGAL_ACCOUNT_OR_CURRENT_AUTHORITY',
    actualAccount: null,
    actualHolderAdmission: null,
    actualCurrentAuthorization: null,
  };
  const crosswalk = {
    status: 'REFERENCE_CROSSWALK_NOT_ACCOUNT_BINDING',
    rows: [
      {
        ...reference,
        entityId: holder,
        legacyEntityId: owner,
        role: tool === 'TGA' ? 'GOV' : 'BANK',
      },
      {
        ...reference,
        entityId: selection.issuerEntityId,
        legacyEntityId: 'CENTRAL-BANK-01',
        role: 'CENTRAL_BANK',
      },
    ],
  };
  const doc = (
    documentId: string,
    body: { version: string },
  ): NativeClaimLinkDocument => {
    const bytes = JSON.stringify(body);
    return {
      documentId,
      sourceVersion: body.version,
      bytes,
      sha256: financialInputSha256(bytes),
    };
  };
  const input = () => {
    const j = doc('JOINT_VECTOR', joint);
    native.countries[0]!.originalGcuLineage.source = {
      sha256: j.sha256,
      bytes: Buffer.byteLength(j.bytes),
    };
    const crosswalkBytes = JSON.stringify(crosswalk);
    return {
      selection,
      documents: {
        positions: doc('POSITIONS_VECTOR', positions),
        native: doc('NATIVE_VECTOR', native),
        fx: doc('FX_VECTOR', fx),
        joint: j,
        crosswalk: {
          documentId: 'CROSSWALK_VECTOR',
          sourceVersion: 'BYTE_PINNED_LEGACY_NO_DECLARED_VERSION',
          bytes: crosswalkBytes,
          sha256: financialInputSha256(crosswalkBytes),
        },
      },
    };
  };
  return { positions, native, fx, joint, crosswalk, field, selection, input };
}

describe('non-authoritative native claim source association', () => {
  it('is deterministic and leaves supplied source documents/selection unchanged', () => {
    const input = vector().input(),
      before = JSON.stringify(input);
    const first = linkNativeClaimSources(input);
    expect(linkNativeClaimSources(input)).toEqual(first);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('recovers BANK reserve value despite absent owner bucket, without doubling mirrors or creating cash', () => {
    const r = linkNativeClaimSources(vector().input());
    expect(r.principal).toEqual({ amount: '12.25', currency: 'XAA' });
    expect(r.mirrorCount).toBe(2);
    expect(r.principalCount).toBe(1);
    expect(r.sourceCategories).toEqual({
      asset: null,
      liability: 'COMMERCIAL_BANK_RESERVE_ACCOUNTS',
    });
    expect(r.nativeOwnerBucket).toBe('ABSENT_NOT_ZERO');
    expect(r.actualCashAccountId).toBeNull();
    expect(r.actualAvailableNativeCash).toBeNull();
    expect(r.admittedFinancialClaimId).toBeNull();
    expect(r.actualAsOf).toBeNull();
    expect(r.valuation.nativeFieldReconverted).toBe(false);
    expect(Object.values(r.originalFieldStages).every((x) => !x)).toBe(true);
    expect(
      r.sourceAdoption ||
        r.signatureVerified ||
        r.runtimeConnected ||
        r.accountIdsCreated,
    ).toBe(false);
    expect(r.originalClosures).toBe(0);
    expect(Object.isFrozen(r.sourceReferences)).toBe(true);
  });
  it('also links existing GOV TGA source, not a second treasury CASH pool', () => {
    const v = vector('TGA');
    v.native.countries[0]!.ownerBucketsNative['GOV-01'] = {
      accessible: 'SOURCE_CLAIM_ONLY',
    };
    const r = linkNativeClaimSources(v.input());
    expect(r.tool).toBe('TGA');
    expect(r.nativeOwnerBucket).toBe('PRESENT_CLAIM_NOT_CASH');
    expect(r.actualAvailableNativeCash).toBeNull();
    expect(r.blockers).toContain('CLAIM_NOT_CASH');
  });
  it('requires exact existing reference holder/issuer/legacy-label roles, not source-declared legal admission', () => {
    const v = vector();
    v.selection.nativeOwnerLabel = 'GOV-01';
    expect(() => linkNativeClaimSources(v.input())).toThrow(
      'NATIVE_OWNER_LABEL_MISMATCH',
    );
    const wrong = vector();
    wrong.crosswalk.rows[0]!.countryId = 'COUNTRY_02';
    expect(() => linkNativeClaimSources(wrong.input())).toThrow(
      'CLAIM_REFERENCE_MAPPING_MISMATCH',
    );
  });
  it.each([
    [
      'contradictory instrument category',
      'CLAIM_TOOL_CATEGORY_MISMATCH',
      (v: ReturnType<typeof vector>) => {
        v.positions.positions[0]!.category = 'FX_CASH_AND_DEPOSITS';
      },
    ],
    [
      'holding ID reused by another claim',
      'CLAIM_HOLDING_ID_DUPLICATED',
      (v: ReturnType<typeof vector>) => {
        v.positions.positions.push({
          ...v.positions.positions[0]!,
          sharedClaimId: 'OTHER_VECTOR_CLAIM',
        });
      },
    ],
    [
      'duplicate mirror',
      'CLAIM_PAIR_MISSING_OR_DUPLICATED',
      (v: ReturnType<typeof vector>) => {
        v.positions.positions.push({ ...v.positions.positions[0]! });
      },
    ],
    [
      'liability mistaken for holder',
      'CLAIM_PAIR_DIRECTION_MISMATCH',
      (v: ReturnType<typeof vector>) => {
        v.positions.positions[1]!.holderId = v.selection.holderEntityId;
      },
    ],
    [
      'wrong issuer',
      'CLAIM_HOLDER_ISSUER_MISMATCH',
      (v: ReturnType<typeof vector>) => {
        v.positions.positions[0]!.issuerId = 'ENTITY_CENTRAL_BANK_02';
      },
    ],
    [
      'unequal mirrors',
      'CLAIM_MIRROR_AMOUNT_MISMATCH',
      (v: ReturnType<typeof vector>) => {
        v.positions.positions[1]!.nativeAmount = '24.5';
      },
    ],
    [
      'double FX on already-native book value',
      'NATIVE_BOOK_VALUE_MISMATCH',
      (v: ReturnType<typeof vector>) => {
        v.positions.positions[0]!.bookLC = '30.625';
      },
    ],
    [
      'wrong native unit',
      'NATIVE_VALUE_UNIT_MISMATCH',
      (v: ReturnType<typeof vector>) => {
        v.native.countries[0]!.valuesNative[v.field]!.unit = 'GCU_EQUIVALENT';
      },
    ],
    [
      'wrong currency',
      'NATIVE_CURRENCY_SOURCE_MISMATCH',
      (v: ReturnType<typeof vector>) => {
        v.fx.countries[0]!.currencyCode = 'GCU';
      },
    ],
    [
      'wrong valuation reference',
      'CLAIM_VALUATION_MISMATCH',
      (v: ReturnType<typeof vector>) => {
        v.joint.countryFinance[0]!.valuesGcuReference[v.field] = '5';
      },
    ],
    [
      'wrong source date',
      'VALUATION_VERSION_DATE_MISMATCH',
      (v: ReturnType<typeof vector>) => {
        v.positions.valueDate = '2026-10-14';
      },
    ],
  ] as const)('rejects %s', (_name, code, change) => {
    const v = vector();
    change(v);
    expect(() => linkNativeClaimSources(v.input())).toThrow(code);
  });
  it('does not replace a missing native amount with zero; an explicit sourced zero stays claim-only', () => {
    const v = vector();
    delete v.native.countries[0]!.valuesNative[v.field];
    expect(() => linkNativeClaimSources(v.input())).toThrow();
    const z = vector();
    z.native.countries[0]!.valuesNative[z.field]!.amount = '0';
    z.positions.positions.forEach((p) => {
      p.nativeAmount = '0';
      p.bookLC = '0';
    });
    z.joint.countryFinance[0]!.valuesLocalCurrency[z.field] = '0';
    z.joint.countryFinance[0]!.valuesGcuReference[z.field] = '0';
    const r = linkNativeClaimSources(z.input());
    expect(r.principal.amount).toBe('0');
    expect(r.actualAvailableNativeCash).toBeNull();
  });
  it('rejects stale parent bytes/hash and numeric sourceVersion, even when documents are otherwise consistent', () => {
    const v = vector(),
      input = v.input();
    expect(() =>
      linkNativeClaimSources({
        ...input,
        documents: {
          ...input.documents,
          native: {
            ...input.documents.native,
            bytes: input.documents.native.bytes + ' ',
          },
        },
      }),
    ).toThrow('LINK_SOURCE_HASH_MISMATCH');
    const raw = JSON.parse(input.documents.native.bytes);
    raw.countries[0].originalGcuLineage.source.sha256 = '0'.repeat(64);
    const bytes = JSON.stringify(raw);
    expect(() =>
      linkNativeClaimSources({
        ...input,
        documents: {
          ...input.documents,
          native: {
            ...input.documents.native,
            bytes,
            sha256: financialInputSha256(bytes),
          },
        },
      }),
    ).toThrow('NATIVE_JOINT_LINEAGE_MISMATCH');
    const b = input.documents.positions.bytes.replace(
      '"version":"MECHANISM_LINK_V1"',
      '"version":123',
    );
    expect(() =>
      linkNativeClaimSources({
        ...input,
        documents: {
          ...input.documents,
          positions: {
            ...input.documents.positions,
            bytes: b,
            sha256: financialInputSha256(b),
            sourceVersion: '123',
          },
        },
      }),
    ).toThrow('LINK_SOURCE_VERSION_MISMATCH');
  });
  it('retains exact unquoted source amount beyond Number precision and never treats adoption labels as authority', () => {
    const v = vector(),
      big = '90071992547409931234567890.125';
    v.native.countries[0]!.LCperGCU = '1';
    v.fx.countries[0]!.LCperGCU = '1';
    v.joint.countryFinance[0]!.LCperGCU = '1';
    v.native.countries[0]!.valuesNative[v.field]!.amount = big;
    v.joint.countryFinance[0]!.valuesGcuReference[v.field] = big;
    v.joint.countryFinance[0]!.valuesLocalCurrency[v.field] = big;
    v.positions.positions.forEach((p) => {
      p.nativeAmount = big;
      p.bookLC = big;
      p.adoptionClass = 'CALLER_CLAIMS_ADOPTED';
    });
    const input = v.input(),
      d = input.documents.native;
    const bytes = d.bytes.replace('"amount":"' + big + '"', '"amount":' + big);
    const r = linkNativeClaimSources({
      ...input,
      documents: {
        ...input.documents,
        native: { ...d, bytes, sha256: financialInputSha256(bytes) },
      },
    });
    expect(r.principal.amount).toBe(big);
    expect(r.sourceAdoption).toBe(false);
    expect(r.signatureVerified).toBe(false);
  });
  it.runIf(process.env.F_NATIVE_CLAIM_REAL_SOURCES === '1')(
    'links actual BANK01 reserve source leaves under fixed pins; no fixture, CASH, original completion or full scan',
    async () => {
      const sourceRoot =
        '/Users/samuel/Documents/Codex/2026-10-10/task-3/world-opening-fx-cb-scene-20261013-v1';
      const pins = [
        [
          'positions',
          sourceRoot + '/PAIRED_NATIVE_OPENING_POSITIONS.json',
          '22e0a293f9edbbdd28684c6c6c0c68c4621855b06a44fb17bd1bbda19b9fdfe3',
        ],
        [
          'native',
          '/Users/samuel/Documents/Codex/2026-10-13/task/first14-finance-reconstruction-v1/UNIT_SAFE_NATIVE_BUCKETS.json',
          '264b3b4d2278ebf407f4ff29446fc59d86cc72bcaced08ab7e60b54949ed2a8a',
        ],
        [
          'fx',
          sourceRoot + '/CURRENCY_FX_RULES_AND_CANDIDATE.json',
          '812e95994053837139afd6b8798a68d3ff4f4436fbd839dfb8f9568371c3e562',
        ],
        [
          'joint',
          sourceRoot + '/FINANCE_INVENTORY_DAY0_JOINT.proposed.json',
          '76746d973e67a2d69d5172d2a99d84254ad8f70a70628fbec57f5c2a9509529f',
        ],
        [
          'crosswalk',
          '/Users/samuel/Documents/econclub/.econmind-artifacts/unknown2544-closure-20261015/outputs/F/first-batch-v1/ENTITY_CROSSWALK.json',
          'a311bd7db628c0bff9a0785c951d2c4046bba097589b1c7902794b44a4b85654',
        ],
      ] as const;
      const entries = await Promise.all(
        pins.map(async ([key, path, sha256]) => {
          const bytes = await readFile(path, 'utf8');
          expect(financialInputSha256(bytes)).toBe(sha256);
          return [
            key,
            {
              documentId: key,
              sourceVersion:
                key === 'crosswalk'
                  ? 'BYTE_PINNED_LEGACY_NO_DECLARED_VERSION'
                  : (JSON.parse(bytes).version as string),
              bytes,
              sha256,
            },
          ] as const;
        }),
      );
      const documents = Object.fromEntries(entries) as unknown as Parameters<
        typeof linkNativeClaimSources
      >[0]['documents'];
      const linked = linkNativeClaimSources({
        selection: {
          countryId: 'COUNTRY_01',
          holderEntityId: 'ENTITY_BANK_01',
          issuerEntityId: 'ENTITY_CENTRAL_BANK_01',
          nativeOwnerLabel: 'BANK-01',
          sourceSharedClaimId: 'SCENE_RESERVE_01_V2',
          tool: 'RESERVE',
        },
        documents,
      });
      expect(linked.principal).toEqual({
        amount: '5616522645405.8461166807580672',
        currency: 'XAA',
      });
      expect(linked.nativeOwnerBucket).toBe('ABSENT_NOT_ZERO');
      expect(linked.principalCount).toBe(1);
      expect(linked.sourceCategories).toEqual({
        asset: null,
        liability: 'COMMERCIAL_BANK_RESERVE_ACCOUNTS',
      });
      expect(linked.actualCashAccountId).toBeNull();
      expect(linked.actualAvailableNativeCash).toBeNull();
      expect(linked.sourceValueDate).toBe('2026-10-13');
      expect(linked.actualAsOf).toBeNull();
      expect(linked.sourceHoldingIds).toEqual({
        asset: 'SCENE_RESERVE_01_V2_ASSET',
        liability: 'SCENE_RESERVE_01_V2_LIABILITY',
      });
      expect(Object.values(linked.originalFieldStages).every((x) => !x)).toBe(
        true,
      );
      const readBytes = Object.values(documents).reduce(
        (n, d) => n + Buffer.byteLength(d.bytes),
        0,
      );
      expect(readBytes).toBeLessThan(3 * 1024 * 1024);
      console.log(
        'F_NATIVE_LINK_REAL_JSON:' +
          JSON.stringify({
            classification: 'READ_ONLY_ACTUAL_SOURCE_ASSOCIATION_NOT_ADOPTION',
            readBytes,
            sources: pins.map(([id, path, sha256]) => ({ id, path, sha256 })),
            linked,
            originalStableIds: [
              'U2544::ENTITY::ENTITY_BANK_01::account',
              'U2544::ENTITY::ENTITY_BANK_01::availableNativeCash',
            ],
            originalClosures: 0,
          }),
      );
    },
  );
});
