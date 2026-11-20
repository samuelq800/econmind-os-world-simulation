-- Candidate one-shot automatic task publication. Existing IndustryPublisher
-- gets fixed EXEC only; Industry readers/workers get no INSERT/membership.
-- Payload is derived by the private fixed Worker/Core producer, and rechecked
-- by the claimed-task Core/source cutoff before any WORK event can commit.
begin;
grant create on schema world_v2 to world_v2_industry_source_owner;
create table world_v2.postwar_industry_work_publication(world_id text not null,schedule_command_id text not null,command_id text not null,command_fingerprint text not null,source_ref text not null,rule_version text not null check(rule_version='INDUSTRY_FIRST_DAY_WORK_RULE_V1'),primary key(world_id,schedule_command_id),foreign key(world_id,command_id)references world_v2.command_submission(world_id,command_id));
alter table world_v2.postwar_industry_work_publication owner to world_v2_industry_source_owner;
alter table world_v2.postwar_industry_work_publication enable row level security;
alter table world_v2.postwar_industry_work_publication force row level security;
create policy industry_work_publication_owner on world_v2.postwar_industry_work_publication to world_v2_industry_source_owner using(world_id=current_setting('econmind.industry_source_world',true))with check(world_id=current_setting('econmind.industry_source_world',true));
create trigger industry_work_publication_immutable before update or delete on world_v2.postwar_industry_work_publication for each row execute function world_v2.reject_authoritative_history_mutation();
create trigger industry_work_publication_no_truncate before truncate on world_v2.postwar_industry_work_publication for each statement execute function world_v2.reject_authoritative_history_mutation();
revoke all on world_v2.postwar_industry_work_publication from public,world_v2_industry_source_reader,world_v2_industry_source_publisher;
grant insert on world_v2.command_submission,world_v2.command_queue to world_v2_industry_source_owner;
create policy industry_work_command_insert on world_v2.command_submission for insert to world_v2_industry_source_owner with check(world_id=current_setting('econmind.industry_source_world',true)and command_type='CORE_INDUSTRY_FIRST_DAY_WORK_V1'and office_id is null);
create policy industry_work_queue_insert on world_v2.command_queue for insert to world_v2_industry_source_owner with check(world_id=current_setting('econmind.industry_source_world',true)and authority_kind='VERSIONED_AUTOMATIC');
create function world_v2.read_postwar_industry_work_publication(p_world text,p_schedule text)
returns table(world_id text,command_id text,command_type text,schema_version text,actor_id text,auth_subject text,country_id text,office_id text,expected_world_version text,idempotency_key text,correlation_id text,sim_time text,submitted_at_real text,canonical_payload text,command_fingerprint text,payload_sha256 text,publication_status text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_publisher'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')then raise exception 'INDUSTRY_WORK_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 return query select c.world_id,c.command_id,c.command_type,c.schema_version,c.actor_id,c.auth_subject::text,c.country_id,c.office_id,c.expected_world_version::text,c.idempotency_key,c.correlation_id,c.sim_time::text,to_char(c.submitted_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),c.canonical_payload,c.command_fingerprint,c.payload_sha256,case when exists(select 1 from world_v2.command_receipt r where r.world_id=c.world_id and r.command_id=c.command_id)then 'FINAL'else 'QUEUED'end from world_v2.postwar_industry_work_publication p join world_v2.command_submission c on c.world_id=p.world_id and c.command_id=p.command_id and c.command_fingerprint=p.command_fingerprint where p.world_id=p_world and p.schedule_command_id=p_schedule;
end;$$;
alter function world_v2.read_postwar_industry_work_publication(text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.read_postwar_industry_work_publication(text,text)from public;
grant execute on function world_v2.read_postwar_industry_work_publication(text,text)to world_v2_industry_source_publisher;
create function world_v2.read_postwar_industry_work_publication_for_run(p_world text,p_country text,p_facility text,p_run text)
returns table(world_id text,command_id text,command_type text,schema_version text,actor_id text,auth_subject text,country_id text,office_id text,expected_world_version text,idempotency_key text,correlation_id text,sim_time text,submitted_at_real text,canonical_payload text,command_fingerprint text,payload_sha256 text,publication_status text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;found_schedule text;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_publisher'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')then raise exception 'INDUSTRY_WORK_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 select c.command_id into found_schedule from world_v2.command_submission c join world_v2.postwar_industry_work_publication q on q.world_id=c.world_id and q.schedule_command_id=c.command_id where c.world_id=p_world and c.country_id=p_country and c.command_type='CORE_INDUSTRY_RUN_SCHEDULE_V1'and c.canonical_payload::jsonb->>'facilityId'=p_facility and c.canonical_payload::jsonb->>'runId'=p_run;
 if not found then return;end if;
 return query select * from world_v2.read_postwar_industry_work_publication(p_world,found_schedule);
end;$$;
alter function world_v2.read_postwar_industry_work_publication_for_run(text,text,text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.read_postwar_industry_work_publication_for_run(text,text,text,text)from public;
grant execute on function world_v2.read_postwar_industry_work_publication_for_run(text,text,text,text)to world_v2_industry_source_publisher;
create function world_v2.publish_postwar_industry_work_due(p_world text,p_schedule text,p_worker text,p_version text,p_sequence text,p_at timestamptz,p_sim text,p_payload text,p_expected_fingerprint text)
returns table(world_id text,command_id text,command_type text,schema_version text,actor_id text,auth_subject text,country_id text,office_id text,expected_world_version text,idempotency_key text,correlation_id text,sim_time text,submitted_at_real text,canonical_payload text,command_fingerprint text,payload_sha256 text,publication_status text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h world_v2.world_head%rowtype;p world_v2.command_submission%rowtype;r world_v2.command_receipt%rowtype;a world_v2.runtime_opening_admission%rowtype;s world_v2.postwar_industry_first_day_source%rowtype;body jsonb;terms jsonb;part jsonb;intent jsonb;id text;fp text;needed numeric;used numeric:=0;n numeric;start_at numeric;end_at numeric;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_publisher'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')or exists(select 1 from pg_roles x where x.rolname=effective and(x.rolsuper or x.rolbypassrls or x.rolcreatedb or x.rolcreaterole or x.rolreplication))then raise exception 'INDUSTRY_WORK_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 if exists(select 1 from world_v2.postwar_industry_work_publication x where x.world_id=p_world and x.schedule_command_id=p_schedule)then return query select * from world_v2.read_postwar_industry_work_publication(p_world,p_schedule);return;end if;
 if current_setting('transaction_isolation')not in('repeatable read','serializable')or current_setting('transaction_read_only')<>'off'or p_payload is null or octet_length(p_payload)>1048576 or p_sim!~'^(0|[1-9][0-9]*)$'or p_version!~'^(0|[1-9][0-9]*)$'or p_sequence!~'^(0|[1-9][0-9]*)$'or p_at is null or not isfinite(p_at)then raise exception 'INDUSTRY_WORK_BOUNDED_REAL_PUBLICATION_REQUIRED'using errcode='25001';end if;
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 perform 1 from world_v2.world_writer_lease l where l.world_id=p_world and l.holder_id=p_worker and l.acquired_at_real<=p_at and l.renewed_at_real<=p_at and l.lease_expires_at_real>p_at for share;
 if not found then raise exception 'INDUSTRY_WORK_CURRENT_LEASE_REQUIRED'using errcode='55000';end if;
 select * into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found or h.world_version::text<>p_version or h.event_sequence::text<>p_sequence then raise exception 'INDUSTRY_WORK_CURRENT_HEAD_REQUIRED'using errcode='40001';end if;
 a:=world_v2.industry_source_admission(p_world);
 select * into p from world_v2.command_submission x where x.world_id=p_world and x.command_id=p_schedule and x.command_type='CORE_INDUSTRY_RUN_SCHEDULE_V1'and x.office_id='INDUSTRY';
 if not found then raise exception 'INDUSTRY_WORK_REAL_RUN_REQUIRED'using errcode='55000';end if;
 select * into r from world_v2.command_receipt x where x.world_id=p_world and x.command_id=p_schedule and x.outcome='COMMITTED';
 if not found then raise exception 'INDUSTRY_WORK_COMMITTED_RUN_REQUIRED'using errcode='55000';end if;
 terms:=p.canonical_payload::jsonb;body:=p_payload::jsonb;
 if p_payload is distinct from world_v2.canonical_json(body)or(select count(*)from jsonb_object_keys(body))<>4 or body->>'schemaVersion'is distinct from 'postwar-industry-work-command-v1'or body->>'runId'is distinct from terms->>'runId'or body->>'scheduleCommandFingerprint'is distinct from p.command_fingerprint or jsonb_typeof(body->'allocations')is distinct from 'array'or jsonb_array_length(body->'allocations')not between 1 and 2048 then raise exception 'INDUSTRY_WORK_EXACT_FIXED_DERIVED_INTENT_REQUIRED'using errcode='23514';end if;
 select * into s from world_v2.postwar_industry_first_day_source x where x.world_id=p_world and x.country_id=p.country_id and x.facility_id=terms->>'facilityId'and x.source_ref=terms->>'sourceRef'and x.source_sha256=terms->>'sourceRawSha256'and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref for share;
 if not found or s.source_sha256<>encode(sha256(convert_to(s.source_text,'UTF8')),'hex')or exists(select 1 from world_v2.postwar_industry_first_day_source_revocation x where x.world_id=p_world and x.source_ref=s.source_ref)or exists(select 1 from world_v2.postwar_industry_original_revocation x where x.world_id=p_world and x.registration_ref=s.registration_ref)then raise exception 'INDUSTRY_WORK_CURRENT_FIRSTDAY_SOURCE_REQUIRED'using errcode='55000';end if;
 needed:=(terms->'quantity'->>'amount')::numeric*(s.source_text::jsonb->'recipe'->>'workersPerDailyOutputUnit')::numeric*28800000;
 if needed<=0 or trunc(needed)<>needed then raise exception 'INDUSTRY_WORK_EXACT_MILLISECOND_QUANTUM_REQUIRED'using errcode='23514';end if;
 for part in select value from jsonb_array_elements(body->'allocations')loop
  if part->>'populationLineage'is distinct from 'POSTWAR_REGIONAL_POPULATION_ORDINAL_V1'or part->>'count'!~'^[1-9][0-9]*$'or part->>'startsAtSimTime'!~'^(0|[1-9][0-9]*)$'or part->>'endsAtSimTime'!~'^(0|[1-9][0-9]*)$'then raise exception 'INDUSTRY_WORK_EXACT_DISTINCT_TIME_REQUIRED'using errcode='23514';end if;
  n:=(part->>'count')::numeric;start_at:=(part->>'startsAtSimTime')::numeric;end_at:=(part->>'endsAtSimTime')::numeric;
  if start_at<(terms->>'startsAtSimTime')::numeric or end_at>(terms->>'endsAtSimTime')::numeric or end_at>p_sim::numeric or end_at<=start_at or end_at-start_at>28800000 or part->>'personMilliseconds'is distinct from(n*(end_at-start_at))::text or part->'personMinutes'is distinct from jsonb_build_object('numerator',(n*(end_at-start_at))::text,'denominator','60000')then raise exception 'INDUSTRY_WORK_ACTUAL_ELAPSED_CAPACITY_REQUIRED'using errcode='23514';end if;
  used:=used+n*(end_at-start_at);
 end loop;
 if used<>needed then raise exception 'INDUSTRY_WORK_COMPLETE_RUN_WORK_REQUIRED'using errcode='23514';end if;
 id:='COMMAND_INDUSTRY_WORK_'||upper(encode(sha256(convert_to(world_v2.canonical_json(jsonb_build_array(p_world,p.command_fingerprint,'INDUSTRY_FIRST_DAY_WORK_RULE_V1')),'UTF8')),'hex'));
 intent:=jsonb_build_object('actorId',p.actor_id,'authSubject',p.auth_subject::text,'commandId',id,'commandType','CORE_INDUSTRY_FIRST_DAY_WORK_V1','countryId',p.country_id,'expectedWorldVersion',h.world_version::text,'idempotencyKey',id,'officeId',null,'canonicalPayload',p_payload,'schemaVersion','command-v1','simTime',p_sim,'worldId',p_world);
 fp:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(intent),'UTF8')),'hex');
 if fp is distinct from p_expected_fingerprint then raise exception 'INDUSTRY_WORK_CORE_CANONICAL_COMMAND_MISMATCH'using errcode='23514';end if;
 insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values(p_world,id,id,'CORE_INDUSTRY_FIRST_DAY_WORK_V1','command-v1',p_payload,'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||p_payload,'UTF8')),'hex'),fp,p.auth_subject,p.actor_id,p.country_id,null,h.world_version,p_sim::numeric,p.correlation_id,p_at);
 insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time)values(p_world,id,'VERSIONED_AUTOMATIC',p_sim::numeric);
 insert into world_v2.postwar_industry_work_publication values(p_world,p_schedule,id,fp,s.source_ref,'INDUSTRY_FIRST_DAY_WORK_RULE_V1');
 return query select * from world_v2.read_postwar_industry_work_publication(p_world,p_schedule);
end;$$;
alter function world_v2.publish_postwar_industry_work_due(text,text,text,text,text,timestamptz,text,text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.publish_postwar_industry_work_due(text,text,text,text,text,timestamptz,text,text,text)from public;
grant execute on function world_v2.publish_postwar_industry_work_due(text,text,text,text,text,timestamptz,text,text,text)to world_v2_industry_source_publisher;
revoke create on schema world_v2 from world_v2_industry_source_owner;
commit;
