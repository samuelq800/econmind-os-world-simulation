-- SOURCE-ONLY candidate. Requires Finance custody/capacity only. No installation, memberships, new policy/admission,
-- monetary balance, caller rows, or runtime raw-seed privilege is issued here.
begin;
grant create on schema world_v2 to world_v2_finance_budget_source_owner;
create table world_v2.finance_budget_mixed_social_original(
 world_id text not null,country_id text not null,source_ref text not null unique,
 seed_fingerprint text not null,admission_ref text not null,canonical_seed_sha256 text not null,
 source_text text not null check(octet_length(source_text)<=262144),
 source_sha256 text not null check(source_sha256=encode(sha256(convert_to(source_text,'UTF8')),'hex')),
 scope_document text not null check(octet_length(scope_document)<=262144),
 scope_sha256 text not null check(scope_sha256=encode(sha256(convert_to(scope_document,'UTF8')),'hex')),
 primary key(world_id,country_id),foreign key(world_id,seed_fingerprint)references world_v2.opening_seed(world_id,seed_fingerprint)
);
alter table world_v2.finance_budget_mixed_social_original owner to world_v2_finance_budget_source_owner;
revoke all on world_v2.finance_budget_mixed_social_original from public,world_v2_finance_budget_source_reader,world_v2_finance_budget_source_publisher;
create trigger budget_mixed_original_immutable before update or delete on world_v2.finance_budget_mixed_social_original for each row execute function world_v2.finance_budget_original_immutable();
create trigger budget_mixed_original_truncate_immutable before truncate on world_v2.finance_budget_mixed_social_original for each statement execute function world_v2.finance_budget_original_immutable();
-- These are private fixed-owner reads, not raw event/command grants to the
-- runtime reader. The original global H lock precedes this source inspection.
grant select on world_v2.authoritative_event,world_v2.command_submission to world_v2_finance_budget_source_owner;
create policy budget_mixed_owner_event on world_v2.authoritative_event for select to world_v2_finance_budget_source_owner using(world_id=current_setting('econmind.finance_budget_source_world',true));
create policy budget_mixed_owner_command on world_v2.command_submission for select to world_v2_finance_budget_source_owner using(world_id=current_setting('econmind.finance_budget_source_world',true));
create policy budget_mixed_owner_event_world on world_v2.authoritative_event as restrictive for select to world_v2_finance_budget_source_owner using(world_id=current_setting('econmind.finance_budget_source_world',true));
create policy budget_mixed_owner_command_world on world_v2.command_submission as restrictive for select to world_v2_finance_budget_source_owner using(world_id=current_setting('econmind.finance_budget_source_world',true));
create function world_v2.publish_finance_budget_mixed_social_originals(p_world text,p_seed_fingerprint text,p_admission_ref text,p_canonical_sha256 text)
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;s world_v2.opening_seed%rowtype;a world_v2.runtime_opening_admission%rowtype;q world_v2.runtime_admission_publication_permit%rowtype;root json;op_source json;doc_json json;doc jsonb;c jsonb;funding_all jsonb;wages_all jsonb;cohorts_by_country jsonb;funding jsonb;scope_body jsonb;scope_bytes text;scope_hash text;body jsonb;bytes text;hash text;ref text;n integer:=0;old world_v2.finance_budget_mixed_social_original%rowtype;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_finance_budget_source_publisher','MEMBER')or pg_has_role(effective,'world_v2_finance_budget_source_reader','MEMBER')or pg_has_role(effective,'world_v2_finance_budget_source_owner','MEMBER')then raise exception 'BUDGET_CONTROLLED_MIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.finance_budget_source_world',p_world,true);
 select * into strict s from world_v2.opening_seed x where x.world_id=p_world and x.seed_fingerprint=p_seed_fingerprint and x.opening_world_version=0;
 if encode(sha256(convert_to(s.canonical_payload,'UTF8')),'hex')<>p_canonical_sha256 or s.seed_fingerprint<>'sha256:'||encode(sha256(convert_to(E'SHA-256\n'||s.canonical_payload,'UTF8')),'hex')then raise exception 'BUDGET_MIXED_CANONICAL_HASH_MISMATCH'using errcode='23514';end if;
 select * into strict a from world_v2.runtime_opening_admission x where x.world_id=s.world_id and x.seed_id=s.seed_id and x.seed_fingerprint=s.seed_fingerprint and x.admission_ref=p_admission_ref and x.replay_binding=s.replay_binding;
 select p.* into q from world_v2.runtime_admission_publication_permit p where 'ADMISSION_'||upper(p.authorization_sha256)=a.admission_ref and p.world_id=a.world_id and p.seed_id=a.seed_id and p.seed_fingerprint=a.seed_fingerprint and p.model_version=a.model_version and p.replay_binding=a.replay_binding and a.admitted_at_real>=p.valid_from and a.admitted_at_real<p.valid_until for share;
 if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=q.authorization_id)then raise exception 'BUDGET_MIXED_ACTUAL_ADMISSION_REQUIRED'using errcode='42501';end if;
 -- Offline once directly from the same admitted seed, even at H>0. No fake
 -- H0 projection publication, head rewind, or caller rows are involved.
 root:=s.canonical_payload::json;
 select x into strict op_source from json_array_elements(root->'sources')x where(x->>'canonicalPayload')::json->>'schemaVersion'='postwar-operating-genesis-seed-source-v1';
 if op_source->>'payloadHash'<>'sha256:'||encode(sha256(convert_to(E'SHA-256\n{"payload":'||(op_source->>'canonicalPayload')||'}','UTF8')),'hex')then raise exception 'BUDGET_MIXED_SOURCE_HASH_MISMATCH'using errcode='23514';end if;
 doc_json:=(op_source->>'canonicalPayload')::json->'carrier'->'socialEmployment';
 -- Only the extracted Social document is indexed, never the 124 MB root.
 -- This is offline bounded source preparation; online rows remain <=256 KiB.
 if octet_length(doc_json::text)>67108864 then raise exception 'BUDGET_MIXED_SOCIAL_DOCUMENT_CAPACITY_EXCEEDED'using errcode='54000';end if;
 doc:=doc_json::jsonb;
 funding_all:=doc->'inputs'->'fundingAccounts';wages_all:=doc->'inputs'->'labour'->'positions';
 -- Position -> country is read from the actual country state, not inferred
 -- from an identifier or all nationally employed source positions.
 select coalesce(jsonb_object_agg(q0.country_id,q0.cohorts),'{}'::jsonb)into cohorts_by_country from(
  select q1.country_id,jsonb_agg(distinct q1.cohort_id)as cohorts from(
   select c0->>'countryId'as country_id,r->>'cohortId'as cohort_id
    from jsonb_array_elements(doc->'countries')c0
    cross join lateral jsonb_array_elements(c0->'state'->'labour'->'positions')p0
    join jsonb_array_elements(doc->'inputs'->'populationPositionRefs')r on r->>'positionId'=p0->>'positionId'
   union
   select c0->>'countryId',r->>'cohortId'from jsonb_array_elements(doc->'countries')c0
    cross join lateral jsonb_array_elements(c0->'dutyAssignments')r
  )q1 group by q1.country_id
 )q0;
 if doc->>'schemaVersion'is distinct from 'postwar-social-employment-state-v1'or doc->'inputs'->>'worldId'is distinct from p_world or doc->'inputs'->>'seedId'is distinct from s.seed_id then raise exception 'BUDGET_MIXED_ACTUAL_E03_REQUIRED'using errcode='23514';end if;
 for c in select value from jsonb_array_elements(doc->'countries')loop
  if octet_length((c->'state')::text)>262144 or octet_length((c->'offers')::text)>262144 then raise exception 'BUDGET_MIXED_COUNTRY_CAPACITY_EXCEEDED'using errcode='54000';end if;
  select coalesce(jsonb_agg(x::jsonb order by x->>'accountRef'),'[]'::jsonb)into funding from jsonb_array_elements(funding_all)x where x->>'countryId'=c->>'countryId'and x->>'payerRole'='GOV';
  scope_body:=jsonb_build_object('countryId',c->>'countryId','positions',(c->'state'->'labour'->'positions')::jsonb,'aggregates',(c->'state'->'labour'->'aggregates')::jsonb,'servicePools',(c->'state'->'servicePools')::jsonb,'offers',(c->'offers')::jsonb,'minimumWage',(c->'minimumWage')::jsonb,'populationAvailability',(c->'validationReadFacts'->'facts'->'populationAvailability')::jsonb,
   'wages',(select coalesce(jsonb_agg(x::jsonb order by x->>'positionId'),'[]'::jsonb)from jsonb_array_elements(wages_all)x where x->>'countryId'=c->>'countryId'),
   'funding',(select coalesce(jsonb_agg(x::jsonb order by x->>'accountRef'),'[]'::jsonb)from jsonb_array_elements(funding_all)x where x->>'countryId'=c->>'countryId'),
   'cohorts',coalesce(cohorts_by_country->(c->>'countryId'),'[]'::jsonb));
  if jsonb_typeof(scope_body->'populationAvailability')is distinct from 'array'or jsonb_typeof(scope_body->'funding')is distinct from 'array'or jsonb_array_length(scope_body->'funding')=0 or exists(select 1 from jsonb_array_elements((scope_body->'positions')||(scope_body->'aggregates')||(scope_body->'servicePools')||(scope_body->'populationAvailability')||(scope_body->'funding')||(scope_body->'wages'))x where x->>'countryId'is distinct from c->>'countryId')then raise exception 'BUDGET_MIXED_ORIGINAL_COUNTRY_SCOPE_INVALID'using errcode='23514';end if;
  scope_bytes:=scope_body::text;scope_hash:=encode(sha256(convert_to(scope_bytes,'UTF8')),'hex');
  body:=jsonb_build_object('schemaVersion','finance-budget-mixed-social-source-v1','worldId',p_world,'countryId',c->>'countryId','seedId',s.seed_id,'seedFingerprint',s.seed_fingerprint,'admissionRef',a.admission_ref,'canonicalSeedSha256','sha256:'||p_canonical_sha256,'sourceBundleSha256',q.source_bundle_sha256,'operatingSourceId',op_source->>'sourceId','operatingSourcePayloadHash',op_source->>'payloadHash','state',(c->'state')::jsonb,'offers',(c->'offers')::jsonb,'fundingAccounts',funding,'scopeSha256',scope_hash);
  bytes:=body::text;hash:=encode(sha256(convert_to(bytes,'UTF8')),'hex');ref:='BUDGET_MIXED_SOCIAL_'||upper(encode(sha256(convert_to(s.seed_fingerprint||E'\n'||(c->>'countryId'),'UTF8')),'hex'));
  select * into old from world_v2.finance_budget_mixed_social_original x where x.world_id=p_world and x.country_id=c->>'countryId';
  if found then
   if old.source_ref<>ref or old.source_sha256<>hash or old.admission_ref<>a.admission_ref or old.seed_fingerprint<>s.seed_fingerprint or old.scope_sha256<>scope_hash then raise exception 'BUDGET_MIXED_IMMUTABLE_SOURCE_CONFLICT'using errcode='23514';end if;
  else insert into world_v2.finance_budget_mixed_social_original values(p_world,c->>'countryId',ref,s.seed_fingerprint,a.admission_ref,p_canonical_sha256,bytes,hash,scope_bytes,scope_hash);end if;
  n:=n+1;
 end loop;
 if n<>70 or(select count(*)from world_v2.finance_budget_mixed_social_original x where x.world_id=p_world and x.seed_fingerprint=s.seed_fingerprint and x.admission_ref=a.admission_ref)<>70 then raise exception 'BUDGET_MIXED_COMPLETE_SOURCE_ROSTER_REQUIRED'using errcode='23514';end if;
 -- Exact original identifiers have one country owner globally, including
 -- countries absent from the current bounded prefix and the online response.
 if exists(select 1 from world_v2.finance_budget_mixed_social_original x cross join lateral jsonb_array_elements(x.scope_document::jsonb->'funding')f where x.world_id=p_world group by f->>'accountRef' having count(distinct x.country_id)>1)
 or exists(select 1 from world_v2.finance_budget_mixed_social_original x cross join lateral jsonb_array_elements(x.scope_document::jsonb->'funding')f where x.world_id=p_world group by f->>'claimId' having count(distinct x.country_id)>1)
 or exists(select 1 from world_v2.finance_budget_mixed_social_original x cross join lateral jsonb_array_elements(x.scope_document::jsonb->'positions')f where x.world_id=p_world group by f->>'positionId' having count(distinct x.country_id)>1)
 or exists(select 1 from world_v2.finance_budget_mixed_social_original x cross join lateral jsonb_array_elements(x.scope_document::jsonb->'servicePools')f where x.world_id=p_world group by f->>'poolId' having count(distinct x.country_id)>1)
 or exists(select 1 from world_v2.finance_budget_mixed_social_original x cross join lateral jsonb_array_elements_text(x.scope_document::jsonb->'cohorts')f where x.world_id=p_world group by f having count(distinct x.country_id)>1)
 then raise exception 'BUDGET_MIXED_GLOBAL_ORIGINAL_OWNERSHIP_COLLISION'using errcode='23514';end if;
 return n;
