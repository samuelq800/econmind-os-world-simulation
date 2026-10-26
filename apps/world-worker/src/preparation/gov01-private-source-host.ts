/** Controlled Node24 ESM private host. Import is inert; no public installer. */
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createPublicKey, verify, type KeyObject } from 'node:crypto';
import { types as nodeTypes } from 'node:util';
import { canonicalSerialize } from '@econmind/core';
import { PostgresSqlDatabase } from '../persistence/postgres-sql-database.js';
import type { SqlExecutor } from '../persistence/sql-database.js';
import { DurableV08LedgerLineageReader } from '../persistence/durable-v08-ledger-lineage-reader.js';
import { WorldOpeningSeedStore } from '../persistence/opening-seed-store.js';
import {
  GOV01_ORIGINAL_ID,
  inspectGov01RetainedRecordSetData,
  parseGov01ReadRequest,
  type Gov01ReadRequest,
  type Gov01TypedRecordSource,
  type Gov01TypedRegisterBindingData,
} from './b06-gov01-adopted-record-source.js';
import type { Gov01ReceiverContext } from './entity-native-cash-source-slice.js';
import {
  captureGov01ControlData,
  demandGov01Control as demand,
  gov01ControlRow as row,
  gov01ControlText as text,
  gov01ControlDigest as digest,
  gov01ControlDecimal as decimal,
  gov01ControlSha256 as sha,
  readGov01NativeControlSnapshotFrom,
  GOV01_CONTROL_DEPENDENCIES,
} from './gov01-native-control-store.js';

const roles = Object.freeze([
  'retainedOriginPin',
  'installationPin',
  'cbIssuerCustodyAppointmentPin',
  'govRegisterCustodyAppointmentPin',
  'holderConcurrencePin',
  'definitionAdoptionPin',
  'exactRecordSetAdoptionPin',
  'registrationPin',
  'controlCheckpointPin',
  'currencyAdoptionPin',
  'openingPin',
] as const);
const sources = new WeakSet<object>();
type Row = Record<string, unknown>;
interface InspectedEnrollment {
  readonly classification: 'ENROLLMENT_DATA_NOT_INSTALLED_SOURCE';
  readonly body: Readonly<Row>;
  readonly rootKeySha256: string;
}
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);

function key(value: unknown): KeyObject {
  demand(
    typeof value === 'string' && value.length <= 512,
    'GOV01_ED25519_KEY_REQUIRED',
  );
  const bytes = Buffer.from(value, 'base64');
  demand(bytes.toString('base64') === value, 'GOV01_CANONICAL_KEY_REQUIRED');
  const result = createPublicKey({ key: bytes, format: 'der', type: 'spki' });
  demand(
    result.asymmetricKeyType === 'ed25519' &&
      (result.export({ format: 'der', type: 'spki' }) as Buffer).equals(bytes),
    'GOV01_ED25519_KEY_REQUIRED',
  );
  return result;
}
function signature(
  publicKey: KeyObject,
  message: string,
  value: unknown,
): void {
  demand(typeof value === 'string', 'GOV01_SIGNATURE_REQUIRED');
  const bytes = Buffer.from(value, 'base64');
  demand(
    bytes.length === 64 &&
      bytes.toString('base64') === value &&
      verify(null, Buffer.from(message, 'utf8'), publicKey, bytes),
    'GOV01_SIGNATURE_INVALID',
  );
}
function rawOriginal(value: unknown) {
  const d = row(value, ['pin', 'utf8']);
  const p = row(d.pin, [
    'documentId',
    'sourceVersion',
    'byteLength',
    'sha256',
    'pointer',
  ]);
  text(p.documentId);
  text(p.sourceVersion);
  decimal(p.byteLength);
  digest(p.sha256);
  demand(
    p.pointer === '' &&
      typeof d.utf8 === 'string' &&
      Buffer.byteLength(d.utf8) <= 1048576 &&
      String(Buffer.byteLength(d.utf8)) === p.byteLength &&
      sha(d.utf8) === p.sha256,
    'GOV01_INDEPENDENT_ROOT_RAW_PIN_MISMATCH',
  );
  return d;
}

/** Pure inspection with explicitly supplied trust DATA, never a genuine source.
 * Only the fixed private loader can use separately retained configuration. */
