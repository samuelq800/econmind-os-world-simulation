-- SOURCE-ONLY V2 extension. Requires the unchanged H0 and V1 current proposals.
-- Full Core replay runs in the controlled offline publication factory. SQL
-- independently derives actual scope/prefix/origin pins; no caller rows/Ready.
begin;
grant usage,create on schema world_v2 to world_v2_postwar_projection_owner;
create table world_v2.postwar_social_prefix_scope(
 world_id text not null,country_id text not null,seed_fingerprint text not null,
 admission_ref text not null references world_v2.runtime_opening_admission(admission_ref),
 canonical_seed_sha256 text not null,source_bundle_sha256 text not null,
 source_id text not null,source_payload_hash text not null,
 scope_document text not null check(octet_length(scope_document)<=262144),
 scope_sha256 text not null check(scope_sha256=encode(sha256(convert_to(scope_document,'UTF8')),'hex')),
 primary key(world_id,country_id),foreign key(world_id,seed_fingerprint)references world_v2.opening_seed(world_id,seed_fingerprint)
);
create table world_v2.postwar_social_current_coverage(
 coverage_ref text primary key,world_id text not null,country_id text not null,
 world_version bigint not null check(world_version>0),event_sequence bigint not null check(event_sequence>0),
 origin_world_version bigint not null check(origin_world_version>0 and origin_world_version<=world_version),
 origin_event_sequence bigint not null check(origin_event_sequence>0 and origin_event_sequence<=event_sequence),
 seed_fingerprint text not null,admission_ref text not null,source_bundle_sha256 text not null,
 prefix_fingerprint text not null check(prefix_fingerprint~'^sha256:[0-9a-f]{64}$'),
 effects_fingerprint text not null check(effects_fingerprint~'^sha256:[0-9a-f]{64}$'),
 covered_through_event_id text not null,covered_through_event_fingerprint text not null,
 source_command_id text not null,source_event_id text not null,materialization_key text not null,
 materialization_hash text not null,materialization_sha256 text not null,binding jsonb not null,
 reducer_version text not null check(reducer_version='POSTWAR_SOCIAL_COMPLETE_PREFIX_SCOPE_V2'),
 foreign key(world_id,country_id)references world_v2.postwar_social_prefix_scope(world_id,country_id),
 foreign key(world_id,source_event_id)references world_v2.authoritative_event(world_id,event_id),
 foreign key(world_id,covered_through_event_id)references world_v2.authoritative_event(world_id,event_id),
 foreign key(world_id,source_command_id)references world_v2.command_receipt(world_id,command_id),
 unique(world_id,country_id,world_version,event_sequence),unique(coverage_ref,world_id,country_id)
);
create table world_v2.postwar_social_prefix_document(
 document_ref text primary key,world_id text not null,country_id text not null,dataset text not null check(dataset in('positions','service-pools')),
 coverage_ref text not null,base_document_ref text not null,world_version bigint not null,event_sequence bigint not null,
 origin_world_version bigint not null,materialization_hash text not null,source_version text not null unique,
 document_sha256 text not null,total_rows integer not null check(total_rows>=0),page_count integer not null check(page_count>0),
 foreign key(coverage_ref,world_id,country_id)references world_v2.postwar_social_current_coverage(coverage_ref,world_id,country_id),
 foreign key(base_document_ref,world_id)references world_v2.postwar_office_projection_document(document_ref,world_id),
 unique(world_id,country_id,dataset,world_version,event_sequence),unique(document_ref,world_id)
);
create table world_v2.postwar_social_prefix_page(
 document_ref text not null,world_id text not null,page_index integer not null check(page_index>=0),row_offset integer not null check(row_offset>=0),
 row_count integer not null check(row_count between 0 and 100),rows_text text not null check(octet_length(rows_text)<=48000 and jsonb_typeof(rows_text::jsonb)='array'),
 page_sha256 text not null check(page_sha256=encode(sha256(convert_to(rows_text,'UTF8')),'hex')),
 primary key(document_ref,page_index),foreign key(document_ref,world_id)references world_v2.postwar_social_prefix_document(document_ref,world_id),
 check(jsonb_array_length(rows_text::jsonb)=row_count)
);
do $$declare t text;begin foreach t in array array['postwar_social_prefix_scope','postwar_social_current_coverage','postwar_social_prefix_document','postwar_social_prefix_page']loop
 execute format('alter table world_v2.%I owner to world_v2_postwar_projection_owner',t);
 execute format('alter table world_v2.%I enable row level security',t);execute format('alter table world_v2.%I force row level security',t);
 execute format('revoke all on world_v2.%I from public,world_v2_postwar_projection_reader,world_v2_postwar_projection_publisher',t);
 execute format('create policy %I on world_v2.%I to world_v2_postwar_projection_owner using(current_user=''world_v2_postwar_projection_owner'' and world_id=current_setting(''econmind.postwar_projection_world'',true))with check(current_user=''world_v2_postwar_projection_owner'' and world_id=current_setting(''econmind.postwar_projection_world'',true))',t||'_owner',t);
 execute format('create policy %I on world_v2.%I as restrictive to world_v2_postwar_projection_owner using(world_id=current_setting(''econmind.postwar_projection_world'',true))with check(world_id=current_setting(''econmind.postwar_projection_world'',true))',t||'_world',t);
 execute format('create trigger %I before update or delete on world_v2.%I for each row execute function world_v2.reject_authoritative_history_mutation()',t||'_immutable',t);
 execute format('create trigger %I before truncate on world_v2.%I for each statement execute function world_v2.reject_authoritative_history_mutation()',t||'_truncate',t);
