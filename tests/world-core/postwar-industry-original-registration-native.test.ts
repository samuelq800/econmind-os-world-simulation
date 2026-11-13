/** One controlled original-registration probe on an existing sealed reference.
 * No seed parse/Core70 proof/genesis/consumer/Clock or production connection. */
import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { canonicalSerialize } from '@econmind/core';
import { wireColdError } from '../../tools/office-connection/native-mixed-cold-errors.mjs';
import { loadPostwarSourceContext } from '../../apps/world-worker/src/preparation/postwar-source-context.js';
import { createPostwarIndustryProductionSource } from '../../apps/world-worker/src/persistence/postwar-industry-production-source.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
} from '../support/postwar-native-reference-db.js';
const markerPath = process.env.ECONMIND_POSTWAR_INDUSTRY_REGISTRATION_TEMPLATE;
const native = markerPath ? describe : describe.skip;
const run = promisify(execFile),
  root = path.resolve(import.meta.dirname, '../..');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
native(
  'controlled actual large-seed Industry originals registration (TEST_ONLY)',
  () => {
    it('registers C2 through the actual low publisher, keeps exact repeats and economics unchanged', async () => {
      const output = process.env.ECONMIND_INDUSTRY_REGISTRATION_EVIDENCE;
      if (!output?.startsWith('/workspace/.cloud-setup/evidence/'))
        throw Error('EXPLICIT_NEW_EVIDENCE_DIRECTORY_REQUIRED');
      await mkdir(output, { recursive: true });
      try {
        await readFile(path.join(output, 'report.json'));
        throw Error('IMMUTABLE_ATTEMPT_OUTPUT_ALREADY_EXISTS');
      } catch (error) {
        if (!(
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'ENOENT'
        ))
          throw error;
      }
      const marker = await loadPostwarNativeReferenceMarker(markerPath!);
      const report: Record<string, unknown> = {
        classification:
          'ISOLATED_ACTUAL_ORIGINAL_REGISTRATION_NOT_ECONOMIC_RUNTIME_NOT_FINAL_CHILD_ACCEPTANCE',
        markerPath,
        worldId: marker.worldId,
        seedFingerprint: marker.seedFingerprint,
        WorldClock: false,
        seedParsed: false,
        core70Proof: false,
        production: false,
        startedAt: new Date().toISOString(),
        nodeRssBefore: process.memoryUsage().rss,
      };
      const persist = () =>
        writeFile(
          path.join(output, 'report.json'),
          JSON.stringify(report, null, 2) + '\n',
        );
      const ownedRole =
        'industry_registration_' + randomBytes(5).toString('hex');
      const createdFixed: string[] = [],
        idleErrors: string[] = [],
        sampleErrors: string[] = [];
      let clone:
          Awaited<ReturnType<typeof clonePostwarNativeReference>> | undefined,
        publisher: Pool | undefined;
      let roleCreated = false,
        sampling: ReturnType<typeof setInterval> | undefined,
        sampleActive: Promise<void> | undefined;
      const samples: {
        backendRssKiB: number;
        clusterMemoryBytes: string;
        recordedAt: string;
      }[] = [];
      let error: unknown;
      const maintenance = new Pool({
        host: marker.socket,
        port: marker.port,
        database: 'postgres',
        user: 'postgres',
        password: async () => '',
        ssl: false,
        max: 1,
      });
      maintenance.on('error', (e) => idleErrors.push(e.message));
      try {
        const version = (
          await maintenance.query<{ version: string }>(
            "select current_setting('server_version_num')version",
          )
        ).rows[0]?.version;
        expect(version).toBe('160015');
        const baseline = (
          await maintenance.query<{ sealed: boolean }>(
            'select datistemplate and not datallowconn as sealed from pg_database where datname=$1',
            [marker.database],
          )
        ).rows;
        expect(baseline).toEqual([{ sealed: true }]);
        clone = await clonePostwarNativeReference(
          marker,
          'industry_reg_stream',
        );
        const context = await loadPostwarSourceContext(root);
        report.nodeRssAfterContext = process.memoryUsage().rss;
        const source = createPostwarIndustryProductionSource({
          sourceContext: context,
          scope: { worldId: marker.worldId, countryId: 'COUNTRY_02' },
          runtimeReaderRole: 'world_v2_industry_source_reader',
        });
        report.ownedClone = clone.database;
        report.ownedRole = ownedRole;
        const fixed = [
          'world_v2_industry_source_owner',
          'world_v2_industry_source_publisher',
          'world_v2_industry_source_reader',
        ];
        const before = (
          await clone.installer.query<{ rolname: string }>(
            'select rolname from pg_roles where rolname=any($1::text[])',
            [fixed],
          )
        ).rows.map((r) => r.rolname);
        createdFixed.push(...fixed.filter((r) => !before.includes(r)));
        const sql = await readFile(
          path.join(
            root,
            'database/proposals/postwar-industry-production-source.sql',
          ),
          'utf8',
        );
        report.executedSqlSha256 = sha(sql);
        await clone.installer.query(sql);
        await clone.installer.query(
          'create role ' +
            ownedRole +
            ' login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant world_v2_industry_source_publisher to ' +
            ownedRole,
        );
        roleCreated = true;
        publisher = new Pool({
          host: marker.socket,
          port: marker.port,
          database: clone.database,
          user: ownedRole,
          password: async () => '',
          ssl: false,
          max: 1,
          connectionTimeoutMillis: 10000,
          idleTimeoutMillis: 1000,
        });
        publisher.on('error', (e) => idleErrors.push(e.message));
        const db = new PostgresSqlDatabase(publisher);
        const counts = async () =>
          (
            await clone!.installer.query(
              'select h.world_version::text version,h.event_sequence::text sequence,(select count(*)::text from world_v2.command_submission)commands,(select count(*)::text from world_v2.command_receipt)receipts,(select count(*)::text from world_v2.authoritative_event)events,(select count(*)::text from world_v2.financial_posting_batch)financial,(select count(*)::text from world_v2.inventory_posting)inventory from world_v2.world_head h where h.world_id=$1',
              [marker.worldId],
            )
          ).rows;
        report.countsBefore = await counts();
        report.storedSeedTextBytes = (
          await clone.installer.query<{ bytes: string }>(
            'select octet_length(canonical_payload)::text bytes from world_v2.opening_seed where world_id=$1',
            [marker.worldId],
          )
        ).rows[0]?.bytes;
        const register = () =>
          db.transaction(async (tx) => {
            await tx.query('set transaction isolation level repeatable read');
            await tx.query('set local role world_v2_industry_source_publisher');
            const pid = (
              await tx.query<{ pid: string }>(
                'select pg_backend_pid()::text pid',
              )
            ).rows[0]?.pid;
            if (!pid || !/^[0-9]+$/u.test(pid))
              throw Error('ACTUAL_PUBLISHER_BACKEND_REQUIRED');
            const sample = async () => {
              try {
                const result = await run('docker', [
                  'exec',
                  marker.ownedContainer,
                  'cat',
                  '/proc/' + pid + '/status',
                  '/sys/fs/cgroup/memory.current',
                ]);
                const rss = /VmRSS:\s+(\d+)\s+kB/u.exec(result.stdout)?.[1];
                const memory = /\n([0-9]+)\s*$/u.exec(result.stdout)?.[1];
                if (rss && memory)
                  samples.push({
                    backendRssKiB: Number(rss),
                    clusterMemoryBytes: memory,
                    recordedAt: new Date().toISOString(),
                  });
                else sampleErrors.push('MEMORY_SAMPLE_SHAPE');
              } catch (e) {
                sampleErrors.push(e instanceof Error ? e.message : String(e));
              }
            };
            await sample();
            sampling = setInterval(() => {
              if (!sampleActive)
                sampleActive = sample().finally(() => {
                  sampleActive = undefined;
                });
            }, 250);
            const started = performance.now();
            try {
              const result = await source.registerFrom(tx);
              return {
                rows: result.rows,
                elapsedMs: performance.now() - started,
              };
            } finally {
              if (sampling) clearInterval(sampling);
              sampling = undefined;
              await sampleActive;
              await sample();
            }
          });
        const first = await register();
        report.first = first;
        await persist();
        expect(
          first.rows.filter((r) => r.facility_id === 'OPEN-02-REFINED_FUEL'),
        ).toHaveLength(1);
        const second = await register();
        report.second = second;
        expect(canonicalSerialize(second.rows)).toBe(
          canonicalSerialize(first.rows),
        );
        const permissions = (
          await publisher.query<{ raw: boolean; owner: boolean }>(
            "select has_column_privilege(current_user,'world_v2.opening_seed','canonical_payload','SELECT')raw,pg_has_role(current_user,'world_v2_industry_source_owner','MEMBER')owner",
          )
        ).rows;
        expect(permissions).toEqual([{ raw: false, owner: false }]);
        report.permissions = permissions;
        await expect(
          publisher.query(
            'select canonical_payload from world_v2.opening_seed',
          ),
        ).rejects.toMatchObject({ code: '42501' });
        report.countsAfter = await counts();
        expect(report.countsAfter).toEqual(report.countsBefore);
        report.samples = samples;
        report.sampleErrors = sampleErrors;
        expect(sampleErrors).toEqual([]);
        expect(samples.length).toBeGreaterThan(0);
        report.maxBackendRssKiB = Math.max(
          ...samples.map((s) => s.backendRssKiB),
        );
        report.nodeRssAfter = process.memoryUsage().rss;
        report.status = 'PASS_LARGE_SOURCE_LOW_ROLE_REGISTRATION_ONLY';
      } catch (e) {
        error = e;
        report.status = 'FAIL';
        report.error = wireColdError(e);
      } finally {
        if (sampling) clearInterval(sampling);
        await sampleActive;
        const cleanupErrors: string[] = [];
        for (const fn of [
          async () => publisher?.end(),
          async () => clone?.drop(),
          async () => {
            if (roleCreated) await maintenance.query('drop role ' + ownedRole);
          },
          async () => {
            for (const role of [...createdFixed].reverse())
              await maintenance.query('drop role ' + role);
          },
        ])
          try {
            await fn();
          } catch (e) {
            cleanupErrors.push(e instanceof Error ? e.message : String(e));
          }
        const cleanup = (
          await maintenance.query(
            'select exists(select 1 from pg_database where datname=$1)owned_clone_exists,(select count(*)::text from pg_roles where rolname=any($2::text[]))owned_roles,(select count(*)::text from pg_stat_activity where datname=$1)owned_sessions,exists(select 1 from pg_database where datname=$3 and datistemplate and not datallowconn)sealed_preserved',
            [
              clone?.database ?? '',
              [ownedRole, ...createdFixed],
              marker.database,
            ],
          )
        ).rows[0];
        report.cleanup = cleanup;
        report.cleanupErrors = cleanupErrors;
        report.idleErrors = idleErrors;
        report.finishedAt = new Date().toISOString();
        await persist();
        await maintenance.end();
        expect(cleanupErrors).toEqual([]);
        expect(idleErrors).toEqual([]);
        expect(cleanup).toEqual({
          owned_clone_exists: false,
          owned_roles: '0',
          owned_sessions: '0',
          sealed_preserved: true,
        });
      }
      if (error !== undefined) throw error;
    }, 120000);
  },
);
