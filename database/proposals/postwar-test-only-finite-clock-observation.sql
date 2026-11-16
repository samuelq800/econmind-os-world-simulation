-- TEST_ONLY explicit one-shot observation; never installed/activated by Node startup.
-- Adds isolated-clone RPCs only. Existing registration SQL/ACL/owner/OIDs stay intact.
begin;
set local search_path=pg_catalog;
do $$begin
 if to_regprocedure('world_v2.register_world_command_execution(text,text,text,text)')is null
 or to_regprocedure('world_v2.revoke_world_command_execution(text,text,text)')is null
 or to_regprocedure('world_v2.execution_registration_admission(text,text,text,text)')is null
 then raise exception 'FINITE_CLOCK_EXECUTION_PREDECESSOR_REQUIRED';end if;
 if to_regclass('world_v2.test_only_finite_clock_observation')is not null then raise exception 'FINITE_CLOCK_ALREADY_INSTALLED_STOP_INSPECT';end if;
 if exists(select 1 from pg_roles where rolname='world_v2_test_clock_guard_owner')then
  if exists(select 1 from pg_roles r where r.rolname='world_v2_test_clock_guard_owner'and(r.rolcanlogin or r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolinherit or r.rolreplication or r.rolbypassrls or r.rolconfig is not null))
  or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid or r.oid=m.member where r.rolname='world_v2_test_clock_guard_owner')
  then raise exception 'FINITE_CLOCK_EXISTING_OWNER_MUST_REMAIN_INACCESSIBLE';end if;
 else
  create role world_v2_test_clock_guard_owner nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
 end if;
end;$$;
grant usage,create on schema world_v2 to world_v2_test_clock_guard_owner;
grant create on schema world_v2 to world_v2_admission_owner;
create policy test_clock_lease_read on world_v2.world_writer_lease for select to world_v2_test_clock_guard_owner using(current_user='world_v2_test_clock_guard_owner'and world_id=current_setting('econmind.execution_world',true));
create policy test_clock_lease_lock on world_v2.world_writer_lease for update to world_v2_test_clock_guard_owner using(current_user='world_v2_test_clock_guard_owner'and world_id=current_setting('econmind.execution_world',true))with check(false);
create policy test_clock_head_read on world_v2.world_head for select to world_v2_test_clock_guard_owner using(current_user='world_v2_test_clock_guard_owner'and world_id=current_setting('econmind.execution_world',true));
create policy test_clock_head_lock on world_v2.world_head for update to world_v2_test_clock_guard_owner using(current_user='world_v2_test_clock_guard_owner'and world_id=current_setting('econmind.execution_world',true))with check(false);
-- Row-lock privileges belong only to this new inaccessible owner, not any online role.
grant select on world_v2.world_writer_lease,world_v2.world_head to world_v2_test_clock_guard_owner;
grant update(holder_id)on world_v2.world_writer_lease to world_v2_test_clock_guard_owner;
grant update(world_version)on world_v2.world_head to world_v2_test_clock_guard_owner;
create function world_v2.test_only_finite_clock_guard(p_world text,p_worker text,p_fence bigint,p_version bigint,p_sequence bigint)returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare l world_v2.world_writer_lease%rowtype;h world_v2.world_head%rowtype;begin
 select * into l from world_v2.world_writer_lease where world_id=p_world for update;
 if not found or l.holder_id is distinct from p_worker or l.fencing_token is distinct from p_fence or l.lease_expires_at_real<=clock_timestamp()then raise exception 'FINITE_CLOCK_LEASE_MISMATCH'using errcode='55000';end if;
 select * into h from world_v2.world_head where world_id=p_world for update;
 if not found or h.world_version is distinct from p_version or h.event_sequence is distinct from p_sequence then raise exception 'FINITE_CLOCK_HEAD_MISMATCH'using errcode='55000';end if;
 if l.lease_expires_at_real<=clock_timestamp()then raise exception 'FINITE_CLOCK_LEASE_EXPIRED_AFTER_HEAD_LOCK'using errcode='55000';end if;