end loop;end;$$;
create function world_v2.lock_postwar_social_current_prefix_publication(p_world text,p_country text)
returns table(world_version text,event_sequence text,seed_fingerprint text,admission_ref text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;a record;h record;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')then raise exception 'POSTWAR_FIXED_PROJECTION_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed'then raise exception 'POSTWAR_PREFIX_FRESH_READ_COMMITTED_REQUIRED'using errcode='25000';end if;
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select * into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found or h.world_version<1 or h.world_version>10000 or h.event_sequence<1 or h.event_sequence>10000 then raise exception 'POSTWAR_PREFIX_BOUNDED_ACTUAL_HEAD_REQUIRED'using errcode='55000';end if;
 select * into a from world_v2.postwar_projection_admission_header(p_world);if not found then raise exception 'POSTWAR_PREFIX_ADMISSION_REQUIRED'using errcode='55000';end if;
 perform 1 from world_v2.runtime_admission_publication_permit q where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref for share;
 if exists(select 1 from world_v2.runtime_admission_publication_revocation r join world_v2.runtime_admission_publication_permit q using(authorization_id)where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref)then raise exception 'POSTWAR_PREFIX_ADMISSION_REVOKED'using errcode='55000';end if;
 perform 1 from world_v2.postwar_office_projection_document d where d.world_id=p_world and d.country_id=p_country and d.office_id='SOCIAL'and d.dataset in('positions','service-pools')and d.admission_ref=a.admission_ref and d.seed_fingerprint=a.seed_fingerprint and d.source_bundle_sha256=a.source_bundle_sha256 for share;
 if(select count(*)from world_v2.postwar_office_projection_document d where d.world_id=p_world and d.country_id=p_country and d.office_id='SOCIAL'and d.dataset in('positions','service-pools')and d.admission_ref=a.admission_ref and d.seed_fingerprint=a.seed_fingerprint and d.source_bundle_sha256=a.source_bundle_sha256 and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.world_id=p_world and r.document_ref=d.document_ref))<>2 then raise exception 'POSTWAR_PREFIX_EXACT_H0_PINS_REQUIRED'using errcode='55000';end if;
 return query select h.world_version::text,h.event_sequence::text,a.seed_fingerprint,a.admission_ref;
