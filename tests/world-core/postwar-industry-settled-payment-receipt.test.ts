import { createPostwarIndustryOperatingCutoffGuard } from '../../apps/world-worker/src/persistence/postwar-industry-operating-cutoff.js';
import { ProtectedIndustryProductionGuard } from '../../apps/world-worker/src/persistence/industry-production-source-cutoff.js';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import {
  createPostwarIndustryCurrentSource,
  consumeIndustrySettledPaymentCurrentFrom,
  readIndustrySettledPaymentForCutoffFrom,
  type IndustrySettledPaymentSourceLease,
} from '../../apps/world-worker/src/persistence/postwar-industry-current-source.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
/** TEST_ONLY real Core settlement/replay. No production purpose or source admission. */
import { createHash } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as C from '@econmind/core';
import { createProductionSchemaFixture } from '../support/production-schema-fixture.js';
import {
  canonicalSerialize as fixtureCanonicalSerialize,
  type V08AuthoritativeLedgerTransition as FixtureTransition,
} from '../../packages/core/src/index.js';
import { decodeIndustryProductionRow } from '../../apps/world-worker/src/persistence/industry-production-row-decoder.js';
import {
  deriveIndustrySettledPaymentReceipt,
  produceIndustrySettledPaymentReceiptFrom,
  readPreparedIndustrySettledPaymentData,
  type IndustrySettledPaymentDataPreparation,
} from '../../apps/world-worker/src/persistence/postwar-industry-settled-payment-receipt.js';
import type { IndustryProductionCutoffRequest } from '../../apps/world-worker/src/persistence/industry-production-source-cutoff.js';
import type { ValidatedCanonicalLineageView } from '../../apps/world-worker/src/persistence/validated-canonical-lineage.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function localFixture(cash = '100') {
  const raw = createProductionSchemaFixture(cash);
  // Rehydrate canonical data, never clone another Core instance's brands.
  function group(g: FixtureTransition) {
    const {
      canonicalPayload,
      payloadHash: _ph,
      fingerprint: _fp,
      simTime,
      ...c
    } = g.command;
    void _ph;
    void _fp;
    const command = C.parseCanonicalCommand(
      {
        ...c,
        payload: JSON.parse(canonicalPayload) as unknown,
        simTime: simTime.toCanonicalValue(),
      },
      sha,
    );
    const events = g.transition.events.map((e) => {
      const {
        canonicalPayload,
        payloadHash: _ph,
        fingerprint: _fp,
        simTime,
        ...rest
      } = e;
      void _ph;
      void _fp;
      return C.parseAuthoritativeEvent(
        {
          ...rest,
          payload: JSON.parse(canonicalPayload) as unknown,
          simTime: simTime.toCanonicalValue(),
        },
        sha,
      );
    });
    const transition = C.createAuthoritativeTransition({
      command,
      worldVersionBefore: g.transition.worldVersionBefore,
      worldVersionAfter: g.transition.worldVersionAfter,
      events,
    });
    return { command, transition };
  }
  const paid = group(raw.paidLineage);
  const funding = C.createFinancialPostingBatch(
    {
      ...paid,
      schemaVersion: raw.funding.schemaVersion,
      batchId: C.financialPostingBatchId(raw.funding.batchId),
      worldId: paid.command.worldId,
      causationCommandId: paid.command.commandId,
      causationEventIds: paid.transition.eventIds,
      worldVersionBefore: paid.transition.worldVersionBefore,
      worldVersionAfter: paid.transition.worldVersionAfter,
      settlementCurrency: raw.funding.settlementCurrency,
      simTime: paid.command.simTime,
      legs: raw.funding.legs.map((l) => ({
        legId: C.financialPostingLegId(l.legId),
        direction: l.direction,
        account: C.createFinancialAccount({
          worldId: paid.command.worldId,
          countryId: paid.command.countryId,
          ownerId: C.legalEntityId(l.account.ownerId),
          accountId: C.financialAccountId(l.account.accountId),
          accountClass: l.account.accountClass,
          currency: l.account.currency,
          claimId: null,
          counterpartyEntityId: null,
        }),
        counterpartyAccountId:
          l.counterpartyAccountId === null
            ? null
            : C.financialAccountId(l.counterpartyAccountId),
        amount: C.Money.from(
          l.amount.toCanonicalValue().amount,
          l.amount.currency,
        ),
      })),
    },
    sha,
  );
  const executed = group(raw.make().lineage);
  const { fingerprint, ...body } = JSON.parse(
    fixtureCanonicalSerialize(raw.make().posting),
  ) as Record<string, unknown>;
  const posting = decodeIndustryProductionRow({
    ...executed,
    row: {
      canonical_payload: body,
      causation_command_id: executed.command.commandId,
      fingerprint,
    },
    sha256Hex: sha,
  });
  return {
    seed: C.parseOpeningSeed(
      JSON.parse(fixtureCanonicalSerialize(raw.seed)) as unknown,
      sha,
    ),
    funding,
    paidLineage: {
      ...paid,
      inventoryPostings: [],
      financialPostingBatches: [funding],
    },
    made: { ...executed, posting },
  };
}

