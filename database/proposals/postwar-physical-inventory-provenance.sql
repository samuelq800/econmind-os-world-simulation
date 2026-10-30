-- SOURCE ONLY. V2 metadata over immutable V1 inventory documents. Neither the
-- original document/pages nor their sourceVersion is rewritten. Explicit opt-in
-- reader required; old reports retain LEGACY_ADOPTION_CONTEXT_POINTER semantics.
begin;
grant usage,create on schema world_v2 to world_v2_postwar_projection_owner;
create table world_v2.postwar_inventory_provenance_v2(
 provenance_ref text primary key,world_id text not null,country_id text not null,
 office_id text not null check(office_id in('INDUSTRY','TRADE')),
 document_ref text not null,legacy_source_version text not null,
 source_version text not null unique,source_revision text not null,
 seed_fingerprint text not null,admission_ref text not null,
 canonical_seed_sha256 text not null,source_bundle_sha256 text not null,
 document_sha256 text not null,direct_source_id text not null,direct_source_payload_hash text not null,
 context_source_id text not null,context_source_payload_hash text not null,
 source_pointer jsonb not null check(octet_length(source_pointer::text)<=8192),
 foreign key(document_ref,world_id,country_id,office_id)references world_v2.postwar_office_projection_document(document_ref,world_id,country_id,office_id),
 foreign key(world_id,seed_fingerprint)references world_v2.opening_seed(world_id,seed_fingerprint),
 foreign key(admission_ref)references world_v2.runtime_opening_admission(admission_ref),
 unique(document_ref),check(source_version<>legacy_source_version),check(direct_source_id<>context_source_id)
);
alter table world_v2.postwar_inventory_provenance_v2 owner to world_v2_postwar_projection_owner;
alter table world_v2.postwar_inventory_provenance_v2 enable row level security;
alter table world_v2.postwar_inventory_provenance_v2 force row level security;
revoke all on world_v2.postwar_inventory_provenance_v2 from public,world_v2_postwar_projection_reader,world_v2_postwar_projection_publisher;
create policy postwar_inventory_provenance_owner on world_v2.postwar_inventory_provenance_v2 to world_v2_postwar_projection_owner using(current_user='world_v2_postwar_projection_owner'and world_id=current_setting('econmind.postwar_projection_world',true))with check(current_user='world_v2_postwar_projection_owner'and world_id=current_setting('econmind.postwar_projection_world',true));
create policy postwar_inventory_provenance_world on world_v2.postwar_inventory_provenance_v2 as restrictive to world_v2_postwar_projection_owner using(world_id=current_setting('econmind.postwar_projection_world',true))with check(world_id=current_setting('econmind.postwar_projection_world',true));
create trigger postwar_inventory_provenance_immutable before update or delete on world_v2.postwar_inventory_provenance_v2 for each row execute function world_v2.reject_authoritative_history_mutation();
create trigger postwar_inventory_provenance_no_truncate before truncate on world_v2.postwar_inventory_provenance_v2 for each statement execute function world_v2.reject_authoritative_history_mutation();
create function world_v2.publish_postwar_inventory_provenance_v2(p_world text,p_country text,p_seed_fingerprint text,p_canonical_sha256 text,p_bundle_sha256 text,p_admission text)
returns setof world_v2.postwar_inventory_provenance_v2
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;a record;s record;d record;existing world_v2.postwar_inventory_provenance_v2%rowtype;
 root jsonb;financial jsonb;operating jsonb;src jsonb;schema_name text;financial_count integer:=0;operating_count integer:=0;items jsonb;copied jsonb;pointer jsonb;raw_sha text;doc_sha text;ref text;version text;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')then raise exception 'POSTWAR_FIXED_PROJECTION_PUBLISHER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 perform 1 from world_v2.runtime_admission_publication_permit q where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref for share;
 if exists(select 1 from world_v2.runtime_admission_publication_revocation r join world_v2.runtime_admission_publication_permit q using(authorization_id)where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref)then raise exception 'POSTWAR_INVENTORY_ADMISSION_REVOKED'using errcode='55000';end if;
 select * into strict s from world_v2.opening_seed x where x.world_id=p_world;
 raw_sha:=encode(sha256(convert_to(s.canonical_payload,'UTF8')),'hex');
 if s.seed_fingerprint<>p_seed_fingerprint or s.seed_fingerprint<>a.seed_fingerprint or raw_sha<>p_canonical_sha256 or a.source_bundle_sha256<>p_bundle_sha256 or a.admission_ref<>p_admission
 or s.seed_fingerprint<>'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||s.canonical_payload,'UTF8')),'hex')then raise exception 'POSTWAR_INVENTORY_ACTUAL_SOURCE_PINS_REQUIRED'using errcode='23514';end if;
 -- Offline only: parse the fixed admitted seed once for both office records.
 root:=s.canonical_payload::jsonb;
 if root->>'worldId'<>p_world or root->>'seedId'<>a.seed_id then raise exception 'POSTWAR_INVENTORY_CANONICAL_SCOPE_REQUIRED'using errcode='23514';end if;
 for src in select value from jsonb_array_elements(root->'sources')loop
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
 select coalesce(jsonb_agg(x order by x->>'entryId'),'[]'::jsonb)into items from jsonb_array_elements(root->'inventoryEntries')x where x->'account'->>'countryId'=p_country and x->>'sourceId'=financial->>'sourceId';
 doc_sha:=encode(sha256(convert_to(items::text,'UTF8')),'hex');
 perform 1 from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_country and x.office_id in('INDUSTRY','TRADE')and x.dataset='opening-inventory-entries'for share;
 if(select count(*)from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_country and x.office_id in('INDUSTRY','TRADE')and x.dataset='opening-inventory-entries')<>2 then raise exception 'POSTWAR_INVENTORY_BOTH_LEGACY_DOCUMENTS_REQUIRED'using errcode='23514';end if;
 for d in select * from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_country and x.office_id in('INDUSTRY','TRADE')and x.dataset='opening-inventory-entries'order by x.office_id loop
  if d.projection_version<>'postwar-office-projection.v1'or d.world_version<>0 or d.event_sequence<>0 or d.seed_fingerprint<>a.seed_fingerprint or d.admission_ref<>a.admission_ref or d.source_bundle_sha256<>a.source_bundle_sha256 or d.canonical_seed_sha256<>raw_sha
  or d.source_id<>operating->>'sourceId'or d.source_payload_hash<>operating->>'payloadHash'or d.document_sha256<>doc_sha or d.total_rows<>jsonb_array_length(items)
  or exists(select 1 from world_v2.postwar_office_projection_revocation r where r.world_id=p_world and r.document_ref=d.document_ref)then raise exception 'POSTWAR_INVENTORY_LEGACY_SOURCE_OR_ROWS_DIFFER'using errcode='23514';end if;
  if exists(select 1 from world_v2.postwar_office_projection_page p where p.document_ref=d.document_ref and(p.page_sha256<>encode(sha256(convert_to(p.rows_text,'UTF8')),'hex')or p.row_count<>jsonb_array_length(p.rows_text::jsonb)))then raise exception 'POSTWAR_INVENTORY_LEGACY_PAGE_HASH_INVALID'using errcode='23514';end if;
  select coalesce(jsonb_agg(x.value order by p.row_offset,x.ordinality),'[]'::jsonb)into copied from world_v2.postwar_office_projection_page p cross join lateral jsonb_array_elements(p.rows_text::jsonb)with ordinality x where p.document_ref=d.document_ref;
  if copied<>items then raise exception 'POSTWAR_INVENTORY_LEGACY_PAGE_ROWS_DIFFER'using errcode='23514';end if;
  pointer:=jsonb_build_object('schemaVersion','postwar-inventory-source-pointer-v2','sourceRole','DIRECT_ROW_SOURCE','sourceId',financial->>'sourceId','sourcePayloadHash',financial->>'payloadHash','decode','seed.inventoryEntries[]','path','seed.inventoryEntries[account.countryId;sourceId=originalAdoptedFinancialSource]','countryId',p_country,'adoptionContextSourceRole','OPERATING_ADOPTION_CONTEXT','adoptionContextSourceId',operating->>'sourceId','adoptionContextSourcePayloadHash',operating->>'payloadHash','legacyDocumentRef',d.document_ref,'legacySourceVersion',d.source_version,'legacyPointerSemantics','LEGACY_ADOPTION_CONTEXT_POINTER_NOT_DIRECT_ROW_SOURCE');
  ref:='POSTWAR_INVENTORY_PROVENANCE_'||upper(encode(sha256(convert_to(d.document_ref||pointer::text||doc_sha,'UTF8')),'hex'));
  version:='sha256:'||encode(sha256(convert_to('postwar-inventory-provenance-v2'||chr(10)||ref||d.source_version,'UTF8')),'hex');
  select * into existing from world_v2.postwar_inventory_provenance_v2 x where x.document_ref=d.document_ref;
  if found then if existing.source_version<>version or existing.source_pointer<>pointer then raise exception 'POSTWAR_INVENTORY_IMMUTABLE_PROVENANCE_CONFLICT'using errcode='23514';end if;return next existing;continue;end if;
  insert into world_v2.postwar_inventory_provenance_v2 values(ref,p_world,p_country,d.office_id,d.document_ref,d.source_version,version,financial->>'sourceVersion',a.seed_fingerprint,a.admission_ref,raw_sha,a.source_bundle_sha256,doc_sha,financial->>'sourceId',financial->>'payloadHash',operating->>'sourceId',operating->>'payloadHash',pointer)returning * into existing;
  return next existing;
 end loop;
