-- SOURCE-ONLY proposal; not installed in production or added to migration chain.
-- Full canonical seed access belongs only to this inaccessible offline definer.
-- Readers receive small immutable projections plus metadata, never canonical_payload.
begin;
create role world_v2_postwar_projection_owner nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
create role world_v2_postwar_projection_publisher nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
create role world_v2_postwar_projection_reader nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
grant usage,create on schema world_v2 to world_v2_postwar_projection_owner;
grant usage on schema world_v2 to world_v2_postwar_projection_publisher,world_v2_postwar_projection_reader;
create table world_v2.postwar_office_projection_document(
 document_ref text primary key,world_id text not null,country_id text not null,
 office_id text not null check(office_id in('CAPTAIN','FINANCE','CENTRAL_BANK','INDUSTRY','TRADE','SOCIAL')),
 dataset text not null,projection_version text not null check(projection_version='postwar-office-projection.v1'),
 source_version text not null unique,source_revision text not null,
 admission_ref text not null references world_v2.runtime_opening_admission(admission_ref),
 seed_id text not null references world_v2.opening_seed(seed_id),seed_fingerprint text not null,
 canonical_seed_sha256 text not null check(canonical_seed_sha256~'^[0-9a-f]{64}$'),
 source_bundle_sha256 text not null check(source_bundle_sha256~'^[0-9a-f]{64}$'),
 source_id text not null,source_payload_hash text not null,source_pointer jsonb not null,
 model_version text not null,replay_binding text not null,world_version bigint not null check(world_version=0),event_sequence bigint not null check(event_sequence=0),
 document_sha256 text not null check(document_sha256~'^[0-9a-f]{64}$'),total_rows integer not null check(total_rows>=0),page_count integer not null check(page_count>0),
 generated_at timestamptz not null default clock_timestamp(),
 foreign key(world_id,seed_fingerprint) references world_v2.opening_seed(world_id,seed_fingerprint),
 unique(world_id,country_id,office_id,dataset,projection_version),unique(document_ref,world_id,country_id,office_id),unique(document_ref,world_id)
);
create table world_v2.postwar_office_projection_page(
 document_ref text not null,world_id text not null,country_id text not null,office_id text not null,page_index integer not null check(page_index>=0),
 row_offset integer not null check(row_offset>=0),row_count integer not null check(row_count between 0 and 100),
 rows_text text not null check(octet_length(rows_text)<=48000 and jsonb_typeof(rows_text::jsonb)='array'),
 page_sha256 text not null check(page_sha256=encode(sha256(convert_to(rows_text,'UTF8')),'hex')),
 primary key(document_ref,page_index),foreign key(document_ref,world_id,country_id,office_id)references world_v2.postwar_office_projection_document(document_ref,world_id,country_id,office_id),unique(document_ref,row_offset),check(jsonb_array_length(rows_text::jsonb)=row_count)
);
create table world_v2.postwar_office_projection_revocation(
 document_ref text primary key,world_id text not null,reason_ref text not null check(length(reason_ref) between 1 and 256),revoked_at timestamptz not null default clock_timestamp(),foreign key(document_ref,world_id)references world_v2.postwar_office_projection_document(document_ref,world_id)
);
do $$declare t text;begin foreach t in array array['postwar_office_projection_document','postwar_office_projection_page','postwar_office_projection_revocation']loop
 execute format('alter table world_v2.%I owner to world_v2_postwar_projection_owner',t);
 execute format('alter table world_v2.%I enable row level security',t);execute format('alter table world_v2.%I force row level security',t);
 execute format('revoke all on world_v2.%I from public',t);
 execute format('create policy %I on world_v2.%I to world_v2_postwar_projection_owner using(current_user=''world_v2_postwar_projection_owner'' and world_id=current_setting(''econmind.postwar_projection_world'',true)) with check(current_user=''world_v2_postwar_projection_owner'' and world_id=current_setting(''econmind.postwar_projection_world'',true))',t||'_owner',t);
 execute format('create trigger %I before update or delete on world_v2.%I for each row execute function world_v2.reject_authoritative_history_mutation()',t||'_immutable',t);
 execute format('create trigger %I before truncate on world_v2.%I for each statement execute function world_v2.reject_authoritative_history_mutation()',t||'_no_truncate',t);
