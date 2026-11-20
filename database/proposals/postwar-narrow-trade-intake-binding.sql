-- SOURCE-ONLY CANDIDATE. Depends on postwar-narrow-trade-current-source.sql.
-- Fixed requested-seat metadata only: no economic/source approval, role or grant
-- installation. Existing inaccessible owner already has metadata lock columns;
-- no runtime table SELECT/UPDATE or raw canonical seed privilege is added.
begin;
do $$declare n text;begin
 foreach n in array array['world_v2_postwar_narrow_trade_current_owner','world_v2_postwar_narrow_trade_source']loop
 if not exists(select 1 from pg_roles where rolname=n and not rolcanlogin and not rolsuper and not rolbypassrls and not rolcreatedb and not rolcreaterole and not rolreplication)then raise exception 'TRADE_INTAKE_EXISTING_SAFE_ROLES_REQUIRED'using errcode='42501';end if;
 end loop;
end;$$;
grant create on schema world_v2 to world_v2_postwar_narrow_trade_current_owner;
-- Existing FORCE RLS owner policies use this same exact-world GUC. This file
-- does not enable/disable shared RLS, bypass it, or claim disabled RLS protects
-- a definer. Owner remains NOLOGIN, non-member and exposes only fixed reads.
create function world_v2.trade_intake_exact_scope(p_world text,p_subject uuid,p_country text,p_office text,p_seat text,p_revision text,p_capability text,p_scope text)
returns void language plpgsql security definer set search_path=pg_catalog as $$declare effective name;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if p_office is distinct from 'TRADE'or p_capability is distinct from 'TRADE_CONTRACTS'
 or p_subject is null or p_world is null or p_country is null or p_seat is null or p_revision is null
 or p_world!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or p_country!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'
 or p_seat!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or length(p_revision)not between 1 and 256 or btrim(p_revision)<>p_revision
 or p_subject::text is distinct from current_setting('request.jwt.claim.sub',true)
 or p_scope is distinct from 'OFFICE_'||upper(encode(convert_to(p_country,'UTF8'),'hex'))||'_5452414445'
 or not pg_has_role(effective,'world_v2_postwar_narrow_trade_source','MEMBER')
 or pg_has_role(effective,'world_v2_postwar_narrow_trade_current_owner','MEMBER')
 or pg_has_role(effective,'world_v2_admission_release','MEMBER')
 or exists(select 1 from pg_roles r where r.rolname=effective and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))
 then raise exception 'TRADE_INTAKE_FIXED_VERIFIED_SCOPE_REQUIRED'using errcode='42501';end if;
 -- Not authentication: this is merely the inaccessible owner's world fence.
 perform set_config('econmind.narrow_current_world',p_world,true);
end;$$;
-- Metadata only and deliberately non-locking, including in READ ONLY recovery.
-- It does not hydrate seed bytes or admit Captain genesis/reason originals.
create function world_v2.trade_intake_admission_header(p_world text)
returns setof world_v2.runtime_opening_admission language plpgsql security definer set search_path=pg_catalog as $$begin
 return query select a.* from world_v2.runtime_opening_admission a
 join world_v2.opening_seed s on s.world_id=a.world_id and s.seed_id=a.seed_id and s.seed_fingerprint=a.seed_fingerprint and s.replay_binding=a.replay_binding and s.replay_binding::jsonb->>'modelVersion'=a.model_version
 join world_v2.runtime_admission_publication_permit p on 'ADMISSION_'||upper(p.authorization_sha256)=a.admission_ref and p.world_id=a.world_id and p.seed_id=a.seed_id and p.seed_fingerprint=a.seed_fingerprint and p.model_version=a.model_version and p.replay_binding=a.replay_binding and a.admitted_at_real>=p.valid_from and a.admitted_at_real<p.valid_until
 where a.world_id=p_world and not exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=p.authorization_id);
end;$$;
create function world_v2.trade_intake_lock_admission(p_world text)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;p world_v2.runtime_admission_publication_permit%rowtype;
begin
 select x.* into a from world_v2.runtime_opening_admission x where x.world_id=p_world for share;
 if not found then raise exception 'TRADE_INTAKE_ACTUAL_ADMISSION_REQUIRED'using errcode='55000';end if;
 select x.* into p from world_v2.runtime_admission_publication_permit x where x.world_id=p_world and x.seed_id=a.seed_id
 and x.seed_fingerprint=a.seed_fingerprint and x.model_version=a.model_version and x.replay_binding=a.replay_binding
 and 'ADMISSION_'||upper(x.authorization_sha256)=a.admission_ref and a.admitted_at_real>=x.valid_from and a.admitted_at_real<x.valid_until for share;
 if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=p.authorization_id)
 then raise exception 'TRADE_INTAKE_ADMISSION_REVOKED_OR_DIFFERENT'using errcode='55000';end if;
