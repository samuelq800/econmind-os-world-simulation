-- CANDIDATE EXISTING-SCHEMA FORWARD UPGRADE ONLY. No World/source/Clock or
-- economic row is created. Fresh installations use utility-custody.sql instead.
-- Supported predecessor: 0cf65bc0 utility source raw SHA
-- 0341a55519ba0e8eb970ae43acf19980b2f2c3a6134cd97f1695a417907a1fb5;
-- also the country-selected e524ac58 predecessor and the exact scoped successor.
-- This does NOT upgrade the remainder of a 76-proposal H0 to the Power schema.
-- Drain publishers/consumers; review baseline ledger/definitions first. On unknown COMMIT stop, no retry;
-- inspect actual catalog/ledger. Failures before a confirmed COMMIT roll back
-- only this transaction. Committed history is retained; later fixes need review.
begin;
set local lock_timeout='2000ms';
do $upgrade$
declare t regclass;pk record;cols text[];p record;read2 oid;read4 oid;pub oid;body text;definition text;newbody text;owner_id oid;publisher_id oid;expected_policy text;lock_started timestamptz;
begin
 t:=to_regclass('world_v2.postwar_industry_water_grant_publication');
 if t is null then raise exception 'WATER_GRANT_UPGRADE_EXISTING_REGISTRY_REQUIRED'using errcode='55000';end if;
 -- A bounded catalog lock serializes publishers and other DDL. The controlled
 -- release executor must see all rows; no new membership or bypass is granted.
 lock_started:=clock_timestamp();
 lock table world_v2.postwar_industry_water_grant_publication in access exclusive mode;
 raise notice 'WATER_GRANT_UPGRADE_LOCK timeout=% elapsed_ms=%',current_setting('lock_timeout'),extract(epoch from(clock_timestamp()-lock_started))*1000;
 if current_setting('standard_conforming_strings')<>'on'then raise exception 'WATER_GRANT_UPGRADE_STANDARD_STRING_MODE_REQUIRED'using errcode='55000';end if;
 owner_id:=to_regrole('world_v2_industry_source_owner');publisher_id:=to_regrole('world_v2_industry_source_publisher');
 if owner_id is null or publisher_id is null or exists(select 1 from pg_roles where oid in(owner_id,publisher_id)and(rolcanlogin or rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication))then raise exception 'WATER_GRANT_UPGRADE_FIXED_ROLES_REQUIRED'using errcode='42501';end if;
 if not exists(select 1 from pg_class where oid=t and relkind='r'and relpersistence='p'and relowner=owner_id and relrowsecurity and relforcerowsecurity)or row_security_active(t)then raise exception 'WATER_GRANT_UPGRADE_OWNER_RLS_OR_RELEASE_VISIBILITY_DIFFERS'using errcode='42501';end if;
 select array_agg(attname::text order by attnum)into cols from pg_attribute where attrelid=t and attnum>0 and not attisdropped;
 if cols is distinct from array['world_id','run_id','schedule_command_id','command_id','command_fingerprint','source_ref','seed_fingerprint','admission_ref']or exists(select 1 from pg_attribute where attrelid=t and attnum>0 and not attisdropped and(atttypid<>'text'::regtype or not attnotnull or attgenerated<>''or atthasdef))then raise exception 'WATER_GRANT_UPGRADE_EXACT_COLUMNS_REQUIRED'using errcode='23514';end if;
 expected_policy:='((CURRENT_USER = ''world_v2_industry_source_owner''::name) AND (world_id = current_setting(''econmind.industry_source_world''::text, true)))';
 if(select count(*)from pg_policy where polrelid=t)<>1 or not exists(select 1 from pg_policy where polrelid=t and polname='industry_water_grant_owner'and polcmd='*'and polpermissive and polroles=array[owner_id]and pg_get_expr(polqual,polrelid)=expected_policy and pg_get_expr(polwithcheck,polrelid)=expected_policy)then raise exception 'WATER_GRANT_UPGRADE_EXACT_RLS_POLICY_REQUIRED'using errcode='23514';end if;
 if not exists(select 1 from pg_trigger where tgrelid=t and tgname='industry_water_grant_immutable'and tgtype=27 and tgenabled='O'and not tgisinternal and tgfoid='world_v2.reject_authoritative_history_mutation()'::regprocedure)or not exists(select 1 from pg_trigger where tgrelid=t and tgname='industry_water_grant_no_truncate'and tgtype=34 and tgenabled='O'and not tgisinternal and tgfoid='world_v2.reject_authoritative_history_mutation()'::regprocedure)then raise exception 'WATER_GRANT_UPGRADE_IMMUTABLE_HISTORY_REQUIRED'using errcode='23514';end if;
 select c.*,pg_get_constraintdef(c.oid)as definition into strict pk from pg_constraint c where conrelid=t and contype='p';
 if pk.conname<>'postwar_industry_water_grant_publication_pkey'or not pk.convalidated or pk.condeferrable or pk.condeferred or pk.definition not in('PRIMARY KEY (world_id, run_id)','PRIMARY KEY (world_id, schedule_command_id)')then raise exception 'WATER_GRANT_UPGRADE_EXACT_PRIMARY_KEY_REQUIRED'using errcode='23514';end if;
 if exists(select 1 from pg_constraint where contype='f'and confrelid=t)then raise exception 'WATER_GRANT_UPGRADE_UNREVIEWED_DEPENDENCY'using errcode='23514';end if;
 if not exists(select 1 from pg_constraint where conrelid=t and contype='f'and confrelid='world_v2.command_submission'::regclass and pg_get_constraintdef(oid)='FOREIGN KEY (world_id, command_id) REFERENCES world_v2.command_submission(world_id, command_id)'and convalidated and not condeferrable and confdeltype='a'and confupdtype='a')then raise exception 'WATER_GRANT_UPGRADE_EXACT_COMMAND_FOREIGN_KEY_REQUIRED'using errcode='23514';end if;
 read2:=to_regprocedure('world_v2.read_postwar_industry_water_grant_publication(text,text)');read4:=to_regprocedure('world_v2.read_postwar_industry_water_grant_publication(text,text,text,text)');pub:=to_regprocedure('world_v2.publish_postwar_industry_water_grant(text,text,text,text,text,bigint,bigint,timestamptz,text,text)');
 if read2 is null or pub is null then raise exception 'WATER_GRANT_UPGRADE_PREDECESSOR_FUNCTIONS_REQUIRED'using errcode='55000';end if;
 for p in select * from pg_proc where oid in(read2,read4,pub)loop
  if pg_get_function_result(p.oid)<>'TABLE(command_json jsonb, command_fingerprint text, publication_status text)'or p.proisstrict or p.proleakproof or p.provolatile<>'v'or p.proparallel<>'u'or(p.oid=read2 and p.proargnames is distinct from array['p_world','p_run','command_json','command_fingerprint','publication_status'])or(p.oid=read4 and p.proargnames is distinct from array['p_world','p_country','p_facility','p_run','command_json','command_fingerprint','publication_status'])or(p.oid=pub and p.proargnames is distinct from array['p_world','p_country','p_facility','p_run','p_worker','p_version','p_sequence','p_at','p_sim','p_expected_fingerprint','command_json','command_fingerprint','publication_status'])then raise exception 'WATER_GRANT_UPGRADE_EXACT_FUNCTION_CONTRACT_REQUIRED'using errcode='23514';end if;
  if p.proowner<>owner_id or not p.prosecdef or p.proconfig is distinct from array['search_path=pg_catalog']or not has_function_privilege(publisher_id,p.oid,'EXECUTE')or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))where grantee not in(owner_id,publisher_id))then raise exception 'WATER_GRANT_UPGRADE_FUNCTION_OWNER_ACL_DIFFERS'using errcode='42501';end if;
 end loop;
 if exists(select 1 from world_v2.postwar_industry_water_grant_publication group by world_id,schedule_command_id having count(*)<>1)then raise exception 'WATER_GRANT_UPGRADE_DUPLICATE_ACTUAL_RUN'using errcode='23514';end if;
 -- No later revocation/expiry erases a historical registered command. Check
 -- immutable identities and the actual COMMITTED RUN, not current authority.
 if exists(select 1 from world_v2.postwar_industry_water_grant_publication q left join world_v2.command_submission g on g.world_id=q.world_id and g.command_id=q.command_id left join world_v2.command_submission r on r.world_id=q.world_id and r.command_id=q.schedule_command_id where g.command_id is null or r.command_id is null or g.command_fingerprint is distinct from q.command_fingerprint or g.command_type is distinct from 'INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1'or g.office_id is not null or r.command_type is distinct from 'CORE_INDUSTRY_RUN_SCHEDULE_V1'or r.office_id is distinct from 'INDUSTRY'or g.country_id is distinct from r.country_id or g.canonical_payload::jsonb->>'runId'is distinct from q.run_id or r.canonical_payload::jsonb->>'runId'is distinct from q.run_id or g.canonical_payload::jsonb->>'facilityId'is distinct from r.canonical_payload::jsonb->>'facilityId'or g.canonical_payload::jsonb->'operation'is distinct from jsonb_build_object('action','GRANT_RIGHT')or not exists(select 1 from world_v2.command_receipt cr where cr.world_id=r.world_id and cr.command_id=r.command_id and cr.outcome='COMMITTED'and exists(select 1 from world_v2.authoritative_event e where e.world_id=r.world_id and e.causation_command_id=r.command_id and e.event_type='INDUSTRY_FIRST_DAY_RUN_SCHEDULED_V1'and cr.event_ids?e.event_id and e.world_version=cr.world_version_after)))then raise exception 'WATER_GRANT_UPGRADE_HISTORICAL_BINDING_DIFFERS'using errcode='23514';end if;
 select prosrc,pg_get_functiondef(oid)into body,definition from pg_proc where oid=pub;
 if pk.definition='PRIMARY KEY (world_id, run_id)'then
  if read4 is not null or(select encode(sha256(convert_to(prosrc,'UTF8')),'hex')from pg_proc where oid=read2)<>'c52fbaa074e5438de4d54fb81bad2ae378f5f63593ee1e114f8b82fc04110614'or encode(sha256(convert_to(body,'UTF8')),'hex')not in('c5d1cfaf81993b66f8f2e21f316c7624d43bbf235de317e51398dc8fd351bec1','0398f903da44cdb648db4ccab36a888344c9cf802b2d4b6ddfbd1cd583ec43a2')then raise exception 'WATER_GRANT_UPGRADE_EXACT_LEGACY_FUNCTIONS_REQUIRED'using errcode='23514';end if;
  newbody:='
