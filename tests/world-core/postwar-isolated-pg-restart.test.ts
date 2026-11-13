/** Opt-in clean restart of ONE owned network-none TEST_ONLY PG container.
 * No bootstrap, production operation, World/Clock, signer or executor start. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
  type PostwarNativeReferenceMarker,
} from '../support/postwar-native-reference-db.js';
import {
  createPostwarOfficeProjectionStore,
  POSTWAR_PROJECTION_DATASETS,
  POSTWAR_PROJECTION_RESPONSE_MAX,
  type PostwarProjectionOffice,
} from '../../apps/world-worker/src/persistence/postwar-office-projection-store.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';

const descriptorPath =
  process.env.ECONMIND_POSTWAR_ISOLATED_PG_RESTART_TEMPLATE;
const native = descriptorPath ? describe : describe.skip;
const run = promisify(execFile);
const sha = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const EXPECTED_CONTAINER = 'econmind-postwar-reference-e203e521';
const EXPECTED_MARKER =
  '/workspace/.cloud-setup/evidence/postwar-reference-persistent-20261028/reference-db.json';
const reportPath =
  process.env.ECONMIND_POSTWAR_ISOLATED_PG_RESTART_REPORT ??
  '/workspace/office-connection-evidence/postwar-persistent-pg-restart-20261028/report.json';
function pool(marker: PostwarNativeReferenceMarker, database = 'postgres') {
  const p = new Pool({
    host: marker.socket,
    port: marker.port,
    database,
    user: 'postgres',
    max: 1,
    connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 100,
    application_name: 'ECONMIND_ISOLATED_PG_RESTART_MAINTENANCE',
  });
  p.on('error', () => {});
  return p;
}
async function storage(marker: PostwarNativeReferenceMarker) {
  const inspected = JSON.parse(
    (await run('docker', ['inspect', EXPECTED_CONTAINER])).stdout,
  )[0] as {
    Config: { Env: string[] };
    HostConfig: { Tmpfs?: Record<string, string> };
    Mounts: {
      Type: string;
      Name?: string;
      Source: string;
      Destination: string;
      RW: boolean;
    }[];
  };
  const pgdata = inspected.Config.Env.find((value) =>
    value.startsWith('PGDATA='),
  )?.slice(7);
  const covers = (destination: string) =>
    Boolean(
      pgdata &&
      (pgdata === destination || pgdata.startsWith(`${destination}/`)),
    );
  const tmpfs = inspected.HostConfig.Tmpfs ?? {};
  const dataOnTmpfs = Object.keys(tmpfs).some(covers);
  const mounts = inspected.Mounts.map((m) => ({
    type: m.Type,
    name: m.Name ?? null,
    source: m.Source,
    destination: m.Destination,
    rw: m.RW,
  })).sort((a, b) => a.destination.localeCompare(b.destination));
  const volume = JSON.parse(
    (await run('docker', ['volume', 'inspect', marker.pgDataStorage.name]))
      .stdout,
  )[0] as { Name: string; Driver: string; Labels?: Record<string, string> };
  const volumeOwnershipMatches =
    volume.Name === marker.pgDataStorage.name &&
    volume.Labels?.['econmind.reference.nonce'] === marker.ownershipNonce;
  return {
    pgdata: pgdata ?? null,
    tmpfs,
    mounts,
    volumeName: volume.Name,
    volumeDriver: volume.Driver,
    volumeOwnershipMatches,
    persistentDataMount:
      !dataOnTmpfs &&
      volumeOwnershipMatches &&
      mounts.some(
        (m) =>
          covers(m.destination) &&
          m.rw &&
          m.type === 'volume' &&
          m.name === marker.pgDataStorage.name,
      ),
    dataOnTmpfs,
  };
}
async function state(
  marker: PostwarNativeReferenceMarker,
  expectedTemplate: string,
) {
  const p = pool(marker);
  try {
    const r = await p.query<{ startup: string }>(
      'select to_char(pg_postmaster_start_time()at time zone\'UTC\',\'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"\')as startup',
    );
    const active = await p.query<{
      datname: string;
      application_name: string;
      state: string;
    }>(
      "select datname,application_name,state from pg_stat_activity where backend_type='client backend' and pid<>pg_backend_pid() order by datname,application_name,state",
    );
    const template = await p.query<{
      datistemplate: boolean;
      datallowconn: boolean;
    }>('select datistemplate,datallowconn from pg_database where datname=$1', [
      expectedTemplate,
    ]);
    return {
      serverStartup: r.rows[0]!.startup,
      otherClientConnections: active.rows,
      sealedTemplateAvailable:
        template.rows.length === 1 &&
        template.rows[0]!.datistemplate &&
        !template.rows[0]!.datallowconn,
    };
  } finally {
    await p.end();
  }
}
async function ready(
  marker: PostwarNativeReferenceMarker,
  expectedTemplate: string,
) {
  const until = Date.now() + 30000;
  let stableStartup: string | undefined,
    stableSince = 0;
  while (Date.now() < until) {
    try {
      const current = await state(marker, expectedTemplate);
      if (current.sealedTemplateAvailable) {
        if (current.serverStartup !== stableStartup) {
          stableStartup = current.serverStartup;
          stableSince = Date.now();
        } else if (Date.now() - stableSince >= 1500) return current;
      } else {
        stableStartup = undefined;
        stableSince = 0;
      }
    } catch {
      stableStartup = undefined;
      stableSince = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw Error('OWNED_ISOLATED_POSTGRES_DID_NOT_RESTART');
}
type Clone = Awaited<ReturnType<typeof clonePostwarNativeReference>>;
async function collect(marker: PostwarNativeReferenceMarker, clone: Clone) {
  const store = createPostwarOfficeProjectionStore({
    runtimeReaderRole: marker.roles.boundedReaderRole,
    authorizationPublisherRole: marker.roles.authorizationPublisherRole,
  });
  const queries: string[] = [];
  const read = async <T>(
    consume: (tx: SqlExecutor) => Promise<T>,
    subject = marker.subject,
  ) => {
    const client = await clone.boundedReader.connect();
    try {
      await client.query('begin isolation level repeatable read read only');
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [
        subject,
      ]);
      const result = await consume({
        async query<Row extends object>(
          sql: string,
          args: readonly unknown[] = [],
        ) {
          queries.push(sql);
          const r = await client.query<Row>(sql, [...args]);
          return { rows: r.rows, rowCount: r.rowCount };
        },
      });
      await client.query('commit');
      return result;
    } finally {
      await client.query('rollback').catch(() => {});
      client.release();
    }
  };
  const headers = await read((tx) =>
    store.readCurrentSeatHeadersFrom(tx, { worldId: marker.worldId }),
  );
  expect(headers).toHaveLength(6);
  expect(new Set(headers.map((h) => h.scope.officeId)).size).toBe(6);
  expect(
    headers.every(
      (h) =>
        h.scope.countryId === marker.countryId &&
        h.scope.authSubject === marker.subject,
    ),
  ).toBe(true);
  const datasets: Record<string, unknown>[] = [];
  for (const [office, names] of Object.entries(POSTWAR_PROJECTION_DATASETS)) {
    for (const dataset of names) {
      const pages: Record<string, unknown>[] = [];
      let offset = 0,
        expectedVersion: string | undefined;
      do {
        const result = await read((tx) =>
          store.readPageFrom(tx, {
            worldId: marker.worldId,
            officeId: office as PostwarProjectionOffice,
            dataset,
            offset,
            limit: 100,
            expectedVersion,
          }),
        );
        if (result.status !== 'PAGE' && result.status !== 'EMPTY')
          throw Error(
            `PERSISTED_BOUNDED_PAGE_REQUIRED:${office}:${dataset}:${result.status}`,
          );
        expect(result.scope.countryId).toBe(marker.countryId);
        expect(result.source.seedFingerprint).toBe(marker.seedFingerprint);
        expect(result.source.admissionRef).toBe(marker.admissionRef);
        expect(result.source.sourceBundleSha256).toBe(
          marker.sourceBundleSha256,
        );
        expect(result.source.dataNature).toBe(
          'DERIVED_RAW_FROM_ADMITTED_H0_NOT_AUTHORITY',
        );
        expect(result.source.worldVersion).toBe('0');
        expect(result.source.eventSequence).toBe('0');
        expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(
          POSTWAR_PROJECTION_RESPONSE_MAX,
        );
        pages.push({
          status: result.status,
          scopeHash: sha(result.scope),
          source: result.source,
          page: result.page,
          rowsHash: sha(result.rows),
          responseBytes: Buffer.byteLength(JSON.stringify(result)),
        });
        expectedVersion = result.source.sourceVersion;
        if (result.page.nextOffset === null) break;
        expect(result.page.nextOffset).toBeGreaterThan(offset);
        offset = result.page.nextOffset;
      } while (pages.length < 1000);
      expect(pages.length).toBeLessThan(1000);
      datasets.push({ officeId: office, dataset, pages });
    }
  }
  expect(datasets).toHaveLength(16);
  // No projection function or store query may hydrate/hash the canonical seed.
  expect(queries.every((sql) => !sql.includes('canonical_payload'))).toBe(true);
  const denied: Record<string, string> = {};
  for (const [key, sql] of [
    ['canonicalSeed', 'select canonical_payload from world_v2.opening_seed'],
    [
      'derivedDocuments',
      'select * from world_v2.postwar_office_projection_document',
    ],
    ['derivedPages', 'select * from world_v2.postwar_office_projection_page'],
  ]) {
    await expect(read((tx) => tx.query(sql!))).rejects.toMatchObject({
      code: '42501',
    });
    denied[key!] = '42501';
  }
  const wrongSubject = '99999999-9999-4999-8999-999999999999';
  const absent = await read(
    (tx) => store.readCurrentSeatHeadersFrom(tx, { worldId: marker.worldId }),
    wrongSubject,
  );
  expect(absent).toEqual([]);
  const wrongSubjectPage = await read(
    (tx) =>
      store.readPageFrom(tx, {
        worldId: marker.worldId,
        officeId: 'CAPTAIN',
        dataset: 'public-service-summary',
      }),
    wrongSubject,
  );
  expect(wrongSubjectPage.status).toBe('DENIED');
  const foreign = await read((tx) =>
    tx.query(
      "select * from world_v2.read_postwar_office_projection_page($1,'INDUSTRY','opening-inventory-entries',0,100,null)where scope_json->>'countryId'='COUNTRY_02'",
      [marker.worldId],
    ),
  );
  expect(foreign.rows).toEqual([]);
  return {
    headerCount: headers.length,
    headersHash: sha(headers),
    datasets,
    denied,
    wrongSubjectPage,
    foreignCountryRows: 0,
    queries,
    boundedDataFullSeedQueries: 0,
    deniedCanonicalPermissionProbes: 1,
    successfulCanonicalSeedReads: 0,
    fingerprint: sha({ headers, datasets, denied, wrongSubjectPage }),
  };
}

native(
  'owned isolated PG restart persistence (not production or executor recreation)',
  () => {
    it('preserves six current seats, sixteen bounded datasets, hashes and denial boundaries across a clean restart', async () => {
      const descriptor = JSON.parse(
        await readFile(descriptorPath!, 'utf8'),
      ) as Record<string, unknown>;
      expect(descriptor.schemaVersion).toBe(
        'postwar-bounded-projection-template-v1',
      );
      expect(descriptor.classification).toBe(
        'TEST_ONLY_SEALED_DERIVED_TEMPLATE_NOT_PRODUCTION',
      );
      expect(descriptor.referenceMarker).toBe(EXPECTED_MARKER);
      if (
        typeof descriptor.templateDatabase !== 'string' ||
        !/^postwar_clone_bounded_[a-z0-9_]+$/u.test(descriptor.templateDatabase)
      )
        throw Error('OWNED_SEALED_DERIVED_TEMPLATE_REQUIRED');
      const expectedTemplate = descriptor.templateDatabase;
      const marker = await loadPostwarNativeReferenceMarker(EXPECTED_MARKER);
      expect(marker.ownedContainer).toBe(EXPECTED_CONTAINER);
      const evidence: Record<string, unknown> = {
        schemaVersion: 'postwar-isolated-pg-restart-evidence-v1',
        classification: 'ISOLATED_PG_RESTART',
        ownedContainer: marker.ownedContainer,
        templateDatabase: expectedTemplate,
        seedFingerprint: marker.seedFingerprint,
        admissionRef: marker.admissionRef,
        productionOperation: false,
        executorRebuildGuarantee: false,
        bootstrapPerformed: false,
        sourceRegenerated: false,
        worldOrClockStarted: false,
      };
      let beforeClone: Clone | undefined, afterClone: Clone | undefined;
      const report = async () => {
        await mkdir(path.dirname(reportPath), { recursive: true });
        await writeFile(reportPath, JSON.stringify(evidence, null, 2) + '\n');
      };
      try {
        const dataStorage = await storage(marker);
        evidence.storage = dataStorage;
        // tmpfs is cleared by container restart; network isolation and a sealed
        // database marker do not provide storage durability. Check BEFORE any
        // clone/restart, not merely after waiting for a new postmaster.
        if (!dataStorage.persistentDataMount)
          throw Error('PERSISTENT_PGDATA_REQUIRED_NO_RESTART');
        const resumePath =
          process.env.ECONMIND_POSTWAR_ISOLATED_PG_RESTART_RESUME_REPORT;
        let restarted: Awaited<ReturnType<typeof state>>;
        if (resumePath) {
          // Resume ONLY the observed mount-order assertion failure, retaining
          // the actual pre-restart measurements. Never synthesize a restart or
          // rerun one merely to finish readback after a reporting-only failure.
          expect(resumePath).toBe(
            '/workspace/office-connection-evidence/postwar-persistent-pg-restart-20261028/FAILED_MOUNT_ORDER_20261028T1744.json',
          );
          const prior = JSON.parse(
            await readFile(resumePath, 'utf8'),
          ) as Record<string, unknown>;
          expect(prior.classification).toBe('ISOLATED_PG_RESTART');
          expect(prior.ownedContainer).toBe(EXPECTED_CONTAINER);
          expect(prior.templateDatabase).toBe(expectedTemplate);
          expect(prior.seedFingerprint).toBe(marker.seedFingerprint);
          expect(prior.admissionRef).toBe(marker.admissionRef);
          expect(prior.restartExecuted).toBe(true);
          expect(prior.cleanupErrors).toEqual([]);
          const priorStorage = prior.storage as Record<string, unknown>;
          const mounts = priorStorage.mounts as { destination: string }[];
          expect({
            ...priorStorage,
            mounts: [...mounts].sort((a, b) =>
              a.destination.localeCompare(b.destination),
            ),
          }).toEqual(dataStorage);
          restarted = await ready(marker, expectedTemplate);
          expect(restarted.otherClientConnections).toEqual([]);
          expect(restarted.serverStartup).toBe(
            (prior.afterRestartBarrier as { serverStartup: string })
              .serverStartup,
          );
          for (const key of [
            'before',
            'initialBarrier',
            'immediateRestartBarrier',
            'finalRestartBarrier',
            'restartRequestedAt',
          ])
            evidence[key] = prior[key];
          evidence.restartExecuted = true;
          evidence.resumedReadbackFrom = resumePath;
          evidence.additionalRestartPerformed = false;
        } else {
          const initial = await state(marker, expectedTemplate);
          evidence.initialBarrier = initial;
          if (!initial.sealedTemplateAvailable)
            throw Error('SEALED_REFERENCE_TEMPLATE_NOT_AVAILABLE_NO_RESTART');
          if (initial.otherClientConnections.length)
            throw Error('WAIT_ACTIVE_REFERENCE_CLIENTS_NO_RESTART');
          beforeClone = await clonePostwarNativeReference(
            marker,
            'restart_before',
            expectedTemplate,
          );
          evidence.before = await collect(marker, beforeClone);
          await beforeClone.close();
          const barrier = await state(marker, expectedTemplate);
          evidence.immediateRestartBarrier = barrier;
          if (barrier.otherClientConnections.length)
            throw Error('WAIT_ACTIVE_REFERENCE_CLIENTS_NO_RESTART');
          expect(barrier.serverStartup).toBe(initial.serverStartup);
          // Ownership/network-none/nonce are independently checked immediately
          // before the only disruptive operation, after all read pools are closed.
          await loadPostwarNativeReferenceMarker(EXPECTED_MARKER);
          const currentStorage = await storage(marker);
          expect(currentStorage).toEqual(dataStorage);
          const finalBarrier = await state(marker, expectedTemplate);
          evidence.finalRestartBarrier = finalBarrier;
          if (finalBarrier.otherClientConnections.length)
            throw Error('WAIT_ACTIVE_REFERENCE_CLIENTS_NO_RESTART');
          evidence.restartRequestedAt = new Date().toISOString();
          await run('docker', ['restart', EXPECTED_CONTAINER], {
            timeout: 30000,
          });
          evidence.restartExecuted = true;
          restarted = await ready(marker, expectedTemplate);
        }
        evidence.afterRestartBarrier = restarted;
        expect(restarted.serverStartup).not.toBe(
          (evidence.initialBarrier as { serverStartup: string }).serverStartup,
        );
        evidence.storageAfterRestart = await storage(marker);
        expect(evidence.storageAfterRestart).toEqual(dataStorage);
        afterClone = await clonePostwarNativeReference(
          marker,
          'restart_after',
          expectedTemplate,
        );
        evidence.after = await collect(marker, afterClone);
        expect(evidence.after).toEqual(evidence.before);
        evidence.status = 'PASS';
        evidence.completedAt = new Date().toISOString();
        await report();
      } catch (error) {
        evidence.status =
          error instanceof Error && error.message.startsWith('WAIT_ACTIVE_')
            ? 'WAITING_NOT_RESTARTED'
            : error instanceof Error &&
                error.message === 'PERSISTENT_PGDATA_REQUIRED_NO_RESTART'
              ? 'BLOCKED_NOT_RESTARTED'
              : 'FAILED';
        evidence.error = error instanceof Error ? error.message : String(error);
        await report();
        throw error;
      } finally {
        const failures: string[] = [];
        for (const clone of [afterClone, beforeClone]) {
          if (!clone) continue;
          try {
            await clone.drop();
          } catch (error) {
            failures.push(
              error instanceof Error ? error.message : String(error),
            );
          }
        }
        evidence.cleanupErrors = failures;
        if (failures.length && evidence.status === 'PASS') {
          evidence.status = 'FAILED';
          evidence.error = 'OWNED_CLONE_CLEANUP_FAILED';
        }
        await report();
      }
      if (evidence.status !== 'PASS') throw Error(String(evidence.error));
      console.log(
        JSON.stringify({
          classification: 'ISOLATED_PG_RESTART',
          status: 'PASS',
          reportPath,
          serverStartupBefore: (
            evidence.initialBarrier as { serverStartup: string }
          ).serverStartup,
          serverStartupAfter: (
            evidence.afterRestartBarrier as { serverStartup: string }
          ).serverStartup,
          seats: 6,
          datasets: 16,
          identicalSnapshotFingerprint: (
            evidence.before as { fingerprint: string }
          ).fingerprint,
        }),
      );
    }, 90000);
  },
);