export function inspectGov01NodeEnrollmentData(
  value: unknown,
  trustedValue: unknown,
): Readonly<InspectedEnrollment> {
  const trusted = row(captureGov01ControlData(trustedValue), [
    'schemaVersion',
    'rootPublicKeySpki',
    'rootAuthorityReference',
    'rootAuthorityOriginal',
  ]);
  demand(
    trusted.schemaVersion === 'gov01-independent-authority-trust-v1',
    'GOV01_INDEPENDENT_TRUST_REQUIRED',
  );
  text(trusted.rootAuthorityReference);
  rawOriginal(trusted.rootAuthorityOriginal);
  const rootKey = key(trusted.rootPublicKeySpki);
  const envelope = row(captureGov01ControlData(value), [
    'schemaVersion',
    'body',
    'roleCertificates',
    'rootSignature',
    'roleSignatures',
  ]);
  demand(
    envelope.schemaVersion === 'gov01-node-native-installation-envelope-v1',
    'GOV01_ENROLLMENT_VERSION',
  );
  const b = row(envelope.body, [
    'enrollmentReference',
    'rootAuthorityReference',
    'scope',
    'target',
    'control',
    'opening',
    'currency',
    'bindingSha256',
    'pinSetSha256',
    'rolePins',
    'roleCertificateSetSha256',
  ]);
  text(b.enrollmentReference);
  demand(
    b.rootAuthorityReference === trusted.rootAuthorityReference,
    'GOV01_ROOT_AUTHORITY_BINDING',
  );
  const scope = row(b.scope, [
    'worldId',
    'originalId',
    'registrationReference',
    'sourceSetVersion',
    'heldHead',
  ]);
  demand(scope.originalId === GOV01_ORIGINAL_ID, 'GOV01_ENROLLMENT_SCOPE');
  // The actual request parser is closed: construct only its exact five fields.
  const request = parseGov01ReadRequest({
    worldId: scope.worldId,
    requestedOriginalId: GOV01_ORIGINAL_ID,
    registrationReference: scope.registrationReference,
    sourceSetVersion: scope.sourceSetVersion,
    heldHead: scope.heldHead,
  });
  const target = row(b.target, [
    'deploymentReference',
    'databaseIdentityRef',
    'databaseName',
    'connectorReference',
    'catalogIdentity',
    'readerPrincipal',
    'allowedCaller',
  ]);
  for (const v of Object.values(target)) text(v);
  demand(
    target.allowedCaller === 'WORKER_GOV01_ACCOUNT_READ_V1',
    'GOV01_PRIVATE_CALLER_REQUIRED',
  );
  const c = row(b.control, [
    'anchorReference',
    'scopeReference',
    'generation',
    'headDigest',
    'checkpointGeneration',
    'checkpointHeadDigest',
  ]);
  text(c.anchorReference);
  text(c.scopeReference);
  decimal(c.generation);
  digest(c.headDigest);
  decimal(c.checkpointGeneration);
  digest(c.checkpointHeadDigest);
  demand(
    BigInt(c.generation as string) >= 1n &&
      (c.generation === c.checkpointGeneration ||
        BigInt(c.generation as string) ===
          BigInt(c.checkpointGeneration as string) + 1n),
    'GOV01_INDEPENDENT_CHECKPOINT_GAP',
  );
  const opening = row(b.opening, [
    'seedOrGenesisId',
    'seedOrGenesisFingerprint',
    'asOf',
    'valueDate',
    'calendarEpochSourceReference',
    'lifecycleAttestationReference',
    'openingAuthorityEvidenceReference',
  ]);
  for (const v of Object.values(opening)) text(v);
  demand(
    /^sha256:[a-f0-9]{64}$/u.test(opening.seedOrGenesisFingerprint as string),
    'GOV01_OPENING_FINGERPRINT',
  );
  const currency = row(b.currency, ['code', 'unit']);
  text(currency.code);
  text(currency.unit);
  digest(b.bindingSha256);
  digest(b.pinSetSha256);
  digest(b.roleCertificateSetSha256);
  const pins = row(b.rolePins, roles);
  for (const v of Object.values(pins)) {
    const p = row(v, [
      'documentId',
      'sourceVersion',
      'byteLength',
      'sha256',
      'pointer',
    ]);
    text(p.documentId);
    text(p.sourceVersion);
    decimal(p.byteLength);
    digest(p.sha256);
    demand(
      typeof p.pointer === 'string' && Buffer.byteLength(p.pointer) <= 2048,
      'GOV01_ROLE_SELECTOR',
    );
  }
  demand(
    Array.isArray(envelope.roleCertificates) &&
      envelope.roleCertificates.length === roles.length &&
      sha(canonicalSerialize(envelope.roleCertificates)) ===
        b.roleCertificateSetSha256,
    'GOV01_COMPLETE_ROLE_CERTIFICATES_REQUIRED',
  );
  const certified = new Map<string, KeyObject>();
  for (const value of envelope.roleCertificates) {
    const cert = row(value, ['body', 'signature']);
    const cb = row(cert.body, [
      'role',
      'publicKeySpki',
      'rootAuthorityReference',
      'worldId',
      'originalId',
      'registrationReference',
      'sourceSetVersion',
      'competenceEvidencePin',
    ]);
    demand(
      roles.includes(cb.role as (typeof roles)[number]) &&
        !certified.has(cb.role as string) &&
        cb.rootAuthorityReference === trusted.rootAuthorityReference &&
        cb.worldId === request.worldId &&
        cb.originalId === GOV01_ORIGINAL_ID &&
        cb.registrationReference === request.registrationReference &&
        cb.sourceSetVersion === request.sourceSetVersion &&
        same(cb.competenceEvidencePin, pins[cb.role as string]),
      'GOV01_ROLE_COMPETENCE_BINDING',
    );
    signature(
      rootKey,
      'GOV01_ROLE_CERTIFICATE_V1\n' + canonicalSerialize(cb),
      cert.signature,
    );
    certified.set(cb.role as string, key(cb.publicKeySpki));
  }
  signature(
    rootKey,
    'GOV01_INSTALLATION_ENVELOPE_V1\n' + canonicalSerialize(b),
    envelope.rootSignature,
  );
  demand(
    Array.isArray(envelope.roleSignatures) &&
      envelope.roleSignatures.length === roles.length,
    'GOV01_COMPLETE_ROLE_SIGNATURES_REQUIRED',
  );
  const signed = new Set<string>();
  for (const value of envelope.roleSignatures) {
    const s = row(value, ['role', 'signature']);
    demand(
      typeof s.role === 'string' &&
        certified.has(s.role) &&
        !signed.has(s.role),
      'GOV01_ROLE_SIGNATURE_SCOPE',
    );
    signature(
      certified.get(s.role)!,
      'GOV01_INSTALLATION_ROLE_V1\n' + s.role + '\n' + canonicalSerialize(b),
      s.signature,
    );
    signed.add(s.role);
  }
  demand(
    !same(
      certified
        .get('cbIssuerCustodyAppointmentPin')!
        .export({ format: 'der', type: 'spki' })
        .toString('base64'),
      certified
        .get('govRegisterCustodyAppointmentPin')!
        .export({ format: 'der', type: 'spki' })
        .toString('base64'),
    ),
    'GOV01_DISTINCT_ISSUER_REGISTER_KEYS_REQUIRED',
  );
  return Object.freeze({
    classification: 'ENROLLMENT_DATA_NOT_INSTALLED_SOURCE',
    body: b,
    rootKeySha256: sha(
      rootKey.export({ format: 'der', type: 'spki' }) as Buffer,
    ),
  });
}

