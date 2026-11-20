/** Explicit finite C10 prefix. Current source data chooses a bounded booking;
 * no Clock advance, completed labour, invented payment or delivery is allowed. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile, readFile } from 'node:fs/promises';
import { WorldDecimal, canonicalDecimal } from '@econmind/core';
import { parseIndustryUtilityPlanningRow } from '@econmind/core/postwar-industry-utility-planning-contract';
import type { createRegisteredFinalDriver } from './postwar-registered-final-driver.js';
import {
  prepareRegisteredC10Run,
  prepareRegisteredC10StageFromCurrentApi,
  executeRegisteredC10Stage,
  prepareRegisteredC10OrdersFromCurrentReplay,
} from './registered-c10-logistics-chain.js';
export async function runFreshC10Prefix(input: {
  driver: ReturnType<typeof createRegisteredFinalDriver>;
  worldId: string;
  evidencePath: string;
  resumeEvidencePath?: string;
}) {
  assert.equal(process.env.ECONMIND_FRESH_C10_PREFIX, '1');
  const d = input.driver;
  const prior = input.resumeEvidencePath
    ? JSON.parse(await readFile(input.resumeEvidencePath, 'utf8'))
    : undefined;
  if (prior) {
    assert(
      prior.stages.length === 1 || prior.stages.length === 2,
      'ONLY_EXACT_COMMITTED_RUN_OR_RUN_BOOK_MAY_RESUME_HERE',
    );
    assert.equal(prior.stages[0].stage, 'RUN');
    assert.equal(
      prior.stages[0].original.request.commandType,
      'CORE_INDUSTRY_RUN_SCHEDULE_V1',
    );
    assert.equal(prior.stages[0].original.request.countryId, 'COUNTRY_10');
    assert.equal(prior.stages[0].original.request.payload.runId, prior.runId);
    const savedLogistics = prior.stages.slice(1);
    if (savedLogistics.length) {
      const book = savedLogistics[0];
      assert.equal(book.stage, 'BOOK');
      assert.equal(
        book.original.request.commandType,
        'INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTE_V1',
      );
      assert.equal(book.original.request.countryId, 'COUNTRY_10');
      assert.equal(book.original.request.payload.runId, prior.runId);
      assert.equal(book.original.request.payload.operation.action, 'BOOK');
      assert.equal(book.result.outcome, 'COMMITTED');
    }
    const actualLogistics = d.originals.filter(
      (o) =>
        o.request.commandType === 'INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTE_V1',
    );
    assert.deepEqual(
      actualLogistics,
      savedLogistics.map((stage: { original: unknown }) => stage.original),
      'EXISTING_LOGISTICS_REQUIRES_EXACT_SAVED_STAGE_ORIGINAL',
    );
  }
  const runId =
    prior?.runId ??
    'RUN_TEST_C10_' + randomUUID().replaceAll('-', '').toUpperCase();
  assert.match(runId, /^RUN_TEST_C10_[A-F0-9]{32}$/u);
  const uid = runId.slice('RUN_TEST_C10_'.length);
  const identity = (label: string) => ({
    commandId: 'CMD_C10_' + label + '_' + uid,
    idempotencyKey: 'IDEM_C10_' + label + '_' + uid,
    requestId: randomUUID(),
  });
  const report: Record<string, unknown> = {
    classification: 'FINITE_C10_RUN_BOOK_SHIP_NOT_COMPLETE_LOGISTICS',
    runId,
    status: 'RUNNING',
    stages: [],
  };
  const save = () =>
    writeFile(input.evidencePath, JSON.stringify(report, null, 2) + '\n');
  await save();
  try {
    const beforeClock = await d.rpc('CLOCK');
    if (prior) {
      const run = prior.stages[0].original;
      const stored = await d.inspect(run.request.commandId);
      assert.deepEqual(
        stored,
        prior.stages[0].result,
        'SAVED_C10_RUN_FINAL_REQUIRED',
      );
      await d.recover(run, { duplicateProbe: false });
      (report.stages as unknown[]).push({
        stage: 'RUN',
        original: run,
        result: stored,
        recoveredWithoutResubmit: true,
      });
      report.resumeEvidencePath = input.resumeEvidencePath;
    } else {
      const run = await prepareRegisteredC10Run({
        driver: d,
        runId,
        identity: identity('RUN'),
      });
      (report.stages as unknown[]).push({
        stage: 'RUN',
        original: run,
        result: await executeRegisteredC10Stage({ driver: d, original: run }),
      });
    }
    await save();
    let booking: {
      quantity: string;
      startsAtSimTime: string;
      endsAtSimTime: string;
    };
    let transferId: string;
    if (prior?.stages.length === 2) {
      const stage = prior.stages[1];
      const book = stage.original;
      const stored = await d.inspect(book.request.commandId);
      assert.deepEqual(stored, stage.result, 'SAVED_C10_BOOK_FINAL_REQUIRED');
      await d.recover(book, { duplicateProbe: false });
      const request = book.request.payload.operation.request;
      booking = {
        quantity: request.quantity.amount,
        startsAtSimTime: request.startsAtSimTime,
        endsAtSimTime: request.endsAtSimTime,
      };
      transferId = book.request.payload.operation.transferId;
      assert.equal(transferId, request.transferId);
      assert.equal(transferId, book.request.commandId + '_TRANSFER');
      assert.deepEqual(booking, {
        quantity: prior.bookingChoice.quantity,
        startsAtSimTime: prior.bookingChoice.startsAtSimTime,
        endsAtSimTime: prior.bookingChoice.endsAtSimTime,
      });
      report.bookingChoice = prior.bookingChoice;
      (report.stages as unknown[]).push({
        stage: 'BOOK',
        original: book,
        result: stored,
        recoveredWithoutResubmit: true,
      });
      await save();
    } else {
      const planning = (await d.rpc('C10_LOGISTICS_ORDERS', {
        countryId: 'COUNTRY_10',
        facilityId: 'OPEN-10-REFINED_FUEL',
        runId,
        refPrefix: 'C10_' + uid,
      })) as { status: string; rows: unknown[] };
      assert.equal(planning.status, 'ACTUAL_PLANNING_ROWS');
      const rows = planning.rows
        .map(parseIndustryUtilityPlanningRow)
        .filter(
          (r) =>
            r.countryId === 'COUNTRY_10' &&
            r.facilityId === 'OPEN-10-REFINED_FUEL' &&
            r.runId === runId &&
            r.serviceKind === 'LOGISTICS' &&
            r.action === 'BOOK',
        );
      assert.equal(rows.length, 1);
      const row = rows[0]!;
      assert(row.action === 'BOOK' && row.serviceKind === 'LOGISTICS');
      const fact = (name: string) => {
        const found = row.parameters.capacityFacts.filter(
          (x) => x.name === name,
        );
        assert.equal(found.length, 1);
        return new WorldDecimal(found[0]!.value);
      };
      const duration = new WorldDecimal(row.runEndsAtSimTime).minus(
          row.runStartsAtSimTime,
        ),
        mass = fact('mass_per_unit');
      assert(duration.isPositive() && mass.isPositive());
      const quantity = WorldDecimal.min(
        '1',
        fact('available_warehouse_quantity'),
        fact('route_capacity')
          .times(duration)
          .dividedBy('86400000')
          .dividedBy(mass),
      ).toDecimalPlaces(12, WorldDecimal.ROUND_DOWN);
      assert(quantity.isPositive(), 'C10_NO_POSITIVE_SOURCE_BOUND_BOOKING');
      booking = {
        quantity: canonicalDecimal(quantity),
        startsAtSimTime: row.runStartsAtSimTime,
        endsAtSimTime: row.runEndsAtSimTime,
      };
      report.bookingChoice = {
        ...booking,
        rule: 'MIN_ONE_SOURCE_UNIT_ACTUAL_STOCK_ACTUAL_INTERVAL_CAPACITY_ROUNDED_DOWN',
        facts: row.parameters.capacityFacts,
      };
      const bookIdentity = identity('BOOK');
      const book = await prepareRegisteredC10StageFromCurrentApi({
        driver: d,
        worldId: input.worldId,
        runId,
        identity: bookIdentity,
        action: 'BOOK',
        booking,
      });
      (report.stages as unknown[]).push({
        stage: 'BOOK',
        original: book,
        result: await executeRegisteredC10Stage({ driver: d, original: book }),
      });
      await save();
      transferId = bookIdentity.commandId + '_TRANSFER';
    }
    const ship = await prepareRegisteredC10StageFromCurrentApi({
      driver: d,
      worldId: input.worldId,
      runId,
      identity: identity('SHIP'),
      action: 'SHIP',
      transferId,
    });
    (report.stages as unknown[]).push({
      stage: 'SHIP',
      original: ship,
      result: await executeRegisteredC10Stage({ driver: d, original: ship }),
    });
    await save();
    const orders = (await prepareRegisteredC10OrdersFromCurrentReplay({
      driver: d,
      runId,
      transferId,
      refPrefix: 'C10_' + uid,
      work: {
        count: '1',
        startsAtSimTime: booking.startsAtSimTime,
        endsAtSimTime: booking.endsAtSimTime,
      },
    })) as { status: string; requiredSimTime?: string; orders: unknown[] };
    report.orders = orders;
    assert.equal(
      orders.status,
      'WAIT_FOR_ACTUAL_CLOCK',
      'C10_EXPECTED_FINITE_NO_CLOCK_ADVANCE_BOUNDARY',
    );
    assert.equal(await d.rpc('CLOCK'), beforeClock);
    report.notExecuted = ['WORK', 'PAY', 'DELIVER'];
    report.reason = 'NOT_EXECUTED_CLOCK_NOT_DUE';
    report.status =
      'RUN_BOOK_SHIP_COMMITTED_WAIT_FOR_ACTUAL_CLOCK_NOT_COMPLETE_LOGISTICS';
    report.finalHead = await d.readHead();
    await save();
    return report;
  } catch (error) {
    report.status = 'FAILED_OR_BLOCKED';
    report.error = { message: String(error) };
    await save();
    throw error;
  }
}
