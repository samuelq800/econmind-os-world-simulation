/** B06/B07 bounded source intake/readback only. No account issuer, funds,
 * admission, permission resolver, writer, runtime registration or new ledger. */
import { canonicalSerialize } from '@econmind/core';
import {
  isLoadedFinancialOpeningPackageRegistry,
  parseFinancialRegistrySourceJson,
  registryArray,
  registryRow,
  resolveFinancialRegistrySource,
  type LoadedFinancialOpeningPackageRegistry,
} from './financial-opening-package-registry.js';
import {
  financialInputSha256,
  freezeFinancialInput,
} from './formal-financial-opening-contract.js';
import {
  buildEntityNativeCashCandidate,
  type EntityCashBuilderInput,
} from './entity-native-cash-candidate-builder.js';
import type { OriginalEntityCashField } from './entity-native-cash-candidate-adapter.js';
import {
  NativeCashCandidateInvalid,
  readNativeCashSourceCandidate,
  type NativeCashCandidateScope,
} from './native-cash-source-candidate.js';

const roles = ['GOVERNMENT', 'OPERATOR', 'HOUSEHOLDS', 'BANK', 'CENTRAL_BANK'];
const slices = new WeakSet<object>();
function demand(value: unknown, code: string): asserts value {
  if (!value) throw new NativeCashCandidateInvalid(code);
}

export interface EntityCashSliceInput {
  readonly registry: LoadedFinancialOpeningPackageRegistry;
  readonly countryId: string;
  readonly mappings: Readonly<{
    documentId: string;
    bytes: string;
    sha256: string;
  }>;
  readonly originalFields: readonly OriginalEntityCashField[];
  /** Explicit candidate input only; null must not synthesize opening identity. */
  readonly declaredInput: EntityCashBuilderInput | null;
}