end;$$;
alter function world_v2.lock_postwar_social_current_prefix_publication(text,text)owner to world_v2_postwar_projection_owner;
-- Derive finite original ownership footprints from the actual stored source
-- once. The scope table is immutable, non-authoritative and never reader-visible.
create function world_v2.prepare_postwar_social_prefix_scopes(p_world text)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare a record;s record;base record;root jsonb;op_source jsonb;op jsonb;doc jsonb;c jsonb;body jsonb;payload text;raw_sha text;count_sources integer;begin
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 if exists(select 1 from world_v2.postwar_social_prefix_scope x where x.world_id=p_world)then
  if exists(select 1 from world_v2.postwar_social_prefix_scope x where x.world_id=p_world and(x.seed_fingerprint<>a.seed_fingerprint or x.admission_ref<>a.admission_ref or x.source_bundle_sha256<>a.source_bundle_sha256))then raise exception 'POSTWAR_PREFIX_SCOPE_LINEAGE_CONFLICT'using errcode='23514';end if;return;
 end if;
 select * into strict s from world_v2.opening_seed x where x.world_id=p_world;
 raw_sha:=encode(sha256(convert_to(s.canonical_payload,'UTF8')),'hex');root:=s.canonical_payload::jsonb;
 if s.seed_fingerprint is distinct from a.seed_fingerprint or s.seed_fingerprint is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||s.canonical_payload,'UTF8')),'hex')then raise exception 'POSTWAR_PREFIX_STORED_CORE_SEED_MISMATCH'using errcode='23514';end if;
 select * into base from world_v2.postwar_office_projection_document d where d.world_id=p_world and d.office_id='SOCIAL'and d.admission_ref=a.admission_ref and d.seed_fingerprint=a.seed_fingerprint limit 1;
 if not found or base.canonical_seed_sha256<>raw_sha or base.source_bundle_sha256<>a.source_bundle_sha256 then raise exception 'POSTWAR_PREFIX_VALIDATED_H0_SOURCE_REQUIRED'using errcode='23514';end if;
 select count(*),jsonb_agg(x)->0 into count_sources,op_source from jsonb_array_elements(root->'sources')x where(x->>'canonicalPayload')::jsonb->>'schemaVersion'='postwar-operating-genesis-seed-source-v1';
 if count_sources<>1 or op_source->>'sourceId'<>base.source_id or op_source->>'payloadHash'<>base.source_payload_hash then raise exception 'POSTWAR_PREFIX_EXACT_OPERATING_SOURCE_REQUIRED'using errcode='23514';end if;
 op:=(op_source->>'canonicalPayload')::jsonb;doc:=op->'carrier'->'socialEmployment';
 if doc->>'schemaVersion'is distinct from 'postwar-social-employment-state-v1'or doc->'inputs'->>'worldId'is distinct from p_world or doc->'inputs'->>'seedId'is distinct from a.seed_id or jsonb_typeof(doc->'countries')is distinct from 'array'then raise exception 'POSTWAR_PREFIX_REAL_FULL_E03_REQUIRED'using errcode='23514';end if;
 for c in select value from jsonb_array_elements(doc->'countries')loop
  body:=jsonb_build_object('countryId',c->>'countryId','positions',c->'state'->'labour'->'positions','aggregates',c->'state'->'labour'->'aggregates','servicePools',c->'state'->'servicePools','offers',c->'offers','minimumWage',c->'minimumWage','populationAvailability',c->'validationReadFacts'->'facts'->'populationAvailability',
   'wages',(select coalesce(jsonb_agg(x order by x->>'positionId'),'[]')from jsonb_array_elements(doc->'inputs'->'labour'->'positions')x where x->>'countryId'=c->>'countryId'),
   'funding',(select coalesce(jsonb_agg(x order by x->>'accountRef'),'[]')from jsonb_array_elements(doc->'inputs'->'fundingAccounts')x where x->>'countryId'=c->>'countryId'),
   'cohorts',(select coalesce(jsonb_agg(distinct x),'[]')from(select r->>'cohortId' as x from jsonb_array_elements(doc->'inputs'->'populationPositionRefs')r where exists(select 1 from jsonb_array_elements(c->'state'->'labour'->'positions')p where p->>'positionId'=r->>'positionId')union select r->>'cohortId'from jsonb_array_elements(c->'dutyAssignments')r)q));
  if jsonb_typeof(body->'populationAvailability')is distinct from 'array'or jsonb_typeof(body->'funding')is distinct from 'array'or jsonb_array_length(body->'funding')=0 then raise exception 'POSTWAR_PREFIX_OWNERSHIP_POPULATION_FUNDING_REQUIRED'using errcode='23514';end if;
  if exists(select 1 from jsonb_array_elements((body->'positions')||(body->'aggregates')||(body->'servicePools')||(body->'populationAvailability')||(body->'funding')||(body->'wages'))x where x->>'countryId'is distinct from c->>'countryId')then raise exception 'POSTWAR_PREFIX_SOURCE_CROSS_COUNTRY'using errcode='23514';end if;
  payload:=world_v2.canonical_json(body);
  insert into world_v2.postwar_social_prefix_scope values(p_world,c->>'countryId',s.seed_fingerprint,a.admission_ref,raw_sha,a.source_bundle_sha256,op_source->>'sourceId',op_source->>'payloadHash',payload,encode(sha256(convert_to(payload,'UTF8')),'hex'));
 end loop;
 -- Actual identifiers, not naming conventions, must have one country owner.
 if exists(select 1 from world_v2.postwar_social_prefix_scope x cross join lateral jsonb_array_elements((x.scope_document::jsonb)->'funding')f where x.world_id=p_world group by f->>'accountRef' having count(distinct x.country_id)>1)
 or exists(select 1 from world_v2.postwar_social_prefix_scope x cross join lateral jsonb_array_elements((x.scope_document::jsonb)->'funding')f where x.world_id=p_world group by f->>'claimId' having count(distinct x.country_id)>1)
 or exists(select 1 from world_v2.postwar_social_prefix_scope x cross join lateral jsonb_array_elements((x.scope_document::jsonb)->'positions')p where x.world_id=p_world group by p->>'positionId' having count(distinct x.country_id)>1)
 or exists(select 1 from world_v2.postwar_social_prefix_scope x cross join lateral jsonb_array_elements((x.scope_document::jsonb)->'servicePools')p where x.world_id=p_world group by p->>'poolId' having count(distinct x.country_id)>1)
 or exists(select 1 from world_v2.postwar_social_prefix_scope x cross join lateral jsonb_array_elements_text((x.scope_document::jsonb)->'cohorts')p where x.world_id=p_world group by p having count(distinct x.country_id)>1)
 then raise exception 'POSTWAR_PREFIX_SOURCE_IDENTIFIERS_SHARE_FOREIGN_OWNER'using errcode='23514';end if;
