/** Inert per-original-ID B06/B07 projection. Not a source/admission issuer,
 * runtime registration, permission grant, original-field closure or seed. */
import {
  isLoadedFinancialOpeningPackageRegistry,
  parseFinancialRegistrySourceJson,
  registryArray,
  registryRow,
  registryString,
  type LoadedFinancialOpeningPackageRegistry,
} from './financial-opening-package-registry.js';
import { freezeFinancialInput } from './formal-financial-opening-contract.js';
import {
  buildEntityNativeCashCandidate,
  type EntityCashBuilderInput,
  type EntityCashCandidateWitness,
  type EntityCashCanonicalMoney,
} from './entity-native-cash-candidate-builder.js';
import {
  NativeCashCandidateInvalid,
  readNativeCashSourceCandidate,
  type NativeCashCandidateDocument,
} from './native-cash-source-candidate.js';
import type { FinancialAccount } from '@econmind/core';

export interface OriginalEntityCashField {
  readonly stableId: string;
  readonly ownerId: string;
  readonly countryId: string;
  readonly missingField: 'account' | 'availableNativeCash';
}
export interface OriginalEntityCashBatch {
  readonly batchId: 'B06' | 'B07';
  readonly stableIds: readonly string[];
}
export interface OriginalEntityCashCandidateRow extends OriginalEntityCashField {
  readonly batchId: 'B06' | 'B07';
  readonly status: 'UNKNOWN' | 'DECLARED_CANDIDATE_NOT_ADOPTED';
  readonly actualValue: null;
  readonly candidateValue:
    Readonly<FinancialAccount> | EntityCashCanonicalMoney | null;
  readonly candidateSourceComplete: boolean;
  readonly candidateEngineeringWired: true;
  readonly candidateValidationPassed: boolean;
  readonly originalFieldStages: Readonly<{
    sourceComplete: false;
    engineeringWired: false;
    validationPassed: false;
    formallyAdopted: false;
  }>;
  readonly reason: string;
  readonly witness: EntityCashCandidateWitness | null;
  readonly nativeCurrency: string;
  readonly availableCalculation: Readonly<{
    balance: EntityCashCanonicalMoney | null;
    restrictedUnion: EntityCashCanonicalMoney | null;
    available: EntityCashCanonicalMoney | null;
  }> | null;
  readonly currentPermission: 'UNKNOWN';
}
export interface EntityCashOriginalCandidateReadback {
  readonly schemaVersion: 'entity-native-cash-original-candidate-readback-v2';
  readonly status: 'IMPLEMENTED_UNVERIFIED';
  readonly mode: 'PREPARATION_ONLY_NOT_V09_2_STARTED';
  readonly axesMeaning: Readonly<
    Record<
      | 'sourceComplete'
      | 'engineeringWired'
      | 'validationPassed'
      | 'formallyAdopted',
      string
    >
  >;
  readonly candidateAxesMeaning: Readonly<
    Record<
      | 'candidateSourceComplete'
      | 'candidateEngineeringWired'
      | 'candidateValidationPassed',
      string
    >
  >;
  readonly rows: readonly OriginalEntityCashCandidateRow[];
  readonly sourceDocument: NativeCashCandidateDocument | null;
  readonly packageManifestSha256: string;
  readonly formalBlockers: readonly string[];
  readonly actualUnknownClosed: 0;
  readonly sourceAdoption: false;
  readonly authoritativeStateCreated: false;
  readonly admissionAllowed: false;
  readonly activationAllowed: false;
  readonly runtimeConnected: false;
  readonly currentPermissionIssued: false;
  readonly formalClock: null;
}
function demand(v: unknown, code: string): asserts v {
  if (!v) throw new NativeCashCandidateInvalid(code);
}

