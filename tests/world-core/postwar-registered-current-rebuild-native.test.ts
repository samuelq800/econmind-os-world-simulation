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
import {
  preparePostwarRefinery21RetainedHostDescriptor,
  inspectPostwarRefinery21RetainedClone,
} from '../support/postwar-refinery21-retained-inspection.js';
import { loadPostwarSourceContext } from '../../apps/world-worker/src/preparation/postwar-source-context.js';
import { createFixedOfficeBrowserApplication } from '../../tools/office-connection/fixed-office-command-browser.mjs';
import { runRegisteredTradeCbReadbackBrowserProbe } from '../../tools/office-connection/registered-trade-cb-readback-browser-probe.mjs';
import type { RegisteredTradeCbReadbackBrowserInput } from '../../tools/office-connection/registered-trade-cb-readback-browser-probe.mjs';
import { createRegisteredSocialServiceContextBrowserProbe } from '../../tools/office-connection/registered-social-service-browser-probe.mjs';
import {
  REGISTERED_CURRENT_BROWSER_SUBJECT_QUERY,
  registeredCurrentC2BrowserSubject,
  type RegisteredCurrentBrowserActorBinding,
} from '../support/registered-current-browser-subject.js';
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
import { upgradeRegisteredSocialRetainedClone } from '../support/registered-social-retained-upgrade.js';
import { runRegisteredSocialCreateBrowserChain } from '../support/registered-social-create-browser-chain.js';
import { inspectRegisteredC10LogisticsPreflight } from '../support/registered-c10-logistics-preflight.js';
const socialCreation =
  process.env.ECONMIND_REGISTERED_SOCIAL_CREATION_UPGRADE_NATIVE === '1';
const gate = process.env.ECONMIND_REGISTERED_CURRENT_REBUILD_NATIVE;
if (gate !== undefined && gate !== '1')
  throw Error('CURRENT_REBUILD_NATIVE_FLAG_MUST_BE_1');
const native = gate === '1' ? describe : describe.skip;
const repositoryRoot = path.resolve(import.meta.dirname, '../..');

