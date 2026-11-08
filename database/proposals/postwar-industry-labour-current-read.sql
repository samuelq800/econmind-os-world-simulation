-- Candidate only; no membership or online raw-seed grants. Requires existing
-- projection roles, sealed Social scopes and complete mixed-prefix validators.
-- Stop consumers before installation changes; retain committed history. After
-- commit use independently reviewed forward fixes; unknown outcomes are not retried.
begin;
grant usage,create on schema world_v2 to world_v2_postwar_projection_owner;
-- Private metadata-only current source check; no raw source data or caller
-- authority. Existing source owner keeps registration/revocation tables private.
grant usage,create on schema world_v2 to world_v2_social_source_owner;
create function world_v2.postwar_industry_labour_source_current(p_world text,p_country text,p_seed text,p_admission text,p_source text,p_hash text)returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from world_v2.social_operating_source_registration r where r.world_id=p_world and r.country_id=p_country and r.seed_fingerprint=p_seed and r.admission_ref=p_admission and r.source_id=p_source and r.source_payload_hash=p_hash and not exists(select 1 from world_v2.social_operating_source_revocation v where v.registration_ref=r.registration_ref))
$$;
alter function world_v2.postwar_industry_labour_source_current(text,text,text,text,text,text)owner to world_v2_social_source_owner;
revoke all on function world_v2.postwar_industry_labour_source_current(text,text,text,text,text,text)from public;
grant execute on function world_v2.postwar_industry_labour_source_current(text,text,text,text,text,text)to world_v2_postwar_projection_owner;
revoke create on schema world_v2 from world_v2_social_source_owner;
create table world_v2.postwar_industry_labour_scope(
 world_id text not null,country_id text not null,seed_fingerprint text not null,admission_ref text not null,
 canonical_seed_sha256 text not null,source_id text not null,source_payload_hash text not null,
 source_revision text not null,source_pointer jsonb not null,roster_text text not null check(octet_length(roster_text)<=1048576),
 roster_sha256 text not null check(roster_sha256=encode(sha256(convert_to(roster_text,'UTF8')),'hex')),
 primary key(world_id,country_id),foreign key(world_id,country_id)references world_v2.postwar_social_prefix_scope(world_id,country_id)
);
create table world_v2.postwar_industry_labour_document(
 document_ref text primary key,world_id text not null,country_id text not null,world_version bigint not null,event_sequence bigint not null,
 base_document_ref text not null,source_version text not null unique,coverage jsonb not null,source_pointer jsonb not null,
 total_rows integer not null check(total_rows>=0),
 foreign key(world_id,country_id)references world_v2.postwar_industry_labour_scope(world_id,country_id)
);
create unique index postwar_industry_labour_document_scope_profile on world_v2.postwar_industry_labour_document(world_id,country_id,world_version,event_sequence,(coverage->>'schemaVersion'));
create table world_v2.postwar_industry_labour_page(
 document_ref text not null references world_v2.postwar_industry_labour_document(document_ref),world_id text not null,
 page_index integer not null,row_offset integer not null,row_count integer not null check(row_count between 0 and 100),
 rows_text text not null check(octet_length(rows_text)<=48000 and jsonb_typeof(rows_text::jsonb)='array'and jsonb_array_length(rows_text::jsonb)=row_count),
 page_sha256 text not null check(page_sha256=encode(sha256(convert_to(rows_text,'UTF8')),'hex')),primary key(document_ref,page_index)
);
do $$declare t text;begin foreach t in array array['postwar_industry_labour_scope','postwar_industry_labour_document','postwar_industry_labour_page']loop
 execute format('alter table world_v2.%I owner to world_v2_postwar_projection_owner',t);
 execute format('alter table world_v2.%I enable row level security',t);execute format('alter table world_v2.%I force row level security',t);
 execute format('revoke all on world_v2.%I from public,world_v2_postwar_projection_reader,world_v2_postwar_projection_publisher',t);
 execute format('create policy %I on world_v2.%I to world_v2_postwar_projection_owner using(current_user=''world_v2_postwar_projection_owner''and world_id=current_setting(''econmind.postwar_projection_world'',true))with check(current_user=''world_v2_postwar_projection_owner''and world_id=current_setting(''econmind.postwar_projection_world'',true))',t||'_owner',t);
 execute format('create trigger %I before update or delete on world_v2.%I for each row execute function world_v2.reject_authoritative_history_mutation()',t||'_immutable',t);
 execute format('create trigger %I before truncate on world_v2.%I for each statement execute function world_v2.reject_authoritative_history_mutation()',t||'_truncate',t);
