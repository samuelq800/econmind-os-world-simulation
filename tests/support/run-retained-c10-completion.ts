/** Complete only the saved C10 transfer after a separately authorized real
 * Clock observation. Orders are source-bound drafts; only FINAL is execution.
 * No RUN/BOOK/SHIP, target-time shortcut, fabricated staffing or funds. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { WorldDecimal } from '@econmind/core';
import type { Pool } from 'pg';
import type { PostwarNativeReferenceMarker } from './postwar-native-reference-db.js';
import {
  registeredFinalRecord as row,
  type createRegisteredFinalDriver,
} from './postwar-registered-final-driver.js';
import {
  prepareRegisteredC10OrdersFromCurrentReplay,
  publishRegisteredC10LogisticsOrder,
  prepareRegisteredC10StageFromCurrentApi,
  executeRegisteredC10Stage,
} from './registered-c10-logistics-chain.js';
type Driver = ReturnType<typeof createRegisteredFinalDriver>;
export async function runRetainedC10Completion(input: {
  driver: Driver;
  marker: PostwarNativeReferenceMarker;
  database: string;
  publisher: Pick<Pool, 'connect'>;
  evidencePath: string;
  ledgerSnapshot: () => Promise<unknown>;
  resumeCommittedWork?: true;
}) {
  const d = input.driver;
  const books = d.originals.filter(
    (o) =>
      o.request.commandType === 'INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTE_V1' &&
      row(row(o.request.payload).operation).action === 'BOOK',
  );
  assert.equal(books.length, 1, 'ONE_SAVED_C10_BOOK_REQUIRED');
  const book = books[0]!;
  assert.equal(book.request.countryId, 'COUNTRY_10');
  const p = row(book.request.payload),
    operation = row(p.operation),
    request = row(operation.request);
  const runId = String(p.runId),
    transferId = String(operation.transferId);
  assert.equal(request.transferId, transferId);
  const uid = randomUUID().replaceAll('-', '').toUpperCase(),
    refPrefix = 'C10_COMPLETE_' + uid;
  const report: Record<string, unknown> = {
    classification: 'EXISTING_C10_TRANSFER_ONLY_NOT_REFINERY_OUTPUT',
    status: 'RUNNING',
    runId,
    transferId,
    stages: [],
  };
  const save = () =>
    writeFile(input.evidencePath, JSON.stringify(report, null, 2) + '\n');
  const planning = () =>
    prepareRegisteredC10OrdersFromCurrentReplay({
      driver: d,
      runId,
      transferId,
      refPrefix,
      work: {
        count: '1',
        startsAtSimTime: String(request.startsAtSimTime),
        endsAtSimTime: String(request.endsAtSimTime),
      },
    });
  const selectors = () =>
    d.rpc('INDUSTRY_SELECTORS', {
      countryId: 'COUNTRY_10',
      facilityId: 'OPEN-10-REFINED_FUEL',
    });
  const snapshot = async () => ({
    ledger: await input.ledgerSnapshot(),
    selectors: await selectors(),
    logistics: await planning(),
    clock: await d.rpc('CLOCK'),
  });
  const identity = (label: string) => ({
    commandId: 'CMD_C10_' + label + '_' + uid,
    idempotencyKey: 'IDEM_C10_' + label + '_' + uid,
    requestId: randomUUID(),
  });
  let paid = new WorldDecimal('0');
  await save();
  try {
    report.before = await snapshot();
    await save();
    const initial = row(row(report.before).logistics);
    const retainedWork = d.originals.filter(
      (o) =>
        o.request.commandType === 'INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTE_V1' &&
        row(o.request.payload).runId === runId &&
        row(row(o.request.payload).operation).action === 'SERVICE_WORK',
    );
    if (input.resumeCommittedWork) {
      assert.equal(
        retainedWork.length,
        1,
        'EXACT_SAVED_COMMITTED_WORK_REQUIRED',
      );
      const stored = await d.inspect(retainedWork[0]!.request.commandId);
      assert.equal(row(stored).outcome, 'COMMITTED');
      report.retainedWork = {
        original: retainedWork[0],
        stored,
        recovery: await d.recover(retainedWork[0]!, { duplicateProbe: false }),
      };
      assert.equal(
        initial.status,
        'PAY_ORDER_DRAFTS',
        'H7_REAL_COMMITTED_WORK_MUST_REPLAY_BEFORE_PAY',
      );
    } else {
      assert.equal(
        retainedWork.length,
        0,
        'EXISTING_WORK_REQUIRES_EXPLICIT_RECOVERY',
      );
      assert(
        ['WORK_ORDER_DRAFT', 'REGISTERED_WORK_ORDER'].includes(
          String(initial.status),
        ),
        'C10_REAL_CLOCK_AND_UNOCCUPIED_PERSON_REQUIRED:' + initial.status,
      );
    }
    const runStage = async (
      action: 'SERVICE_WORK' | 'PAY_INPUTS' | 'DELIVER',
      order?: unknown,
      index = 0,
    ) => {
      const stage: Record<string, unknown> = {
        action,
        before: await snapshot(),
      };
      (report.stages as unknown[]).push(stage);
      await save();
      let orderRef: string | undefined;
      if (order) {
        const o = row(order);
        orderRef = String(o.reference);
        stage.order = o;
        await save();
        stage.publication = await publishRegisteredC10LogisticsOrder({
          marker: input.marker,
          database: input.database,
          publisher: input.publisher,
          rawText: String(o.rawText),
          runId,
          transferId,
        });
        // A publication error (including unknown COMMIT) stops here. Never
        // create a new order/reference to hide uncertain publication.
        await save();
      }
      const original = await prepareRegisteredC10StageFromCurrentApi({
        driver: d,
        worldId: input.marker.worldId,
        runId,
        transferId,
        identity: identity(action + '_' + index),
        action,
        ...(orderRef ? { orderRef } : {}),
      });
      stage.original = original;
      await save();
      try {
        stage.result = await executeRegisteredC10Stage({ driver: d, original });
      } catch (error) {
        stage.dispatchError = String(error);
        await save();
        // No resubmit/consume retry: only a receipt already committed can
        // resolve an acknowledgement-unknown execution.
        const stored = await d.inspect(original.request.commandId);
        stage.uncertainStored = stored;
        await save();
        assert.equal(
          row(stored).outcome,
          'COMMITTED',
          'C10_UNKNOWN_OR_REJECTED_STAGE_SAVED_NOT_RETRIED',
        );
        stage.recovery = await d.recover(original, { duplicateProbe: false });
        stage.result = stored;
      }
      assert.equal(row(stage.result).outcome, 'COMMITTED');
      stage.after = await snapshot();
      await save();
    };
    if (!input.resumeCommittedWork) {
      assert(Array.isArray(initial.orders));
      assert.equal(initial.orders.length, 1);
      await runStage('SERVICE_WORK', initial.orders[0]);
    }
    const payment = row(await planning());
    report.paymentPlan = payment;
    await save();
    assert.equal(
      payment.status,
      'PAY_ORDER_DRAFTS',
      'C10_REAL_COMMITTED_WORK_AND_PAYABLE_WAGE_REQUIRED',
    );
    assert(
      Array.isArray(payment.orders) &&
        payment.orders.length > 0 &&
        payment.orders.length <= 256,
    );
    for (const [i, o] of payment.orders.entries()) {
      const body = JSON.parse(String(row(o).rawText));
      assert.equal(body.purpose, 'DISTINCT_LOGISTICS_SERVICE_WORK_WAGE');
      const amount = new WorldDecimal(body.amount);
      assert(amount.isPositive());
      await runStage('PAY_INPUTS', o, i);
      paid = paid.plus(amount);
    }
    await runStage('DELIVER');
    report.after = await snapshot();
    report.totalPaid = paid.toFixed();
    assert.equal(row(row(report.after).logistics).status, 'ALREADY_DELIVERED');
    const balance = (v: unknown) => {
      const ps = row(row(v).selectors).financialPositions;
      assert(Array.isArray(ps) && ps.length === 1);
      return new WorldDecimal(String(row(ps[0]).netDebitBalance));
    };
    assert(
      balance(report.before).minus(balance(report.after)).equals(paid),
      'C10_OPERATOR_BALANCE_EQUALS_ACTUAL_WAGES_PAID',
    );
    assert.equal(
      row(report.before).clock,
      row(report.after).clock,
      'NO_CLOCK_SERVICE_OR_SECOND_OBSERVATION',
    );
    report.status = 'C10_WORK_PAY_DELIVER_COMMITTED_NOT_REFINERY_OUTPUT';
    await save();
    return report;
  } catch (error) {
    report.status = 'FAILED_OR_REAL_CONSTRAINT_BLOCKED';
    report.error = String(error);
    await save();
    throw error;
  }
}
