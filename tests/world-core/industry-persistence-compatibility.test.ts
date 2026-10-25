// VALIDATION_FIXTURE_ONLY: source/order comparison, not native locks or custody.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCanonicalCommand } from '@econmind/core';
import {
  bindIndustryCompatibilityEvidenceInput,
  type IndustryCompatibilityEvidenceInput,
  type IndustryCompatibilityEvidenceExpectation,
} from '../../apps/world-worker/src/persistence/industry-compatibility-evidence-input.js';
import {
  IndustryPersistenceCompatibilityProvider,
  type IndustryCompatibilityRequest,
  type IndustryCompatibilitySourceAccessor,
} from '../../apps/world-worker/src/persistence/industry-persistence-compatibility.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  readValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from '../../apps/world-worker/src/persistence/validated-canonical-lineage.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
// Real Core construction of an explicitly synthetic intent, not a persisted fact.
const fixtureCommand = parseCanonicalCommand(
  {
    schemaVersion: 'command-v1',
    worldId: 'WORLD_VALIDATION_FIXTURE_ONLY',
    countryId: 'COUNTRY_VALIDATION_FIXTURE_ONLY',
    actorId: 'ACTOR_VALIDATION_FIXTURE_ONLY',
    authSubject: '00000000-0000-0000-0000-000000000001',
    commandId: 'CMD_VALIDATION_FIXTURE_ONLY',
    commandType: 'VALIDATION_FIXTURE_ONLY',
    correlationId: 'CORRELATION_VALIDATION_FIXTURE_ONLY',
    expectedWorldVersion: '9',
    idempotencyKey: 'IDEMPOTENCY_VALIDATION_FIXTURE_ONLY',
    officeId: null,
    simTime: '10000',
    submittedAtReal: '2026-10-25T00:00:00.000Z',
    payload: { classification: 'VALIDATION_FIXTURE_ONLY' },
  },
  sha,
);
const manifest = JSON.parse(
  readFileSync(
    new URL('../../database/migrations/manifest.json', import.meta.url),
    'utf8',
  ),
) as {
  migrations: {
    migration_id: string;
    sha256: string;
    artifact_source_commit: string;
    release_order: number;
    production_approval: unknown;
  }[];
};
function fixture(): IndustryCompatibilityEvidenceInput {
  return {
    schemaVersion: 'industry-compatibility-evidence-input-v1',
    target: {
      targetDeploymentRef: 'VALIDATION_FIXTURE_ONLY/deployment',
      databaseIdentityRef: 'VALIDATION_FIXTURE_ONLY/database',
    },
    publisher: {
      repository: 'VALIDATION_FIXTURE_ONLY/repository',
      workflowPath: '.github/workflows/fixture.yml',
      workflowCommit: 'a'.repeat(40),
      policyCommit: '7461a053a74131fcc8273a8ac981e28b510ca03c',
      registeredCallerRevision: 'VALIDATION_FIXTURE_ONLY/caller-v1',
      publisherEvidenceRef: 'VALIDATION_FIXTURE_ONLY/publisher',
      publisherEvidenceRevision: 'VALIDATION_FIXTURE_ONLY/pub-v1',
      runId: '1',
      jobId: '2',
      requestAuditRef: 'VALIDATION_FIXTURE_ONLY/request',
      responseArtifactRef: 'VALIDATION_FIXTURE_ONLY/response',
      responseSHA256: 'b'.repeat(64),
      outcome: 'APPLIED',
    },
    build: {
      constructorSourceCommit: 'c'.repeat(40),
      constructorBlobSHA256: 'd'.repeat(64),
      decoderProtocol: 'industry-production-decoder-v1',
      decoderBuildSHA256: 'e'.repeat(64),
    },
    releaseLedger: {
      observationRef: 'VALIDATION_FIXTURE_ONLY/ledger',
      revision: 'VALIDATION_FIXTURE_ONLY/ledger-v1',
      rows: manifest.migrations.map((m) => ({
        migration_id: m.migration_id,
        artifact_sha256: m.sha256,
        source_repo_commit: m.artifact_source_commit,
        release_order: m.release_order,
      })),
    },
    catalog: {
      observationRef: 'VALIDATION_FIXTURE_ONLY/catalog',
      revision: 'VALIDATION_FIXTURE_ONLY/catalog-v1',
      protocolVersion: 'VALIDATION_FIXTURE_ONLY/catalog-protocol',
      postgresBuild: 'VALIDATION_FIXTURE_ONLY/pg-build',
      objects: ['check', 'trigger', 'index'].map((kind) => ({
        objectId: 'VALIDATION_FIXTURE_ONLY/' + kind,
        kind,
        attachment: 'VALIDATION_FIXTURE_ONLY/table',
        enabledMode: 'ENABLED',
        deferredMode: 'DEFERRED',
        normalizedDefinition: 'SYNTHETIC COMPARISON CORPUS ONLY: ' + kind,
      })),
    },
    admission: {
      decisionRef: 'VALIDATION_FIXTURE_ONLY/decision',
      revision: 'VALIDATION_FIXTURE_ONLY/decision-v1',
      disposition: 'ADMITTED',
      targetDeploymentRef: 'VALIDATION_FIXTURE_ONLY/deployment',
      databaseIdentityRef: 'VALIDATION_FIXTURE_ONLY/database',
      publisherEvidenceRevision: 'VALIDATION_FIXTURE_ONLY/pub-v1',
      constructorBlobSHA256: 'd'.repeat(64),
      decoderBuildSHA256: 'e'.repeat(64),
    },
    checkedFor: {
      worldId: 'WORLD_VALIDATION_FIXTURE_ONLY',
      commandId: 'CMD_VALIDATION_FIXTURE_ONLY',
      commandFingerprint: fixtureCommand.fingerprint,
      head: { worldVersion: '9', eventSequence: '12' },
      simTime: '10000',
    },
    guards: {
      schemaReleaseResourceRef: 'VALIDATION_FIXTURE_ONLY/schema-resource',
      admissionResourceRef: 'VALIDATION_FIXTURE_ONLY/admission-resource',
      cooperationRevision: 'VALIDATION_FIXTURE_ONLY/cooperation-v1',
      observationRef: 'VALIDATION_FIXTURE_ONLY/guard-observation',
    },
  };
}
function expectation(
  input = fixture(),
): IndustryCompatibilityEvidenceExpectation {
  return {
    ...structuredClone(input),
    schemaVersion: 'industry-compatibility-evidence-expectation-v1',
    publisher: Object.fromEntries(
      Object.entries(input.publisher).filter(([k]) => k !== 'outcome'),
    ),
    admission: Object.fromEntries(
      Object.entries(input.admission).filter(([k]) => k !== 'disposition'),
    ),
  } as IndustryCompatibilityEvidenceExpectation;
}

