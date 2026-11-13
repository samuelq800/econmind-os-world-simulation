-- CANDIDATE ONLY; never installed/registered by startup. Depends on official
-- lease/head storage, runtime-admission-publication, runtime-read-binding-storage,
-- and the existing Finance/Social source reader roles. No role or membership.
-- Controlled release records reviewed Clock/control originals. Opening
-- admission alone is NOT execution authorization. MANUAL_FINITE never starts
-- or advances Clock, acquires a lease, polls a queue, or creates a command.
begin;
grant create on schema world_v2 to world_v2_admission_owner;
create table world_v2.world_command_execution_registration(
 registration_ref text primary key,world_id text not null,worker_id text not null,
 consumer_role name not null,seed_id text not null,seed_fingerprint text not null,
 admission_ref text not null,registration_text text not null,
 registration_sha256 text not null check(registration_sha256=encode(sha256(convert_to(registration_text,'UTF8')),'hex')),
 clock_original_text text not null,control_original_text text not null,
 valid_from timestamptz not null,valid_until timestamptz not null,
 check(valid_from<valid_until),check(octet_length(registration_text)<=16384),
 check(octet_length(clock_original_text)<=16384 and octet_length(control_original_text)<=16384),
 unique(world_id,worker_id,registration_ref)
);
create table world_v2.world_command_execution_revocation(
 registration_ref text primary key references world_v2.world_command_execution_registration,
 world_id text not null,
 reason_ref text not null,revoked_at_real timestamptz not null default clock_timestamp()
);
alter table world_v2.world_command_execution_registration owner to world_v2_admission_owner;
alter table world_v2.world_command_execution_revocation owner to world_v2_admission_owner;
alter table world_v2.world_command_execution_registration enable row level security;
alter table world_v2.world_command_execution_registration force row level security;
alter table world_v2.world_command_execution_revocation enable row level security;
alter table world_v2.world_command_execution_revocation force row level security;
revoke all on world_v2.world_command_execution_registration,world_v2.world_command_execution_revocation from public;
do $$declare t text;begin foreach t in array array['world_command_execution_registration','world_command_execution_revocation']loop
 execute format('create policy execution_owner_scope on world_v2.%I to world_v2_admission_owner using(current_user=''world_v2_admission_owner''and world_id=current_setting(''econmind.execution_world'',true))with check(current_user=''world_v2_admission_owner''and world_id=current_setting(''econmind.execution_world'',true))',t);
end loop;end;$$;
create trigger execution_registration_immutable before update or delete on world_v2.world_command_execution_registration for each row execute function world_v2.reject_authoritative_history_mutation();
create trigger execution_registration_no_truncate before truncate on world_v2.world_command_execution_registration for each statement execute function world_v2.reject_authoritative_history_mutation();
create trigger execution_revocation_immutable before update or delete on world_v2.world_command_execution_revocation for each row execute function world_v2.reject_authoritative_history_mutation();
create trigger execution_revocation_no_truncate before truncate on world_v2.world_command_execution_revocation for each statement execute function world_v2.reject_authoritative_history_mutation();
-- Metadata only; the baseline PUBLIC admission policy needs the two seat cols.
grant select(world_id,auth_subject)on world_v2.runtime_read_seat to world_v2_admission_owner;
grant select on world_v2.world_writer_lease to world_v2_admission_owner;
create function world_v2.execution_registration_admission(p_world text,p_seed text,p_fp text,p_admission text)returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;p world_v2.runtime_admission_publication_permit%rowtype;begin
 select * into a from world_v2.runtime_opening_admission x where x.world_id=p_world and x.seed_id=p_seed and x.seed_fingerprint=p_fp and x.admission_ref=p_admission;
 if not found then raise exception 'EXECUTION_CURRENT_ADMISSION_REQUIRED'using errcode='55000';end if;
 select * into p from world_v2.runtime_admission_publication_permit x where 'ADMISSION_'||upper(x.authorization_sha256)=a.admission_ref and x.world_id=a.world_id and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.model_version=a.model_version and x.replay_binding=a.replay_binding and a.admitted_at_real>=x.valid_from and a.admitted_at_real<x.valid_until for share;
 if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation x where x.authorization_id=p.authorization_id)then raise exception 'EXECUTION_ADMISSION_REVOKED'using errcode='55000';end if;