end loop;end;$$;
-- One controlled offline extraction, never an HTTP request or caller rows.
create function world_v2.prepare_postwar_industry_labour_scopes(p_world text)returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;a record;s record;base record;root json;src json;seed_raw_sha text;doc jsonb;sc record;p jsonb;contract jsonb;people jsonb;pay jsonb;roster jsonb;body text;n integer;pointer jsonb;head record;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_reader','MEMBER')then raise exception 'INDUSTRY_FIXED_SEPARATE_PUBLISHER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.postwar_projection_world',p_world,true);select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 if exists(select 1 from world_v2.postwar_industry_labour_scope where world_id=p_world)then
  if(select count(*)from world_v2.postwar_industry_labour_scope where world_id=p_world)<>(select count(*)from world_v2.postwar_social_prefix_scope where world_id=p_world)or exists(select 1 from world_v2.postwar_industry_labour_scope x where x.world_id=p_world and(x.seed_fingerprint<>a.seed_fingerprint or x.admission_ref<>a.admission_ref or x.roster_sha256<>encode(sha256(convert_to(x.roster_text,'UTF8')),'hex')))then raise exception 'INDUSTRY_IMMUTABLE_SCOPE_CONFLICT'using errcode='23514';end if;return;
 end if;
 select * into strict s from world_v2.opening_seed where world_id=p_world;root:=s.canonical_payload::json;seed_raw_sha:=encode(sha256(convert_to(s.canonical_payload,'UTF8')),'hex');
 if s.seed_fingerprint is distinct from a.seed_fingerprint or s.seed_fingerprint is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||s.canonical_payload,'UTF8')),'hex')then raise exception 'INDUSTRY_ACTUAL_SEED_HASH_REQUIRED'using errcode='23514';end if;
 select count(*),json_agg(x)->0 into n,src from json_array_elements(root->'sources')x where(x->>'canonicalPayload')::json->>'schemaVersion'='postwar-operating-genesis-seed-source-v1';
 -- OpeningSource hashes the one-key {payload:...} envelope, not raw payload.
 if n<>1 or src->>'payloadHash'is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||'{"payload":'||(src->>'canonicalPayload')||'}','UTF8')),'hex')then raise exception 'INDUSTRY_UNIQUE_OPERATING_SOURCE_HASH_REQUIRED'using errcode='23514';end if;
 doc:=((src->>'canonicalPayload')::json->'carrier'->'socialEmployment')::jsonb;
 if doc->>'schemaVersion'is distinct from 'postwar-social-employment-state-v1'or doc->'inputs'->>'worldId'is distinct from p_world or doc->'inputs'->>'seedId'is distinct from a.seed_id or jsonb_typeof(doc->'inputs'->'sourcePositions')is distinct from 'array'then raise exception 'INDUSTRY_ACTUAL_E03_ORIGINAL_REQUIRED'using errcode='23514';end if;
 for sc in select * from world_v2.postwar_social_prefix_scope where world_id=p_world order by country_id loop
  if sc.seed_fingerprint<>a.seed_fingerprint or sc.admission_ref<>a.admission_ref or sc.source_id<>src->>'sourceId'or sc.source_payload_hash<>src->>'payloadHash'or sc.canonical_seed_sha256<>seed_raw_sha or sc.scope_sha256<>encode(sha256(convert_to(sc.scope_document,'UTF8')),'hex')then raise exception 'INDUSTRY_SEALED_PARENT_MISMATCH'using errcode='23514';end if;
  if(select count(*)from jsonb_array_elements(doc->'countries')c where c->>'countryId'=sc.country_id)<>1 then raise exception 'INDUSTRY_EXACT_ORIGINAL_COUNTRY_REQUIRED'using errcode='23514';end if;
  roster:='[]';
  for p in select x from jsonb_array_elements(doc->'inputs'->'sourcePositions')x where x->>'countryId'=sc.country_id and x->>'sourceBucket'='INDUSTRY'order by (x->>'positionId')collate"C" loop
   if p->>'employerRole'is distinct from 'OP'or p->>'owner'is distinct from 'PRIVATE_SECTOR'or p->>'occupation'is distinct from 'GENERAL'or p->>'filledCount'!~'^(0|[1-9][0-9]*)$'or p->>'requiredCount'!~'^(0|[1-9][0-9]*)$'or(p->>'filledCount')::numeric>(p->>'requiredCount')::numeric then raise exception 'INDUSTRY_OP_POSITION_ORIGINAL_REQUIRED'using errcode='23514';end if;
   select x into strict contract from jsonb_array_elements(doc->'inputs'->'labour'->'positions')x where x->>'positionId'=p->>'positionId';
   select x into strict people from jsonb_array_elements(doc->'inputs'->'populationPositionRefs')x where x->>'positionId'=p->>'positionId';
   select x into strict pay from jsonb_array_elements(doc->'inputs'->'positionFunding')x where x->>'positionId'=p->>'positionId';
   if contract->>'countryId'is distinct from sc.country_id or contract->>'employerId'is distinct from p->>'employerId'or contract->>'employerRole'is distinct from 'OP'or contract->>'occupation'is distinct from p->>'occupation'or contract->>'locationId'is distinct from p->>'locationId'or contract->>'skill'is distinct from p->>'skill'or contract->>'classificationId'is distinct from p->>'classificationId'or contract->>'requiredCount'is distinct from p->>'requiredCount'or people->>'regionId'is distinct from p->>'locationId'or people->>'count'is distinct from p->>'filledCount'or people->>'sourcePoolId'is distinct from p->'personRange'->>'poolId'or people->>'sourceStartOrdinal'is distinct from p->'personRange'->>'startOrdinal'or p->'personRange'->>'count'is distinct from p->>'filledCount'or pay->>'countryId'is distinct from sc.country_id or pay->>'locationId'is distinct from p->>'locationId'or pay->>'payerEntityId'is distinct from p->>'employerId'or pay->>'kind'is distinct from 'PAYROLL'or pay->>'filledCount'is distinct from p->>'filledCount'or pay->>'currency'is distinct from contract->>'wageCurrency'or pay->>'payrollFundingRef'is distinct from contract->>'payrollFundingRef'then raise exception 'INDUSTRY_ORIGINAL_POPULATION_EMPLOYER_PAYROLL_JOIN_REQUIRED'using errcode='23514';end if;
   roster:=roster||jsonb_build_array(jsonb_build_object('countryId',sc.country_id,'facilityId',p->>'sourceObjectId','locationId',p->>'locationId','operatorId',p->>'employerId','positionId',p->>'positionId','skill',p->>'skill','classificationId',p->>'classificationId','requiredCount',p->>'requiredCount','openingFilledCount',p->>'filledCount'));
  end loop;
  if exists(select 1 from jsonb_array_elements(roster)x group by x->>'positionId'having count(*)<>1)or exists(select 1 from jsonb_array_elements(roster)x group by x->>'facilityId'having count(distinct(x->>'locationId',x->>'operatorId'))<>1)then raise exception 'INDUSTRY_UNIQUE_FACILITY_POSITION_SCOPE_REQUIRED'using errcode='23514';end if;
  body:=world_v2.canonical_json(roster);pointer:=jsonb_build_object('sourceId',src->>'sourceId','sourcePayloadHash',src->>'payloadHash','path','/carrier/socialEmployment/inputs/sourcePositions','selection',jsonb_build_object('countryId',sc.country_id,'sourceBucket','INDUSTRY','employerRole','OP'),'canonicalSeedSha256',sc.canonical_seed_sha256);
  insert into world_v2.postwar_industry_labour_scope values(p_world,sc.country_id,a.seed_fingerprint,a.admission_ref,sc.canonical_seed_sha256,src->>'sourceId',src->>'payloadHash',doc->>'sourceRevision',pointer,body,encode(sha256(convert_to(body,'UTF8')),'hex'));
 end loop;
 if not found then raise exception 'INDUSTRY_SEALED_COUNTRY_ROSTER_REQUIRED'using errcode='55000';end if;
 select world_version,event_sequence into strict head from world_v2.world_head where world_id=p_world for share;
 if head.world_version=0 and head.event_sequence=0 then
  for sc in select country_id from world_v2.postwar_industry_labour_scope where world_id=p_world order by country_id loop
   perform * from world_v2.publish_postwar_industry_labour_current(p_world,sc.country_id,null);
  end loop;
 end if;
