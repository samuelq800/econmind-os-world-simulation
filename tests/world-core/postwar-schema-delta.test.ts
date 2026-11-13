/** SQL artifact/recovery checks only. No DB or approved migration is created. */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import {
  classifyDeltaTransaction,
  createUnapprovedSchemaDeltaPlan,
  createUnapprovedSchemaForwardPlan,
  createUnapprovedPendingTargetForwardPlan,
  createUnapprovedLogisticsV2UtilityForwardPlan,
  LOGISTICS_V2_UTILITY_FORWARD_MANIFEST_PATH,
  PENDING_TARGET_FORWARD_MANIFEST_PATH,
  preparePostwarSchemaDelta,
} from '../../tools/office-connection/postwar-schema-delta.mjs';
const sha = (v: Buffer) => createHash('sha256').update(v).digest('hex');
// Explicit source inventory: companion fixed 85-proposal policy, with its
// isolated Clock deliberately excluded. New proposals require an explicit
// inventory update; never accept an arbitrary directory count or widen scope.
const EXPECTED_NON_CLOCK_PROPOSALS = Object.freeze([
  'captain-operating-custody.sql',
  'central-bank-omo-custody.sql',
  'central-bank-omo-history-read.sql',
  'current-authorization-writer-preparation.sql',
  'finance-budget-capacity-source.sql',
  'finance-budget-custody.sql',
  'finance-budget-mixed-source.sql',
  'financial-posting-decimal-validation.sql',
  'postwar-beneficial-housing-rent-custody.sql',
  'postwar-beneficial-rent-social-publication.sql',
  'postwar-bounded-journal-read.sql',
  'postwar-bounded-prefix-read.sql',
  'postwar-bounded-prefix-pages.sql',
  'postwar-captain-current-derived-read.sql',
  'postwar-captain-h0-current.sql',
  'postwar-captain-intake-binding.sql',
  'postwar-captain-mixed-read.sql',
  'postwar-captain-source-publication.sql',
  'postwar-central-bank-intake-binding.sql',
  'postwar-complete-opening-inventory-read-repair.sql',
  'postwar-day-one-fx-custody.sql',
  'postwar-day-one-fx-history-read.sql',
  'postwar-finance-social-source-publication.sql',
  'postwar-financial-current-derived-read.sql',
  'postwar-industry-operating-receipts.sql',
  'postwar-industry-production-source.sql',
  'postwar-industry-first-day-source.sql',
  'postwar-industry-power-service-source.sql',
  'postwar-industry-power-service-current.sql',
  'postwar-industry-water-service-source.sql',
  'postwar-industry-utility-custody.sql',
  'postwar-industry-logistics-custody.sql',
  'postwar-industry-logistics-v2-utility-forward.sql',
  'postwar-mixed-industry-utility-effects.sql',
  'postwar-trade-current-projection.sql',
  'postwar-industry-intake-binding.sql',
  'postwar-industry-labour-current-read.sql',
  'postwar-paged-office-history-originals.sql',
  'postwar-narrow-trade-paged-source.sql',
  'postwar-beneficial-rent-paged-custody.sql',
  'postwar-captain-paged-scope.sql',
  'central-bank-omo-paged-custody.sql',
  'postwar-mixed-beneficial-rent-current-effects.sql',
  'postwar-mixed-current-projection-read.sql',
  'postwar-mixed-goods-omo-current-effects.sql',
  'postwar-mixed-financial-current-publication.sql',
  'postwar-narrow-trade-automatic-source.sql',
  'postwar-narrow-trade-current-source.sql',
  'postwar-narrow-trade-history-read.sql',
  'postwar-narrow-trade-intake-binding.sql',
  'postwar-narrow-trade-source.sql',
  'postwar-office-derived-read.sql',
  'postwar-office-opening-read-base-repair.sql',
  'postwar-office-recovery-read.sql',
  'postwar-physical-inventory-provenance.sql',
  'postwar-physical-opening-facts-read.sql',
  'postwar-runtime-source-read-policy.sql',
  'postwar-social-current-derived-read.sql',
  'postwar-social-current-prefix-read.sql',
  'postwar-social-employment-creation.sql',
  'postwar-social-mixed-match-publisher.sql',
  'postwar-social-startup-seed-header.sql',
  'runtime-admission-publication.sql',
  'runtime-read-binding-storage.sql',
  'social-intake-authorization.sql',
  'social-operating-custody.sql',
  'social-operating-match-publisher.sql',
  'world-actor-identity-registry.sql',
  'world-command-execution-registration.sql',
  'postwar-industry-wage-publication.sql',
  'postwar-industry-paid-work-read.sql',
  'postwar-industry-run-parameters-read.sql',
  'postwar-mixed-industry-current-effects.sql',
  'postwar-industry-opening-production-validation.sql',
  'postwar-social-match-prefix-pages.sql',
  'postwar-social-paged-match-publisher.sql',
  'postwar-paged-current-projection.sql',
  'postwar-pending-programme-target-prefix.sql',
  'postwar-industry-run-custody.sql',
  'postwar-industry-run-history.sql',
  'postwar-industry-work-custody.sql',
  'postwar-industry-work-publication.sql',
  'postwar-industry-wage-history.sql',
  'postwar-source-revocation-fence.sql',
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
  it('packages only the exact additive Trade CHECK replacement and still rejects other DROP operations', () => {
    const extension =
      "alter table world_v2.postwar_paged_current_document drop constraint postwar_paged_current_document_office_id_check;\nalter table world_v2.postwar_paged_current_document add constraint postwar_paged_current_document_office_id_check check(office_id in('FINANCE','CENTRAL_BANK','SOCIAL','CAPTAIN','TRADE'));";
    expect(
      classifyDeltaTransaction(
        Buffer.from('begin;\n' + extension + '\ncommit;'),
      ).sourceEnvelope,
    ).toBe('SOURCE_BEGIN_COMMIT');
    for (const changed of [
      extension.split('\n')[0]!,
      extension.replace(",'CAPTAIN'", ''),
      extension.replace(/postwar_paged_current_document/g, 'another_document'),
      extension.replace("'TRADE'", "'UNAPPROVED_OFFICE'"),
      extension + '\ndrop table world_v2.postwar_paged_current_document;',
    ])
      expect(() =>
        classifyDeltaTransaction(
          Buffer.from('begin;\n' + changed + '\ncommit;'),
        ),
      ).toThrow('DESTRUCTIVE_CREDENTIAL_OR_NONTRANSACTIONAL_SQL_DENIED');
  });
  it('classifies the complete eighty-four non-Clock source proposal paths without running or editing SQL', async () => {
    const directory = new URL('../../database/proposals/', import.meta.url),
      names = await readdir(directory);
    const selected = names
      .filter((n) => n.endsWith('.sql') && n !== 'isolated-world-clock.sql')
      .sort();
    expect(selected).toEqual([...EXPECTED_NON_CLOCK_PROPOSALS].sort());
    expect(selected).toHaveLength(84);
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

describe('fixed pending-programme and target forward packaging', () => {
  it('accepts the fixed forward CLI selector before checking source paths', () => {
    const result = spawnSync(
      process.execPath,
      [
        new URL(
          '../../tools/office-connection/postwar-schema-delta.mjs',
          import.meta.url,
        ).pathname,
        '--source-root',
        'relative-source',
        '--candidate-sha',
        '1'.repeat(40),
        '--companion-root',
        'relative-companion',
        '--output-directory',
        'relative-output',
        '--forward-manifest',
        PENDING_TARGET_FORWARD_MANIFEST_PATH,
      ],
      { encoding: 'utf8' },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ABSOLUTE_PATHS_REQUIRED');
    expect(result.stderr).not.toContain(
      'ONLY_SOURCE_SHA_COMPANION_FRESH_OUTPUT_ARGUMENTS_ALLOWED',
    );
  });
  async function forwardFixture() {
    const f = fixture();
    const manifest = await readFile(
      new URL('../../' + PENDING_TARGET_FORWARD_MANIFEST_PATH, import.meta.url),
    );
    const declared = JSON.parse(manifest.toString('utf8'));
    const sql = await readFile(
      new URL('../../' + declared.sqlPath, import.meta.url),
    );
    for (const file of Object.keys(declared.requiredPredecessorFiles))
      f.sources.set(
        file,
        await readFile(new URL('../../' + file, import.meta.url)),
      );
    f.sources.set(declared.sqlPath, sql);
    f.candidate.pins.proposals.push({
      id: 'postwar-pending-programme-target-prefix',
      path: declared.sqlPath,
      disposition: 'CANDIDATE_FIXED_GUARDED_FORWARD',
      dependencies: ['delta-b'],
      baselineDependencies: ['BASELINE_001'],
      createdRelations: [],
      createdRoles: [],
      reusedRoles: [],
      definedFunctions: [],
      renamedFunctions: [],
      sha256: sha(sql),
    });
    return { ...f, manifest, declared, sql };
  }
  it('packages only the guarded increment while retaining exact installed preconditions and stopping ambiguous replay', async () => {
    const f = await forwardFixture();
    const result = createUnapprovedPendingTargetForwardPlan(
      f.candidate,
      f.sources,
      f.manifest,
    );
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]!.transaction).toEqual(f.sql);
    expect(result.chunks[0]!.entry.transactionPath).toBe(
      'transactions/01-postwar-pending-programme-target-prefix.sql',
    );
    expect(result.manifest).toMatchObject({
      installationAllowed: false,
      productionApproval: 'NOT_GRANTED',
      databaseOperations: 0,
      networkRequests: 0,
      isolatedClockSqlIncluded: false,
      packagedProposalCount: 1,
      replacedExistingFunctionCount: 7,
      newFunctionCount: 3,
      requiredInstalledProposalIds: ['delta-a', 'delta-b'],
    });
    expect(result.chunks[0]!.entry.preconditions).toMatchObject({
      functions: f.declared.replacedFunctions,
      newFunctionsMustBeAbsent: f.declared.newFunctions,
      successors: f.declared.successorFunctions,
      replay: 'ALREADY_APPLIED_STOP_INSPECT_NO_RETRY',
      schemaAcl: 'REQUIRE_UNCHANGED_AFTER_TEMPORARY_CREATE',
    });
  });
  it('rejects altered manifest, SQL even if repinned by a caller, and changed prerequisite source bytes', async () => {
    const f = await forwardFixture();
    expect(() =>
      createUnapprovedPendingTargetForwardPlan(
        f.candidate,
        f.sources,
        Buffer.concat([f.manifest, Buffer.from('\n')]),
      ),
    ).toThrow('EXACT_PENDING_TARGET_FORWARD_MANIFEST_REQUIRED');
    const changed = Buffer.concat([f.sql, Buffer.from('\n-- changed')]);
    f.sources.set(f.declared.sqlPath, changed);
    f.candidate.pins.proposals.at(-1)!.sha256 = sha(changed);
    expect(() =>
      createUnapprovedPendingTargetForwardPlan(
        f.candidate,
        f.sources,
        f.manifest,
      ),
    ).toThrow('EXACT_PENDING_TARGET_FORWARD_SOURCE_REQUIRED');
    f.sources.set(f.declared.sqlPath, f.sql);
    f.candidate.pins.proposals.at(-1)!.sha256 = sha(f.sql);
    const prerequisite = Object.keys(f.declared.requiredPredecessorFiles)[0]!;
    f.sources.set(prerequisite, Buffer.from('-- wrong predecessor'));
    expect(() =>
      createUnapprovedPendingTargetForwardPlan(
        f.candidate,
        f.sources,
        f.manifest,
      ),
    ).toThrow('PENDING_TARGET_PREDECESSOR_SOURCE_DIFFERS');
  });
});

describe('explicit logistics function-only forward packaging', () => {
  async function forwardFixture() {
    const manifestBytes = await readFile(
      new URL(
        '../../database/upgrades/postwar-industry-logistics-multicountry-scope.manifest.json',
        import.meta.url,
      ),
    );
    const forward = JSON.parse(manifestBytes.toString());
    const bytes = await readFile(
      new URL('../../' + forward.upgrade.path, import.meta.url),
    );
    const f = fixture();
    f.candidate.pins.proposals.push({
      ...f.candidate.pins.proposals[0]!,
      id: 'postwar-industry-logistics-custody',
      sha256: forward.targetProposalSha256,
    });
    f.candidate.pins.proposals.push({
      ...f.candidate.pins.proposals[0]!,
      id: 'postwar-source-revocation-fence',
    });
    return {
      ...f,
      forward,
      manifestSha256: sha(manifestBytes),
      bytes,
      sources: new Map([[forward.upgrade.path, bytes]]),
    };
  }
  it('packages the exact independent forward and both existing function targets without altering fresh selection', async () => {
    const f = await forwardFixture();
    const p = createUnapprovedSchemaForwardPlan(
      f.candidate,
      f.forward,
      f.sources,
      f.manifestSha256,
    );
    expect(p.chunks).toHaveLength(1);
    expect(p.chunks[0]!.source).toEqual(f.bytes);
    expect(p.chunks[0]!.transaction).toEqual(f.bytes);
    expect(p.manifest).toMatchObject({
      installationAllowed: false,
      databaseOperations: 0,
      networkRequests: 0,
      packagedProposalCount: 0,
      packagedForwardCount: 1,
      historicalUpgradeManifestsModified: false,
      freshProposalSqlIncluded: false,
      mutuallyExclusiveWith: 'FRESH_SCHEMA_DELTA_FROM_SAME_CANDIDATE',
    });
    expect(p.chunks[0]!.entry.preconditions.functions).toEqual(
      f.forward.upgrade.functions,
    );
    expect(p.chunks[0]!.entry.preconditions.functions).toHaveLength(2);
    expect(p.chunks[0]!.entry.recovery.uncertainCommit).toContain(
      'UNKNOWN_STOP_NO_RETRY',
    );
    const old = fixture();
    expect(
      createUnapprovedSchemaDeltaPlan(old.candidate, old.sources).chunks.map(
        (c) => c.entry.id,
      ),
    ).toEqual(['delta-a', 'delta-b']);
  });
  it('refuses changed forward SQL bytes or a different fresh custody source', async () => {
    const f = await forwardFixture();
    f.sources.set(
      f.forward.upgrade.path,
      Buffer.concat([f.bytes, Buffer.from('\n--changed')]),
    );
    expect(() =>
      createUnapprovedSchemaForwardPlan(
        f.candidate,
        f.forward,
        f.sources,
        f.manifestSha256,
      ),
    ).toThrow('FORWARD_SOURCE_ARTIFACT_HASH_DIFFERS');
    f.sources.set(f.forward.upgrade.path, f.bytes);
    f.forward.targetProposalSha256 = '0'.repeat(64);
    expect(() =>
      createUnapprovedSchemaForwardPlan(
        f.candidate,
        f.forward,
        f.sources,
        f.manifestSha256,
      ),
    ).toThrow('EXPLICIT_PINNED_LOGISTICS_FORWARD_REQUIRED');
  });
  it('refuses function, owner, ACL and old/new hash metadata drift', async () => {
    for (const field of [
      'qualifiedSignature',
      'owner',
      'oldBodySha256',
      'newBodySha256',
      'executeRoles',
    ]) {
      const f = await forwardFixture();
      f.forward.upgrade.functions[0][field] =
        field === 'executeRoles'
          ? ['world_v2_social_source_reader']
          : 'changed';
      expect(() =>
        createUnapprovedSchemaForwardPlan(
          f.candidate,
          f.forward,
          f.sources,
          f.manifestSha256,
        ),
      ).toThrow('EXACT_TWO_EXISTING_LOGISTICS_FUNCTION_TARGETS_REQUIRED');
    }
  });
  it('refuses unrelated or install-approved manifests rather than guessing target database version', async () => {
    for (const field of ['id', 'schemaVersion', 'installationAllowed']) {
      const f = await forwardFixture();
      f.forward[field] = field === 'installationAllowed' ? true : 'other';
      expect(() =>
        createUnapprovedSchemaForwardPlan(
          f.candidate,
          f.forward,
          f.sources,
          f.manifestSha256,
        ),
      ).toThrow('EXPLICIT_PINNED_LOGISTICS_FORWARD_REQUIRED');
    }
  });
});

describe('fixed logistics V2 utility forward', () => {
  async function prepare() {
    const f = fixture();
    const manifest = await readFile(
      new URL(
        '../../' + LOGISTICS_V2_UTILITY_FORWARD_MANIFEST_PATH,
        import.meta.url,
      ),
    );
    const declared = JSON.parse(manifest.toString('utf8'));
    const sql = await readFile(
      new URL('../../' + declared.sqlPath, import.meta.url),
    );
    for (const file of Object.keys(declared.requiredPredecessorFiles))
      f.sources.set(
        file,
        await readFile(new URL('../../' + file, import.meta.url)),
      );
    f.sources.set(declared.sqlPath, sql);
    f.candidate.pins.proposals.push({
      id: 'postwar-industry-logistics-v2-utility-forward',
      path: declared.sqlPath,
      disposition: 'CANDIDATE_EXACT_FORWARD',
      dependencies: ['delta-b'],
      baselineDependencies: ['BASELINE_001'],
      createdRelations: [],
      createdRoles: [],
      reusedRoles: [],
      definedFunctions: [],
      renamedFunctions: [],
      sha256: sha(sql),
    });
    return { ...f, manifest, declared, sql };
  }
  it('changes only the exact BOOK policy predicate and preserves all other authoritative source checks', async () => {
    const f = await prepare();
    const original = f.sources
      .get('database/proposals/postwar-mixed-industry-utility-effects.sql')!
      .toString();
    const oldBody = original
      .split(
        'create function world_v2.postwar_mixed_industry_utility_group(',
      )[1]!
      .split('as $$')[1]!
      .split('$$;')[0]!;
    const newBody = f.sql
      .toString()
      .split('AS $function$')[1]!
      .split('$function$')[0]!;
    const oldPredicate =
      "book->'source'->>'policyVersion'is distinct from'INDUSTRY_INTERNAL_LOGISTICS_FIRST_DAY_20261101_V1'";
    const newPredicate =
      '(' +
      oldPredicate +
      "and book->'source'->>'policyVersion'is distinct from'INDUSTRY_INTERNAL_LOGISTICS_MULTICOUNTRY_FIRST_DAY_20261108_V2')";
    expect(oldBody.split(oldPredicate)).toHaveLength(2);
    expect(newBody).toBe(oldBody.replace(oldPredicate, newPredicate));
    const plan = createUnapprovedLogisticsV2UtilityForwardPlan(
      f.candidate,
      f.sources,
      f.manifest,
    );
    expect(plan.chunks).toHaveLength(1);
    expect(plan.chunks[0]!.transaction).toEqual(f.sql);
    expect(plan.manifest).toMatchObject({
      installationAllowed: false,
      databaseOperations: 0,
      replacedExistingFunctionCount: 1,
      newFunctionCount: 0,
      requiredInstalledProposalIds: ['delta-a', 'delta-b'],
    });
  });
  it('rejects changed SQL, manifest and predecessor bytes without accepting caller repinning', async () => {
    const f = await prepare();
    expect(() =>
      createUnapprovedLogisticsV2UtilityForwardPlan(
        f.candidate,
        f.sources,
        Buffer.concat([f.manifest, Buffer.from(' ')]),
      ),
    ).toThrow('EXACT_LOGISTICS_V2_UTILITY_FORWARD_MANIFEST_REQUIRED');
    const changed = Buffer.concat([f.sql, Buffer.from('\n-- altered')]);
    f.sources.set(f.declared.sqlPath, changed);
    f.candidate.pins.proposals.at(-1)!.sha256 = sha(changed);
    expect(() =>
      createUnapprovedLogisticsV2UtilityForwardPlan(
        f.candidate,
        f.sources,
        f.manifest,
      ),
    ).toThrow('EXACT_LOGISTICS_V2_UTILITY_FORWARD_SOURCE_REQUIRED');
    f.sources.set(f.declared.sqlPath, f.sql);
    f.candidate.pins.proposals.at(-1)!.sha256 = sha(f.sql);
    f.sources.set(
      Object.keys(f.declared.requiredPredecessorFiles)[0]!,
      Buffer.from('-- wrong'),
    );
    expect(() =>
      createUnapprovedLogisticsV2UtilityForwardPlan(
        f.candidate,
        f.sources,
        f.manifest,
      ),
    ).toThrow('LOGISTICS_V2_UTILITY_PREDECESSOR_SOURCE_DIFFERS');
  });
  it('dispatches the fixed CLI selector before source path checks', () => {
    const result = spawnSync(
      process.execPath,
      [
        new URL(
          '../../tools/office-connection/postwar-schema-delta.mjs',
          import.meta.url,
        ).pathname,
        '--source-root',
        'relative',
        '--candidate-sha',
        '1'.repeat(40),
        '--companion-root',
        'relative',
        '--output-directory',
        'relative',
        '--forward-manifest',
        LOGISTICS_V2_UTILITY_FORWARD_MANIFEST_PATH,
      ],
      { encoding: 'utf8' },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ABSOLUTE_PATHS_REQUIRED');
  });
});
