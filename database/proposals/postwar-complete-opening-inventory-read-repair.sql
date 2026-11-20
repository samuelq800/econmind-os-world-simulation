-- ISOLATED CANDIDATE ONLY. Append a corrected read copy from the SAME admitted
-- canonical seed. No World/FINAL/history row is changed; no source is adopted.
-- Install after physical inventory provenance, physical opening read, Trade
-- current + automatic + paged sources and Trade current projection. All callers
-- must be drained during this fixed function installation.
begin;
do $preflight$declare t text;begin
 if not exists(select 1 from pg_roles where rolname='world_v2_postwar_projection_owner'and not(rolcanlogin or rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication))or has_schema_privilege('world_v2_postwar_projection_owner','world_v2','CREATE')then raise exception 'COMPLETE_INVENTORY_FIXED_EXISTING_OWNER_REQUIRED'using errcode='42501';end if;
 foreach t in array array['postwar_office_projection_document','postwar_office_projection_page','postwar_office_projection_revocation']loop
  if not exists(select 1 from pg_class c where c.oid=to_regclass('world_v2.'||t)and c.relkind='r'and pg_get_userbyid(c.relowner)='world_v2_postwar_projection_owner'and c.relrowsecurity and c.relforcerowsecurity)then raise exception 'COMPLETE_INVENTORY_EXISTING_FORCED_RLS_REQUIRED'using errcode='55000';end if;
 end loop;
end;$preflight$;
grant create on schema world_v2 to world_v2_postwar_projection_owner;

-- No fallback: a financial-only legacy document is not a complete inventory.
-- Only inaccessible existing definer owners can invoke this fixed selector.
create function world_v2.postwar_complete_opening_inventory_document(p_world text,p_country text,p_office text)
returns text language plpgsql security definer set search_path=pg_catalog as $$
declare ref text;begin
 if p_office not in('INDUSTRY','TRADE')then raise exception 'COMPLETE_INVENTORY_FIXED_OFFICE_REQUIRED'using errcode='22023';end if;
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select d.document_ref into ref from world_v2.postwar_office_projection_document d
 where d.world_id=p_world and d.country_id=p_country and d.office_id=p_office
 and d.dataset='opening-inventory-entries-complete-v2'and d.projection_version='postwar-office-projection.v1'
 and d.source_pointer->>'schemaVersion'='postwar-complete-opening-inventory-repair-v1'
 and exists(select 1 from world_v2.postwar_office_projection_document parent where parent.document_ref=d.source_pointer->>'parentDocumentRef'and parent.document_sha256=d.source_pointer->>'parentDocumentSha256'and parent.world_id=d.world_id and parent.country_id=d.country_id and parent.office_id=d.office_id and parent.dataset='opening-inventory-entries'and parent.seed_fingerprint=d.seed_fingerprint and parent.admission_ref=d.admission_ref and not exists(select 1 from world_v2.postwar_office_projection_revocation rv where rv.world_id=p_world and rv.document_ref=parent.document_ref))
 and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.world_id=p_world and r.document_ref=d.document_ref);
 return ref;
end;$$;
alter function world_v2.postwar_complete_opening_inventory_document(text,text,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.postwar_complete_opening_inventory_document(text,text,text)from public;
grant execute on function world_v2.postwar_complete_opening_inventory_document(text,text,text)to world_v2_postwar_narrow_trade_current_owner;

-- Pins are assertions only. The fixed definer reads its actual immutable seed,
-- admission and source bytes; there is deliberately no rows/source/Ready input.
create function world_v2.publish_postwar_complete_opening_inventory(p_world text,p_country text,p_seed_fingerprint text,p_canonical_sha256 text,p_bundle_sha256 text,p_admission text)
returns setof world_v2.postwar_office_projection_document
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;a record;h record;s record;root json;src json;used jsonb;pins jsonb:='[]';items jsonb;parent record;existing world_v2.postwar_office_projection_document%rowtype;parent_rows jsonb;parent_hash text;rows_hash text;pointer jsonb;ref text;version text;raw_sha text;office_name text;page_items jsonb:='[]';item jsonb;page_count integer:=1;idx integer:=0;off integer:=0;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_reader','MEMBER')then raise exception 'COMPLETE_INVENTORY_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if current_setting('transaction_isolation')not in('repeatable read','serializable')then raise exception 'COMPLETE_INVENTORY_REPEATABLE_READ_REQUIRED'using errcode='25001';end if;
 if p_country is null or p_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'then raise exception 'COMPLETE_INVENTORY_EXACT_COUNTRY_REQUIRED'using errcode='22023';end if;
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select * into strict h from world_v2.world_head where world_id=p_world for share;
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 perform 1 from world_v2.runtime_admission_publication_permit q where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref for share;
 if exists(select 1 from world_v2.runtime_admission_publication_revocation r join world_v2.runtime_admission_publication_permit q using(authorization_id)where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref)then raise exception 'COMPLETE_INVENTORY_ADMISSION_REVOKED'using errcode='55000';end if;
 select * into strict s from world_v2.opening_seed where world_id=p_world;
 raw_sha:=encode(sha256(convert_to(s.canonical_payload,'UTF8')),'hex');
 if s.seed_fingerprint is distinct from p_seed_fingerprint or s.seed_fingerprint is distinct from a.seed_fingerprint or raw_sha is distinct from p_canonical_sha256 or a.source_bundle_sha256 is distinct from p_bundle_sha256 or a.admission_ref is distinct from p_admission or s.seed_fingerprint is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||s.canonical_payload,'UTF8')),'hex')then raise exception 'COMPLETE_INVENTORY_ACTUAL_SOURCE_PINS_REQUIRED'using errcode='23514';end if;
 root:=s.canonical_payload::json;s.canonical_payload:=null;
 if root->>'worldId'is distinct from p_world or root->>'seedId'is distinct from a.seed_id then raise exception 'COMPLETE_INVENTORY_SEED_SCOPE_REQUIRED'using errcode='23514';end if;
 select coalesce(jsonb_agg(x::jsonb order by x->>'entryId'),'[]'::jsonb)into items from json_array_elements(root->'inventoryEntries')x where x->'account'->>'countryId'=p_country;
 select coalesce(jsonb_agg(distinct x->>'sourceId'),'[]'::jsonb)into used from jsonb_array_elements(items)x;
 for src in select value from json_array_elements(root->'sources')loop
  if used?(src->>'sourceId')then
   if src->>'payloadHash'is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||'{"payload":'||(src->>'canonicalPayload')||'}','UTF8')),'hex')then raise exception 'COMPLETE_INVENTORY_SOURCE_PAYLOAD_HASH_DIFFERS'using errcode='23514';end if;
   pins:=pins||jsonb_build_array(jsonb_build_object('sourceId',src->>'sourceId','sourcePayloadHash',src->>'payloadHash'));
  end if;
 end loop;
 if jsonb_array_length(pins)<>jsonb_array_length(used)or exists(select 1 from jsonb_array_elements(pins)x group by x->>'sourceId'having count(*)<>1)then raise exception 'COMPLETE_INVENTORY_EVERY_ACTUAL_SOURCE_REQUIRED'using errcode='23514';end if;
 select coalesce(jsonb_agg(x order by x->>'sourceId'),'[]'::jsonb)into pins from jsonb_array_elements(pins)x;
 root:=null;src:=null;rows_hash:=encode(sha256(convert_to(items::text,'UTF8')),'hex');
 foreach office_name in array array['INDUSTRY','TRADE']loop
  select * into strict parent from world_v2.postwar_office_projection_document d where d.world_id=p_world and d.country_id=p_country and d.office_id=office_name and d.dataset='opening-inventory-entries'and d.projection_version='postwar-office-projection.v1'and d.world_version=0 and d.event_sequence=0 and d.seed_id=a.seed_id and d.seed_fingerprint=a.seed_fingerprint and d.admission_ref=a.admission_ref and d.source_bundle_sha256=a.source_bundle_sha256 and d.canonical_seed_sha256=raw_sha for share;
  if exists(select 1 from world_v2.postwar_office_projection_revocation r where r.world_id=p_world and r.document_ref=parent.document_ref)then raise exception 'COMPLETE_INVENTORY_PARENT_REVOKED'using errcode='55000';end if;
  if(select count(*)from world_v2.postwar_office_projection_page p where p.document_ref=parent.document_ref)<>parent.page_count or exists(select 1 from world_v2.postwar_office_projection_page p where p.document_ref=parent.document_ref and(p.page_sha256<>encode(sha256(convert_to(p.rows_text,'UTF8')),'hex')or p.row_count<>jsonb_array_length(p.rows_text::jsonb)))then raise exception 'COMPLETE_INVENTORY_PARENT_PAGES_INVALID'using errcode='23514';end if;
  select coalesce(jsonb_agg(x.value order by p.row_offset,x.ordinality),'[]'::jsonb)into parent_rows from world_v2.postwar_office_projection_page p cross join lateral jsonb_array_elements(p.rows_text::jsonb)with ordinality x where p.document_ref=parent.document_ref;
  parent_hash:=encode(sha256(convert_to(parent_rows::text,'UTF8')),'hex');
  if parent_hash<>parent.document_sha256 or jsonb_array_length(parent_rows)<>parent.total_rows or exists(select 1 from jsonb_array_elements(parent_rows)x where not(items@>jsonb_build_array(x)))then raise exception 'COMPLETE_INVENTORY_PARENT_ROWS_NOT_ACTUAL_SEED_SUBSET'using errcode='23514';end if;
  pointer:=jsonb_build_object('schemaVersion','postwar-complete-opening-inventory-repair-v1','classification','SAME_ADMITTED_SEED_READ_REPAIR_NOT_ECONOMIC_EVENT','parentDocumentRef',parent.document_ref,'parentDocumentSha256',parent.document_sha256,'canonicalSeedSha256',raw_sha,'seedFingerprint',a.seed_fingerprint,'admissionRef',a.admission_ref,'inventorySources',pins,'completeRowsHash',rows_hash,'firstObservedHead',jsonb_build_object('worldVersion',h.world_version::text,'eventSequence',h.event_sequence::text));
  ref:='POSTWAR_COMPLETE_OPENING_INVENTORY_'||upper(encode(sha256(convert_to(world_v2.canonical_json(jsonb_build_array(p_world,p_country,office_name,parent.document_ref,parent_hash,a.seed_fingerprint,a.admission_ref,rows_hash,pins)),'UTF8')),'hex'));
  version:='sha256:'||encode(sha256(convert_to(ref||rows_hash,'UTF8')),'hex');
  select * into existing from world_v2.postwar_office_projection_document d where d.world_id=p_world and d.country_id=p_country and d.office_id=office_name and d.dataset='opening-inventory-entries-complete-v2'and d.projection_version='postwar-office-projection.v1';
  if found then
   if existing.document_ref<>ref or existing.source_version<>version or existing.document_sha256<>rows_hash or existing.source_pointer-'firstObservedHead'<>pointer-'firstObservedHead'or existing.seed_fingerprint<>a.seed_fingerprint or existing.admission_ref<>a.admission_ref or exists(select 1 from world_v2.postwar_office_projection_revocation r where r.world_id=p_world and r.document_ref=existing.document_ref)then raise exception 'COMPLETE_INVENTORY_IMMUTABLE_REPAIR_CONFLICT'using errcode='23514';end if;
   return next existing;continue;
  end if;
  page_count:=1;page_items:='[]';for item in select value from jsonb_array_elements(items)loop
   if octet_length(jsonb_build_array(item)::text)>48000 then raise exception 'COMPLETE_INVENTORY_ROW_CAPACITY'using errcode='54000';end if;
   if jsonb_array_length(page_items)>=100 or octet_length((page_items||jsonb_build_array(item))::text)>48000 then page_count:=page_count+1;page_items:='[]';end if;page_items:=page_items||jsonb_build_array(item);
  end loop;
  insert into world_v2.postwar_office_projection_document(document_ref,world_id,country_id,office_id,dataset,projection_version,source_version,source_revision,admission_ref,seed_id,seed_fingerprint,canonical_seed_sha256,source_bundle_sha256,source_id,source_payload_hash,source_pointer,model_version,replay_binding,world_version,event_sequence,document_sha256,total_rows,page_count)values(ref,p_world,p_country,office_name,'opening-inventory-entries-complete-v2','postwar-office-projection.v1',version,parent.source_revision,a.admission_ref,a.seed_id,a.seed_fingerprint,raw_sha,a.source_bundle_sha256,parent.source_id,parent.source_payload_hash,pointer,a.model_version,a.replay_binding,0,0,rows_hash,jsonb_array_length(items),page_count);
  idx:=0;off:=0;page_items:='[]';for item in select value from jsonb_array_elements(items)loop
   if jsonb_array_length(page_items)>=100 or octet_length((page_items||jsonb_build_array(item))::text)>48000 then
    insert into world_v2.postwar_office_projection_page values(ref,p_world,p_country,office_name,idx,off,jsonb_array_length(page_items),page_items::text,encode(sha256(convert_to(page_items::text,'UTF8')),'hex'));off:=off+jsonb_array_length(page_items);idx:=idx+1;page_items:='[]';end if;page_items:=page_items||jsonb_build_array(item);
  end loop;
  insert into world_v2.postwar_office_projection_page values(ref,p_world,p_country,office_name,idx,off,jsonb_array_length(page_items),page_items::text,encode(sha256(convert_to(page_items::text,'UTF8')),'hex'));
  select * into strict existing from world_v2.postwar_office_projection_document where document_ref=ref;return next existing;
 end loop;