export function readEntityNativeCashCandidates(
  input: EntityCashBuilderInput &
    Readonly<{
      registry: LoadedFinancialOpeningPackageRegistry;
      mappingsBytes: string;
      originalFields: readonly OriginalEntityCashField[];
      batches: readonly OriginalEntityCashBatch[];
    }>,
): EntityCashOriginalCandidateReadback {
  demand(
    isLoadedFinancialOpeningPackageRegistry(input.registry),
    'GENUINE_REGISTRY_REQUIRED',
  );
  demand(
    Buffer.byteLength(input.mappingsBytes) <= 1024 * 1024,
    'MAPPING_BYTES_BUDGET',
  );
  const mappings = registryArray(
    registryRow(
      parseFinancialRegistrySourceJson(input.mappingsBytes),
      'mapping',
    ).rows,
    'mapping.rows',
  ).map((r) => registryRow(r, 'mapping.row'));
  demand(mappings.length === 350, 'ORIGINAL_350_ENTITY_COVERAGE_REQUIRED');
  const mappingIndex = new Map(
    mappings.map((r) => [registryString(r.entityId, 'entityId'), r]),
  );
  demand(mappingIndex.size === 350, 'DUPLICATE_ENTITY_MAPPING');
  const roles = [
    'GOVERNMENT',
    'OPERATOR',
    'HOUSEHOLDS',
    'BANK',
    'CENTRAL_BANK',
  ] as const;
  for (let i = 1; i <= 70; i++) {
    const suffix = String(i).padStart(2, '0');
    for (const role of roles)
      demand(
        mappingIndex.get(`ENTITY_${role}_${suffix}`)?.countryId ===
          `COUNTRY_${suffix}`,
        'ORIGINAL_FIVE_ENTITY_ROLES_REQUIRED',
      );
  }
  const batchIndex = new Map(
    input.batches.map((b) => [b.batchId, new Set(b.stableIds)]),
  );
  demand(
    input.batches.length === 2 &&
      batchIndex.size === 2 &&
      input.batches.every(
        (b) => b.stableIds.length === 350 && new Set(b.stableIds).size === 350,
      ) &&
      batchIndex.has('B06') &&
      batchIndex.has('B07') &&
      input.originalFields.length === 700,
    'ORIGINAL_B06_B07_COVERAGE_REQUIRED',
  );
  const originalIds = new Set<string>();
  for (const original of input.originalFields) {
    const mapping = mappingIndex.get(original.ownerId);
    const batchId = original.missingField === 'account' ? 'B06' : 'B07';
    demand(
      ['account', 'availableNativeCash'].includes(original.missingField) &&
        mapping &&
        original.countryId === mapping.countryId &&
        original.stableId ===
          `U2544::ENTITY::${original.ownerId}::${original.missingField}` &&
        batchIndex.get(batchId)!.has(original.stableId) &&
        !originalIds.has(original.stableId),
      'ORIGINAL_FIELD_BATCH_IDENTITY_MISMATCH',
    );
    originalIds.add(original.stableId);
  }
  for (const selection of input.selections)
    demand(
      mappingIndex.get(selection.entityId)?.countryId === selection.countryId &&
        input.registry.countries.find(
          (c) => c.countryId === selection.countryId,
        )?.nativeCurrency === selection.nativeCurrency,
      'SELECTION_NOT_ORIGINAL_NATIVE_ENTITY',
    );
  const built = buildEntityNativeCashCandidate(input);
  const readback = readNativeCashSourceCandidate({
    registry: input.registry,
    mappingsBytes: input.mappingsBytes,
    document: input.selections.length === 0 ? null : built.document,
    expected: input.expected,
  });
  const readbackIndex = new Map(readback.rows.map((r) => [r.entityId, r]));
  const witnesses = new Map(built.witnesses.map((w) => [w.entityId, w]));
  const rows = input.originalFields.map((original) => {
    const result = readbackIndex.get(original.ownerId)!;
    const witness = witnesses.get(original.ownerId);
    const isAccount = original.missingField === 'account';
    const candidateValue = isAccount
      ? (witness?.accountCandidate ?? null)
      : result.candidateAvailable;
    return {
      stableId: original.stableId,
      ownerId: original.ownerId,
      countryId: original.countryId,
      missingField: original.missingField,
      batchId: isAccount ? ('B06' as const) : ('B07' as const),
      status:
        candidateValue === null
          ? ('UNKNOWN' as const)
          : ('DECLARED_CANDIDATE_NOT_ADOPTED' as const),
      actualValue: null,
      candidateValue,
      candidateSourceComplete: candidateValue !== null,
      candidateEngineeringWired: true as const,
      candidateValidationPassed: candidateValue !== null,
      originalFieldStages: {
        sourceComplete: false as const,
        engineeringWired: false as const,
        validationPassed: false as const,
        formallyAdopted: false as const,
      },
      reason:
        candidateValue === null
          ? isAccount
            ? (witness?.reason ?? result.reason)
            : result.reason
          : 'SOURCE_AND_ACTUAL_OPENING_BINDING_UNADOPTED',
      witness: witness ?? null,
      nativeCurrency: result.nativeCurrencyCandidate,
      availableCalculation: isAccount
        ? null
        : {
            balance: result.candidateBalance,
            restrictedUnion: result.candidateRestricted,
            available: result.candidateAvailable,
          },
      currentPermission: 'UNKNOWN' as const,
    };
  });
  return freezeFinancialInput({
    schemaVersion: 'entity-native-cash-original-candidate-readback-v2' as const,
    status: 'IMPLEMENTED_UNVERIFIED' as const,
    mode: 'PREPARATION_ONLY_NOT_V09_2_STARTED' as const,
    axesMeaning: {
      sourceComplete:
        'Original field source plus actual inactive opening/admission not yet accepted.',
      engineeringWired:
        'Actual original-field source is not connected to its runtime consumer; offline tooling is not original-field wiring.',
      validationPassed:
        'Actual original-field validation has not passed; synthetic/candidate consistency is not original-field validation.',
      formallyAdopted:
        'Only independent review and Root acceptance can change adoption; this tool cannot.',
    },
    candidateAxesMeaning: {
      candidateSourceComplete:
        'A declared candidate value can be computed from supplied candidate inputs; not source admission.',
      candidateEngineeringWired:
        'Offline builder and existing candidate readback are connected; no runtime consumer.',
      candidateValidationPassed:
        'Supplied candidate consistency passed; not actual original-field validation or independent acceptance.',
    },
    rows,
    sourceDocument: input.selections.length === 0 ? null : built.document,
    packageManifestSha256: readback.packageManifestSha256,
    formalBlockers: readback.formalBlockers,
    actualUnknownClosed: 0 as const,
    sourceAdoption: false as const,
    authoritativeStateCreated: false as const,
    admissionAllowed: false as const,
    activationAllowed: false as const,
    runtimeConnected: false as const,
    currentPermissionIssued: false as const,
    formalClock: null,
  });
}
