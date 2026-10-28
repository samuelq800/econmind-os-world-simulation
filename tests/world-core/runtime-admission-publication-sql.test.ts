/** Disposable SQL permissions, not official source adoption or Owner approval.
 * Only ephemeral TEST_ONLY signatures/roles; proposal is never run remotely.
 */
import { readFile } from 'node:fs/promises';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  canonicalSerialize,
  CURRENT_REPLAY_BINDING,
  createOpeningSeed,
  createOpeningSource,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  openingSeedId,
  openingSourceId,
  worldId,
} from '@econmind/core';
import {
  OPENING_PUBLICATION_SIGNATURE_DOMAIN,
  OpeningPublicationAuthorityError,
} from '../../apps/world-worker/src/admission/private-opening-admission-authority.js';
import {
  OpeningAdmissionPublicationError,
  rethrowOpeningPublicationFailure,
} from '../../apps/world-worker/src/admission/official-opening-admission-publication.js';
import { PostgresTransactionError } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { createOfficialOpeningServerPublicationComposition } from '../../apps/world-worker/src/admission/official-opening-server-publication-composition.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';

const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const pub = 'world_v2_opening_admission_test';
const world = 'WORLD_TEST_ONLY_SQL_ADMISSION';
const sourceHash = 'a'.repeat(64);
const live: PGlite[] = [];
afterEach(async () => {
  for (const db of live.splice(0)) await db.close();
});
const read = (file: string) =>
  readFile(new URL(`../../${file}`, import.meta.url), 'utf8');

describe('publication transaction failure precedence', () => {
  const semantic = () =>
    new OpeningAdmissionPublicationError('OPENING_BINDING_MISMATCH');
  it.each(['ROLLBACK_UNCONFIRMED', 'COMMIT_OUTCOME_UNKNOWN'] as const)(
    'retains publisher %s despite a nested semantic or authority error',
    (outcome) => {
      for (const cause of [
        semantic(),
        new OpeningPublicationAuthorityError(),
      ]) {
        expect(() =>
          rethrowOpeningPublicationFailure(
            new PostgresTransactionError({ outcome, cause }),
          ),
        ).toThrow('OPENING_PUBLICATION_COMMIT_UNCONFIRMED');
      }
    },
  );
  it.each(['ROLLBACK_UNCONFIRMED', 'COMMIT_OUTCOME_UNKNOWN'] as const)(
    'retains source %s when the outer publisher rollback is confirmed',
    (outcome) => {
      const sourceError = new PostgresTransactionError({
        outcome,
        cause: semantic(),
      });
      const publisherError = new PostgresTransactionError({
        outcome: 'ROLLED_BACK',
        cause: sourceError,
      });
      expect(() => rethrowOpeningPublicationFailure(publisherError)).toThrow(
        'OPENING_PUBLICATION_COMMIT_UNCONFIRMED',
      );
    },
  );
  it('restores the original semantic and authority errors only after confirmed rollbacks', () => {
    for (const original of [
      semantic(),
      new OpeningPublicationAuthorityError(),
    ]) {
      const sourceError = new PostgresTransactionError({
        outcome: 'ROLLED_BACK',
        cause: original,
      });
      const publisherError = new PostgresTransactionError({
        outcome: 'ROLLED_BACK',
        cause: sourceError,
      });
      let reported: unknown;
      try {
        rethrowOpeningPublicationFailure(publisherError);
      } catch (error) {
        reported = error;
      }
      expect(reported).toBe(original);
    }
  });
});

