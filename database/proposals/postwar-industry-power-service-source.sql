-- CANDIDATE ONLY. Existing POWER staff originals, not WORK, pay or energy.
-- Requires utility custody, firstday source, run history, work publication.
-- Reuses the existing Industry roles/table. No reader raw seed/table grant.
begin;
grant create on schema world_v2 to world_v2_industry_source_owner;
create function world_v2.publish_postwar_industry_power_service_source(p_world text,p_expected_source text)
returns table(source_ref text,source_sha256 text)language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;a world_v2.runtime_opening_admission%rowtype;u world_v2.postwar_industry_utility_source%rowtype;r world_v2.postwar_industry_original%rowtype;seedtext text;op json;doc jsonb;raw text;ref text;expected text;entries jsonb;s world_v2.postwar_industry_first_day_source%rowtype;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_publisher'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')or exists(select 1 from pg_roles x where x.rolname=session_user and(x.rolsuper or x.rolbypassrls or x.rolcreatedb or x.rolcreaterole or x.rolreplication))then raise exception 'POWER_SERVICE_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if p_expected_source is null or octet_length(p_expected_source)>65536 then raise exception 'POWER_SERVICE_BOUNDED_ORIGINAL_REQUIRED'using errcode='22023';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 perform 1 from world_v2.world_head h where h.world_id=p_world for share;
 if not found then raise exception 'POWER_SERVICE_WORLD_REQUIRED'using errcode='55000';end if;
 a:=world_v2.industry_source_admission(p_world);
 -- Scope is read from expected DATA, then independently checked against the
 -- unique registered parent and exact actual E03 rows below; never LIMIT 1.
 if jsonb_typeof(p_expected_source::jsonb)<>'array'or jsonb_array_length(p_expected_source::jsonb)<>3 then raise exception 'POWER_SERVICE_ACTUAL_E03_BYTES_DIFFER'using errcode='23514';end if;
 select * into strict u from world_v2.postwar_industry_utility_source x where x.world_id=p_world and x.country_id=(p_expected_source::jsonb->0->>'countryId')and x.source_text::jsonb->'power'->>'storageId'=(p_expected_source::jsonb->0->>'sourceObjectId')and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref for share;
 select * into strict r from world_v2.postwar_industry_original x where x.world_id=p_world and x.registration_ref=u.registration_ref and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref for share;
 if u.source_sha256<>encode(sha256(convert_to(u.source_text,'UTF8')),'hex')or u.source_text::jsonb->>'countryId'is distinct from u.country_id or u.source_text::jsonb->>'operatorId'is distinct from r.document_text::jsonb->>'operatorId'or exists(select 1 from world_v2.postwar_industry_original_revocation v where v.world_id=p_world and v.registration_ref=r.registration_ref)then raise exception 'POWER_SERVICE_EXACT_CURRENT_UTILITY_PARENT_REQUIRED'using errcode='55000';end if;
 -- Offline publication only: derive the array from the real immutable admitted
 -- seed and the registered operating-source pointer, not from caller rows.
 select x.canonical_payload into strict seedtext from world_v2.opening_seed x where x.world_id=p_world and x.seed_fingerprint=a.seed_fingerprint;
 select x into strict op from json_array_elements(seedtext::json->'sources')x where x->>'sourceId'=r.operating_source_id and x->>'payloadHash'=r.operating_source_hash;
 doc:=((op->>'canonicalPayload')::jsonb)->'carrier'->'socialEmployment';
 if doc->>'schemaVersion'<>'postwar-social-employment-state-v1'or doc->'inputs'->>'worldId'<>p_world or doc->'inputs'->>'seedId'<>a.seed_id then raise exception 'POWER_SERVICE_ACTUAL_E03_REQUIRED'using errcode='23514';end if;
 select jsonb_agg(x order by n)into entries from jsonb_array_elements(doc->'inputs'->'sourcePositions')with ordinality e(x,n)where x->>'countryId'=u.country_id and x->>'locationId'=u.source_text::jsonb->>'locationId'and x->>'sourceObjectId'=u.source_text::jsonb->'power'->>'storageId'and x->>'employerId'=u.source_text::jsonb->>'operatorId';
 if entries is null or jsonb_array_length(entries)<>3 or(select count(distinct x->>'skill')from jsonb_array_elements(entries)x)<>3 or exists(select 1 from jsonb_array_elements(entries)x where x->>'sourceBucket'<>'POWER'or x->>'employerRole'<>'OP'or x->>'skill'not in('LOW','MEDIUM','HIGH')or x->>'positionId'<>'POSTWAR_SOURCE_'||upper(encode(sha256(convert_to((u.source_text::jsonb->'power'->>'storageId')||'/'||(x->>'skill'),'UTF8')),'hex'))or x->'personRange'->>'count'<>x->>'filledCount')then raise exception 'POWER_SERVICE_REAL_DISTINCT_POSITION_SET_REQUIRED'using errcode='23514';end if;
 raw:=world_v2.canonical_json(entries);expected:=encode(sha256(convert_to(raw,'UTF8')),'hex');ref:='INDUSTRY_POWER_STAFF_'||upper(expected);
 if raw is distinct from p_expected_source then raise exception 'POWER_SERVICE_ACTUAL_E03_BYTES_DIFFER'using errcode='23514';end if;
 insert into world_v2.postwar_industry_first_day_source values(p_world,u.country_id,u.source_text::jsonb->'power'->>'storageId',ref,r.registration_ref,a.seed_id,a.seed_fingerprint,a.admission_ref,'INDUSTRY_FIRST_DAY_20261101_V1','99ede2cbf1bb7b04d3fe5d99cf101c47ed055b2e12b8ca9080cfc2a43b3d086c','8d5fb70a2b2250201d623aa7898a95d48540083d6fa316a1b8e920abca0fd9d6',raw,expected)on conflict(world_id,country_id,facility_id)do nothing;
 select * into strict s from world_v2.postwar_industry_first_day_source x where x.world_id=p_world and x.country_id=u.country_id and x.facility_id=u.source_text::jsonb->'power'->>'storageId';
 if s.source_ref<>ref or s.source_text<>raw or s.registration_ref<>r.registration_ref or s.seed_id<>a.seed_id or s.seed_fingerprint<>a.seed_fingerprint or s.admission_ref<>a.admission_ref or exists(select 1 from world_v2.postwar_industry_first_day_source_revocation v where v.world_id=p_world and v.source_ref=s.source_ref)then raise exception 'POWER_SERVICE_ORIGINAL_CONFLICT_OR_REVOKED'using errcode='55000';end if;
 return query select s.source_ref,s.source_sha256;
