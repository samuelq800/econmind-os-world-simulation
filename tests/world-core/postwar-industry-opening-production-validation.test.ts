/** Actual original schema + real Core posting variants. TEST_ONLY metadata,
 * no native source custody, financial settlement, or production claim. */
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import {
  canonicalSerialize,
  type ProductionConsumptionEvidence,
  type InventoryProductionPosting,
  type SimTime,
  type Quantity,
  type Money,
} from '../../packages/core/src/index.js';
import {
  INDUSTRY_FIRST_DAY_POLICY_VERSION,
  INDUSTRY_FIRST_DAY_POLICY_RAW_SHA256,
  INDUSTRY_FIRST_DAY_USER_ADOPTION_RAW_SHA256,
} from '../../packages/core/src/inventory/production-operating-basis.js';
import { createProductionSchemaFixture } from '../support/production-schema-fixture.js';
import { createPGliteV09AtomicTestDatabase } from '../support/v09-atomic-database.js';
type MutableJson<T> = T extends SimTime
  ? string
  : T extends Quantity
    ? { amount: string; unit: string }
    : T extends Money
      ? { amount: string; currency: string }
      : T extends readonly (infer U)[]
        ? MutableJson<U>[]
        : T extends string
          ? string
          : T extends object
            ? { -readonly [K in keyof T]: MutableJson<T[K]> }
            : T;
type Payload = MutableJson<Omit<InventoryProductionPosting, 'fingerprint'>>;
const db = createPGliteV09AtomicTestDatabase(),
  f = createProductionSchemaFixture();
const read = (p: string) =>
  readFile(new URL('../../' + p, import.meta.url), 'utf8');
