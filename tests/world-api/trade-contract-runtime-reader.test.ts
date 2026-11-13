import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseSupabaseAuthSubject } from '../../apps/world-api/src/integration/identity.js';
import type { ParameterizedPgReadExecutor } from '../../apps/world-api/src/integration/postgres-read-adapter.js';
import {
  readTradeContractRuntimePage,
  TRADE_CONTRACT_RUNTIME_READ_QUERY,
  type ServerTradeContractRuntimeScope,
  type TradeContractRuntimePage,
  type TradeRuntimeCursor,
} from '../../apps/world-api/src/read-models/trade-contract-runtime-reader.js';

// Disposable embedded SQL fixtures in the real existing migration schemas.
// This exercises SQL predicates and durable joins, not native RLS, admission,
// a live API, a Trade economic producer, or 23-subtype contract execution.
const subject = parseSupabaseAuthSubject(
  '123e4567-e89b-42d3-a456-426614174000',
);
const other = parseSupabaseAuthSubject('123e4567-e89b-42d3-a456-426614174001');
const scopeKey = (country = 'COUNTRY_A') =>
  `OFFICE_${Buffer.from(country).toString('hex').toUpperCase()}_5452414445`;
const scope: ServerTradeContractRuntimeScope = {
  authSubject: subject,
  worldId: 'WORLD_A',
  countryId: 'COUNTRY_A',
  officeId: 'TRADE',
  teamId: 'TEAM_A',
  authorizationRevision: 'REV_CURRENT',
  classification: 'OFFICE_PRIVATE',
  scopeKey: scopeKey(),
};
const fingerprint = `sha256:${'a'.repeat(64)}`;
const eventFingerprint = `sha256:${'b'.repeat(64)}`;
const timestamp = '2026-10-28T00:00:00.000Z';
let db: PGlite;
let executor: ParameterizedPgReadExecutor;