end;$$;
alter function world_v2.test_only_finite_clock_guard(text,text,bigint,bigint,bigint)owner to world_v2_test_clock_guard_owner;
revoke all on function world_v2.test_only_finite_clock_guard(text,text,bigint,bigint,bigint)from public;
grant execute on function world_v2.test_only_finite_clock_guard(text,text,bigint,bigint,bigint)to world_v2_admission_owner;
create table world_v2.test_only_finite_clock_observation(
 world_id text not null,observation_ref text not null,old_registration_ref text not null,
 observation_text text not null,observation_sha256 text not null check(observation_sha256=encode(sha256(convert_to(observation_text,'UTF8')),'hex')),
 primary key(world_id,observation_ref),unique(world_id),unique(world_id,old_registration_ref),
 foreign key(old_registration_ref)references world_v2.world_command_execution_registration(registration_ref)
);
alter table world_v2.test_only_finite_clock_observation owner to world_v2_admission_owner;
alter table world_v2.test_only_finite_clock_observation enable row level security;
alter table world_v2.test_only_finite_clock_observation force row level security;
create policy finite_clock_owner_scope on world_v2.test_only_finite_clock_observation to world_v2_admission_owner
 using(current_user='world_v2_admission_owner'and world_id=current_setting('econmind.execution_world',true))
 with check(current_user='world_v2_admission_owner'and world_id=current_setting('econmind.execution_world',true));
revoke all on world_v2.test_only_finite_clock_observation from public;
create trigger finite_clock_observation_immutable before update or delete on world_v2.test_only_finite_clock_observation for each row execute function world_v2.reject_authoritative_history_mutation();
create trigger finite_clock_observation_no_truncate before truncate on world_v2.test_only_finite_clock_observation for each statement execute function world_v2.reject_authoritative_history_mutation();

create function world_v2.observe_test_only_finite_clock(p_world text,p_old text,p_worker text,p_fence bigint,p_version bigint,p_sequence bigint,p_ref text)
returns table(observation_text text,observation_sha256 text)language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;r world_v2.world_command_execution_registration%rowtype;o world_v2.test_only_finite_clock_observation%rowtype;started bigint;finished bigint;raw text;j jsonb;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if current_database()!~'^postwar_clone_committed_resume_[a-f0-9]+$'or effective<>'world_v2_admission_release'or not pg_has_role(session_user,'world_v2_admission_release','MEMBER')or exists(select 1 from pg_roles where rolname=session_user and(rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))then raise exception 'FINITE_CLOCK_ISOLATED_RELEASE_ONLY'using errcode='42501';end if;
 if p_ref is null or p_ref!~'^CLOCK_OBSERVATION_[A-F0-9]{32}$'or p_fence is null or p_fence<=0 or p_version is null or p_version<0 or p_sequence is null or p_sequence<0 then raise exception 'FINITE_CLOCK_EXACT_SCOPE_REQUIRED'using errcode='23514';end if;
 perform set_config('econmind.execution_world',p_world,true);
 -- Retry reads the original observation, never sleeps or resamples it.
 select * into o from world_v2.test_only_finite_clock_observation where world_id=p_world and observation_ref=p_ref;
 if found then
  j:=o.observation_text::jsonb;
  if o.old_registration_ref is distinct from p_old or j->>'workerId'is distinct from p_worker or(j->>'fencingToken')::bigint is distinct from p_fence or(j->>'worldVersion')::bigint is distinct from p_version or(j->>'eventSequence')::bigint is distinct from p_sequence then raise exception 'FINITE_CLOCK_OBSERVATION_ID_CONFLICT'using errcode='23514';end if;
  return query select o.observation_text,o.observation_sha256;return;
 end if;
 perform world_v2.test_only_finite_clock_guard(p_world,p_worker,p_fence,p_version,p_sequence);
 select * into r from world_v2.world_command_execution_registration where registration_ref=p_old and world_id=p_world for update;
 if not found or r.worker_id is distinct from p_worker or r.valid_from>clock_timestamp()or r.valid_until<=clock_timestamp()or exists(select 1 from world_v2.world_command_execution_revocation where registration_ref=p_old)then raise exception 'FINITE_CLOCK_CURRENT_REGISTRATION_REQUIRED'using errcode='55000';end if;
 if exists(select 1 from pg_stat_activity where datname=current_database()and pid<>pg_backend_pid())then raise exception 'FINITE_CLOCK_ALL_OTHER_CLIENTS_MUST_STOP'using errcode='55000';end if;
 perform world_v2.execution_registration_admission(r.world_id,r.seed_id,r.seed_fingerprint,r.admission_ref);
 if exists(select 1 from world_v2.test_only_finite_clock_observation where world_id=p_world)then raise exception 'FINITE_CLOCK_OLD_REGISTRATION_ALREADY_OBSERVED_RECOVER'using errcode='55000';end if;
 started:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 perform pg_sleep(0.120); -- fixed one-shot active interval; never caller-selected target time
 finished:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 if finished-started<120 or finished-started>5000 then raise exception 'FINITE_CLOCK_REAL_INTERVAL_OUT_OF_BOUND'using errcode='55000';end if;
 perform world_v2.test_only_finite_clock_guard(p_world,p_worker,p_fence,p_version,p_sequence);
 if r.valid_until<=clock_timestamp()then raise exception 'FINITE_CLOCK_REGISTRATION_EXPIRED'using errcode='55000';end if;
 raw:=jsonb_build_object('schemaVersion','test-only-finite-clock-observation-v1','classification','TEST_ONLY_ACTUAL_POSTGRES_OBSERVATION_NOT_PRODUCTION','worldId',p_world,'workerId',p_worker,'fencingToken',p_fence::text,'worldVersion',p_version::text,'eventSequence',p_sequence::text,'observationRef',p_ref,'clockVersion','SIMULATION_CLOCK_V1','startedRealMilliseconds',started::text,'finishedRealMilliseconds',finished::text,'activeRealMilliseconds',(finished-started)::text,'previousRegistrationText',r.registration_text,'previousClockText',r.clock_original_text,'previousControlText',r.control_original_text)::text;
 insert into world_v2.test_only_finite_clock_observation values(p_world,p_ref,p_old,raw,encode(sha256(convert_to(raw,'UTF8')),'hex'));
 return query select raw,encode(sha256(convert_to(raw,'UTF8')),'hex');
