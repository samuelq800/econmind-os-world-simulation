-- SOURCE-ONLY candidate. Depends on captain-operating-custody.sql,
-- postwar-captain-source-publication.sql, runtime-read-binding-storage.sql and
-- runtime-admission-publication.sql. No role/member/source/clock installation.
-- The existing inaccessible owner alone gets metadata lock column privileges;
-- the existing source reader receives EXECUTE only, never table/seed UPDATE.
begin;
do $$declare n text;begin
 foreach n in array array['world_v2_captain_source_owner','world_v2_captain_source_reader']loop
  if not exists(select 1 from pg_roles where rolname=n and not rolcanlogin and not rolsuper and not rolbypassrls and not rolcreatedb and not rolcreaterole and not rolreplication)then raise exception 'CAPTAIN_INTAKE_EXISTING_SAFE_ROLES_REQUIRED'using errcode='42501';end if;
 end loop;
end;$$;
grant usage,create on schema world_v2 to world_v2_captain_source_owner;
grant select(world_id,world_version,event_sequence)on world_v2.world_head to world_v2_captain_source_owner;
grant select(world_id,seed_id,seed_fingerprint,replay_binding)on world_v2.opening_seed to world_v2_captain_source_owner;
grant select(seat_ref,world_id,auth_subject,country_id,office_id,team_id,authorization_revision)on world_v2.runtime_read_seat to world_v2_captain_source_owner;
grant select(world_id,auth_subject,country_id,office_id,team_id,authorization_version,capability,active)on world_v2.current_commit_authorization to world_v2_captain_source_owner;
grant select(world_id,auth_subject,classification,scope_key,authorization_version,active,revoked_at)on world_v2.projection_entitlement to world_v2_captain_source_owner;
grant update(world_version)on world_v2.world_head to world_v2_captain_source_owner;
grant update(authorization_version)on world_v2.current_commit_authorization to world_v2_captain_source_owner;
grant update(active)on world_v2.projection_entitlement to world_v2_captain_source_owner;
-- These policies narrow access where RLS is enabled. This proposal does not
-- enable RLS on baseline tables and does not claim that inactive RLS protects
-- the owner there: inaccessible NOLOGIN identity plus exact fixed-function
-- predicates/column privileges remain necessary. No callable DML exists.
do $$declare t text;begin
 foreach t in array array['world_head','current_commit_authorization','runtime_read_seat','projection_entitlement']loop
  execute format('create policy captain_intake_owner_read on world_v2.%I for select to world_v2_captain_source_owner using(current_user=''world_v2_captain_source_owner''and world_id=current_setting(''econmind.captain_world'',true))',t);
  execute format('create policy captain_intake_owner_world_fence on world_v2.%I as restrictive for select to world_v2_captain_source_owner using(current_user=''world_v2_captain_source_owner''and world_id=current_setting(''econmind.captain_world'',true))',t);
 end loop;
 foreach t in array array['world_head','current_commit_authorization','projection_entitlement']loop
  execute format('create policy captain_intake_owner_lock on world_v2.%I for update to world_v2_captain_source_owner using(current_user=''world_v2_captain_source_owner''and world_id=current_setting(''econmind.captain_world'',true))with check(false)',t);
  execute format('create policy captain_intake_owner_lock_world_fence on world_v2.%I as restrictive for update to world_v2_captain_source_owner using(current_user=''world_v2_captain_source_owner''and world_id=current_setting(''econmind.captain_world'',true))with check(false)',t);
 end loop;
end;$$;
create function world_v2.captain_intake_exact_scope(p_world text,p_subject uuid,p_country text,p_office text,p_seat text,p_revision text,p_capability text,p_scope text)
returns void language plpgsql security definer set search_path=pg_catalog as $$declare effective name;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if p_office is distinct from 'CAPTAIN'or p_capability is distinct from 'CAPTAIN_CABINET'
 or p_subject is null or p_world is null or p_country is null or p_seat is null or p_revision is null
 or p_world!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or p_country!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'
 or p_seat!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or length(p_revision)not between 1 and 256 or btrim(p_revision)<>p_revision
 or p_subject::text is distinct from current_setting('request.jwt.claim.sub',true)
 or p_scope is distinct from 'OFFICE_'||upper(encode(convert_to(p_country,'UTF8'),'hex'))||'_4341505441494E'
 or not pg_has_role(effective,'world_v2_captain_source_reader','MEMBER')
 or pg_has_role(effective,'world_v2_captain_source_owner','MEMBER')
 or pg_has_role(effective,'world_v2_admission_release','MEMBER')
 or exists(select 1 from pg_roles r where r.rolname=effective and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))
 then raise exception 'CAPTAIN_INTAKE_FIXED_VERIFIED_SCOPE_REQUIRED'using errcode='42501';end if;
 -- Not authentication: this is merely the inaccessible owner's world fence.
 perform set_config('econmind.captain_world',p_world,true);