end;$$;
alter function world_v2.publish_postwar_complete_opening_inventory(text,text,text,text,text,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.publish_postwar_complete_opening_inventory(text,text,text,text,text,text)from public;
grant execute on function world_v2.publish_postwar_complete_opening_inventory(text,text,text,text,text,text)to world_v2_postwar_projection_publisher;

-- Exact installed-function adaptations are appended below. Owner/OID/ACL/RLS
-- stay in place; a drifted function rejects the complete installation.





-- Fixed adaptation: world_v2.publish_postwar_office_projection(text,text,text,text,text,text,text,text)
do $adapt$declare f record;definition text;replacement text;begin
 select p.*,pg_get_functiondef(p.oid)as definition into f from pg_proc p where p.oid=to_regprocedure('world_v2.publish_postwar_office_projection(text,text,text,text,text,text,text,text)');
 if not found or pg_get_userbyid(f.proowner)<>'world_v2_postwar_projection_owner'or not f.prosecdef or f.proconfig is distinct from array['search_path=pg_catalog']::text[]or encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>'d5edd7eb5ee8eff8eff5455a45b99a3d680a2963773e9efcc7330a9944190037'then raise exception 'COMPLETE_INVENTORY_EXACT_INSTALLED_FUNCTION_REQUIRED:publish_postwar_office_projection'using errcode='55000';end if;
 replacement:=$newbody$
declare effective name;a record;s world_v2.opening_seed%rowtype;root jsonb;op_source jsonb;op jsonb;country jsonb;financial jsonb;contract jsonb;roster jsonb;mapping jsonb;items jsonb;item jsonb;buffer jsonb:='[]'::jsonb;ref text;version text;doc_hash text;seed_sha text;source_pointer jsonb;total integer;pages integer:=1;page_index integer:=0;row_offset integer:=0;existing world_v2.postwar_office_projection_document%rowtype;
begin
 effective:=case when current_setting('role')='none' then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER') or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')then raise exception 'POSTWAR_FIXED_PROJECTION_PUBLISHER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.postwar_projection_world',p_world,true);
 perform 1 from world_v2.world_head w where w.world_id=p_world and w.world_version=0 and w.event_sequence=0 for share;
 if not found then raise exception 'POSTWAR_PROJECTION_H0_REQUIRED'using errcode='55000';end if;
 select * into a from world_v2.postwar_projection_admission_header(p_world);if not found then raise exception 'POSTWAR_REAL_IMMUTABLE_ADMISSION_REQUIRED'using errcode='55000';end if;
 perform 1 from world_v2.runtime_admission_publication_permit q where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref for share;
 if exists(select 1 from world_v2.runtime_admission_publication_revocation r join world_v2.runtime_admission_publication_permit q using(authorization_id) where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref)then raise exception 'POSTWAR_ADMISSION_REVOKED'using errcode='55000';end if;
 select * into strict s from world_v2.opening_seed where world_id=p_world;
 root:=s.canonical_payload::jsonb;seed_sha:=encode(sha256(convert_to(s.canonical_payload,'UTF8')),'hex');
 if s.seed_fingerprint is distinct from p_expected_seed_fingerprint or seed_sha is distinct from p_expected_canonical_sha256 or a.source_bundle_sha256 is distinct from p_expected_source_sha256 or a.admission_ref is distinct from p_expected_admission_ref then raise exception 'POSTWAR_FULL_VALIDATION_PINS_DO_NOT_MATCH_STORED_SOURCE'using errcode='23514';end if;
 if root->>'worldId' is distinct from p_world or root->>'seedId' is distinct from s.seed_id or s.seed_fingerprint is distinct from ('sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||s.canonical_payload,'UTF8')),'hex')) or root->'replayBinding' is distinct from s.replay_binding::jsonb or s.seed_fingerprint<>a.seed_fingerprint then raise exception 'POSTWAR_STORED_CANONICAL_SEED_MISMATCH'using errcode='23514';end if;
 select x into op_source from jsonb_array_elements(root->'sources')x where (x->>'canonicalPayload')::jsonb->>'schemaVersion'='postwar-operating-genesis-seed-source-v1';
 if op_source is null or (select count(*) from jsonb_array_elements(root->'sources')x where (x->>'canonicalPayload')::jsonb->>'schemaVersion'='postwar-operating-genesis-seed-source-v1')<>1 then raise exception 'POSTWAR_EXACT_OPERATING_SOURCE_REQUIRED'using errcode='23514';end if;
 op:=(op_source->>'canonicalPayload')::jsonb;
 if (select count(*)from jsonb_array_elements(op->'carrier'->'socialEmployment'->'countries')x where x->>'countryId'=p_country)<>1 then raise exception 'POSTWAR_EXACT_COUNTRY_SOURCE_REQUIRED'using errcode='23514';end if;
 source_pointer:=jsonb_build_object('sourceId',op_source->>'sourceId','sourcePayloadHash',op_source->>'payloadHash','decode','sources[].canonicalPayload','countryId',p_country);
 if p_office='SOCIAL' and p_dataset in('positions','service-pools','offers','minimum-wage')then
  select x into country from jsonb_array_elements(op->'carrier'->'socialEmployment'->'countries')x where x->>'countryId'=p_country;
  if country is null or (select count(*)from jsonb_array_elements(op->'carrier'->'socialEmployment'->'countries')x where x->>'countryId'=p_country)<>1 then raise exception 'POSTWAR_EXACT_COUNTRY_SOURCE_REQUIRED'using errcode='23514';end if;
  items:=case p_dataset when 'positions' then country->'state'->'labour'->'positions' when 'service-pools' then country->'state'->'servicePools' when 'offers' then country->'offers' else jsonb_build_array(country->'minimumWage')end;
  source_pointer:=source_pointer||jsonb_build_object('path','carrier.socialEmployment.countries[countryId].'||case p_dataset when 'positions'then'state.labour.positions'when'service-pools'then'state.servicePools'when'offers'then'offers'else'minimumWage'end);
 elsif p_office in('FINANCE','CENTRAL_BANK')and p_dataset in('currency-fx','cb-categories','cb-holdings','bank-loans','opening-financial-legs')then
  select (d->>'bytes')::jsonb into financial from jsonb_array_elements(op->'carrier'->'documents')d where d->>'documentId'='POSTWAR_FINANCIAL_OFFICE_ORIGINALS';
  select x into contract from jsonb_array_elements(financial->'contract'->'countries')x where x->>'countryId'=p_country;
  if contract is null then raise exception 'POSTWAR_COUNTRY_FINANCIAL_ORIGINAL_REQUIRED'using errcode='23514';end if;
  if p_office='FINANCE'and p_dataset not in('currency-fx','opening-financial-legs')then raise exception 'POSTWAR_OFFICE_DATASET_DENIED'using errcode='42501';end if;
  if p_dataset='currency-fx'then items:=jsonb_build_array(jsonb_build_object('countryId',p_country,'localCurrency',contract->'localCurrency','openingFx',contract->'openingFx'));
  elsif p_dataset='cb-categories'then items:=contract->'cbRegister'->'categories';elsif p_dataset='cb-holdings'then items:=contract->'cbRegister'->'holdings';elsif p_dataset='bank-loans'then items:=contract->'bankLoans';
  else
   select x into financial from jsonb_array_elements(root->'sources')x where (x->>'canonicalPayload')::jsonb->>'schemaVersion'='adopted-financial-opening-source-v2';
   select x->'roster' into roster from jsonb_array_elements(((financial->>'canonicalPayload')::jsonb)->'assembly'->'countries')x where x->>'countryId'=p_country;
   select coalesce(jsonb_agg(jsonb_build_object('batchId',b->>'batchId','sourceId',b->>'sourceId','leg',l)order by b->>'batchId',l->>'legId'),'[]'::jsonb)into items from jsonb_array_elements(root->'financialBatches')b cross join lateral jsonb_array_elements(b->'legs')l where l->'account'->>'countryId'=p_country and(case when p_office='FINANCE'then l->'account'->>'ownerId'=roster->>'government'else l->'account'->>'ownerId'in(roster->>'centralBank',roster->>'bank')end);
  end if;
  source_pointer:=source_pointer||case when p_dataset='opening-financial-legs'then jsonb_build_object('path','seed.financialBatches[].legs[account.countryId;actualOfficeRosterOwner]','financialSourceId',financial->>'sourceId','financialSourcePayloadHash',financial->>'payloadHash','dataset',p_dataset)else jsonb_build_object('path','carrier.documents[POSTWAR_FINANCIAL_OFFICE_ORIGINALS].bytes::json.contract.countries[countryId]','dataset',p_dataset)end;
 elsif p_office in('INDUSTRY','TRADE')and p_dataset='opening-inventory-entries'then
  select x into financial from jsonb_array_elements(root->'sources')x where (x->>'canonicalPayload')::jsonb->>'schemaVersion'='adopted-financial-opening-source-v2';
  if financial is null then raise exception 'POSTWAR_ORIGINAL_FINANCIAL_SOURCE_REQUIRED'using errcode='23514';end if;
  select coalesce(jsonb_agg(x order by x->>'entryId'),'[]'::jsonb)into items from jsonb_array_elements(root->'inventoryEntries')x where x->'account'->>'countryId'=p_country;
  source_pointer:=source_pointer||jsonb_build_object('path','seed.inventoryEntries[account.countryId]','inventorySources',(select coalesce(jsonb_agg(jsonb_build_object('sourceId',inventory_source->>'sourceId','sourcePayloadHash',inventory_source->>'payloadHash')order by inventory_source->>'sourceId'),'[]'::jsonb)from jsonb_array_elements(root->'sources')inventory_source where exists(select 1 from jsonb_array_elements(items)i where i->>'sourceId'=inventory_source->>'sourceId')));
 elsif p_office in('INDUSTRY','CAPTAIN')and p_dataset='regional-source-capacity'then
  mapping:=(op->'carrier'->'selectedSource'->>'regionMappingBytes')::jsonb;
  select coalesce(jsonb_agg(jsonb_build_object('countryId',p_country,'locationId',m->>'normalizedRegionId','sourceRegionId',r->>'id','sourceInitial',r->'initial','sourceStatus','PINNED_SOURCE_CAPACITY_NOT_CURRENT_DELIVERY')order by m->>'normalizedRegionId'),'[]'::jsonb)into items from jsonb_array_elements((op->'carrier'->'selectedSource'->>'regionsBytes')::jsonb)r join jsonb_array_elements(mapping->'mappings')m on m->>'sourceRegionId'=r->>'id' where m->>'coreCountryId'=p_country;
  source_pointer:=source_pointer||jsonb_build_object('path','carrier.selectedSource.regionsBytes::json.initial','mapping','carrier.selectedSource.regionMappingBytes::json.mappings');
 elsif p_office='CAPTAIN'and p_dataset='public-service-summary'then
  select coalesce(jsonb_agg(jsonb_build_object('regionId',x->>'regionId','kind',x->>'kind','demandCount',x->>'demandCount','capacityCount',x->>'capacityCount','allocatedCount',x->>'allocatedCount','unallocatedCount',x->>'unallocatedCount')order by x->>'regionId',x->>'serviceId'),'[]'::jsonb)into items from jsonb_array_elements(op->'carrier'->'facts'->'services')x where exists(select 1 from jsonb_array_elements(op->'carrier'->'facts'->'regions')r where r->>'countryId'=p_country and r->>'regionId'=x->>'regionId');
  source_pointer:=source_pointer||jsonb_build_object('path','carrier.facts.services[region.countryId].publicSummary');
 else raise exception 'POSTWAR_OFFICE_DATASET_DENIED'using errcode='42501';end if;
 if items is null or jsonb_typeof(items)<>'array'then raise exception 'POSTWAR_SOURCE_DATASET_REQUIRED'using errcode='23514';end if;
 total:=jsonb_array_length(items);doc_hash:=encode(sha256(convert_to(items::text,'UTF8')),'hex');
 ref:='POSTWAR_PROJECTION_'||upper(encode(sha256(convert_to(jsonb_build_array(p_world,p_country,p_office,p_dataset,s.seed_fingerprint,a.admission_ref,seed_sha,doc_hash)::text,'UTF8')),'hex'));
 version:='sha256:'||encode(sha256(convert_to(ref||doc_hash,'UTF8')),'hex');
 select * into existing from world_v2.postwar_office_projection_document d where d.world_id=p_world and d.country_id=p_country and d.office_id=p_office and d.dataset=p_dataset and d.projection_version='postwar-office-projection.v1';
 if found then if existing.document_ref<>ref then raise exception 'POSTWAR_PROJECTION_IMMUTABLE_CONFLICT'using errcode='23514';end if;return existing;end if;
 -- Count and reject oversize rows before creating any metadata; publication is atomic.
 for item in select value from jsonb_array_elements(items)loop
  if octet_length(jsonb_build_array(item)::text)>48000 then raise exception 'POSTWAR_PROJECTION_SINGLE_ROW_TOO_LARGE'using errcode='54000';end if;
  if jsonb_array_length(buffer)>=100 or octet_length((buffer||jsonb_build_array(item))::text)>48000 then pages:=pages+1;buffer:='[]'::jsonb;end if;buffer:=buffer||jsonb_build_array(item);
 end loop;buffer:='[]'::jsonb;
 insert into world_v2.postwar_office_projection_document(document_ref,world_id,country_id,office_id,dataset,projection_version,source_version,source_revision,admission_ref,seed_id,seed_fingerprint,canonical_seed_sha256,source_bundle_sha256,source_id,source_payload_hash,source_pointer,model_version,replay_binding,world_version,event_sequence,document_sha256,total_rows,page_count)
 values(ref,p_world,p_country,p_office,p_dataset,'postwar-office-projection.v1',version,op_source->>'sourceVersion',a.admission_ref,s.seed_id,s.seed_fingerprint,seed_sha,a.source_bundle_sha256,op_source->>'sourceId',op_source->>'payloadHash',source_pointer,a.model_version,a.replay_binding,0,0,doc_hash,total,pages);
 for item in select value from jsonb_array_elements(items)loop
  if jsonb_array_length(buffer)>=100 or octet_length((buffer||jsonb_build_array(item))::text)>48000 then
   insert into world_v2.postwar_office_projection_page values(ref,p_world,p_country,p_office,page_index,row_offset,jsonb_array_length(buffer),buffer::text,encode(sha256(convert_to(buffer::text,'UTF8')),'hex'));row_offset:=row_offset+jsonb_array_length(buffer);page_index:=page_index+1;buffer:='[]'::jsonb;
  end if;buffer:=buffer||jsonb_build_array(item);
 end loop;
 insert into world_v2.postwar_office_projection_page values(ref,p_world,p_country,p_office,page_index,row_offset,jsonb_array_length(buffer),buffer::text,encode(sha256(convert_to(buffer::text,'UTF8')),'hex'));
 select * into strict existing from world_v2.postwar_office_projection_document where document_ref=ref;return existing;
end;$newbody$;
 execute replace(f.definition,f.prosrc,replacement);
 if(select encode(sha256(convert_to(prosrc,'UTF8')),'hex')from pg_proc where oid=f.oid)<>'111412723943d36aebce870374cd4d7b728b291119e17e5bad50371730beb800'then raise exception 'COMPLETE_INVENTORY_EXACT_NEW_FUNCTION_REQUIRED'using errcode='55000';end if;
end;$adapt$;

-- Fixed adaptation: world_v2.read_postwar_office_projection_h0_page(text,text,text,integer,integer,text)
do $adapt$declare f record;definition text;replacement text;begin
 select p.*,pg_get_functiondef(p.oid)as definition into f from pg_proc p where p.oid=to_regprocedure('world_v2.read_postwar_office_projection_h0_page(text,text,text,integer,integer,text)');
 if not found or pg_get_userbyid(f.proowner)<>'world_v2_postwar_projection_owner'or not f.prosecdef or f.proconfig is distinct from array['search_path=pg_catalog']::text[]or encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>'ce4477def490cd613dd615cc7c53668fecce08077bdbaf707bd53b2140cc7303'then raise exception 'COMPLETE_INVENTORY_EXACT_INSTALLED_FUNCTION_REQUIRED:read_postwar_office_projection_page'using errcode='55000';end if;
 replacement:=$newbody$
declare s record;d world_v2.postwar_office_projection_document%rowtype;p world_v2.postwar_office_projection_page%rowtype;selected jsonb;returned integer;begin
 if p_offset is null or p_limit is null or p_offset<0 or p_offset>100000 or p_limit<1 or p_limit>100 then raise exception 'POSTWAR_INVALID_PAGE'using errcode='22023';end if;
 select * into s from world_v2.read_postwar_office_projection_seats(p_world)x where x.office_id=p_office and(p_office<>'SOCIAL'or exists(select 1 from world_v2.current_commit_authorization a where a.world_id=x.world_id and a.auth_subject::text=x.auth_subject and a.country_id=x.country_id and a.office_id='SOCIAL'and a.team_id=x.team_id and a.authorization_version=x.authorization_revision and a.capability='SOCIAL_LABOUR'and a.active));
 if not found then return query select 'DENIED',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 if s.world_version<>'0'or s.event_sequence<>'0'then return query select 'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into d from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=s.country_id and x.office_id=p_office and ((p_dataset='opening-inventory-entries'and x.document_ref=world_v2.postwar_complete_opening_inventory_document(p_world,s.country_id,p_office))or(p_dataset<>'opening-inventory-entries'and x.dataset=p_dataset)) and x.projection_version='postwar-office-projection.v1'and x.admission_ref=s.admission_ref and x.seed_fingerprint=s.seed_fingerprint and x.source_bundle_sha256=s.source_bundle_sha256;
 if not found or not world_v2.postwar_projection_document_readable(d.document_ref,d.world_id,d.country_id,d.office_id,d.admission_ref,d.seed_fingerprint,d.source_bundle_sha256) then return query select 'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 if p_expected_version is not null and p_expected_version<>d.source_version then return query select 'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into p from world_v2.postwar_office_projection_page x where x.document_ref=d.document_ref and x.row_offset<=p_offset and (p_offset<x.row_offset+x.row_count or d.total_rows=0)order by x.page_index desc limit 1;
 if p_offset>=d.total_rows then selected:='[]'::jsonb;else
  if p.document_ref is null then raise exception 'POSTWAR_PROJECTION_PAGE_MISSING'using errcode='23514';end if;
  select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb)into selected from jsonb_array_elements(p.rows_text::jsonb)with ordinality where ordinality>p_offset-p.row_offset and ordinality<=p_offset-p.row_offset+p_limit;
 end if;returned:=jsonb_array_length(selected);
 return query select case when returned=0 then'EMPTY'else'PAGE'end,
 jsonb_build_object('worldId',s.world_id,'countryId',s.country_id,'officeId',s.office_id,'authSubject',s.auth_subject,'teamId',s.team_id,'authorizationVersion',s.authorization_revision,'scopeKey',s.scope_key,'seatRef',s.seat_ref),
 jsonb_build_object('dataNature','DERIVED_RAW_FROM_ADMITTED_H0_NOT_AUTHORITY','sourceVersion',d.source_version,'sourceRevision',d.source_revision,'seedId',d.seed_id,'seedFingerprint',d.seed_fingerprint,'admissionRef',d.admission_ref,'modelVersion',d.model_version,'replayBinding',d.replay_binding,'sourceBundleSha256',d.source_bundle_sha256,'canonicalSeedSha256',d.canonical_seed_sha256,'worldVersion','0','eventSequence','0','pageHash',coalesce(p.page_sha256,encode(sha256(convert_to('[]','UTF8')),'hex')),'returnedRowsHash',encode(sha256(convert_to(selected::text,'UTF8')),'hex'),'hashAlgorithm','POSTGRES_JSONB_TEXT_UTF8_SHA256','sourcePointer',d.source_pointer),
 jsonb_build_object('offset',p_offset,'limit',p_limit,'returned',returned,'total',d.total_rows,'nextOffset',case when p_offset+returned<d.total_rows then p_offset+returned else null end),selected::text;
end;$newbody$;
 execute replace(f.definition,f.prosrc,replacement);
 if(select encode(sha256(convert_to(prosrc,'UTF8')),'hex')from pg_proc where oid=f.oid)<>'9a7c3ec6785a3ba20152a2db10a1999d2c1677fac23669bd3a7a713e8a1d34f6'then raise exception 'COMPLETE_INVENTORY_EXACT_NEW_FUNCTION_REQUIRED'using errcode='55000';end if;
