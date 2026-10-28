/** SQL protocol unit checks only; native locks require the separate PG rehearsal. */
import { describe, it, expect } from 'vitest';
import {
  createPostgresSocialOperatingCustody,
  createPostgresSocialOperatingLineageExecutor,
  createPostgresSocialOperatingSourcePublisher,
  SOCIAL_CUSTODY_SESSION_QUERY,
  SOCIAL_OPERATING_CUSTODY_ROLES,
} from '../../apps/world-worker/src/persistence/postgres-social-operating-custody.js';
import {
  SOCIAL_SOURCE_MATERIAL_PATHS,
  type SocialOperatingSnapshotRequest,
} from '../../apps/world-worker/src/persistence/social-employment-source-input.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
const request: SocialOperatingSnapshotRequest = {
  publicationHead: {
    worldId: 'WORLD_TEST_CUSTODY',
    worldVersion: '0',
    eventSequence: '0',
  },
  worldBinding: {
    seedId: 'SEED_TEST_CUSTODY',
    seedFingerprint: `sha256:${'1'.repeat(64)}`,
    modelVersion: 'V1',
    replayBindingFingerprint: `sha256:${'2'.repeat(64)}`,
  },
  purpose: 'SOCIAL_EMPLOYMENT_SERVICE_PLAN_SOURCE_EVALUATION_V1',
  commandBinding: {
    commandId: 'COMMAND_TEST',
    commandFingerprint: `sha256:${'3'.repeat(64)}`,
    countryId: 'COUNTRY_01',
    locationId: 'REGION_01_E1',
    skill: 'HIGH',
    positionId: 'POSITION_TEST',
    servicePoolId: 'POOL_TEST',
    dueDayIndex: '0',
    simTime: '1000',
  },
  requiredMaterialPaths: SOCIAL_SOURCE_MATERIAL_PATHS,
};
function fixture(overrides: Record<string, unknown> = {}) {
  const seen: string[] = [];
  const executor: SqlExecutor = {
    async query<Row extends object>(sql: string) {
      seen.push(sql);
      if (sql === SOCIAL_CUSTODY_SESSION_QUERY)
        return {
          rowCount: 1,
          rows: [
            {
              role_name: SOCIAL_OPERATING_CUSTODY_ROLES.reader,
              rolsuper: false,
              rolbypassrls: false,
              rolcreaterole: false,
              rolcreatedb: false,
              rolreplication: false,
              isolation: 'repeatable read',
              read_only: 'off',
              publisher_member: false,
              owner_member: false,
              ...overrides,
            },
          ] as unknown as Row[],
        };
      if (sql.includes('lock_social_operating_source'))
        return { rowCount: 0, rows: [] };
      throw Error('unexpected SQL protocol');
    },
  };
  const database: SqlDatabase = {
    query: executor.query,
    transaction: async (op) => op(executor),
  };
  return { executor, database, seen };
}
describe('fixed PostgreSQL Social operating custody fail-closed boundary', () => {
  it('delegates only the exact D head lock to real SQL, without fabricating rows or granting UPDATE', async () => {
    const seen: { sql: string; args: readonly unknown[] }[] = [];
    const actualRows = {
      rowCount: 1,
      rows: [{ world_version: '3', event_sequence: '4' }],
    };
    const tx: SqlExecutor = {
      async query<Row extends object>(
        sql: string,
        args: readonly unknown[] = [],
      ) {
        seen.push({ sql, args });
        return actualRows as unknown as { rowCount: number; rows: Row[] };
      },
    };
    const ex = createPostgresSocialOperatingLineageExecutor(tx, {
      worldId: 'WORLD_TEST',
      countryId: 'COUNTRY_01',
    });
    expect(
      await ex.query(
        'select world_version, event_sequence from world_v2.world_head where world_id = $1 for share',
        ['WORLD_TEST'],
      ),
    ).toBe(actualRows);
    expect(seen).toEqual([
      {
        sql: 'select world_version,event_sequence from world_v2.lock_social_operating_lineage_head($1,$2)',
        args: ['WORLD_TEST', 'COUNTRY_01'],
      },
    ]);
    await expect(
      ex.query(
        'select world_version, event_sequence from world_v2.world_head where world_id = $1 for share',
        ['WORLD_OTHER'],
      ),
    ).rejects.toThrow('scope differs');
    expect(seen).toHaveLength(1);
    await ex.query('select test_marker', []);
    expect(seen[1]!.sql).toBe('select test_marker');
  });

  it('requires actual separated runtime role and stable outer transaction before source queries', async () => {
    for (const overrides of [
      { role_name: 'service_role' },
      { rolsuper: true },
      { rolbypassrls: true },
      { rolcreaterole: true },
      { publisher_member: true },
      { owner_member: true },
      { isolation: 'read committed' },
      { read_only: 'on' },
    ]) {
      const f = fixture(overrides);
      let used = false;
      await expect(
        createPostgresSocialOperatingCustody({
          database: f.database,
        }).withSnapshotFrom(f.executor, request, async () => {
          used = true;
        }),
      ).rejects.toThrow('separated role');
      expect(used).toBe(false);
      expect(f.seen).toHaveLength(1);
    }
  });
  it('does not turn a ready callback into source admission when registered SQL issuer/admission is absent', async () => {
    const f = fixture();
    let used = false;
    await expect(
      createPostgresSocialOperatingCustody({
        database: f.database,
      }).withSnapshotFrom(f.executor, request, async () => {
        used = true;
        return 'READY';
      }),
    ).rejects.toThrow('real registered');
    expect(used).toBe(false);
    expect(f.seen[1]).toContain('lock_social_operating_source');
  });
  it('refuses wrong material purpose and paths before touching original registry', async () => {
    const f = fixture();
    await expect(
      createPostgresSocialOperatingCustody({
        database: f.database,
      }).withSnapshotFrom(
        f.executor,
        { ...request, requiredMaterialPaths: [] },
        async () => true,
      ),
    ).rejects.toThrow('closed Social');
    expect(f.seen).toHaveLength(1);
  });
  it('does not let the runtime reader publish or revoke source originals', async () => {
    const f = fixture(),
      publisher = createPostgresSocialOperatingSourcePublisher({
        database: f.database,
      });
    await expect(
      publisher.registerWorldFrom(f.executor, { worldId: 'WORLD_TEST' }),
    ).rejects.toThrow('separated role');
    await expect(
      publisher.registerFrom(f.executor, {
        worldId: 'WORLD_TEST',
        countryId: 'COUNTRY_01',
      }),
    ).rejects.toThrow('separated role');
    await expect(
      publisher.revokeFrom(f.executor, {
        worldId: 'WORLD_TEST',
        countryId: 'COUNTRY_01',
        reasonRef: 'REVOKED_TEST',
      }),
    ).rejects.toThrow('separated role');
    expect(f.seen.every((s) => s === SOCIAL_CUSTODY_SESSION_QUERY)).toBe(true);
  });
});
