import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AUTHENTICATED_CURRENT_SEAT_SCHEMA,
  AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
} from '@econmind/core';
import type { ManualOfficeCommandRequestDto } from '@econmind/core/authenticated-office-command-contract';
import { buildManualOfficeCommandIntent } from '../../apps/world-worker/dist/intake/postgres-office-command-intake.js';
import { createAuthenticatedCurrentSeatService } from '../../apps/world-api/src/integration/authenticated-current-seat-service.js';
import { createAuthenticatedCommandRecoveryService } from '../../apps/world-api/src/integration/authenticated-command-recovery-service.js';
import { createCurrentSeatFetchHandler } from '../../apps/world-api/src/runtime-preparation/current-seat-fetch-handler.js';
import { createExecutorCommandForwarder } from '../../apps/world-api/src/runtime-preparation/executor-command-forwarder.js';
import { createInternalExecutorCommandHandler } from '../../apps/world-api/src/runtime-preparation/internal-executor-command-handler.js';
import {
  startGFinancialIntakeNativeCluster,
  G_INTAKE_NATIVE_ROLES,
} from '../support/g-financial-intake-native-fixture.js';
import { rows as families } from '../support/g-manual-office-api-test-only-fixture.js';
import {
  readConfig,
  jsonRequest,
  deferred,
} from '../support/G-executor-slices-fixture.js';
const native = process.env.G_NATIVE_EXECUTOR_SLICES === '1';
let cluster: Awaited<ReturnType<typeof startGFinancialIntakeNativeCluster>>;
const requestPools: Pool[] = [];
function ownedPool(source: Pool): Pool {
  const pool = new Pool({ ...source.options });
  requestPools.push(pool);
  return pool;
}
type Fixture = Awaited<ReturnType<typeof cluster.fixture>>;
beforeAll(async () => {
  if (native) cluster = await startGFinancialIntakeNativeCluster();
}, 30000);
afterAll(async () => {
  // Defensive TEST_ONLY cleanup after an assertion failure. Repeated end()
  // rejection from an already ended pool is explicitly consumed.
  await Promise.allSettled(requestPools.splice(0).map((pool) => pool.end()));
  if (cluster) await cluster.close();
}, 30000);
const requestId = '33333333-3333-4333-8333-333333333333';
const seatRequest = {
  schemaVersion: AUTHENTICATED_CURRENT_SEAT_SCHEMA,
  requestId,
};
const scope = (country: string, office: string) =>
  'OFFICE_' +
  Buffer.from(country).toString('hex').toUpperCase() +
  '_' +
  Buffer.from(office).toString('hex').toUpperCase();
