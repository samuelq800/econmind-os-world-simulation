import { describe, expect, it } from 'vitest';
import {
  workerId,
  worldId,
  WORLD_MODEL_VERSION,
  type CanonicalSha256,
} from '@econmind/core';
import {
  checkProductionRuntimeBinding,
  PRODUCTION_RUNTIME_BINDING_SCHEMA,
  RUNTIME_BINDING_EVIDENCE_KINDS,
  type ProductionRuntimeBindingManifest,
  type RuntimeBindingEvidenceRecord,
} from '../../apps/world-api/src/integration/production-runtime-binding.js';

// OFFLINE TEST_ONLY: references and .invalid hosts below are invented mechanism
// fixtures. None is an actual approval, session, admission, deployment or lease.
const sha = (n: number) =>
  `sha256:${n.toString(16).padStart(64, '0')}` as CanonicalSha256;
function fixture() {
  const m: ProductionRuntimeBindingManifest = {
    schemaVersion: PRODUCTION_RUNTIME_BINDING_SCHEMA,
    environment: 'production',
    simulationEnabled: false,
    binding: {
      world: {
        worldId: worldId('TEST_WORLD'),
        seedRef: 'TEST_SEED',
        contentHash: sha(1),
        admissionRef: 'TEST_ADMISSION',
        minimumWorldVersion: '2',
      },
      sourceManifestHash: sha(2),
      modelVersion: WORLD_MODEL_VERSION,
      orchestratorVersion: 'TEST_ORCHESTRATOR_VERSION',
      orchestratorBuildHash: sha(3),
      releaseCommit: 'a'.repeat(40),
    },
    frontend: {
      kind: 'GITHUB_PAGES',
      url: 'https://test-pages.example.invalid/world/',
      buildHash: sha(4),
      releaseCommit: 'a'.repeat(40),
    },
    api: {
      endpoints: {
        origin: 'https://test-api.example.invalid',
        projectionPath: '/v1/world-read',
        finalLookupPath: '/v1/final-receipt',
        deploymentRef: 'TEST_API_DEPLOYMENT',
      },
      buildHash: sha(5),
      releaseCommit: 'a'.repeat(40),
    },
    worker: {
      kind: 'SEPARATE_WORKER_EXECUTABLE',
      executable: 'apps/world-worker/dist/main.js',
      targetRef: 'TEST_WORKER_HOST',
      buildHash: sha(6),
      releaseCommit: 'a'.repeat(40),
    },
    database: {
      projectRef: 'test-project-reference',
      environment: 'production',
      fingerprint: 'world-v2-production',
      namespace: 'world_v2',
    },
    auth: {
      expectedIssuer: 'https://test-auth.example.invalid/auth/v1',
      expectedAudience: 'TEST_AUDIENCE',
      projectRef: 'test-project-reference',
      verifierBuildHash: sha(7),
    },
    session: {
      providerRef: 'TEST_PROVIDER',
      sessionRef: 'TEST_SESSION',
      currentSeatReadbackRef: 'TEST_CURRENT_SEAT',
      lifetimeRef: 'TEST_LIFETIME',
    },
    readback: {
      worldId: 'TEST_WORLD',
      seedRef: 'TEST_SEED',
      contentHash: sha(1),
      admissionRef: 'TEST_ADMISSION',
      worldVersion: '3',
      eventSequence: '4',
      readbackRef: 'TEST_READBACK',
    },
    lifecycle: {
      worldId: worldId('TEST_WORLD'),
      holderId: workerId('TEST_WORKER'),
      fencingToken: '2',
      phase: 'RUNNING',
      leaseRef: 'TEST_LEASE',
      lifecycleRef: 'TEST_LIFECYCLE',
      observedAtReal: '2026-10-07T00:00:00.000Z',
      expiresAtReal: '2026-10-07T00:01:00.000Z',
    },
    evidenceRefs: {
      frontendPublication: sha(11),
      approvedHost: sha(12),
      apiDeployment: sha(13),
      workerDeployment: sha(14),
      databaseBinding: sha(15),
      authPolicy: sha(16),
      sessionCurrent: sha(17),
      worldReadback: sha(18),
      workerLease: sha(19),
      workerLifecycle: sha(20),
    },
  };
  const pins: Record<
    keyof typeof RUNTIME_BINDING_EVIDENCE_KINDS,
    Record<string, unknown>
  > = {
    frontendPublication: { ...m.frontend },
    approvedHost: {
      apiOrigin: m.api.endpoints.origin,
      workerTargetRef: m.worker.targetRef,
      environment: m.environment,
    },
    apiDeployment: { ...m.api },
    workerDeployment: { ...m.worker },
    databaseBinding: { ...m.database },
    authPolicy: { ...m.auth },
    sessionCurrent: { ...m.session },
    worldReadback: { ...m.readback },
    workerLease: {
      worldId: 'TEST_WORLD',
      holderId: 'TEST_WORKER',
      fencingToken: '2',
      leaseRef: 'TEST_LEASE',
      observedAtReal: '2026-10-07T00:00:00.000Z',
      expiresAtReal: '2026-10-07T00:01:00.000Z',
    },
    workerLifecycle: { ...m.lifecycle },
  };
  const records: RuntimeBindingEvidenceRecord[] = Object.entries(
    RUNTIME_BINDING_EVIDENCE_KINDS,
  ).map(([key, kind]) => {
    const k = key as keyof typeof RUNTIME_BINDING_EVIDENCE_KINDS;
    return {
      ref: m.evidenceRefs[k],
      kind,
      provenance: 'EXTERNAL_REFERENCE_ONLY',
      binding: structuredClone(m.binding),
      pins: pins[k],
    };
  });
  return { m, records };
}
function change(input: unknown, path: string, value: unknown) {
  const keys = path.split('.'),
    last = keys.pop()!;
  let cursor = input as Record<string, unknown>;
  for (const key of keys) cursor = cursor[key] as Record<string, unknown>;
  cursor[last] = value;
}
function blocked(m: unknown, records: unknown, field: string) {
  const r = checkProductionRuntimeBinding(m, records);
  expect(r).toMatchObject({
    status: 'BLOCKED',
    manifest: null,
    snapshotHash: null,
    runtimeReady: false,
    simulationEnabled: false,
    authorizationGranted: false,
    workerActivationAllowed: false,
    evidenceVerification: 'NOT_PERFORMED',
  });
  expect(r.diagnostics.some((d) => d.field === field)).toBe(true);
  return r;
}

