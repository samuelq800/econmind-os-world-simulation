/** Inert installation metadata and owned read-host mechanisms, never an installer. */
import { createHash } from 'node:crypto';
import { types as nodeTypes } from 'node:util';
import { canonicalSerialize, worldId } from '@econmind/core';
import { freezeFinancialInput } from './formal-financial-opening-contract.js';
import { NativeCashCandidateInvalid } from './native-cash-source-candidate.js';
import {
  isTestOnlyGov01RecordSource,
  parseGov01ReadRequest,
  type Gov01ReadRequest,
} from './b06-gov01-adopted-record-source.js';
import {
  captureGov01ReceiverContext,
  readTestOnlyGov01AccountCountrySourceSliceFrom,
  type Gov01ReceiverContext,
} from './entity-native-cash-source-slice.js';
import {
  PostgresSqlDatabase,
  PostgresTransactionError,
} from '../persistence/postgres-sql-database.js';
import { readGov01PrivateAccountInTransaction } from './gov01-private-source-host.js';

/** Controlled Node24 private application entry; never a Command/HTTP installer.
 * The existing server-owned adapter is the only connector input. The fixed host
 * loads independently enrolled trust/current binding, or refuses without data. */
export async function readInstalledGov01AccountInTransaction(
  input: Readonly<{
    database: PostgresSqlDatabase;
    context: Gov01ReceiverContext;
    request: Gov01ReadRequest;
  }>,
) {
  return readGov01PrivateAccountInTransaction(input);
}

function demand(value: unknown, code: string): asserts value {
  if (!value) throw new NativeCashCandidateInvalid(code);
}
function closed(value: unknown, keys: readonly string[]) {
  demand(
    value !== null &&
      typeof value === 'object' &&
      !nodeTypes.isProxy(value) &&
      [null, Object.prototype].includes(Object.getPrototypeOf(value)),
    'GOV01_INSTALLATION_CLOSED_DATA_REQUIRED',
  );
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const own = Reflect.ownKeys(descriptors);
  demand(
    own.length === keys.length &&
      own.every((key) => typeof key === 'string' && keys.includes(key)),
    'GOV01_INSTALLATION_EXACT_KEYS_REQUIRED',
  );
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const d = descriptors[key];
    demand(
      d !== undefined && Object.hasOwn(d, 'value') && d.enumerable,
      'GOV01_INSTALLATION_ACCESSOR_DENIED',
    );
    result[key] = d.value;
  }
  return result;
}
function reference(value: unknown): string {
  demand(
    typeof value === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,511}$/u.test(value),
    'GOV01_INSTALLATION_REFERENCE_REQUIRED',
  );
  return value;
}
function digest(value: unknown): string {
  demand(
    typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value),
    'GOV01_INSTALLATION_DIGEST_REQUIRED',
  );
  return value;
}
function decimal(value: unknown): string {
  demand(
    typeof value === 'string' && /^(?:0|[1-9][0-9]{0,63})$/u.test(value),
    'GOV01_INSTALLATION_DECIMAL_REQUIRED',
  );
  return value;
}

function descriptorStructure(value: unknown): void {
  let nodes = 0;
  const visit = (v: unknown, depth: number): void => {
    demand(
      ++nodes <= 50000 && depth <= 24,
      'GOV01_INSTALLATION_STRUCTURE_BUDGET',
    );
    if (typeof v === 'number')
      demand(Number.isFinite(v), 'GOV01_INSTALLATION_FINITE_DATA_REQUIRED');
    if (Array.isArray(v)) {
      demand(v.length <= 1024, 'GOV01_INSTALLATION_STRUCTURE_BUDGET');
      for (const child of v) visit(child, depth + 1);
    } else if (v !== null && typeof v === 'object') {
      demand(
        Object.keys(v).length <= 32,
        'GOV01_INSTALLATION_STRUCTURE_BUDGET',
      );
      for (const child of Object.values(v)) visit(child, depth + 1);
    }
  };
  visit(value, 0);
}

