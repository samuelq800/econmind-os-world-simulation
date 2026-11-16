-- CANDIDATE ONLY: controlled append-only forward, no role enrollment, data writes or Clock.
-- Source country and programme integrity supplement Core whole-current-group replay.
begin;
do $application_guard$
declare specs jsonb:=$application_specs$[{"signature":"world_v2.postwar_social_prefix_effect_scoped(text,text,text,jsonb,jsonb,bigint)","owner":"world_v2_postwar_projection_owner","securityDefiner":true,"config":["search_path=pg_catalog"],"argumentNames":["p_world","p_country","p_type","p_command","p_event","p_sequence"],"strict":false,"volatility":"v","parallel":"u","result":"boolean","defaultCount":0,"defaults":null,"leakproof":false,"kind":"f","language":"plpgsql","acl":[{"grantee":"world_v2_postwar_projection_owner","grantor":"world_v2_postwar_projection_owner","grantable":false,"privilege":"EXECUTE"}],"bodySha256":"e59fb6fa1a87156d54a02eb8d9cf97f6b4ded8c44fce2d8d31acc23ae69723fa"},{"signature":"world_v2.postwar_social_origin_at_prefix(text,text)","owner":"world_v2_postwar_projection_owner","securityDefiner":true,"config":["search_path=pg_catalog"],"argumentNames":["p_world","p_country","state","binding","origin_world_version","origin_event_sequence"],"strict":false,"volatility":"v","parallel":"u","result":"TABLE(state jsonb, binding jsonb, origin_world_version bigint, origin_event_sequence bigint)","defaultCount":0,"defaults":null,"leakproof":false,"kind":"f","language":"plpgsql","acl":[{"grantee":"world_v2_postwar_projection_owner","grantor":"world_v2_postwar_projection_owner","grantable":false,"privilege":"EXECUTE"}],"bodySha256":"c4c8c93f004b53dea93b591eb3fb244df63a9f73f9b3f691af8c82df7fef84c6"},{"signature":"world_v2.postwar_apply_current_frame_page(text,text,jsonb)","owner":"world_v2_postwar_projection_owner","securityDefiner":true,"config":["search_path=pg_catalog"],"argumentNames":["p_world","p_frames_text","p_state"],"strict":false,"volatility":"v","parallel":"u","result":"jsonb","defaultCount":0,"defaults":null,"leakproof":false,"kind":"f","language":"plpgsql","acl":[{"grantee":"world_v2_postwar_projection_owner","grantor":"world_v2_postwar_projection_owner","grantable":false,"privilege":"EXECUTE"}],"bodySha256":"20c531d49af93e25fd3576f25360de04773c759793b4acea53d7727091cb438d"},{"signature":"world_v2.publish_social_operating_paged_match_due(text,text,text,text)","owner":"world_v2_social_source_owner","securityDefiner":true,"config":["search_path=pg_catalog"],"argumentNames":["p_world","p_country","p_plan","p_witness"],"strict":false,"volatility":"v","parallel":"u","result":"world_v2.command_submission","defaultCount":0,"defaults":null,"leakproof":false,"kind":"f","language":"plpgsql","acl":[{"grantee":"world_v2_social_source_owner","grantor":"world_v2_social_source_owner","grantable":false,"privilege":"EXECUTE"},{"grantee":"world_v2_social_source_publisher","grantor":"world_v2_social_source_owner","grantable":false,"privilege":"EXECUTE"}],"bodySha256":"9f20abe1f6032fbe6c4dabe350c1c42a8c889877ba47760476aafb45e443b544"},{"signature":"world_v2.postwar_social_complete_prefix(text)","owner":"world_v2_postwar_projection_owner","securityDefiner":true,"config":["search_path=pg_catalog"],"argumentNames":["p_world","prefix_fingerprint","effects_fingerprint","last_event_id","last_event_fingerprint"],"strict":false,"volatility":"v","parallel":"u","result":"TABLE(prefix_fingerprint text, effects_fingerprint text, last_event_id text, last_event_fingerprint text)","defaultCount":0,"defaults":null,"leakproof":false,"kind":"f","language":"plpgsql","bodySha256":"def4a0441271b20636e78fca7395d3bb9c689099b4b6f3a14053103395d97f0e","acl":[{"grantee":"world_v2_postwar_projection_owner","grantor":"world_v2_postwar_projection_owner","grantable":false,"privilege":"EXECUTE"}]},{"signature":"world_v2.postwar_current_social_witness(text,text)","owner":"world_v2_postwar_projection_owner","securityDefiner":true,"config":["search_path=pg_catalog"],"argumentNames":["p_world","p_country","world_version","event_sequence","state","binding"],"strict":false,"volatility":"v","parallel":"u","result":"TABLE(world_version bigint, event_sequence bigint, state jsonb, binding jsonb)","defaultCount":0,"defaults":null,"leakproof":false,"kind":"f","language":"plpgsql","bodySha256":"48c1d2b665c11f4139907a48776d8e60a51310c22c55e21615cbba41fb669843","acl":[{"grantee":"world_v2_postwar_projection_owner","grantor":"world_v2_postwar_projection_owner","grantable":false,"privilege":"EXECUTE"}]}]$application_specs$::jsonb;spec jsonb;actual jsonb;oids jsonb:='{}';schema_acl jsonb;begin
 for spec in select value from jsonb_array_elements(specs)loop
 select jsonb_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,'config',p.proconfig,'argumentNames',p.proargnames,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'result',pg_get_function_result(p.oid),'defaultCount',p.pronargdefaults,'defaults',p.proargdefaults::text,'leakproof',p.proleakproof,'kind',p.prokind,'language',l.lanname,'bodySha256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'acl',(select jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',case when a.grantee=0 then 'PUBLIC'else pg_get_userbyid(a.grantee)::text end,'privilege',a.privilege_type,'grantable',a.is_grantable)order by case when a.grantee=0 then 'PUBLIC'else pg_get_userbyid(a.grantee)::text end,pg_get_userbyid(a.grantor)::text,a.privilege_type)from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a))into actual from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure(spec->>'signature');
 if actual is distinct from spec then raise exception 'SOCIAL_APPLICATION_EXACT_PREDECESSOR_REQUIRED:%',spec->>'signature'using errcode='55000';end if;
 oids:=oids||jsonb_build_object(spec->>'signature',to_regprocedure(spec->>'signature')::oid::text);
 end loop;
 if to_regprocedure('world_v2.postwar_social_application_effect_scoped(text,text,jsonb,jsonb,bigint)')is not null then raise exception 'SOCIAL_APPLICATION_REPEAT_STOP_INSPECT'using errcode='55000';end if;
 if to_regprocedure('world_v2.postwar_social_application_contract_version()')is not null then raise exception 'SOCIAL_APPLICATION_REPEAT_STOP_INSPECT'using errcode='55000';end if;
select coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',case when a.grantee=0 then 'PUBLIC'else pg_get_userbyid(a.grantee)::text end,'privilege',a.privilege_type,'grantable',a.is_grantable)order by a.grantor,a.grantee,a.privilege_type),'[]'::jsonb)into schema_acl from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner)))a where n.nspname='world_v2';
 perform set_config('econmind.application_forward.before_oids',oids::text,true);perform set_config('econmind.application_forward.schema_acl',schema_acl::text,true);
end;$application_guard$;
grant create on schema world_v2 to world_v2_postwar_projection_owner,world_v2_social_source_owner;
-- A submission names a real whole E03 group; it does not establish citizen
-- consent, individual identity, eligibility, enrolment, funding or payment.
-- Core replays current aggregate counts. This SQL independently binds country,
-- original population bounds and programme history, never initial labour counts.
create function world_v2.postwar_social_application_effect_scoped(p_world text,p_country text,p_command jsonb,p_event jsonb,p_sequence bigint)returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
declare original world_v2.postwar_social_prefix_scope%rowtype;s jsonb;f jsonb;i jsonb;g jsonb;expected jsonb;available text;n bigint;begin
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select * into strict original from world_v2.postwar_social_prefix_scope where world_id=p_world and country_id=p_country;
 s:=original.scope_document::jsonb;f:=p_event->'readFacts';i:=(p_command->>'canonicalPayload')::jsonb;g:=i->'applicant';
 if original.scope_sha256 is distinct from encode(sha256(convert_to(original.scope_document,'UTF8')),'hex')
  or p_command->>'worldId'is distinct from p_world or p_command->>'countryId'is distinct from p_country or p_command->>'officeId'is distinct from'SOCIAL'
  or p_command->>'commandType'is distinct from'CORE_SOCIAL_LABOUR_PROGRAMME_APPLY_V1'or p_command->>'idempotencyKey'is null
  or p_event->>'schemaVersion'is distinct from'social-labour-programme-applied-v1'or jsonb_typeof(p_event)is distinct from'object'or(select count(*)from jsonb_object_keys(p_event))<>6
  or p_event->'command'is distinct from(p_command-'canonicalPayload'-'fingerprint'-'payloadHash')||jsonb_build_object('payload',i)
  or jsonb_typeof(f)is distinct from'object'or(select count(*)from jsonb_object_keys(f))<>10
  or f->>'worldId'is distinct from p_world or f->>'countryId'is distinct from p_country
  or f->>'sourceRef'is distinct from original.source_id or f->>'sourceFingerprint'is distinct from original.source_payload_hash
  or f->'sourceRevocations'is distinct from'[]'::jsonb or f->>'localCurrency'is distinct from s->'minimumWage'->>'currency'
  or f->'populationAvailability'is distinct from s->'populationAvailability'
  or f->'head'is distinct from jsonb_build_object('worldVersion',p_command->>'expectedWorldVersion','eventSequence',(p_sequence-1)::text)
  or f->>'simTime'is distinct from p_command->>'simTime'
  or f->'boundary'is distinct from jsonb_build_object('kind','E01_DAILY_BOUNDARY','dayIndex',trunc((p_command->>'simTime')::numeric/86400000)::text)
  or jsonb_typeof(i)is distinct from'object'or(select count(*)from jsonb_object_keys(i))<>5
  or exists(select 1 from jsonb_each(i)x where x.key<>'applicant'and jsonb_typeof(x.value)<>'string')
  or i->>'schemaVersion'is distinct from'social-labour-programme-apply-v1'
  or coalesce(i->>'programmeId','')!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'
  or coalesce(i->>'applicationId','')!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'
  or coalesce(i->>'programmeCommandFingerprint','')!~'^sha256:[0-9a-f]{64}$'
  or jsonb_typeof(g)is distinct from'object'or(select count(*)from jsonb_object_keys(g))<>3
  or exists(select 1 from jsonb_each(g)x where x.key not in('locationId','skill','status')or jsonb_typeof(x.value)<>'string')
  or coalesce(g->>'locationId','')!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'
  or coalesce(g->>'skill','')not in('LOW','MEDIUM','HIGH')
  or coalesce(g->>'status','')not in('EMPLOYED','UNEMPLOYED_SEARCHING','NOT_IN_LABOUR_FORCE','STUDENT')
  or coalesce(p_event->>'beforeStateHash','')!~'^sha256:[0-9a-f]{64}$'or coalesce(p_event->>'afterStateHash','')!~'^sha256:[0-9a-f]{64}$'
  or jsonb_typeof(p_event->'result'->'personCount')is distinct from'string'or coalesce(p_event->'result'->>'personCount','')!~'^[1-9][0-9]*$'
 then return false;end if;
 select count(*),min(p->>'workingAgeAvailable')into n,available from jsonb_array_elements(s->'populationAvailability')p where p->>'countryId'=p_country and p->>'locationId'=g->>'locationId';
 if n<>1 or coalesce(available,'')!~'^(0|[1-9][0-9]*)$'or(p_event->'result'->>'personCount')::numeric>available::numeric then return false;end if;
 select count(*)into n from world_v2.command_submission c join world_v2.authoritative_event e on e.world_id=c.world_id and e.causation_command_id=c.command_id join world_v2.command_receipt r on r.world_id=c.world_id and r.command_id=c.command_id
 where c.world_id=p_world and c.country_id=p_country and c.office_id='SOCIAL'and c.command_type='CORE_SOCIAL_LABOUR_PROGRAMME_CREATE_V1'
 and c.command_fingerprint=i->>'programmeCommandFingerprint'and c.canonical_payload::jsonb->>'programmeId'=i->>'programmeId'
 and c.sim_time<=(p_command->>'simTime')::bigint and e.event_type='SOCIAL_LABOUR_PROGRAMME_CREATED_V1'and e.event_sequence<p_sequence
 and r.outcome='COMMITTED'and r.command_fingerprint=c.command_fingerprint and r.event_ids=jsonb_build_array(e.event_id)and r.world_version_after=e.world_version;
 if n<>1 then return false;end if;
 if exists(select 1 from world_v2.command_submission c join world_v2.authoritative_event e on e.world_id=c.world_id and e.causation_command_id=c.command_id join world_v2.command_receipt r on r.world_id=c.world_id and r.command_id=c.command_id
  where c.world_id=p_world and c.country_id=p_country and c.command_type='CORE_SOCIAL_LABOUR_PROGRAMME_APPLY_V1'and e.event_type='SOCIAL_LABOUR_PROGRAMME_APPLIED_V1'and e.event_sequence<p_sequence and r.outcome='COMMITTED'
  and(c.canonical_payload::jsonb->>'applicationId'=i->>'applicationId'or(c.canonical_payload::jsonb->>'programmeId'=i->>'programmeId'and c.canonical_payload::jsonb->'applicant'=g)))then return false;end if;
 expected:=jsonb_build_object('programmeId',i->>'programmeId','applicationId',i->>'applicationId','personCount',p_event->'result'->>'personCount','status','APPLIED','classification','APPLICATION_ONLY_NOT_ELIGIBILITY_APPROVAL_FUNDING_OR_SERVICE');
 return p_event->'result'=expected;
