/** Exact five-ID, declaration-only B06 structure inspection. No account issuer,
 * source-admission provider, old cash slice, payment route or runtime binding. */
import { canonicalSerialize, type FinancialAccount } from '@econmind/core';
import {
  isLoadedFinancialOpeningPackageRegistry,
  parseFinancialRegistrySourceJson,
  registryRow,
  resolveFinancialRegistrySource,
  selectFinancialRegistryJsonPointer,
  type LoadedFinancialOpeningPackageRegistry,
} from './financial-opening-package-registry.js';
import {
  financialInputSha256,
  freezeFinancialInput,
} from './formal-financial-opening-contract.js';

export const B06_C01_DEFINITION_VERSION = 'B06_C01_TYPED_REGISTER_STRUCTURE_V1';
export const B06_C01_DEFINITION_RECEIPT_SHA256 =
  '968440af89bce122475915823336bbc11e6d481244424aa80bd72ac1bc3ab716';
const OWNER = {
  gov: 'ENTITY_GOVERNMENT_01',
  op: 'ENTITY_OPERATOR_01',
  hh: 'ENTITY_HOUSEHOLDS_01',
  bank: 'ENTITY_BANK_01',
  cb: 'ENTITY_CENTRAL_BANK_01',
} as const;
const RELATIONS = [
  [
    'TGA',
    'TGA_ASSET',
    'TGA_ISSUANCE_LIABILITY',
    OWNER.gov,
    OWNER.cb,
    'TREASURY_DEPOSIT_AT_CB',
  ],
  [
    'RESERVE',
    'RESERVE_ASSET',
    'RESERVE_ISSUANCE_LIABILITY',
    OWNER.bank,
    OWNER.cb,
    'BANK_RESERVE_DEPOSIT_AT_CB',
  ],
  [
    'HOUSEHOLD_DEPOSIT',
    'HOUSEHOLD_DEPOSIT_ASSET',
    'HOUSEHOLD_DEPOSIT_ISSUANCE_LIABILITY',
    OWNER.hh,
    OWNER.bank,
    'HOUSEHOLD_DEPOSIT_AT_BANK',
  ],
  [
    'BUSINESS_DEPOSIT',
    'BUSINESS_DEPOSIT_ASSET',
    'BUSINESS_DEPOSIT_ISSUANCE_LIABILITY',
    OWNER.op,
    OWNER.bank,
    'BUSINESS_DEPOSIT_AT_BANK',
  ],
] as const;
export type B06Country01TypedRole = (typeof RELATIONS)[number][1 | 2];
type AccountClass = Extract<
  FinancialAccount['accountClass'],
  'ASSET' | 'LIABILITY'
>;
export const B06_C01_ORIGINAL_IDS = Object.freeze(
  Object.values(OWNER).map((owner) => `U2544::ENTITY::${owner}::account`),
);
const ROLES = RELATIONS.flatMap(
  ([relation, asset, liability, holderId, issuerId, purpose]) =>
    (['ASSET', 'LIABILITY'] as const).map((accountClass) => ({
      relation,
      role: accountClass === 'ASSET' ? asset : liability,
      mirrorRole: accountClass === 'ASSET' ? liability : asset,
      ownerId: accountClass === 'ASSET' ? holderId : issuerId,
      holderId,
      issuerId,
      counterpartyEntityId: accountClass === 'ASSET' ? issuerId : holderId,
      accountClass,
      purpose,
    })),
);
type PolicyRole = (typeof ROLES)[number];
type Row = Record<string, unknown>;
export type B06TypedSourceSchema =
  | 'NORMALIZED_TYPED_ACCOUNT_V1'
  | 'PAIRED_HOLDING_REFERENCE_V1'
  | 'A_TYPED_HOLDING_REFERENCE_V1';