end;$$;
-- Same existing Social source-scope predicates, now over this directly sealed
-- admitted-source index. No H0 read projection is used as economic authority.
create function world_v2.finance_budget_mixed_social_effect_scoped(p_world text,p_country text,p_type text,p_command jsonb,p_event jsonb,p_sequence bigint)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare s jsonb;facts jsonb;intent jsonb;wage jsonb;fund jsonb;offer jsonb;original_offer jsonb;plan jsonb;position_id text;pool_id text;location_id text;begin
 select x.scope_document::jsonb into s from world_v2.finance_budget_mixed_social_original x where x.world_id=p_world and x.country_id=p_country;
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
  if exists(select 1 from world_v2.finance_budget_mixed_social_original x cross join lateral jsonb_array_elements(x.scope_document::jsonb->'positions')p where x.world_id=p_world and x.country_id<>p_country and p->>'positionId'=position_id)
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
alter function world_v2.finance_budget_mixed_social_effect_scoped(text,text,text,jsonb,jsonb,bigint)owner to world_v2_finance_budget_source_owner;
revoke all on function world_v2.finance_budget_mixed_social_effect_scoped(text,text,text,jsonb,jsonb,bigint)from public;

-- Private scoped validator uses the new all-country immutable source index. It
-- checks actual stored events, not a caller boolean or arbitrary effect DTO.
create function world_v2.assert_finance_budget_mixed_social_scope(p_world text,p_finance_country text,p_country text,p_seed_fingerprint text,p_admission_ref text,p_canonical_sha256 text)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare scope world_v2.finance_budget_mixed_social_original%rowtype;r record;command jsonb;
begin
 perform set_config('econmind.finance_budget_source_world',p_world,true);
 if p_country<>p_finance_country and not exists(select 1 from world_v2.authoritative_event e join world_v2.command_submission c on c.world_id=e.world_id and c.command_id=e.causation_command_id where e.world_id=p_world and c.country_id=p_country and e.event_type in('FINANCE_NATIVE_BUDGET_ENVELOPE_SET_V1','FINANCE_NATIVE_BUDGET_LINE_CREATED_V1','FINANCE_NATIVE_BUDGET_APPROPRIATED_V1','FINANCE_NATIVE_BUDGET_LINE_INITIALIZED_V1','SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1','SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1','SOCIAL_JOB_MATCH_SETTLED_V1'))then raise exception 'BUDGET_MIXED_ACTUAL_PARTICIPANT_REQUIRED'using errcode='42501';end if;
 select * into strict scope from world_v2.finance_budget_mixed_social_original x where x.world_id=p_world and x.country_id=p_country for share;
 if scope.seed_fingerprint<>p_seed_fingerprint or scope.admission_ref<>p_admission_ref or scope.canonical_seed_sha256<>p_canonical_sha256 or scope.scope_sha256<>encode(sha256(convert_to(scope.scope_document,'UTF8')),'hex')then raise exception 'BUDGET_MIXED_SCOPE_SOURCE_MISMATCH'using errcode='23514';end if;
 for r in select e.event_type,e.event_sequence,e.canonical_payload as event_payload,c.canonical_payload as command_payload,c.command_type,c.office_id from world_v2.authoritative_event e join world_v2.command_submission c on c.world_id=e.world_id and c.command_id=e.causation_command_id where e.world_id=p_world and c.country_id=p_country and e.event_type in('SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1','SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1','SOCIAL_JOB_MATCH_SETTLED_V1')order by e.event_sequence limit 257 loop
  if r.event_sequence>256 or octet_length(r.event_payload)>65536 or octet_length(r.command_payload)>16384 then raise exception 'BUDGET_MIXED_SCOPE_PREFIX_CAPACITY_EXCEEDED'using errcode='54000';end if;
  command:=jsonb_build_object('canonicalPayload',r.command_payload,'commandType',r.command_type,'officeId',r.office_id);
  if not world_v2.finance_budget_mixed_social_effect_scoped(p_world,p_country,r.event_type,command,r.event_payload::jsonb,r.event_sequence)then raise exception 'BUDGET_MIXED_ACTUAL_SOCIAL_SCOPE_INVALID'using errcode='23514';end if;
 end loop;