export function readEntityCashCountrySourceSlice(input: EntityCashSliceInput) {
  demand(
    isLoadedFinancialOpeningPackageRegistry(input.registry),
    'GENUINE_REGISTRY_REQUIRED',
  );
  demand(
    /^COUNTRY_(0[1-9]|[1-6][0-9]|70)$/u.test(input.countryId),
    'COUNTRY_SCOPE_INVALID',
  );
  demand(
    Buffer.byteLength(input.mappings.bytes) <= 1024 * 1024 &&
      input.mappings.documentId.length > 0 &&
      financialInputSha256(input.mappings.bytes) === input.mappings.sha256,
    'MAPPING_PIN_MISMATCH',
  );
  const mapping = registryRow(
    parseFinancialRegistrySourceJson(input.mappings.bytes),
    'mapping',
  );
  demand(
    mapping.status === 'REFERENCE_CROSSWALK_NOT_ACCOUNT_BINDING',
    'REFERENCE_MAPPING_REQUIRED',
  );
  const all = registryArray(mapping.rows, 'mapping.rows').map((r) =>
    registryRow(r, 'mapping.row'),
  );
  demand(all.length <= 350, 'MAPPING_COUNT_BUDGET');
  const selected = all.flatMap((row, index) =>
    row.countryId === input.countryId ? [{ row, index }] : [],
  );
  const suffix = input.countryId.slice(-2);
  const owners = roles.map((role) => `ENTITY_${role}_${suffix}`);
  demand(
    selected.length === 5 &&
      owners.every(
        (id) => selected.filter(({ row }) => row.entityId === id).length === 1,
      ),
    'EXACT_FIVE_ENTITY_MAPPING_REQUIRED',
  );
  const country = input.registry.countries.filter(
    (c) => c.countryId === input.countryId,
  );
  demand(country.length === 1, 'REGISTRY_COUNTRY_REQUIRED');
  const native = resolveFinancialRegistrySource(input.registry, {
    sourceId: 'native_lc',
    selector: { kind: 'JSON_POINTER', pointer: '/countries' },
  });
  demand(native.status === 'VERIFIED_LEAF', 'NATIVE_SOURCE_UNAVAILABLE');
  const nativeRows = registryArray(native.value, 'native.countries').map((r) =>
    registryRow(r, 'native.country'),
  );
  const nativeIndex = nativeRows.findIndex(
    (r) => r.countryId === input.countryId,
  );
  demand(
    nativeIndex >= 0 &&
      nativeRows.filter((r) => r.countryId === input.countryId).length === 1,
    'NATIVE_COUNTRY_UNIQUE_REQUIRED',
  );
  const nativeCountry = nativeRows[nativeIndex]!;
  demand(
    typeof country[0]!.nativeCurrency === 'string' &&
      country[0]!.nativeCurrency === nativeCountry.currencyCode,
    'NATIVE_CURRENCY_CROSSWALK_MISMATCH',
  );
  const nativeCurrency = country[0]!.nativeCurrency as string;
  const legacyCountry = registryRow(
    country[0]!.identityCrosswalk,
    'identityCrosswalk',
  ).legacyCountryId;
  demand(
    new Set(selected.map(({ row }) => row.legacyEntityId)).size === 5,
    'DUPLICATE_LEGACY_ENTITY',
  );
  for (const { row } of selected)
    demand(
      row.sourceClass ===
        'REFERENCE_MAPPING_NOT_LEGAL_ACCOUNT_OR_CURRENT_AUTHORITY' &&
        row.actualAccount === null &&
        row.actualHolderAdmission === null &&
        row.actualCurrentAuthorization === null &&
        row.legacyCountryId === legacyCountry,
      'MAPPING_IS_NOT_REFERENCE_ONLY',
    );
  const expectedIds = owners.flatMap((owner) =>
    ['account', 'availableNativeCash'].map(
      (f) => `U2544::ENTITY::${owner}::${f}`,
    ),
  );
  demand(
    input.originalFields.length === 10 &&
      new Set(input.originalFields.map((r) => r.stableId)).size === 10 &&
      input.originalFields.every(
        (r) =>
          expectedIds.includes(r.stableId) &&
          owners.includes(r.ownerId) &&
          r.countryId === input.countryId &&
          ['account', 'availableNativeCash'].includes(r.missingField) &&
          r.stableId === `U2544::ENTITY::${r.ownerId}::${r.missingField}`,
      ),
    'EXACT_TEN_ORIGINAL_IDS_REQUIRED',
  );
  if (input.declaredInput !== null)
    for (const selection of input.declaredInput.selections)
      demand(
        owners.includes(selection.entityId) &&
          selection.countryId === input.countryId &&
          selection.nativeCurrency === nativeCurrency,
        'SELECTION_NOT_ORIGINAL_NATIVE_ENTITY',
      );
  // Reuse the existing source journal and restriction-UNION reader. No formula,
  // ledger, implicit zero or account ID is introduced by this country slice.
  const built =
    input.declaredInput === null
      ? null
      : buildEntityNativeCashCandidate(input.declaredInput);
  const candidates =
    built === null || input.declaredInput === null
      ? null
      : readNativeCashSourceCandidate({
          registry: input.registry,
          mappingsBytes: JSON.stringify({
            status: mapping.status,
            rows: selected.map(({ row }) => row),
          }),
          document:
            input.declaredInput.selections.length === 0 ? null : built.document,
          expected: input.declaredInput.expected,
        });
  const rows = input.originalFields.map((original) => {
    const mapped = selected.find(
      ({ row }) => row.entityId === original.ownerId,
    )!;
    const witness =
      built?.witnesses.find((w) => w.entityId === original.ownerId) ?? null;
    const candidate =
      candidates?.rows.find((r) => r.entityId === original.ownerId) ?? null;
    const accountField = original.missingField === 'account';
    return {
      stableId: original.stableId,
      ownerId: original.ownerId,
      countryId: original.countryId,
      missingField: original.missingField,
      batchId: accountField ? ('B06' as const) : ('B07' as const),
      unit: accountField ? ('ACCOUNT' as const) : ('NATIVE_MONEY' as const),
      actualValue: null,
      actualCurrency: null,
      actualPeriod: null,
      actualWorldHead: null,
      actualAdmission: null,
      observedNativeCurrencyCandidate: nativeCurrency,
      candidateValue: accountField
        ? (witness?.accountCandidate ?? null)
        : (candidate?.candidateAvailable ?? null),
      candidatePeriodStart: witness?.cashCandidate?.periodStart ?? null,
      candidateValueDate: input.declaredInput?.expected.asOf ?? null,
      candidateCalculation: accountField
        ? null
        : {
            balance: candidate?.candidateBalance ?? null,
            restrictedUnion: candidate?.candidateRestricted ?? null,
            available: candidate?.candidateAvailable ?? null,
          },
      reason: accountField
        ? (witness?.reason ?? 'SOURCE_OWNED_ACCOUNT_NOT_SUPPLIED')
        : (candidate?.reason ?? 'CASH_SOURCE_NOT_SUPPLIED'),
      sourcePointers: {
        mapping: {
          documentId: input.mappings.documentId,
          sha256: input.mappings.sha256,
          pointer: `/rows/${mapped.index}`,
        },
        nativeCurrency: {
          sourceId: 'native_lc',
          pointer: `/countries/${nativeIndex}/currencyCode`,
        },
        account: witness?.accountSource ?? null,
        cash: witness?.cashCandidate?.source ?? null,
      },
      originalFieldStages: {
        sourceComplete: false,
        engineeringWired: false,
        validationPassed: false,
        formallyAdopted: false,
      },
      currentPermission: 'UNKNOWN' as const,
    };
  });
  const result = freezeFinancialInput({
    schemaVersion: 'entity-native-cash-country-source-slice-v1' as const,
    status: 'IMPLEMENTED_UNVERIFIED' as const,
    mode: 'PREPARATION_ONLY_NOT_V09_2_STARTED' as const,
    classification: 'ISOLATED_SOURCE_READBACK_NOT_ADMISSION' as const,
    countryId: input.countryId,
    nativeCurrency,
    rows,
    packageManifestSha256: input.registry.packageManifestSha256,
    declaredScope: input.declaredInput?.expected ?? null,
    actualScope: null,
    builderInvoked: built !== null,
    accountIdsIssued: 0,
    actualUnknownClosed: 0,
    sourceAdoption: false,
    productionAuthority: false,
    admissionAllowed: false,
    activationAllowed: false,
    runtimeConnected: false,
    formalClock: null,
  });
  slices.add(result);
  return result;
}

