import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  DOMAIN_ERROR_CODES,
  authSubject,
  parseBudgetSourcePayload,
  parseCanonicalCommand,
  type AuthenticatedPrincipal,
  type CanonicalCommand,
} from '@econmind/core';
import {
  FINANCE_BUDGET_APPROPRIATION_COMMAND as FAMILY,
  type ManualOfficeCommandRequestDto,
} from '@econmind/core/authenticated-office-command-contract';
import type { FinancialIntakeBindingDto } from '@econmind/core/authenticated-financial-intake-contract';
import {
  buildManualOfficeCommandIntent,
  decodeStoredManualOfficeCommand,
  validateManualOfficeCommandIntent,
  type StoredManualOfficeCommand,
} from '../../apps/world-worker/src/intake/manual-office-command-intent.js';
import {
  PostgresOfficeCommandIntake,
  parseManualOfficeCommandRequest,
} from '../../apps/world-worker/src/intake/postgres-office-command-intake.js';
import {
  boundManualOfficeIntakeRuntime,
  createManualOfficeIntakeRuntime,
  preflightManualOfficeIntakeRuntime,
  type ManualOfficeIntakeRuntime,
} from '../../apps/world-worker/src/intake/manual-office-intake-runtime.js';
import {
  createManualOfficeCommandComposition,
  manualOfficeCapability,
} from '../../apps/world-worker/src/preparation/manual-office-command-composition.js';
import { createDurableCommandConsumptionPreparation } from '../../apps/world-worker/src/preparation/durable-command-consumption.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';

// TEST_ONLY parser/routing controls. These SQL-row fakes are NOT actual source,
// persisted authorization, PG lock/transaction, JWT or economic execution proof.
const WORLD = 'WORLD_TEST_ONLY_BUDGET';
const COUNTRY = 'COUNTRY_TEST_ONLY_BUDGET';
const SUBJECT = '11111111-1111-4111-8111-111111111111';
const TIME = '2026-10-18T00:00:00.000Z';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
type Row = Record<string, unknown>;
const isWriteOrClaimLock = (sql: string) =>
  /^(?:insert|update|delete|truncate)\b|\bfor\s+update\b/iu.test(sql.trim());
function request(
  operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE' = 'SET_ENVELOPE',
): ManualOfficeCommandRequestDto {
  return {
    worldId: WORLD,
    countryId: COUNTRY,
    officeId: 'FINANCE',
    commandType: FAMILY,
    commandId: 'COMMAND_TEST_ONLY_BUDGET',
    idempotencyKey: 'KEY_TEST_ONLY_BUDGET',
    expectedWorldVersion: '0',
    payload: {
      operation,
      scope: {
        worldId: WORLD,
        countryId: COUNTRY,
        entityRef: 'GOV_TEST_ONLY',
        envelopeRef: 'ENVELOPE_TEST_ONLY',
        effectivePeriodRef: 'PERIOD_TEST_ONLY',
      },
      currency: 'XAA',
      amount: '1000',
      envelopeRevisionRef: 'ENVELOPE_REV_TEST_ONLY',
      lineRef: operation === 'SET_ENVELOPE' ? null : 'LINE_TEST_ONLY',
      revisionRef:
        operation === 'SET_ENVELOPE'
          ? 'ENVELOPE_REV_TEST_ONLY'
          : 'LINE_REV_TEST_ONLY',
      predecessorRevisionRef: null,
    },
  };
}
function intent(r = request()) {
  return buildManualOfficeCommandIntent({
    request: r,
    countryId: r.countryId,
    officeId: r.officeId,
    authSubject: SUBJECT,
    actor: 'ACTOR_TEST_ONLY_BUDGET',
    simTime: '1000',
    submittedAtReal: TIME,
    correlationId: 'CORRELATION_TEST_ONLY_BUDGET',
  });
}
function stored(command: CanonicalCommand): StoredManualOfficeCommand {
  return {
    worldId: command.worldId,
    commandId: command.commandId,
    idempotencyKey: command.idempotencyKey!,
    commandType: command.commandType,
    schemaVersion: command.schemaVersion,
    canonicalPayload: command.canonicalPayload,
    payloadHash: command.payloadHash,
    fingerprint: command.fingerprint,
    actorId: command.actorId,
    authSubject: command.authSubject,
    countryId: command.countryId,
    officeId: command.officeId!,
    expectedWorldVersion: command.expectedWorldVersion!,
    simTime: command.simTime.toCanonicalValue(),
    correlationId: command.correlationId,
    submittedAtReal: command.submittedAtReal,
  };
}
function rawCommand(payload: unknown): CanonicalCommand {
  const r = request();
  return parseCanonicalCommand(
    {
      ...r,
      payload,
      schemaVersion: COMMAND_SCHEMA_VERSION,
      actorId: 'ACTOR_TEST_ONLY_BUDGET',
      authSubject: SUBJECT,
      simTime: '1000',
      submittedAtReal: TIME,
      correlationId: 'CORRELATION_TEST_ONLY_BUDGET',
    },
    sha,
  );
}
function deniedDatabase(): SqlDatabase {
  return {
    query: async () => {
      throw new Error('NO_SOURCE_QUERY_ALLOWED');
    },
    transaction: async () => {
      throw new Error('NO_SOURCE_TRANSACTION_ALLOWED');
    },
  };
}