end;$$;

create function world_v2.publish_test_only_finite_clock(p_world text,p_ref text,p_registration text,p_sha text,p_clock text)
returns text language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;o world_v2.test_only_finite_clock_observation%rowtype;j jsonb;oldj jsonb;newj jsonb;c jsonb;oldc jsonb;existing world_v2.world_command_execution_registration%rowtype;elapsed bigint;nexttime bigint;expectedref text;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if current_database()!~'^postwar_clone_committed_resume_[a-f0-9]+$'or effective<>'world_v2_admission_release'or not pg_has_role(session_user,'world_v2_admission_release','MEMBER')or exists(select 1 from pg_roles where rolname=session_user and(rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))then raise exception 'FINITE_CLOCK_ISOLATED_RELEASE_ONLY'using errcode='42501';end if;
 if p_registration is null or p_clock is null or octet_length(p_registration)>16384 or octet_length(p_clock)>16384 or p_sha is distinct from encode(sha256(convert_to(p_registration,'UTF8')),'hex')then raise exception 'FINITE_CLOCK_EXACT_BYTES_REQUIRED'using errcode='23514';end if;
 perform set_config('econmind.execution_world',p_world,true);
 select * into o from world_v2.test_only_finite_clock_observation where world_id=p_world and observation_ref=p_ref;
 if not found then raise exception 'FINITE_CLOCK_REGISTERED_OBSERVATION_REQUIRED'using errcode='55000';end if;
 j:=o.observation_text::jsonb;oldj:=(j->>'previousRegistrationText')::jsonb;oldc:=(j->>'previousClockText')::jsonb;newj:=p_registration::jsonb;c:=p_clock::jsonb;
 elapsed:=(j->>'finishedRealMilliseconds')::bigint-(j->>'startedRealMilliseconds')::bigint;
 if j->>'clockVersion'is distinct from'SIMULATION_CLOCK_V1'or elapsed<120 or elapsed>5000 or(j->>'activeRealMilliseconds')::bigint<>elapsed then raise exception 'FINITE_CLOCK_SOURCE_INTERVAL_INVALID'using errcode='23514';end if;
 -- Validation of Core SIMULATION_CLOCK_V1 output, not a caller-selected rate.
 nexttime:=(oldj->>'simTime')::bigint+elapsed*10;
 if nexttime>86400000 then raise exception 'FINITE_CLOCK_FIRST_DAY_BOUND'using errcode='23514';end if;
 expectedref:='EXECUTION_OBSERVED_'||substr(p_ref,19);
 if newj is distinct from(oldj||jsonb_build_object('registrationRef',expectedref,'clockSourceRef',p_ref,'clockSourceSha256',encode(sha256(convert_to(p_clock,'UTF8')),'hex'),'simTime',nexttime::text))
 or c is distinct from(oldc||jsonb_build_object('sourceRef',p_ref,'simTime',nexttime::text,'issuerRef','TEST_ONLY_POSTGRES_REAL_OBSERVATION','provenanceRef','TEST_ONLY_OBSERVATION_SHA256_'||upper(o.observation_sha256)))then raise exception 'FINITE_CLOCK_CORE_RESULT_OR_SCOPE_MISMATCH'using errcode='23514';end if;
 -- Known original publish retry recovers bytes without re-observing/revoking anything.
 select * into existing from world_v2.world_command_execution_registration where registration_ref=expectedref and world_id=p_world;
 if found then
  if existing.registration_text is distinct from p_registration or existing.clock_original_text is distinct from p_clock or existing.control_original_text is distinct from j->>'previousControlText'then raise exception 'FINITE_CLOCK_PUBLISH_ID_CONFLICT'using errcode='23514';end if;
  return existing.registration_text;
 end if;
 perform world_v2.test_only_finite_clock_guard(p_world,j->>'workerId',(j->>'fencingToken')::bigint,(j->>'worldVersion')::bigint,(j->>'eventSequence')::bigint);
 select * into existing from world_v2.world_command_execution_registration where registration_ref=o.old_registration_ref and world_id=p_world for update;
 if not found or existing.registration_text is distinct from j->>'previousRegistrationText'or existing.clock_original_text is distinct from j->>'previousClockText'or existing.control_original_text is distinct from j->>'previousControlText'or existing.valid_until<=clock_timestamp()or exists(select 1 from world_v2.world_command_execution_revocation where registration_ref=o.old_registration_ref)then raise exception 'FINITE_CLOCK_PREDECESSOR_CHANGED'using errcode='55000';end if;
 if exists(select 1 from pg_stat_activity where datname=current_database()and pid<>pg_backend_pid())then raise exception 'FINITE_CLOCK_ALL_OTHER_CLIENTS_MUST_STOP'using errcode='55000';end if;
 perform world_v2.revoke_world_command_execution(p_world,o.old_registration_ref,'TEST_ONLY_ACTUAL_FINITE_OBSERVATION_REPLACED');
 perform world_v2.register_world_command_execution(p_registration,p_sha,p_clock,j->>'previousControlText');
 perform world_v2.test_only_finite_clock_guard(p_world,j->>'workerId',(j->>'fencingToken')::bigint,(j->>'worldVersion')::bigint,(j->>'eventSequence')::bigint);
 return p_registration;
