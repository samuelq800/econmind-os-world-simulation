// VALIDATION_FIXTURE_ONLY: invented provenance/catalog values, no real admission.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  canonicalSerialize,
  parseCanonicalCommand,
} from '@econmind/core';
import {
  bindIndustryCompatibilityEvidenceInput,
  parseIndustryCompatibilityEvidenceInput,
  type IndustryCompatibilityEvidenceExpectation,
  type IndustryCompatibilityEvidenceInput,
} from '../../apps/world-worker/src/persistence/industry-compatibility-evidence-input.js';
import {
  readValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from '../../apps/world-worker/src/persistence/validated-canonical-lineage.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';

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
function set(
  value: unknown,
  path: readonly string[],
  replacement: unknown,
): void {
  let record = value as Record<string, unknown>;
  for (const p of path.slice(0, -1))
    record = record[p] as Record<string, unknown>;
  record[path.at(-1)!] = replacement;
}
function rejected(input: unknown, expected = expectation()): void {
  expect(() => bindIndustryCompatibilityEvidenceInput(input, expected)).toThrow(
    DomainError,
  );
  try {
    bindIndustryCompatibilityEvidenceInput(input, expected);
  } catch (error) {
    expect((error as DomainError).code).toBe(
      DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    );
  }
}
const changes: [string, readonly string[], unknown][] = [
  ['target', ['target', 'targetDeploymentRef'], 'FOREIGN/deployment'],
  ['database', ['target', 'databaseIdentityRef'], 'FOREIGN/database'],
  ['workflow commit', ['publisher', 'workflowCommit'], '1'.repeat(40)],
  [
    'caller revision',
    ['publisher', 'registeredCallerRevision'],
    'FOREIGN/caller',
  ],
  [
    'publisher revision',
    ['publisher', 'publisherEvidenceRevision'],
    'FOREIGN/pub-v2',
  ],
  ['run', ['publisher', 'runId'], '3'],
  ['job', ['publisher', 'jobId'], '3'],
  ['request audit', ['publisher', 'requestAuditRef'], 'FOREIGN/request'],
  ['response audit', ['publisher', 'responseArtifactRef'], 'FOREIGN/response'],
  ['response hash', ['publisher', 'responseSHA256'], '1'.repeat(64)],
  ['constructor commit', ['build', 'constructorSourceCommit'], '1'.repeat(40)],
  ['constructor blob', ['build', 'constructorBlobSHA256'], '1'.repeat(64)],
  ['decoder build', ['build', 'decoderBuildSHA256'], '1'.repeat(64)],
  ['decoder protocol', ['build', 'decoderProtocol'], 'UNSUPPORTED'],
  ['ledger revision', ['releaseLedger', 'revision'], 'FOREIGN/ledger-v2'],
  ['catalog revision', ['catalog', 'revision'], 'FOREIGN/catalog-v2'],
  ['catalog protocol', ['catalog', 'protocolVersion'], 'FOREIGN/protocol'],
  ['PG build', ['catalog', 'postgresBuild'], 'FOREIGN/build'],
  [
    'object attachment',
    ['catalog', 'objects', '0', 'attachment'],
    'FOREIGN/table',
  ],
  ['object mode', ['catalog', 'objects', '0', 'enabledMode'], 'DISABLED'],
  ['deferred mode', ['catalog', 'objects', '0', 'deferredMode'], 'IMMEDIATE'],
  [
    'definition',
    ['catalog', 'objects', '0', 'normalizedDefinition'],
    'SYNTHETIC DIFFERENT DEFINITION',
  ],
  [
    'admission target',
    ['admission', 'targetDeploymentRef'],
    'FOREIGN/deployment',
  ],
  ['admission revision', ['admission', 'revision'], 'FOREIGN/decision-v2'],
  ['revocation', ['admission', 'disposition'], 'REVOKED'],
  ['unknown admission', ['admission', 'disposition'], 'UNKNOWN'],
  ['unknown release', ['publisher', 'outcome'], 'UNKNOWN'],
  ['not applied', ['publisher', 'outcome'], 'NOT_APPLIED'],
  ['wrong World', ['checkedFor', 'worldId'], 'WORLD_FOREIGN'],
  ['wrong command', ['checkedFor', 'commandId'], 'CMD_FOREIGN'],
  [
    'fingerprint',
    ['checkedFor', 'commandFingerprint'],
    'sha256:' + '1'.repeat(64),
  ],
  ['head version', ['checkedFor', 'head', 'worldVersion'], '10'],
  ['head sequence', ['checkedFor', 'head', 'eventSequence'], '13'],
  ['SimTime', ['checkedFor', 'simTime'], '10001'],
  ['schema guard', ['guards', 'schemaReleaseResourceRef'], 'FOREIGN/guard'],
  ['admission guard', ['guards', 'admissionResourceRef'], 'FOREIGN/guard'],
  [
    'cooperation revision',
    ['guards', 'cooperationRevision'],
    'FOREIGN/cooperation-v2',
  ],
];

describe('Industry compatibility evidence input, inert validation only', () => {
  it('binds a complete synthetic dataset, without authenticating or admitting it', () => {
    const input = fixture(),
      result = bindIndustryCompatibilityEvidenceInput(
        input,
        expectation(input),
      );
    expect(result.status).toBe('DATA_BINDING_MATCH_NOT_AUTHENTICATED');
    expect([
      result.productionAuthority,
      result.sourceAdmitted,
      result.runtimeConnected,
    ]).toEqual([false, false, false]);
    expect(Object.keys(result).sort()).toEqual(
      [
        'schemaVersion',
        'status',
        'productionAuthority',
        'sourceAdmitted',
        'runtimeConnected',
        'evidenceSHA256',
        'checkedFor',
        'observation',
      ].sort(),
    );
    expect(result.observation.checkedHead).toEqual(input.checkedFor.head);
    expect(result.observation.admissionRevision).toBe(input.admission.revision);
    expect(result.observation.checkedCommandFingerprint).toBe(
      fixtureCommand.fingerprint,
    );
    // This corpus is deliberately NOT a real installed PostgreSQL profile.
    expect(result.observation.catalogContractVersion).toContain(
      'VALIDATION_FIXTURE_ONLY',
    );
  });

  it('keeps original numeric orders and fixed legacy source chain/hash unchanged', () => {
    const input = fixture(),
      before = JSON.stringify(input);
    const parsed = parseIndustryCompatibilityEvidenceInput(input);
    bindIndustryCompatibilityEvidenceInput(input, expectation(input));
    expect(JSON.stringify(input)).toBe(before);
    expect(typeof parsed.releaseLedger.rows[0]!.release_order).toBe('number');
    expect(parsed.releaseLedger.rows).toEqual(input.releaseLedger.rows);
    expect(sha(JSON.stringify(parsed.releaseLedger.rows))).toBe(
      '32e78158bdac2869d1cec0f5a655744152b4aa2fecec51bfa11eaddce910b9c5',
    );
    expect(manifest.migrations[22]!.production_approval).toBeNull();
  });

  it('owns all nested data without freezing or retaining caller objects', () => {
    const input = fixture(),
      exp = expectation(input);
    const parsed = parseIndustryCompatibilityEvidenceInput(input);
    const result = bindIndustryCompatibilityEvidenceInput(input, exp);
    set(input, ['checkedFor', 'head', 'worldVersion'], '99');
    set(input, ['catalog', 'objects', '0', 'normalizedDefinition'], 'MUTATED');
    set(exp, ['admission', 'revision'], 'MUTATED');
    expect(result.checkedFor.head.worldVersion).toBe('9');
    expect(parsed.catalog.objects[0]!.normalizedDefinition).not.toBe('MUTATED');
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(parsed.releaseLedger.rows[0])).toBe(true);
    expect(Object.isFrozen(result.observation.checkedHead)).toBe(true);
    expect(() =>
      set(result, ['checkedFor', 'head', 'worldVersion'], '88'),
    ).toThrow();
  });

  it('has deterministic domain-separated digests using the existing Core serializer', () => {
    const input = fixture(),
      result = bindIndustryCompatibilityEvidenceInput(
        input,
        expectation(input),
      );
    const rows = input.releaseLedger.rows.map((row) => ({
      ...row,
      release_order: String(row.release_order),
    }));
    const digest = (kind: string, value: unknown) =>
      sha(
        canonicalSerialize({
          schemaVersion: 'industry-compatibility-audit-image-v1',
          kind,
          value,
        }),
      );
    expect(result.evidenceSHA256).toBe(
      digest('EVIDENCE', {
        ...input,
        releaseLedger: { ...input.releaseLedger, rows },
      }),
    );
    expect(result.observation.releaseLedgerObservationHash).toBe(
      digest('RELEASE_LEDGER', rows),
    );
    expect(result.observation.catalogObservationHash).toBe(
      digest('CATALOG', {
        protocolVersion: input.catalog.protocolVersion,
        postgresBuild: input.catalog.postgresBuild,
        objects: input.catalog.objects,
      }),
    );
    expect(
      new Set([
        result.evidenceSHA256,
        result.observation.releaseLedgerObservationHash,
        result.observation.catalogObservationHash,
        sha(JSON.stringify(input.releaseLedger.rows)),
      ]).size,
    ).toBe(4);
    const reordered = Object.fromEntries(Object.entries(input).reverse());
    expect(
      bindIndustryCompatibilityEvidenceInput(reordered, expectation(input)),
    ).toEqual(result);
    expect(
      bindIndustryCompatibilityEvidenceInput(
        structuredClone(input),
        expectation(input),
      ),
    ).toEqual(result);
  });

  it('binds digest impact to content domains, without turning changes into authority', () => {
    const original = fixture();
    const before = bindIndustryCompatibilityEvidenceInput(
      original,
      expectation(original),
    );
    const catalogChange = fixture();
    set(
      catalogChange,
      ['catalog', 'objects', '0', 'normalizedDefinition'],
      'SYNTHETIC SECOND CORPUS',
    );
    const afterCatalog = bindIndustryCompatibilityEvidenceInput(
      catalogChange,
      expectation(catalogChange),
    );
    expect(afterCatalog.evidenceSHA256).not.toBe(before.evidenceSHA256);
    expect(afterCatalog.observation.catalogObservationHash).not.toBe(
      before.observation.catalogObservationHash,
    );
    expect(afterCatalog.observation.releaseLedgerObservationHash).toBe(
      before.observation.releaseLedgerObservationHash,
    );
    const scopeChange = fixture();
    set(scopeChange, ['checkedFor', 'simTime'], '10001');
    const afterScope = bindIndustryCompatibilityEvidenceInput(
      scopeChange,
      expectation(scopeChange),
    );
    expect(afterScope.evidenceSHA256).not.toBe(before.evidenceSHA256);
    expect(afterScope.observation.catalogObservationHash).toBe(
      before.observation.catalogObservationHash,
    );
    expect(afterScope.observation.releaseLedgerObservationHash).toBe(
      before.observation.releaseLedgerObservationHash,
    );
    expect([
      afterCatalog.sourceAdmitted,
      afterScope.productionAuthority,
    ]).toEqual([false, false]);
  });

  it('rejects false-chain parsing before any private audit image, and numeric expected revisions', () => {
    const input = fixture();
    set(
      input,
      ['releaseLedger', 'rows', '22', 'artifact_sha256'],
      '1'.repeat(64),
    );
    expect(() => parseIndustryCompatibilityEvidenceInput(input)).toThrow(
      'RELEASE_CHAIN_MISMATCH',
    );
    const exp = expectation();
    set(exp, ['admission', 'revision'], 2);
    rejected(fixture(), exp);
  });

  it.each([
    'f'.repeat(64),
    'sha256:' + 'F'.repeat(64),
    'sha256:sha256:' + 'f'.repeat(64),
    ' sha256:' + 'f'.repeat(64),
  ])(
    'rejects a noncanonical Core command fingerprint without repair: %s',
    (fingerprint) => {
      const input = fixture();
      set(input, ['checkedFor', 'commandFingerprint'], fingerprint);
      rejected(input, expectation(input));
    },
  );

  it.each(changes)(
    'rejects %s drift against exact current expectation',
    (_name, path, value) => {
      const input = fixture();
      set(input, path, value);
      rejected(input);
    },
  );

  it.each([17, 22, 24])(
    'rejects a %i-row chain, without truncation or expected-row filling',
    (count) => {
      const input = fixture();
      const rows =
        count < 23
          ? input.releaseLedger.rows.slice(0, count)
          : [...input.releaseLedger.rows, input.releaseLedger.rows[22]!];
      set(input, ['releaseLedger', 'rows'], rows);
      rejected(input);
    },
  );

  it.each([
    'hash',
    'commit',
    'migration-id',
    'order',
    'duplicate',
    'reordered',
  ] as const)('rejects two equal but false whole chains: %s', (kind) => {
    const input = fixture();
    if (kind === 'hash')
      set(
        input,
        ['releaseLedger', 'rows', '22', 'artifact_sha256'],
        '1'.repeat(64),
      );
    if (kind === 'commit')
      set(
        input,
        ['releaseLedger', 'rows', '22', 'source_repo_commit'],
        '1'.repeat(40),
      );
    if (kind === 'migration-id')
      set(
        input,
        ['releaseLedger', 'rows', '22', 'migration_id'],
        'WRONG_MIGRATION',
      );
    if (kind === 'order')
      set(input, ['releaseLedger', 'rows', '22', 'release_order'], 22);
    if (kind === 'duplicate')
      set(
        input,
        ['releaseLedger', 'rows', '22', 'migration_id'],
        input.releaseLedger.rows[0]!.migration_id,
      );
    if (kind === 'reordered')
      set(
        input,
        ['releaseLedger', 'rows'],
        [...input.releaseLedger.rows].reverse(),
      );
    rejected(input, expectation(input));
  });

  it('rejects matching arbitrary replacement policy commits', () => {
    const input = fixture();
    set(input, ['publisher', 'policyCommit'], '1'.repeat(40));
    rejected(input, expectation(input));
  });

  it.each(['missing', 'duplicate', 'reordered', 'unknown-profile'] as const)(
    'rejects catalog %s without inventing a profile',
    (kind) => {
      const input = fixture(),
        objects = input.catalog.objects;
      if (kind === 'missing')
        set(input, ['catalog', 'objects'], objects.slice(1));
      if (kind === 'duplicate')
        set(input, ['catalog', 'objects'], [objects[0], objects[0]]);
      if (kind === 'reordered')
        set(input, ['catalog', 'objects'], [...objects].reverse());
      if (kind === 'unknown-profile')
        set(input, ['catalog', 'protocolVersion'], 'NOT_SUPPLIED');
      rejected(input);
    },
  );

  it.each([
    ['publisher', 'runId'],
    ['releaseLedger', 'revision'],
    ['admission', 'revision'],
    ['checkedFor', 'simTime'],
    ['checkedFor', 'head', 'worldVersion'],
    ['catalog', 'objects', '0', 'normalizedDefinition'],
  ])('never generically converts a number at %s', (...path) => {
    const input = fixture();
    set(input, path, 1);
    rejected(input);
  });

  it('rejects release_order strings despite equal expected data', () => {
    const input = fixture();
    set(input, ['releaseLedger', 'rows', '0', 'release_order'], '1');
    rejected(input, expectation(input));
  });

  it('rejects missing/unknown fields on both input and expected', () => {
    const input = fixture();
    set(input, ['extra'], 'value');
    rejected(input);
    const exp = expectation();
    set(exp, ['extra'], 'value');
    rejected(fixture(), exp);
    const incomplete = { ...fixture() } as Record<string, unknown>;
    delete incomplete.guards;
    rejected(incomplete);
    const missingRevision = expectation() as unknown as Record<string, unknown>;
    delete missingRevision.admission;
    rejected(
      fixture(),
      missingRevision as unknown as IndustryCompatibilityEvidenceExpectation,
    );
  });

  it('rejects accessor/class/proxy/symbol/cyclic/hidden data without invoking accessors', () => {
    const getter = vi.fn(() => fixture().target),
      input = fixture();
    Object.defineProperty(input, 'target', { enumerable: true, get: getter });
    rejected(input);
    expect(getter).not.toHaveBeenCalled();
    rejected(Object.assign(Object.create({}), fixture()));
    const trap = vi.fn();
    rejected(new Proxy(fixture(), { getPrototypeOf: trap }));
    expect(trap).not.toHaveBeenCalled();
    const symbol = fixture();
    Object.defineProperty(symbol, Symbol('extra'), { value: true });
    rejected(symbol);
    const cyclic = fixture();
    set(cyclic, ['target'], cyclic);
    rejected(cyclic);
    const hidden = fixture();
    Object.defineProperty(hidden, 'hidden', { value: 'x' });
    rejected(hidden);
  });

  it('rejects sparse, decorated, oversized and noncanonical data', () => {
    const sparse = fixture(),
      rows = [...sparse.releaseLedger.rows];
    delete rows[0];
    set(sparse, ['releaseLedger', 'rows'], rows);
    rejected(sparse);
    const decorated = fixture();
    Object.defineProperty(decorated.catalog.objects, 'extra', { value: 'x' });
    rejected(decorated);
    const large = fixture();
    set(
      large,
      ['catalog', 'objects', '0', 'normalizedDefinition'],
      'x'.repeat(32769),
    );
    rejected(large);
    const total = fixture();
    set(
      total,
      ['catalog', 'objects'],
      Array.from({ length: 9 }, (_, i) => ({
        ...total.catalog.objects[0],
        objectId: 'FIXTURE/' + i,
        normalizedDefinition: 'x'.repeat(32000),
      })),
    );
    rejected(total);
    const zeroRun = fixture();
    set(zeroRun, ['publisher', 'runId'], '0');
    rejected(zeroRun);
    const bad = fixture();
    set(bad, ['checkedFor', 'head', 'worldVersion'], '09');
    rejected(bad);
    const url = fixture();
    set(
      url,
      ['publisher', 'requestAuditRef'],
      'https://example.invalid/record',
    );
    rejected(url);
    const secret = fixture();
    set(secret, ['publisher', 'connectionString'], 'NOT_A_REAL_CREDENTIAL');
    rejected(secret);
  });

  it('rechecks each revision and does not cache a previous successful result', () => {
    const input = fixture(),
      exp = expectation(input);
    bindIndustryCompatibilityEvidenceInput(input, exp);
    set(
      exp,
      ['admission', 'revision'],
      'VALIDATION_FIXTURE_ONLY/new-current-revision',
    );
    rejected(input, exp);
    const changed = fixture();
    set(
      changed,
      ['admission', 'revision'],
      'VALIDATION_FIXTURE_ONLY/new-current-revision',
    );
    expect(
      bindIndustryCompatibilityEvidenceInput(changed, exp).sourceAdmitted,
    ).toBe(false);
  });

  it('cannot serve as a genuine lineage view or cause an SQL query', () => {
    const result = bindIndustryCompatibilityEvidenceInput(
      fixture(),
      expectation(),
    );
    const query = vi.fn(() => {
      throw Error('NO_DATABASE_CALL_ALLOWED');
    });
    const executor = { query } as unknown as SqlExecutor;
    expect(() =>
      readValidatedCanonicalLineageFrom(
        executor,
        result as unknown as ValidatedCanonicalLineageView,
      ),
    ).toThrow('forged, expired');
    expect(query).not.toHaveBeenCalled();
  });
});
