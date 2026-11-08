/** Opt-in C2 transport/consumer smoke test. Reuses retained child DATA, never
 * regenerates genesis or reuses a serialized proof. Each Node OS proves its
 * source anew; the second OS recovers the same disposable database. */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { INDUSTRY_FIRST_DAY_POLICY_VERSION } from '@econmind/core';
import { parseIndustryUtilityPlanningRow } from '@econmind/core/postwar-industry-utility-planning-contract';
import { createPostwarBeneficialRentChildNativeFixture } from '../support/postwar-beneficial-rent-child-native-fixture.js';
import { createRegisteredFinalNodeSetup } from '../support/registered-final-node-setup.js';
import {
  createRegisteredFinalDriver,
  deriveRegisteredFinalIndustryRunPlan,
  registeredFinalPublishedCommand,
  registeredFinalAssert as must,
} from '../support/postwar-registered-final-driver.js';
import { prepareRegisteredFinalNativeSqlPlan } from '../../tools/office-connection/registered-final-native-sql.mjs';
import { wireColdError } from '../../tools/office-connection/native-mixed-cold-errors.mjs';

const gate = process.env.ECONMIND_REGISTERED_UTILITY_NATIVE;
if (gate !== undefined && gate !== '1')
  throw Error('REGISTERED_UTILITY_NATIVE_FLAG_MUST_BE_1');
const native = gate === '1' ? describe : describe.skip;
const repositoryRoot = path.resolve(import.meta.dirname, '../..');