/** The caller receives no partial result if callback/final-check/COMMIT fails. */
export async function readTestOnlyGov01AccountInTransaction(
  input: Readonly<{
    database: PostgresSqlDatabase;
    context: Gov01ReceiverContext;
    source: unknown;
    request: Gov01ReadRequest;
  }>,
) {
  const data = closed(input, ['database', 'context', 'source', 'request']);
  demand(
    data.database instanceof PostgresSqlDatabase,
    'GOV01_EXISTING_POSTGRES_ADAPTER_REQUIRED',
  );
  demand(
    isTestOnlyGov01RecordSource(data.source),
    'GOV01_GUARDED_FIXTURE_SOURCE_REQUIRED',
  );
  const context = captureGov01ReceiverContext(
    data.context as Gov01ReceiverContext,
  );
  const request = parseGov01ReadRequest(data.request);
  const database = data.database;
  const source = data.source;
  // This is the existing adapter's one transaction, not a pool query or a
  // second source transaction. Only a successful outer COMMIT releases data.
  const result = await database.transaction((executor) =>
    readTestOnlyGov01AccountCountrySourceSliceFrom(
      context.context,
      source,
      executor,
      request,
    ),
  );
  return freezeFinancialInput({
    transactionResult: 'COMMITTED' as const,
    evidenceClass: 'TEST_ONLY_ADAPTER_PROTOCOL_NOT_NATIVE_CUSTODY' as const,
    result,
    sourceAdmitted: false as const,
  });
}

/** Existing adapter outcomes; classification never recovers an accepted read. */
export function classifyGov01SourceReadFailure(error: unknown) {
  if (!(error instanceof PostgresTransactionError)) return 'REJECTED' as const;
  switch (error.outcome) {
    case 'COMMIT_OUTCOME_UNKNOWN':
      return 'UNKNOWN' as const;
    case 'ROLLBACK_UNCONFIRMED':
      return 'CLEANUP_INCOMPLETE' as const;
    case 'ROLLED_BACK':
      return 'ROLLED_BACK' as const;
    case 'NOT_STARTED':
      return 'NOT_STARTED' as const;
  }
}

/**
 * A canonical, byte-pinned DESCRIPTOR, not an actual source record or authority
 * document. Pins inside it are only metadata; no target, source or SQL is read.
 * Canonical descriptor bytes reject duplicate keys without normalizing them
 * away. This format requirement never rewrites upstream actual raw records.
 */
