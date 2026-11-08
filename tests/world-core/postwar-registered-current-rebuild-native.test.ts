/** One genuine registered Node on the fixed-upgrade labour H3 clone. The same
 * cold proof prepares the finite adopted refinery sources. No CONSUME, economic
 * command, World initialization or Clock start; browser reads use the same Node. */
import { randomUUID } from 'node:crypto';
import { AUTHENTICATED_COMMAND_RECOVERY_SCHEMA } from '@econmind/core';
import {
  parsePostwarFinancialMixedCoverage,
  parsePostwarMixedFinancialBalanceRow,
  parsePostwarCentralBankOpeningInstruments,
} from '@econmind/core/postwar-financial-mixed-current-contract';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparePostwarRefinery21RetainedHostDescriptor } from '../support/postwar-refinery21-retained-inspection.js';
import { createFixedOfficeBrowserApplication } from '../../tools/office-connection/fixed-office-command-browser.mjs';
import { runRegisteredTradeCbReadbackBrowserProbe } from '../../tools/office-connection/registered-trade-cb-readback-browser-probe.mjs';
import { isDeepStrictEqual } from 'node:util';
import { describe, it, expect } from 'vitest';
import {
  parsePostwarTradeInventoryRow,
  parsePostwarTradeTransferRow,
  parsePostwarTradeCurrentCoverage,
} from '@econmind/core/postwar-trade-current-contract';
import {
  restoreRegisteredUtilityCheckpoint,
  type RegisteredUtilityResources,
  type RegisteredUtilitySetup,
} from '../support/registered-utility-checkpoint-restore.js';
import {
  createRegisteredFinalDriver,
  registeredFinalAssert as must,
  registeredFinalRecord as record,
} from '../support/postwar-registered-final-driver.js';
import { readRegisteredCurrentEconomicSnapshotFrom } from '../support/registered-current-read-repair-checkpoint.js';
import { prepareRegisteredFinalNativeSqlPlan } from '../../tools/office-connection/registered-final-native-sql.mjs';
import { wireColdError } from '../../tools/office-connection/native-mixed-cold-errors.mjs';
const gate = process.env.ECONMIND_REGISTERED_CURRENT_REBUILD_NATIVE;
if (gate !== undefined && gate !== '1')
  throw Error('CURRENT_REBUILD_NATIVE_FLAG_MUST_BE_1');
const native = gate === '1' ? describe : describe.skip;
const repositoryRoot = path.resolve(import.meta.dirname, '../..');