exception when invalid_text_representation or numeric_value_out_of_range or no_data_found then return false;
end;$$;
alter function world_v2.postwar_social_application_effect_scoped(text,text,jsonb,jsonb,bigint)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.postwar_social_application_effect_scoped(text,text,jsonb,jsonb,bigint)from public;
grant execute on function world_v2.postwar_social_application_effect_scoped(text,text,jsonb,jsonb,bigint)to world_v2_social_source_owner,world_v2_finance_budget_source_owner;
create function world_v2.postwar_social_application_contract_version()returns text language sql stable set search_path=pg_catalog as $$select 'postwar-social-labour-application-v1'::text$$;
alter function world_v2.postwar_social_application_contract_version()owner to world_v2_social_source_owner;
revoke all on function world_v2.postwar_social_application_contract_version()from public;
grant execute on function world_v2.postwar_social_application_contract_version()to world_v2_social_source_reader;
create or replace function world_v2.postwar_social_prefix_effect_scoped(p_world text,p_country text,p_type text,p_command jsonb,p_event jsonb,p_sequence bigint)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare s jsonb;facts jsonb;intent jsonb;wage jsonb;fund jsonb;offer jsonb;original_offer jsonb;plan jsonb;position_id text;pool_id text;location_id text;begin
 select x.scope_document::jsonb into s from world_v2.postwar_social_prefix_scope x where x.world_id=p_world and x.country_id=p_country;
 if not found or p_event->'command'->>'countryId'is distinct from p_country then return false;end if;
 facts:=p_event->'readFacts';intent:=(p_command->>'canonicalPayload')::jsonb;
 if p_type='SOCIAL_LABOUR_PROGRAMME_APPLIED_V1'then return world_v2.postwar_social_application_effect_scoped(p_world,p_country,p_command,p_event,p_sequence);end if;
 if p_type='SOCIAL_LABOUR_PROGRAMME_CREATED_V1'then return world_v2.postwar_social_programme_effect_scoped(p_world,p_country,p_command,p_event,p_sequence);end if;
 if p_type='SOCIAL_EMPLOYMENT_SERVICE_CREATED_V1'then
  if to_regprocedure('world_v2.postwar_social_employment_creation_effect_scoped(text,text,jsonb,jsonb,bigint)')is null then return false;end if;
  return world_v2.postwar_social_employment_creation_effect_scoped(p_world,p_country,p_command,p_event,p_sequence);
 end if;
 if p_type='SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1'then
  if p_event->>'schemaVersion'is distinct from 'social-employment-position-offer-event-v1'or p_command->>'commandType'is distinct from 'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1'or p_command->>'officeId'is distinct from 'SOCIAL'then return false;end if;
  select x into wage from jsonb_array_elements(s->'wages')x where x->>'positionId'=facts->'wageSchedule'->>'scheduleId';
  select x into fund from jsonb_array_elements(s->'funding')x where x->>'accountRef'=facts->'funding'->>'accountId'and x->>'payerRole'='GOV';
  if wage is null or fund is null or wage->>'employerRole'<>'GOV'or wage->>'owner'<>'PUBLIC_SERVICE'
   or wage->>'countryId'<>p_country or fund->>'countryId'<>p_country
   or facts->>'governmentEntityId'is distinct from fund->>'payerEntityId'or facts->>'centralBankEntityId'is distinct from fund->>'issuerEntityId'
   or wage->>'employerId'is distinct from fund->>'payerEntityId'
   or facts->'funding'->>'countryId'is distinct from p_country or facts->'funding'->>'ownerId'is distinct from fund->>'payerEntityId'or facts->'funding'->>'currency'is distinct from fund->>'currency'
   or intent->>'fundingAccountId'is distinct from fund->>'accountRef'or intent->>'wageScheduleRef'is distinct from wage->>'positionId'
   or intent->>'locationId'is distinct from wage->>'locationId'or intent->>'skill'is distinct from wage->>'skill'or intent->>'publicService'is distinct from wage->>'classificationId'or intent->>'occupation'is distinct from wage->>'occupation'
   or facts->'employment'->'populationAvailability'is distinct from s->'populationAvailability'or facts->'employment'->'minimumWage'is distinct from s->'minimumWage'
   or facts->'wageSchedule'->>'countryId'is distinct from p_country or facts->'wageSchedule'->>'currency'is distinct from wage->>'wageCurrency'or facts->'wageSchedule'->>'period'is distinct from wage->>'wagePeriod'or facts->'wageSchedule'->>'wageVersion'is distinct from wage->>'wageVersion'
   or (facts->'wageSchedule'->>'amount')::numeric is distinct from (wage->>'wageAmount')::numeric then return false;end if;
  offer:=p_event->'offer';
  if offer->>'positionId'is distinct from intent->>'positionId'or offer->>'countryId'is distinct from p_country or offer->>'locationId'is distinct from intent->>'locationId'or offer->>'employerId'is distinct from fund->>'payerEntityId'
   or p_event->'reservation'->>'positionId'is distinct from intent->>'positionId'or p_event->'reservation'->>'accountId'is distinct from fund->>'accountRef'or p_event->'reservation'->>'countryId'is distinct from p_country or p_event->'reservation'->>'employerId'is distinct from fund->>'payerEntityId'or p_event->'reservation'->>'currency'is distinct from fund->>'currency'
   or p_event->'reservation'->>'state'is distinct from 'RESERVED_NOT_PAID'or offer->>'payrollFundingRef'is distinct from p_event->'reservation'->>'reservationId'then return false;end if;
  position_id:=intent->>'positionId';
  -- New IDs cannot alias another country's original or committed position.
  if exists(select 1 from world_v2.postwar_social_prefix_scope x cross join lateral jsonb_array_elements(x.scope_document::jsonb->'positions')p where x.world_id=p_world and x.country_id<>p_country and p->>'positionId'=position_id)
   or exists(select 1 from world_v2.authoritative_event e join world_v2.command_submission c on c.world_id=e.world_id and c.command_id=e.causation_command_id where e.world_id=p_world and c.country_id<>p_country and e.event_type='SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1'and(e.canonical_payload::jsonb)->'offer'->>'positionId'=position_id)then return false;end if;
  return true;
 end if;
 if p_type not in('SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1','SOCIAL_JOB_MATCH_SETTLED_V1')or p_event->>'schemaVersion'is distinct from 'social-employment-service-event-v1'then return false;end if;
 if p_type='SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1'then
  if p_command->>'commandType'is distinct from 'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1'or p_command->>'officeId'is distinct from 'SOCIAL'then return false;end if;
 else
  if p_command->>'commandType'is distinct from 'CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1'or p_command->>'officeId'is not null then return false;end if;
  select c.canonical_payload::jsonb into plan from world_v2.command_submission c join world_v2.authoritative_event e on e.world_id=c.world_id and e.causation_command_id=c.command_id where c.world_id=p_world and c.command_id=intent->>'planCommandId'and c.country_id=p_country and c.command_type='CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1'and e.event_type='SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1'and e.event_sequence<p_sequence;
  if not found then return false;end if;intent:=plan;
 end if;
 position_id:=intent->>'positionId';pool_id:=intent->>'servicePoolId';location_id:=intent->>'locationId';offer:=facts->'offer';
 if facts->'populationAvailability'is distinct from s->'populationAvailability'or facts->'minimumWage'is distinct from s->'minimumWage'
 or offer->>'countryId'is distinct from p_country or offer->>'positionId'is distinct from position_id or offer->>'locationId'is distinct from location_id
 then return false;end if;
 if not exists(select 1 from jsonb_array_elements(s->'servicePools')p where p->>'poolId'=pool_id and p->>'countryId'=p_country and p->>'locationId'=location_id and p->>'skill'=intent->>'skill')then
  if to_regprocedure('world_v2.postwar_social_created_pool(text,text,text,bigint)')is null then return false;end if;
  original_offer:=world_v2.postwar_social_created_pool(p_world,p_country,pool_id,p_sequence);
  if original_offer is null or original_offer->>'countryId'is distinct from p_country or original_offer->>'locationId'is distinct from location_id or original_offer->>'skill'is distinct from intent->>'skill'then return false;end if;
 end if;

 select x into original_offer from jsonb_array_elements(s->'offers')x where x->>'positionId'=position_id;
 if original_offer is null then
  select (e.canonical_payload::jsonb)->'offer'into original_offer from world_v2.authoritative_event e join world_v2.command_submission c on c.world_id=e.world_id and c.command_id=e.causation_command_id where e.world_id=p_world and c.country_id=p_country and e.event_type='SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1'and e.event_sequence<p_sequence and(e.canonical_payload::jsonb)->'offer'->>'positionId'=position_id;
 end if;
 return original_offer is not null and original_offer=offer;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end;$$;

create or replace function world_v2.postwar_social_origin_at_prefix(p_world text,p_country text)
returns table(state jsonb,binding jsonb,origin_world_version bigint,origin_event_sequence bigint)
language plpgsql security definer set search_path=pg_catalog as $$
declare e record;m record;ep jsonb;st jsonb;key text;begin
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select e0.* into e from world_v2.authoritative_event e0 join world_v2.command_submission c on c.world_id=e0.world_id and c.command_id=e0.causation_command_id where e0.world_id=p_world and c.country_id=p_country and e0.event_type in('SOCIAL_LABOUR_PROGRAMME_APPLIED_V1','SOCIAL_LABOUR_PROGRAMME_CREATED_V1','SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1','SOCIAL_EMPLOYMENT_SERVICE_CREATED_V1','SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1','SOCIAL_JOB_MATCH_SETTLED_V1')order by e0.event_sequence desc limit 1;
 if not found or octet_length(e.canonical_payload)>1048576 then return;end if;
 key:=case when e.event_type='SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1'then'SOCIAL_POSITION_LIFECYCLE_'else'SOCIAL_EMPLOYMENT_SERVICE_'end||p_country;
 select * into m from world_v2.current_materialization x where x.world_id=p_world and x.materialization_key=key;
 if not found or m.world_version<>e.world_version or m.source_command_id<>e.causation_command_id or octet_length(m.canonical_payload)>1048576 then return;end if;
 ep:=e.canonical_payload::jsonb;st:=m.canonical_payload::jsonb;
 if m.canonical_payload<>world_v2.canonical_json(st)or m.payload_sha256 is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||m.canonical_payload,'UTF8')),'hex')or ep->>'afterStateHash'is distinct from m.payload_sha256 then return;end if;
 if e.event_type='SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1'then
  if st->>'schemaVersion'is distinct from 'social-employment-position-lifecycle-v1'then return;end if;st:=st->'employment';
 end if;
 if st->>'schemaVersion'is distinct from 'social-employment-service-state-v1'or st->>'worldId'is distinct from p_world or jsonb_typeof(st->'labour'->'positions')is distinct from 'array'or jsonb_typeof(st->'labour'->'aggregates')is distinct from 'array'or jsonb_typeof(st->'servicePools')is distinct from 'array'or jsonb_typeof(st->'labour'->'wageAssertions')is distinct from 'array'then return;end if;
 if exists(select 1 from jsonb_array_elements((st->'labour'->'positions')||(st->'labour'->'aggregates')||(st->'servicePools'))x where x->>'countryId'is distinct from p_country)
 or exists(select 1 from jsonb_array_elements(st->'labour'->'wageAssertions')x where not exists(select 1 from jsonb_array_elements(st->'labour'->'positions')p where p->>'positionId'=x->>'positionId'))then return;end if;
 return query select st,jsonb_build_object('sourceCommandId',e.causation_command_id,'commandFingerprint',c.command_fingerprint,'sourceEventId',e.event_id,'eventFingerprint',e.event_fingerprint,'materializationKey',key,'materializationHash',m.payload_sha256,'canonicalMaterializationSha256',encode(sha256(convert_to(m.canonical_payload,'UTF8')),'hex'),'sourceStateWorldVersion',m.world_version::text,'sourceEventSequence',e.event_sequence::text),e.world_version,e.event_sequence from world_v2.command_submission c join world_v2.command_receipt r on r.world_id=c.world_id and r.command_id=c.command_id where c.world_id=p_world and c.command_id=e.causation_command_id and c.country_id=p_country and r.outcome='COMMITTED'and r.world_version_after=e.world_version and r.event_ids=jsonb_build_array(e.event_id)and r.command_fingerprint=c.command_fingerprint;
