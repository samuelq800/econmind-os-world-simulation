import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  DomainError,
  createFinalCommandReceipt,
  parseCanonicalCommand,
  type CanonicalCommand,
} from '@econmind/core';

import * as authoritative from '../../apps/world-worker/src/authoritative-execution.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import { PostgresTransactionError } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import * as deliverySource from '../../apps/world-worker/src/persistence/sql-narrow-treasury-gcu-delivery-preparation-source.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  DURABLE_COMMAND_CONSUMPTION_STATUS,
  createDurableCommandConsumptionPreparation,
  type DurableConsumptionClock,
} from '../../apps/world-worker/src/preparation/durable-command-consumption.js';
import * as reservation from '../../apps/world-worker/src/preparation/local-narrow-reservation-worker.js';

const AT = '2026-10-07T00:00:00.000Z';
const WORLD = 'WORLD_CONSUMPTION_MECHANISM';
const HOLDER = 'WORKER_CONSUMPTION_MECHANISM';
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const realExecution = authoritative.createAuthoritativeWorkerExecution;

function command(
  type = 'CORE_GOODS_DELIVERY_V1',
  officeId: string | null = null,
) {
  // Canonical identity fixture, deliberately NOT economic source/adoption.
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandId: 'COMMAND_CONSUMPTION',
      commandType: type,
      worldId: WORLD,
      actorId: 'ACTOR_CONSUMPTION',
      authSubject: '00000000-0000-4000-8000-000000000001',
      countryId: 'COUNTRY_CONSUMPTION',
      officeId,
      expectedWorldVersion: '0',
      simTime: '10',
      submittedAtReal: AT,
      idempotencyKey: 'KEY_CONSUMPTION',
      correlationId: 'CORRELATION_CONSUMPTION',
      payload: { mechanismOnly: true },
    },
    hash,
  );
}