function request(f = fixture()): IndustryCompatibilityRequest {
  return {
    checkedFor: structuredClone(f.checkedFor),
    target: structuredClone(f.target),
    build: structuredClone(f.build),
  };
}
function set(value: unknown, keys: readonly string[], replacement: unknown) {
  let row = value as Record<string, unknown>;
  for (const k of keys.slice(0, -1)) row = row[k] as Record<string, unknown>;
  row[keys.at(-1)!] = replacement;
}
function setup() {
  const observed = fixture(),
    expected = expectation(fixture()),
    events: string[] = [];
  const transaction: SqlExecutor = {
    async query<Row extends object>(statement: string) {
      expect(statement).toBe(
        'LOCK TABLE world_v2.schema_release IN SHARE MODE',
      );
      events.push('SCHEMA');
      return { rows: [] as Row[], rowCount: 0 };
    },
  };
  const accessor: IndustryCompatibilitySourceAccessor = {
    async resolveTargetFrom(tx, req) {
      expect(tx).toBe(transaction);
      expect(Object.isFrozen(req.checkedFor.head)).toBe(true);
      events.push('TARGET');
      return fixture().target;
    },
    async acquireAdmissionGuardFrom(tx) {
      expect(tx).toBe(transaction);
      events.push('ADMISSION');
    },
    async readObservedInputFrom(tx) {
      expect(tx).toBe(transaction);
      events.push('OBSERVED');
      return observed;
    },
    async readExpectedInputFrom(tx) {
      expect(tx).toBe(transaction);
      events.push('EXPECTED');
      return expected;
    },
  };
  const configuredTarget = structuredClone(observed.target);
  const configuredBuild = structuredClone(observed.build);
  const provider = new IndustryPersistenceCompatibilityProvider({
    accessor,
    expectedTarget: configuredTarget,
    expectedBuild: configuredBuild,
  });
  return {
    observed,
    expected,
    events,
    transaction,
    accessor,
    provider,
    configuredTarget,
    configuredBuild,
  };
}
describe('same-executor compatibility input composition, not native admission', () => {
  it('calls fixed target/schema/admission/read order then the unique accepted A binder', async () => {
    const s = setup(),
      r = await s.provider.assertCurrentFrom(s.transaction, request());
    expect(s.events).toEqual([
      'TARGET',
      'SCHEMA',
      'ADMISSION',
      'OBSERVED',
      'EXPECTED',
    ]);
    expect(r.status).toBe('SOURCE_INPUTS_BOUND_NOT_ADMITTED');
    expect(r.productionAuthority).toBe(false);
    expect(r.sourceAdmitted).toBe(false);
    expect(r.runtimeReady).toBe(false);
    expect(r.binding).toEqual(
      bindIndustryCompatibilityEvidenceInput(s.observed, s.expected),
    );
    expect(r.binding.evidenceSHA256).toMatch(/^[a-f0-9]{64}$/);
    expect(r.binding.observation.checkedCommandFingerprint).toBe(
      fixtureCommand.fingerprint,
    );
    expect(r.binding.productionAuthority).toBe(false);
    expect(r.binding.sourceAdmitted).toBe(false);
    expect(r.binding.runtimeConnected).toBe(false);
    expect(typeof s.observed.releaseLedger.rows[0]!.release_order).toBe(
      'number',
    );
    expect(Object.isFrozen(s.observed)).toBe(false);
    expect(Object.isFrozen(r.binding.observation)).toBe(true);
  });
  it('rejects missing accessor rather than a default pass/provider', () => {
    const f = fixture();
    expect(
      () =>
        new IndustryPersistenceCompatibilityProvider({
          accessor: null,
          expectedTarget: f.target,
          expectedBuild: f.build,
        }),
    ).toThrow('SOURCE_NOT_SUPPLIED');
  });
  it.each([
    ['target', ['target', 'databaseIdentityRef'], 'FOREIGN/database'],
    ['build', ['build', 'decoderBuildSHA256'], '1'.repeat(64)],
    ['unknown request', ['extra'], 'x'],
    ['head number', ['checkedFor', 'head', 'worldVersion'], 9],
    ['fingerprint bare', ['checkedFor', 'commandFingerprint'], 'a'.repeat(64)],
  ])(
    'rejects %s request before any source/SQL call',
    async (_name, keys, value) => {
      const s = setup(),
        req = request();
      set(req, keys as string[], value);
      await expect(
        s.provider.assertCurrentFrom(s.transaction, req),
      ).rejects.toThrow();
      expect(s.events).toEqual([]);
    },
  );
  it('refuses a foreign resolved target before requesting any locks', async () => {
    const s = setup();
    s.accessor.resolveTargetFrom = async () => ({
      targetDeploymentRef: 'FOREIGN/deployment',
      databaseIdentityRef: 'FOREIGN/database',
    });
    await expect(
      s.provider.assertCurrentFrom(s.transaction, request()),
    ).rejects.toThrow('ACTUAL_TARGET_MISMATCH');
    expect(s.events).toEqual([]);
  });
  it('propagates guard failure, reads no source after it and never retries', async () => {
    const s = setup();
    let calls = 0;
    s.accessor.acquireAdmissionGuardFrom = async (tx) => {
      expect(tx).toBe(s.transaction);
      calls++;
      throw Error('TEST_ONLY_GUARD_DENIED');
    };
    await expect(
      s.provider.assertCurrentFrom(s.transaction, request()),
    ).rejects.toThrow('TEST_ONLY_GUARD_DENIED');
    expect(calls).toBe(1);
    expect(s.events).toEqual(['TARGET', 'SCHEMA']);
  });
  it.each([
    ['current admission revoked', ['admission', 'disposition'], 'REVOKED'],
    ['observed stale head', ['checkedFor', 'head', 'worldVersion'], '8'],
    ['observed wrong command', ['checkedFor', 'commandId'], 'OTHER_COMMAND'],
    [
      'wrong current source revision',
      ['admission', 'revision'],
      'FOREIGN/current-v2',
    ],
    [
      'changed catalog',
      ['catalog', 'objects', '0', 'normalizedDefinition'],
      'DIFFERENT SYNTHETIC CONTENT',
    ],
    [
      'changed guard mapping',
      ['guards', 'cooperationRevision'],
      'FOREIGN/guard-v2',
    ],
    [
      'changed release chain',
      ['releaseLedger', 'rows', '22', 'artifact_sha256'],
      '1'.repeat(64),
    ],
  ])(
    'requires independent expected data for %s',
    async (_name, keys, value) => {
      const s = setup();
      set(s.observed, keys as string[], value);
      await expect(
        s.provider.assertCurrentFrom(s.transaction, request()),
      ).rejects.toThrow();
    },
  );
  it('does not manufacture expected data by cloning the observed data', async () => {
    const s = setup();
    set(
      s.observed,
      ['publisher', 'registeredCallerRevision'],
      'NEW/unsupported-revision',
    );
    const expectedBefore = JSON.stringify(s.expected);
    await expect(
      s.provider.assertCurrentFrom(s.transaction, request()),
    ).rejects.toThrow();
    expect(JSON.stringify(s.expected)).toBe(expectedBefore);
  });
  it('captures fixed configuration and each request without retaining caller aliases', async () => {
    const s = setup(),
      req = request();
    set(s.configuredTarget, ['databaseIdentityRef'], 'FOREIGN/configuration');
    set(s.configuredBuild, ['decoderBuildSHA256'], '1'.repeat(64));
    const pending = s.provider.assertCurrentFrom(s.transaction, req);
    set(req, ['checkedFor', 'head', 'worldVersion'], '999');
    const result = await pending;
    expect(result.checkedRequest.checkedFor.head.worldVersion).toBe('9');
    set(s.observed, ['checkedFor', 'head', 'worldVersion'], '1000');
    expect(result.binding.checkedFor.head.worldVersion).toBe('9');
  });
  it('rejects a nested caller getter/Proxy without invoking it', async () => {
    const s = setup(),
      req = request();
    let calls = 0;
    Object.defineProperty(req.checkedFor.head, 'eventSequence', {
      get() {
        calls++;
        return '12';
      },
    });
    await expect(
      s.provider.assertCurrentFrom(s.transaction, req),
    ).rejects.toThrow();
    expect(calls).toBe(0);
    const p = new Proxy(
      {},
      {
        getPrototypeOf() {
          calls++;
          throw Error('must not inspect');
        },
      },
    );
    await expect(
      s.provider.assertCurrentFrom(
        s.transaction,
        p as IndustryCompatibilityRequest,
      ),
    ).rejects.toThrow();
    expect(calls).toBe(0);
    expect(s.events).toEqual([]);
  });
  it('produces inert data that cannot act as an actual canonical-lineage view', async () => {
    const s = setup(),
      r = await s.provider.assertCurrentFrom(s.transaction, request());
    expect(() =>
      readValidatedCanonicalLineageFrom(
        s.transaction,
        r as unknown as ValidatedCanonicalLineageView,
      ),
    ).toThrow();
  });
  it('forwards read errors without opening another transaction or retrying', async () => {
    const s = setup();
    let calls = 0;
    s.accessor.readExpectedInputFrom = async () => {
      calls++;
      throw Error('TEST_ONLY_SOURCE_READ_FAILED');
    };
    await expect(
      s.provider.assertCurrentFrom(s.transaction, request()),
    ).rejects.toThrow('TEST_ONLY_SOURCE_READ_FAILED');
    expect(calls).toBe(1);
  });
});