function input(cash = '100') {
  const f = localFixture(cash),
    p = f.made.posting,
    op = p.evidence.operating.payload;
  const receipt = C.createFinalCommandReceipt({
    ...f.paidLineage,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: f.paidLineage.command.simTime,
    recordedAtReal: '2026-10-26T00:00:00.000Z',
  });
  const target: IndustryProductionCutoffRequest = {
    ...f.made,
    expectedHead: {
      worldVersion: f.made.transition.worldVersionBefore,
      eventSequence: (
        BigInt(f.made.transition.events[0]!.sequence) - 1n
      ).toString(),
    },
    fundingBatchId: op.fundingBatchId,
    fundingFingerprint: op.fundingFingerprint,
    costLegId: op.costLegId,
  };
  return { seed: f.seed, prior: [{ ...f.paidLineage, receipt }], target };
}
describe('fixed existing settled-payment receipt producer', () => {
  it('derives actual six-GCU settlement and byte-identical idempotent receipt without a new event', () => {
    const i = input(),
      a = deriveIndustrySettledPaymentReceipt(i),
      b = deriveIndustrySettledPaymentReceipt(i);
    expect(a).toEqual(b);
    expect(a.settlement.amount).toEqual({ amount: '6', currency: 'GCU' });
    expect(a.settlement.paymentAccount.accountClass).toBe('CASH');
    expect(a.purposeQualification).toBe('NOT_ESTABLISHED_BY_PAYMENT');
    expect(a.origin.eventIds).toEqual(i.prior[0]!.transition.eventIds);
    expect(a.factCanonicalPayload).toBe(
      C.canonicalSerialize(i.target.posting.evidence.operating.payload),
    );
    expect(a.classification).toBe(
      'CORE_REPLAYED_SETTLED_PAYMENT_NOT_INDUSTRY_PURPOSE_OR_CURRENT_USE_AUTHORITY',
    );
  });
  it('rejects unpaid/underfunded cost instead of using planned budget or later cash', () => {
    expect(() => deriveIndustrySettledPaymentReceipt(input('5'))).toThrow();
    const i = input();
    expect(() =>
      deriveIndustrySettledPaymentReceipt({ ...i, prior: [] }),
    ).toThrow('COMPLETE_PREFIX');
  });
  it('rejects copied posting, wrong head and altered FINAL receipt', () => {
    const i = input();
    expect(() =>
      deriveIndustrySettledPaymentReceipt({
        ...i,
        target: { ...i.target, posting: { ...i.target.posting } },
      }),
    ).toThrow('GENUINE');
    expect(() =>
      deriveIndustrySettledPaymentReceipt({
        ...i,
        target: {
          ...i.target,
          expectedHead: { ...i.target.expectedHead, eventSequence: '0' },
        },
      }),
    ).toThrow('HEAD');
    expect(() =>
      deriveIndustrySettledPaymentReceipt({
        ...i,
        prior: [
          {
            ...i.prior[0]!,
            receipt: {
              ...i.prior[0]!.receipt,
              idempotencyKey:
                'OTHER' as C.FinalCommandReceipt['idempotencyKey'],
            },
          },
        ],
      }),
    ).toThrow();
  });
  it('rejects altered posting batch bytes even when original fingerprint is retained', () => {
    const i = input(),
      row = i.prior[0]!,
      batch = row.financialPostingBatches[0]!;
    expect(() =>
      deriveIndustrySettledPaymentReceipt({
        ...i,
        prior: [
          {
            ...row,
            financialPostingBatches: [
              {
                ...batch,
                legs: batch.legs.map((l) => ({
                  ...l,
                  amount: C.Money.from('7', 'GCU'),
                })),
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });
  it('requires genuine same-executor lexical source view at DB entry, never caller ready flags', () => {
    const i = input(),
      tx = { query: async () => ({ rows: [], rowCount: 0 }) };
    expect(() =>
      produceIndustrySettledPaymentReceiptFrom(
        tx,
        {} as ValidatedCanonicalLineageView,
        i.target,
      ),
    ).toThrow('forged');
  });
});

let db: PGlite;
const paidInput = input(),
  paid = paidInput.prior[0]!,
  w = paid.command.worldId,
  country = paid.command.countryId,
  facility = paidInput.target.posting.evidence.operating.payload.facilityRef;
const documentText = C.canonicalSerialize({
  worldId: w,
  countryId: country,
  operatorId: paidInput.target.posting.evidence.operating.payload.operatorId,
  locationId: paidInput.target.posting.evidence.output.physicalLocationId,
  sourceFacility: { id: facility },
});
const sqlRead = (p: string) =>
  readFile(new URL('../../' + p, import.meta.url), 'utf8');
const tx: SqlExecutor = {
  async query<Row extends object>(q: string, args: readonly unknown[] = []) {
    const result = await db.query<Row>(q, [...args]);
    return { rows: result.rows, rowCount: result.rows.length };
  },
};
const source = () =>
  createPostwarIndustryCurrentSource({
    worldId: w,
    countryId: country,
    runtimeReaderRole: 'test_industry_payment_reader',
  });
async function asReader<T>(run: () => Promise<T>) {
  await db.exec(
    'set session authorization test_industry_payment_reader;begin isolation level repeatable read',
  );
  try {
    return await run();
  } finally {
    await db.exec('rollback;reset role;set session authorization postgres');
  }
}
describe('PAID_COST consumed by actual bounded current source (TEST_ONLY stored original rows)', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec('create schema world_v2');
    for (const file of [
      '0002_world_v2_command_event_ledger.sql',
      '0003_world_v2_command_receipts_outbox.sql',
      '0007_world_v2_atomic_transition_facts.sql',
    ])
      await db.exec(await sqlRead('database/migrations/artifacts/' + file));
    await db.exec(
      `create role world_v2_industry_source_owner nologin;create role world_v2_industry_source_reader nologin;create role world_v2_industry_source_publisher nologin;create role test_industry_payment_reader nologin;grant world_v2_industry_source_reader to test_industry_payment_reader;grant usage on schema world_v2 to test_industry_payment_reader;create table world_v2.runtime_opening_admission(world_id text,seed_id text,seed_fingerprint text,admission_ref text,model_version text,replay_binding text,admitted_at_real timestamptz);create table world_v2.runtime_admission_publication_permit(authorization_id text,authorization_sha256 text,world_id text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,valid_from timestamptz,valid_until timestamptz);create table world_v2.runtime_admission_publication_revocation(authorization_id text);create table world_v2.postwar_industry_original(world_id text,country_id text,facility_id text,registration_ref text,seed_fingerprint text,admission_ref text,document_text text,document_sha256 text);create table world_v2.postwar_industry_original_revocation(world_id text,registration_ref text);grant usage,create on schema world_v2 to world_v2_industry_source_owner;grant select,update on world_v2.world_head,world_v2.runtime_opening_admission,world_v2.runtime_admission_publication_permit,world_v2.postwar_industry_original to world_v2_industry_source_owner;grant select on world_v2.runtime_admission_publication_revocation,world_v2.postwar_industry_original_revocation,world_v2.command_submission,world_v2.command_receipt,world_v2.financial_posting_batch to world_v2_industry_source_owner;`,
    );
    const oldSql = await sqlRead(
      'database/proposals/postwar-industry-production-source.sql',
    );
    for (const name of [
      'industry_source_admission',
      'lock_postwar_industry_original',
    ]) {
      const start = oldSql.indexOf('create function world_v2.' + name + '('),
        end = oldSql.indexOf('$$;', start) + 3;
      await db.exec(oldSql.slice(start, end));
    }
    await db.exec(
      'alter function world_v2.industry_source_admission(text)owner to world_v2_industry_source_owner;alter function world_v2.lock_postwar_industry_original(text,text,text,bigint,bigint)owner to world_v2_industry_source_owner;revoke all on function world_v2.industry_source_admission(text)from public;revoke all on function world_v2.lock_postwar_industry_original(text,text,text,bigint,bigint)from public;grant execute on function world_v2.lock_postwar_industry_original(text,text,text,bigint,bigint)to world_v2_industry_source_reader',
    );
    await db.exec(
      await sqlRead(
        'database/proposals/postwar-industry-operating-receipts.sql',
      ),
    );
    await db.query('insert into world_v2.world_head values($1,1,1)', [w]);
    const permit = sha('TEST_ONLY_PAYMENT_PERMIT'),
      admission = 'ADMISSION_' + permit.toUpperCase();
    await db.query(
      "insert into world_v2.runtime_opening_admission values($1,'SEED_TEST',$2,$3,'MODEL_TEST','REPLAY_TEST','2026-10-30T00:00:00Z')",
      [w, paidInput.seed.fingerprint, admission],
    );
    await db.query(
      "insert into world_v2.runtime_admission_publication_permit values('PERMIT_TEST',$1,$2,'SEED_TEST',$3,'MODEL_TEST','REPLAY_TEST','2026-10-29T00:00:00Z','2026-10-31T00:00:00Z')",
      [permit, w, paidInput.seed.fingerprint],
    );
    await db.query(
      'insert into world_v2.postwar_industry_original values($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        w,
        country,
        facility,
        'TEST_ONLY_INDUSTRY_REG',
        paidInput.seed.fingerprint,
        admission,
        documentText,
        sha(documentText),
      ],
    );
    const c = paid.command,
      r = paid.receipt,
      b = paid.financialPostingBatches[0]!;
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
    for (const e of paid.transition.events)
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
    const { fingerprint, ...intent } = b;
    await db.query(
      'insert into world_v2.financial_posting_batch values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [
        b.worldId,
        b.batchId,
        b.causationCommandId,
        b.worldVersionBefore,
        b.worldVersionAfter,
        b.simTime.toCanonicalValue(),
        JSON.stringify(b.causationEventIds),
        C.canonicalSerialize(b.transitionBinding),
        b.settlementCurrency,
        C.canonicalSerialize(intent),
        fingerprint,
      ],
    );
  });
  afterAll(async () => {
    await db?.close();
  });
  it('reads actual complete history before consuming six-GCU PAID_COST; keeps lexical lifetime and no raw grants', async () => {
    let saved: IndustrySettledPaymentSourceLease | undefined;
    await asReader(async () => {
      await source().withSettledPaymentFrom(tx, paidInput, async (lease) => {
        saved = lease;
        const facts = consumeIndustrySettledPaymentCurrentFrom(tx, lease);
        expect(facts.payment.settlement.amount.amount).toBe('6');
        expect(facts.payment.purposeQualification).toBe(
          'NOT_ESTABLISHED_BY_PAYMENT',
        );
        expect(facts.actualPrefixSha256).toMatch(/^[a-f0-9]{64}$/u);
        expect(() =>
          consumeIndustrySettledPaymentCurrentFrom(
            { query: async () => ({ rows: [], rowCount: 0 }) },
            lease,
          ),
        ).toThrow('SAME_EXECUTOR');
      });
      await expect(
        db.query('select * from world_v2.financial_posting_batch'),
      ).rejects.toThrow('permission denied');
    });
    expect(() => consumeIndustrySettledPaymentCurrentFrom(tx, saved!)).toThrow(
      'LEASE',
    );
  });
  it('feeds actual payment into fixed cutoff while refusing missing real WORK and other inputs', async () => {
    const s = source(),
      guard = createPostwarIndustryOperatingCutoffGuard({
        source: s,
        protectedGuard: Object.create(
          ProtectedIndustryProductionGuard.prototype,
        ) as ProtectedIndustryProductionGuard,
      });
    const preparation = guard.preparePaymentData(paidInput);
    expect(() =>
      readPreparedIndustrySettledPaymentData(
        { ...preparation } as IndustrySettledPaymentDataPreparation,
        paidInput.target,
      ),
    ).toThrow('GENUINE');
    await asReader(async () => {
      let message = '';
      try {
        // Normal Atomic preparation reparses command/rebuilds posting while
        // retaining this exact Core transition. Private data must survive that.
        const actualCommand = C.validateCanonicalCommand(
          paidInput.target.command,
          sha,
        );
        const actualPosting = C.createProductionConsumptionPosting(
          {
            postingId: paidInput.target.posting.postingId,
            evidence: paidInput.target.posting.evidence,
            command: actualCommand,
            transition: paidInput.target.transition,
          },
          sha,
        );
        expect(actualPosting).not.toBe(paidInput.target.posting);
        await guard.assertCurrentFrom(tx, {
          ...paidInput.target,
          command: actualCommand,
          posting: actualPosting,
        });
      } catch (e) {
        message = String(e);
      }
      expect(message).toContain('INDUSTRY_OPERATING_FACTS_MISSING:WORK');
      expect(message).not.toContain('PAID_COST:');
      expect(() =>
        readIndustrySettledPaymentForCutoffFrom(
          tx,
          s,
          paidInput.target.command.fingerprint,
        ),
      ).toThrow('SOURCE_SCOPE_REQUIRED');
    });
  });
  it('rejects same seed/head but different receipt history before callback', async () => {
    const alternate = {
      ...paidInput,
      prior: [
        {
          ...paid,
          receipt: {
            ...paid.receipt,
            recordedAtReal: '2026-10-26T00:00:02.000Z',
          },
        },
      ],
    };
    expect(() => deriveIndustrySettledPaymentReceipt(alternate)).not.toThrow();
    let called = false;
    await asReader(async () => {
      await expect(
        source().withSettledPaymentFrom(tx, alternate, async () => {
          called = true;
        }),
      ).rejects.toThrow('ACTUAL_PREFIX_MISMATCH');
    });
    expect(called).toBe(false);
  });
  it('rejects same seed/head but different valid financial batches, not just hashes of selected payment', async () => {
    const b = paid.financialPostingBatches[0]!,
      fee = C.createFinancialPostingBatch(
        {
          ...paid,
          schemaVersion: b.schemaVersion,
          batchId: C.financialPostingBatchId('EXTRA_TEST_ONLY_FEE'),
          worldId: b.worldId,
          causationCommandId: b.causationCommandId,
          causationEventIds: b.causationEventIds,
          worldVersionBefore: b.worldVersionBefore,
          worldVersionAfter: b.worldVersionAfter,
          settlementCurrency: b.settlementCurrency,
          simTime: b.simTime,
          legs: b.legs.map((l, i) => ({
            ...l,
            legId: C.financialPostingLegId('EXTRA_TEST_ONLY_' + i),
            amount: C.Money.from('1', 'GCU'),
          })),
        },
        sha,
      );
    const alternate = {
      ...paidInput,
      prior: [{ ...paid, financialPostingBatches: [b, fee] }],
    };
    expect(() => deriveIndustrySettledPaymentReceipt(alternate)).not.toThrow();
    await asReader(async () => {
      await expect(
        source().withSettledPaymentFrom(tx, alternate, async () => undefined),
      ).rejects.toThrow('ACTUAL_PREFIX_MISMATCH');
    });
  });
  it('rejects a real COMMIT/new transaction inside callback and expires payment lease', async () => {
    let saved: IndustrySettledPaymentSourceLease | undefined;
    await asReader(async () => {
      await expect(
        source().withSettledPaymentFrom(tx, paidInput, async (lease) => {
          saved = lease;
          await db.exec('commit;begin isolation level repeatable read');
        }),
      ).rejects.toThrow('TRANSACTION_LIFETIME_CHANGED');
    });
    expect(() => consumeIndustrySettledPaymentCurrentFrom(tx, saved!)).toThrow(
      'LEASE',
    );
  });
  it('self-contained prepared cutoff freshly rejects stale H, rather than treating preparation as admission', async () => {
    const s = source(),
      guard = createPostwarIndustryOperatingCutoffGuard({
        source: s,
        protectedGuard: Object.create(
          ProtectedIndustryProductionGuard.prototype,
        ) as ProtectedIndustryProductionGuard,
      });
    guard.preparePaymentData(paidInput);
    await db.query(
      'update world_v2.world_head set world_version=2,event_sequence=2 where world_id=$1',
      [w],
    );
    try {
      await asReader(async () => {
        await expect(
          guard.assertCurrentFrom(tx, paidInput.target),
        ).rejects.toThrow('HEAD_STALE');
      });
    } finally {
      await db.query(
        'update world_v2.world_head set world_version=1,event_sequence=1 where world_id=$1',
        [w],
      );
    }
  });
  it('rejects actual same-head source revocation without manufacturing payment/work events', async () => {
    await db.query(
      'insert into world_v2.postwar_industry_original_revocation values($1,$2)',
      [w, 'TEST_ONLY_INDUSTRY_REG'],
    );
    await asReader(async () => {
      await expect(
        source().withSettledPaymentFrom(tx, paidInput, async () => undefined),
      ).rejects.toThrow('ORIGINAL_REVOKED');
    });
  });
});
