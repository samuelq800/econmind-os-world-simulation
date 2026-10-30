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
// Explicit reviewed inventory: companion fixed 31-proposal policy, with its
// isolated Clock deliberately excluded. New proposals require an explicit
// inventory update; never accept an arbitrary directory count or widen scope.
const EXPECTED_NON_CLOCK_PROPOSALS = Object.freeze([
  'captain-operating-custody.sql',
  'current-authorization-writer-preparation.sql',
  'finance-budget-capacity-source.sql',
  'finance-budget-custody.sql',
  'finance-budget-mixed-source.sql',
  'financial-posting-decimal-validation.sql',
  'postwar-bounded-journal-read.sql',
  'postwar-bounded-prefix-read.sql',
  'postwar-day-one-fx-custody.sql',
  'postwar-day-one-fx-history-read.sql',
  'postwar-finance-social-source-publication.sql',
  'postwar-financial-current-derived-read.sql',
  'postwar-industry-production-source.sql',
  'postwar-mixed-current-projection-read.sql',
  'postwar-mixed-financial-current-publication.sql',
  'postwar-narrow-trade-source.sql',
  'postwar-office-derived-read.sql',
  'postwar-office-recovery-read.sql',
  'postwar-physical-inventory-provenance.sql',
  'postwar-physical-opening-facts-read.sql',
  'postwar-runtime-source-read-policy.sql',
  'postwar-social-current-derived-read.sql',
  'postwar-social-current-prefix-read.sql',
  'postwar-social-mixed-match-publisher.sql',
  'postwar-social-startup-seed-header.sql',
  'runtime-admission-publication.sql',
  'runtime-read-binding-storage.sql',
  'social-intake-authorization.sql',
  'social-operating-custody.sql',
  'social-operating-match-publisher.sql',
]);
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
  it('packages an explicit additional intake-lock dependency without enrolling roles or changing the recovery boundary', () => {
    const f = fixture();
    const source = Buffer.from(
      'begin;\ncreate role world_v2_delta_intake_lock_reader nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;\ncreate function world_v2.delta_intake_lock()returns int language sql as $$select 1$$;\ncommit;\n',
    );
    const entry = {
      id: 'delta-social-intake',
      path: 'database/proposals/delta-social-intake.sql',
      disposition: 'CANDIDATE_SOCIAL_INTAKE_AUTHORIZATION',
      dependencies: ['delta-b'],
      baselineDependencies: ['BASELINE_001'],
      createdRelations: [],
      createdRoles: ['world_v2_delta_intake_lock_reader'],
      reusedRoles: ['world_v2_delta_owner'],
      definedFunctions: ['delta_intake_lock'],
      renamedFunctions: [],
      sourceRoleDeps: {
        world_v2_delta_owner: 'delta-a',
        world_v2_delta_intake_lock_reader: 'delta-social-intake',
      },
      sha256: sha(source),
    };
    f.candidate.pins.proposals.splice(2, 0, entry);
    f.sources.set(entry.path, source);
    const result = createUnapprovedSchemaDeltaPlan(f.candidate, f.sources);
    expect(result.manifest.inventoriedProposalCount).toBe(4);
    expect(result.manifest.packagedProposalCount).toBe(3);
    expect(result.manifest.installationAllowed).toBe(false);
    expect(result.manifest.acrossFilesAtomic).toBe(false);
    const actual = result.chunks[2]!.entry;
    expect(actual.dependencies).toEqual(['delta-b']);
    expect(actual.sourceRoleDeps).toEqual(entry.sourceRoleDeps);
    expect(actual.preconditions.rolesMustBeAbsent).toEqual([
      'world_v2_delta_intake_lock_reader',
    ]);
    expect(actual.preconditions.reusedRoles[0]!.enrollmentApproved).toBe(false);
    expect(actual.executionAllowed).toBe(false);
    expect(actual.recovery.uncertainCommit).toBe(
      'UNKNOWN_STOP_NO_RETRY_VERIFY_CATALOG_AND_RELEASE_LEDGER',
    );
    expect(result.chunks[2]!.transaction).toEqual(source);
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
  it('classifies the complete reviewed thirty non-Clock proposal paths without running or editing SQL', async () => {
    const directory = new URL('../../database/proposals/', import.meta.url),
      names = await readdir(directory);
    const selected = names
      .filter((n) => n.endsWith('.sql') && n !== 'isolated-world-clock.sql')
      .sort();
    expect(selected).toEqual([...EXPECTED_NON_CLOCK_PROPOSALS].sort());
    expect(selected).toHaveLength(30);
    expect(selected).not.toContain('isolated-world-clock.sql');
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