end;$$;
alter function world_v2.prepare_postwar_social_prefix_scopes(text)owner to world_v2_postwar_projection_owner;
-- Check actual typed Social effects against stored original country ownership.
-- This is a conservative projection scope guard, not a replacement Core reducer.
create function world_v2.postwar_social_prefix_effect_scoped(p_world text,p_country text,p_type text,p_command jsonb,p_event jsonb,p_sequence bigint)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare s jsonb;facts jsonb;intent jsonb;wage jsonb;fund jsonb;offer jsonb;original_offer jsonb;plan jsonb;position_id text;pool_id text;location_id text;begin
 select x.scope_document::jsonb into s from world_v2.postwar_social_prefix_scope x where x.world_id=p_world and x.country_id=p_country;
 if not found or p_event->'command'->>'countryId'is distinct from p_country then return false;end if;
 facts:=p_event->'readFacts';intent:=(p_command->>'canonicalPayload')::jsonb;
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
 or not exists(select 1 from jsonb_array_elements(s->'servicePools')p where p->>'poolId'=pool_id and p->>'countryId'=p_country and p->>'locationId'=location_id and p->>'skill'=intent->>'skill')then return false;end if;
 select x into original_offer from jsonb_array_elements(s->'offers')x where x->>'positionId'=position_id;
 if original_offer is null then
  select (e.canonical_payload::jsonb)->'offer'into original_offer from world_v2.authoritative_event e join world_v2.command_submission c on c.world_id=e.world_id and c.command_id=e.causation_command_id where e.world_id=p_world and c.country_id=p_country and e.event_type='SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1'and e.event_sequence<p_sequence and(e.canonical_payload::jsonb)->'offer'->>'positionId'=position_id;
 end if;
 return original_offer is not null and original_offer=offer;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end;$$;