end;$$;
-- Metadata only and deliberately non-locking, including in READ ONLY recovery.
-- It does not hydrate seed bytes or admit Captain genesis/reason originals.
create function world_v2.captain_intake_admission_header(p_world text)
returns setof world_v2.runtime_opening_admission language plpgsql security definer set search_path=pg_catalog as $$begin
 return query select a.* from world_v2.runtime_opening_admission a
 join world_v2.opening_seed s on s.world_id=a.world_id and s.seed_id=a.seed_id and s.seed_fingerprint=a.seed_fingerprint and s.replay_binding=a.replay_binding and s.replay_binding::jsonb->>'modelVersion'=a.model_version
 join world_v2.runtime_admission_publication_permit p on 'ADMISSION_'||upper(p.authorization_sha256)=a.admission_ref and p.world_id=a.world_id and p.seed_id=a.seed_id and p.seed_fingerprint=a.seed_fingerprint and p.model_version=a.model_version and p.replay_binding=a.replay_binding and a.admitted_at_real>=p.valid_from and a.admitted_at_real<p.valid_until
 where a.world_id=p_world and not exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=p.authorization_id);
end;$$;
create function world_v2.lock_postwar_captain_intake_binding(p_world text,p_subject uuid,p_country text,p_office text,p_seat text,p_revision text,p_capability text,p_scope text)
returns table(seat_ref text,team_id text,authorization_version text,admission_ref text,seed_id text,seed_fingerprint text,model_version text,world_version text,event_sequence text)
language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;
begin
 if current_setting('transaction_read_only')<>'off'then raise exception 'CAPTAIN_INTAKE_WRITE_TRANSACTION_REQUIRED'using errcode='42501';end if;
 perform world_v2.captain_intake_exact_scope(p_world,p_subject,p_country,p_office,p_seat,p_revision,p_capability,p_scope);
 -- H first, then immutable admission/permit before mutable auth/entitlement.
 perform 1 from world_v2.world_head h where h.world_id=p_world for share;
 if not found then return;end if;
 select * into a from world_v2.captain_intake_admission_header(p_world);
 if not found then return;end if;
 perform world_v2.captain_publication_admission(p_world,a.seed_id,a.seed_fingerprint,a.admission_ref);
 return query select seat.seat_ref,authz.team_id,authz.authorization_version,admission.admission_ref,admission.seed_id,admission.seed_fingerprint,admission.model_version,head.world_version::text,head.event_sequence::text
 from world_v2.runtime_read_seat seat
 join world_v2.current_commit_authorization authz on authz.world_id=seat.world_id and authz.auth_subject=seat.auth_subject and authz.country_id=seat.country_id and authz.office_id=seat.office_id and authz.team_id=seat.team_id and authz.authorization_version=seat.authorization_revision and authz.active and authz.capability=p_capability
 join world_v2.projection_entitlement entitlement on entitlement.world_id=seat.world_id and entitlement.auth_subject=seat.auth_subject and entitlement.authorization_version=seat.authorization_revision and entitlement.active and entitlement.revoked_at is null and entitlement.classification='OFFICE_PRIVATE'and entitlement.scope_key=p_scope
 join world_v2.world_head head on head.world_id=seat.world_id
 cross join lateral world_v2.captain_intake_admission_header(seat.world_id)admission
 where seat.world_id=p_world and seat.auth_subject=p_subject and seat.country_id=p_country and seat.office_id=p_office and seat.seat_ref=p_seat and seat.authorization_revision=p_revision
 and not exists(select 1 from world_v2.current_commit_authorization other where other.world_id=seat.world_id and other.auth_subject=seat.auth_subject and other.active and(other.country_id is distinct from seat.country_id or other.team_id is distinct from seat.team_id or other.authorization_version is distinct from seat.authorization_revision))
 limit 2 for share of authz,entitlement;