export function inspectGov01SourceInstallationDescriptor(input: unknown) {
  const envelope = closed(input, [
    'documentId',
    'bytes',
    'byteLength',
    'sha256',
  ]);
  const documentId = reference(envelope.documentId);
  demand(
    typeof envelope.bytes === 'string' &&
      Buffer.byteLength(envelope.bytes) >= 1 &&
      Buffer.byteLength(envelope.bytes) <= 16384 &&
      Buffer.from(envelope.bytes, 'utf8').toString('utf8') === envelope.bytes,
    'GOV01_INSTALLATION_BYTE_BUDGET',
  );
  const byteLength = decimal(envelope.byteLength);
  const sha256 = digest(envelope.sha256);
  demand(
    BigInt(byteLength) === BigInt(Buffer.byteLength(envelope.bytes)) &&
      createHash('sha256').update(envelope.bytes, 'utf8').digest('hex') ===
        sha256,
    'GOV01_INSTALLATION_RAW_PIN_MISMATCH',
  );
  let value: unknown;
  try {
    value = JSON.parse(envelope.bytes) as unknown;
  } catch {
    throw new NativeCashCandidateInvalid('GOV01_INSTALLATION_JSON_INVALID');
  }
  descriptorStructure(value);
  demand(
    canonicalSerialize(value) === envelope.bytes,
    'GOV01_INSTALLATION_CANONICAL_DESCRIPTOR_REQUIRED',
  );
  const data = closed(value, [
    'schemaVersion',
    'backend',
    'targetIdentity',
    'connectorReference',
    'allowedCaller',
    'scope',
    'pins',
  ]);
  demand(
    data.schemaVersion === 'gov01-inert-installation-descriptor-v1' &&
      data.backend === 'EXISTING_WORKER_POSTGRES' &&
      data.allowedCaller === 'WORKER_GOV01_ACCOUNT_READ_V1',
    'GOV01_INSTALLATION_DESCRIPTOR_SCOPE_REQUIRED',
  );
  const targetIdentity = reference(data.targetIdentity);
  const connectorReference = reference(data.connectorReference);
  const scope = closed(data.scope, [
    'worldId',
    'countryId',
    'originalId',
    'registrationReference',
    'sourceSetVersion',
    'controlScope',
  ]);
  demand(
    scope.countryId === 'COUNTRY_01' &&
      scope.originalId === 'U2544::ENTITY::ENTITY_GOVERNMENT_01::account',
    'GOV01_INSTALLATION_ORIGINAL_SCOPE_REQUIRED',
  );
  const capturedScope = {
    worldId: String(worldId(reference(scope.worldId))),
    countryId: 'COUNTRY_01' as const,
    originalId: 'U2544::ENTITY::ENTITY_GOVERNMENT_01::account' as const,
    registrationReference: reference(scope.registrationReference),
    sourceSetVersion: reference(scope.sourceSetVersion),
    controlScope: reference(scope.controlScope),
  };
  demand(
    Array.isArray(data.pins) && data.pins.length >= 1 && data.pins.length <= 32,
    'GOV01_INSTALLATION_PIN_COUNT',
  );
  const ids = new Set<string>();
  let totalBytes = 0n;
  const pins = data.pins.map((entry) => {
    const pin = closed(entry, [
      'documentId',
      'sourceVersion',
      'byteLength',
      'sha256',
      'pointer',
    ]);
    const id = reference(pin.documentId);
    demand(!ids.has(id), 'GOV01_INSTALLATION_DUPLICATE_DOCUMENT');
    ids.add(id);
    const length = decimal(pin.byteLength);
    demand(
      BigInt(length) >= 1n && BigInt(length) <= 1048576n,
      'GOV01_INSTALLATION_DOCUMENT_BUDGET',
    );
    totalBytes += BigInt(length);
    demand(totalBytes <= 8388608n, 'GOV01_INSTALLATION_TOTAL_BUDGET');
    demand(
      typeof pin.pointer === 'string' &&
        Buffer.byteLength(pin.pointer) <= 2048 &&
        (pin.pointer === '' || /^(?:\/(?:[^~/]|~[01])*)+$/u.test(pin.pointer)),
      'GOV01_INSTALLATION_POINTER_REQUIRED',
    );
    return {
      documentId: id,
      sourceVersion: reference(pin.sourceVersion),
      byteLength: length,
      sha256: digest(pin.sha256),
      pointer: pin.pointer,
    };
  });
  return freezeFinancialInput({
    schemaVersion: 'gov01-inert-installation-descriptor-read-v1' as const,
    classification: 'VALIDATED_METADATA_NOT_INSTALLED_SOURCE' as const,
    descriptorPin: { documentId, byteLength, sha256 },
    targetIdentity,
    connectorReference,
    allowedCaller: 'WORKER_GOV01_ACCOUNT_READ_V1' as const,
    scope: capturedScope,
    pins,
    pinMeaning: 'METADATA_ONLY_SOURCE_BODIES_NOT_READ' as const,
    actualControlMapping: null,
    actualTypedRegisterBinding: null,
    sourceInstalled: false as const,
    sourceAdmitted: false as const,
    blockers: [
      'INDEPENDENT_ACTUAL_ORIGIN_AND_APPOINTMENT_NOT_SUPPLIED',
      'ACTUAL_SOURCE_CONTROL_PARENT_CURRENT_CHECKPOINT_AND_ALL_MUTATORS_NOT_SUPPLIED',
      'ACTUAL_ISSUED_BOUND_SET_CURRENCY_AND_LAWFUL_OPENING_NOT_SUPPLIED',
    ],
  });
}