end loop;end;$$;
grant select on world_v2.world_head,world_v2.opening_seed,world_v2.runtime_opening_admission,world_v2.runtime_admission_publication_permit,world_v2.runtime_admission_publication_revocation,world_v2.current_commit_authorization,world_v2.runtime_read_seat,world_v2.projection_entitlement to world_v2_postwar_projection_owner;
grant update(world_version) on world_v2.world_head to world_v2_postwar_projection_owner;
grant update(authorization_id) on world_v2.runtime_admission_publication_permit to world_v2_postwar_projection_owner;
create policy postwar_projection_seed_owner on world_v2.opening_seed for select to world_v2_postwar_projection_owner using(current_user='world_v2_postwar_projection_owner' and world_id=current_setting('econmind.postwar_projection_world',true));
create policy postwar_projection_admission_owner on world_v2.runtime_opening_admission for select to world_v2_postwar_projection_owner using(current_user='world_v2_postwar_projection_owner' and world_id=current_setting('econmind.postwar_projection_world',true));
create policy postwar_projection_seat_owner on world_v2.runtime_read_seat for select to world_v2_postwar_projection_owner using(current_user='world_v2_postwar_projection_owner' and world_id=current_setting('econmind.postwar_projection_world',true));
create policy postwar_projection_entitlement_owner on world_v2.projection_entitlement for select to world_v2_postwar_projection_owner using(current_user='world_v2_postwar_projection_owner' and world_id=current_setting('econmind.postwar_projection_world',true));
-- Restrictive fences prevent existing PUBLIC subject policies from widening the
-- offline definer's exact-world visibility through permissive-policy OR.
do $$declare t text;begin foreach t in array array['opening_seed','runtime_opening_admission','runtime_read_seat','projection_entitlement','postwar_office_projection_document','postwar_office_projection_page','postwar_office_projection_revocation']loop
 execute format('create policy %I on world_v2.%I as restrictive for select to world_v2_postwar_projection_owner using(current_user=''world_v2_postwar_projection_owner'' and world_id=current_setting(''econmind.postwar_projection_world'',true))','postwar_projection_exact_world_'||t,t);
end loop;end;$$;


create function world_v2.postwar_projection_reader_allowed()returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;begin
 effective:=case when current_setting('role')='none' then session_user else current_setting('role')::name end;
 return exists(select 1 from pg_roles r where r.rolname=effective and not r.rolsuper and not r.rolbypassrls and not r.rolcreaterole and not r.rolcreatedb and not r.rolreplication)
 and exists(select 1 from pg_roles r where r.rolname=session_user and not r.rolsuper and not r.rolbypassrls and not r.rolcreaterole and not r.rolcreatedb and not r.rolreplication)
 and pg_has_role(effective,'world_v2_postwar_projection_reader','MEMBER')
 and not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')
 and not pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')
 and not has_schema_privilege(effective,'world_v2','CREATE')
 and not has_column_privilege(effective,'world_v2.opening_seed','canonical_payload','SELECT')
 and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='world_v2' and c.relkind in('r','p') and has_table_privilege(effective,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'))
 and not exists(select 1 from pg_roles r where r.rolname in('anon','authenticated','service_role','world_v2_api_reader','world_v2_api_login') and pg_has_role(effective,r.oid,'MEMBER'));
end;$$;
alter function world_v2.postwar_projection_reader_allowed()owner to world_v2_postwar_projection_owner;
-- Metadata-only admission check: NEVER reads, hashes or parses canonical_payload.
create function world_v2.postwar_projection_admission_header(p_world text)
returns table(admission_ref text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,source_bundle_sha256 text)
language sql security definer set search_path=pg_catalog as $$
 select a.admission_ref,a.seed_id,a.seed_fingerprint,a.model_version,a.replay_binding,p.source_bundle_sha256
 from world_v2.runtime_opening_admission a join world_v2.opening_seed s on s.world_id=a.world_id and s.seed_id=a.seed_id and s.seed_fingerprint=a.seed_fingerprint and s.replay_binding=a.replay_binding
 join world_v2.runtime_admission_publication_permit p on 'ADMISSION_'||upper(p.authorization_sha256)=a.admission_ref and p.world_id=a.world_id and p.seed_id=a.seed_id and p.seed_fingerprint=a.seed_fingerprint and p.model_version=a.model_version and p.replay_binding=a.replay_binding
 where p_world=current_setting('econmind.postwar_projection_world',true) and a.world_id=p_world and a.admitted_at_real>=p.valid_from and a.admitted_at_real<p.valid_until
 and not exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=p.authorization_id)
 limit 1
