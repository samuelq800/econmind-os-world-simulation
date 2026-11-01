/** Embedded DATA transport/ACL evidence. Generic canonical test frames below
 * intentionally have no approved economic family and are NOT Core replay or
 * admission/actor/consumer authority. Core continuation must reject unknowns. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, it, expect } from 'vitest';
import * as C from '@econmind/core';
import { createPostwarNarrowTradeGoodsFixture } from '../support/postwar-narrow-trade-goods-fixture.js';
import { createCentralBankOmoAtomicFixture } from '../support/postwar-central-bank-omo-atomic-fixture.js';
import { prepareAtomicTransitionCandidate } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import {
  createPostwarBoundedPrefixPageReaderFrom,
  POSTWAR_BOUNDED_PREFIX_PAGE_QUERY,
} from '../../apps/world-worker/src/persistence/postgres-postwar-bounded-prefix-pages.js';
import { readFinanceSocialReplayContinuation as readSourceContinuation } from '../../packages/core/src/commands/finance-social-replay-continuation.js';
import { canonicalSerialize as sourceCanonicalSerialize } from '../../packages/core/src/index.js';
import { createFinanceSocialContinuationFixture } from '../support/finance-social-continuation-fixture.js';
import {
  loadAdoptedCaptainOpeningPolicy,
  createAdoptedCaptainOpeningCandidate,
} from '../../apps/world-worker/src/preparation/postwar-captain-opening-source.js';
import {
  createTestOnlyCaptainPublicationPacket,
  registerAndPublishTestOnlyCaptainFrom,
} from '../support/captain-source-publication-test-only.js';
import {
  createIndustryFirstDayWorkCoreFixture,
  industryWorkTestFrame,
} from '../support/industry-first-day-work-core-fixture.js';
import {
  prepareFinanceSocialReplayContinuation,
  appendFinanceSocialReplayPage,
  retireFinanceSocialReplayContinuation,
} from '@econmind/core/finance-social-replay-continuation';
import {
  createPostwarPagedCurrentProof,
  advancePostwarPagedCurrentProof,
  readPostwarPagedCurrentProof,
  retirePostwarPagedCurrentProof,
} from '../../apps/world-worker/src/persistence/postwar-paged-current-proof.js';
import { createIndustryOperatingWageCanonicalFixture } from '../support/industry-operating-wage-canonical-fixture.js';
import { prepareIndustryOperatingWagePayment } from '../../packages/core/src/commands/industry-operating-wage-payment.js';
import { createFinalCommandReceipt as sourceFinalReceipt } from '../../packages/core/src/index.js';
import { readPostwarIndustryPaidWorkOriginalFrom } from '../../apps/world-worker/src/persistence/postgres-postwar-industry-paid-work-originals.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const read = (p: string) =>
  readFile(new URL('../../database/' + p, import.meta.url), 'utf8');
const at = '2026-11-01T00:00:00.000Z',
  world = 'WORLD_TEST_ONLY_PREFIX_PAGE',
  byteWorld = 'WORLD_TEST_ONLY_PREFIX_BYTES',
  oversizeWorld = 'WORLD_TEST_ONLY_PREFIX_OVERSIZE',
  emptyWorld = 'WORLD_TEST_ONLY_PREFIX_EMPTY';
let db: PGlite;
type Frame = {
  command: C.CanonicalCommand;
  transition: C.AuthoritativeTransition;
  events: readonly C.AuthoritativeEvent[];
  receipt: C.FinalCommandReceipt;
  financialPostingBatches: readonly unknown[];
  inventoryPostings: readonly unknown[];
};
let currentBudgetContext:
  | Readonly<{
      seed: C.OpeningSeed;
      coverage: unknown;
      capital: C.PoliticalCapitalSnapshot;
      positions: readonly {
        account: C.FinancialAccount;
        netDebitBalance: { amount: string; currency: string };
      }[];
    }>
  | undefined;
const scenarios = new Map<
  string,
  { seed: C.OpeningSeed; admission: string; frames: readonly Frame[] }
>();
function frames(
  w: string,
  count: number,
  options: { tripleAt?: number; padding?: number; events?: number } = {},
) {
  let sequence = 0n;
  return Array.from({ length: count }, (_, index) => {
    const c = C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        worldId: w,
        countryId: index % 2 ? 'COUNTRY_02' : 'COUNTRY_01',
        commandId: 'COMMAND_PAGE_' + index,
        idempotencyKey: 'KEY_PAGE_' + index,
        commandType: 'TEST_ONLY_UNKNOWN_PAGE_DATA_V1',
        officeId: 'FINANCE',
        actorId: 'ACTOR_TEST_ONLY_PAGE',
        authSubject: '11111111-1111-4111-8111-111111111111',
        correlationId: 'CORRELATION_PAGE_' + index,
        expectedWorldVersion: String(index),
        simTime: '0',
        submittedAtReal: at,
        payload: {
          notice: 'TEST_ONLY_TRANSPORT_NOT_ECONOMIC_AUTHORITY',
          ordinal: String(index),
        },
      },
      sha,
    );
    const events = Array.from(
      { length: options.events ?? (index === options.tripleAt ? 3 : 1) },
      (_, j) =>
        C.parseAuthoritativeEvent(
          {
            schemaVersion: C.EVENT_SCHEMA_VERSION,
            eventId: 'EVENT_PAGE_' + index + '_' + j,
            eventType: 'TEST_ONLY_UNKNOWN_PAGED_EVENT_V1',
            worldId: w,
            causationCommandId: c.commandId,
            correlationId: c.correlationId,
            worldVersion: String(index + 1),
            sequence: (++sequence).toString(),
            simTime: '0',
            recordedAtReal: at,
            correctsEventId: null,
            payload: {
              ordinal: String(index),
              padding: 'x'.repeat(options.padding ?? 0),
            },
          },
          sha,
        ),
    );
    const transition = C.createAuthoritativeTransition({
      command: c,
      events,
      worldVersionBefore: String(index),
      worldVersionAfter: String(index + 1),
    });
    return {
      command: c,
      events,
      transition,
      receipt: C.createFinalCommandReceipt({
        command: c,
        transition,
        outcome: 'COMMITTED',
        reasonCode: null,
        simTime: c.simTime,
        recordedAtReal: at,
      }),
      financialPostingBatches: [],
      inventoryPostings: [],
    } satisfies Frame;
  });
}
async function install(
  w: string,
  records: readonly Frame[],
  actualSeed?: C.OpeningSeed,
  beforeHistory?: () => Promise<void>,
) {
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_TEST_PAGE'),
      sourceKind: 'TEST_FIXTURE',
      sourceVersion: 'TEST_ONLY_NOT_ADMISSION',
      locator: 'fixture://PREFIX_PAGE_TEST_ONLY',
      payload: { notice: 'TEST_ONLY_EMPTY_LEDGER_TRANSPORT_BASE' },
    },
    sha,
  );
  const seed =
    actualSeed ??
    C.createOpeningSeed(
      {
        schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
        worldId: C.worldId(w),
        seedId: C.openingSeedId('SEED_' + w),
        openingWorldVersion: '0',
        replayBinding: C.CURRENT_REPLAY_BINDING,
        sources: [source],
        financialBatches: [],
        inventoryEntries: [],
      },
      sha,
    );
  const permit = sha(w),
    admission = 'ADMISSION_' + permit.toUpperCase();
  scenarios.set(w, { seed, admission, frames: records });
  await db.query('insert into world_v2.world_head values($1,0,0)', [w]);
  const { fingerprint, ...intent } = seed;
  await db.query(
    'insert into world_v2.opening_seed values($1,$2,0,$3,$4,$5,$6)',
    [
      w,
      seed.seedId,
      C.canonicalSerialize(seed.replayBinding),
      C.canonicalSerialize(intent),
      fingerprint,
      at,
    ],
  );
  await db.query(
    'insert into world_v2.runtime_opening_admission values($1,$2,$3,$4,$5,$6,$7)',
    [
      w,
      seed.seedId,
      seed.fingerprint,
      admission,
      seed.replayBinding.modelVersion,
      C.canonicalSerialize(seed.replayBinding),
      at,
    ],
  );
  await db.query(
    'insert into world_v2.runtime_admission_publication_permit values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      'PERMIT_' + w,
      permit,
      w,
      seed.seedId,
      seed.fingerprint,
      seed.replayBinding.modelVersion,
      C.canonicalSerialize(seed.replayBinding),
      '2026-01-01T00:00:00.000Z',
      '2027-01-01T00:00:00.000Z',
    ],
  );
  await db.query(
    'insert into world_v2.social_operating_source_registration values($1,$2,$3,$4,$5)',
    [w, 'COUNTRY_01', seed.fingerprint, admission, 'SOCIAL_' + w],
  );
  await db.query(
    'insert into world_v2.finance_budget_policy_original values($1,$2,$3,$4,$5)',
    [w, 'COUNTRY_01', seed.fingerprint, admission, 'FINANCE_' + w],
  );
  await beforeHistory?.();
  for (let offset = 0; offset < records.length; offset += 40) {
    const raw = C.canonicalSerialize(records.slice(offset, offset + 40));
    await db.query(
      `insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,country_id,office_id,actor_id,auth_subject,expected_world_version,sim_time,canonical_payload,payload_sha256,command_fingerprint,correlation_id,submitted_at_real)select c->>'worldId',c->>'commandId',c->>'idempotencyKey',c->>'commandType',c->>'schemaVersion',c->>'countryId',c->>'officeId',c->>'actorId',(c->>'authSubject')::uuid,(c->>'expectedWorldVersion')::bigint,(c->>'simTime')::bigint,c->>'canonicalPayload',c->>'payloadHash',c->>'fingerprint',c->>'correlationId',(c->>'submittedAtReal')::timestamptz from jsonb_array_elements($1::jsonb)f cross join lateral(select f->'command'c)x`,
      [raw],
    );
    await db.query(
      `insert into world_v2.authoritative_event(world_id,event_id,event_type,schema_version,causation_command_id,correlation_id,world_version,event_sequence,sim_time,recorded_at_real,corrects_event_id,canonical_payload,payload_sha256,event_fingerprint)select e->>'worldId',e->>'eventId',e->>'eventType',e->>'schemaVersion',e->>'causationCommandId',e->>'correlationId',(e->>'worldVersion')::bigint,(e->>'sequence')::bigint,(e->>'simTime')::bigint,(e->>'recordedAtReal')::timestamptz,e->>'correctsEventId',e->>'canonicalPayload',e->>'payloadHash',e->>'fingerprint'from jsonb_array_elements($1::jsonb)f cross join lateral jsonb_array_elements(f->'events')e`,
      [raw],
    );
    await db.query(
      `insert into world_v2.command_receipt(world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,reason_code,transition_id,world_version_before,world_version_after,sim_time,event_ids,recorded_at_real)select r->>'worldId',r->>'commandId',r->>'idempotencyKey',r->>'schemaVersion',r->>'commandFingerprint',r->>'outcome',r->>'reasonCode',r->>'transitionId',(r->>'worldVersionBefore')::bigint,(r->>'worldVersionAfter')::bigint,(r->>'simTime')::bigint,r->'eventIds',(r->>'recordedAtReal')::timestamptz from jsonb_array_elements($1::jsonb)f cross join lateral(select f->'receipt'r)x`,
      [raw],
    );
  }
  for (const frame of records) {
    for (const posting of frame.financialPostingBatches) {
      const raw = JSON.parse(C.canonicalSerialize(posting)) as Record<
        string,
        unknown
      >;
      const { fingerprint, ...body } = raw;
      await db.query(
        'insert into world_v2.financial_posting_batch(world_id,batch_id,causation_command_id,world_version_before,world_version_after,sim_time,event_ids,transition_binding,settlement_currency,canonical_payload,batch_fingerprint)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [
          w,
          raw.batchId,
          raw.causationCommandId,
          raw.worldVersionBefore,
          raw.worldVersionAfter,
          raw.simTime,
          JSON.stringify(raw.causationEventIds),
          C.canonicalSerialize(raw.transitionBinding),
          raw.settlementCurrency,
          C.canonicalSerialize(body),
          fingerprint,
        ],
      );
    }
    for (const posting of frame.inventoryPostings) {
      const raw = JSON.parse(C.canonicalSerialize(posting)) as Record<
        string,
        unknown
      >;
      const { fingerprint, ...body } = raw;
      await db.query(
        'insert into world_v2.inventory_posting(world_id,posting_id,causation_command_id,world_version_before,world_version_after,sim_time,event_ids,transition_binding,operation,canonical_payload,posting_fingerprint)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [
          w,
          raw.postingId,
          raw.causationCommandId,
          raw.worldVersionBefore,
          raw.worldVersionAfter,
          raw.simTime,
          JSON.stringify(raw.causationEventIds),
          C.canonicalSerialize(raw.transitionBinding),
          raw.operation,
          C.canonicalSerialize(body),
          fingerprint,
        ],
      );
    }
  }
  await db.query(
    'update world_v2.world_head set world_version=$2,event_sequence=$3 where world_id=$1',
    [w, String(records.length), records.at(-1)?.events.at(-1)?.sequence ?? '0'],
  );
}
const scope = (w = world) => ({
  worldId: w,
  countryId: 'COUNTRY_01',
  officeId: 'SOCIAL' as const,
  seedFingerprint: scenarios.get(w)!.seed.fingerprint,
  admissionRef: scenarios.get(w)!.admission,
});
const executor: SqlExecutor = {
  async query<T extends object>(q: string, args: readonly unknown[] = []) {
    const r = await db.query<T>(q, [...args]);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  },
};
async function begin(
  role = 'world_v2_social_source_reader',
  isolation = 'repeatable read',
) {
  await db.exec(
    'begin isolation level ' + isolation + ';set local role ' + role,
  );
}
async function rollback() {
  await db.exec('rollback');
}
async function direct(
  args: unknown[],
  role = 'world_v2_social_source_reader',
  isolation = 'repeatable read',
) {
  await begin(role, isolation);
  try {
    return await executor.query(POSTWAR_BOUNDED_PREFIX_PAGE_QUERY, args);
  } finally {
    await rollback();
  }
}
beforeAll(async () => {
  db = new PGlite();
  for (const id of [
    '0001_world_v2_namespace',
    '0002_world_v2_command_event_ledger',
    '0003_world_v2_command_receipts_outbox',
    '0005_world_v2_writer_lease_fencing',
    '0007_world_v2_atomic_transition_facts',
    '0009_world_v2_posting_payload_integrity',
    '0011_world_v2_current_commit_authorization',
    '0016_world_v2_opening_seed',
  ])
    await db.exec(await read('migrations/artifacts/' + id + '.sql'));
  await db.exec(
    await read('proposals/financial-posting-decimal-validation.sql'),
  );
  await db.exec(`create role world_v2_social_source_reader nologin nosuperuser nobypassrls;create role world_v2_finance_budget_source_reader nologin nosuperuser nobypassrls;create role world_v2_day_one_fx_source_reader nologin nosuperuser nobypassrls;
 grant usage on schema world_v2 to world_v2_social_source_reader,world_v2_finance_budget_source_reader,world_v2_day_one_fx_source_reader;
 create table world_v2.runtime_opening_admission(world_id text,seed_id text,seed_fingerprint text,admission_ref text,model_version text,replay_binding text,admitted_at_real timestamptz);
 create table world_v2.runtime_admission_publication_permit(authorization_id text,authorization_sha256 text,world_id text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,valid_from timestamptz,valid_until timestamptz);
 create table world_v2.runtime_admission_publication_revocation(authorization_id text);
 create table world_v2.runtime_read_seat(world_id text,auth_subject uuid);create table world_v2.projection_entitlement(world_id text);
 create table world_v2.postwar_day_one_fx_source_original(world_id text,registration_ref text,seed_id text,seed_fingerprint text,admission_ref text,policy_sha256 text,user_receipt_sha256 text);
 create table world_v2.postwar_day_one_fx_quote_original(world_id text,country_id text,quote_ref text,source_revision text,quote_text text,quote_text_sha256 text);
 create table world_v2.postwar_day_one_fx_source_revocation(registration_ref text);create table world_v2.postwar_day_one_fx_quote_revocation(quote_ref text);
 create table world_v2.social_operating_source_registration(world_id text,country_id text,seed_fingerprint text,admission_ref text,registration_ref text);create table world_v2.social_operating_source_revocation(registration_ref text);
 create table world_v2.finance_budget_policy_original(world_id text,country_id text,seed_fingerprint text,admission_ref text,policy_ref text);create table world_v2.finance_budget_policy_revocation(policy_ref text);`);
  for (const p of [
    'postwar-day-one-fx-history-read',
    'postwar-bounded-journal-read',
    'postwar-bounded-prefix-read',
    'postwar-bounded-prefix-pages',
  ])
    await db.exec(await read('proposals/' + p + '.sql'));
  await db.exec(
    'create role world_v2_admission_release nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication',
  );
  await db.exec('grant usage on schema world_v2 to world_v2_admission_release');
  await db.exec(await read('proposals/captain-operating-custody.sql'));
  await db.exec(await read('proposals/postwar-captain-source-publication.sql'));
  await db.exec(
    "create policy test_only_captain_permit_lock on world_v2.runtime_admission_publication_permit for update to world_v2_captain_source_owner using(world_id=current_setting('econmind.captain_world',true))with check(false)",
  );
  for (const table of [
    'world_head',
    'opening_seed',
    'runtime_opening_admission',
    'runtime_admission_publication_permit',
    'command_submission',
    'command_receipt',
    'authoritative_event',
    'financial_posting_batch',
    'inventory_posting',
    'social_operating_source_registration',
    'finance_budget_policy_original',
  ])
    await db.exec(
      'alter table world_v2.' +
        table +
        ' enable row level security;alter table world_v2.' +
        table +
        ' force row level security',
    );
  // Permit/revocation metadata already receives SELECT in history, but the
  // original fixture deliberately had no public RLS. Add exact TEST_ONLY owner
  // permit visibility only, not operational reader SELECT.
  await db.exec(
    "create policy test_only_page_permit on world_v2.runtime_admission_publication_permit to world_v2_day_one_fx_history_owner using(world_id=current_setting('econmind.fx_history_world',true))with check(false)",
  );
  await install(world, frames(world, 300, { tripleAt: 254 }));
  await install(byteWorld, frames(byteWorld, 32, { padding: 18000 }));
  await install(
    oversizeWorld,
    frames(oversizeWorld, 1, { padding: 60000, events: 10 }),
  );
  await install(emptyWorld, []);
});
afterAll(async () => {
  await db?.close();
});
it('streams >256 global events without splitting a three-event transition, skipping foreign countries or rebuilding external state', async () => {
  await begin();
  try {
    const reader = createPostwarBoundedPrefixPageReaderFrom(executor, scope()),
      pages = [];
    for (;;) {
      const page = await reader.readNext();
      if (!page) break;
      pages.push(page);
      expect(
        Buffer.byteLength(C.canonicalSerialize(page.frames)),
      ).toBeLessThanOrEqual(1048576);
      expect(page.framesSha256).toBe(
        C.canonicalSha256(C.canonicalHashInput(page.frames), sha),
      );
    }
    expect(pages).toHaveLength(2);
    expect(pages[0]!.throughHead).toEqual({
      worldVersion: '254',
      eventSequence: '254',
    });
    expect(pages[1]!.fromHead).toEqual(pages[0]!.throughHead);
    expect(pages[1]!.throughHead).toEqual({
      worldVersion: '300',
      eventSequence: '302',
    });
    const all = pages.flatMap((p) => p.frames);
    expect(C.canonicalSerialize(all)).toBe(
      C.canonicalSerialize(scenarios.get(world)!.frames),
    );
    expect(all.some((f) => f.command.countryId === 'COUNTRY_02')).toBe(true);
    expect(reader.inspect()).toMatchObject({ complete: true, pages: '2' });
  } finally {
    await rollback();
  }
});
it('uses real frame-byte pages and a checked zero-history page without raising either limit', async () => {
  for (const w of [byteWorld, emptyWorld]) {
    await begin();
    try {
      const reader = createPostwarBoundedPrefixPageReaderFrom(
        executor,
        scope(w),
      );
      let count = 0,
        pages = 0;
      for (;;) {
        const page = await reader.readNext();
        if (!page) break;
        count += page.frames.length;
        pages++;
        expect(
          Buffer.byteLength(C.canonicalSerialize(page.frames)),
        ).toBeLessThanOrEqual(1048576);
      }
      expect(count).toBe(scenarios.get(w)!.frames.length);
      expect(pages).toBe(w === emptyWorld ? 1 : 2);
    } finally {
      await rollback();
    }
  }
});
it('refuses mid-transition/stale/cross-source cursors, unknown reader modes, READ COMMITTED and raw table access', async () => {
  const s = scope();
  const args = [
    world,
    'COUNTRY_01',
    'SOCIAL',
    '0',
    '0',
    null,
    null,
    s.seedFingerprint,
    s.admissionRef,
  ];
  await expect(
    direct([
      ...args.slice(0, 3),
      '255',
      '255',
      '300',
      '302',
      s.seedFingerprint,
      s.admissionRef,
    ]),
  ).rejects.toThrow('PREFIX_PAGE_CURSOR_INSIDE_OR_OUTSIDE_TRANSITION');
  await expect(
    direct([...args.slice(0, 5), '299', '301', ...args.slice(7)]),
  ).rejects.toThrow('PREFIX_PAGE_HELD_HEAD_OR_ADMISSION_CHANGED');
  await expect(direct([world, 'COUNTRY_02', ...args.slice(2)])).rejects.toThrow(
    'JOURNAL_CURRENT_HOST_SOURCE_REVOKED',
  );
  await expect(
    direct(args, 'world_v2_day_one_fx_source_reader'),
  ).rejects.toThrow();
  await expect(
    direct(args, 'world_v2_social_source_reader', 'read committed'),
  ).rejects.toThrow('PREFIX_PAGE_HELD_REPEATABLE_TRANSACTION_REQUIRED');
  await begin();
  try {
    await expect(
      executor.query('select canonical_payload from world_v2.opening_seed'),
    ).rejects.toThrow('permission denied');
  } finally {
    await rollback();
  }
  const big = scope(oversizeWorld);
  await expect(
    direct([
      oversizeWorld,
      'COUNTRY_01',
      'SOCIAL',
      '0',
      '0',
      null,
      null,
      big.seedFingerprint,
      big.admissionRef,
    ]),
  ).rejects.toThrow('PREFIX_PAGE_OVERSIZE_TRANSITION_JOURNAL');
});
it('will not resume a private cursor in another database transaction', async () => {
  const reader = createPostwarBoundedPrefixPageReaderFrom(executor, scope());
  await begin();
  try {
    expect((await reader.readNext())!.throughHead.worldVersion).toBe('254');
  } finally {
    await rollback();
  }
  await begin();
  try {
    await expect(reader.readNext()).rejects.toThrow(
      'TRANSACTION_OR_IMMUTABLE_SOURCE_PINS_CHANGED',
    );
    expect(reader.inspect().throughHead.worldVersion).toBe('254');
  } finally {
    await rollback();
  }
});

it('preserves actual Core/Atomic inventory and financial posting bodies, metadata and global journal totals', async () => {
  const actual: { seed: C.OpeningSeed; frame: Frame }[] = [];
  const goods = await createPostwarNarrowTradeGoodsFixture();
  try {
    const draft = await goods.runtime.candidateFactory.prepare({
      command: goods.c.command,
      commitAuthorization: goods.c.proof,
      observedAtReal: goods.c.at,
    });
    expect(
      (
        await goods.repository.commit(
          prepareAtomicTransitionCandidate({
            command: goods.c.command,
            commitAuthorization: goods.c.proof,
            draft,
            sha256Hex: sha,
          }),
        )
      ).receipt.outcome,
    ).toBe('COMMITTED');
    actual.push({
      seed: goods.seed,
      frame: {
        command: goods.c.command,
        transition: draft.transition,
        events: draft.transition.events,
        receipt: draft.receipt,
        financialPostingBatches: draft.financialPostingBatches,
        inventoryPostings: draft.inventoryPostings,
      },
    });
  } finally {
    await goods.close();
  }
  const omo = await createCentralBankOmoAtomicFixture();
  try {
    const { draft } = await omo.prepareDraft();
    expect(
      (await omo.execution.executeQueuedCommand(omo.input)).receipt.outcome,
    ).toBe('COMMITTED');
    actual.push({
      seed: omo.seed,
      frame: {
        command: omo.command,
        transition: draft.transition,
        events: draft.transition.events,
        receipt: draft.receipt,
        financialPostingBatches: draft.financialPostingBatches,
        inventoryPostings: draft.inventoryPostings,
      },
    });
  } finally {
    await omo.db.close();
  }
  for (const sample of actual) {
    await install(sample.seed.worldId, [sample.frame], sample.seed);
    await begin();
    try {
      const reader = createPostwarBoundedPrefixPageReaderFrom(
        executor,
        scope(sample.seed.worldId),
      );
      const page = await reader.readNext();
      expect(C.canonicalSerialize(page!.frames)).toBe(
        C.canonicalSerialize([sample.frame]),
      );
      expect(await reader.readNext()).toBeNull();
      expect(reader.inspect().complete).toBe(true);
    } finally {
      await rollback();
    }
  }
});

// New SQL entries below use the same official economic tables. H0 projection
// metadata is an explicit TEST_ONLY seam; it is not a production publication.
it('restricts the private MATCH page entry to the fixed publishing role and exact Social host', async () => {
  await db.exec(`create role world_v2_social_source_owner nologin nosuperuser nobypassrls;
    create role world_v2_social_source_publisher nologin nosuperuser nobypassrls;
    grant usage on schema world_v2 to world_v2_social_source_owner,world_v2_social_source_publisher;`);
  await db.exec(await read('proposals/postwar-social-match-prefix-pages.sql'));
  expect(
    (
      await db.query<{ allowed: boolean }>(
        `select has_function_privilege('world_v2_social_source_reader','world_v2.read_postwar_social_match_prefix_page(text,text,bigint,bigint,bigint,bigint,text,text)','EXECUTE') as allowed`,
      )
    ).rows[0]!.allowed,
  ).toBe(false);
  await db.exec(`create function world_v2.test_only_match_page_entry(text,text,bigint,bigint,bigint,bigint,text,text) returns jsonb language sql security definer set search_path=pg_catalog as $$select to_jsonb(x)from world_v2.read_postwar_social_match_prefix_page($1,$2,$3,$4,$5,$6,$7,$8)x$$;
    alter function world_v2.test_only_match_page_entry(text,text,bigint,bigint,bigint,bigint,text,text)owner to world_v2_social_source_owner;
    revoke all on function world_v2.test_only_match_page_entry(text,text,bigint,bigint,bigint,bigint,text,text)from public;
    grant execute on function world_v2.test_only_match_page_entry(text,text,bigint,bigint,bigint,bigint,text,text)to world_v2_social_source_publisher,world_v2_social_source_reader;`);
  const scenario = scenarios.get(world)!,
    args = [
      world,
      'COUNTRY_01',
      '0',
      '0',
      '300',
      '302',
      scenario.seed.fingerprint,
      scenario.admission,
    ];
  await begin('world_v2_social_source_publisher');
  try {
    const value = (
      await db.query<{ value: { frame_count: string; office_id: string } }>(
        'select world_v2.test_only_match_page_entry($1,$2,$3,$4,$5,$6,$7,$8) as value',
        args,
      )
    ).rows[0]!.value;
    expect(value.frame_count).toBe('254');
    expect(value.office_id).toBe('SOCIAL_MATCH');
  } finally {
    await rollback();
  }
  await begin();
  try {
    await expect(
      db.query(
        'select world_v2.test_only_match_page_entry($1,$2,$3,$4,$5,$6,$7,$8)',
        args,
      ),
    ).rejects.toThrow('JOURNAL_FIXED_SOURCE_READER_REQUIRED');
  } finally {
    await rollback();
  }
});

it('independently verifies complete page chains over 257 actual Core Budget transitions with no raw publisher reads', async () => {
  const w = 'WORLD_FX_TEST_ONLY',
    admissionRef = 'ADMISSION_' + sha(w).toUpperCase(),
    probe = createFinanceSocialContinuationFixture({ admissionRef }),
    adopted = await loadAdoptedCaptainOpeningPolicy(
      new URL('../../', import.meta.url).pathname,
    ),
    candidate = createAdoptedCaptainOpeningCandidate(adopted, {
      worldId: w,
      seedId: probe.f.seed.seedId,
      seedFingerprint: probe.f.seed.fingerprint,
      worldAdmissionRef: admissionRef,
      countryIds: Array.from(
        { length: 70 },
        (_, i) => 'COUNTRY_' + String(i + 1).padStart(2, '0'),
      ),
    }),
    capital = C.validatePoliticalCapitalSnapshot(
      JSON.parse(candidate.packets[0]!.genesis.canonicalPayload).capital,
    ),
    f = createFinanceSocialContinuationFixture({
      admissionRef,
      captainCountries: [{ countryId: 'COUNTRY_01', capital }],
    }),
    records: Awaited<ReturnType<typeof f.budget>>[] = [];
  let cursor = f.start({ worldVersion: '257', eventSequence: '257' });
  for (let n = 0; n < 257; n++) {
    const frame = await f.budget(cursor, 'VERIFY_' + n);
    records.push(frame);
    cursor = f.append(cursor, [frame]);
  }
  // Core/src test issuers and package/dist issuers are distinct. Persist only
  // canonical DATA across that boundary, then genuinely parse the package seed.
  const persisted = JSON.parse(sourceCanonicalSerialize(records)) as Frame[];
  const parsedSeed = C.parseOpeningSeed(
    JSON.parse(sourceCanonicalSerialize(f.f.seed)),
    sha,
  );
  await install(w, persisted, parsedSeed, async () => {
    // Real approved numeric policy, but source issuer/admission/reason remain
    // explicit TEST_ONLY. This is not the official70-scope adoption procedure.
    const packet = createTestOnlyCaptainPublicationPacket({
      worldId: w,
      countryId: 'COUNTRY_01',
      seedId: parsedSeed.seedId,
      seedFingerprint: parsedSeed.fingerprint,
      worldAdmissionRef: admissionRef,
      capital,
      reasonFactRef: 'REASON_TEST_ONLY_COUNTRY_01',
      reasonRecordRef: 'RECORD_TEST_ONLY_COUNTRY_01',
      reason:
        'TEST_ONLY allocation reason; not an official governance decision',
    });
    expect(
      (
        await db.query<{ n: number }>(
          'select world_version::int as n from world_v2.world_head where world_id=$1',
          [w],
        )
      ).rows[0]!.n,
    ).toBe(0);
    await db.exec('set role world_v2_admission_release');
    try {
      await registerAndPublishTestOnlyCaptainFrom(executor, packet);
    } finally {
      await db.exec('reset role');
    }
  });
  const coreCurrent = readSourceContinuation(cursor);
  expect(coreCurrent.complete).toBe(true);
  expect(coreCurrent.result.financialState!.worldVersion).toBe('257');
  const currentPositions = JSON.parse(
    sourceCanonicalSerialize(coreCurrent.result.financialState!.positions),
  ) as {
    account: C.FinancialAccount;
    netDebitBalance: { amount: string; currency: string };
  }[];
  expect(
    sourceCanonicalSerialize(coreCurrent.result.financialState!.positions),
  ).toBe(sourceCanonicalSerialize(f.opening.financial.positions));

  // Explicit TEST_ONLY H0 metadata seam. Economic frames and their arithmetic
  // above are genuine Core output; this seam grants no production admission.
  await db.exec(`create role world_v2_postwar_projection_owner nologin nosuperuser nobypassrls;
  create role world_v2_postwar_projection_publisher nologin nosuperuser nobypassrls;
  create role world_v2_postwar_projection_reader nologin nosuperuser nobypassrls;
  grant usage on schema world_v2 to world_v2_postwar_projection_owner,world_v2_postwar_projection_publisher,world_v2_postwar_projection_reader;
  create table world_v2.postwar_social_prefix_scope(world_id text,country_id text,scope_document text,scope_sha256 text,seed_fingerprint text,admission_ref text,source_bundle_sha256 text,canonical_seed_sha256 text,source_id text,source_payload_hash text);
  create table world_v2.postwar_office_projection_document(document_ref text primary key,world_id text,country_id text,office_id text,dataset text,world_version bigint default 0,event_sequence bigint default 0,source_pointer jsonb,source_bundle_sha256 text,seed_fingerprint text,admission_ref text,seed_id text,canonical_seed_sha256 text,source_id text,source_payload_hash text,projection_version text,page_count integer,total_rows integer,document_sha256 text,source_version text,unique(document_ref,world_id));
  create table world_v2.postwar_office_projection_page(document_ref text,world_id text,page_index integer,row_count integer,row_offset integer,rows_text text,page_sha256 text);
  create table world_v2.postwar_office_projection_revocation(world_id text,document_ref text);
  create function world_v2.postwar_projection_admission_header(text)returns table(world_id text,seed_id text,seed_fingerprint text,admission_ref text,source_bundle_sha256 text,model_version text,replay_binding text)language sql security definer set search_path=pg_catalog as $$select a.world_id,a.seed_id,a.seed_fingerprint,a.admission_ref,repeat('b',64),a.model_version,a.replay_binding from world_v2.runtime_opening_admission a where a.world_id=$1$$;
  revoke all on function world_v2.postwar_projection_admission_header(text)from public;
  grant execute on function world_v2.postwar_projection_admission_header(text)to world_v2_postwar_projection_owner;`);
  const treasury = f.f.accounts.treasuryAsset;
  await db.query(
    'insert into world_v2.postwar_social_prefix_scope(world_id,country_id,scope_document)values($1,$2,$3)',
    [
      w,
      'COUNTRY_01',
      C.canonicalSerialize({
        funding: [
          {
            payerRole: 'GOV',
            accountRef: treasury.accountId,
            claimId: treasury.claimId,
            payerEntityId: treasury.ownerId,
            currency: treasury.currency,
          },
        ],
      }),
    ],
  );
  for (const [office, dataset] of [
    ['SOCIAL', 'positions'],
    ['SOCIAL', 'service-pools'],
    ['FINANCE', 'opening-financial-legs'],
  ])
    await db.query(
      'insert into world_v2.postwar_office_projection_document(document_ref,world_id,country_id,office_id,dataset,source_pointer,source_bundle_sha256,seed_fingerprint,admission_ref)values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        'TEST_ONLY_' + office + '_' + dataset,
        w,
        'COUNTRY_01',
        office,
        dataset,
        C.canonicalSerialize({
          financialSourceId: f.f.seed.sources[0]!.sourceId,
        }),
        'b'.repeat(64),
        f.f.seed.fingerprint,
        admissionRef,
      ],
    );
  for (const table of [
    'world_head',
    'runtime_admission_publication_permit',
    'command_submission',
    'command_receipt',
    'authoritative_event',
    'financial_posting_batch',
    'inventory_posting',
    'postwar_social_prefix_scope',
    'postwar_office_projection_document',
    'postwar_office_projection_page',
    'postwar_office_projection_revocation',
  ])
    await db.exec(
      `grant select on world_v2.${table} to world_v2_postwar_projection_owner;create policy test_only_projection_owner on world_v2.${table} for select to world_v2_postwar_projection_owner using(world_id=current_setting('econmind.postwar_projection_world',true))`,
    );
  await db.exec(
    'grant update on world_v2.world_head,world_v2.runtime_admission_publication_permit,world_v2.postwar_office_projection_document to world_v2_postwar_projection_owner',
  );
  for (const table of [
    'world_head',
    'runtime_admission_publication_permit',
    'postwar_office_projection_document',
  ])
    await db.exec(
      `create policy test_only_projection_lock on world_v2.${table} for update to world_v2_postwar_projection_owner using(world_id=current_setting('econmind.postwar_projection_world',true))with check(false)`,
    );
  await db.exec(
    'grant select on world_v2.runtime_admission_publication_revocation to world_v2_postwar_projection_owner',
  );
  const main = await read(
    'proposals/postwar-mixed-current-projection-read.sql',
  );
  await db.exec(
    main.slice(
      main.indexOf('create function world_v2.postwar_mixed_fx_group('),
      main.indexOf(
        'create function world_v2.postwar_write_mixed_current_document(',
      ),
    ),
  );
  await db.exec(
    main.slice(
      main.indexOf('grant create on schema world_v2'),
      main.indexOf('create function world_v2.postwar_mixed_fx_group('),
    ),
  );
  await db.exec(`    alter table world_v2.postwar_office_projection_document add column source_revision text default 'TEST_ONLY_H0';
    alter table world_v2.postwar_office_projection_document add column model_version text;
    alter table world_v2.postwar_office_projection_document add column replay_binding text;`);
  const captainSql = await read(
    'proposals/postwar-captain-current-derived-read.sql',
  );
  await db.exec(captainSql);
  const socialSql = await read(
    'proposals/postwar-social-current-prefix-read.sql',
  );
  await db.exec(
    socialSql.slice(
      socialSql.indexOf(
        'create function world_v2.postwar_social_origin_at_prefix(',
      ),
      socialSql.indexOf(
        'create function world_v2.publish_postwar_social_current_prefix_projection(',
      ),
    ),
  );
  await db.exec(`grant select on world_v2.current_materialization to world_v2_postwar_projection_owner;
    grant update on world_v2.postwar_social_prefix_scope to world_v2_postwar_projection_owner;`);
  const scopeRows = {
      countryId: 'COUNTRY_01',
      positions: f.social.state.labour.positions,
      servicePools: f.social.state.servicePools,
      funding: [
        {
          payerRole: 'GOV',
          accountRef: treasury.accountId,
          claimId: treasury.claimId,
          payerEntityId: treasury.ownerId,
          currency: treasury.currency,
        },
      ],
    },
    scopeRaw = sourceCanonicalSerialize(scopeRows);
  await db.query(
    'update world_v2.postwar_social_prefix_scope set scope_document=$2,scope_sha256=$3,seed_fingerprint=$4,admission_ref=$5,source_bundle_sha256=$6 where world_id=$1',
    [
      w,
      scopeRaw,
      sha(scopeRaw),
      f.f.seed.fingerprint,
      admissionRef,
      'b'.repeat(64),
    ],
  );
  await db.query(
    'update world_v2.postwar_office_projection_document set seed_id=$2,canonical_seed_sha256=$3,model_version=$4,replay_binding=$5 where world_id=$1',
    [
      w,
      f.f.seed.seedId,
      'c'.repeat(64),
      f.f.seed.replayBinding.modelVersion,
      sourceCanonicalSerialize(f.f.seed.replayBinding),
    ],
  );
  await db
    .exec(await read('proposals/postwar-paged-current-projection.sql'))
    .catch((error: unknown) => {
      const e = error as {
        position?: string;
        internalPosition?: string;
        where?: string;
        internalQuery?: string;
      };
      console.error(
        'PAGED_DDL_DIAGNOSTIC',
        JSON.stringify({
          position: e.position,
          internalPosition: e.internalPosition,
          where: e.where,
        }),
      );
      throw error;
    });
  await db.exec(await read('proposals/postwar-source-revocation-fence.sql'));
  await db.exec(
    `create function world_v2.test_only_paged_verify(text,text,jsonb)returns jsonb language sql security definer set search_path=pg_catalog as $$select to_jsonb(p)from world_v2.verify_postwar_paged_current_coverage($1,$2,$3)p$$;alter function world_v2.test_only_paged_verify(text,text,jsonb)owner to world_v2_postwar_projection_owner;revoke all on function world_v2.test_only_paged_verify(text,text,jsonb)from public;grant execute on function world_v2.test_only_paged_verify(text,text,jsonb)to world_v2_postwar_projection_publisher;`,
  );
  const pages: Frame[][] = [];
  await begin();
  try {
    const reader = createPostwarBoundedPrefixPageReaderFrom(executor, scope(w));
    for (
      let page = await reader.readNext();
      page;
      page = await reader.readNext()
    )
      pages.push([...page.frames]);
  } finally {
    await rollback();
  }
  const hash = (v: unknown) => C.canonicalSha256(C.canonicalHashInput(v), sha),
    expectedHead = { worldVersion: '257', eventSequence: '257' },
    origin = {
      worldId: w,
      seedFingerprint: f.f.seed.fingerprint,
      expectedHead,
    };
  let prefix = hash({
      schemaVersion: 'finance-social-replay-origin-v1',
      ...origin,
    }),
    effects = hash({
      schemaVersion: 'postwar-effects-page-origin-v1',
      ...origin,
    }),
    journal = hash({
      schemaVersion: 'postwar-financial-page-origin-v1',
      ...origin,
    }),
    fromHead = { worldVersion: '0', eventSequence: '0' };
  for (const page of pages) {
    const last = page.at(-1)!,
      throughHead = {
        worldVersion: last.transition.worldVersionAfter,
        eventSequence: last.events.at(-1)!.sequence,
      },
      anchor = { ...origin, fromHead, throughHead };
    prefix = hash({
      schemaVersion: 'finance-social-replay-page-chain-v1',
      previous: prefix,
      ...anchor,
      framesSha256: hash(page),
    });
    effects = hash({
      schemaVersion: 'postwar-effects-page-chain-v1',
      previous: effects,
      ...anchor,
      effects: page.map((f) => ({
        commandId: f.command.commandId,
        countryId: f.command.countryId,
        commandType: f.command.commandType,
        transitionFingerprint: hash(f.transition),
        receiptFingerprint: hash(f.receipt),
        eventFingerprints: f.events.map((e) => e.fingerprint),
        worldVersionBefore: f.transition.worldVersionBefore,
        worldVersionAfter: f.transition.worldVersionAfter,
        events: f.events.map((e) => ({
          eventId: e.eventId,
          fingerprint: e.fingerprint,
          sequence: e.sequence,
          worldVersion: e.worldVersion,
        })),
      })),
    });
    journal = hash({
      schemaVersion: 'postwar-financial-page-chain-v1',
      previous: journal,
      ...anchor,
      batches: page.flatMap((f) => f.financialPostingBatches),
    });
    fromHead = throughHead;
  }
  const last = records.at(-1)!.events.at(-1)!,
    coverage = {
      prefixFingerprint: prefix,
      knownEffectsFingerprint: effects,
      coveredThroughEventId: last.eventId,
      coveredThroughEventFingerprint: last.fingerprint,
      financialPostingCount: '0',
      financialBatchCount: '0',
      financialPostingsFingerprint: journal,
      pageProof: {
        schemaVersion: 'postwar-complete-page-proof-v1',
        hashAlgorithm: 'COMPLETE_CANONICAL_PAGE_CHAINS_SHA256_V1',
        pageCount: pages.length.toString(),
        frameCount: '257',
      },
    };
  expect(pages.length).toBeGreaterThan(1);
  currentBudgetContext = Object.freeze({
    seed: parsedSeed,
    coverage,
    positions: Object.freeze(currentPositions),
    capital,
  });
  const verify = () =>
    db.query<{
      value: { prefix_fingerprint: string; budget_envelopes: unknown[] };
    }>('select world_v2.test_only_paged_verify($1,$2,$3)as value', [
      w,
      'COUNTRY_01',
      C.canonicalSerialize(coverage),
    ]);
  await begin('world_v2_postwar_projection_publisher');
  try {
    const value = (
      await verify().catch((error: unknown) => {
        console.error('PAGED_VERIFY_DIAGNOSTIC', error);
        throw error;
      })
    ).rows[0]!.value;
    expect(value.prefix_fingerprint).toBe(prefix);
    expect(value.budget_envelopes).toHaveLength(257);
  } finally {
    await rollback();
  }
  await begin('world_v2_postwar_projection_publisher');
  try {
    await expect(
      db.query('select canonical_payload from world_v2.opening_seed'),
    ).rejects.toThrow('permission denied');
  } finally {
    await rollback();
  }
  await begin('world_v2_postwar_projection_publisher');
  try {
    await expect(
      db.query('select world_v2.test_only_paged_verify($1,$2,$3)', [
        w,
        'COUNTRY_01',
        C.canonicalSerialize({
          ...coverage,
          prefixFingerprint: 'sha256:' + 'f'.repeat(64),
        }),
      ]),
    ).rejects.toThrow('PAGED_CURRENT_CORE_SQL_COMPLETE_COVERAGE_MISMATCH');
  } finally {
    await rollback();
  }
  await begin('world_v2_postwar_projection_publisher', 'read committed');
  try {
    await expect(verify()).rejects.toThrow(
      'PAGED_HELD_REPEATABLE_PUBLICATION_REQUIRED',
    );
  } finally {
    await rollback();
  }
  await db.exec(`create function world_v2.read_postwar_office_projection_seats(p_world text)returns table(world_id text,country_id text,office_id text,auth_subject text,team_id text,authorization_revision text,scope_key text,seat_ref text,seed_id text,seed_fingerprint text,admission_ref text,source_bundle_sha256 text,model_version text,replay_binding text,world_version text,event_sequence text)language plpgsql security definer set search_path=pg_catalog as $$begin
    perform set_config('econmind.postwar_projection_world',p_world,true);
    if current_setting('role')<>'world_v2_postwar_projection_reader'or p_world<>'WORLD_FX_TEST_ONLY'then return;end if;
    return query select a.world_id,'COUNTRY_01'::text,o.office,'11111111-1111-4111-8111-111111111111'::text,'TEAM_TEST_ONLY'::text,'REV_TEST_ONLY'::text,'SCOPE_TEST_ONLY'::text,'SEAT_TEST_ONLY'::text,a.seed_id,a.seed_fingerprint,a.admission_ref,repeat('b',64),a.model_version,a.replay_binding,h.world_version::text,h.event_sequence::text from world_v2.runtime_opening_admission a join world_v2.world_head h using(world_id)cross join(values('SOCIAL'::text),('CAPTAIN'::text),('FINANCE'::text),('CENTRAL_BANK'::text))o(office)where a.world_id=p_world;
    end;$$;revoke all on function world_v2.read_postwar_office_projection_seats(text)from public;grant execute on function world_v2.read_postwar_office_projection_seats(text)to world_v2_postwar_projection_owner;`);
  const assertion = {
    head: { worldId: w, ...expectedHead },
    seedPins: {
      worldId: w,
      seedId: f.f.seed.seedId,
      seedFingerprint: f.f.seed.fingerprint,
      admissionRef,
    },
    coverage,
    employmentStateHash: hash(
      JSON.parse(sourceCanonicalSerialize(f.social.state)),
    ),
    materializationHash: hash(
      JSON.parse(sourceCanonicalSerialize(f.social.state)),
    ),
    positionsHash: hash(
      JSON.parse(sourceCanonicalSerialize(f.social.state.labour.positions)),
    ),
    servicePoolsHash: hash(
      JSON.parse(sourceCanonicalSerialize(f.social.state.servicePools)),
    ),
  };
  await begin('world_v2_postwar_projection_publisher');
  let published: {
    document_ref: string;
    source_version: string;
    coverage: unknown;
  }[];
  try {
    published = (
      await db.query<{
        document_ref: string;
        source_version: string;
        coverage: unknown;
      }>(
        'select * from world_v2.publish_postwar_paged_social_current($1,$2,$3)',
        [w, 'COUNTRY_01', C.canonicalSerialize(assertion)],
      )
    ).rows;
    expect(published).toHaveLength(2);
    await db.exec('commit');
  } catch (error) {
    await rollback();
    throw error;
  }
  expect(published![0]!.coverage).toMatchObject({
    schemaVersion: 'postwar-social-current-page-chain-coverage-v4',
    reducerVersion: 'POSTWAR_COMPLETE_MIXED_PAGED_PREFIX_V1',
    pageProof: coverage.pageProof,
  });
  expect(
    (
      await db.query<{ n: number }>(
        'select count(*)::int as n from world_v2.postwar_mixed_current_document',
      )
    ).rows[0]!.n,
  ).toBe(0);
  // Deliberately poisoned TEST_ONLY legacy cache at the same head. It is not
  // economic evidence. A revoked genuine new version must never expose it.
  const legacyRows = '[{"notice":"TEST_ONLY_POISON_LEGACY"}]',
    legacyCoverage = {
      ...coverage,
      countryId: 'COUNTRY_01',
      globalWorldVersion: '257',
      globalEventSequence: '257',
    };
  await db.query(
    `insert into world_v2.postwar_mixed_current_document values($1,$2,$3,'SOCIAL','positions',$4,257,257,0,0,$5,$6,$7,'{}',1,1)`,
    [
      'TEST_ONLY_POISON_LEGACY',
      w,
      'COUNTRY_01',
      'TEST_ONLY_SOCIAL_positions',
      'sha256:' + 'a'.repeat(64),
      sha(legacyRows),
      C.canonicalSerialize(legacyCoverage),
    ],
  );
  await db.query(
    'insert into world_v2.postwar_mixed_current_page values($1,$2,0,0,1,$3,$4)',
    ['TEST_ONLY_POISON_LEGACY', w, legacyRows, sha(legacyRows)],
  );
  const pageQuery =
      'select * from world_v2.read_postwar_mixed_current_page($1,$2,$3,$4,$5,$6)',
    version = published!.find((x) =>
      x.document_ref.includes('PAGED'),
    )!.source_version;
  await begin('world_v2_postwar_projection_reader');
  try {
    const row = (
      await db.query<{
        status: string;
        source: { currentPrefixCoverage: { pageProof: unknown } };
        rows_text: string;
      }>(pageQuery, [w, 'SOCIAL', 'positions', 0, 25, version])
    ).rows[0]!;
    expect(row.status).toBe('PAGE');
    expect(row.source.currentPrefixCoverage.pageProof).toEqual(
      coverage.pageProof,
    );
    expect(JSON.parse(row.rows_text)).toEqual(
      JSON.parse(sourceCanonicalSerialize(f.social.state.labour.positions)),
    );
    expect(
      (
        await db.query<{ status: string }>(pageQuery, [
          w,
          'SOCIAL',
          'positions',
          100000,
          25,
          version,
        ])
      ).rows[0]!.status,
    ).toBe('EMPTY');
    expect(
      (
        await db.query<{ status: string }>(pageQuery, [
          w,
          'SOCIAL',
          'positions',
          0,
          25,
          'sha256:' + 'd'.repeat(64),
        ])
      ).rows[0]!.status,
    ).toBe('STALE');
  } finally {
    await rollback();
  }
  await db.query(
    "insert into world_v2.postwar_paged_current_revocation(world_id,document_ref,reason_ref)select world_id,document_ref,'TEST_ONLY_REVOKED'from world_v2.postwar_paged_current_document where dataset='positions'",
  );
  await begin('world_v2_postwar_projection_reader');
  try {
    expect(
      (
        await db.query<{ status: string }>(pageQuery, [
          w,
          'SOCIAL',
          'positions',
          0,
          25,
          null,
        ])
      ).rows[0]!.status,
    ).toBe('UNAVAILABLE');
  } finally {
    await rollback();
  }
});

it('publishes all ten paged Finance/CB documents from genuine Core balances and seven exact H0 originals', async () => {
  const ctx = currentBudgetContext;
  if (!ctx) throw Error('REAL_CORE_COMPLETE_257_BUDGET_FIXTURE_REQUIRED');
  const seed = ctx.seed,
    w = seed.worldId,
    gov = 'ENTITY_GOVERNMENT_01',
    bank = 'ENTITY_BANK_01',
    cb = 'ENTITY_CENTRAL_BANK_01',
    admission = scenarios.get(w)!.admission,
    hash = (x: unknown) => C.canonicalSha256(C.canonicalHashInput(x), sha),
    fund = {
      payerRole: 'GOV',
      countryId: 'COUNTRY_01',
      payerEntityId: gov,
      issuerEntityId: cb,
      accountRef: 'TGA_ASSET',
      claimId: 'TGA_CLAIM',
      currency: 'XAA',
      availableAmount: '1000',
      reservedAmount: '200',
      remainingAmount: '800',
    },
    scope = {
      countryId: 'COUNTRY_01',
      funding: [
        fund,
        { payerRole: 'OP', countryId: 'COUNTRY_01', issuerEntityId: bank },
      ],
      positions: [],
      servicePools: [],
    },
    scopeRaw = C.canonicalSerialize(scope),
    source = seed.sources[0]!;
  await db.query(
    'update world_v2.postwar_social_prefix_scope set scope_document=$2,scope_sha256=$3,source_id=$4,source_payload_hash=$5,canonical_seed_sha256=$6 where world_id=$1',
    [
      w,
      scopeRaw,
      sha(scopeRaw),
      source.sourceId,
      source.payloadHash,
      'c'.repeat(64),
    ],
  );
  // These are original actual opening legs, not event claims or fabricated
  // cash labels. Other original datasets are explicit empty TEST_ONLY catalog
  // values; this test creates no security/loan/quote instrument.
  for (const office of ['FINANCE', 'CENTRAL_BANK'])
    for (const dataset of office === 'FINANCE'
      ? ['currency-fx', 'opening-financial-legs']
      : [
          'currency-fx',
          'cb-categories',
          'cb-holdings',
          'bank-loans',
          'opening-financial-legs',
        ]) {
      const rows =
          dataset === 'opening-financial-legs'
            ? seed.financialBatches.flatMap((b) =>
                b.legs
                  .filter((l) =>
                    office === 'FINANCE'
                      ? l.account.ownerId === gov
                      : l.account.ownerId === cb || l.account.ownerId === bank,
                  )
                  .map((leg) => ({
                    sourceId: b.sourceId,
                    batchId: b.batchId,
                    leg,
                  })),
              )
            : [],
        raw = C.canonicalSerialize(rows);
      const dataHash = (
          await db.query<{ sha: string }>(
            "select encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex')as sha",
            [raw],
          )
        ).rows[0]!.sha,
        ref = 'TEST_ONLY_' + office + '_' + dataset;
      await db.query(
        `insert into world_v2.postwar_office_projection_document(document_ref,world_id,country_id,office_id,dataset,source_pointer,source_bundle_sha256,seed_fingerprint,admission_ref,seed_id,canonical_seed_sha256,source_id,source_payload_hash,projection_version,page_count,total_rows,document_sha256,source_version,source_revision,model_version,replay_binding)values($1,$2,'COUNTRY_01',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'postwar-office-projection.v1',1,$13,$14,$15,'TEST_ONLY_H0',$16,$17)on conflict(document_ref)do update set source_bundle_sha256=excluded.source_bundle_sha256,seed_fingerprint=excluded.seed_fingerprint,admission_ref=excluded.admission_ref,seed_id=excluded.seed_id,canonical_seed_sha256=excluded.canonical_seed_sha256,source_id=excluded.source_id,source_payload_hash=excluded.source_payload_hash,projection_version=excluded.projection_version,page_count=excluded.page_count,total_rows=excluded.total_rows,document_sha256=excluded.document_sha256,source_version=excluded.source_version,source_revision=excluded.source_revision,model_version=excluded.model_version,replay_binding=excluded.replay_binding`,
        [
          ref,
          w,
          office,
          dataset,
          C.canonicalSerialize({ financialSourceId: source.sourceId }),
          'b'.repeat(64),
          seed.fingerprint,
          admission,
          seed.seedId,
          'c'.repeat(64),
          source.sourceId,
          source.payloadHash,
          rows.length,
          dataHash,
          hash(ref),
          seed.replayBinding.modelVersion,
          C.canonicalSerialize(seed.replayBinding),
        ],
      );
      await db.query(
        'insert into world_v2.postwar_office_projection_page values($1,$2,0,$3,0,$4,$5)',
        [ref, w, rows.length, raw, sha(raw)],
      );
    }
  const financialSql = await read(
      'proposals/postwar-financial-current-derived-read.sql',
    ),
    start = financialSql.indexOf(
      'create function world_v2.postwar_financial_h0_ledger_rows(',
    ),
    end = financialSql.indexOf(
      'alter function world_v2.postwar_financial_h0_ledger_rows',
      start,
    );
  await db.exec(financialSql.slice(start, end));
  await db.exec(
    'alter function world_v2.postwar_financial_h0_ledger_rows(text,text,text)owner to world_v2_postwar_projection_owner',
  );
  const balances = (office: 'FINANCE' | 'CENTRAL_BANK') =>
      ctx.positions
        .filter((p) =>
          office === 'FINANCE'
            ? p.account.ownerId === gov
            : p.account.ownerId === cb || p.account.ownerId === bank,
        )
        .map((p) => ({
          schemaVersion: 'postwar-current-financial-balance-row-v2',
          countryId: 'COUNTRY_01',
          accountId: p.account.accountId,
          ownerEntityId: p.account.ownerId,
          ownerKind:
            p.account.ownerId === gov
              ? 'GOV'
              : p.account.ownerId === cb
                ? 'CB'
                : 'BANK',
          currency: p.account.currency,
          accountClass: p.account.accountClass,
          claimId: p.account.claimId,
          counterpartyEntityId: p.account.counterpartyEntityId,
          netDebitBalance: p.netDebitBalance.amount,
          balanceNature:
            p.account.accountClass === 'CASH' && p.account.currency === 'GCU'
              ? 'GCU_CASH'
              : p.account.claimId !== null &&
                  p.account.counterpartyEntityId !== null
                ? 'RECIPROCAL_LEDGER_CLAIM'
                : 'LEDGER_POSITION',
        }))
        .sort((a, b) => a.accountId.localeCompare(b.accountId)),
    capacity = {
      schemaVersion: 'postwar-treasury-capacity-row-v2',
      countryId: 'COUNTRY_01',
      accountId: 'TGA_ASSET',
      claimId: 'TGA_CLAIM',
      currency: 'XAA',
      treasuryLedgerClaimBalance: '1000',
      openingReservedCapacity: '200',
      budgetEnvelopeCapacity: '257',
      additionalPayrollReservedCapacity: '0',
      totalReservedCapacity: '457',
      availableCapacity: '543',
      governmentGcuCurrency: 'GCU',
      governmentGcuCashBalance: '0',
      governmentGcuAccountIds: [],
      reservationNature: 'CAPACITY_RESERVED_NOT_PAID_OR_ACCRUED',
      balanceNature: 'RECIPROCAL_LEDGER_CLAIM_NOT_CASH_WALLET',
      gcuBalanceNature: 'GOVERNMENT_OWNED_GCU_CASH_NOT_OFFICIAL_RESERVES',
    },
    rows = {
      FINANCE: {
        'ledger-balances': balances('FINANCE'),
        'treasury-capacity': [capacity],
      },
      CENTRAL_BANK: { 'ledger-balances': balances('CENTRAL_BANK') },
    },
    assertion = {
      head: { worldId: w, worldVersion: '257', eventSequence: '257' },
      seedPins: {
        worldId: w,
        seedId: seed.seedId,
        seedFingerprint: seed.fingerprint,
        admissionRef: admission,
      },
      coverage: ctx.coverage,
      currentRowsHash: hash(rows),
    };
  await begin('world_v2_postwar_projection_publisher');
  try {
    const published = (
      await db.query<{
        dataset: string;
        office_id: string;
        world_version: string;
        source_version: string;
      }>(
        'select * from world_v2.publish_postwar_paged_financial_current($1,$2,$3)',
        [w, 'COUNTRY_01', C.canonicalSerialize(assertion)],
      )
    ).rows;
    expect(published).toHaveLength(10);
    expect(
      new Set(published.map((x) => x.office_id + '/' + x.dataset)).size,
    ).toBe(10);
    expect(published.every((x) => x.world_version === '257')).toBe(true);
    await db.exec('commit');
  } catch (error) {
    await rollback();
    throw error;
  }
});

it('publishes one paged Captain document with the approved70 numeric origin carried through the genuine257-frame Core prefix', async () => {
  const ctx = currentBudgetContext;
  if (!ctx) throw Error('REAL_CORE_COMPLETE_257_BUDGET_FIXTURE_REQUIRED');
  const { seed, capital, coverage } = ctx,
    w = seed.worldId,
    country = 'COUNTRY_01',
    admission = scenarios.get(w)!.admission,
    hash = (x: unknown) => C.canonicalSha256(C.canonicalHashInput(x), sha),
    rows = capital.buckets.map((b) => ({
      schemaVersion: 'postwar-captain-political-capital-row-v1',
      countryId: country,
      capitalRef: capital.capitalRef,
      bucket: b.bucket,
      unit: 'political_capital',
      balance: b.balance.amount,
      opening: capital.opening.amount,
      generated: capital.generated.amount,
      total: capital.total.amount,
      available: capital.available.amount,
      spent: capital.spent.amount,
      closing: capital.closing.amount,
      allocationNature: 'REALLOCATION_NOT_GENERATION_OR_SPENDING',
    })),
    assertion = {
      head: { worldId: w, worldVersion: '257', eventSequence: '257' },
      seedPins: {
        worldId: w,
        seedId: seed.seedId,
        seedFingerprint: seed.fingerprint,
        admissionRef: admission,
      },
      coverage,
      capitalStateHash: hash(capital),
      rowsHash: hash(rows),
    };
  expect(rows).toHaveLength(7);
  expect(
    rows.every(
      (x) =>
        x.balance === '10' &&
        x.total === '70' &&
        x.generated === '0' &&
        x.spent === '0',
    ),
  ).toBe(true);
  await begin('world_v2_postwar_projection_publisher');
  try {
    const result = (
      await db.query<{
        origin_world_version: string | number;
        origin_event_sequence: string | number;
      }>(
        'select * from world_v2.publish_postwar_paged_captain_current($1,$2,$3)',
        [w, country, C.canonicalSerialize(assertion)],
      )
    ).rows;
    expect(result).toHaveLength(1);
    expect(String(result[0]!.origin_world_version)).toBe('0');
    expect(String(result[0]!.origin_event_sequence)).toBe('0');
    await db.exec('commit');
  } catch (error) {
    await rollback();
    throw error;
  }
  await begin('world_v2_postwar_projection_reader');
  try {
    const page = (
      await db.query<{
        status: string;
        rows_text: string;
        source: {
          originWorldVersion: string;
          observedHead: { worldVersion: string };
          currentCaptainCoverage: { pageProof: unknown };
          sourcePointer: { lastCaptainEvent: unknown };
        };
      }>(
        'select * from world_v2.read_postwar_captain_current_page($1,0,25,null)',
        [w],
      )
    ).rows[0]!;
    expect(page.status).toBe('PAGE');
    expect(JSON.parse(page.rows_text)).toEqual(rows);
    expect(page.source.originWorldVersion).toBe('0');
    expect(page.source.observedHead.worldVersion).toBe('257');
    expect(page.source.sourcePointer.lastCaptainEvent).toBeNull();
  } finally {
    await rollback();
  }
});

it('reduces real C02 RUN/WORK through the complete Core page proof and exact private SQL source/elapsed-person-time checks', async () => {
  const tiny = createIndustryFirstDayWorkCoreFixture(),
    w = tiny.source.worldId,
    seed = C.createOpeningSeed(
      {
        schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
        worldId: C.worldId(w),
        seedId: C.openingSeedId(tiny.source.seedId),
        openingWorldVersion: '0',
        replayBinding: C.CURRENT_REPLAY_BINDING,
        sources: [
          C.createOpeningSource(
            {
              schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
              sourceId: C.openingSourceId('SOURCE_TEST_ONLY_INDUSTRY_PAGED'),
              sourceKind: 'TEST_FIXTURE',
              sourceVersion: 'TEST_ONLY',
              locator: 'TEST_ONLY_ZERO_FINANCIAL_SOURCE_NOT_ADMISSION',
              payload: {
                notice: 'TEST_ONLY_INDUSTRY_KERNEL_AND_SQL_MECHANISM',
              },
            },
            sha,
          ),
        ],
        financialBatches: [],
        inventoryEntries: [],
      },
      sha,
    ),
    admission = 'ADMISSION_' + sha(w).toUpperCase(),
    siteDoc = {
      sourceFacility: {
        id: tiny.source.facilityId,
        capacity: tiny.source.capacityPerSimDay,
      },
      recipe: {
        outputUnit: tiny.source.outputUnit,
        workersPerDailyOutputUnit: tiny.source.labourPersonDaysPerOutput,
      },
    },
    siteRaw = C.canonicalSerialize(siteDoc),
    sourceBody = {
      schemaVersion: 'postwar-industry-first-day-source-v1',
      worldId: w,
      countryId: 'COUNTRY_02',
      facilityId: tiny.source.facilityId,
      locationId: tiny.source.locationId,
      operatorId: tiny.source.operatorId,
      seedId: seed.seedId,
      seedFingerprint: seed.fingerprint,
      admissionRef: admission,
      registrationRef: 'REG_TEST_ONLY_INDUSTRY_PAGED',
      siteDocumentSha256: sha(siteRaw),
      policyVersion: tiny.source.policyVersion,
      policyRawSha256: tiny.source.policyRawSha256,
      userAdoptionRawSha256: tiny.source.userAdoptionRawSha256,
      ...siteDoc,
    },
    sourceRaw = C.canonicalSerialize(sourceBody),
    sourceRef = 'INDUSTRY_FIRST_DAY_' + sha(sourceRaw).toUpperCase(),
    site = {
      ...tiny.source,
      seedFingerprint: seed.fingerprint,
      admissionRef: admission,
      sourceRef,
      sourceRawSha256: sha(sourceRaw),
    },
    terms = { ...tiny.terms, sourceRef, sourceRawSha256: site.sourceRawSha256 },
    run = industryWorkTestFrame({
      type: 'CORE_INDUSTRY_RUN_SCHEDULE_V1',
      eventType: 'INDUSTRY_FIRST_DAY_RUN_SCHEDULED_V1',
      id: 'COMMAND_TEST_ONLY_INDUSTRY_PAGED_RUN',
      version: '0',
      time: '0',
      payload: terms,
      eventPayload: {
        schemaVersion: 'postwar-industry-run-scheduled-v1',
        terms,
        source: {
          worldId: w,
          countryId: site.countryId,
          facilityId: site.facilityId,
          operatorId: site.operatorId,
          seedId: seed.seedId,
          seedFingerprint: seed.fingerprint,
          admissionRef: admission,
          sourceRef,
          sourceRawSha256: site.sourceRawSha256,
        },
      },
    }),
    work = industryWorkTestFrame({
      type: 'CORE_INDUSTRY_FIRST_DAY_WORK_V1',
      eventType: 'INDUSTRY_FIRST_DAY_WORK_COMPLETED_V1',
      id: 'COMMAND_TEST_ONLY_INDUSTRY_PAGED_WORK',
      version: '1',
      time: '230400',
      automatic: true,
      payload: {
        schemaVersion: 'postwar-industry-work-command-v1',
        runId: terms.runId,
        scheduleCommandFingerprint: run.command.fingerprint,
        allocations: [tiny.allocation],
      },
      eventPayload: {
        schemaVersion: 'postwar-industry-completed-work-v1',
        worldId: w,
        countryId: site.countryId,
        locationId: site.locationId,
        facilityId: site.facilityId,
        operatorId: site.operatorId,
        runId: terms.runId,
        seedId: seed.seedId,
        seedFingerprint: seed.fingerprint,
        admissionRef: admission,
        schedule: {
          commandId: run.command.commandId,
          commandFingerprint: run.command.fingerprint,
          eventId: run.events[0]!.eventId,
          eventFingerprint: run.events[0]!.fingerprint,
        },
        policy: {
          version: site.policyVersion,
          rawSha256: site.policyRawSha256,
          userAdoptionRawSha256: site.userAdoptionRawSha256,
          sourceRef,
          sourceRawSha256: site.sourceRawSha256,
        },
        completedAtSimTime: '230400',
        allocations: [tiny.allocation],
      },
    }),
    frames = JSON.parse(sourceCanonicalSerialize([run, work])) as Frame[];
  await install(w, frames, seed);
  await db.exec(`create role world_v2_industry_source_owner nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
  grant usage,create on schema world_v2 to world_v2_industry_source_owner;
  create table world_v2.postwar_industry_original(world_id text,country_id text,facility_id text,registration_ref text,seed_fingerprint text,admission_ref text,document_text text,document_sha256 text);
  create table world_v2.postwar_industry_deposit_original(world_id text,country_id text,kind text,seed_fingerprint text,admission_ref text,asset_account jsonb,liability_account jsonb,opening_amount numeric);
  create table world_v2.postwar_industry_first_day_source(world_id text,country_id text,facility_id text,source_ref text,registration_ref text,seed_id text,seed_fingerprint text,admission_ref text,policy_version text,policy_raw_sha256 text,user_adoption_raw_sha256 text,source_text text,source_sha256 text);
  alter table world_v2.postwar_industry_original owner to world_v2_industry_source_owner;alter table world_v2.postwar_industry_first_day_source owner to world_v2_industry_source_owner;
  grant select on world_v2.runtime_opening_admission,world_v2.command_submission,world_v2.command_receipt,world_v2.authoritative_event to world_v2_industry_source_owner;
  create function world_v2.industry_source_admission(p_world text)returns world_v2.runtime_opening_admission language sql security definer set search_path=pg_catalog as $$select * from world_v2.runtime_opening_admission a where a.world_id=p_world$$;
  -- TEST_ONLY header seam; product helper still independently joins actual
  -- command/COMMITTED receipt/event and immutable source bytes.
  `);
  for (const table of [
    'runtime_opening_admission',
    'command_submission',
    'command_receipt',
    'authoritative_event',
  ])
    await db.exec(
      `create policy test_only_industry_metadata on world_v2.${table} for select to world_v2_industry_source_owner using(world_id=current_setting('econmind.industry_source_world',true))`,
    );
  await db.query(
    'insert into world_v2.postwar_industry_original values($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      w,
      site.countryId,
      site.facilityId,
      sourceBody.registrationRef,
      seed.fingerprint,
      admission,
      siteRaw,
      sha(siteRaw),
    ],
  );
  await db.query(
    'insert into world_v2.postwar_industry_first_day_source values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
    [
      w,
      site.countryId,
      site.facilityId,
      sourceRef,
      sourceBody.registrationRef,
      seed.seedId,
      seed.fingerprint,
      admission,
      site.policyVersion,
      site.policyRawSha256,
      site.userAdoptionRawSha256,
      sourceRaw,
      sha(sourceRaw),
    ],
  );
  for (const dataset of ['positions', 'service-pools'])
    await db.query(
      `insert into world_v2.postwar_office_projection_document(document_ref,world_id,country_id,office_id,dataset,source_bundle_sha256,seed_fingerprint,admission_ref)values($1,$2,'COUNTRY_01','SOCIAL',$3,$4,$5,$6)`,
      [
        'TEST_ONLY_INDUSTRY_' + dataset,
        w,
        dataset,
        'b'.repeat(64),
        seed.fingerprint,
        admission,
      ],
    );
  const sourceScope = C.canonicalSerialize({
    positions: [
      {
        countryId: site.countryId,
        locationId: site.locationId,
        positionId: site.positions[0]!.positionId,
        skill: 'LOW',
        employedCount: '2',
      },
    ],
    wages: [
      {
        countryId: site.countryId,
        locationId: site.locationId,
        positionId: site.positions[0]!.positionId,
        skill: 'LOW',
        employerId: site.operatorId,
        employerRole: 'OP',
      },
    ],
    cohorts: [site.positions[0]!.cohortRef],
  });
  await db.query(
    'insert into world_v2.postwar_social_prefix_scope(world_id,country_id,scope_document,scope_sha256)values($1,$2,$3,$4)',
    [w, site.countryId, sourceScope, sha(sourceScope)],
  );
  await db.exec(
    await read('proposals/postwar-mixed-industry-current-effects.sql'),
  );
  const opening = C.rebuildV08LedgersFromLineage({ seed, sha256Hex: sha });
  let continuation = prepareFinanceSocialReplayContinuation(
      {
        opening,
        socialCountries: [],
        openingEncumbrances: [],
        fxOriginals: [],
        industryWorkSources: [site],
        expectedHead: { worldVersion: '2', eventSequence: '2' },
      },
      sha,
    ),
    proof = createPostwarPagedCurrentProof(continuation);
  await begin();
  try {
    const reader = createPostwarBoundedPrefixPageReaderFrom(executor, scope(w));
    for (
      let page = await reader.readNext();
      page;
      page = await reader.readNext()
    ) {
      continuation = appendFinanceSocialReplayPage({
        continuation,
        page,
        sha256Hex: sha,
      });
      proof = advancePostwarPagedCurrentProof({ proof, continuation });
    }
  } finally {
    await rollback();
  }
  const coverage = readPostwarPagedCurrentProof(proof).coverage;
  retireFinanceSocialReplayContinuation(continuation);
  retirePostwarPagedCurrentProof(proof);
  await begin('world_v2_postwar_projection_publisher');
  try {
    const checked = (
      await db.query<{
        value: {
          financial_batch_count: string;
          page_proof: { frameCount: string };
        };
      }>('select world_v2.test_only_paged_verify($1,$2,$3)as value', [
        w,
        'COUNTRY_01',
        C.canonicalSerialize(coverage),
      ])
    ).rows[0]!.value;
    expect(checked.financial_batch_count).toBe('0');
    expect(checked.page_proof.frameCount).toBe('2');
  } finally {
    await rollback();
  }
});

it('reads one actual Core paid WORK frame through EXEC-only SQL and rehydrates the exact six-leg deposit payment without minting settlement authority', async () => {
  const probe = createIndustryOperatingWageCanonicalFixture(false),
    w = probe.f.worldId,
    admission = 'ADMISSION_' + sha(w).toUpperCase(),
    siteDoc = {
      sourceFacility: {
        id: probe.site.facilityId,
        capacity: probe.site.capacityPerSimDay,
      },
      recipe: {
        outputUnit: probe.site.outputUnit,
        workersPerDailyOutputUnit: probe.site.labourPersonDaysPerOutput,
      },
    },
    siteRaw = C.canonicalSerialize(siteDoc),
    raw = C.canonicalSerialize({
      schemaVersion: 'postwar-industry-first-day-source-v1',
      worldId: w,
      countryId: probe.f.countryId,
      facilityId: probe.site.facilityId,
      operatorId: probe.f.operatorId,
      seedId: probe.f.seed.seedId,
      seedFingerprint: probe.f.seed.fingerprint,
      admissionRef: admission,
      policyVersion: probe.site.policyVersion,
      locationId: probe.site.locationId,
      policyRawSha256: probe.site.policyRawSha256,
      userAdoptionRawSha256: probe.site.userAdoptionRawSha256,
      siteDocumentSha256: sha(siteRaw),
      ...siteDoc,
    }),
    sourceRef = 'INDUSTRY_FIRST_DAY_' + sha(raw).toUpperCase(),
    s = createIndustryOperatingWageCanonicalFixture(
      false,
      '172800',
      '72000',
      '1',
      '72000',
      '10',
      { admissionRef: admission, sourceRef, sourceRawSha256: sha(raw) },
    ),
    result = prepareIndustryOperatingWagePayment(s),
    payment = {
      ...result.step,
      events: result.step.transition.events,
      receipt: sourceFinalReceipt({
        command: s.command,
        transition: result.step.transition,
        outcome: 'COMMITTED',
        reasonCode: null,
        simTime: s.command.simTime,
        recordedAtReal: s.observedAtReal,
      }),
    },
    frames = JSON.parse(
      sourceCanonicalSerialize([s.schedule, s.workFrame, payment]),
    ) as Frame[],
    seed = C.parseOpeningSeed(
      JSON.parse(sourceCanonicalSerialize(s.f.seed)),
      sha,
    );
  await install(w, frames, seed);
  await db.query(
    'insert into world_v2.postwar_industry_first_day_source values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
    [
      w,
      s.f.countryId,
      s.site.facilityId,
      sourceRef,
      'REG_TEST_ONLY_PAID_WORK',
      seed.seedId,
      seed.fingerprint,
      admission,
      s.site.policyVersion,
      s.site.policyRawSha256,
      s.site.userAdoptionRawSha256,
      raw,
      sha(raw),
    ],
  );
  await db.exec(`create role world_v2_industry_source_reader nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
    create role test_only_industry_paid_reader login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
    grant world_v2_industry_source_reader to test_only_industry_paid_reader;
    grant usage on schema world_v2 to world_v2_industry_source_reader;
    grant select on world_v2.world_head,world_v2.financial_posting_batch,world_v2.inventory_posting to world_v2_industry_source_owner;
    grant update(world_version)on world_v2.world_head to world_v2_industry_source_owner;
    grant execute on function world_v2.lock_postwar_source_revocation_fences(text)to world_v2_industry_source_reader,world_v2_industry_source_owner;`);
  for (const table of [
    'world_head',
    'financial_posting_batch',
    'inventory_posting',
  ])
    await db.exec(
      `create policy test_only_industry_paid_metadata on world_v2.${table} for select to world_v2_industry_source_owner using(world_id=current_setting('econmind.industry_source_world',true))`,
    );
  await db.exec(
    "create policy test_only_industry_paid_head_lock on world_v2.world_head for update to world_v2_industry_source_owner using(world_id=current_setting('econmind.industry_source_world',true))with check(false)",
  );
  await db.query(
    'insert into world_v2.postwar_industry_original values($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      w,
      s.f.countryId,
      s.site.facilityId,
      'REG_TEST_ONLY_PAID_WORK',
      seed.fingerprint,
      admission,
      siteRaw,
      sha(siteRaw),
    ],
  );
  await db.exec(
    'grant select on world_v2.postwar_industry_deposit_original to world_v2_industry_source_owner',
  );
  for (const [kind, pair] of [
    ['OPERATOR_BANK_DEPOSIT', s.f.op],
    ['HOUSEHOLD_BANK_DEPOSIT', s.f.hh],
  ] as const)
    await db.query(
      'insert into world_v2.postwar_industry_deposit_original values($1,$2,$3,$4,$5,$6,$7,100)',
      [
        w,
        s.f.countryId,
        kind,
        seed.fingerprint,
        admission,
        sourceCanonicalSerialize(pair.asset),
        sourceCanonicalSerialize(pair.liability),
      ],
    );
  const scoped = C.canonicalSerialize({
    funding: [
      {
        payerRole: 'OP',
        payerEntityId: s.f.operatorId,
        accountRef: s.f.op.asset.accountId,
        reservedAmount: s.source.openingReservedAmount,
        currency: 'XAA',
      },
    ],
    positions: [
      {
        positionId: s.site.positions[0]!.positionId,
        locationId: s.site.locationId,
        skill: 'LOW',
        employedCount: '8',
      },
    ],
    cohorts: [s.site.positions[0]!.cohortRef],
    wages: s.source.wages.map((x) => ({
      positionId: x.positionId,
      employerId: s.f.operatorId,
      employerRole: 'OP',
      locationId: s.site.locationId,
      skill: x.skill,
      wagePeriod: x.wagePeriod,
      wageAmount: x.annualWage,
      wageCurrency: x.currency,
      wageVersion: x.wageVersion,
      payrollFundingRef: x.sourceRef,
    })),
  });
  await db.query(
    'insert into world_v2.postwar_social_prefix_scope(world_id,country_id,scope_document,scope_sha256)values($1,$2,$3,$4)',
    [w, s.f.countryId, scoped, sha(scoped)],
  );
  for (const dataset of ['positions', 'service-pools'])
    await db.query(
      `insert into world_v2.postwar_office_projection_document(document_ref,world_id,country_id,office_id,dataset,source_bundle_sha256,seed_fingerprint,admission_ref)values($1,$2,$3,'SOCIAL',$4,$5,$6,$7)`,
      [
        'TEST_ONLY_PAID_' + dataset,
        w,
        s.f.countryId,
        dataset,
        'b'.repeat(64),
        seed.fingerprint,
        admission,
      ],
    );
  await db.exec(await read('proposals/postwar-industry-paid-work-read.sql'));
  const input = {
    worldId: w,
    countryId: s.f.countryId,
    facilityId: s.site.facilityId,
    runId: s.source.runId,
    workEventFingerprint: s.workFrame.events[0]!.fingerprint,
    expectedHead: { worldVersion: '3', eventSequence: '3' },
    seedFingerprint: seed.fingerprint,
    admissionRef: admission,
  };
  await db.exec('set session authorization test_only_industry_paid_reader');
  try {
    await begin('world_v2_industry_source_reader');
    try {
      const paid = await readPostwarIndustryPaidWorkOriginalFrom(
        executor,
        input,
      );
      expect(paid.classification).toBe(
        'ACTUAL_COMMITTED_PAYMENT_FRAME_DATA_NOT_SETTLEMENT_AUTHORITY',
      );
      expect(C.canonicalSerialize(paid.paymentFrame)).toBe(
        sourceCanonicalSerialize(payment),
      );
      expect(paid.paymentFrame.financialPostingBatches).toHaveLength(1);
    } finally {
      await rollback();
    }
    await begin('world_v2_industry_source_reader');
    try {
      await expect(
        db.query('select canonical_payload from world_v2.opening_seed'),
      ).rejects.toThrow('permission denied');
    } finally {
      await rollback();
    }
    await begin('world_v2_industry_source_reader');
    try {
      await expect(
        readPostwarIndustryPaidWorkOriginalFrom(executor, {
          ...input,
          expectedHead: { worldVersion: '2', eventSequence: '2' },
        }),
      ).rejects.toThrow('INDUSTRY_PAID_WORK_ACTUAL_HEAD_CHANGED');
    } finally {
      await rollback();
    }
    await begin('world_v2_industry_source_reader');
    try {
      await expect(
        readPostwarIndustryPaidWorkOriginalFrom(executor, {
          ...input,
          facilityId: 'FACILITY_TEST_ONLY_FOREIGN',
        }),
      ).rejects.toThrow('INDUSTRY_PAID_WORK_ACTUAL_WORK_SCOPE_REQUIRED');
    } finally {
      await rollback();
    }
  } finally {
    await db.exec('reset role;set session authorization postgres');
  }
  const siteSource = JSON.parse(sourceCanonicalSerialize(s.site)),
    wageSource = JSON.parse(sourceCanonicalSerialize(s.source)),
    opening = C.rebuildV08LedgersFromLineage({ seed, sha256Hex: sha });
  let continuation = prepareFinanceSocialReplayContinuation(
      {
        opening,
        socialCountries: [],
        openingEncumbrances: [
          {
            reference: s.source.openingEncumbranceRef,
            accountId: s.f.op.asset.accountId,
            amount: s.source.openingReservedAmount,
            currency: s.source.maximumExpense.currency,
          },
        ],
        fxOriginals: [],
        industryWorkSources: [siteSource],
        industryWageSources: [wageSource],
        expectedHead: { worldVersion: '3', eventSequence: '3' },
      },
      sha,
    ),
    proof = createPostwarPagedCurrentProof(continuation);
  await begin();
  try {
    const reader = createPostwarBoundedPrefixPageReaderFrom(executor, scope(w));
    for (
      let page = await reader.readNext();
      page;
      page = await reader.readNext()
    ) {
      continuation = appendFinanceSocialReplayPage({
        continuation,
        page,
        sha256Hex: sha,
      });
      proof = advancePostwarPagedCurrentProof({ proof, continuation });
    }
  } finally {
    await rollback();
  }
  const coverage = readPostwarPagedCurrentProof(proof).coverage;
  retireFinanceSocialReplayContinuation(continuation);
  retirePostwarPagedCurrentProof(proof);
  expect(coverage.financialPostingCount).toBe('6');
  expect(coverage.financialBatchCount).toBe('1');
  await begin('world_v2_postwar_projection_publisher');
  try {
    const checked = (
      await db.query<{
        value: {
          financial_posting_count: string;
          financial_batch_count: string;
        };
      }>('select world_v2.test_only_paged_verify($1,$2,$3)as value', [
        w,
        s.f.countryId,
        C.canonicalSerialize(coverage),
      ])
    ).rows[0]!.value;
    expect(checked.financial_posting_count).toBe('6');
    expect(checked.financial_batch_count).toBe('1');
  } finally {
    await rollback();
  }
});