end;$$;
-- Rows are independently joined to the actual latest validated materialization,
-- or genuine unchanged H0 country positions only when no Social event exists.
create function world_v2.publish_postwar_industry_labour_current(p_world text,p_country text,p_assertion text)
returns setof world_v2.postwar_industry_labour_document language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h record;a record;prefix record;sc world_v2.postwar_industry_labour_scope%rowtype;ss record;b record;origin record;state jsonb;binding jsonb;assertion jsonb;prefix_coverage jsonb;coverage_schema text;paged boolean:=false;rows jsonb:='[]';p jsonb;actual jsonb;rows_hash text;coverage jsonb;ref text;version text;d world_v2.postwar_industry_labour_document%rowtype;buffer jsonb:='[]';idx integer:=0;off integer:=0;item jsonb;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_reader','MEMBER')then raise exception 'INDUSTRY_FIXED_SEPARATE_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if p_assertion is not null then if octet_length(p_assertion)>16384 then raise exception 'INDUSTRY_BOUNDED_ASSERTION_REQUIRED'using errcode='22023';end if;assertion:=p_assertion::jsonb;paged:=coalesce((assertion->'coverage')?'pageProof',false);end if;
 perform set_config('econmind.postwar_projection_world',p_world,true);
 if paged then
  -- The paged coordinator acquires the fresh revocation fence BEFORE H.
  -- Do not pre-lock H here and invert its shared source lock order.
  select * into strict h from world_v2.lock_postwar_paged_current_publication(p_world,p_country);
 else
  select world_version::text as world_version,event_sequence::text as event_sequence into strict h from world_v2.world_head where world_id=p_world for share;
  if h.world_version<>'0'or h.event_sequence<>'0'then select * into strict h from world_v2.lock_postwar_social_current_prefix_publication(p_world,p_country);end if;
 end if;
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 select * into strict sc from world_v2.postwar_industry_labour_scope where world_id=p_world and country_id=p_country for share;
 select * into strict ss from world_v2.postwar_social_prefix_scope where world_id=p_world and country_id=p_country for share;
 if not world_v2.postwar_industry_labour_source_current(p_world,p_country,a.seed_fingerprint,a.admission_ref,sc.source_id,sc.source_payload_hash)or sc.seed_fingerprint<>a.seed_fingerprint or sc.admission_ref<>a.admission_ref or sc.canonical_seed_sha256<>ss.canonical_seed_sha256 or sc.source_id<>ss.source_id or sc.source_payload_hash<>ss.source_payload_hash or sc.roster_sha256<>encode(sha256(convert_to(sc.roster_text,'UTF8')),'hex')or ss.scope_sha256<>encode(sha256(convert_to(ss.scope_document,'UTF8')),'hex')then raise exception 'INDUSTRY_FRESH_SAME_ORIGINAL_REQUIRED'using errcode='23514';end if;
 select * into strict b from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_country and x.office_id='INDUSTRY'and x.dataset='regional-source-capacity'and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref and x.canonical_seed_sha256=sc.canonical_seed_sha256 and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.world_id=p_world and r.document_ref=x.document_ref)for share;
 if h.world_version='0'and h.event_sequence='0'then
  if p_assertion is not null or exists(select 1 from world_v2.authoritative_event where world_id=p_world)or exists(select 1 from world_v2.command_receipt where world_id=p_world and outcome='COMMITTED')or exists(select 1 from world_v2.financial_posting_batch where world_id=p_world)or exists(select 1 from world_v2.inventory_posting where world_id=p_world)then raise exception 'INDUSTRY_ACTUAL_EMPTY_H0_PREFIX_REQUIRED'using errcode='55000';end if;
  prefix_coverage:=jsonb_build_object('prefixFingerprint','sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(jsonb_build_object('worldId',p_world,'seedFingerprint',a.seed_fingerprint,'headWorldVersion','0','headEventSequence','0','frames','[]'::jsonb)),'UTF8')),'hex'),'knownEffectsFingerprint','sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||'[]','UTF8')),'hex'),'coveredThroughEventId',null,'coveredThroughEventFingerprint',null,'financialPostingCount','0','financialBatchCount','0','financialPostingsFingerprint','sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||'[]','UTF8')),'hex'));
 else
  if p_assertion is null then raise exception 'INDUSTRY_ACTUAL_ASSERTION_REQUIRED'using errcode='22023';end if;
  if paged then
   select * into strict prefix from world_v2.verify_postwar_paged_current_coverage(p_world,p_country,assertion->'coverage');
  else
   select * into strict prefix from world_v2.postwar_mixed_current_prefix(p_world);
   if assertion->'coverage'is distinct from jsonb_build_object('prefixFingerprint',prefix.prefix_fingerprint,'knownEffectsFingerprint',prefix.effects_fingerprint,'coveredThroughEventId',prefix.last_event_id,'coveredThroughEventFingerprint',prefix.last_event_fingerprint,'financialPostingCount',prefix.financial_posting_count,'financialBatchCount',prefix.financial_batch_count,'financialPostingsFingerprint',prefix.financial_postings_fingerprint)then raise exception 'INDUSTRY_ACTUAL_COMPLETE_PREFIX_MISMATCH'using errcode='23514';end if;
  end if;
  if assertion->'head'is distinct from jsonb_build_object('worldId',p_world,'worldVersion',h.world_version,'eventSequence',h.event_sequence)or assertion->'seedPins'is distinct from jsonb_build_object('worldId',p_world,'seedId',a.seed_id,'seedFingerprint',a.seed_fingerprint,'admissionRef',a.admission_ref)then raise exception 'INDUSTRY_ACTUAL_COMPLETE_PREFIX_MISMATCH'using errcode='23514';end if;
  prefix_coverage:=assertion->'coverage';
 end if;
 select * into origin from world_v2.postwar_social_origin_at_prefix(p_world,p_country);
 if found then state:=origin.state;binding:=origin.binding;
 else
  if exists(select 1 from world_v2.authoritative_event e join world_v2.command_submission c on c.world_id=e.world_id and c.command_id=e.causation_command_id where e.world_id=p_world and c.country_id=p_country and e.event_type in('SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1','SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1','SOCIAL_JOB_MATCH_SETTLED_V1'))then raise exception 'INDUSTRY_CURRENT_MATERIALIZATION_UNAVAILABLE'using errcode='55000';end if;
  state:=jsonb_build_object('labour',jsonb_build_object('positions',ss.scope_document::jsonb->'positions'));
 end if;
 for p in select x from jsonb_array_elements(sc.roster_text::jsonb)x order by (x->>'positionId')collate"C" loop
  select x into strict actual from jsonb_array_elements(state->'labour'->'positions')x where x->>'positionId'=p->>'positionId';
  if actual->>'countryId'is distinct from p_country or actual->>'locationId'is distinct from p->>'locationId'or actual->>'owner'is distinct from 'PRIVATE_SECTOR'or actual->>'skill'is distinct from p->>'skill'or actual->>'classificationId'is distinct from p->>'classificationId'or actual->>'requiredCount'is distinct from p->>'requiredCount'or actual->>'employedCount'!~'^(0|[1-9][0-9]*)$'or(actual->>'employedCount')::numeric>(p->>'requiredCount')::numeric or(h.world_version='0'and actual->>'employedCount'is distinct from p->>'openingFilledCount')then raise exception 'INDUSTRY_CURRENT_POSITION_SCOPE_OR_COUNT_MISMATCH'using errcode='23514';end if;
  rows:=rows||jsonb_build_array(p||jsonb_build_object('schemaVersion','postwar-industry-labour-current-row-v1','currentEmployedCount',actual->>'employedCount','measurement','EMPLOYMENT_HEADCOUNT_NOT_ATTENDANCE_OR_PAYMENT','completedPersonDays',null,'paidCost',null));
 end loop;
 rows_hash:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(rows),'UTF8')),'hex');
 if h.world_version<>'0'and assertion->>'rowsHash'is distinct from rows_hash then raise exception 'INDUSTRY_CORE_SQL_ROWS_MISMATCH'using errcode='23514';end if;
 coverage:=prefix_coverage||jsonb_build_object('schemaVersion',case when paged then'postwar-industry-labour-current-page-chain-coverage-v2'else'postwar-industry-labour-current-coverage-v1'end,'countryId',p_country,'globalWorldVersion',h.world_version,'globalEventSequence',h.event_sequence,'rowsHash',rows_hash,'originalScopeSha256',sc.roster_sha256);coverage_schema:=coverage->>'schemaVersion';
 ref:='POSTWAR_INDUSTRY_LABOUR_'||upper(encode(sha256(convert_to(world_v2.canonical_json(jsonb_build_array(p_world,p_country,a.seed_fingerprint,a.admission_ref,coverage,b.document_ref)),'UTF8')),'hex'));version:='sha256:'||encode(sha256(convert_to(ref,'UTF8')),'hex');
 select x.* into d from world_v2.postwar_industry_labour_document x where x.world_id=p_world and x.country_id=p_country and x.world_version=h.world_version::bigint and x.event_sequence=h.event_sequence::bigint and x.coverage->>'schemaVersion'=coverage_schema;
 if found then if d.document_ref<>ref then raise exception 'INDUSTRY_IMMUTABLE_CURRENT_CONFLICT'using errcode='23514';end if;return next d;return;end if;
 insert into world_v2.postwar_industry_labour_document values(ref,p_world,p_country,h.world_version::bigint,h.event_sequence::bigint,b.document_ref,version,coverage,sc.source_pointer||jsonb_build_object('currentStateBinding',binding),jsonb_array_length(rows));
 for item in select value from jsonb_array_elements(rows)loop
  if octet_length(jsonb_build_array(item)::text)>48000 then raise exception 'INDUSTRY_ROW_TOO_LARGE'using errcode='54000';end if;
  if jsonb_array_length(buffer)>=100 or octet_length((buffer||jsonb_build_array(item))::text)>48000 then
   insert into world_v2.postwar_industry_labour_page values(ref,p_world,idx,off,jsonb_array_length(buffer),buffer::text,encode(sha256(convert_to(buffer::text,'UTF8')),'hex'));off:=off+jsonb_array_length(buffer);idx:=idx+1;buffer:='[]';
  end if;buffer:=buffer||jsonb_build_array(item);
 end loop;
 insert into world_v2.postwar_industry_labour_page values(ref,p_world,idx,off,jsonb_array_length(buffer),buffer::text,encode(sha256(convert_to(buffer::text,'UTF8')),'hex'));
 return query select * from world_v2.postwar_industry_labour_document where document_ref=ref;