async function manual(f: Fixture, index = 0, persist = true) {
  const a = f.original.officeActors.sellerTrade,
    [office, commandType, capability, payload] = families[index]!;
  const subject = a.principal.authSubject,
    country = a.membership.countryId;
  await f.admin.query(
    'insert into world_v2.current_commit_authorization values($1,$2,$3,$4,$5,$6,$7,true,current_timestamp)',
    [
      f.world,
      subject,
      country,
      office,
      capability,
      a.membership.teamId,
      a.membership.authorizationVersion,
    ],
  );
  await f.admin.query(
    'insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision) values($1,$2,$3,$4,$5,$6)',
    [
      f.world,
      subject,
      country,
      office,
      a.membership.teamId,
      a.membership.authorizationVersion,
    ],
  );
  await f.admin.query(
    "insert into world_v2.projection_entitlement values($1,$2,'OFFICE_PRIVATE',$3,$4,true,current_timestamp,null)",
    [
      f.world,
      subject,
      scope(country, office),
      a.membership.authorizationVersion,
    ],
  );
  await f.admin.query(
    "insert into world_v2.read_projection values($1,'OFFICE_PRIVATE',$2,'world-projection-read-v1',0,0,'{}',current_timestamp)",
    [f.world, scope(country, office)],
  );
  await f.admin.query(
    'grant select on world_v2.command_receipt,world_v2.command_queue to ' +
      G_INTAKE_NATIVE_ROLES.reader,
  );
  const request: ManualOfficeCommandRequestDto = {
    worldId: f.world,
    countryId: country,
    officeId: office,
    commandType,
    commandId: 'COMMAND_G_TEST_ONLY_MANUAL_' + index,
    idempotencyKey: 'KEY_G_TEST_ONLY_MANUAL_' + index,
    expectedWorldVersion: '0',
    payload,
  };
  const original = buildManualOfficeCommandIntent({
    request,
    countryId: country,
    officeId: office,
    authSubject: subject,
    actor: a.actorId,
    simTime: '10000',
    submittedAtReal: '2026-10-08T00:00:00.000Z',
    correlationId: 'CORRELATION_G_TEST_ONLY_MANUAL',
  });
  const insert = async (database: Pick<Pool, 'query'> = f.admin) => {
    await database.query(
      `insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        original.worldId,
        original.commandId,
        original.idempotencyKey,
        original.commandType,
        original.schemaVersion,
        original.canonicalPayload,
        original.payloadHash,
        original.fingerprint,
        original.authSubject,
        original.actorId,
        original.countryId,
        original.officeId,
        original.expectedWorldVersion,
        original.simTime.toCanonicalValue(),
        original.correlationId,
        original.submittedAtReal,
      ],
    );
    await database.query(
      "insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time) values($1,$2,'DISCRETIONARY_USER',10000)",
      [f.world, original.commandId],
    );
  };
  if (persist) await insert();
  const envelope = {
    schemaVersion: 'world-authenticated-office-command-v1' as const,
    requestId,
    request,
  };
  const recovery = {
    schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
    requestId,
    request: {
      worldId: f.world,
      commandId: request.commandId,
      idempotencyKey: request.idempotencyKey,
      originalRequest: envelope,
      knownCommandFingerprint: original.fingerprint,
    },
  };
  return { request, original, recovery, insert, subject };
}
function audited(f: Fixture) {
  const statements: string[] = [],
    snapshots: string[] = [],
    readOnly: string[] = [],
    isolation: string[] = [];
  let connections = 0;
  const pool = {
    async connect() {
      connections++;
      const client = await f.reader.connect();
      return {
        release: (destroy?: boolean) => client.release(destroy),
        query: async (sql: string, values?: unknown[]) => {
          statements.push(sql);
          const r = await client.query(sql, values);
          if (sql.startsWith('begin')) {
            readOnly.push(
              (await client.query('show transaction_read_only')).rows[0]
                .transaction_read_only,
            );
            isolation.push(
              (await client.query('show transaction_isolation')).rows[0]
                .transaction_isolation,
            );
          }
          if (
            /^select (?:distinct|seed\.|seat\.|admission\.|world_id|receipt\.|queue_state)/u.test(
              sql.trim(),
            )
          )
            snapshots.push(
              (
                await client.query(
                  'select txid_current_snapshot()::text as snapshot',
                )
              ).rows[0].snapshot,
            );
          return r;
        },
      };
    },
  } as unknown as Pick<Pool, 'connect'>;
  return {
    config: { ...readConfig(f.config), pool },
    statements,
    snapshots,
    readOnly,
    isolation,
    connections: () => connections,
  };
}
const seat = (f: Fixture, config = readConfig(f.config)) =>
  createAuthenticatedCurrentSeatService(config).handle({
    authorization: 'Bearer ' + f.token('sellerTrade'),
    request: seatRequest,
  });
const recover = (
  f: Fixture,
  r: unknown,
  config = readConfig(f.config),
  token = f.token('sellerTrade'),
) =>
  createAuthenticatedCommandRecoveryService(config).handle({
    authorization: 'Bearer ' + token,
    request: r,
  });
async function footprint(f: Fixture) {
  return (
    await f.admin.query(`select
    (select count(*)::text from world_v2.command_submission) submissions,
    (select count(*)::text from world_v2.command_queue) queued,
    (select count(*)::text from world_v2.command_receipt) receipts,
    (select count(*)::text from world_v2.authoritative_event) events,
    (select sum(attempt_count)::text from world_v2.command_queue) attempts,
    (select jsonb_agg(row_to_json(q)) from world_v2.command_queue q) queue_rows`)
  ).rows[0];
}
describe.skipIf(!native)(
  'G slices2 owned native PG16 restricted subject READ ONLY',
  () => {
    it('returns ALL coherent Offices with one real repeatable READ ONLY snapshot and no writes/consume', async () => {
      const f = await cluster.fixture();
      await manual(f);
      const audit = audited(f),
        before = await footprint(f),
        r = await seat(f, audit.config);
      expect(r.httpStatus).toBe(200);
      expect(r.body).toMatchObject({
        ok: true,
        session: {
          authSubjectId:
            f.original.officeActors.sellerTrade.principal.authSubject,
        },
        world: f.config.admittedWorldPins,
      });
      if (!r.body.ok) throw new Error('TEST_ONLY_NO_SEAT');
      expect(r.body.bindings.map((b) => b.identity.officeId).sort()).toEqual([
        'CAPTAIN',
        'TRADE',
      ]);
      expect(audit.connections()).toBe(1);
      expect(audit.readOnly).toEqual(['on']);
      expect(audit.isolation).toEqual(['repeatable read']);
      expect(audit.snapshots.length).toBeGreaterThan(5);
      expect(new Set(audit.snapshots).size).toBe(1);
      expect(
        audit.statements.filter((s) => s.startsWith('begin')),
      ).toHaveLength(1);
      expect(
        audit.statements.some((s) =>
          /^\s*(?:insert|update|delete|grant|alter|truncate)\b/iu.test(s),
        ),
      ).toBe(false);
      expect(await footprint(f)).toEqual(before);
      await expect(
        f.reader.query(
          'insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time) values($1,$2,$3,0)',
          [f.world, 'FORBIDDEN', 'DISCRETIONARY_USER'],
        ),
      ).rejects.toMatchObject({ code: '42501' });
      const fetchHandler = createCurrentSeatFetchHandler(readConfig(f.config));
      const http = await fetchHandler(
        jsonRequest('/v1/current-seat', seatRequest, f.token('sellerTrade')),
      );
      expect(http?.status).toBe(200);
      expect(http?.headers.get('cache-control')).toBe('private, no-store');
      const selector = await fetchHandler(
        jsonRequest(
          '/v1/current-seat',
          { ...seatRequest, officeId: 'CAPTAIN' },
          f.token('sellerTrade'),
        ),
      );
      expect(selector?.status).toBe(400);
    });
    it.each(['country', 'team', 'revision'] as const)(
      'enumerates conflicting %s before joins can hide it',
      async (kind) => {
        const f = await cluster.fixture(),
          a = f.original.officeActors.sellerTrade;
        await f.admin.query(
          'insert into world_v2.current_commit_authorization values($1,$2,$3,$4,$5,$6,$7,true,current_timestamp)',
          [
            f.world,
            a.principal.authSubject,
            kind === 'country' ? 'COUNTRY_CONFLICT' : a.membership.countryId,
            'CAPTAIN',
            'CAPTAIN_CABINET',
            kind === 'team' ? 'TEAM_CONFLICT' : a.membership.teamId,
            kind === 'revision'
              ? 'AUTH_CONFLICT'
              : a.membership.authorizationVersion,
          ],
        );
        const r = await seat(f);
        expect(r.httpStatus).toBe(409);
        expect(r.body).toMatchObject({
          error: { code: 'CURRENT_AUTHORIZATION_NOT_COHERENT' },
        });
      },
    );
    it('multiple capabilities on the identical Office assignment yield one unique binding', async () => {
      const f = await cluster.fixture(),
        a = f.original.officeActors.sellerTrade;
      await f.admin.query(
        "insert into world_v2.current_commit_authorization values($1,$2,$3,'TRADE','CAPTAIN_CABINET',$4,$5,true,current_timestamp)",
        [
          f.world,
          a.principal.authSubject,
          a.membership.countryId,
          a.membership.teamId,
          a.membership.authorizationVersion,
        ],
      );
      const r = await seat(f);
      expect(r.httpStatus).toBe(200);
      if (!r.body.ok) throw new Error('TEST_ONLY_NO_SEAT');
      expect(r.body.bindings.map((b) => b.identity.officeId)).toEqual([
        'TRADE',
      ]);
    });
    it.each([
      'no-admission',
      'missing-seat',
      'missing-entitlement',
      'stale-projection',
      'revoked',
      'wrong-model',
      'wrong-pin',
    ] as const)('fails closed on %s', async (kind) => {
      const f = await cluster.fixture(kind !== 'no-admission'),
        m = await manual(f),
        config = readConfig(f.config);
      if (kind === 'missing-seat')
        await f.admin.query(
          "insert into world_v2.current_commit_authorization values($1,$2,$3,'SOCIAL','SOCIAL_LABOUR',$4,$5,true,current_timestamp)",
          [
            f.world,
            m.subject,
            m.request.countryId,
            f.original.officeActors.sellerTrade.membership.teamId,
            f.original.officeActors.sellerTrade.membership.authorizationVersion,
          ],
        );
      if (kind === 'missing-entitlement')
        await f.admin.query(
          'update world_v2.projection_entitlement set active=false,revoked_at=current_timestamp where world_id=$1 and scope_key=$2',
          [f.world, scope(m.request.countryId, 'CAPTAIN')],
        );
      if (kind === 'stale-projection')
        await f.admin.query(
          'update world_v2.world_head set world_version=1,event_sequence=1 where world_id=$1',
          [f.world],
        );
      if (kind === 'revoked')
        await f.admin.query(
          'update world_v2.current_commit_authorization set active=false where world_id=$1 and auth_subject=$2',
          [f.world, m.subject],
        );
      const changed =
        kind === 'wrong-pin'
          ? {
              ...config,
              admittedWorldPins: {
                ...config.admittedWorldPins,
                admissionRef: 'WRONG',
              },
            }
          : kind === 'wrong-model'
            ? { ...config, modelVersion: 'WRONG' as typeof config.modelVersion }
            : config;
      expect((await seat(f, changed)).body.ok).toBe(false);
      expect((await recover(f, m.recovery, changed)).body.ok).toBe(false);
    });
    it.each([0, 1, 2])(
      'manual family%d preserves original actor/time/intent fingerprint, actual queue and FINAL only',
      async (index) => {
        const f = await cluster.fixture(),
          m = await manual(f, index),
          audit = audited(f),
          before = await footprint(f);
        const pending = await recover(f, m.recovery, audit.config);
        expect(pending.httpStatus).toBe(200);
        expect(pending.body).toMatchObject({
          ok: true,
          state: {
            status: 'QUEUED',
            commandType: m.request.commandType,
            commandFingerprint: m.original.fingerprint,
          },
        });
        expect(audit.connections()).toBe(1);
        expect(audit.readOnly).toEqual(['on']);
        expect(new Set(audit.snapshots).size).toBe(1);
        expect(await footprint(f)).toEqual(before);
        const lease = (
          await f.admin.query(
            "select * from world_v2.acquire_world_writer_lease($1,'WORKER_TEST_ONLY',current_timestamp,60000)",
            [f.world],
          )
        ).rows[0];
        await f.admin.query(
          "update world_v2.command_queue set queue_state='CLAIMED',claimed_by='WORKER_TEST_ONLY',claimed_at_real=current_timestamp,claim_fencing_token=$3 where world_id=$1 and command_id=$2",
          [f.world, m.request.commandId, lease.fencing_token],
        );
        expect((await recover(f, m.recovery)).body).toMatchObject({
          ok: true,
          state: { status: 'CLAIMED' },
        });
        await f.admin.query(
          "insert into world_v2.command_receipt(world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,reason_code,sim_time,recorded_at_real) values($1,$2,$3,'command-receipt-v2',$4,'REJECTED','TEST_ONLY_REJECTION',10000,current_timestamp)",
          [
            f.world,
            m.request.commandId,
            m.request.idempotencyKey,
            m.original.fingerprint,
          ],
        );
        // Receipt without corresponding durable final queue state is not a result.
        expect((await recover(f, m.recovery)).httpStatus).toBe(503);
        await f.admin.query(
          "update world_v2.command_queue set queue_state='FINALIZED',finalized_at_real=current_timestamp where world_id=$1 and command_id=$2",
          [f.world, m.request.commandId],
        );
        const final = await recover(f, m.recovery);
        expect(final.httpStatus).toBe(200);
        expect(final.body).toMatchObject({
          ok: true,
          state: {
            status: 'FINAL',
            commandType: m.request.commandType,
            receipt: {
              source: 'DURABLE_FINAL_COMMAND_RECEIPT',
              outcome: 'REJECTED',
              commandFingerprint: m.original.fingerprint,
              simTime: '10000',
            },
          },
        });
      },
    );
    it('wrong subject/doublekey/known fingerprint/original intent conflicts never substitute a receipt', async () => {
      const f = await cluster.fixture(),
        m = await manual(f),
        before = await footprint(f);
      const wrongSubject = await recover(
        f,
        m.recovery,
        readConfig(f.config),
        f.token('buyerTrade'),
      );
      expect(wrongSubject.body.ok).toBe(false);
      for (const changed of [
        {
          ...m.recovery,
          request: {
            ...m.recovery.request,
            knownCommandFingerprint: 'sha256:' + 'a'.repeat(64),
          },
        },
        {
          ...m.recovery,
          request: {
            ...m.recovery.request,
            idempotencyKey: 'KEY_OTHER',
            originalRequest: {
              ...m.recovery.request.originalRequest,
              request: { ...m.request, idempotencyKey: 'KEY_OTHER' },
            },
          },
        },
        {
          ...m.recovery,
          request: {
            ...m.recovery.request,
            originalRequest: {
              ...m.recovery.request.originalRequest,
              request: { ...m.request, expectedWorldVersion: '1' },
            },
          },
        },
      ])
        expect((await recover(f, changed)).httpStatus).toBe(409);
      expect(await footprint(f)).toEqual(before);
    });
    it('NOT_FOUND while an original submission is still invisible does not consume or create anything; later recovery sees it', async () => {
      const f = await cluster.fixture(),
        m = await manual(f, 0, false);
      const transaction = await f.admin.connect();
      await transaction.query('begin');
      await m.insert(transaction);
      const first = await recover(f, m.recovery);
      expect(first.httpStatus).toBe(404);
      expect(first.body).toMatchObject({
        error: { code: 'NOT_FOUND', retryable: false },
      });
      expect((await footprint(f)).submissions).toBe('0');
      await transaction.query('commit');
      transaction.release();
      expect((await recover(f, m.recovery)).body).toMatchObject({
        ok: true,
        state: { status: 'QUEUED' },
      });
      expect((await footprint(f)).submissions).toBe('1');
      expect((await footprint(f)).events).toBe('0');
    });
    it.each(['command_queue', 'command_receipt'] as const)(
      'missing reader permission on %s stays NOT_CONNECTED; it never borrows a writer or grants access',
      async (table) => {
        const f = await cluster.fixture(),
          m = await manual(f);
        await f.admin.query(
          'revoke select on world_v2.' +
            table +
            ' from ' +
            G_INTAKE_NATIVE_ROLES.reader,
        );
        const r = await recover(f, m.recovery);
        expect(r.httpStatus).toBe(503);
        expect(r.body).toMatchObject({ error: { code: 'NOT_CONNECTED' } });
        expect(
          (
            await f.admin.query(
              'select has_table_privilege($1,$2,$3) as allowed',
              [G_INTAKE_NATIVE_ROLES.reader, 'world_v2.' + table, 'SELECT'],
            )
          ).rows[0].allowed,
        ).toBe(false);
      },
    );
    it('real financial REGISTER crosses both handlers with native per-request Pool.end and preserves actual UNKNOWN', async () => {
      const f = await cluster.fixture();
      const ownedRead = ownedPool(f.reader),
        ownedWriter = ownedPool(f.writer);
      const financial = {
        ...f.config,
        readPool: ownedRead,
        writerPool: ownedWriter,
      };
      Object.freeze(financial.clock);
      const read = readConfig(financial);
      const internal = createInternalExecutorCommandHandler({
        read,
        office: null,
        financial,
        ownedPools: [ownedRead, ownedWriter],
      });
      const forward = createExecutorCommandForwarder({
        ...read,
        executor: { fetch: internal },
      });
      const registered = await forward(
        jsonRequest(
          '/v1/financial-intake',
          f.envelope(f.staged('REGISTER', 'sellerTrade', { intent: f.intent })),
          f.token('sellerTrade'),
        ),
      );
      expect(registered?.status).toBe(200);
      expect(await registered?.json()).toMatchObject({
        ok: true,
        state: { status: 'PENDING_APPROVAL_OR_ENQUEUE' },
      });
      expect(ownedRead.totalCount).toBe(0);
      expect(ownedWriter.totalCount).toBe(0);
      await expect(ownedRead.connect()).rejects.toThrow(
        'Cannot use a pool after calling end',
      );
      const unknown = {
        schemaVersion: 'world-authenticated-financial-intake-v1',
        requestId,
        ok: false,
        state: {
          status: 'UNKNOWN',
          action: 'REGISTER',
          worldId: f.world,
          commandId: 'COMMAND_G_TEST_ONLY',
          idempotencyKey: 'KEY_G_TEST_ONLY',
          retryable: true,
        },
      };
      const relayed = createExecutorCommandForwarder({
        ...read,
        executor: {
          fetch: async () =>
            new Response(JSON.stringify(unknown), {
              status: 503,
              headers: { 'content-type': 'application/json' },
            }),
        },
      });
      expect(
        await (
          await relayed(
            jsonRequest(
              '/v1/financial-intake',
              f.envelope(
                f.staged('REGISTER', 'sellerTrade', { intent: f.intent }),
              ),
              f.token('sellerTrade'),
            ),
          )
        )?.json(),
      ).toEqual(unknown);
      expect((await footprint(f)).submissions).toBe('1');
      expect((await footprint(f)).events).toBe('0');
    });
    it('actual native financial commit acknowledgement loss stays original UNKNOWN even if Pool.end reports failure', async () => {
      const f = await cluster.fixture(),
        reader = ownedPool(f.reader),
        actualWriter = ownedPool(f.writer);
      let lost = false,
        committed = 0,
        ended = false;
      const writer = {
        async connect() {
          const client = await actualWriter.connect();
          let wrote = false;
          return {
            release: (destroy?: boolean) => client.release(destroy),
            query: async (sql: string, values?: unknown[]) => {
              const r = await client.query(sql, values);
              if (
                sql
                  .trimStart()
                  .startsWith('insert into world_v2.command_submission')
              )
                wrote = true;
              if (sql === 'commit' && (wrote || lost)) {
                if (wrote) committed++;
                lost = true;
                throw new Error('TEST_ONLY_COMMIT_ACK_LOSS');
              }
              return r;
            },
          };
        },
        async end() {
          await actualWriter.end();
          ended = true;
          throw new Error('TEST_ONLY_END_ACK_FAILURE');
        },
      } as unknown as Pool;
      const financial = { ...f.config, readPool: reader, writerPool: writer };
      Object.freeze(financial.clock);
      const read = readConfig(financial),
        internal = createInternalExecutorCommandHandler({
          read,
          office: null,
          financial,
          ownedPools: [reader, writer],
        });
      let originalReply: unknown;
      const forward = createExecutorCommandForwarder({
        ...read,
        executor: {
          fetch: async (request) => {
            const response = await internal(request);
            originalReply = await response.clone().json();
            return response;
          },
        },
      });
      const response = await forward(
        jsonRequest(
          '/v1/financial-intake',
          f.envelope(f.staged('REGISTER', 'sellerTrade', { intent: f.intent })),
          f.token('sellerTrade'),
        ),
      );
      const body = await response?.json();
      expect(body).toEqual(originalReply);
      expect(body).toMatchObject({
        state: {
          status: 'UNKNOWN',
          worldId: f.world,
          commandId: 'COMMAND_G_TEST_ONLY',
          idempotencyKey: 'KEY_G_TEST_ONLY',
          retryable: true,
        },
      });
      expect(committed).toBe(1);
      expect(ended).toBe(true);
      expect(reader.totalCount).toBe(0);
      expect(actualWriter.totalCount).toBe(0);
      expect((await footprint(f)).submissions).toBe('1');
      expect((await footprint(f)).events).toBe('0');
    });
    it('native pg_sleep cancellation observes real query rejection and closed client before request pool shutdown', async () => {
      const f = await cluster.fixture(),
        m = await manual(f),
        reader = ownedPool(f.reader),
        entered = deferred(),
        abort = new AbortController();
      const connect = reader.connect.bind(reader);
      let rejected = false,
        closed = false,
        ended = false;
      Object.defineProperty(reader, 'connect', {
        value: async () => {
          const client = await connect(),
            query = client.query.bind(client);
          client.once('end', () => {
            closed = true;
          });
          Object.defineProperty(client, 'query', {
            value: async (sql: string, values?: unknown[]) => {
              if (sql.startsWith('select distinct')) {
                entered.resolve();
                try {
                  await query('select pg_sleep(0.2)');
                } catch (error) {
                  rejected = true;
                  throw error;
                }
              }
              return query(sql, values);
            },
          });
          return client;
        },
      });
      const end = reader.end.bind(reader);
      Object.defineProperty(reader, 'end', {
        value: async () => {
          await end();
          ended = true;
        },
      });
      const read = { ...readConfig(f.config), pool: reader };
      const internal = createInternalExecutorCommandHandler({
        read,
        office: null,
        financial: null,
        ownedPools: [reader],
      });
      const forward = createExecutorCommandForwarder({
        ...read,
        executor: { fetch: internal },
      });
      const operation = forward(
        jsonRequest(
          '/v1/command-recovery',
          m.recovery,
          f.token('sellerTrade'),
          abort.signal,
        ),
      );
      await entered.promise;
      abort.abort();
      const response = await operation;
      expect(response?.status).toBe(499);
      expect(rejected).toBe(true);
      expect(closed).toBe(true);
      expect(ended).toBe(true);
      expect(reader.totalCount).toBe(0);
      expect((await footprint(f)).submissions).toBe('1');
      expect((await footprint(f)).events).toBe('0');
    });
  },
);
