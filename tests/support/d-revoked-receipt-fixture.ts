// TEST_ONLY. Canonical intent and actual-schema facts, never source admission.
import { createHash } from 'node:crypto';
import {
  COMMAND_SCHEMA_VERSION,
  SimTime,
  createFinalCommandReceipt,
  parseCanonicalCommand,
  type Sha256Hex,
} from '@econmind/core';
import { AtomicTransitionRepository } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import { createTransactionCutoffAuthorizationGuard } from '../../apps/world-worker/src/authoritative-execution.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';

export const sha256Hex: Sha256Hex = (text) =>
  createHash('sha256').update(text).digest('hex');
export const worker = 'WORKER_D_REVOKED';
export const t0 = '2026-10-10T00:00:00.000Z';
export const recordedAt = '2026-10-10T00:00:01.000Z';
export const subject = '550e8400-e29b-41d4-a716-446655440000';
export function fixture(
  suffix: string,
  outcome: 'AUTHORIZATION_REVOKED' | 'REJECTED' = 'AUTHORIZATION_REVOKED',
) {
  const command = parseCanonicalCommand(
    {
      worldId: `WORLD_D_REVOKED_${suffix}`,
      commandId: `COMMAND_D_${suffix}`,
      actorId: 'ACTOR_D_REVOKED',
      authSubject: subject,
      countryId: 'COUNTRY_D',
      officeId: 'FINANCE',
      commandType: 'TEST_REVOKED_RECEIPT',
      schemaVersion: COMMAND_SCHEMA_VERSION,
      correlationId: `CORRELATION_D_${suffix}`,
      idempotencyKey: `IDEMPOTENCY_D_${suffix}`,
      expectedWorldVersion: '0',
      simTime: '10000',
      submittedAtReal: t0,
      payload: { operation: 'TEST_ONLY_REVOKED_RECEIPT' },
    },
    sha256Hex,
  );
  const receipt = createFinalCommandReceipt({
    command,
    outcome,
    reasonCode: outcome,
    transition: null,
    simTime: SimTime.fromTicks('10000'),
    recordedAtReal: recordedAt,
  });
  return { command, receipt };
}
export type Fixture = ReturnType<typeof fixture>;
export function repository(database: SqlDatabase) {
  return new AtomicTransitionRepository({
    database,
    workerId: worker,
    sha256Hex,
    authorizationGuard: createTransactionCutoffAuthorizationGuard(),
  });
}
export async function seed(
  database: SqlExecutor,
  value: Fixture,
  active: boolean | null = false,
) {
  const c = value.command;
  await database.query('insert into world_v2.world_head(world_id) values($1)', [
    c.worldId,
  ]);
  await database.query(
    `insert into world_v2.command_submission
    (world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,
     command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      c.worldId,
      c.commandId,
      c.idempotencyKey,
      c.commandType,
      c.schemaVersion,
      c.canonicalPayload,
      c.payloadHash,
      c.fingerprint,
      c.authSubject,
      c.actorId,
      c.countryId,
      c.officeId,
      c.expectedWorldVersion,
      c.simTime.toCanonicalValue(),
      c.correlationId,
      c.submittedAtReal,
    ],
  );
  await database.query(
    'select * from world_v2.acquire_world_writer_lease($1,$2,$3,$4)',
    [c.worldId, worker, t0, '300000'],
  );
  await database.query(
    `insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time)
    values($1,$2,'DISCRETIONARY_USER',10000)`,
    [c.worldId, c.commandId],
  );
  await database.query(
    `update world_v2.command_queue set queue_state='CLAIMED',attempt_count=1,
    claimed_by=$3,claimed_at_real=$4,claim_fencing_token=1 where world_id=$1 and command_id=$2`,
    [c.worldId, c.commandId, worker, t0],
  );
  if (active !== null) await insertAuthorization(database, value, active);
}
export async function insertAuthorization(
  database: SqlExecutor,
  value: Fixture,
  active: boolean,
) {
  const c = value.command;
  await database.query(
    `insert into world_v2.current_commit_authorization
    (world_id,auth_subject,country_id,office_id,capability,team_id,authorization_version,active,refreshed_at_real)
    values($1,$2::uuid,$3,$4,'FINANCE_TREASURY','TEAM_D','TEST_REVISION_1',$5,$6)`,
    [c.worldId, c.authSubject, c.countryId, c.officeId, active, t0],
  );
}
export async function footprint(database: SqlExecutor, value: Fixture) {
  const result = await database.query(
    `select
    (select world_version::text from world_v2.world_head where world_id=$1) as version,
    (select event_sequence::text from world_v2.world_head where world_id=$1) as sequence,
    (select queue_state from world_v2.command_queue where world_id=$1 and command_id=$2) as queue,
    (select count(*)::int from world_v2.command_receipt where world_id=$1) as receipts,
    (select count(*)::int from world_v2.authoritative_event where world_id=$1) as events,
    (select count(*)::int from world_v2.inventory_posting where world_id=$1) as inventory,
    (select count(*)::int from world_v2.financial_posting_batch where world_id=$1) as finance,
    (select count(*)::int from world_v2.authoritative_commit_authorization where world_id=$1) as audit,
    (select count(*)::int from world_v2.current_materialization where world_id=$1) as materializations,
    (select count(*)::int from world_v2.notification_outbox where world_id=$1) as outbox`,
    [value.command.worldId, value.command.commandId],
  );
  return result.rows[0];
}
export const zeroEffects = {
  version: '0',
  sequence: '0',
  events: 0,
  inventory: 0,
  finance: 0,
  audit: 0,
  materializations: 0,
  outbox: 0,
};
export const isHeadLock = (sql: string) =>
  /from world_v2\.world_head\s+where world_id = \$1\s+for update/u.test(sql);
export function observe(
  database: SqlDatabase,
  hook: (
    sql: string,
    parameters: readonly unknown[],
    phase: 'BEFORE' | 'AFTER',
  ) => Promise<void> | void,
): SqlDatabase {
  return {
    query: database.query.bind(database),
    transaction: (operation) =>
      database.transaction((tx) =>
        operation({
          async query<Row extends object = Record<string, unknown>>(
            sql: string,
            parameters: readonly unknown[] = [],
          ) {
            await hook(sql, parameters, 'BEFORE');
            const result = await tx.query<Row>(sql, parameters);
            await hook(sql, parameters, 'AFTER');
            return result;
          },
        }),
      ),
  };
}