native('actual registered C2 RUN POWER BOOK WATER GRANT', () => {
  it('uses one finite consumer and recovers FINAL in a new cold Node OS without economic resubmission', async () => {
    must(
      process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE === '1',
      'REGISTERED_CHILD_INITIALIZATION_OPT_IN_REQUIRED',
    );
    const expectedCommit = process.env.ECONMIND_REGISTERED_FINAL_CANDIDATE_SHA;
    must(
      expectedCommit && /^[a-f0-9]{40}$/u.test(expectedCommit),
      'FROZEN_SHA_REQUIRED',
    );
    const evidenceDirectory =
      process.env.ECONMIND_REGISTERED_FINAL_EVIDENCE_DIR;
    must(evidenceDirectory, 'FRESH_SHORT_OWNED_EVIDENCE_DIRECTORY_REQUIRED');
    const sqlPlan = await prepareRegisteredFinalNativeSqlPlan({
      repositoryRoot,
      expectedCommit,
    });
    await mkdir(evidenceDirectory, { recursive: true });
    const report: Record<string, unknown> = {
      candidate: expectedCommit,
      sqlPlanSha256: sqlPlan.planSha256,
      status: 'RUNNING',
      classification: 'TEST_ONLY_C2_REGISTERED_CONNECTION_NOT_PRODUCTION',
      previousChildDatabaseCheckpoint: 'NOT_RECOVERABLE_DB_CHECKPOINT',
      scope: 'RUN_POWER_BOOK_WATER_GRANT_AND_SAME_DATABASE_NODE_RESTART',
      notCovered: [
        'POWER_DELIVERY',
        'WATER_WORK_PAYMENT_DELIVERY',
        'ALL_70_COUNTRY_EXECUTION',
        'PLATFORM_TLS',
        'PRODUCTION',
      ],
      WorldClockStarted: false,
    };
    const save = () =>
      writeFile(
        path.join(evidenceDirectory, 'utility-native-report.json'),
        JSON.stringify(report, null, 2) + '\n',
      );
    let fixture:
      | Awaited<
          ReturnType<typeof createPostwarBeneficialRentChildNativeFixture>
        >
      | undefined;
    let setup:
      Awaited<ReturnType<typeof createRegisteredFinalNodeSetup>> | undefined;
    let driver: ReturnType<typeof createRegisteredFinalDriver> | undefined;
    const phases: Readonly<Record<string, unknown>>[] = [];
    const began = performance.now();
    let currentPhase = 'NOT_STARTED';
    const phase = async (
      name: string,
      status: 'START' | 'END' | 'FAILED',
      detail: Readonly<Record<string, unknown>> = {},
    ) => {
      currentPhase = name;
      const event = {
        name,
        status,
        at: new Date().toISOString(),
        elapsedMs: performance.now() - began,
        parentPid: process.pid,
        parentRss: process.memoryUsage().rss,
        ...(fixture
          ? {
              ownedContainer: fixture.marker.ownedContainer,
              database: fixture.clone.database,
            }
          : {}),
        ...detail,
      };
      phases.push(event);
      await writeFile(
        path.join(evidenceDirectory, 'utility-native-progress.json'),
        JSON.stringify(
          {
            classification: 'HISTORICAL_PHASE_EVENTS_NOT_PROCESS_LIVENESS',
            phases,
          },
          null,
          2,
        ) + '\n',
      );
      process.stdout.write(
        JSON.stringify({ utilityNativePhase: event }) + '\n',
      );
    };
    try {
      await save();
      const initialization = performance.now();
      await phase('FIXTURE_SOURCE_PROOF_AND_NEW_OWNED_DATABASE', 'START');
      fixture = await createPostwarBeneficialRentChildNativeFixture({
        repositoryRoot,
        evidenceDirectory: path.join(evidenceDirectory, 'pg'),
        artifactDirectory:
          '/workspace/.cloud-setup/evidence/beneficial-rent-candidate-20261101',
        retainOwnedCheckpointOnCleanup: true,
      });
      await phase('FIXTURE_SOURCE_PROOF_AND_NEW_OWNED_DATABASE', 'END', {
        head: 'H0',
        sourceProofOrdinal: 1,
      });
      report.initializationMs = performance.now() - initialization;
      report.seedFingerprint = fixture.marker.seedFingerprint;
      await phase('FIXED_SOURCE_PUBLICATION_AND_REGISTERED_SETUP', 'START');
      setup = await createRegisteredFinalNodeSetup({
        fixture,
        repositoryRoot,
        sqlPlan,
      });
      await phase('FIXED_SOURCE_PUBLICATION_AND_REGISTERED_SETUP', 'END');
      const f = fixture,
        s = setup;
      driver = createRegisteredFinalDriver({
        repositoryRoot,
        evidenceDirectory,
        worldId: f.marker.worldId,
        installer: f.clone.installer,
        allowedOrigin: 'https://pages-test.example',
        signToken: (cid) => {
          must(
            cid === 'COUNTRY_01' || cid === 'COUNTRY_02',
            'FIXED_TEST_COUNTRY_REQUIRED',
          );
          return s.signToken(cid);
        },
      });
      const d = driver;
      report.driver = d.report;
      report.ddlReceipts = s.ddlReceipts;
      report.directRpcEnrollment = s.directRpcEnrollment;
      await phase('NODE_1_COLD_PROOF', 'START');
      const first = await d.launch(s.descriptor);
      await phase('NODE_1_COLD_PROOF', 'END', {
        childPid: first.pid,
        sourceProofOrdinal: 2,
      });
      await d.start();
      const terms = deriveRegisteredFinalIndustryRunPlan(
        await d.rpc('INDUSTRY_SELECTORS', {
          countryId: 'COUNTRY_02',
          facilityId: 'OPEN-02-REFINED_FUEL',
        }),
      );
      must(
        terms.sourceRef === s.industrySource.sourceRef &&
          terms.sourceRawSha256 === s.industrySource.sourceSha256,
        'ACTUAL_FIRSTDAY_SOURCE_REQUIRED',
      );
      const id = randomUUID().replaceAll('-', '').toUpperCase(),
        runId = 'UTILITY_RUN_' + id;
      const run = await d.makeRequest({
        countryId: 'COUNTRY_02',
        officeId: 'INDUSTRY',
        commandType: 'CORE_INDUSTRY_RUN_SCHEDULE_V1',
        commandId: 'UTILITY_RUN_CMD_' + id,
        idempotencyKey: 'UTILITY_RUN_KEY_' + id,
        payload: {
          schemaVersion: 'postwar-industry-run-schedule-v1',
          runId,
          facilityId: 'OPEN-02-REFINED_FUEL',
          policyVersion: INDUSTRY_FIRST_DAY_POLICY_VERSION,
          sourceRef: terms.sourceRef,
          sourceRawSha256: terms.sourceRawSha256,
          quantity: terms.quantity,
          startsAtSimTime: terms.startsAtSimTime,
          endsAtSimTime: terms.endsAtSimTime,
          maximumExpense: terms.maximumExpense,
        },
      });
      await phase('RUN', 'START', { childPid: first.pid });
      const runFp = await d.submit(run);
      await d.consume(run.request.commandId, {
        commandType: run.request.commandType,
        countryId: 'COUNTRY_02',
        fingerprint: runFp,
        financialBatches: 0,
        inventoryPostings: 0,
      });
      await phase('RUN', 'END', { head: await d.readHead() });
      const planning = await d.post(
        '/v1/postwar-office-runtime',
        {
          schemaVersion: 'postwar-office-runtime-read-v1',
          requestId: randomUUID(),
          operation: 'READ_CURRENT_OFFICE_OPENING',
          officeId: 'INDUSTRY',
          dataset: 'industry-utility-planning',
          page: { offset: 0, limit: 25 },
        },
        'COUNTRY_02',
      );
      must(
        planning.status === 200 &&
          planning.body.ok === true &&
          Array.isArray(planning.body.rows),
        'ACTUAL_PLANNING_HTTP_PAGE_REQUIRED:' + JSON.stringify(planning),
      );
      const choices = planning.body.rows
        .map(parseIndustryUtilityPlanningRow)
        .filter(
          (r) =>
            r.serviceKind === 'POWER' &&
            r.action === 'BOOK' &&
            r.runId === runId &&
            r.parameters.purpose === 'INDUSTRY_SELF_USE',
        );
      must(choices.length === 1, 'ONE_ACTUAL_RUN_POWER_PLANNING_ROW_REQUIRED');
      const row = choices[0]!;
      report.powerPlanning = row;
      await phase('POWER_BOOK', 'START', { childPid: first.pid });
      const book = await d.makeRequest({
        countryId: 'COUNTRY_02',
        officeId: 'INDUSTRY',
        commandType: 'INDUSTRY_FIRST_DAY_POWER_EXECUTE_V1',
        commandId: 'UTILITY_POWER_CMD_' + id,
        idempotencyKey: 'UTILITY_POWER_KEY_' + id,
        payload: {
          schemaVersion: 'industry-first-day-utility-command-v1',
          serviceKind: 'POWER',
          operationRef: 'UTILITY_POWER_OP_' + id,
          facilityId: row.facilityId,
          runId,
          sourceRef: row.sourceRef,
          sourceRawSha256: row.sourceRawSha256,
          operation: {
            action: 'BOOK',
            bookingRef: 'UTILITY_BOOKING_' + id,
            purpose: 'INDUSTRY_SELF_USE',
            fromSimTime: row.runStartsAtSimTime,
            throughSimTime: row.runEndsAtSimTime,
            outputMWh: '0.000001',
          },
        },
      });
      const bookFp = await d.submit(book);
      await d.consume(book.request.commandId, {
        commandType: book.request.commandType,
        countryId: 'COUNTRY_02',
        fingerprint: bookFp,
        financialBatches: 0,
        inventoryPostings: 0,
      });
      await phase('POWER_BOOK', 'END', { head: await d.readHead() });
      const scope = {
        countryId: 'COUNTRY_02',
        facilityId: 'OPEN-02-REFINED_FUEL',
        runId,
      };
      await phase('WATER_GRANT', 'START', { childPid: first.pid });
      const grant = registeredFinalPublishedCommand(
        await d.rpc('PUBLISH_WATER_GRANT', scope),
      );
      const afterPublish = await s.counts();
      expect(
        registeredFinalPublishedCommand(
          await d.rpc('PUBLISH_WATER_GRANT', scope),
        ),
      ).toEqual(grant);
      expect(await s.counts()).toEqual(afterPublish);
      const committed = await d.consume(grant.commandId, {
        commandType: 'INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1',
        countryId: 'COUNTRY_02',
        fingerprint: grant.commandFingerprint,
        financialBatches: 0,
        inventoryPostings: 0,
      });
      expect(committed.authorityKind).toBe('VERSIONED_AUTOMATIC');
      expect(committed.officeId).toBeNull();
      await phase('WATER_GRANT', 'END', { head: await d.readHead() });
      const counts = await s.counts();
      await d.stop();
      const descriptor = await s.rotateFiniteClock({
        simTime: '0',
        previousHostStopped: true,
      });
      await phase('NODE_2_COLD_PROOF_SAME_DATABASE', 'START');
      const second = await d.launch(descriptor);
      await phase('NODE_2_COLD_PROOF_SAME_DATABASE', 'END', {
        childPid: second.pid,
        sourceProofOrdinal: 3,
      });
      must(first.pid !== second.pid, 'DISTINCT_COLD_OS_PID_REQUIRED');
      report.coldStarts = [first, second];
      await phase('DURABLE_FINAL_RECOVERY_NO_RESUBMISSION', 'START', {
        childPid: second.pid,
      });
      await d.recover(run);
      await d.recover(book);
      expect(await d.inspect(grant.commandId)).toEqual(committed);
      expect(
        registeredFinalPublishedCommand(
          await d.rpc('PUBLISH_WATER_GRANT', scope),
        ),
      ).toEqual(grant);
      expect(await s.counts()).toEqual(counts);
      expect(await d.readHead()).toEqual({
        worldVersion: '3',
        eventSequence: '3',
      });
      report.counts = counts;
      await phase('DURABLE_FINAL_RECOVERY_NO_RESUBMISSION', 'END', {
        head: await d.readHead(),
      });
      report.status = 'PASS';
      await d.finish('PASS');
    } catch (error) {
      await phase(currentPhase, 'FAILED');
      report.status = 'FAIL';
      report.error = wireColdError(error);
      await driver?.finish('FAIL', error);
      throw error;
    } finally {
      const cleanupErrors: string[] = [];
      await phase('DRAIN_AND_RETAIN_OWNED_STOPPED_CHECKPOINT', 'START');
      for (const close of [
        () => driver?.stop(),
        () => setup?.close(),
        () => fixture?.cleanup(),
      ])
        try {
          await close();
        } catch (e) {
          cleanupErrors.push(String(e));
        }
      report.cleanup = cleanupErrors.length === 0 ? 'COMPLETED' : cleanupErrors;
      if (fixture) {
        try {
          report.resourceCheckpoint = JSON.parse(
            await readFile(
              path.join(evidenceDirectory, 'pg', 'retained-checkpoint.json'),
              'utf8',
            ),
          ) as unknown;
        } catch (error) {
          cleanupErrors.push(String(error));
        }
      }
      if (cleanupErrors.length) {
        report.cleanup = cleanupErrors;
        report.status = 'FAIL_CLEANUP';
      }
      await phase(
        'DRAIN_AND_RETAIN_OWNED_STOPPED_CHECKPOINT',
        cleanupErrors.length ? 'FAILED' : 'END',
        {
          resourceState:
            fixture && cleanupErrors.length === 0
              ? 'RETAINED_STOPPED'
              : 'UNCONFIRMED',
        },
      );
      await save();
      must(
        cleanupErrors.length === 0,
        'OWNED_CHILD_CLEANUP_REQUIRED:' + cleanupErrors.join(';'),
      );
    }
  }, 1800000);
});