declare effective name;a world_v2.runtime_opening_admission%rowtype;h world_v2.world_head%rowtype;s world_v2.postwar_industry_utility_source%rowtype;c world_v2.command_submission%rowtype;r world_v2.command_receipt%rowtype;body jsonb;id text;payload jsonb;raw text;intent jsonb;fp text;begin
 effective:=case when current_setting(''role'')=''none''then session_user else current_setting(''role'')::name end;
 if effective<>''world_v2_industry_source_publisher''or pg_has_role(session_user,''world_v2_industry_source_owner'',''MEMBER'')or exists(select 1 from pg_roles where rolname=session_user and(rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication))then raise exception ''WATER_GRANT_FIXED_PUBLISHER_REQUIRED''using errcode=''42501'';end if;
 perform set_config(''econmind.industry_source_world'',p_world,true);
 -- Immutable recovery before any new grant or due calculation.
 if exists(select 1 from world_v2.postwar_industry_water_grant_publication q join world_v2.command_submission gc on gc.world_id=q.world_id and gc.command_id=q.command_id where q.world_id=p_world and q.run_id=p_run and gc.country_id=p_country and gc.canonical_payload::jsonb->>''facilityId''=p_facility)then return query select * from world_v2.read_postwar_industry_water_grant_publication(p_world,p_country,p_facility,p_run);return;end if;
 if p_country is null or p_country!~''^COUNTRY_(0[1-9]|[1-6][0-9]|70)$''or p_facility is null or p_facility!~''^[A-Za-z][A-Za-z0-9_.:-]{0,127}$''or p_at is null or not isfinite(p_at)or p_sim is null or p_sim!~''^(0|[1-9][0-9]*)$''or p_sim::numeric>=86400000 then raise exception ''WATER_GRANT_EXACT_FIRST_DAY_SCOPE_REQUIRED''using errcode=''22023'';end if;
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 perform 1 from world_v2.world_writer_lease l where l.world_id=p_world and l.holder_id=p_worker and l.acquired_at_real<=p_at and l.renewed_at_real<=p_at and l.lease_expires_at_real>p_at for share;
 if not found then raise exception ''WATER_GRANT_CURRENT_LEASE_REQUIRED''using errcode=''55000'';end if;
 select * into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found or h.world_version<>p_version or h.event_sequence<>p_sequence then raise exception ''WATER_GRANT_ACTUAL_PREFIX_HEAD_REQUIRED''using errcode=''40001'';end if;
 a:=world_v2.industry_source_admission(p_world);
 select * into s from world_v2.postwar_industry_utility_source x where x.world_id=p_world and x.country_id=p_country and x.facility_id=p_facility and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref for share;
 if not found then raise exception ''WATER_GRANT_REGISTERED_QUOTA_ORIGINAL_REQUIRED''using errcode=''55000'';end if;
 perform 1 from world_v2.postwar_industry_original x where x.world_id=p_world and x.registration_ref=s.registration_ref and not exists(select 1 from world_v2.postwar_industry_original_revocation v where v.world_id=p_world and v.registration_ref=x.registration_ref)for share;
 if not found then raise exception ''WATER_GRANT_CURRENT_PARENT_REQUIRED''using errcode=''55000'';end if;
 select * into strict c from world_v2.command_submission x where x.world_id=p_world and x.country_id=p_country and x.office_id=''INDUSTRY''and x.command_type=''CORE_INDUSTRY_RUN_SCHEDULE_V1''and x.canonical_payload::jsonb->>''facilityId''=p_facility and x.canonical_payload::jsonb->>''runId''=p_run;
 select * into r from world_v2.command_receipt x where x.world_id=p_world and x.command_id=c.command_id and x.outcome=''COMMITTED''and x.world_version_after<=h.world_version;
 if not found or jsonb_array_length(r.event_ids)<>1 or not exists(select 1 from world_v2.authoritative_event e where e.world_id=p_world and e.causation_command_id=c.command_id and e.event_id=r.event_ids->>0 and e.event_type=''INDUSTRY_FIRST_DAY_RUN_SCHEDULED_V1''and e.world_version=r.world_version_after and e.event_sequence<=h.event_sequence)then raise exception ''WATER_GRANT_ACTUAL_COMMITTED_RUN_REQUIRED''using errcode=''55000'';end if;
 body:=c.canonical_payload::jsonb;
 if p_sim::numeric<(body->>''startsAtSimTime'')::numeric or p_sim::numeric>=(body->>''endsAtSimTime'')::numeric or c.sim_time>p_sim::numeric then raise exception ''WATER_GRANT_ACTUAL_RUN_INTERVAL_REQUIRED''using errcode=''55000'';end if;
 id:=''COMMAND_INDUSTRY_WATER_GRANT_''||upper(world_v2.authoritative_sha256(world_v2.canonical_json(jsonb_build_array(p_world,c.command_fingerprint,s.source_sha256,''INDUSTRY_BOUNDED_WATER_GRANT_V1''))));
 payload:=jsonb_build_object(''schemaVersion'',''industry-first-day-utility-command-v1'',''serviceKind'',''WATER'',''operationRef'',id,''facilityId'',p_facility,''runId'',p_run,''sourceRef'',s.source_ref||''_WATER'',''sourceRawSha256'',s.source_sha256,''operation'',jsonb_build_object(''action'',''GRANT_RIGHT''));raw:=world_v2.canonical_json(payload);
 intent:=jsonb_build_object(''actorId'',c.actor_id,''authSubject'',c.auth_subject::text,''commandId'',id,''commandType'',''INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1'',''countryId'',p_country,''expectedWorldVersion'',p_version::text,''idempotencyKey'',id,''officeId'',null,''canonicalPayload'',raw,''schemaVersion'',''command-v1'',''simTime'',p_sim,''worldId'',p_world);
 fp:=''sha256:''||world_v2.authoritative_sha256(E''SHA-256\n''||world_v2.canonical_json(intent));
 if fp is distinct from p_expected_fingerprint then raise exception ''WATER_GRANT_CORE_EXACT_CANONICAL_FINGERPRINT_REQUIRED''using errcode=''23514'';end if;
 insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values(p_world,id,id,''INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1'',''command-v1'',raw,''sha256:''||world_v2.authoritative_sha256(E''SHA-256\n''||raw),fp,c.auth_subject,c.actor_id,p_country,null,p_version,p_sim::numeric,c.correlation_id,p_at);
 insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time)values(p_world,id,''VERSIONED_AUTOMATIC'',p_sim::numeric);
 insert into world_v2.postwar_industry_water_grant_publication values(p_world,p_run,c.command_id,id,fp,s.source_ref,a.seed_fingerprint,a.admission_ref);
 return query select * from world_v2.read_postwar_industry_water_grant_publication(p_world,p_country,p_facility,p_run);
