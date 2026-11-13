/** TEST_ONLY thin schema. Exercises actual candidate SQL/ACL, not a source
 * admission/economic proof; no RLS-enabled baseline claim is made here. */
import { PGlite } from '@electric-sql/pglite';
import * as C from '../../packages/core/src/index.js';
import type { FinanceNativeBudgetCanonicalFrame as Frame } from '../../packages/core/src/commands/finance-budget-native.js';
export const mixedMatchSqlTestBase = `create schema world_v2;
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
export async function insertMixedMatchSqlTestFrame(db: PGlite, f: Frame) {
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