alter function world_v2.postwar_social_prefix_effect_scoped(text,text,text,jsonb,jsonb,bigint)owner to world_v2_postwar_projection_owner;
-- Reconstruct the same canonical complete frames that the Core validator sees.
-- Both supplied fingerprints are assertion pins; actual stored rows are hashed
-- independently, never trusted caller metadata or a boolean Core-ready flag.
create function world_v2.postwar_social_complete_prefix(p_world text)
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
  if bytes>4194304 or e.event_sequence<>event_seq+1 or e.world_version<>r.world_version_after or e.causation_command_id<>c.command_id or e.sim_time<>c.sim_time or e.correlation_id<>c.correlation_id or e.corrects_event_id is not null or e.event_type not in('SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1','SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1','SOCIAL_JOB_MATCH_SETTLED_V1')then raise exception 'POSTWAR_PREFIX_UNKNOWN_EFFECT_OR_SEQUENCE'using errcode='55000';end if;
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
alter function world_v2.postwar_social_complete_prefix(text)owner to world_v2_postwar_projection_owner;
create function world_v2.postwar_social_origin_at_prefix(p_world text,p_country text)
returns table(state jsonb,binding jsonb,origin_world_version bigint,origin_event_sequence bigint)
language plpgsql security definer set search_path=pg_catalog as $$
declare e record;m record;ep jsonb;st jsonb;key text;begin
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select e0.* into e from world_v2.authoritative_event e0 join world_v2.command_submission c on c.world_id=e0.world_id and c.command_id=e0.causation_command_id where e0.world_id=p_world and c.country_id=p_country and e0.event_type in('SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1','SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1','SOCIAL_JOB_MATCH_SETTLED_V1')order by e0.event_sequence desc limit 1;
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
alter function world_v2.postwar_social_origin_at_prefix(text,text)owner to world_v2_postwar_projection_owner;
create function world_v2.publish_postwar_social_current_prefix_projection(p_world text,p_country text,p_expected_prefix text,p_expected_effects text)
returns setof world_v2.postwar_social_prefix_document language plpgsql security definer set search_path=pg_catalog as $$
declare h record;a record;scope record;prefix record;origin record;coverage world_v2.postwar_social_current_coverage%rowtype;base world_v2.postwar_office_projection_document%rowtype;existing world_v2.postwar_social_prefix_document%rowtype;dataset_name text;items jsonb;item jsonb;buffer jsonb;pages integer;idx integer;off integer;hash text;ref text;coverage_id text;version text;
begin
 select * into strict h from world_v2.lock_postwar_social_current_prefix_publication(p_world,p_country);
 perform world_v2.prepare_postwar_social_prefix_scopes(p_world);
 select * into strict scope from world_v2.postwar_social_prefix_scope x where x.world_id=p_world and x.country_id=p_country;
 select * into strict prefix from world_v2.postwar_social_complete_prefix(p_world);
 if prefix.prefix_fingerprint is distinct from p_expected_prefix or prefix.effects_fingerprint is distinct from p_expected_effects then raise exception 'POSTWAR_PREFIX_PINS_DIFFER_FROM_STORED_COMPLETE_FRAMES'using errcode='23514';end if;
 select * into origin from world_v2.postwar_social_origin_at_prefix(p_world,p_country);
 if not found or origin.origin_world_version>h.world_version::bigint or origin.origin_event_sequence>h.event_sequence::bigint then raise exception 'POSTWAR_PREFIX_ACTUAL_COUNTRY_ORIGIN_REQUIRED'using errcode='55000';end if;
 perform 1 from world_v2.current_materialization x where x.world_id=p_world and x.materialization_key=origin.binding->>'materializationKey'for share;
 coverage_id:='POSTWAR_SOCIAL_COVERAGE_'||upper(encode(sha256(convert_to(world_v2.canonical_json(jsonb_build_array(p_world,p_country,h.seed_fingerprint,h.admission_ref,h.world_version,h.event_sequence,origin.binding,prefix.prefix_fingerprint,prefix.effects_fingerprint,scope.scope_sha256)),'UTF8')),'hex'));
 insert into world_v2.postwar_social_current_coverage values(coverage_id,p_world,p_country,h.world_version::bigint,h.event_sequence::bigint,origin.origin_world_version,origin.origin_event_sequence,h.seed_fingerprint,h.admission_ref,scope.source_bundle_sha256,prefix.prefix_fingerprint,prefix.effects_fingerprint,prefix.last_event_id,prefix.last_event_fingerprint,origin.binding->>'sourceCommandId',origin.binding->>'sourceEventId',origin.binding->>'materializationKey',origin.binding->>'materializationHash',origin.binding->>'canonicalMaterializationSha256',origin.binding,'POSTWAR_SOCIAL_COMPLETE_PREFIX_SCOPE_V2')on conflict(world_id,country_id,world_version,event_sequence)do nothing;
 select * into strict coverage from world_v2.postwar_social_current_coverage x where x.world_id=p_world and x.country_id=p_country and x.world_version=h.world_version::bigint and x.event_sequence=h.event_sequence::bigint;
 if coverage.coverage_ref<>coverage_id then raise exception 'POSTWAR_PREFIX_IMMUTABLE_COVERAGE_CONFLICT'using errcode='23514';end if;
 foreach dataset_name in array array['positions','service-pools']loop
  select * into strict base from world_v2.postwar_office_projection_document d where d.world_id=p_world and d.country_id=p_country and d.office_id='SOCIAL'and d.dataset=dataset_name and d.admission_ref=h.admission_ref and d.seed_fingerprint=h.seed_fingerprint and d.source_bundle_sha256=scope.source_bundle_sha256;
  items:=case dataset_name when'positions'then origin.state->'labour'->'positions'else origin.state->'servicePools'end;
  hash:=encode(sha256(convert_to(items::text,'UTF8')),'hex');ref:='POSTWAR_PREFIX_PROJECTION_'||upper(encode(sha256(convert_to(coverage_id||dataset_name||hash,'UTF8')),'hex'));version:='sha256:'||encode(sha256(convert_to(ref||hash,'UTF8')),'hex');
  select * into existing from world_v2.postwar_social_prefix_document d where d.world_id=p_world and d.country_id=p_country and d.dataset=dataset_name and d.world_version=coverage.world_version and d.event_sequence=coverage.event_sequence;
  if found then if existing.document_ref<>ref then raise exception 'POSTWAR_PREFIX_IMMUTABLE_DOCUMENT_CONFLICT'using errcode='23514';end if;return next existing;continue;end if;
  pages:=1;buffer:='[]';for item in select value from jsonb_array_elements(items)loop
   if octet_length(jsonb_build_array(item)::text)>48000 then raise exception 'POSTWAR_PREFIX_ROW_TOO_LARGE'using errcode='54000';end if;
   if jsonb_array_length(buffer)>=100 or octet_length((buffer||jsonb_build_array(item))::text)>48000 then pages:=pages+1;buffer:='[]';end if;buffer:=buffer||jsonb_build_array(item);
  end loop;
  insert into world_v2.postwar_social_prefix_document values(ref,p_world,p_country,dataset_name,coverage_id,base.document_ref,coverage.world_version,coverage.event_sequence,origin.origin_world_version,coverage.materialization_hash,version,hash,jsonb_array_length(items),pages);
  idx:=0;off:=0;buffer:='[]';for item in select value from jsonb_array_elements(items)loop
   if jsonb_array_length(buffer)>=100 or octet_length((buffer||jsonb_build_array(item))::text)>48000 then
    insert into world_v2.postwar_social_prefix_page values(ref,p_world,idx,off,jsonb_array_length(buffer),buffer::text,encode(sha256(convert_to(buffer::text,'UTF8')),'hex'));off:=off+jsonb_array_length(buffer);idx:=idx+1;buffer:='[]';end if;buffer:=buffer||jsonb_build_array(item);
  end loop;
  insert into world_v2.postwar_social_prefix_page values(ref,p_world,idx,off,jsonb_array_length(buffer),buffer::text,encode(sha256(convert_to(buffer::text,'UTF8')),'hex'));
  select * into strict existing from world_v2.postwar_social_prefix_document where document_ref=ref;return next existing;
 end loop;
