/** Actual immutable 70-country full-E03 reference clone. No bootstrap, new
 * signature/key, fabricated vacancy, production registration or Clock. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { describe, it, expect } from 'vitest';
import { canonicalHashInput } from '@econmind/core';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
} from '../support/postwar-native-reference-db.js';
import {
  createPostgresSocialOperatingSourcePublisher,
  createPostgresSocialOperatingCustody,
} from '../../apps/world-worker/src/persistence/postgres-social-operating-custody.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import {
  SOCIAL_SOURCE_MATERIAL_PATHS,
  type SocialOperatingSnapshotRequest,
} from '../../apps/world-worker/src/persistence/social-employment-source-input.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const descriptor = process.env.ECONMIND_SOCIAL_CUSTODY_REFERENCE;
const native = descriptor ? describe : describe.skip;
const root = path.resolve(import.meta.dirname, '../..');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function executor(client: PoolClient): SqlExecutor {
  return {
    async query<Row extends object>(
      sql: string,
      args: readonly unknown[] = [],
    ) {
      const result = await client.query<Row>(sql, [...args]);
      return { rows: result.rows, rowCount: result.rowCount };
    },
  };
}
native('actual full-reference Social custody', () => {
  it('registers all real source countries, rejects absent actual vacancy and then revoked originals under distinct fixed roles', async () => {
    const marker = await loadPostwarNativeReferenceMarker(descriptor!);
    const clone = await clonePostwarNativeReference(marker, 'social_custody');
    const token = randomUUID().replaceAll('-', '').slice(0, 10);
    const publisherLogin = `social_ref_pub_${token}`,
      readerLogin = `social_ref_read_${token}`;
    const evidenceDirectory =
      process.env.ECONMIND_SOCIAL_CUSTODY_REFERENCE_EVIDENCE_DIR ??
      '/workspace/office-connection-evidence/postwar-social-custody-reference-20261028';
    const evidence: Record<string, unknown> = {
      classification:
        'TEST_ONLY_ACTUAL_70_COUNTRY_FULL_E03_NATIVE_NOT_PRODUCTION',
      referenceMarker: descriptor,
      worldId: marker.worldId,
      seedFingerprint: marker.seedFingerprint,
      actualOwnerAdmission: false,
      commandExecution: 'NOT_RUN_NO_ACTUAL_VACANCY',
      WorldClock: false,
      gates: {},
    };
    const pools: Pool[] = [];
    const open = (user: string) => {
      const p = new Pool({
        host: marker.socket,
        port: marker.port,
        database: clone.database,
        user,
        max: 1,
      });
      p.on('error', () => {});
      pools.push(p);
      return p;
    };
    const withRole = async <T>(
      pool: Pool,
      role: string,
      consume: (tx: SqlExecutor) => Promise<T>,
    ) => {
      const c = await pool.connect();
      try {
        await c.query('begin isolation level repeatable read');
        await c.query(`set local role ${role}`);
        await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
          marker.subject,
        ]);
        const result = await consume(executor(c));
        await c.query('commit');
        return result;
      } finally {
        await c.query('rollback').catch(() => {});
        c.release();
      }
    };
    try {
      const ddl = await readFile(
        path.join(root, 'database/proposals/social-operating-custody.sql'),
        'utf8',
      );
      await clone.installer.query(ddl);
      evidence.proposalSha256 = sha(ddl);
      // TEST_ONLY transport enrollment is separate from any production host.
      await clone.installer
        .query(`create role ${publisherLogin} login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
        create role ${readerLogin} login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
        grant world_v2_social_source_publisher to ${publisherLogin};grant world_v2_social_source_reader to ${readerLogin};
        grant select on world_v2.opening_seed to world_v2_social_source_publisher,world_v2_social_source_reader;
        create policy social_ref_publisher_exact_seed on world_v2.opening_seed for select to world_v2_social_source_publisher using(world_id='${marker.worldId}');
        create policy social_ref_reader_exact_seed on world_v2.opening_seed for select to world_v2_social_source_reader using(world_id='${marker.worldId}');
        grant select on world_v2.world_head,world_v2.authoritative_event,world_v2.command_receipt,world_v2.command_submission,world_v2.inventory_posting,world_v2.financial_posting_batch to world_v2_social_source_reader;
        `);
      const pub = open(publisherLogin),
        read = open(readerLogin);
      const database = new PostgresSqlDatabase(pub);
      const publisher = createPostgresSocialOperatingSourcePublisher({
        database,
      });
      console.info('SOCIAL_REFERENCE_STAGE: actual full-E03 batch publisher');
      const result = await withRole(
        pub,
        'world_v2_social_source_publisher',
        (tx) => publisher.registerWorldFrom(tx, { worldId: marker.worldId }),
      );
      expect(result.registrations).toHaveLength(70);
      expect(new Set(result.registrations.map((r) => r.country_id)).size).toBe(
        70,
      );
      expect(
        result.registrations.every(
          (r) =>
            r.seed_fingerprint === marker.seedFingerprint &&
            r.admission_ref === marker.admissionRef,
        ),
      ).toBe(true);
      evidence.registrations = result.registrations;
      evidence.registeredCountryCount = result.registrations.length;
      console.info(
        'SOCIAL_REFERENCE_STAGE: 70 registered; actual canonical vacancy inventory',
      );
      const inventory = (
        await clone.installer.query(
          `with original as (
        select (x->>'canonicalPayload')::jsonb as p from world_v2.opening_seed s,
        lateral jsonb_array_elements(s.canonical_payload::jsonb->'sources')x
        where s.world_id=$1 and (x->>'canonicalPayload')::jsonb->>'schemaVersion'='postwar-operating-genesis-seed-source-v1'
      ) select c->>'countryId' as country_id,c->>'vacancyStatus' as vacancy_status,
        jsonb_array_length(c->'offers') as offers,
        c->'state'->'labour'->'positions'->0 as first_position from original,lateral jsonb_array_elements(p->'carrier'->'socialEmployment'->'countries')c order by c->>'countryId'`,
          [marker.worldId],
        )
      ).rows;
      expect(inventory).toHaveLength(70);
      expect(
        inventory.every(
          (r) => r.vacancy_status === 'NO_ACTUAL_VACANCY' && r.offers === 0,
        ),
      ).toBe(true);
      evidence.countryVacancies = inventory.map(
        ({ country_id, vacancy_status, offers }) => ({
          country_id,
          vacancy_status,
          offers,
        }),
      );
      const first = inventory[0].first_position;
      expect(first.positionId).toBeTypeOf('string');
      const replay = (
        await clone.installer.query(
          'select replay_binding from world_v2.opening_seed where world_id=$1',
          [marker.worldId],
        )
      ).rows[0].replay_binding;
      const binding = typeof replay === 'string' ? JSON.parse(replay) : replay;
      const request: SocialOperatingSnapshotRequest = {
        purpose: 'SOCIAL_EMPLOYMENT_SERVICE_PLAN_SOURCE_EVALUATION_V1',
        publicationHead: {
          worldId: marker.worldId,
          worldVersion: '0',
          eventSequence: '0',
        },
        worldBinding: {
          seedId: marker.seedId,
          seedFingerprint: marker.seedFingerprint,
          modelVersion: binding.modelVersion,
          replayBindingFingerprint: `sha256:${sha(canonicalHashInput(binding))}`,
        },
        commandBinding: {
          commandId: 'COMMAND_ACTUAL_REFERENCE_SOURCE_READ',
          commandFingerprint: `sha256:${sha('actual-reference-source-read')}`,
          countryId: inventory[0].country_id,
          locationId: first.locationId,
          skill: first.skill,
          positionId: first.positionId,
          servicePoolId: 'POOL_NO_VACANCY_REQUEST',
          dueDayIndex: '0',
          simTime: '1000',
        },
        requiredMaterialPaths: SOCIAL_SOURCE_MATERIAL_PATHS,
      };
      const custody = createPostgresSocialOperatingCustody({
        database: new PostgresSqlDatabase(read),
      });
      let consumed = false;
      console.info('SOCIAL_REFERENCE_STAGE: canonical held-lineage reader');
      await expect(
        withRole(read, 'world_v2_social_source_reader', (tx) =>
          custody.withSnapshotFrom(tx, request, async () => {
            consumed = true;
          }),
        ),
      ).rejects.toThrow('no actual canonical vacancy offer');
      expect(consumed).toBe(false);
      evidence.actualReaderOutcome = 'NO_ACTUAL_VACANCY';
      await withRole(pub, 'world_v2_social_source_publisher', (tx) =>
        publisher.revokeFrom(tx, {
          worldId: marker.worldId,
          countryId: inventory[0].country_id,
          reasonRef: 'TEST_ONLY_REFERENCE_REVOCATION',
        }),
      );
      await expect(
        withRole(read, 'world_v2_social_source_reader', (tx) =>
          custody.withSnapshotFrom(tx, request, async () => {
            consumed = true;
          }),
        ),
      ).rejects.toThrow('SOCIAL_SOURCE_NOT_REGISTERED_OR_REVOKED');
      expect(consumed).toBe(false);
      evidence.sourceRevocationActuallyRejected = true;
      const rights = (
        await clone.installer.query(
          "select has_table_privilege('world_v2_social_source_reader','world_v2.social_operating_source_registration','INSERT,UPDATE,DELETE,TRUNCATE') as reader_write,pg_has_role('world_v2_social_source_reader','world_v2_social_source_publisher','MEMBER') as reader_publisher,has_column_privilege($1,'world_v2.opening_seed','canonical_payload','SELECT') as bounded_raw_seed",
          [marker.roles.boundedReaderRole],
        )
      ).rows[0];
      expect(rights).toEqual({
        reader_write: false,
        reader_publisher: false,
        bounded_raw_seed: false,
      });
      evidence.roleSeparation = rights;
      evidence.status = 'ACTUAL_NATIVE_CHECKS_PASSED_NOT_PRODUCTION_ADMISSION';
    } catch (error) {
      evidence.status = 'FAILED';
      evidence.failure = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      await mkdir(evidenceDirectory, { recursive: true });
      await writeFile(
        path.join(evidenceDirectory, `attempt-${token}.json`),
        JSON.stringify(evidence, null, 2) + '\n',
      );
      await writeFile(
        path.join(evidenceDirectory, 'summary.json'),
        JSON.stringify(evidence, null, 2) + '\n',
      );
      await Promise.all(pools.map((p) => p.end()));
      await clone.drop();
      // Only our disposable login roles; fixed group roles stay available for
      // subsequent separate clones and do not gain production membership.
      const cleanup = new Pool({
        host: marker.socket,
        port: marker.port,
        database: 'postgres',
        user: 'postgres',
        max: 1,
      });
      try {
        await cleanup.query(
          `drop role if exists ${publisherLogin},${readerLogin}`,
        );
      } finally {
        await cleanup.end();
      }
    }
  }, 180_000);
});