end;$$;
alter function world_v2.publish_postwar_industry_power_service_source(text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.publish_postwar_industry_power_service_source(text,text)from public;
grant execute on function world_v2.publish_postwar_industry_power_service_source(text,text)to world_v2_industry_source_publisher;
create or replace function world_v2.read_postwar_industry_first_day_source(p_world text,p_country text,p_facility text,p_version bigint,p_sequence bigint)
returns table(source_text text,source_sha256 text,source_ref text,world_version text,event_sequence text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h record;a world_v2.runtime_opening_admission%rowtype;s world_v2.postwar_industry_first_day_source%rowtype;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_industry_source_reader','MEMBER')or pg_has_role(effective,'world_v2_industry_source_owner','MEMBER')or pg_has_role(effective,'world_v2_industry_source_publisher','MEMBER')or exists(select 1 from pg_roles r where r.rolname=effective and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))then raise exception 'INDUSTRY_FIRST_DAY_FIXED_READER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 select h0.world_version,h0.event_sequence into h from world_v2.world_head h0 where h0.world_id=p_world for share;
 if not found or h.world_version<>p_version or h.event_sequence<>p_sequence then raise exception 'INDUSTRY_FIRST_DAY_ACTUAL_HEAD_REQUIRED'using errcode='55000';end if;
 a:=world_v2.industry_source_admission(p_world);
 select * into s from world_v2.postwar_industry_first_day_source x where x.world_id=p_world and x.country_id=p_country and x.facility_id=p_facility and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref for share;
 if not found then return;end if;
 if s.source_ref='INDUSTRY_POWER_STAFF_'||upper(s.source_sha256)then
  perform 1 from world_v2.postwar_industry_utility_source u join world_v2.postwar_industry_original o on o.world_id=u.world_id and o.registration_ref=u.registration_ref
   where u.world_id=p_world and u.country_id=p_country and u.registration_ref=s.registration_ref and u.seed_id=a.seed_id and u.seed_fingerprint=a.seed_fingerprint and u.admission_ref=a.admission_ref and u.source_text::jsonb->'power'->>'storageId'=p_facility and u.source_sha256=encode(sha256(convert_to(u.source_text,'UTF8')),'hex')and exists(select 1 from world_v2.postwar_industry_first_day_source f where f.world_id=u.world_id and f.country_id=u.country_id and f.facility_id=u.facility_id and f.seed_fingerprint=u.seed_fingerprint and f.admission_ref=u.admission_ref and not exists(select 1 from world_v2.postwar_industry_first_day_source_revocation v where v.world_id=f.world_id and v.source_ref=f.source_ref))and not exists(select 1 from world_v2.postwar_industry_original_revocation v where v.world_id=p_world and v.registration_ref=o.registration_ref)and not exists(select 1 from world_v2.postwar_industry_first_day_source_revocation v where v.world_id=p_world and v.source_ref=s.source_ref)for share of u,o;
  if not found or s.source_sha256<>encode(sha256(convert_to(s.source_text,'UTF8')),'hex')then raise exception 'POWER_SERVICE_CURRENT_PARENT_OR_SOURCE_REVOKED'using errcode='55000';end if;
  return query select s.source_text,s.source_sha256,s.source_ref,h.world_version::text,h.event_sequence::text;return;
 end if;
 perform 1 from world_v2.postwar_industry_original o where o.world_id=p_world and o.registration_ref=s.registration_ref and o.seed_fingerprint=s.seed_fingerprint and o.admission_ref=s.admission_ref and o.document_sha256=(s.source_text::jsonb->>'siteDocumentSha256')and not exists(select 1 from world_v2.postwar_industry_original_revocation v where v.world_id=p_world and v.registration_ref=o.registration_ref)for share;
 if not found or exists(select 1 from world_v2.postwar_industry_first_day_source_revocation v where v.world_id=p_world and v.source_ref=s.source_ref)then raise exception 'INDUSTRY_FIRST_DAY_SOURCE_REVOKED'using errcode='55000';end if;
 return query select s.source_text,s.source_sha256,s.source_ref,h.world_version::text,h.event_sequence::text;
end;$$;
alter function world_v2.read_postwar_industry_first_day_source(text,text,text,bigint,bigint)owner to world_v2_industry_source_owner;
revoke all on function world_v2.read_postwar_industry_first_day_source(text,text,text,bigint,bigint)from public;
grant execute on function world_v2.read_postwar_industry_first_day_source(text,text,text,bigint,bigint)to world_v2_industry_source_reader;
create or replace function world_v2.publish_postwar_industry_work_due(p_world text,p_schedule text,p_worker text,p_version text,p_sequence text,p_at timestamptz,p_sim text,p_payload text,p_expected_fingerprint text)
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
 if s.source_ref='INDUSTRY_POWER_STAFF_'||upper(s.source_sha256)then
  -- One person-day is 480 minutes; this is not an MWh productivity rule.
  perform 1 from world_v2.postwar_industry_utility_source u where u.world_id=p_world and u.country_id=p.country_id and u.registration_ref=s.registration_ref and u.seed_fingerprint=a.seed_fingerprint and u.admission_ref=a.admission_ref and u.source_text::jsonb->'power'->>'storageId'=terms->>'facilityId'and u.source_sha256=encode(sha256(convert_to(u.source_text,'UTF8')),'hex')for share;
  if not found or terms->'quantity'->>'unit'<>'person-day'then raise exception 'POWER_SERVICE_EXACT_REGISTERED_PERSON_TIME_REQUIRED'using errcode='23514';end if;
  needed:=(terms->'quantity'->>'amount')::numeric*28800000;
 else
  needed:=(terms->'quantity'->>'amount')::numeric*(s.source_text::jsonb->'recipe'->>'workersPerDailyOutputUnit')::numeric*28800000;
 end if;
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
