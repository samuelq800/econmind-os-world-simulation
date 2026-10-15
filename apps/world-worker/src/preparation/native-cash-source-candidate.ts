/** Offline candidate readback only. No source issuer, account writer, permission
 * issuer, opening producer, API export or World binding is installed here. */
import { createHash } from 'node:crypto';
import {
  Money,
  createFinancialAccount,
  parseFinancialLedgerSnapshot,
  worldId,
  type FinancialAccount,
} from '@econmind/core';
import {
  exactFinancialDecimal,
  freezeFinancialInput,
} from './formal-financial-opening-contract.js';
import {
  isLoadedFinancialOpeningPackageRegistry,
  parseFinancialRegistrySourceJson,
  registryArray,
  registryRow,
  registryString,
  resolveFinancialRegistrySource,
  type LoadedFinancialOpeningPackageRegistry,
} from './financial-opening-package-registry.js';

export interface NativeCashCandidateDocument {
  readonly documentId: string;
  readonly classification: 'SYNTHETIC_CANDIDATE' | 'CONSTRUCTED_CANDIDATE';
  readonly sourceVersion: string;
  readonly asOf: string;
  readonly sha256: string;
  readonly bytes: string;
}
export interface NativeCashCandidateScope {
  readonly worldId: string;
  readonly worldVersion: string;
  readonly sourceVersion: string;
  readonly asOf: string;
}
export class NativeCashCandidateInvalid extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'NativeCashCandidateInvalid';
  }
}
function demand(value: unknown, code: string): asserts value {
  if (!value) throw new NativeCashCandidateInvalid(code);
}
function date(value: string): void {
  demand(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value,
    'CANONICAL_ASOF_REQUIRED',
  );
}
function index(rows: readonly Record<string, unknown>[], key: string) {
  const result = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const id = registryString(row[key], key);
    demand(!result.has(id), 'DUPLICATE_' + key.toUpperCase());
    result.set(id, row);
  }
  return result;
}
function array(value: unknown, field: string) {
  const rows = registryArray(value, field);
  demand(rows.length <= 2000, 'CANDIDATE_ARRAY_BUDGET');
  return rows.map((row) => registryRow(row, field));
}
function nonnegative(value: unknown, currency: string) {
  const amount = Money.from(exactFinancialDecimal(value, 'amount'), currency);
  demand(!amount.amount.isNegative(), 'NEGATIVE_CASH_COMPONENT');
  return amount;
}

/** All quantities returned are declared candidate quantities. Hash, asOf,
 * complete and disjoint-atom labels are consistency constraints, not authority.
 * Missing balance is NOT the Core snapshot's implicit zero position. */