function harness(
  options: {
    readonly command?: CanonicalCommand;
    readonly authority?: string;
    readonly clock?: DurableConsumptionClock | null;
    readonly actualDelivery?: boolean;
  } = {},
) {
  const durable = options.command ?? command();
  const row = {
    command_id: durable.commandId,
    authority_kind: options.authority ?? 'VERSIONED_AUTOMATIC',
    queue_state: 'PENDING',
    available_at_sim_time: '10',
    claimed_by: null as string | null,
    claim_fencing_token: null as string | null,
  };
  const state = {
    headVersion: '0',
    lease: true,
    idle: false,
    claimRows: 1,
    failure: null as unknown,
  };
  const statements: { sql: string; values: readonly unknown[] }[] = [];
  const database: SqlDatabase = {
    async query<Row extends object>(
      sql: string,
      values: readonly unknown[] = [],
    ) {
      statements.push({ sql, values });
      if (state.failure) throw state.failure;
      let rows: object[];
      if (sql.includes('from world_v2.command_queue'))
        rows = state.idle ? [] : [{ ...row }];
      else if (sql.includes('from world_v2.command_receipt')) rows = [];
      else if (sql.includes('from world_v2.world_writer_lease'))
        rows = state.lease
          ? [
              {
                world_id: WORLD,
                holder_id: HOLDER,
                fencing_token: '7',
                acquired_at_real: AT,
                renewed_at_real: AT,
                lease_expires_at_real: '2026-10-07T00:01:00.000Z',
              },
            ]
          : [];
      else if (sql.startsWith('update world_v2.command_queue'))
        return { rows: [], rowCount: state.claimRows };
      else if (sql.includes('from world_v2.command_submission'))
        rows = [{ command_id: durable.commandId }];
      else throw new Error(`UNEXPECTED_SQL: ${sql}`);
      return { rows: rows as Row[], rowCount: rows.length };
    },
    async transaction(operation) {
      return operation(database);
    },
  };
  const read = vi
    .spyOn(DurableV08LedgerLineageReader.prototype, 'readCommandFrom')
    .mockResolvedValue(durable);
  const rebuild = vi
    .spyOn(DurableV08LedgerLineageReader.prototype, 'rebuildFrom')
    .mockImplementation(
      async () =>
        ({
          headWorldVersion: state.headVersion,
          headEventSequence: '0',
          ledgers: {},
        }) as unknown as Awaited<
          ReturnType<DurableV08LedgerLineageReader['rebuildFrom']>
        >,
    );
  // Rejected fixture receipt demonstrates PROCESSED is not COMMITTED. These
  // spies test composition only; they are never native/runtime golden evidence.
  const receipt = createFinalCommandReceipt({
    command: durable,
    outcome: 'REJECTED',
    reasonCode: 'COMMAND_SCHEMA_INVALID',
    transition: null,
    simTime: durable.simTime,
    recordedAtReal: AT,
  });
  const executeReserve = vi
    .fn()
    .mockResolvedValue({ source: 'EXISTING_FINAL', receipt });
  const reserveFactory = vi
    .spyOn(reservation, 'createLocalNarrowReservationWorker')
    .mockReturnValue({ execute: executeReserve });
  const executeDelivery = vi
    .fn()
    .mockResolvedValue({ source: 'EXISTING_FINAL', receipt });
  const sqlFactory = vi.spyOn(
    deliverySource,
    'createSqlNarrowTreasuryGcuDeliveryCandidateFactory',
  );
  const executionFactory = vi.spyOn(
    authoritative,
    'createAuthoritativeWorkerExecution',
  );
  if (!options.actualDelivery)
    executionFactory.mockImplementation((input) => ({
      ...realExecution(input),
      executeQueuedCommand: executeDelivery,
    }));
  const clock =
    options.clock === undefined
      ? { nowReal: () => AT, simTime: vi.fn(async () => '10') }
      : options.clock;
  const worker = createDurableCommandConsumptionPreparation({
    database,
    environment: { ECONMIND_ENV: 'local' },
    workerId: HOLDER,
    worldId: WORLD,
    sha256Hex: hash,
    clock,
  });
  return {
    worker,
    row,
    state,
    statements,
    database,
    read,
    rebuild,
    receipt,
    executeReserve,
    executeDelivery,
    reserveFactory,
    sqlFactory,
    executionFactory,
    clock,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('durable command consumption — mocked mechanism, NOT native runtime acceptance', () => {
  it('does no I/O on construction/start; requires explicit lifecycle and does not restart after stop', async () => {
    const h = harness();
    expect(h.worker.preparationStatus).toBe(DURABLE_COMMAND_CONSUMPTION_STATUS);
    expect(h.worker.state()).toBe('PREPARED');
    expect(await h.worker.consumeOnce()).toMatchObject({
      reason: 'LIFECYCLE_PREPARED',
    });
    h.worker.startPreparation();
    expect(h.worker.state()).toBe('READY');
    expect(h.statements).toEqual([]);
    expect(() => h.worker.startPreparation()).toThrow();
    await h.worker.stop();
    expect(h.worker.state()).toBe('STOPPED');
    expect(await h.worker.consumeOnce()).toMatchObject({
      reason: 'LIFECYCLE_STOPPED',
    });
    expect(() => h.worker.startPreparation()).toThrow();
  });

  it('blocks an absent server clock without SQL or caller time fallback', async () => {
    const h = harness({ clock: null });
    h.worker.startPreparation();
    expect(await h.worker.consumeOnce()).toMatchObject({
      reason: 'SERVER_CLOCK_NOT_BOUND',
    });
    expect(h.statements).toEqual([]);
    expect(h.reserveFactory).not.toHaveBeenCalled();
  });

  it('returns IDLE with one fixed-World deterministic due-row query', async () => {
    const h = harness();
    h.state.idle = true;
    h.worker.startPreparation();
    expect(await h.worker.consumeOnce()).toEqual({ status: 'IDLE' });
    expect(h.statements).toHaveLength(1);
    expect(h.statements[0]?.values).toEqual([WORLD, '10']);
    expect(h.statements[0]?.sql).toContain(
      'order by available_at_sim_time, priority_rank, command_id limit 1',
    );
    expect(h.statements[0]?.sql).not.toContain('skip locked');
    expect(h.read).not.toHaveBeenCalled();
  });

  it.each([
    ['CORE_GOODS_SHIPMENT_V1', 'MISSING_SQL_SHIP_PREPARATION_SOURCE'],
    ['OTHER_COMMAND_V1', 'UNSUPPORTED_COMMAND'],
  ])(
    'blocks first due %s without skipping it, claiming or using an economic fallback',
    async (type, reason) => {
      const h = harness({ command: command(type) });
      h.worker.startPreparation();
      expect(await h.worker.consumeOnce()).toMatchObject({
        status: 'BLOCKED',
        reason,
        commandId: 'COMMAND_CONSUMPTION',
      });
      expect(h.statements).toHaveLength(1);
      expect(h.executeDelivery).not.toHaveBeenCalled();
      expect(h.executeReserve).not.toHaveBeenCalled();
    },
  );

  it.each([
    { authority: 'DISCRETIONARY_USER', command: command() },
    {
      authority: 'VERSIONED_AUTOMATIC',
      command: command('CORE_GOODS_TRANSFER_V1', 'TRADE'),
    },
    {
      authority: 'VERSIONED_AUTOMATIC',
      command: command('CORE_GOODS_DELIVERY_V1', 'TRADE'),
    },
  ])(
    'rejects command/queue authority mismatch before claim',
    async (options) => {
      const h = harness(options);
      h.worker.startPreparation();
      expect(await h.worker.consumeOnce()).toMatchObject({
        reason: 'COMMAND_QUEUE_AUTHORITY_MISMATCH',
      });
      expect(h.rebuild).not.toHaveBeenCalled();
    },
  );

  it('rehydrates then claims one Delivery with SQL fence; binds the fixed SQL factory and existing executor', async () => {
    const h = harness();
    h.worker.startPreparation();
    const result = await h.worker.consumeOnce();
    expect(result).toEqual({
      status: 'PROCESSED',
      commandId: 'COMMAND_CONSUMPTION',
      source: 'EXISTING_FINAL',
      receipt: h.receipt,
    });
    expect(h.receipt.outcome).toBe('REJECTED');
    expect(h.sqlFactory).toHaveBeenCalledWith({
      database: h.database,
      workerId: HOLDER,
      sha256Hex: hash,
    });
    expect(h.executionFactory.mock.calls[0]?.[0].candidateFactory).toBe(
      h.sqlFactory.mock.results[0]?.value,
    );
    expect(h.executeDelivery).toHaveBeenCalledTimes(1);
    expect(h.executeDelivery.mock.calls[0]?.[0]).toMatchObject({
      authorityKind: 'VERSIONED_AUTOMATIC',
      command: command(),
      recordedAtReal: AT,
    });
    expect(h.read.mock.calls).toEqual([
      [h.database, WORLD, 'COMMAND_CONSUMPTION'],
      [h.database, WORLD, 'COMMAND_CONSUMPTION'],
    ]);
    const update = h.statements.filter(({ sql }) => sql.startsWith('update'));
    expect(update).toHaveLength(1);
    expect(update[0]?.values).toEqual([
      WORLD,
      'COMMAND_CONSUMPTION',
      HOLDER,
      AT,
      '7',
    ]);
    const positions = [
      'command_submission',
      'world_writer_lease',
      'command_queue where',
    ].map((name) => h.statements.findIndex(({ sql }) => sql.includes(name)));
    expect(positions[0]).toBeLessThan(positions[1]!);
    expect(positions[1]).toBeLessThan(positions[2]!);
    expect(
      h.statements.some(({ sql }) =>
        /insert|acquire_world_writer_lease|delete/u.test(sql),
      ),
    ).toBe(false);
  });

  it('routes Reserve to the unchanged durable-ID worker, never a supplied Command executor', async () => {
    const h = harness({
      command: command('CORE_GOODS_TRANSFER_V1', 'TRADE'),
      authority: 'DISCRETIONARY_USER',
    });
    h.worker.startPreparation();
    expect(await h.worker.consumeOnce()).toMatchObject({ status: 'PROCESSED' });
    expect(h.reserveFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        database: h.database,
        clock: h.clock,
        workerId: HOLDER,
      }),
    );
    expect(h.executeReserve).toHaveBeenCalledExactlyOnceWith({
      worldId: WORLD,
      commandId: 'COMMAND_CONSUMPTION',
    });
    expect(h.executeDelivery).not.toHaveBeenCalled();
    expect(h.statements.some(({ sql }) => sql.startsWith('update'))).toBe(
      false,
    );
  });

  it('passes the exact missing opening/source rejection through and never claims or fabricates a receipt', async () => {
    const h = harness();
    h.rebuild.mockRejectedValue(
      new DomainError('OPENING_SEED_INVALID', 'Opening seed row is absent'),
    );
    h.worker.startPreparation();
    expect(await h.worker.consumeOnce()).toEqual({
      status: 'BLOCKED',
      reason: 'DURABLE_PRIMITIVE_REJECTED',
      commandId: 'COMMAND_CONSUMPTION',
      domainCode: 'OPENING_SEED_INVALID',
      detail: 'Opening seed row is absent',
    });
    expect(h.executeDelivery).not.toHaveBeenCalled();
    expect(h.statements.some(({ sql }) => sql.startsWith('update'))).toBe(
      false,
    );
  });

  it('keeps actual SQL economic source rejection, not the mocked executor, on an invalid Delivery payload', async () => {
    const h = harness({ actualDelivery: true });
    h.worker.startPreparation();
    expect(await h.worker.consumeOnce()).toMatchObject({
      status: 'BLOCKED',
      reason: 'DURABLE_PRIMITIVE_REJECTED',
      domainCode: 'TRANSITION_EVIDENCE_INVALID',
      detail: 'Delivery transfer Command ID must be a non-empty string',
    });
    expect(h.executeDelivery).not.toHaveBeenCalled();
    // Actual repository/candidate source is invoked, but SQL is scripted and
    // command economic payload invalid: this is NOT a successful transaction.
    expect(h.read.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('blocks future command SimTime without deriving a fallback clock', async () => {
    const h = harness({
      clock: { nowReal: () => AT, simTime: async () => '9' },
    });
    h.worker.startPreparation();
    expect(await h.worker.consumeOnce()).toMatchObject({
      reason: 'COMMAND_NOT_DUE',
    });
    expect(h.rebuild).not.toHaveBeenCalled();
    expect(h.executeDelivery).not.toHaveBeenCalled();
  });

  it('rejects malformed server real time before any SQL or SimTime fallback', async () => {
    const simTime = vi.fn(async () => '10');
    const h = harness({
      clock: { nowReal: () => 'invalid-server-time', simTime },
    });
    h.worker.startPreparation();
    expect(await h.worker.consumeOnce()).toMatchObject({
      status: 'BLOCKED',
      detail: 'Worker requires canonical server-held real time',
    });
    expect(simTime).not.toHaveBeenCalled();
    expect(h.statements).toEqual([]);
  });

  it('does not replay an executor after a claim when commit acknowledgement is unknown', async () => {
    const h = harness();
    h.executeDelivery.mockRejectedValue(
      new PostgresTransactionError({
        outcome: 'COMMIT_OUTCOME_UNKNOWN',
        cause: new Error('Lost acknowledgement'),
      }),
    );
    h.worker.startPreparation();
    expect(await h.worker.consumeOnce()).toMatchObject({
      status: 'FAILED',
      commandId: 'COMMAND_CONSUMPTION',
    });
    expect(h.worker.state()).toBe('FAULTED');
    expect(await h.worker.consumeOnce()).toMatchObject({
      reason: 'LIFECYCLE_FAULTED',
    });
    expect(h.executeDelivery).toHaveBeenCalledTimes(1);
    expect(
      h.statements.filter(({ sql }) => sql.startsWith('update')),
    ).toHaveLength(1);
  });

  it('rejects a durable identity change before the claim', async () => {
    const h = harness();
    h.read
      .mockResolvedValueOnce(command())
      .mockResolvedValueOnce(command('OTHER_COMMAND_V1'));
    h.worker.startPreparation();
    expect(await h.worker.consumeOnce()).toMatchObject({
      detail: 'Delivery differs from durable canonical Command',
    });
    expect(h.statements.some(({ sql }) => sql.startsWith('update'))).toBe(
      false,
    );
    expect(h.executeDelivery).not.toHaveBeenCalled();
  });

  it('does not claim with a missing lease or stale version', async () => {
    const h = harness();
    h.worker.startPreparation();
    h.state.lease = false;
    expect(await h.worker.consumeOnce()).toMatchObject({
      reason: 'DURABLE_PRIMITIVE_REJECTED',
      detail:
        'Existing active writer lease is required; no acquisition fallback',
    });
    h.state.lease = true;
    h.state.headVersion = '1';
    expect(await h.worker.consumeOnce()).toMatchObject({
      domainCode: 'VERSION_MISMATCH',
    });
    expect(h.statements.some(({ sql }) => sql.startsWith('update'))).toBe(
      false,
    );
    expect(h.executeDelivery).not.toHaveBeenCalled();
  });

  it('does not steal another claim; resumes own exact fence without a second claim', async () => {
    const h = harness();
    h.row.queue_state = 'CLAIMED';
    h.row.claimed_by = 'WORKER_OTHER';
    h.row.claim_fencing_token = '7';
    h.worker.startPreparation();
    expect(await h.worker.consumeOnce()).toMatchObject({
      reason: 'CLAIM_REQUIRES_REVIEWED_RECOVERY',
    });
    h.row.claimed_by = HOLDER;
    h.row.claim_fencing_token = '6';
    expect(await h.worker.consumeOnce()).toMatchObject({
      reason: 'DURABLE_PRIMITIVE_REJECTED',
    });
    h.row.claim_fencing_token = '7';
    expect(await h.worker.consumeOnce()).toMatchObject({ status: 'PROCESSED' });
    expect(h.statements.some(({ sql }) => sql.startsWith('update'))).toBe(
      false,
    );
    expect(h.executeDelivery).toHaveBeenCalledTimes(1);
  });

  it('rejects a claim update that did not affect exactly one row', async () => {
    const h = harness();
    h.state.claimRows = 0;
    h.worker.startPreparation();
    expect(await h.worker.consumeOnce()).toMatchObject({
      reason: 'DURABLE_PRIMITIVE_REJECTED',
      detail: 'Delivery claim must update exactly one durable row',
    });
    expect(h.executeDelivery).not.toHaveBeenCalled();
  });

  it('never falls back from corrupt durable command identity', async () => {
    const h = harness();
    h.read.mockRejectedValue(
      new DomainError(
        'COMMAND_SCHEMA_INVALID',
        'Durable Command hash does not match',
      ),
    );
    h.worker.startPreparation();
    expect(await h.worker.consumeOnce()).toMatchObject({
      domainCode: 'COMMAND_SCHEMA_INVALID',
    });
    expect(h.statements).toHaveLength(1);
    expect(h.executeDelivery).not.toHaveBeenCalled();
  });

  it('serializes one step and stop drains rather than cancelling or closing host resources', async () => {
    let release!: (value: string) => void;
    const wait = new Promise<string>((resolve) => {
      release = resolve;
    });
    const h = harness({ clock: { nowReal: () => AT, simTime: () => wait } });
    h.state.idle = true;
    h.worker.startPreparation();
    const first = h.worker.consumeOnce();
    expect(await h.worker.consumeOnce()).toMatchObject({
      reason: 'STEP_ALREADY_RUNNING',
    });
    const stop = h.worker.stop();
    expect(h.worker.stop()).toBe(stop);
    expect(h.worker.state()).toBe('STOPPING');
    expect(await h.worker.consumeOnce()).toMatchObject({
      reason: 'LIFECYCLE_STOPPING',
    });
    release('10');
    expect(await first).toEqual({ status: 'IDLE' });
    await stop;
    expect(h.worker.state()).toBe('STOPPED');
    expect(h.statements).toHaveLength(1);
  });

  it.each(['COMMIT_OUTCOME_UNKNOWN', 'ROLLBACK_UNCONFIRMED'] as const)(
    'faults on %s, with no retry or made-up final receipt',
    async (outcome) => {
      const h = harness();
      h.state.failure = new PostgresTransactionError({
        outcome,
        cause: new DomainError(
          'OPENING_SEED_INVALID',
          'Unknown outcome cannot be semantic success',
        ),
      });
      h.worker.startPreparation();
      expect(await h.worker.consumeOnce()).toEqual({
        status: 'FAILED',
        reason: 'OPERATIONAL_FAILURE_REQUIRES_RECOVERY',
        commandId: null,
      });
      expect(h.worker.state()).toBe('FAULTED');
      expect(await h.worker.consumeOnce()).toMatchObject({
        reason: 'LIFECYCLE_FAULTED',
      });
      expect(h.statements).toHaveLength(1);
    },
  );

  it('preserves a semantic blocker only for a confirmed SQL rollback', async () => {
    const h = harness();
    h.state.failure = new PostgresTransactionError({
      outcome: 'ROLLED_BACK',
      cause: new DomainError('AUTHORIZATION_DENIED', 'Current scope revoked'),
    });
    h.worker.startPreparation();
    expect(await h.worker.consumeOnce()).toMatchObject({
      status: 'BLOCKED',
      domainCode: 'AUTHORIZATION_DENIED',
      detail: 'Current scope revoked',
    });
    expect(h.worker.state()).toBe('READY');
  });

  it('rejects production settings and non-canonical World/Worker IDs at construction', () => {
    const h = harness();
    const input = {
      database: h.database,
      environment: { ECONMIND_ENV: 'production' },
      workerId: HOLDER,
      worldId: WORLD,
      sha256Hex: hash,
      clock: null,
    };
    expect(() => createDurableCommandConsumptionPreparation(input)).toThrow(
      'local/CI only',
    );
    expect(() =>
      createDurableCommandConsumptionPreparation({
        ...input,
        environment: { ECONMIND_ENV: 'local', DATABASE_URL: 'forbidden' },
      }),
    ).toThrow('Production connection');
    expect(() =>
      createDurableCommandConsumptionPreparation({
        ...input,
        environment: { ECONMIND_ENV: 'local' },
        worldId: 'wrong-id',
      }),
    ).toThrow();
    expect(h.statements).toEqual([]);
  });
});
