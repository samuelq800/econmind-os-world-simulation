/** Embedded SQL/metadata and pure-plan tests, NOT native admission/authority.
 * The real installed mixed consumer chain is verified separately. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { describe, it, expect } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import {
  mixedSocialOriginal,
  mixedSocialFrame,
  mixedSha,
  mixedWorld,
} from '../support/finance-social-fx-replay-fixture.js';
import { assertPostwarCurrentSocialMatchPlan } from '../../apps/world-worker/src/persistence/postwar-social-match-current-plan.js';
const at = '2026-10-29T00:00:00.000Z',
  seedFP = 'sha256:' + '1'.repeat(64),
  admission = 'ADMISSION_TEST_ONLY';
function budgetFrame(
  version: string,
  sequence: string,
  type = 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
) {
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: 'command-v1',
      worldId: mixedWorld,
      countryId: 'COUNTRY_01',
      officeId: 'FINANCE',
      commandType: type,
      commandId: 'COMMAND_TEST_ONLY_BUDGET_' + version,
      idempotencyKey: 'KEY_TEST_ONLY_BUDGET_' + version,
      actorId: 'ACTOR_TEST_ONLY',
      authSubject: '11111111-1111-4111-8111-111111111111',
      expectedWorldVersion: version,
      simTime: '0',
      submittedAtReal: at,
      correlationId: 'CORRELATION_TEST_ONLY',
      payload: { operation: 'SET_ENVELOPE' },
    },
    mixedSha,
  );
  const event = C.parseAuthoritativeEvent(
    {
      schemaVersion: 'event-v1',
      eventId: 'EVENT_' + command.commandId,
      eventType:
        type === 'CORE_FINANCE_BUDGET_APPROPRIATION_V1'
          ? 'FINANCE_NATIVE_BUDGET_ENVELOPE_SET_V1'
          : 'UNKNOWN_EVENT',
      worldId: mixedWorld,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: (BigInt(version) + 1n).toString(),
      sequence,
      simTime: '0',
      recordedAtReal: at,
      correctsEventId: null,
      payload: { classification: 'TEST_ONLY_METADATA_NOT_BUDGET_APPROVAL' },
    },
    mixedSha,
  );
  const transition = C.createAuthoritativeTransition({
    command,
    events: [event],
    worldVersionBefore: version,
    worldVersionAfter: event.worldVersion,
  });
  return {
    command,
    events: [event],
    transition,
    receipt: C.createFinalCommandReceipt({
      command,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: command.simTime,
      recordedAtReal: at,
    }),
    financialPostingBatches: [],
    inventoryPostings: [],
  };
}
function laterPlanFrame(
  original: ReturnType<typeof mixedSocialOriginal>,
  first: ReturnType<typeof mixedSocialFrame>,
) {
  const c = first.command;
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: c.schemaVersion,
      worldId: c.worldId,
      countryId: c.countryId,
      officeId: c.officeId,
      commandType: c.commandType,
      commandId: 'COMMAND_TEST_ONLY_LATER_PLAN',
      idempotencyKey: 'KEY_TEST_ONLY_LATER_PLAN',
      actorId: c.actorId,
      authSubject: c.authSubject,
      expectedWorldVersion: '2',
      simTime: '0',
      submittedAtReal: c.submittedAtReal,
      correlationId: c.correlationId,
      payload: JSON.parse(c.canonicalPayload),
    },
    mixedSha,
  );
  const operation = C.prepareSocialEmploymentServiceOperation({
    command,
    state: first.state,
    readFacts: original.facts,
    sha256Hex: mixedSha,
  });
  const event = C.parseAuthoritativeEvent(
    {
      schemaVersion: 'event-v1',
      eventId: 'EVENT_TEST_ONLY_LATER_PLAN',
      eventType: 'SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1',
      worldId: c.worldId,
      causationCommandId: command.commandId,
      correlationId: c.correlationId,
      worldVersion: '3',
      sequence: '3',
      simTime: '0',
      recordedAtReal: at,
      correctsEventId: null,
      payload: operation.eventPayload,
    },
    mixedSha,
  );
  const transition = C.createAuthoritativeTransition({
    command,
    events: [event],
    worldVersionBefore: '2',
    worldVersionAfter: '3',
  });
  return {
    command,
    events: [event],
    transition,
    receipt: C.createFinalCommandReceipt({
      command,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: command.simTime,
      recordedAtReal: at,
    }),
    financialPostingBatches: [],
    inventoryPostings: [],
    state: operation.state,
  };
}
const base = `create schema world_v2;
create role world_v2_social_source_owner nologin nosuperuser nobypassrls;
create role world_v2_social_source_publisher nologin nosuperuser nobypassrls;
grant usage on schema world_v2 to world_v2_social_source_owner,world_v2_social_source_publisher;
create table world_v2.world_head(world_id text primary key,world_version bigint,event_sequence bigint);
create table world_v2.runtime_opening_admission(world_id text,seed_id text,seed_fingerprint text,admission_ref text);
create table world_v2.social_operating_source_registration(world_id text,country_id text,registration_ref text,seed_fingerprint text,admission_ref text);
create table world_v2.social_operating_source_revocation(registration_ref text);
create table world_v2.social_operating_match_publisher(world_id text,country_id text,grant_ref text,registration_ref text,admission_ref text,issuer_role name,actor_id text,auth_subject uuid,rule_version text,valid_from_day bigint,valid_until_day bigint);
create table world_v2.social_operating_match_publisher_revocation(grant_ref text);
create table world_v2.social_operating_match_publication(world_id text,plan_command_id text,rule_version text,grant_ref text,command_id text,command_fingerprint text,primary key(world_id,plan_command_id,rule_version));
create table world_v2.command_submission(world_id text,command_id text,idempotency_key text,command_type text,schema_version text,canonical_payload text,payload_sha256 text,command_fingerprint text,auth_subject uuid,actor_id text,country_id text,office_id text,expected_world_version bigint,sim_time bigint,correlation_id text,submitted_at_real timestamptz,primary key(world_id,command_id));
create table world_v2.command_queue(world_id text,command_id text,authority_kind text,available_at_sim_time bigint);
create table world_v2.command_receipt(world_id text,command_id text,idempotency_key text,schema_version text,command_fingerprint text,outcome text,reason_code text,transition_id text,world_version_before bigint,world_version_after bigint,sim_time bigint,event_ids jsonb,recorded_at_real timestamptz);
create table world_v2.authoritative_event(world_id text,event_id text,event_type text,schema_version text,causation_command_id text,correlation_id text,world_version bigint,event_sequence bigint,sim_time bigint,recorded_at_real timestamptz,corrects_event_id text,canonical_payload text,payload_sha256 text,event_fingerprint text);
create table world_v2.financial_posting_batch(world_id text,batch_id text,causation_command_id text,world_version_before bigint,world_version_after bigint,sim_time bigint,event_ids jsonb,settlement_currency text,canonical_payload text,batch_fingerprint text);
create table world_v2.inventory_posting(world_id text);
create table world_v2.postwar_day_one_fx_quote_original(world_id text,country_id text,quote_ref text,quote_text text,quote_text_sha256 text);
create table world_v2.postwar_day_one_fx_source_original(world_id text,seed_id text,seed_fingerprint text,admission_ref text);
grant select on all tables in schema world_v2 to world_v2_social_source_owner;
-- Existing custody grants lock visibility; only immutable metadata columns.
grant update(world_version) on world_v2.world_head to world_v2_social_source_owner;
alter table world_v2.social_operating_source_registration owner to world_v2_social_source_owner;
alter table world_v2.social_operating_match_publisher owner to world_v2_social_source_owner;
alter table world_v2.social_operating_match_publication owner to world_v2_social_source_owner;
grant insert on world_v2.command_submission,world_v2.command_queue,world_v2.social_operating_match_publication to world_v2_social_source_owner;
create function world_v2.social_source_admission(w text)returns world_v2.runtime_opening_admission language plpgsql security definer set search_path=pg_catalog as $$declare a world_v2.runtime_opening_admission%rowtype;begin select * into strict a from world_v2.runtime_opening_admission where world_id=w;return a;end;$$;
alter function world_v2.social_source_admission(text)owner to world_v2_social_source_owner;`;
type Frame = ReturnType<typeof budgetFrame>;
async function insertFrame(db: PGlite, f: Frame) {
  const c = f.command,
    r = f.receipt;
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
  for (const e of f.events)
    await db.query(
      'insert into world_v2.authoritative_event values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
      [
        e.worldId,
        e.eventId,
        e.eventType,
        e.schemaVersion,
        e.causationCommandId,
        e.correlationId,
        e.worldVersion,
        e.sequence,
        e.simTime.toCanonicalValue(),
        e.recordedAtReal,
        e.correctsEventId,
        e.canonicalPayload,
        e.payloadHash,
        e.fingerprint,
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
      C.canonicalSerialize(r.eventIds),
      r.recordedAtReal,
    ],
  );
}
describe('mixed one-shot MATCH publisher', () => {
  it('binds a pending PLAN across a later different-domain frame and refuses settled state', () => {
    const original = mixedSocialOriginal(),
      plan = mixedSocialFrame(original, '0', '1'),
      later = budgetFrame('1', '2');
    const countries = [
      {
        countryId: original.countryId,
        lifecycle: C.createSocialPositionOfferLifecycleState(
          plan.state,
          original.offers,
        ),
        offerOrigins: [],
      },
    ];
    expect(
      assertPostwarCurrentSocialMatchPlan({
        frames: [plan, later],
        socialCountries: countries,
        countryId: original.countryId,
        planCommandId: plan.command.commandId,
        requirePending: true,
      }).state,
    ).toBe('PENDING');
    expect(() =>
      assertPostwarCurrentSocialMatchPlan({
        frames: [plan, later],
        socialCountries: [
          {
            ...countries[0]!,
            lifecycle: {
              ...countries[0]!.lifecycle,
              employment: {
                ...plan.state,
                plans: plan.state.plans.map((p) => ({
                  ...p,
                  state: 'SETTLED',
                  settlementCommandId: 'COMMAND_SETTLED',
                })),
              },
            },
          },
        ],
        countryId: original.countryId,
        planCommandId: plan.command.commandId,
        requirePending: true,
      }),
    ).toThrow('already settled');
  });
  it('refuses a genuinely later same-scope PLAN while retaining a different-domain intervening frame', () => {
    const original = mixedSocialOriginal(),
      first = mixedSocialFrame(original, '0', '1'),
      later = budgetFrame('1', '2'),
      replacement = laterPlanFrame(original, first);
    const countries = [
      {
        countryId: original.countryId,
        lifecycle: C.createSocialPositionOfferLifecycleState(
          replacement.state,
          original.offers,
        ),
        offerOrigins: [],
      },
    ];
    expect(() =>
      assertPostwarCurrentSocialMatchPlan({
        frames: [first, later, replacement],
        socialCountries: countries,
        countryId: original.countryId,
        planCommandId: first.command.commandId,
        requirePending: true,
      }),
    ).toThrow('superseded');
  });
  it('installs the actual candidate SQL and binds every canonical row before issuing exactly one actual-head command', async () => {
    const db = new PGlite();
    const original = mixedSocialOriginal(),
      p = mixedSocialFrame(original, '0', '1');
    // This SQL-only fixture proves stored-frame/ACL/FIFO publication identity,
    // not Budget economics. Native supplies full genuine Core/source authority.
    const plan = {
        command: p.command,
        events: p.events,
        transition: p.transition,
        receipt: p.receipt,
        financialPostingBatches: [],
        inventoryPostings: [],
      },
      later = budgetFrame('1', '2');
    const witness = (frames: readonly Frame[], version = '2', sequence = '2') =>
      C.canonicalSerialize({
        schemaVersion: 'postwar-mixed-match-publication-v1',
        seedPins: {
          worldId: mixedWorld,
          seedId: 'SEED_TEST_ONLY',
          seedFingerprint: seedFP,
          admissionRef: admission,
        },
        head: {
          worldId: mixedWorld,
          worldVersion: version,
          eventSequence: sequence,
        },
        planState: 'PENDING',
        frames: frames.map((f) => ({
          command: f.command,
          events: f.events,
          transition: f.transition,
          receipt: f.receipt,
          financialPostingBatches: f.financialPostingBatches,
          inventoryPostings: f.inventoryPostings,
        })),
      });
    const issue = async (text = witness([plan, later])) => {
      await db.exec('begin;set local role world_v2_social_source_publisher');
      try {
        const r = await db.query<Record<string, unknown>>(
          'select * from world_v2.publish_social_operating_mixed_match_due($1,$2,$3,$4)',
          [mixedWorld, 'COUNTRY_01', plan.command.commandId, text],
        );
        await db.exec('commit');
        return r;
      } catch (e) {
        await db.exec('rollback');
        throw e;
      }
    };
    try {
      await db.exec(base);
      const integrity = await readFile(
        new URL(
          '../../database/migrations/artifacts/0009_world_v2_posting_payload_integrity.sql',
          import.meta.url,
        ),
        'utf8',
      );
      await db.exec(
        integrity.slice(
          0,
          integrity.indexOf(
            'create or replace function world_v2.validate_inventory_posting_payload',
          ),
        ),
      );
      await db.exec(
        await readFile(
          new URL(
            '../../database/proposals/postwar-social-mixed-match-publisher.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      await db.query('insert into world_v2.world_head values($1,2,2)', [
        mixedWorld,
      ]);
      await db.query(
        'insert into world_v2.runtime_opening_admission values($1,$2,$3,$4)',
        [mixedWorld, 'SEED_TEST_ONLY', seedFP, admission],
      );
      await db.query(
        'insert into world_v2.social_operating_source_registration values($1,$2,$3,$4,$5)',
        [mixedWorld, 'COUNTRY_01', 'REG_TEST_ONLY', seedFP, admission],
      );
      await db.query(
        "insert into world_v2.social_operating_match_publisher values($1,'COUNTRY_01','GRANT_TEST_ONLY','REG_TEST_ONLY',$2,'world_v2_social_source_publisher','ACTOR_AUTOMATIC_TEST_ONLY','22222222-2222-4222-8222-222222222222','SOCIAL_JOB_MATCH_RULE_V1',0,1)",
        [mixedWorld, admission],
      );
      await insertFrame(db, plan);
      await insertFrame(db, later);
      await expect(
        db.query(
          'select * from world_v2.publish_social_operating_mixed_match_due($1,$2,$3,$4)',
          [
            mixedWorld,
            'COUNTRY_01',
            plan.command.commandId,
            witness([plan, later]),
          ],
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(issue(witness([plan], '1', '1'))).rejects.toThrow(
        'ACTUAL_HEAD',
      );
      await expect(issue(witness([plan]))).rejects.toThrow('COMPLETE_PREFIX');
      for (const [extra, reason] of [
        [budgetFrame('2', '3', 'UNKNOWN_TEST_ONLY_FAMILY'), 'UNKNOWN_FAMILY'],
        [laterPlanFrame(original, p), 'PLAN_SUPERSEDED'],
      ] as const) {
        await db.exec('begin');
        try {
          await insertFrame(db, extra);
          await db.query(
            'update world_v2.world_head set world_version=3,event_sequence=3 where world_id=$1',
            [mixedWorld],
          );
          await db.exec('set local role world_v2_social_source_publisher');
          await expect(
            db.query(
              'select * from world_v2.publish_social_operating_mixed_match_due($1,$2,$3,$4)',
              [
                mixedWorld,
                'COUNTRY_01',
                plan.command.commandId,
                witness([plan, later, extra], '3', '3'),
              ],
            ),
          ).rejects.toThrow(reason);
        } finally {
          await db.exec('rollback');
        }
      }
      expect(
        (
          await db.query(
            'select count(*)::text as n from world_v2.command_queue',
          )
        ).rows,
      ).toEqual([{ n: '0' }]);
      const issued = await issue();
      expect(String(issued.rows[0]!.expected_world_version)).toBe('2');
      expect(issued.rows[0]!.office_id).toBe(null);
      const duplicate = await issue();
      expect(duplicate.rows[0]!.command_fingerprint).toBe(
        issued.rows[0]!.command_fingerprint,
      );
      expect(
        (
          await db.query(
            'select count(*)::text as n from world_v2.command_queue',
          )
        ).rows,
      ).toEqual([{ n: '1' }]);
      await db.query(
        "insert into world_v2.social_operating_match_publisher_revocation values('GRANT_TEST_ONLY')",
      );
      await expect(issue()).rejects.toThrow('CURRENT_SOURCE_OR_PUBLISHER');
    } finally {
      await db.close();
    }
  });
});