export interface B06TypedDeclarationDocument {
  readonly documentId: string;
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly classification: 'SYNTHETIC_CANDIDATE' | 'CONSTRUCTED_CANDIDATE';
  readonly bytes: string;
  readonly sha256: string;
  readonly byteLength: number;
}
export interface B06TypedOriginSelection {
  readonly documentId: string;
  readonly pointer: string;
}
export interface B06TypedRegisterPreparationInput {
  readonly registry: LoadedFinancialOpeningPackageRegistry;
  readonly adoptedDefinitionVersion: string;
  readonly requestedOriginalIds: readonly string[];
  readonly selectionMode?: 'PER_ORIGINAL' | 'FULL_BUNDLE';
  /** A reference currency, never an admitted currency or FX quote. */
  readonly declaredNativeCurrency: string;
  readonly documents: readonly B06TypedDeclarationDocument[];
  readonly records: readonly (B06TypedOriginSelection & {
    readonly role: B06Country01TypedRole;
    readonly sourceSchema: B06TypedSourceSchema;
  })[];
  readonly registers: readonly (B06TypedOriginSelection & {
    readonly stableId: string;
  })[];
}
export class B06TypedRegisterPreparationInvalid extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'B06TypedRegisterPreparationInvalid';
  }
}
function demand(value: unknown, code: string): asserts value {
  if (!value) throw new B06TypedRegisterPreparationInvalid(code);
}
const text = (value: unknown): string | null =>
  typeof value === 'string' &&
  value.length <= 512 &&
  value.trim() === value &&
  value.length > 0
    ? value
    : null;
function sourceDate(value: string | null): boolean {
  if (value === null) return false;
  const iso = /^\d{4}-\d{2}-\d{2}$/u.test(value)
    ? `${value}T00:00:00.000Z`
    : value;
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(iso) &&
    Number.isFinite(Date.parse(iso)) &&
    new Date(iso).toISOString() === iso
  );
}
const AUTHORITY_BLOCKERS = Object.freeze([
  'GENUINE_RECORD_SOURCE_ISSUANCE_CUSTODY_CAPABILITY_NOT_PROVISIONED',
  'EXACT_REQUESTED_RECORD_SET_ADOPTION_NOT_PROVISIONED',
  'EXISTING_LAWFUL_INACTIVE_OPENING_NOT_PROVISIONED',
  'ADMITTED_ACCOUNT_CURRENCY_NOT_PROVISIONED',
]);

/** ownerId is the record owner, holderId the beneficial holder. In the paired
 * schema raw holderId means RECORD OWNER; assetHolderId is beneficial holder.
 * Holding identities can be read as provenance but never as Core account IDs. */
function normalize(
  body: Row,
  schema: B06TypedSourceSchema,
  policy: PolicyRole,
  summaryCountry: string | null,
) {
  if (schema === 'NORMALIZED_TYPED_ACCOUNT_V1')
    return {
      sourceRecordId: text(body.sourceRecordId),
      declaredAccountId: text(body.accountId),
      declaredClaimIdentity: text(body.claimId),
      ownerId: text(body.ownerId),
      holderId: text(body.holderId),
      issuerId: text(body.issuerId),
      counterpartyEntityId: text(body.counterpartyEntityId),
      accountClass: text(body.accountClass),
      countryId: text(body.countryId),
      currency: text(body.currency),
      sourceVersion: text(body.sourceVersion),
      valueDate: text(body.valueDate),
      purpose: text(body.purpose),
      sourceHoldingKind: text(body.sourceHoldingKind),
      declaredSourceCapabilityLocator: text(body.sourceCapabilityLocator),
      isHoldingReference: false,
    };
  const paired = schema === 'PAIRED_HOLDING_REFERENCE_V1';
  const tool = text(body.tool);
  return {
    sourceRecordId: text(paired ? body.holdingId : body.sourceRecordIdentity),
    declaredAccountId: null,
    declaredClaimIdentity: text(
      paired ? body.sharedClaimId : body.sharedSourceClaimIdentity,
    ),
    ownerId: text(paired ? body.holderId : body.recordOwnerEntityId),
    holderId: text(paired ? body.assetHolderId : body.beneficialHolderEntityId),
    issuerId: text(
      paired ? body.issuerId : body.economicLiabilityIssuerEntityId,
    ),
    counterpartyEntityId: text(
      paired ? body.counterpartyId : body.counterpartyEntityId,
    ),
    accountClass: text(body.role),
    countryId: paired ? text(body.countryId) : summaryCountry,
    currency: text(paired ? body.nativeCurrency : body.sourceCurrencyReference),
    sourceVersion: text(paired ? body.version : body.sourceVersion),
    valueDate: text(paired ? body.valueDate : body.sourceValueDate),
    purpose: tool === policy.relation ? policy.purpose : null,
    sourceHoldingKind: 'CLAIM',
    declaredSourceCapabilityLocator: null,
    isHoldingReference: true,
  };
}

