import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  COMMAND_SCHEMA_VERSION,
  CURRENT_REPLAY_BINDING,
  EVENT_SCHEMA_VERSION,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  canonicalSerialize,
  bindAuthoritativeTransition,
  correlationId,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createOpeningSeed,
  createOpeningSource,
  openingSeedId,
  openingSourceId,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  validateCanonicalCommand,
  worldId,
  type CanonicalCommand,
  type FinalCommandReceipt,
} from '@econmind/core';
import { readFinalReceiptFrom } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  readValidatedCanonicalLineageFrom,
  withValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from '../../apps/world-worker/src/persistence/validated-canonical-lineage.js';

// TEST_ONLY deterministic SQL rows. Proves routing/validation, NOT PG locks,
// transaction isolation, source admission, durability or budget semantics.
const sha256Hex = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const WORLD = worldId('WORLD_LINEAGE_VIEW_TEST');
const TIME = '2026-10-18T00:00:00.000Z';
type Row = Record<string, unknown>;

function receiptRow(receipt: FinalCommandReceipt): Row {
  return {
    world_id: receipt.worldId,
    command_id: receipt.commandId,
    idempotency_key: receipt.idempotencyKey,
    schema_version: receipt.schemaVersion,
    command_fingerprint: receipt.commandFingerprint,
    outcome: receipt.outcome,
    reason_code: receipt.reasonCode,
    transition_id: receipt.transitionId,
    world_version_before: receipt.worldVersionBefore,
    world_version_after: receipt.worldVersionAfter,
    sim_time: receipt.simTime.toCanonicalValue(),
    event_ids: [...receipt.eventIds],
    recorded_at_real: receipt.recordedAtReal,
  };
}

