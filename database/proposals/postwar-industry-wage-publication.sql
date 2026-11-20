-- Fixed actual committed WORK -> one automatic wage task. No clock advancement,
-- payment, source admission, new identity/membership or reader table write.
-- Requires Industry firstday/run/work custody and source-revocation-fence.
begin;
grant create on schema world_v2 to world_v2_industry_source_owner;
create table world_v2.postwar_industry_wage_publication(
 world_id text not null,country_id text not null,facility_id text not null,run_id text not null,
 work_event_id text not null,work_event_fingerprint text not null,command_id text not null,command_fingerprint text not null,
 policy_version text not null check(policy_version='INDUSTRY_ACTUAL_COMPLETED_WORK_WAGE_V2'),source_ref text not null,seed_fingerprint text not null,admission_ref text not null,
 primary key(world_id,work_event_id,policy_version),foreign key(world_id,command_id)references world_v2.command_submission(world_id,command_id));
alter table world_v2.postwar_industry_wage_publication owner to world_v2_industry_source_owner;
alter table world_v2.postwar_industry_wage_publication enable row level security;
alter table world_v2.postwar_industry_wage_publication force row level security;
create policy industry_wage_publication_owner_scope on world_v2.postwar_industry_wage_publication to world_v2_industry_source_owner using(world_id=current_setting('econmind.industry_source_world',true))with check(world_id=current_setting('econmind.industry_source_world',true));
revoke all on world_v2.postwar_industry_wage_publication from public,world_v2_industry_source_reader,world_v2_industry_source_publisher;
create trigger industry_wage_publication_immutable before update or delete on world_v2.postwar_industry_wage_publication for each row execute function world_v2.reject_authoritative_history_mutation();
create trigger industry_wage_publication_no_truncate before truncate on world_v2.postwar_industry_wage_publication for each statement execute function world_v2.reject_authoritative_history_mutation();
-- Existing owner INSERT only, additionally constrained to the fixed wage family.
grant insert on world_v2.command_submission,world_v2.command_queue to world_v2_industry_source_owner;
create policy industry_wage_command_insert on world_v2.command_submission for insert to world_v2_industry_source_owner with check(world_id=current_setting('econmind.industry_source_world',true)and command_type='CORE_INDUSTRY_OPERATING_WAGE_PAY_V1'and office_id is null);
create policy industry_wage_queue_insert on world_v2.command_queue for insert to world_v2_industry_source_owner with check(world_id=current_setting('econmind.industry_source_world',true)and authority_kind='VERSIONED_AUTOMATIC');
create function world_v2.lock_postwar_industry_wage_publication(p_world text,p_command text,p_fingerprint text)
returns table(work_event_id text,work_event_fingerprint text,source_ref text,seed_fingerprint text,admission_ref text,policy_version text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;a world_v2.runtime_opening_admission%rowtype;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_reader'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')then raise exception 'INDUSTRY_WAGE_FIXED_CUTOFF_READER_REQUIRED'using errcode='42501';end if;
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 perform set_config('econmind.industry_source_world',p_world,true);perform 1 from world_v2.world_head h where h.world_id=p_world for share;a:=world_v2.industry_source_admission(p_world);
 return query select p.work_event_id,p.work_event_fingerprint,p.source_ref,p.seed_fingerprint,p.admission_ref,p.policy_version from world_v2.postwar_industry_wage_publication p where p.world_id=p_world and p.command_id=p_command and p.command_fingerprint=p_fingerprint and p.seed_fingerprint=a.seed_fingerprint and p.admission_ref=a.admission_ref for share;
