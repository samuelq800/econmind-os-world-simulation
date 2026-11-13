-- Candidate READ ONLY recovery metadata path. Requires the existing
-- postwar-office-derived-read.sql metadata owner/admission header and the
-- three reviewed intake reader groups. No production enrollment or raw grant.
begin;
do $guard$
begin
 if not exists(select 1 from pg_roles where rolname='world_v2_postwar_projection_owner' and not rolcanlogin and not rolsuper and not rolbypassrls and not rolcreatedb and not rolcreaterole and not rolreplication)
 then raise exception 'RECOVERY_EXISTING_METADATA_OWNER_REQUIRED'using errcode='42501';end if;
end;
$guard$;
grant create on schema world_v2 to world_v2_postwar_projection_owner;
create function world_v2.read_postwar_office_recovery_binding(
 p_world text,p_subject uuid,p_country text,p_office text,p_seat text,
 p_revision text,p_capability text,p_scope text)
returns table(seat_ref text,team_id text,authorization_version text,
 admission_ref text,seed_id text,seed_fingerprint text,model_version text,
 world_version text,event_sequence text)
language plpgsql security definer set search_path=pg_catalog as $body$
declare effective name;required name;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 required:=case
  when p_office='FINANCE'and p_capability='FINANCE_BUDGET'then 'world_v2_finance_budget_source_reader'
  when p_office='FINANCE'and p_capability='FINANCE_TREASURY'then 'world_v2_day_one_fx_source_reader'
  when p_office='SOCIAL'and p_capability='SOCIAL_LABOUR'then 'world_v2_social_intake_lock_reader'
  else null end;
 if current_setting('transaction_read_only')<>'on' or required is null
 or p_subject::text is distinct from current_setting('request.jwt.claim.sub',true)
 or p_scope is distinct from 'OFFICE_'||upper(encode(convert_to(p_country,'UTF8'),'hex'))||'_'||upper(encode(convert_to(p_office,'UTF8'),'hex'))
 or not pg_has_role(effective,required,'MEMBER')
 or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')
 or exists(select 1 from pg_roles r where r.rolname=effective and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))
 then raise exception 'RECOVERY_FIXED_READ_ONLY_SCOPE_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.postwar_projection_world',p_world,true);
 -- Same immutable admission+permit/revocation predicates as the existing
 -- bounded metadata reader. No row lock, current-state hydration or mutation.
 return query
 select s.seat_ref,a.team_id,a.authorization_version,
  h.admission_ref,h.seed_id,h.seed_fingerprint,h.model_version,
  w.world_version::text,w.event_sequence::text
 from world_v2.runtime_read_seat s
 join world_v2.current_commit_authorization a
  on a.world_id=s.world_id and a.auth_subject=s.auth_subject
  and a.country_id=s.country_id and a.office_id=s.office_id
  and a.team_id=s.team_id and a.authorization_version=s.authorization_revision
  and a.active and a.capability=p_capability
 join world_v2.projection_entitlement e
  on e.world_id=s.world_id and e.auth_subject=s.auth_subject
  and e.authorization_version=s.authorization_revision
  and e.active and e.revoked_at is null
  and e.classification='OFFICE_PRIVATE'and e.scope_key=p_scope
 join world_v2.world_head w on w.world_id=s.world_id
 cross join lateral world_v2.postwar_projection_admission_header(s.world_id)h
 where s.world_id=p_world and s.auth_subject=p_subject
  and s.country_id=p_country and s.office_id=p_office
  and s.seat_ref=p_seat and s.authorization_revision=p_revision
  and not exists(select 1 from world_v2.current_commit_authorization other
    where other.world_id=s.world_id and other.auth_subject=s.auth_subject and other.active
    and(other.country_id is distinct from s.country_id or other.team_id is distinct from s.team_id or other.authorization_version is distinct from s.authorization_revision))
 limit 2;
end;
$body$;
alter function world_v2.read_postwar_office_recovery_binding(text,uuid,text,text,text,text,text,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.read_postwar_office_recovery_binding(text,uuid,text,text,text,text,text,text)from public;
grant execute on function world_v2.read_postwar_office_recovery_binding(text,uuid,text,text,text,text,text,text)to world_v2_finance_budget_source_reader,world_v2_day_one_fx_source_reader,world_v2_social_intake_lock_reader;
revoke create on schema world_v2 from world_v2_postwar_projection_owner;
commit;
