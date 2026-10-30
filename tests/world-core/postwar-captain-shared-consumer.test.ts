/** Fixed constructors over protocol-only transport. No source/admission is
 * fabricated: Captain remains unavailable until real shared preparation and
 * actual SQL custody. Native economic execution is a separate opt-in scope. */
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CAPTAIN_POLITICAL_CAPITAL_COMMAND,
  COMMAND_SCHEMA_VERSION,
  parseCanonicalCommand,
} from '@econmind/core';
import {
  createPostwarSocialRuntimeConnection,
  loadPostwarSocialConnectionOpeningAdoption,
  type OfficialLabourSocialOpeningAdoption,
} from '../../apps/world-worker/src/runtime-preparation/social-runtime-connection.js';
import {
  createPostwarFinanceSocialRuntimeConnection,
  readPostwarFinanceSocialRuntimeBinding,
} from '../../apps/world-worker/src/runtime-preparation/finance-social-runtime-connection.js';
import { createPostgresFinanceBudgetWorldCapacitySource } from '../../apps/world-worker/src/persistence/postgres-finance-budget-capacity-source.js';
import { isPostwarCaptainSourceCommitProtectionPort } from '../../apps/world-worker/src/persistence/postwar-captain-runtime.js';
import { manualOfficeIntakeRuntimeSupportsFamily } from '../../apps/world-worker/src/intake/manual-office-intake-runtime.js';
import { OFFICE_COMMAND_CURRENT_BINDING_QUERY } from '../../apps/world-worker/src/intake/postgres-office-command-intake.js';
import { CAPTAIN_RUNTIME_CURRENT_AUTHORIZATION_LOCK_QUERY } from '../../apps/world-worker/src/persistence/postwar-captain-intake-authorization.js';
import { FINANCE_BUDGET_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY } from '../../apps/world-worker/src/persistence/postgres-finance-budget-custody.js';
import {
  WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY,
  WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY,
} from '../../apps/world-worker/src/persistence/worker-authorization-sql.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const at = '2026-10-30T00:00:00.000Z';
let adoption: OfficialLabourSocialOpeningAdoption;
let serial = 0;
beforeAll(async () => {
  adoption = await loadPostwarSocialConnectionOpeningAdoption(process.cwd());
});
afterEach(() => vi.restoreAllMocks());
function harness(options: { captain?: boolean; fx?: boolean } = {}) {
  const world = `WORLD_CAPTAIN_SHARED_PROTOCOL_${++serial}`;
  const command = (type: string) =>
    parseCanonicalCommand(
      {
        schemaVersion: COMMAND_SCHEMA_VERSION,
        worldId: world,
        countryId: 'COUNTRY_01',
        commandId: 'COMMAND_CAPTAIN_SHARED_PROTOCOL',
        idempotencyKey: 'KEY_CAPTAIN_SHARED_PROTOCOL',
        actorId: 'ACTOR_TEST_ONLY',
        authSubject: '11111111-1111-4111-8111-111111111111',
        officeId:
          type === CAPTAIN_POLITICAL_CAPITAL_COMMAND ? 'CAPTAIN' : 'FINANCE',
        commandType: type,
        expectedWorldVersion: '0',
        simTime: '0',
        submittedAtReal: at,
        correlationId: 'CORRELATION_CAPTAIN_SHARED_PROTOCOL',
        payload: { protocolOnly: true },
      },
      sha,
    );
  let selected = command(CAPTAIN_POLITICAL_CAPITAL_COMMAND);
  const queries: string[] = [];
  const end = vi.fn(async () => {
    throw Error('BORROWED_POOL_MUST_NOT_END');
  });
  const query = vi.fn(async (sql: string) => {
    queries.push(sql);
    if (sql.includes('from world_v2.command_queue'))
      return {
        rows: [
          {
            command_id: selected.commandId,
            authority_kind: 'DISCRETIONARY_USER',
            queue_state: 'PENDING',
            available_at_sim_time: '0',
            claimed_by: null,
            claim_fencing_token: null,
          },
        ],
        rowCount: 1,
      };
    if (
      [
        'begin',
        'commit',
        'rollback',
        'set transaction isolation level repeatable read',
      ].includes(sql)
    )
      return { rows: [], rowCount: 0 };
    if (
      sql.includes('world_v2.lock_postwar_captain_current_authorization') ||
      sql.includes('world_v2.lock_postwar_captain_revoked_authorization')
    )
      return { rows: [], rowCount: 0 };
    throw Error('NO_SOURCE_OR_CLAIM_SQL_EXPECTED:' + sql);
  });
  const worker = {
    query,
    connect: async () => ({ query, release() {} }),
    end,
  } as unknown as Pool;
  const intakeQueries: string[] = [];
  const intake = {
    connect: async () => ({
      query: async (sql: string) => {
        intakeQueries.push(sql);
        return { rows: [], rowCount: 0 };
      },
      release() {},
    }),
  } as unknown as Pool;
  const social = createPostwarSocialRuntimeConnection({
    worldId: world,
    workerId: 'WORKER_CAPTAIN_SHARED_PROTOCOL',
    workerRole: 'worker_captain_shared_protocol',
    workerPool: worker,
    openingAdoption: adoption,
  });
  const input = {
    socialConnection: social,
    capacitySource: createPostgresFinanceBudgetWorldCapacitySource({
      worldId: world,
      countries: [{ countryId: 'COUNTRY_01' }],
      historyMode: 'BUDGET_SOCIAL',
    }),
    intakePool: intake,
    clock: Object.freeze({ nowReal: () => at, simTime: async () => '0' }),
    environment: 'ci' as const,
    ...(options.fx
      ? { treasuryFx: { workerRole: 'worker_captain_shared_protocol' } }
      : {}),
    ...(options.captain
      ? {
          captain: {
            workerRole: 'worker_captain_shared_protocol',
            mode: 'TEST_ONLY_LOCAL' as const,
          },
        }
      : {}),
  };
  const read = vi
    .spyOn(DurableV08LedgerLineageReader.prototype, 'readCommandFrom')
    .mockImplementation(async () => selected);
  return {
    world,
    input,
    worker,
    queries,
    intakeQueries,
    read,
    end,
    select(type: string) {
      selected = command(type);
    },
    get command() {
      return selected;
    },
  };
}
describe('fixed Captain port on the same Finance/Social/FX consumer', () => {
  it('keeps the default family closed without constructing another consumer/source or querying SQL', async () => {
    const h = harness(),
      connection = createPostwarFinanceSocialRuntimeConnection(h.input);
    try {
      const ports = readPostwarFinanceSocialRuntimeBinding(connection);
      expect(ports.captain).toBeNull();
      expect(
        manualOfficeIntakeRuntimeSupportsFamily(
          ports.runtime,
          CAPTAIN_POLITICAL_CAPITAL_COMMAND,
        ),
      ).toBe(false);
      expect(h.queries).toEqual([]);
      expect(ports.runtime.consumer.state()).toBe('PREPARED');
    } finally {
      await connection.stop();
    }
    expect(h.end).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    'constructs one genuine fixed Captain guard with FX=%s but never treats unprepared data as authority',
    async (fx) => {
      const h = harness({ captain: true, fx }),
        connection = createPostwarFinanceSocialRuntimeConnection(h.input);
      try {
        const ports = readPostwarFinanceSocialRuntimeBinding(connection),
          captain = ports.captain;
        expect(captain).not.toBeNull();
        expect(captain!.sourceBoundary).toBe(
          'NATIVE_CAPTAIN_ORIGINALS_REQUIRED_NO_LEGACY_FALLBACK',
        );
        expect(
          isPostwarCaptainSourceCommitProtectionPort(
            captain!.sourceCommitProtectionPort,
          ),
        ).toBe(true);
        expect(
          isPostwarCaptainSourceCommitProtectionPort({
            ...captain!.sourceCommitProtectionPort,
          }),
        ).toBe(false);
        expect(ports.workerId).toBe(connection.workerId);
        expect(ports.socialConnection).toBe(h.input.socialConnection);
        expect(ports.workerPool).toBe(h.worker);
        expect(ports.clock).toBe(h.input.clock);
        expect(Object.isFrozen(captain)).toBe(true);
        expect(h.queries).toEqual([]);
        expect(
          manualOfficeIntakeRuntimeSupportsFamily(
            ports.runtime,
            CAPTAIN_POLITICAL_CAPITAL_COMMAND,
          ),
        ).toBe(false);
        expect(() => connection.startPreparation()).toThrow(
          'SOURCE_NOT_PREPARED',
        );
        expect(() => connection.consumeOnce()).toThrow('SOURCE_NOT_PREPARED');
        // Inspect only the underlying local engine's queue boundary, just as the
        // existing fixed-family protocol tests do. Public startup remains closed.
        ports.runtime.consumer.startPreparation();
        expect(await ports.runtime.consumer.consumeOnce()).toEqual({
          status: 'BLOCKED',
          reason: 'FINANCE_SOCIAL_CAPTAIN_SOURCE_NOT_PREPARED',
          commandId: h.command.commandId,
        });
        expect(
          h.queries.some((sql) =>
            /source|lease|authorization|insert|update/iu.test(sql),
          ),
        ).toBe(false);
      } finally {
        await connection.stop();
      }
      expect(h.end).not.toHaveBeenCalled();
    },
  );
  it.each([false, true])(
    'never skips an unknown global head with a Captain port and FX=%s installed',
    async (fx) => {
      const h = harness({ captain: true, fx });
      h.select('UNKNOWN_TEST_ONLY_COMMAND');
      const connection = createPostwarFinanceSocialRuntimeConnection(h.input);
      try {
        const consumer =
          readPostwarFinanceSocialRuntimeBinding(connection).runtime.consumer;
        consumer.startPreparation();
        for (let i = 0; i < 2; i++)
          expect(await consumer.consumeOnce()).toEqual({
            status: 'BLOCKED',
            reason: 'FINANCE_SOCIAL_FAMILY_NOT_INSTALLED',
            commandId: h.command.commandId,
          });
        const selectors = h.queries.filter((sql) =>
          sql.includes('from world_v2.command_queue'),
        );
        expect(selectors).toHaveLength(2);
        for (const sql of selectors) {
          expect(sql).toContain(
            'order by available_at_sim_time, priority_rank, command_id limit 1',
          );
          expect(sql).not.toMatch(/office_id|command_type|skip locked/iu);
        }
        expect(h.read).toHaveBeenCalledTimes(2);
        expect(
          h.queries.some((sql) =>
            /source|lease|authorization|insert|update/iu.test(sql),
          ),
        ).toBe(false);
      } finally {
        await connection.stop();
      }
    },
  );
  it('rejects another consumer reservation, invalid source mode and a different FX worker role without granting readiness', async () => {
    const h = harness({ captain: true, fx: true });
    expect(() =>
      createPostwarFinanceSocialRuntimeConnection({
        ...h.input,
        captain: {
          workerRole: 'worker_captain_shared_protocol',
          mode: 'READY' as never,
        },
      }),
    ).toThrow('EXPLICIT_SOURCE_MODE_REQUIRED');
    expect(() =>
      createPostwarFinanceSocialRuntimeConnection({
        ...h.input,
        captain: { workerRole: 'other_worker_role', mode: 'TEST_ONLY_LOCAL' },
      }),
    ).toThrow('EXACT_WORKER_ROLE_REQUIRED');
    const connection = createPostwarFinanceSocialRuntimeConnection(h.input);
    try {
      expect(() =>
        createPostwarFinanceSocialRuntimeConnection(h.input),
      ).toThrow('WORLD_CONSUMER_ALREADY_BOUND');
      expect(h.queries).toEqual([]);
    } finally {
      await connection.stop();
    }
  });
  it('shares one outer Captain intake adapter while preserving the Finance and Social mappings', async () => {
    const h = harness({ captain: true, fx: true }),
      connection = createPostwarFinanceSocialRuntimeConnection(h.input);
    try {
      const ports = readPostwarFinanceSocialRuntimeBinding(connection),
        client = await ports.intakePool.connect();
      expect(ports.rawIntakePool).toBe(h.input.intakePool);
      expect(ports.intakePool).not.toBe(ports.rawIntakePool);
      const args = [
        h.world,
        '11111111-1111-4111-8111-111111111111',
        'COUNTRY_01',
        'CAPTAIN',
        'SEAT_CAPTAIN_PROTOCOL',
        '1',
        'CAPTAIN_CABINET',
        'SCOPE_CAPTAIN_PROTOCOL',
      ];
      await client.query(OFFICE_COMMAND_CURRENT_BINDING_QUERY, args);
      await client.query(
        OFFICE_COMMAND_CURRENT_BINDING_QUERY +
          ' for share of authz,entitlement',
        args,
      );
      await client.query(OFFICE_COMMAND_CURRENT_BINDING_QUERY, [
        ...args.slice(0, 3),
        'FINANCE',
        ...args.slice(4, 6),
        'FINANCE_BUDGET',
        args[7],
      ]);
      await client.query(OFFICE_COMMAND_CURRENT_BINDING_QUERY, [
        ...args.slice(0, 3),
        'SOCIAL',
        ...args.slice(4, 6),
        'SOCIAL_LABOUR',
        args[7],
      ]);
      client.release();
      expect(h.intakeQueries).toEqual([
        'select * from world_v2.lock_postwar_captain_intake_binding($1,$2::uuid,$3,$4,$5,$6,$7,$8)',
        'select * from world_v2.lock_postwar_captain_intake_binding($1,$2::uuid,$3,$4,$5,$6,$7,$8)',
        'select * from world_v2.lock_finance_budget_intake_binding($1,$2::uuid,$3,$4,$5,$6,$7,$8)',
        'select * from world_v2.lock_social_intake_binding($1,$2::uuid,$3,$4,$5,$6,$7,$8)',
      ]);
    } finally {
      await connection.stop();
    }
  });
  it('delegates all four Captain worker cutoffs on the same shared database without raw authority locks', async () => {
    const h = harness({ captain: true, fx: true }),
      connection = createPostwarFinanceSocialRuntimeConnection(h.input);
    try {
      const database =
        readPostwarFinanceSocialRuntimeBinding(connection).database;
      const params = [
        h.world,
        '11111111-1111-4111-8111-111111111111',
        'COUNTRY_01',
        'CAPTAIN',
        'CAPTAIN_CABINET',
      ];
      await database.query(
        CAPTAIN_RUNTIME_CURRENT_AUTHORIZATION_LOCK_QUERY,
        params.slice(0, 3),
      );
      await database.transaction(async (tx) => {
        await tx.query(
          FINANCE_BUDGET_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY,
          params,
        );
        await tx.query(WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY, params);
        await tx.query(
          WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY,
          params.slice(0, 4),
        );
      });
      const locks = h.queries.filter((sql) =>
        sql.includes('lock_postwar_captain_'),
      );
      expect(locks).toHaveLength(4);
      expect(
        locks.every(
          (sql) =>
            sql.includes('lock_postwar_captain_current_authorization') ||
            sql.includes('lock_postwar_captain_revoked_authorization'),
        ),
      ).toBe(true);
      expect(
        h.queries.some((sql) =>
          /from world_v2.current_commit_authorization/iu.test(sql),
        ),
      ).toBe(false);
    } finally {
      await connection.stop();
    }
  });
  it('ignores caller candidate/facts extras and issues only the fixed native guard', async () => {
    const h = harness(),
      callback = vi.fn(() => {
        throw Error('CALLER_CALLBACK_MUST_NOT_RUN');
      });
    const captain = {
      workerRole: 'worker_captain_shared_protocol',
      mode: 'OFFICIAL_RUNTIME' as const,
      candidateFactory: { prepare: callback },
      facts: callback,
      ready: callback,
    };
    const connection = createPostwarFinanceSocialRuntimeConnection({
      ...h.input,
      captain,
    });
    try {
      const port = readPostwarFinanceSocialRuntimeBinding(connection).captain;
      expect(
        isPostwarCaptainSourceCommitProtectionPort(
          port!.sourceCommitProtectionPort,
        ),
      ).toBe(true);
      expect(port!.factory.prepare).not.toBe(callback);
      expect(callback).not.toHaveBeenCalled();
      expect(h.queries).toEqual([]);
    } finally {
      await connection.stop();
    }
  });
});