end;$$;
create function world_v2.read_postwar_industry_labour_current_page(p_world text,p_offset integer,p_limit integer,p_expected text default null)
returns table(status text,scope jsonb,source jsonb,page jsonb,rows_text text)
language plpgsql security definer set search_path=pg_catalog as $$
declare s record;d world_v2.postwar_industry_labour_document%rowtype;sc world_v2.postwar_industry_labour_scope%rowtype;b record;p record;selected jsonb;returned integer;begin
 if p_offset is null or p_limit is null or p_offset<0 or p_offset>100000 or p_limit<1 or p_limit>100 or(p_offset>0 and p_expected is null)or(p_expected is not null and p_expected!~'^sha256:[a-f0-9]{64}$')then raise exception 'INDUSTRY_CURRENT_INVALID_PAGE'using errcode='22023';end if;
 select * into s from world_v2.read_postwar_office_projection_seats(p_world)x where x.office_id='INDUSTRY';
 if not found then return query select'DENIED',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select x.* into d from world_v2.postwar_industry_labour_document x where x.world_id=p_world and x.country_id=s.country_id and x.world_version=s.world_version::bigint and x.event_sequence=s.event_sequence::bigint order by case x.coverage->>'schemaVersion'when'postwar-industry-labour-current-page-chain-coverage-v2' then 1 else 0 end desc limit 1;
 if not found then if p_expected is not null and exists(select 1 from world_v2.postwar_industry_labour_document where world_id=p_world and country_id=s.country_id and source_version=p_expected)then return query select'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';else return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';end if;return;end if;
 if d.world_version=0 and(exists(select 1 from world_v2.authoritative_event where world_id=p_world)or exists(select 1 from world_v2.command_receipt where world_id=p_world and outcome='COMMITTED')or exists(select 1 from world_v2.financial_posting_batch where world_id=p_world)or exists(select 1 from world_v2.inventory_posting where world_id=p_world))then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 if p_expected is not null and p_expected<>d.source_version then return query select'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into sc from world_v2.postwar_industry_labour_scope where world_id=p_world and country_id=s.country_id and seed_fingerprint=s.seed_fingerprint and admission_ref=s.admission_ref;
 select * into b from world_v2.postwar_office_projection_document x where x.document_ref=d.base_document_ref and x.world_id=p_world and x.country_id=s.country_id and x.office_id='INDUSTRY'and x.dataset='regional-source-capacity'and x.seed_id=s.seed_id and x.seed_fingerprint=s.seed_fingerprint and x.admission_ref=s.admission_ref and x.source_bundle_sha256=s.source_bundle_sha256 and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.world_id=p_world and r.document_ref=x.document_ref);
 if sc.world_id is null or b.document_ref is null or not world_v2.postwar_industry_labour_source_current(p_world,s.country_id,s.seed_fingerprint,s.admission_ref,sc.source_id,sc.source_payload_hash) or sc.canonical_seed_sha256<>b.canonical_seed_sha256 or sc.roster_sha256<>encode(sha256(convert_to(sc.roster_text,'UTF8')),'hex')or d.coverage->>'originalScopeSha256'is distinct from sc.roster_sha256 or d.coverage->>'countryId'is distinct from s.country_id or d.coverage->>'globalWorldVersion'is distinct from s.world_version or d.coverage->>'globalEventSequence'is distinct from s.event_sequence or(d.world_version=0 and(d.event_sequence<>0 or d.coverage->'coveredThroughEventId'is distinct from 'null'::jsonb or d.coverage->'coveredThroughEventFingerprint'is distinct from 'null'::jsonb))or(d.world_version>0 and not exists(select 1 from world_v2.authoritative_event e where e.world_id=p_world and e.event_id=d.coverage->>'coveredThroughEventId'and e.event_fingerprint=d.coverage->>'coveredThroughEventFingerprint'and e.world_version=d.world_version and e.event_sequence=d.event_sequence))then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 if d.source_pointer-'currentStateBinding'is distinct from sc.source_pointer or(d.source_pointer->'currentStateBinding'<>'null'::jsonb and not exists(select 1 from world_v2.current_materialization m where m.world_id=p_world and m.materialization_key=d.source_pointer->'currentStateBinding'->>'materializationKey'and m.source_command_id=d.source_pointer->'currentStateBinding'->>'sourceCommandId'and m.payload_sha256=d.source_pointer->'currentStateBinding'->>'materializationHash'and m.world_version=(d.source_pointer->'currentStateBinding'->>'sourceStateWorldVersion')::bigint))then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into p from world_v2.postwar_industry_labour_page where document_ref=d.document_ref and world_id=p_world and row_offset<=p_offset and(p_offset<row_offset+row_count or d.total_rows=0)order by page_index desc limit 1;
 if p_offset>=d.total_rows then selected:='[]';else
  if p.document_ref is null or p.page_sha256<>encode(sha256(convert_to(p.rows_text,'UTF8')),'hex')or p.row_count<>jsonb_array_length(p.rows_text::jsonb)then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
  select coalesce(jsonb_agg(x order by n),'[]')into selected from jsonb_array_elements(p.rows_text::jsonb)with ordinality q(x,n)where n>p_offset-p.row_offset and n<=p_offset-p.row_offset+p_limit;
 end if;returned:=jsonb_array_length(selected);
 return query select case when returned=0 then'EMPTY'else'PAGE'end,jsonb_build_object('worldId',s.world_id,'countryId',s.country_id,'officeId',s.office_id,'authSubject',s.auth_subject,'teamId',s.team_id,'authorizationVersion',s.authorization_revision,'scopeKey',s.scope_key,'seatRef',s.seat_ref),
 jsonb_build_object('dataNature',case when d.world_version=0 then'ADMITTED_OPENING_INDUSTRY_EMPLOYMENT_HEADCOUNT'else'ADMITTED_CURRENT_INDUSTRY_EMPLOYMENT_HEADCOUNT'end,'sourceVersion',d.source_version,'sourceRevision',sc.source_revision,'seedId',s.seed_id,'seedFingerprint',s.seed_fingerprint,'admissionRef',s.admission_ref,'modelVersion',s.model_version,'replayBinding',s.replay_binding,'sourceBundleSha256',s.source_bundle_sha256,'canonicalSeedSha256',sc.canonical_seed_sha256,'worldVersion',d.world_version::text,'eventSequence',d.event_sequence::text,'originWorldVersion','0','originEventSequence','0','observedHead',jsonb_build_object('worldVersion',d.world_version::text,'eventSequence',d.event_sequence::text),'currentIndustryLabourCoverage',d.coverage,'pageHash',coalesce(p.page_sha256,encode(sha256(convert_to('[]','UTF8')),'hex')),'returnedRowsHash',encode(sha256(convert_to(selected::text,'UTF8')),'hex'),'hashAlgorithm','POSTGRES_JSONB_TEXT_UTF8_SHA256','sourcePointer',d.source_pointer),
 jsonb_build_object('offset',p_offset,'limit',p_limit,'returned',returned,'total',d.total_rows,'nextOffset',case when p_offset+returned<d.total_rows then p_offset+returned else null end),selected::text;