end;';
  if encode(sha256(convert_to(newbody,'UTF8')),'hex')<>'7ea0feff174c496cbf2658d02bc3f88532869819d1124fb3d2f0d60ac89c0848'then raise exception 'WATER_GRANT_UPGRADE_EXACT_SUCCESSOR_REQUIRED'using errcode='23514';end if;
  alter table world_v2.postwar_industry_water_grant_publication drop constraint postwar_industry_water_grant_publication_pkey;
  alter table world_v2.postwar_industry_water_grant_publication add constraint postwar_industry_water_grant_publication_pkey primary key(world_id,schedule_command_id);
  execute replace(definition,body,newbody);
 else
  if read4 is null or(select encode(sha256(convert_to(prosrc,'UTF8')),'hex')from pg_proc where oid=read2)<>'7f5c11c2d046b7c15aafab9dac004f2706aa610967c0c43981f07517277d739d'or(select encode(sha256(convert_to(prosrc,'UTF8')),'hex')from pg_proc where oid=read4)<>'29fb5a78ad8a7ecbbc7ab99db976ecd81d5a0522d7f3b8116af30fb1b6697296'or encode(sha256(convert_to(body,'UTF8')),'hex')<>'7ea0feff174c496cbf2658d02bc3f88532869819d1124fb3d2f0d60ac89c0848'then raise exception 'WATER_GRANT_UPGRADE_EXACT_INSTALLED_SUCCESSOR_REQUIRED'using errcode='23514';end if;
 end if;
