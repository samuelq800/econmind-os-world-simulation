import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createPGliteV09AtomicTestDatabase } from '../support/v09-atomic-database.js';
import type { V09AtomicTestDatabase } from '../support/v09-atomic-contract.js';

const root = path.resolve(import.meta.dirname, '../..');
const migrations = [
  '0001_world_v2_namespace.sql',
  '0002_world_v2_command_event_ledger.sql',
  '0003_world_v2_command_receipts_outbox.sql',
  '0004_world_v2_receipt_event_set_integrity.sql',
  '0005_world_v2_writer_lease_fencing.sql',
  '0006_world_v2_writer_lease_lineage_guard.sql',
  '0007_world_v2_atomic_transition_facts.sql',
  '0008_world_v2_materialization_recovery.sql',
  '0009_world_v2_posting_payload_integrity.sql',
  '0010_world_v2_command_claim_fencing.sql',
  '0011_world_v2_current_commit_authorization.sql',
  '0012_world_v2_command_claim_active_lease_guard.sql',
  '0013_world_v2_read_projection_boundary.sql',
  '0014_world_v2_current_negotiation_party_membership.sql',
  '0015_world_v2_narrow_transfer_approvals.sql',
] as const;
const WORLD = 'WORLD_V10_2_APPROVAL_SCHEMA';
const COMMAND = 'COMMAND_V10_2_APPROVAL_SCHEMA';
const FINGERPRINT = `sha256:${'a'.repeat(64)}`;
const AT = '2026-09-14T00:00:00.000Z';
const databases: V09AtomicTestDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

async function database(): Promise<V09AtomicTestDatabase> {
  const database = createPGliteV09AtomicTestDatabase();
  databases.push(database);
  for (const migration of migrations) {
    await database.executeScript(
      await readFile(
        path.join(root, 'database/migrations/artifacts', migration),
        'utf8',
      ),
    );
  }
  await database.query(
    'insert into world_v2.world_head (world_id) values ($1)',
    [WORLD],
  );
  await database.query(
    `insert into world_v2.command_submission
       (world_id, command_id, idempotency_key, command_type, schema_version,
        canonical_payload, payload_sha256, command_fingerprint, auth_subject,
        actor_id, country_id, office_id, expected_world_version, sim_time,
        correlation_id, submitted_at_real)
     values ($1, $2, 'IDEMPOTENCY_V10_2_APPROVAL_SCHEMA',
             'CORE_GOODS_TRANSFER_V1', 'CANONICAL_COMMAND-1', '{}',
             $3, $3, '550e8400-e29b-41d4-a716-446655440099'::uuid,
             'ACTOR_SELLER', 'COUNTRY_SELLER', 'TRADE', 0, 0,
             'CORRELATION_V10_2_APPROVAL_SCHEMA', $4::timestamptz)`,
    [WORLD, COMMAND, FINGERPRINT, AT],
  );
  return database;
}

async function insertProposal(database: V09AtomicTestDatabase): Promise<void> {
  await database.query(
    `insert into world_v2.narrow_transfer_proposal
       (world_id, proposal_id, command_id, country_id, command_fingerprint,
        policy_version, threshold_policy_version, required_offices, status,
        opened_at_real, approved_at_real)
     values ($1, 'PROPOSAL_SELLER_V10_2', $2, 'COUNTRY_SELLER', $3,
             'V10_TREASURY_GCU_V1', 'V10_TREASURY_GCU_THRESHOLD_V1',
             '["TRADE"]'::jsonb, 'PENDING', $4::timestamptz, null)`,
    [WORLD, COMMAND, FINGERPRINT, AT],
  );
}

describe('V10.2 narrow transfer approval schema', () => {
  it('persists only a bound scope, append-only signature, and one-way approval', async () => {
    const value = await database();
    await insertProposal(value);
    await value.query(
      `insert into world_v2.narrow_transfer_approval_signature
         (world_id, proposal_id, country_id, office_id, actor_id, auth_subject,
          authorization_version, signed_at_real)
       values ($1, 'PROPOSAL_SELLER_V10_2', 'COUNTRY_SELLER', 'TRADE',
               'ACTOR_SELLER', '550e8400-e29b-41d4-a716-446655440099'::uuid,
               'AUTH_SELLER_1', $2::timestamptz)`,
      [WORLD, AT],
    );
    await value.query(
      `update world_v2.narrow_transfer_proposal
          set status = 'APPROVED', approved_at_real = $2::timestamptz
        where world_id = $1 and proposal_id = 'PROPOSAL_SELLER_V10_2'`,
      [WORLD, '2026-09-14T00:00:01.000Z'],
    );

    await expect(
      value.query(
        `update world_v2.narrow_transfer_proposal
            set country_id = 'COUNTRY_OTHER'
          where world_id = $1 and proposal_id = 'PROPOSAL_SELLER_V10_2'`,
        [WORLD],
      ),
    ).rejects.toThrow(/scope is immutable/u);
    await expect(
      value.query(
        `update world_v2.narrow_transfer_approval_signature
            set authorization_version = 'AUTH_SELLER_2'
          where world_id = $1 and proposal_id = 'PROPOSAL_SELLER_V10_2'`,
        [WORLD],
      ),
    ).rejects.toThrow(/append-only/u);
  });
});