end;$$;
create function world_v2.read_postwar_captain_recovery_binding(p_world text,p_subject uuid,p_country text,p_office text,p_seat text,p_revision text,p_capability text,p_scope text)
returns table(seat_ref text,team_id text,authorization_version text,admission_ref text,seed_id text,seed_fingerprint text,model_version text,world_version text,event_sequence text)
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if current_setting('transaction_read_only')<>'on'then raise exception 'CAPTAIN_RECOVERY_READ_ONLY_TRANSACTION_REQUIRED'using errcode='42501';end if;
 perform world_v2.captain_intake_exact_scope(p_world,p_subject,p_country,p_office,p_seat,p_revision,p_capability,p_scope);
 return query select seat.seat_ref,authz.team_id,authz.authorization_version,admission.admission_ref,admission.seed_id,admission.seed_fingerprint,admission.model_version,head.world_version::text,head.event_sequence::text
 from world_v2.runtime_read_seat seat
 join world_v2.current_commit_authorization authz on authz.world_id=seat.world_id and authz.auth_subject=seat.auth_subject and authz.country_id=seat.country_id and authz.office_id=seat.office_id and authz.team_id=seat.team_id and authz.authorization_version=seat.authorization_revision and authz.active and authz.capability=p_capability
 join world_v2.projection_entitlement entitlement on entitlement.world_id=seat.world_id and entitlement.auth_subject=seat.auth_subject and entitlement.authorization_version=seat.authorization_revision and entitlement.active and entitlement.revoked_at is null and entitlement.classification='OFFICE_PRIVATE'and entitlement.scope_key=p_scope
 join world_v2.world_head head on head.world_id=seat.world_id
 cross join lateral world_v2.captain_intake_admission_header(seat.world_id)admission
 where seat.world_id=p_world and seat.auth_subject=p_subject and seat.country_id=p_country and seat.office_id=p_office and seat.seat_ref=p_seat and seat.authorization_revision=p_revision
 and not exists(select 1 from world_v2.current_commit_authorization other where other.world_id=seat.world_id and other.auth_subject=seat.auth_subject and other.active and(other.country_id is distinct from seat.country_id or other.team_id is distinct from seat.team_id or other.authorization_version is distinct from seat.authorization_revision))
 limit 2;
end;$$;
alter function world_v2.captain_intake_exact_scope(text,uuid,text,text,text,text,text,text)owner to world_v2_captain_source_owner;
revoke all on function world_v2.captain_intake_exact_scope(text,uuid,text,text,text,text,text,text)from public;
alter function world_v2.captain_intake_admission_header(text)owner to world_v2_captain_source_owner;
revoke all on function world_v2.captain_intake_admission_header(text)from public;
alter function world_v2.lock_postwar_captain_intake_binding(text,uuid,text,text,text,text,text,text)owner to world_v2_captain_source_owner;
revoke all on function world_v2.lock_postwar_captain_intake_binding(text,uuid,text,text,text,text,text,text)from public;
grant execute on function world_v2.lock_postwar_captain_intake_binding(text,uuid,text,text,text,text,text,text)to world_v2_captain_source_reader;
alter function world_v2.read_postwar_captain_recovery_binding(text,uuid,text,text,text,text,text,text)owner to world_v2_captain_source_owner;
revoke all on function world_v2.read_postwar_captain_recovery_binding(text,uuid,text,text,text,text,text,text)from public;
grant execute on function world_v2.read_postwar_captain_recovery_binding(text,uuid,text,text,text,text,text,text)to world_v2_captain_source_reader;
-- Fixed economic-worker metadata delegation. The outer consumer already
-- holds its real writer lease; acquire H before admission and auth locks. No
-- JWT is fabricated for an automatic worker: p_subject comes from the validated
-- canonical command, with genuine Core proof/Atomic equality checks outside.
create function world_v2.captain_worker_authorization_scope(p_world text,p_subject uuid,p_country text,p_office text)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;a world_v2.runtime_opening_admission%rowtype;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if p_office is distinct from 'CAPTAIN'or p_subject is null or p_world is null or p_country is null
 or p_world!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or p_country!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'
 or current_setting('transaction_read_only')<>'off'
 or not pg_has_role(effective,'world_v2_captain_source_reader','MEMBER')
 or pg_has_role(effective,'world_v2_captain_source_owner','MEMBER')or pg_has_role(effective,'world_v2_admission_release','MEMBER')
 or exists(select 1 from pg_roles r where r.rolname=effective and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))
 then raise exception 'CAPTAIN_WORKER_FIXED_AUTHORIZATION_SCOPE_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.captain_world',p_world,true);
 perform 1 from world_v2.world_head h where h.world_id=p_world for share;
 if not found then raise exception 'CAPTAIN_WORKER_CURRENT_WORLD_REQUIRED'using errcode='55000';end if;
 select * into a from world_v2.captain_intake_admission_header(p_world);
 -- Never return zero rows for a missing admission in the revoked predicate:
 -- that could falsely assert absence of a still-active Office authorization.
 if not found then raise exception 'CAPTAIN_WORKER_CURRENT_ADMISSION_REQUIRED'using errcode='55000';end if;
 perform world_v2.captain_publication_admission(p_world,a.seed_id,a.seed_fingerprint,a.admission_ref);