end;$$;
create function world_v2.register_world_command_execution(p_registration text,p_sha text,p_clock text,p_control text)returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare j jsonb;c jsonb;k jsonb;effective name;old world_v2.world_command_execution_registration%rowtype;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_admission_release'or not pg_has_role(session_user,'world_v2_admission_release','MEMBER')or exists(select 1 from pg_roles r where r.rolname=session_user and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))then raise exception 'EXECUTION_CONTROLLED_RELEASE_REQUIRED'using errcode='42501';end if;
 if p_registration is null or p_clock is null or p_control is null or octet_length(p_registration)>16384 or octet_length(p_clock)>16384 or octet_length(p_control)>16384 or p_sha is distinct from encode(sha256(convert_to(p_registration,'UTF8')),'hex')then raise exception 'EXECUTION_EXACT_REVIEWED_BYTES_REQUIRED'using errcode='23514';end if;
 j:=p_registration::jsonb;c:=p_clock::jsonb;k:=p_control::jsonb;
 if exists(select 1 from jsonb_each(j)e where jsonb_typeof(e.value)<>'string')or (select count(*)from jsonb_object_keys(j))<>19 or j->>'schemaVersion'is distinct from 'world-command-execution-registration-v1'or j->>'controlMode'is distinct from 'MANUAL_FINITE'or j->>'clockVersion'is distinct from 'SIMULATION_CLOCK_V1'or j->>'simTime'!~'^(0|[1-9][0-9]{0,18})$'or j->>'consumerRole'!~'^[a-z][a-z0-9_]{0,62}$'or j->>'registrationRef'!~'^[A-Z][A-Z0-9_-]{0,255}$'or j->>'worldId'!~'^[A-Z][A-Z0-9_-]{0,255}$'or j->>'workerId'!~'^[A-Z][A-Z0-9_-]{0,255}$'or j->>'seedFingerprint'!~'^sha256:[a-f0-9]{64}$'or(j->>'validFromReal')::timestamptz>=(j->>'validUntilReal')::timestamptz then raise exception 'EXECUTION_VERSIONED_SCOPE_REQUIRED'using errcode='23514';end if;
 if c->>'schemaVersion'is distinct from 'world-clock-original-v1'or k->>'schemaVersion'is distinct from 'world-execution-control-original-v1'or c->>'worldId'is distinct from j->>'worldId'or k->>'worldId'is distinct from j->>'worldId'or c->>'seedFingerprint'is distinct from j->>'seedFingerprint'or k->>'seedFingerprint'is distinct from j->>'seedFingerprint'or c->>'sourceRef'is distinct from j->>'clockSourceRef'or k->>'sourceRef'is distinct from j->>'controlSourceRef'or c->>'clockVersion'is distinct from j->>'clockVersion'or c->>'simTime'is distinct from j->>'simTime'or k->>'controlMode'is distinct from 'MANUAL_FINITE'or k->>'soleConsumerRef'is distinct from j->>'soleConsumerRef'or k->>'workerId'is distinct from j->>'workerId'or k->>'consumerRole'is distinct from j->>'consumerRole'or k->>'validFromReal'is distinct from j->>'validFromReal'or k->>'validUntilReal'is distinct from j->>'validUntilReal'or c->>'issuerRef'is null or c->>'provenanceRef'is null or k->>'issuerRef'is null or k->>'provenanceRef'is null or j->>'clockSourceSha256'is distinct from encode(sha256(convert_to(p_clock,'UTF8')),'hex')or j->>'controlSourceSha256'is distinct from encode(sha256(convert_to(p_control,'UTF8')),'hex')then raise exception 'EXECUTION_ADOPTED_CLOCK_CONTROL_ORIGINALS_REQUIRED'using errcode='23514';end if;
 if not exists(select 1 from pg_roles r where r.rolname=j->>'consumerRole'and r.rolcanlogin and not(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))or pg_has_role((j->>'consumerRole')::name,'world_v2_admission_owner','MEMBER')or pg_has_role((j->>'consumerRole')::name,'world_v2_admission_release','MEMBER')then raise exception 'EXECUTION_SEPARATE_LOW_PRIVILEGE_CONSUMER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.execution_world',j->>'worldId',true);
 perform 1 from world_v2.world_head x where x.world_id=j->>'worldId'for update;
 if not found then raise exception 'EXECUTION_EXISTING_WORLD_REQUIRED'using errcode='55000';end if;
 perform world_v2.execution_registration_admission(j->>'worldId',j->>'seedId',j->>'seedFingerprint',j->>'admissionRef');
 if not exists(select 1 from world_v2.runtime_opening_admission x where x.world_id=j->>'worldId'and x.model_version=j->>'modelVersion')then raise exception 'EXECUTION_EXACT_MODEL_REQUIRED'using errcode='23514';end if;
 select * into old from world_v2.world_command_execution_registration x where x.registration_ref=j->>'registrationRef';
 if found then if old.registration_text is distinct from p_registration or old.clock_original_text is distinct from p_clock or old.control_original_text is distinct from p_control then raise exception 'EXECUTION_IMMUTABLE_CONFLICT'using errcode='23514';end if;return;end if;
 if exists(select 1 from world_v2.world_command_execution_registration x where x.world_id=j->>'worldId'and((x.registration_text::jsonb->>'clockSourceRef'=j->>'clockSourceRef'and x.clock_original_text is distinct from p_clock)or(x.registration_text::jsonb->>'controlSourceRef'=j->>'controlSourceRef'and x.control_original_text is distinct from p_control)))then raise exception 'EXECUTION_IMMUTABLE_SOURCE_CONFLICT'using errcode='23514';end if;
 if exists(select 1 from world_v2.world_command_execution_registration x where x.world_id=j->>'worldId'and not exists(select 1 from world_v2.world_command_execution_revocation r where r.registration_ref=x.registration_ref))then raise exception 'EXECUTION_SOLE_CONSUMER_ALREADY_REGISTERED'using errcode='55000';end if;
 if exists(select 1 from world_v2.authoritative_event e where e.world_id=j->>'worldId'and e.sim_time>(j->>'simTime')::bigint)then raise exception 'EXECUTION_CLOCK_BEFORE_COMMITTED_HISTORY'using errcode='23514';end if;
 insert into world_v2.world_command_execution_registration values(j->>'registrationRef',j->>'worldId',j->>'workerId',(j->>'consumerRole')::name,j->>'seedId',j->>'seedFingerprint',j->>'admissionRef',p_registration,p_sha,p_clock,p_control,(j->>'validFromReal')::timestamptz,(j->>'validUntilReal')::timestamptz);