describe('API-owned runtime binding consistency / OFFLINE TEST_ONLY', () => {
  it('checks explicit reference consistency only and never grants operational authority', () => {
    const { m, records } = fixture(),
      r = checkProductionRuntimeBinding(m, records);
    expect(r).toMatchObject({
      status: 'BINDING_CONSISTENCY_CHECKED',
      evidenceVerification: 'NOT_PERFORMED',
      runtimeReady: false,
      simulationEnabled: false,
      authorizationGranted: false,
      workerActivationAllowed: false,
      diagnostics: [],
    });
    expect(r.manifest).toEqual(m);
    expect(r.snapshotHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(JSON.parse(r.canonicalSnapshot!)).toHaveProperty('evidenceRecords');
    expect(Object.keys(r)).not.toContain('capability');
  });
  it('deep-freezes a detached snapshot and gives record-order-independent integrity hashes', () => {
    const { m, records } = fixture(),
      r = checkProductionRuntimeBinding(m, records);
    expect(
      checkProductionRuntimeBinding(m, [...records].reverse()).snapshotHash,
    ).toBe(r.snapshotHash);
    expect(Object.isFrozen(r.manifest?.binding.world)).toBe(true);
    change(m, 'api.endpoints.origin', 'https://changed.example.invalid');
    change(records, '0.binding.world.seedRef', 'OTHER_SEED');
    expect(r.manifest?.api.endpoints.origin).toBe(
      'https://test-api.example.invalid',
    );
    expect(r.manifest?.binding.world.seedRef).toBe('TEST_SEED');
    expect(() =>
      change(r.manifest, 'worker.targetRef', 'OTHER_HOST'),
    ).toThrow();
  });
  it('reports each absent external host/provider/session/readback/deployment/lease reference', () => {
    const { m } = fixture(),
      r = checkProductionRuntimeBinding(m);
    expect(r.status).toBe('BLOCKED');
    expect(r.diagnostics).toEqual(
      Object.keys(RUNTIME_BINDING_EVIDENCE_KINDS).map((k) => ({
        field: `manifest.evidenceRefs.${k}`,
        code: 'MISSING_EVIDENCE',
      })),
    );
    expect(checkProductionRuntimeBinding(m, []).diagnostics).toEqual(
      r.diagnostics,
    );
  });
  it.each(Object.keys(RUNTIME_BINDING_EVIDENCE_KINDS))(
    'does not accept a manifest ref without the corresponding record: %s',
    (key) => {
      const { m, records } = fixture(),
        k = key as keyof typeof RUNTIME_BINDING_EVIDENCE_KINDS;
      blocked(
        m,
        records.filter((r) => r.ref !== m.evidenceRefs[k]),
        `manifest.evidenceRefs.${key}`,
      );
    },
  );
  it.each([
    ['api.endpoints.origin', 'http://test-api.example.invalid'],
    ['api.endpoints.origin', 'https://127.0.0.2'],
    ['api.endpoints.origin', 'https://[::1]'],
    ['api.endpoints.origin', 'https://[::ffff:127.0.0.1]'],
    ['api.endpoints.origin', 'https://[::]'],
    ['api.endpoints.origin', 'https://localhost'],
    ['api.endpoints.origin', 'https://api.localhost'],
    ['api.endpoints.origin', 'https://test.github.io'],
    ['api.endpoints.origin', 'https://github.io'],
    ['api.endpoints.origin', 'https://test-pages.example.invalid'],
    ['api.endpoints.origin', 'https://user:password@test-api.example.invalid'],
    ['api.endpoints.projectionPath', '/local/read'],
    [
      'frontend.url',
      'https://test-pages.example.invalid/?countryId=TEST_COUNTRY',
    ],
    ['worker.kind', 'GITHUB_PAGES'],
    ['worker.targetRef', 'GITHUB_PAGES'],
    ['worker.targetRef', 'https://test.github.io/worker'],
    ['worker.executable', 'https://test.github.io/worker.js'],
    ['auth.expectedIssuer', ''],
    ['auth.expectedAudience', ''],
    ['auth.projectRef', 'another-project'],
    ['database.environment', 'staging'],
    ['database.fingerprint', 'world-v2-local'],
    ['database.namespace', 'public'],
    ['readback.seedRef', 'OTHER_SEED'],
    ['readback.worldId', 'OTHER_WORLD'],
    ['readback.contentHash', sha(99)],
    ['readback.admissionRef', 'OTHER_ADMISSION'],
    ['readback.worldVersion', '1'],
    ['lifecycle.worldId', 'OTHER_WORLD'],
    ['lifecycle.fencingToken', '0'],
    ['lifecycle.fencingToken', '9223372036854775808'],
    ['lifecycle.expiresAtReal', '2026-10-07T00:00:00.000Z'],
    ['lifecycle.observedAtReal', '2026-02-30T00:00:00.000Z'],
    ['binding.modelVersion', 'OTHER_MODEL'],
    ['binding.orchestratorVersion', ''],
    ['binding.sourceManifestHash', 'bad-source-hash'],
    ['api.releaseCommit', 'b'.repeat(40)],
    ['worker.releaseCommit', 'b'.repeat(40)],
    ['frontend.releaseCommit', 'b'.repeat(40)],
    ['worker.buildHash', 'bad-build-hash'],
    ['simulationEnabled', true],
    ['runtimeBound', true],
    ['approved', true],
    ['countryId', 'TEST_COUNTRY'],
    ['seatRef', 'TEST_SEAT'],
    ['constructor', { approved: true }],
    ['schemaVersion', 'future-v2'],
  ])('blocks invalid or contradictory proposal at %s (%s)', (path, value) => {
    const { m, records } = fixture();
    change(m, path as string, value);
    blocked(m, records, `manifest.${path}`);
  });
  it.each([
    ['binding.world.worldId', 'OTHER_WORLD'],
    ['binding.world.seedRef', 'OTHER_SEED'],
    ['binding.sourceManifestHash', sha(90)],
    ['binding.orchestratorVersion', 'OTHER_VERSION'],
    ['binding.orchestratorBuildHash', sha(91)],
    ['binding.releaseCommit', 'b'.repeat(40)],
    ['pins.buildHash', sha(92)],
    ['pins.releaseCommit', 'b'.repeat(40)],
  ])('rejects mixed Worker evidence %s', (path, value) => {
    const { m, records } = fixture();
    const e = records.find(
      (r) => r.kind === RUNTIME_BINDING_EVIDENCE_KINDS.workerDeployment,
    )!;
    change(e, path as string, value);
    blocked(
      m,
      records,
      `manifest.evidenceRefs.workerDeployment.${(path as string).startsWith('binding.') ? 'binding' : 'pins'}`,
    );
  });
  it.each([
    'LOCAL_SELF_ATTESTATION',
    'SELF_SIGNED_LOCAL_RECEIPT',
    'OFFLINE_TEST_FIXTURE',
  ])('rejects %s as external evidence', (provenance) => {
    const { m, records } = fixture();
    change(records, '0.provenance', provenance);
    blocked(m, records, 'evidenceRecords[0].provenance');
  });
  it('rejects boolean approval, wrong evidence kind, duplicate and unused records', () => {
    const { m, records } = fixture();
    change(records, '0.approved', true);
    blocked(m, records, 'evidenceRecords[0].approved');
    const f = fixture();
    change(f.records, '0.kind', RUNTIME_BINDING_EVIDENCE_KINDS.apiDeployment);
    blocked(f.m, f.records, 'manifest.evidenceRefs.frontendPublication.kind');
    const g = fixture();
    blocked(g.m, [...g.records, g.records[0]], 'evidenceRecords[10].ref');
    change(g.records, '0.ref', sha(100));
    blocked(g.m, g.records, 'evidenceRecords.ref');
  });
  it('does not execute getters or turn inert invalid data into authority', () => {
    const { m, records } = fixture();
    let called = false;
    Object.defineProperty(m, 'approved', {
      enumerable: true,
      get() {
        called = true;
        return true;
      },
    });
    blocked(m, records, 'manifest');
    expect(called).toBe(false);
    blocked(null, null, 'manifest');
    blocked(fixture().m, true, 'evidenceRecords');
  });
  it('names contradictory API pins even when the real inventory is absent', () => {
    const { m } = fixture();
    change(m, 'api.endpoints.origin', 'https://test.github.io');
    const r = blocked(m, null, 'manifest.api.endpoints.origin');
    expect(r.diagnostics).toContainEqual({
      field: 'manifest.evidenceRefs.approvedHost',
      code: 'MISSING_EVIDENCE',
    });
  });
});