async function authorization(worldId: string) {
  await db.query(
    `insert into world_v2.current_commit_authorization
    (world_id,auth_subject,country_id,office_id,capability,team_id,authorization_version,active,refreshed_at_real)
    values ($1,$2,'COUNTRY_A','TRADE','TRADE_CONTRACTS','TEAM_A','REV_CURRENT',true,$3)`,
    [worldId, subject, timestamp],
  );
  await db.query(
    `insert into world_v2.projection_entitlement
    (world_id,auth_subject,classification,scope_key,authorization_version,active,granted_at)
    values ($1,$2,'OFFICE_PRIVATE',$3,'REV_CURRENT',true,$4)`,
    [worldId, subject, scopeKey(), timestamp],
  );
}
async function seedCommand(
  index: number,
  options: {
    world?: string;
    country?: string;
    subject?: string;
    team?: string;
    office?: string;
    postings?: boolean;
    missingAudit?: boolean;
    outcome?: 'COMMITTED' | 'REJECTED' | 'NO_RECEIPT';
  } = {},
) {
  const world = options.world ?? 'WORLD_A',
    country = options.country ?? 'COUNTRY_A',
    authSubject = options.subject ?? subject;
  const office = options.office ?? 'TRADE',
    commandId = `COMMAND_${String(index).padStart(2, '0')}`;
  const eventId = `EVENT_${index}`,
    key = `KEY_${index}`,
    before = String(index - 1),
    after = String(index);
  await db.query(
    `insert into world_v2.command_submission
    (world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,
    command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)
    values ($1,$2,$3,'NARROW_TREASURY_GCU_TRANSFER','command-v1',$4,$5,$5,$6,'ACTOR_A',$7,$8,$9,1,'CORRELATION_A',$10)`,
    [
      world,
      commandId,
      key,
      '{"TEST_ONLY_PRIVATE_TERMS":"must never be returned"}',
      fingerprint,
      authSubject,
      country,
      office,
      before,
      timestamp,
    ],
  );
  if (options.outcome === 'NO_RECEIPT') return;
  if (options.outcome === 'REJECTED') {
    await db.query(
      `insert into world_v2.command_receipt
      (world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,reason_code,sim_time,event_ids,recorded_at_real)
      values ($1,$2,$3,'command-receipt-v2',$4,'REJECTED','TEST_ONLY_REJECTION',1,'[]',$5)`,
      [world, commandId, key, fingerprint, timestamp],
    );
    return;
  }
  await db.query(
    `insert into world_v2.authoritative_event
    (world_id,event_id,event_sequence,world_version,causation_command_id,correlation_id,event_type,schema_version,
    canonical_payload,payload_sha256,event_fingerprint,sim_time,recorded_at_real)
    values ($1,$2,$3,$3,$4,'CORRELATION_A','TEST_ONLY_TRADE_EVENT','event-v1',$5,$6,$7,1,$8)`,
    [
      world,
      eventId,
      after,
      commandId,
      '{"TEST_ONLY_PRIVATE_EVENT":"must never be returned"}',
      fingerprint,
      eventFingerprint,
      timestamp,
    ],
  );
  if (options.postings) {
    const binding = JSON.stringify({
      schemaVersion: 'authoritative-transition-binding-v1',
      worldId: world,
      transitionId: commandId,
      commandId,
      worldVersionBefore: before,
      worldVersionAfter: after,
      simTime: '1',
      eventIds: [eventId],
      commandFingerprint: fingerprint,
      expectedWorldVersion: before,
      idempotencyKey: key,
      eventFingerprints: [eventFingerprint],
    });
    await db.query(
      `insert into world_v2.inventory_posting
      (world_id,posting_id,causation_command_id,world_version_before,world_version_after,sim_time,event_ids,
      transition_binding,operation,canonical_payload,posting_fingerprint)
      values ($1,$2,$3,$4,$5,1,$6,$7,'RESERVE',$8,$9)`,
      [
        world,
        `INVENTORY_${index}`,
        commandId,
        before,
        after,
        JSON.stringify([eventId]),
        binding,
        '{"TEST_ONLY_PRIVATE_INVENTORY":"9007199254740993.00001"}',
        fingerprint,
      ],
    );
    await db.query(
      `insert into world_v2.financial_posting_batch
      (world_id,batch_id,causation_command_id,world_version_before,world_version_after,sim_time,event_ids,
      transition_binding,settlement_currency,canonical_payload,batch_fingerprint)
      values ($1,$2,$3,$4,$5,1,$6,$7,'GCU',$8,$9)`,
      [
        world,
        `FINANCIAL_${index}`,
        commandId,
        before,
        after,
        JSON.stringify([eventId]),
        binding,
        '{"TEST_ONLY_PRIVATE_MONEY":"9007199254740993.00001"}',
        fingerprint,
      ],
    );
  }
  if (!options.missingAudit)
    await db.query(
      `insert into world_v2.authoritative_commit_authorization
    (world_id,command_id,authority_kind,auth_subject,actor_id,country_id,office_id,capability,team_id,authorization_version,committed_at_real)
    values ($1,$2,'DISCRETIONARY_USER',$3,'ACTOR_A',$4,$5,'TRADE_CONTRACTS',$6,'REV_AT_COMMIT',$7)`,
      [
        world,
        commandId,
        authSubject,
        country,
        office,
        options.team ?? 'TEAM_A',
        timestamp,
      ],
    );
  await db.query(
    `insert into world_v2.command_receipt
    (world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,transition_id,
    world_version_before,world_version_after,sim_time,event_ids,recorded_at_real)
    values ($1,$2,$3,'command-receipt-v2',$4,'COMMITTED',$2,$5,$6,1,$7,$8)`,
    [
      world,
      commandId,
      key,
      fingerprint,
      before,
      after,
      JSON.stringify([eventId]),
      timestamp,
    ],
  );
}
const read = (
  input: Partial<Parameters<typeof readTradeContractRuntimePage>[0]> = {},
) => readTradeContractRuntimePage({ executor, scope, ...input });
function page(result: TradeContractRuntimePage) {
  expect(['PAGE', 'EMPTY']).toContain(result.status);
  if ('reason' in result) throw Error(result.reason);
  return result;
}