end;$$;
alter function world_v2.assert_finance_budget_mixed_social_scope(text,text,text,text,text,text)owner to world_v2_finance_budget_source_owner;
revoke all on function world_v2.assert_finance_budget_mixed_social_scope(text,text,text,text,text,text)from public;

create function world_v2.read_finance_budget_mixed_social_original(p_world text,p_finance_country text,p_participant_country text,p_envelope text,p_period text,p_worker text,p_at timestamptz)
returns table(source_ref text,source_text text,source_sha256 text)
language plpgsql security definer set search_path=pg_catalog as $$
declare h record;s world_v2.finance_budget_mixed_social_original%rowtype;subject uuid;
begin
 subject:=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
 if subject is null then raise exception 'BUDGET_MIXED_VERIFIED_SUBJECT_REQUIRED'using errcode='42501';end if;
 -- Existing lease -> H -> exact Finance seat/entitlement/policy/admission locks.
 select * into strict h from world_v2.lock_finance_budget_policy(p_world,p_finance_country,p_envelope,p_period,p_worker,p_at,subject);
 select * into strict s from world_v2.finance_budget_mixed_social_original x where x.world_id=p_world and x.country_id=p_participant_country and x.seed_fingerprint=h.seed_fingerprint and x.admission_ref=h.admission_ref for share;
 perform world_v2.assert_finance_budget_mixed_social_scope(p_world,p_finance_country,p_participant_country,h.seed_fingerprint,h.admission_ref,s.canonical_seed_sha256);
 return query select s.source_ref,s.source_text,s.source_sha256;
end;$$;
alter function world_v2.publish_finance_budget_mixed_social_originals(text,text,text,text)owner to world_v2_finance_budget_source_owner;
alter function world_v2.read_finance_budget_mixed_social_original(text,text,text,text,text,text,timestamptz)owner to world_v2_finance_budget_source_owner;
revoke all on function world_v2.publish_finance_budget_mixed_social_originals(text,text,text,text),world_v2.read_finance_budget_mixed_social_original(text,text,text,text,text,text,timestamptz)from public;
grant execute on function world_v2.publish_finance_budget_mixed_social_originals(text,text,text,text)to world_v2_finance_budget_source_publisher;
grant execute on function world_v2.read_finance_budget_mixed_social_original(text,text,text,text,text,text,timestamptz)to world_v2_finance_budget_source_reader;
revoke create on schema world_v2 from world_v2_finance_budget_source_owner;
commit;