function intakeFixture(existing = false) {
  const command = intent(),
    hash = `sha256:${'0'.repeat(64)}`;
  const scope = `OFFICE_${Buffer.from(COUNTRY).toString('hex').toUpperCase()}_${Buffer.from('FINANCE').toString('hex').toUpperCase()}`;
  const binding: FinancialIntakeBindingDto = {
    source: 'SERVER_VERIFIED_READ_BINDING',
    capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
    seatRef: 'SEAT_TEST_ONLY',
    seatState: 'ACTIVE',
    identity: {
      authSubjectId: SUBJECT,
      worldId: WORLD,
      countryId: COUNTRY,
      officeId: 'FINANCE',
      scopeKey: scope,
      classification: 'OFFICE_PRIVATE',
      authorizationRevision: 'REV_TEST_ONLY',
      modelVersion: 'MODEL_TEST_ONLY',
      projectionVersion: 'PROJECTION_TEST_ONLY',
    },
    seed: {
      worldId: WORLD,
      seedRef: 'SEED_TEST_ONLY',
      contentHash: hash,
      admissionRef: 'ADMISSION_TEST_ONLY',
    },
    readback: {
      worldId: WORLD,
      seedRef: 'SEED_TEST_ONLY',
      contentHash: hash,
      admissionRef: 'ADMISSION_TEST_ONLY',
      worldVersion: '0',
      eventSequence: '0',
      readbackRef: 'READBACK_TEST_ONLY',
    },
  };
  const principal: AuthenticatedPrincipal = {
    authSubject: authSubject(SUBJECT),
    facts: { user_id: SUBJECT, display_name: null, school_id: null },
    token: {
      subject: SUBJECT,
      issuer: 'urn:test-only',
      audience: 'test-only',
      issuedAt: TIME,
      expiresAt: TIME,
    },
  };
  const trace: { sql: string; parameters: readonly unknown[] }[] = [];
  let clockCalls = 0,
    releases = 0;
  const clock = {
    nowReal: () => TIME,
    simTime: async () => {
      clockCalls += 1;
      return '1000';
    },
  };
  const client = {
    async query(sql: string, parameters: readonly unknown[] = []) {
      trace.push({ sql, parameters });
      if (isWriteOrClaimLock(sql)) throw new Error('WRITE_OR_LOCK_FORBIDDEN');
      if (sql.includes('current_user as role_name'))
        return {
          rows: [
            {
              role_name: 'test_only_budget_intake',
              verified_subject: SUBJECT,
              read_only: 'on',
              rolsuper: false,
              rolbypassrls: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false,
              schema_creator: false,
              economic_writer: false,
              submission_insert: true,
              queue_insert: true,
            },
          ],
        };
      if (sql.includes('from world_v2.runtime_read_seat')) {
        expect(parameters[6]).toBe('FINANCE_BUDGET');
        return {
          rows: [
            {
              seat_ref: binding.seatRef,
              team_id: 'TEAM_TEST_ONLY',
              authorization_version: binding.identity.authorizationRevision,
              admission_ref: binding.seed.admissionRef,
              seed_id: binding.seed.seedRef,
              seed_fingerprint: hash,
              model_version: binding.identity.modelVersion,
              world_version: '0',
              event_sequence: '0',
            },
          ],
        };
      }
      if (sql.includes('from world_v2.command_submission'))
        return { rows: existing ? [stored(command)] : [] };
      if (
        sql.startsWith('begin') ||
        sql === 'commit' ||
        sql === 'rollback' ||
        sql.startsWith('select set_config')
      )
        return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {
      releases += 1;
    },
  };
  const pool = { connect: async () => client } as unknown as Pick<
    Pool,
    'connect'
  >;
  const database = deniedDatabase();
  const runtime = createManualOfficeIntakeRuntime({
    intakePool: pool,
    workerDatabase: database,
    worldId: WORLD,
    workerId: 'WORKER_TEST_ONLY_BUDGET',
    clock,
    sha256Hex: sha,
    environment: { ECONMIND_ENV: 'local' },
    readers: {
      captain: {
        read: async () => {
          throw new Error('UNRELATED_READER_MUST_NOT_RUN');
        },
      },
    },
  });
  const submit = (
    selectedRuntime: ManualOfficeIntakeRuntime | null,
    r = request(),
  ) =>
    new PostgresOfficeCommandIntake({
      pool,
      runtime: selectedRuntime,
      role: 'test_only_budget_intake',
      clock,
    }).submit({
      request: r,
      binding,
      principal,
      actor: 'ACTOR_TEST_ONLY_BUDGET',
      signal: new AbortController().signal,
    });
  return {
    command,
    binding,
    principal,
    pool,
    clock,
    database,
    runtime,
    submit,
    trace,
    clockCalls: () => clockCalls,
    releases: () => releases,
  };
}

describe('A01 Finance budget parser/default-deny intake', () => {
  it.each(['SET_ENVELOPE', 'APPROVE_NEW_LINE'] as const)(
    'parses TEST_ONLY %s without granting source or execution',
    (operation) => {
      const r = request(operation),
        command = intent(parseManualOfficeCommandRequest(r));
      expect(command.commandType).toBe(FAMILY);
      expect(command.officeId).toBe('FINANCE');
      expect(manualOfficeCapability(command)).toBe('FINANCE_BUDGET');
      expect(JSON.parse(command.canonicalPayload)).toEqual(
        parseBudgetSourcePayload(r.payload),
      );
      expect(Object.keys(command)).not.toContain('sourceReady');
    },
  );
  it.each(['0', '0.000000000000000001', '1000.000000000000000001'])(
    'keeps exact native %s without rounding or capacity assertion',
    (amount) => {
      const r = request();
      (r.payload as Row).amount = amount;
      expect(JSON.parse(intent(r).canonicalPayload).amount).toBe(amount);
    },
  );
  it.each([
    ['CAPTAIN', FAMILY],
    ['SOCIAL', FAMILY],
    ['TRADE', FAMILY],
    ['CENTRAL_BANK', FAMILY],
    ['FINANCE', 'CORE_GOODS_TRANSFER_V1'],
    ['FINANCE', 'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1'],
    ['FINANCE', 'CORE_FINANCE_BUDGET_APPROPRIATION_V999'],
    ['FINANCE', 'UNKNOWN_FAMILY'],
  ])('refuses transport tuple %s/%s', (officeId, commandType) => {
    expect(() =>
      parseManualOfficeCommandRequest({ ...request(), officeId, commandType }),
    ).toThrow();
  });
  it.each([
    'actorId',
    'authSubject',
    'simTime',
    'approved',
    'runtimeReady',
    'candidateFactory',
    'binding',
  ])('rejects caller authority %s', (key) => {
    expect(() =>
      parseManualOfficeCommandRequest({ ...request(), [key]: true }),
    ).toThrow();
  });
  it.each([
    ['operation', 'ADJUST_CAP'],
    ['amount', 125],
    ['amount', '-1'],
    ['amount', '1.00'],
    ['currency', 'xaa'],
    ['predecessorRevisionRef', 'OLD_REVISION'],
    ['lineRef', 'LINE_NOT_ALLOWED'],
    ['revisionRef', 'OTHER_REV'],
    ['approved', true],
    ['capacitySatisfied', true],
    ['requiredOfficeSet', []],
  ])('rejects invalid/extra budget payload %s', (key, value) => {
    const r = request();
    (r.payload as Row)[key as string] = value;
    expect(() => intent(r)).toThrowError(
      expect.objectContaining({
        code:
          typeof value === 'number'
            ? DOMAIN_ERROR_CODES.SERIALIZATION_REJECTED
            : DOMAIN_ERROR_CODES.COMMAND_SCHEMA_INVALID,
      }),
    );
  });
  it.each([
    'worldId',
    'countryId',
    'entityRef',
    'envelopeRef',
    'effectivePeriodRef',
  ])('requires exact budget scope %s', (key) => {
    const r = request();
    delete ((r.payload as Row).scope as Row)[key];
    expect(() => intent(r)).toThrow();
  });
  it.each([
    ['worldId', 'WORLD_OTHER'],
    ['countryId', 'COUNTRY_OTHER'],
    ['approved', true],
  ])('rejects scope mismatch/extra %s', (key, value) => {
    const r = request();
    ((r.payload as Row).scope as Row)[key as string] = value;
    expect(() => intent(r)).toThrow();
  });
  it('requires the authenticated outer Office/country to match the request and never falls back to Social', () => {
    for (const extra of [
      { officeId: 'SOCIAL' },
      { countryId: 'COUNTRY_OTHER' },
    ])
      expect(() =>
        buildManualOfficeCommandIntent({
          request: request(),
          countryId: COUNTRY,
          officeId: 'FINANCE',
          actor: 'ACTOR_TEST_ONLY_BUDGET',
          authSubject: SUBJECT,
          simTime: '1000',
          submittedAtReal: TIME,
          correlationId: 'CORRELATION_TEST_ONLY_BUDGET',
          ...extra,
        }),
      ).toThrow();
    const unknown = parseCanonicalCommand(
      {
        ...request(),
        commandType: 'UNKNOWN_FAMILY',
        schemaVersion: COMMAND_SCHEMA_VERSION,
        actorId: 'ACTOR_TEST_ONLY_BUDGET',
        authSubject: SUBJECT,
        simTime: '1000',
        submittedAtReal: TIME,
        correlationId: 'CORRELATION_TEST_ONLY_BUDGET',
      },
      sha,
    );
    expect(() => validateManualOfficeCommandIntent(unknown)).toThrow();
    expect(manualOfficeCapability(unknown)).toBeNull();
  });
  it('rehydrates a valid stored budget identity with no source and refuses corrupt/invalid stored payload', () => {
    const command = intent();
    expect(
      decodeStoredManualOfficeCommand([stored(command)], request()),
    ).toEqual(command);
    expect(() =>
      decodeStoredManualOfficeCommand(
        [{ ...stored(command), fingerprint: `sha256:${'0'.repeat(64)}` }],
        request(),
      ),
    ).toThrow();
    const bad = rawCommand({ ...(request().payload as Row), approved: true });
    expect(() =>
      decodeStoredManualOfficeCommand([stored(bad)], request()),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.COMMAND_SCHEMA_INVALID,
      }),
    );
  });
  it.each([false, true])(
    'rejects without durable registration/claim even with existing=%s and a genuine unrelated runtime',
    async (existing) => {
      const f = intakeFixture(existing);
      expect(
        boundManualOfficeIntakeRuntime(f.runtime, {
          pool: f.pool,
          clock: f.clock,
          worldId: WORLD,
        }),
      ).toBe(true);
      for (const runtime of [
        null,
        f.runtime,
        { runtimeReady: true } as unknown as ManualOfficeIntakeRuntime,
      ]) {
        await expect(f.submit(runtime)).resolves.toEqual({
          status: 'REJECTED',
          reason: 'SOURCE_RUNTIME_UNAVAILABLE',
          commandType: FAMILY,
          submitted: false,
          queued: false,
          missing: ['ADMITTED_DOMAIN_SOURCE', 'SOLE_DURABLE_CONSUMER'],
        });
      }
      expect(
        f.trace
          .filter(({ sql }) => sql.startsWith('begin'))
          .every(
            ({ sql }) =>
              sql === 'begin isolation level repeatable read read only',
          ),
      ).toBe(true);
      expect(f.trace.some(({ sql }) => isWriteOrClaimLock(sql))).toBe(false);
      expect(
        f.trace.some(({ sql }) => sql.includes('from world_v2.command_queue')),
      ).toBe(false);
      expect(f.clockCalls()).toBe(existing ? 0 : 3);
      expect(f.releases()).toBe(3);
    },
  );
  it('validates the payload before source rejection, without write/claim or any fake-ready override', async () => {
    const f = intakeFixture();
    const r = request();
    (r.payload as Row).approved = true;
    await expect(f.submit(f.runtime, r)).rejects.toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.COMMAND_SCHEMA_INVALID,
      }),
    );
    expect(f.trace.at(-1)?.sql).toBe('rollback');
    expect(f.trace.some(({ sql }) => isWriteOrClaimLock(sql))).toBe(false);
  });
  it('has no budget source/candidate callback and preflight cannot consult an unrelated reader', async () => {
    const f = intakeFixture();
    expect(
      createManualOfficeCommandComposition({
        command: f.command,
        database: f.database,
        workerId: 'WORKER_TEST_ONLY_BUDGET',
        sha256Hex: sha,
        readers: {
          captain: {
            read: async () => {
              throw new Error('DO_NOT_USE_CAPTAIN');
            },
          },
        },
      }),
    ).toBeNull();
    expect(
      await preflightManualOfficeIntakeRuntime(f.runtime, f.command, TIME),
    ).toBe(false);
  });

  it.each(['PENDING', 'CLAIMED'])(
    'consumer refuses %s budget before authorization, lease, receipt or queue claim',
    async (queueState) => {
      const command = intent(),
        holder = 'WORKER_TEST_ONLY_BUDGET',
        trace: string[] = [];
      const query: SqlExecutor['query'] = async <Result extends object>(
        sql: string,
      ) => {
        trace.push(sql);
        let rows: readonly object[];
        if (sql.includes('from world_v2.command_queue'))
          rows = [
            {
              command_id: command.commandId,
              authority_kind: 'DISCRETIONARY_USER',
              queue_state: queueState,
              available_at_sim_time: '1000',
              claimed_by: queueState === 'CLAIMED' ? holder : null,
              claim_fencing_token: queueState === 'CLAIMED' ? '1' : null,
            },
          ];
        else if (sql.includes('from world_v2.command_submission'))
          rows = [
            {
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
              command_sim_time: '1000',
              command_submitted_at_real: TIME,
              command_type: command.commandType,
              command_world_id: WORLD,
              correlation_id: command.correlationId,
            },
          ];
        else throw new Error(`Unexpected source/authority/write query: ${sql}`);
        return { rows: rows as readonly Result[], rowCount: rows.length };
      };
      const database: SqlDatabase = {
        query: async () => {
          throw new Error('NO_POOL_QUERY');
        },
        transaction: async (operation) => operation({ query }),
      };
      const consumer = createDurableCommandConsumptionPreparation({
        database,
        environment: { ECONMIND_ENV: 'local' },
        workerId: holder,
        worldId: WORLD,
        sha256Hex: sha,
        clock: { nowReal: () => TIME, simTime: async () => '1000' },
      });
      consumer.startPreparation();
      expect(await consumer.consumeOnce()).toEqual({
        status: 'BLOCKED',
        reason: 'SOURCE_RUNTIME_UNAVAILABLE',
        commandId: command.commandId,
      });
      expect(trace).toHaveLength(2);
      expect(trace.every((sql) => /^select/iu.test(sql.trim()))).toBe(true);
      await consumer.stop();
    },
  );
});