$$;
alter function world_v2.postwar_projection_admission_header(text)owner to world_v2_postwar_projection_owner;
create function world_v2.read_postwar_office_projection_seats(p_world text)
returns table(world_id text,country_id text,office_id text,auth_subject text,team_id text,authorization_revision text,scope_key text,seat_ref text,admission_ref text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,source_bundle_sha256 text,world_version text,event_sequence text)
language plpgsql security definer set search_path=pg_catalog as $$
declare offices integer;bindings integer;
begin
 if not world_v2.postwar_projection_reader_allowed() then raise exception 'POSTWAR_BOUNDED_READER_ROLE_DENIED' using errcode='42501';end if;
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select count(distinct a.office_id),count(distinct(a.country_id,a.team_id,a.authorization_version))into offices,bindings from world_v2.current_commit_authorization a where a.world_id=p_world and a.auth_subject::text=current_setting('request.jwt.claim.sub',true)and a.active;
 if offices>6 or bindings>1 then raise exception 'POSTWAR_CURRENT_SEAT_NOT_COHERENT'using errcode='42501';end if;
 if exists(select 1 from world_v2.current_commit_authorization a where a.world_id=p_world and a.auth_subject::text=current_setting('request.jwt.claim.sub',true)and a.active and(
  a.office_id not in('CAPTAIN','FINANCE','CENTRAL_BANK','INDUSTRY','TRADE','SOCIAL')or a.capability<>all(case a.office_id when 'SOCIAL' then array['SOCIAL_LABOUR','SOCIAL_EDUCATION','SOCIAL_DEVELOPMENT'] when 'FINANCE' then array['FINANCE_TREASURY','FINANCE_BUDGET','FINANCE_PUBLIC_DEBT'] when 'CENTRAL_BANK' then array['CENTRAL_BANK_MONETARY_POLICY','CENTRAL_BANK_BANKING_STABILITY','CENTRAL_BANK_FX_RESERVES'] when 'INDUSTRY' then array['INDUSTRY_PRODUCTION','INDUSTRY_TECHNOLOGY','INDUSTRY_RESOURCES'] when 'TRADE' then array['TRADE_POLICY','TRADE_CONTRACTS','TRADE_FOREIGN_AFFAIRS'] when 'CAPTAIN' then array['CAPTAIN_STRATEGY','CAPTAIN_CABINET','CAPTAIN_CRISIS_COORDINATION'] else array[]::text[] end)or not exists(select 1 from world_v2.runtime_read_seat s join world_v2.projection_entitlement e on e.world_id=s.world_id and e.auth_subject=s.auth_subject and e.authorization_version=s.authorization_revision and e.classification='OFFICE_PRIVATE'and e.scope_key='OFFICE_'||upper(encode(convert_to(s.country_id,'UTF8'),'hex'))||'_'||upper(encode(convert_to(s.office_id,'UTF8'),'hex'))and e.active and e.revoked_at is null
  where s.world_id=a.world_id and s.auth_subject=a.auth_subject and s.country_id=a.country_id and s.office_id=a.office_id and s.team_id=a.team_id and s.authorization_revision=a.authorization_version)
 ))then raise exception 'POSTWAR_CURRENT_SEAT_NOT_COHERENT'using errcode='42501';end if;
 return query select distinct s.world_id,s.country_id,s.office_id,s.auth_subject::text,s.team_id,s.authorization_revision,e.scope_key,s.seat_ref,h.admission_ref,h.seed_id,h.seed_fingerprint,h.model_version,h.replay_binding,h.source_bundle_sha256,w.world_version::text,w.event_sequence::text
 from world_v2.runtime_read_seat s join world_v2.current_commit_authorization a on a.world_id=s.world_id and a.auth_subject=s.auth_subject and a.country_id=s.country_id and a.office_id=s.office_id and a.team_id=s.team_id and a.authorization_version=s.authorization_revision and a.active
 join world_v2.projection_entitlement e on e.world_id=s.world_id and e.auth_subject=s.auth_subject and e.authorization_version=s.authorization_revision and e.classification='OFFICE_PRIVATE' and e.scope_key='OFFICE_'||upper(encode(convert_to(s.country_id,'UTF8'),'hex'))||'_'||upper(encode(convert_to(s.office_id,'UTF8'),'hex')) and e.active and e.revoked_at is null
 join world_v2.world_head w on w.world_id=s.world_id
 cross join lateral world_v2.postwar_projection_admission_header(s.world_id)h
 where s.world_id=p_world and s.auth_subject::text=current_setting('request.jwt.claim.sub',true)
 and a.capability=any(case s.office_id when 'SOCIAL' then array['SOCIAL_LABOUR','SOCIAL_EDUCATION','SOCIAL_DEVELOPMENT'] when 'FINANCE' then array['FINANCE_TREASURY','FINANCE_BUDGET','FINANCE_PUBLIC_DEBT'] when 'CENTRAL_BANK' then array['CENTRAL_BANK_MONETARY_POLICY','CENTRAL_BANK_BANKING_STABILITY','CENTRAL_BANK_FX_RESERVES'] when 'INDUSTRY' then array['INDUSTRY_PRODUCTION','INDUSTRY_TECHNOLOGY','INDUSTRY_RESOURCES'] when 'TRADE' then array['TRADE_POLICY','TRADE_CONTRACTS','TRADE_FOREIGN_AFFAIRS'] when 'CAPTAIN' then array['CAPTAIN_STRATEGY','CAPTAIN_CABINET','CAPTAIN_CRISIS_COORDINATION'] else array[]::text[] end)
 and not exists(select 1 from world_v2.current_commit_authorization other where other.world_id=s.world_id and other.auth_subject=s.auth_subject and other.active and(other.country_id<>s.country_id or other.team_id<>s.team_id or other.authorization_version<>s.authorization_revision))
 order by s.office_id limit 7;
