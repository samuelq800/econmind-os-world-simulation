// PREPARATION_ONLY_NOT_V09_2_STARTED. One isolated PGlite, actual reviewed Core constructors.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EVENT_SCHEMA_VERSION,
  INVENTORY_POSTING_SCHEMA_VERSION,
  Quantity,
  canonicalSerialize,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createInventoryAccount,
  createReservationPosting,
  createReleasePosting,
  createShipmentPosting,
  createDeliveryPosting,
  inventoryPostingId,
  inventoryReservationId,
  inventoryShipmentId,
  parseAuthoritativeEvent,
  type InventoryLedgerPosting,
  type CanonicalCommand,
  type AuthoritativeTransition,
  type FinalCommandReceipt,
  type FinancialPostingBatch,
  type InventoryProductionPosting,
  type SimTime,
} from '../../packages/core/src/index.js';
import { createPGliteV09AtomicTestDatabase } from '../support/v09-atomic-database.js';
import { createProductionSchemaFixture } from '../support/production-schema-fixture.js';
import type { V09AtomicSqlClient } from '../support/v09-atomic-contract.js';
import { V09TransactionRolledBackError } from '../support/v09-atomic-contract.js';

const root = new URL('../../', import.meta.url);
const artifact =
  'database/migrations/artifacts/0023_world_v2_production_consumption_posting.sql';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const fingerprint = (value: unknown) =>
  `sha256:${sha(`SHA-256\n${canonicalSerialize(value)}`)}`;
const db = createPGliteV09AtomicTestDatabase();
const fixture = createProductionSchemaFixture();
const actual = fixture.make();
const world = actual.command.worldId;
let oldValidator: string;
let emptySchemaRehearsed = false;
type MutableJson<T> = T extends SimTime
  ? string
  : T extends Quantity
    ? { amount: string; unit: string }
    : T extends readonly (infer U)[]
      ? MutableJson<U>[]
      : T extends string
        ? string
        : T extends object
          ? { -readonly [K in keyof T]: MutableJson<T[K]> }
          : T;
type ProductionPayload = MutableJson<
  Omit<InventoryProductionPosting, 'fingerprint'>
>;