exception when invalid_text_representation then return;
end;$$;

create or replace function world_v2.postwar_apply_current_frame_page(p_world text,p_frames_text text,p_state jsonb)returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare wanted jsonb;last_event_id text;last_event_fingerprint text;inv record;inventory jsonb;inventory_count bigint;inventory_total bigint;total_inventory bigint:=0;omos jsonb:='{}';rents jsonb:='{}';body jsonb;br record;batches jsonb;all_batches jsonb:='[]';total_batches bigint:=0;total_legs bigint:=0;actual_batch_count bigint;h record;a record;r record;c record;e record;command jsonb;event jsonb;events jsonb;transition jsonb;receipt jsonb;ep jsonb;first_body jsonb;frames jsonb:='[]';meta jsonb:='[]';wv bigint:=0;seq bigint:=0;bytes bigint:=0;seed_fp text;intent jsonb;policy jsonb;binding jsonb;before_state jsonb;after_state jsonb;env jsonb;next_env jsonb;envelopes jsonb:='[]';captains jsonb:='{}';fund jsonb;event_index integer;expected_type text;expected_count integer;utility boolean;utility_action text;expected_inventory integer;amount numeric;line_total numeric;
begin

 perform set_config('econmind.postwar_projection_world',p_world,true);
 if octet_length(p_frames_text)>1048576 or jsonb_typeof(p_frames_text::jsonb)<>'array'or jsonb_array_length(p_frames_text::jsonb)>256 then raise exception 'PAGED_COMPLETE_BOUNDED_FRAME_PAGE_REQUIRED'using errcode='54000';end if;
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 select * into strict h from world_v2.world_head wh where wh.world_id=p_world;
 wv:=(p_state->>'worldVersion')::bigint;seq:=(p_state->>'eventSequence')::bigint;envelopes:=p_state->'envelopes';captains:=p_state->'captains';omos:=p_state->'omos';rents:=p_state->'rents';
 select coalesce(sum(jsonb_array_length(x->'inventoryPostings')),0)into inventory_total from jsonb_array_elements(p_frames_text::jsonb)x;
 for wanted in select x from jsonb_array_elements(p_frames_text::jsonb)x loop
  select * into strict r from world_v2.command_receipt x where x.world_id=p_world and x.command_id=wanted->'command'->>'commandId'and x.outcome='COMMITTED';
  select * into strict c from world_v2.command_submission x where x.world_id=p_world and x.command_id=r.command_id;
  if r.schema_version<>'command-receipt-v2'or r.reason_code is not null or r.world_version_before<>wv or r.world_version_after<>wv+1 or c.expected_world_version is distinct from wv or r.transition_id<>c.command_id or r.command_fingerprint<>c.command_fingerprint or r.sim_time<>c.sim_time or r.idempotency_key is distinct from c.idempotency_key then raise exception 'FINANCIAL_PREFIX_RECEIPT_GAP'using errcode='55000';end if;
  command:=jsonb_build_object('actorId',c.actor_id,'authSubject',c.auth_subject::text,'commandId',c.command_id,'commandType',c.command_type,'correlationId',c.correlation_id,'countryId',c.country_id,'expectedWorldVersion',c.expected_world_version::text,'idempotencyKey',c.idempotency_key,'officeId',c.office_id,'canonicalPayload',c.canonical_payload,'schemaVersion',c.schema_version,'simTime',c.sim_time::text,'submittedAtReal',to_char(c.submitted_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'worldId',p_world,'fingerprint',c.command_fingerprint,'payloadHash',c.payload_sha256);
  intent:=c.canonical_payload::jsonb;
  if c.schema_version<>'command-v1'or c.canonical_payload<>world_v2.canonical_json(intent)or c.command_fingerprint is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(command-'fingerprint'-'payloadHash'-'correlationId'-'submittedAtReal'),'UTF8')),'hex')or c.payload_sha256 is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||c.canonical_payload,'UTF8')),'hex')then raise exception 'FINANCIAL_CANONICAL_COMMAND_INVALID'using errcode='23514';end if;
  utility:=c.command_type in('INDUSTRY_FIRST_DAY_POWER_EXECUTE_V1','INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1','INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTE_V1');
  utility_action:=intent->'operation'->>'action';
  expected_count:=case when utility and utility_action='DELIVER'then 2 else 1 end;
  if c.command_type='CORE_FINANCE_BUDGET_APPROPRIATION_V1'then
   if c.office_id is distinct from 'FINANCE'or intent->>'operation'not in('SET_ENVELOPE','APPROVE_NEW_LINE')or intent->'scope'->>'worldId'is distinct from p_world or intent->'scope'->>'countryId'is distinct from c.country_id then raise exception 'FINANCIAL_BUDGET_SCOPE_INVALID'using errcode='23514';end if;
   expected_count:=case when intent->>'operation'='SET_ENVELOPE'then 1 else 3 end;
   select x into strict fund from world_v2.postwar_social_prefix_scope s cross join lateral jsonb_array_elements(s.scope_document::jsonb->'funding')x where s.world_id=p_world and s.country_id=c.country_id and x->>'payerRole'='GOV';
   if intent->'scope'->>'entityRef'is distinct from fund->>'payerEntityId'or intent->>'currency'is distinct from fund->>'currency'then raise exception 'FINANCIAL_BUDGET_TREASURY_OWNER_INVALID'using errcode='23514';end if;
   amount:=(intent->>'amount')::numeric;if amount<0 then raise exception 'FINANCIAL_NEGATIVE_CAPACITY'using errcode='23514';end if;
   before_state:=jsonb_build_object('worldId',p_world,'worldVersion',wv::text,'eventSequence',seq::text,'envelopes',envelopes);
   select x into env from jsonb_array_elements(envelopes)x where x->'scope'->>'envelopeRef'=intent->'scope'->>'envelopeRef';
   if exists(select 1 from jsonb_array_elements(envelopes)x where x->>'revisionRef'=intent->>'revisionRef'or exists(select 1 from jsonb_array_elements(x->'lines')l where l->>'revisionRef'=intent->>'revisionRef'))then raise exception 'FINANCIAL_BUDGET_REVISION_DUPLICATE'using errcode='23514';end if;
   if intent->>'operation'='SET_ENVELOPE'then
    if env is not null then raise exception 'FINANCIAL_ENVELOPE_DUPLICATE'using errcode='23514';end if;
    envelopes:=envelopes||jsonb_build_array(jsonb_build_object('scope',intent->'scope','currency',intent->>'currency','revisionRef',intent->>'revisionRef','cap',intent->>'amount','lines','[]'::jsonb));
   else
    if env is null or env->'scope'is distinct from intent->'scope'or env->>'currency'is distinct from intent->>'currency'or env->>'revisionRef'is distinct from intent->>'envelopeRevisionRef'or intent->>'lineRef'is null then raise exception 'FINANCIAL_EXACT_BUDGET_ENVELOPE_REQUIRED'using errcode='23514';end if;
    if exists(select 1 from jsonb_array_elements(envelopes)x cross join lateral jsonb_array_elements(x->'lines')l where l->>'lineRef'=intent->>'lineRef')then raise exception 'FINANCIAL_LINE_DUPLICATE'using errcode='23514';end if;
    select coalesce(sum((l->>'appropriation')::numeric),0)+amount into line_total from jsonb_array_elements(env->'lines')l;
    if line_total>(env->>'cap')::numeric then raise exception 'FINANCIAL_ENVELOPE_EXCEEDED'using errcode='23514';end if;
    next_env:=jsonb_set(env,'{lines}',env->'lines'||jsonb_build_array(jsonb_build_object('lineRef',intent->>'lineRef','revisionRef',intent->>'revisionRef','appropriation',intent->>'amount','paid','0','outstandingCommitments','0','reserved','0')));
    select jsonb_agg(case when x->'scope'->>'envelopeRef'=intent->'scope'->>'envelopeRef'then next_env else x end order by n)into envelopes from jsonb_array_elements(envelopes)with ordinality q(x,n);
   end if;
   after_state:=jsonb_build_object('worldId',p_world,'worldVersion',r.world_version_after::text,'eventSequence',(seq+expected_count)::text,'envelopes',envelopes);
  elsif not utility and c.command_type not in('CORE_INDUSTRY_OPERATING_WAGE_PAY_V1','CORE_INDUSTRY_UTILISATION_TARGET_SET_V1','CORE_INDUSTRY_RUN_SCHEDULE_V1','CORE_INDUSTRY_FIRST_DAY_WORK_V1','POSTWAR_BENEFICIAL_HOUSING_RENT_V1','CORE_CENTRAL_BANK_OMO_V1','CORE_GOODS_TRANSFER_V1','CORE_GOODS_SHIPMENT_V1','CORE_GOODS_DELIVERY_V1','CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1','POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1','CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1','CORE_SOCIAL_LABOUR_PROGRAMME_APPLY_V1','CORE_SOCIAL_LABOUR_PROGRAMME_CREATE_V1','CORE_SOCIAL_EMPLOYMENT_SERVICE_CREATE_V1','CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1','CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1')then raise exception 'FINANCIAL_UNKNOWN_DOMAIN_UNAVAILABLE'using errcode='55000';end if;
  if jsonb_array_length(r.event_ids)<>expected_count then raise exception 'FINANCIAL_COMPLETE_EVENT_GROUP_REQUIRED'using errcode='55000';end if;
  events:='[]';first_body:=null;event_index:=0;
  for e in select x.* from world_v2.authoritative_event x join jsonb_array_elements_text(r.event_ids)with ordinality ids(id,n)on x.event_id=ids.id where x.world_id=p_world order by ids.n loop
   bytes:=bytes+octet_length(e.canonical_payload)+octet_length(c.canonical_payload);ep:=e.canonical_payload::jsonb;
   if bytes>8388608 or e.event_sequence<>seq+event_index+1 or e.world_version<>r.world_version_after or e.causation_command_id<>c.command_id or e.sim_time<>c.sim_time or e.correlation_id<>c.correlation_id or e.corrects_event_id is not null or e.schema_version<>'event-v1'or e.canonical_payload<>world_v2.canonical_json(ep)then raise exception 'FINANCIAL_UNKNOWN_EFFECT_OR_SEQUENCE'using errcode='55000';end if;
   event:=jsonb_build_object('causationCommandId',e.causation_command_id,'correlationId',e.correlation_id,'correctsEventId',e.corrects_event_id,'eventId',e.event_id,'eventType',e.event_type,'canonicalPayload',e.canonical_payload,'schemaVersion',e.schema_version,'sequence',e.event_sequence::text,'simTime',e.sim_time::text,'worldId',p_world,'worldVersion',e.world_version::text,'fingerprint',e.event_fingerprint,'payloadHash',e.payload_sha256,'recordedAtReal',to_char(e.recorded_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
   if e.payload_sha256 is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||e.canonical_payload,'UTF8')),'hex')or e.event_fingerprint is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(event-'fingerprint'-'payloadHash'-'recordedAtReal'),'UTF8')),'hex')then raise exception 'FINANCIAL_EVENT_HASH_INVALID'using errcode='23514';end if;
   if c.command_type='CORE_FINANCE_BUDGET_APPROPRIATION_V1'then
    expected_type:=case when expected_count=1 then'FINANCE_NATIVE_BUDGET_ENVELOPE_SET_V1'when event_index=0 then'FINANCE_NATIVE_BUDGET_LINE_CREATED_V1'when event_index=1 then'FINANCE_NATIVE_BUDGET_APPROPRIATED_V1'else'FINANCE_NATIVE_BUDGET_LINE_INITIALIZED_V1'end;
    policy:=ep->'policy';binding:=ep->'binding';
    if event_index=0 then first_body:=ep;end if;
    if e.event_type<>expected_type or ep->>'schemaVersion'is distinct from 'finance-native-budget-event-v1'or ep->>'commandFingerprint'is distinct from c.command_fingerprint or ep->'payload'is distinct from intent or ep->>'intentIndex'is distinct from event_index::text or ep->>'intentCount'is distinct from expected_count::text or(ep-'intentIndex')is distinct from(first_body-'intentIndex')or ep->>'stateBeforeHash'is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(before_state),'UTF8')),'hex')or ep->>'stateAfterHash'is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(after_state),'UTF8')),'hex')or binding->>'seedRef'is distinct from a.seed_id or binding->>'seedFingerprint'is distinct from a.seed_fingerprint or binding->>'admissionRef'is distinct from a.admission_ref or binding->>'financialSourceId'is distinct from(select d.source_pointer->>'financialSourceId'from world_v2.postwar_office_projection_document d where d.world_id=p_world and d.country_id=c.country_id and d.office_id='FINANCE'and d.dataset='opening-financial-legs') or binding->>'treasuryAccountId'is distinct from fund->>'accountRef'or binding->>'treasuryClaimId'is distinct from fund->>'claimId'or policy->>'worldId'is distinct from p_world or policy->>'countryId'is distinct from c.country_id or policy->>'governmentEntityId'is distinct from fund->>'payerEntityId'or policy->>'currency'is distinct from fund->>'currency'or policy->>'envelopeRef'is distinct from intent->'scope'->>'envelopeRef'or policy->>'effectivePeriodRef'is distinct from intent->'scope'->>'effectivePeriodRef'or policy->>'schemaVersion'is distinct from 'finance-native-budget-policy-v1'or policy->>'requestingOfficeId'is distinct from 'FINANCE'or policy->>'programmeOwnerOfficeId'is distinct from 'FINANCE'or policy->>'classification'is distinct from 'ORDINARY_DEPARTMENTAL'or policy->>'funding'is distinct from 'FULL_UNCONDITIONAL'or policy->'requiredApprovalOffices'is distinct from '["FINANCE"]'::jsonb or c.sim_time<(policy->>'validFromSimTime')::bigint or c.sim_time>=(policy->>'validUntilSimTime')::bigint or policy->>'ruleRef'is distinct from 'FINANCE_ORDINARY_SELF_ADMINISTRATION_FULL_V1'or binding->>'policyHash'is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(policy),'UTF8')),'hex')then raise exception 'FINANCIAL_BUDGET_CORE_EFFECT_MISMATCH'using errcode='23514';end if;
   elsif utility then
    expected_type:=case when event_index=1 then'POSTWAR_INDUSTRY_OPERATING_FACT_RECORDED_V1'when c.command_type='INDUSTRY_FIRST_DAY_POWER_EXECUTE_V1'then'INDUSTRY_FIRST_DAY_POWER_EXECUTED_V1'when c.command_type='INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1'then'INDUSTRY_FIRST_DAY_WATER_EXECUTED_V1'else'INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTED_V1'end;
    if e.event_type is distinct from expected_type then raise exception 'INDUSTRY_UTILITY_EXACT_EVENT_GROUP_REQUIRED'using errcode='23514';end if;
   elsif c.command_type='CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1'then
    captains:=jsonb_set(captains,array[c.country_id],world_v2.postwar_mixed_captain_group(p_world,command,event,captains->c.country_id));
   elsif c.command_type='POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'then
    if c.office_id is distinct from 'FINANCE'or e.event_type<>'POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_V1'then raise exception 'MIXED_FX_EXACT_FAMILY_REQUIRED'using errcode='23514';end if;
   elsif c.command_type='CORE_INDUSTRY_OPERATING_WAGE_PAY_V1'then
    if e.event_type is distinct from'INDUSTRY_OPERATING_WAGE_PAID_V1'then raise exception 'INDUSTRY_CURRENT_EXACT_WAGE_EVENT_REQUIRED'using errcode='23514';end if;
   elsif c.command_type in('CORE_INDUSTRY_UTILISATION_TARGET_SET_V1','CORE_INDUSTRY_RUN_SCHEDULE_V1','CORE_INDUSTRY_FIRST_DAY_WORK_V1')then
    expected_type:=case c.command_type when'CORE_INDUSTRY_UTILISATION_TARGET_SET_V1'then'INDUSTRY_UTILISATION_TARGET_SET_V1'when'CORE_INDUSTRY_RUN_SCHEDULE_V1'then'INDUSTRY_FIRST_DAY_RUN_SCHEDULED_V1'else'INDUSTRY_FIRST_DAY_WORK_COMPLETED_V1'end;
    if e.event_type is distinct from expected_type then raise exception 'INDUSTRY_CURRENT_EXACT_EVENT_FAMILY_REQUIRED'using errcode='23514';end if;
   elsif c.command_type in('POSTWAR_BENEFICIAL_HOUSING_RENT_V1','CORE_CENTRAL_BANK_OMO_V1','CORE_GOODS_TRANSFER_V1','CORE_GOODS_SHIPMENT_V1','CORE_GOODS_DELIVERY_V1')then
    expected_type:=case c.command_type when'POSTWAR_BENEFICIAL_HOUSING_RENT_V1'then'POSTWAR_BENEFICIAL_HOUSING_RENT_SETTLED_V1'when'CORE_CENTRAL_BANK_OMO_V1'then'CENTRAL_BANK_OMO_SETTLED_V1'when'CORE_GOODS_TRANSFER_V1'then'NARROW_TREASURY_GCU_RESERVED_V1'when'CORE_GOODS_SHIPMENT_V1'then'NARROW_TREASURY_GCU_SHIPPED_V1'else'NARROW_TREASURY_GCU_DELIVERED_V1'end;
    if e.event_type is distinct from expected_type then raise exception 'MIXED_EXTENDED_EXACT_EVENT_FAMILY_REQUIRED'using errcode='23514';end if;
   elsif ep->'command'is distinct from(command-'canonicalPayload'-'fingerprint'-'payloadHash')||jsonb_build_object('payload',intent)or not world_v2.postwar_social_prefix_effect_scoped(p_world,c.country_id,e.event_type,command,ep,e.event_sequence)then raise exception 'FINANCIAL_SOCIAL_SCOPE_EFFECT_INVALID'using errcode='23514';end if;
   events:=events||jsonb_build_array(event);last_event_id:=e.event_id;last_event_fingerprint:=e.event_fingerprint;event_index:=event_index+1;
  end loop;
  if event_index<>expected_count then raise exception 'FINANCIAL_EVENT_ROWS_INCOMPLETE'using errcode='55000';end if;
  transition:=jsonb_build_object('schemaVersion','authoritative-transition-v1','transitionId',c.command_id,'worldId',p_world,'commandId',c.command_id,'commandFingerprint',c.command_fingerprint,'worldVersionBefore',r.world_version_before::text,'worldVersionAfter',r.world_version_after::text,'eventIds',r.event_ids,'events',events);
  receipt:=jsonb_build_object('schemaVersion',r.schema_version,'worldId',p_world,'commandId',r.command_id,'idempotencyKey',r.idempotency_key,'commandFingerprint',r.command_fingerprint,'outcome',r.outcome,'reasonCode',r.reason_code,'transitionId',r.transition_id,'worldVersionBefore',r.world_version_before::text,'worldVersionAfter',r.world_version_after::text,'simTime',r.sim_time::text,'eventIds',r.event_ids,'recordedAtReal',to_char(r.recorded_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  batches:='[]';
  select count(*)into actual_batch_count from world_v2.financial_posting_batch x where x.world_id=p_world and x.causation_command_id=c.command_id;
  if (c.command_type='INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTE_V1'and utility_action='PAY_INPUTS')or c.command_type in('CORE_INDUSTRY_OPERATING_WAGE_PAY_V1','POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1','POSTWAR_BENEFICIAL_HOUSING_RENT_V1','CORE_CENTRAL_BANK_OMO_V1','CORE_GOODS_DELIVERY_V1')then
   if c.command_type='POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'and actual_batch_count<>2 then raise exception 'MIXED_EXACT_TWO_FX_BATCHES_REQUIRED'using errcode='55000';end if;
   if c.command_type<>'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'and actual_batch_count<>1 then raise exception 'MIXED_EXTENDED_EXACT_SINGLE_BATCH_REQUIRED'using errcode='55000';end if;
   for br in select x.* from world_v2.financial_posting_batch x where x.world_id=p_world and x.causation_command_id=c.command_id order by case when x.settlement_currency='GCU'then 1 else 0 end,x.batch_id loop
    if br.world_version_before<>r.world_version_before or br.world_version_after<>r.world_version_after or br.sim_time<>r.sim_time or br.event_ids<>r.event_ids or br.transition_binding is distinct from world_v2.canonical_json(br.canonical_payload::jsonb->'transitionBinding')or br.settlement_currency is distinct from br.canonical_payload::jsonb->>'settlementCurrency'then raise exception 'MIXED_CANONICAL_BATCH_BINDING_INVALID'using errcode='23514';end if;
    bytes:=bytes+octet_length(br.canonical_payload);if bytes>8388608 then raise exception 'MIXED_COMPLETE_PREFIX_BYTES_EXCEEDED'using errcode='54000';end if;
    batches:=batches||jsonb_build_array(world_v2.postwar_mixed_current_batch(br.canonical_payload,br.batch_fingerprint,br.batch_id));total_batches:=total_batches+1;total_legs:=total_legs+jsonb_array_length(br.canonical_payload::jsonb->'legs');
   end loop;
   if c.command_type='POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'and not world_v2.postwar_mixed_fx_group(p_world,command,transition,events->0,batches,envelopes)then raise exception 'MIXED_EXACT_FX_EFFECTS_INVALID'using errcode='23514';end if;
  elsif actual_batch_count<>0 then raise exception 'MIXED_FINANCIAL_EFFECT_OUTSIDE_FX'using errcode='55000';end if;
  inventory:='[]';inventory_count:=0;
  expected_inventory:=case when c.command_type in('CORE_GOODS_TRANSFER_V1','CORE_GOODS_SHIPMENT_V1','CORE_GOODS_DELIVERY_V1')or(c.command_type='INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTE_V1'and utility_action in('BOOK','SHIP','DELIVER'))then 1 else 0 end;
  if inventory_total>0 or utility then
   select count(*)into inventory_count from world_v2.inventory_posting x where x.world_id=p_world and x.causation_command_id=c.command_id;
   if inventory_count<>expected_inventory then raise exception 'MIXED_EXACT_INVENTORY_GROUP_REQUIRED'using errcode='23514';end if;
   for inv in select * from world_v2.inventory_posting x where x.world_id=p_world and x.causation_command_id=c.command_id order by x.posting_id loop
    if octet_length(inv.canonical_payload)>65536 then raise exception 'MIXED_INVENTORY_ROW_BOUNDED'using errcode='54000';end if;body:=inv.canonical_payload::jsonb;
    if body?'fingerprint'or inv.canonical_payload is distinct from world_v2.canonical_json(body)or body->>'postingId'is distinct from inv.posting_id or inv.posting_fingerprint is distinct from'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||inv.canonical_payload,'UTF8')),'hex')or inv.world_version_before<>r.world_version_before or inv.world_version_after<>r.world_version_after or inv.sim_time<>r.sim_time or inv.event_ids<>r.event_ids or inv.operation is distinct from body->>'operation'or inv.transition_binding is distinct from world_v2.canonical_json(body->'transitionBinding')then raise exception 'MIXED_EXACT_CANONICAL_INVENTORY_REQUIRED'using errcode='23514';end if;
    bytes:=bytes+octet_length(inv.canonical_payload);if bytes>8388608 then raise exception 'MIXED_COMPLETE_PREFIX_BYTES_EXCEEDED'using errcode='54000';end if;
    inventory:=inventory||jsonb_build_array(body||jsonb_build_object('fingerprint',inv.posting_fingerprint));total_inventory:=total_inventory+1;
   end loop;
  end if;
  if c.command_type='CORE_CENTRAL_BANK_OMO_V1'then
   if to_regprocedure('world_v2.postwar_mixed_omo_group(text,jsonb,jsonb,jsonb,jsonb,jsonb)')is null then raise exception 'MIXED_OMO_EFFECTS_EXTENSION_REQUIRED'using errcode='55000';end if;
   omos:=jsonb_set(omos,array[c.country_id],world_v2.postwar_mixed_omo_group(p_world,command,transition,events->0,batches,omos->c.country_id));
  elsif c.command_type in('CORE_GOODS_TRANSFER_V1','CORE_GOODS_SHIPMENT_V1','CORE_GOODS_DELIVERY_V1')then
   if to_regprocedure('world_v2.postwar_mixed_goods_group(text,jsonb,jsonb,jsonb,jsonb,jsonb)')is null then raise exception 'MIXED_GOODS_EFFECTS_EXTENSION_REQUIRED'using errcode='55000';end if;
   perform world_v2.postwar_mixed_goods_group(p_world,command,transition,events->0,batches,inventory);
  end if;
  if c.command_type='POSTWAR_BENEFICIAL_HOUSING_RENT_V1'then
   if to_regprocedure('world_v2.postwar_mixed_beneficial_rent_group(text,jsonb,jsonb,jsonb,jsonb,jsonb)')is null then raise exception 'MIXED_RENT_EFFECTS_EXTENSION_REQUIRED'using errcode='55000';end if;
   rents:=jsonb_set(rents,array[c.country_id],coalesce(rents->c.country_id,'{}'::jsonb)||jsonb_build_object(intent->>'leaseId',world_v2.postwar_paged_beneficial_rent_group(p_world,command,transition,events->0,batches,coalesce((rents->c.country_id->>(intent->>'leaseId'))::numeric,0))::text),true);
  end if;
  if c.command_type in('CORE_INDUSTRY_UTILISATION_TARGET_SET_V1','CORE_INDUSTRY_RUN_SCHEDULE_V1','CORE_INDUSTRY_FIRST_DAY_WORK_V1')then
   perform world_v2.postwar_mixed_industry_work_group(p_world,command,transition,events->0,batches,inventory);
  end if;
  if c.command_type='CORE_INDUSTRY_OPERATING_WAGE_PAY_V1'then perform world_v2.postwar_mixed_industry_wage_group(p_world,command,transition,events->0,batches,inventory);end if;
  if utility then
   if to_regprocedure('world_v2.postwar_mixed_industry_utility_group(text,jsonb,jsonb,jsonb,jsonb,jsonb)')is null then raise exception 'INDUSTRY_UTILITY_EFFECTS_EXTENSION_REQUIRED'using errcode='55000';end if;
   perform world_v2.postwar_mixed_industry_utility_group(p_world,command,transition,events,batches,inventory);
  end if;
  all_batches:=all_batches||batches;
  frames:=frames||jsonb_build_array(jsonb_build_object('command',command,'transition',transition,'financialPostingBatches',batches,'inventoryPostings',inventory,'receipt',receipt,'events',events));
  meta:=meta||jsonb_build_array(jsonb_build_object('commandId',c.command_id,'countryId',c.country_id,'commandType',c.command_type,'transitionFingerprint','sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(transition),'UTF8')),'hex'),'receiptFingerprint','sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(receipt),'UTF8')),'hex'),'eventFingerprints',(select jsonb_agg(x->'fingerprint'order by n)from jsonb_array_elements(events)with ordinality q(x,n)),'worldVersionBefore',r.world_version_before::text,'worldVersionAfter',r.world_version_after::text,'events',(select jsonb_agg(jsonb_build_object('eventId',x->>'eventId','fingerprint',x->>'fingerprint','sequence',x->>'sequence','worldVersion',x->>'worldVersion')order by n)from jsonb_array_elements(events)with ordinality q(x,n))));
  wv:=r.world_version_after;seq:=seq+expected_count;
 end loop;
 if world_v2.canonical_json(frames)is distinct from p_frames_text or total_inventory<>inventory_total then raise exception 'PAGED_ACTUAL_FRAME_AND_JOURNAL_MISMATCH'using errcode='23514';end if;
 return jsonb_build_object('state',jsonb_build_object('worldVersion',wv::text,'eventSequence',seq::text,'envelopes',envelopes,'captains',captains,'omos',omos,'rents',rents),'effects',meta,'batches',all_batches,'legCount',total_legs::text,'batchCount',total_batches::text,'lastEventId',last_event_id,'lastEventFingerprint',last_event_fingerprint);