native(
  socialCreation
    ? 'one actual retained Node for current reads and finite Social creation'
    : 'one actual registered H3 current rebuild without economic writes',
  () => {
    it('runs retained current reads and the explicitly selected finite Social branch', async () => {
      must(
        process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE === '1',
        'REGISTERED_NODE_NATIVE_OPT_IN_REQUIRED',
      );
      must(
        process.env.ECONMIND_REFINERY21_NATIVE === '1',
        'ACTUAL_REFINERY_SOURCE_INSPECTION_OPT_IN_REQUIRED',
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
        economicCommandsPosted: socialCreation
          ? 'ACTUAL_SOCIAL_DRIVER_REPORT_ONLY'
          : 0,
        consumerSteps: socialCreation ? 'ACTUAL_SOCIAL_DRIVER_REPORT_ONLY' : 0,
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
          checkpoint: socialCreation
            ? 'C10_OPENING_BASES_H3'
            : 'POWER_UPGRADED_H3',
          ...(socialCreation ? { includeC10Industry: true as const } : {}),
          expectedCommit,
        });
        f = restored.fixture;
        s = restored.setup;
        const resume = restored.resume;
        must(
          resume?.grant.state === 'FINALIZED',
          'ALL_THREE_EXISTING_FINALS_REQUIRED',
        );
        if (socialCreation) {
          await phase(
            'EXACT_SOCIAL_FORWARD_AND_EXPLICIT_ADMITTED_LICENCE_PREPARATION',
            'START',
          );
          report.socialUpgrade = await upgradeRegisteredSocialRetainedClone({
            repositoryRoot,
            expectedCommit,
            evidenceDirectory: path.join(evidenceDirectory, 'social-forward'),
            fixture: f,
            setup: s,
          });
          await phase(
            'EXACT_SOCIAL_FORWARD_AND_EXPLICIT_ADMITTED_LICENCE_PREPARATION',
            'END',
          );
        }
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
        // All 63 sources already exist in the sealed parent. Validate the
        // complete low-role read surface before the expensive cold proof.
        await phase('ACTUAL_21_SOURCE_READS_AND_420_FOREIGN_DENIALS', 'START');
        const scopeInspection = await inspectPostwarRefinery21RetainedClone({
          marker: f.marker,
          clone: f.clone,
          sourceContext: await loadPostwarSourceContext(repositoryRoot),
          workerRole: String(descriptor.workerRole),
          existingInspectionActors: prepared.inspectionActors,
        });
        must(
          scopeInspection.inspection.sites.length === 21 &&
            scopeInspection.inspection.sites.every(
              (site) =>
                site.original.status === 'PRESENT' &&
                site.firstDay.status === 'PRESENT' &&
                site.utility.status === 'PRESENT' &&
                site.power.status === 'PRESENT',
            ),
          'ALL_21_REGISTERED_SOURCE_READS_REQUIRED',
        );
        report.refineryScopeInspection = scopeInspection;
        await phase('ACTUAL_21_SOURCE_READS_AND_420_FOREIGN_DENIALS', 'END');
        await phase('BROWSER_SUBJECT_AND_SOCIAL_ORIGINAL_PRECHECK', 'START');
        const subjectRows =
          await f.clone.installer.query<RegisteredCurrentBrowserActorBinding>(
            REGISTERED_CURRENT_BROWSER_SUBJECT_QUERY,
            [f.marker.worldId],
          );
        const authSubject = registeredCurrentC2BrowserSubject(
          subjectRows.rows,
          s.signToken('COUNTRY_02'),
        );
        // Independent expected non-emptiness: actual admitted opening rows,
        // plus proof that this H3 prefix never executed a Social transition.
        // Never infer a PAGE/EMPTY expectation from the HTTP response itself.
        const socialOriginals = await f.clone.installer.query<{
          seed_fingerprint: string;
          admission_ref: string;
          scope_sha256: string;
          service_pool_count: number;
          committed_social_count: number;
        }>(
          `select x.seed_fingerprint,x.admission_ref,x.scope_sha256,
          jsonb_array_length(x.scope_document::jsonb->'servicePools') as service_pool_count,
          (select count(*)::int from world_v2.command_submission c join world_v2.command_receipt r
            on r.world_id=c.world_id and r.command_id=c.command_id
            where c.world_id=x.world_id and c.country_id=x.country_id and r.outcome='COMMITTED'
            and c.command_type in('CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1','CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1','CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1')) as committed_social_count
          from world_v2.postwar_social_prefix_scope x where x.world_id=$1 and x.country_id='COUNTRY_02'`,
          [f.marker.worldId],
        );
        must(
          socialOriginals.rows.length === 1,
          'EXACT_ADMITTED_C2_SOCIAL_SCOPE_REQUIRED',
        );
        const original = socialOriginals.rows[0]!;
        must(
          original.seed_fingerprint === f.marker.seedFingerprint &&
            original.admission_ref === f.marker.admissionRef &&
            /^[a-f0-9]{64}$/u.test(original.scope_sha256) &&
            Number.isSafeInteger(original.service_pool_count) &&
            original.service_pool_count >= 0 &&
            original.committed_social_count === 0,
          'H3_UNCHANGED_ADMITTED_SOCIAL_POOL_ORIGINALS_REQUIRED',
        );
        report.socialServiceExpectation = {
          basis:
            'ACTUAL_SAME_SEED_ADMITTED_SCOPE_NO_COMMITTED_SOCIAL_TRANSITION',
          ...original,
          expectedStatus: original.service_pool_count === 0 ? 'EMPTY' : 'PAGE',
        };
        await phase('BROWSER_SUBJECT_AND_SOCIAL_ORIGINAL_PRECHECK', 'END');
        if (socialCreation) {
          must(s.c10HttpActor, 'REAL_C10_HTTP_ACTOR_REQUIRED');
          report.c10PreflightBeforeNode =
            await inspectRegisteredC10LogisticsPreflight({
              marker: f.marker,
              clone: f.clone,
              descriptor: {
                ...prepared.descriptor,
                workerId: String(descriptor.workerId),
                workerRole: String(descriptor.workerRole),
                readRole: String(descriptor.readRole),
                intakeRole: String(descriptor.intakeRole),
                registrationRef: String(descriptor.registrationRef),
              },
              authSubject: s.c10HttpActor.authSubject,
            });
        }
        d = createRegisteredFinalDriver({
          repositoryRoot,
          evidenceDirectory,
          worldId: f.marker.worldId,
          installer: f.clone.installer,
          allowedOrigin: 'https://pages-test.example',
          signToken: (cid) => {
            must(
              cid === 'COUNTRY_01' ||
                cid === 'COUNTRY_02' ||
                (socialCreation && cid === 'COUNTRY_10'),
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
        if (socialCreation) {
          must(
            sourcePublication.preparationActions
              .map(record)
              .every((a) => a.status === 'REUSED_VERIFIED'),
            'SOCIAL_TARGET_REQUIRES_ALL63_EXISTING_SOURCES_REUSED_NOT_REGISTERED',
          );
          report.fixedSourceRegistration =
            'ALL63_ACTUAL_CURRENT_READ_VERIFIED_NO_NEW_PUBLICATION';
        }
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
        const browserInput: RegisteredTradeCbReadbackBrowserInput = {
          browser,
          application,
          apiBaseURL: d.origin(),
          applicationOrigin: 'https://pages-test.example',
          authSubject,
          countryId: 'COUNTRY_02',
          countryDisplayId: '02',
          getAccessToken: () => {
            const token = s!.signToken('COUNTRY_02');
            registeredCurrentC2BrowserSubject(subjectRows.rows, token);
            return 'Bearer ' + token;
          },
          failureEvidencePath: path.join(
            evidenceDirectory,
            'browser-readback-failure.json',
          ),
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
        };
        report.browserReadbackFailureEvidencePath =
          browserInput.failureEvidencePath;
        report.browser =
          await runRegisteredTradeCbReadbackBrowserProbe(browserInput);
        await phase('SHIPPED_CHROMIUM_TRADE_AND_CB_READBACK_SAME_NODE', 'END');
        await phase(
          'ADDITIVE_SHIPPED_SOCIAL_SERVICE_READ_COMPONENT_SAME_NODE',
          'START',
        );
        const social =
          await createRegisteredSocialServiceContextBrowserProbe(browserInput);
        try {
          const expectation = {
            status:
              original.service_pool_count === 0
                ? ('EMPTY' as const)
                : ('PAGE' as const),
            head: browserInput.expectedHead,
          };
          const first = await social.read(expectation);
          await social.reload();
          const refreshed = await social.read(expectation);
          expect(refreshed).toEqual(first);
          report.socialServiceBrowser = {
            ...social.report(),
            mounting:
              'ADDITIVE_SHIPPED_READ_COMPONENT_NOT_MAIN_APPLICATION_INTEGRATION',
            originalRequestRecovery: 'NOT_RUN_READ_ONLY_COMPONENT',
            createServiceInputsConnected: 0,
          };
        } finally {
          await social.close();
        }
        await phase(
          'ADDITIVE_SHIPPED_SOCIAL_SERVICE_READ_COMPONENT_SAME_NODE',
          'END',
        );
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
        if (socialCreation) {
          report.scope =
            'ONE_GENUINE_NODE_EXISTING_READS_ACTUAL_SOCIAL_CREATE_PLAN_MATCH_AND_EXPLICIT_C10_CURRENT';
          await phase(
            'ACTUAL_SOCIAL_CREATE_CHILD_PLAN_MATCH_AND_FINAL_RECOVERY',
            'START',
          );
          report.socialCreation = await runRegisteredSocialCreateBrowserChain({
            driver: d,
            evidencePath: path.join(
              evidenceDirectory,
              'social-create-browser-chain.json',
            ),
            browserInput: {
              actualOrigin: d.origin(),
              applicationOrigin: browserInput.applicationOrigin,
              evidenceDir: path.join(
                evidenceDirectory,
                'social-create-browser',
              ),
              authSubject,
              countryId: 'COUNTRY_02',
              countryDisplayId: '02',
              readConfiguration: browserInput.readConfiguration,
              browser,
              application,
              getAccessToken: browserInput.getAccessToken,
            },
          });
          await phase(
            'ACTUAL_SOCIAL_CREATE_CHILD_PLAN_MATCH_AND_FINAL_RECOVERY',
            'END',
          );
          const beforeC10 = await readRegisteredCurrentEconomicSnapshotFrom(
              f.clone.installer,
              f.marker.worldId,
            ),
            finalHead = await d.readHead();
          await phase(
            'EXPLICIT_CONFIGURED_C10_CURRENT_AT_ACTUAL_FINAL_HEAD',
            'START',
          );
          const current = record(
            await d.rpc('PUBLISH_CURRENT_COUNTRIES', {
              countryIds: ['COUNTRY_10'],
              expectedHead: {
                worldVersion: finalHead.worldVersion,
                eventSequence: finalHead.eventSequence,
              },
            }),
          );
          must(
            current.status === 'PUBLISHED',
            'ACTUAL_C10_CURRENT_PUBLICATION_REQUIRED',
          );
          expect(current.head).toEqual({
            worldId: f.marker.worldId,
            ...finalHead,
          });
          expect(current.countries).toEqual(['COUNTRY_10']);
          const c10 = await d.post(
            '/v1/postwar-office-runtime',
            readBody('INDUSTRY', 'industry-labour-current'),
            'COUNTRY_10',
          );
          must(
            c10.status === 200 &&
              c10.body.ok === true &&
              Array.isArray(c10.body.rows),
            'ACTUAL_C10_RESTRICTED_CURRENT_READ_REQUIRED',
          );
          const c10Source = record(c10.body.source);
          must(
            c10Source.countryId === 'COUNTRY_10' &&
              c10Source.worldVersion === finalHead.worldVersion &&
              c10Source.eventSequence === finalHead.eventSequence,
            'ACTUAL_C10_SAME_FINAL_HEAD_REQUIRED',
          );
          must(s.c10HttpActor, 'REAL_C10_HTTP_ACTOR_REQUIRED');
          report.c10 = {
            publication: current,
            http: c10,
            preflight: await inspectRegisteredC10LogisticsPreflight({
              marker: f.marker,
              clone: f.clone,
              descriptor: {
                ...prepared.descriptor,
                workerId: text(descriptor.workerId),
                workerRole: text(descriptor.workerRole),
                readRole: text(descriptor.readRole),
                intakeRole: text(descriptor.intakeRole),
                registrationRef: text(descriptor.registrationRef),
              },
              authSubject: s.c10HttpActor.authSubject,
            }),
          };
          const afterC10 = await readRegisteredCurrentEconomicSnapshotFrom(
            f.clone.installer,
            f.marker.worldId,
          );
          expect(afterC10.economic).toEqual(beforeC10.economic);
          report.c10EconomicPreservation = {
            before: beforeC10,
            after: afterC10,
          };
          await phase(
            'EXPLICIT_CONFIGURED_C10_CURRENT_AT_ACTUAL_FINAL_HEAD',
            'END',
          );
        }
        const after = await readRegisteredCurrentEconomicSnapshotFrom(
          f.clone.installer,
          f.marker.worldId,
        );
        if (!socialCreation) {
          must(
            isDeepStrictEqual(before.economic, after.economic),
            'CURRENT_REBUILD_MUST_PRESERVE_EVERY_ECONOMIC_ROW_HASH',
          );
        } else {
          expect(after.economic.financial_posting_batch).toEqual(
            before.economic.financial_posting_batch,
          );
          expect(after.economic.inventory_posting).toEqual(
            before.economic.inventory_posting,
          );
          await d.recover(resume.run, { duplicateProbe: false });
          await d.recover(resume.book, { duplicateProbe: false });
          expect(await d.inspect(resume.grant.commandId)).toEqual(grantBefore);
          const stored = await f.clone.installer.query<{
            command_id: string;
          }>(
            "select command_id from world_v2.command_submission where world_id=$1 and country_id='COUNTRY_02' and command_type in('CORE_SOCIAL_EMPLOYMENT_SERVICE_CREATE_V1','CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1','CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1') order by command_id",
            [f.marker.worldId],
          );
          const stages = record(report.socialCreation).stages;
          must(Array.isArray(stages), 'ACTUAL_SOCIAL_STAGE_EVIDENCE_REQUIRED');
          const actualIds = stages
            .map(record)
            .filter((v) => v.actual)
            .map((v) => String(record(v.actual).commandId))
            .sort();
          expect(stored.rows.map((v) => v.command_id)).toEqual(actualIds);
          report.actualSocialCommandIds = actualIds;
          report.economicCommandsPosted = actualIds.filter(
            (id) =>
              id.startsWith('SOCIAL_SERVICE_CREATE_') ||
              id.startsWith('SOCIAL_PLAN_'),
          ).length;
          report.consumerSteps = actualIds.length;
          for (const table of [
            'command_submission',
            'command_queue',
            'command_receipt',
            'authoritative_event',
          ])
            expect(
              BigInt(String(record(after.economic[table]).count)) -
                BigInt(String(record(before.economic[table]).count)),
            ).toBe(BigInt(actualIds.length));
          expect(BigInt((await d.readHead()).worldVersion) - 3n).toBe(
            BigInt(actualIds.length),
          );
        }
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
          async () => {
            if (f)
              report.finalEconomicReadbackAfterDrain =
                await readRegisteredCurrentEconomicSnapshotFrom(
                  f.clone.installer,
                  f.marker.worldId,
                );
          },
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