end;$$;
create function world_v2.revoke_world_command_execution(p_world text,p_ref text,p_reason text)returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_admission_release'or not pg_has_role(session_user,'world_v2_admission_release','MEMBER')then raise exception 'EXECUTION_CONTROLLED_RELEASE_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.execution_world',p_world,true);
 perform 1 from world_v2.world_command_execution_registration r where r.world_id=p_world and r.registration_ref=p_ref for update;
 if not found or p_reason is null or length(p_reason)>256 then raise exception 'EXECUTION_REVOKE_EXACT_SCOPE_REQUIRED'using errcode='23514';end if;
 insert into world_v2.world_command_execution_revocation(registration_ref,world_id,reason_ref)values(p_ref,p_world,p_reason)on conflict do nothing;
end;$$;
create function world_v2.lock_world_command_execution_registration(p_world text,p_worker text,p_ref text)
returns table(registration_text text,registration_sha256 text)
language plpgsql security definer set search_path=pg_catalog as $$
declare r world_v2.world_command_execution_registration%rowtype;begin
 perform set_config('econmind.execution_world',p_world,true);
 select * into r from world_v2.world_command_execution_registration x where x.registration_ref=p_ref and x.world_id=p_world and x.worker_id=p_worker and x.consumer_role=session_user for share;
 if not found or exists(select 1 from pg_roles x where x.rolname=session_user and(x.rolsuper or x.rolbypassrls or x.rolcreatedb or x.rolcreaterole or x.rolreplication))or pg_has_role(session_user,'world_v2_admission_owner','MEMBER')or pg_has_role(session_user,'world_v2_admission_release','MEMBER')then raise exception 'FORMAL_EXECUTION_REGISTERED_CONSUMER_REQUIRED'using errcode='42501';end if;
 if r.valid_from>clock_timestamp()or r.valid_until<=clock_timestamp()or exists(select 1 from world_v2.world_command_execution_revocation x where x.registration_ref=r.registration_ref)then raise exception 'FORMAL_EXECUTION_EXPIRED_OR_REVOKED'using errcode='55000';end if;
 if r.registration_sha256<>encode(sha256(convert_to(r.registration_text,'UTF8')),'hex')or r.registration_text::jsonb->>'clockSourceSha256'is distinct from encode(sha256(convert_to(r.clock_original_text,'UTF8')),'hex')or r.registration_text::jsonb->>'controlSourceSha256'is distinct from encode(sha256(convert_to(r.control_original_text,'UTF8')),'hex')then raise exception 'FORMAL_EXECUTION_IMMUTABLE_ORIGINAL_CHANGED'using errcode='23514';end if;
 perform world_v2.execution_registration_admission(r.world_id,r.seed_id,r.seed_fingerprint,r.admission_ref);
 if not exists(select 1 from world_v2.world_writer_lease l where l.world_id=r.world_id and l.holder_id=r.worker_id and l.lease_expires_at_real>clock_timestamp())then raise exception 'FORMAL_EXECUTION_CURRENT_LEASE_REQUIRED'using errcode='55000';end if;
 return query select r.registration_text,r.registration_sha256;
end;$$;
alter function world_v2.execution_registration_admission(text,text,text,text)owner to world_v2_admission_owner;
alter function world_v2.register_world_command_execution(text,text,text,text)owner to world_v2_admission_owner;
alter function world_v2.revoke_world_command_execution(text,text,text)owner to world_v2_admission_owner;
alter function world_v2.lock_world_command_execution_registration(text,text,text)owner to world_v2_admission_owner;
revoke all on function world_v2.execution_registration_admission(text,text,text,text),world_v2.register_world_command_execution(text,text,text,text),world_v2.revoke_world_command_execution(text,text,text),world_v2.lock_world_command_execution_registration(text,text,text)from public;
grant execute on function world_v2.register_world_command_execution(text,text,text,text),world_v2.revoke_world_command_execution(text,text,text)to world_v2_admission_release;
grant execute on function world_v2.lock_world_command_execution_registration(text,text,text)to world_v2_finance_budget_source_reader,world_v2_social_source_reader;
revoke create on schema world_v2 from world_v2_admission_owner;
commit;
