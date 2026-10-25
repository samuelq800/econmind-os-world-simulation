/** Pure data binding only. No native source, view, provider or authority issuer. */
import { createHash } from 'node:crypto';
import { types as nodeTypes } from 'node:util';
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  SimTime,
  canonicalSerialize,
  commandId,
  worldId,
} from '@econmind/core';

interface Target {
  readonly targetDeploymentRef: string;
  readonly databaseIdentityRef: string;
}
interface Publisher {
  readonly repository: string;
  readonly workflowPath: string;
  readonly workflowCommit: string;
  readonly policyCommit: string;
  readonly registeredCallerRevision: string;
  readonly publisherEvidenceRef: string;
  readonly publisherEvidenceRevision: string;
  readonly runId: string;
  readonly jobId: string;
  readonly requestAuditRef: string;
  readonly responseArtifactRef: string;
  readonly responseSHA256: string;
  readonly outcome: 'APPLIED';
}
interface Build {
  readonly constructorSourceCommit: string;
  readonly constructorBlobSHA256: string;
  readonly decoderProtocol: 'industry-production-decoder-v1';
  readonly decoderBuildSHA256: string;
}
interface ReleaseRow {
  readonly migration_id: string;
  readonly artifact_sha256: string;
  readonly source_repo_commit: string;
  readonly release_order: number;
}
interface ReleaseLedger {
  readonly observationRef: string;
  readonly revision: string;
  readonly rows: readonly ReleaseRow[];
}
interface CatalogObject {
  readonly objectId: string;
  readonly kind: string;
  readonly attachment: string;
  readonly enabledMode: string;
  readonly deferredMode: string;
  readonly normalizedDefinition: string;
}
interface Catalog {
  readonly observationRef: string;
  readonly revision: string;
  readonly protocolVersion: string;
  readonly postgresBuild: string;
  readonly objects: readonly CatalogObject[];
}
interface Admission extends Target {
  readonly decisionRef: string;
  readonly revision: string;
  readonly disposition: 'ADMITTED';
  readonly publisherEvidenceRevision: string;
  readonly constructorBlobSHA256: string;
  readonly decoderBuildSHA256: string;
}
interface CheckedFor {
  readonly worldId: string;
  readonly commandId: string;
  readonly commandFingerprint: string;
  readonly head: Readonly<{ worldVersion: string; eventSequence: string }>;
  readonly simTime: string;
}
interface Guards {
  readonly schemaReleaseResourceRef: string;
  readonly admissionResourceRef: string;
  readonly cooperationRevision: string;
  readonly observationRef: string;
}
export interface IndustryCompatibilityEvidenceInput {
  readonly schemaVersion: 'industry-compatibility-evidence-input-v1';
  readonly target: Target;
  readonly publisher: Publisher;
  readonly build: Build;
  readonly releaseLedger: ReleaseLedger;
  readonly catalog: Catalog;
  readonly admission: Admission;
  readonly checkedFor: CheckedFor;
  readonly guards: Guards;
}
export interface IndustryCompatibilityEvidenceExpectation {
  readonly schemaVersion: 'industry-compatibility-evidence-expectation-v1';
  readonly target: Target;
  readonly publisher: Omit<Publisher, 'outcome'>;
  readonly build: Build;
  readonly releaseLedger: ReleaseLedger;
  readonly catalog: Catalog;
  readonly admission: Omit<Admission, 'disposition'>;
  readonly checkedFor: CheckedFor;
  readonly guards: Guards;
}
export interface IndustryCompatibilityEvidenceBinding {
  readonly schemaVersion: 'industry-compatibility-data-binding-v1';
  readonly status: 'DATA_BINDING_MATCH_NOT_AUTHENTICATED';
  readonly productionAuthority: false;
  readonly sourceAdmitted: false;
  readonly runtimeConnected: false;
  readonly evidenceSHA256: string;
  readonly checkedFor: CheckedFor;
  readonly observation: Readonly<{
    schemaVersion: 'industry-compatibility-observation-v1';
    targetDeploymentRef: string;
    databaseIdentityRef: string;
    publisherEvidenceRef: string;
    publisherEvidenceRevision: string;
    admissionDecisionRef: string;
    admissionRevision: string;
    releaseLedgerObservationHash: string;
    catalogContractVersion: string;
    catalogObservationHash: string;
    checkedCommandFingerprint: string;
    checkedHead: CheckedFor['head'];
  }>;
}

