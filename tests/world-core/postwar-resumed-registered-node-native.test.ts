/** Resume a sealed positive checkpoint; preserve original FINAL and never
 * rerun CREATE or source initialization. Only explicit pending programme/zero target and finite C10 originals are new. */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import { parseIndustryCommittedRunsCoverage } from '@econmind/core/postwar-industry-committed-runs-contract';
import { runRegisteredProgrammeTargetBrowserChain } from '../support/registered-programme-target-browser-chain.js';
import { runFreshC10Prefix } from '../support/run-fresh-c10-prefix.js';
import {
  restoreCommittedRegisteredCheckpoint,
  reopenPreparedRegisteredCheckpoint,
} from '../support/restore-completed-fresh-h0.js';
import {
  createRegisteredFinalDriver,
  registeredFinalRecord as row,
} from '../support/postwar-registered-final-driver.js';
import { renewResumedNativeExecution } from '../support/renew-resumed-native-execution.js';
import { currentPages } from '../support/registered-social-create-browser-chain.js';
import { createFixedOfficeBrowserApplication } from '../../tools/office-connection/fixed-office-command-browser.mjs';
import { runRegisteredTradeCbReadbackBrowserProbe } from '../../tools/office-connection/registered-trade-cb-readback-browser-probe.mjs';
import { wireColdError } from '../../tools/office-connection/native-mixed-cold-errors.mjs';

const flag = process.env.ECONMIND_RESUMED_REGISTERED_NODE_NATIVE;
if (flag !== undefined && flag !== '1')
  throw Error('RESUMED_NATIVE_FLAG_MUST_BE_1');
const native = flag === '1' ? describe : describe.skip;
const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const required = (name: string): string => {
  const value = process.env[name];
  assert(value, 'EXPLICIT_RESUMED_INPUT_REQUIRED:' + name);
  return value;
};

