/** One genuine registered Node on the repaired H3 clone. No CONSUME, no new
 * economic command, source publication, World initialization or Clock start. */
import { randomUUID } from 'node:crypto';
import { AUTHENTICATED_COMMAND_RECOVERY_SCHEMA } from '@econmind/core';
import {
  parsePostwarFinancialMixedCoverage,
  parsePostwarMixedFinancialBalanceRow,
  parsePostwarCentralBankOpeningInstruments,
} from '@econmind/core/postwar-financial-mixed-current-contract';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
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
        scope: 'ONE_OS_H3_DERIVED_REBUILD_AND_HTTP_READ_ONLY',
        economicCommandsPosted: 0,
        consumerSteps: 0,
        sourceOrWorldInitialization: false,
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
          checkpoint: 'TRADE_REPAIRED_H3',
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
        await phase('ONE_NODE_GENUINE_COLD_PROOF', 'START');
        report.node = await d.launch(s.descriptor);
        await phase('ONE_NODE_GENUINE_COLD_PROOF', 'END');
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
        for (const close of [
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
    }, 1500000);
  },
);