end;$$;
alter function world_v2.read_postwar_office_projection_seats(text)owner to world_v2_postwar_projection_owner;
-- Fixed extraction only. No pointer/JSON/Ready argument is accepted.
create function world_v2.publish_postwar_office_projection(p_world text,p_country text,p_office text,p_dataset text,p_expected_seed_fingerprint text,p_expected_canonical_sha256 text,p_expected_source_sha256 text,p_expected_admission_ref text)
returns world_v2.postwar_office_projection_document language plpgsql security definer set search_path=pg_catalog as $$
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
  select coalesce(jsonb_agg(x order by x->>'entryId'),'[]'::jsonb)into items from jsonb_array_elements(root->'inventoryEntries')x where x->'account'->>'countryId'=p_country and x->>'sourceId'=financial->>'sourceId';
  source_pointer:=source_pointer||jsonb_build_object('path','seed.inventoryEntries[account.countryId;sourceId=originalAdoptedFinancialSource]');
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
end;$$;
alter function world_v2.publish_postwar_office_projection(text,text,text,text,text,text,text,text)owner to world_v2_postwar_projection_owner;
create function world_v2.postwar_projection_document_readable(p_ref text,p_world text,p_country text,p_office text,p_admission text,p_seed_fingerprint text,p_source_sha text)returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin
 if not world_v2.postwar_projection_reader_allowed()then return false;end if;
 perform set_config('econmind.postwar_projection_world',p_world,true);
 return exists(select 1 from world_v2.read_postwar_office_projection_seats(p_world)s
 where s.country_id=p_country and s.office_id=p_office and s.admission_ref=p_admission and s.seed_fingerprint=p_seed_fingerprint and s.source_bundle_sha256=p_source_sha and s.world_version='0'and s.event_sequence='0'
 and (p_office<>'SOCIAL'or exists(select 1 from world_v2.current_commit_authorization a where a.world_id=s.world_id and a.auth_subject::text=s.auth_subject and a.country_id=s.country_id and a.office_id='SOCIAL'and a.team_id=s.team_id and a.authorization_version=s.authorization_revision and a.capability='SOCIAL_LABOUR'and a.active)))
 and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.document_ref=p_ref and r.world_id=p_world);
