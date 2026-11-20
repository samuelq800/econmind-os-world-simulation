-- SOURCE-ONLY candidate: immutable independent-service orders, never WORK or
-- payment facts. Existing Industry roles only; no membership/raw/runtime grant.
-- Requires Industry firstday source and run-history (owner journal access).
-- Install the selected source-revocation fence before invoking either RPC.
begin;
grant create on schema world_v2 to world_v2_industry_source_owner;
create table world_v2.postwar_industry_logistics_order(
 world_id text not null,country_id text not null,facility_id text not null,run_id text not null,transfer_id text not null,
 kind text not null check(kind in('WORK','PAY')),original_ref text not null,original_text text not null,
 original_sha256 text not null check(original_sha256~'^[a-f0-9]{64}$'and original_sha256=encode(sha256(convert_to(original_text,'UTF8')),'hex')),
 registration_ref text not null,seed_fingerprint text not null,admission_ref text not null,
 check(octet_length(original_text)between 1 and 65536),primary key(world_id,original_ref),
 foreign key(world_id,registration_ref)references world_v2.postwar_industry_original(world_id,registration_ref)
);
create unique index postwar_industry_logistics_one_work_order on world_v2.postwar_industry_logistics_order(world_id,country_id,facility_id,run_id,transfer_id)where kind='WORK';
alter table world_v2.postwar_industry_logistics_order owner to world_v2_industry_source_owner;
alter table world_v2.postwar_industry_logistics_order enable row level security;
alter table world_v2.postwar_industry_logistics_order force row level security;
revoke all on world_v2.postwar_industry_logistics_order from public,world_v2_industry_source_reader,world_v2_industry_source_publisher;
create policy industry_logistics_order_owner on world_v2.postwar_industry_logistics_order to world_v2_industry_source_owner
 using(current_user='world_v2_industry_source_owner'and world_id=current_setting('econmind.industry_source_world',true))
 with check(current_user='world_v2_industry_source_owner'and world_id=current_setting('econmind.industry_source_world',true));
create trigger industry_logistics_order_immutable before update or delete on world_v2.postwar_industry_logistics_order for each row execute function world_v2.reject_authoritative_history_mutation();
create trigger industry_logistics_order_no_truncate before truncate on world_v2.postwar_industry_logistics_order for each statement execute function world_v2.reject_authoritative_history_mutation();