end;$$;

create function world_v2.recover_test_only_finite_clock(p_world text,p_ref text)
returns table(observation_text text,observation_sha256 text,published_registration_text text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if current_database()!~'^postwar_clone_committed_resume_[a-f0-9]+$'or effective<>'world_v2_admission_release'or not pg_has_role(session_user,'world_v2_admission_release','MEMBER')or exists(select 1 from pg_roles where rolname=session_user and(rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))then raise exception 'FINITE_CLOCK_ISOLATED_RELEASE_ONLY'using errcode='42501';end if;
 perform set_config('econmind.execution_world',p_world,true);
 return query select o.observation_text,o.observation_sha256,r.registration_text from world_v2.test_only_finite_clock_observation o left join world_v2.world_command_execution_registration r on r.world_id=o.world_id and r.registration_ref='EXECUTION_OBSERVED_'||substr(o.observation_ref,19)where o.world_id=p_world and o.observation_ref=p_ref;
end;$$;
alter function world_v2.observe_test_only_finite_clock(text,text,text,bigint,bigint,bigint,text)owner to world_v2_admission_owner;
alter function world_v2.publish_test_only_finite_clock(text,text,text,text,text)owner to world_v2_admission_owner;
alter function world_v2.recover_test_only_finite_clock(text,text)owner to world_v2_admission_owner;
revoke all on function world_v2.observe_test_only_finite_clock(text,text,text,bigint,bigint,bigint,text),world_v2.publish_test_only_finite_clock(text,text,text,text,text),world_v2.recover_test_only_finite_clock(text,text)from public;
grant execute on function world_v2.observe_test_only_finite_clock(text,text,text,bigint,bigint,bigint,text),world_v2.publish_test_only_finite_clock(text,text,text,text,text),world_v2.recover_test_only_finite_clock(text,text)to world_v2_admission_release;
revoke create on schema world_v2 from world_v2_admission_owner,world_v2_test_clock_guard_owner;
commit;