end;$$;
alter function world_v2.postwar_projection_document_readable(text,text,text,text,text,text,text)owner to world_v2_postwar_projection_owner;
create policy postwar_projection_document_reader on world_v2.postwar_office_projection_document for select to world_v2_postwar_projection_reader using(world_v2.postwar_projection_document_readable(document_ref,world_id,country_id,office_id,admission_ref,seed_fingerprint,source_bundle_sha256));
create policy postwar_projection_page_reader on world_v2.postwar_office_projection_page for select to world_v2_postwar_projection_reader using(exists(select 1 from world_v2.postwar_office_projection_document d where d.document_ref=postwar_office_projection_page.document_ref and d.world_id=postwar_office_projection_page.world_id and d.country_id=postwar_office_projection_page.country_id and d.office_id=postwar_office_projection_page.office_id));
-- Runtime callers use bounded functions only; direct SQL cannot aggregate pages.
revoke all on world_v2.postwar_office_projection_document,world_v2.postwar_office_projection_page from world_v2_postwar_projection_reader;
create function world_v2.read_postwar_office_projection_page(p_world text,p_office text,p_dataset text,p_offset integer,p_limit integer,p_expected_version text default null)
returns table(status text,scope_json jsonb,source_json jsonb,page_json jsonb,rows_text text)
language plpgsql security definer set search_path=pg_catalog as $$
declare s record;d world_v2.postwar_office_projection_document%rowtype;p world_v2.postwar_office_projection_page%rowtype;selected jsonb;returned integer;begin
 if p_offset is null or p_limit is null or p_offset<0 or p_offset>100000 or p_limit<1 or p_limit>100 then raise exception 'POSTWAR_INVALID_PAGE'using errcode='22023';end if;
 select * into s from world_v2.read_postwar_office_projection_seats(p_world)x where x.office_id=p_office and(p_office<>'SOCIAL'or exists(select 1 from world_v2.current_commit_authorization a where a.world_id=x.world_id and a.auth_subject::text=x.auth_subject and a.country_id=x.country_id and a.office_id='SOCIAL'and a.team_id=x.team_id and a.authorization_version=x.authorization_revision and a.capability='SOCIAL_LABOUR'and a.active));
 if not found then return query select 'DENIED',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 if s.world_version<>'0'or s.event_sequence<>'0'then return query select 'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into d from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=s.country_id and x.office_id=p_office and x.dataset=p_dataset and x.projection_version='postwar-office-projection.v1'and x.admission_ref=s.admission_ref and x.seed_fingerprint=s.seed_fingerprint and x.source_bundle_sha256=s.source_bundle_sha256;
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
end;$$;
alter function world_v2.read_postwar_office_projection_page(text,text,text,integer,integer,text)owner to world_v2_postwar_projection_owner;
create function world_v2.revoke_postwar_office_projection(p_world text,p_ref text,p_reason text)returns void language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;begin effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')then raise exception 'POSTWAR_FIXED_PROJECTION_PUBLISHER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.postwar_projection_world',p_world,true);
 perform 1 from world_v2.postwar_office_projection_document where document_ref=p_ref and world_id=p_world for update;if not found then raise exception 'POSTWAR_PROJECTION_REQUIRED'using errcode='23503';end if;
 insert into world_v2.postwar_office_projection_revocation(document_ref,world_id,reason_ref)values(p_ref,p_world,p_reason)on conflict do nothing;
end;$$;
alter function world_v2.revoke_postwar_office_projection(text,text,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.postwar_projection_reader_allowed(),world_v2.postwar_projection_admission_header(text),world_v2.read_postwar_office_projection_seats(text),world_v2.publish_postwar_office_projection(text,text,text,text,text,text,text,text),world_v2.postwar_projection_document_readable(text,text,text,text,text,text,text),world_v2.read_postwar_office_projection_page(text,text,text,integer,integer,text),world_v2.revoke_postwar_office_projection(text,text,text) from public;
grant execute on function world_v2.postwar_projection_reader_allowed(),world_v2.postwar_projection_document_readable(text,text,text,text,text,text,text),world_v2.read_postwar_office_projection_seats(text),world_v2.read_postwar_office_projection_page(text,text,text,integer,integer,text)to world_v2_postwar_projection_reader;
grant execute on function world_v2.publish_postwar_office_projection(text,text,text,text,text,text,text,text),world_v2.revoke_postwar_office_projection(text,text,text)to world_v2_postwar_projection_publisher;
revoke create on schema world_v2 from world_v2_postwar_projection_owner;
commit;