end;$$;

create or replace function world_v2.publish_social_operating_paged_match_due(p_world text,p_country text,p_plan text,p_witness text)
returns world_v2.command_submission language plpgsql security definer set search_path=pg_catalog as $$
declare
 h world_v2.world_head%rowtype;a world_v2.runtime_opening_admission%rowtype;
 bound world_v2.social_operating_source_registration%rowtype;g world_v2.social_operating_match_publisher%rowtype;
 p world_v2.command_submission%rowtype;pr world_v2.command_receipt%rowtype;
 old world_v2.social_operating_match_publication%rowtype;v world_v2.command_submission%rowtype;
 page record;w jsonb;frames jsonb;f jsonb;c jsonb;e jsonb;b jsonb;tr jsonb;r jsonb;intent jsonb;
 expected_head jsonb;from_head jsonb;through_head jsonb;anchor jsonb;effects jsonb;batches jsonb;
 prefix text;effect_hash text;journal_hash text;coverage jsonb;last_id text;last_fp text;
 wv bigint:=0;seq bigint:=0;pages bigint:=0;frame_count bigint:=0;batch_count bigint:=0;leg_count bigint:=0;inventory_count bigint:=0;prior_sim bigint:=0;
 frame_events bigint;frame_batches bigint;frame_inventory bigint;idx bigint;expected_events bigint;expected_type text;expected_batches bigint;expected_legs bigint;
 payload jsonb;payload_text text;id text;fp text;published timestamptz;effective name;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_social_source_publisher'or pg_has_role(effective,'world_v2_social_source_owner','MEMBER')or exists(select 1 from pg_roles x where x.rolname=effective and(x.rolsuper or x.rolbypassrls or x.rolcreaterole or x.rolcreatedb or x.rolreplication))then raise exception 'SOCIAL_FIXED_SEPARATED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if current_setting('transaction_isolation')not in('repeatable read','serializable')or current_setting('transaction_read_only')<>'off'then raise exception 'PAGED_MATCH_HELD_WRITABLE_TRANSACTION_REQUIRED'using errcode='25001';end if;
 if p_world is null or p_world!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or p_country is null or p_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or p_plan is null or p_plan=''or p_witness is null or octet_length(p_witness)>65536 then raise exception 'PAGED_MATCH_EXACT_BOUNDED_SCOPE_REQUIRED'using errcode='22023';end if;
 -- Earliest live source read: an old RR snapshot must serialize against
 -- actual revocation/control/seat updates, never refresh or swallow 40001.
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 perform set_config('econmind.social_custody_world',p_world,true);
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select * into strict h from world_v2.world_head x where x.world_id=p_world for share;
 a:=world_v2.social_source_admission(p_world);
 select * into strict bound from world_v2.social_operating_source_registration x where x.world_id=p_world and x.country_id=p_country for share;
 select * into strict g from world_v2.social_operating_match_publisher x where x.world_id=p_world and x.country_id=p_country for share;
 if h.world_version<1 or h.event_sequence<h.world_version or bound.seed_fingerprint<>a.seed_fingerprint or bound.admission_ref<>a.admission_ref or g.registration_ref<>bound.registration_ref or g.admission_ref<>a.admission_ref or g.issuer_role<>'world_v2_social_source_publisher'or g.rule_version<>'SOCIAL_JOB_MATCH_RULE_V1'or g.valid_from_day<>0 or g.valid_until_day<>1 or exists(select 1 from world_v2.social_operating_source_revocation x where x.registration_ref=bound.registration_ref)or exists(select 1 from world_v2.social_operating_match_publisher_revocation x where x.grant_ref=g.grant_ref)then raise exception 'PAGED_MATCH_CURRENT_SOURCE_OR_PUBLISHER_REQUIRED'using errcode='55000';end if;
 w:=p_witness::jsonb;
 if p_witness<>world_v2.canonical_json(w)or w->>'schemaVersion'is distinct from 'postwar-paged-match-publication-v1'or w->'head'is distinct from jsonb_build_object('worldId',p_world,'worldVersion',h.world_version::text,'eventSequence',h.event_sequence::text)or w->'seedPins'is distinct from jsonb_build_object('worldId',p_world,'seedId',a.seed_id,'seedFingerprint',a.seed_fingerprint,'admissionRef',a.admission_ref)or w->'plan'->>'commandId'is distinct from p_plan then raise exception 'PAGED_MATCH_ACTUAL_HEAD_SOURCE_WITNESS_REQUIRED'using errcode='55000';end if;
 expected_head:=jsonb_build_object('worldVersion',h.world_version::text,'eventSequence',h.event_sequence::text);
 anchor:=jsonb_build_object('worldId',p_world,'seedFingerprint',a.seed_fingerprint,'expectedHead',expected_head);
 prefix:='sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(anchor||jsonb_build_object('schemaVersion','finance-social-replay-origin-v1')));
 effect_hash:='sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(anchor||jsonb_build_object('schemaVersion','postwar-effects-page-origin-v1')));
 journal_hash:='sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(anchor||jsonb_build_object('schemaVersion','postwar-financial-page-origin-v1')));
 loop
  select * into strict page from world_v2.read_postwar_social_match_prefix_page(p_world,p_country,wv,seq,h.world_version,h.event_sequence,a.seed_fingerprint,a.admission_ref);
  if page.world_id is distinct from p_world or page.host_country_id is distinct from p_country or page.world_version is distinct from h.world_version::text or page.event_sequence is distinct from h.event_sequence::text or page.seed_id is distinct from a.seed_id or page.seed_fingerprint is distinct from a.seed_fingerprint or page.admission_ref is distinct from a.admission_ref or page.from_world_version is distinct from wv::text or page.from_event_sequence is distinct from seq::text or page.through_world_version::bigint<=wv or page.through_world_version::bigint>h.world_version or page.through_event_sequence::bigint<=seq or page.through_event_sequence::bigint>h.event_sequence or octet_length(page.frames_text)>1048576 then raise exception 'PAGED_MATCH_EXACT_PROGRESSIVE_PAGE_REQUIRED'using errcode='55000';end if;
  frames:=page.frames_text::jsonb;
  if jsonb_typeof(frames)<>'array'or jsonb_array_length(frames)<>page.frame_count::bigint or jsonb_array_length(frames)<1 or jsonb_array_length(frames)>256 or page.frames_text<>world_v2.canonical_json(frames)or page.frames_sha256 is distinct from 'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||page.frames_text)then raise exception 'PAGED_MATCH_EXACT_CANONICAL_PAGE_REQUIRED'using errcode='23514';end if;
  from_head:=jsonb_build_object('worldVersion',wv::text,'eventSequence',seq::text);
  effects:='[]';batches:='[]';frame_events:=0;frame_batches:=0;frame_inventory:=0;
  for f in select value from jsonb_array_elements(frames)loop
   c:=f->'command';tr:=f->'transition';r:=f->'receipt';intent:=(c->>'canonicalPayload')::jsonb;
   if c->>'worldId'is distinct from p_world or c->>'schemaVersion'is distinct from 'command-v1'or c->>'expectedWorldVersion'is distinct from wv::text or(c->>'simTime')::bigint<prior_sim or c->>'fingerprint'is distinct from 'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(c-'fingerprint'-'payloadHash'-'correlationId'-'submittedAtReal'))or c->>'payloadHash'is distinct from 'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||(c->>'canonicalPayload'))or r->>'outcome'is distinct from 'COMMITTED'or r->>'worldVersionBefore'is distinct from wv::text or r->>'worldVersionAfter'is distinct from(wv+1)::text or r->>'commandFingerprint'is distinct from c->>'fingerprint'or r->>'reasonCode'is not null or tr->>'commandFingerprint'is distinct from c->>'fingerprint'or tr->'events'is distinct from f->'events'or tr->>'worldVersionBefore'is distinct from wv::text or tr->>'worldVersionAfter'is distinct from(wv+1)::text then raise exception 'PAGED_MATCH_CANONICAL_GROUP_OR_HASH_REQUIRED'using errcode='23514';end if;
   expected_events:=1;expected_batches:=0;expected_legs:=0;
   case c->>'commandType'
    when'CORE_FINANCE_BUDGET_APPROPRIATION_V1'then if intent->>'operation'='APPROVE_NEW_LINE'then expected_events:=3;elsif intent->>'operation'is distinct from'SET_ENVELOPE'then raise exception 'PAGED_MATCH_UNKNOWN_BUDGET_OPERATION'using errcode='55000';end if;
    when'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'then null;
    when'CORE_CENTRAL_BANK_OMO_V1'then expected_batches:=1;expected_legs:=4;
    when'POSTWAR_BENEFICIAL_HOUSING_RENT_V1'then expected_batches:=1;expected_legs:=2;
    when'CORE_GOODS_DELIVERY_V1'then expected_batches:=1;expected_legs:=2;
    when'CORE_GOODS_TRANSFER_V1'then null;
    when'CORE_GOODS_SHIPMENT_V1'then null;
    when'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1'then null;
    when'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1'then null;
    when'CORE_SOCIAL_EMPLOYMENT_SERVICE_CREATE_V1'then null;
    when'CORE_SOCIAL_LABOUR_PROGRAMME_APPLY_V1'then null;
    when'CORE_SOCIAL_LABOUR_PROGRAMME_CREATE_V1'then null;
    when'CORE_INDUSTRY_UTILISATION_TARGET_SET_V1'then null;
    when'CORE_INDUSTRY_RUN_SCHEDULE_V1'then null;
    when'CORE_INDUSTRY_FIRST_DAY_WORK_V1'then null;
    when'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1'then null;
    when'CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1'then null;
    else raise exception 'PAGED_MATCH_UNKNOWN_COMPLETE_PREFIX_FAMILY'using errcode='55000';
   end case;
   if c->>'commandType'='POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'then expected_batches:=2;expected_legs:=6;end if;
   if jsonb_array_length(f->'events')<>expected_events or jsonb_array_length(f->'financialPostingBatches')<>expected_batches or jsonb_array_length(f->'inventoryPostings')<>(case when c->>'commandType'in('CORE_GOODS_TRANSFER_V1','CORE_GOODS_SHIPMENT_V1','CORE_GOODS_DELIVERY_V1')then 1 else 0 end)then raise exception 'PAGED_MATCH_COMPLETE_EVENT_JOURNAL_FAMILY_REQUIRED'using errcode='23514';end if;
   idx:=0;
   for e in select value from jsonb_array_elements(f->'events')loop
    expected_type:=case c->>'commandType'when'CORE_FINANCE_BUDGET_APPROPRIATION_V1'then case when expected_events=1 then'FINANCE_NATIVE_BUDGET_ENVELOPE_SET_V1'when idx=0 then'FINANCE_NATIVE_BUDGET_LINE_CREATED_V1'when idx=1 then'FINANCE_NATIVE_BUDGET_APPROPRIATED_V1'else'FINANCE_NATIVE_BUDGET_LINE_INITIALIZED_V1'end when'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'then'POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_V1'when'CORE_CENTRAL_BANK_OMO_V1'then'CENTRAL_BANK_OMO_SETTLED_V1'when'POSTWAR_BENEFICIAL_HOUSING_RENT_V1'then'POSTWAR_BENEFICIAL_HOUSING_RENT_SETTLED_V1'when'CORE_GOODS_TRANSFER_V1'then'NARROW_TREASURY_GCU_RESERVED_V1'when'CORE_GOODS_SHIPMENT_V1'then'NARROW_TREASURY_GCU_SHIPPED_V1'when'CORE_GOODS_DELIVERY_V1'then'NARROW_TREASURY_GCU_DELIVERED_V1'when'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1'then'CAPTAIN_POLITICAL_CAPITAL_ALLOCATED_V1'when'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1'then'SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1'when'CORE_SOCIAL_LABOUR_PROGRAMME_APPLY_V1'then'SOCIAL_LABOUR_PROGRAMME_APPLIED_V1'when'CORE_SOCIAL_LABOUR_PROGRAMME_CREATE_V1'then'SOCIAL_LABOUR_PROGRAMME_CREATED_V1'when'CORE_INDUSTRY_UTILISATION_TARGET_SET_V1'then'INDUSTRY_UTILISATION_TARGET_SET_V1'when'CORE_INDUSTRY_RUN_SCHEDULE_V1'then'INDUSTRY_FIRST_DAY_RUN_SCHEDULED_V1'when'CORE_INDUSTRY_FIRST_DAY_WORK_V1'then'INDUSTRY_FIRST_DAY_WORK_COMPLETED_V1'when'CORE_SOCIAL_EMPLOYMENT_SERVICE_CREATE_V1'then'SOCIAL_EMPLOYMENT_SERVICE_CREATED_V1'when'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1'then'SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1'else'SOCIAL_JOB_MATCH_SETTLED_V1'end;
    if e->>'worldId'is distinct from p_world or e->>'eventType'is distinct from expected_type or e->>'schemaVersion'is distinct from'event-v1'or e->>'causationCommandId'is distinct from c->>'commandId'or e->>'correlationId'is distinct from c->>'correlationId'or e->>'worldVersion'is distinct from(wv+1)::text or e->>'sequence'is distinct from(seq+idx+1)::text or e->>'simTime'is distinct from c->>'simTime'or e->'correctsEventId'<>'null'::jsonb or e->>'payloadHash'is distinct from 'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||(e->>'canonicalPayload'))or e->>'fingerprint'is distinct from 'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(e-'fingerprint'-'payloadHash'-'recordedAtReal'))then raise exception 'PAGED_MATCH_EXACT_EVENT_HASH_SEQUENCE_REQUIRED'using errcode='23514';end if;
    if c->>'commandType'='CORE_SOCIAL_LABOUR_PROGRAMME_APPLY_V1'and not world_v2.postwar_social_application_effect_scoped(p_world,c->>'countryId',c,(e->>'canonicalPayload')::jsonb,(e->>'sequence')::bigint)then raise exception 'PAGED_MATCH_APPLICATION_SCOPE_INVALID'using errcode='23514';end if;
    if c->>'commandType'='CORE_SOCIAL_LABOUR_PROGRAMME_CREATE_V1'and not world_v2.postwar_social_programme_effect_scoped(p_world,c->>'countryId',c,(e->>'canonicalPayload')::jsonb,(e->>'sequence')::bigint)then raise exception 'PAGED_MATCH_PROGRAMME_ORIGINALS_INVALID'using errcode='23514';end if;
    if c->>'commandType'in('CORE_INDUSTRY_UTILISATION_TARGET_SET_V1','CORE_INDUSTRY_RUN_SCHEDULE_V1','CORE_INDUSTRY_FIRST_DAY_WORK_V1')then perform world_v2.postwar_mixed_industry_work_group(p_world,c,tr,e,f->'financialPostingBatches',f->'inventoryPostings');end if;
    if c->>'commandType'='CORE_SOCIAL_EMPLOYMENT_SERVICE_CREATE_V1'then
     if to_regprocedure('world_v2.postwar_social_employment_creation_effect_scoped(text,text,jsonb,jsonb,bigint)')is null then raise exception 'PAGED_MATCH_CREATION_ORIGINALS_REQUIRED'using errcode='55000';end if;
     if not world_v2.postwar_social_employment_creation_effect_scoped(p_world,c->>'countryId',c,(e->>'canonicalPayload')::jsonb,(e->>'sequence')::bigint)then raise exception 'PAGED_MATCH_CREATION_ORIGINALS_INVALID'using errcode='23514';end if;
    end if;
    idx:=idx+1;last_id:=e->>'eventId';last_fp:=e->>'fingerprint';
   end loop;
   if coalesce((select sum(jsonb_array_length(x->'legs'))from jsonb_array_elements(f->'financialPostingBatches')x),0)<>expected_legs then raise exception 'PAGED_MATCH_EXACT_FINANCIAL_LEG_SET_REQUIRED'using errcode='23514';end if;
   for b in select value from jsonb_array_elements(f->'financialPostingBatches')loop
    if b->>'worldId'is distinct from p_world or b->>'causationCommandId'is distinct from c->>'commandId'or b->'causationEventIds'is distinct from tr->'eventIds'or b->>'worldVersionBefore'is distinct from wv::text or b->>'worldVersionAfter'is distinct from(wv+1)::text or b->>'simTime'is distinct from c->>'simTime'or b->'transitionBinding'->>'commandFingerprint'is distinct from c->>'fingerprint'or b->>'fingerprint'is distinct from 'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(b-'fingerprint'))then raise exception 'PAGED_MATCH_EXACT_ACTUAL_FINANCIAL_BATCH_REQUIRED'using errcode='23514';end if;
   end loop;
   effects:=effects||jsonb_build_array(jsonb_build_object('commandId',c->>'commandId','countryId',c->>'countryId','commandType',c->>'commandType','transitionFingerprint','sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(tr)),'receiptFingerprint','sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(r)),'eventFingerprints',(select jsonb_agg(x->'fingerprint'order by n)from jsonb_array_elements(f->'events')with ordinality q(x,n)),'worldVersionBefore',r->>'worldVersionBefore','worldVersionAfter',r->>'worldVersionAfter','events',(select jsonb_agg(jsonb_build_object('eventId',x->>'eventId','fingerprint',x->>'fingerprint','sequence',x->>'sequence','worldVersion',x->>'worldVersion')order by n)from jsonb_array_elements(f->'events')with ordinality q(x,n))));
   batches:=batches||(f->'financialPostingBatches');leg_count:=leg_count+expected_legs;frame_events:=frame_events+expected_events;frame_batches:=frame_batches+expected_batches;frame_inventory:=frame_inventory+jsonb_array_length(f->'inventoryPostings');frame_count:=frame_count+1;wv:=wv+1;seq:=seq+expected_events;prior_sim:=(c->>'simTime')::bigint;
  end loop;
  if wv::text<>page.through_world_version or seq::text<>page.through_event_sequence or frame_events::text<>page.event_count or frame_batches::text<>page.financial_batch_count or frame_inventory::text<>page.inventory_posting_count then raise exception 'PAGED_MATCH_ACTUAL_PAGE_TOTALS_CHANGED'using errcode='23514';end if;
  through_head:=jsonb_build_object('worldVersion',wv::text,'eventSequence',seq::text);
  anchor:=jsonb_build_object('worldId',p_world,'seedFingerprint',a.seed_fingerprint,'fromHead',from_head,'throughHead',through_head,'expectedHead',expected_head);
  prefix:='sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(anchor||jsonb_build_object('schemaVersion','finance-social-replay-page-chain-v1','previous',prefix,'framesSha256',page.frames_sha256)));
  effect_hash:='sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(anchor||jsonb_build_object('schemaVersion','postwar-effects-page-chain-v1','previous',effect_hash,'effects',effects)));
  journal_hash:='sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(anchor||jsonb_build_object('schemaVersion','postwar-financial-page-chain-v1','previous',journal_hash,'batches',batches)));
  batch_count:=batch_count+frame_batches;inventory_count:=inventory_count+frame_inventory;pages:=pages+1;
  exit when not page.has_more;
 end loop;
 if wv<>h.world_version or seq<>h.event_sequence or frame_count::text<>page.total_frame_count or seq::text<>page.total_event_count or batch_count::text<>page.total_financial_batch_count or inventory_count::text<>page.total_inventory_posting_count then raise exception 'PAGED_MATCH_COMPLETE_ACTUAL_PREFIX_REQUIRED'using errcode='55000';end if;
 coverage:=jsonb_build_object('prefixFingerprint',prefix,'knownEffectsFingerprint',effect_hash,'coveredThroughEventId',last_id,'coveredThroughEventFingerprint',last_fp,'financialPostingCount',leg_count::text,'financialBatchCount',batch_count::text,'financialPostingsFingerprint',journal_hash,'pageProof',jsonb_build_object('schemaVersion','postwar-complete-page-proof-v1','hashAlgorithm','COMPLETE_CANONICAL_PAGE_CHAINS_SHA256_V1','pageCount',pages::text,'frameCount',frame_count::text));
 if w->'coverage'is distinct from coverage then raise exception 'PAGED_MATCH_CORE_ACTUAL_PAGE_CHAIN_MISMATCH'using errcode='23514';end if;
 select * into strict p from world_v2.command_submission x where x.world_id=p_world and x.command_id=p_plan;
 select * into strict pr from world_v2.command_receipt x where x.world_id=p_world and x.command_id=p_plan and x.outcome='COMMITTED';
 if p.command_type<>'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1'or p.office_id<>'SOCIAL'or p.country_id<>p_country or p.canonical_payload::jsonb->>'dueDayIndex'<>'0'or p.sim_time<0 or p.sim_time>=86400000 or p.sim_time<prior_sim or w->'plan'is distinct from jsonb_build_object('commandId',p.command_id,'commandFingerprint',p.command_fingerprint,'canonicalPayload',p.canonical_payload)then raise exception 'PAGED_MATCH_IMMUTABLE_CURRENT_PLAN_REQUIRED'using errcode='23514';end if;
 select * into old from world_v2.social_operating_match_publication x where x.world_id=p_world and x.plan_command_id=p_plan and x.rule_version=g.rule_version;
 if found then select * into strict v from world_v2.command_submission x where x.world_id=p_world and x.command_id=old.command_id;if v.command_fingerprint<>old.command_fingerprint or old.grant_ref<>g.grant_ref then raise exception 'PAGED_MATCH_PUBLICATION_CONFLICT'using errcode='23514';end if;return v;end if;
 if w->>'planState'is distinct from'PENDING'or exists(select 1 from world_v2.command_submission x join world_v2.command_receipt y on y.world_id=x.world_id and y.command_id=x.command_id and y.outcome='COMMITTED'where x.world_id=p_world and x.command_type='CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1'and x.canonical_payload::jsonb->>'planCommandId'=p_plan)then raise exception 'PAGED_MATCH_PLAN_ALREADY_SETTLED'using errcode='55000';end if;
 if exists(select 1 from world_v2.command_submission x join world_v2.command_receipt y on y.world_id=x.world_id and y.command_id=x.command_id and y.outcome='COMMITTED'where x.world_id=p_world and x.country_id=p_country and x.command_type='CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1'and y.world_version_after>pr.world_version_after and jsonb_build_array(x.canonical_payload::jsonb->>'locationId',x.canonical_payload::jsonb->>'skill',x.canonical_payload::jsonb->>'positionId',x.canonical_payload::jsonb->>'servicePoolId',x.canonical_payload::jsonb->>'dueDayIndex')=jsonb_build_array(p.canonical_payload::jsonb->>'locationId',p.canonical_payload::jsonb->>'skill',p.canonical_payload::jsonb->>'positionId',p.canonical_payload::jsonb->>'servicePoolId',p.canonical_payload::jsonb->>'dueDayIndex'))then raise exception 'PAGED_MATCH_PLAN_SUPERSEDED'using errcode='55000';end if;
 id:='COMMAND_SOCIAL_MATCH_'||upper(encode(sha256(convert_to(jsonb_build_array(g.grant_ref,p.command_fingerprint,g.rule_version)::text,'UTF8')),'hex'));
 payload:=jsonb_build_object('schemaVersion','social-job-match-settlement-v1','planCommandId',p.command_id,'planFingerprint',p.command_fingerprint,'dueDayIndex','0','ruleVersion',g.rule_version);payload_text:=world_v2.canonical_json(payload);
 intent:=jsonb_build_object('actorId',g.actor_id,'authSubject',g.auth_subject::text,'commandId',id,'commandType','CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1','countryId',p.country_id,'expectedWorldVersion',h.world_version::text,'idempotencyKey',id,'officeId',null,'canonicalPayload',payload_text,'schemaVersion','command-v1','simTime',p.sim_time::text,'worldId',p_world);
 fp:='sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(intent));published:=date_trunc('milliseconds',clock_timestamp());
 insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values(p_world,id,id,'CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1','command-v1',payload_text,'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||payload_text),fp,g.auth_subject,g.actor_id,p.country_id,null,h.world_version,p.sim_time,p.correlation_id,published);
 insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time)values(p_world,id,'VERSIONED_AUTOMATIC',p.sim_time);
 insert into world_v2.social_operating_match_publication values(p_world,p_plan,g.rule_version,g.grant_ref,id,fp);
 select * into strict v from world_v2.command_submission x where x.world_id=p_world and x.command_id=id;return v;