end;$$;
create function world_v2.lock_postwar_trade_intake_binding(p_world text,p_subject uuid,p_country text,p_office text,p_seat text,p_revision text,p_capability text,p_scope text)
returns table(seat_ref text,team_id text,authorization_version text,admission_ref text,seed_id text,seed_fingerprint text,model_version text,world_version text,event_sequence text)
language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;
begin
 if current_setting('transaction_read_only')<>'off'then raise exception 'TRADE_INTAKE_WRITE_TRANSACTION_REQUIRED'using errcode='42501';end if;
 perform world_v2.trade_intake_exact_scope(p_world,p_subject,p_country,p_office,p_seat,p_revision,p_capability,p_scope);
 -- H first, then immutable admission/permit before mutable auth/entitlement.
 perform 1 from world_v2.world_head h where h.world_id=p_world for share;
 if not found then return;end if;
 select * into a from world_v2.trade_intake_admission_header(p_world);
 if not found then return;end if;
 perform world_v2.trade_intake_lock_admission(p_world);
 return query select seat.seat_ref,authz.team_id,authz.authorization_version,admission.admission_ref,admission.seed_id,admission.seed_fingerprint,admission.model_version,head.world_version::text,head.event_sequence::text
 from world_v2.runtime_read_seat seat
 join world_v2.current_commit_authorization authz on authz.world_id=seat.world_id and authz.auth_subject=seat.auth_subject and authz.country_id=seat.country_id and authz.office_id=seat.office_id and authz.team_id=seat.team_id and authz.authorization_version=seat.authorization_revision and authz.active and authz.capability=p_capability
 join world_v2.projection_entitlement entitlement on entitlement.world_id=seat.world_id and entitlement.auth_subject=seat.auth_subject and entitlement.authorization_version=seat.authorization_revision and entitlement.active and entitlement.revoked_at is null and entitlement.classification='OFFICE_PRIVATE'and entitlement.scope_key=p_scope
 join world_v2.world_head head on head.world_id=seat.world_id
 cross join lateral world_v2.trade_intake_admission_header(seat.world_id)admission
 where seat.world_id=p_world and seat.auth_subject=p_subject and seat.country_id=p_country and seat.office_id=p_office and seat.seat_ref=p_seat and seat.authorization_revision=p_revision
 and not exists(select 1 from world_v2.current_commit_authorization other where other.world_id=seat.world_id and other.auth_subject=seat.auth_subject and other.active and(other.country_id is distinct from seat.country_id or other.team_id is distinct from seat.team_id or other.authorization_version is distinct from seat.authorization_revision))
 limit 2 for share of authz,entitlement;
end;$$;
create function world_v2.read_postwar_trade_recovery_binding(p_world text,p_subject uuid,p_country text,p_office text,p_seat text,p_revision text,p_capability text,p_scope text)
returns table(seat_ref text,team_id text,authorization_version text,admission_ref text,seed_id text,seed_fingerprint text,model_version text,world_version text,event_sequence text)
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if current_setting('transaction_read_only')<>'on'then raise exception 'TRADE_RECOVERY_READ_ONLY_TRANSACTION_REQUIRED'using errcode='42501';end if;
 perform world_v2.trade_intake_exact_scope(p_world,p_subject,p_country,p_office,p_seat,p_revision,p_capability,p_scope);
 return query select seat.seat_ref,authz.team_id,authz.authorization_version,admission.admission_ref,admission.seed_id,admission.seed_fingerprint,admission.model_version,head.world_version::text,head.event_sequence::text
 from world_v2.runtime_read_seat seat
 join world_v2.current_commit_authorization authz on authz.world_id=seat.world_id and authz.auth_subject=seat.auth_subject and authz.country_id=seat.country_id and authz.office_id=seat.office_id and authz.team_id=seat.team_id and authz.authorization_version=seat.authorization_revision and authz.active and authz.capability=p_capability
 join world_v2.projection_entitlement entitlement on entitlement.world_id=seat.world_id and entitlement.auth_subject=seat.auth_subject and entitlement.authorization_version=seat.authorization_revision and entitlement.active and entitlement.revoked_at is null and entitlement.classification='OFFICE_PRIVATE'and entitlement.scope_key=p_scope
 join world_v2.world_head head on head.world_id=seat.world_id
 cross join lateral world_v2.trade_intake_admission_header(seat.world_id)admission
 where seat.world_id=p_world and seat.auth_subject=p_subject and seat.country_id=p_country and seat.office_id=p_office and seat.seat_ref=p_seat and seat.authorization_revision=p_revision
 and not exists(select 1 from world_v2.current_commit_authorization other where other.world_id=seat.world_id and other.auth_subject=seat.auth_subject and other.active and(other.country_id is distinct from seat.country_id or other.team_id is distinct from seat.team_id or other.authorization_version is distinct from seat.authorization_revision))
 limit 2;
end;$$;
alter function world_v2.trade_intake_exact_scope(text,uuid,text,text,text,text,text,text)owner to world_v2_postwar_narrow_trade_current_owner;
revoke all on function world_v2.trade_intake_exact_scope(text,uuid,text,text,text,text,text,text)from public;
alter function world_v2.trade_intake_admission_header(text)owner to world_v2_postwar_narrow_trade_current_owner;
revoke all on function world_v2.trade_intake_admission_header(text)from public;
alter function world_v2.trade_intake_lock_admission(text)owner to world_v2_postwar_narrow_trade_current_owner;
revoke all on function world_v2.trade_intake_lock_admission(text)from public;
alter function world_v2.lock_postwar_trade_intake_binding(text,uuid,text,text,text,text,text,text)owner to world_v2_postwar_narrow_trade_current_owner;
revoke all on function world_v2.lock_postwar_trade_intake_binding(text,uuid,text,text,text,text,text,text)from public;
grant execute on function world_v2.lock_postwar_trade_intake_binding(text,uuid,text,text,text,text,text,text)to world_v2_postwar_narrow_trade_source;
alter function world_v2.read_postwar_trade_recovery_binding(text,uuid,text,text,text,text,text,text)owner to world_v2_postwar_narrow_trade_current_owner;
revoke all on function world_v2.read_postwar_trade_recovery_binding(text,uuid,text,text,text,text,text,text)from public;
grant execute on function world_v2.read_postwar_trade_recovery_binding(text,uuid,text,text,text,text,text,text)to world_v2_postwar_narrow_trade_source;
revoke create on schema world_v2 from world_v2_postwar_narrow_trade_current_owner;
commit;