end;
$upgrade$;
create or replace function world_v2.read_postwar_industry_water_grant_publication(p_world text,p_country text,p_facility text,p_run text)
returns table(command_json jsonb,command_fingerprint text,publication_status text)language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_publisher'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')then raise exception 'WATER_GRANT_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 return query select jsonb_build_object('schemaVersion',c.schema_version,'worldId',c.world_id,'commandId',c.command_id,'commandType',c.command_type,'actorId',c.actor_id,'authSubject',c.auth_subject::text,'countryId',c.country_id,'officeId',c.office_id,'expectedWorldVersion',c.expected_world_version::text,'idempotencyKey',c.idempotency_key,'correlationId',c.correlation_id,'simTime',c.sim_time::text,'submittedAtReal',to_char(c.submitted_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'payload',c.canonical_payload::jsonb),c.command_fingerprint,case when exists(select 1 from world_v2.command_receipt r where r.world_id=c.world_id and r.command_id=c.command_id)then 'FINAL'else 'QUEUED'end from world_v2.postwar_industry_water_grant_publication p join world_v2.command_submission c on c.world_id=p.world_id and c.command_id=p.command_id and c.command_fingerprint=p.command_fingerprint where p.world_id=p_world and p.run_id=p_run and c.country_id=p_country and c.office_id is null and c.command_type='INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1'and c.canonical_payload::jsonb->>'facilityId'=p_facility and c.canonical_payload::jsonb->>'runId'=p_run;
end;$$;
alter function world_v2.read_postwar_industry_water_grant_publication(text,text,text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.read_postwar_industry_water_grant_publication(text,text,text,text)from public;
grant execute on function world_v2.read_postwar_industry_water_grant_publication(text,text,text,text)to world_v2_industry_source_publisher;
-- Legacy C2 recovery only. New callers must supply their exact actual scope.
create or replace function world_v2.read_postwar_industry_water_grant_publication(p_world text,p_run text)
returns table(command_json jsonb,command_fingerprint text,publication_status text)
language sql security definer set search_path=pg_catalog as $$
 select * from world_v2.read_postwar_industry_water_grant_publication(p_world,'COUNTRY_02','OPEN-02-REFINED_FUEL',p_run);
$$;
alter function world_v2.read_postwar_industry_water_grant_publication(text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.read_postwar_industry_water_grant_publication(text,text)from public;
grant execute on function world_v2.read_postwar_industry_water_grant_publication(text,text)to world_v2_industry_source_publisher;

commit;
