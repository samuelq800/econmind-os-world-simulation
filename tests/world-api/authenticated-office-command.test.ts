import { describe, expect, it } from 'vitest';
import { COMMAND_SCHEMA_VERSION, parseCanonicalCommand } from '@econmind/core';
import { createAuthenticatedOfficeCommandService } from '../../apps/world-api/src/integration/authenticated-office-command-service.js';
import { parseManualOfficeCommandRequest } from '../../apps/world-worker/src/intake/postgres-office-command-intake.js';
import {
  fixture,
  rows,
  SUBJECT,
  OTHER,
  WORLD,
  COUNTRY,
  INTAKE,
  sha,
} from '../support/g-manual-office-api-test-only-fixture.js';

describe('actual JWT/current SQL manual Office intake: unavailable source is zero-effect rejection', () => {
  it('unconfigured service is NOT_CONNECTED', async () => {
    expect(
      await createAuthenticatedOfficeCommandService().handle({
        authorization: 'Bearer none',
        request: {},
      }),
    ).toMatchObject({
      httpStatus: 503,
      body: { ok: false, error: { code: 'NOT_CONNECTED' } },
    });
  });
  it.each([0, 1, 2])(
    'strict existing family %i parses, authenticates actual current capability, and never stores or queues',
    async (index) => {
      const f = await fixture(index);
      const response = await f.call();
      expect(response).toMatchObject({
        httpStatus: 503,
        body: {
          ok: false,
          error: { code: 'SOURCE_RUNTIME_UNAVAILABLE', retryable: false },
          state: {
            status: 'REJECTED',
            commandType: rows[index]![1],
            submitted: false,
            queued: false,
            missing: ['ADMITTED_DOMAIN_SOURCE', 'SOLE_DURABLE_CONSUMER'],
          },
        },
      });
      expect(f.server.clockCalls).toBe(1);
      expect(f.queries.filter((q) => q.role === INTAKE)[0]?.sql).toBe(
        'begin isolation level repeatable read read only',
      );
      expect(f.queries.filter((q) => q.role === INTAKE).at(-1)?.sql).toBe(
        'commit',
      );
      await f.noEffects();
    },
  );
  it('no SQL write grant is inferred from a read binding; real INSERT privilege still cannot enable missing runtime', async () => {
    const f = await fixture();
    expect((await f.call()).body.error!.code).toBe(
      'SOURCE_RUNTIME_UNAVAILABLE',
    );
    await f.admin(
      `grant insert on world_v2.command_submission,world_v2.command_queue to ${INTAKE}`,
    );
    expect((await f.call()).body.error!.code).toBe(
      'SOURCE_RUNTIME_UNAVAILABLE',
    );
    await f.noEffects();
  });
  it.each([0, 1, 2])(
    'family %i refuses unknown payload fields through actual Core parser before source rejection',
    async (index) => {
      const f = await fixture(index);
      const r = await f.call({
        ...f.request,
        payload: { ...rows[index]![3], approved: true },
      });
      expect(r.httpStatus).toBe(400);
      expect(r.body.error!.code).not.toBe('SOURCE_RUNTIME_UNAVAILABLE');
      expect(r.body.state).toBeUndefined();
      await f.noEffects();
    },
  );
  it.each([
    'actorId',
    'authSubject',
    'simTime',
    'submittedAtReal',
    'approved',
    'runtimeReady',
    'binding',
  ])('refuses browser %s without SQL access', async (field) => {
    const f = await fixture();
    const r = await f.call({ ...f.request, [field]: true });
    expect(r.body.error!.code).toBe('PROTOCOL_ERROR');
    expect(f.queries).toHaveLength(0);
    await f.noEffects();
  });
  it.each([
    ['INDUSTRY', 'CORE_INDUSTRY_FAKE_V1'],
    ['SOCIAL', 'CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1'],
    ['CAPTAIN', 'CORE_CENTRAL_BANK_OMO_V1'],
    ['TRADE', 'CORE_GOODS_TRANSFER_V1'],
  ])(
    'refuses unsupported Office/SystemDue pairing %s/%s',
    async (officeId, commandType) => {
      const f = await fixture();
      expect(
        (await f.call({ ...f.request, officeId, commandType })).body.error!
          .code,
      ).toBe('PROTOCOL_ERROR');
      expect(f.queries).toHaveLength(0);
      await f.noEffects();
    },
  );
  it('expired or invalid signature never reaches persisted authority', async () => {
    const f = await fixture();
    for (const token of [
      f.token(SUBJECT, true),
      `${f.token().slice(0, -4)}aaaa`,
    ])
      expect((await f.call(f.request, token)).body.error!.code).toBe(
        'AUTHENTICATION_INVALID',
      );
    expect(f.queries).toHaveLength(0);
    await f.noEffects();
  });
  it('wrong subject, world, missing admission, missing server actor and wrong pin are refused', async () => {
    const f = await fixture();
    expect((await f.call(f.request, f.token(OTHER))).body.error!.code).toBe(
      'CURRENT_SEAT_OR_ADMISSION_REQUIRED',
    );
    expect(
      (await f.call({ ...f.request, worldId: 'WORLD_OTHER' })).body.error!.code,
    ).toBe('WORLD_BINDING_MISMATCH');
    f.server.actor = null;
    expect((await f.call()).body.error!.code).toBe('SERVER_ACTOR_REQUIRED');
    expect(
      (
        await createAuthenticatedOfficeCommandService({
          ...f.config,
          admittedWorldPins: {
            ...f.config.admittedWorldPins,
            contentHash: `sha256:${'a'.repeat(64)}`,
          },
        }).handle({
          authorization: `Bearer ${f.token()}`,
          request: f.envelope(),
        })
      ).body.error!.code,
    ).toBe('CURRENT_SEAT_OR_ADMISSION_REQUIRED');
    await f.noEffects();
    const g = await fixture(0, false);
    expect((await g.call()).body.error!.code).toBe(
      'CURRENT_SEAT_OR_ADMISSION_REQUIRED',
    );
    await g.noEffects();
  });
  it('read capability cannot substitute for current manual capability', async () => {
    const f = await fixture();
    await f.admin(
      "update world_v2.current_commit_authorization set active=false where capability='CAPTAIN_CABINET'",
    );
    expect((await f.call()).body.error!.code).toBe('AUTHORIZATION_DENIED');
    expect(f.server.clockCalls).toBe(0);
    await f.noEffects();
  });
  it('stale expected head is VERSION_MISMATCH, never a parked intent', async () => {
    const f = await fixture();
    expect(
      (await f.call({ ...f.request, expectedWorldVersion: '1' })).body.error!
        .code,
    ).toBe('VERSION_MISMATCH');
    await f.noEffects();
  });
  it('intake sees exact current head after the before read; changed head rejects before canonical work', async () => {
    const f = await fixture();
    f.hooks.beforeIntake = async () => {
      await f.admin(
        'update world_v2.world_head set world_version=1,event_sequence=1',
      );
    };
    expect((await f.call()).body.error!.code).toBe('AUTHORIZATION_DENIED');
    expect(f.server.clockCalls).toBe(0);
    expect(
      (
        await f.admin(
          'select count(*)::text as n from world_v2.command_submission',
        )
      ).rows[0],
    ).toEqual({ n: '0' });
  });
  it('after read must retain identical current seat, admission and actual head', async () => {
    const f = await fixture();
    f.hooks.beforeSecondRead = async () => {
      await f.admin(
        'update world_v2.world_head set world_version=1,event_sequence=1',
      );
      await f.admin(
        'update world_v2.read_projection set world_version=1,event_sequence=1',
      );
    };
    expect((await f.call()).body.error!.code).toBe('CURRENT_BINDING_CHANGED');
    expect(
      (await f.admin('select count(*)::text as n from world_v2.command_queue'))
        .rows[0],
    ).toEqual({ n: '0' });
  });
  it('economic-writer role is refused and missing SELECT is unavailable, not source success', async () => {
    const f = await fixture();
    await f.admin(`grant insert on world_v2.authoritative_event to ${INTAKE}`);
    expect((await f.call()).body.error!.code).toBe('AUTHORIZATION_DENIED');
    await f.noEffects();
    await f.admin(
      `revoke insert on world_v2.authoritative_event from ${INTAKE}`,
    );
    await f.admin(
      `revoke select on world_v2.command_submission from ${INTAKE}`,
    );
    expect((await f.call()).body.error!.code).toBe('UPSTREAM_UNAVAILABLE');
    await f.noEffects();
  });
  it('lost read-only commit or rollback acknowledgement remains unavailable, with no blind callback replay', async () => {
    const f = await fixture();
    f.hooks.loseCommit = true;
    expect((await f.call()).body.error!.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(
      f.queries.filter((q) => q.role === INTAKE && q.sql.startsWith('begin')),
    ).toHaveLength(1);
    await f.noEffects();
    const g = await fixture();
    g.hooks.loseRollback = true;
    await g.admin(
      "update world_v2.current_commit_authorization set active=false where capability='CAPTAIN_CABINET'",
    );
    expect((await g.call()).body.error!.code).toBe('UPSTREAM_UNAVAILABLE');
    await g.noEffects();
  });
  it('canonical stored identity is rehydrated with original server clock and conflicting identity is denied', async () => {
    const f = await fixture();
    // TEST_ONLY administrator persists a real CanonicalCommand on the existing
    // table. This verifies history/idempotency reads, never bypasses submit or
    // makes a positive acceptance/source/kernel execution claim.
    const c = parseCanonicalCommand(
      {
        ...f.request,
        schemaVersion: COMMAND_SCHEMA_VERSION,
        actorId: 'ACTOR_TEST_ONLY_MANUAL',
        authSubject: SUBJECT,
        simTime: '10000',
        submittedAtReal: '2026-10-08T00:00:00.000Z',
        correlationId: 'CORRELATION_TEST_ONLY_HISTORY',
      },
      sha,
    );
    await f.admin(
      `insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)
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
    f.server.simTime = '20000';
    expect((await f.call()).body.error!.code).toBe(
      'SOURCE_RUNTIME_UNAVAILABLE',
    );
    expect(f.server.clockCalls).toBe(0);
    expect(
      (await f.call({ ...f.request, commandId: 'COMMAND_DIFFERENT' })).body
        .error!.code,
    ).toBe('IDEMPOTENCY_CONFLICT');
    expect(
      (
        await f.call({
          ...f.request,
          payload: {
            ...rows[0][3],
            amount: { amount: '8', unit: 'political_capital' },
          },
        })
      ).body.error!.code,
    ).toBe('IDEMPOTENCY_CONFLICT');
    expect(
      (
        await f.admin(
          'select count(*)::text as n from world_v2.command_submission',
        )
      ).rows[0],
    ).toEqual({ n: '1' });
    expect(
      (await f.admin('select count(*)::text as n from world_v2.command_queue'))
        .rows[0],
    ).toEqual({ n: '0' });
  });
  it('pre-abort and late pool acquisition issue no intake SQL', async () => {
    const f = await fixture();
    const pre = new AbortController();
    pre.abort();
    expect(
      (
        await f.service.handle({
          authorization: `Bearer ${f.token()}`,
          request: f.envelope(),
          signal: pre.signal,
        })
      ).body.error!.code,
    ).toBe('CANCELLED');
    expect(f.queries).toHaveLength(0);
    let started!: () => void, resume!: () => void;
    const acquired = new Promise<void>((r) => {
      started = r;
    });
    const gate = new Promise<void>((r) => {
      resume = r;
    });
    f.hooks.beforeIntake = async () => {
      started();
      await gate;
    };
    const controller = new AbortController();
    const pending = f.service.handle({
      authorization: `Bearer ${f.token()}`,
      request: f.envelope(),
      signal: controller.signal,
    });
    await acquired;
    controller.abort();
    expect((await pending).body.error!.code).toBe('CANCELLED');
    resume();
    await new Promise((r) => setTimeout(r, 20));
    expect(f.queries.filter((q) => q.role === INTAKE)).toHaveLength(0);
    await f.noEffects();
  });
  it('transport parser rejects getters and invalid PostgreSQL version before issuing a command', () => {
    expect(() =>
      parseManualOfficeCommandRequest({
        get worldId() {
          throw new Error('not inert');
        },
      }),
    ).toThrow();
    expect(() =>
      parseManualOfficeCommandRequest({
        worldId: WORLD,
        countryId: COUNTRY,
        officeId: 'CAPTAIN',
        commandType: rows[0][1],
        commandId: 'COMMAND_TEST_ONLY',
        idempotencyKey: 'KEY_TEST_ONLY',
        expectedWorldVersion: '9223372036854775808',
        payload: rows[0][3],
      }),
    ).toThrow();
  });
});
