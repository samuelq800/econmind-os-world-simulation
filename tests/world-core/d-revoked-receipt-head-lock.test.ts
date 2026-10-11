// TEST_ONLY scripted SQL-shape checks. Native tests prove transaction behavior.
import { describe, expect, it } from 'vitest';
import {
  fixture,
  isHeadLock,
  repository,
} from '../support/d-revoked-receipt-fixture.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';

function scripted(
  outcome: 'AUTHORIZATION_REVOKED' | 'REJECTED',
  headCount: number | null = 1,
) {
  const f = fixture(`SCRIPT_${outcome}`, outcome);
  const c = f.command;
  const queries: string[] = [];
  const tx: SqlExecutor = {
    async query<Row extends object = Record<string, unknown>>(
      sql: string,
      parameters: readonly unknown[] = [],
    ) {
      queries.push(sql);
      let rows: object[] = [];
      let rowCount: number | null = 0;
      if (/from world_v2.command_submission/u.test(sql))
        rows = [
          {
            world_id: c.worldId,
            command_id: c.commandId,
            idempotency_key: c.idempotencyKey,
            command_type: c.commandType,
            schema_version: c.schemaVersion,
            canonical_payload: c.canonicalPayload,
            payload_sha256: c.payloadHash,
            command_fingerprint: c.fingerprint,
            auth_subject: c.authSubject,
            actor_id: c.actorId,
            country_id: c.countryId,
            office_id: c.officeId,
            expected_world_version: c.expectedWorldVersion,
            sim_time: c.simTime.toCanonicalValue(),
            correlation_id: c.correlationId,
            submitted_at_real: c.submittedAtReal,
          },
        ];
      else if (isHeadLock(sql)) {
        expect(parameters).toEqual([c.worldId]);
        return { rowCount: headCount, rows: [] };
      } else if (/from world_v2.world_writer_lease/u.test(sql))
        rows = [{ fencing_token: '1' }];
      else if (
        /insert into world_v2.command_receipt|update world_v2.command_queue/u.test(
          sql,
        )
      )
        rowCount = 1;
      else if (
        !/from world_v2.command_receipt|from world_v2.current_commit_authorization/u.test(
          sql,
        )
      )
        throw new Error(`UNEXPECTED_SQL:${sql}`);
      return { rowCount: rows.length || rowCount, rows: rows as Row[] };
    },
  };
  const port: SqlDatabase = {
    query: tx.query,
    transaction: (operation) => operation(tx),
  };
  return { f, queries, port };
}
describe('revoked receipt focused SQL contract', () => {
  it('takes S then existing lease row then same-World H before negative A, R and Q', async () => {
    const { f, queries, port } = scripted('AUTHORIZATION_REVOKED');
    expect(await repository(port).recordZeroEffectReceipt(f.receipt)).toEqual(
      f.receipt,
    );
    const stages = [
      /from world_v2.command_submission/u,
      /select world_id\s+from world_v2.world_writer_lease/u,
      isHeadLock,
      /from world_v2.current_commit_authorization/u,
      /insert into world_v2.command_receipt/u,
      /select fencing_token\s+from world_v2.world_writer_lease/u,
      /update world_v2.command_queue/u,
    ];
    const indexes = stages.map((stage) =>
      queries.findIndex((sql) =>
        typeof stage === 'function' ? stage(sql) : stage.test(sql),
      ),
    );
    for (let i = 0; i < indexes.length; i++)
      expect(indexes[i]!).toBeGreaterThan(i === 0 ? -1 : indexes[i - 1]!);
  });
  it.each([0, null, 2] as const)(
    'fails closed on invalid H row count %s, before A or any write',
    async (count) => {
      const { f, queries, port } = scripted('AUTHORIZATION_REVOKED', count);
      await expect(
        repository(port).recordZeroEffectReceipt(f.receipt),
      ).rejects.toMatchObject({ code: 'TRANSITION_EVIDENCE_INVALID' });
      expect(
        queries.some((sql) =>
          /current_commit_authorization|insert into world_v2.command_receipt|update world_v2.command_queue/u.test(
            sql,
          ),
        ),
      ).toBe(false);
    },
  );
  it('leaves ordinary rejection on its original path', async () => {
    const { f, queries, port } = scripted('REJECTED');
    expect(await repository(port).recordZeroEffectReceipt(f.receipt)).toEqual(
      f.receipt,
    );
    expect(queries.some(isHeadLock)).toBe(false);
    expect(
      queries.some((sql) => /current_commit_authorization/u.test(sql)),
    ).toBe(false);
  });
});