export function inspectB06Country01TypedRegisterPreparation(
  input: B06TypedRegisterPreparationInput,
) {
  demand(
    isLoadedFinancialOpeningPackageRegistry(input.registry),
    'GENUINE_REGISTRY_REQUIRED',
  );
  demand(
    input.adoptedDefinitionVersion === B06_C01_DEFINITION_VERSION,
    'DEFINITION_VERSION_MISMATCH',
  );
  demand(
    Array.isArray(input.requestedOriginalIds) &&
      input.requestedOriginalIds.length >= 1 &&
      input.requestedOriginalIds.length <= 5 &&
      new Set(input.requestedOriginalIds).size ===
        input.requestedOriginalIds.length &&
      input.requestedOriginalIds.every((id) =>
        B06_C01_ORIGINAL_IDS.includes(id),
      ),
    'REQUESTED_ID_SCOPE_INVALID',
  );
  const mode = input.selectionMode ?? 'PER_ORIGINAL';
  demand(
    mode === 'PER_ORIGINAL' || mode === 'FULL_BUNDLE',
    'SELECTION_MODE_INVALID',
  );
  demand(
    mode !== 'FULL_BUNDLE' || input.requestedOriginalIds.length === 5,
    'FULL_BUNDLE_SCOPE_REQUIRED',
  );
  const currency = resolveFinancialRegistrySource(input.registry, {
    sourceId: 'native_lc',
    selector: { kind: 'JSON_POINTER', pointer: '/countries/0/currencyCode' },
  });
  demand(
    currency.status === 'VERIFIED_LEAF' &&
      currency.value === input.declaredNativeCurrency &&
      input.declaredNativeCurrency !== 'GCU',
    'DECLARED_NATIVE_CURRENCY_MISMATCH',
  );
  demand(
    Array.isArray(input.documents) &&
      input.documents.length <= 16 &&
      Array.isArray(input.records) &&
      input.records.length <= 8 &&
      Array.isArray(input.registers) &&
      input.registers.length <= 5,
    'DECLARATION_COUNT_BUDGET',
  );
  const documents = new Map<
    string,
    { declaration: B06TypedDeclarationDocument; value: unknown }
  >();
  let totalBytes = 0;
  for (const declaration of input.documents) {
    demand(
      text(declaration.documentId) &&
        text(declaration.sourceId) &&
        text(declaration.sourceVersion),
      'DOCUMENT_IDENTITY_REQUIRED',
    );
    demand(!documents.has(declaration.documentId), 'DUPLICATE_DOCUMENT_ID');
    demand(
      declaration.classification === 'SYNTHETIC_CANDIDATE' ||
        declaration.classification === 'CONSTRUCTED_CANDIDATE',
      'DECLARED_CANDIDATE_CLASSIFICATION_REQUIRED',
    );
    demand(typeof declaration.bytes === 'string', 'SOURCE_BYTES_REQUIRED');
    const bytes = Buffer.byteLength(declaration.bytes);
    totalBytes += bytes;
    demand(
      bytes <= 2 * 1024 * 1024 && totalBytes <= 8 * 1024 * 1024,
      'SOURCE_BYTES_BUDGET',
    );
    demand(
      declaration.byteLength === bytes &&
        financialInputSha256(declaration.bytes) === declaration.sha256,
      'DOCUMENT_PIN_MISMATCH',
    );
    documents.set(declaration.documentId, {
      declaration,
      value: parseFinancialRegistrySourceJson(declaration.bytes),
    });
  }
  const pointers = new Set<string>();
  const resolve = (selection: B06TypedOriginSelection) => {
    const found = documents.get(selection.documentId);
    demand(
      found && text(selection.pointer) && selection.pointer.startsWith('/'),
      'ORIGIN_DOCUMENT_AND_ROW_REQUIRED',
    );
    const key = canonicalSerialize([selection.documentId, selection.pointer]);
    demand(!pointers.has(key), 'SOURCE_ROW_REUSED');
    pointers.add(key);
    const root = registryRow(found.value, 'typed.document');
    const scope =
      root.scope && typeof root.scope === 'object' && !Array.isArray(root.scope)
        ? (root.scope as Row)
        : {};
    const summaryCountry =
      root.schemaVersion ===
        'A_B06_C01_TYPED_SOURCE_ISSUANCE_ADMISSION_CHAIN_V1' &&
      scope.definitionVersion === B06_C01_DEFINITION_VERSION &&
      Array.isArray(scope.originalIds) &&
      scope.originalIds.length > 0 &&
      scope.originalIds.every(
        (id) => typeof id === 'string' && B06_C01_ORIGINAL_IDS.includes(id),
      ) &&
      (scope.countryId === undefined || scope.countryId === 'COUNTRY_01')
        ? 'COUNTRY_01'
        : null;
    return {
      body: registryRow(
        selectFinancialRegistryJsonPointer(found.value, selection.pointer),
        'typed.record',
      ),
      summaryCountry,
      origin: {
        documentId: selection.documentId,
        sourceId: found.declaration.sourceId,
        sourceVersion: found.declaration.sourceVersion,
        fullBytesSha256: found.declaration.sha256,
        byteLength: String(found.declaration.byteLength),
        pointer: selection.pointer,
        classification: found.declaration.classification,
        verification:
          'DECLARED_BYTES_AND_POINTER_MATCH_NOT_SOURCE_ADMISSION' as const,
      },
    };
  };
  const recordIds = new Set<string>(),
    accountIds = new Set<string>(),
    claims = new Map<string, string>();
  const records = new Map<
    B06Country01TypedRole,
    {
      role: B06Country01TypedRole;
      accountClass: AccountClass;
      sourceSchema: B06TypedSourceSchema;
      origin: ReturnType<typeof resolve>['origin'];
      declaration: ReturnType<typeof normalize>;
      issues: string[];
    }
  >();
  for (const selection of input.records) {
    const policy = ROLES.find((r) => r.role === selection.role);
    demand(policy, 'TYPED_ROLE_OUTSIDE_POLICY');
    demand(!records.has(selection.role), 'DUPLICATE_ROLE_SELECTION');
    demand(
      [
        'NORMALIZED_TYPED_ACCOUNT_V1',
        'PAIRED_HOLDING_REFERENCE_V1',
        'A_TYPED_HOLDING_REFERENCE_V1',
      ].includes(selection.sourceSchema),
      'SOURCE_SCHEMA_UNSUPPORTED',
    );
    const { body, origin, summaryCountry } = resolve(selection);
    const declaration = normalize(
      body,
      selection.sourceSchema,
      policy,
      summaryCountry,
    );
    const issues: string[] = [];
    if (!declaration.sourceRecordId) issues.push('SOURCE_RECORD_ID_MISSING');
    if (!declaration.declaredAccountId)
      issues.push('DECLARED_ACCOUNT_BINDING_ID_MISSING');
    if (!declaration.declaredClaimIdentity)
      issues.push('CLAIM_IDENTITY_MISSING');
    if (declaration.isHoldingReference)
      issues.push('HOLDING_IDENTITY_NOT_ACCOUNT_BINDING');
    for (const field of [
      'ownerId',
      'holderId',
      'issuerId',
      'counterpartyEntityId',
      'accountClass',
      'purpose',
    ] as const)
      if (declaration[field] !== policy[field])
        issues.push(`ROLE_${field}_MISMATCH`);
    if (declaration.countryId !== 'COUNTRY_01')
      issues.push('RECORD_COUNTRY_MISMATCH');
    if (declaration.sourceHoldingKind !== 'CLAIM')
      issues.push('CLAIM_KIND_MISMATCH');
    if (declaration.currency !== input.declaredNativeCurrency)
      issues.push('RECORD_NATIVE_CURRENCY_MISMATCH');
    if (declaration.sourceVersion !== origin.sourceVersion)
      issues.push('RECORD_SOURCE_VERSION_MISMATCH');
    if (!sourceDate(declaration.valueDate))
      issues.push('SOURCE_VALUE_DATE_MISSING_OR_INVALID');
    for (const [value, set, error] of [
      [declaration.sourceRecordId, recordIds, 'DUPLICATE_SOURCE_RECORD_ID'],
      [
        declaration.declaredAccountId,
        accountIds,
        'DUPLICATE_DECLARED_ACCOUNT_ID',
      ],
    ] as const)
      if (value !== null) {
        demand(!set.has(value), error);
        set.add(value);
      }
    if (declaration.declaredClaimIdentity !== null) {
      const previous = claims.get(declaration.declaredClaimIdentity);
      demand(
        previous === undefined || previous === policy.relation,
        'CLAIM_ID_REUSED_ACROSS_RELATIONSHIPS',
      );
      claims.set(declaration.declaredClaimIdentity, policy.relation);
    }
    records.set(selection.role, {
      role: selection.role,
      accountClass: policy.accountClass,
      sourceSchema: selection.sourceSchema,
      origin,
      declaration,
      issues,
    });
  }
  const registers = new Map<string, ReturnType<typeof resolve>>();
  for (const selection of input.registers) {
    demand(
      B06_C01_ORIGINAL_IDS.includes(selection.stableId),
      'REGISTER_OUTSIDE_POLICY',
    );
    demand(!registers.has(selection.stableId), 'DUPLICATE_REGISTER_SELECTION');
    registers.set(selection.stableId, resolve(selection));
  }
  const rows = B06_C01_ORIGINAL_IDS.filter((id) =>
    input.requestedOriginalIds.includes(id),
  ).map((stableId) => {
    const ownerId = stableId.split('::')[2]!;
    const own = ROLES.filter((r) => r.ownerId === ownerId);
    const needed = new Set(own.flatMap((r) => [r.role, r.mirrorRole]));
    const selected = ROLES.filter((r) => needed.has(r.role));
    const register = registers.get(stableId);
    const issues: string[] = [];
    if (!register) issues.push('REGISTER_DECLARATION_NOT_SUPPLIED');
    else {
      const body = register.body;
      if (
        body.stableId !== stableId ||
        body.ownerId !== ownerId ||
        body.countryId !== 'COUNTRY_01' ||
        body.adoptedDefinitionVersion !== B06_C01_DEFINITION_VERSION ||
        body.sourceVersion !== register.origin.sourceVersion
      )
        issues.push('REGISTER_SCOPE_OR_VERSION_MISMATCH');
      if (
        !Array.isArray(body.memberRoles) ||
        canonicalSerialize([...body.memberRoles].sort()) !==
          canonicalSerialize(own.map((r) => r.role).sort())
      )
        issues.push('OWNER_ROLE_MEMBERSHIP_MISMATCH');
    }
    for (const policy of selected) {
      const record = records.get(policy.role);
      if (!record) issues.push(`REQUIRED_ROLE_NOT_SUPPLIED:${policy.role}`);
      else
        issues.push(...record.issues.map((code) => `${policy.role}:${code}`));
    }
    for (const policy of own) {
      const a = records.get(policy.role)?.declaration,
        b = records.get(policy.mirrorRole)?.declaration;
      if (
        a &&
        b &&
        (a.declaredClaimIdentity !== b.declaredClaimIdentity ||
          a.currency !== b.currency ||
          a.valueDate !== b.valueDate)
      )
        issues.push(`RECIPROCAL_CLAIM_SCOPE_MISMATCH:${policy.role}`);
    }
    const witnesses = selected.flatMap((policy) => {
      const record = records.get(policy.role);
      return record
        ? [
            {
              role: policy.role,
              sourceSchema: record.sourceSchema,
              ownerField:
                record.sourceSchema === 'PAIRED_HOLDING_REFERENCE_V1'
                  ? 'holderId'
                  : record.sourceSchema === 'A_TYPED_HOLDING_REFERENCE_V1'
                    ? 'recordOwnerEntityId'
                    : 'ownerId',
              beneficialHolderField:
                record.sourceSchema === 'PAIRED_HOLDING_REFERENCE_V1'
                  ? 'assetHolderId'
                  : record.sourceSchema === 'A_TYPED_HOLDING_REFERENCE_V1'
                    ? 'beneficialHolderEntityId'
                    : 'holderId',
              origin: record.origin,
              ...record.declaration,
            },
          ]
        : [];
    });
    const complete = issues.length === 0 && register !== undefined;
    // Independent slot: never materialize or extend legacy candidateValue.
    const candidateTypedRegister = !complete
      ? null
      : {
          tag: 'DECLARED_TYPED_REGISTER_REFERENCE_NOT_ADMITTED' as const,
          schemaVersion: 'b06-country01-typed-register-reference-v1' as const,
          adoptedDefinitionVersion: B06_C01_DEFINITION_VERSION,
          stableId,
          ownerId,
          registerOrigin: register.origin,
          ownRoles: own.map((r) => r.role),
          memberOrigins: witnesses.filter((r) =>
            own.some((p) => p.role === r.role),
          ),
          necessaryMirrorContext: witnesses.filter(
            (r) => !own.some((p) => p.role === r.role),
          ),
          requestedOriginalIds: B06_C01_ORIGINAL_IDS.filter((id) =>
            input.requestedOriginalIds.includes(id),
          ),
          declaredMembershipFingerprint: financialInputSha256(
            canonicalSerialize([stableId, register.origin, witnesses]),
          ),
        };
    return {
      stableId,
      ownerId,
      countryId: 'COUNTRY_01' as const,
      unit: 'ACCOUNT' as const,
      adoptedDefinitionVersion: B06_C01_DEFINITION_VERSION,
      shapeStatus: complete
        ? ('COMPLETE_DECLARED_SHAPE' as const)
        : ('INCOMPLETE' as const),
      provenanceStatus: complete
        ? ('DECLARED_ORIGIN_LINKED_NOT_ADMITTED' as const)
        : ('INCOMPLETE_DECLARATION' as const),
      shapeIssues: [...new Set(issues)].sort(),
      sourceReferenceWitnesses: witnesses,
      candidateTypedRegister,
      actualTypedRegisterBinding: null,
      actualValue: null,
      actualCurrency: null,
      actualOpening: null,
      actualAdmission: null,
      admissionBlockers: AUTHORITY_BLOCKERS,
      originalFieldStages: {
        sourceComplete: false,
        engineeringWired: false,
        validationPassed: false,
        formallyAdopted: false,
      },
    };
  });
  return freezeFinancialInput({
    schemaVersion: 'b06-country01-typed-register-preparation-v1' as const,
    status: 'IMPLEMENTED_UNVERIFIED' as const,
    mode: 'PREPARATION_ONLY_NOT_V09_2_STARTED' as const,
    classification:
      'DECLARATION_INSPECTION_NOT_SOURCE_OR_RECORD_SET_ADMISSION' as const,
    selectionMode: mode,
    rows,
    bundleShapeStatus:
      mode === 'PER_ORIGINAL'
        ? 'NOT_REQUESTED'
        : rows.every((r) => r.candidateTypedRegister !== null)
          ? 'COMPLETE_DECLARED_BUNDLE'
          : 'INCOMPLETE_BUNDLE',
    packageManifestSha256: input.registry.packageManifestSha256,
    definitionReceiptSha256: B06_C01_DEFINITION_RECEIPT_SHA256,
    trustedAdmissionProvider: 'NOT_AVAILABLE' as const,
    sourceAdoption: false as const,
    recordSetAdopted: false as const,
    admissionAllowed: false as const,
    activationAllowed: false as const,
    runtimeConnected: false as const,
    formalSettlementAllowed: false as const,
    currentPermissionIssued: false as const,
    accountIdsIssued: 0 as const,
    claimIdsIssued: 0 as const,
    actualUnknownClosed: 0 as const,
    formalClock: null,
  });
}