/** Source identity recognition only; no public registration/add method. */
export function isGov01PrivateNativeRecordSource(
  value: unknown,
): value is Gov01TypedRecordSource {
  return value !== null && typeof value === 'object' && sources.has(value);
}
interface LoadedEnrollment {
  readonly pin: string;
  readonly inspected: Readonly<InspectedEnrollment>;
}
async function loadFixedEnrollment(): Promise<LoadedEnrollment> {
  demand(
    process.release.name === 'node' &&
      process.versions.node === '24.20.0' &&
      typeof process.getuid === 'function' &&
      ['linux', 'darwin'].includes(process.platform),
    'GOV01_PRIVATE_NODE_HOST_REQUIRED',
  );
  const systemRoot = await realpath('/etc');
  demand(
    systemRoot === (process.platform === 'darwin' ? '/private/etc' : '/etc'),
    'GOV01_FIXED_SYSTEM_ROOT_REQUIRED',
  );
  const parents = [
    systemRoot,
    path.join(systemRoot, 'econmind'),
    path.join(systemRoot, 'econmind/world'),
    path.join(systemRoot, 'econmind/world/gov01'),
  ];
  for (const dir of parents) {
    const s = await lstat(dir);
    demand(
      s.isDirectory() &&
        !s.isSymbolicLink() &&
        s.uid === 0 &&
        (s.mode & 0o022) === 0,
      'GOV01_PRIVATE_ENROLLMENT_CUSTODY_REQUIRED',
    );
  }
  const name = path.join(parents.at(-1)!, 'installation-authority.json');
  const file = await open(name, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes: Buffer;
  try {
    const s = await file.stat({ bigint: true });
    demand(
      s.isFile() &&
        s.uid === 0n &&
        s.nlink === 1n &&
        (s.mode & 0o022n) === 0n &&
        s.size >= 1n &&
        s.size <= 131072n,
      'GOV01_PRIVATE_ENROLLMENT_CUSTODY_REQUIRED',
    );
    const buffer = Buffer.alloc(Number(s.size) + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const n = await file.read(buffer, offset, buffer.length - offset, offset);
      if (!n.bytesRead) break;
      offset += n.bytesRead;
    }
    const after = await file.stat({ bigint: true });
    demand(
      BigInt(offset) === s.size &&
        after.mtimeNs === s.mtimeNs &&
        after.ctimeNs === s.ctimeNs &&
        after.ino === s.ino &&
        after.dev === s.dev &&
        after.size === s.size,
      'GOV01_ENROLLMENT_CHANGED',
    );
    bytes = buffer.subarray(0, offset);
  } finally {
    await file.close();
  }
  const utf8 = new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(
    bytes,
  );
  const parsed: unknown = JSON.parse(utf8);
  demand(
    canonicalSerialize(parsed) === utf8,
    'GOV01_CANONICAL_ENROLLMENT_REQUIRED',
  );
  const config = row(captureGov01ControlData(parsed), ['trust', 'envelope']);
  return Object.freeze({
    pin: sha(bytes),
    inspected: inspectGov01NodeEnrollmentData(config.envelope, config.trust),
  });
}

const controlTables = [
  'gov01_control_catalog',
  'gov01_control_scope',
  'gov01_control_head',
  'gov01_control_checkpoint',
  'gov01_control_history',
  'gov01_control_document',
  'gov01_control_operation_receipt',
];
async function assertNativePrincipal(
  tx: SqlExecutor,
  target: Row,
): Promise<void> {
  const result = await tx.query<{
    database_name: string;
    principal: string;
    effective_principal: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
    rolcreaterole: boolean;
    rolcreatedb: boolean;
    memberships: string;
    control_dml: boolean;
    can_mutate: boolean;
    schema_create: boolean;
  }>(
    `select current_database()::text as database_name, session_user::text as principal,
      current_user::text as effective_principal, r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,
      (select count(*)::text from pg_catalog.pg_auth_members where member=r.oid) as memberships,
      exists(select 1 from unnest($1::text[]) as t where
        has_table_privilege(current_user,'world_v2.'||t,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) as control_dml,
      has_function_privilege(current_user,'world_v2.gov01_apply_control_operation(text,text)','EXECUTE') as can_mutate,
      has_schema_privilege(current_user,'world_v2','CREATE') as schema_create
      from pg_catalog.pg_roles r where r.rolname=current_user`,
    [controlTables],
  );
  const r = result.rows[0];
  demand(
    result.rows.length === 1 &&
      r &&
      r.database_name === target.databaseName &&
      r.principal === target.readerPrincipal &&
      r.effective_principal === r.principal &&
      !r.rolsuper &&
      !r.rolbypassrls &&
      !r.rolcreaterole &&
      !r.rolcreatedb &&
      r.memberships === '0' &&
      !r.control_dml &&
      !r.can_mutate &&
      !r.schema_create,
    'GOV01_NATIVE_TARGET_OR_PRINCIPAL_MISMATCH',
  );
}

/** Fixed callable Node entry. No caller-supplied source/key/path/callback. */
export async function readGov01PrivateAccountInTransaction(
  input: Readonly<{
    database: PostgresSqlDatabase;
    context: Gov01ReceiverContext;
    request: Gov01ReadRequest;
  }>,
) {
  // Do not descriptor-copy the adapter/registry: their identity is not data.
  demand(
    input !== null &&
      typeof input === 'object' &&
      !nodeTypes.isProxy(input) &&
      Object.getPrototypeOf(input) === Object.prototype,
    'GOV01_FIXED_PRIVATE_ENTRY_REQUIRED',
  );
  const ds = Object.getOwnPropertyDescriptors(input);
  demand(
    Reflect.ownKeys(ds).length === 3 &&
      ['database', 'context', 'request'].every(
        (k) => ds[k] && Object.hasOwn(ds[k], 'value') && ds[k]!.enumerable,
      ),
    'GOV01_FIXED_PRIVATE_ENTRY_REQUIRED',
  );
  const database = ds.database!.value as PostgresSqlDatabase;
  demand(
    database !== null &&
      typeof database === 'object' &&
      !nodeTypes.isProxy(database) &&
      database instanceof PostgresSqlDatabase,
    'GOV01_EXISTING_ADAPTER_REQUIRED',
  );
  const request = parseGov01ReadRequest(ds.request!.value);
  const context = ds.context!.value as Gov01ReceiverContext;
  const receiver = await import('./entity-native-cash-source-slice.js');
  const capturedContext = receiver.captureGov01ReceiverContext(context).context;
  const enrollment = await loadFixedEnrollment();
  const body = enrollment.inspected.body,
    scope = row(body.scope),
    target = row(body.target),
    control = row(body.control);
  demand(
    same(request, {
      worldId: scope.worldId,
      requestedOriginalId: GOV01_ORIGINAL_ID,
      registrationReference: scope.registrationReference,
      sourceSetVersion: scope.sourceSetVersion,
      heldHead: scope.heldHead,
    }),
    'GOV01_FIXED_ENROLLMENT_REQUEST_MISMATCH',
  );
  const reader = new DurableV08LedgerLineageReader({
    database,
    sha256Hex: sha,
  });
  const openings = new WorldOpeningSeedStore({ database, sha256Hex: sha });
  const committed = await database.transaction(async (tx) => {
    let active = true,
      used = false,
      stickyFailure = false,
      checking = false;
    const observe = async () => {
      demand(active, 'GOV01_SOURCE_SCOPE_EXPIRED');
      await assertNativePrincipal(tx, target);
      const lineage = await reader.rebuildFrom(tx, request.worldId);
      demand(
        lineage.headWorldVersion === request.heldHead.worldVersion &&
          lineage.headEventSequence === request.heldHead.eventSequence,
        'GOV01_NATIVE_H_MISMATCH',
      );
      const seed = await openings.loadFrom(tx, request.worldId);
      const snapshot = await readGov01NativeControlSnapshotFrom(tx, request);
      demand(
        snapshot.status === 'PRESENT' &&
          snapshot.recordClass === 'RETAINED_RECORDS' &&
          snapshot.catalogIdentity === target.catalogIdentity &&
          snapshot.generation === control.generation &&
          snapshot.headDigest === control.headDigest &&
          snapshot.anchorReference === control.anchorReference &&
          snapshot.scopeReference === control.scopeReference,
        'GOV01_CURRENT_CONTROL_MISMATCH',
      );
      demand(
        (control.checkpointGeneration === snapshot.generation &&
          control.checkpointHeadDigest === snapshot.headDigest) ||
          (control.checkpointGeneration === snapshot.parentGeneration &&
            control.checkpointHeadDigest === snapshot.parentHeadDigest),
        'GOV01_INDEPENDENT_CHECKPOINT_MISMATCH',
      );
      const state = row(snapshot.state),
        payload = row(state.payload),
        dependencies = row(state.dependencies, GOV01_CONTROL_DEPENDENCIES);
      demand(
        state.retired === false &&
          GOV01_CONTROL_DEPENDENCIES.every(
            (k) => dependencies[k] === 'ACTIVE',
          ) &&
          payload.allowedCaller === 'WORKER_GOV01_ACCOUNT_READ_V1' &&
          payload.targetDeploymentRef === target.deploymentReference &&
          payload.databaseIdentityRef === target.databaseIdentityRef &&
          payload.connectorReference === target.connectorReference &&
          payload.enrollmentReference === body.enrollmentReference,
        'GOV01_SOURCE_DEPENDENCY_NOT_CURRENT',
      );
      const bindingBase = row(payload.bindingBase);
      demand(
        !Object.hasOwn(bindingBase, 'control') &&
          same(payload.manifestPin, bindingBase.sourceManifestPin),
        'GOV01_NATIVE_BINDING_TRANSPORT_REQUIRED',
      );
      const data = inspectGov01RetainedRecordSetData(
        {
          binding: {
            ...bindingBase,
            control: {
              anchorReference: snapshot.anchorReference,
              scope: snapshot.scopeReference,
              generation: snapshot.generation,
              headDigest: snapshot.headDigest,
            },
          },
          documents: snapshot.documents,
        },
        request,
      );
      const binding = data.binding;
      demand(
        sha(canonicalSerialize(binding)) === body.bindingSha256 &&
          data.documentSetIdentity.pinSetSha256 === body.pinSetSha256 &&
          same(binding.currency.code, row(body.currency).code) &&
          same(binding.currency.unit, row(body.currency).unit) &&
          binding.opening.seedOrGenesisId === seed.seedId &&
          binding.opening.seedOrGenesisFingerprint === seed.fingerprint &&
          same(
            Object.fromEntries(
              Object.keys(row(body.opening)).map((k) => [
                k,
                (binding.opening as unknown as Row)[k],
              ]),
            ),
            body.opening,
          ),
        'GOV01_INDEPENDENT_BINDING_OR_OPENING_MISMATCH',
      );
      const rolePins = {
        ...binding.authorityEvidence,
        currencyAdoptionPin: binding.currency.adoptionEvidencePin,
        openingPin: binding.opening.openingPin,
      };
      demand(
        same(rolePins, body.rolePins),
        'GOV01_INDEPENDENT_ROLE_PIN_MISMATCH',
      );
      demand(
        (await loadFixedEnrollment()).pin === enrollment.pin,
        'GOV01_PRIVATE_ENROLLMENT_CHANGED',
      );
      return Object.freeze({
        binding,
        identity: sha(canonicalSerialize(snapshot)),
      });
    };
    const source: Gov01TypedRecordSource = Object.freeze({
      async withCurrentBindingFrom<Result>(
        executor: SqlExecutor,
        requestValue: Gov01ReadRequest,
        consume: (
          binding: Gov01TypedRegisterBindingData,
          use: {
            assertCurrentFrom(
              e: SqlExecutor,
              r: Gov01ReadRequest,
            ): Promise<void>;
          },
        ) => Promise<Result>,
      ) {
        demand(
          active &&
            !used &&
            executor === tx &&
            same(parseGov01ReadRequest(requestValue), request),
          'GOV01_FOREIGN_OR_REUSED_SOURCE',
        );
        used = true;
        try {
          const before = await observe(),
            after = await observe();
          demand(same(before, after), 'GOV01_SOURCE_CHANGED');
          let useCount = 0;
          const use = Object.freeze({
            async assertCurrentFrom(e: SqlExecutor, r: Gov01ReadRequest) {
              try {
                demand(
                  active &&
                    !stickyFailure &&
                    !checking &&
                    e === tx &&
                    same(parseGov01ReadRequest(r), request),
                  'GOV01_FOREIGN_OR_EXPIRED_USE',
                );
                checking = true;
                demand(same(await observe(), before), 'GOV01_SOURCE_CHANGED');
                useCount++;
              } catch (error) {
                stickyFailure = true;
                throw error;
              } finally {
                checking = false;
              }
            },
          });
          const result = await consume(before.binding, use);
          demand(
            useCount > 0 && !checking && !stickyFailure,
            'GOV01_RECEIVER_USE_CHECK_REQUIRED',
          );
          demand(same(await observe(), before), 'GOV01_SOURCE_CHANGED');
          return result;
        } finally {
          active = false;
        }
      },
    });
    sources.add(source);
    try {
      return await receiver.readGov01AdoptedAccountCountrySourceSliceFrom(
        capturedContext,
        source,
        tx,
        request,
      );
    } finally {
      active = false;
      sources.delete(source);
    }
  });
  return Object.freeze({
    transactionResult: 'COMMITTED' as const,
    result: committed,
    evidenceClass: 'QUALIFIED_NODE_SOURCE_READ_NOT_WORLD_ADOPTION' as const,
    sourceAdmitted: false as const,
    WorldClock: false as const,
  });
}
