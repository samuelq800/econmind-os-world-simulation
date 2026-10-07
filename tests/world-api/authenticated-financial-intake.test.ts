import { createServer } from 'node:http';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import {
  AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
  FINANCIAL_INTAKE_OFFICE_ACTIONS,
  type AuthenticatedFinancialIntakeRequestDto,
  type AuthenticatedFinancialIntakeResponseDto,
} from '@econmind/core';
import { createAuthenticatedFinancialIntakeComposition } from '../../apps/world-api/src/integration/authenticated-financial-intake-composition.js';
import { createHttpsAuthenticatedFinancialIntakeRoute } from '../../apps/world-api/src/integration/https-authenticated-financial-intake-route.js';
import { startGFinancialIntakeNativeCluster } from '../support/g-financial-intake-native-fixture.js';
const enabled = process.env.G_NATIVE_FINANCIAL_INTAKE === '1';
let cluster: Awaited<ReturnType<typeof startGFinancialIntakeNativeCluster>>;
beforeAll(async () => {
  if (enabled) cluster = await startGFinancialIntakeNativeCluster();
}, 30000);
afterAll(async () => {
  if (cluster) await cluster.close();
}, 30000);
const state = (r: { body: { state?: unknown } }) =>
  r.body.state as Record<string, unknown>;
async function prepare(f: Awaited<ReturnType<typeof cluster.fixture>>) {
  const register = await f.call(
    f.staged('REGISTER', 'sellerTrade', { intent: f.intent }),
  );
  expect(register.body.ok).toBe(true);
  expect(state(register).status).toBe('PENDING_APPROVAL_OR_ENQUEUE');
  const inspect = await f.call(f.staged('INSPECT'));
  const fingerprint = state(inspect).commandFingerprint as string;
  return fingerprint;
}