end;$adapt$;

-- Fixed adaptation: world_v2.read_postwar_physical_opening_facts_page(text,text,text,integer,integer,text)
do $adapt$declare f record;definition text;replacement text;begin
 select p.*,pg_get_functiondef(p.oid)as definition into f from pg_proc p where p.oid=to_regprocedure('world_v2.read_postwar_physical_opening_facts_page(text,text,text,integer,integer,text)');
 if not found or pg_get_userbyid(f.proowner)<>'world_v2_postwar_projection_owner'or not f.prosecdef or f.proconfig is distinct from array['search_path=pg_catalog']::text[]or encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>'1873dbc7183fdfcf79cf058303de179484a60f463cc12ab508142fb7ed6526d4'then raise exception 'COMPLETE_INVENTORY_EXACT_INSTALLED_FUNCTION_REQUIRED:read_postwar_physical_opening_facts_page'using errcode='55000';end if;
 replacement:=$newbody$
declare s record;d world_v2.postwar_office_projection_document%rowtype;
 p world_v2.postwar_office_projection_page%rowtype;selected jsonb;returned integer;
begin
 if p_offset is null or p_limit is null or p_offset<0 or p_offset>100000 or p_limit<1 or p_limit>100
 or(p_offset>0 and p_expected_version is null)
 or(p_expected_version is not null and p_expected_version!~'^sha256:[0-9a-f]{64}$')then
  raise exception 'POSTWAR_INVALID_OPENING_PAGE'using errcode='22023';end if;
 if not((p_office in('INDUSTRY','TRADE')and p_dataset='opening-inventory-entries')
 or(p_office in('INDUSTRY','CAPTAIN')and p_dataset='regional-source-capacity')
 or(p_office='CAPTAIN'and p_dataset='public-service-summary'))then
  raise exception 'POSTWAR_PHYSICAL_OPENING_DATASET_DENIED'using errcode='42501';end if;
 -- This fixed function checks real role/subject, stable READ ONLY mode, current
 -- capability/seat/revision/entitlement and the immutable admission/permit.
 -- It returns the actual global head; historical data does not require H=0.
 select * into s from world_v2.read_postwar_office_projection_seats(p_world)x where x.office_id=p_office;
 if not found then return query select 'DENIED',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into d from world_v2.postwar_office_projection_document x
 where x.world_id=p_world and x.country_id=s.country_id and x.office_id=p_office and ((p_dataset='opening-inventory-entries'and x.document_ref=world_v2.postwar_complete_opening_inventory_document(p_world,s.country_id,p_office))or(p_dataset<>'opening-inventory-entries'and x.dataset=p_dataset))
 and x.projection_version='postwar-office-projection.v1'
 and x.world_version=0 and x.event_sequence=0
 and x.admission_ref=s.admission_ref and x.seed_id=s.seed_id and x.seed_fingerprint=s.seed_fingerprint
 and x.model_version=s.model_version and x.replay_binding=s.replay_binding
 and x.source_bundle_sha256=s.source_bundle_sha256;
 -- Inline the old readable helper's document revocation clause. Calling that
 -- helper would incorrectly impose its H0-current-head veto on history.
 if not found or exists(select 1 from world_v2.postwar_office_projection_revocation r where r.document_ref=d.document_ref and r.world_id=p_world)
 then return query select 'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 if p_expected_version is not null and p_expected_version<>d.source_version then
  return query select 'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into p from world_v2.postwar_office_projection_page x
 where x.document_ref=d.document_ref and x.world_id=p_world and x.country_id=s.country_id and x.office_id=p_office
 and x.row_offset<=p_offset and(p_offset<x.row_offset+x.row_count or d.total_rows=0)
 order by x.page_index desc limit 1;
 if p_offset>=d.total_rows then selected:='[]'::jsonb;else
  if p.document_ref is null or p.page_sha256<>encode(sha256(convert_to(p.rows_text,'UTF8')),'hex')
  or jsonb_array_length(p.rows_text::jsonb)<>p.row_count then
   raise exception 'POSTWAR_OPENING_PAGE_HASH_OR_COUNT_INVALID'using errcode='23514';end if;
  select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb)into selected
  from jsonb_array_elements(p.rows_text::jsonb)with ordinality
  where ordinality>p_offset-p.row_offset and ordinality<=p_offset-p.row_offset+p_limit;
 end if;
 if octet_length(selected::text)>48000 then raise exception 'POSTWAR_OPENING_PAGE_TOO_LARGE'using errcode='54000';end if;
 returned:=jsonb_array_length(selected);
 return query select case when returned=0 then'EMPTY'else'PAGE'end,
 jsonb_build_object('worldId',s.world_id,'countryId',s.country_id,'officeId',s.office_id,'authSubject',s.auth_subject,'teamId',s.team_id,'authorizationVersion',s.authorization_revision,'scopeKey',s.scope_key,'seatRef',s.seat_ref),
 jsonb_build_object('dataNature','DERIVED_RAW_FROM_ADMITTED_H0_NOT_AUTHORITY','sourceVersion',d.source_version,'sourceRevision',d.source_revision,'seedId',d.seed_id,'seedFingerprint',d.seed_fingerprint,'admissionRef',d.admission_ref,'modelVersion',d.model_version,'replayBinding',d.replay_binding,'sourceBundleSha256',d.source_bundle_sha256,'canonicalSeedSha256',d.canonical_seed_sha256,'worldVersion','0','eventSequence','0','pageHash',coalesce(p.page_sha256,encode(sha256(convert_to('[]','UTF8')),'hex')),'returnedRowsHash',encode(sha256(convert_to(selected::text,'UTF8')),'hex'),'hashAlgorithm','POSTGRES_JSONB_TEXT_UTF8_SHA256','sourcePointer',d.source_pointer),
 jsonb_build_object('offset',p_offset,'limit',p_limit,'returned',returned,'total',d.total_rows,'nextOffset',case when p_offset+returned<d.total_rows then p_offset+returned else null end),selected::text;
end;$newbody$;
 execute replace(f.definition,f.prosrc,replacement);
 if(select encode(sha256(convert_to(prosrc,'UTF8')),'hex')from pg_proc where oid=f.oid)<>'933e7e0c0cc1b6f1ae2bd9ed3e52ecdf36a0aa64ff1426a1e07a43f7b6335148'then raise exception 'COMPLETE_INVENTORY_EXACT_NEW_FUNCTION_REQUIRED'using errcode='55000';end if;
end;$adapt$;

-- Fixed adaptation: world_v2.publish_postwar_inventory_provenance_v2(text,text,text,text,text,text)
do $adapt$declare f record;definition text;replacement text;begin
 select p.*,pg_get_functiondef(p.oid)as definition into f from pg_proc p where p.oid=to_regprocedure('world_v2.publish_postwar_inventory_provenance_v2(text,text,text,text,text,text)');
 if not found or pg_get_userbyid(f.proowner)<>'world_v2_postwar_projection_owner'or not f.prosecdef or f.proconfig is distinct from array['search_path=pg_catalog']::text[]or encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>'664d6998114a136d31e9ce510eeb51420a47a7804a8ec3cc0ed175c23c79b231'then raise exception 'COMPLETE_INVENTORY_EXACT_INSTALLED_FUNCTION_REQUIRED:publish_postwar_inventory_provenance_v2'using errcode='55000';end if;
 replacement:=$newbody$
declare effective name;a record;s record;d record;existing world_v2.postwar_inventory_provenance_v2%rowtype;
 root json;financial json;operating json;src json;schema_name text;financial_count integer:=0;operating_count integer:=0;items jsonb;copied jsonb;pointer jsonb;raw_sha text;doc_sha text;ref text;version text;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')then raise exception 'POSTWAR_FIXED_PROJECTION_PUBLISHER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.postwar_projection_world',p_world,true);
 perform world_v2.publish_postwar_complete_opening_inventory(p_world,p_country,p_seed_fingerprint,p_canonical_sha256,p_bundle_sha256,p_admission);
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 perform 1 from world_v2.runtime_admission_publication_permit q where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref for share;
 if exists(select 1 from world_v2.runtime_admission_publication_revocation r join world_v2.runtime_admission_publication_permit q using(authorization_id)where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref)then raise exception 'POSTWAR_INVENTORY_ADMISSION_REVOKED'using errcode='55000';end if;
 select * into strict s from world_v2.opening_seed x where x.world_id=p_world;
 raw_sha:=encode(sha256(convert_to(s.canonical_payload,'UTF8')),'hex');
 if s.seed_fingerprint<>p_seed_fingerprint or s.seed_fingerprint<>a.seed_fingerprint or raw_sha<>p_canonical_sha256 or a.source_bundle_sha256<>p_bundle_sha256 or a.admission_ref<>p_admission
 or s.seed_fingerprint<>'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||s.canonical_payload,'UTF8')),'hex')then raise exception 'POSTWAR_INVENTORY_ACTUAL_SOURCE_PINS_REQUIRED'using errcode='23514';end if;
 -- Offline only. Keep the large root/carriers as JSON text; only individual
 -- small inventory entries become JSONB. This preserves the exact hashes and
 -- immutable output while avoiding expansion of the whole operating carrier.
 root:=s.canonical_payload::json;
 s.canonical_payload:=null;
 if root->>'worldId'<>p_world or root->>'seedId'<>a.seed_id then raise exception 'POSTWAR_INVENTORY_CANONICAL_SCOPE_REQUIRED'using errcode='23514';end if;
 for src in select value from json_array_elements(root->'sources')loop
  -- Inspect only each root schema with JSON text, not a JSONB expansion of the
  -- 120 MB operating carrier. One source walk replaces repeated lateral casts.
  schema_name:=((src->>'canonicalPayload')::json)->>'schemaVersion';
  if schema_name='adopted-financial-opening-source-v2'then financial:=src;financial_count:=financial_count+1;
  elsif schema_name='postwar-operating-genesis-seed-source-v1' then operating:=src;operating_count:=operating_count+1;end if;
 end loop;
 if financial_count<>1 or operating_count<>1 then raise exception 'POSTWAR_INVENTORY_UNIQUE_SOURCE_ROLES_REQUIRED'using errcode='23514';end if;
 if financial->>'sourceKind'<>'AUTHORITATIVE_DATASET'or financial->>'sourceId'=operating->>'sourceId'
 or financial->>'payloadHash'<>'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||'{"payload":'||(financial->>'canonicalPayload')||'}','UTF8')),'hex')
 or operating->>'payloadHash'<>'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||'{"payload":'||(operating->>'canonicalPayload')||'}','UTF8')),'hex')then raise exception 'POSTWAR_INVENTORY_SOURCE_HASH_OR_KIND_INVALID'using errcode='23514';end if;
 -- Payload hashes above were checked against the actual full source text.
 -- Only metadata is needed from here onward; release those large carriers.
 financial:=json_build_object('sourceId',financial->>'sourceId','payloadHash',financial->>'payloadHash','sourceVersion',financial->>'sourceVersion');
 operating:=json_build_object('sourceId',operating->>'sourceId','payloadHash',operating->>'payloadHash','sourceVersion',operating->>'sourceVersion');
 src:=null;
 select coalesce(jsonb_agg(x::jsonb order by x->>'entryId'),'[]'::jsonb)into items from json_array_elements(root->'inventoryEntries')x where x->'account'->>'countryId'=p_country;
 root:=null;
 doc_sha:=encode(sha256(convert_to(items::text,'UTF8')),'hex');
 perform 1 from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_country and x.office_id in('INDUSTRY','TRADE')and x.document_ref=world_v2.postwar_complete_opening_inventory_document(p_world,p_country,x.office_id)for share;
 if(select count(*)from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_country and x.office_id in('INDUSTRY','TRADE')and x.document_ref=world_v2.postwar_complete_opening_inventory_document(p_world,p_country,x.office_id))<>2 then raise exception 'POSTWAR_INVENTORY_BOTH_LEGACY_DOCUMENTS_REQUIRED'using errcode='23514';end if;
 for d in select * from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_country and x.office_id in('INDUSTRY','TRADE')and x.document_ref=world_v2.postwar_complete_opening_inventory_document(p_world,p_country,x.office_id)order by x.office_id loop
  if d.projection_version<>'postwar-office-projection.v1'or d.world_version<>0 or d.event_sequence<>0 or d.seed_fingerprint<>a.seed_fingerprint or d.admission_ref<>a.admission_ref or d.source_bundle_sha256<>a.source_bundle_sha256 or d.canonical_seed_sha256<>raw_sha
  or d.source_id<>operating->>'sourceId'or d.source_payload_hash<>operating->>'payloadHash'or d.document_sha256<>doc_sha or d.total_rows<>jsonb_array_length(items)
  or exists(select 1 from world_v2.postwar_office_projection_revocation r where r.world_id=p_world and r.document_ref=d.document_ref)then raise exception 'POSTWAR_INVENTORY_LEGACY_SOURCE_OR_ROWS_DIFFER'using errcode='23514';end if;
  if exists(select 1 from world_v2.postwar_office_projection_page p where p.document_ref=d.document_ref and(p.page_sha256<>encode(sha256(convert_to(p.rows_text,'UTF8')),'hex')or p.row_count<>jsonb_array_length(p.rows_text::jsonb)))then raise exception 'POSTWAR_INVENTORY_LEGACY_PAGE_HASH_INVALID'using errcode='23514';end if;
  select coalesce(jsonb_agg(x.value order by p.row_offset,x.ordinality),'[]'::jsonb)into copied from world_v2.postwar_office_projection_page p cross join lateral jsonb_array_elements(p.rows_text::jsonb)with ordinality x where p.document_ref=d.document_ref;
  if copied<>items then raise exception 'POSTWAR_INVENTORY_LEGACY_PAGE_ROWS_DIFFER'using errcode='23514';end if;
  pointer:=jsonb_build_object('schemaVersion','postwar-inventory-source-pointer-v2','sourceRole',case when jsonb_array_length(d.source_pointer->'inventorySources')>1 then'MULTIPLE_DIRECT_ROW_SOURCES'else'DIRECT_ROW_SOURCE'end,'inventorySources',d.source_pointer->'inventorySources','sourceId',financial->>'sourceId','sourcePayloadHash',financial->>'payloadHash','decode','seed.inventoryEntries[]','path','seed.inventoryEntries[account.countryId]','countryId',p_country,'adoptionContextSourceRole','OPERATING_ADOPTION_CONTEXT','adoptionContextSourceId',operating->>'sourceId','adoptionContextSourcePayloadHash',operating->>'payloadHash','legacyDocumentRef',d.document_ref,'legacySourceVersion',d.source_version,'legacyPointerSemantics','LEGACY_ADOPTION_CONTEXT_POINTER_NOT_DIRECT_ROW_SOURCE');
  ref:='POSTWAR_INVENTORY_PROVENANCE_'||upper(encode(sha256(convert_to(d.document_ref||pointer::text||doc_sha,'UTF8')),'hex'));
  version:='sha256:'||encode(sha256(convert_to('postwar-inventory-provenance-v2'||chr(10)||ref||d.source_version,'UTF8')),'hex');
  select * into existing from world_v2.postwar_inventory_provenance_v2 x where x.document_ref=d.document_ref;
  if found then if existing.source_version<>version or existing.source_pointer<>pointer then raise exception 'POSTWAR_INVENTORY_IMMUTABLE_PROVENANCE_CONFLICT'using errcode='23514';end if;return next existing;continue;end if;
  insert into world_v2.postwar_inventory_provenance_v2 values(ref,p_world,p_country,d.office_id,d.document_ref,d.source_version,version,financial->>'sourceVersion',a.seed_fingerprint,a.admission_ref,raw_sha,a.source_bundle_sha256,doc_sha,financial->>'sourceId',financial->>'payloadHash',operating->>'sourceId',operating->>'payloadHash',pointer)returning * into existing;
  return next existing;
 end loop;
end;$newbody$;
 execute replace(f.definition,f.prosrc,replacement);
 if(select encode(sha256(convert_to(prosrc,'UTF8')),'hex')from pg_proc where oid=f.oid)<>'af0c6d9725fd113492288d7a9f7c9a2a3cbf3728dfe0c683e48999542c65ce93'then raise exception 'COMPLETE_INVENTORY_EXACT_NEW_FUNCTION_REQUIRED'using errcode='55000';end if;
end;$adapt$;

-- Fixed adaptation: world_v2.read_postwar_inventory_provenance_v2_page(text,text,text,integer,integer,text)
do $adapt$declare f record;definition text;replacement text;begin
 select p.*,pg_get_functiondef(p.oid)as definition into f from pg_proc p where p.oid=to_regprocedure('world_v2.read_postwar_inventory_provenance_v2_page(text,text,text,integer,integer,text)');
 if not found or pg_get_userbyid(f.proowner)<>'world_v2_postwar_projection_owner'or not f.prosecdef or f.proconfig is distinct from array['search_path=pg_catalog']::text[]or encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>'092717c07debae7b65d80c92e5bc026de9a479dcc744bcb37ce75c2f6a54c3b5'then raise exception 'COMPLETE_INVENTORY_EXACT_INSTALLED_FUNCTION_REQUIRED:read_postwar_inventory_provenance_v2_page'using errcode='55000';end if;
 replacement:=$newbody$