-- Private shared custody entry: fence FIRST, then actual head/admission and
-- immutable registered firstday source. No caller-ready or clock assertion.
create function world_v2.postwar_industry_logistics_order_scope(p_world text,p_country text,p_facility text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare h record;a world_v2.runtime_opening_admission%rowtype;r world_v2.postwar_industry_original%rowtype;s world_v2.postwar_industry_first_day_source%rowtype;body jsonb;
begin
 if current_setting('transaction_isolation')not in('repeatable read','serializable')or current_setting('transaction_read_only')<>'off'then raise exception 'LOGISTICS_ORDER_HELD_WRITE_RR_REQUIRED'using errcode='25001';end if;
 if p_world is null or p_world!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or p_country is null or p_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or p_facility is distinct from 'OPEN-'||substring(p_country from 9 for 2)||'-REFINED_FUEL'then raise exception 'LOGISTICS_ORDER_EXACT_ADOPTED_SCOPE_REQUIRED'using errcode='22023';end if;
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 perform set_config('econmind.industry_source_world',p_world,true);
 select x.world_version,x.event_sequence into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found then raise exception 'LOGISTICS_ORDER_CURRENT_WORLD_REQUIRED'using errcode='55000';end if;
 a:=world_v2.industry_source_admission(p_world);
 select * into r from world_v2.postwar_industry_original x where x.world_id=p_world and x.country_id=p_country and x.facility_id=p_facility and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref for share;
 if not found or exists(select 1 from world_v2.postwar_industry_original_revocation v where v.world_id=p_world and v.registration_ref=r.registration_ref)then raise exception 'LOGISTICS_ORDER_CURRENT_SITE_REVOKED'using errcode='55000';end if;
 select * into s from world_v2.postwar_industry_first_day_source x where x.world_id=p_world and x.country_id=p_country and x.facility_id=p_facility and x.registration_ref=r.registration_ref and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref for share;
 if not found or s.source_sha256<>encode(sha256(convert_to(s.source_text,'UTF8')),'hex')or exists(select 1 from world_v2.postwar_industry_first_day_source_revocation v where v.world_id=p_world and v.source_ref=s.source_ref)then raise exception 'LOGISTICS_ORDER_CURRENT_FIRSTDAY_REVOKED'using errcode='55000';end if;
 body:=s.source_text::jsonb;
 if body->>'worldId'is distinct from p_world or body->>'countryId'is distinct from p_country or body->>'facilityId'is distinct from p_facility or coalesce(body->>'operatorId','')=''then raise exception 'LOGISTICS_ORDER_IMMUTABLE_SITE_SCOPE_CHANGED'using errcode='23514';end if;
 return jsonb_build_object('worldVersion',h.world_version::text,'eventSequence',h.event_sequence::text,'seedId',a.seed_id,'seedFingerprint',a.seed_fingerprint,'admissionRef',a.admission_ref,'registrationRef',r.registration_ref,'operatorId',body->>'operatorId','firstdaySourceRef',s.source_ref,'firstdaySourceSha256',s.source_sha256);
end;$$;
alter function world_v2.postwar_industry_logistics_order_scope(text,text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.postwar_industry_logistics_order_scope(text,text,text)from public;

-- Exact immutable ledger witness. Unknown/uncommitted/ambiguous stages are
-- never manufactured into COMMITTED originals. Core still replays the complete
-- mixed prefix and both journals on the same held source before execution.
create function world_v2.postwar_industry_logistics_committed_stage(p_world text,p_country text,p_facility text,p_run text,p_transfer text,p_action text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare n bigint;result jsonb;
begin
 if p_action not in('RUN','BOOK','SHIP','SERVICE_WORK')then raise exception 'LOGISTICS_ORDER_KNOWN_STAGE_REQUIRED'using errcode='22023';end if;
 select count(*),jsonb_agg(jsonb_build_object('commandId',c.command_id,'commandFingerprint',c.command_fingerprint,'intent',c.canonical_payload::jsonb,'body',e.canonical_payload::jsonb,'eventFingerprint',e.event_fingerprint,'eventSequence',e.event_sequence::text,'worldVersion',e.world_version::text,'simTime',e.sim_time::text))->0 into n,result
 from world_v2.command_submission c
 join world_v2.command_receipt r on r.world_id=c.world_id and r.command_id=c.command_id and r.command_fingerprint=c.command_fingerprint and r.outcome='COMMITTED'and r.world_version_before=c.expected_world_version and r.world_version_after=r.world_version_before+1
 join world_v2.authoritative_event e on e.world_id=c.world_id and e.causation_command_id=c.command_id and e.event_id=r.event_ids->>0 and e.world_version=r.world_version_after and e.correlation_id=c.correlation_id and e.sim_time=c.sim_time
 join world_v2.world_head h on h.world_id=c.world_id and e.world_version<=h.world_version and e.event_sequence<=h.event_sequence
 where c.world_id=p_world and c.country_id=p_country and c.office_id='INDUSTRY'and jsonb_array_length(r.event_ids)=1
 and c.payload_sha256='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||c.canonical_payload,'UTF8')),'hex')
 and e.payload_sha256='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||e.canonical_payload,'UTF8')),'hex')
 and((p_action='RUN'and c.command_type='CORE_INDUSTRY_RUN_SCHEDULE_V1'and e.event_type='INDUSTRY_FIRST_DAY_RUN_SCHEDULED_V1'and e.canonical_payload::jsonb->'terms'->>'facilityId'=p_facility and e.canonical_payload::jsonb->'terms'->>'runId'=p_run)
 or(p_action<>'RUN'and c.command_type='INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTE_V1'and e.event_type='INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTED_V1'and c.canonical_payload::jsonb->>'schemaVersion'='industry-first-day-utility-command-v1'and c.canonical_payload::jsonb->>'serviceKind'='LOGISTICS'and c.canonical_payload::jsonb->>'facilityId'=p_facility and c.canonical_payload::jsonb->>'runId'=p_run and c.canonical_payload::jsonb->'operation'->>'action'=p_action and c.canonical_payload::jsonb->'operation'->>'transferId'=p_transfer and e.canonical_payload::jsonb->>'action'=p_action and e.canonical_payload::jsonb->>'transferId'=p_transfer));
 if n<>1 then raise exception 'LOGISTICS_ORDER_EXACT_COMMITTED_STAGE_REQUIRED'using errcode='55000';end if;
 return result;
end;$$;
alter function world_v2.postwar_industry_logistics_committed_stage(text,text,text,text,text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.postwar_industry_logistics_committed_stage(text,text,text,text,text,text)from public;

create function world_v2.publish_postwar_industry_logistics_order(p_world text,p_country text,p_original text,p_sha text)
returns table(order_ref text,order_sha256 text)language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;b jsonb;scope jsonb;run jsonb;book jsonb;ship jsonb;work jsonb;allocation jsonb;kind_value text;keys text[];old world_v2.postwar_industry_logistics_order%rowtype;start_tick numeric;end_tick numeric;count_people numeric;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_publisher'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')or pg_has_role(session_user,'world_v2_industry_source_reader','MEMBER')or exists(select 1 from pg_roles r where r.rolname=session_user and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))then raise exception 'LOGISTICS_ORDER_FIXED_SEPARATED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if p_original is null or octet_length(p_original)not between 1 and 65536 or p_sha is null or p_sha!~'^[a-f0-9]{64}$'or p_sha is distinct from encode(sha256(convert_to(p_original,'UTF8')),'hex')then raise exception 'LOGISTICS_ORDER_EXACT_BOUNDED_BYTES_REQUIRED'using errcode='23514';end if;
 b:=p_original::jsonb;
 if jsonb_typeof(b)is distinct from 'object'then raise exception 'LOGISTICS_ORDER_EXACT_OBJECT_REQUIRED'using errcode='23514';end if;
 kind_value:=case b->>'schemaVersion'when 'industry-logistics-service-work-order-v1' then 'WORK'when 'industry-logistics-service-expense-order-v1'then 'PAY'else null end;
 keys:=case kind_value when 'WORK'then array['schemaVersion','purpose','inputRef','worldId','countryId','facilityId','operatorId','runId','seedFingerprint','transferId','labourSourceRef','labourSourceRawSha256','allocations']when 'PAY'then array['schemaVersion','purpose','inputRef','worldId','countryId','facilityId','operatorId','runId','seedFingerprint','transferId','workEventFingerprint','householdAccountId','amount','currency']else null end;
 if kind_value is null or not(b?&keys)or(select count(*)from jsonb_object_keys(b))<>cardinality(keys)or b->>'purpose'is distinct from(case kind_value when 'WORK'then 'DISTINCT_LOGISTICS_SERVICE_WORK'else 'DISTINCT_LOGISTICS_SERVICE_WORK_WAGE'end)then raise exception 'LOGISTICS_ORDER_CLOSED_SCHEMA_REQUIRED'using errcode='23514';end if;
 if b->>'worldId'is distinct from p_world or b->>'countryId'is distinct from p_country or coalesce(b->>'inputRef','')!~'^[A-Za-z][A-Za-z0-9_.:-]{0,191}$'or coalesce(b->>'runId','')!~'^[A-Za-z][A-Za-z0-9_.:-]{0,127}$'or coalesce(b->>'transferId','')!~'^[A-Za-z][A-Za-z0-9_.:-]{0,127}$'then raise exception 'LOGISTICS_ORDER_EXACT_SCOPE_REFERENCE_REQUIRED'using errcode='23514';end if;
 scope:=world_v2.postwar_industry_logistics_order_scope(p_world,p_country,b->>'facilityId');
 if b->>'seedFingerprint'is distinct from scope->>'seedFingerprint'or b->>'operatorId'is distinct from scope->>'operatorId'then raise exception 'LOGISTICS_ORDER_CURRENT_ADMITTED_SOURCE_REQUIRED'using errcode='55000';end if;
 run:=world_v2.postwar_industry_logistics_committed_stage(p_world,p_country,b->>'facilityId',b->>'runId',null,'RUN');
 if run->'body'->'source'->>'seedFingerprint'is distinct from scope->>'seedFingerprint'or run->'body'->'source'->>'admissionRef'is distinct from scope->>'admissionRef'or run->'body'->'source'->>'operatorId'is distinct from scope->>'operatorId'or run->'body'->'source'->>'sourceRef'is distinct from scope->>'firstdaySourceRef'or run->'body'->'source'->>'sourceRawSha256'is distinct from scope->>'firstdaySourceSha256'then raise exception 'LOGISTICS_ORDER_ACTUAL_ADOPTED_RUN_REQUIRED'using errcode='55000';end if;
 book:=world_v2.postwar_industry_logistics_committed_stage(p_world,p_country,b->>'facilityId',b->>'runId',b->>'transferId','BOOK');
 ship:=world_v2.postwar_industry_logistics_committed_stage(p_world,p_country,b->>'facilityId',b->>'runId',b->>'transferId','SHIP');
 if book->'body'->>'schemaVersion'is distinct from 'industry-logistics-stage-v1'or ship->'body'->>'schemaVersion'is distinct from 'industry-logistics-stage-v1'or book->'body'->'plan'->'request'->>'runId'is distinct from b->>'runId'or book->'body'->'plan'->'request'->>'transferId'is distinct from b->>'transferId'or(book->>'eventSequence')::bigint<=(run->>'eventSequence')::bigint or(ship->>'eventSequence')::bigint<=(book->>'eventSequence')::bigint or ship->'intent'->>'sourceRef'is distinct from book->'intent'->>'sourceRef'or ship->'intent'->>'sourceRawSha256'is distinct from book->'intent'->>'sourceRawSha256'then raise exception 'LOGISTICS_ORDER_EXACT_PRIOR_BOOK_AND_SHIP_REQUIRED'using errcode='55000';end if;
 if kind_value='WORK'then
  if coalesce(b->>'labourSourceRef','')=''or coalesce(b->>'labourSourceRawSha256','')!~'^[a-f0-9]{64}$'or jsonb_typeof(b->'allocations')is distinct from 'array'or jsonb_array_length(b->'allocations')not between 1 and 256 then raise exception 'LOGISTICS_ORDER_BOUNDED_LABOUR_ORIGINAL_REQUIRED'using errcode='23514';end if;
  for allocation in select value from jsonb_array_elements(b->'allocations')loop
   if jsonb_typeof(allocation)is distinct from 'object'or not(allocation?&array['positionId','poolId','sourceStartOrdinal','populationLineage','regionId','cohortRef','startOrdinal','count','skill','startsAtSimTime','endsAtSimTime','personMilliseconds','personMinutes'])or(select count(*)from jsonb_object_keys(allocation))<>13 or allocation->>'populationLineage'is distinct from 'POSTWAR_REGIONAL_POPULATION_ORDINAL_V1'or coalesce(allocation->>'skill','')not in('LOW','MEDIUM','HIGH')or coalesce(allocation->>'count','')!~'^[1-9][0-9]*$'or coalesce(allocation->>'startsAtSimTime','')!~'^(0|[1-9][0-9]*)$'or coalesce(allocation->>'endsAtSimTime','')!~'^(0|[1-9][0-9]*)$'or coalesce(allocation->>'personMilliseconds','')!~'^[1-9][0-9]*$'then raise exception 'LOGISTICS_ORDER_EXACT_PERSON_TIME_DATA_REQUIRED'using errcode='23514';end if;
   start_tick:=(allocation->>'startsAtSimTime')::numeric;end_tick:=(allocation->>'endsAtSimTime')::numeric;count_people:=(allocation->>'count')::numeric;
   if end_tick<=start_tick or end_tick-start_tick>28800000 or start_tick<(book->'body'->'plan'->'request'->>'startsAtSimTime')::numeric or end_tick>(book->'body'->'plan'->'request'->>'endsAtSimTime')::numeric or end_tick>86400000 or(allocation->>'personMilliseconds')::numeric<>count_people*(end_tick-start_tick)or jsonb_typeof(allocation->'personMinutes')is distinct from 'object'or allocation->'personMinutes'->>'numerator'is distinct from allocation->>'personMilliseconds'or allocation->'personMinutes'->>'denominator'is distinct from '60000'then raise exception 'LOGISTICS_ORDER_BOOK_BOUND_PERSON_TIME_REQUIRED'using errcode='23514';end if;
  end loop;
 else
  if coalesce(b->>'workEventFingerprint','')!~'^sha256:[a-f0-9]{64}$'or coalesce(b->>'householdAccountId','')!~'^[A-Za-z][A-Za-z0-9_.:-]{0,191}$'or coalesce(b->>'currency','')!~'^[A-Z][A-Z0-9_]{0,15}$'or coalesce(b->>'amount','')!~'^(0|[1-9][0-9]*)([.][0-9]{0,5}[1-9])?$'or(b->>'amount')::numeric<=0 then raise exception 'LOGISTICS_ORDER_EXACT_EXPENSE_DATA_REQUIRED'using errcode='23514';end if;
  work:=world_v2.postwar_industry_logistics_committed_stage(p_world,p_country,b->>'facilityId',b->>'runId',b->>'transferId','SERVICE_WORK');
  if work->>'eventFingerprint'is distinct from b->>'workEventFingerprint'or work->'body'->>'schemaVersion'is distinct from 'industry-logistics-service-work-v1'or work->'body'->>'runId'is distinct from b->>'runId'or work->'body'->>'seedFingerprint'is distinct from scope->>'seedFingerprint'or work->'body'->>'purpose'is distinct from 'INDEPENDENT_INTERNAL_LOGISTICS_NOT_MANUFACTURING'or(work->>'eventSequence')::bigint<=(ship->>'eventSequence')::bigint then raise exception 'LOGISTICS_ORDER_ACTUAL_COMMITTED_SERVICE_WORK_REQUIRED'using errcode='55000';end if;
 end if;
 insert into world_v2.postwar_industry_logistics_order values(p_world,p_country,b->>'facilityId',b->>'runId',b->>'transferId',kind_value,b->>'inputRef',p_original,p_sha,scope->>'registrationRef',scope->>'seedFingerprint',scope->>'admissionRef')on conflict(world_id,original_ref)do nothing;
 select * into strict old from world_v2.postwar_industry_logistics_order x where x.world_id=p_world and x.original_ref=b->>'inputRef';
 if old.original_text is distinct from p_original or old.original_sha256 is distinct from p_sha or old.country_id is distinct from p_country or old.kind is distinct from kind_value then raise exception 'LOGISTICS_ORDER_IMMUTABLE_REFERENCE_CONFLICT'using errcode='23514';end if;
 return query select old.original_ref,old.original_sha256;
end;$$;
alter function world_v2.publish_postwar_industry_logistics_order(text,text,text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.publish_postwar_industry_logistics_order(text,text,text,text)from public;
grant execute on function world_v2.publish_postwar_industry_logistics_order(text,text,text,text)to world_v2_industry_source_publisher;

create function world_v2.read_postwar_industry_logistics_orders(p_world text,p_country text,p_facility text,p_run text,p_version bigint,p_sequence bigint,p_seed text,p_admission text)
returns table(kind text,original_ref text,original_text text,original_sha256 text,world_version text,event_sequence text,seed_fingerprint text,admission_ref text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;scope jsonb;n bigint;bytes bigint;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_reader'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')or pg_has_role(session_user,'world_v2_industry_source_publisher','MEMBER')or exists(select 1 from pg_roles r where r.rolname=session_user and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))then raise exception 'LOGISTICS_ORDER_FIXED_SEPARATED_READER_REQUIRED'using errcode='42501';end if;
 scope:=world_v2.postwar_industry_logistics_order_scope(p_world,p_country,p_facility);
 if p_version is null or p_sequence is null or p_version<0 or p_sequence<0 or p_run is null or p_run!~'^[A-Za-z][A-Za-z0-9_.:-]{0,127}$'or scope->>'worldVersion'is distinct from p_version::text or scope->>'eventSequence'is distinct from p_sequence::text or scope->>'seedFingerprint'is distinct from p_seed or scope->>'admissionRef'is distinct from p_admission then raise exception 'LOGISTICS_ORDER_ACTUAL_HEAD_AND_PINS_REQUIRED'using errcode='55000';end if;
 select count(*),coalesce(sum(octet_length(x.original_text)),0)into n,bytes from world_v2.postwar_industry_logistics_order x where x.world_id=p_world and x.country_id=p_country and x.facility_id=p_facility and x.run_id=p_run and x.seed_fingerprint=p_seed and x.admission_ref=p_admission;
 if n>256 or bytes>1048576 then raise exception 'LOGISTICS_ORDER_BOUNDED_ORIGINALS_REQUIRED'using errcode='54000';end if;
 if exists(select 1 from world_v2.postwar_industry_logistics_order x where x.world_id=p_world and x.country_id=p_country and x.facility_id=p_facility and x.run_id=p_run and x.original_sha256<>encode(sha256(convert_to(x.original_text,'UTF8')),'hex'))then raise exception 'LOGISTICS_ORDER_IMMUTABLE_BYTES_CHANGED'using errcode='23514';end if;
 return query select x.kind,x.original_ref,x.original_text,x.original_sha256,scope->>'worldVersion',scope->>'eventSequence',x.seed_fingerprint,x.admission_ref from world_v2.postwar_industry_logistics_order x where x.world_id=p_world and x.country_id=p_country and x.facility_id=p_facility and x.run_id=p_run and x.seed_fingerprint=p_seed and x.admission_ref=p_admission order by x.kind,x.original_ref;
end;$$;
alter function world_v2.read_postwar_industry_logistics_orders(text,text,text,text,bigint,bigint,text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.read_postwar_industry_logistics_orders(text,text,text,text,bigint,bigint,text,text)from public;
grant execute on function world_v2.read_postwar_industry_logistics_orders(text,text,text,text,bigint,bigint,text,text)to world_v2_industry_source_reader;
-- Historical committed originals: the current HOST/admission/head must still
-- be live. Revoking a TARGET source later cannot erase prior COMMITTED facts.
create function world_v2.read_postwar_industry_logistics_committed_orders(p_world text,p_host_country text,p_office text,p_source_country text,p_facility text,p_run text,p_command text,p_fingerprint text,p_version bigint,p_sequence bigint,p_seed text,p_admission text)
returns table(kind text,original_ref text,original_text text,original_sha256 text,world_version text,event_sequence text,seed_fingerprint text,admission_ref text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;required name;h record;a world_v2.runtime_opening_admission%rowtype;host text;c world_v2.command_submission%rowtype;rc world_v2.command_receipt%rowtype;e world_v2.authoritative_event%rowtype;intent jsonb;body jsonb;op jsonb;ref text;rawsha text;wanted text;s world_v2.postwar_industry_logistics_order%rowtype;firstday world_v2.postwar_industry_first_day_source%rowtype;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 required:=case p_office when 'SOCIAL'then 'world_v2_social_source_reader'when 'FINANCE'then 'world_v2_finance_budget_source_reader'when 'PROJECTION'then case when effective in('world_v2_postwar_projection_publisher','world_v2_postwar_projection_reader')then effective else null end else null end;
 if required is null or effective<>required or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')or exists(select 1 from pg_roles r where r.rolname=session_user and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))then raise exception 'LOGISTICS_HISTORY_FIXED_HOST_ROLE_REQUIRED'using errcode='42501';end if;
 if current_setting('transaction_isolation')not in('repeatable read','serializable')or current_setting('transaction_read_only')<>'off'then raise exception 'LOGISTICS_HISTORY_HELD_WRITE_RR_REQUIRED'using errcode='25001';end if;
 if p_host_country is null or p_host_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or p_source_country is null or p_source_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or p_facility is distinct from 'OPEN-'||substring(p_source_country from 9 for 2)||'-REFINED_FUEL'then raise exception 'LOGISTICS_HISTORY_EXACT_SCOPE_REQUIRED'using errcode='22023';end if;
 -- The PROJECTION lane has EXECUTE only for the inaccessible projection owner,
 -- never the effective runtime reader/publisher. Its fixed parent owns host
 -- metadata authorization; this nested function independently checks that
 -- exact World context, current admission/head and the complete frame binding.
 if p_office='PROJECTION'and current_setting('econmind.postwar_projection_world',true)is distinct from p_world then raise exception 'LOGISTICS_HISTORY_ACTUAL_PROJECTION_WORLD_REQUIRED'using errcode='42501';end if;
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 perform set_config('econmind.industry_source_world',p_world,true);
 select x.world_version,x.event_sequence into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found or p_version is null or p_sequence is null or h.world_version is distinct from p_version or h.event_sequence is distinct from p_sequence then raise exception 'LOGISTICS_HISTORY_ACTUAL_HELD_HEAD_REQUIRED'using errcode='55000';end if;
 a:=world_v2.industry_source_admission(p_world);
 if a.seed_fingerprint is distinct from p_seed or a.admission_ref is distinct from p_admission then raise exception 'LOGISTICS_HISTORY_ACTUAL_ADMISSION_REQUIRED'using errcode='55000';end if;
 if p_office='SOCIAL'then
  select x.registration_ref into host from world_v2.social_operating_source_registration x where x.world_id=p_world and x.country_id=p_host_country and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref for share;
  if not found or exists(select 1 from world_v2.social_operating_source_revocation v where v.registration_ref=host)then raise exception 'LOGISTICS_HISTORY_CURRENT_HOST_REVOKED'using errcode='55000';end if;
 elsif p_office='FINANCE'then
  select x.policy_ref into host from world_v2.finance_budget_policy_original x where x.world_id=p_world and x.country_id=p_host_country and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref and not exists(select 1 from world_v2.finance_budget_policy_revocation v where v.policy_ref=x.policy_ref)order by x.policy_ref limit 1 for share;
  if not found then raise exception 'LOGISTICS_HISTORY_CURRENT_HOST_REVOKED'using errcode='55000';end if;
 end if;
 select * into c from world_v2.command_submission x where x.world_id=p_world and x.command_id=p_command and x.command_fingerprint=p_fingerprint and x.country_id=p_source_country and x.office_id='INDUSTRY'and x.command_type='INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTE_V1';
 if not found or c.payload_sha256<>'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||c.canonical_payload,'UTF8')),'hex')then raise exception 'LOGISTICS_HISTORY_EXACT_COMMAND_REQUIRED'using errcode='55000';end if;
 intent:=c.canonical_payload::jsonb;op:=intent->'operation';
 if intent->>'schemaVersion'is distinct from 'industry-first-day-utility-command-v1'or intent->>'serviceKind'is distinct from 'LOGISTICS'or intent->>'facilityId'is distinct from p_facility or intent->>'runId'is distinct from p_run then raise exception 'LOGISTICS_HISTORY_EXACT_COMMAND_SCOPE_REQUIRED'using errcode='23514';end if;
 select * into rc from world_v2.command_receipt x where x.world_id=p_world and x.command_id=p_command and x.command_fingerprint=p_fingerprint and x.outcome='COMMITTED'and x.world_version_before=c.expected_world_version and x.world_version_after<=p_version;
 if not found or jsonb_array_length(rc.event_ids)is distinct from(case when op->>'action'='DELIVER'then 2 else 1 end)then raise exception 'LOGISTICS_HISTORY_COMMITTED_FINAL_REQUIRED'using errcode='55000';end if;
 select * into e from world_v2.authoritative_event x where x.world_id=p_world and x.event_id=rc.event_ids->>0 and x.causation_command_id=p_command and x.world_version=rc.world_version_after and x.event_sequence<=p_sequence and x.event_type='INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTED_V1'and x.correlation_id=c.correlation_id and x.sim_time=c.sim_time;
 if not found or e.payload_sha256<>'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||e.canonical_payload,'UTF8')),'hex')then raise exception 'LOGISTICS_HISTORY_ACTUAL_EVENT_REQUIRED'using errcode='55000';end if;
 body:=e.canonical_payload::jsonb;
 if body->>'action'is distinct from op->>'action'or body->>'transferId'is distinct from op->>'transferId'then raise exception 'LOGISTICS_HISTORY_EVENT_SCOPE_DIFFERS'using errcode='23514';end if;
 if op->>'action'='SERVICE_WORK'then
  ref:=op->>'workOrderRef';rawsha:=op->>'workOrderSha256';wanted:='WORK';
  if ref is null and rawsha is null then return;end if;
  if body->>'workOrderRef'is distinct from ref or body->>'workOrderSha256'is distinct from rawsha then raise exception 'LOGISTICS_HISTORY_WORK_REFERENCE_DIFFERS'using errcode='23514';end if;
 elsif op->>'action'='PAY_INPUTS'then
  ref:=op->>'expenseOrderRef';rawsha:=op->>'expenseOrderSha256';wanted:='PAY';
  if body->>'inputRef'is distinct from ref or body->>'inputRawSha256'is distinct from rawsha then raise exception 'LOGISTICS_HISTORY_EXPENSE_REFERENCE_DIFFERS'using errcode='23514';end if;
 elsif op->>'action'in('BOOK','SHIP','DELIVER')then return;
 else raise exception 'LOGISTICS_HISTORY_UNKNOWN_ACTION'using errcode='23514';end if;
 select * into s from world_v2.postwar_industry_logistics_order x where x.world_id=p_world and x.country_id=p_source_country and x.facility_id=p_facility and x.run_id=p_run and x.transfer_id=op->>'transferId'and x.kind=wanted and x.original_ref=ref and x.original_sha256=rawsha and x.seed_fingerprint=p_seed and x.admission_ref=p_admission;
 if not found or s.original_sha256<>encode(sha256(convert_to(s.original_text,'UTF8')),'hex')then raise exception 'LOGISTICS_HISTORY_EXACT_REFERENCED_ORIGINAL_REQUIRED'using errcode='55000';end if;
 select * into firstday from world_v2.postwar_industry_first_day_source x where x.world_id=p_world and x.country_id=p_source_country and x.facility_id=p_facility and x.registration_ref=s.registration_ref and x.seed_id=a.seed_id and x.seed_fingerprint=p_seed and x.admission_ref=p_admission;
 if not found or firstday.source_sha256<>encode(sha256(convert_to(firstday.source_text,'UTF8')),'hex')then raise exception 'LOGISTICS_HISTORY_IMMUTABLE_TARGET_ORIGINAL_REQUIRED'using errcode='55000';end if;
 return query select s.kind,s.original_ref,s.original_text,s.original_sha256,h.world_version::text,h.event_sequence::text,s.seed_fingerprint,s.admission_ref;
end;$$;
alter function world_v2.read_postwar_industry_logistics_committed_orders(text,text,text,text,text,text,text,text,bigint,bigint,text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.read_postwar_industry_logistics_committed_orders(text,text,text,text,text,text,text,text,bigint,bigint,text,text)from public;
grant execute on function world_v2.read_postwar_industry_logistics_committed_orders(text,text,text,text,text,text,text,text,bigint,bigint,text,text)to world_v2_social_source_reader,world_v2_finance_budget_source_reader,world_v2_postwar_projection_owner;

-- Exact historical firstday source selected by an actual committed C frame.
-- A page need not contain the earlier RUN; its immutable source is still
-- independently verified here, never reconstructed from a caller DTO.
create function world_v2.read_postwar_industry_logistics_committed_source(p_world text,p_host_country text,p_office text,p_source_country text,p_facility text,p_run text,p_command text,p_fingerprint text,p_version bigint,p_sequence bigint,p_seed text,p_admission text)
returns table(source_text text,source_sha256 text,source_ref text,world_version text,event_sequence text)
language plpgsql security definer set search_path=pg_catalog as $$
declare original world_v2.postwar_industry_first_day_source%rowtype;
begin
 perform 1 from world_v2.read_postwar_industry_logistics_committed_orders(p_world,p_host_country,p_office,p_source_country,p_facility,p_run,p_command,p_fingerprint,p_version,p_sequence,p_seed,p_admission);
 select s.* into original from world_v2.postwar_industry_first_day_source s join world_v2.postwar_industry_original r on r.world_id=s.world_id and r.registration_ref=s.registration_ref and r.country_id=s.country_id and r.facility_id=s.facility_id and r.seed_fingerprint=s.seed_fingerprint and r.admission_ref=s.admission_ref where s.world_id=p_world and s.country_id=p_source_country and s.facility_id=p_facility and s.seed_fingerprint=p_seed and s.admission_ref=p_admission;
 if not found or original.source_sha256<>encode(sha256(convert_to(original.source_text,'UTF8')),'hex')then raise exception 'LOGISTICS_HISTORY_IMMUTABLE_FIRSTDAY_REQUIRED'using errcode='55000';end if;
 return query select original.source_text,original.source_sha256,original.source_ref,p_version::text,p_sequence::text;
end;$$;
alter function world_v2.read_postwar_industry_logistics_committed_source(text,text,text,text,text,text,text,text,bigint,bigint,text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.read_postwar_industry_logistics_committed_source(text,text,text,text,text,text,text,text,bigint,bigint,text,text)from public;
grant execute on function world_v2.read_postwar_industry_logistics_committed_source(text,text,text,text,text,text,text,text,bigint,bigint,text,text)to world_v2_social_source_reader,world_v2_finance_budget_source_reader,world_v2_postwar_projection_owner;

-- Only a fixed projection definer may obtain this bounded run set. Each order
-- must already be referenced by an actual COMMITTED command/event; unpublished
-- work/expense orders are never exposed as historical execution evidence.
create function world_v2.postwar_projection_industry_logistics_orders(p_world text,p_country text,p_facility text,p_run text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h record;a world_v2.runtime_opening_admission%rowtype;c record;r record;buffer jsonb:='[]'::jsonb;n integer:=0;reg text;result jsonb;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective not in('world_v2_postwar_projection_publisher','world_v2_postwar_projection_reader')or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')or exists(select 1 from pg_roles q where q.rolname=session_user and(q.rolsuper or q.rolbypassrls or q.rolcreatedb or q.rolcreaterole or q.rolreplication))or current_setting('econmind.postwar_projection_world',true)is distinct from p_world then raise exception 'LOGISTICS_HISTORY_PRIVATE_PROJECTION_REQUIRED'using errcode='42501';end if;
 perform world_v2.lock_postwar_source_revocation_fences(p_world);perform set_config('econmind.industry_source_world',p_world,true);
 select x.world_version,x.event_sequence into strict h from world_v2.world_head x where x.world_id=p_world for share;
 a:=world_v2.industry_source_admission(p_world);
 for c in select x.command_id,x.command_fingerprint from world_v2.command_submission x join world_v2.command_receipt rc on rc.world_id=x.world_id and rc.command_id=x.command_id and rc.command_fingerprint=x.command_fingerprint and rc.outcome='COMMITTED'and rc.world_version_after<=h.world_version where x.world_id=p_world and x.country_id=p_country and x.office_id='INDUSTRY'and x.command_type='INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTE_V1'and x.canonical_payload::jsonb->>'facilityId'=p_facility and x.canonical_payload::jsonb->>'runId'=p_run and x.canonical_payload::jsonb->'operation'->>'action'in('SERVICE_WORK','PAY_INPUTS')order by rc.world_version_after limit 257 loop
  n:=n+1;if n>256 then raise exception 'LOGISTICS_HISTORY_BOUNDED_RUN_REQUIRED'using errcode='54000';end if;
  for r in select * from world_v2.read_postwar_industry_logistics_committed_orders(p_world,p_country,'PROJECTION',p_country,p_facility,p_run,c.command_id,c.command_fingerprint,h.world_version,h.event_sequence,a.seed_fingerprint,a.admission_ref)loop
   select x.registration_ref into strict reg from world_v2.postwar_industry_logistics_order x where x.world_id=p_world and x.original_ref=r.original_ref;
   buffer:=buffer||jsonb_build_array(jsonb_build_object('kind',r.kind,'originalRef',r.original_ref,'originalText',r.original_text,'originalSha256',r.original_sha256,'seedFingerprint',r.seed_fingerprint,'admissionRef',r.admission_ref,'registrationRef',reg));
   if octet_length(buffer::text)>1048576 then raise exception 'LOGISTICS_HISTORY_BOUNDED_ORIGINAL_BYTES_REQUIRED'using errcode='54000';end if;
  end loop;
 end loop;
 select coalesce(jsonb_agg(x order by x->>'kind',x->>'originalRef'),'[]')into result from(select distinct value as x from jsonb_array_elements(buffer))deduplicated;
 return result;
end;$$;
alter function world_v2.postwar_projection_industry_logistics_orders(text,text,text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.postwar_projection_industry_logistics_orders(text,text,text,text)from public;
grant execute on function world_v2.postwar_projection_industry_logistics_orders(text,text,text,text)to world_v2_postwar_projection_owner;

revoke create on schema world_v2 from world_v2_industry_source_owner;
commit;
