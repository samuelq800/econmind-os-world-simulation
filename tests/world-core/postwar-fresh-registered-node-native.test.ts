/** New isolated source-bound rehearsal. Does not restore or overwrite H3,
 * relax fixed source pins, or automatically run World/Clock consumers. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import { parseIndustryCommittedRunsCoverage } from '@econmind/core/postwar-industry-committed-runs-contract';
import { prepareFreshRegisteredNodeRehearsal } from '../support/fresh-registered-node-rehearsal.js';
import {
  createRegisteredFinalDriver,
  registeredFinalRecord as row,
} from '../support/postwar-registered-final-driver.js';
import { runRegisteredSocialCreateBrowserChain } from '../support/registered-social-create-browser-chain.js';
import { createFixedOfficeBrowserApplication } from '../../tools/office-connection/fixed-office-command-browser.mjs';
import { runRegisteredTradeCbReadbackBrowserProbe } from '../../tools/office-connection/registered-trade-cb-readback-browser-probe.mjs';
import { wireColdError } from '../../tools/office-connection/native-mixed-cold-errors.mjs';

const flag = process.env.ECONMIND_FRESH_REGISTERED_NODE_NATIVE;
if (flag !== undefined && flag !== '1')
  throw Error('FRESH_NATIVE_FLAG_MUST_BE_1');
const native = flag === '1' ? describe : describe.skip;
const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const required = (name: string): string => {
  const value = process.env[name];
  assert(value, 'EXPLICIT_FRESH_INPUT_REQUIRED:' + name);
  return value;
};

native('fresh actual-source registered Node and shipped browser', () => {
  it('creates one separate H0, runs finite Social originals, reads CB/Trade and cold-recovers the same DB', async () => {
    const expectedCommit = required('ECONMIND_REGISTERED_FINAL_CANDIDATE_SHA');
    const evidenceDirectory = required(
      'ECONMIND_REGISTERED_FINAL_EVIDENCE_DIR',
    );
    const manifestFile = required('ECONMIND_FRESH_SOURCE_MANIFEST');
    assert.match(expectedCommit, /^[a-f0-9]{40}$/u);
    assert(evidenceDirectory.startsWith('/workspace/.cloud-setup/evidence/'));
    await mkdir(evidenceDirectory, { recursive: true });
    const report: Record<string, unknown> = {
      classification:
        'NEW_ACTUAL_SOURCE_ISOLATED_REHEARSAL_NOT_H3_OR_PRODUCTION',
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
        path.join(evidenceDirectory, 'fresh-native.json'),
        JSON.stringify(report, null, 2) + '\n',
      );
    await save();
    let prepared:
      | Awaited<ReturnType<typeof prepareFreshRegisteredNodeRehearsal>>
      | undefined;
    let driver: ReturnType<typeof createRegisteredFinalDriver> | undefined;
    let browser: { close(): Promise<void> } | undefined;
    let application:
      | Awaited<ReturnType<typeof createFixedOfficeBrowserApplication>>
      | undefined;
    const failures: unknown[] = [];
    try {
      prepared = await prepareFreshRegisteredNodeRehearsal({
        repositoryRoot,
        evidenceDirectory,
        manifestFile,
        expectedCommit,
        ...(process.env.ECONMIND_FRESH_REFERENCE_MARKER
          ? { referenceMarkerPath: process.env.ECONMIND_FRESH_REFERENCE_MARKER }
          : {}),
      });
      const { fixture: f, setup: s, descriptor } = prepared;
      report.preparation = prepared.receipt;
      driver = createRegisteredFinalDriver({
        repositoryRoot,
        evidenceDirectory,
        worldId: f.marker.worldId,
        installer: f.clone.installer,
        allowedOrigin: 'https://pages-test.example',
        signToken: (countryId) => {
          assert(
            countryId === 'COUNTRY_01' || countryId === 'COUNTRY_02',
            'EXACT_REGISTERED_TEST_COUNTRY_REQUIRED',
          );
          return s.signToken(countryId);
        },
      });
      const d = driver;
      report.driver = d.report;
      report.firstColdStart = await d.launch(descriptor);
      expect(await d.readHead()).toEqual({
        worldVersion: '0',
        eventSequence: '0',
      });
      expect(await d.rpc('CLOCK')).toBe('0');
      const acl = await d.rpc('ACL');
      assert(
        Array.isArray(acl) &&
          acl.length === 2 &&
          acl.every((v) => row(v).denied === true),
      );
      report.onlineRawSourceDenials = acl;
      report.labour = [];
      for (const countryId of ['COUNTRY_01', 'COUNTRY_02'])
        (report.labour as unknown[]).push(
          await d.rpc('PUBLISH_H0_LABOUR', { countryId }),
        );
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
        assert.equal(read.status, 200, officeId + '_ACTUAL_H0_READ');
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
      report.social = await runRegisteredSocialCreateBrowserChain({
        driver: d,
        evidencePath: path.join(evidenceDirectory, 'social-browser.json'),
        browserInput: {
          ...common,
          actualOrigin: d.origin(),
          evidenceDir: path.join(evidenceDirectory, 'social-browser'),
        },
      });
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
      const before = await s.counts();
      await d.stop();
      report.secondColdStart = await d.launch(descriptor);
      expect(await s.counts()).toEqual(before);
      expect(await d.readHead()).toEqual(head);
      report.coldRecovery = await runRegisteredTradeCbReadbackBrowserProbe({
        ...common,
        apiBaseURL: d.origin(),
        expectedHead: head,
        failureEvidencePath: path.join(
          evidenceDirectory,
          'cold-browser-readback-failure.json',
        ),
      });
      assert.equal(
        row(report.social).status,
        'CREATE_PLAN_MATCH_ACTUAL_FINAL_PASSED',
        'SOCIAL_PARTIAL_OR_NOT_RUN_CANNOT_PASS_FULL_FINITE_CHAIN',
      );
      report.status = 'PASSED_SCOPED_C2_SOCIAL_CB_TRADE_NOT_ALL_OFFICES';
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
        'FRESH_REGISTERED_NATIVE_FAILED_OR_UNDRAINED',
      );
  }, 3600000);
});