declare s record;v world_v2.postwar_inventory_provenance_v2%rowtype;page record;begin
 if p_offset is null or p_limit is null or p_offset<0 or p_offset>100000 or p_limit<1 or p_limit>100 or(p_offset>0 and p_expected_version is null)or(p_expected_version is not null and p_expected_version!~'^sha256:[0-9a-f]{64}$')then raise exception 'POSTWAR_INVENTORY_V2_INVALID_PAGE'using errcode='22023';end if;
 if p_office is null or p_dataset is null or p_office not in('INDUSTRY','TRADE')or p_dataset<>'opening-inventory-entries'then raise exception 'POSTWAR_INVENTORY_V2_DATASET_DENIED'using errcode='42501';end if;
 select * into s from world_v2.read_postwar_office_projection_seats(p_world)x where x.office_id=p_office;
 if not found then return query select 'DENIED',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into v from world_v2.postwar_inventory_provenance_v2 x where x.world_id=p_world and x.country_id=s.country_id and x.office_id=p_office and x.document_ref=world_v2.postwar_complete_opening_inventory_document(p_world,s.country_id,p_office)and x.seed_fingerprint=s.seed_fingerprint and x.admission_ref=s.admission_ref and x.source_bundle_sha256=s.source_bundle_sha256;
 if not found then return query select 'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 if p_expected_version is not null and p_expected_version<>v.source_version then return query select 'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 -- Reuse every existing identity, current seat, admission/permit, revocation,
 -- page hash/count/byte and historical H0-origin check. No raw seed read here.
 select * into page from world_v2.read_postwar_physical_opening_facts_page(p_world,p_office,p_dataset,p_offset,p_limit,v.legacy_source_version);
 if page.status not in('PAGE','EMPTY')then return query select page.status,page.scope_json,page.source_json,page.page_json,page.rows_text;return;end if;
 if page.source_json->>'sourceVersion'<>v.legacy_source_version or page.source_json->>'canonicalSeedSha256'<>v.canonical_seed_sha256 then raise exception 'POSTWAR_INVENTORY_V2_DOCUMENT_BINDING_INVALID'using errcode='23514';end if;
 return query select page.status,page.scope_json,page.source_json||jsonb_build_object('sourceVersion',v.source_version,'sourceRevision',v.source_revision,'sourcePointer',v.source_pointer),page.page_json,page.rows_text;
end;$newbody$;
 execute replace(f.definition,f.prosrc,replacement);
 if(select encode(sha256(convert_to(prosrc,'UTF8')),'hex')from pg_proc where oid=f.oid)<>'5ffe3b252a9628b53f907c907775b19627c352381216e96ef7542712a9d7c3ae'then raise exception 'COMPLETE_INVENTORY_EXACT_NEW_FUNCTION_REQUIRED'using errcode='55000';end if;
end;$adapt$;

-- Fixed adaptation: world_v2.postwar_write_trade_current_document(text,text,text,text,text,bigint,bigint,jsonb,jsonb,jsonb)
do $adapt$declare f record;definition text;replacement text;begin
 select p.*,pg_get_functiondef(p.oid)as definition into f from pg_proc p where p.oid=to_regprocedure('world_v2.postwar_write_trade_current_document(text,text,text,text,text,bigint,bigint,jsonb,jsonb,jsonb)');
 if not found or pg_get_userbyid(f.proowner)<>'world_v2_postwar_projection_owner'or not f.prosecdef or f.proconfig is distinct from array['search_path=pg_catalog']::text[]or encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>'26a485843da1fda3653af11463e31566a4bd21b1ebab1701f001c977107934ab'then raise exception 'COMPLETE_INVENTORY_EXACT_INSTALLED_FUNCTION_REQUIRED:postwar_write_trade_current_document'using errcode='55000';end if;
 replacement:=$newbody$
declare h record;a record;b world_v2.postwar_office_projection_document%rowtype;d world_v2.postwar_paged_current_document%rowtype;ref text;version text;hash text;pages integer:=1;idx integer:=0;off integer:=0;buffer jsonb:='[]';item jsonb;revision text;
begin
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select * into strict h from world_v2.world_head where world_id=p_world for share;
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 if h.world_version<1 or h.event_sequence<1 or p_origin_world_version<0 or p_origin_world_version>h.world_version or p_origin_event_sequence<0 or p_origin_event_sequence>h.event_sequence or(p_origin_world_version=0)<>(p_origin_event_sequence=0)or p_coverage->>'globalWorldVersion'is distinct from h.world_version::text or p_coverage->>'globalEventSequence'is distinct from h.event_sequence::text or p_coverage->>'countryId'is distinct from p_country or jsonb_typeof(p_rows)is distinct from 'array'or jsonb_typeof(p_source_pointer)is distinct from 'object'then raise exception 'MIXED_DOCUMENT_SCOPE_HEAD_REQUIRED'using errcode='23514';end if;
 if p_office<>'TRADE'or p_dataset not in('inventory-current','goods-transfers-current')then raise exception 'TRADE_CURRENT_FIXED_DATASET_REQUIRED'using errcode='22023';end if;
 select * into strict b from world_v2.postwar_office_projection_document x where x.document_ref=p_base_document_ref and x.world_id=p_world and x.country_id=p_country and x.office_id='TRADE'and x.document_ref=world_v2.postwar_complete_opening_inventory_document(p_world,p_country,'TRADE')and x.world_version=0 and x.event_sequence=0 and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref and x.source_bundle_sha256=a.source_bundle_sha256 and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.world_id=p_world and r.document_ref=x.document_ref)for share;
 revision:=b.source_revision;
 if p_coverage->>'reducerVersion'is distinct from'POSTWAR_COMPLETE_MIXED_PAGED_PREFIX_V1'or p_coverage->'pageProof'->>'schemaVersion'is distinct from'postwar-complete-page-proof-v1'or p_coverage->'pageProof'->>'hashAlgorithm'is distinct from'COMPLETE_CANONICAL_PAGE_CHAINS_SHA256_V1'or p_coverage->'pageProof'->>'frameCount'is distinct from h.world_version::text then raise exception 'PAGED_EXACT_COMPLETE_COVERAGE_REQUIRED'using errcode='23514';end if;

 hash:=encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
 ref:='POSTWAR_PAGED_CURRENT_'||upper(encode(sha256(convert_to(world_v2.canonical_json(jsonb_build_array(p_world,p_country,p_office,p_dataset,p_base_document_ref,a.seed_fingerprint,a.admission_ref,h.world_version::text,h.event_sequence::text,p_origin_world_version::text,p_origin_event_sequence::text,hash,p_coverage,p_source_pointer)),'UTF8')),'hex'));
 version:='sha256:'||encode(sha256(convert_to(ref||hash,'UTF8')),'hex');
 select * into d from world_v2.postwar_paged_current_document x where x.world_id=p_world and x.country_id=p_country and x.office_id=p_office and x.dataset=p_dataset and x.world_version=h.world_version and x.event_sequence=h.event_sequence;
 if found then if d.document_ref<>ref or exists(select 1 from world_v2.postwar_paged_current_revocation rv where rv.document_ref=d.document_ref)then raise exception 'MIXED_IMMUTABLE_DOCUMENT_CONFLICT'using errcode='23514';end if;return d;end if;
 for item in select value from jsonb_array_elements(p_rows)loop
  if octet_length(jsonb_build_array(item)::text)>48000 then raise exception 'MIXED_ROW_CAPACITY_EXCEEDED'using errcode='54000';end if;
  if jsonb_array_length(buffer)>=100 or octet_length((buffer||jsonb_build_array(item))::text)>48000 then pages:=pages+1;buffer:='[]';end if;buffer:=buffer||jsonb_build_array(item);
 end loop;
 insert into world_v2.postwar_paged_current_document values(ref,p_world,p_country,p_office,p_dataset,p_base_document_ref,h.world_version,h.event_sequence,p_origin_world_version,p_origin_event_sequence,version,revision,a.admission_ref,a.seed_id,a.seed_fingerprint,b.canonical_seed_sha256,a.source_bundle_sha256,a.model_version,a.replay_binding,hash,p_coverage,p_source_pointer,jsonb_array_length(p_rows),pages);
 buffer:='[]';for item in select value from jsonb_array_elements(p_rows)loop
  if jsonb_array_length(buffer)>=100 or octet_length((buffer||jsonb_build_array(item))::text)>48000 then
   insert into world_v2.postwar_paged_current_page values(ref,p_world,idx,off,jsonb_array_length(buffer),buffer::text,encode(sha256(convert_to(buffer::text,'UTF8')),'hex'));off:=off+jsonb_array_length(buffer);idx:=idx+1;buffer:='[]';end if;buffer:=buffer||jsonb_build_array(item);
 end loop;
 insert into world_v2.postwar_paged_current_page values(ref,p_world,idx,off,jsonb_array_length(buffer),buffer::text,encode(sha256(convert_to(buffer::text,'UTF8')),'hex'));
 select * into strict d from world_v2.postwar_paged_current_document where document_ref=ref;return d;
end;$newbody$;
 execute replace(f.definition,f.prosrc,replacement);
 if(select encode(sha256(convert_to(prosrc,'UTF8')),'hex')from pg_proc where oid=f.oid)<>'8f356638bbe8ee5a7330a9bc9c512c9403e9f3621c928f8ed2dc90d5e1613e43'then raise exception 'COMPLETE_INVENTORY_EXACT_NEW_FUNCTION_REQUIRED'using errcode='55000';end if;
end;$adapt$;

-- Fixed adaptation: world_v2.publish_postwar_paged_trade_current(text,text,text)
do $adapt$declare f record;definition text;replacement text;begin
 select p.*,pg_get_functiondef(p.oid)as definition into f from pg_proc p where p.oid=to_regprocedure('world_v2.publish_postwar_paged_trade_current(text,text,text)');
 if not found or pg_get_userbyid(f.proowner)<>'world_v2_postwar_projection_owner'or not f.prosecdef or f.proconfig is distinct from array['search_path=pg_catalog']::text[]or encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>'0712526600a433fe15538fe929fda6639183b558f19c7e46fb89d095441aea7f'then raise exception 'COMPLETE_INVENTORY_EXACT_INSTALLED_FUNCTION_REQUIRED:publish_postwar_paged_trade_current'using errcode='55000';end if;
 replacement:=$newbody$
declare h record;a record;prefix record;b world_v2.postwar_office_projection_document%rowtype;assertion jsonb;inventory jsonb;transfers jsonb;inventory_hash text;transfer_hash text;coverage jsonb;pointer jsonb;dataset_name text;items jsonb;valid_balances boolean;
begin
 -- This existing fixed lock enforces the actual separate publisher, RR, source
 -- epoch fence, held H, current admission/permit and unrevoked Social parents.
 select * into strict h from world_v2.lock_postwar_paged_current_publication(p_world,p_country);
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 if octet_length(p_assertion)>16384 then raise exception 'TRADE_CURRENT_BOUNDED_ASSERTION_REQUIRED'using errcode='54000';end if;
 assertion:=p_assertion::jsonb;
 select * into strict prefix from world_v2.verify_postwar_paged_current_coverage(p_world,p_country,assertion->'coverage');
 if assertion->'head'is distinct from jsonb_build_object('worldId',p_world,'worldVersion',h.world_version,'eventSequence',h.event_sequence)or assertion->'seedPins'is distinct from jsonb_build_object('worldId',p_world,'seedId',a.seed_id,'seedFingerprint',a.seed_fingerprint,'admissionRef',a.admission_ref)or assertion->'coverage'is distinct from jsonb_build_object('prefixFingerprint',prefix.prefix_fingerprint,'knownEffectsFingerprint',prefix.effects_fingerprint,'coveredThroughEventId',prefix.last_event_id,'coveredThroughEventFingerprint',prefix.last_event_fingerprint,'financialPostingCount',prefix.financial_posting_count,'financialBatchCount',prefix.financial_batch_count,'financialPostingsFingerprint',prefix.financial_postings_fingerprint,'pageProof',prefix.page_proof)then raise exception 'TRADE_CURRENT_CORE_SQL_COMPLETE_PREFIX_MISMATCH'using errcode='23514';end if;
 select * into strict b from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_country and x.office_id='TRADE'and x.document_ref=world_v2.postwar_complete_opening_inventory_document(p_world,p_country,'TRADE')and x.world_version=0 and x.event_sequence=0 and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref and x.source_bundle_sha256=a.source_bundle_sha256 and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.world_id=p_world and r.document_ref=x.document_ref)for share;
 if(select count(*)from world_v2.postwar_office_projection_page pg where pg.document_ref=b.document_ref)<>b.page_count or(select coalesce(sum(pg.row_count),0)from world_v2.postwar_office_projection_page pg where pg.document_ref=b.document_ref)<>b.total_rows or exists(select 1 from world_v2.postwar_office_projection_page pg where pg.document_ref=b.document_ref and(pg.page_sha256<>encode(sha256(convert_to(pg.rows_text,'UTF8')),'hex')or pg.row_count<>jsonb_array_length(pg.rows_text::jsonb)))then raise exception 'TRADE_CURRENT_COMPLETE_H0_ROWS_REQUIRED'using errcode='23514';end if;
 with entries as(
 select x->'account'as account,(x->'quantity'->>'amount')::numeric as amount,x->'quantity'->>'unit'as unit from world_v2.postwar_office_projection_page pg cross join lateral jsonb_array_elements(pg.rows_text::jsonb)x where pg.document_ref=b.document_ref
 union all
 select x->'account',(x->'delta'->>'amount')::numeric,x->'delta'->>'unit'from world_v2.inventory_posting ip cross join lateral jsonb_array_elements(ip.canonical_payload::jsonb->'entries')x where ip.world_id=p_world and ip.world_version_after<=h.world_version::bigint and x->'account'->>'countryId'=p_country
 ), balances as(select account,sum(amount)as amount,bool_and(unit=account->>'unit'and account->>'worldId'=p_world and account->>'countryId'=p_country)as valid from entries group by account)
 select coalesce(jsonb_agg(world_v2.postwar_trade_inventory_row(account,amount)order by world_v2.canonical_json(account)collate "C")filter(where amount>0),'[]'),bool_and(valid and amount>=0)into inventory,valid_balances from balances;
 if valid_balances is false then raise exception 'TRADE_CURRENT_EXACT_NONNEGATIVE_INVENTORY_REQUIRED'using errcode='23514';end if;
 -- Every row below is an actual committed transfer, not a proposal/signature
 -- queue or an opening stock. The complete SQL reducer above validates every
 -- event, journal, approval and state transition before status is projected.
 with reserved as(
 select c.command_id,c.command_fingerprint,c.canonical_payload::jsonb as intent,ip.canonical_payload::jsonb as posting from world_v2.command_submission c join world_v2.command_receipt r on r.world_id=c.world_id and r.command_id=c.command_id and r.outcome='COMMITTED'join world_v2.authoritative_event e on e.world_id=c.world_id and e.causation_command_id=c.command_id and e.event_type='NARROW_TREASURY_GCU_RESERVED_V1'join world_v2.inventory_posting ip on ip.world_id=c.world_id and ip.causation_command_id=c.command_id where c.world_id=p_world and c.command_type='CORE_GOODS_TRANSFER_V1'and e.world_version<=h.world_version::bigint and(c.canonical_payload::jsonb->>'sellerCountryId'=p_country or c.canonical_payload::jsonb->>'buyerCountryId'=p_country)
 ), statuses as(
 select r.*,destination->'account'as reservation,sh.canonical_payload::jsonb as shipment,de.command_id as delivery_id from reserved r cross join lateral jsonb_array_elements(r.posting->'entries')destination
 left join world_v2.command_submission sh on sh.world_id=p_world and sh.command_type='CORE_GOODS_SHIPMENT_V1'and sh.canonical_payload::jsonb->>'transferCommandId'=r.command_id and sh.canonical_payload::jsonb->>'transferFingerprint'=r.command_fingerprint and exists(select 1 from world_v2.command_receipt rr join world_v2.authoritative_event ee on ee.world_id=rr.world_id and ee.causation_command_id=rr.command_id where rr.world_id=p_world and rr.command_id=sh.command_id and rr.outcome='COMMITTED'and ee.event_type='NARROW_TREASURY_GCU_SHIPPED_V1'and ee.world_version<=h.world_version::bigint)
 left join world_v2.command_submission de on de.world_id=p_world and de.command_type='CORE_GOODS_DELIVERY_V1'and de.canonical_payload::jsonb->>'transferCommandId'=r.command_id and de.canonical_payload::jsonb->>'transferFingerprint'=r.command_fingerprint and exists(select 1 from world_v2.command_receipt rr join world_v2.authoritative_event ee on ee.world_id=rr.world_id and ee.causation_command_id=rr.command_id where rr.world_id=p_world and rr.command_id=de.command_id and rr.outcome='COMMITTED'and ee.event_type='NARROW_TREASURY_GCU_DELIVERED_V1'and ee.world_version<=h.world_version::bigint)
 where(destination->'delta'->>'amount')::numeric>0
 )select coalesce(jsonb_agg(jsonb_build_object('schemaVersion','postwar-trade-current-transfer-row-v1','transferCommandId',command_id,'transferFingerprint',command_fingerprint,'sellerCountryId',intent->>'sellerCountryId','buyerCountryId',intent->>'buyerCountryId','commodityId',intent->>'commodityId','batchId',intent->'assetSource'->>'batchId','quantity',intent->'quantity'->>'amount','unit',intent->'quantity'->>'unit','reservationId',reservation->'reservationId','shipmentId',shipment->'shipmentId','status',case when delivery_id is not null then'DELIVERED'when shipment is not null then'SHIPPED'else'RESERVED'end)order by command_id collate "C"),'[]')into transfers from statuses;
 inventory_hash:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(inventory),'UTF8')),'hex');transfer_hash:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(transfers),'UTF8')),'hex');
 if assertion->>'inventoryRowsHash'is distinct from inventory_hash or assertion->>'transferRowsHash'is distinct from transfer_hash then raise exception 'TRADE_CURRENT_CORE_SQL_ROWS_MISMATCH'using errcode='23514';end if;
 coverage:=assertion->'coverage'||jsonb_build_object('schemaVersion','postwar-trade-current-page-chain-coverage-v1','reducerVersion','POSTWAR_COMPLETE_MIXED_PAGED_PREFIX_V1','countryId',p_country,'coverageRef','TRADE_CURRENT_'||upper(encode(sha256(convert_to(p_assertion,'UTF8')),'hex')),'globalWorldVersion',h.world_version,'globalEventSequence',h.event_sequence,'inventoryRowsHash',inventory_hash,'transferRowsHash',transfer_hash);
 pointer:=jsonb_build_object('schemaVersion','postwar-trade-current-source-pointer-v1','openingDocumentRef',b.document_ref,'openingDocumentSha256',b.document_sha256,'currentDerivation','ALL_ACTUAL_INVENTORY_POSTINGS_AND_COMMITTED_GOODS_COMPLETE_PREFIX');
 foreach dataset_name in array array['inventory-current','goods-transfers-current']loop
 items:=case dataset_name when'inventory-current'then inventory else transfers end;
 -- Origin denotes this whole-prefix derived snapshot. It is deliberately not
 -- labelled as the last Trade action (the last global event may be another office).
 return next world_v2.postwar_write_trade_current_document(p_world,p_country,'TRADE',dataset_name,b.document_ref,h.world_version::bigint,h.event_sequence::bigint,items,coverage,pointer);
 end loop;