end;$$;

create or replace function world_v2.postwar_social_complete_prefix(p_world text)
returns table(prefix_fingerprint text,effects_fingerprint text,last_event_id text,last_event_fingerprint text)
language plpgsql security definer set search_path=pg_catalog as $$
declare h record;r record;c record;e record;command jsonb;event jsonb;transition jsonb;receipt jsonb;ep jsonb;frames jsonb:='[]';meta jsonb:='[]';event_seq bigint:=0;wv bigint:=0;bytes bigint:=0;seed_fp text;command_intent jsonb;event_intent jsonb;
begin
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select * into strict h from world_v2.world_head where world_id=p_world;
 if h.world_version<1 or h.world_version>10000 or h.event_sequence<1 or h.event_sequence>10000 then raise exception 'POSTWAR_PREFIX_CAPACITY_EXCEEDED'using errcode='54000';end if;
 if (select count(*)from world_v2.command_receipt x where x.world_id=p_world and x.outcome='COMMITTED')<>h.world_version or(select count(*)from world_v2.authoritative_event x where x.world_id=p_world)<>h.event_sequence
 or exists(select 1 from world_v2.inventory_posting x where x.world_id=p_world)or exists(select 1 from world_v2.financial_posting_batch x where x.world_id=p_world)
 then raise exception 'POSTWAR_PREFIX_INCOMPLETE_OR_UNSUPPORTED_POSTING'using errcode='55000';end if;
 for r in select * from world_v2.command_receipt x where x.world_id=p_world and x.outcome='COMMITTED'order by x.world_version_after loop
  select * into strict c from world_v2.command_submission x where x.world_id=p_world and x.command_id=r.command_id;
  if r.world_version_before<>wv or r.world_version_after<>wv+1 or c.expected_world_version is distinct from wv or r.transition_id<>c.command_id or r.command_fingerprint<>c.command_fingerprint or r.sim_time<>c.sim_time or r.idempotency_key is distinct from c.idempotency_key or jsonb_array_length(r.event_ids)<>1 then raise exception 'POSTWAR_PREFIX_RECEIPT_OR_WORLD_GAP'using errcode='55000';end if;
  select * into strict e from world_v2.authoritative_event x where x.world_id=p_world and x.event_id=r.event_ids->>0;
  bytes:=bytes+octet_length(e.canonical_payload)+octet_length(c.canonical_payload);
  if bytes>4194304 or e.event_sequence<>event_seq+1 or e.world_version<>r.world_version_after or e.causation_command_id<>c.command_id or e.sim_time<>c.sim_time or e.correlation_id<>c.correlation_id or e.corrects_event_id is not null or e.event_type not in('SOCIAL_LABOUR_PROGRAMME_CREATED_V1','SOCIAL_LABOUR_PROGRAMME_APPLIED_V1','SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1','SOCIAL_EMPLOYMENT_SERVICE_CREATED_V1','SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1','SOCIAL_JOB_MATCH_SETTLED_V1')then raise exception 'POSTWAR_PREFIX_UNKNOWN_EFFECT_OR_SEQUENCE'using errcode='55000';end if;
  command:=jsonb_build_object('actorId',c.actor_id,'authSubject',c.auth_subject::text,'commandId',c.command_id,'commandType',c.command_type,'correlationId',c.correlation_id,'countryId',c.country_id,'expectedWorldVersion',c.expected_world_version::text,'idempotencyKey',c.idempotency_key,'officeId',c.office_id,'canonicalPayload',c.canonical_payload,'schemaVersion',c.schema_version,'simTime',c.sim_time::text,'submittedAtReal',to_char(c.submitted_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'worldId',p_world,'fingerprint',c.command_fingerprint,'payloadHash',c.payload_sha256);
  command_intent:=command-'fingerprint'-'payloadHash'-'correlationId'-'submittedAtReal';
  ep:=e.canonical_payload::jsonb;
  event:=jsonb_build_object('causationCommandId',e.causation_command_id,'correlationId',e.correlation_id,'correctsEventId',e.corrects_event_id,'eventId',e.event_id,'eventType',e.event_type,'canonicalPayload',e.canonical_payload,'schemaVersion',e.schema_version,'sequence',e.event_sequence::text,'simTime',e.sim_time::text,'worldId',p_world,'worldVersion',e.world_version::text,'fingerprint',e.event_fingerprint,'payloadHash',e.payload_sha256,'recordedAtReal',to_char(e.recorded_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  event_intent:=event-'fingerprint'-'payloadHash'-'recordedAtReal';
  if c.schema_version<>'command-v1'or e.schema_version<>'event-v1'or c.canonical_payload<>world_v2.canonical_json(c.canonical_payload::jsonb)or e.canonical_payload<>world_v2.canonical_json(ep)
  or c.command_fingerprint<>'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(command_intent),'UTF8')),'hex')
  or c.payload_sha256<>'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||c.canonical_payload,'UTF8')),'hex')
  or e.payload_sha256<>'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||e.canonical_payload,'UTF8')),'hex')
  or e.event_fingerprint<>'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(event_intent),'UTF8')),'hex')
  or ep->'command'is distinct from (command-'canonicalPayload'-'fingerprint'-'payloadHash')||jsonb_build_object('payload',c.canonical_payload::jsonb)
  or not world_v2.postwar_social_prefix_effect_scoped(p_world,c.country_id,e.event_type,command,ep,e.event_sequence)
  then raise exception 'POSTWAR_PREFIX_HASH_OR_EFFECT_SCOPE_INVALID'using errcode='23514';end if;
  transition:=jsonb_build_object('schemaVersion','authoritative-transition-v1','transitionId',c.command_id,'worldId',p_world,'commandId',c.command_id,'commandFingerprint',c.command_fingerprint,'worldVersionBefore',r.world_version_before::text,'worldVersionAfter',r.world_version_after::text,'eventIds',r.event_ids,'events',jsonb_build_array(event));
  receipt:=jsonb_build_object('schemaVersion',r.schema_version,'worldId',p_world,'commandId',r.command_id,'idempotencyKey',r.idempotency_key,'commandFingerprint',r.command_fingerprint,'outcome',r.outcome,'reasonCode',r.reason_code,'transitionId',r.transition_id,'worldVersionBefore',r.world_version_before::text,'worldVersionAfter',r.world_version_after::text,'simTime',r.sim_time::text,'eventIds',r.event_ids,'recordedAtReal',to_char(r.recorded_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  frames:=frames||jsonb_build_array(jsonb_build_object('command',command,'transition',transition,'financialPostingBatches','[]'::jsonb,'inventoryPostings','[]'::jsonb,'receipt',receipt,'events',jsonb_build_array(event)));
  meta:=meta||jsonb_build_array(jsonb_build_object('commandId',c.command_id,'countryId',c.country_id,'commandType',c.command_type,'transitionFingerprint','sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(transition),'UTF8')),'hex'),'receiptFingerprint','sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(receipt),'UTF8')),'hex'),'eventFingerprints',jsonb_build_array(e.event_fingerprint),'worldVersionBefore',r.world_version_before::text,'worldVersionAfter',r.world_version_after::text,'events',jsonb_build_array(jsonb_build_object('eventId',e.event_id,'fingerprint',e.event_fingerprint,'sequence',e.event_sequence::text,'worldVersion',e.world_version::text))));
  wv:=r.world_version_after;event_seq:=e.event_sequence;last_event_id:=e.event_id;last_event_fingerprint:=e.event_fingerprint;
 end loop;
 if wv<>h.world_version or event_seq<>h.event_sequence then raise exception 'POSTWAR_PREFIX_HEAD_INCOMPLETE'using errcode='55000';end if;
 select x.seed_fingerprint into strict seed_fp from world_v2.postwar_projection_admission_header(p_world)x;
 prefix_fingerprint:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(jsonb_build_object('worldId',p_world,'seedFingerprint',seed_fp,'headWorldVersion',wv::text,'headEventSequence',event_seq::text,'frames',frames)),'UTF8')),'hex');
 effects_fingerprint:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(meta),'UTF8')),'hex');
 return next;