native(
  'one actual registered H3 current rebuild without economic writes',
  () => {
    it('retries derived publication, reads Trade and CB over TCP, and preserves every economic byte', async () => {
      must(
        process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE === '1',
        'REGISTERED_NODE_NATIVE_OPT_IN_REQUIRED',
      );
      const expectedCommit =
        process.env.ECONMIND_REGISTERED_FINAL_CANDIDATE_SHA;
      const evidenceDirectory =
        process.env.ECONMIND_REGISTERED_FINAL_EVIDENCE_DIR;
      must(
        expectedCommit &&
          /^[a-f0-9]{40}$/u.test(expectedCommit) &&
          evidenceDirectory,
        'FROZEN_CANDIDATE_AND_FRESH_EVIDENCE_REQUIRED',
      );
      const sqlPlan = await prepareRegisteredFinalNativeSqlPlan({
        repositoryRoot,
        expectedCommit,
      });
      await mkdir(evidenceDirectory, { recursive: true });
      const report: Record<string, unknown> = {
        candidate: expectedCommit,
        status: 'RUNNING',
        scope:
          'ONE_OS_REUSED_POWER_H3_SINGLE_FORWARD_REFINERY21_PREPARATION_DERIVED_REBUILD_TCP_AND_BROWSER_READ_ONLY',
        fixedRefinerySourcePreparation: 'SAME_LIVE_COLD_PROOF_AFTER_PRECHECK',
        economicCommandsPosted: 0,
        consumerSteps: 0,
        WorldOrOpeningSeedInitialization: false,
        fixedSourceRegistration:
          'EXPLICIT_ADOPTED_REFINERY21_OFFLINE_PREPARATION',
        WorldClockStarted: false,
      };
      const phases: unknown[] = [];
      const phase = async (name: string, status: string) => {
        const event = {
          name,
          status,
          at: new Date().toISOString(),
          parentPid: process.pid,
          parentRss: process.memoryUsage().rss,
        };
        phases.push(event);
        await writeFile(
          path.join(evidenceDirectory, 'current-rebuild-progress.json'),
          JSON.stringify({ phases }, null, 2) + '\n',
        );
        process.stdout.write(
          JSON.stringify({ currentRebuildPhase: event }) + '\n',
        );
      };
      let f: RegisteredUtilityResources | undefined,
        s: RegisteredUtilitySetup | undefined,
        d: ReturnType<typeof createRegisteredFinalDriver> | undefined;
      let browser: { close(): Promise<void> } | undefined;
      let application:
        | Awaited<ReturnType<typeof createFixedOfficeBrowserApplication>>
        | undefined;
      const previousRefineryFlag =
        process.env.ECONMIND_REGISTERED_REFINERY21_SOURCE_PREPARATION;
      let failure: unknown;
      const cleanupErrors: string[] = [];
      try {
        await phase(
          'EXACT_FINAL13_H3_CHECKPOINT_AND_FUNCTION_BINDING',
          'START',
        );
        const restored = await restoreRegisteredUtilityCheckpoint({
          repositoryRoot,
          evidenceDirectory,
          sqlPlan,
          checkpoint: 'POWER_UPGRADED_H3',
          expectedCommit,
        });
        f = restored.fixture;
        s = restored.setup;
        const resume = restored.resume;
        must(
          resume?.grant.state === 'FINALIZED',
          'ALL_THREE_EXISTING_FINALS_REQUIRED',
        );
        const before = await readRegisteredCurrentEconomicSnapshotFrom(
          f.clone.installer,
          f.marker.worldId,
        );
        report.before = before;
        await phase(
          'BOUNDED_REFINERY21_SOURCE_CAPACITY_AND_ROLE_PRECHECK',
          'START',
        );
        const descriptor = record(s.descriptor);
        must(
          Array.isArray(descriptor.countries),
          'EXISTING_FIXED_COUNTRIES_REQUIRED',
        );
        const countries = descriptor.countries.map((value) => {
          const c = record(value);
          must(
            typeof c.countryId === 'string' &&
              typeof c.expectedRawSourceSHA256 === 'string',
            'ACTUAL_COUNTRY_SOURCE_SELECTOR_REQUIRED',
          );
          return {
            countryId: c.countryId,
            expectedRawSourceSHA256: c.expectedRawSourceSHA256,
          };
        });
        const prepared = await preparePostwarRefinery21RetainedHostDescriptor({
          marker: f.marker,
          clone: f.clone,
          descriptor: {
            ...descriptor,
            repositoryRoot,
            worldId: f.marker.worldId,
            seedId: f.marker.seedId,
            seedFingerprint: f.marker.seedFingerprint,
            admissionRef: f.marker.admissionRef,
            database: f.clone.database,
            countries,
          },
        });
        report.refineryPreparation = {
          classification: prepared.classification,
          countries: prepared.descriptor.countries,
          inspectionActors: prepared.inspectionActors,
        };
        await phase(
          'BOUNDED_REFINERY21_SOURCE_CAPACITY_AND_ROLE_PRECHECK',
          'END',
        );
        await phase('EXACT_FINAL13_H3_CHECKPOINT_AND_FUNCTION_BINDING', 'END');
        d = createRegisteredFinalDriver({
          repositoryRoot,
          evidenceDirectory,
          worldId: f.marker.worldId,
          installer: f.clone.installer,
          allowedOrigin: 'https://pages-test.example',
          signToken: (cid) => {
            must(
              cid === 'COUNTRY_01' || cid === 'COUNTRY_02',
              'EXACT_EXISTING_SUBJECT_REQUIRED',
            );
            return s!.signToken(cid);
          },
        });
        report.driver = d.report;
        await phase(
          'ONE_NODE_GENUINE_COLD_PROOF_AND_FIXED21_SOURCE_PREPARATION',
          'START',
        );
        process.env.ECONMIND_REGISTERED_REFINERY21_SOURCE_PREPARATION =
          prepared.childEnvironment.ECONMIND_REGISTERED_REFINERY21_SOURCE_PREPARATION;
        report.node = await d.launch(prepared.descriptor);
        const sourcePublication = record(
          record(record(report.node).sourceEvidence).refinery21Preparation,
        );
        must(
          sourcePublication.classification ===
            'ACTUAL_ISOLATED_21_SOURCE_PUBLICATION_NOT_WORK_PAYMENT_DELIVERY_PRODUCTION' &&
            sourcePublication.worldId === f.marker.worldId &&
            sourcePublication.seedFingerprint === f.marker.seedFingerprint &&
            sourcePublication.admissionRef === f.marker.admissionRef,
          'ACTUAL_SAME_CHILD_REFINERY21_PUBLICATION_REQUIRED',
        );
        for (const key of ['originals', 'utilitySources', 'powerSources'])
          must(
            Array.isArray(sourcePublication[key]) &&
              sourcePublication[key].length === 21,
            'EXACT_21_SOURCE_PUBLICATION_RESULTS_REQUIRED:' + key,
          );
        must(
          Array.isArray(sourcePublication.notApplicableCountries) &&
            sourcePublication.notApplicableCountries.length === 49,
          'OTHER_49_COUNTRIES_NOT_REFINERIES_REQUIRED',
        );
        must(
          Array.isArray(sourcePublication.preparationActions) &&
            sourcePublication.preparationActions.length === 63,
          'ACTUAL_21_SOURCE_ACTIONS_PER_FAMILY_REQUIRED',
        );
        const expectedSourceCountries = new Set(
          (sourcePublication.originals as unknown[]).map(
            (value) => record(value).countryId,
          ),
        );
        must(
          expectedSourceCountries.size === 21,
          'EXACT_21_ORIGINAL_COUNTRIES_REQUIRED',
        );
        for (const type of ['FIRST_DAY', 'UTILITY', 'POWER']) {
          const actions = sourcePublication.preparationActions
            .map(record)
            .filter((action) => action.type === type);
          must(
            actions.length === 21 &&
              new Set(actions.map((action) => action.countryId)).size === 21 &&
              actions.every(
                (action) =>
                  expectedSourceCountries.has(action.countryId) &&
                  ['COMMITTED', 'REUSED_VERIFIED'].includes(
                    String(action.status),
                  ),
              ),
            'SOURCE_REUSE_AND_NEW_PUBLICATION_MUST_REMAIN_EXPLICIT:' + type,
          );
        }
        report.refinerySourcePublication = sourcePublication;
        await phase(
          'ONE_NODE_GENUINE_COLD_PROOF_AND_FIXED21_SOURCE_PREPARATION',
          'END',
        );
        await d.assertPreparationStartDenied();
        await d.recover(resume.run, { duplicateProbe: false });
        await d.recover(resume.book, { duplicateProbe: false });
        const grantBefore = await d.inspect(resume.grant.commandId);
        await phase('RETRY_ACTUAL_FINAL_DERIVED_PUBLICATION', 'START');
        const published = record(
          await d.rpc('RETRY_PUBLICATION', {
            commandId: resume.grant.commandId,
          }),
        );
        must(
          published.status === 'PUBLISHED' &&
            published.commandId === resume.grant.commandId &&
            published.countryId === 'COUNTRY_02',
          'ACTUAL_CURRENT_PUBLICATION_REQUIRED:' + JSON.stringify(published),
        );
        expect(record(published.head)).toEqual({
          worldId: f.marker.worldId,
          worldVersion: '3',
          eventSequence: '3',
        });
        report.publication = published;
        await phase('RETRY_ACTUAL_FINAL_DERIVED_PUBLICATION', 'END');
        const readBody = (
          officeId: string,
          dataset: string,
          offset = 0,
          sourceVersion?: string,
          bindingVersion?: string,
        ) => ({
          schemaVersion: 'postwar-office-runtime-read-v1',
          requestId: randomUUID(),
          operation: 'READ_CURRENT_OFFICE_OPENING',
          officeId,
          dataset,
          page: {
            offset,
            limit: 1,
            ...(sourceVersion ? { sourceVersion } : {}),
            ...(bindingVersion ? { bindingVersion } : {}),
          },
        });
        await phase('ACTUAL_TRADE_AND_CB_TCP_PAGES', 'START');
        const inventory = await d.post(
          '/v1/postwar-office-runtime',
          readBody('TRADE', 'inventory-current'),
          'COUNTRY_02',
        );
        const validate = (response: {
          status: number;
          body: Record<string, unknown>;
        }) => {
          must(
            response.status === 200 &&
              response.body.ok === true &&
              Array.isArray(response.body.rows),
            'ACTUAL_HTTP_CURRENT_PAGE_REQUIRED:' + JSON.stringify(response),
          );
          const source = record(response.body.source);
          must(
            source.worldVersion === '3' && source.eventSequence === '3',
            'SAME_H3_CURRENT_SOURCE_REQUIRED',
          );
          return source;
        };
        const invSource = validate(inventory);
        must(
          (inventory.body.rows as unknown[]).length === 1,
          'BOUNDED_ACTUAL_INVENTORY_ROW_REQUIRED',
        );
        parsePostwarTradeInventoryRow((inventory.body.rows as unknown[])[0]);
        parsePostwarTradeCurrentCoverage(invSource.currentTradeCoverage);
        const page = record(inventory.body.page);
        must(
          page.nextOffset === 1 &&
            page.total === 10 &&
            typeof invSource.sourceVersion === 'string' &&
            typeof invSource.bindingVersion === 'string',
          'ACTUAL_CURRENT_PAGINATION_REQUIRED',
        );
        const inventoryPages = [inventory];
        let nextOffset: unknown = page.nextOffset;
        while (nextOffset !== null) {
          must(
            Number.isSafeInteger(nextOffset) &&
              Number(nextOffset) > 0 &&
              inventoryPages.length < 10,
            'FINITE_TEN_ROW_PAGINATION_REQUIRED',
          );
          const next = await d.post(
            '/v1/postwar-office-runtime',
            readBody(
              'TRADE',
              'inventory-current',
              Number(nextOffset),
              invSource.sourceVersion,
              invSource.bindingVersion,
            ),
            'COUNTRY_02',
          );
          const source = validate(next);
          must(
            source.sourceVersion === invSource.sourceVersion &&
              source.bindingVersion === invSource.bindingVersion,
            'SAME_PINNED_CURRENT_PAGE_SERIES_REQUIRED',
          );
          (next.body.rows as unknown[]).forEach(parsePostwarTradeInventoryRow);
          inventoryPages.push(next);
          nextOffset = record(next.body.page).nextOffset;
        }
        const inventoryRows = inventoryPages.flatMap(
          (response) => response.body.rows as unknown[],
        );
        must(
          inventoryRows.length === 10,
          'ALL_TEN_ACTUAL_CURRENT_INVENTORY_ROWS_REQUIRED',
        );
        const expectedRows = await f.clone.installer.query<{
          document_ref: string;
          rows_text: string;
        }>(
          `select d.document_ref,p.rows_text from world_v2.postwar_office_projection_document d join world_v2.postwar_office_projection_page p using(document_ref)
           where d.world_id=$1 and d.country_id='COUNTRY_02'and d.office_id='TRADE'and d.dataset='opening-inventory-entries-complete-v2'order by p.page_index`,
          [f.marker.worldId],
        );
        must(
          expectedRows.rows.length > 0,
          'ACTUAL_REPAIRED_IMMUTABLE_INVENTORY_REQUIRED',
        );
        const openingRows = expectedRows.rows.flatMap((row) => {
          must(
            row.document_ref ===
              record(invSource.sourcePointer).openingDocumentRef,
            'CURRENT_HTTP_SOURCE_MUST_BIND_REPAIRED_OPENING_DOCUMENT',
          );
          const values: unknown = JSON.parse(row.rows_text);
          must(Array.isArray(values), 'ACTUAL_OPENING_ROW_ARRAY_REQUIRED');
          return values.map(record);
        });
        must(
          openingRows.length === 10,
          'EXACT_TEN_REPAIRED_OPENING_ENTRIES_REQUIRED',
        );
        for (const entry of openingRows) {
          const account = { ...record(entry.account) };
          delete account.worldId;
          const expected = {
            ...account,
            schemaVersion: 'postwar-trade-current-inventory-row-v1',
            quantity: record(entry.quantity).amount,
          };
          must(
            inventoryRows.filter((row) => isDeepStrictEqual(row, expected))
              .length === 1,
            'ACTUAL_HTTP_INVENTORY_MUST_EQUAL_IMMUTABLE_ADMITTED_QUANTITY',
          );
        }
        const supplements = openingRows.filter((entry) =>
          [
            'POSTWAR_STUDENT_DAY_MATERIAL_V1',
            'POSTWAR_CLINICAL_MEDICINE_V1',
          ].includes(String(record(entry.account).commodityId)),
        );
        must(
          supplements.length === 2 &&
            supplements.every(
              (entry) =>
                typeof entry.sourceId === 'string' &&
                entry.sourceId.startsWith('POSTWAR_SUPPLY_SOURCE_'),
            ),
          'TWO_ACTUAL_SUPPLEMENTAL_SOURCE_ROWS_REQUIRED',
        );
        report.supplementalHttpRows = supplements.map((entry) => ({
          sourceId: entry.sourceId,
          account: entry.account,
          quantity: entry.quantity,
          actualHttpRow: inventoryRows.find(
            (row) => record(row).batchId === record(entry.account).batchId,
          ),
        }));
        const transfers = await d.post(
          '/v1/postwar-office-runtime',
          readBody('TRADE', 'goods-transfers-current'),
          'COUNTRY_02',
        );
        validate(transfers);
        (transfers.body.rows as unknown[]).forEach(
          parsePostwarTradeTransferRow,
        );
        expect(transfers.body.rows).toEqual([]);
        const cb = await d.post(
          '/v1/postwar-office-runtime',
          readBody('CENTRAL_BANK', 'ledger-balances'),
          'COUNTRY_02',
        );
        const cbSource = validate(cb);
        parsePostwarFinancialMixedCoverage(cbSource.currentFinancialCoverage, {
          countryId: 'COUNTRY_02',
          worldVersion: '3',
          eventSequence: '3',
        });
        must(
          (cb.body.rows as unknown[]).length === 1,
          'ACTUAL_CB_LEDGER_ROW_REQUIRED',
        );
        (cb.body.rows as unknown[]).forEach((value) =>
          parsePostwarMixedFinancialBalanceRow(value, {
            countryId: 'COUNTRY_02',
            officeId: 'CENTRAL_BANK',
          }),
        );
        const instruments = parsePostwarCentralBankOpeningInstruments(
          cbSource.centralBankOpeningInstruments,
        );
        must(
          instruments.countryId === 'COUNTRY_02' &&
            instruments.status === 'NO_DECLARED_DOMESTIC_GOVERNMENT_SECURITY' &&
            instruments.governmentSecurityHoldingCount === 0 &&
            instruments.bankLoanRecordCount === 0 &&
            instruments.originWorldVersion === '0' &&
            instruments.originEventSequence === '0',
          'ACTUAL_H0_CB_DECLARATIONS_MUST_REMAIN_EXPLICIT_AT_H3',
        );
        report.httpPages = { inventoryPages, transfers, cb };
        await phase('ACTUAL_TRADE_AND_CB_TCP_PAGES', 'END');
        await phase(
          'SHIPPED_CHROMIUM_TRADE_AND_CB_READBACK_SAME_NODE',
          'START',
        );
        const modulePath =
          process.env.OFFICE_BROWSER_PLAYWRIGHT_MODULE ??
          '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
        must(
          path.isAbsolute(modulePath),
          'EXPLICIT_LOCAL_PLAYWRIGHT_MODULE_REQUIRED',
        );
        const { chromium } = await import(pathToFileURL(modulePath).href);
        browser = await chromium.launch({
          headless: true,
          executablePath:
            process.env.OFFICE_BROWSER_EXECUTABLE ?? '/usr/bin/chromium',
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        });
        application = await createFixedOfficeBrowserApplication();
        const config = record(descriptor.configuration),
          pins = record(config.admittedWorldPins),
          endpoints = record(config.endpointPins);
        const text = (value: unknown): string => {
          must(
            typeof value === 'string' && value.length > 0,
            'ACTUAL_READ_CONFIG_STRING_REQUIRED',
          );
          return value;
        };
        const subjectRows = await f.clone.installer.query<{
          auth_subject: string;
        }>(
          "select distinct auth_subject::text from world_v2.current_commit_authorization where world_id=$1 and country_id='COUNTRY_02' and office_id='INDUSTRY' and active",
          [f.marker.worldId],
        );
        must(
          subjectRows.rows.length === 1,
          'SAME_EXISTING_C2_AUTH_SUBJECT_REQUIRED',
        );
        report.browser = await runRegisteredTradeCbReadbackBrowserProbe({
          browser,
          application,
          apiBaseURL: d.origin(),
          applicationOrigin: 'https://pages-test.example',
          authSubject: subjectRows.rows[0]!.auth_subject,
          countryId: 'COUNTRY_02',
          countryDisplayId: '02',
          getAccessToken: () => 'Bearer ' + s!.signToken('COUNTRY_02'),
          expectedHead: { worldVersion: '3', eventSequence: '3' },
          readConfiguration: {
            modelVersion: text(config.modelVersion),
            admittedWorldPins: {
              worldId: text(pins.worldId),
              seedRef: text(pins.seedRef),
              contentHash: text(pins.contentHash),
              admissionRef: text(pins.admissionRef),
              minimumWorldVersion: text(pins.minimumWorldVersion),
            },
            endpointPins: {
              origin: text(endpoints.origin),
              projectionPath: text(endpoints.projectionPath),
              finalLookupPath: text(endpoints.finalLookupPath),
              deploymentRef: text(endpoints.deploymentRef),
            },
          },
        });
        await phase('SHIPPED_CHROMIUM_TRADE_AND_CB_READBACK_SAME_NODE', 'END');
        const denied = await fetch(d.origin() + '/v1/postwar-office-runtime', {
          method: 'POST',
          headers: {
            origin: 'https://pages-test.example',
            'content-type': 'application/json',
          },
          body: JSON.stringify(readBody('TRADE', 'inventory-current')),
          signal: AbortSignal.timeout(15000),
        });
        expect(denied.status).toBe(401);
        await denied.arrayBuffer();
        const cross = await d.post(
          '/v1/command-recovery',
          {
            schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
            requestId: randomUUID(),
            request: {
              worldId: f.marker.worldId,
              commandId: resume.run.request.commandId,
              idempotencyKey: resume.run.request.idempotencyKey,
              originalRequest: resume.run,
            },
          },
          'COUNTRY_01',
        );
        expect(cross.status).toBe(403);
        report.negatives = {
          noJwtStatus: denied.status,
          crossCountryRecoveryStatus: cross.status,
        };
        expect(await d.inspect(resume.grant.commandId)).toEqual(grantBefore);
        const after = await readRegisteredCurrentEconomicSnapshotFrom(
          f.clone.installer,
          f.marker.worldId,
        );
        must(
          isDeepStrictEqual(before.economic, after.economic),
          'CURRENT_REBUILD_MUST_PRESERVE_EVERY_ECONOMIC_ROW_HASH',
        );
        report.after = after;
        await d.stop();
        await d.finish('PASS');
        report.status = 'PASS';
      } catch (e) {
        failure = e;
        report.status = 'FAIL';
        report.error = wireColdError(e);
        try {
          await d?.finish('FAIL', e);
        } catch (logError) {
          cleanupErrors.push(String(logError));
        }
      } finally {
        if (previousRefineryFlag === undefined)
          delete process.env.ECONMIND_REGISTERED_REFINERY21_SOURCE_PREPARATION;
        else
          process.env.ECONMIND_REGISTERED_REFINERY21_SOURCE_PREPARATION =
            previousRefineryFlag;
        for (const close of [
          () => application?.close(),
          () => browser?.close(),
          () => d?.stop(),
          () => s?.close(),
          () => f?.cleanup(),
        ])
          try {
            await close();
          } catch (e) {
            cleanupErrors.push(String(e));
          }
        report.cleanupErrors = cleanupErrors;
        try {
          report.retainedCheckpoint = JSON.parse(
            await readFile(
              path.join(evidenceDirectory, 'pg/retained-checkpoint.json'),
              'utf8',
            ),
          );
        } catch (e) {
          if (!f && (e as { code?: unknown }).code === 'ENOENT')
            report.retainedCheckpoint = {
              resourceState: 'NO_OWNED_RESOURCE_CREATED',
            };
          else cleanupErrors.push(String(e));
        }
        if (cleanupErrors.length) report.status = 'FAIL';
        await writeFile(
          path.join(evidenceDirectory, 'current-rebuild-report.json'),
          JSON.stringify(report, null, 2) + '\n',
        );
      }
      if (failure !== undefined) throw failure;
      must(cleanupErrors.length === 0, 'CURRENT_REBUILD_CLEANUP_NOT_CONFIRMED');
      // This one explicit refinery21 case includes cold proof, source checks and
      // bounded cleanup/readback; ordinary suites and online bounds are unchanged.
    }, 4200000);
  },
);