end;$newbody$;
 execute replace(f.definition,f.prosrc,replacement);
 if(select encode(sha256(convert_to(prosrc,'UTF8')),'hex')from pg_proc where oid=f.oid)<>'67f1b079b5369596469991bc77f4991cfd83d00feb630e0ad98e11780a165b07'then raise exception 'COMPLETE_INVENTORY_EXACT_NEW_FUNCTION_REQUIRED'using errcode='55000';end if;
end;$adapt$;

-- Fixed adaptation: world_v2.read_postwar_trade_current_page(text,text,integer,integer,text)
do $adapt$declare f record;definition text;replacement text;begin
 select p.*,pg_get_functiondef(p.oid)as definition into f from pg_proc p where p.oid=to_regprocedure('world_v2.read_postwar_trade_current_page(text,text,integer,integer,text)');
 if not found or pg_get_userbyid(f.proowner)<>'world_v2_postwar_projection_owner'or not f.prosecdef or f.proconfig is distinct from array['search_path=pg_catalog']::text[]or encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>'3e45e6458435fc7c0826b47b1e135d5a9e451c9fada1e2278a4a1ff3a81f549d'then raise exception 'COMPLETE_INVENTORY_EXACT_INSTALLED_FUNCTION_REQUIRED:read_postwar_trade_current_page'using errcode='55000';end if;
 replacement:=$newbody$
declare p_office constant text:='TRADE';s record;d world_v2.postwar_paged_current_document%rowtype;b world_v2.postwar_office_projection_document%rowtype;p world_v2.postwar_paged_current_page%rowtype;selected jsonb;src jsonb;returned integer;original jsonb;coverage_key text;is_current boolean;begin
 if p_offset is null or p_limit is null or p_offset<0 or p_offset>100000 or p_limit<1 or p_limit>100 or(p_offset>0 and p_expected is null)or(p_expected is not null and p_expected!~'^sha256:[a-f0-9]{64}$')or p_dataset not in('inventory-current','goods-transfers-current')then raise exception 'PAGED_CURRENT_INVALID_PAGE'using errcode='22023';end if;
 select * into s from world_v2.read_postwar_office_projection_seats(p_world)x where x.office_id=p_office;
 if not found then return query select'DENIED',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into d from world_v2.postwar_paged_current_document x where x.world_id=p_world and x.country_id=s.country_id and x.office_id=p_office and x.dataset=p_dataset and x.world_version=s.world_version::bigint and x.event_sequence=s.event_sequence::bigint;
 if not found then
  if p_expected is not null and exists(select 1 from world_v2.postwar_paged_current_document x where x.world_id=p_world and x.country_id=s.country_id and x.office_id=p_office and x.dataset=p_dataset and x.source_version=p_expected)then return query select'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';else return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';end if;return;
 end if;
 if d.seed_id is distinct from s.seed_id or d.seed_fingerprint is distinct from s.seed_fingerprint or d.admission_ref is distinct from s.admission_ref or d.source_bundle_sha256 is distinct from s.source_bundle_sha256 or d.coverage->>'countryId'is distinct from s.country_id or d.coverage->>'globalWorldVersion'is distinct from s.world_version or d.coverage->>'globalEventSequence'is distinct from s.event_sequence or d.coverage->>'reducerVersion'is distinct from'POSTWAR_COMPLETE_MIXED_PAGED_PREFIX_V1'or d.coverage->'pageProof'->>'frameCount'is distinct from s.world_version or exists(select 1 from world_v2.postwar_paged_current_revocation rv where rv.world_id=p_world and rv.document_ref=d.document_ref)or not exists(select 1 from world_v2.authoritative_event e where e.world_id=p_world and e.event_id=d.coverage->>'coveredThroughEventId'and e.event_fingerprint=d.coverage->>'coveredThroughEventFingerprint'and e.world_version=d.world_version and e.event_sequence=d.event_sequence)then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 if p_expected is not null and p_expected<>d.source_version then return query select'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into b from world_v2.postwar_office_projection_document x where x.document_ref=d.base_document_ref and x.world_id=p_world and x.country_id=s.country_id and x.office_id='TRADE'and x.document_ref=world_v2.postwar_complete_opening_inventory_document(p_world,s.country_id,'TRADE')and x.world_version=0 and x.event_sequence=0 and x.seed_id=s.seed_id and x.seed_fingerprint=s.seed_fingerprint and x.admission_ref=s.admission_ref and x.source_bundle_sha256=s.source_bundle_sha256 and not exists(select 1 from world_v2.postwar_office_projection_revocation rv where rv.world_id=p_world and rv.document_ref=x.document_ref);
 if not found or d.canonical_seed_sha256 is distinct from b.canonical_seed_sha256 or d.coverage->>'schemaVersion'is distinct from'postwar-trade-current-page-chain-coverage-v1'then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into p from world_v2.postwar_paged_current_page x where x.document_ref=d.document_ref and x.world_id=p_world and x.row_offset<=p_offset and(p_offset<x.row_offset+x.row_count or d.total_rows=0)order by x.page_index desc limit 1;
 if p_offset>=d.total_rows then selected:='[]';else
  if p.document_ref is null or p.page_sha256<>encode(sha256(convert_to(p.rows_text,'UTF8')),'hex')or p.row_count<>jsonb_array_length(p.rows_text::jsonb)then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
  select coalesce(jsonb_agg(x order by n),'[]')into selected from jsonb_array_elements(p.rows_text::jsonb)with ordinality q(x,n)where n>p_offset-p.row_offset and n<=p_offset-p.row_offset+p_limit;
 end if;
 returned:=jsonb_array_length(selected);
 src:=jsonb_build_object('dataNature','ADMITTED_CURRENT_TRADE_COMPLETE_PREFIX','sourceVersion',d.source_version,'sourceRevision',d.source_revision,'seedId',d.seed_id,'seedFingerprint',d.seed_fingerprint,'admissionRef',d.admission_ref,'modelVersion',d.model_version,'replayBinding',d.replay_binding,'sourceBundleSha256',d.source_bundle_sha256,'canonicalSeedSha256',d.canonical_seed_sha256,'worldVersion',d.world_version::text,'eventSequence',d.event_sequence::text,'originWorldVersion',d.origin_world_version::text,'originEventSequence',d.origin_event_sequence::text,'observedHead',jsonb_build_object('worldVersion',d.world_version::text,'eventSequence',d.event_sequence::text),'currentTradeCoverage',d.coverage,'pageHash',coalesce(p.page_sha256,encode(sha256(convert_to('[]','UTF8')),'hex')),'returnedRowsHash',encode(sha256(convert_to(selected::text,'UTF8')),'hex'),'hashAlgorithm','POSTGRES_JSONB_TEXT_UTF8_SHA256','sourcePointer',d.source_pointer);
 return query select case when returned=0 then'EMPTY'else'PAGE'end,jsonb_build_object('worldId',s.world_id,'countryId',s.country_id,'officeId',s.office_id,'authSubject',s.auth_subject,'teamId',s.team_id,'authorizationVersion',s.authorization_revision,'scopeKey',s.scope_key,'seatRef',s.seat_ref),src,jsonb_build_object('offset',p_offset,'limit',p_limit,'returned',returned,'total',d.total_rows,'nextOffset',case when p_offset+returned<d.total_rows then p_offset+returned else null end),selected::text;
end;$newbody$;
 execute replace(f.definition,f.prosrc,replacement);
 if(select encode(sha256(convert_to(prosrc,'UTF8')),'hex')from pg_proc where oid=f.oid)<>'a0e4dfa8c02ddafe4a4a10ce945b3ba71b93f71af05f09beaea87865869d2d5b'then raise exception 'COMPLETE_INVENTORY_EXACT_NEW_FUNCTION_REQUIRED'using errcode='55000';end if;
end;$adapt$;

-- Fixed adaptation: world_v2.read_postwar_narrow_trade_current_source(text,text,text,text,uuid,text,text)
do $adapt$declare f record;definition text;replacement text;begin
 select p.*,pg_get_functiondef(p.oid)as definition into f from pg_proc p where p.oid=to_regprocedure('world_v2.read_postwar_narrow_trade_current_source(text,text,text,text,uuid,text,text)');
 if not found or pg_get_userbyid(f.proowner)<>'world_v2_postwar_narrow_trade_current_owner'or not f.prosecdef or f.proconfig is distinct from array['search_path=pg_catalog']::text[]or encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>'79c1e5bbb3be38532348104b6b0ac0238553aeda1c4fbb2acb356018ea27f480'then raise exception 'COMPLETE_INVENTORY_EXACT_INSTALLED_FUNCTION_REQUIRED:read_postwar_narrow_trade_current_source'using errcode='55000';end if;
 replacement:=$newbody$
