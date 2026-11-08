-- SOURCE ONLY. Recover missing immutable opening read bases from the same
-- admitted canonical seed after the World has advanced. No current assertion,
-- command, event, posting, authority, source registration or H0 gate is changed.
begin;
grant usage,create on schema world_v2 to world_v2_postwar_projection_owner;
create function world_v2.repair_postwar_office_opening_read_bases(
 p_world text,p_country text,p_seed_fingerprint text,p_canonical_sha256 text,
 p_bundle_sha256 text,p_admission text)
returns setof world_v2.postwar_office_projection_document
language plpgsql security definer set search_path=pg_catalog as $$
declare
 effective name;h record;a record;s world_v2.opening_seed%rowtype;
 root json;src json;operating json;financial json;op json;fin json;doc json;
 country jsonb;contract jsonb;roster jsonb;items jsonb;item jsonb;buffer jsonb;
 spec record;sc world_v2.postwar_social_prefix_scope%rowtype;
 operating_count integer:=0;financial_count integer:=0;n integer;
 seed_sha text;pointer jsonb;doc_hash text;ref text;version text;
 total integer;pages integer;idx integer;off integer;
 existing world_v2.postwar_office_projection_document%rowtype;actual_rows jsonb;
begin
 effective:=case when current_setting('role')='none' then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')
  or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')
  or pg_has_role(effective,'world_v2_postwar_projection_reader','MEMBER')
 then raise exception 'OPENING_READ_BASE_FIXED_PUBLISHER_REQUIRED' using errcode='42501';end if;
 if current_setting('transaction_isolation') not in('repeatable read','serializable')then raise exception 'OPENING_READ_BASE_REPEATABLE_READ_REQUIRED' using errcode='25001';end if;
 if p_world is null or p_country is null or p_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'
  or p_seed_fingerprint is null or p_canonical_sha256 is null or p_bundle_sha256 is null or p_admission is null
 then raise exception 'OPENING_READ_BASE_EXACT_PINS_REQUIRED' using errcode='22023';end if;
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select * into strict h from world_v2.world_head where world_id=p_world for share;
 select * into a from world_v2.postwar_projection_admission_header(p_world);
 if not found then raise exception 'OPENING_READ_BASE_CURRENT_ADMISSION_REQUIRED' using errcode='55000';end if;
 perform 1 from world_v2.runtime_admission_publication_permit q where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref for share;
 if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation r join world_v2.runtime_admission_publication_permit q using(authorization_id)where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref)
 then raise exception 'OPENING_READ_BASE_ADMISSION_REVOKED_OR_MISSING' using errcode='55000';end if;
 select * into strict s from world_v2.opening_seed where world_id=p_world;
 seed_sha:=encode(sha256(convert_to(s.canonical_payload,'UTF8')),'hex');
 if s.seed_fingerprint is distinct from p_seed_fingerprint or s.seed_fingerprint is distinct from a.seed_fingerprint
  or seed_sha is distinct from p_canonical_sha256 or a.source_bundle_sha256 is distinct from p_bundle_sha256 or a.admission_ref is distinct from p_admission
  or s.seed_fingerprint is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||s.canonical_payload,'UTF8')),'hex')
 then raise exception 'OPENING_READ_BASE_ACTUAL_SEED_PINS_REQUIRED' using errcode='23514';end if;
 -- Offline text traversal; never expand the whole seed/carrier as JSONB.
 root:=s.canonical_payload::json;s.canonical_payload:=null;
 if root->>'worldId' is distinct from p_world or root->>'seedId' is distinct from s.seed_id
  or(root->'replayBinding')::jsonb is distinct from s.replay_binding::jsonb
 then raise exception 'OPENING_READ_BASE_CANONICAL_SCOPE_REQUIRED' using errcode='23514';end if;
 for src in select value from json_array_elements(root->'sources')loop
  if(src->>'canonicalPayload')::json->>'schemaVersion'='postwar-operating-genesis-seed-source-v1'then operating:=src;operating_count:=operating_count+1;
  elsif(src->>'canonicalPayload')::json->>'schemaVersion'='adopted-financial-opening-source-v2'then financial:=src;financial_count:=financial_count+1;end if;
 end loop;
 if operating_count<>1 or financial_count<>1 or operating->>'sourceId'=financial->>'sourceId'
  or operating->>'payloadHash' is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||'{"payload":'||(operating->>'canonicalPayload')||'}','UTF8')),'hex')
  or financial->>'payloadHash' is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||'{"payload":'||(financial->>'canonicalPayload')||'}','UTF8')),'hex')
 then raise exception 'OPENING_READ_BASE_UNIQUE_ACTUAL_SOURCES_REQUIRED' using errcode='23514';end if;
 op:=(operating->>'canonicalPayload')::json;fin:=(financial->>'canonicalPayload')::json;
 select count(*),(json_agg(x)->0)::jsonb into n,country from json_array_elements(op->'carrier'->'socialEmployment'->'countries')x where x->>'countryId'=p_country;
 if n<>1 then raise exception 'OPENING_READ_BASE_EXACT_COUNTRY_REQUIRED' using errcode='23514';end if;
 select * into strict sc from world_v2.postwar_social_prefix_scope where world_id=p_world and country_id=p_country for share;
 if sc.seed_fingerprint<>a.seed_fingerprint or sc.admission_ref<>a.admission_ref or sc.source_id<>operating->>'sourceId'
  or sc.source_payload_hash<>operating->>'payloadHash' or sc.canonical_seed_sha256<>seed_sha
  or sc.scope_sha256<>encode(sha256(convert_to(sc.scope_document,'UTF8')),'hex')
 then raise exception 'OPENING_READ_BASE_SEALED_SOURCE_SCOPE_MISMATCH' using errcode='23514';end if;
 if not world_v2.postwar_industry_labour_source_current(p_world,p_country,a.seed_fingerprint,a.admission_ref,sc.source_id,sc.source_payload_hash)
 then raise exception 'OPENING_READ_BASE_PARENT_SOURCE_REVOKED' using errcode='55000';end if;
 select count(*),json_agg((d->>'bytes')::json)->0 into n,doc from json_array_elements(op->'carrier'->'documents')d where d->>'documentId'='POSTWAR_FINANCIAL_OFFICE_ORIGINALS';
 if n<>1 then raise exception 'OPENING_READ_BASE_FINANCIAL_DOCUMENT_REQUIRED' using errcode='23514';end if;
 select count(*),(json_agg(x)->0)::jsonb into n,contract from json_array_elements(doc->'contract'->'countries')x where x->>'countryId'=p_country;
 if n<>1 then raise exception 'OPENING_READ_BASE_FINANCIAL_COUNTRY_REQUIRED' using errcode='23514';end if;
 select count(*),(json_agg(x->'roster')->0)::jsonb into n,roster from json_array_elements(fin->'assembly'->'countries')x where x->>'countryId'=p_country;
 if n<>1 then raise exception 'OPENING_READ_BASE_ACTUAL_OFFICE_ROSTER_REQUIRED' using errcode='23514';end if;
 -- Release large source copies; retain only metadata and selected small facts.
 operating:=json_build_object('sourceId',operating->>'sourceId','payloadHash',operating->>'payloadHash','sourceVersion',operating->>'sourceVersion');
 financial:=json_build_object('sourceId',financial->>'sourceId','payloadHash',financial->>'payloadHash');op:=null;fin:=null;src:=null;doc:=null;
 for spec in select * from(values
  ('FINANCE','currency-fx'),('FINANCE','opening-financial-legs'),
  ('CENTRAL_BANK','currency-fx'),('CENTRAL_BANK','cb-categories'),('CENTRAL_BANK','cb-holdings'),('CENTRAL_BANK','bank-loans'),('CENTRAL_BANK','opening-financial-legs'),
  ('SOCIAL','positions'),('SOCIAL','service-pools'),('SOCIAL','offers'),('SOCIAL','minimum-wage'),
  ('INDUSTRY','opening-inventory-entries'),('TRADE','opening-inventory-entries')
 )v(office_id,dataset)loop
  pointer:=jsonb_build_object('sourceId',operating->>'sourceId','sourcePayloadHash',operating->>'payloadHash','decode','sources[].canonicalPayload','countryId',p_country);
  if spec.office_id='SOCIAL'then
   items:=case spec.dataset when'positions'then country->'state'->'labour'->'positions'when'service-pools'then country->'state'->'servicePools'when'offers'then country->'offers'else jsonb_build_array(country->'minimumWage')end;
   pointer:=pointer||jsonb_build_object('path','carrier.socialEmployment.countries[countryId].'||case spec.dataset when'positions'then'state.labour.positions'when'service-pools'then'state.servicePools'when'offers'then'offers'else'minimumWage'end);
  elsif spec.dataset='opening-inventory-entries'then
   select coalesce(jsonb_agg(x::jsonb order by x->>'entryId'),'[]'::jsonb)into items from json_array_elements(root->'inventoryEntries')x where x->'account'->>'countryId'=p_country and x->>'sourceId'=financial->>'sourceId';
   pointer:=pointer||jsonb_build_object('path','seed.inventoryEntries[account.countryId;sourceId=originalAdoptedFinancialSource]');
  elsif spec.dataset='opening-financial-legs'then
   select coalesce(jsonb_agg(jsonb_build_object('batchId',b->>'batchId','sourceId',b->>'sourceId','leg',l::jsonb)order by b->>'batchId',l->>'legId'),'[]'::jsonb)into items from json_array_elements(root->'financialBatches')b cross join lateral json_array_elements(b->'legs')l where l->'account'->>'countryId'=p_country and(case when spec.office_id='FINANCE'then l->'account'->>'ownerId'=roster->>'government'else l->'account'->>'ownerId'in(roster->>'centralBank',roster->>'bank')end);
   pointer:=pointer||jsonb_build_object('path','seed.financialBatches[].legs[account.countryId;actualOfficeRosterOwner]','financialSourceId',financial->>'sourceId','financialSourcePayloadHash',financial->>'payloadHash','dataset',spec.dataset);
  else
   items:=case spec.dataset when'currency-fx'then jsonb_build_array(jsonb_build_object('countryId',p_country,'localCurrency',contract->'localCurrency','openingFx',contract->'openingFx'))when'cb-categories'then contract->'cbRegister'->'categories'when'cb-holdings'then contract->'cbRegister'->'holdings'else contract->'bankLoans'end;
   pointer:=pointer||jsonb_build_object('path','carrier.documents[POSTWAR_FINANCIAL_OFFICE_ORIGINALS].bytes::json.contract.countries[countryId]','dataset',spec.dataset);
  end if;
  if items is null or jsonb_typeof(items)<>'array' or jsonb_array_length(items)>10000 or octet_length(items::text)>1048576 then raise exception 'OPENING_READ_BASE_BOUNDED_SOURCE_DATASET_REQUIRED' using errcode='54000';end if;
  total:=jsonb_array_length(items);doc_hash:=encode(sha256(convert_to(items::text,'UTF8')),'hex');
  ref:='POSTWAR_PROJECTION_'||upper(encode(sha256(convert_to(jsonb_build_array(p_world,p_country,spec.office_id,spec.dataset,s.seed_fingerprint,a.admission_ref,seed_sha,doc_hash)::text,'UTF8')),'hex'));
  version:='sha256:'||encode(sha256(convert_to(ref||doc_hash,'UTF8')),'hex');
  select * into existing from world_v2.postwar_office_projection_document d where d.world_id=p_world and d.country_id=p_country and d.office_id=spec.office_id and d.dataset=spec.dataset and d.projection_version='postwar-office-projection.v1';
  if found then
   if existing.document_ref<>ref or existing.source_version<>version or existing.source_revision<>operating->>'sourceVersion'
    or existing.seed_id<>s.seed_id or existing.seed_fingerprint<>s.seed_fingerprint or existing.admission_ref<>a.admission_ref or existing.canonical_seed_sha256<>seed_sha
    or existing.source_bundle_sha256<>a.source_bundle_sha256 or existing.source_id<>operating->>'sourceId' or existing.source_payload_hash<>operating->>'payloadHash'
    or existing.source_pointer is distinct from pointer or existing.model_version<>a.model_version or existing.replay_binding is distinct from a.replay_binding
    or existing.world_version<>0 or existing.event_sequence<>0 or existing.document_sha256<>doc_hash or existing.total_rows<>total
    or exists(select 1 from world_v2.postwar_office_projection_revocation q where q.world_id=p_world and q.document_ref=existing.document_ref)
   then raise exception 'OPENING_READ_BASE_IMMUTABLE_CONFLICT_OR_REVOKED' using errcode='23514';end if;
   if(select count(*)from world_v2.postwar_office_projection_page p where p.document_ref=ref)<>existing.page_count
    or exists(select 1 from world_v2.postwar_office_projection_page p where p.document_ref=ref and(p.page_sha256<>encode(sha256(convert_to(p.rows_text,'UTF8')),'hex')or p.row_count<>jsonb_array_length(p.rows_text::jsonb)))
   then raise exception 'OPENING_READ_BASE_EXISTING_PAGE_HASH_INVALID' using errcode='23514';end if;
   select coalesce(jsonb_agg(x.value order by p.row_offset,x.ordinality),'[]'::jsonb)into actual_rows from world_v2.postwar_office_projection_page p cross join lateral jsonb_array_elements(p.rows_text::jsonb)with ordinality x where p.document_ref=ref;
   if actual_rows is distinct from items then raise exception 'OPENING_READ_BASE_EXISTING_BYTES_DIFFER' using errcode='23514';end if;
   return next existing;continue;
  end if;
  pages:=1;buffer:='[]';for item in select value from jsonb_array_elements(items)loop
   if octet_length(jsonb_build_array(item)::text)>48000 then raise exception 'OPENING_READ_BASE_SINGLE_ROW_CAPACITY' using errcode='54000';end if;
   if jsonb_array_length(buffer)>=100 or octet_length((buffer||jsonb_build_array(item))::text)>48000 then pages:=pages+1;buffer:='[]';end if;buffer:=buffer||jsonb_build_array(item);
  end loop;
  insert into world_v2.postwar_office_projection_document(document_ref,world_id,country_id,office_id,dataset,projection_version,source_version,source_revision,admission_ref,seed_id,seed_fingerprint,canonical_seed_sha256,source_bundle_sha256,source_id,source_payload_hash,source_pointer,model_version,replay_binding,world_version,event_sequence,document_sha256,total_rows,page_count)
  values(ref,p_world,p_country,spec.office_id,spec.dataset,'postwar-office-projection.v1',version,operating->>'sourceVersion',a.admission_ref,s.seed_id,s.seed_fingerprint,seed_sha,a.source_bundle_sha256,operating->>'sourceId',operating->>'payloadHash',pointer,a.model_version,a.replay_binding,0,0,doc_hash,total,pages);
  idx:=0;off:=0;buffer:='[]';for item in select value from jsonb_array_elements(items)loop
   if jsonb_array_length(buffer)>=100 or octet_length((buffer||jsonb_build_array(item))::text)>48000 then
    insert into world_v2.postwar_office_projection_page values(ref,p_world,p_country,spec.office_id,idx,off,jsonb_array_length(buffer),buffer::text,encode(sha256(convert_to(buffer::text,'UTF8')),'hex'));off:=off+jsonb_array_length(buffer);idx:=idx+1;buffer:='[]';
   end if;buffer:=buffer||jsonb_build_array(item);
  end loop;
  insert into world_v2.postwar_office_projection_page values(ref,p_world,p_country,spec.office_id,idx,off,jsonb_array_length(buffer),buffer::text,encode(sha256(convert_to(buffer::text,'UTF8')),'hex'));
  select * into strict existing from world_v2.postwar_office_projection_document where document_ref=ref;return next existing;
 end loop;
end;$$;
alter function world_v2.repair_postwar_office_opening_read_bases(text,text,text,text,text,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.repair_postwar_office_opening_read_bases(text,text,text,text,text,text)from public;
grant execute on function world_v2.repair_postwar_office_opening_read_bases(text,text,text,text,text,text)to world_v2_postwar_projection_publisher;
revoke create on schema world_v2 from world_v2_postwar_projection_owner;
commit;
