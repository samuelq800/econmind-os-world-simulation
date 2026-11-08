/** Explicit future native entry. Default import/run performs no DB/source IO.
 * Supply an already upgraded sealed successor checkpoint. This entry does not
 * bootstrap the World or manufacture the missing20 live source preparations. */
import { it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
  sealPostwarReferenceClone,
} from '../support/postwar-native-reference-db.js';
import { loadPostwarSourceContext } from '../../apps/world-worker/src/preparation/postwar-source-context.js';
import { inspectPostwarRefinery21RetainedClone } from '../support/postwar-refinery21-retained-inspection.js';
const run = promisify(execFile);
it.runIf(process.env.ECONMIND_REFINERY21_NATIVE === '1')(
  'inspects all actual refinery sources and isolated own/foreign worker gates without economic writes',
  async () => {
    const checkpointPath = process.env.ECONMIND_REFINERY21_CHECKPOINT;
    const expectedHash = process.env.ECONMIND_REFINERY21_CHECKPOINT_SHA256;
    const directory = process.env.ECONMIND_REFINERY21_EVIDENCE;
    const workerRole = process.env.ECONMIND_REFINERY21_WORKER_ROLE;
    if (
      !checkpointPath?.startsWith('/workspace/.cloud-setup/evidence/') ||
      !directory?.startsWith('/workspace/.cloud-setup/evidence/') ||
      !workerRole ||
      !/^[a-f0-9]{64}$/u.test(expectedHash ?? '')
    )
      throw Error(
        'REFINERY21_PINNED_CHECKPOINT_EVIDENCE_AND_EXISTING_WORKER_REQUIRED',
      );
    const raw = await readFile(checkpointPath);
    expect(createHash('sha256').update(raw).digest('hex')).toBe(expectedHash);
    const checkpoint = JSON.parse(raw.toString()) as {
      markerPath: string;
      ownedContainer: string;
      ownershipNonce: string;
      templateDatabase: string;
      isTemplate: boolean;
      allowConnections: boolean;
    };
    expect(checkpoint.isTemplate).toBe(true);
    expect(checkpoint.allowConnections).toBe(false);
    const marker = await loadPostwarNativeReferenceMarker(
      checkpoint.markerPath,
    );
    expect(checkpoint.ownedContainer).toBe(marker.ownedContainer);
    expect(checkpoint.ownershipNonce).toBe(marker.ownershipNonce);
    const state = JSON.parse(
      (
        await run('docker', [
          'inspect',
          marker.ownedContainer,
          '--format',
          '{{json .State}}',
        ])
      ).stdout,
    ) as { Running: boolean };
    expect(state.Running, 'EXCLUSIVE_STOPPED_REFERENCE_REQUIRED').toBe(false);
    await mkdir(directory, { recursive: false });
    const report: Record<string, unknown> = {
      startedAt: new Date().toISOString(),
      checkpointPath,
      checkpointSha256: expectedHash,
      sourceCommit: (await run('git', ['rev-parse', 'HEAD'])).stdout.trim(),
      sourcePublication: 'NOT_RUN',
      nodeStartup: 'NOT_RUN',
    };
    let clone:
      Awaited<ReturnType<typeof clonePostwarNativeReference>> | undefined;
    const failures: unknown[] = [];
    try {
      await run('docker', ['start', marker.ownedContainer]);
      let ready = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        try {
          await run('docker', [
            'exec',
            marker.ownedContainer,
            'pg_isready',
            '-U',
            'postgres',
            '-d',
            'postgres',
          ]);
          ready = true;
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      expect(ready).toBe(true);
      clone = await clonePostwarNativeReference(
        marker,
        'refinery21_inspect',
        checkpoint.templateDatabase,
      );
      report.cloneDatabase = clone.database;
      const sourceContext = await loadPostwarSourceContext(process.cwd());
      report.inspection = await inspectPostwarRefinery21RetainedClone({
        marker,
        clone,
        sourceContext,
        workerRole,
        configureTestOnlyActors: true,
      });
      const checked = report.inspection as Awaited<
        ReturnType<typeof inspectPostwarRefinery21RetainedClone>
      >;
      expect(checked.inspection.sites).toHaveLength(21);
      for (const site of checked.inspection.sites) {
        expect(
          site.original.status,
          site.countryId + ' production original',
        ).toBe('PRESENT');
        expect(site.firstDay.status, site.countryId + ' first-day source').toBe(
          'PRESENT',
        );
        expect(site.utility.status, site.countryId + ' utility source').toBe(
          'PRESENT',
        );
        expect(
          site.power.status,
          site.countryId + ' distinct POWER service source',
        ).toBe('PRESENT');
      }
      report.status =
        'PASS_SOURCE_ASSEMBLY_AND_SCOPE_GATES_NOT_RUNTIME_EXECUTION';
    } catch (error) {
      report.status = 'FAIL';
      report.error = {
        message: String(error),
        stack: error instanceof Error ? error.stack : undefined,
      };
      failures.push(error);
    } finally {
      const cleanupErrors: unknown[] = [];
      if (clone) {
        try {
          await clone.close();
          await sealPostwarReferenceClone(marker, clone.database);
          report.cloneSealed = true;
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      try {
        await run('docker', ['stop', marker.ownedContainer]);
      } catch (error) {
        cleanupErrors.push(error);
      }
      report.cleanupErrors = cleanupErrors.map(String);
      failures.push(...cleanupErrors);
      if (cleanupErrors.length) report.status = 'FAIL_CLEANUP';
      report.finishedAt = new Date().toISOString();
      await writeFile(
        directory + '/report.json',
        JSON.stringify(report, null, 2) + '\n',
        { mode: 0o600 },
      );
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length)
      throw new AggregateError(
        failures,
        'REFINERY21_INSPECTION_OR_CLEANUP_FAILED',
      );
  },
  120000,
);