end;$$;
alter function world_v2.publish_postwar_social_current_prefix_projection(text,text,text,text)owner to world_v2_postwar_projection_owner;
create function world_v2.postwar_social_prefix_coverage_json(c world_v2.postwar_social_current_coverage)
returns jsonb language sql immutable set search_path=pg_catalog as $$
 select jsonb_build_object('schemaVersion','postwar-social-current-prefix-coverage-v2','reducerVersion',c.reducer_version,'coverageRef',c.coverage_ref,'countryId',c.country_id,'globalWorldVersion',c.world_version::text,'globalEventSequence',c.event_sequence::text,'originWorldVersion',c.origin_world_version::text,'originEventSequence',c.origin_event_sequence::text,'prefixFingerprint',c.prefix_fingerprint,'knownEffectsFingerprint',c.effects_fingerprint,'coveredThroughEventId',c.covered_through_event_id,'coveredThroughEventFingerprint',c.covered_through_event_fingerprint);
$$;
alter function world_v2.postwar_social_prefix_coverage_json(world_v2.postwar_social_current_coverage)owner to world_v2_postwar_projection_owner;
alter function world_v2.read_postwar_office_projection_page(text,text,text,integer,integer,text)rename to read_postwar_office_projection_v1_page;
revoke all on function world_v2.read_postwar_office_projection_v1_page(text,text,text,integer,integer,text)from public,world_v2_postwar_projection_reader;
create function world_v2.read_postwar_office_projection_page(p_world text,p_office text,p_dataset text,p_offset integer,p_limit integer,p_expected_version text default null)
returns table(status text,scope_json jsonb,source_json jsonb,page_json jsonb,rows_text text)
language plpgsql security definer set search_path=pg_catalog as $$
declare s record;origin record;d world_v2.postwar_social_prefix_document%rowtype;c world_v2.postwar_social_current_coverage%rowtype;b world_v2.postwar_office_projection_document%rowtype;p world_v2.postwar_social_prefix_page%rowtype;items jsonb;selected jsonb;expected_page jsonb;returned integer;
begin
 if p_offset is null or p_limit is null or p_offset<0 or p_offset>100000 or p_limit<1 or p_limit>100 then raise exception 'POSTWAR_INVALID_PAGE'using errcode='22023';end if;
 -- V1 handles H0 and unsupported datasets exactly as before, including STALE.
 if p_office<>'SOCIAL'or p_dataset not in('positions','service-pools')then return query select * from world_v2.read_postwar_office_projection_v1_page(p_world,p_office,p_dataset,p_offset,p_limit,p_expected_version);return;end if;
 select * into s from world_v2.read_postwar_office_projection_seats(p_world)x where x.office_id='SOCIAL'and exists(select 1 from world_v2.current_commit_authorization a where a.world_id=x.world_id and a.auth_subject::text=x.auth_subject and a.country_id=x.country_id and a.office_id='SOCIAL'and a.team_id=x.team_id and a.authorization_version=x.authorization_revision and a.capability='SOCIAL_LABOUR'and a.active);
 if not found then return query select 'DENIED',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into d from world_v2.postwar_social_prefix_document x where x.world_id=p_world and x.country_id=s.country_id and x.dataset=p_dataset and x.world_version=s.world_version::bigint and x.event_sequence=s.event_sequence::bigint;
 if not found then return query select * from world_v2.read_postwar_office_projection_v1_page(p_world,p_office,p_dataset,p_offset,p_limit,p_expected_version);return;end if;
 select * into c from world_v2.postwar_social_current_coverage x where x.coverage_ref=d.coverage_ref and x.world_id=p_world and x.country_id=s.country_id and x.world_version=s.world_version::bigint and x.event_sequence=s.event_sequence::bigint and x.seed_fingerprint=s.seed_fingerprint and x.admission_ref=s.admission_ref and x.source_bundle_sha256=s.source_bundle_sha256;
 if not found or not exists(select 1 from world_v2.authoritative_event e where e.world_id=p_world and e.event_id=c.covered_through_event_id and e.event_fingerprint=c.covered_through_event_fingerprint and e.event_sequence=c.event_sequence and e.world_version=c.world_version)then return query select 'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into origin from world_v2.postwar_social_origin_at_prefix(p_world,s.country_id);
 if not found or origin.binding<>c.binding or origin.origin_world_version<>c.origin_world_version or origin.origin_event_sequence<>c.origin_event_sequence then return query select 'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into b from world_v2.postwar_office_projection_document x where x.document_ref=d.base_document_ref and x.world_id=p_world and x.country_id=s.country_id and x.office_id='SOCIAL'and x.dataset=p_dataset and x.admission_ref=s.admission_ref and x.seed_fingerprint=s.seed_fingerprint and x.source_bundle_sha256=s.source_bundle_sha256 and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.world_id=p_world and r.document_ref=x.document_ref);
 if not found then return query select 'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 items:=case p_dataset when'positions'then origin.state->'labour'->'positions'else origin.state->'servicePools'end;
 if d.total_rows<>jsonb_array_length(items)or d.document_sha256<>encode(sha256(convert_to(items::text,'UTF8')),'hex')then return query select 'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 if p_expected_version is not null and p_expected_version<>d.source_version then return query select 'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into p from world_v2.postwar_social_prefix_page x where x.document_ref=d.document_ref and x.row_offset<=p_offset and(p_offset<x.row_offset+x.row_count or d.total_rows=0)order by x.page_index desc limit 1;
 if p_offset>=d.total_rows then selected:='[]';else
  if p.document_ref is null then return query select 'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
  select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb)into expected_page from jsonb_array_elements(items)with ordinality where ordinality>p.row_offset and ordinality<=p.row_offset+p.row_count;
  if expected_page is distinct from p.rows_text::jsonb or p.page_sha256<>encode(sha256(convert_to(p.rows_text,'UTF8')),'hex')then return query select 'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
  select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb)into selected from jsonb_array_elements(p.rows_text::jsonb)with ordinality where ordinality>p_offset-p.row_offset and ordinality<=p_offset-p.row_offset+p_limit;
 end if;returned:=jsonb_array_length(selected);
 return query select case when returned=0 then'EMPTY'else'PAGE'end,
 jsonb_build_object('worldId',s.world_id,'countryId',s.country_id,'officeId',s.office_id,'authSubject',s.auth_subject,'teamId',s.team_id,'authorizationVersion',s.authorization_revision,'scopeKey',s.scope_key,'seatRef',s.seat_ref),
 jsonb_build_object('dataNature','ADMITTED_CURRENT_SOCIAL_DERIVED_FROM_COMMITTED_EVENT_MATERIALIZATION','sourceVersion',d.source_version,'sourceRevision',b.source_revision,'seedId',b.seed_id,'seedFingerprint',b.seed_fingerprint,'admissionRef',b.admission_ref,'modelVersion',b.model_version,'replayBinding',b.replay_binding,'sourceBundleSha256',b.source_bundle_sha256,'canonicalSeedSha256',b.canonical_seed_sha256,'worldVersion',d.world_version::text,'eventSequence',d.event_sequence::text,'pageHash',coalesce(p.page_sha256,encode(sha256(convert_to('[]','UTF8')),'hex')),'returnedRowsHash',encode(sha256(convert_to(selected::text,'UTF8')),'hex'),'hashAlgorithm','POSTGRES_JSONB_TEXT_UTF8_SHA256','sourcePointer',jsonb_build_object('table','current_materialization','key',c.materialization_key,'path',(case when c.materialization_key like'SOCIAL_POSITION_LIFECYCLE_%'then'employment.'else''end)||case p_dataset when'positions'then'labour.positions'else'servicePools'end),'currentStateBinding',c.binding,'currentPrefixCoverage',world_v2.postwar_social_prefix_coverage_json(c)),
 jsonb_build_object('offset',p_offset,'limit',p_limit,'returned',returned,'total',d.total_rows,'nextOffset',case when p_offset+returned<d.total_rows then p_offset+returned else null end),selected::text;