async function commandEvents(
  sql: V09AtomicSqlClient,
  command: CanonicalCommand,
  transition: AuthoritativeTransition,
) {
  await sql.query(
    `insert into world_v2.command_submission (world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      command.worldId,
      command.commandId,
      command.idempotencyKey,
      command.commandType,
      command.schemaVersion,
      command.canonicalPayload,
      command.payloadHash,
      command.fingerprint,
      command.authSubject,
      command.actorId,
      command.countryId,
      command.officeId,
      command.expectedWorldVersion,
      command.simTime.toCanonicalValue(),
      command.correlationId,
      command.submittedAtReal,
    ],
  );
  for (const e of transition.events)
    await sql.query(
      `insert into world_v2.authoritative_event (world_id,event_id,event_sequence,world_version,causation_command_id,correlation_id,event_type,schema_version,canonical_payload,payload_sha256,event_fingerprint,sim_time,recorded_at_real,corrects_event_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        e.worldId,
        e.eventId,
        e.sequence,
        e.worldVersion,
        e.causationCommandId,
        e.correlationId,
        e.eventType,
        e.schemaVersion,
        e.canonicalPayload,
        e.payloadHash,
        e.fingerprint,
        e.simTime.toCanonicalValue(),
        e.recordedAtReal,
        e.correctsEventId,
      ],
    );
}
async function receipt(sql: V09AtomicSqlClient, value: FinalCommandReceipt) {
  await sql.query(
    `insert into world_v2.command_receipt (world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,reason_code,transition_id,world_version_before,world_version_after,sim_time,event_ids,recorded_at_real) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`,
    [
      value.worldId,
      value.commandId,
      value.idempotencyKey,
      value.schemaVersion,
      value.commandFingerprint,
      value.outcome,
      value.reasonCode,
      value.transitionId,
      value.worldVersionBefore,
      value.worldVersionAfter,
      value.simTime.toCanonicalValue(),
      canonicalSerialize(value.eventIds),
      value.recordedAtReal,
    ],
  );
}
function intent(posting: InventoryLedgerPosting | FinancialPostingBatch) {
  const { fingerprint: _fingerprint, ...value } = posting;
  void _fingerprint;
  return value;
}
async function inventory(
  sql: V09AtomicSqlClient,
  payload: Record<string, unknown>,
  hash = fingerprint(payload),
) {
  await sql.query(
    `insert into world_v2.inventory_posting (world_id,posting_id,causation_command_id,world_version_before,world_version_after,sim_time,event_ids,transition_binding,operation,canonical_payload,posting_fingerprint) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)`,
    [
      payload.worldId,
      payload.postingId,
      payload.causationCommandId,
      payload.worldVersionBefore,
      payload.worldVersionAfter,
      payload.simTime,
      canonicalSerialize(payload.causationEventIds),
      canonicalSerialize(payload.transitionBinding),
      payload.operation,
      canonicalSerialize(payload),
      hash,
    ],
  );
}
async function funding(sql: V09AtomicSqlClient) {
  const p = fixture.funding;
  await sql.query(
    `insert into world_v2.financial_posting_batch (world_id,batch_id,causation_command_id,world_version_before,world_version_after,sim_time,event_ids,transition_binding,settlement_currency,canonical_payload,batch_fingerprint) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)`,
    [
      p.worldId,
      p.batchId,
      p.causationCommandId,
      p.worldVersionBefore,
      p.worldVersionAfter,
      p.simTime.toCanonicalValue(),
      canonicalSerialize(p.causationEventIds),
      canonicalSerialize(p.transitionBinding),
      p.settlementCurrency,
      canonicalSerialize(intent(p)),
      p.fingerprint,
    ],
  );
}
function payload() {
  return JSON.parse(
    canonicalSerialize(intent(actual.posting)),
  ) as ProductionPayload;
}
function changedEvent(
  value: ProductionPayload,
  type = 'INDUSTRY_PRODUCTION_SETTLED',
) {
  const original = actual.transition.events[0]!;
  const e = parseAuthoritativeEvent(
    {
      causationCommandId: original.causationCommandId,
      correlationId: original.correlationId,
      correctsEventId: null,
      eventId: original.eventId,
      eventType: type,
      payload: {
        schemaVersion: value.schemaVersion,
        evidence: value.evidence,
        result: value.result,
      },
      recordedAtReal: original.recordedAtReal,
      schemaVersion: EVENT_SCHEMA_VERSION,
      sequence: original.sequence,
      simTime: original.simTime.toCanonicalValue(),
      worldId: world,
      worldVersion: original.worldVersion,
    },
    sha,
  );
  value.transitionBinding.eventFingerprints = [e.fingerprint];
  return createAuthoritativeTransition({
    command: actual.command,
    worldVersionBefore: '1',
    worldVersionAfter: '2',
    events: [e],
  });
}
async function rejectsProduction(
  change: (p: ProductionPayload) => void,
  expected: string,
  options: { eventType?: string; badHash?: boolean; noReceipt?: boolean } = {},
) {
  const p = payload();
  change(p);
  const transition = changedEvent(p, options.eventType);
  await expect(
    db
      .transaction(async (sql) => {
        await commandEvents(sql, actual.command, transition);
        await inventory(
          sql,
          p,
          options.badHash ? `sha256:${'f'.repeat(64)}` : undefined,
        );
        if (!options.noReceipt)
          await receipt(
            sql,
            createFinalCommandReceipt({
              command: actual.command,
              outcome: 'COMMITTED',
              reasonCode: null,
              transition,
              simTime: actual.command.simTime,
              recordedAtReal: '2026-10-07T00:00:01.000Z',
            }),
          );
        await sql.query('set constraints all immediate');
      })
      .catch((error) => {
        expect(error).toBeInstanceOf(V09TransactionRolledBackError);
        throw (error as V09TransactionRolledBackError).cause;
      }),
  ).rejects.toThrow(expected);
  expect(
    (
      await db.query<{ n: number }>(
        'select count(*)::int as n from world_v2.inventory_posting where operation=$1',
        ['PRODUCE_AND_CONSUME'],
      )
    ).rows[0]!.n,
  ).toBe(0);
}
function movements() {
  const available = fixture.evidence.materials[0]!.account;
  const reserved = createInventoryAccount({
    ...available,
    bucket: 'RESERVED',
    reservationId: inventoryReservationId('RESERVATION_SCHEMA_TEST'),
  });
  const transit = createInventoryAccount({
    ...available,
    bucket: 'IN_TRANSIT',
    shipmentId: inventoryShipmentId('SHIPMENT_SCHEMA_TEST'),
  });
  return (
    [
      ['RESERVE', createReservationPosting, available, reserved],
      ['RELEASE', createReleasePosting, reserved, available],
      ['SHIP', createShipmentPosting, reserved, transit],
      ['DELIVER', createDeliveryPosting, transit, available],
    ] as const
  ).map(([name, factory, source, destination]) =>
    factory(
      {
        schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
        postingId: inventoryPostingId(`MOVEMENT_${name}`),
        worldId: world,
        causationCommandId: fixture.paidLineage.command.commandId,
        causationEventIds: fixture.paidLineage.transition.eventIds,
        worldVersionBefore: '0',
        worldVersionAfter: '1',
        simTime: fixture.paidLineage.command.simTime,
        command: fixture.paidLineage.command,
        transition: fixture.paidLineage.transition,
        quantity: Quantity.from('1', 'tonne'),
        source,
        destination,
      },
      sha,
    ),
  );
}