type Reason =
  | 'SHAPE_INVALID'
  | 'CAP_EXCEEDED'
  | 'PUBLICATION_OUTCOME_INVALID'
  | 'ADMISSION_NOT_CURRENT'
  | 'TARGET_MISMATCH'
  | 'BUILD_MISMATCH'
  | 'RELEASE_CHAIN_MISMATCH'
  | 'CATALOG_MISMATCH'
  | 'REVISION_MISMATCH'
  | 'CUTOFF_MISMATCH'
  | 'GUARD_MAPPING_MISMATCH';
const MAX_BYTES = 262_144;
// Existing policy7461 manifest e675bd8b…; JSON.stringify(ledger(migrations)).
// A fixed source expectation, NOT an observed registry or production approval.
const POLICY_COMMIT = '7461a053a74131fcc8273a8ac981e28b510ca03c';
const POLICY_ROWS_SHA256 =
  '32e78158bdac2869d1cec0f5a655744152b4aa2fecec51bfa11eaddce910b9c5';
const rootKeys = [
  'schemaVersion',
  'target',
  'publisher',
  'build',
  'releaseLedger',
  'catalog',
  'admission',
  'checkedFor',
  'guards',
];
const targetKeys = ['targetDeploymentRef', 'databaseIdentityRef'];
const publisherKeys = [
  'repository',
  'workflowPath',
  'workflowCommit',
  'policyCommit',
  'registeredCallerRevision',
  'publisherEvidenceRef',
  'publisherEvidenceRevision',
  'runId',
  'jobId',
  'requestAuditRef',
  'responseArtifactRef',
  'responseSHA256',
];
const buildKeys = [
  'constructorSourceCommit',
  'constructorBlobSHA256',
  'decoderProtocol',
  'decoderBuildSHA256',
];
const admissionKeys = [
  'decisionRef',
  'revision',
  'targetDeploymentRef',
  'databaseIdentityRef',
  'publisherEvidenceRevision',
  'constructorBlobSHA256',
  'decoderBuildSHA256',
];
const guardKeys = [
  'schemaReleaseResourceRef',
  'admissionResourceRef',
  'cooperationRevision',
  'observationRef',
];