function fixture() {
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('SOURCE_LINEAGE_VIEW_TEST'),
      sourceKind: 'AUTHORITATIVE_DATASET',
      locator: 'dataset://test-only-lineage-view',
      sourceVersion: 'test-only-v1',
      payload: { fixture: true },
    },
    sha256Hex,
  );
  const seed = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_LINEAGE_VIEW_TEST'),
      worldId: WORLD,
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [],
    },
    sha256Hex,
  );
  const { fingerprint: _fingerprint, ...seedIntent } = seed;
  void _fingerprint;
  const opening: Row = {
    world_id: WORLD,
    seed_id: seed.seedId,
    opening_world_version: '0',
    replay_binding: canonicalSerialize(seed.replayBinding),
    canonical_payload: canonicalSerialize(seedIntent),
    seed_fingerprint: seed.fingerprint,
  };
  const commands: CanonicalCommand[] = [];
  const events: Row[] = [];
  const receipts: Row[] = [];
  let sequence = 0;
  for (let index = 1; index <= 2; index += 1) {
    const command = parseCanonicalCommand(
      {
        schemaVersion: COMMAND_SCHEMA_VERSION,
        actorId: 'ACTOR_LINEAGE_VIEW_TEST',
        authSubject: '00000000-0000-4000-8000-000000000010',
        commandId: `COMMAND_LINEAGE_${index}`,
        commandType: 'LINEAGE_TEST_ONLY',
        correlationId: `CORRELATION_LINEAGE_${index}`,
        countryId: 'COUNTRY_LINEAGE_TEST',
        expectedWorldVersion: String(index - 1),
        idempotencyKey: `IDEMPOTENCY_LINEAGE_${index}`,
        officeId: null,
        payload: { fixture: true },
        simTime: String(index * 1000),
        submittedAtReal: TIME,
        worldId: WORLD,
      },
      sha256Hex,
    );
    commands.push(command);
    const group = Array.from({ length: index }, (_, eventIndex) =>
      parseAuthoritativeEvent(
        {
          schemaVersion: EVENT_SCHEMA_VERSION,
          eventId: `EVENT_LINEAGE_${index}_${eventIndex}`,
          eventType:
            index === 2
              ? 'UNKNOWN_BUDGET_TEST_ONLY_V999'
              : 'UNRELATED_TEST_ONLY',
          worldId: WORLD,
          causationCommandId: command.commandId,
          correlationId: command.correlationId,
          worldVersion: String(index),
          sequence: String(++sequence),
          simTime: command.simTime.toCanonicalValue(),
          recordedAtReal: TIME,
          correctsEventId: null,
          payload: { fixture: { only: true } },
        },
        sha256Hex,
      ),
    );
    const transition = createAuthoritativeTransition({
      command,
      worldVersionBefore: String(index - 1),
      worldVersionAfter: String(index),
      events: group,
    });
    receipts.push(
      receiptRow(
        createFinalCommandReceipt({
          command,
          outcome: 'COMMITTED',
          reasonCode: null,
          transition,
          simTime: command.simTime,
          recordedAtReal: TIME,
        }),
      ),
    );
    for (const event of group)
      events.push({
        command_actor_id: command.actorId,
        command_auth_subject: command.authSubject,
        command_canonical_payload: command.canonicalPayload,
        command_country_id: command.countryId,
        command_expected_world_version: command.expectedWorldVersion,
        command_fingerprint: command.fingerprint,
        command_id: command.commandId,
        command_idempotency_key: command.idempotencyKey,
        command_office_id: command.officeId,
        command_payload_sha256: command.payloadHash,
        command_schema_version: command.schemaVersion,
        command_sim_time: command.simTime.toCanonicalValue(),
        command_submitted_at_real: command.submittedAtReal,
        command_type: command.commandType,
        command_world_id: command.worldId,
        command_correlation_id: command.correlationId,
        correlation_id: event.correlationId,
        event_canonical_payload: event.canonicalPayload,
        event_causation_command_id: event.causationCommandId,
        event_corrects_event_id: event.correctsEventId,
        event_fingerprint: event.fingerprint,
        event_id: event.eventId,
        event_payload_sha256: event.payloadHash,
        event_recorded_at_real: event.recordedAtReal,
        event_schema_version: event.schemaVersion,
        event_sequence: event.sequence,
        event_sim_time: event.simTime.toCanonicalValue(),
        event_type: event.eventType,
        event_world_id: event.worldId,
        event_world_version: event.worldVersion,
      });
  }
  const head: Row = { world_version: '2', event_sequence: '3' };
  const inventory: Row[] = [];
  const financial: Row[] = [];
  const trace: string[] = [];
  let missingLookup = false;
  const query: SqlExecutor['query'] = async <Result extends object>(
    statement: string,
    parameters?: readonly unknown[],
  ) => {
    trace.push(statement);
    expect(parameters?.[0]).toBe(WORLD);
    let rows: readonly Row[];
    if (statement.includes('from world_v2.world_head')) rows = [head];
    else if (statement.includes('from world_v2.opening_seed')) rows = [opening];
    else if (statement.includes('from world_v2.authoritative_event event'))
      rows = events;
    else if (statement.includes('from world_v2.inventory_posting'))
      rows = inventory;
    else if (statement.includes('from world_v2.financial_posting_batch'))
      rows = financial;
    else if (statement.includes("outcome = 'COMMITTED'"))
      rows = receipts
        .filter((row) => row.outcome === 'COMMITTED')
        .map((row) => ({ command_id: row.command_id }));
    else if (statement.includes('from world_v2.command_receipt'))
      rows = missingLookup
        ? []
        : receipts.filter((row) => row.command_id === parameters?.[1]);
    else throw new Error(`Unexpected SQL: ${statement}`);
    return { rows: rows as readonly Result[], rowCount: rows.length };
  };
  const executor: SqlExecutor = Object.freeze({ query });
  const database: SqlDatabase = {
    query: async () => {
      throw new Error('POOL_QUERY_FORBIDDEN');
    },
    transaction: async () => {
      throw new Error('NESTED_TRANSACTION_FORBIDDEN');
    },
  };
  const reader = new DurableV08LedgerLineageReader({ database, sha256Hex });
  const read = () =>
    withValidatedCanonicalLineageFrom(
      { reader, executor, worldId: WORLD },
      async (view) => readValidatedCanonicalLineageFrom(executor, view),
    );
  return {
    reader,
    executor,
    database,
    commands,
    events,
    receipts,
    opening,
    head,
    inventory,
    financial,
    trace,
    read,
    hideReceipt: () => {
      missingLookup = true;
    },
  };
}