beforeAll(async () => {
  const manifest = JSON.parse(
    await readFile(new URL('database/migrations/manifest.json', root), 'utf8'),
  );
  // Explicit existing World-only prefix: no Storage companion, no full-chain/publication claim.
  for (const migration of manifest.migrations.filter(
    (m: { release_order: number }) => m.release_order <= 21,
  ))
    await db.executeScript(
      await readFile(new URL(migration.path, root), 'utf8'),
    );
  // Fresh empty World schema rehearsal, on the same single instance, then restore old DDL.
  await db.query('begin');
  try {
    await db.executeScript(await readFile(new URL(artifact, root), 'utf8'));
    expect(
      (
        await db.query<{ n: number }>(
          'select count(*)::int as n from world_v2.inventory_posting',
        )
      ).rows[0]!.n,
    ).toBe(0);
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int as n from pg_indexes where schemaname='world_v2' and indexname like 'inventory_production_%_once'",
        )
      ).rows[0]!.n,
    ).toBe(5);
    emptySchemaRehearsed = true;
  } finally {
    await db.query('rollback');
  }
  await db.query('insert into world_v2.world_head (world_id) values ($1)', [
    world,
  ]);
  const { fingerprint: seedHash, ...seedIntent } = fixture.seed;
  await db.query(
    `insert into world_v2.opening_seed (world_id,seed_id,opening_world_version,replay_binding,canonical_payload,seed_fingerprint,bootstrapped_at_real) values ($1,$2,0,$3,$4,$5,$6)`,
    [
      world,
      fixture.seed.seedId,
      canonicalSerialize(fixture.seed.replayBinding),
      canonicalSerialize(seedIntent),
      seedHash,
      '2026-10-07T00:00:00.000Z',
    ],
  );
  await commandEvents(
    db,
    fixture.paidLineage.command,
    fixture.paidLineage.transition,
  );
  await funding(db);
  await receipt(
    db,
    createFinalCommandReceipt({
      command: fixture.paidLineage.command,
      outcome: 'COMMITTED',
      reasonCode: null,
      transition: fixture.paidLineage.transition,
      simTime: fixture.paidLineage.command.simTime,
      recordedAtReal: '2026-10-07T00:00:01.000Z',
    }),
  );
  for (const p of movements())
    await inventory(
      db,
      JSON.parse(canonicalSerialize(intent(p))),
      p.fingerprint,
    );
  oldValidator = (
    await db.query<{ body: string }>(
      "select pg_get_functiondef('world_v2.validate_inventory_posting_payload(jsonb,world_v2.inventory_posting)'::regprocedure) as body",
    )
  ).rows[0]!.body;
  await db.query('begin');
  try {
    await db.executeScript(await readFile(new URL(artifact, root), 'utf8'));
    await db.query('commit');
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}, 30000);
afterAll(async () => {
  await db.close();
});