declare effective name;h record;a world_v2.runtime_opening_admission%rowtype;permit world_v2.runtime_admission_publication_permit%rowtype;d world_v2.postwar_office_projection_document%rowtype;p record;items jsonb:='[]'::jsonb;idx integer:=0;n integer:=0;event_count bigint;command_count bigint;receipt_count bigint;batch_count bigint;inventory_count bigint;max_event bigint;max_version bigint;bytes bigint;event_bytes bigint;command_bytes bigint;receipt_bytes bigint;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_narrow_trade_source','MEMBER')or pg_has_role(effective,'world_v2_postwar_narrow_trade_current_owner','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')or exists(select 1 from pg_roles r where r.rolname=effective and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))then raise exception 'NARROW_CURRENT_FIXED_TRADE_ROLE_REQUIRED'using errcode='42501';end if;
 if current_setting('transaction_read_only')<>'off'or p_subject::text is distinct from current_setting('request.jwt.claim.sub',true)or p_seller=p_buyer or p_seller!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or p_buyer!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'then raise exception 'NARROW_CURRENT_EXACT_SCOPE_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.narrow_current_world',p_world,true);
 -- Global H first. Atomic takes its authoritative CAS lock on this SAME tx.
 select x.world_version,x.event_sequence into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found then raise exception 'NARROW_CURRENT_ACTUAL_HEAD_REQUIRED'using errcode='55000';end if;
 if h.world_version>256 or h.event_sequence>256 then raise exception 'NARROW_CURRENT_PREFIX_CAPACITY'using errcode='54000';end if;
 perform 1 from world_v2.current_commit_authorization x where x.world_id=p_world and x.country_id=p_seller and x.auth_subject=p_subject and x.office_id='TRADE'and x.capability='TRADE_CONTRACTS'and x.team_id=p_team and x.authorization_version=p_revision and x.active for share;
 if not found or exists(select 1 from world_v2.current_commit_authorization x where x.world_id=p_world and x.auth_subject=p_subject and x.active and(x.country_id<>p_seller or x.team_id<>p_team or x.authorization_version<>p_revision))then raise exception 'NARROW_CURRENT_SELLER_AUTHORIZATION_REQUIRED'using errcode='42501';end if;
 perform 1 from world_v2.runtime_read_seat s where s.world_id=p_world and s.auth_subject=p_subject and s.country_id=p_seller and s.office_id='TRADE'and s.team_id=p_team and s.authorization_revision=p_revision for share;
 if not found then raise exception 'NARROW_CURRENT_EXACT_SEAT_REQUIRED'using errcode='42501';end if;
 perform 1 from world_v2.projection_entitlement e where e.world_id=p_world and e.auth_subject=p_subject and e.authorization_version=p_revision and e.classification='OFFICE_PRIVATE'and e.scope_key='OFFICE_'||upper(encode(convert_to(p_seller,'UTF8'),'hex'))||'_'||upper(encode(convert_to('TRADE','UTF8'),'hex'))and e.active and e.revoked_at is null for share;
 if not found then raise exception 'NARROW_CURRENT_ENTITLEMENT_REQUIRED'using errcode='42501';end if;
 select * into a from world_v2.runtime_opening_admission x where x.world_id=p_world for share;
 if not found or not exists(select 1 from world_v2.opening_seed x where x.world_id=p_world and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.replay_binding=a.replay_binding and x.replay_binding::jsonb->>'modelVersion'=a.model_version)then raise exception 'NARROW_CURRENT_IMMUTABLE_ADMISSION_REQUIRED'using errcode='55000';end if;
 select * into permit from world_v2.runtime_admission_publication_permit x where 'ADMISSION_'||upper(x.authorization_sha256)=a.admission_ref and x.world_id=p_world and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.model_version=a.model_version and x.replay_binding=a.replay_binding and a.admitted_at_real>=x.valid_from and a.admitted_at_real<x.valid_until for share;
 if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=permit.authorization_id)then raise exception 'NARROW_CURRENT_ADMISSION_REVOKED'using errcode='55000';end if;
 seed_id:=a.seed_id;seed_fingerprint:=a.seed_fingerprint;admission_ref:=a.admission_ref;world_version:=h.world_version::text;event_sequence:=h.event_sequence::text;
 select count(*),coalesce(sum(octet_length(x.canonical_payload)),0)into inventory_count,bytes from world_v2.inventory_posting x where x.world_id=p_world;
 if inventory_count>256 or bytes>1048576 or exists(select 1 from world_v2.inventory_posting x where x.world_id=p_world and octet_length(x.canonical_payload)>65536)then raise exception 'NARROW_CURRENT_INVENTORY_CAPACITY'using errcode='54000';end if;
 select coalesce(jsonb_agg(jsonb_build_object('causation_command_id',x.causation_command_id,'canonical_payload',x.canonical_payload,'fingerprint',x.posting_fingerprint)order by x.posting_id),'[]'::jsonb)into inventory_postings from world_v2.inventory_posting x where x.world_id=p_world;
 inventory_posting_count:=inventory_count::text;
 -- Sealed H0 stock is provenance only. Actual stock is independently fully
 -- replayed by Core with ALL actual inventory rows at this held World head.
 stock_status:='MISSING';stock:='[]'::jsonb;
 select * into d from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_seller and x.office_id='TRADE'and x.document_ref=world_v2.postwar_complete_opening_inventory_document(p_world,p_seller,'TRADE')and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref and x.source_bundle_sha256=permit.source_bundle_sha256 and x.replay_binding=a.replay_binding and x.model_version=a.model_version and x.world_version=0 and x.event_sequence=0 for share;
 if found and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.document_ref=d.document_ref)then
  if d.page_count>16 or d.total_rows>1600 then raise exception 'NARROW_CURRENT_STOCK_CAPACITY'using errcode='54000';end if;
  for p in select * from world_v2.postwar_office_projection_page x where x.document_ref=d.document_ref order by x.page_index loop
   if p.page_index<>idx or p.row_offset<>n or p.row_count<>jsonb_array_length(p.rows_text::jsonb)or p.page_sha256<>encode(sha256(convert_to(p.rows_text,'UTF8')),'hex')then raise exception 'NARROW_CURRENT_STOCK_PAGE_HASH'using errcode='55000';end if;
   items:=items||p.rows_text::jsonb;idx:=idx+1;n:=n+p.row_count;
   if octet_length(items::text)>65536 then raise exception 'NARROW_CURRENT_STOCK_CAPACITY'using errcode='54000';end if;
  end loop;
  if idx<>d.page_count or n<>d.total_rows or d.document_sha256<>encode(sha256(convert_to(items::text,'UTF8')),'hex')then raise exception 'NARROW_CURRENT_STOCK_DOCUMENT_HASH'using errcode='55000';end if;
  select coalesce(jsonb_agg(x),'[]'::jsonb)into stock from jsonb_array_elements(items)x where x->'account'->>'batchId'=p_batch and x->'account'->>'countryId'=p_seller and x->'account'->>'commodityId'='GRAIN';
  stock_status:='SEALED_ADMITTED_OPENING';canonical_seed_sha256:=d.canonical_seed_sha256;
 end if;
 perform 1 from world_v2.postwar_narrow_trade_rights_admission x where x.world_id=p_world and x.seed_fingerprint=a.seed_fingerprint for share;
 select coalesce(jsonb_agg(jsonb_build_object('source_id',o.source_id,'source_payload_hash',o.source_payload_hash,'canonical_payload',o.canonical_payload,'domain_admission_ref',r.admission_ref,'domain_admission_revision',r.admission_revision,'issuer_ref',r.issuer_ref,'custodian_ref',r.custodian_ref,'admission_evidence_sha256',r.admission_evidence_sha256)order by o.source_id),'[]'::jsonb)into rights from world_v2.postwar_narrow_trade_current_original o join world_v2.postwar_narrow_trade_rights_admission r on r.world_id=o.world_id and r.source_id=o.source_id and r.seed_fingerprint=o.seed_fingerprint and r.source_payload_hash=o.source_payload_hash where o.world_id=p_world and o.seed_fingerprint=a.seed_fingerprint and exists(select 1 from jsonb_array_elements(o.canonical_payload::jsonb->'records')record where (record->>'kind'='OWNER_TRANSFER_MANDATE'and record->>'countryId'=p_seller)or(record->>'kind'='CROSS_BORDER_ROUTE'and record->>'fromCountryId'=p_seller))and not exists(select 1 from world_v2.postwar_narrow_trade_rights_revocation v where v.admission_ref=r.admission_ref);
 if octet_length(rights::text)>65536 then raise exception 'NARROW_CURRENT_RIGHTS_CAPACITY'using errcode='54000';end if;
 select count(*),coalesce(sum(octet_length(x.canonical_payload)),0)into batch_count,bytes from world_v2.financial_posting_batch x where x.world_id=p_world;
 if batch_count>512 or bytes>1048576 or exists(select 1 from world_v2.financial_posting_batch x where x.world_id=p_world and octet_length(x.canonical_payload)>65536)then raise exception 'NARROW_CURRENT_JOURNAL_CAPACITY'using errcode='54000';end if;
 select coalesce(jsonb_agg(jsonb_build_object('causation_command_id',x.causation_command_id,'canonical_payload',x.canonical_payload,'fingerprint',x.batch_fingerprint)order by x.batch_id),'[]'::jsonb)into financial_batches from world_v2.financial_posting_batch x where x.world_id=p_world;
 financial_batch_count:=batch_count::text;
 select count(*),coalesce(max(x.event_sequence),0),coalesce(max(x.world_version),0)into event_count,max_event,max_version from world_v2.authoritative_event x where x.world_id=p_world;
 select count(*)into receipt_count from world_v2.command_receipt x where x.world_id=p_world and x.outcome='COMMITTED';
 if event_count>256 or receipt_count>256 then raise exception 'PREFIX_BOUNDED_CAPACITY_EXCEEDED'using errcode='54000';end if;
 if event_count<>h.event_sequence::bigint or max_event<>h.event_sequence::bigint or max_version>h.world_version::bigint or receipt_count<>h.world_version::bigint then raise exception 'PREFIX_COMPLETE_EVENT_AND_RECEIPT_SET_REQUIRED'using errcode='55000';end if;
 -- No family predicate: unknown/correction/wrong-effect frames are returned
 -- intact and must be rejected by the same complete Core replay as all others.
 if exists(select 1 from world_v2.authoritative_event x where x.world_id=p_world and octet_length(x.canonical_payload)>65536)then raise exception 'PREFIX_BOUNDED_EVENT_BYTES_EXCEEDED'using errcode='54000';end if;
 select coalesce(jsonb_agg(to_jsonb(r)order by r.sequence::bigint),'[]'::jsonb),coalesce(sum(octet_length(to_jsonb(r)::text)),0)into events,event_bytes from(select event_id as event_id,event_type as event_type,schema_version as schema_version,world_id as world_id,causation_command_id as causation_command_id,correlation_id as correlation_id,world_v2.authoritative_event.world_version::text as world_version,world_v2.authoritative_event.event_sequence::text as sequence,sim_time::text as sim_time,to_char(recorded_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as recorded_at_real,corrects_event_id as corrects_event_id,canonical_payload as canonical_payload,payload_sha256 as payload_sha256,event_fingerprint as event_fingerprint from world_v2.authoritative_event where world_id=p_world)r;
 select count(*)into command_count from world_v2.command_submission where world_id=p_world and command_id in(select e.causation_command_id from world_v2.authoritative_event e where e.world_id=p_world union select c.command_id from world_v2.command_receipt c where c.world_id=p_world and c.outcome='COMMITTED');
 if command_count>256 then raise exception 'PREFIX_BOUNDED_CAPACITY_EXCEEDED'using errcode='54000';end if;
 if exists(select 1 from world_v2.command_submission where world_id=p_world and command_id in(select e.causation_command_id from world_v2.authoritative_event e where e.world_id=p_world union select c.command_id from world_v2.command_receipt c where c.world_id=p_world and c.outcome='COMMITTED') and octet_length(canonical_payload)>16384)then raise exception 'PREFIX_BOUNDED_COMMAND_BYTES_EXCEEDED'using errcode='54000';end if;
 select coalesce(jsonb_agg(to_jsonb(r)order by r.command_id),'[]'::jsonb),coalesce(sum(octet_length(to_jsonb(r)::text)),0)into commands,command_bytes from(select actor_id as actor_id,auth_subject::text as auth_subject,canonical_payload as canonical_payload,country_id as country_id,expected_world_version::text as expected_world_version,command_fingerprint as command_fingerprint,command_id as command_id,idempotency_key as idempotency_key,office_id as office_id,payload_sha256 as payload_sha256,schema_version as schema_version,sim_time::text as sim_time,to_char(submitted_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as submitted_at_real,command_type as command_type,world_id as world_id,correlation_id as correlation_id from world_v2.command_submission where world_id=p_world and command_id in(select e.causation_command_id from world_v2.authoritative_event e where e.world_id=p_world union select c.command_id from world_v2.command_receipt c where c.world_id=p_world and c.outcome='COMMITTED'))r;
 select coalesce(jsonb_agg(to_jsonb(r)order by r.world_version_after::bigint,r.command_id),'[]'::jsonb),coalesce(sum(octet_length(to_jsonb(r)::text)),0)into receipts,receipt_bytes from(select world_id as world_id,command_id as command_id,idempotency_key as idempotency_key,schema_version as schema_version,command_fingerprint as command_fingerprint,outcome as outcome,reason_code as reason_code,transition_id as transition_id,world_version_before::text as world_version_before,world_version_after::text as world_version_after,sim_time::text as sim_time,event_ids as event_ids,to_char(recorded_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as recorded_at_real from world_v2.command_receipt where world_id=p_world and outcome='COMMITTED')r;
 if event_bytes+command_bytes+receipt_bytes+(select coalesce(sum(octet_length(b->>'canonical_payload')),0)from jsonb_array_elements(financial_batches)b)+(select coalesce(sum(octet_length(b->>'canonical_payload')),0)from jsonb_array_elements(inventory_postings)b)>1048576 then raise exception 'PREFIX_BOUNDED_TOTAL_BYTES_EXCEEDED'using errcode='54000';end if;
 if jsonb_array_length(events)<>event_count or jsonb_array_length(commands)<>command_count or jsonb_array_length(receipts)<>receipt_count then raise exception 'PREFIX_COMPLETE_SETS_REQUIRED'using errcode='55000';end if;
 -- Only immutable quotes actually named by committed FX commands are returned.
 select coalesce(jsonb_agg(jsonb_build_object('country_id',q.country_id,'quote_ref',q.quote_ref,'quote_text',q.quote_text,'quote_text_sha256',q.quote_text_sha256)order by q.country_id),'[]'::jsonb)into quotes from world_v2.postwar_day_one_fx_quote_original q join world_v2.postwar_day_one_fx_source_original s on s.world_id=q.world_id where q.world_id=p_world and s.seed_id=a.seed_id and s.seed_fingerprint=a.seed_fingerprint and s.admission_ref=a.admission_ref and exists(select 1 from world_v2.command_submission c join world_v2.command_receipt r on r.world_id=c.world_id and r.command_id=c.command_id and r.command_fingerprint=c.command_fingerprint and r.outcome='COMMITTED'where c.world_id=p_world and c.country_id=q.country_id and c.command_type='POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'and c.canonical_payload::jsonb->>'quoteRef'=q.quote_ref);
 if octet_length(quotes::text)>262144 then raise exception 'NARROW_CURRENT_QUOTE_CAPACITY'using errcode='54000';end if;
 return next;
end;$newbody$;
 execute replace(f.definition,f.prosrc,replacement);
 if(select encode(sha256(convert_to(prosrc,'UTF8')),'hex')from pg_proc where oid=f.oid)<>'fc24a1d24263f21ca1dddb203f814d2330b488ecc64622d87f6c52b3a7a71dc3'then raise exception 'COMPLETE_INVENTORY_EXACT_NEW_FUNCTION_REQUIRED'using errcode='55000';end if;
end;$adapt$;

-- Fixed adaptation: world_v2.read_postwar_narrow_trade_automatic_source(text,text,text,timestamptz,text)
do $adapt$declare f record;definition text;replacement text;begin
 select p.*,pg_get_functiondef(p.oid)as definition into f from pg_proc p where p.oid=to_regprocedure('world_v2.read_postwar_narrow_trade_automatic_source(text,text,text,timestamptz,text)');
 if not found or pg_get_userbyid(f.proowner)<>'world_v2_postwar_narrow_trade_current_owner'or not f.prosecdef or f.proconfig is distinct from array['search_path=pg_catalog']::text[]or encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>'1fb35345a77572946bfb27b6f8781d4a925c82c31686b558dc03de0f7b5d5a36'then raise exception 'COMPLETE_INVENTORY_EXACT_INSTALLED_FUNCTION_REQUIRED:read_postwar_narrow_trade_automatic_source'using errcode='55000';end if;
 replacement:=$newbody$
declare effective name;h record;a world_v2.runtime_opening_admission%rowtype;permit world_v2.runtime_admission_publication_permit%rowtype;d world_v2.postwar_office_projection_document%rowtype;p record;items jsonb:='[]'::jsonb;idx integer:=0;n integer:=0;event_count bigint;command_count bigint;receipt_count bigint;batch_count bigint;inventory_count bigint;max_event bigint;max_version bigint;bytes bigint;event_bytes bigint;command_bytes bigint;receipt_bytes bigint;v_auto world_v2.command_submission%rowtype;original world_v2.command_submission%rowtype;p_seller text;p_buyer text;p_batch text;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_narrow_trade_source','MEMBER')or pg_has_role(effective,'world_v2_postwar_narrow_trade_current_owner','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')or exists(select 1 from pg_roles r where r.rolname=effective and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))then raise exception 'NARROW_AUTOMATIC_FIXED_ROLE_REQUIRED'using errcode='42501';end if;
 if current_setting('transaction_read_only')<>'off'or p_sim!~'^(0|[1-9][0-9]*)$'then raise exception 'NARROW_AUTOMATIC_TRANSACTION_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.narrow_current_world',p_world,true);
 -- The same active worker lease precedes the authoritative head/source locks.
 perform 1 from world_v2.world_writer_lease l where l.world_id=p_world and l.holder_id=p_worker and l.renewed_at_real<=p_observed and l.lease_expires_at_real>p_observed for share;
 if not found then raise exception 'NARROW_AUTOMATIC_ACTUAL_LEASE_REQUIRED'using errcode='55000';end if;
 select x.world_version,x.event_sequence into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found then raise exception 'NARROW_AUTOMATIC_ACTUAL_HEAD_REQUIRED'using errcode='55000';end if;
 if h.world_version>256 or h.event_sequence>256 then raise exception 'NARROW_AUTOMATIC_PREFIX_CAPACITY'using errcode='54000';end if;
 select * into v_auto from world_v2.command_submission x where x.world_id=p_world and x.command_id=p_command;
 if not found or v_auto.command_type not in('CORE_GOODS_SHIPMENT_V1','CORE_GOODS_DELIVERY_V1')or v_auto.office_id is not null or v_auto.expected_world_version<>h.world_version or v_auto.sim_time>p_sim::numeric then raise exception 'NARROW_AUTOMATIC_EXACT_DUE_COMMAND_REQUIRED'using errcode='55000';end if;
 perform 1 from world_v2.command_queue q where q.world_id=p_world and q.command_id=p_command and q.authority_kind='VERSIONED_AUTOMATIC'and q.queue_state='CLAIMED'and q.claimed_by=p_worker and q.available_at_sim_time<=p_sim::numeric and q.claim_fencing_token=(select l.fencing_token from world_v2.world_writer_lease l where l.world_id=p_world) for share;
 if not found or exists(select 1 from world_v2.command_receipt r where r.world_id=p_world and r.command_id=p_command)then raise exception 'NARROW_AUTOMATIC_ACTIVE_UNFINISHED_CLAIM_REQUIRED'using errcode='55000';end if;
 select * into original from world_v2.command_submission x where x.world_id=p_world and x.command_id=v_auto.canonical_payload::jsonb->>'transferCommandId';
 if not found or original.command_type<>'CORE_GOODS_TRANSFER_V1'or original.command_fingerprint is distinct from v_auto.canonical_payload::jsonb->>'transferFingerprint'or original.country_id<>v_auto.country_id or not exists(select 1 from world_v2.command_receipt r where r.world_id=p_world and r.command_id=original.command_id and r.command_fingerprint=original.command_fingerprint and r.outcome='COMMITTED')then raise exception 'NARROW_AUTOMATIC_COMMITTED_TRANSFER_REQUIRED'using errcode='55000';end if;
 p_seller:=original.canonical_payload::jsonb->>'sellerCountryId';p_buyer:=original.canonical_payload::jsonb->>'buyerCountryId';p_batch:=original.canonical_payload::jsonb->'assetSource'->>'batchId';
 select * into a from world_v2.runtime_opening_admission x where x.world_id=p_world for share;
 if not found or not exists(select 1 from world_v2.opening_seed x where x.world_id=p_world and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.replay_binding=a.replay_binding and x.replay_binding::jsonb->>'modelVersion'=a.model_version)then raise exception 'NARROW_CURRENT_IMMUTABLE_ADMISSION_REQUIRED'using errcode='55000';end if;
 select * into permit from world_v2.runtime_admission_publication_permit x where 'ADMISSION_'||upper(x.authorization_sha256)=a.admission_ref and x.world_id=p_world and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.model_version=a.model_version and x.replay_binding=a.replay_binding and a.admitted_at_real>=x.valid_from and a.admitted_at_real<x.valid_until for share;
 if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=permit.authorization_id)then raise exception 'NARROW_CURRENT_ADMISSION_REVOKED'using errcode='55000';end if;
 seed_id:=a.seed_id;seed_fingerprint:=a.seed_fingerprint;admission_ref:=a.admission_ref;world_version:=h.world_version::text;event_sequence:=h.event_sequence::text;
 select count(*),coalesce(sum(octet_length(x.canonical_payload)),0)into inventory_count,bytes from world_v2.inventory_posting x where x.world_id=p_world;
 if inventory_count>256 or bytes>1048576 or exists(select 1 from world_v2.inventory_posting x where x.world_id=p_world and octet_length(x.canonical_payload)>65536)then raise exception 'NARROW_CURRENT_INVENTORY_CAPACITY'using errcode='54000';end if;
 select coalesce(jsonb_agg(jsonb_build_object('causation_command_id',x.causation_command_id,'canonical_payload',x.canonical_payload,'fingerprint',x.posting_fingerprint)order by x.posting_id),'[]'::jsonb)into inventory_postings from world_v2.inventory_posting x where x.world_id=p_world;
 inventory_posting_count:=inventory_count::text;
 -- Sealed H0 stock is provenance only. Actual stock is independently fully
 -- replayed by Core with ALL actual inventory rows at this held World head.
 stock_status:='MISSING';stock:='[]'::jsonb;
 select * into d from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_seller and x.office_id='TRADE'and x.document_ref=world_v2.postwar_complete_opening_inventory_document(p_world,p_seller,'TRADE')and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref and x.source_bundle_sha256=permit.source_bundle_sha256 and x.replay_binding=a.replay_binding and x.model_version=a.model_version and x.world_version=0 and x.event_sequence=0 for share;
 if found and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.document_ref=d.document_ref)then
  if d.page_count>16 or d.total_rows>1600 then raise exception 'NARROW_CURRENT_STOCK_CAPACITY'using errcode='54000';end if;
  for p in select * from world_v2.postwar_office_projection_page x where x.document_ref=d.document_ref order by x.page_index loop
   if p.page_index<>idx or p.row_offset<>n or p.row_count<>jsonb_array_length(p.rows_text::jsonb)or p.page_sha256<>encode(sha256(convert_to(p.rows_text,'UTF8')),'hex')then raise exception 'NARROW_CURRENT_STOCK_PAGE_HASH'using errcode='55000';end if;
   items:=items||p.rows_text::jsonb;idx:=idx+1;n:=n+p.row_count;
   if octet_length(items::text)>65536 then raise exception 'NARROW_CURRENT_STOCK_CAPACITY'using errcode='54000';end if;
  end loop;
  if idx<>d.page_count or n<>d.total_rows or d.document_sha256<>encode(sha256(convert_to(items::text,'UTF8')),'hex')then raise exception 'NARROW_CURRENT_STOCK_DOCUMENT_HASH'using errcode='55000';end if;
  select coalesce(jsonb_agg(x),'[]'::jsonb)into stock from jsonb_array_elements(items)x where x->'account'->>'batchId'=p_batch and x->'account'->>'countryId'=p_seller and x->'account'->>'commodityId'='GRAIN';
  stock_status:='SEALED_ADMITTED_OPENING';canonical_seed_sha256:=d.canonical_seed_sha256;
 end if;
 perform 1 from world_v2.postwar_narrow_trade_rights_admission x where x.world_id=p_world and x.seed_fingerprint=a.seed_fingerprint for share;
 select coalesce(jsonb_agg(jsonb_build_object('source_id',o.source_id,'source_payload_hash',o.source_payload_hash,'canonical_payload',o.canonical_payload,'domain_admission_ref',r.admission_ref,'domain_admission_revision',r.admission_revision,'issuer_ref',r.issuer_ref,'custodian_ref',r.custodian_ref,'admission_evidence_sha256',r.admission_evidence_sha256)order by o.source_id),'[]'::jsonb)into rights from world_v2.postwar_narrow_trade_current_original o join world_v2.postwar_narrow_trade_rights_admission r on r.world_id=o.world_id and r.source_id=o.source_id and r.seed_fingerprint=o.seed_fingerprint and r.source_payload_hash=o.source_payload_hash where o.world_id=p_world and o.seed_fingerprint=a.seed_fingerprint and exists(select 1 from jsonb_array_elements(o.canonical_payload::jsonb->'records')record where (record->>'kind'='OWNER_TRANSFER_MANDATE'and record->>'countryId'=p_seller)or(record->>'kind'='CROSS_BORDER_ROUTE'and record->>'fromCountryId'=p_seller))and not exists(select 1 from world_v2.postwar_narrow_trade_rights_revocation v where v.admission_ref=r.admission_ref);
 if octet_length(rights::text)>65536 then raise exception 'NARROW_CURRENT_RIGHTS_CAPACITY'using errcode='54000';end if;
 select count(*),coalesce(sum(octet_length(x.canonical_payload)),0)into batch_count,bytes from world_v2.financial_posting_batch x where x.world_id=p_world;
 if batch_count>512 or bytes>1048576 or exists(select 1 from world_v2.financial_posting_batch x where x.world_id=p_world and octet_length(x.canonical_payload)>65536)then raise exception 'NARROW_CURRENT_JOURNAL_CAPACITY'using errcode='54000';end if;
 select coalesce(jsonb_agg(jsonb_build_object('causation_command_id',x.causation_command_id,'canonical_payload',x.canonical_payload,'fingerprint',x.batch_fingerprint)order by x.batch_id),'[]'::jsonb)into financial_batches from world_v2.financial_posting_batch x where x.world_id=p_world;
 financial_batch_count:=batch_count::text;
 select count(*),coalesce(max(x.event_sequence),0),coalesce(max(x.world_version),0)into event_count,max_event,max_version from world_v2.authoritative_event x where x.world_id=p_world;
 select count(*)into receipt_count from world_v2.command_receipt x where x.world_id=p_world and x.outcome='COMMITTED';
 if event_count>256 or receipt_count>256 then raise exception 'PREFIX_BOUNDED_CAPACITY_EXCEEDED'using errcode='54000';end if;
 if event_count<>h.event_sequence::bigint or max_event<>h.event_sequence::bigint or max_version>h.world_version::bigint or receipt_count<>h.world_version::bigint then raise exception 'PREFIX_COMPLETE_EVENT_AND_RECEIPT_SET_REQUIRED'using errcode='55000';end if;
 -- No family predicate: unknown/correction/wrong-effect frames are returned
 -- intact and must be rejected by the same complete Core replay as all others.
 if exists(select 1 from world_v2.authoritative_event x where x.world_id=p_world and octet_length(x.canonical_payload)>65536)then raise exception 'PREFIX_BOUNDED_EVENT_BYTES_EXCEEDED'using errcode='54000';end if;
 select coalesce(jsonb_agg(to_jsonb(r)order by r.sequence::bigint),'[]'::jsonb),coalesce(sum(octet_length(to_jsonb(r)::text)),0)into events,event_bytes from(select event_id as event_id,event_type as event_type,schema_version as schema_version,world_id as world_id,causation_command_id as causation_command_id,correlation_id as correlation_id,world_v2.authoritative_event.world_version::text as world_version,world_v2.authoritative_event.event_sequence::text as sequence,sim_time::text as sim_time,to_char(recorded_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as recorded_at_real,corrects_event_id as corrects_event_id,canonical_payload as canonical_payload,payload_sha256 as payload_sha256,event_fingerprint as event_fingerprint from world_v2.authoritative_event where world_id=p_world)r;
 select count(*)into command_count from world_v2.command_submission where world_id=p_world and command_id in(select e.causation_command_id from world_v2.authoritative_event e where e.world_id=p_world union select c.command_id from world_v2.command_receipt c where c.world_id=p_world and c.outcome='COMMITTED');
 if command_count>256 then raise exception 'PREFIX_BOUNDED_CAPACITY_EXCEEDED'using errcode='54000';end if;
 if exists(select 1 from world_v2.command_submission where world_id=p_world and command_id in(select e.causation_command_id from world_v2.authoritative_event e where e.world_id=p_world union select c.command_id from world_v2.command_receipt c where c.world_id=p_world and c.outcome='COMMITTED') and octet_length(canonical_payload)>16384)then raise exception 'PREFIX_BOUNDED_COMMAND_BYTES_EXCEEDED'using errcode='54000';end if;
 select coalesce(jsonb_agg(to_jsonb(r)order by r.command_id),'[]'::jsonb),coalesce(sum(octet_length(to_jsonb(r)::text)),0)into commands,command_bytes from(select actor_id as actor_id,auth_subject::text as auth_subject,canonical_payload as canonical_payload,country_id as country_id,expected_world_version::text as expected_world_version,command_fingerprint as command_fingerprint,command_id as command_id,idempotency_key as idempotency_key,office_id as office_id,payload_sha256 as payload_sha256,schema_version as schema_version,sim_time::text as sim_time,to_char(submitted_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as submitted_at_real,command_type as command_type,world_id as world_id,correlation_id as correlation_id from world_v2.command_submission where world_id=p_world and command_id in(select e.causation_command_id from world_v2.authoritative_event e where e.world_id=p_world union select c.command_id from world_v2.command_receipt c where c.world_id=p_world and c.outcome='COMMITTED'))r;
 select coalesce(jsonb_agg(to_jsonb(r)order by r.world_version_after::bigint,r.command_id),'[]'::jsonb),coalesce(sum(octet_length(to_jsonb(r)::text)),0)into receipts,receipt_bytes from(select world_id as world_id,command_id as command_id,idempotency_key as idempotency_key,schema_version as schema_version,command_fingerprint as command_fingerprint,outcome as outcome,reason_code as reason_code,transition_id as transition_id,world_version_before::text as world_version_before,world_version_after::text as world_version_after,sim_time::text as sim_time,event_ids as event_ids,to_char(recorded_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as recorded_at_real from world_v2.command_receipt where world_id=p_world and outcome='COMMITTED')r;
 if event_bytes+command_bytes+receipt_bytes+(select coalesce(sum(octet_length(b->>'canonical_payload')),0)from jsonb_array_elements(financial_batches)b)+(select coalesce(sum(octet_length(b->>'canonical_payload')),0)from jsonb_array_elements(inventory_postings)b)>1048576 then raise exception 'PREFIX_BOUNDED_TOTAL_BYTES_EXCEEDED'using errcode='54000';end if;
 if jsonb_array_length(events)<>event_count or jsonb_array_length(commands)<>command_count or jsonb_array_length(receipts)<>receipt_count then raise exception 'PREFIX_COMPLETE_SETS_REQUIRED'using errcode='55000';end if;
 -- Only immutable quotes actually named by committed FX commands are returned.
 select coalesce(jsonb_agg(jsonb_build_object('country_id',q.country_id,'quote_ref',q.quote_ref,'quote_text',q.quote_text,'quote_text_sha256',q.quote_text_sha256)order by q.country_id),'[]'::jsonb)into quotes from world_v2.postwar_day_one_fx_quote_original q join world_v2.postwar_day_one_fx_source_original s on s.world_id=q.world_id where q.world_id=p_world and s.seed_id=a.seed_id and s.seed_fingerprint=a.seed_fingerprint and s.admission_ref=a.admission_ref and exists(select 1 from world_v2.command_submission c join world_v2.command_receipt r on r.world_id=c.world_id and r.command_id=c.command_id and r.command_fingerprint=c.command_fingerprint and r.outcome='COMMITTED'where c.world_id=p_world and c.country_id=q.country_id and c.command_type='POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'and c.canonical_payload::jsonb->>'quoteRef'=q.quote_ref);
 if octet_length(quotes::text)>262144 then raise exception 'NARROW_CURRENT_QUOTE_CAPACITY'using errcode='54000';end if;
 return next;
end;$newbody$;
 execute replace(f.definition,f.prosrc,replacement);
 if(select encode(sha256(convert_to(prosrc,'UTF8')),'hex')from pg_proc where oid=f.oid)<>'dda90c55fb02af9ef1fb9dfb3c5558714689c063811040ab89ac600260d4729c'then raise exception 'COMPLETE_INVENTORY_EXACT_NEW_FUNCTION_REQUIRED'using errcode='55000';end if;
end;$adapt$;

-- Fixed adaptation: world_v2.read_postwar_narrow_trade_current_paged_scope(text,text,text,text,uuid,text,text)
do $adapt$declare f record;definition text;replacement text;begin
 select p.*,pg_get_functiondef(p.oid)as definition into f from pg_proc p where p.oid=to_regprocedure('world_v2.read_postwar_narrow_trade_current_paged_scope(text,text,text,text,uuid,text,text)');
 if not found or pg_get_userbyid(f.proowner)<>'world_v2_postwar_narrow_trade_current_owner'or not f.prosecdef or f.proconfig is distinct from array['search_path=pg_catalog']::text[]or encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>'f2b51e8ab7f6e0c5a767830ddf3d86cc4f6ac1e129b5c0f285502bc92646440a'then raise exception 'COMPLETE_INVENTORY_EXACT_INSTALLED_FUNCTION_REQUIRED:read_postwar_narrow_trade_current_paged_scope'using errcode='55000';end if;
 replacement:=$newbody$
declare effective name;h record;a world_v2.runtime_opening_admission%rowtype;permit world_v2.runtime_admission_publication_permit%rowtype;d world_v2.postwar_office_projection_document%rowtype;p record;items jsonb:='[]'::jsonb;idx integer:=0;n integer:=0;event_count bigint;command_count bigint;receipt_count bigint;batch_count bigint;inventory_count bigint;max_event bigint;max_version bigint;bytes bigint;event_bytes bigint;command_bytes bigint;receipt_bytes bigint;
begin
 if current_setting('transaction_isolation')not in('repeatable read','serializable')then raise exception 'NARROW_PAGED_HELD_TRANSACTION_REQUIRED'using errcode='25001';end if;
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_narrow_trade_source','MEMBER')or pg_has_role(effective,'world_v2_postwar_narrow_trade_current_owner','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')or exists(select 1 from pg_roles r where r.rolname=effective and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))then raise exception 'NARROW_CURRENT_FIXED_TRADE_ROLE_REQUIRED'using errcode='42501';end if;
 if current_setting('transaction_read_only')<>'off'or p_subject::text is distinct from current_setting('request.jwt.claim.sub',true)or p_seller=p_buyer or p_seller!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or p_buyer!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'then raise exception 'NARROW_CURRENT_EXACT_SCOPE_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.narrow_current_world',p_world,true);
 -- Global H first. Atomic takes its authoritative CAS lock on this SAME tx.
 select x.world_version,x.event_sequence into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found then raise exception 'NARROW_CURRENT_ACTUAL_HEAD_REQUIRED'using errcode='55000';end if;
 perform 1 from world_v2.current_commit_authorization x where x.world_id=p_world and x.country_id=p_seller and x.auth_subject=p_subject and x.office_id='TRADE'and x.capability='TRADE_CONTRACTS'and x.team_id=p_team and x.authorization_version=p_revision and x.active for share;
 if not found or exists(select 1 from world_v2.current_commit_authorization x where x.world_id=p_world and x.auth_subject=p_subject and x.active and(x.country_id<>p_seller or x.team_id<>p_team or x.authorization_version<>p_revision))then raise exception 'NARROW_CURRENT_SELLER_AUTHORIZATION_REQUIRED'using errcode='42501';end if;
 perform 1 from world_v2.runtime_read_seat s where s.world_id=p_world and s.auth_subject=p_subject and s.country_id=p_seller and s.office_id='TRADE'and s.team_id=p_team and s.authorization_revision=p_revision for share;
 if not found then raise exception 'NARROW_CURRENT_EXACT_SEAT_REQUIRED'using errcode='42501';end if;
 perform 1 from world_v2.projection_entitlement e where e.world_id=p_world and e.auth_subject=p_subject and e.authorization_version=p_revision and e.classification='OFFICE_PRIVATE'and e.scope_key='OFFICE_'||upper(encode(convert_to(p_seller,'UTF8'),'hex'))||'_'||upper(encode(convert_to('TRADE','UTF8'),'hex'))and e.active and e.revoked_at is null for share;
 if not found then raise exception 'NARROW_CURRENT_ENTITLEMENT_REQUIRED'using errcode='42501';end if;
 select * into a from world_v2.runtime_opening_admission x where x.world_id=p_world for share;
 if not found or not exists(select 1 from world_v2.opening_seed x where x.world_id=p_world and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.replay_binding=a.replay_binding and x.replay_binding::jsonb->>'modelVersion'=a.model_version)then raise exception 'NARROW_CURRENT_IMMUTABLE_ADMISSION_REQUIRED'using errcode='55000';end if;
 select * into permit from world_v2.runtime_admission_publication_permit x where 'ADMISSION_'||upper(x.authorization_sha256)=a.admission_ref and x.world_id=p_world and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.model_version=a.model_version and x.replay_binding=a.replay_binding and a.admitted_at_real>=x.valid_from and a.admitted_at_real<x.valid_until for share;
 if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=permit.authorization_id)then raise exception 'NARROW_CURRENT_ADMISSION_REVOKED'using errcode='55000';end if;
 seed_id:=a.seed_id;seed_fingerprint:=a.seed_fingerprint;admission_ref:=a.admission_ref;world_version:=h.world_version::text;event_sequence:=h.event_sequence::text;
 -- Sealed H0 stock is provenance only. Actual stock is independently fully
 -- replayed by Core with ALL actual inventory rows at this held World head.
 stock_status:='MISSING';stock:='[]'::jsonb;
 select * into d from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_seller and x.office_id='TRADE'and x.document_ref=world_v2.postwar_complete_opening_inventory_document(p_world,p_seller,'TRADE')and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref and x.source_bundle_sha256=permit.source_bundle_sha256 and x.replay_binding=a.replay_binding and x.model_version=a.model_version and x.world_version=0 and x.event_sequence=0 for share;
 if found and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.document_ref=d.document_ref)then
  if d.page_count>16 or d.total_rows>1600 then raise exception 'NARROW_CURRENT_STOCK_CAPACITY'using errcode='54000';end if;
  for p in select * from world_v2.postwar_office_projection_page x where x.document_ref=d.document_ref order by x.page_index loop
   if p.page_index<>idx or p.row_offset<>n or p.row_count<>jsonb_array_length(p.rows_text::jsonb)or p.page_sha256<>encode(sha256(convert_to(p.rows_text,'UTF8')),'hex')then raise exception 'NARROW_CURRENT_STOCK_PAGE_HASH'using errcode='55000';end if;
   items:=items||p.rows_text::jsonb;idx:=idx+1;n:=n+p.row_count;
   if octet_length(items::text)>65536 then raise exception 'NARROW_CURRENT_STOCK_CAPACITY'using errcode='54000';end if;
  end loop;
  if idx<>d.page_count or n<>d.total_rows or d.document_sha256<>encode(sha256(convert_to(items::text,'UTF8')),'hex')then raise exception 'NARROW_CURRENT_STOCK_DOCUMENT_HASH'using errcode='55000';end if;
  select coalesce(jsonb_agg(x),'[]'::jsonb)into stock from jsonb_array_elements(items)x where x->'account'->>'batchId'=p_batch and x->'account'->>'countryId'=p_seller and x->'account'->>'commodityId'='GRAIN';
  stock_status:='SEALED_ADMITTED_OPENING';canonical_seed_sha256:=d.canonical_seed_sha256;
 end if;
 perform 1 from world_v2.postwar_narrow_trade_rights_admission x where x.world_id=p_world and x.seed_fingerprint=a.seed_fingerprint for share;
 select coalesce(jsonb_agg(jsonb_build_object('source_id',o.source_id,'source_payload_hash',o.source_payload_hash,'canonical_payload',o.canonical_payload,'domain_admission_ref',r.admission_ref,'domain_admission_revision',r.admission_revision,'issuer_ref',r.issuer_ref,'custodian_ref',r.custodian_ref,'admission_evidence_sha256',r.admission_evidence_sha256)order by o.source_id),'[]'::jsonb)into rights from world_v2.postwar_narrow_trade_current_original o join world_v2.postwar_narrow_trade_rights_admission r on r.world_id=o.world_id and r.source_id=o.source_id and r.seed_fingerprint=o.seed_fingerprint and r.source_payload_hash=o.source_payload_hash where o.world_id=p_world and o.seed_fingerprint=a.seed_fingerprint and exists(select 1 from jsonb_array_elements(o.canonical_payload::jsonb->'records')record where (record->>'kind'='OWNER_TRANSFER_MANDATE'and record->>'countryId'=p_seller)or(record->>'kind'='CROSS_BORDER_ROUTE'and record->>'fromCountryId'=p_seller))and not exists(select 1 from world_v2.postwar_narrow_trade_rights_revocation v where v.admission_ref=r.admission_ref);
 if octet_length(rights::text)>65536 then raise exception 'NARROW_CURRENT_RIGHTS_CAPACITY'using errcode='54000';end if;
 history_mode:='GENUINE_SHARED_PAGED_CORE_REPLAY_REQUIRED';
 return next;
end;$newbody$;
 execute replace(f.definition,f.prosrc,replacement);
 if(select encode(sha256(convert_to(prosrc,'UTF8')),'hex')from pg_proc where oid=f.oid)<>'b70778b883cad9d575376bb2b5e3e5c3273ce9907aca37e6fd29b1a52b6b291a'then raise exception 'COMPLETE_INVENTORY_EXACT_NEW_FUNCTION_REQUIRED'using errcode='55000';end if;
end;$adapt$;

-- Fixed adaptation: world_v2.read_postwar_narrow_trade_automatic_paged_scope(text,text,text,timestamptz,text)
do $adapt$declare f record;definition text;replacement text;begin
 select p.*,pg_get_functiondef(p.oid)as definition into f from pg_proc p where p.oid=to_regprocedure('world_v2.read_postwar_narrow_trade_automatic_paged_scope(text,text,text,timestamptz,text)');
 if not found or pg_get_userbyid(f.proowner)<>'world_v2_postwar_narrow_trade_current_owner'or not f.prosecdef or f.proconfig is distinct from array['search_path=pg_catalog']::text[]or encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>'fc88ffc0739f9a0367facc88dbefb201f932f4d35f71dc384c450d5898bf7dd7'then raise exception 'COMPLETE_INVENTORY_EXACT_INSTALLED_FUNCTION_REQUIRED:read_postwar_narrow_trade_automatic_paged_scope'using errcode='55000';end if;
 replacement:=$newbody$
declare effective name;h record;a world_v2.runtime_opening_admission%rowtype;permit world_v2.runtime_admission_publication_permit%rowtype;d world_v2.postwar_office_projection_document%rowtype;p record;items jsonb:='[]'::jsonb;idx integer:=0;n integer:=0;event_count bigint;command_count bigint;receipt_count bigint;batch_count bigint;inventory_count bigint;max_event bigint;max_version bigint;bytes bigint;event_bytes bigint;command_bytes bigint;receipt_bytes bigint;v_auto world_v2.command_submission%rowtype;original world_v2.command_submission%rowtype;p_seller text;p_buyer text;p_batch text;
begin
 if current_setting('transaction_isolation')not in('repeatable read','serializable')then raise exception 'NARROW_PAGED_HELD_TRANSACTION_REQUIRED'using errcode='25001';end if;
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_narrow_trade_source','MEMBER')or pg_has_role(effective,'world_v2_postwar_narrow_trade_current_owner','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')or exists(select 1 from pg_roles r where r.rolname=effective and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))then raise exception 'NARROW_AUTOMATIC_FIXED_ROLE_REQUIRED'using errcode='42501';end if;
 if current_setting('transaction_read_only')<>'off'or p_sim!~'^(0|[1-9][0-9]*)$'then raise exception 'NARROW_AUTOMATIC_TRANSACTION_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.narrow_current_world',p_world,true);
 -- The same active worker lease precedes the authoritative head/source locks.
 perform 1 from world_v2.world_writer_lease l where l.world_id=p_world and l.holder_id=p_worker and l.renewed_at_real<=p_observed and l.lease_expires_at_real>p_observed for share;
 if not found then raise exception 'NARROW_AUTOMATIC_ACTUAL_LEASE_REQUIRED'using errcode='55000';end if;
 select x.world_version,x.event_sequence into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found then raise exception 'NARROW_AUTOMATIC_ACTUAL_HEAD_REQUIRED'using errcode='55000';end if;
 select * into v_auto from world_v2.command_submission x where x.world_id=p_world and x.command_id=p_command;
 if not found or v_auto.command_type not in('CORE_GOODS_SHIPMENT_V1','CORE_GOODS_DELIVERY_V1')or v_auto.office_id is not null or v_auto.expected_world_version<>h.world_version or v_auto.sim_time>p_sim::numeric then raise exception 'NARROW_AUTOMATIC_EXACT_DUE_COMMAND_REQUIRED'using errcode='55000';end if;
 perform 1 from world_v2.command_queue q where q.world_id=p_world and q.command_id=p_command and q.authority_kind='VERSIONED_AUTOMATIC'and q.queue_state='CLAIMED'and q.claimed_by=p_worker and q.available_at_sim_time<=p_sim::numeric and q.claim_fencing_token=(select l.fencing_token from world_v2.world_writer_lease l where l.world_id=p_world) for share;
 if not found or exists(select 1 from world_v2.command_receipt r where r.world_id=p_world and r.command_id=p_command)then raise exception 'NARROW_AUTOMATIC_ACTIVE_UNFINISHED_CLAIM_REQUIRED'using errcode='55000';end if;
 select * into original from world_v2.command_submission x where x.world_id=p_world and x.command_id=v_auto.canonical_payload::jsonb->>'transferCommandId';
 if not found or original.command_type<>'CORE_GOODS_TRANSFER_V1'or original.command_fingerprint is distinct from v_auto.canonical_payload::jsonb->>'transferFingerprint'or original.country_id<>v_auto.country_id or not exists(select 1 from world_v2.command_receipt r where r.world_id=p_world and r.command_id=original.command_id and r.command_fingerprint=original.command_fingerprint and r.outcome='COMMITTED')then raise exception 'NARROW_AUTOMATIC_COMMITTED_TRANSFER_REQUIRED'using errcode='55000';end if;
 p_seller:=original.canonical_payload::jsonb->>'sellerCountryId';p_buyer:=original.canonical_payload::jsonb->>'buyerCountryId';p_batch:=original.canonical_payload::jsonb->'assetSource'->>'batchId';
 select * into a from world_v2.runtime_opening_admission x where x.world_id=p_world for share;
 if not found or not exists(select 1 from world_v2.opening_seed x where x.world_id=p_world and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.replay_binding=a.replay_binding and x.replay_binding::jsonb->>'modelVersion'=a.model_version)then raise exception 'NARROW_CURRENT_IMMUTABLE_ADMISSION_REQUIRED'using errcode='55000';end if;
 select * into permit from world_v2.runtime_admission_publication_permit x where 'ADMISSION_'||upper(x.authorization_sha256)=a.admission_ref and x.world_id=p_world and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.model_version=a.model_version and x.replay_binding=a.replay_binding and a.admitted_at_real>=x.valid_from and a.admitted_at_real<x.valid_until for share;
 if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=permit.authorization_id)then raise exception 'NARROW_CURRENT_ADMISSION_REVOKED'using errcode='55000';end if;
 seed_id:=a.seed_id;seed_fingerprint:=a.seed_fingerprint;admission_ref:=a.admission_ref;world_version:=h.world_version::text;event_sequence:=h.event_sequence::text;
 -- Sealed H0 stock is provenance only. Actual stock is independently fully
 -- replayed by Core with ALL actual inventory rows at this held World head.
 stock_status:='MISSING';stock:='[]'::jsonb;
 select * into d from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_seller and x.office_id='TRADE'and x.document_ref=world_v2.postwar_complete_opening_inventory_document(p_world,p_seller,'TRADE')and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref and x.source_bundle_sha256=permit.source_bundle_sha256 and x.replay_binding=a.replay_binding and x.model_version=a.model_version and x.world_version=0 and x.event_sequence=0 for share;
 if found and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.document_ref=d.document_ref)then
  if d.page_count>16 or d.total_rows>1600 then raise exception 'NARROW_CURRENT_STOCK_CAPACITY'using errcode='54000';end if;
  for p in select * from world_v2.postwar_office_projection_page x where x.document_ref=d.document_ref order by x.page_index loop
   if p.page_index<>idx or p.row_offset<>n or p.row_count<>jsonb_array_length(p.rows_text::jsonb)or p.page_sha256<>encode(sha256(convert_to(p.rows_text,'UTF8')),'hex')then raise exception 'NARROW_CURRENT_STOCK_PAGE_HASH'using errcode='55000';end if;
   items:=items||p.rows_text::jsonb;idx:=idx+1;n:=n+p.row_count;
   if octet_length(items::text)>65536 then raise exception 'NARROW_CURRENT_STOCK_CAPACITY'using errcode='54000';end if;
  end loop;
  if idx<>d.page_count or n<>d.total_rows or d.document_sha256<>encode(sha256(convert_to(items::text,'UTF8')),'hex')then raise exception 'NARROW_CURRENT_STOCK_DOCUMENT_HASH'using errcode='55000';end if;
  select coalesce(jsonb_agg(x),'[]'::jsonb)into stock from jsonb_array_elements(items)x where x->'account'->>'batchId'=p_batch and x->'account'->>'countryId'=p_seller and x->'account'->>'commodityId'='GRAIN';
  stock_status:='SEALED_ADMITTED_OPENING';canonical_seed_sha256:=d.canonical_seed_sha256;
 end if;
 perform 1 from world_v2.postwar_narrow_trade_rights_admission x where x.world_id=p_world and x.seed_fingerprint=a.seed_fingerprint for share;
 select coalesce(jsonb_agg(jsonb_build_object('source_id',o.source_id,'source_payload_hash',o.source_payload_hash,'canonical_payload',o.canonical_payload,'domain_admission_ref',r.admission_ref,'domain_admission_revision',r.admission_revision,'issuer_ref',r.issuer_ref,'custodian_ref',r.custodian_ref,'admission_evidence_sha256',r.admission_evidence_sha256)order by o.source_id),'[]'::jsonb)into rights from world_v2.postwar_narrow_trade_current_original o join world_v2.postwar_narrow_trade_rights_admission r on r.world_id=o.world_id and r.source_id=o.source_id and r.seed_fingerprint=o.seed_fingerprint and r.source_payload_hash=o.source_payload_hash where o.world_id=p_world and o.seed_fingerprint=a.seed_fingerprint and exists(select 1 from jsonb_array_elements(o.canonical_payload::jsonb->'records')record where (record->>'kind'='OWNER_TRANSFER_MANDATE'and record->>'countryId'=p_seller)or(record->>'kind'='CROSS_BORDER_ROUTE'and record->>'fromCountryId'=p_seller))and not exists(select 1 from world_v2.postwar_narrow_trade_rights_revocation v where v.admission_ref=r.admission_ref);
 if octet_length(rights::text)>65536 then raise exception 'NARROW_CURRENT_RIGHTS_CAPACITY'using errcode='54000';end if;
 history_mode:='GENUINE_SHARED_PAGED_CORE_REPLAY_REQUIRED';
 return next;