end;$$;
alter function world_v2.publish_postwar_inventory_provenance_v2(text,text,text,text,text,text)owner to world_v2_postwar_projection_owner;
create function world_v2.read_postwar_inventory_provenance_v2_page(p_world text,p_office text,p_dataset text,p_offset integer,p_limit integer,p_expected_version text default null)
returns table(status text,scope_json jsonb,source_json jsonb,page_json jsonb,rows_text text)
language plpgsql security definer set search_path=pg_catalog as $$
declare s record;v world_v2.postwar_inventory_provenance_v2%rowtype;page record;begin
 if p_offset is null or p_limit is null or p_offset<0 or p_offset>100000 or p_limit<1 or p_limit>100 or(p_offset>0 and p_expected_version is null)or(p_expected_version is not null and p_expected_version!~'^sha256:[0-9a-f]{64}$')then raise exception 'POSTWAR_INVENTORY_V2_INVALID_PAGE'using errcode='22023';end if;
 if p_office is null or p_dataset is null or p_office not in('INDUSTRY','TRADE')or p_dataset<>'opening-inventory-entries'then raise exception 'POSTWAR_INVENTORY_V2_DATASET_DENIED'using errcode='42501';end if;
 select * into s from world_v2.read_postwar_office_projection_seats(p_world)x where x.office_id=p_office;
 if not found then return query select 'DENIED',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into v from world_v2.postwar_inventory_provenance_v2 x where x.world_id=p_world and x.country_id=s.country_id and x.office_id=p_office and x.seed_fingerprint=s.seed_fingerprint and x.admission_ref=s.admission_ref and x.source_bundle_sha256=s.source_bundle_sha256;
 if not found then return query select 'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 if p_expected_version is not null and p_expected_version<>v.source_version then return query select 'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 -- Reuse every existing identity, current seat, admission/permit, revocation,
 -- page hash/count/byte and historical H0-origin check. No raw seed read here.
 select * into page from world_v2.read_postwar_physical_opening_facts_page(p_world,p_office,p_dataset,p_offset,p_limit,v.legacy_source_version);
 if page.status not in('PAGE','EMPTY')then return query select page.status,page.scope_json,page.source_json,page.page_json,page.rows_text;return;end if;
 if page.source_json->>'sourceVersion'<>v.legacy_source_version or page.source_json->>'canonicalSeedSha256'<>v.canonical_seed_sha256 then raise exception 'POSTWAR_INVENTORY_V2_DOCUMENT_BINDING_INVALID'using errcode='23514';end if;
 return query select page.status,page.scope_json,page.source_json||jsonb_build_object('sourceVersion',v.source_version,'sourceRevision',v.source_revision,'sourcePointer',v.source_pointer),page.page_json,page.rows_text;
end;$$;
alter function world_v2.read_postwar_inventory_provenance_v2_page(text,text,text,integer,integer,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.publish_postwar_inventory_provenance_v2(text,text,text,text,text,text),world_v2.read_postwar_inventory_provenance_v2_page(text,text,text,integer,integer,text)from public;
grant execute on function world_v2.publish_postwar_inventory_provenance_v2(text,text,text,text,text,text)to world_v2_postwar_projection_publisher;
grant execute on function world_v2.read_postwar_inventory_provenance_v2_page(text,text,text,integer,integer,text)to world_v2_postwar_projection_reader;
revoke create on schema world_v2 from world_v2_postwar_projection_owner;
commit;