end;$$;
alter function world_v2.lock_postwar_industry_wage_publication(text,text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.lock_postwar_industry_wage_publication(text,text,text)from public;
grant execute on function world_v2.lock_postwar_industry_wage_publication(text,text,text)to world_v2_industry_source_reader;
create function world_v2.read_postwar_industry_wage_publication(p_world text,p_country text,p_facility text,p_run text)
returns table(command_json text,command_fingerprint text,publication_status text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;a world_v2.runtime_opening_admission%rowtype;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_publisher'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')then raise exception 'INDUSTRY_WAGE_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 perform set_config('econmind.industry_source_world',p_world,true);perform 1 from world_v2.world_head h where h.world_id=p_world for share;a:=world_v2.industry_source_admission(p_world);
 return query select world_v2.canonical_json(jsonb_build_object('schemaVersion',c.schema_version,'commandId',c.command_id,'commandType',c.command_type,'worldId',c.world_id,'countryId',c.country_id,'officeId',c.office_id,'actorId',c.actor_id,'authSubject',c.auth_subject::text,'expectedWorldVersion',c.expected_world_version::text,'idempotencyKey',c.idempotency_key,'correlationId',c.correlation_id,'simTime',c.sim_time::text,'submittedAtReal',to_char(c.submitted_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'payload',c.canonical_payload::jsonb)),c.command_fingerprint,case when exists(select 1 from world_v2.command_receipt r where r.world_id=c.world_id and r.command_id=c.command_id)then'FINAL'else'QUEUED'end from world_v2.postwar_industry_wage_publication p join world_v2.command_submission c on c.world_id=p.world_id and c.command_id=p.command_id and c.command_fingerprint=p.command_fingerprint where p.world_id=p_world and p.country_id=p_country and p.facility_id=p_facility and p.run_id=p_run and p.seed_fingerprint=a.seed_fingerprint and p.admission_ref=a.admission_ref;
end;$$;
alter function world_v2.read_postwar_industry_wage_publication(text,text,text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.read_postwar_industry_wage_publication(text,text,text,text)from public;
grant execute on function world_v2.read_postwar_industry_wage_publication(text,text,text,text)to world_v2_industry_source_publisher;
create function world_v2.publish_postwar_industry_wage_due(p_world text,p_event text,p_event_fingerprint text,p_worker text,p_version text,p_sequence text,p_at timestamptz,p_sim text,p_expected_fingerprint text)
returns table(command_json text,command_fingerprint text,publication_status text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h world_v2.world_head%rowtype;a world_v2.runtime_opening_admission%rowtype;c world_v2.command_submission%rowtype;r world_v2.command_receipt%rowtype;e world_v2.authoritative_event%rowtype;s world_v2.postwar_industry_first_day_source%rowtype;body jsonb;payload jsonb;payload_text text;key text;id text;fp text;intent jsonb;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_publisher'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')or exists(select 1 from pg_roles x where x.rolname=effective and(x.rolsuper or x.rolbypassrls or x.rolcreaterole or x.rolcreatedb or x.rolreplication))then raise exception 'INDUSTRY_WAGE_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if p_version!~'^(0|[1-9][0-9]*)$'or p_sequence!~'^(0|[1-9][0-9]*)$'or p_sim!~'^(0|[1-9][0-9]*)$'or p_at is null or not isfinite(p_at)then raise exception 'INDUSTRY_WAGE_EXACT_TIME_HEAD_REQUIRED'using errcode='22023';end if;
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 perform set_config('econmind.industry_source_world',p_world,true);
 perform 1 from world_v2.world_writer_lease l where l.world_id=p_world and l.holder_id=p_worker and l.acquired_at_real<=p_at and l.renewed_at_real<=p_at and l.lease_expires_at_real>p_at for share;
 if not found then raise exception 'INDUSTRY_WAGE_CURRENT_LEASE_REQUIRED'using errcode='55000';end if;
 select * into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found or h.world_version::text<>p_version or h.event_sequence::text<>p_sequence then raise exception 'INDUSTRY_WAGE_CURRENT_HEAD_REQUIRED'using errcode='40001';end if;
 a:=world_v2.industry_source_admission(p_world);
 select * into e from world_v2.authoritative_event x where x.world_id=p_world and x.event_id=p_event and x.event_fingerprint=p_event_fingerprint and x.event_type='INDUSTRY_FIRST_DAY_WORK_COMPLETED_V1'and x.corrects_event_id is null and x.world_version<=h.world_version and x.event_sequence<=h.event_sequence;
 if not found or e.payload_sha256 is distinct from 'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||e.canonical_payload)then raise exception 'INDUSTRY_WAGE_ACTUAL_WORK_REQUIRED'using errcode='55000';end if;
 select * into c from world_v2.command_submission x where x.world_id=p_world and x.command_id=e.causation_command_id and x.command_type='CORE_INDUSTRY_FIRST_DAY_WORK_V1'and x.office_id is null;
 if not found then raise exception 'INDUSTRY_WAGE_ACTUAL_WORK_COMMAND_REQUIRED'using errcode='55000';end if;
 select * into r from world_v2.command_receipt x where x.world_id=p_world and x.command_id=c.command_id and x.outcome='COMMITTED'and x.command_fingerprint=c.command_fingerprint and x.event_ids=jsonb_build_array(e.event_id)and x.world_version_after=e.world_version;
 if not found or exists(select 1 from world_v2.financial_posting_batch x where x.world_id=p_world and x.causation_command_id=c.command_id)or exists(select 1 from world_v2.inventory_posting x where x.world_id=p_world and x.causation_command_id=c.command_id)then raise exception 'INDUSTRY_WAGE_COMMITTED_UNPAID_WORK_REQUIRED'using errcode='55000';end if;
 body:=e.canonical_payload::jsonb;
 if body->>'schemaVersion'is distinct from'postwar-industry-completed-work-v1'or body->>'seedId'is distinct from a.seed_id or body->>'seedFingerprint'is distinct from a.seed_fingerprint or body->>'admissionRef'is distinct from a.admission_ref or body->>'worldId'is distinct from p_world or body->>'countryId'is distinct from c.country_id or p_sim::numeric<c.sim_time or p_sim::numeric>=86400000 then raise exception 'INDUSTRY_WAGE_REAL_WORK_SCOPE_CLOCK_REQUIRED'using errcode='23514';end if;
 select * into s from world_v2.postwar_industry_first_day_source x where x.world_id=p_world and x.country_id=c.country_id and x.facility_id=body->>'facilityId'and x.source_ref=body->'policy'->>'sourceRef'and x.source_sha256=body->'policy'->>'sourceRawSha256'and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref for share;
 if not found or s.source_sha256<>encode(sha256(convert_to(s.source_text,'UTF8')),'hex')or exists(select 1 from world_v2.postwar_industry_first_day_source_revocation x where x.world_id=p_world and x.source_ref=s.source_ref)or exists(select 1 from world_v2.postwar_industry_original_revocation x where x.world_id=p_world and x.registration_ref=s.registration_ref)then raise exception 'INDUSTRY_WAGE_CURRENT_ACTUAL_SOURCE_REQUIRED'using errcode='55000';end if;
 if exists(select 1 from world_v2.postwar_industry_wage_publication x where x.world_id=p_world and x.work_event_id=e.event_id)then return query select * from world_v2.read_postwar_industry_wage_publication(p_world,c.country_id,body->>'facilityId',body->>'runId');return;end if;
 key:=upper(encode(sha256(convert_to(world_v2.canonical_json(jsonb_build_array(p_world,a.seed_fingerprint,e.event_fingerprint,'INDUSTRY_ACTUAL_COMPLETED_WORK_WAGE_V2')),'UTF8')),'hex'));id:='COMMAND_INDUSTRY_WAGE_'||key;
 payload:=jsonb_build_object('schemaVersion','industry-operating-wage-payment-v1','workEventId',e.event_id,'workEventFingerprint',e.event_fingerprint,'policyVersion','INDUSTRY_ACTUAL_COMPLETED_WORK_WAGE_V2');payload_text:=world_v2.canonical_json(payload);
 intent:=jsonb_build_object('actorId',c.actor_id,'authSubject',c.auth_subject::text,'commandId',id,'commandType','CORE_INDUSTRY_OPERATING_WAGE_PAY_V1','countryId',c.country_id,'expectedWorldVersion',p_version,'idempotencyKey','INDUSTRY_WAGE_'||key,'officeId',null,'canonicalPayload',payload_text,'schemaVersion','command-v1','simTime',p_sim,'worldId',p_world);
 fp:='sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(intent));if fp is distinct from p_expected_fingerprint then raise exception 'INDUSTRY_WAGE_CORE_CANONICAL_FINGERPRINT_REQUIRED'using errcode='23514';end if;
 insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values(p_world,id,'INDUSTRY_WAGE_'||key,'CORE_INDUSTRY_OPERATING_WAGE_PAY_V1','command-v1',payload_text,'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||payload_text),fp,c.auth_subject,c.actor_id,c.country_id,null,h.world_version,p_sim::numeric,c.correlation_id,p_at);
 insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time)values(p_world,id,'VERSIONED_AUTOMATIC',p_sim::numeric);
 insert into world_v2.postwar_industry_wage_publication values(p_world,c.country_id,body->>'facilityId',body->>'runId',e.event_id,e.event_fingerprint,id,fp,'INDUSTRY_ACTUAL_COMPLETED_WORK_WAGE_V2',s.source_ref,a.seed_fingerprint,a.admission_ref);
 return query select * from world_v2.read_postwar_industry_wage_publication(p_world,c.country_id,body->>'facilityId',body->>'runId');
end;$$;
alter function world_v2.publish_postwar_industry_wage_due(text,text,text,text,text,text,timestamptz,text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.publish_postwar_industry_wage_due(text,text,text,text,text,text,timestamptz,text,text)from public;
grant execute on function world_v2.publish_postwar_industry_wage_due(text,text,text,text,text,text,timestamptz,text,text)to world_v2_industry_source_publisher;
revoke create on schema world_v2 from world_v2_industry_source_owner;
commit;