function invalid(reason: Reason): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `Industry compatibility input: ${reason}`,
  );
}
function sha(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Reject native proxies before reflection, then snapshot bounded data once. */
function snapshot(value: unknown): unknown {
  let nodes = 0,
    bytes = 0;
  const active = new Set<object>();
  function copy(v: unknown, depth: number): unknown {
    if (++nodes > 4096 || depth > 8) invalid('CAP_EXCEEDED');
    if (typeof v === 'string') {
      const size = Buffer.byteLength(v, 'utf8');
      bytes += size;
      if (size > 32768 || bytes > MAX_BYTES) invalid('CAP_EXCEEDED');
      return v;
    }
    if (typeof v === 'number') {
      if (!Number.isInteger(v) || !Number.isSafeInteger(v))
        invalid('SHAPE_INVALID');
      return v;
    }
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v !== 'object' || nodeTypes.isProxy(v)) invalid('SHAPE_INVALID');
    if (active.has(v)) invalid('SHAPE_INVALID');
    const array = Array.isArray(v);
    if (
      Object.getPrototypeOf(v) !== (array ? Array.prototype : Object.prototype)
    )
      invalid('SHAPE_INVALID');
    const descriptors = Object.getOwnPropertyDescriptors(v);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length > (array ? 65 : 16)) invalid('CAP_EXCEEDED');
    active.add(v);
    try {
      if (array) {
        const length = descriptors.length?.value as unknown;
        if (
          typeof length !== 'number' ||
          length > 64 ||
          keys.length !== length + 1
        )
          invalid('SHAPE_INVALID');
        const result: unknown[] = [];
        for (let i = 0; i < length; i++) {
          const d = descriptors[String(i)];
          if (!d || !Object.hasOwn(d, 'value') || !d.enumerable)
            invalid('SHAPE_INVALID');
          result.push(copy(d.value, depth + 1));
        }
        return Object.freeze(result);
      }
      const result: [string, unknown][] = [];
      for (const key of keys) {
        if (typeof key !== 'string' || key.length > 512)
          invalid('SHAPE_INVALID');
        const d = descriptors[key];
        if (!d || !Object.hasOwn(d, 'value') || !d.enumerable)
          invalid('SHAPE_INVALID');
        result.push([key, copy(d.value, depth + 1)]);
      }
      return Object.freeze(Object.fromEntries(result));
    } finally {
      active.delete(v);
    }
  }
  return copy(value, 0);
}
function record(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v))
    invalid('SHAPE_INVALID');
  const actual = Object.keys(v);
  if (actual.length !== keys.length || actual.some((k) => !keys.includes(k)))
    invalid('SHAPE_INVALID');
  return v as Record<string, unknown>;
}
function text(v: unknown, max = 512): string {
  if (
    typeof v !== 'string' ||
    v.length === 0 ||
    v.length > max ||
    !/^[A-Za-z0-9_.:/-]+$/u.test(v) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(v) ||
    ['UNKNOWN', 'NOT_SUPPLIED', 'SUPPLIER_UNCONFIRMED'].includes(v)
  )
    invalid('SHAPE_INVALID');
  return v;
}
function hex(v: unknown, length: number): void {
  if (typeof v !== 'string' || v.length !== length || !/^[0-9a-f]+$/u.test(v))
    invalid('SHAPE_INVALID');
}
function integer(v: unknown, positive = false): void {
  if (
    typeof v !== 'string' ||
    v.length > 128 ||
    !(positive ? /^[1-9]\d*$/u : /^(0|[1-9]\d*)$/u).test(v)
  )
    invalid('SHAPE_INVALID');
}
function strings(r: Record<string, unknown>, keys: readonly string[]): void {
  for (const k of keys) text(r[k]);
}
function parse(
  value: unknown,
  expected: boolean,
):
  | IndustryCompatibilityEvidenceInput
  | IndustryCompatibilityEvidenceExpectation {
  const owned = snapshot(value);
  const r = record(owned, rootKeys);
  if (
    r.schemaVersion !==
    (expected
      ? 'industry-compatibility-evidence-expectation-v1'
      : 'industry-compatibility-evidence-input-v1')
  )
    invalid('SHAPE_INVALID');
  strings(record(r.target, targetKeys), targetKeys);
  const pub = record(
    r.publisher,
    expected ? publisherKeys : [...publisherKeys, 'outcome'],
  );
  if (!expected && pub.outcome !== 'APPLIED')
    invalid('PUBLICATION_OUTCOME_INVALID');
  strings(
    pub,
    publisherKeys.filter(
      (k) =>
        ![
          'runId',
          'jobId',
          'workflowCommit',
          'policyCommit',
          'responseSHA256',
        ].includes(k),
    ),
  );
  text(pub.workflowPath, 256);
  hex(pub.workflowCommit, 40);
  hex(pub.policyCommit, 40);
  hex(pub.responseSHA256, 64);
  integer(pub.runId, true);
  integer(pub.jobId, true);
  const build = record(r.build, buildKeys);
  hex(build.constructorSourceCommit, 40);
  hex(build.constructorBlobSHA256, 64);
  hex(build.decoderBuildSHA256, 64);
  if (build.decoderProtocol !== 'industry-production-decoder-v1')
    invalid('BUILD_MISMATCH');
  const ledger = record(r.releaseLedger, [
    'observationRef',
    'revision',
    'rows',
  ]);
  strings(ledger, ['observationRef', 'revision']);
  if (!Array.isArray(ledger.rows) || ledger.rows.length !== 23)
    invalid('RELEASE_CHAIN_MISMATCH');
  const ids = new Set<string>();
  for (const [i, value] of ledger.rows.entries()) {
    const row = record(value, [
      'migration_id',
      'artifact_sha256',
      'source_repo_commit',
      'release_order',
    ]);
    const id = text(row.migration_id);
    if (ids.has(id) || row.release_order !== i + 1)
      invalid('RELEASE_CHAIN_MISMATCH');
    ids.add(id);
    hex(row.artifact_sha256, 64);
    hex(row.source_repo_commit, 40);
  }
  // Before any private audit conversion, establish the exact source chain.
  if (
    pub.policyCommit !== POLICY_COMMIT ||
    policyRowsHash(ledger.rows as unknown as readonly ReleaseRow[]) !==
      POLICY_ROWS_SHA256
  )
    invalid('RELEASE_CHAIN_MISMATCH');
  const catalog = record(r.catalog, [
    'observationRef',
    'revision',
    'protocolVersion',
    'postgresBuild',
    'objects',
  ]);
  strings(catalog, ['observationRef', 'revision']);
  text(catalog.protocolVersion, 128);
  text(catalog.postgresBuild, 128);
  if (
    !Array.isArray(catalog.objects) ||
    catalog.objects.length === 0 ||
    catalog.objects.length > 64
  )
    invalid('CATALOG_MISMATCH');
  const objects = new Set<string>();
  for (const value of catalog.objects) {
    const row = record(value, [
      'objectId',
      'kind',
      'attachment',
      'enabledMode',
      'deferredMode',
      'normalizedDefinition',
    ]);
    strings(row, [
      'objectId',
      'kind',
      'attachment',
      'enabledMode',
      'deferredMode',
    ]);
    if (objects.has(text(row.objectId))) invalid('CATALOG_MISMATCH');
    objects.add(text(row.objectId));
    if (
      typeof row.normalizedDefinition !== 'string' ||
      row.normalizedDefinition.length === 0
    )
      invalid('SHAPE_INVALID');
  }
  const admission = record(
    r.admission,
    expected ? admissionKeys : [...admissionKeys, 'disposition'],
  );
  if (!expected && admission.disposition !== 'ADMITTED')
    invalid('ADMISSION_NOT_CURRENT');
  strings(
    admission,
    admissionKeys.filter(
      (k) => !['constructorBlobSHA256', 'decoderBuildSHA256'].includes(k),
    ),
  );
  hex(admission.constructorBlobSHA256, 64);
  hex(admission.decoderBuildSHA256, 64);
  const scope = record(r.checkedFor, [
    'worldId',
    'commandId',
    'commandFingerprint',
    'head',
    'simTime',
  ]);
  integer(scope.simTime);
  if (
    typeof scope.commandFingerprint !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/u.test(scope.commandFingerprint)
  )
    invalid('CUTOFF_MISMATCH');
  try {
    worldId(text(scope.worldId));
    commandId(text(scope.commandId));
    SimTime.fromTicks(scope.simTime as string);
  } catch {
    invalid('CUTOFF_MISMATCH');
  }
  const head = record(scope.head, ['worldVersion', 'eventSequence']);
  integer(head.worldVersion);
  integer(head.eventSequence);
  strings(record(r.guards, guardKeys), guardKeys);
  const typed = owned as
    | IndustryCompatibilityEvidenceInput
    | IndustryCompatibilityEvidenceExpectation;
  if (
    Buffer.byteLength(
      canonicalSerialize(auditImage('EVIDENCE', typed)),
      'utf8',
    ) > MAX_BYTES
  )
    invalid('CAP_EXCEEDED');
  return typed;
}