beforeAll(async () => {
  db = new PGlite();
  for (const file of [
    '0001_world_v2_namespace.sql',
    '0002_world_v2_command_event_ledger.sql',
    '0003_world_v2_command_receipts_outbox.sql',
    '0004_world_v2_receipt_event_set_integrity.sql',
    '0007_world_v2_atomic_transition_facts.sql',
    '0011_world_v2_current_commit_authorization.sql',
    '0013_world_v2_read_projection_boundary.sql',
    '0014_world_v2_current_negotiation_party_membership.sql',
  ]) {
    await db.exec(
      await readFile(
        new URL(`../../database/migrations/artifacts/${file}`, import.meta.url),
        'utf8',
      ),
    );
  }
  executor = { query: ({ text, values }) => db.query(text, [...values]) };
  for (const world of ['WORLD_A', 'WORLD_B', 'WORLD_EMPTY', 'WORLD_NO_AUDIT']) {
    await db.query(
      'insert into world_v2.world_head(world_id,world_version,event_sequence) values($1,20,20)',
      [world],
    );
    await authorization(world);
  }
  await seedCommand(1, { postings: true });
  await seedCommand(2);
  await seedCommand(3, { country: 'COUNTRY_B', postings: true });
  await seedCommand(4, { subject: other, postings: true });
  await seedCommand(5, { team: 'TEAM_OLD', postings: true });
  await seedCommand(6, { office: 'FINANCE', postings: true });
  await seedCommand(7, { world: 'WORLD_B', postings: true });
  await seedCommand(8, { outcome: 'NO_RECEIPT' });
  await seedCommand(9, { outcome: 'REJECTED' });
  await seedCommand(10, {
    world: 'WORLD_NO_AUDIT',
    missingAudit: true,
    postings: true,
  });
  for (const party of ['PARTY_A', 'PARTY_B'])
    await db.query(
      `insert into world_v2.projection_entitlement
    (world_id,auth_subject,classification,scope_key,authorization_version,active,granted_at)
    values ('WORLD_A',$1,'NEGOTIATION_PARTY',$2,'REV_CURRENT',true,$3)`,
      [subject, party, timestamp],
    );
  await db.query(
    `insert into world_v2.current_negotiation_party_membership
    (world_id,party_id,auth_subject,country_id,office_id,authorization_version,active,refreshed_at_real)
    values ('WORLD_A','PARTY_A',$1,'COUNTRY_A','TRADE','REV_CURRENT',true,$2)`,
    [subject, timestamp],
  );
});
afterAll(async () => {
  await db?.close();
});

