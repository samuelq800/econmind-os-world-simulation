import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createAuthenticatedWorldReadQueryHandler,
  createWorldReadRequest,
  readAuthenticatedPostgresFinalCommandReceipt,
  type ParameterizedPgReadExecutor,
} from '../../apps/world-api/src/index.js';
import { createTransactionCutoffAuthorizationGuard } from '../../apps/world-worker/src/authoritative-execution.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
import { createV10CommitAuthorizationFixture } from '../support/v10-commit-authorization-fixture.js';

const root = path.resolve(import.meta.dirname, '../..');
const migrations = [
  '0001_world_v2_namespace.sql',
  '0002_world_v2_command_event_ledger.sql',
  '0003_world_v2_command_receipts_outbox.sql',
  '0011_world_v2_current_commit_authorization.sql',
  '0013_world_v2_read_projection_boundary.sql',
] as const;
const WORLD_A = 'WORLD_V30_ALPHA';
const WORLD_B = 'WORLD_V30_BRAVO';
const COUNTRY_A = 'COUNTRY_ALPHA';
const COUNTRY_B = 'COUNTRY_BRAVO';
const OFFICE_A = 'TRADE';
const OFFICE_B = 'FINANCE';
const SUBJECT_A = '550e8400-e29b-41d4-a716-446655440301';
const SUBJECT_B = '550e8400-e29b-41d4-a716-446655440302';
const FINGERPRINT = `sha256:${'3'.repeat(64)}`;
const PAYLOAD_HASH = `sha256:${'4'.repeat(64)}`;
const AT = '2026-09-24T00:00:00.000Z';
const databases: PGlite[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

async function database(): Promise<PGlite> {
  const database = new PGlite();
  databases.push(database);
  for (const migration of migrations) {
    await database.exec(
      await readFile(
        path.join(root, 'database/migrations/artifacts', migration),
        'utf8',
      ),
    );
  }
  await database.query(
    `insert into world_v2.world_head (world_id)
     values ($1), ($2)`,
    [WORLD_A, WORLD_B],
  );
  return database;
}

function executor(database: PGlite): ParameterizedPgReadExecutor {
  return {
    query: async ({ text, values }) => database.query(text, [...values]),
  };
}

async function authorize(
  database: PGlite,
  input: {
    readonly worldId: string;
    readonly authSubject: string;
    readonly countryId: string;
    readonly officeId: string;
    readonly capability?: string;
    readonly teamId?: string;
    readonly authorizationVersion?: string;
    readonly active?: boolean;
  },
): Promise<void> {
  await database.query(
    `insert into world_v2.current_commit_authorization
       (world_id, auth_subject, country_id, office_id, capability, team_id,
        authorization_version, active, refreshed_at_real)
     values ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.worldId,
      input.authSubject,
      input.countryId,
      input.officeId,
      input.capability ?? 'TRADE_CONTRACTS',
      input.teamId ?? 'TEAM_V30',
      input.authorizationVersion ?? 'AUTH_V30_1',
      input.active ?? true,
      AT,
    ],
  );
}

async function receipt(
  database: PGlite,
  input: {
    readonly worldId: string;
    readonly commandId: string;
    readonly idempotencyKey: string;
    readonly authSubject: string;
    readonly countryId: string;
    readonly officeId: string;
  },
): Promise<void> {
  await database.query(
    `insert into world_v2.command_submission
       (world_id, command_id, idempotency_key, command_type, schema_version,
        canonical_payload, payload_sha256, command_fingerprint, auth_subject,
        actor_id, country_id, office_id, expected_world_version, sim_time,
        correlation_id, submitted_at_real)
     values ($1, $2, $3, 'V30_PERMISSION_TEST', 'command-v1', '{}', $4, $5,
             $6::uuid, 'ACTOR_V30', $7, $8, 0, 0, $9, $10)`,
    [
      input.worldId,
      input.commandId,
      input.idempotencyKey,
      PAYLOAD_HASH,
      FINGERPRINT,
      input.authSubject,
      input.countryId,
      input.officeId,
      `CORRELATION_${input.commandId}`,
      AT,
    ],
  );
  await database.query(
    `insert into world_v2.command_receipt
       (world_id, command_id, idempotency_key, schema_version,
        command_fingerprint, outcome, reason_code, transition_id,
        world_version_before, world_version_after, sim_time, event_ids,
        recorded_at_real)
     values ($1, $2, $3, 'command-receipt-v2', $4, 'REJECTED',
             'POLICY_REJECTED', null, null, null, 0, '[]'::jsonb, $5)`,
    [input.worldId, input.commandId, input.idempotencyKey, FINGERPRINT, AT],
  );
}

async function projection(
  database: PGlite,
  input: {
    readonly worldId: string;
    readonly authSubject: string;
    readonly classification: 'COUNTRY' | 'OFFICE_PRIVATE';
    readonly scopeKey: string;
  },
): Promise<void> {
  await database.query(
    `insert into world_v2.projection_entitlement
       (world_id, auth_subject, classification, scope_key,
        authorization_version, active, granted_at, revoked_at)
     values ($1, $2::uuid, $3, $4, 'AUTH_V30_1', true, $5, null)`,
    [
      input.worldId,
      input.authSubject,
      input.classification,
      input.scopeKey,
      AT,
    ],
  );
  await database.query(
    `insert into world_v2.read_projection
       (world_id, classification, scope_key, schema_version,
        world_version, event_sequence, payload, generated_at)
     values ($1, $2, $3, 'world-projection-read-v1', 1, 1,
             $4::jsonb, $5)`,
    [
      input.worldId,
      input.classification,
      input.scopeKey,
      JSON.stringify({ scope: input.scopeKey }),
      AT,
    ],
  );
}

function readHandler(database: PGlite, authSubject: string) {
  return createAuthenticatedWorldReadQueryHandler({
    executor: executor(database),
    policy: {
      jwt: {
        expectedIssuer: 'https://issuer.example.test',
        expectedAudience: 'authenticated',
        nowEpochSeconds: 1_800_000_000,
      },
      timeoutMs: 1_000,
    },
    verifier: {
      async verify() {
        return {
          sub: authSubject,
          iss: 'https://issuer.example.test',
          aud: 'authenticated',
          iat: 1_799_999_000,
          exp: 1_800_001_000,
        };
      },
    },
  });
}

describe('V30.2 World V2 database permission negative preparation', () => {
  it('does not disclose projections across subject, World, Country, or Office scope, and honors a revoked entitlement', async () => {
    const testDatabase = await database();
    await projection(testDatabase, {
      worldId: WORLD_A,
      authSubject: SUBJECT_A,
      classification: 'COUNTRY',
      scopeKey: COUNTRY_A,
    });
    await projection(testDatabase, {
      worldId: WORLD_A,
      authSubject: SUBJECT_A,
      classification: 'OFFICE_PRIVATE',
      scopeKey: 'OFFICE_ALPHA_TRADE',
    });
    await projection(testDatabase, {
      worldId: WORLD_A,
      authSubject: SUBJECT_B,
      classification: 'COUNTRY',
      scopeKey: COUNTRY_B,
    });
    await projection(testDatabase, {
      worldId: WORLD_A,
      authSubject: SUBJECT_B,
      classification: 'OFFICE_PRIVATE',
      scopeKey: 'OFFICE_BRAVO_FINANCE',
    });
    await projection(testDatabase, {
      worldId: WORLD_B,
      authSubject: SUBJECT_B,
      classification: 'COUNTRY',
      scopeKey: COUNTRY_B,
    });

    const subjectA = readHandler(testDatabase, SUBJECT_A);
    const subjectB = readHandler(testDatabase, SUBJECT_B);
    const countryARequest = createWorldReadRequest({
      requestId: '550e8400-e29b-41d4-a716-446655440311',
      worldId: WORLD_A,
      classification: 'COUNTRY',
      scopeKey: COUNTRY_A,
    });

    await expect(
      subjectA.handle({
        authorization: 'Bearer subject-a',
        request: countryARequest,
      }),
    ).resolves.toMatchObject({ ok: true });
    for (const request of [
      createWorldReadRequest({
        requestId: '550e8400-e29b-41d4-a716-446655440312',
        worldId: WORLD_A,
        classification: 'COUNTRY',
        scopeKey: COUNTRY_B,
      }),
      createWorldReadRequest({
        requestId: '550e8400-e29b-41d4-a716-446655440313',
        worldId: WORLD_A,
        classification: 'OFFICE_PRIVATE',
        scopeKey: 'OFFICE_BRAVO_FINANCE',
      }),
      createWorldReadRequest({
        requestId: '550e8400-e29b-41d4-a716-446655440314',
        worldId: WORLD_B,
        classification: 'COUNTRY',
        scopeKey: COUNTRY_B,
      }),
    ]) {
      await expect(
        subjectA.handle({ authorization: 'Bearer subject-a', request }),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
    }
    await expect(
      subjectB.handle({
        authorization: 'Bearer subject-b',
        request: countryARequest,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });

    await testDatabase.query(
      `update world_v2.projection_entitlement
          set active = false, revoked_at = $1
        where world_id = $2
          and auth_subject = $3::uuid
          and classification = 'COUNTRY'
          and scope_key = $4`,
      [AT, WORLD_A, SUBJECT_A, COUNTRY_A],
    );
    await expect(
      subjectA.handle({
        authorization: 'Bearer subject-a',
        request: countryARequest,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('does not disclose durable final receipts across subject, World, Country, or Office scope, and honors inactive current authorization', async () => {
    const testDatabase = await database();
    await authorize(testDatabase, {
      worldId: WORLD_A,
      authSubject: SUBJECT_A,
      countryId: COUNTRY_A,
      officeId: OFFICE_A,
    });
    await authorize(testDatabase, {
      worldId: WORLD_A,
      authSubject: SUBJECT_B,
      countryId: COUNTRY_B,
      officeId: OFFICE_B,
    });
    await authorize(testDatabase, {
      worldId: WORLD_B,
      authSubject: SUBJECT_B,
      countryId: COUNTRY_B,
      officeId: OFFICE_B,
    });
    await receipt(testDatabase, {
      worldId: WORLD_A,
      commandId: 'COMMAND_V30_ALPHA',
      idempotencyKey: 'IDEMPOTENCY_V30_ALPHA',
      authSubject: SUBJECT_A,
      countryId: COUNTRY_A,
      officeId: OFFICE_A,
    });
    await receipt(testDatabase, {
      worldId: WORLD_A,
      commandId: 'COMMAND_V30_BRAVO',
      idempotencyKey: 'IDEMPOTENCY_V30_BRAVO',
      authSubject: SUBJECT_B,
      countryId: COUNTRY_B,
      officeId: OFFICE_B,
    });
    await receipt(testDatabase, {
      worldId: WORLD_B,
      commandId: 'COMMAND_V30_WORLD_BRAVO',
      idempotencyKey: 'IDEMPOTENCY_V30_WORLD_BRAVO',
      authSubject: SUBJECT_B,
      countryId: COUNTRY_B,
      officeId: OFFICE_B,
    });
    const readReceipt = (input: {
      readonly worldId: string;
      readonly commandId: string;
      readonly idempotencyKey: string;
      readonly authSubject: string;
    }) =>
      readAuthenticatedPostgresFinalCommandReceipt({
        executor: executor(testDatabase),
        identity: input,
        authSubject: input.authSubject as Parameters<
          typeof readAuthenticatedPostgresFinalCommandReceipt
        >[0]['authSubject'],
      });

    await expect(
      readReceipt({
        worldId: WORLD_A,
        commandId: 'COMMAND_V30_ALPHA',
        idempotencyKey: 'IDEMPOTENCY_V30_ALPHA',
        authSubject: SUBJECT_A,
      }),
    ).resolves.toMatchObject({
      source: 'DURABLE_FINAL_COMMAND_RECEIPT',
      commandId: 'COMMAND_V30_ALPHA',
    });
    for (const input of [
      {
        worldId: WORLD_A,
        commandId: 'COMMAND_V30_ALPHA',
        idempotencyKey: 'IDEMPOTENCY_V30_ALPHA',
        authSubject: SUBJECT_B,
      },
      {
        worldId: WORLD_A,
        commandId: 'COMMAND_V30_BRAVO',
        idempotencyKey: 'IDEMPOTENCY_V30_BRAVO',
        authSubject: SUBJECT_A,
      },
      {
        worldId: WORLD_B,
        commandId: 'COMMAND_V30_WORLD_BRAVO',
        idempotencyKey: 'IDEMPOTENCY_V30_WORLD_BRAVO',
        authSubject: SUBJECT_A,
      },
    ]) {
      await expect(readReceipt(input)).resolves.toBeNull();
    }

    await testDatabase.query(
      `update world_v2.current_commit_authorization
          set active = false
        where world_id = $1
          and auth_subject = $2::uuid
          and country_id = $3
          and office_id = $4`,
      [WORLD_A, SUBJECT_A, COUNTRY_A, OFFICE_A],
    );
    await expect(
      readReceipt({
        worldId: WORLD_A,
        commandId: 'COMMAND_V30_ALPHA',
        idempotencyKey: 'IDEMPOTENCY_V30_ALPHA',
        authSubject: SUBJECT_A,
      }),
    ).resolves.toBeNull();
  });

  it('rejects Core-issued write authorization when server-held subject, World, Country, Office, capability, or active status changes', async () => {
    const scenarios = [
      {
        label: 'subject',
        statement: `update world_v2.current_commit_authorization
                       set auth_subject = $1::uuid`,
        values: [SUBJECT_B],
      },
      {
        label: 'World',
        statement: `update world_v2.current_commit_authorization
                       set world_id = $1`,
        values: ['WORLD_V30_OTHER'],
      },
      {
        label: 'Country',
        statement: `update world_v2.current_commit_authorization
                       set country_id = 'COUNTRY_V30_OTHER'`,
        values: [],
      },
      {
        label: 'Office',
        statement: `update world_v2.current_commit_authorization
                       set office_id = 'FINANCE'`,
        values: [],
      },
      {
        label: 'capability',
        statement: `update world_v2.current_commit_authorization
                       set capability = 'FINANCE_TREASURY'`,
        values: [],
      },
      {
        label: 'active status',
        statement: `update world_v2.current_commit_authorization
                       set active = false`,
        values: [],
      },
    ] as const;

    for (const scenario of scenarios) {
      const testDatabase = await database();
      const fixture = createV10CommitAuthorizationFixture();
      const proof = await fixture.issueCommitAuthorizationProof();
      await testDatabase.query(
        `insert into world_v2.world_head (world_id)
         values ($1), ('WORLD_V30_OTHER')
         on conflict do nothing`,
        [proof.worldId],
      );
      await authorize(testDatabase, {
        worldId: proof.worldId,
        authSubject: proof.authSubject,
        countryId: proof.countryId,
        officeId: proof.officeId,
        capability: proof.capability,
        teamId: proof.teamId,
        authorizationVersion: proof.authorizationVersion,
      });
      const guard = createTransactionCutoffAuthorizationGuard();
      const input = {
        command: fixture.command,
        authorityKind: 'DISCRETIONARY_USER' as const,
        proof,
        expected: 'AUTHORIZED' as const,
      };
      const assert = () =>
        testDatabase.transaction((transaction) =>
          guard.assertCurrent(transaction as SqlExecutor, input),
        );

      await expect(assert(), scenario.label).resolves.toBeUndefined();
      await testDatabase.query(scenario.statement, scenario.values);
      await expect(assert(), scenario.label).rejects.toMatchObject({
        code: 'AUTHORIZATION_DENIED',
      });
      await expect(
        testDatabase.query<{ readonly count: string }>(
          `select count(*)::text as count
             from world_v2.command_receipt
            where world_id = $1`,
          [proof.worldId],
        ),
      ).resolves.toMatchObject({ rows: [{ count: '0' }] });
    }
  });
});
