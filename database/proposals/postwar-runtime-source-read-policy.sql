-- UNREGISTERED DEVELOPMENT CANDIDATE ONLY. Existing release chain is required
-- for installation. No role, membership, GRANT, account permission, DML policy,
-- production migration registration, RLS bypass or trigger removal is added.
-- Requires runtime-read-binding-storage.sql and its immutable admission model.
-- Requires an independently enrolled trusted backend/offline NOLOGIN group
-- world_v2_postwar_offline_seed_reader. This file does not create/enroll it.
-- Online Workers/read roles MUST NOT be members and MUST NOT receive SELECT
-- on canonical_payload; they use only the separately sealed small-page and
-- metadata functions. This raw policy is offline evidence tooling only.
-- Raw seed originals are server-only: bounded Workers reads use the separately
-- sealed derived country/Office store, never return this world payload to UI.
create policy postwar_runtime_seed_exact_current_reader
on world_v2.opening_seed for select
to world_v2_postwar_offline_seed_reader
using (
  current_setting('transaction_read_only') = 'on'
  and current_setting('transaction_isolation') in ('repeatable read','serializable')
  and current_user not in ('anon','authenticated','service_role','postgres',
    'supabase_admin','supabase_auth_admin','world_v2_api_reader','world_v2_api_login')
  and exists (
    select 1 from pg_roles reader
    where reader.rolname=current_user
      and not reader.rolsuper and not reader.rolbypassrls
      and not reader.rolcreaterole and not reader.rolcreatedb and not reader.rolreplication
  )
  and exists (
    select 1
    from world_v2.current_commit_authorization a
    join world_v2.runtime_read_seat seat
      on seat.world_id=a.world_id and seat.auth_subject=a.auth_subject
      and seat.country_id=a.country_id and seat.office_id=a.office_id
      and seat.team_id=a.team_id and seat.authorization_revision=a.authorization_version
    join world_v2.projection_entitlement entitlement
      on entitlement.world_id=a.world_id and entitlement.auth_subject=a.auth_subject
      and entitlement.authorization_version=a.authorization_version
      and entitlement.classification='OFFICE_PRIVATE'
      and entitlement.scope_key=('OFFICE_' || upper(encode(convert_to(a.country_id,'UTF8'),'hex'))
        || '_' || upper(encode(convert_to(a.office_id,'UTF8'),'hex')))
      and entitlement.active and entitlement.revoked_at is null
    join world_v2.runtime_opening_admission admission
      on admission.world_id=a.world_id
    where a.world_id=opening_seed.world_id
      and a.auth_subject::text=current_setting('request.jwt.claim.sub',true)
      and a.active
      and admission.seed_id=opening_seed.seed_id
      and admission.seed_fingerprint=opening_seed.seed_fingerprint
      and admission.replay_binding=opening_seed.replay_binding
      and admission.model_version=(opening_seed.replay_binding::jsonb->>'modelVersion')
      and not exists (
        select 1 from world_v2.current_commit_authorization conflict
        where conflict.world_id=a.world_id and conflict.auth_subject=a.auth_subject and conflict.active
          and (conflict.country_id is distinct from a.country_id
            or conflict.team_id is distinct from a.team_id
            or conflict.authorization_version is distinct from a.authorization_version)
      )
  )
);