native('resumed committed-source registered Node and shipped browser', () => {
  it('recovers the original FINAL without resubmit, reads actual pages and cold-recovers the same DB', async () => {
    const expectedCommit = required('ECONMIND_REGISTERED_FINAL_CANDIDATE_SHA');
    const evidenceDirectory = required(
      'ECONMIND_REGISTERED_FINAL_EVIDENCE_DIR',
    );
    const checkpointDirectory = required('ECONMIND_RESUME_CHECKPOINT');
    assert.match(expectedCommit, /^[a-f0-9]{40}$/u);
    assert(evidenceDirectory.startsWith('/workspace/.cloud-setup/evidence/'));
    await mkdir(evidenceDirectory, { recursive: true });
    const report: Record<string, unknown> = {
      classification:
        'SEALED_POSITIVE_CHECKPOINT_CLONE_NOT_REINITIALIZATION_OR_PRODUCTION',
      candidate: expectedCommit,
      status: 'RUNNING',
      social: 'NOT_RUN',
      browserReadback: 'NOT_RUN',
      coldRecovery: 'NOT_RUN',
      c10: 'NOT_RUN',
      refinery21: 'NOT_RUN',
      omoWrite: 'NOT_CONFIGURED_NO_INDEPENDENT_ORIGINAL',
      clockService: 'NOT_STARTED',
      automaticConsumer: 'NOT_STARTED',
    };
    const save = () =>
      writeFile(
        path.join(evidenceDirectory, 'resumed-native.json'),
        JSON.stringify(report, null, 2) + '\n',
      );
    await save();
    let prepared:
      | Awaited<ReturnType<typeof restoreCommittedRegisteredCheckpoint>>
      | undefined;
    let driver: ReturnType<typeof createRegisteredFinalDriver> | undefined;
    let browser: { close(): Promise<void> } | undefined;
    let application:
      | Awaited<ReturnType<typeof createFixedOfficeBrowserApplication>>
      | undefined;
    const failures: unknown[] = [];
    try {
      const checkpoint = JSON.parse(
        await readFile(
          path.join(checkpointDirectory, 'pg/retained-checkpoint.json'),
          'utf8',
        ),
      );
      const restore =
        checkpoint.resourceState === 'PREPARED_OWNED_CLONE'
          ? reopenPreparedRegisteredCheckpoint
          : restoreCommittedRegisteredCheckpoint;
      prepared = await restore({
        repositoryRoot,
        evidenceDirectory,
        expectedCommit,
        completedCheckpointDirectory: checkpointDirectory,
      });
      const { fixture: f, setup: s, descriptor } = prepared;
      report.preparation = prepared.receipt;
      const forward = JSON.parse(
        await readFile(
          path.join(checkpointDirectory, 'pending-prefix-forward.json'),
          'utf8',
        ),
      );
      const renewal = JSON.parse(
        await readFile(
          path.join(checkpointDirectory, 'finite-execution-renewal.json'),
          'utf8',
        ),
      );
      assert.match(
        forward.database,
        /^postwar_clone_committed_resume_[a-f0-9]+$/u,
      );
      assert.equal(
        forward.status,
        'GUARDED_FORWARD_AND_RUNTIME_INTERNAL_DENIALS_PASSED',
      );
      assert.equal(
        forward.sqlSha256,
        createHash('sha256')
          .update(
            await readFile(
              path.join(
                repositoryRoot,
                'database/proposals/postwar-pending-programme-target-prefix.sql',
              ),
            ),
          )
          .digest('hex'),
      );
      assert.match(
        renewal.database,
        /^postwar_clone_committed_resume_[a-f0-9]+$/u,
      );
      assert.equal(renewal.after.registrationRef, descriptor.registrationRef);
      assert.equal(renewal.after.simTime, '0');
      report.guardedForward = forward;
      report.finiteRenewal = renewal;
      for (const file of [
        'pending-prefix-forward.json',
        'finite-execution-renewal.json',
      ])
        await copyFile(
          path.join(checkpointDirectory, file),
          path.join(evidenceDirectory, file),
        );
      await save();
      if (process.env.ECONMIND_RESUME_RENEW_EXECUTION === '1') {
        await copyFile(
          path.join(evidenceDirectory, 'finite-execution-renewal.json'),
          path.join(
            evidenceDirectory,
            'previous-finite-execution-renewal.json',
          ),
        );
        report.resumedFiniteRenewal = await renewResumedNativeExecution(
          prepared,
          path.join(evidenceDirectory, 'finite-execution-renewal.json'),
        );
        await save();
      }
      const beforeResume = await s.counts();
      const originalDirectories = required(
        'ECONMIND_RESUME_ORIGINAL_DIRECTORIES',
      ).split(':');
      const originals = new Map<
        string,
        {
          original: Parameters<
            ReturnType<typeof createRegisteredFinalDriver>['recover']
          >[0];
          stored: unknown;
        }
      >();
      for (const directory of originalDirectories) {
        assert(directory.startsWith('/workspace/.cloud-setup/evidence/'));
        const saved = JSON.parse(
          await readFile(path.join(directory, 'driver-progress.json'), 'utf8'),
        );
        for (const original of saved.originals) {
          const stored = saved.stored.find(
            (r: { commandId: string }) =>
              r.commandId === original.request.commandId,
          );
          assert(stored, 'SAVED_COMMITTED_RECEIPT_REQUIRED');
          const prior = originals.get(original.request.commandId);
          if (prior)
            assert.deepEqual(
              prior,
              { original, stored },
              'ORIGINAL_CHECKPOINT_CONFLICT',
            );
          else originals.set(original.request.commandId, { original, stored });
        }
      }
      assert.equal(
        String(originals.size),
        beforeResume.commands,
        'COMPLETE_CHECKPOINT_ORIGINAL_SET_REQUIRED',
      );
      assert.equal(beforeResume.commands, beforeResume.receipts);
      assert.equal(
        beforeResume.batches,
        String(
          [...originals.values()].reduce(
            (sum, value) => sum + Number(row(value.stored).financialBatchCount),
            0,
          ),
        ),
        'SAVED_FINANCIAL_RECEIPTS_MATCH_DATABASE',
      );
      assert.equal(
        beforeResume.inventory,
        String(
          [...originals.values()].reduce(
            (sum, value) =>
              sum + Number(row(value.stored).inventoryPostingCount),
            0,
          ),
        ),
        'SAVED_INVENTORY_RECEIPTS_MATCH_DATABASE',
      );
      const employmentCreations = [...originals.values()].filter(
        ({ original }) =>
          original.request.commandType ===
          'CORE_SOCIAL_EMPLOYMENT_SERVICE_CREATE_V1',
      );
      assert.equal(employmentCreations.length, 1);
      const original = employmentCreations[0]!.original;
      driver = createRegisteredFinalDriver({
        repositoryRoot,
        evidenceDirectory,
        worldId: f.marker.worldId,
        installer: f.clone.installer,
        allowedOrigin: 'https://pages-test.example',
        signToken: (countryId) => {
          assert(
            countryId === 'COUNTRY_01' ||
              countryId === 'COUNTRY_02' ||
              (countryId === 'COUNTRY_10' &&
                process.env.ECONMIND_FRESH_C10_PREFIX === '1' &&
                descriptor.countries.some(
                  (country) => String(country.countryId) === 'COUNTRY_10',
                )),
            'EXACT_REGISTERED_TEST_COUNTRY_REQUIRED',
          );
          // The restored signer accepts its actual saved C10 subject; the
          // legacy setup remains restricted by the descriptor/opt-in gate above.
          const signConfigured = s.signToken as (
            country: 'COUNTRY_01' | 'COUNTRY_02' | 'COUNTRY_10',
          ) => string;
          return signConfigured(countryId);
        },
      });
      const d = driver;
      report.driver = d.report;
      report.firstColdStart = await d.launch(descriptor);
      expect(await d.readHead()).toEqual({
        worldVersion: beforeResume.worldVersion,
        eventSequence: beforeResume.eventSequence,
      });
      expect(await d.rpc('CLOCK')).toBe('0');
      const acl = await d.rpc('ACL');
      assert(
        Array.isArray(acl) &&
          acl.length === 2 &&
          acl.every((v) => row(v).denied === true),
      );
      report.onlineRawSourceDenials = acl;
      report.originalRecovery = [];
      for (const saved of originals.values()) {
        const stored = await d.inspect(saved.original.request.commandId);
        assert.deepEqual(
          stored,
          saved.stored,
          'ORIGINAL_FINAL_MUST_MATCH_SAVED_RECEIPT',
        );
        d.originals.push(saved.original);
        d.stored.push(stored);
        (report.originalRecovery as unknown[]).push(
          await d.recover(saved.original, { duplicateProbe: false }),
        );
      }
      assert.deepEqual(await s.counts(), beforeResume);
      const savedBook = [...originals.values()].find(
        ({ original }) =>
          original.request.commandType ===
            'INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTE_V1' &&
          row(row(original.request.payload).operation).action === 'BOOK',
      );
      if (savedBook) {
        const runId = String(row(savedBook.original.request.payload).runId);
        report.retainedC10Planning = await d.rpc('C10_LOGISTICS_ORDERS', {
          countryId: 'COUNTRY_10',
          facilityId: 'OPEN-10-REFINED_FUEL',
          runId,
          refPrefix: 'C10_' + runId.slice('RUN_TEST_C10_'.length),
        });
        await save();
        assert.equal(
          row(report.retainedC10Planning).status,
          'ACTUAL_PLANNING_ROWS',
        );
        assert.deepEqual(await s.counts(), beforeResume);
      }
      if (process.env.ECONMIND_RESUME_STALE_PROJECTION === '1') {
        const before = await s.counts();
        const publication = row(
          await d.rpc('RETRY_PUBLICATION', {
            commandId: original.request.commandId,
          }),
        );
        report.retainedProjectionRepair = {
          classification:
            'OLD_STALE_DERIVED_REBUILD_FROM_EXISTING_FINAL_NOT_ECONOMIC_RESUBMISSION',
          commandId: original.request.commandId,
          result: publication,
        };
        await save();
        assert.equal(
          publication.status,
          'PUBLISHED',
          'EXISTING_FINAL_DERIVED_RETRY_REQUIRED',
        );
        assert.equal(row(publication.head).worldVersion, before.worldVersion);
        assert.equal(row(publication.head).eventSequence, before.eventSequence);
        assert.deepEqual(
          await s.counts(),
          before,
          'DERIVED_RETRY_CANNOT_CHANGE_ECONOMIC_HISTORY',
        );
      }
      report.openingReads = [];
      for (const [officeId, dataset] of [
        ['CENTRAL_BANK', 'cb-holdings'],
        ['TRADE', 'opening-inventory-entries'],
        ['SOCIAL', 'service-pools'],
        ['INDUSTRY', 'industry-labour-current'],
      ]) {
        const read = await d.post(
          '/v1/postwar-office-runtime',
          {
            schemaVersion: 'postwar-office-runtime-read-v1',
            requestId: randomUUID(),
            operation: 'READ_CURRENT_OFFICE_OPENING',
            officeId,
            dataset,
            page: { offset: 0, limit: 25 },
          },
          'COUNTRY_02',
        );
        await writeFile(
          path.join(evidenceDirectory, 'opening-' + officeId + '.json'),
          JSON.stringify(read, null, 2) + '\n',
        );
        assert.equal(
          read.status,
          200,
          officeId + '_ACTUAL_COMMITTED_CHECKPOINT_READ',
        );
        assert.equal(read.body.ok, true);
        (report.openingReads as unknown[]).push({
          officeId,
          dataset,
          status: read.status,
          source: read.body.source,
          page: read.body.page,
        });
      }
      await save();
      const playwrightModule =
        process.env.OFFICE_BROWSER_PLAYWRIGHT_MODULE ??
        '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
      const { chromium } = await import(pathToFileURL(playwrightModule).href);
      browser = await chromium.launch({
        headless: true,
        executablePath:
          process.env.OFFICE_BROWSER_EXECUTABLE ?? '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
      application = await createFixedOfficeBrowserApplication();
      const readConfiguration = descriptor.configuration;
      const common = {
        applicationOrigin: 'https://pages-test.example',
        browser,
        application,
        authSubject: s.subjects.COUNTRY_02,
        countryId: 'COUNTRY_02',
        countryDisplayId: '02',
        readConfiguration,
        getAccessToken: () => 'Bearer ' + s.signToken('COUNTRY_02'),
      };
      const currentHead = await d.readHead();
      const positionPages = await currentPages(d, 'positions', currentHead);
      const positions = positionPages.flatMap((page) => {
        assert(Array.isArray(page.body.rows));
        return page.body.rows.map(row);
      });
      const vacancies = positions.filter(
        (p) =>
          BigInt(String(p.requiredCount)) > BigInt(String(p.employedCount)),
      );
      assert.equal(positions.length, 60, 'ACTUAL_C2_POSITION_COUNT');
      assert.equal(
        vacancies.length,
        0,
        'NO_VACANCY_MUST_NOT_BE_REPLACED_WITH_SYNTHETIC_POSITION',
      );
      const poolPages = await currentPages(d, 'service-pools', currentHead);
      const programmeId = row(original.request.payload).programmeId;
      const pools = poolPages.flatMap((page) => {
        assert(Array.isArray(page.body.rows));
        return page.body.rows.map(row);
      });
      const creations = poolPages.flatMap((page) => {
        const options = row(
          row(page.body.source).currentEmploymentServiceCreationOptions,
        );
        if (options.status !== 'AVAILABLE') return [];
        const data = row(options.data);
        assert(Array.isArray(data.creations));
        return data.creations
          .map(row)
          .filter((c) => c.programmeId === programmeId);
      });
      assert.equal(
        creations.length,
        1,
        'COMMITTED_PROGRAMME_METADATA_MUST_READ_BACK',
      );
      assert(
        pools.some((p) => p.poolId === creations[0]!.childPoolId),
        'COMMITTED_PROGRAMME_POOL_MUST_READ_BACK',
      );
      report.social = {
        status: 'EXISTING_CREATE_FINAL_RECOVERED_PLAN_MATCH_NOT_RUN',
        programmeId,
        actualPositions: positions.length,
        actualVacancies: vacancies.length,
        reason: 'NO_ACTUAL_VACANT_POSITION',
      };
      await writeFile(
        path.join(evidenceDirectory, 'social-current-pages.json'),
        JSON.stringify(
          { head: currentHead, positionPages, poolPages },
          null,
          2,
        ) + '\n',
      );
      await save();
      const head = await d.readHead();
      const beforeRunsRead = await s.counts();
      const runs = await d.post(
        '/v1/postwar-office-runtime',
        {
          schemaVersion: 'postwar-office-runtime-read-v1',
          requestId: randomUUID(),
          operation: 'READ_CURRENT_OFFICE_OPENING',
          officeId: 'INDUSTRY',
          dataset: 'industry-committed-runs',
          page: { offset: 0, limit: 25 },
        },
        'COUNTRY_02',
      );
      assert.equal(runs.status, 200, 'ACTUAL_RESTRICTED_COMMITTED_RUNS_READ');
      assert.equal(runs.body.ok, true);
      const runSource = row(runs.body.source);
      assert.equal(
        runSource.dataNature,
        'ADMITTED_CURRENT_INDUSTRY_COMMITTED_RUNS',
      );
      const runCoverage = parseIndustryCommittedRunsCoverage(
        runSource.currentIndustryCommittedRunsCoverage,
      );
      assert.equal(runCoverage.countryId, 'COUNTRY_02');
      assert.equal(runCoverage.globalWorldVersion, head.worldVersion);
      assert.equal(runCoverage.globalEventSequence, head.eventSequence);
      assert.deepEqual(
        runs.body.rows,
        [],
        'NO_RUN_COMMAND_WAS_SUBMITTED_IN_THIS_SCOPED_CHAIN',
      );
      assert.deepEqual(await s.counts(), beforeRunsRead);
      report.industryCommittedRuns = {
        classification: 'ACTUAL_AUTHORIZED_EMPTY_COMMITTED_SCHEDULE_NOT_OUTPUT',
        status: runs.status,
        body: runs.body,
      };
      await save();
      report.browserReadback = await runRegisteredTradeCbReadbackBrowserProbe({
        ...common,
        apiBaseURL: d.origin(),
        expectedHead: head,
        failureEvidencePath: path.join(
          evidenceDirectory,
          'browser-readback-failure.json',
        ),
      });
      await save();
      report.programmeTarget = await runRegisteredProgrammeTargetBrowserChain({
        driver: d,
        browserInput: {
          ...common,
          actualOrigin: d.origin(),
          evidenceDir: path.join(evidenceDirectory, 'programme-target-browser'),
        },
        evidencePath: path.join(
          evidenceDirectory,
          'programme-target-browser.json',
        ),
        ...(process.env.ECONMIND_RESUME_PROGRAMME_EVIDENCE
          ? {
              resumeEvidencePath:
                process.env.ECONMIND_RESUME_PROGRAMME_EVIDENCE,
            }
          : {}),
      });
      await save();
      if (process.env.ECONMIND_FRESH_C10_PREFIX === '1') {
        assert(
          descriptor.countries.some(
            (country) => String(country.countryId) === 'COUNTRY_10',
          ),
          'ACTUAL_C10_DESCRIPTOR_REQUIRED',
        );
        report.c10 = await runFreshC10Prefix({
          driver: d,
          worldId: f.marker.worldId,
          evidencePath: path.join(evidenceDirectory, 'c10-prefix.json'),
          ...(process.env.ECONMIND_RESUME_C10_EVIDENCE
            ? { resumeEvidencePath: process.env.ECONMIND_RESUME_C10_EVIDENCE }
            : {}),
        });
        await save();
      }
      const recoveryHead = await d.readHead();
      const before = await s.counts();
      await d.stop();
      report.secondColdStart = await d.launch(descriptor);
      expect(await s.counts()).toEqual(before);
      expect(await d.readHead()).toEqual(recoveryHead);
      report.coldRecovery = await runRegisteredTradeCbReadbackBrowserProbe({
        ...common,
        apiBaseURL: d.origin(),
        expectedHead: recoveryHead,
        failureEvidencePath: path.join(
          evidenceDirectory,
          'cold-browser-readback-failure.json',
        ),
      });
      report.newOriginalRecoveries = [];
      for (const committedOriginal of d.originals)
        (report.newOriginalRecoveries as unknown[]).push(
          await d.recover(committedOriginal, { duplicateProbe: false }),
        );
      report.finalRecovery = await d.recover(original, {
        duplicateProbe: false,
      });
      assert.deepEqual(await s.counts(), before);
      report.status =
        'PASSED_SCOPED_H1_RECOVERY_READS_AND_COLD_BROWSER_NOT_ALL_OFFICES';
    } catch (error) {
      failures.push(error);
      report.status = 'FAILED';
      report.error = wireColdError(error);
    } finally {
      for (const close of [
        () => browser?.close(),
        () => application?.close(),
        () => driver?.stop(),
        () => prepared?.setup.close(),
        () => prepared?.fixture.cleanup(),
      ]) {
        try {
          await close();
        } catch (error) {
          failures.push(error);
        }
      }
      report.cleanupErrors = failures
        .slice(report.error ? 1 : 0)
        .map(wireColdError);
      await save();
    }
    if (failures.length)
      throw new AggregateError(
        failures,
        'RESUMED_REGISTERED_NATIVE_FAILED_OR_UNDRAINED',
      );
  }, 3600000);
});
