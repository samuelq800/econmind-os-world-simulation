/** TEST_ONLY canonical DATA/SQL protocol. Actual fixed original/head/admission helpers over TEST_ONLY registered rows;
 * not a native source admission, economic producer, or production approval. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import {
  decodeCommittedIndustryOperatingReceipt,
  parseIndustryOperatingReceiptBody,
  INDUSTRY_OPERATING_RECEIPT_EVENT,
} from '../../apps/world-worker/src/persistence/postwar-industry-operating-receipts.js';
import {
  createPostwarIndustryCurrentSource,
  consumeIndustryOperatingCurrentFrom,
  INDUSTRY_OPERATING_CURRENT_QUERY,
  INDUSTRY_OPERATING_SESSION_QUERY,
  type IndustryOperatingCurrentLease,
} from '../../apps/world-worker/src/persistence/postwar-industry-current-source.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const scope = {
  worldId: 'WORLD_TEST_ONLY_OPERATING',
  countryId: 'COUNTRY_01',
  locationId: 'FACILITY_TEST',
  facilityId: 'FACILITY_TEST',
  operatorId: 'OP_TEST',
};
const body = {
  schemaVersion: 'postwar-industry-operating-receipt-v1' as const,
  ...scope,
  kind: 'WORK' as const,
  receiptId: 'WORK_TEST',
  purpose: 'INDUSTRY_PRODUCTION_INPUT' as const,
  targetCommandId: 'COMMAND_TEST_PRODUCTION',
  targetCommandFingerprint: 'sha256:' + sha('TEST_ONLY_TARGET'),
  validFromTicks: '1',
  validUntilTicks: '5000',
  factCanonicalPayload: C.canonicalSerialize({
    available: '2',
    unit: 'person_day',
  }),
};
const command = C.parseCanonicalCommand(
  {
    schemaVersion: 'command-v1',
    commandId: 'COMMAND_TEST_ONLY_RECEIPT',
    worldId: scope.worldId,
    commandType: 'TEST_ONLY_RECORD_RECEIPT',
    actorId: 'ACTOR_TEST',
    authSubject: '11111111-1111-4111-8111-111111111111',
    countryId: scope.countryId,
    officeId: 'INDUSTRY',
    expectedWorldVersion: '0',
    idempotencyKey: 'IDEMPOTENCY_TEST',
    correlationId: 'CORRELATION_TEST',
    simTime: '10',
    submittedAtReal: '2026-10-30T00:00:00.000Z',
    payload: { TEST_ONLY: true },
  },
  sha,
);
const event = C.parseAuthoritativeEvent(
  {
    schemaVersion: 'event-v1',
    worldId: scope.worldId,
    eventId: 'EVENT_TEST_RECEIPT',
    eventType: INDUSTRY_OPERATING_RECEIPT_EVENT,
    worldVersion: '1',
    sequence: '1',
    causationCommandId: command.commandId,
    correlationId: command.correlationId,
    correctsEventId: null,
    simTime: '10',
    recordedAtReal: '2026-10-30T00:00:01.000Z',
    payload: { operatingReceipt: body },
  },
  sha,
);
const transition = C.createAuthoritativeTransition({
  command,
  worldVersionBefore: '0',
  worldVersionAfter: '1',
  events: [event],
});
const receipt = C.createFinalCommandReceipt({
  command,
  transition,
  outcome: 'COMMITTED',
  reasonCode: null,
  simTime: command.simTime,
  recordedAtReal: '2026-10-30T00:00:01.000Z',
});
const wire = () =>
  JSON.parse(
    C.canonicalSerialize({
      targetEventId: event.eventId,
      command,
      events: [event],
      receipt,
    }),
  ) as Record<string, unknown>;
const original = {
  worldVersion: '1',
  eventSequence: '1',
  registrationRef: 'TEST_ONLY_REGISTRATION',
  documentSha256: sha('{}'),
  seedFingerprint: 'sha256:' + sha('TEST_ONLY'),
  admissionRef: 'TEST_ONLY_ADMISSION',
};
const request = {
  scope,
  targetCommand: {
    commandId: body.targetCommandId,
    fingerprint: body.targetCommandFingerprint,
  },
  head: { worldVersion: '1', eventSequence: '1' },
  simTime: '11',
  requirements: [
    {
      kind: body.kind,
      receiptId: body.receiptId,
      factCanonicalPayload: body.factCanonicalPayload,
    },
  ],
};
const session = {
  role_name: 'test_industry_reader',
  rolsuper: false,
  rolbypassrls: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolreplication: false,
  isolation: 'repeatable read',
  read_only: 'off',
  backend_pid: '100',
  virtual_xid: '1/1',
  reader_member: true,
  owner_member: false,
  publisher_member: false,
};
function executor(read: () => unknown): SqlExecutor {
  return {
    async query<Row extends object>(q: string) {
      const rows =
        q === INDUSTRY_OPERATING_SESSION_QUERY
          ? [session]
          : q === INDUSTRY_OPERATING_CURRENT_QUERY
            ? [{ original, frames: read() }]
            : [];
      return { rows: rows as Row[], rowCount: rows.length };
    },
  };
}
const source = () =>
  createPostwarIndustryCurrentSource({
    ...scope,
    runtimeReaderRole: 'test_industry_reader',
  });
describe('canonical Industry operating receipt DATA', () => {
  it('reconstructs complete Core command/event/final evidence without admission flags', () => {
    expect(decodeCommittedIndustryOperatingReceipt(wire()).classification).toBe(
      'COMMITTED_OPERATING_RECEIPT_DATA_NOT_ADMISSION',
    );
  });
  it('rejects tampered stored command/event hashes and final audit', () => {
    for (const key of ['command', 'events', 'receipt']) {
      const v = wire();
      if (key === 'command')
        (v.command as Record<string, unknown>).fingerprint =
          'sha256:' + sha('wrong');
      if (key === 'events')
        (v.events as Record<string, unknown>[])[0]!.payloadHash =
          'sha256:' + sha('wrong');
      if (key === 'receipt')
        (v.receipt as Record<string, unknown>).idempotencyKey = 'OTHER';
      expect(() => decodeCommittedIndustryOperatingReceipt(v)).toThrow();
    }
  });
  it('rejects noncanonical fact bytes and unknown receipt fields', () => {
    expect(() =>
      parseIndustryOperatingReceiptBody({
        ...body,
        factCanonicalPayload: '{ "x": "y" }',
      }),
    ).toThrow();
    expect(() =>
      parseIndustryOperatingReceiptBody({ ...body, approved: true }),
    ).toThrow();
  });
  it('protects callback lease and expires it including exceptions/cross executor', async () => {
    const tx = executor(() => [wire()]);
    let saved: IndustryOperatingCurrentLease | undefined;
    await source().withCurrentFrom(tx, request, async (lease) => {
      saved = lease;
      expect(
        consumeIndustryOperatingCurrentFrom(tx, lease).receipts,
      ).toHaveLength(1);
      expect(() =>
        consumeIndustryOperatingCurrentFrom(
          executor(() => []),
          lease,
        ),
      ).toThrow();
      expect(() => {
        (
          consumeIndustryOperatingCurrentFrom(tx, lease).request.scope as {
            countryId: string;
          }
        ).countryId = 'COUNTRY_02';
      }).toThrow();
    });
    expect(() => consumeIndustryOperatingCurrentFrom(tx, saved!)).toThrow();
    await expect(
      source().withCurrentFrom(tx, request, async (lease) => {
        saved = lease;
        throw Error('consumer failure');
      }),
    ).rejects.toThrow('consumer failure');
    expect(() => consumeIndustryOperatingCurrentFrom(tx, saved!)).toThrow();
  });
  it('does not run consumer for missing, wrong country, expired or ambiguous originals', async () => {
    let called = 0;
    for (const frames of [[], [wire(), wire()]])
      await expect(
        source().withCurrentFrom(
          executor(() => frames),
          request,
          async () => ++called,
        ),
      ).rejects.toThrow();
    await expect(
      source().withCurrentFrom(
        executor(() => [wire()]),
        { ...request, simTime: '5000' },
        async () => ++called,
      ),
    ).rejects.toThrow();
    await expect(
      source().withCurrentFrom(
        executor(() => [wire()]),
        { ...request, scope: { ...scope, operatorId: 'OP_OTHER' } },
        async () => ++called,
      ),
    ).rejects.toThrow();
    await expect(
      source().withCurrentFrom(
        executor(() => [wire()]),
        {
          ...request,
          targetCommand: {
            ...request.targetCommand,
            commandId: 'COMMAND_OTHER_PRODUCTION',
          },
        },
        async () => ++called,
      ),
    ).rejects.toThrow('PURPOSE_CURRENT_USE');
    expect(called).toBe(0);
  });
  it('rechecks actual same transaction identity and source after consumer', async () => {
    let calls = 0;
    await expect(
      source().withCurrentFrom(
        executor(() => (++calls === 1 ? [wire()] : [])),
        request,
        async () => undefined,
      ),
    ).rejects.toThrow('MISSING');
    const altered = { ...session };
    const tx: SqlExecutor = {
      async query<Row extends object>(q: string) {
        return {
          rows: (q === INDUSTRY_OPERATING_SESSION_QUERY
            ? [altered]
            : [{ original, frames: [wire()] }]) as Row[],
          rowCount: 1,
        };
      },
    };
    await expect(
      source().withCurrentFrom(tx, request, async () => {
        altered.virtual_xid = '1/2';
      }),
    ).rejects.toThrow('TRANSACTION_LIFETIME_CHANGED');
  });
});
let db: PGlite;
const query = () =>
  db.query<{ original: unknown; frames: unknown }>(
    INDUSTRY_OPERATING_CURRENT_QUERY,
    [
      scope.worldId,
      scope.countryId,
      scope.facilityId,
      '1',
      '1',
      C.canonicalSerialize([{ kind: body.kind, receiptId: body.receiptId }]),
    ],
  );
describe('narrow SQL with actual original/head/admission helpers (TEST_ONLY rows)', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      `create schema world_v2;create role world_v2_industry_source_owner nologin;create role world_v2_industry_source_reader nologin;create role world_v2_industry_source_publisher nologin;create role test_industry_reader nologin;grant world_v2_industry_source_reader to test_industry_reader;grant usage on schema world_v2 to test_industry_reader;create table world_v2.command_submission(world_id text,command_id text,idempotency_key text,command_type text,schema_version text,canonical_payload text,payload_sha256 text,command_fingerprint text,auth_subject uuid,actor_id text,country_id text,office_id text,expected_world_version bigint,sim_time bigint,correlation_id text,submitted_at_real timestamptz);create table world_v2.authoritative_event(world_id text,event_id text,event_sequence bigint,world_version bigint,causation_command_id text,correlation_id text,event_type text,schema_version text,canonical_payload text,payload_sha256 text,event_fingerprint text,sim_time bigint,recorded_at_real timestamptz,corrects_event_id text);create table world_v2.command_receipt(world_id text,command_id text,idempotency_key text,schema_version text,command_fingerprint text,outcome text,reason_code text,transition_id text,world_version_before bigint,world_version_after bigint,sim_time bigint,event_ids jsonb,recorded_at_real timestamptz);create table world_v2.financial_posting_batch(world_id text,batch_id text,causation_command_id text,world_version_before bigint,world_version_after bigint,sim_time bigint,event_ids jsonb,transition_binding text,settlement_currency text,canonical_payload text,batch_fingerprint text);create table world_v2.inventory_posting(world_id text,posting_id text,causation_command_id text,world_version_before bigint,world_version_after bigint,sim_time bigint,event_ids jsonb,transition_binding text,operation text,canonical_payload text,posting_fingerprint text);grant select on world_v2.command_submission,world_v2.command_receipt to world_v2_industry_source_owner;`,
    );
    await db.exec(
      `create table world_v2.world_head(world_id text,world_version bigint,event_sequence bigint);create table world_v2.runtime_opening_admission(world_id text,seed_id text,seed_fingerprint text,admission_ref text,model_version text,replay_binding text,admitted_at_real timestamptz);create table world_v2.runtime_admission_publication_permit(authorization_id text,authorization_sha256 text,world_id text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,valid_from timestamptz,valid_until timestamptz);create table world_v2.runtime_admission_publication_revocation(authorization_id text);create table world_v2.postwar_industry_original(world_id text,country_id text,facility_id text,registration_ref text,seed_fingerprint text,admission_ref text,document_text text,document_sha256 text);create table world_v2.postwar_industry_original_revocation(world_id text,registration_ref text);grant usage,create on schema world_v2 to world_v2_industry_source_owner;grant select,update on world_v2.world_head,world_v2.runtime_opening_admission,world_v2.runtime_admission_publication_permit,world_v2.postwar_industry_original to world_v2_industry_source_owner;grant select on world_v2.runtime_admission_publication_revocation,world_v2.postwar_industry_original_revocation to world_v2_industry_source_owner;`,
    );
    const originalSql = await readFile(
      new URL(
        '../../database/proposals/postwar-industry-production-source.sql',
        import.meta.url,
      ),
      'utf8',
    );
    for (const name of [
      'industry_source_admission',
      'lock_postwar_industry_original',
    ]) {
      const start = originalSql.indexOf(
          'create function world_v2.' + name + '(',
        ),
        end = originalSql.indexOf('$$;', start) + 3;
      if (start < 0 || end < 3) throw Error('ACTUAL_ORIGINAL_HELPER_NOT_FOUND');
      await db.exec(originalSql.slice(start, end));
    }
    await db.exec(
      `alter function world_v2.industry_source_admission(text)owner to world_v2_industry_source_owner;alter function world_v2.lock_postwar_industry_original(text,text,text,bigint,bigint)owner to world_v2_industry_source_owner;revoke all on function world_v2.lock_postwar_industry_original(text,text,text,bigint,bigint)from public;grant execute on function world_v2.lock_postwar_industry_original(text,text,text,bigint,bigint)to world_v2_industry_source_reader;`,
    );
    const permitSha = sha('TEST_ONLY_PERMIT');
    original.admissionRef = 'ADMISSION_' + permitSha.toUpperCase();
    await db.query('insert into world_v2.world_head values($1,1,1)', [
      scope.worldId,
    ]);
    await db.query(
      "insert into world_v2.runtime_opening_admission values($1,'SEED_TEST',$2,$3,'MODEL_TEST','REPLAY_TEST','2026-10-30T00:00:00Z')",
      [scope.worldId, original.seedFingerprint, original.admissionRef],
    );
    await db.query(
      "insert into world_v2.runtime_admission_publication_permit values('PERMIT_TEST',$1,$2,'SEED_TEST',$3,'MODEL_TEST','REPLAY_TEST','2026-10-29T00:00:00Z','2026-10-31T00:00:00Z')",
      [permitSha, scope.worldId, original.seedFingerprint],
    );
    await db.query(
      "insert into world_v2.postwar_industry_original values($1,$2,$3,$4,$5,$6,'{}',$7)",
      [
        scope.worldId,
        scope.countryId,
        scope.facilityId,
        original.registrationRef,
        original.seedFingerprint,
        original.admissionRef,
        original.documentSha256,
      ],
    );
    await db.exec(
      await readFile(
        new URL(
          '../../database/proposals/postwar-industry-operating-receipts.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    await db.query(
      'insert into world_v2.command_submission values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
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
        '10',
        command.correlationId,
        command.submittedAtReal,
      ],
    );
    await db.query(
      'insert into world_v2.authoritative_event values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
      [
        event.worldId,
        event.eventId,
        event.sequence,
        event.worldVersion,
        event.causationCommandId,
        event.correlationId,
        event.eventType,
        event.schemaVersion,
        event.canonicalPayload,
        event.payloadHash,
        event.fingerprint,
        '10',
        event.recordedAtReal,
        event.correctsEventId,
      ],
    );
    await db.query(
      'insert into world_v2.command_receipt values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
      [
        receipt.worldId,
        receipt.commandId,
        receipt.idempotencyKey,
        receipt.schemaVersion,
        receipt.commandFingerprint,
        receipt.outcome,
        receipt.reasonCode,
        receipt.transitionId,
        receipt.worldVersionBefore,
        receipt.worldVersionAfter,
        '10',
        JSON.stringify(receipt.eventIds),
        receipt.recordedAtReal,
      ],
    );
  });
  afterAll(async () => {
    await db?.close();
  });
  it('installs with EXECUTE only and roundtrips actual canonical bytes', async () => {
    await db.exec(
      'set session authorization test_industry_reader;begin isolation level repeatable read',
    );
    try {
      const r = await query();
      expect(
        decodeCommittedIndustryOperatingReceipt(
          (r.rows[0]!.frames as unknown[])[0],
        ),
      ).toEqual(decodeCommittedIndustryOperatingReceipt(wire()));
      const tx: SqlExecutor = {
        async query<Row extends object>(
          q: string,
          args: readonly unknown[] = [],
        ) {
          const rows = await db.query<Row>(q, [...args]);
          return { rows: rows.rows, rowCount: rows.rows.length };
        },
      };
      await source().withCurrentFrom(tx, request, async (lease) => {
        expect(
          consumeIndustryOperatingCurrentFrom(tx, lease).registrationRef,
        ).toBe(original.registrationRef);
      });
      await expect(
        db.query('select * from world_v2.authoritative_event'),
      ).rejects.toThrow('permission denied');
    } finally {
      await db.exec('rollback;reset role;set session authorization postgres');
    }
  });
  it('rejects wrong role and unstable transactions', async () => {
    await db.exec('reset role;set session authorization postgres');
    await expect(query()).rejects.toThrow('FIXED_READER');
    await db.exec('set session authorization test_industry_reader;begin');
    try {
      await expect(query()).rejects.toThrow('STABLE_LOCKING');
    } finally {
      await db.exec('rollback;reset role;set session authorization postgres');
    }
  });
  it('actual original helper rejects stale head, source revoke and admission permit revoke', async () => {
    for (const kind of ['HEAD', 'ORIGINAL', 'PERMIT']) {
      if (kind === 'HEAD')
        await db.exec('update world_v2.world_head set event_sequence=2');
      if (kind === 'ORIGINAL')
        await db.query(
          'insert into world_v2.postwar_industry_original_revocation values($1,$2)',
          [scope.worldId, original.registrationRef],
        );
      if (kind === 'PERMIT')
        await db.exec(
          "insert into world_v2.runtime_admission_publication_revocation values('PERMIT_TEST')",
        );
      await db.exec(
        'set session authorization test_industry_reader;begin isolation level repeatable read',
      );
      try {
        await expect(query()).rejects.toThrow(
          kind === 'HEAD'
            ? 'HEAD_STALE'
            : kind === 'ORIGINAL'
              ? 'ORIGINAL_REVOKED'
              : 'ADMISSION_MISSING_OR_REVOKED',
        );
      } finally {
        await db.exec('rollback;reset role;set session authorization postgres');
        await db.exec(
          'update world_v2.world_head set event_sequence=1;delete from world_v2.postwar_industry_original_revocation;delete from world_v2.runtime_admission_publication_revocation',
        );
      }
    }
  });
  it('rejects actual canonical withdrawal without rewriting prior history', async () => {
    const c = C.parseCanonicalCommand(
      {
        schemaVersion: 'command-v1',
        commandId: 'COMMAND_TEST_ONLY_WITHDRAW',
        worldId: scope.worldId,
        commandType: 'TEST_ONLY_WITHDRAW_RECEIPT',
        actorId: command.actorId,
        authSubject: command.authSubject,
        countryId: scope.countryId,
        officeId: 'INDUSTRY',
        expectedWorldVersion: '1',
        idempotencyKey: 'IDEMPOTENCY_WITHDRAW',
        correlationId: 'CORRELATION_WITHDRAW',
        simTime: '20',
        submittedAtReal: '2026-10-30T00:00:02.000Z',
        payload: { receiptEventId: event.eventId },
      },
      sha,
    );
    const e = C.parseAuthoritativeEvent(
      {
        schemaVersion: 'event-v1',
        worldId: scope.worldId,
        eventId: 'EVENT_TEST_WITHDRAW',
        eventType: 'POSTWAR_INDUSTRY_OPERATING_FACT_WITHDRAWN_V1',
        worldVersion: '2',
        sequence: '2',
        causationCommandId: c.commandId,
        correlationId: c.correlationId,
        correctsEventId: null,
        simTime: '20',
        recordedAtReal: '2026-10-30T00:00:02.000Z',
        payload: { receiptEventId: event.eventId },
      },
      sha,
    );
    const t = C.createAuthoritativeTransition({
      command: c,
      worldVersionBefore: '1',
      worldVersionAfter: '2',
      events: [e],
    });
    const r = C.createFinalCommandReceipt({
      command: c,
      transition: t,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: c.simTime,
      recordedAtReal: e.recordedAtReal,
    });
    await db.query(
      'insert into world_v2.command_submission values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
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
    await db.query(
      'insert into world_v2.authoritative_event values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
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
    await db.query(
      'insert into world_v2.command_receipt values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
      [
        r.worldId,
        r.commandId,
        r.idempotencyKey,
        r.schemaVersion,
        r.commandFingerprint,
        r.outcome,
        r.reasonCode,
        r.transitionId,
        r.worldVersionBefore,
        r.worldVersionAfter,
        r.simTime.toCanonicalValue(),
        JSON.stringify(r.eventIds),
        r.recordedAtReal,
      ],
    );
    await db.exec(
      'update world_v2.world_head set world_version=2,event_sequence=2',
    );
    await db.exec(
      'set session authorization test_industry_reader;begin isolation level repeatable read',
    );
    try {
      await expect(
        db.query(INDUSTRY_OPERATING_CURRENT_QUERY, [
          scope.worldId,
          scope.countryId,
          scope.facilityId,
          '2',
          '2',
          C.canonicalSerialize([
            { kind: body.kind, receiptId: body.receiptId },
          ]),
        ]),
      ).rejects.toThrow('WITHDRAWN');
    } finally {
      await db.exec('rollback;reset role;set session authorization postgres');
    }
  });
});