end;$$;

create or replace function world_v2.postwar_current_social_witness(p_world text,p_country text)
returns table(world_version bigint,event_sequence bigint,state jsonb,binding jsonb)
language plpgsql security definer set search_path=pg_catalog as $$
declare h record;e record;c record;r record;m record;ep jsonb;st jsonb;key text;expected_command text;expected_schema text;raw_sha text;event_intent jsonb;
begin
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select * into h from world_v2.world_head where world_id=p_world;
 if not found or h.world_version<1 or h.world_version>10000 or h.event_sequence<1 or h.event_sequence>10000 then return;end if;
 -- Complete contiguous committed prefix, all effects understood for this country.
 if (select count(*)from world_v2.authoritative_event x where x.world_id=p_world)<>h.event_sequence
 or (select min(x.event_sequence)from world_v2.authoritative_event x where x.world_id=p_world)<>1
 or (select max(x.event_sequence)from world_v2.authoritative_event x where x.world_id=p_world)<>h.event_sequence
 or (select count(*)from world_v2.command_receipt x where x.world_id=p_world and x.outcome='COMMITTED')<>h.world_version
 or (select count(distinct x.world_version_after)from world_v2.command_receipt x where x.world_id=p_world and x.outcome='COMMITTED'and x.world_version_before>=0 and x.world_version_after<=h.world_version)<>h.world_version
 or exists(select 1 from world_v2.authoritative_event x join world_v2.command_submission q on q.world_id=x.world_id and q.command_id=x.causation_command_id left join world_v2.command_receipt z on z.world_id=x.world_id and z.command_id=x.causation_command_id where x.world_id=p_world and(z.outcome is distinct from 'COMMITTED'or z.world_version_after is distinct from x.world_version or z.command_fingerprint<>q.command_fingerprint or z.sim_time<>x.sim_time or not(z.event_ids @>jsonb_build_array(x.event_id))or q.country_id<>p_country or x.corrects_event_id is not null or x.event_type not in('SOCIAL_LABOUR_PROGRAMME_CREATED_V1','SOCIAL_LABOUR_PROGRAMME_APPLIED_V1','SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1','SOCIAL_EMPLOYMENT_SERVICE_CREATED_V1','SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1','SOCIAL_JOB_MATCH_SETTLED_V1')))
 or exists(select 1 from world_v2.command_receipt z where z.world_id=p_world and z.outcome='COMMITTED' and z.event_ids is distinct from (select jsonb_agg(x.event_id order by x.event_sequence)from world_v2.authoritative_event x where x.world_id=p_world and x.causation_command_id=z.command_id))then return;end if;
 -- CREATE has a supplementary actual-source contract. The legacy witness
 -- may expose it only after independent complete-prefix source/effect checks.
 if exists(select 1 from world_v2.authoritative_event where world_id=p_world and event_type in('SOCIAL_EMPLOYMENT_SERVICE_CREATED_V1','SOCIAL_LABOUR_PROGRAMME_CREATED_V1','SOCIAL_LABOUR_PROGRAMME_APPLIED_V1'))then
  if to_regprocedure('world_v2.postwar_social_complete_prefix(text)')is null then return;end if;
  perform 1 from world_v2.postwar_social_complete_prefix(p_world);
 end if;
 select * into e from world_v2.authoritative_event where world_id=p_world and authoritative_event.event_sequence=h.event_sequence and authoritative_event.world_version=h.world_version;
 if not found or octet_length(e.canonical_payload)>1048576 then return;end if;
 select * into strict c from world_v2.command_submission where world_id=p_world and command_id=e.causation_command_id;
 select * into strict r from world_v2.command_receipt where world_id=p_world and command_id=e.causation_command_id;
 if r.event_ids<>jsonb_build_array(e.event_id)or c.expected_world_version is distinct from h.world_version-1 then return;end if;
 if e.event_type='SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1'then key:='SOCIAL_POSITION_LIFECYCLE_'||p_country;expected_command:='CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1';expected_schema:='social-employment-position-offer-event-v1';
 elsif e.event_type='SOCIAL_LABOUR_PROGRAMME_CREATED_V1'then key:='SOCIAL_EMPLOYMENT_SERVICE_'||p_country;expected_command:='CORE_SOCIAL_LABOUR_PROGRAMME_CREATE_V1';expected_schema:='social-labour-programme-created-v1';
 elsif e.event_type='SOCIAL_LABOUR_PROGRAMME_APPLIED_V1'then key:='SOCIAL_EMPLOYMENT_SERVICE_'||p_country;expected_command:='CORE_SOCIAL_LABOUR_PROGRAMME_APPLY_V1';expected_schema:='social-labour-programme-applied-v1';
 elsif e.event_type='SOCIAL_EMPLOYMENT_SERVICE_CREATED_V1'then key:='SOCIAL_EMPLOYMENT_SERVICE_'||p_country;expected_command:='CORE_SOCIAL_EMPLOYMENT_SERVICE_CREATE_V1';expected_schema:='social-employment-service-created-v1';
 elsif e.event_type='SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1'then key:='SOCIAL_EMPLOYMENT_SERVICE_'||p_country;expected_command:='CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1';expected_schema:='social-employment-service-event-v1';
 elsif e.event_type='SOCIAL_JOB_MATCH_SETTLED_V1'then key:='SOCIAL_EMPLOYMENT_SERVICE_'||p_country;expected_command:='CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1';expected_schema:='social-employment-service-event-v1';else return;end if;
 select * into m from world_v2.current_materialization where world_id=p_world and materialization_key=key;
 if not found or m.world_version<>h.world_version or m.source_command_id<>c.command_id or octet_length(m.canonical_payload)>1048576 then return;end if;
 raw_sha:=encode(sha256(convert_to(m.canonical_payload,'UTF8')),'hex');ep:=e.canonical_payload::jsonb;st:=m.canonical_payload::jsonb;
 event_intent:=jsonb_build_object('causationCommandId',e.causation_command_id,'correlationId',e.correlation_id,'correctsEventId',e.corrects_event_id,'eventId',e.event_id,'eventType',e.event_type,'canonicalPayload',e.canonical_payload,'schemaVersion',e.schema_version,'sequence',e.event_sequence::text,'simTime',e.sim_time::text,'worldId',p_world,'worldVersion',e.world_version::text);
 if e.schema_version<>'event-v1'or c.command_type<>expected_command or ep->>'schemaVersion'is distinct from expected_schema
 or ep->'command'->>'worldId'is distinct from p_world or ep->'command'->>'countryId'is distinct from p_country or ep->'command'->>'commandId'is distinct from c.command_id
 or ep->'command'->>'commandType'is distinct from c.command_type or ep->'command'->>'expectedWorldVersion'is distinct from c.expected_world_version::text
 or world_v2.canonical_json(ep->'command'->'payload')is distinct from c.canonical_payload
 or m.canonical_payload<>world_v2.canonical_json(st)or e.canonical_payload<>world_v2.canonical_json(ep)
 or m.payload_sha256 is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||m.canonical_payload,'UTF8')),'hex')
 or ep->>'afterStateHash'is distinct from m.payload_sha256
 or e.payload_sha256 is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||e.canonical_payload,'UTF8')),'hex')
 or e.event_fingerprint is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(event_intent),'UTF8')),'hex')then return;end if;
 if key='SOCIAL_POSITION_LIFECYCLE_'||p_country then
  if st->>'schemaVersion'is distinct from 'social-employment-position-lifecycle-v1'or jsonb_typeof(st->'offers')is distinct from 'array'or jsonb_typeof(st->'reservations')is distinct from 'array'or jsonb_typeof(st->'operations')is distinct from 'array'then return;end if;st:=st->'employment';
 end if;
 if st->>'schemaVersion'is distinct from 'social-employment-service-state-v1'or st->>'worldId'is distinct from p_world
 or jsonb_typeof(st->'labour'->'positions')is distinct from 'array'or jsonb_typeof(st->'labour'->'aggregates')is distinct from 'array'or jsonb_typeof(st->'labour'->'wageAssertions')is distinct from 'array'or jsonb_typeof(st->'servicePools')is distinct from 'array'then return;end if;
 if exists(select 1 from jsonb_array_elements((st->'labour'->'positions')||(st->'labour'->'aggregates')||(st->'servicePools'))x where x->>'countryId'is distinct from p_country)
 or exists(select 1 from jsonb_array_elements(st->'labour'->'wageAssertions')x where not exists(select 1 from jsonb_array_elements(st->'labour'->'positions')p where p->>'positionId'=x->>'positionId'))then return;end if;
 return query select h.world_version,h.event_sequence,st,jsonb_build_object('sourceCommandId',c.command_id,'commandFingerprint',c.command_fingerprint,'sourceEventId',e.event_id,'eventFingerprint',e.event_fingerprint,'materializationKey',key,'materializationHash',m.payload_sha256,'canonicalMaterializationSha256',raw_sha,'sourceStateWorldVersion',m.world_version::text,'sourceEventSequence',e.event_sequence::text);
