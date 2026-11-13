/** Opt-in real PG16 source rehearsal, reusing a verified OWNED persistent
 * reference clone. Never old tmpfs marker, full seed regeneration or production. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
} from '../support/postwar-native-reference-db.js';
import { loadPostwarSourceContext } from '../../apps/world-worker/src/preparation/postwar-source-context.js';
import {
  createPostwarIndustryProductionSource,
  POSTWAR_INDUSTRY_SOURCE_ROLES as ROLES,
} from '../../apps/world-worker/src/persistence/postwar-industry-production-source.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const markerPath = process.env.ECONMIND_POSTWAR_INDUSTRY_SOURCE_REFERENCE;
const native = markerPath ? describe : describe.skip;
const root = path.resolve(import.meta.dirname, '../..');
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
native(
  'real selected Industry original custody native PG16 (TEST_ONLY admission, not production)',
  () => {
    it('registers actual c427 original recipe/deposit profiles, keeps operations missing, denies raw privileges and serializes source revocation', async () => {
      const marker = await loadPostwarNativeReferenceMarker(markerPath!);
      if (markerPath!.includes('/postwar-reference-20261028/'))
        throw Error('OLD_TMPFS_REFERENCE_MUST_NOT_BE_REUSED');
      const clone = await clonePostwarNativeReference(
        marker,
        'industry_source',
      );
      const role = 'industry_probe_' + randomBytes(5).toString('hex');
      const admin = new Pool({
        host: marker.socket,
        port: marker.port,
        user: 'postgres',
        database: 'postgres',
        max: 1,
      });
      const idleErrors: string[] = [];
      admin.on('error', (e) => idleErrors.push(e.message));
      const directory =
        process.env.ECONMIND_INDUSTRY_SOURCE_NATIVE_EVIDENCE_DIR ??
        '/workspace/office-connection-evidence/postwar-industry-source-native-development-20261028';
      await mkdir(directory, { recursive: true });
      const evidence: Record<string, unknown> = {
        classification:
          'TEST_ONLY_ACTUAL_SELECTED_ORIGINALS_NATIVE_REGISTRATION_NOT_PRODUCTION_OPERATING_ADMISSION',
        marker: markerPath,
        worldId: marker.worldId,
        seedFingerprint: marker.seedFingerprint,
        actualProductionReceiptCreated: false,
        formalIndustryConsumerRegistered: false,
        WorldClock: false,
      };
      let roleCreated = false;
      try {
        expect(marker.verification.currentCoreSeedParsed).toBe(true);
        expect(
          marker.verification.currentOperatingSourceActuallyValidated,
        ).toBe(true);
        const ddl = await readFile(
          path.join(
            root,
            'database/proposals/postwar-industry-production-source.sql',
          ),
          'utf8',
        );
        evidence.proposalSha256 = hash(ddl);
        await clone.installer.query(ddl);
        await admin.query(
          `create role ${role} nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication`,
        );
        roleCreated = true;
        await admin.query(`grant ${ROLES.reader} to ${role}`);
        const context = await loadPostwarSourceContext(root),
          source = createPostwarIndustryProductionSource({
            sourceContext: context,
            scope: { worldId: marker.worldId, countryId: marker.countryId },
            runtimeReaderRole: ROLES.reader,
          });
        const command = C.parseCanonicalCommand(
          {
            schemaVersion: C.COMMAND_SCHEMA_VERSION,
            commandId: 'COMMAND_TEST_ONLY_NATIVE_INDUSTRY_SOURCE',
            commandType: 'TEST_ONLY_INDUSTRY_ORIGINAL_PROBE',
            worldId: marker.worldId,
            actorId: 'ACTOR_TEST_ONLY',
            authSubject: marker.subject,
            countryId: marker.countryId,
            officeId: 'INDUSTRY',
            expectedWorldVersion: '0',
            idempotencyKey: 'TEST_ONLY_NATIVE_ORIGINAL_PROBE',
            correlationId: 'CORRELATION_TEST_ONLY',
            simTime: '1000',
            submittedAtReal: '2026-10-28T00:00:00.000Z',
            payload: { TEST_ONLY: true },
          },
          (s) => hash(s),
        );
        const execute = (client: PoolClient): SqlExecutor => ({
          async query<Row extends object>(
            q: string,
            args: readonly unknown[] = [],
          ) {
            const r = await client.query(q, [...args]);
            return { rows: r.rows as Row[], rowCount: r.rowCount };
          },
        });
        const publish = await clone.installer.connect();
        try {
          await publish.query('begin isolation level repeatable read');
          await publish.query('set role ' + ROLES.publisher);
          const r = await source.registerFrom(execute(publish));
          expect(r.rows.map((r) => r.facility_id).sort()).toEqual([
            'OPEN-01-GRAIN',
            'OPEN-RES098',
          ]);
          evidence.registration = r.rows;
          await publish.query('commit');
        } finally {
          await publish.query('rollback');
          await publish.query('reset role');
          publish.release();
        }
        const profiles = (
          await clone.installer.query(
            'select country_id,kind,asset_account,liability_account,opening_amount::text from world_v2.postwar_industry_deposit_original where world_id=$1 and country_id=$2 order by kind',
            [marker.worldId, marker.countryId],
          )
        ).rows;
        expect(profiles).toHaveLength(2);
        expect(
          profiles.every(
            (p) =>
              p.asset_account.accountClass === 'ASSET' &&
              p.liability_account.accountClass === 'LIABILITY' &&
              p.asset_account.claimId === p.liability_account.claimId,
          ),
        ).toBe(true);
        evidence.actualOriginalDepositProfiles = profiles;
        const client = await clone.installer.connect();
        try {
          await client.query(`set session authorization ${role}`);
          await client.query('set role ' + ROLES.reader);
          await client.query('begin isolation level repeatable read');
          const observed = await source.readForCommandFrom(execute(client), {
            command,
            facilityId: 'OPEN-01-GRAIN',
            eventSequence: '0',
          });
          expect(observed.seedFingerprint).toBe(marker.seedFingerprint);
          expect(observed.inspected.physical.titleHolderId).toBe(
            'ENTITY_OPERATOR_01',
          );
          expect(observed.inspected.recipe.waterPerOutput.amount).toBe(
            '1428.5714285714287',
          );
          expect(observed.inspected.missing.length).toBeGreaterThan(0);
          expect(observed.inspected.authority).toBe(false);
          evidence.originalRead = observed;
          const readerPid = (
            await client.query('select pg_backend_pid()as pid')
          ).rows[0].pid;
          const revoker = await clone.installer.connect();
          try {
            await revoker.query('begin');
            await revoker.query('set role ' + ROLES.publisher);
            const revokePid = (
              await revoker.query('select pg_backend_pid()as pid')
            ).rows[0].pid;
            let settled = false;
            const revoke = revoker
              .query(
                'select world_v2.revoke_postwar_industry_original($1,$2,$3)',
                [
                  marker.worldId,
                  observed.registrationRef,
                  'TEST_ONLY_NATIVE_REVOKE',
                ],
              )
              .then(() => {
                settled = true;
              });
            await new Promise((resolve) => setTimeout(resolve, 120));
            const blockers = (
              await admin.query('select pg_blocking_pids($1)as blockers', [
                revokePid,
              ])
            ).rows[0].blockers;
            expect(settled).toBe(false);
            expect(blockers).toContain(readerPid);
            evidence.revocationWaitedOnActualOriginalShareLock = true;
            await client.query('rollback');
            await revoke;
            await revoker.query('commit');
          } finally {
            await revoker.query('rollback');
            await revoker.query('reset role');
            revoker.release();
          }
          await client.query('begin isolation level repeatable read');
          await expect(
            source.readForCommandFrom(execute(client), {
              command,
              facilityId: 'OPEN-01-GRAIN',
              eventSequence: '0',
            }),
          ).rejects.toMatchObject({ code: '55000' });
          await client.query('rollback');
          evidence.revokedOriginalReadDenied = true;
          for (const q of [
            'select canonical_payload from world_v2.opening_seed',
            'select * from world_v2.postwar_industry_original',
            'select * from world_v2.postwar_industry_deposit_original',
            'set role world_v2_industry_source_owner',
          ]) {
            await client.query('begin');
            await expect(client.query(q)).rejects.toMatchObject({
              code: '42501',
            });
            await client.query('rollback');
          }
          evidence.directSourceAndSeedPrivilegesDenied = true;
        } finally {
          await client.query('rollback');
          await client.query('reset role');
          await client.query('set session authorization postgres');
          client.release();
        }
        evidence.result = 'PASS';
      } finally {
        try {
          await clone.drop();
          evidence.ownedCloneDropped = true;
        } finally {
          try {
            if (roleCreated) await admin.query(`drop role ${role}`);
            evidence.ownedProbeRoleDropped = roleCreated;
          } finally {
            await admin.end();
            evidence.sharedReferencePreserved = true;
            evidence.idleErrors = idleErrors;
            await writeFile(
              path.join(directory, 'native-evidence.json'),
              JSON.stringify(evidence, null, 2) + '\n',
            );
          }
        }
      }
    }, 120000);
  },
);