end;$$;
create function world_v2.lock_postwar_captain_current_authorization(p_world text,p_subject uuid,p_country text,p_office text,p_capability text)
returns table(auth_subject text,world_id text,country_id text,office_id text,capability text,team_id text,authorization_version text)
language plpgsql security definer set search_path=pg_catalog as $$begin
 if p_capability is distinct from 'CAPTAIN_CABINET'then raise exception 'CAPTAIN_WORKER_FIXED_CAPABILITY_REQUIRED'using errcode='42501';end if;
 perform world_v2.captain_worker_authorization_scope(p_world,p_subject,p_country,p_office);
 return query select a.auth_subject::text,a.world_id,a.country_id,a.office_id,a.capability,a.team_id,a.authorization_version
 from world_v2.current_commit_authorization a
 join world_v2.runtime_read_seat s on s.world_id=a.world_id and s.auth_subject=a.auth_subject and s.country_id=a.country_id and s.office_id=a.office_id and s.team_id=a.team_id and s.authorization_revision=a.authorization_version
 join world_v2.projection_entitlement e on e.world_id=s.world_id and e.auth_subject=s.auth_subject and e.authorization_version=s.authorization_revision and e.active and e.revoked_at is null and e.classification='OFFICE_PRIVATE'and e.scope_key='OFFICE_'||upper(encode(convert_to(p_country,'UTF8'),'hex'))||'_4341505441494E'
 where a.world_id=p_world and a.auth_subject=p_subject and a.country_id=p_country and a.office_id=p_office and a.capability=p_capability and a.active
 and not exists(select 1 from world_v2.current_commit_authorization other where other.world_id=a.world_id and other.auth_subject=a.auth_subject and other.active and(other.country_id is distinct from a.country_id or other.team_id is distinct from a.team_id or other.authorization_version is distinct from a.authorization_version))
 limit 2 for share of a,e;
end;$$;
create function world_v2.lock_postwar_captain_revoked_authorization(p_world text,p_subject uuid,p_country text,p_office text)
returns table(present integer)language plpgsql security definer set search_path=pg_catalog as $$begin
 perform world_v2.captain_worker_authorization_scope(p_world,p_subject,p_country,p_office);
 -- Preserve the original negative predicate: ANY active capability in this
 -- exact Office prevents an authorization-revoked receipt. No entitlement or
 -- Cabinet-only join can hide an active row from that original assertion.
 return query select 1 from world_v2.current_commit_authorization a
 where a.world_id=p_world and a.auth_subject=p_subject and a.country_id=p_country and a.office_id is not distinct from p_office and a.active for share;
end;$$;
alter function world_v2.captain_worker_authorization_scope(text,uuid,text,text)owner to world_v2_captain_source_owner;
revoke all on function world_v2.captain_worker_authorization_scope(text,uuid,text,text)from public;
alter function world_v2.lock_postwar_captain_current_authorization(text,uuid,text,text,text)owner to world_v2_captain_source_owner;
revoke all on function world_v2.lock_postwar_captain_current_authorization(text,uuid,text,text,text)from public;
grant execute on function world_v2.lock_postwar_captain_current_authorization(text,uuid,text,text,text)to world_v2_captain_source_reader;
alter function world_v2.lock_postwar_captain_revoked_authorization(text,uuid,text,text)owner to world_v2_captain_source_owner;
revoke all on function world_v2.lock_postwar_captain_revoked_authorization(text,uuid,text,text)from public;
grant execute on function world_v2.lock_postwar_captain_revoked_authorization(text,uuid,text,text)to world_v2_captain_source_reader;
revoke create on schema world_v2 from world_v2_captain_source_owner;
commit;