function openingEvidence(): ProductionConsumptionEvidence {
  const old = f.evidence,
    source = {
      schemaVersion: 'postwar-industry-first-day-basis-v1' as const,
      policyVersion: INDUSTRY_FIRST_DAY_POLICY_VERSION,
      policyRawSha256: INDUSTRY_FIRST_DAY_POLICY_RAW_SHA256,
      userAdoptionRawSha256: INDUSTRY_FIRST_DAY_USER_ADOPTION_RAW_SHA256,
      worldId: f.seed.worldId,
      countryId: old.output.countryId,
      facilityRef: old.operating.payload.facilityRef,
      operatorId: old.operating.payload.operatorId,
      seedId: f.seed.seedId,
      seedFingerprint: f.seed.fingerprint,
      sourceRef: 'SOURCE.TEST_ONLY.OPENING',
      sourceRawSha256: 'b'.repeat(64),
      sourcePointer: 'TEST_ONLY.opening.condition',
      rightsScope: 'DOMESTIC_EXISTING_UNFRAGMENTED_OP_AGGREGATE' as const,
      openingWindowStartsAtSimTime: '0' as const,
      openingWindowEndsAtSimTime: '86400000' as const,
    };
  const payload = {
    ...old.operating.payload,
    maintenanceAppliedRef: null,
    maintenanceBasis: 'OPENING_SERVICEABLE_NOT_COMPLETED_MAINTENANCE' as const,
    openingServiceability: {
      ...source,
      originalConditionFraction: '1' as const,
    },
    technologyRightRef: null,
    baselineTechnologyNonrequirement: {
      ...source,
      basis: 'EXISTING_SITE_REFINERY_RECIPE_COEFFICIENTS' as const,
      recipeFactRef: old.recipe.factRef,
      recipeSourceRef: old.recipe.sourceRef,
      recipeCanonicalPayload: old.recipe.canonicalPayload,
      baselineProductivity: old.input.capacity.payload.productivity,
      baselineRequiredTechnologyRightRefs: [],
      excludedUpgradeTechnologyRefs: [],
    },
  };
  return {
    ...old,
    operating: {
      ...old.operating,
      payload,
      canonicalPayload: canonicalSerialize(payload),
    },
  };
}
async function installTarget(actual: ReturnType<typeof f.make>) {
  const c = actual.command;
  await db.query('begin');
  await db.query(
    'insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
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
  for (const e of actual.transition.events)
    await db.query(
      'insert into world_v2.authoritative_event(world_id,event_id,event_sequence,world_version,causation_command_id,correlation_id,event_type,schema_version,canonical_payload,payload_sha256,event_fingerprint,sim_time,recorded_at_real,corrects_event_id)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
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
}
function data(actual: ReturnType<typeof f.make>) {
  const { fingerprint: _fp, ...p } = actual.posting;
  void _fp;
  return JSON.parse(canonicalSerialize(p)) as Payload;
}
async function validate(p: Payload) {
  return db.query(
    'select world_v2.validate_inventory_production_payload($1::jsonb,jsonb_populate_record(null::world_v2.inventory_posting,$2::jsonb))',
    [
      canonicalSerialize(p),
      JSON.stringify({
        world_id: p.worldId,
        posting_id: p.postingId,
        causation_command_id: p.causationCommandId,
        world_version_before: p.worldVersionBefore,
        world_version_after: p.worldVersionAfter,
        sim_time: p.simTime,
        event_ids: p.causationEventIds,
        transition_binding: canonicalSerialize(p.transitionBinding),
        operation: p.operation,
      }),
    ],
  );
}
beforeAll(async () => {
  const manifest = JSON.parse(
    await read('database/migrations/manifest.json'),
  ) as { migrations: { release_order: number; path: string }[] };
  for (const m of manifest.migrations.filter((m) => m.release_order <= 21))
    await db.executeScript(await read(m.path));
  await db.executeScript(
    await read(
      'database/migrations/artifacts/0023_world_v2_production_consumption_posting.sql',
    ),
  );
  // Real dependency proposals, including actual SourceOwner/RLS; no hand-made
  // same-named metadata tables or broad runtime seed privileges.
  for (const proposal of [
    'runtime-read-binding-storage.sql',
    'runtime-admission-publication.sql',
    'postwar-industry-production-source.sql',
  ])
    await db.executeScript(await read('database/proposals/' + proposal));
  await db.executeScript(
    await read(
      'database/proposals/postwar-industry-opening-production-validation.sql',
    ),
  );
  await db.query('insert into world_v2.world_head(world_id)values($1)', [
    f.seed.worldId,
  ]);
  await db.query('insert into world_v2.world_head(world_id)values($1)', [
    f.seed.worldId + '_NO_SEED',
  ]);
  const { fingerprint, ...intent } = f.seed;
  await db.query(
    'insert into world_v2.opening_seed(world_id,seed_id,opening_world_version,replay_binding,canonical_payload,seed_fingerprint,bootstrapped_at_real)values($1,$2,0,$3,$4,$5,$6::timestamptz)',
    [
      f.seed.worldId,
      f.seed.seedId,
      canonicalSerialize(f.seed.replayBinding),
      canonicalSerialize(intent),
      fingerprint,
      '2026-10-07T00:00:00.000Z',
    ],
  );
  await db.executeScript(`
create role test_industry_validation_group nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
create role test_industry_validation_worker nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
grant test_industry_validation_group to test_industry_validation_worker;
grant usage on schema world_v2 to test_industry_validation_worker;
grant select on world_v2.command_submission,world_v2.authoritative_event,world_v2.command_receipt,world_v2.inventory_posting to test_industry_validation_worker;
grant execute on function world_v2.industry_opening_inventory_batch_exists(text,text)to test_industry_validation_group;
`);
}, 30000);
afterEach(async () => {
  await db.query('rollback');
  await db.executeScript('reset role;set session authorization postgres');
});
afterAll(async () => {
  await db.close();
});
describe('versioned opening operating validator on actual SQL', () => {
  it('preserves old completed-maintenance/license Core posting', async () => {
    const actual = f.make();
    await installTarget(actual);
    await expect(validate(data(actual))).resolves.toBeDefined();
  });
  it('accepts actual Core finite opening variant without rewriting null references or accounting evidence', async () => {
    const actual = f.make(openingEvidence());
    await installTarget(actual);
    const p = data(actual);
    await expect(validate(p)).resolves.toBeDefined();
    expect(p.evidence.operating.payload.maintenanceAppliedRef).toBeNull();
    expect(p.evidence.operating.payload.technologyRightRef).toBeNull();
  });
  it.each([
    'condition',
    'policy',
    'world',
    'upgrade',
    'window',
    'funding',
    'extra',
  ] as const)(
    'rejects %s tampering before any posting writes',
    async (kind) => {
      const actual = f.make(openingEvidence());
      await installTarget(actual);
      const p = data(actual),
        op = p.evidence.operating.payload;
      if (kind === 'condition')
        op.openingServiceability!.originalConditionFraction = '0.9';
      if (kind === 'policy')
        op.openingServiceability!.policyRawSha256 = 'c'.repeat(64);
      if (kind === 'world') op.openingServiceability!.worldId = 'WORLD_OTHER';
      if (kind === 'upgrade')
        op.baselineTechnologyNonrequirement!.baselineRequiredTechnologyRightRefs =
          ['UPGRADE_UNGRANTED'];
      if (kind === 'window')
        op.openingServiceability!.openingWindowEndsAtSimTime = '172800000';
      if (kind === 'funding') op.settledCost.amount = '0';
      if (kind === 'extra') Object.assign(op, { ready: true });
      p.evidence.operating.canonicalPayload = canonicalSerialize(op);
      await expect(validate(p)).rejects.toMatchObject({ code: '23514' });
    },
  );
  it('does not infer EXEC from NOINHERIT membership or give workers/readers raw seed access', async () => {
    await db.query(
      'revoke execute on function world_v2.industry_opening_inventory_batch_exists(text,text)from test_industry_validation_worker',
    );
    const helper = await db.query<{
      owner: string;
      security_definer: boolean;
      configuration: string[];
      login: boolean;
    }>(
      "select r.rolname owner,p.prosecdef security_definer,p.proconfig configuration,r.rolcanlogin login from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='world_v2.industry_opening_inventory_batch_exists(text,text)'::regprocedure",
    );
    expect(helper.rows[0]).toEqual({
      owner: 'world_v2_industry_source_owner',
      security_definer: true,
      configuration: ['search_path=pg_catalog'],
      login: false,
    });
    await db.query('set session authorization test_industry_validation_worker');
    const privilege = await db.query<{
      member: boolean;
      lookup: boolean;
      raw: boolean;
    }>(
      "select pg_has_role(current_user,'test_industry_validation_group','MEMBER')member,has_function_privilege(current_user,'world_v2.industry_opening_inventory_batch_exists(text,text)','EXECUTE')lookup,has_column_privilege(current_user,'world_v2.opening_seed','canonical_payload','SELECT')raw",
    );
    expect(privilege.rows[0]).toEqual({
      member: true,
      lookup: false,
      raw: false,
    });
    await expect(
      db.query('select canonical_payload from world_v2.opening_seed'),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      db.query(
        'select world_v2.industry_opening_inventory_batch_exists($1,$2)',
        [f.seed.worldId, 'ORE_BATCH'],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await db.executeScript('set session authorization postgres');
    await db.query(
      'grant execute on function world_v2.industry_opening_inventory_batch_exists(text,text)to test_industry_validation_worker',
    );
    expect(
      (
        await db.query<{ reader: boolean }>(
          "select has_function_privilege('world_v2_industry_source_reader','world_v2.industry_opening_inventory_batch_exists(text,text)','EXECUTE')reader",
        )
      ).rows[0]?.reader,
    ).toBe(false);
  });
  it('returns only the actual World inventory batch boolean, with missing World/seed distinguished from absence', async () => {
    await db.query(
      'grant execute on function world_v2.industry_opening_inventory_batch_exists(text,text)to test_industry_validation_worker',
    );
    await db.query('set session authorization test_industry_validation_worker');
    const hit = await db.query<{ present: boolean }>(
      'select world_v2.industry_opening_inventory_batch_exists($1,$2)present',
      [f.seed.worldId, 'ORE_BATCH'],
    );
    expect(hit.rows).toEqual([{ present: true }]);
    expect(
      (
        await db.query<{ present: boolean }>(
          'select world_v2.industry_opening_inventory_batch_exists($1,$2)present',
          [f.seed.worldId, 'NEW_OUTPUT_BATCH'],
        )
      ).rows,
    ).toEqual([{ present: false }]);
    await expect(
      db.query(
        'select world_v2.industry_opening_inventory_batch_exists($1,$2)',
        [f.seed.worldId + '_OTHER', 'ORE_BATCH'],
      ),
    ).rejects.toMatchObject({ code: '55000' });
    await expect(
      db.query(
        'select world_v2.industry_opening_inventory_batch_exists($1,$2)',
        [f.seed.worldId + '_NO_SEED', 'ORE_BATCH'],
      ),
    ).rejects.toMatchObject({ code: '55000' });
    await expect(
      db.query(
        'select world_v2.industry_opening_inventory_batch_exists($1,$2)',
        [null, 'ORE_BATCH'],
      ),
    ).rejects.toMatchObject({ code: '22023' });
    await expect(
      db.query('set role world_v2_industry_source_owner'),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      db.query('select canonical_payload from world_v2.opening_seed'),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it.each(['legacy', 'opening'] as const)(
    'validates %s posting at the actual low role while preserving null-ref and funding guards',
    async (variant) => {
      await db.query(
        'grant execute on function world_v2.industry_opening_inventory_batch_exists(text,text)to test_industry_validation_worker',
      );
      const actual = f.make(
        variant === 'opening' ? openingEvidence() : undefined,
      );
      await installTarget(actual);
      await db.query('set local role test_industry_validation_worker');
      await expect(validate(data(actual))).resolves.toBeDefined();
      const bad = data(actual);
      bad.evidence.operating.payload.settledCost.amount = '0';
      bad.evidence.operating.canonicalPayload = canonicalSerialize(
        bad.evidence.operating.payload,
      );
      await expect(validate(bad)).rejects.toMatchObject({ code: '23514' });
    },
  );
});