describe('public production-safe financial intake contract', () => {
  it('only advertises existing staged Trade/Finance families without granting authority', () => {
    expect(
      Object.entries(FINANCIAL_INTAKE_OFFICE_ACTIONS)
        .filter(([, a]) => a.length > 0)
        .map(([office]) => office),
    ).toEqual(['FINANCE', 'TRADE']);
    expect(AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA).toBe(
      'world-authenticated-financial-intake-v1',
    );
    expect(Object.isFrozen(FINANCIAL_INTAKE_OFFICE_ACTIONS.TRADE)).toBe(true);
  });
  it('missing actual bindings/clock/actor providers stays NOT_CONNECTED', async () => {
    expect(
      await createAuthenticatedFinancialIntakeComposition().handle({
        authorization: 'Bearer never',
        request: {},
      }),
    ).toMatchObject({
      httpStatus: 503,
      body: { ok: false, error: { code: 'NOT_CONNECTED' } },
    });
  });
});
describe.skipIf(!enabled)(
  'TEST_ONLY real JWT + actual guarded native SQL intake and approvals',
  () => {
    it('registers exact immutable pending command, records three distinct Office signatures, queues once, never settles', async () => {
      const f = await cluster.fixture();
      const fingerprint = await prepare(f);
      for (const [action, seat] of [
        ['SIGN_SELLER', 'sellerTrade'],
        ['SIGN_BUYER_TRADE', 'buyerTrade'],
        ['SIGN_BUYER_FINANCE', 'buyerFinance'],
      ] as const) {
        const r = await f.call(
          f.staged(action, seat, { commandFingerprint: fingerprint }),
          seat,
        );
        expect(r.body.ok).toBe(true);
        expect(state(r).status).toBe('SIGNATURE_RECORDED');
      }
      const bound = await f.call(
        f.staged('BIND_REFERENCE', 'buyerFinance', {
          commandFingerprint: fingerprint,
        }),
        'buyerFinance',
      );
      expect(bound.body.ok).toBe(true);
      const enqueue = f.staged('ENQUEUE', 'sellerTrade', {
        commandFingerprint: fingerprint,
        approvalRef: state(bound).approvalRef,
      });
      expect(state(await f.call(enqueue)).status).toBe('QUEUED');
      expect(state(await f.call(enqueue)).status).toBe('QUEUED');
      expect(
        state(
          await f.call(
            f.staged('REGISTER', 'sellerTrade', { intent: f.intent }),
          ),
        ).status,
      ).toBe('QUEUED');
      expect(
        (
          await f.admin.query(
            'select office_id,country_id from world_v2.narrow_transfer_approval_signature order by country_id,office_id',
          )
        ).rows,
      ).toHaveLength(3);
      expect(
        (
          await f.admin.query(
            'select count(*)::text as n from world_v2.command_queue',
          )
        ).rows[0].n,
      ).toBe('1');
      expect(
        (
          await f.admin.query(
            'select world_version::text,event_sequence::text from world_v2.world_head',
          )
        ).rows[0],
      ).toEqual({ world_version: '0', event_sequence: '0' });
      for (const table of [
        'authoritative_event',
        'financial_posting_batch',
        'inventory_posting',
        'command_receipt',
      ])
        expect(
          (
            await f.admin.query(
              `select count(*)::text as n from world_v2.${table}`,
            )
          ).rows[0].n,
        ).toBe('0');
      expect(
        (
          await f.admin.query(
            'select canonical_payload,command_fingerprint from world_v2.command_submission',
          )
        ).rows[0],
      ).toMatchObject({ command_fingerprint: fingerprint });
    });
    it('refuses enqueue before approvals and ignores client-approved flags or wrong Office actions', async () => {
      const f = await cluster.fixture();
      const fingerprint = await prepare(f);
      expect(
        (
          await f.call(
            f.staged('ENQUEUE', 'sellerTrade', {
              commandFingerprint: fingerprint,
              approvalRef: 'APPROVAL_FAKE',
            }),
          )
        ).body.ok,
      ).toBe(false);
      expect(
        await f.call({
          ...f.staged('SIGN_SELLER', 'sellerTrade', {
            commandFingerprint: fingerprint,
          }),
          approved: true,
        }),
      ).toMatchObject({
        httpStatus: 400,
        body: { error: { code: 'PROTOCOL_ERROR' } },
      });
      expect(
        await f.call(
          f.staged('SIGN_BUYER_FINANCE', 'sellerTrade', {
            commandFingerprint: fingerprint,
          }),
        ),
      ).toMatchObject({
        httpStatus: 403,
        body: { error: { code: 'OFFICE_ACTION_UNSUPPORTED' } },
      });
      for (const officeId of ['CAPTAIN', 'CENTRAL_BANK', 'INDUSTRY', 'SOCIAL'])
        expect(
          await f.call({
            ...f.staged('REGISTER', 'sellerTrade', { intent: f.intent }),
            officeId,
          }),
        ).toMatchObject({
          httpStatus: 400,
          body: { error: { code: 'OFFICE_COMMAND_FAMILY_UNSUPPORTED' } },
        });
      expect(
        (
          await f.admin.query(
            'select count(*)::text as n from world_v2.command_queue',
          )
        ).rows[0].n,
      ).toBe('0');
    });
    it('requires current verified seat/admission and pinned World/seed; token and URL never grant Office', async () => {
      const f = await cluster.fixture(false);
      expect(
        await f.call(f.staged('REGISTER', 'sellerTrade', { intent: f.intent })),
      ).toMatchObject({
        httpStatus: 403,
        body: { error: { code: 'CURRENT_SEAT_OR_ADMISSION_REQUIRED' } },
      });
      const g = await cluster.fixture();
      expect(
        await g.composition.handle({
          authorization: `Bearer ${g.token('sellerTrade', true)}`,
          request: g.envelope(
            g.staged('REGISTER', 'sellerTrade', { intent: g.intent }),
          ),
        }),
      ).toMatchObject({
        httpStatus: 401,
        body: { error: { code: 'AUTHENTICATION_INVALID' } },
      });
      expect(
        await g.call({
          ...g.staged('REGISTER', 'sellerTrade', { intent: g.intent }),
          worldId: 'WORLD_WRONG',
        }),
      ).toMatchObject({
        httpStatus: 403,
        body: { error: { code: 'WORLD_BINDING_MISMATCH' } },
      });
      expect(
        (
          await g.call(
            g.staged('REGISTER', 'sellerTrade', { intent: g.intent }),
            'buyerTrade',
          )
        ).body.ok,
      ).toBe(false);
      await g.admin.query(
        'update world_v2.current_commit_authorization set active=false',
      );
      expect(
        (
          await g.call(
            g.staged('REGISTER', 'sellerTrade', { intent: g.intent }),
          )
        ).body.ok,
      ).toBe(false);
      expect(
        (
          await g.admin.query(
            'select count(*)::text as n from world_v2.command_submission',
          )
        ).rows[0].n,
      ).toBe('0');
    });
    it('enforces exact identity/fingerprint/idempotency and first-intake head under existing Worker port', async () => {
      const f = await cluster.fixture();
      await prepare(f);
      expect(
        await f.call(
          f.staged('REGISTER', 'sellerTrade', {
            intent: {
              ...f.intent,
              quantity: { ...f.intent.quantity, amount: '1' },
            },
          }),
        ),
      ).toMatchObject({
        httpStatus: 409,
        body: { error: { code: 'IDEMPOTENCY_CONFLICT' } },
      });
      const g = await cluster.fixture();
      await g.admin.query('update world_v2.world_head set world_version=1');
      expect(
        await g.call(g.staged('REGISTER', 'sellerTrade', { intent: g.intent })),
      ).toMatchObject({
        httpStatus: 409,
        body: { error: { code: 'VERSION_MISMATCH' } },
      });
      g.actorMapping.present = false;
      expect(
        (
          await g.call(
            g.staged('REGISTER', 'sellerTrade', {
              intent: { ...g.intent, expectedWorldVersion: '1' },
            }),
          )
        ).body.ok,
      ).toBe(false);
      expect(
        (
          await g.admin.query(
            'select count(*)::text as n from world_v2.command_submission',
          )
        ).rows[0].n,
      ).toBe('0');
    });
    it('rolls back a submission if current revision changes before transaction-end guard', async () => {
      const f = await cluster.fixture();
      let inserted = false;
      const wrapped = {
        async connect() {
          const client = await f.writer.connect();
          return {
            query: async (sql: string, values?: unknown[]) => {
              if (inserted && sql.endsWith(' for share of authz')) {
                await client.query(
                  'update world_v2.current_commit_authorization set active=false where auth_subject=$1',
                  [f.original.officeActors.sellerTrade.principal.authSubject],
                );
              }
              const r = await client.query(sql, values);
              if (sql.startsWith('insert into world_v2.command_submission'))
                inserted = true;
              return r;
            },
            release: (destroy?: boolean) => client.release(destroy),
          };
        },
      } as unknown as Pick<Pool, 'connect'>;
      const composition = createAuthenticatedFinancialIntakeComposition({
        ...f.config,
        writerPool: wrapped,
      });
      const r = await composition.handle({
        authorization: `Bearer ${f.token('sellerTrade')}`,
        request: f.envelope(
          f.staged('REGISTER', 'sellerTrade', { intent: f.intent }),
        ),
      });
      expect(inserted).toBe(true);
      expect(r).toMatchObject({
        httpStatus: 403,
        body: { error: { code: 'AUTHORIZATION_DENIED' } },
      });
      expect(
        (
          await f.admin.query(
            'select count(*)::text as n from world_v2.command_submission',
          )
        ).rows[0].n,
      ).toBe('0');
      expect(
        (
          await f.admin.query(
            'select active from world_v2.current_commit_authorization where auth_subject=$1',
            [f.original.officeActors.sellerTrade.principal.authSubject],
          )
        ).rows[0].active,
      ).toBe(true);
    });
    it.each([
      ['SIGN_SELLER', 'sellerTrade', 'narrow_transfer_approval_signature'],
      ['BIND_REFERENCE', 'buyerFinance', 'narrow_transfer_approval_reference'],
      ['ENQUEUE', 'sellerTrade', 'command_queue'],
    ] as const)(
      'rolls back %s durable write on transaction-tail authorization change',
      async (action, seat, table) => {
        const f = await cluster.fixture();
        const fingerprint = await prepare(f);
        let approvalRef: unknown;
        if (action !== 'SIGN_SELLER') {
          for (const [a, s] of [
            ['SIGN_SELLER', 'sellerTrade'],
            ['SIGN_BUYER_TRADE', 'buyerTrade'],
            ['SIGN_BUYER_FINANCE', 'buyerFinance'],
          ] as const)
            expect(
              (
                await f.call(
                  f.staged(a, s, { commandFingerprint: fingerprint }),
                  s,
                )
              ).body.ok,
            ).toBe(true);
          if (action === 'ENQUEUE')
            approvalRef = state(
              await f.call(
                f.staged('BIND_REFERENCE', 'buyerFinance', {
                  commandFingerprint: fingerprint,
                }),
                'buyerFinance',
              ),
            ).approvalRef;
        }
        let inserted = false;
        const wrapped = {
          async connect() {
            const client = await f.writer.connect();
            return {
              query: async (sql: string, values?: unknown[]) => {
                if (inserted && sql.endsWith(' for share of authz')) {
                  await client.query(
                    'update world_v2.current_commit_authorization set active=false where auth_subject=$1',
                    [f.original.officeActors[seat].principal.authSubject],
                  );
                }
                const r = await client.query(sql, values);
                if (sql.startsWith(`insert into world_v2.${table}`))
                  inserted = true;
                return r;
              },
              release: (destroy?: boolean) => client.release(destroy),
            };
          },
        } as unknown as Pick<Pool, 'connect'>;
        const r = await createAuthenticatedFinancialIntakeComposition({
          ...f.config,
          writerPool: wrapped,
        }).handle({
          authorization: `Bearer ${f.token(seat)}`,
          request: f.envelope(
            f.staged(action, seat, {
              commandFingerprint: fingerprint,
              ...(approvalRef ? { approvalRef } : {}),
            }),
          ),
        });
        expect(inserted).toBe(true);
        expect(r).toMatchObject({
          httpStatus: 403,
          body: { ok: false, error: { code: 'AUTHORIZATION_DENIED' } },
        });
        expect(
          (
            await f.admin.query(
              `select count(*)::text as n from world_v2.${table}`,
            )
          ).rows[0].n,
        ).toBe('0');
        expect(
          (
            await f.admin.query(
              'select count(*)::text as n from world_v2.command_submission',
            )
          ).rows[0].n,
        ).toBe('1');
        expect(
          (
            await f.admin.query(
              'select bool_and(active) as active from world_v2.current_commit_authorization',
            )
          ).rows[0].active,
        ).toBe(true);
        if (action === 'SIGN_SELLER')
          expect(
            (
              await f.admin.query(
                'select count(*)::text as n from world_v2.narrow_transfer_proposal',
              )
            ).rows[0].n,
          ).toBe('0');
      },
    );
    it('preserves UNKNOWN after acknowledgement loss and unavailable recovery, exact retry reads once, never fabricates FINAL', async () => {
      const f = await cluster.fixture();
      let lost = false,
        inserted = false;
      const wrapped = {
        async connect() {
          if (lost) throw new Error('TEST_ONLY_RECOVERY_UNAVAILABLE');
          const client = await f.writer.connect();
          return {
            query: async (sql: string, values?: unknown[]) => {
              const r = await client.query(sql, values);
              if (sql.startsWith('insert into world_v2.command_submission'))
                inserted = true;
              if (sql === 'commit' && inserted && !lost) {
                lost = true;
                throw new Error('TEST_ONLY_ACKNOWLEDGEMENT_LOST');
              }
              return r;
            },
            release: (destroy?: boolean) => client.release(destroy),
          };
        },
      } as unknown as Pick<Pool, 'connect'>;
      const composition = createAuthenticatedFinancialIntakeComposition({
        ...f.config,
        writerPool: wrapped,
      });
      const request = f.staged('REGISTER', 'sellerTrade', { intent: f.intent });
      const r = await composition.handle({
        authorization: `Bearer ${f.token('sellerTrade')}`,
        request: f.envelope(request),
      });
      expect(lost).toBe(true);
      expect(state(r).status).toBe('UNKNOWN');
      expect(state(r).status).not.toBe('FINAL');
      expect(state(await f.call(request)).status).toBe(
        'PENDING_APPROVAL_OR_ENQUEUE',
      );
      expect(
        (
          await f.admin.query(
            'select count(*)::text as n from world_v2.command_submission',
          )
        ).rows[0].n,
      ).toBe('1');
    });
    it('real local transport consumes public DTO / signature verifier / guarded SQL without exposing economic writes', async () => {
      const f = await cluster.fixture();
      const route = createHttpsAuthenticatedFinancialIntakeRoute({
        path: '/v1/financial-intake',
        allowedOrigins: ['https://g-test-only.example.invalid'],
        composition: f.config,
      });
      const server = createServer((req, res) => {
        void route(req, res).then((handled) => {
          if (!handled) {
            res.writeHead(404);
            res.end();
          }
        });
      });
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve),
      );
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('TEST_ONLY_SERVER');
      try {
        const request = f.envelope(
          f.staged('REGISTER', 'sellerTrade', { intent: f.intent }),
        ) as AuthenticatedFinancialIntakeRequestDto;
        const response = await fetch(
          `http://127.0.0.1:${address.port}/v1/financial-intake`,
          {
            method: 'POST',
            headers: {
              Origin: 'https://g-test-only.example.invalid',
              Authorization: `Bearer ${f.token('sellerTrade')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
          },
        );
        const body =
          (await response.json()) as AuthenticatedFinancialIntakeResponseDto;
        expect(response.status).toBe(200);
        expect(body.ok).toBe(true);
        expect(body.state?.status).toBe('PENDING_APPROVAL_OR_ENQUEUE');
        expect(body.authority?.seed.contentHash).toBe(f.seed.fingerprint);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(
          (await fetch(`http://127.0.0.1:${address.port}/healthz`)).status,
        ).toBe(404);
        expect([
          f.composition.simulationEnabled,
          f.composition.workerActivationAllowed,
          f.composition.clockActivationAllowed,
        ]).toEqual([false, false, false]);
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((e) => (e ? reject(e) : resolve())),
        );
      }
    });
  },
);