// Only this already-validated source JSON integer path has a string audit image.
// Never normalize arbitrary numbers or alter the original/parsed release rows.
function auditRows(rows: readonly ReleaseRow[]) {
  return rows.map((row) => ({
    ...row,
    release_order: row.release_order.toString(),
  }));
}
function auditImage(
  kind: 'EVIDENCE' | 'RELEASE_LEDGER' | 'CATALOG',
  input:
    | IndustryCompatibilityEvidenceInput
    | IndustryCompatibilityEvidenceExpectation,
) {
  const value =
    kind === 'EVIDENCE'
      ? {
          ...input,
          releaseLedger: {
            ...input.releaseLedger,
            rows: auditRows(input.releaseLedger.rows),
          },
        }
      : kind === 'RELEASE_LEDGER'
        ? auditRows(input.releaseLedger.rows)
        : {
            protocolVersion: input.catalog.protocolVersion,
            postgresBuild: input.catalog.postgresBuild,
            objects: input.catalog.objects,
          };
  return {
    schemaVersion: 'industry-compatibility-audit-image-v1',
    kind,
    value,
  };
}
function policyRowsHash(rows: readonly ReleaseRow[]): string {
  return sha(
    JSON.stringify(
      rows.map((r) => ({
        migration_id: r.migration_id,
        artifact_sha256: r.artifact_sha256,
        source_repo_commit: r.source_repo_commit,
        release_order: r.release_order,
      })),
    ),
  );
}
function same(a: unknown, b: unknown, reason: Reason): void {
  if (canonicalSerialize(a) !== canonicalSerialize(b)) invalid(reason);
}