end;$$;
-- Fixed same-admitted-origin read repair. This cannot publish any other Office
-- or dataset, change the original H0 gate, or write an economic event/state.
create function world_v2.repair_postwar_industry_regional_source_capacity(p_world text,p_country text)
returns world_v2.postwar_office_projection_document language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;a record;s world_v2.opening_seed%rowtype;sc world_v2.postwar_social_prefix_scope%rowtype;
 root json;src json;op json;mapping jsonb;items jsonb;item jsonb;buffer jsonb:='[]';n integer;
 seed_sha text;doc_hash text;ref text;version text;pointer jsonb;pages integer:=1;idx integer:=0;off integer:=0;
 existing world_v2.postwar_office_projection_document%rowtype;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_reader','MEMBER')then raise exception 'INDUSTRY_FIXED_SEPARATE_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if current_setting('transaction_isolation')not in('repeatable read','serializable')then raise exception 'INDUSTRY_REGIONAL_REPAIR_HELD_RR_REQUIRED'using errcode='25001';end if;
 if p_country is null or p_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'then raise exception 'INDUSTRY_EXACT_COUNTRY_REQUIRED'using errcode='22023';end if;
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 perform set_config('econmind.postwar_projection_world',p_world,true);
 perform 1 from world_v2.world_head where world_id=p_world for share;
 if not found then raise exception 'INDUSTRY_ACTUAL_WORLD_REQUIRED'using errcode='55000';end if;
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 select * into strict sc from world_v2.postwar_social_prefix_scope where world_id=p_world and country_id=p_country for share;
 if not world_v2.postwar_industry_labour_source_current(p_world,p_country,a.seed_fingerprint,a.admission_ref,sc.source_id,sc.source_payload_hash)then raise exception 'INDUSTRY_REGIONAL_ORIGINAL_REVOKED'using errcode='55000';end if;
 if exists(select 1 from world_v2.postwar_office_projection_document d join world_v2.postwar_office_projection_revocation r using(document_ref)where d.world_id=p_world and d.country_id=p_country and d.office_id='INDUSTRY'and d.dataset='regional-source-capacity')then raise exception 'INDUSTRY_REGIONAL_REPAIR_PARENT_REVOKED'using errcode='55000';end if;
 if exists(select 1 from world_v2.postwar_office_projection_document d where d.world_id=p_world and d.country_id=p_country and d.office_id='INDUSTRY'and d.dataset='regional-source-capacity')then raise exception 'INDUSTRY_REGIONAL_REPAIR_ALREADY_EXISTS'using errcode='55000';end if;
 select * into strict s from world_v2.opening_seed where world_id=p_world;
 root:=s.canonical_payload::json;seed_sha:=encode(sha256(convert_to(s.canonical_payload,'UTF8')),'hex');
 if root->>'worldId'is distinct from p_world or root->>'seedId'is distinct from s.seed_id or s.seed_fingerprint is distinct from a.seed_fingerprint or s.seed_fingerprint is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||s.canonical_payload,'UTF8')),'hex')or(root->'replayBinding')::jsonb is distinct from s.replay_binding::jsonb then raise exception 'INDUSTRY_REGIONAL_ACTUAL_SEED_REQUIRED'using errcode='23514';end if;
 select count(*),json_agg(x)->0 into n,src from json_array_elements(root->'sources')x where(x->>'canonicalPayload')::json->>'schemaVersion'='postwar-operating-genesis-seed-source-v1';
 if n<>1 or src->>'payloadHash'is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||'{"payload":'||(src->>'canonicalPayload')||'}','UTF8')),'hex')then raise exception 'INDUSTRY_UNIQUE_OPERATING_SOURCE_HASH_REQUIRED'using errcode='23514';end if;
 if sc.seed_fingerprint<>a.seed_fingerprint or sc.admission_ref<>a.admission_ref or sc.source_id<>src->>'sourceId'or sc.source_payload_hash<>src->>'payloadHash'or sc.canonical_seed_sha256<>seed_sha or sc.scope_sha256<>encode(sha256(convert_to(sc.scope_document,'UTF8')),'hex')then raise exception 'INDUSTRY_SEALED_PARENT_MISMATCH'using errcode='23514';end if;
 op:=(src->>'canonicalPayload')::json;
 if(select count(*)from json_array_elements(op->'carrier'->'socialEmployment'->'countries')x where x->>'countryId'=p_country)<>1 then raise exception 'INDUSTRY_EXACT_ORIGINAL_COUNTRY_REQUIRED'using errcode='23514';end if;
 mapping:=(op->'carrier'->'selectedSource'->>'regionMappingBytes')::jsonb;
 -- Exactly the existing publisher's regional-source-capacity row semantics.
 select coalesce(jsonb_agg(jsonb_build_object('countryId',p_country,'locationId',m->>'normalizedRegionId','sourceRegionId',r->>'id','sourceInitial',r->'initial','sourceStatus','PINNED_SOURCE_CAPACITY_NOT_CURRENT_DELIVERY')order by m->>'normalizedRegionId'),'[]')into items from jsonb_array_elements((op->'carrier'->'selectedSource'->>'regionsBytes')::jsonb)r join jsonb_array_elements(mapping->'mappings')m on m->>'sourceRegionId'=r->>'id'where m->>'coreCountryId'=p_country;
 if jsonb_array_length(items)=0 or jsonb_array_length(items)>1000 or octet_length(items::text)>1048576 then raise exception 'INDUSTRY_BOUNDED_REGIONAL_ORIGINAL_REQUIRED'using errcode='54000';end if;
 pointer:=jsonb_build_object('sourceId',src->>'sourceId','sourcePayloadHash',src->>'payloadHash','decode','sources[].canonicalPayload','countryId',p_country,'path','carrier.selectedSource.regionsBytes::json.initial','mapping','carrier.selectedSource.regionMappingBytes::json.mappings');
 doc_hash:=encode(sha256(convert_to(items::text,'UTF8')),'hex');
 ref:='POSTWAR_PROJECTION_'||upper(encode(sha256(convert_to(jsonb_build_array(p_world,p_country,'INDUSTRY','regional-source-capacity',s.seed_fingerprint,a.admission_ref,seed_sha,doc_hash)::text,'UTF8')),'hex'));
 version:='sha256:'||encode(sha256(convert_to(ref||doc_hash,'UTF8')),'hex');
 for item in select value from jsonb_array_elements(items)loop
  if octet_length(jsonb_build_array(item)::text)>48000 then raise exception 'INDUSTRY_REGIONAL_SINGLE_ROW_CAPACITY'using errcode='54000';end if;
  if jsonb_array_length(buffer)>=100 or octet_length((buffer||jsonb_build_array(item))::text)>48000 then pages:=pages+1;buffer:='[]';end if;buffer:=buffer||jsonb_build_array(item);
 end loop;buffer:='[]';
 insert into world_v2.postwar_office_projection_document(document_ref,world_id,country_id,office_id,dataset,projection_version,source_version,source_revision,admission_ref,seed_id,seed_fingerprint,canonical_seed_sha256,source_bundle_sha256,source_id,source_payload_hash,source_pointer,model_version,replay_binding,world_version,event_sequence,document_sha256,total_rows,page_count)
 values(ref,p_world,p_country,'INDUSTRY','regional-source-capacity','postwar-office-projection.v1',version,src->>'sourceVersion',a.admission_ref,s.seed_id,s.seed_fingerprint,seed_sha,a.source_bundle_sha256,src->>'sourceId',src->>'payloadHash',pointer,a.model_version,a.replay_binding,0,0,doc_hash,jsonb_array_length(items),pages);
 for item in select value from jsonb_array_elements(items)loop
  if jsonb_array_length(buffer)>=100 or octet_length((buffer||jsonb_build_array(item))::text)>48000 then insert into world_v2.postwar_office_projection_page values(ref,p_world,p_country,'INDUSTRY',idx,off,jsonb_array_length(buffer),buffer::text,encode(sha256(convert_to(buffer::text,'UTF8')),'hex'));off:=off+jsonb_array_length(buffer);idx:=idx+1;buffer:='[]';end if;buffer:=buffer||jsonb_build_array(item);
 end loop;
 insert into world_v2.postwar_office_projection_page values(ref,p_world,p_country,'INDUSTRY',idx,off,jsonb_array_length(buffer),buffer::text,encode(sha256(convert_to(buffer::text,'UTF8')),'hex'));
 select * into strict existing from world_v2.postwar_office_projection_document where document_ref=ref;return existing;
end;$$;
alter function world_v2.repair_postwar_industry_regional_source_capacity(text,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.repair_postwar_industry_regional_source_capacity(text,text)from public;
grant execute on function world_v2.repair_postwar_industry_regional_source_capacity(text,text)to world_v2_postwar_projection_publisher;

alter function world_v2.prepare_postwar_industry_labour_scopes(text)owner to world_v2_postwar_projection_owner;
alter function world_v2.publish_postwar_industry_labour_current(text,text,text)owner to world_v2_postwar_projection_owner;
alter function world_v2.read_postwar_industry_labour_current_page(text,integer,integer,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.prepare_postwar_industry_labour_scopes(text),world_v2.publish_postwar_industry_labour_current(text,text,text),world_v2.read_postwar_industry_labour_current_page(text,integer,integer,text)from public;
grant execute on function world_v2.prepare_postwar_industry_labour_scopes(text),world_v2.publish_postwar_industry_labour_current(text,text,text)to world_v2_postwar_projection_publisher;
grant execute on function world_v2.read_postwar_industry_labour_current_page(text,integer,integer,text)to world_v2_postwar_projection_reader;
revoke create on schema world_v2 from world_v2_postwar_projection_owner;
commit;