export type EntityCashCountrySourceSlice = ReturnType<
  typeof readEntityCashCountrySourceSlice
>;

/** Read-only paired diagnostic, not a transfer route or authorization grant.
 * An incomplete endpoint exposes neither side as usable candidate cash. */
export function readIsolatedEntityCashPair(
  input: Readonly<{
    slice: EntityCashCountrySourceSlice;
    purpose: 'CANDIDATE_DIAGNOSTIC' | 'FORMAL_SETTLEMENT';
    payerEntityId: string;
    payeeEntityId: string;
    currency: string;
    scope: NativeCashCandidateScope | null;
  }>,
) {
  demand(slices.has(input.slice), 'GENUINE_ENTITY_CASH_SLICE_REQUIRED');
  demand(
    input.purpose === 'CANDIDATE_DIAGNOSTIC',
    'SOURCE_ADMISSION_AND_CURRENT_AUTHORIZATION_REQUIRED',
  );
  demand(
    input.payerEntityId !== input.payeeEntityId,
    'DISTINCT_ENDPOINTS_REQUIRED',
  );
  demand(
    input.currency === input.slice.nativeCurrency,
    'PAIR_NATIVE_CURRENCY_MISMATCH',
  );
  demand(
    canonicalSerialize(input.scope) ===
      canonicalSerialize(input.slice.declaredScope),
    'PAIR_WORLD_HEAD_SOURCE_DATE_MISMATCH',
  );
  const endpoint = (entity: string) => {
    const account = input.slice.rows.find(
      (r) => r.ownerId === entity && r.batchId === 'B06',
    );
    const cash = input.slice.rows.find(
      (r) => r.ownerId === entity && r.batchId === 'B07',
    );
    demand(account && cash, 'PAIR_ENTITY_OUTSIDE_SOURCE_SLICE');
    return account.candidateValue !== null && cash.candidateValue !== null
      ? {
          entityId: entity,
          declaredAccount: account.candidateValue,
          declaredAvailable: cash.candidateValue,
        }
      : null;
  };
  const payer = endpoint(input.payerEntityId),
    payee = endpoint(input.payeeEntityId);
  return freezeFinancialInput({
    status:
      payer === null || payee === null
        ? ('BLOCKED_BOTH_ENDPOINTS_REQUIRE_COMPLETE_CANDIDATE_CASH' as const)
        : ('DECLARED_PAIR_READBACK_NOT_ADMITTED' as const),
    payer: payer === null || payee === null ? null : payer,
    payee: payer === null || payee === null ? null : payee,
    actualSpendable: null,
    sourceAdoption: false,
    admissionAllowed: false,
    currentPermissionIssued: false,
    paymentExecuted: false,
    actualUnknownClosed: 0,
  });
}