/** Owned inert parsed data. APPLIED/ADMITTED strings are NOT authenticated. */
export function parseIndustryCompatibilityEvidenceInput(
  value: unknown,
): Readonly<IndustryCompatibilityEvidenceInput> {
  return parse(value, false) as IndustryCompatibilityEvidenceInput;
}

/** The expectation is server-owned comparison DATA, never an authority token. */
export function bindIndustryCompatibilityEvidenceInput(
  value: unknown,
  expected: Readonly<IndustryCompatibilityEvidenceExpectation>,
): Readonly<IndustryCompatibilityEvidenceBinding> {
  const input = parseIndustryCompatibilityEvidenceInput(value);
  const exp = parse(expected, true) as IndustryCompatibilityEvidenceExpectation;
  for (const v of [input, exp]) {
    if (
      v.publisher.policyCommit !== POLICY_COMMIT ||
      policyRowsHash(v.releaseLedger.rows) !== POLICY_ROWS_SHA256
    )
      invalid('RELEASE_CHAIN_MISMATCH');
    same(
      v.target,
      {
        targetDeploymentRef: v.admission.targetDeploymentRef,
        databaseIdentityRef: v.admission.databaseIdentityRef,
      },
      'TARGET_MISMATCH',
    );
    if (
      v.admission.publisherEvidenceRevision !==
      v.publisher.publisherEvidenceRevision
    )
      invalid('REVISION_MISMATCH');
    if (
      v.admission.constructorBlobSHA256 !== v.build.constructorBlobSHA256 ||
      v.admission.decoderBuildSHA256 !== v.build.decoderBuildSHA256
    )
      invalid('BUILD_MISMATCH');
  }
  same(input.target, exp.target, 'TARGET_MISMATCH');
  const publisher = Object.fromEntries(
    Object.entries(input.publisher).filter(([key]) => key !== 'outcome'),
  );
  same(publisher, exp.publisher, 'REVISION_MISMATCH');
  same(input.build, exp.build, 'BUILD_MISMATCH');
  same(
    {
      observationRef: input.releaseLedger.observationRef,
      revision: input.releaseLedger.revision,
    },
    {
      observationRef: exp.releaseLedger.observationRef,
      revision: exp.releaseLedger.revision,
    },
    'REVISION_MISMATCH',
  );
  same(input.catalog, exp.catalog, 'CATALOG_MISMATCH');
  const admission = Object.fromEntries(
    Object.entries(input.admission).filter(([key]) => key !== 'disposition'),
  );
  same(admission, exp.admission, 'ADMISSION_NOT_CURRENT');
  same(input.checkedFor, exp.checkedFor, 'CUTOFF_MISMATCH');
  same(input.guards, exp.guards, 'GUARD_MAPPING_MISMATCH');
  const digest = (kind: 'EVIDENCE' | 'RELEASE_LEDGER' | 'CATALOG') =>
    sha(canonicalSerialize(auditImage(kind, input)));
  return snapshot({
    schemaVersion: 'industry-compatibility-data-binding-v1',
    status: 'DATA_BINDING_MATCH_NOT_AUTHENTICATED',
    productionAuthority: false,
    sourceAdmitted: false,
    runtimeConnected: false,
    evidenceSHA256: digest('EVIDENCE'),
    checkedFor: input.checkedFor,
    observation: {
      schemaVersion: 'industry-compatibility-observation-v1',
      targetDeploymentRef: input.target.targetDeploymentRef,
      databaseIdentityRef: input.target.databaseIdentityRef,
      publisherEvidenceRef: input.publisher.publisherEvidenceRef,
      publisherEvidenceRevision: input.publisher.publisherEvidenceRevision,
      admissionDecisionRef: input.admission.decisionRef,
      admissionRevision: input.admission.revision,
      releaseLedgerObservationHash: digest('RELEASE_LEDGER'),
      catalogContractVersion: input.catalog.protocolVersion,
      catalogObservationHash: digest('CATALOG'),
      checkedCommandFingerprint: input.checkedFor.commandFingerprint,
      checkedHead: input.checkedFor.head,
    },
  }) as IndustryCompatibilityEvidenceBinding;
}
