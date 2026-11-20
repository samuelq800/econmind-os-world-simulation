-- Historical physical source pages at a current authorized read head.
-- Requires postwar-office-derived-read.sql; this adds no publication, source,
-- table SELECT grant, event bypass or current-state interpretation.
begin;
grant usage,create on schema world_v2 to world_v2_postwar_projection_owner;
create function world_v2.read_postwar_physical_opening_facts_page(
 p_world text,p_office text,p_dataset text,p_offset integer,p_limit integer,p_expected_version text default null)
returns table(status text,scope_json jsonb,source_json jsonb,page_json jsonb,rows_text text)
language plpgsql security definer set search_path=pg_catalog as $$
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
 where x.world_id=p_world and x.country_id=s.country_id and x.office_id=p_office and x.dataset=p_dataset
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
end;$$;
alter function world_v2.read_postwar_physical_opening_facts_page(text,text,text,integer,integer,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.read_postwar_physical_opening_facts_page(text,text,text,integer,integer,text)from public;
grant execute on function world_v2.read_postwar_physical_opening_facts_page(text,text,text,integer,integer,text)to world_v2_postwar_projection_reader;
revoke create on schema world_v2 from world_v2_postwar_projection_owner;
commit;