describe('A-BUD-02 read-only canonical lineage', () => {
  it('validates the complete multi-transition history, receipts, seed/model and N/S on only the supplied executor', async () => {
    const f = fixture();
    const data = await f.read();
    expect(data.headWorldVersion).toBe('2');
    expect(data.headEventSequence).toBe('3');
    expect(data.transitions).toHaveLength(2);
    expect(data.transitions[1]?.receipt.eventIds).toEqual([
      'EVENT_LINEAGE_2_0',
      'EVENT_LINEAGE_2_1',
    ]);
    expect(data.seed.replayBinding).toEqual(CURRENT_REPLAY_BINDING);
    expect(data.ledgers.worldVersion).toBe('2');
    expect(f.trace).toHaveLength(8);
    expect(
      f.trace
        .filter((sql) => sql.includes('command_submission'))
        .every((sql) => !/for\s+(?:share|update|key)/iu.test(sql)),
    ).toBe(true);
    expect(f.trace.every((sql) => /^select/iu.test(sql.trim()))).toBe(true);
  });

  it('preserves unknown event meaning losslessly, without authorizing/interpreting it as a budget fact', async () => {
    const data = await fixture().read();
    expect(
      data.transitions[1]?.transition.events.map((event) => event.eventType),
    ).toEqual([
      'UNKNOWN_BUDGET_TEST_ONLY_V999',
      'UNKNOWN_BUDGET_TEST_ONLY_V999',
    ]);
    expect(Object.keys(data).sort()).toEqual([
      'headEventSequence',
      'headWorldVersion',
      'ledgers',
      'seed',
      'transitions',
      'worldId',
    ]);
  });

  it('accepts independently canonical Command/Event traces without rewriting history or changing intent', async () => {
    const f = fixture();
    const original = await f.read();
    const value = original.transitions[1]!;
    const changed = validateCanonicalCommand(
      {
        ...value.command,
        correlationId: correlationId('CORRELATION_OTHER_TRACE'),
      },
      sha256Hex,
    );
    expect(changed.fingerprint).toBe(value.command.fingerprint);
    expect(() =>
      bindAuthoritativeTransition(
        { command: changed, transition: value.transition },
        sha256Hex,
      ),
    ).not.toThrow();
    for (const row of f.events) {
      if (row.command_id === changed.commandId)
        row.command_correlation_id = changed.correlationId;
    }
    const persistedRows = canonicalSerialize(f.events);
    const persistedReceipts = canonicalSerialize(f.receipts);
    expect(
      (await f.reader.rebuildFrom(f.executor, WORLD)).ledgers.worldVersion,
    ).toBe('2');
    const data = await f.read();
    const actual = data.transitions[1]!;
    expect(data.headWorldVersion).toBe('2');
    expect(data.headEventSequence).toBe('3');
    expect(actual.command.correlationId).toBe(changed.correlationId);
    expect(actual.command.fingerprint).toBe(value.command.fingerprint);
    expect(actual.transition).toEqual(value.transition);
    expect(actual.receipt).toEqual(value.receipt);
    expect(
      actual.transition.events.map((event) => event.correlationId),
    ).toEqual([value.command.correlationId, value.command.correlationId]);
    expect(canonicalSerialize(f.events)).toBe(persistedRows);
    expect(canonicalSerialize(f.receipts)).toBe(persistedReceipts);
  });

  it.each([
    ['command_correlation_id', null],
    ['command_correlation_id', ''],
    ['command_correlation_id', 'not a canonical trace'],
    ['correlation_id', null],
    ['correlation_id', ''],
    ['correlation_id', 'not a canonical trace'],
  ])('still rejects independently invalid trace %s=%s', async (key, value) => {
    const f = fixture();
    f.events[1]![key!] = value;
    await expect(f.read()).rejects.toThrow();
  });

  it.each(['command_fingerprint', 'event_fingerprint'])(
    'still rejects corrupt %s when the valid traces differ',
    async (key) => {
      const f = fixture();
      for (const row of f.events) {
        if (row.command_id === f.commands[1]!.commandId)
          row.command_correlation_id = 'CORRELATION_OTHER_TRACE';
      }
      f.events[1]![key] = `sha256:${'0'.repeat(64)}`;
      await expect(f.read()).rejects.toThrow('hashes differ');
    },
  );

  it('reuses the existing strict receipt parser without pool/nested transaction calls', async () => {
    const f = fixture();
    expect(
      (await readFinalReceiptFrom(f.executor, f.commands[0]!))?.commandId,
    ).toBe(f.commands[0]!.commandId);
    f.receipts[0]!.schema_version = 'unsupported';
    await expect(
      readFinalReceiptFrom(f.executor, f.commands[0]!),
    ).rejects.toThrow('Unsupported final receipt schema');
  });

  it('rejects a missing receipt lookup even when a committed receipt index was present', async () => {
    const f = fixture();
    f.hideReceipt();
    await expect(f.read()).rejects.toThrow('requires its COMMITTED');
  });

  it.each([
    ['world_id', 'WORLD_FOREIGN'],
    ['command_id', 'COMMAND_FOREIGN'],
    ['idempotency_key', 'IDEMPOTENCY_FOREIGN'],
    ['command_fingerprint', `sha256:${'0'.repeat(64)}`],
    ['transition_id', 'COMMAND_FOREIGN'],
    ['world_version_before', '0'],
    ['world_version_after', '3'],
    ['sim_time', '999'],
    ['reason_code', 'UNEXPECTED'],
    ['schema_version', 'receipt-v999'],
    ['event_ids', []],
    ['event_ids', ['EVENT_LINEAGE_2_0']],
    ['event_ids', ['EVENT_LINEAGE_2_1', 'EVENT_LINEAGE_2_0']],
    ['event_ids', ['EVENT_LINEAGE_2_0', 'EVENT_LINEAGE_2_0']],
    ['event_ids', ['EVENT_LINEAGE_2_0', 'EVENT_LINEAGE_2_1', 'EVENT_EXTRA']],
  ])('rejects mismatched final receipt %s', async (key, value) => {
    const f = fixture();
    f.receipts[1]![key as string] = value;
    await expect(f.read()).rejects.toThrow();
  });

  it('requires receipts for earlier transitions, not only the tail', async () => {
    const f = fixture();
    f.receipts[0]!.command_fingerprint = `sha256:${'0'.repeat(64)}`;
    await expect(f.read()).rejects.toThrow(
      'different canonical Command intent',
    );
  });

  it('rejects an orphan/duplicated committed receipt rather than inventing an Event', async () => {
    for (const duplicate of [false, true]) {
      const f = fixture();
      f.receipts.push({
        ...f.receipts[0],
        command_id: duplicate ? f.commands[0]!.commandId : 'COMMAND_ORPHAN',
      });
      await expect(f.read()).rejects.toThrow('Committed receipt set');
    }
  });

  it('zero-effect receipts without Events neither create transitions nor advance the cursor', async () => {
    const f = fixture();
    f.events.length = 0;
    f.receipts.length = 0;
    f.head.world_version = '0';
    f.head.event_sequence = '0';
    f.receipts.push(
      receiptRow(
        createFinalCommandReceipt({
          command: f.commands[0]!,
          outcome: 'REJECTED',
          reasonCode: 'TEST_REJECTED',
          transition: null,
          simTime: f.commands[0]!.simTime,
          recordedAtReal: TIME,
        }),
      ),
    );
    const data = await f.read();
    expect(data.transitions).toEqual([]);
    expect(data.headEventSequence).toBe('0');
    f.head.event_sequence = '1';
    await expect(f.read()).rejects.toThrow('cursor');
  });

  it('rejects zero-effect receipts attached to an actual Event transition', async () => {
    const f = fixture();
    Object.assign(
      f.receipts[0]!,
      receiptRow(
        createFinalCommandReceipt({
          command: f.commands[0]!,
          outcome: 'REJECTED',
          reasonCode: 'TEST_REJECTED',
          transition: null,
          simTime: f.commands[0]!.simTime,
          recordedAtReal: TIME,
        }),
      ),
    );
    await expect(f.read()).rejects.toThrow('Committed receipt set');
  });

  it.each([
    ['event_sequence', '4'],
    ['world_version', '3'],
    ['event_sequence', '2'],
  ])('rejects a mismatched head %s=%s', async (key, value) => {
    const f = fixture();
    f.head[key] = value;
    await expect(f.read()).rejects.toThrow('cursor');
  });

  it('denies capacity overflow before reading an unbounded history', async () => {
    const f = fixture();
    f.head.event_sequence = '10001';
    await expect(f.read()).rejects.toThrow('bounded preparation capacity');
    expect(f.trace).toHaveLength(1);
  });

  it.each([
    'event_fingerprint',
    'command_fingerprint',
    'command_correlation_id',
    'correlation_id',
    'event_sim_time',
    'event_world_version',
    'event_sequence',
    'command_id',
  ])('rejects malformed canonical lineage %s', async (key) => {
    const f = fixture();
    f.events[0]![key] = key.includes('fingerprint')
      ? `sha256:${'0'.repeat(64)}`
      : key.includes('time') ||
          key.includes('version') ||
          key.includes('sequence')
        ? '999'
        : null;
    await expect(f.read()).rejects.toThrow();
  });

  it('rejects omitted/duplicated/reordered Events and a missing Command join', async () => {
    for (const change of ['omit', 'duplicate', 'reorder', 'missing-command']) {
      const f = fixture();
      if (change === 'omit') f.events.splice(1, 1);
      if (change === 'duplicate') f.events.push({ ...f.events[2] });
      if (change === 'reorder') f.events.reverse();
      if (change === 'missing-command') f.events[1]!.command_id = null;
      await expect(f.read()).rejects.toThrow();
    }
  });

  it('rejects Postings without Event lineage', async () => {
    for (const ledger of ['inventory', 'financial'] as const) {
      const f = fixture();
      f[ledger].push({
        causation_command_id: 'COMMAND_ORPHAN',
        canonical_payload: '{}',
        fingerprint: 'unread',
      });
      await expect(f.read()).rejects.toThrow(
        'Posting has no authoritative Event',
      );
    }
  });

  it('deep-freezes data and rejects forged, cross-executor and expired tokens', async () => {
    const f = fixture();
    let escaped: ValidatedCanonicalLineageView | undefined;
    await withValidatedCanonicalLineageFrom(
      { reader: f.reader, executor: f.executor, worldId: WORLD },
      async (view) => {
        escaped = view;
        const data = readValidatedCanonicalLineageFrom(f.executor, view);
        expect(Object.isFrozen(data.transitions[0]?.receipt.eventIds)).toBe(
          true,
        );
        expect(Object.isFrozen(data.seed.sources[0])).toBe(true);
        expect(() =>
          Object.assign(data.transitions[0]!.receipt, { outcome: 'REJECTED' }),
        ).toThrow();
        expect(() =>
          readValidatedCanonicalLineageFrom({ query: f.executor.query }, view),
        ).toThrow('another executor');
        expect(() =>
          readValidatedCanonicalLineageFrom(
            f.executor,
            {} as ValidatedCanonicalLineageView,
          ),
        ).toThrow('forged');
        return null;
      },
    );
    expect(() =>
      readValidatedCanonicalLineageFrom(f.executor, escaped!),
    ).toThrow('expired');
  });

  it('expires a token even when the consumer rejects, and never substitutes its error', async () => {
    const f = fixture();
    let escaped: ValidatedCanonicalLineageView | undefined;
    await expect(
      withValidatedCanonicalLineageFrom(
        { reader: f.reader, executor: f.executor, worldId: WORLD },
        async (view) => {
          escaped = view;
          throw new Error('CONSUMER_FAILED');
        },
      ),
    ).rejects.toThrow('CONSUMER_FAILED');
    expect(() =>
      readValidatedCanonicalLineageFrom(f.executor, escaped!),
    ).toThrow('expired');
  });

  it('does not accept raw arrays or an overridden reader as a view issuer', async () => {
    const f = fixture();
    await expect(
      withValidatedCanonicalLineageFrom(
        {
          reader: {} as DurableV08LedgerLineageReader,
          executor: f.executor,
          worldId: WORLD,
        },
        async () => null,
      ),
    ).rejects.toThrow('forged');
    Object.defineProperty(f.reader, 'readValidatedLineageFrom', {
      value: async () => {
        throw new Error('UNTRUSTED_OVERRIDE');
      },
    });
    await expect(f.read()).resolves.toMatchObject({ headEventSequence: '3' });
  });

  it('leaves the legacy V08 rebuildFrom free of any new final-receipt gate', async () => {
    const f = fixture();
    f.receipts.length = 0;
    expect(
      (await f.reader.rebuildFrom(f.executor, WORLD)).ledgers.worldVersion,
    ).toBe('2');
    expect(f.trace.some((sql) => sql.includes('command_receipt'))).toBe(false);
    await expect(f.read()).rejects.toThrow('Committed receipt set');
  });
});