export function readNativeCashSourceCandidate(
  input: Readonly<{
    registry: LoadedFinancialOpeningPackageRegistry;
    mappingsBytes: string;
    document: NativeCashCandidateDocument | null;
    expected: NativeCashCandidateScope;
  }>,
) {
  demand(
    isLoadedFinancialOpeningPackageRegistry(input.registry),
    'GENUINE_REGISTRY_REQUIRED',
  );
  demand(
    Buffer.byteLength(input.mappingsBytes) <= 1024 * 1024,
    'MAPPING_BYTES_BUDGET',
  );
  const mappingsDocument = registryRow(
    parseFinancialRegistrySourceJson(input.mappingsBytes),
    'mappings',
  );
  demand(
    mappingsDocument.status === 'REFERENCE_CROSSWALK_NOT_ACCOUNT_BINDING',
    'REFERENCE_MAPPING_REQUIRED',
  );
  const mappings = array(mappingsDocument.rows, 'mappings.rows');
  demand(mappings.length > 0 && mappings.length <= 350, 'MAPPING_COUNT_BUDGET');
  const mappingIndex = index(mappings, 'entityId');
  demand(
    new Set(
      mappings.map((m) => registryString(m.legacyEntityId, 'legacyEntityId')),
    ).size === mappings.length,
    'DUPLICATE_LEGACY_ENTITY',
  );
  const countries = index(input.registry.countries, 'countryId');
  const native = resolveFinancialRegistrySource(input.registry, {
    sourceId: 'native_lc',
    selector: { kind: 'JSON_POINTER', pointer: '/countries' },
  });
  demand(native.status === 'VERIFIED_LEAF', 'NATIVE_SOURCE_UNAVAILABLE');
  const nativeRows = array(native.value, 'native.countries');
  const nativeCountries = index(nativeRows, 'countryId');
  for (const m of mappings) {
    const country = countries.get(registryString(m.countryId, 'countryId'));
    demand(country, 'MAPPING_COUNTRY_UNAVAILABLE');
    demand(
      m.sourceClass ===
        'REFERENCE_MAPPING_NOT_LEGAL_ACCOUNT_OR_CURRENT_AUTHORITY' &&
        m.actualAccount === null &&
        m.actualHolderAdmission === null &&
        m.actualCurrentAuthorization === null &&
        registryRow(country.identityCrosswalk, 'crosswalk').legacyCountryId ===
          m.legacyCountryId,
      'MAPPING_IS_NOT_REFERENCE_ONLY',
    );
  }
  let source: Record<string, unknown> | null = null;
  const accounts = new Map<string, Readonly<FinancialAccount>>();
  let balances = new Map<string, Record<string, unknown>>();
  let bindings = new Map<string, Record<string, unknown>>();
  let atoms = new Map<string, Record<string, unknown>>();
  let restrictions: Record<string, unknown>[] = [];
  let ledger: ReturnType<typeof parseFinancialLedgerSnapshot> | null = null;
  const document = input.document;
  if (document !== null) {
    demand(
      Buffer.byteLength(document.bytes) <= 2 * 1024 * 1024,
      'SOURCE_BYTES_BUDGET',
    );
    demand(
      ['SYNTHETIC_CANDIDATE', 'CONSTRUCTED_CANDIDATE'].includes(
        document.classification,
      ),
      'CANDIDATE_CLASSIFICATION_REQUIRED',
    );
    demand(
      document.documentId.length > 0 && document.documentId.length <= 128,
      'DOCUMENT_ID_REQUIRED',
    );
    demand(
      createHash('sha256').update(document.bytes).digest('hex') ===
        document.sha256,
      'SOURCE_HASH_MISMATCH',
    );
    date(document.asOf);
    source = registryRow(
      parseFinancialRegistrySourceJson(document.bytes),
      'source',
    );
    demand(
      source.schemaVersion === 'native-cash-source-candidate-v1',
      'SOURCE_SCHEMA_MISMATCH',
    );
    // The lossless source parser turns numeric tokens into lexemes. Check the
    // raw version's string type separately; never use this parse for amounts.
    for (const [value, field] of [
      [input.expected.sourceVersion, 'expected.sourceVersion'],
      [document.sourceVersion, 'document.sourceVersion'],
      [
        registryRow(JSON.parse(document.bytes), 'source').sourceVersion,
        'source.sourceVersion',
      ],
    ] as const) {
      demand(
        /\S/u.test(registryString(value, field)),
        'SOURCE_VERSION_REQUIRED',
      );
    }
    demand(
      document.sourceVersion === input.expected.sourceVersion &&
        document.asOf === input.expected.asOf &&
        source.sourceVersion === document.sourceVersion &&
        source.asOf === document.asOf &&
        source.worldId === input.expected.worldId &&
        source.worldVersion === input.expected.worldVersion,
      'SOURCE_SCOPE_VERSION_ASOF_MISMATCH',
    );
    const accountRows = array(source.accounts, 'accounts');
    index(accountRows, 'accountId');
    for (const row of accountRows) {
      const account = createFinancialAccount(
        row as unknown as FinancialAccount,
      );
      accounts.set(account.accountId, account);
    }
    balances = index(array(source.balances, 'balances'), 'accountId');
    bindings = index(
      array(source.entityBindings, 'entityBindings'),
      'entityId',
    );
    demand(
      new Set([...bindings.values()].map((b) => b.accountId)).size ===
        bindings.size,
      'DUPLICATE_ACCOUNT_BINDING',
    );
    for (const [entity, binding] of bindings) {
      demand(
        mappingIndex.has(entity) &&
          accounts.has(registryString(binding.accountId, 'accountId')),
        'BINDING_SCOPE_UNAVAILABLE',
      );
    }
    const positions = [...balances].flatMap(([id, balance]) => {
      const account = accounts.get(id);
      demand(
        account &&
          balance.currency === account.currency &&
          balance.asOf === document.asOf,
        'BALANCE_ACCOUNT_CURRENCY_ASOF_MISMATCH',
      );
      const amount = nonnegative(balance.amount, account.currency);
      return amount.amount.isZero()
        ? []
        : [{ account, netDebitBalance: amount }];
    });
    ledger = parseFinancialLedgerSnapshot({
      worldId: worldId(input.expected.worldId),
      worldVersion: input.expected.worldVersion,
      accounts: [...accounts.values()],
      positions,
    });
    atoms = index(array(source.encumbranceAtoms, 'encumbranceAtoms'), 'atomId');
    restrictions = array(source.restrictions, 'restrictions');
    index(restrictions, 'restrictionId');
    const referenced = new Set<string>();
    for (const atom of atoms.values()) {
      const account = accounts.get(registryString(atom.accountId, 'accountId'));
      demand(
        account &&
          atom.currency === account.currency &&
          atom.asOf === document.asOf,
        'RESTRICTION_CURRENCY_ASOF_SCOPE_MISMATCH',
      );
      nonnegative(atom.amount, account.currency);
    }
    for (const restriction of restrictions) {
      demand(
        ['FROZEN', 'PLEDGED', 'EARMARK'].includes(String(restriction.kind)),
        'RESTRICTION_KIND_UNSUPPORTED',
      );
      const ids = registryArray(restriction.atomIds, 'atomIds');
      demand(
        ids.length > 0 &&
          ids.length <= 2000 &&
          new Set(ids).size === ids.length,
        'RESTRICTION_ATOM_IDS_INVALID',
      );
      for (const id of ids) {
        const atom = atoms.get(registryString(id, 'atomId'));
        demand(
          atom && atom.accountId === restriction.accountId,
          'RESTRICTION_ATOM_SCOPE_MISMATCH',
        );
        referenced.add(String(id));
      }
    }
    demand(referenced.size === atoms.size, 'UNREFERENCED_RESTRICTION_ATOM');
  }
  const rows = mappings.map((mapping) => {
    const entity = registryString(mapping.entityId, 'entityId');
    const cid = registryString(mapping.countryId, 'countryId');
    const currency = registryString(
      countries.get(cid)!.nativeCurrency,
      'nativeCurrency',
    );
    const nc = nativeCountries.get(cid);
    demand(
      nc && nc.currencyCode === currency,
      'NATIVE_CURRENCY_CROSSWALK_MISMATCH',
    );
    const ownerBuckets = registryRow(
      nc.ownerBucketsNative,
      'ownerBucketsNative',
    );
    const nativeClaim =
      ownerBuckets[registryString(mapping.legacyEntityId, 'legacyEntityId')];
    const base = {
      entityId: entity,
      countryId: cid,
      nativeCurrencyCandidate: currency,
      referenceOwnerLabel: mapping.legacyEntityId,
      archiveNativeClaim:
        nativeClaim === undefined
          ? null
          : registryRow(nativeClaim, 'nativeClaim').accessible,
      archiveMeaning: 'CONSTRUCTED_CLAIM_NEVER_ACTUAL_CASH' as const,
      actualAvailableCash: null,
      currentPermission: 'UNKNOWN' as const,
    };
    const unavailable = (reason: string) => ({
      ...base,
      status: 'UNKNOWN' as const,
      reason,
      candidateAccount: null,
      candidateBalance: null,
      candidateRestricted: null,
      candidateAvailable: null,
    });
    if (source === null || ledger === null)
      return unavailable('CASH_SOURCE_NOT_SUPPLIED');
    const binding = bindings.get(entity);
    if (!binding) return unavailable('ENTITY_ACCOUNT_BINDING_NOT_SUPPLIED');
    const account = accounts.get(String(binding.accountId))!;
    if (
      account.ownerId !== entity ||
      account.countryId !== cid ||
      account.currency !== currency
    )
      return unavailable('ACCOUNT_OWNERSHIP_COUNTRY_CURRENCY_MISMATCH');
    if (
      account.accountClass !== 'CASH' ||
      account.claimId !== null ||
      account.counterpartyEntityId !== null ||
      binding.sourceHoldingKind !== 'CASH'
    )
      return unavailable('NOT_NATIVE_CASH');
    const witness = balances.get(account.accountId);
    if (!witness) return unavailable('EXPLICIT_BALANCE_NOT_SUPPLIED');
    if (
      source.restrictionsComplete !== true ||
      source.restrictionBasis !== 'DECLARED_DISJOINT_CASH_ATOMS'
    )
      return unavailable('RESTRICTION_COMPLETENESS_OR_OVERLAP_UNKNOWN');
    const balance =
      ledger.positions.find((p) => p.account.accountId === account.accountId)
        ?.netDebitBalance ?? nonnegative(witness.amount, currency);
    const union = new Set<string>();
    for (const restriction of restrictions.filter(
      (r) => r.accountId === account.accountId,
    ))
      for (const id of registryArray(restriction.atomIds, 'atomIds'))
        union.add(String(id));
    let restricted = Money.from('0', currency);
    for (const id of union)
      restricted = restricted.add(nonnegative(atoms.get(id)!.amount, currency));
    const available = balance.subtract(restricted);
    if (available.amount.isNegative())
      return unavailable('RESTRICTIONS_EXCEED_BALANCE');
    return {
      ...base,
      status: 'DECLARED_CANDIDATE_NOT_ADOPTED' as const,
      reason: 'SOURCE_AND_CURRENT_AUTHORITY_UNBOUND',
      candidateAccount: account,
      candidateBalance: balance.toCanonicalValue(),
      candidateRestricted: restricted.toCanonicalValue(),
      candidateAvailable: available.toCanonicalValue(),
    };
  });
  return freezeFinancialInput({
    schemaVersion: 'native-cash-source-candidate-readback-v1' as const,
    status: 'NONAUTHORITATIVE_CANDIDATE_READBACK' as const,
    packageManifestSha256: input.registry.packageManifestSha256,
    candidateSource:
      document === null
        ? null
        : {
            documentId: document.documentId,
            sourceVersion: document.sourceVersion,
            asOf: document.asOf,
            sha256: document.sha256,
            classification: document.classification,
            signatureStatus: 'NOT_VERIFIED_HASH_IS_NOT_SIGNATURE' as const,
          },
    rows,
    formalBlockers: [
      'SOURCE_ADOPTION_UNBOUND',
      'ACTUAL_WORLD_HEAD_AND_CLOCK_UNBOUND',
      'CURRENT_AUTHORIZATION_UNAVAILABLE',
    ],
    admissionAllowed: false as const,
    activationAllowed: false as const,
    authoritativeStateCreated: false as const,
    actualUnknownClosed: 0 as const,
    formalClock: null,
    currentPermissionIssued: false as const,
  });
}
