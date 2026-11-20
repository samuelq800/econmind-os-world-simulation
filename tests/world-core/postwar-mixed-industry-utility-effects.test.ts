import { createIndustryPowerExecutionFixture } from '../support/industry-power-execution-fixture.js';
import { createIndustryWaterExecutionFixture } from '../support/industry-water-execution-fixture.js';
/** Actual tiny Core logistics frames and real PGlite effects functions. The
 * metadata installation is explicitly TEST_ONLY; no production admission,
 * operational producer, native PG or successful live operating World claimed. */
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import {
  prepareIndustryInternalLogisticsFrame,
  createIndustryInternalLogisticsExecutionState,
  readIndustryInternalLogisticsExecutionState,
} from '../../packages/core/src/inventory/industry-internal-logistics-execution.js';
import {
  createIndustryLogisticsExecutionFixture,
  logisticsSha as sha,
  logisticsAt as at,
} from '../support/industry-logistics-execution-fixture.js';
import type { FinanceNativeBudgetCanonicalFrame as Frame } from '../../packages/core/src/commands/finance-budget-native.js';
const sql = await readFile(
  new URL(
    '../../database/proposals/postwar-mixed-industry-utility-effects.sql',
    import.meta.url,
  ),
  'utf8',
);
const json = (v: unknown) =>
  JSON.parse(C.canonicalSerialize(v)) as Record<string, unknown>;