end;$$;
alter function world_v2.read_postwar_office_projection_page(text,text,text,integer,integer,text)owner to world_v2_postwar_projection_owner;
grant select on world_v2.inventory_posting,world_v2.financial_posting_batch to world_v2_postwar_projection_owner;
do $$declare t text;begin foreach t in array array['inventory_posting','financial_posting_batch']loop
 execute format('create policy %I on world_v2.%I for select to world_v2_postwar_projection_owner using(world_id=current_setting(''econmind.postwar_projection_world'',true))','postwar_prefix_owner_'||t,t);
 execute format('create policy %I on world_v2.%I as restrictive for select to world_v2_postwar_projection_owner using(world_id=current_setting(''econmind.postwar_projection_world'',true))','postwar_prefix_world_'||t,t);
end loop;end;$$;
revoke all on function world_v2.lock_postwar_social_current_prefix_publication(text,text),world_v2.prepare_postwar_social_prefix_scopes(text),world_v2.postwar_social_prefix_effect_scoped(text,text,text,jsonb,jsonb,bigint),world_v2.postwar_social_complete_prefix(text),world_v2.postwar_social_origin_at_prefix(text,text),world_v2.publish_postwar_social_current_prefix_projection(text,text,text,text),world_v2.postwar_social_prefix_coverage_json(world_v2.postwar_social_current_coverage),world_v2.read_postwar_office_projection_page(text,text,text,integer,integer,text)from public;
grant execute on function world_v2.lock_postwar_social_current_prefix_publication(text,text),world_v2.publish_postwar_social_current_prefix_projection(text,text,text,text)to world_v2_postwar_projection_publisher;
grant execute on function world_v2.read_postwar_office_projection_page(text,text,text,integer,integer,text)to world_v2_postwar_projection_reader;
revoke create on schema world_v2 from world_v2_postwar_projection_owner;
commit;