exception when invalid_text_representation then return;
end;$$;
revoke create on schema world_v2 from world_v2_postwar_projection_owner,world_v2_social_source_owner;
do $application_after$
declare specs jsonb:=$application_specs$[{"signature":"world_v2.postwar_social_prefix_effect_scoped(text,text,text,jsonb,jsonb,bigint)","owner":"world_v2_postwar_projection_owner","securityDefiner":true,"config":["search_path=pg_catalog"],"argumentNames":["p_world","p_country","p_type","p_command","p_event","p_sequence"],"strict":false,"volatility":"v","parallel":"u","result":"boolean","defaultCount":0,"defaults":null,"leakproof":false,"kind":"f","language":"plpgsql","acl":[{"grantee":"world_v2_postwar_projection_owner","grantor":"world_v2_postwar_projection_owner","grantable":false,"privilege":"EXECUTE"}],"bodySha256":"2d6f85e59d64fb13b97bb50b60527f312f8b3b42498f2d22685cc59d6697445f"},{"signature":"world_v2.postwar_social_origin_at_prefix(text,text)","owner":"world_v2_postwar_projection_owner","securityDefiner":true,"config":["search_path=pg_catalog"],"argumentNames":["p_world","p_country","state","binding","origin_world_version","origin_event_sequence"],"strict":false,"volatility":"v","parallel":"u","result":"TABLE(state jsonb, binding jsonb, origin_world_version bigint, origin_event_sequence bigint)","defaultCount":0,"defaults":null,"leakproof":false,"kind":"f","language":"plpgsql","acl":[{"grantee":"world_v2_postwar_projection_owner","grantor":"world_v2_postwar_projection_owner","grantable":false,"privilege":"EXECUTE"}],"bodySha256":"37cbd5a02825e46c29e9bac048c5efb057ea89283c4dcaf3cc38ea430b928518"},{"signature":"world_v2.postwar_apply_current_frame_page(text,text,jsonb)","owner":"world_v2_postwar_projection_owner","securityDefiner":true,"config":["search_path=pg_catalog"],"argumentNames":["p_world","p_frames_text","p_state"],"strict":false,"volatility":"v","parallel":"u","result":"jsonb","defaultCount":0,"defaults":null,"leakproof":false,"kind":"f","language":"plpgsql","acl":[{"grantee":"world_v2_postwar_projection_owner","grantor":"world_v2_postwar_projection_owner","grantable":false,"privilege":"EXECUTE"}],"bodySha256":"0a4b7eab05530bbae33b51ec3e9106941bceef227b05e74c33cce55be1dda965"},{"signature":"world_v2.publish_social_operating_paged_match_due(text,text,text,text)","owner":"world_v2_social_source_owner","securityDefiner":true,"config":["search_path=pg_catalog"],"argumentNames":["p_world","p_country","p_plan","p_witness"],"strict":false,"volatility":"v","parallel":"u","result":"world_v2.command_submission","defaultCount":0,"defaults":null,"leakproof":false,"kind":"f","language":"plpgsql","acl":[{"grantee":"world_v2_social_source_owner","grantor":"world_v2_social_source_owner","grantable":false,"privilege":"EXECUTE"},{"grantee":"world_v2_social_source_publisher","grantor":"world_v2_social_source_owner","grantable":false,"privilege":"EXECUTE"}],"bodySha256":"9deeafd715901ceb1abcacf64f2baaee486d42b1e0ac11c9454a5ab1ec9cd481"},{"signature":"world_v2.postwar_social_complete_prefix(text)","owner":"world_v2_postwar_projection_owner","securityDefiner":true,"config":["search_path=pg_catalog"],"argumentNames":["p_world","prefix_fingerprint","effects_fingerprint","last_event_id","last_event_fingerprint"],"strict":false,"volatility":"v","parallel":"u","result":"TABLE(prefix_fingerprint text, effects_fingerprint text, last_event_id text, last_event_fingerprint text)","defaultCount":0,"defaults":null,"leakproof":false,"kind":"f","language":"plpgsql","bodySha256":"c300e24fcd077f3adfb80b1c6cb43d2e68975dcdf65cdb40eb3887610fdb12ed","acl":[{"grantee":"world_v2_postwar_projection_owner","grantor":"world_v2_postwar_projection_owner","grantable":false,"privilege":"EXECUTE"}]},{"signature":"world_v2.postwar_current_social_witness(text,text)","owner":"world_v2_postwar_projection_owner","securityDefiner":true,"config":["search_path=pg_catalog"],"argumentNames":["p_world","p_country","world_version","event_sequence","state","binding"],"strict":false,"volatility":"v","parallel":"u","result":"TABLE(world_version bigint, event_sequence bigint, state jsonb, binding jsonb)","defaultCount":0,"defaults":null,"leakproof":false,"kind":"f","language":"plpgsql","bodySha256":"b0f8cd526525cf0e1b8f746559433965abd14b3b388fac2ca4bfeb50f974e1ee","acl":[{"grantee":"world_v2_postwar_projection_owner","grantor":"world_v2_postwar_projection_owner","grantable":false,"privilege":"EXECUTE"}]},{"signature":"world_v2.postwar_social_application_effect_scoped(text,text,jsonb,jsonb,bigint)","owner":"world_v2_postwar_projection_owner","securityDefiner":true,"config":["search_path=pg_catalog"],"argumentNames":["p_world","p_country","p_command","p_event","p_sequence"],"strict":false,"volatility":"v","parallel":"u","result":"boolean","defaultCount":0,"defaults":null,"leakproof":false,"kind":"f","language":"plpgsql","bodySha256":"959c79afbd6bb5f3ed3fcabac6ac821e06c79f276126d5a6fea0d9b5fb36b00f","acl":[{"grantee":"world_v2_finance_budget_source_owner","grantor":"world_v2_postwar_projection_owner","grantable":false,"privilege":"EXECUTE"},{"grantee":"world_v2_postwar_projection_owner","grantor":"world_v2_postwar_projection_owner","grantable":false,"privilege":"EXECUTE"},{"grantee":"world_v2_social_source_owner","grantor":"world_v2_postwar_projection_owner","grantable":false,"privilege":"EXECUTE"}]},{"signature":"world_v2.postwar_social_application_contract_version()","owner":"world_v2_social_source_owner","securityDefiner":false,"config":["search_path=pg_catalog"],"argumentNames":null,"strict":false,"volatility":"s","parallel":"u","result":"text","defaultCount":0,"defaults":null,"leakproof":false,"kind":"f","language":"sql","bodySha256":"8c58ef844f72b706ed5153dfaa47f784ff515ad910a1b1c5536ff29b9d585ee7","acl":[{"grantee":"world_v2_social_source_owner","grantor":"world_v2_social_source_owner","grantable":false,"privilege":"EXECUTE"},{"grantee":"world_v2_social_source_reader","grantor":"world_v2_social_source_owner","grantable":false,"privilege":"EXECUTE"}]}]$application_specs$::jsonb;spec jsonb;actual jsonb;schema_acl jsonb;oids jsonb:=current_setting('econmind.application_forward.before_oids')::jsonb;begin
 for spec in select value from jsonb_array_elements(specs)loop
 select jsonb_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,'config',p.proconfig,'argumentNames',p.proargnames,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'result',pg_get_function_result(p.oid),'defaultCount',p.pronargdefaults,'defaults',p.proargdefaults::text,'leakproof',p.proleakproof,'kind',p.prokind,'language',l.lanname,'bodySha256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'acl',(select jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',case when a.grantee=0 then 'PUBLIC'else pg_get_userbyid(a.grantee)::text end,'privilege',a.privilege_type,'grantable',a.is_grantable)order by case when a.grantee=0 then 'PUBLIC'else pg_get_userbyid(a.grantee)::text end,pg_get_userbyid(a.grantor)::text,a.privilege_type)from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a))into actual from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure(spec->>'signature');
 if actual is distinct from spec then raise exception 'SOCIAL_APPLICATION_EXACT_SUCCESSOR_REQUIRED:%',spec->>'signature'using errcode='55000';end if;
 if oids?(spec->>'signature')and oids->>(spec->>'signature')is distinct from to_regprocedure(spec->>'signature')::oid::text then raise exception 'SOCIAL_APPLICATION_OID_CHANGED'using errcode='55000';end if;
 end loop;
select coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',case when a.grantee=0 then 'PUBLIC'else pg_get_userbyid(a.grantee)::text end,'privilege',a.privilege_type,'grantable',a.is_grantable)order by a.grantor,a.grantee,a.privilege_type),'[]'::jsonb)into schema_acl from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner)))a where n.nspname='world_v2';
 if schema_acl is distinct from current_setting('econmind.application_forward.schema_acl')::jsonb then raise exception 'SOCIAL_APPLICATION_SCHEMA_ACL_CHANGED'using errcode='55000';end if;
end;$application_after$;
commit;
