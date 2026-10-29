-- Unregistered candidate. Requires runtime-read-binding-storage.sql,
-- runtime-admission-publication.sql and social-operating-custody.sql through
-- the same reviewed chain. No host membership, login, grants to an enrolled
-- API identity, source publication, bypass role or authority-write is installed.
begin;
do $$
begin
 if not exists(select 1 from pg_roles where rolname='world_v2_social_source_owner')
 or exists(select 1 from pg_roles where rolname='world_v2_social_source_owner'
   and(rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))
 then raise exception 'SOCIAL_EXISTING_SAFE_CUSTODY_OWNER_REQUIRED'using errcode='42501';end if;
 if not exists(select 1 from pg_roles where rolname='world_v2_social_intake_lock_reader')then
  create role world_v2_social_intake_lock_reader nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
 end if;
 if exists(select 1 from pg_roles where rolname='world_v2_social_intake_lock_reader'
   and(rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))
 then raise exception 'SOCIAL_UNSAFE_INTAKE_LOCK_READER'using errcode='42501';end if;
end;$$;
grant usage,create on schema world_v2 to world_v2_social_source_owner;
grant usage on schema world_v2 to world_v2_social_intake_lock_reader;
-- PostgreSQL FOR SHARE needs a column UPDATE privilege on its inaccessible
-- definer owner. The operational intake keeps metadata SELECT-only. No callable
-- UPDATE function exists; WITH CHECK(false) also rejects actual entitlement DML.
grant select on world_v2.projection_entitlement to world_v2_social_source_owner;
grant update(active)on world_v2.projection_entitlement to world_v2_social_source_owner;
create policy social_intake_owner_seat on world_v2.runtime_read_seat
for select to world_v2_social_source_owner using(
 current_user='world_v2_social_source_owner'
 and world_id=current_setting('econmind.social_custody_world',true)
 and auth_subject::text=current_setting('request.jwt.claim.sub',true));
create policy social_intake_owner_seat_world_fence on world_v2.runtime_read_seat
as restrictive for select to world_v2_social_source_owner using(
 current_user='world_v2_social_source_owner'
 and world_id=current_setting('econmind.social_custody_world',true));
create policy social_intake_owner_entitlement on world_v2.projection_entitlement
for select to world_v2_social_source_owner using(
 current_user='world_v2_social_source_owner'
 and world_id=current_setting('econmind.social_custody_world',true)
 and auth_subject::text=current_setting('request.jwt.claim.sub',true));
create policy social_intake_owner_entitlement_world_fence on world_v2.projection_entitlement
as restrictive for select to world_v2_social_source_owner using(
 current_user='world_v2_social_source_owner'
 and world_id=current_setting('econmind.social_custody_world',true));
create policy social_intake_owner_entitlement_lock on world_v2.projection_entitlement
for update to world_v2_social_source_owner using(
 current_user='world_v2_social_source_owner'
 and world_id=current_setting('econmind.social_custody_world',true)
 and auth_subject::text=current_setting('request.jwt.claim.sub',true))with check(false);
create policy social_intake_owner_entitlement_lock_world_fence on world_v2.projection_entitlement
as restrictive for update to world_v2_social_source_owner using(
 current_user='world_v2_social_source_owner'
 and world_id=current_setting('econmind.social_custody_world',true))with check(false);

create function world_v2.lock_social_intake_binding(
 p_world text,p_subject uuid,p_country text,p_office text,p_seat text,
 p_authorization_version text,p_capability text,p_scope text)