end;$newbody$;
 execute replace(f.definition,f.prosrc,replacement);
 if(select encode(sha256(convert_to(prosrc,'UTF8')),'hex')from pg_proc where oid=f.oid)<>'5ada845e0009edd1b61bfa842c0519a0c715df1a091f40d8533270e78247edc3'then raise exception 'COMPLETE_INVENTORY_EXACT_NEW_FUNCTION_REQUIRED'using errcode='55000';end if;
end;$adapt$;

-- Fixed adaptation: world_v2.postwar_projection_current_inventory_balance(text,jsonb,bigint)
do $adapt$declare f record;definition text;replacement text;begin
 select p.*,pg_get_functiondef(p.oid)as definition into f from pg_proc p where p.oid=to_regprocedure('world_v2.postwar_projection_current_inventory_balance(text,jsonb,bigint)');
 if not found or pg_get_userbyid(f.proowner)<>'world_v2_postwar_projection_owner'or not f.prosecdef or f.proconfig is distinct from array['search_path=pg_catalog']::text[]or encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>'95f1d3974e9af89510e50fb4d56a7ae4fbb5e3c7607f1848c61787d2c2f15db0'then raise exception 'COMPLETE_INVENTORY_EXACT_INSTALLED_FUNCTION_REQUIRED:postwar_projection_current_inventory_balance'using errcode='55000';end if;
 replacement:=$newbody$
