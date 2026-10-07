import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  workerId,
  worldId,
  WORLD_MODEL_VERSION,
  type CanonicalSha256,
  type WorldWriterLease,
} from '@econmind/core';
import type {
  HttpsReadCompositionConfig,
  ServerVerifiedReadBinding,
} from './https-authenticated-read-composition.js';
import type { JwtClaimsPolicy } from './identity.js';
import type { ApiRuntimeConfig } from '../runtime.js';

export const PRODUCTION_RUNTIME_BINDING_SCHEMA =
  'production-runtime-binding-consistency-v1' as const;

/** Evidence identities only. This is neither an admission nor a Core lease. */
export interface RuntimeBindingIdentity {
  readonly world: HttpsReadCompositionConfig['admittedWorldPins'];
  readonly sourceManifestHash: CanonicalSha256;
  readonly modelVersion: ServerVerifiedReadBinding['identity']['modelVersion'];
  readonly orchestratorVersion: string;
  readonly orchestratorBuildHash: CanonicalSha256;
  readonly releaseCommit: string;
}
export const RUNTIME_BINDING_EVIDENCE_KINDS = Object.freeze({
  frontendPublication: 'GITHUB_PAGES_PUBLICATION_REFERENCE',
  approvedHost: 'HOST_APPROVAL_REFERENCE',
  apiDeployment: 'HTTPS_API_DEPLOYMENT_REFERENCE',
  workerDeployment: 'SEPARATE_WORKER_DEPLOYMENT_REFERENCE',
  databaseBinding: 'DATABASE_PROJECT_REFERENCE',
  authPolicy: 'AUTH_POLICY_REFERENCE',
  sessionCurrent: 'SERVER_CURRENT_SESSION_AND_SEAT_REFERENCE',
  worldReadback: 'ADMITTED_WORLD_READBACK_REFERENCE',
  workerLease: 'WRITER_LEASE_REFERENCE',
  workerLifecycle: 'WORKER_LIFECYCLE_REFERENCE',
} as const);
type EvidenceField = keyof typeof RUNTIME_BINDING_EVIDENCE_KINDS;

export interface ProductionRuntimeBindingManifest {
  readonly schemaVersion: typeof PRODUCTION_RUNTIME_BINDING_SCHEMA;
  readonly environment: ApiRuntimeConfig['environment'] &
    ('staging' | 'production');
  /** This source-only preparation cannot authorize simulation. */
  readonly simulationEnabled: false;
  readonly binding: RuntimeBindingIdentity;
  readonly frontend: {
    readonly kind: 'GITHUB_PAGES';
    readonly url: string;
    readonly buildHash: CanonicalSha256;
    readonly releaseCommit: string;
  };
  readonly api: {
    readonly endpoints: HttpsReadCompositionConfig['endpointPins'];
    readonly buildHash: CanonicalSha256;
    readonly releaseCommit: string;
  };
  readonly worker: {
    readonly kind: 'SEPARATE_WORKER_EXECUTABLE';
    readonly executable: 'apps/world-worker/dist/main.js';
    readonly targetRef: string;
    readonly buildHash: CanonicalSha256;
    readonly releaseCommit: string;
  };
  readonly database: {
    readonly projectRef: string;
    readonly environment: 'staging' | 'production';
    readonly fingerprint: string;
    readonly namespace: 'world_v2';
  };
  readonly auth: Pick<
    JwtClaimsPolicy,
    'expectedIssuer' | 'expectedAudience'
  > & {
    readonly projectRef: string;
    readonly verifierBuildHash: CanonicalSha256;
  };
  readonly session: {
    readonly providerRef: string;
    readonly sessionRef: string;
    readonly currentSeatReadbackRef: string;
    readonly lifetimeRef: string;
  };
  readonly readback: ServerVerifiedReadBinding['readback'];
  readonly lifecycle: Pick<
    WorldWriterLease,
    'worldId' | 'holderId' | 'fencingToken'
  > & {
    readonly phase: 'RUNNING';
    readonly leaseRef: string;
    readonly lifecycleRef: string;
    readonly observedAtReal: string;
    readonly expiresAtReal: string;
  };
  readonly evidenceRefs: Readonly<Record<EvidenceField, CanonicalSha256>>;
}

/**
 * A reference inventory supplied by a later evidence reader. Neither its tags
 * nor its hashes authenticate an artifact, host, session, deployment or lease.
 * Local receipts and approved:true are deliberately outside this schema.
 */