async function setup() {
  const db = new PGlite();
  live.push(db);
  for (const id of [
    '0001_world_v2_namespace',
    '0002_world_v2_command_event_ledger',
    '0003_world_v2_command_receipts_outbox',
    '0007_world_v2_atomic_transition_facts',
    '0011_world_v2_current_commit_authorization',
    '0013_world_v2_read_projection_boundary',
    '0016_world_v2_opening_seed',
  ])
    await db.exec(await read(`database/migrations/artifacts/${id}.sql`));
  await db.exec(
    await read('database/proposals/runtime-read-binding-storage.sql'),
  );
  const seed = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_TEST_ONLY_SQL_ADMISSION'),
      worldId: worldId(world),
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      inventoryEntries: [],
      financialBatches: [],
      sources: [
        createOpeningSource(
          {
            schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
            sourceId: openingSourceId('SOURCE_TEST_ONLY_SQL'),
            sourceKind: 'DOCUMENTED_ASSUMPTION',
            locator: 'fixture://TEST_ONLY/sql-permissions',
            sourceVersion: 'TEST_ONLY',
            payload: { testOnly: true },
          },
          sha,
        ),
      ],
    },
    sha,
  );
  const { fingerprint, ...seedIntent } = seed;
  await db.query('insert into world_v2.world_head values($1,0,0)', [world]);
  await db.query(
    'insert into world_v2.opening_seed values($1,$2,0,$3,$4,$5,now())',
    [
      world,
      seed.seedId,
      canonicalSerialize(seed.replayBinding),
      canonicalSerialize(seedIntent),
      fingerprint,
    ],
  );
  await db.exec(
    await read('database/proposals/runtime-admission-publication.sql'),
  );
  // Fixture enrollment is separate from the candidate: it grants only four
  // function EXECUTEs, no head UPDATE, direct admission INSERT or owner role.
  await db.exec(`create role ${pub} nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
    grant usage on schema world_v2 to ${pub};
    grant execute on function world_v2.read_runtime_admission_publication_authorization(text),
      world_v2.lock_runtime_admission_publication(text,text,text),world_v2.publish_runtime_admission_publication(text,text,text),
      world_v2.read_runtime_admission_publication(text,text,text) to ${pub}`);
  const keys = generateKeyPairSync('ed25519');
  const now = Date.now();
  const claims = {
    schemaVersion: 'opening-publication-authorization-v1',
    purpose: 'AUTHORIZE_OFFICIAL_OPENING_ADMISSION_PUBLICATION',
    authorizationId: 'AUTHORIZATION_TEST_ONLY_SQL',
    keyId: 'TEST_ONLY_KEY',
    ownerIdentity: 'TEST_ONLY_NOT_OWNER',
    issuedAtReal: new Date(now - 60_000).toISOString(),
    expiresAtReal: new Date(now + 60_000).toISOString(),
    worldId: world,
    seedId: seed.seedId,
    seedFingerprint: fingerprint,
    modelVersion: CURRENT_REPLAY_BINDING.modelVersion,
    replayBinding: canonicalSerialize(CURRENT_REPLAY_BINDING),
    sourceBundleSha256: sourceHash,
  };
  const bytes = canonicalSerialize(claims),
    authorizationHash = sha(bytes);
  const signature = sign(
    null,
    Buffer.from(OPENING_PUBLICATION_SIGNATURE_DOMAIN + bytes),
    keys.privateKey,
  ).toString('base64url');
  const admin = async () => {
    // PGlite retains the latest session authorization as RESET's baseline;
    // explicitly restore this fixture's original authenticated superuser.
    await db.exec('reset role; set session authorization postgres');
  };
  const caller = async () => {
    await admin();
    await db.exec(`set session authorization ${pub}`);
  };
  const register = async () => {
    await admin();
    await db.exec('set role world_v2_admission_release');
    await db.query(
      `insert into world_v2.runtime_admission_publication_permit
      (authorization_id,authorization_sha256,canonical_authorization,signature_base64url,world_id,seed_id,seed_fingerprint,
       model_version,replay_binding,source_bundle_sha256,caller_session_role,valid_from,valid_until)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        claims.authorizationId,
        authorizationHash,
        bytes,
        signature,
        world,
        seed.seedId,
        fingerprint,
        claims.modelVersion,
        claims.replayBinding,
        sourceHash,
        pub,
        claims.issuedAtReal,
        claims.expiresAtReal,
      ],
    );
    await admin();
  };
  const args = [claims.authorizationId, authorizationHash, sourceHash];
  return { db, seed, claims, keys, args, admin, caller, register };
}

describe('exact permit SQL entry candidate under low-privilege sessions', () => {
  it('denies empty installation and hash/caller spoofing; no PUBLIC entry or direct writes', async () => {
    const s = await setup();
    await s.caller();
    await expect(
      s.db.query(
        'select world_v2.publish_runtime_admission_publication($1,$2,$3)',
        s.args,
      ),
    ).rejects.toThrow('ADMISSION_PUBLICATION_ENTRYPOINT_MISSING');
    await expect(
      s.db.exec(
        "insert into world_v2.runtime_opening_admission(world_id) values('X')",
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      s.db.exec('update world_v2.world_head set world_version=1'),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      s.db.exec(
        "insert into world_v2.runtime_admission_publication_permit(authorization_id) values('X')",
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await s.register();
    await s.caller();
    await expect(
      s.db.query(
        'select world_v2.publish_runtime_admission_publication($1,$2,$3)',
        [s.args[0], s.args[1], 'b'.repeat(64)],
      ),
    ).rejects.toThrow('ADMISSION_PUBLICATION_ENTRYPOINT_MISSING');
    await s.admin();
    await s.db.exec(`set role ${pub}`);
    await expect(
      s.db.query(
        'select world_v2.publish_runtime_admission_publication($1,$2,$3)',
        s.args,
      ),
    ).rejects.toThrow('ADMISSION_CALLER_ROLE_DENIED');
  });

  it('publishes the exact permitted zero-head seed idempotently with no head UPDATE privilege or economic effects', async () => {
    const s = await setup();
    await s.register();
    await s.caller();
    for (let n = 0; n < 2; n++)
      await s.db.query(
        'select world_v2.publish_runtime_admission_publication($1,$2,$3)',
        s.args,
      );
    const readback = await s.db.query<Record<string, unknown>>(
      'select * from world_v2.read_runtime_admission_publication($1,$2,$3)',
      s.args,
    );
    expect(readback.rows).toEqual([
      expect.objectContaining({
        admission_ref: 'ADMISSION_' + s.args[1]!.toUpperCase(),
        world_id: world,
        seed_id: s.seed.seedId,
        seed_fingerprint: s.seed.fingerprint,
      }),
    ]);
    await expect(
      s.db.query('select * from world_v2.runtime_opening_admission'),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      s.db.query(
        'select * from world_v2.read_runtime_admission_publication($1,$2,$3)',
        [s.args[0], 'f'.repeat(64), sourceHash],
      ),
    ).rejects.toThrow('ADMISSION_PUBLICATION_ENTRYPOINT_MISSING');
    await s.admin();
    expect(
      (
        await s.db.query(
          'select admission_ref,seed_id,seed_fingerprint from world_v2.runtime_opening_admission',
        )
      ).rows,
    ).toEqual([
      {
        admission_ref: 'ADMISSION_' + s.args[1]!.toUpperCase(),
        seed_id: s.seed.seedId,
        seed_fingerprint: s.seed.fingerprint,
      },
    ]);
    expect(
      (
        await s.db.query(
          'select world_version::text,event_sequence::text from world_v2.world_head',
        )
      ).rows,
    ).toEqual([{ world_version: '0', event_sequence: '0' }]);
    for (const table of [
      'authoritative_event',
      'inventory_posting',
      'financial_posting_batch',
    ])
      expect(
        (await s.db.query(`select count(*)::text as n from world_v2.${table}`))
          .rows,
      ).toEqual([{ n: '0' }]);
    expect(
      (
        await s.db.query(
          `select has_column_privilege($1,'world_v2.world_head','world_version','UPDATE') as can_update`,
          [pub],
        )
      ).rows,
    ).toEqual([{ can_update: false }]);
  });

  it('retains append-only control records, rejects advanced heads and respects release-registered revocation', async () => {
    const s = await setup();
    await s.register();
    await expect(
      s.db.exec('delete from world_v2.runtime_admission_publication_permit'),
    ).rejects.toThrow();
    await s.db.exec('update world_v2.world_head set world_version=1');
    await s.caller();
    await expect(
      s.db.query(
        'select world_v2.publish_runtime_admission_publication($1,$2,$3)',
        s.args,
      ),
    ).rejects.toThrow('ADMISSION_PERMIT_SEED_OR_HEAD_MISMATCH');
    await s.admin();
    await s.db.exec('set role world_v2_admission_release');
    await s.db.query(
      'insert into world_v2.runtime_admission_publication_revocation(authorization_id,reason_ref) values($1,$2)',
      [s.args[0], 'TEST_ONLY_REVOKED'],
    );
    await s.caller();
    await expect(
      s.db.query(
        'select * from world_v2.read_runtime_admission_publication_authorization($1)',
        [s.args[0]],
      ),
    ).rejects.toThrow('ADMISSION_PUBLICATION_ENTRYPOINT_MISSING');
  });

  it('server composition still verifies the actual signature; registry bytes/hash do not establish Owner approval', async () => {
    const s = await setup();
    await s.register();
    await s.caller();
    const database: SqlDatabase = {
      async query<Row extends object>(
        sql: string,
        values: readonly unknown[] = [],
      ) {
        const r = await s.db.query(sql, [...values]);
        return {
          rows: r.rows as Row[],
          rowCount: r.affectedRows ?? r.rows.length,
        };
      },
      async transaction() {
        throw Error('SOURCE_UNAVAILABLE_MUST_PRECEDE_SQL_WRITE');
      },
    };
    const configuration = {
      database,
      publisherRole: pub,
      sourceDatabase: { ...database },
      sourceReaderRole: 'test_admission_source_reader',
      nowReal: () => new Date().toISOString(),
      trustedKeys: new Map([
        [
          'TEST_ONLY_KEY',
          { publicKey: s.keys.publicKey, ownerIdentity: 'TEST_ONLY_NOT_OWNER' },
        ],
      ]),
      sourceLoaders: new Map(),
    };
    const composition =
      createOfficialOpeningServerPublicationComposition(configuration);
    let alternateReads = 0;
    configuration.database = {
      async query() {
        alternateReads++;
        throw Error('MUTATED_SERVER_INPUT_MUST_NOT_BE_USED');
      },
      async transaction() {
        throw Error('NO_WRITE');
      },
    };
    await expect(
      composition.publish({
        worldId: world,
        authorizationReference: s.claims.authorizationId,
      }),
    ).rejects.toMatchObject({ code: 'OPENING_SOURCE_UNAVAILABLE' });
    expect(alternateReads).toBe(0);
    const wrong = createOfficialOpeningServerPublicationComposition({
      database,
      publisherRole: pub,
      sourceDatabase: { ...database },
      sourceReaderRole: 'test_admission_source_reader',
      nowReal: () => new Date().toISOString(),
      trustedKeys: new Map([
        [
          'TEST_ONLY_KEY',
          {
            publicKey: generateKeyPairSync('ed25519').publicKey,
            ownerIdentity: 'TEST_ONLY_NOT_OWNER',
          },
        ],
      ]),
      sourceLoaders: new Map(),
    });
    await expect(
      wrong.publish({
        worldId: world,
        authorizationReference: s.claims.authorizationId,
      }),
    ).rejects.toThrow('OPENING_PUBLICATION_AUTHORIZATION_DENIED');
    await s.admin();
    expect(
      (
        await s.db.query(
          'select count(*)::text as n from world_v2.runtime_opening_admission',
        )
      ).rows,
    ).toEqual([{ n: '0' }]);
  });

  it('requires a separately provisioned source connection and role without opening any database', () => {
    const database: SqlDatabase = {
      async query() {
        throw Error('NO_DATABASE_QUERY_EXPECTED');
      },
      async transaction() {
        throw Error('NO_TRANSACTION_EXPECTED');
      },
    };
    const input = {
      database,
      publisherRole: pub,
      sourceDatabase: database,
      sourceReaderRole: 'test_admission_source_reader',
      nowReal: () => new Date().toISOString(),
      trustedKeys: new Map(),
      sourceLoaders: new Map(),
    };
    expect(() =>
      createOfficialOpeningServerPublicationComposition(input),
    ).toThrow('OPENING_SERVER_SEPARATE_SOURCE_DATABASE_REQUIRED');
    expect(() =>
      createOfficialOpeningServerPublicationComposition({
        ...input,
        sourceDatabase: { ...database },
        sourceReaderRole: pub,
      }),
    ).toThrow('OPENING_SERVER_SEPARATE_SOURCE_DATABASE_REQUIRED');
    expect(() =>
      createOfficialOpeningServerPublicationComposition({
        ...input,
        sourceDatabase: { ...database },
        sourceReaderRole: 'pg_read_all_data',
      }),
    ).toThrow('OPENING_PUBLISHER_ROLE_DENIED');
  });

  it('replays the stored canonical seed in stable READ ONLY mode without a head row lock; existing writer replay still locks', async () => {
    const s = await setup();
    const statements: string[] = [];
    const database: SqlDatabase = {
      async query<Row extends object>(
        statement: string,
        parameters: readonly unknown[] = [],
      ) {
        statements.push(statement);
        const r = await s.db.query(statement, [...parameters]);
        return {
          rows: r.rows as Row[],
          rowCount: r.affectedRows ?? r.rows.length,
        };
      },
      async transaction() {
        throw Error('SUPPLIED_EXECUTOR_ONLY');
      },
    };
    const reader = new DurableV08LedgerLineageReader({
      database,
      sha256Hex: sha,
    });
    await s.db.exec('begin isolation level repeatable read read only');
    try {
      const lineage = await reader.rebuildReadOnlyFrom(database, world);
      expect(lineage.ledgers.seedFingerprint).toBe(s.seed.fingerprint);
      expect(lineage.headWorldVersion).toBe('0');
      expect(lineage.headEventSequence).toBe('0');
      expect(statements.some((sql) => /for\s+share/iu.test(sql))).toBe(false);
    } finally {
      await s.db.exec('rollback');
    }
    statements.length = 0;
    await reader.rebuildFrom(database, world);
    expect(
      statements.some((sql) =>
        /from world_v2.world_head\s+where world_id = \$1\s+for share/iu.test(
          sql,
        ),
      ),
    ).toBe(true);
  });

  it('refuses READ COMMITTED and writable replay before reading seed or ledger tables', async () => {
    const s = await setup();
    let tableReads = 0;
    const database: SqlDatabase = {
      async query<Row extends object>(statement: string) {
        if (statement.includes('world_v2.')) tableReads++;
        const result = await s.db.query(statement);
        return { rows: result.rows as Row[], rowCount: result.rows.length };
      },
      async transaction() {
        throw Error('SUPPLIED_EXECUTOR_ONLY');
      },
    };
    const reader = new DurableV08LedgerLineageReader({
      database,
      sha256Hex: sha,
    });
    for (const mode of [
      'read committed read only',
      'repeatable read read write',
    ]) {
      await s.db.exec(`begin isolation level ${mode}`);
      try {
        await expect(
          reader.rebuildReadOnlyFrom(database, world),
        ).rejects.toThrow('requires a stable READ ONLY transaction');
      } finally {
        await s.db.exec('rollback');
      }
    }
    expect(tableReads).toBe(0);
  });
});