declare a record;entry jsonb;total numeric:=0;begin
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 if world_v2.postwar_complete_opening_inventory_document(p_world,p_account->>'countryId','TRADE')is null then raise exception 'MIXED_COMPLETE_OPENING_INVENTORY_REQUIRED'using errcode='55000';end if;
 for entry in select x from world_v2.postwar_office_projection_document d join world_v2.postwar_office_projection_page pg on pg.document_ref=d.document_ref cross join lateral jsonb_array_elements(pg.rows_text::jsonb)x where d.world_id=p_world and d.office_id='TRADE'and d.document_ref=world_v2.postwar_complete_opening_inventory_document(p_world,p_account->>'countryId','TRADE')and d.seed_fingerprint=a.seed_fingerprint and d.admission_ref=a.admission_ref and d.world_version=0 and d.event_sequence=0 and x->'account'=p_account loop
  if entry->'quantity'->>'unit'is distinct from p_account->>'unit'then raise exception 'MIXED_H0_INVENTORY_UNIT_REQUIRED'using errcode='23514';end if;
  total:=total+(entry->'quantity'->>'amount')::numeric;
 end loop;
 for entry in select e from world_v2.inventory_posting p cross join lateral jsonb_array_elements(p.canonical_payload::jsonb->'entries')e where p.world_id=p_world and p.world_version_after<=p_before and e->'account'=p_account loop
  if entry->'delta'->>'unit'is distinct from p_account->>'unit'then raise exception 'MIXED_CURRENT_INVENTORY_UNIT_REQUIRED'using errcode='23514';end if;
  total:=total+(entry->'delta'->>'amount')::numeric;
 end loop;return total;
end;$newbody$;
 execute replace(f.definition,f.prosrc,replacement);
 if(select encode(sha256(convert_to(prosrc,'UTF8')),'hex')from pg_proc where oid=f.oid)<>'03215136ec048d9eb60efa91c14c3a92e4bdab4e86b75405d2b6a29b0020f38b'then raise exception 'COMPLETE_INVENTORY_EXACT_NEW_FUNCTION_REQUIRED'using errcode='55000';end if;
end;$adapt$;

revoke create on schema world_v2 from world_v2_postwar_projection_owner;
commit;