describe('0023 isolated schema proposal: actual Core intents, no Worker admission', () => {
  it('installs on a fresh empty World schema and rolls back DDL before the populated upgrade', () => {
    expect(emptySchemaRehearsed).toBe(true);
  });
  it('upgrades a real old schema with four existing valid movements, preserving their exact validator body/rows', async () => {
    const body = (
      await db.query<{ body: string }>(
        "select pg_get_functiondef('world_v2.validate_inventory_movement_payload_v1(jsonb,world_v2.inventory_posting)'::regprocedure) as body",
      )
    ).rows[0]!.body;
    expect(body).toBe(
      oldValidator.replace(
        'validate_inventory_posting_payload',
        'validate_inventory_movement_payload_v1',
      ),
    );
    expect(
      (
        await db.query<{ n: number }>(
          'select count(*)::int as n from world_v2.inventory_posting',
        )
      ).rows[0]!.n,
    ).toBe(4);
    for (const p of movements())
      await db.query(
        `select world_v2.validate_inventory_posting_payload($1::jsonb,jsonb_populate_record(null::world_v2.inventory_posting,$2::jsonb))`,
        [
          canonicalSerialize(intent(p)),
          JSON.stringify({
            world_id: world,
            posting_id: p.postingId,
            causation_command_id: p.causationCommandId,
            world_version_before: '0',
            world_version_after: '1',
            sim_time: '1000',
            event_ids: p.causationEventIds,
            transition_binding: canonicalSerialize(p.transitionBinding),
            operation: p.operation,
          }),
        ],
      );
  });
  it('keeps the old two-leg same-commodity/batch/unit conservation rejection', async () => {
    const p = JSON.parse(canonicalSerialize(intent(movements()[0]!)));
    p.entries[0].delta.amount = '-2';
    await expect(
      db.query(
        `select world_v2.validate_inventory_posting_payload($1::jsonb,jsonb_populate_record(null::world_v2.inventory_posting,$2::jsonb))`,
        [
          canonicalSerialize(p),
          JSON.stringify({
            world_id: world,
            posting_id: p.postingId,
            causation_command_id: p.causationCommandId,
            world_version_before: '0',
            world_version_after: '1',
            sim_time: '1000',
            event_ids: p.causationEventIds,
            transition_binding: canonicalSerialize(p.transitionBinding),
            operation: p.operation,
          }),
        ],
      ),
    ).rejects.toThrow('exact V08 conservation');
  });
  it('accepts the actual 3-tonne Core posting, exact bound event and funded final receipt inside one rolled-back rehearsal', async () => {
    expect(actual.posting.result.actualOutput.amount).toBe('3');
    await db.query('begin');
    try {
      await commandEvents(db, actual.command, actual.transition);
      await inventory(db, payload(), actual.posting.fingerprint);
      await receipt(
        db,
        createFinalCommandReceipt({
          command: actual.command,
          outcome: 'COMMITTED',
          reasonCode: null,
          transition: actual.transition,
          simTime: actual.command.simTime,
          recordedAtReal: '2026-10-07T00:00:01.000Z',
        }),
      );
      await db.query('set constraints all immediate');
      expect(
        (
          await db.query<{ n: number }>(
            'select count(*)::int as n from world_v2.inventory_posting where operation=$1',
            ['PRODUCE_AND_CONSUME'],
          )
        ).rows[0]!.n,
      ).toBe(1);
    } finally {
      await db.query('rollback');
    }
  });
  it.each([
    [
      'inflated output',
      (p: ProductionPayload) => {
        p.result.actualOutput.amount = '999';
      },
      'bounded V13',
    ],
    [
      'forged material use',
      (p: ProductionPayload) => {
        p.entries.find((e) => e.delta.amount.startsWith('-'))!.delta.amount =
          '-1';
      },
      'input entry',
    ],
    [
      'wrong OP title',
      (p: ProductionPayload) => {
        p.evidence.output.titleHolderId = 'OTHER_OWNER';
      },
      'OP title',
    ],
    [
      'wrong unit',
      (p: ProductionPayload) => {
        p.entries[0]!.delta.unit = 'kg';
      },
      'entry unit',
    ],
    [
      'missing maintenance',
      (p: ProductionPayload) => {
        p.evidence.operating.payload.maintenanceAppliedRef = '';
        p.evidence.operating.canonicalPayload = canonicalSerialize(
          p.evidence.operating.payload,
        );
      },
      'explicit maintenance',
    ],
    [
      'null run',
      (p: ProductionPayload) => {
        Object.assign(p.evidence, { runId: null });
      },
      'source identity',
    ],
    [
      'wrong source batch',
      (p: ProductionPayload) => {
        p.evidence.materials[0]!.account.batchId = 'WRONG_BATCH';
      },
      'source/batch',
    ],
    [
      'duplicate source account',
      (p: ProductionPayload) => {
        p.entries.push(p.entries[0]!);
      },
      'unique accounts',
    ],
    [
      'mixed snapshot',
      (p: ProductionPayload) => {
        p.evidence.recipe.snapshot.sourceVersion = 'WORLD_VERSION.2';
      },
      'mixed snapshot',
    ],
    [
      'wrong cost',
      (p: ProductionPayload) => {
        p.evidence.operating.payload.settledCost.amount = '0';
        p.evidence.operating.canonicalPayload = canonicalSerialize(
          p.evidence.operating.payload,
        );
      },
      'actual cost',
    ],
    [
      'unsettled funding',
      (p: ProductionPayload) => {
        p.evidence.operating.payload.fundingFingerprint = `sha256:${'f'.repeat(64)}`;
        p.evidence.operating.canonicalPayload = canonicalSerialize(
          p.evidence.operating.payload,
        );
      },
      'committed matching OP',
    ],
  ] as const)(
    'rejects %s without committed production rows',
    async (_name, change, message) => {
      await rejectsProduction(change, message);
    },
  );
  it('rejects an incorrect posting fingerprint', async () => {
    await rejectsProduction(() => {}, 'fingerprint', { badHash: true });
  });
  it('rejects a plan Event instead of production settlement', async () => {
    await rejectsProduction(() => {}, 'bound settlement Event', {
      eventType: 'INDUSTRY_PRODUCTION_PLAN',
    });
  });
  it('rejects foreign World binding', async () => {
    await rejectsProduction((p) => {
      p.transitionBinding.worldId = 'WORLD_OTHER';
    }, 'transition binding');
  });
  it('rejects commit without its production final receipt', async () => {
    await rejectsProduction(() => {}, 'complete committed final receipt', {
      noReceipt: true,
    });
  });
  it('does not weaken final-receipt Event-set validation', async () => {
    await expect(
      db
        .transaction(async (sql) => {
          await commandEvents(sql, actual.command, actual.transition);
          await inventory(sql, payload());
          const r = createFinalCommandReceipt({
            command: actual.command,
            outcome: 'COMMITTED',
            reasonCode: null,
            transition: actual.transition,
            simTime: actual.command.simTime,
            recordedAtReal: '2026-10-07T00:00:01.000Z',
          });
          await receipt(sql, {
            ...r,
            eventIds: fixture.paidLineage.transition.eventIds,
          });
          await sql.query('set constraints all immediate');
        })
        .catch((error) => {
          expect(error).toBeInstanceOf(V09TransactionRolledBackError);
          throw (error as V09TransactionRolledBackError).cause;
        }),
    ).rejects.toThrow('complete ordered authoritative transition');
  });
  it('rejects duplicate run recognition before final receipt even with another posting ID', async () => {
    await expect(
      db
        .transaction(async (sql) => {
          await commandEvents(sql, actual.command, actual.transition);
          await inventory(sql, payload());
          const duplicate = payload();
          duplicate.postingId = 'PRODUCTION_DUPLICATE_POSTING';
          await inventory(sql, duplicate);
        })
        .catch((error) => {
          expect(error).toBeInstanceOf(V09TransactionRolledBackError);
          throw (error as V09TransactionRolledBackError).cause;
        }),
    ).rejects.toThrow('inventory_production_run_once');
    expect(
      (
        await db.query<{ n: number }>(
          'select count(*)::int as n from world_v2.inventory_posting where operation=$1',
          ['PRODUCE_AND_CONSUME'],
        )
      ).rows[0]!.n,
    ).toBe(0);
  });
  it('commits actual intent on the same table, blocks late append, duplicate recognition and mutation/truncate', async () => {
    await db.transaction(async (sql) => {
      await commandEvents(sql, actual.command, actual.transition);
      await inventory(sql, payload(), actual.posting.fingerprint);
      await receipt(
        sql,
        createFinalCommandReceipt({
          command: actual.command,
          outcome: 'COMMITTED',
          reasonCode: null,
          transition: actual.transition,
          simTime: actual.command.simTime,
          recordedAtReal: '2026-10-07T00:00:01.000Z',
        }),
      );
    });
    const rows = await db.query<{ canonical_payload: string }>(
      'select canonical_payload from world_v2.inventory_posting where operation=$1',
      ['PRODUCE_AND_CONSUME'],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]!.canonical_payload).toBe(
      canonicalSerialize(intent(actual.posting)),
    );
    await expect(inventory(db, payload())).rejects.toThrow('final receipt');
    await expect(
      db.query(
        'update world_v2.inventory_posting set canonical_payload=canonical_payload',
      ),
    ).rejects.toThrow('append-only');
    await expect(
      db.query('delete from world_v2.inventory_posting'),
    ).rejects.toThrow('append-only');
    await expect(
      db.query('truncate world_v2.inventory_posting'),
    ).rejects.toThrow('append-only');
  });
});