describe('durable authorized Trade own-commit evidence', () => {
  it('executes actual SQL against existing tables and exposes only own committed refs', async () => {
    const result = page(await read());
    expect(result.rows.map((r) => r.commandId)).toEqual([
      'COMMAND_01',
      'COMMAND_02',
    ]);
    expect(result.rows[0]).toMatchObject({
      worldId: 'WORLD_A',
      outcome: 'COMMITTED',
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      events: [{ eventId: 'EVENT_1', eventSequence: '1', eventFingerprint }],
      ledger: {
        status: 'REFERENCES_ONLY',
        postings: [
          { kind: 'FINANCIAL', postingId: 'FINANCIAL_1', fingerprint },
          { kind: 'INVENTORY', postingId: 'INVENTORY_1', fingerprint },
        ],
      },
    });
    expect(result.rows[1]!.ledger).toEqual({
      status: 'UNAVAILABLE_NO_POSTINGS',
      postings: [],
    });
    expect(result.coverage).toMatchObject({
      contractResults: 'UNAVAILABLE_NO_PERSISTED_CONTRACT_MODEL',
      numericResults: 'NOT_AUTHORIZED',
      teamScope: 'CURRENT_AND_IMMUTABLE_COMMIT_AUTHORIZATION_MATCH',
    });
    const rendered = JSON.stringify(result);
    expect(rendered).not.toMatch(
      /PRIVATE_|9007199254740993|canonical_payload|account|amount|currency/,
    );
    expect(Object.isFrozen(result.rows[0]!.ledger.postings)).toBe(true);
  });
  it('returns EMPTY only for an authorized head with no committed receipt facts', async () => {
    const result = await read({ scope: { ...scope, worldId: 'WORLD_EMPTY' } });
    expect(result).toMatchObject({
      status: 'EMPTY',
      rows: [],
      watermark: { worldVersion: '20', eventSequence: '20' },
      nextCursor: null,
    });
  });
  it('does not turn missing immutable commit authorization into an empty successful result', async () => {
    expect(
      await read({ scope: { ...scope, worldId: 'WORLD_NO_AUDIT' } }),
    ).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'COMMIT_AUTHORIZATION_UNAVAILABLE',
      rows: [],
    });
  });
  it('uses a fixed, parameterized subject-bound statement and string versions', async () => {
    const query = vi.fn(executor.query);
    await read({ executor: { query } });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]![0]).toMatchObject({
      text: TRADE_CONTRACT_RUNTIME_READ_QUERY,
      verifiedAuthSubject: subject,
      values: [
        'WORLD_A',
        subject,
        'COUNTRY_A',
        'TEAM_A',
        'REV_CURRENT',
        'OFFICE_PRIVATE',
        scopeKey(),
        '21',
        '',
        '',
        '',
        '',
      ],
    });
    expect(TRADE_CONTRACT_RUNTIME_READ_QUERY).not.toContain(
      'canonical_payload',
    );
    expect((await executor.query(query.mock.calls[0]![0])).rows).toHaveLength(
      1,
    );
  });
  it('pages at one pinned head with no duplication and no numeric coercion', async () => {
    const first = page(await read({ page: { limit: 1 } }));
    expect(first.rows.map((r) => r.commandId)).toEqual(['COMMAND_01']);
    expect(first.nextCursor).not.toBeNull();
    const second = page(
      await read({ page: { limit: 1, cursor: first.nextCursor! } }),
    );
    expect(second.rows.map((r) => r.commandId)).toEqual(['COMMAND_02']);
    expect(second.nextCursor).toBeNull();
    expect(second.watermark).toEqual(first.watermark);
    const exhausted = await read({
      page: {
        cursor: {
          ...first.nextCursor!,
          after: { worldVersion: '2', commandId: 'COMMAND_02' },
        },
      },
    });
    expect(exhausted).toMatchObject({ status: 'EMPTY', nextCursor: null });
  });
  it('rejects a page cursor after the durable head changes', async () => {
    const first = page(await read({ page: { limit: 1 } }));
    await db.exec(
      "update world_v2.world_head set world_version=21,event_sequence=21 where world_id='WORLD_A'",
    );
    try {
      expect(await read({ page: { cursor: first.nextCursor! } })).toMatchObject(
        { status: 'STALE', reason: 'PAGE_HEAD_CHANGED', rows: [] },
      );
    } finally {
      await db.exec(
        "update world_v2.world_head set world_version=20,event_sequence=20 where world_id='WORLD_A'",
      );
    }
  });
  it.each([
    { teamId: 'TEAM_OTHER' },
    { countryId: 'COUNTRY_OTHER', scopeKey: scopeKey('COUNTRY_OTHER') },
    { authSubject: other },
    { authorizationRevision: 'REV_OLD' },
    { worldId: 'WORLD_B', teamId: 'TEAM_OTHER' },
  ])('denies mismatched current scope %j', async (changes) => {
    expect(await read({ scope: { ...scope, ...changes } })).toMatchObject({
      status: 'DENIED',
      rows: [],
    });
  });
  it('rechecks current authorization and read entitlement rather than trusting the scope DTO', async () => {
    await db.exec(
      "update world_v2.current_commit_authorization set active=false where world_id='WORLD_A'",
    );
    try {
      expect(await read()).toMatchObject({ status: 'DENIED', rows: [] });
    } finally {
      await db.exec(
        "update world_v2.current_commit_authorization set active=true where world_id='WORLD_A'",
      );
    }
    await db.exec(
      "update world_v2.projection_entitlement set active=false,revoked_at=now() where world_id='WORLD_A' and classification='OFFICE_PRIVATE'",
    );
    try {
      expect(await read()).toMatchObject({ status: 'DENIED', rows: [] });
    } finally {
      await db.exec(
        "update world_v2.projection_entitlement set active=true,revoked_at=null where world_id='WORLD_A' and classification='OFFICE_PRIVATE'",
      );
    }
  });
  it('requires current party membership but never reinterprets it as a committed contract binding', async () => {
    expect(
      await read({
        scope: {
          ...scope,
          classification: 'NEGOTIATION_PARTY',
          scopeKey: 'PARTY_A',
        },
      }),
    ).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'PARTY_CONTRACT_FACTS_UNAVAILABLE',
      rows: [],
    });
    expect(
      await read({
        scope: {
          ...scope,
          classification: 'NEGOTIATION_PARTY',
          scopeKey: 'PARTY_B',
        },
      }),
    ).toMatchObject({ status: 'DENIED', rows: [] });
    await db.exec(
      "update world_v2.current_negotiation_party_membership set active=false where party_id='PARTY_A'",
    );
    try {
      expect(
        await read({
          scope: {
            ...scope,
            classification: 'NEGOTIATION_PARTY',
            scopeKey: 'PARTY_A',
          },
        }),
      ).toMatchObject({ status: 'DENIED', rows: [] });
    } finally {
      await db.exec(
        "update world_v2.current_negotiation_party_membership set active=true where party_id='PARTY_A'",
      );
    }
  });
  it('matches immutable commit team after a current-team change without reopening the previous team history', async () => {
    await db.exec(
      "update world_v2.current_commit_authorization set team_id='TEAM_OLD' where world_id='WORLD_A'",
    );
    try {
      expect(await read()).toMatchObject({ status: 'DENIED', rows: [] });
      const switched = page(
        await read({ scope: { ...scope, teamId: 'TEAM_OLD' } }),
      );
      expect(switched.rows.map((row) => row.commandId)).toEqual(['COMMAND_05']);
    } finally {
      await db.exec(
        "update world_v2.current_commit_authorization set team_id='TEAM_A' where world_id='WORLD_A'",
      );
    }
  });
  it('binds cursor reuse to world/country/team/subject/revision/party identity', async () => {
    const cursor = page(await read({ page: { limit: 1 } })).nextCursor!;
    for (const changes of [
      { teamId: 'TEAM_OTHER' },
      { countryId: 'COUNTRY_OTHER', scopeKey: scopeKey('COUNTRY_OTHER') },
      { worldId: 'WORLD_B' },
      { authSubject: other },
      { authorizationRevision: 'REV_OTHER' },
      { classification: 'NEGOTIATION_PARTY' as const, scopeKey: 'PARTY_A' },
    ]) {
      expect(
        await read({ scope: { ...scope, ...changes }, page: { cursor } }),
      ).toMatchObject({ status: 'INVALID_REQUEST', rows: [] });
    }
  });
  it.each([0, 101, 1.5, Number.NaN])(
    'rejects invalid page size %s before querying',
    async (limit) => {
      const query = vi.fn();
      expect(
        await read({ executor: { query }, page: { limit } }),
      ).toMatchObject({ status: 'INVALID_REQUEST' });
      expect(query).not.toHaveBeenCalled();
    },
  );
  it('keeps missing head and database failure distinct from EMPTY', async () => {
    expect(
      await read({ scope: { ...scope, worldId: 'WORLD_ABSENT' } }),
    ).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'WORLD_HEAD_UNAVAILABLE',
    });
    expect(
      await read({
        executor: {
          query: vi.fn(async () => {
            throw Error('TEST_ONLY_PRIVATE_CONNECTION_DETAIL');
          }),
        },
      }),
    ).toMatchObject({ status: 'UNAVAILABLE', reason: 'DATABASE_UNAVAILABLE' });
  });
  it('settles cancellation even if the injected transport does not respond, without accepting a late result', async () => {
    const controller = new AbortController();
    let complete: (value: { rows: readonly unknown[] }) => void = () =>
      undefined;
    const query = vi.fn(
      () =>
        new Promise<{ rows: readonly unknown[] }>((resolve) => {
          complete = resolve;
        }),
    );
    const pending = read({ executor: { query }, signal: controller.signal });
    controller.abort();
    expect(await pending).toMatchObject({ status: 'CANCELLED', rows: [] });
    complete({ rows: [] });
    const never = vi.fn();
    expect(
      await read({ executor: { query: never }, signal: controller.signal }),
    ).toMatchObject({ status: 'CANCELLED' });
    expect(never).not.toHaveBeenCalled();
  });
  it.each([
    'receipt-world',
    'event-link',
    'posting-event-link',
    'duplicate-posting',
    'posting-version',
    'missing-events',
    'unordered-page',
  ])('fails closed for incoherent durable result %s', async (change) => {
    const corrupt: ParameterizedPgReadExecutor = {
      query: async (request) => {
        const response = await executor.query(request),
          row = structuredClone(response.rows[0]) as {
            receipts: Record<string, unknown>[];
          };
        const receipt = row.receipts[0]!,
          events = receipt.events as Record<string, unknown>[],
          postings = receipt.postings as Record<string, unknown>[];
        if (change === 'receipt-world') receipt.worldId = 'WORLD_OTHER';
        if (change === 'event-link') events[0]!.worldVersion = '2';
        if (change === 'posting-event-link')
          postings[0]!.eventIds = ['EVENT_OTHER'];
        if (change === 'duplicate-posting') postings.push(postings[0]!);
        if (change === 'posting-version') postings[0]!.worldVersionAfter = '2';
        if (change === 'missing-events') receipt.events = [];
        if (change === 'unordered-page') row.receipts.reverse();
        return { rows: [row] };
      },
    };
    expect(await read({ executor: corrupt })).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'DURABLE_EVIDENCE_INVALID',
      rows: [],
    });
  });
  it('does not accept a forged numeric version cursor', async () => {
    const cursor = page(await read({ page: { limit: 1 } })).nextCursor!;
    const forged = {
      ...cursor,
      watermark: { worldVersion: 20, eventSequence: '20' },
    } as unknown as TradeRuntimeCursor;
    expect(await read({ page: { cursor: forged } })).toMatchObject({
      status: 'INVALID_REQUEST',
    });
  });
  it.each([
    'R'.repeat(129),
    'R'.repeat(256),
    'revision/2026 with internal space',
  ])(
    'preserves an accepted persisted revision fixture %# without inventing a narrower grammar',
    async (authorizationRevision) => {
      const query = vi.fn<ParameterizedPgReadExecutor['query']>(async () => ({
        rows: [
          {
            state: 'READY',
            world_version: '20',
            event_sequence: '20',
            receipts: [],
          },
        ],
      }));
      expect(
        await read({
          scope: { ...scope, authorizationRevision },
          executor: { query },
        }),
      ).toMatchObject({ status: 'EMPTY' });
      expect(query.mock.calls[0]![0].values[4]).toBe(authorizationRevision);
    },
  );
  it('accepts a derived private scope longer than 128 within the existing 256-character boundary', async () => {
    const countryId = 'C'.repeat(56),
      privateScope = scopeKey(countryId);
    expect(privateScope).toHaveLength(130);
    const query = vi.fn<ParameterizedPgReadExecutor['query']>(async () => ({
      rows: [
        {
          state: 'READY',
          world_version: '20',
          event_sequence: '20',
          receipts: [],
        },
      ],
    }));
    expect(
      await read({
        scope: { ...scope, countryId, scopeKey: privateScope },
        executor: { query },
      }),
    ).toMatchObject({ status: 'EMPTY' });
    expect(query.mock.calls[0]![0].values[6]).toBe(privateScope);
  });
  it.each(['', ' padded', 'padded ', 'R'.repeat(257)])(
    'rejects revision outside the existing accepted text boundary fixture %#',
    async (authorizationRevision) => {
      const query = vi.fn();
      expect(
        await read({
          scope: { ...scope, authorizationRevision },
          executor: { query },
        }),
      ).toMatchObject({ status: 'DENIED', reason: 'SERVER_SCOPE_INVALID' });
      expect(query).not.toHaveBeenCalled();
    },
  );
});