export interface RuntimeBindingEvidenceRecord {
  readonly ref: CanonicalSha256;
  readonly kind: (typeof RUNTIME_BINDING_EVIDENCE_KINDS)[EvidenceField];
  readonly provenance: 'EXTERNAL_REFERENCE_ONLY';
  readonly binding: RuntimeBindingIdentity;
  readonly pins: Readonly<Record<string, unknown>>;
}
export interface RuntimeBindingDiagnostic {
  readonly field: string;
  readonly code:
    | 'MISSING_FIELD'
    | 'INVALID_FIELD'
    | 'UNKNOWN_FIELD'
    | 'INCONSISTENT_BINDING'
    | 'MISSING_EVIDENCE'
    | 'UNSUPPORTED_EVIDENCE'
    | 'DUPLICATE_EVIDENCE'
    | 'SIMULATION_ACTIVATION_FORBIDDEN';
}
export interface RuntimeBindingConsistencyResult {
  readonly schemaVersion: typeof PRODUCTION_RUNTIME_BINDING_SCHEMA;
  readonly status: 'BLOCKED' | 'BINDING_CONSISTENCY_CHECKED';
  readonly evidenceVerification: 'NOT_PERFORMED';
  readonly runtimeReady: false;
  readonly simulationEnabled: false;
  readonly authorizationGranted: false;
  readonly workerActivationAllowed: false;
  readonly diagnostics: readonly RuntimeBindingDiagnostic[];
  readonly manifest: Readonly<ProductionRuntimeBindingManifest> | null;
  /** Integrity fingerprint of supplied references, never a deployment receipt. */
  readonly snapshotHash: CanonicalSha256 | null;
  readonly canonicalSnapshot: string | null;
}

type Check = (value: unknown, path: string) => void;
type Shape = Readonly<Record<string, Check>>;
const hash = (v: unknown) =>
  typeof v === 'string' && /^sha256:[0-9a-f]{64}$/u.test(v);
const text = (v: unknown) =>
  typeof v === 'string' && v.length > 0 && v.length <= 256 && v.trim() === v;
const id = (v: unknown) =>
  typeof v === 'string' &&
  /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(v) &&
  v.length <= 256;
const version = (v: unknown) =>
  typeof v === 'string' &&
  /^(?:0|[1-9]\d*)$/u.test(v) &&
  v.length <= 19 &&
  BigInt(v) <= 9223372036854775807n;
const commit = (v: unknown) =>
  typeof v === 'string' && /^[0-9a-f]{40}$/u.test(v);
