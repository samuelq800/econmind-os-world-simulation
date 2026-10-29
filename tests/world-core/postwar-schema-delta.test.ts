/** SQL artifact/recovery checks only. No DB or approved migration is created. */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import {
  classifyDeltaTransaction,
  createUnapprovedSchemaDeltaPlan,
  preparePostwarSchemaDelta,
} from '../../tools/office-connection/postwar-schema-delta.mjs';
const sha = (v: Buffer) => createHash('sha256').update(v).digest('hex');
function fixture(
  first = 'create role world_v2_delta_owner nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;\ncreate table world_v2.delta_a(id text);\ncreate function world_v2.delta_guard() returns int language sql as $$select 1$$;\n',
) {
  const a = Buffer.from(first),
    b = Buffer.from(
      'begin;\ncreate or replace function world_v2.delta_guard() returns int language sql as $$select 2$$;\ncommit;\n',
    ),
    clock = Buffer.from('create table world_v2.isolated_world_clock(id text);');
  const proposals = [
    {
      id: 'delta-a',
      path: 'database/proposals/delta-a.sql',
      disposition: 'REQUIRED_READ_BOUNDARY',
      dependencies: [] as string[],
      baselineDependencies: ['BASELINE_001'],
      createdRelations: ['delta_a'],
      createdRoles: ['world_v2_delta_owner'],
      reusedRoles: [] as string[],
      definedFunctions: ['delta_guard'],
      renamedFunctions: [],
      sha256: sha(a),
    },
    {
      id: 'delta-b',
      path: 'database/proposals/delta-b.sql',
      disposition: 'CANDIDATE_READ',
      dependencies: ['delta-a'],
      baselineDependencies: ['BASELINE_001'],
      createdRelations: [],
      createdRoles: [],
      reusedRoles: ['world_v2_delta_owner'],
      definedFunctions: ['delta_guard'],
      renamedFunctions: [],
      sha256: sha(b),
    },
    {
      id: 'isolated-world-clock',
      path: 'database/proposals/isolated-world-clock.sql',
      disposition: 'EXCLUDED_NOT_A_READ_DEPENDENCY',
      dependencies: [],
      baselineDependencies: [],
      createdRelations: ['isolated_world_clock'],
      createdRoles: [],
      reusedRoles: [],
      definedFunctions: [],
      renamedFunctions: [],
      sha256: sha(clock),
    },
  ];
  return {
    candidate: {
      manifest: {
        production_publisher: 'main-site-release-chain',
        migrations: [
          {
            migration_id: 'BASELINE_001',
            release_order: 1,
            path: 'baseline.sql',
            sha256: 'a'.repeat(64),
            artifact_source_commit: 'd'.repeat(40),
          },
        ],
      },
      pins: {
        sourceCommit: 'b'.repeat(40),
        sourceTree: 'c'.repeat(40),
        installationAllowed: false,
        manifestSha256: 'a'.repeat(64),
        expandedPolicySha256: 'f'.repeat(64),
        proposals,
      },
    },
    sources: new Map(proposals.map((p, i) => [p.path, [a, b, clock][i]!])),
  };
}
describe('unapproved postwar schema delta package boundary', () => {
  it('retains original SQL hashes, orders dependencies and distinguishes wrapping from an existing transaction', () => {
    const f = fixture(),
      result = createUnapprovedSchemaDeltaPlan(f.candidate, f.sources);
    expect(result.manifest).toMatchObject({
      installationAllowed: false,
      databaseOperations: 0,
      networkRequests: 0,
      credentialsCreated: 0,
      migrationRegistrationPerformed: false,
      acrossFilesAtomic: false,
      isolatedClockSqlIncluded: false,
      packagedProposalCount: 2,
      productionVerifiedOffices: 0,
      productionOfficeDenominator: 6,
    });
    expect(result.chunks.map((c) => c.entry.id)).toEqual([
      'delta-a',
      'delta-b',
    ]);
    expect(result.chunks[0]!.source).toEqual(
      f.sources.get('database/proposals/delta-a.sql'),
    );
    expect(result.chunks[0]!.entry.sourceSha256).toBe(
      sha(result.chunks[0]!.source),
    );
    expect(result.chunks[0]!.entry.transactionEnvelope).toBe(
      'WRAPPED_SINGLE_TRANSACTION',
    );
    expect(result.chunks[0]!.transaction.toString()).toBe(
      'begin;\n' + result.chunks[0]!.source.toString() + '\ncommit;\n',
    );
    expect(result.chunks[1]!.transaction).toEqual(result.chunks[1]!.source);
    expect(result.chunks[1]!.entry.preconditions.functions[0]).toMatchObject({
      predecessorProposal: 'delta-a',
      expectedDefinitionSha256: null,
      requirement: 'VERIFY_EXACT_REVIEWED_PREDECESSOR_BEFORE_REPLACE_OR_RENAME',
    });
    expect(result.chunks[0]!.entry.preconditions.rolesMustBeAbsent).toEqual([
      'world_v2_delta_owner',
    ]);
    expect(result.chunks[0]!.entry.recovery).toMatchObject({
      automaticRollback: false,
      destructiveRollback: false,
      uncertainCommit:
        'UNKNOWN_STOP_NO_RETRY_VERIFY_CATALOG_AND_RELEASE_LEDGER',
    });
    expect(
      result.chunks.some((c) => c.entry.id === 'isolated-world-clock'),
    ).toBe(false);
  });
  it('detects stale SQL even when object names and candidate metadata look unchanged', () => {
    const f = fixture();
    f.sources.set(
      'database/proposals/delta-a.sql',
      Buffer.from(
        f.sources.get('database/proposals/delta-a.sql')!.toString() +
          '\n-- changed bytes',
      ),
    );
    expect(() =>
      createUnapprovedSchemaDeltaPlan(f.candidate, f.sources),
    ).toThrow('SOURCE_ARTIFACT_HASH_DIFFERS');
  });
  it('rejects missing, out-of-order and excluded Clock dependencies', () => {
    for (const dependency of [
      'missing-source',
      'delta-b',
      'isolated-world-clock',
    ]) {
      const f = fixture();
      f.candidate.pins.proposals[0]!.dependencies = [dependency];
      expect(() =>
        createUnapprovedSchemaDeltaPlan(f.candidate, f.sources),
      ).toThrow('DEPENDENCY_ORDER');
    }
    const f = fixture();
    f.candidate.pins.proposals[1]!.baselineDependencies = ['MISSING_BASELINE'];
    expect(() =>
      createUnapprovedSchemaDeltaPlan(f.candidate, f.sources),
    ).toThrow('BASELINE_REQUIRED');
  });
  it.each([
    'drop schema world_v2;',
    'drop role world_v2_delta_owner;',
    'drop owned by world_v2_delta_owner;',
    'alter table world_v2.delta_a disable row level security;',
    'alter table world_v2.delta_a disable trigger all;',
    'create database another;',
    'create index concurrently idx on world_v2.delta_a(id);',
    'vacuum world_v2.delta_a;',
    'reindex table concurrently world_v2.delta_a;',
    "create role unsafe login password 'TEST_ONLY';",
    '\\! echo forbidden',
  ])(
    'does not package destructive, credential or nontransactional commands: %s',
    (sql) => {
      const f = fixture(sql);
      expect(() =>
        createUnapprovedSchemaDeltaPlan(f.candidate, f.sources),
      ).toThrow('DESTRUCTIVE_CREDENTIAL_OR_NONTRANSACTIONAL_SQL_DENIED');
    },
  );
  it('does not mistake dollar-quoted function text for an outer transaction, and refuses multiple transaction boundaries', () => {
    const source = Buffer.from(
      "create function world_v2.literal_text()returns text language sql as $body$select 'begin; commit;';$body$;\n",
    );
    expect(classifyDeltaTransaction(source).sourceEnvelope).toBe(
      'WRAPPED_SINGLE_TRANSACTION',
    );
    expect(() =>
      classifyDeltaTransaction(Buffer.from('begin;\ncommit;\nbegin;\ncommit;')),
    ).toThrow('UNSUPPORTED_TRANSACTION_ENVELOPE');
    expect(() =>
      classifyDeltaTransaction(
        Buffer.from(
          'start transaction;\ncreate table world_v2.delta_a(id text);\ncommit;',
        ),
      ),
    ).toThrow('UNSUPPORTED_TRANSACTION_CONTROL');
  });
  it('never silently changes malformed encoding while wrapping original SQL bytes', () => {
    expect(() => classifyDeltaTransaction(Buffer.from([0xff, 0xfe]))).toThrow(
      'VALID_UTF8_SQL_REQUIRED',
    );
    expect(() => classifyDeltaTransaction(Buffer.from('select 1;\0'))).toThrow(
      'VALID_UTF8_SQL_REQUIRED',
    );
  });
  it('classifies the existing eighteen non-Clock source files without running or editing any SQL', async () => {
    const directory = new URL('../../database/proposals/', import.meta.url),
      names = await readdir(directory);
    const selected = names.filter(
      (n) => n.endsWith('.sql') && n !== 'isolated-world-clock.sql',
    );
    expect(selected).toHaveLength(18);
    for (const name of selected) {
      const bytes = await readFile(new URL(name, directory));
      const result = classifyDeltaTransaction(bytes);
      expect(['SOURCE_BEGIN_COMMIT', 'WRAPPED_SINGLE_TRANSACTION']).toContain(
        result.sourceEnvelope,
      );
    }
  });
  it('has no CLI execution/deployment mode and rejects relative paths before reading companion tools', async () => {
    const script = new URL(
      '../../tools/office-connection/postwar-schema-delta.mjs',
      import.meta.url,
    );
    const result = spawnSync(process.execPath, [script.pathname, '--execute'], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'ONLY_SOURCE_SHA_COMPANION_FRESH_OUTPUT_ARGUMENTS_ALLOWED',
    );
    await expect(
      preparePostwarSchemaDelta({
        sourceRoot: 'relative',
        candidateSha: 'b'.repeat(40),
        companionRoot: '/tmp',
        outputDirectory: '/tmp/unused-schema-delta',
      }),
    ).rejects.toThrow('ABSOLUTE_PATHS_REQUIRED');
  });
});