function frames() {
  const f = createIndustryLogisticsExecutionFixture();
  const workBody = {
    schemaVersion: 'industry-logistics-service-work-order-v1',
    purpose: 'DISTINCT_LOGISTICS_SERVICE_WORK',
    inputRef: 'SQL_WORK_ORDER',
    worldId: f.world,
    countryId: f.country,
    facilityId: f.workSource.facilityId,
    operatorId: f.operator,
    runId: f.request.runId,
    seedFingerprint: f.seed.fingerprint,
    transferId: f.request.transferId,
    labourSourceRef: f.labour.sourceRef,
    labourSourceRawSha256: f.labour.sourceRawSha256,
    allocations: [f.allocation],
  };
  const workRaw = C.canonicalSerialize(workBody),
    workOriginal = {
      reference: workBody.inputRef,
      rawText: workRaw,
      rawSha256: sha(workRaw),
    };
  let state = createIndustryInternalLogisticsExecutionState(
    { preparation: f.prep, sourceInputs: f.sourceInput([], [workOriginal]) },
    sha,
  );
  const step = (
    operation: Record<string, unknown>,
    id: string,
    time = '0',
    expenseOriginal?: ReturnType<typeof f.expense>,
  ) => {
    const candidate = prepareIndustryInternalLogisticsFrame(
      {
        state,
        command: f.command(state, operation, id, time),
        observedAtReal: at,
        ...(expenseOriginal ? { expenseOriginal } : {}),
      },
      sha,
    );
    state = candidate.state;
    return candidate.frame;
  };
  const book = step(f.book, 'SQL_BOOK'),
    ship = step(
      { action: 'SHIP', transferId: f.request.transferId },
      'SQL_SHIP',
    );
  const work = step(
    {
      action: 'SERVICE_WORK',
      transferId: f.request.transferId,
      workOrderRef: workOriginal.reference,
      workOrderSha256: workOriginal.rawSha256,
    },
    'SQL_WORK',
    '60000',
  );
  const expense = f.expense(work.events[0]!.fingerprint);
  const pay = step(
    {
      action: 'PAY_INPUTS',
      transferId: f.request.transferId,
      workEventFingerprint: work.events[0]!.fingerprint,
      expenseOrderRef: expense.reference,
      expenseOrderSha256: expense.rawSha256,
    },
    'SQL_PAY',
    '60000',
    expense,
  );
  const deliver = step(
    { action: 'DELIVER', transferId: f.request.transferId },
    'SQL_DELIVER',
    '60000',
  );
  return {
    f,
    book,
    ship,
    work,
    pay,
    deliver,
    expense,
    workOriginal,
    all: [f.scheduled.frame, book, ship, work, pay, deliver],
    state,
  };
}
async function fixture() {
  const c = frames(),
    db = new PGlite();
  await db.exec(`create schema world_v2;
 create role world_v2_industry_source_owner nologin nosuperuser nobypassrls;
 create role world_v2_postwar_projection_owner nologin nosuperuser nobypassrls;
 create role utility_effects_test_publisher nologin nosuperuser nobypassrls;
 create role utility_effects_test_reader nologin nosuperuser nobypassrls;
 grant usage on schema world_v2 to world_v2_industry_source_owner,world_v2_postwar_projection_owner,utility_effects_test_publisher,utility_effects_test_reader;
 create function world_v2.canonical_json(v jsonb)returns text language plpgsql immutable as $$declare result text;begin
 case jsonb_typeof(v)when'object'then select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||world_v2.canonical_json(value),','order by key collate "C"),'')||'}'into result from jsonb_each(v);
 when'array'then select '['||coalesce(string_agg(world_v2.canonical_json(value),','order by n),'')||']'into result from jsonb_array_elements(v)with ordinality q(value,n);
 else result:=v::text;end case;return result;end;$$;
 create function world_v2.authoritative_sha256(v text)returns text language sql immutable as $$select encode(sha256(convert_to(v,'UTF8')),'hex')$$;
 create table world_v2.runtime_opening_admission(world_id text primary key,seed_id text,seed_fingerprint text,admission_ref text);
 create table world_v2.postwar_industry_utility_source(world_id text,country_id text,facility_id text,source_text text,source_sha256 text,source_ref text,seed_id text,seed_fingerprint text,admission_ref text);
 create table world_v2.postwar_industry_water_grant_publication(world_id text,run_id text,schedule_command_id text,command_id text,command_fingerprint text,seed_fingerprint text,admission_ref text);
 create table world_v2.command_submission(world_id text,command_id text,command_type text,country_id text,office_id text,canonical_payload text,command_fingerprint text,payload_sha256 text,actor_id text,auth_subject uuid,expected_world_version bigint,sim_time numeric,schema_version text,idempotency_key text,correlation_id text,submitted_at_real timestamptz);
 create table world_v2.command_receipt(world_id text,command_id text,command_fingerprint text,outcome text,reason_code text,world_version_before bigint,world_version_after bigint,event_ids jsonb,transition_id text,sim_time numeric);
 create table world_v2.authoritative_event(world_id text,event_id text,event_fingerprint text,causation_command_id text,event_type text,world_version bigint,event_sequence bigint,sim_time numeric,canonical_payload text,payload_sha256 text);
 create table world_v2.financial_posting_batch(world_id text,batch_id text,causation_command_id text,canonical_payload text,batch_fingerprint text,event_ids jsonb,world_version_before bigint,world_version_after bigint,sim_time numeric);
 create table world_v2.inventory_posting(world_id text,posting_id text,causation_command_id text,canonical_payload text,posting_fingerprint text,event_ids jsonb,world_version_before bigint,world_version_after bigint,sim_time numeric);
 create table world_v2.test_only_site(world_id text,country_id text,source jsonb);
 create table world_v2.test_only_claims(world_id text,country_id text,operator_id text,claims jsonb);
 create table world_v2.test_only_orders(world_id text,country_id text,facility_id text,run_id text,record jsonb);
 alter table world_v2.postwar_industry_utility_source owner to world_v2_industry_source_owner;
 alter table world_v2.postwar_industry_water_grant_publication owner to world_v2_industry_source_owner;
 grant select on world_v2.runtime_opening_admission,world_v2.command_submission,world_v2.command_receipt,world_v2.authoritative_event,world_v2.financial_posting_batch,world_v2.inventory_posting to world_v2_postwar_projection_owner;
 grant select on world_v2.runtime_opening_admission,world_v2.postwar_industry_utility_source,world_v2.postwar_industry_water_grant_publication to world_v2_industry_source_owner;
 create function world_v2.industry_source_admission(w text)returns world_v2.runtime_opening_admission language sql security definer set search_path=pg_catalog as $$select a from world_v2.runtime_opening_admission a where a.world_id=w$$;
 create function world_v2.postwar_projection_industry_original(w text,c jsonb,e jsonb)returns jsonb language sql security definer set search_path=pg_catalog as $$select source from world_v2.test_only_site s where s.world_id=w and s.country_id=c->>'countryId'$$;
 create function world_v2.postwar_projection_industry_logistics_orders(w text,c text,f text,r text)returns jsonb language sql security definer set search_path=pg_catalog as $$select coalesce(jsonb_agg(record),'[]')from world_v2.test_only_orders o where o.world_id=w and o.country_id=c and o.facility_id=f and o.run_id=r$$;
 create function world_v2.postwar_projection_industry_wage_claims(w text,c text,op text)returns jsonb language sql security definer set search_path=pg_catalog as $$select claims from world_v2.test_only_claims s where s.world_id=w and s.country_id=c and s.operator_id=op$$;
 create function world_v2.postwar_industry_current_ratio(v jsonb)returns numeric[] language plpgsql immutable as $$begin if jsonb_typeof(v)<>'object'or v->>'numerator'!~'^[0-9]+$'or v->>'denominator'!~'^[1-9][0-9]*$'then raise exception 'INVALID_RATIO';end if;return array[(v->>'numerator')::numeric,(v->>'denominator')::numeric];end;$$;
 create function world_v2.postwar_mixed_current_batch(raw text,fp text,id text)returns jsonb language plpgsql immutable as $$begin if raw is distinct from world_v2.canonical_json(raw::jsonb)or raw::jsonb?'fingerprint'or raw::jsonb->>'batchId'is distinct from id or fp is distinct from'sha256:'||world_v2.authoritative_sha256(E'SHA-256\\n'||raw)then raise exception 'BAD_CANONICAL_BATCH';end if;return raw::jsonb||jsonb_build_object('fingerprint',fp);end;$$;`);
  await db.exec(`revoke all on function world_v2.industry_source_admission(text),world_v2.postwar_projection_industry_original(text,jsonb,jsonb),world_v2.postwar_projection_industry_logistics_orders(text,text,text,text),world_v2.postwar_projection_industry_wage_claims(text,text,text)from public;
 grant execute on function world_v2.industry_source_admission(text)to world_v2_industry_source_owner;
 grant execute on function world_v2.postwar_projection_industry_original(text,jsonb,jsonb),world_v2.postwar_projection_industry_logistics_orders(text,text,text,text),world_v2.postwar_projection_industry_wage_claims(text,text,text)to world_v2_postwar_projection_owner;`);
  await db.query(
    'insert into world_v2.runtime_opening_admission values($1,$2,$3,$4)',
    [
      c.f.world,
      c.f.seed.seedId,
      c.f.seed.fingerprint,
      c.f.workSource.admissionRef,
    ],
  );
  await db.query('insert into world_v2.test_only_site values($1,$2,$3)', [
    c.f.world,
    c.f.country,
    json(c.f.workSource),
  ]);
  await db.query('insert into world_v2.test_only_claims values($1,$2,$3,$4)', [
    c.f.world,
    c.f.country,
    c.f.operator,
    {
      payer: {
        asset_account: json(c.f.op.asset),
        liability_account: json(c.f.op.liability),
      },
      household: {
        asset_account: json(c.f.hh.asset),
        liability_account: json(c.f.hh.liability),
      },
    },
  ]);
  async function persist(f: Frame) {
    const command = f.command,
      r = f.receipt;
    await db.query(
      'insert into world_v2.command_submission values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
      [
        command.worldId,
        command.commandId,
        command.commandType,
        command.countryId,
        command.officeId,
        command.canonicalPayload,
        command.fingerprint,
        command.payloadHash,
        command.actorId,
        command.authSubject,
        command.expectedWorldVersion,
        command.simTime.toCanonicalValue(),
        command.schemaVersion,
        command.idempotencyKey,
        command.correlationId,
        command.submittedAtReal,
      ],
    );
    await db.query(
      'insert into world_v2.command_receipt values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [
        r.worldId,
        r.commandId,
        r.commandFingerprint,
        r.outcome,
        r.reasonCode,
        r.worldVersionBefore,
        r.worldVersionAfter,
        JSON.stringify(r.eventIds),
        r.transitionId,
        r.simTime.toCanonicalValue(),
      ],
    );
    for (const e of f.events)
      await db.query(
        'insert into world_v2.authoritative_event values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          e.worldId,
          e.eventId,
          e.fingerprint,
          e.causationCommandId,
          e.eventType,
          e.worldVersion,
          e.sequence,
          e.simTime.toCanonicalValue(),
          e.canonicalPayload,
          e.payloadHash,
        ],
      );
    for (const b of f.financialPostingBatches) {
      const value = json(b),
        { fingerprint, ...raw } = value;
      await db.query(
        'insert into world_v2.financial_posting_batch values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          value.worldId,
          value.batchId,
          value.causationCommandId,
          C.canonicalSerialize(raw),
          fingerprint,
          JSON.stringify(value.causationEventIds),
          value.worldVersionBefore,
          value.worldVersionAfter,
          value.simTime,
        ],
      );
    }
    for (const i of f.inventoryPostings) {
      const value = json(i),
        { fingerprint, ...raw } = value;
      await db.query(
        'insert into world_v2.inventory_posting values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          value.worldId,
          value.postingId,
          value.causationCommandId,
          C.canonicalSerialize(raw),
          fingerprint,
          JSON.stringify(value.causationEventIds),
          value.worldVersionBefore,
          value.worldVersionAfter,
          value.simTime,
        ],
      );
    }
  }
  for (const f of c.all) await persist(f);
  for (const [kind, original] of [
    ['WORK', c.workOriginal],
    ['PAY', c.expense],
  ] as const)
    await db.query(
      'insert into world_v2.test_only_orders values($1,$2,$3,$4,$5)',
      [
        c.f.world,
        c.f.country,
        c.f.workSource.facilityId,
        c.f.request.runId,
        {
          kind,
          originalRef: original.reference,
          originalSha256: original.rawSha256,
          originalText: original.rawText,
          seedFingerprint: c.f.seed.fingerprint,
          admissionRef: c.f.workSource.admissionRef,
        },
      ],
    );
  await db.exec(sql);
  await db.exec(
    `create function world_v2.test_only_utility_effects(w text,c jsonb,t jsonb,e jsonb,b jsonb,i jsonb)returns boolean language sql security definer set search_path=pg_catalog as $$select world_v2.postwar_mixed_industry_utility_group(w,c,t,e,b,i)$$;alter function world_v2.test_only_utility_effects(text,jsonb,jsonb,jsonb,jsonb,jsonb)owner to world_v2_postwar_projection_owner;revoke all on function world_v2.test_only_utility_effects(text,jsonb,jsonb,jsonb,jsonb,jsonb)from public;grant execute on function world_v2.test_only_utility_effects(text,jsonb,jsonb,jsonb,jsonb,jsonb)to utility_effects_test_publisher;`,
  );
  async function group(
    frame: Frame,
    change: Partial<{
      command: unknown;
      transition: unknown;
      events: unknown;
      batches: unknown;
      inventory: unknown;
      world: string;
      contextWorld: string;
    }> = {},
  ) {
    await db.exec(
      'begin isolation level repeatable read;set local role utility_effects_test_publisher',
    );
    try {
      await db.query(
        "select set_config('econmind.postwar_projection_world',$1,true)",
        [change.contextWorld ?? c.f.world],
      );
      const q = await db.query<{ value: boolean }>(
        'select world_v2.test_only_utility_effects($1,$2,$3,$4,$5,$6)as value',
        [
          change.world ?? c.f.world,
          change.command ?? json(frame.command),
          change.transition ?? json(frame.transition),
          change.events ?? json(frame.events),
          change.batches ?? json(frame.financialPostingBatches),
          change.inventory ?? json(frame.inventoryPostings),
        ],
      );
      return q.rows[0]!.value;
    } finally {
      await db.exec('rollback');
    }
  }
  return { db, c, group, persist };
}
function resourceFrames(kind: 'POWER' | 'WATER') {
  const first =
    kind === 'POWER'
      ? createIndustryPowerExecutionFixture()
      : createIndustryWaterExecutionFixture();
  const original =
    kind === 'POWER'
      ? (first as ReturnType<typeof createIndustryPowerExecutionFixture>)
          .original
      : (first as ReturnType<typeof createIndustryWaterExecutionFixture>)
          .powerWithPayment;
  const utility =
    kind === 'POWER'
      ? original.source
      : (first as ReturnType<typeof createIndustryWaterExecutionFixture>)
          .waterOriginal.source;
  const seed =
    kind === 'POWER'
      ? (first as ReturnType<typeof createIndustryPowerExecutionFixture>).f.f
          .seed
      : (first as ReturnType<typeof createIndustryWaterExecutionFixture>).seed;
  const grant =
    kind === 'WATER'
      ? JSON.parse(
          (first as ReturnType<typeof createIndustryWaterExecutionFixture>)
            .waterOriginal.grantEligibilityOriginal!.rawText,
        )
      : undefined;
  const compact = {
    schemaVersion: 'postwar-industry-utility-original-v1',
    worldId: seed.worldId,
    countryId: utility.countryId,
    facilityId: utility.facilityId,
    locationId: utility.locationId,
    operatorId: utility.operatorId,
    seedId: seed.seedId,
    seedFingerprint: seed.fingerprint,
    admissionRef: utility.admissionRef,
    openingGregorianTimestamp: '2026-11-01T00:00:00.000Z',
    sourceChecksumsSha256: sha('TEST_ONLY_METADATA_NOT_OFFLINE_PRODUCER'),
    adoptionRawSha256: utility.userAdoptionRawSha256,
    power: original.opening,
    water: grant
      ? {
          sourceRegionId: grant.sourceRegionId,
          basinRef: grant.basinRef,
          rawQuotaPerDay: grant.maximumRawQuotaPerDay.amount,
          allocationRawSha256: grant.sourceAllocationRawSha256,
        }
      : {},
    sourcePins: {},
  };
  const text = C.canonicalSerialize(compact),
    hash = sha(text),
    sourceRef = 'INDUSTRY_UTILITY_' + hash.toUpperCase();
  if (kind === 'POWER') {
    const f = createIndustryPowerExecutionFixture({
        sourceBasePins: {
          sourceRef: sourceRef + '_POWER',
          sourceRawSha256: hash,
        },
      }),
      delivered = f.commit(f.prepare(f.beforeDelivery, f.deliverCommand)),
      all = [...f.frames, delivered];
    expect(f.replay(all, f.withPayment, [f.wageSource]).complete).toBe(true);
    return {
      seed,
      utility,
      compact,
      text,
      hash,
      sourceRef,
      all,
      groups: [f.book, delivered],
      grant: undefined,
    };
  }
  const f = createIndustryWaterExecutionFixture('0.1', {
      WATER: { sourceRef: sourceRef + '_WATER', sourceRawSha256: hash },
      POWER: { sourceRef: sourceRef + '_POWER', sourceRawSha256: hash },
      automaticWaterGrant: true,
    }),
    delivered = f.commit(
      f.waterDraft(f.beforeWater, f.waterCommand, f.waterFinal.source),
    ),
    all = [...f.frames, delivered];
  expect(f.replay(all, f.waterFinal, f.powerWithPayment).complete).toBe(true);
  return {
    seed,
    utility,
    compact,
    text,
    hash,
    sourceRef,
    all,
    groups: [f.grant, delivered],
    grant: f.grant,
  };
}
async function installResource(
  f: Awaited<ReturnType<typeof fixture>>,
  r: ReturnType<typeof resourceFrames>,
) {
  await f.db.query(
    'insert into world_v2.runtime_opening_admission values($1,$2,$3,$4)',
    [r.seed.worldId, r.seed.seedId, r.seed.fingerprint, r.utility.admissionRef],
  );
  await f.db.query(
    'insert into world_v2.postwar_industry_utility_source values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      r.seed.worldId,
      r.utility.countryId,
      r.utility.facilityId,
      r.text,
      r.hash,
      r.sourceRef,
      r.seed.seedId,
      r.seed.fingerprint,
      r.utility.admissionRef,
    ],
  );
  for (const frame of r.all) await f.persist(frame);
  if (r.grant)
    await f.db.query(
      'insert into world_v2.postwar_industry_water_grant_publication values($1,$2,$3,$4,$5,$6,$7)',
      [
        r.seed.worldId,
        r.utility.runId,
        r.all[0]!.command.commandId,
        r.grant.command.commandId,
        r.grant.command.fingerprint,
        r.seed.fingerprint,
        r.utility.admissionRef,
      ],
    );
}
describe('strict mixed utility effects SQL over actual tiny Core journals', () => {
  it('installs the complete proposal and validates actual C BOOK, SHIP, six-leg PAY and named DELIVER', async () => {
    const f = await fixture();
    try {
      for (const frame of [f.c.book, f.c.ship, f.c.work, f.c.pay, f.c.deliver])
        expect(await f.group(frame)).toBe(true);
      expect(json(f.c.pay.financialPostingBatches[0]).legs).toHaveLength(6);
      expect(
        readIndustryInternalLogisticsExecutionState(f.c.state).head
          .worldVersion,
      ).toBe('6');
    } finally {
      await f.db.close();
    }
  });
  it('refuses missing/extra/tampered actual journals and a foreign World rather than accepting family names', async () => {
    const f = await fixture();
    try {
      await expect(f.group(f.c.pay, { batches: [] })).rejects.toThrow(
        'NO_EXTRA_ACTUAL_FINANCIAL',
      );
      const altered = json(f.c.pay.financialPostingBatches) as unknown as {
        legs: { amount: { amount: string } }[];
      }[];
      altered[0]!.legs[0]!.amount.amount = '999';
      await expect(f.group(f.c.pay, { batches: altered })).rejects.toThrow(
        'ACTUAL_CANONICAL_FINANCIAL',
      );
      await expect(f.group(f.c.ship, { inventory: [] })).rejects.toThrow(
        'NO_EXTRA_ACTUAL_INVENTORY',
      );
      await expect(
        f.group(f.c.book, { world: 'WORLD_FOREIGN_TEST_ONLY' }),
      ).rejects.toThrow('HELD_WORLD');
      expect(await f.group(f.c.pay)).toBe(true);
    } finally {
      await f.db.close();
    }
  });
  it('does not give the public reader private helper EXECUTE or any raw source-table access', async () => {
    const f = await fixture();
    try {
      await f.db.exec('set role utility_effects_test_reader');
      await expect(
        f.db.query(
          'select world_v2.postwar_projection_industry_utility_original($1,$2,$3)',
          [f.c.f.world, f.c.f.country, f.c.f.workSource.facilityId],
        ),
      ).rejects.toThrow('permission denied');
      await expect(
        f.db.query('select * from world_v2.postwar_industry_utility_source'),
      ).rejects.toThrow('permission denied');
      await f.db.exec('reset role');
    } finally {
      await f.db.close();
    }
  });
  it.each(['POWER', 'WATER'] as const)(
    'validates actual %s complete Core resource frames against exact registered compact pins',
    async (kind) => {
      const f = await fixture();
      try {
        const r = resourceFrames(kind);
        await installResource(f, r);
        for (const frame of r.groups)
          expect(
            await f.group(frame, {
              world: r.seed.worldId,
              contextWorld: r.seed.worldId,
            }),
          ).toBe(true);
        await f.db.query(
          'update world_v2.postwar_industry_utility_source set source_sha256=$1 where world_id=$2',
          ['0'.repeat(64), r.seed.worldId],
        );
        await expect(
          f.group(r.groups[0]!, {
            world: r.seed.worldId,
            contextWorld: r.seed.worldId,
          }),
        ).rejects.toThrow('EXACT_REGISTERED_ORIGINAL');
      } finally {
        await f.db.close();
      }
    },
  );
});