const time = (v: unknown) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
function https(v: unknown, originOnly = false): boolean {
  if (!text(v)) return false;
  try {
    const u = new URL(v as string);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      !/^(?:localhost(?:\.|$)|127\.|0\.|\[::1\]$)/u.test(u.hostname) &&
      !/^\[::ffff:7f[0-9a-f]{2}:/u.test(u.hostname) &&
      u.hostname !== '[::]' &&
      !u.hostname.endsWith('.localhost') &&
      (originOnly ? u.origin === v : u.href === v)
    );
  } catch {
    return false;
  }
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Pure, offline consistency inspection; no IO, ambient config or grants. */
export function checkProductionRuntimeBinding(
  input: unknown,
  evidenceRecords: unknown = null,
): Readonly<RuntimeBindingConsistencyResult> {
  const diagnostics: RuntimeBindingDiagnostic[] = [];
  const fail = (
    field: string,
    code: RuntimeBindingDiagnostic['code'] = 'INVALID_FIELD',
  ) => {
    diagnostics.push({ field, code });
  };
  const result = (
    manifest: ProductionRuntimeBindingManifest | null,
    snapshot: string | null,
  ): RuntimeBindingConsistencyResult =>
    freeze({
      schemaVersion: PRODUCTION_RUNTIME_BINDING_SCHEMA,
      status: diagnostics.length ? 'BLOCKED' : 'BINDING_CONSISTENCY_CHECKED',
      evidenceVerification: 'NOT_PERFORMED',
      runtimeReady: false,
      simulationEnabled: false,
      authorizationGranted: false,
      workerActivationAllowed: false,
      diagnostics,
      manifest,
      snapshotHash:
        snapshot === null
          ? null
          : (`sha256:${createHash('sha256').update(snapshot).digest('hex')}` as CanonicalSha256),
      canonicalSnapshot: snapshot,
    });
  function inert(value: unknown, field: string): unknown {
    try {
      const encoded = canonicalSerialize(value);
      if (Buffer.byteLength(encoded) > 262144) throw new Error('LIMIT');
      return JSON.parse(encoded) as unknown;
    } catch {
      fail(field);
      return null;
    }
  }
  const leaf =
    (predicate: (v: unknown) => boolean): Check =>
    (v, p) => {
      if (!predicate(v)) fail(p);
    };
  const literal = (expected: string): Check => leaf((v) => v === expected);
  const object =
    (shape: Shape): Check =>
    (v, p) => {
      const r = record(v);
      if (!r) {
        fail(
          p,
          v === null || v === undefined ? 'MISSING_FIELD' : 'INVALID_FIELD',
        );
        return;
      }
      for (const k of Object.keys(r))
        if (!Object.hasOwn(shape, k)) fail(`${p}.${k}`, 'UNKNOWN_FIELD');
      for (const [k, check] of Object.entries(shape)) {
        if (!Object.hasOwn(r, k) || r[k] === null)
          fail(`${p}.${k}`, 'MISSING_FIELD');
        else check(r[k], `${p}.${k}`);
      }
    };
  const canonicalId: Check = leaf(id),
    sha: Check = leaf(hash),
    str: Check = leaf(text),
    ver: Check = leaf(version),
    git: Check = leaf(commit);
  const world = {
    worldId: leaf((v) => {
      try {
        worldId(v as string);
        return true;
      } catch {
        return false;
      }
    }),
    seedRef: canonicalId,
    contentHash: sha,
    admissionRef: canonicalId,
  };
  const identity: Shape = {
    world: object({ ...world, minimumWorldVersion: ver }),
    sourceManifestHash: sha,
    modelVersion: literal(WORLD_MODEL_VERSION),
    orchestratorVersion: str,
    orchestratorBuildHash: sha,
    releaseCommit: git,
  };
  const environment = leaf((v) => v === 'staging' || v === 'production');
  const build = { buildHash: sha, releaseCommit: git };
  const path = leaf(
    (v) =>
      typeof v === 'string' &&
      /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/u.test(v) &&
      v.length <= 256 &&
      !v.startsWith('/local/'),
  );
  const normalized = inert(input, 'manifest');
  object({
    schemaVersion: literal(PRODUCTION_RUNTIME_BINDING_SCHEMA),
    environment,
    simulationEnabled: (v, p) => {
      if (v !== false) fail(p, 'SIMULATION_ACTIVATION_FORBIDDEN');
    },
    binding: object(identity),
    frontend: object({
      kind: literal('GITHUB_PAGES'),
      url: leaf((v) => https(v)),
      ...build,
    }),
    api: object({
      endpoints: object({
        origin: leaf((v) => https(v, true)),
        projectionPath: path,
        finalLookupPath: path,
        deploymentRef: canonicalId,
      }),
      ...build,
    }),
    worker: object({
      kind: literal('SEPARATE_WORKER_EXECUTABLE'),
      executable: literal('apps/world-worker/dist/main.js'),
      targetRef: leaf((v) => id(v) && v !== 'GITHUB_PAGES'),
      ...build,
    }),
    database: object({
      projectRef: str,
      environment,
      fingerprint: str,
      namespace: literal('world_v2'),
    }),
    auth: object({
      expectedIssuer: leaf((v) => https(v)),
      expectedAudience: str,
      projectRef: str,
      verifierBuildHash: sha,
    }),
    session: object({
      providerRef: canonicalId,
      sessionRef: canonicalId,
      currentSeatReadbackRef: canonicalId,
      lifetimeRef: canonicalId,
    }),
    readback: object({
      ...world,
      worldVersion: ver,
      eventSequence: ver,
      readbackRef: canonicalId,
    }),
    lifecycle: object({
      worldId: world.worldId!,
      holderId: leaf((v) => {
        try {
          workerId(v as string);
          return true;
        } catch {
          return false;
        }
      }),
      fencingToken: leaf((v) => version(v) && v !== '0'),
      phase: literal('RUNNING'),
      leaseRef: canonicalId,
      lifecycleRef: canonicalId,
      observedAtReal: leaf(time),
      expiresAtReal: leaf(time),
    }),
    evidenceRefs: object(
      Object.fromEntries(
        Object.keys(RUNTIME_BINDING_EVIDENCE_KINDS).map((k) => [k, sha]),
      ),
    ),
  })(normalized, 'manifest');
  const invalidManifest = diagnostics.length > 0;
  // Missing external inventories are named even if no complete proposal exists.
  const missingInventory =
    evidenceRecords === null || evidenceRecords === undefined;
  if (missingInventory) {
    for (const k of Object.keys(RUNTIME_BINDING_EVIDENCE_KINDS))
      fail(`manifest.evidenceRefs.${k}`, 'MISSING_EVIDENCE');
  }
  if (invalidManifest) return result(null, null);
  const m = normalized as ProductionRuntimeBindingManifest;
  const equal = (a: unknown, b: unknown, p: string) => {
    if (canonicalSerialize(a) !== canonicalSerialize(b))
      fail(p, 'INCONSISTENT_BINDING');
  };
  for (const k of ['frontend', 'api', 'worker'] as const)
    equal(
      m[k].releaseCommit,
      m.binding.releaseCommit,
      `manifest.${k}.releaseCommit`,
    );
  equal(m.database.environment, m.environment, 'manifest.database.environment');
  equal(
    m.database.fingerprint,
    `world-v2-${m.environment}`,
    'manifest.database.fingerprint',
  );
  equal(m.auth.projectRef, m.database.projectRef, 'manifest.auth.projectRef');
  for (const k of [
    'worldId',
    'seedRef',
    'contentHash',
    'admissionRef',
  ] as const)
    equal(m.readback[k], m.binding.world[k], `manifest.readback.${k}`);
  equal(
    m.lifecycle.worldId,
    m.binding.world.worldId,
    'manifest.lifecycle.worldId',
  );
  if (
    BigInt(m.readback.worldVersion) <
    BigInt(m.binding.world.minimumWorldVersion)
  )
    fail('manifest.readback.worldVersion', 'INCONSISTENT_BINDING');
  if (m.lifecycle.observedAtReal >= m.lifecycle.expiresAtReal)
    fail('manifest.lifecycle.expiresAtReal', 'INCONSISTENT_BINDING');
  if (m.api.endpoints.projectionPath === m.api.endpoints.finalLookupPath)
    fail('manifest.api.endpoints.finalLookupPath', 'INCONSISTENT_BINDING');
  const apiHost = new URL(m.api.endpoints.origin).hostname;
  if (
    apiHost === 'github.io' ||
    apiHost.endsWith('.github.io') ||
    new URL(m.frontend.url).origin === m.api.endpoints.origin
  )
    fail('manifest.api.endpoints.origin', 'INCONSISTENT_BINDING');
  if (missingInventory) return result(null, null);
  const inventory = inert(evidenceRecords, 'evidenceRecords');
  if (!Array.isArray(inventory) || inventory.length > 32) {
    fail('evidenceRecords');
    return result(null, null);
  }
  const indexed = new Map<string, RuntimeBindingEvidenceRecord>();
  for (const [i, item] of inventory.entries()) {
    const p = `evidenceRecords[${i}]`;
    const before = diagnostics.length;
    object({
      ref: sha,
      kind: leaf((v) =>
        Object.values(RUNTIME_BINDING_EVIDENCE_KINDS).includes(
          v as RuntimeBindingEvidenceRecord['kind'],
        ),
      ),
      provenance: (v, path) => {
        if (v !== 'EXTERNAL_REFERENCE_ONLY') fail(path, 'UNSUPPORTED_EVIDENCE');
      },
      binding: object(identity),
      pins: leaf((v) => record(v) !== null),
    })(item, p);
    if (before !== diagnostics.length) continue;
    const e = item as RuntimeBindingEvidenceRecord;
    if (indexed.has(e.ref)) fail(`${p}.ref`, 'DUPLICATE_EVIDENCE');
    else indexed.set(e.ref, e);
  }
  const leasePins = {
    worldId: m.lifecycle.worldId,
    holderId: m.lifecycle.holderId,
    fencingToken: m.lifecycle.fencingToken,
    leaseRef: m.lifecycle.leaseRef,
    observedAtReal: m.lifecycle.observedAtReal,
    expiresAtReal: m.lifecycle.expiresAtReal,
  };
  const expectedPins: Record<EvidenceField, unknown> = {
    frontendPublication: m.frontend,
    approvedHost: {
      apiOrigin: m.api.endpoints.origin,
      workerTargetRef: m.worker.targetRef,
      environment: m.environment,
    },
    apiDeployment: m.api,
    workerDeployment: m.worker,
    databaseBinding: m.database,
    authPolicy: m.auth,
    sessionCurrent: m.session,
    worldReadback: m.readback,
    workerLease: leasePins,
    workerLifecycle: m.lifecycle,
  };
  for (const [key, kind] of Object.entries(RUNTIME_BINDING_EVIDENCE_KINDS)) {
    const k = key as EvidenceField,
      e = indexed.get(m.evidenceRefs[k]),
      p = `manifest.evidenceRefs.${k}`;
    if (!e) {
      fail(p, 'MISSING_EVIDENCE');
      continue;
    }
    equal(e.kind, kind, `${p}.kind`);
    equal(e.binding, m.binding, `${p}.binding`);
    equal(e.pins, expectedPins[k], `${p}.pins`);
  }
  const used = new Set(Object.values(m.evidenceRefs));
  for (const ref of indexed.keys())
    if (!used.has(ref as CanonicalSha256))
      fail('evidenceRecords.ref', 'UNSUPPORTED_EVIDENCE');
  if (diagnostics.length) return result(null, null);
  const snapshot = canonicalSerialize({
    manifest: m,
    evidenceRecords: [...indexed.values()].sort((a, b) =>
      a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0,
    ),
  });
  return result(m, snapshot);
}