returns table(seat_ref text,team_id text,authorization_version text,
 admission_ref text,seed_id text,seed_fingerprint text,model_version text,
 world_version text,event_sequence text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;admitted world_v2.runtime_opening_admission%rowtype;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if p_office is distinct from 'SOCIAL'or p_capability is distinct from 'SOCIAL_LABOUR'
 or p_subject is null or p_world is null or p_country is null or p_seat is null
 or p_authorization_version is null or p_scope is null
 or p_world!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'
 or p_country!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'
 or current_setting('request.jwt.claim.sub',true)is distinct from p_subject::text
 or not pg_has_role(effective,'world_v2_social_intake_lock_reader','MEMBER')
 or pg_has_role(effective,'world_v2_social_source_owner','MEMBER')
 or pg_has_role(effective,'world_v2_social_source_publisher','MEMBER')
 or pg_has_role(effective,'world_v2_social_source_reader','MEMBER')
 or exists(select 1 from pg_roles r where r.rolname=effective
   and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))
 then raise exception 'SOCIAL_FIXED_INTAKE_CUTOFF_REQUIRED'using errcode='42501';end if;
 if p_scope is distinct from 'OFFICE_'||upper(encode(convert_to(p_country,'UTF8'),'hex'))||'_534F4349414C'
 then raise exception 'SOCIAL_EXACT_OFFICE_SCOPE_REQUIRED'using errcode='42501';end if;
 -- This local setting only narrows the inaccessible owner's RLS. It is never
 -- authentication: the fixed server role, JWT-subject consistency and exact
 -- persisted current assignment/entitlement/admission below remain required.
 perform set_config('econmind.social_custody_world',p_world,true);
 perform 1 from world_v2.world_head h where h.world_id=p_world for share;
 -- Reuse the actual immutable admission+controlled permit/revocation locks.
 -- Missing/unknown admission errors propagate; there is no empty-success or
 -- raw canonical payload returned to the online intake identity.
 admitted:=world_v2.social_source_admission(p_world);
 return query
 select seat.seat_ref,authz.team_id,authz.authorization_version,
  admission.admission_ref,admission.seed_id,admission.seed_fingerprint,
  admission.model_version,head.world_version::text,head.event_sequence::text
 from world_v2.runtime_read_seat seat
 join world_v2.current_commit_authorization authz
  on authz.world_id=seat.world_id and authz.auth_subject=seat.auth_subject
  and authz.country_id=seat.country_id and authz.office_id=seat.office_id
  and authz.team_id=seat.team_id and authz.authorization_version=seat.authorization_revision
  and authz.active and authz.capability=p_capability
 join world_v2.runtime_opening_admission admission on admission.world_id=seat.world_id
  and admission.admission_ref=admitted.admission_ref
 join world_v2.opening_seed seed on seed.world_id=admission.world_id
  and seed.seed_id=admission.seed_id and seed.seed_fingerprint=admission.seed_fingerprint
  and seed.replay_binding=admission.replay_binding
  and(seed.replay_binding::jsonb->>'modelVersion')=admission.model_version
 join world_v2.world_head head on head.world_id=seed.world_id
 join world_v2.projection_entitlement entitlement
  on entitlement.world_id=seat.world_id and entitlement.auth_subject=seat.auth_subject
  and entitlement.authorization_version=seat.authorization_revision and entitlement.active
  and entitlement.revoked_at is null and entitlement.classification='OFFICE_PRIVATE'
  and entitlement.scope_key=p_scope
 where seat.world_id=p_world and seat.auth_subject=p_subject and seat.country_id=p_country
  and seat.office_id=p_office and seat.seat_ref=p_seat and seat.authorization_revision=p_authorization_version
  and not exists(select 1 from world_v2.current_commit_authorization other
    where other.world_id=seat.world_id and other.auth_subject=seat.auth_subject and other.active
    and(other.country_id is distinct from seat.country_id or other.team_id is distinct from seat.team_id
      or other.authorization_version is distinct from seat.authorization_revision))
 limit 2 for share of authz,entitlement;
end;$$;
alter function world_v2.lock_social_intake_binding(text,uuid,text,text,text,text,text,text)owner to world_v2_social_source_owner;
revoke all on function world_v2.lock_social_intake_binding(text,uuid,text,text,text,text,text,text)from public;
grant execute on function world_v2.lock_social_intake_binding(text,uuid,text,text,text,text,text,text)to world_v2_social_intake_lock_reader;
revoke create on schema world_v2 from world_v2_social_source_owner;
commit;
