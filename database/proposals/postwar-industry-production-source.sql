-- Candidate only. No production installation, credentials, memberships, World or Clock.
-- Immutable original-source custody. Proposals are never operating approvals.
begin;
do $$declare n text;begin foreach n in array array['world_v2_industry_source_owner','world_v2_industry_source_publisher','world_v2_industry_source_reader']loop
 if not exists(select 1 from pg_roles where rolname=n)then execute format('create role %I nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication',n);end if;
 if exists(select 1 from pg_roles where rolname=n and(rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))then raise exception 'INDUSTRY_UNSAFE_FIXED_ROLE'using errcode='42501';end if;
end loop;end;$$;
grant usage,create on schema world_v2 to world_v2_industry_source_owner;
grant usage on schema world_v2 to world_v2_industry_source_publisher,world_v2_industry_source_reader;
create table world_v2.postwar_industry_original(
 world_id text not null references world_v2.world_head(world_id),country_id text not null,facility_id text not null,
 registration_ref text not null unique,seed_fingerprint text not null,admission_ref text not null references world_v2.runtime_opening_admission(admission_ref),
 operating_source_id text not null,operating_source_hash text not null,checksums_sha256 text not null,owner_original_sha256 text not null,
 document_text text not null,document_sha256 text not null check(document_sha256=encode(sha256(convert_to(document_text,'UTF8')),'hex')),
 registered_at timestamptz not null default clock_timestamp(),foreign key(world_id,seed_fingerprint)references world_v2.opening_seed(world_id,seed_fingerprint),primary key(world_id,country_id,facility_id),unique(world_id,registration_ref)
);
create table world_v2.postwar_industry_deposit_original(
 world_id text not null references world_v2.world_head(world_id),country_id text not null,kind text not null check(kind in('OPERATOR_BANK_DEPOSIT','HOUSEHOLD_BANK_DEPOSIT')),
 seed_fingerprint text not null,admission_ref text not null references world_v2.runtime_opening_admission(admission_ref),financial_source_id text not null,financial_source_hash text not null,
 asset_account jsonb not null,liability_account jsonb not null,opening_amount numeric not null check(opening_amount>0),
 foreign key(world_id,seed_fingerprint)references world_v2.opening_seed(world_id,seed_fingerprint),primary key(world_id,country_id,kind)
);
create unique index postwar_industry_deposit_asset_once on world_v2.postwar_industry_deposit_original(world_id,(asset_account->>'accountId'));
create table world_v2.postwar_industry_original_revocation(
 world_id text not null,registration_ref text not null,reason_ref text not null check(length(reason_ref)between 1 and 256),revoked_at timestamptz not null default clock_timestamp(),primary key(world_id,registration_ref),foreign key(world_id,registration_ref)references world_v2.postwar_industry_original(world_id,registration_ref)
);
do $$declare t text;begin foreach t in array array['postwar_industry_original','postwar_industry_deposit_original','postwar_industry_original_revocation']loop
 execute format('alter table world_v2.%I owner to world_v2_industry_source_owner',t);
 execute format('alter table world_v2.%I enable row level security',t);execute format('alter table world_v2.%I force row level security',t);
 execute format('revoke all on world_v2.%I from public,world_v2_industry_source_reader,world_v2_industry_source_publisher',t);
 execute format('create policy %I on world_v2.%I to world_v2_industry_source_owner using(current_user=''world_v2_industry_source_owner''and world_id=current_setting(''econmind.industry_source_world'',true))with check(current_user=''world_v2_industry_source_owner''and world_id=current_setting(''econmind.industry_source_world'',true))',t||'_owner',t);
 execute format('create policy %I on world_v2.%I as restrictive for select to world_v2_industry_source_owner using(current_user=''world_v2_industry_source_owner''and world_id=current_setting(''econmind.industry_source_world'',true))',t||'_world_fence',t);
 execute format('create trigger %I before update or delete on world_v2.%I for each row execute function world_v2.reject_authoritative_history_mutation()',t||'_immutable',t);
 execute format('create trigger %I before truncate on world_v2.%I for each statement execute function world_v2.reject_authoritative_history_mutation()',t||'_no_truncate',t);
end loop;end;$$;
grant select on world_v2.world_head,world_v2.opening_seed,world_v2.runtime_opening_admission,world_v2.runtime_admission_publication_permit,world_v2.runtime_admission_publication_revocation,world_v2.financial_posting_batch,world_v2.command_receipt,world_v2.command_submission,world_v2.runtime_read_seat to world_v2_industry_source_owner;
grant select(world_id,auth_subject,country_id,office_id,team_id,authorization_version,active)on world_v2.current_commit_authorization to world_v2_industry_source_owner;
grant update(world_version)on world_v2.world_head to world_v2_industry_source_owner;
grant update(seed_id)on world_v2.runtime_opening_admission to world_v2_industry_source_owner;
grant update(authorization_id)on world_v2.runtime_admission_publication_permit to world_v2_industry_source_owner;
do $$declare t text;begin foreach t in array array['opening_seed','runtime_opening_admission','runtime_read_seat','financial_posting_batch','command_receipt','command_submission']loop
 execute format('create policy %I on world_v2.%I for select to world_v2_industry_source_owner using(current_user=''world_v2_industry_source_owner''and world_id=current_setting(''econmind.industry_source_world'',true))','industry_source_owner_'||t,t);
 execute format('create policy %I on world_v2.%I as restrictive for select to world_v2_industry_source_owner using(current_user=''world_v2_industry_source_owner''and world_id=current_setting(''econmind.industry_source_world'',true))','industry_source_world_fence_'||t,t);
end loop;end;$$;
create policy industry_source_admission_lock on world_v2.runtime_opening_admission for update to world_v2_industry_source_owner using(current_user='world_v2_industry_source_owner'and world_id=current_setting('econmind.industry_source_world',true))with check(false);
create policy industry_source_admission_lock_world_fence on world_v2.runtime_opening_admission as restrictive for update to world_v2_industry_source_owner using(current_user='world_v2_industry_source_owner'and world_id=current_setting('econmind.industry_source_world',true))with check(false);
create function world_v2.industry_source_admission(p_world text)returns world_v2.runtime_opening_admission language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;p world_v2.runtime_admission_publication_permit%rowtype;begin
 perform set_config('econmind.industry_source_world',p_world,true);
 select * into a from world_v2.runtime_opening_admission where world_id=p_world for share;
 if not found then raise exception 'INDUSTRY_MISSING_IMMUTABLE_ADMISSION'using errcode='55000';end if;
 select * into p from world_v2.runtime_admission_publication_permit q where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref and q.world_id=a.world_id and q.seed_id=a.seed_id and q.seed_fingerprint=a.seed_fingerprint and q.model_version=a.model_version and q.replay_binding=a.replay_binding and a.admitted_at_real>=q.valid_from and a.admitted_at_real<q.valid_until for share;
 if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=p.authorization_id)then raise exception 'INDUSTRY_ADMISSION_MISSING_OR_REVOKED'using errcode='55000';end if;
 return a;
end;$$;
alter function world_v2.industry_source_admission(text)owner to world_v2_industry_source_owner;
create function world_v2.register_postwar_industry_originals(p_world text,p_country text,p_checksums text,p_originals jsonb)
returns table(registration_ref text,facility_id text,document_sha256 text)language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;s world_v2.opening_seed%rowtype;root jsonb;o jsonb;op jsonb;receipt jsonb;manifest jsonb;raw jsonb;f jsonb;recipe jsonb;recipe_count integer;plans jsonb;technology jsonb;license jsonb;regions jsonb;financial jsonb;roster jsonb;recon jsonb;pair text[];book jsonb;asset jsonb;liability jsonb;opening_batch jsonb;asset_leg jsonb;liability_leg jsonb;asset_id text;liability_id text;claim_id text;source_country text;key text;path text;expected text;body jsonb;body_text text;ref text;existing world_v2.postwar_industry_original%rowtype;country_rows integer;effective name;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_industry_source_publisher','MEMBER')or pg_has_role(effective,'world_v2_industry_source_owner','MEMBER')then raise exception 'INDUSTRY_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 perform 1 from world_v2.world_head where world_id=p_world for share;if not found then raise exception 'INDUSTRY_WORLD_MISSING'using errcode='55000';end if;
 a:=world_v2.industry_source_admission(p_world);
 select * into strict s from world_v2.opening_seed where world_id=p_world;
 if s.seed_fingerprint<>a.seed_fingerprint or s.seed_fingerprint<>'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||s.canonical_payload,'UTF8')),'hex')then raise exception 'INDUSTRY_CANONICAL_SEED_MISMATCH'using errcode='23514';end if;
 root:=s.canonical_payload::jsonb;
 select count(*),jsonb_agg(x)->0 into country_rows,o from jsonb_array_elements(root->'sources')x where (x->>'canonicalPayload')::jsonb->>'schemaVersion'='postwar-operating-genesis-seed-source-v1';
 if country_rows<>1 then raise exception 'INDUSTRY_EXACT_OPERATING_SOURCE_REQUIRED'using errcode='23514';end if;op:=(o->>'canonicalPayload')::jsonb;
 select (d->>'bytes')::jsonb into receipt from jsonb_array_elements(op->'carrier'->'documents')d where d->>'documentId'=op->'carrier'->>'physicalServiceReceiptDocumentId'and d->>'sha256'=encode(sha256(convert_to(d->>'bytes','UTF8')),'hex');
 if receipt is null or receipt->>'worldId' is distinct from p_world or receipt->>'seedId' is distinct from s.seed_id or receipt->>'ownerOriginalSha256' is distinct from '57bfdec38a9a400991cb26362a99d33d7a81c8e6258c03460185e51501fb5ac5'then raise exception 'INDUSTRY_PHYSICAL_OWNER_ORIGINAL_MISSING'using errcode='23514';end if;
 if receipt->>'sourceChecksumsSha256' is distinct from '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315' or receipt->>'mappingSha256' is distinct from 'd2811910a9021e68fabe894504701d6dc8d88e362fc2354b0c826e3446456253' or receipt->>'mappingSha256' is distinct from op->'carrier'->'sourcePins'->>'mapping' or encode(sha256(convert_to(op->'carrier'->'selectedSource'->>'regionMappingBytes','UTF8')),'hex') is distinct from op->'carrier'->'sourcePins'->>'regionMapping' or receipt->>'sourceChecksumsSha256' is distinct from encode(sha256(convert_to(p_checksums,'UTF8')),'hex')then raise exception 'INDUSTRY_CHECKSUMS_ORIGINAL_DRIFT'using errcode='23514';end if;manifest:=p_checksums::jsonb;
 if jsonb_typeof(p_originals) is distinct from 'object'or(select count(*)from jsonb_object_keys(p_originals))<>6 then raise exception 'INDUSTRY_FIXED_ORIGINAL_SET_REQUIRED'using errcode='23514';end if;
 foreach key in array array['facilities','recipes','production-plans','technology-proposals','license-proposals','commodity-catalog']loop
  path:='data/'||key||'.json';select count(*),min(x->>'sha256')into country_rows,expected from jsonb_array_elements(manifest)x where x->>'path'=path;
  if country_rows<>1 or jsonb_typeof(p_originals->key) is distinct from 'string'or expected is distinct from encode(sha256(convert_to(p_originals->>key,'UTF8')),'hex')then raise exception 'INDUSTRY_PINNED_ORIGINAL_DRIFT:%',key using errcode='23514';end if;
 end loop;
 regions:=(op->'carrier'->'selectedSource'->>'regionMappingBytes')::jsonb;
 select count(distinct x->>'countryId'),min(x->>'countryId')into country_rows,source_country from jsonb_array_elements((p_originals->>'facilities')::jsonb)x join jsonb_array_elements(regions->'mappings')m on m->>'sourceRegionId'=x->>'regionId'where m->>'coreCountryId'=p_country;
 if country_rows<>1 then raise exception 'INDUSTRY_EXACT_COUNTRY_MAPPING_REQUIRED'using errcode='23514';end if;
 select x into financial from jsonb_array_elements(root->'sources')x where (x->>'canonicalPayload')::jsonb->>'schemaVersion'='adopted-financial-opening-source-v2';
 select c->'roster'into roster from jsonb_array_elements(((financial->>'canonicalPayload')::jsonb)->'assembly'->'countries')c where c->>'countryId'=p_country;
 select c into recon from jsonb_array_elements(((financial->>'canonicalPayload')::jsonb)->'reconciliations')c where c->>'countryId'=p_country;
 if roster is null or recon is null then raise exception 'INDUSTRY_EXACT_FINANCIAL_SOURCE_REQUIRED'using errcode='23514';end if;
 -- Classification is derived only from actual original opening pair and its
 -- source contract; caller supplies no payment-account / classification flag.
 foreach pair slice 1 in array array[['OPERATOR_BANK_DEPOSIT','BUSINESS_DEPOSIT','businessBankDeposits','operator'],['HOUSEHOLD_BANK_DEPOSIT','HOUSEHOLD_DEPOSIT','householdBankDeposits','households']]loop
  select d->'localBookValue'into book from jsonb_array_elements(recon->'denominations')d where d->>'field'=pair[3];
  if book is null then raise exception 'INDUSTRY_DEPOSIT_SOURCE_VALUE_MISSING'using errcode='23514';end if;
  if(book->>'amount')::numeric=0 then continue;end if;
  asset_id:='ACCOUNT_'||upper(encode(sha256(convert_to(world_v2.canonical_json(jsonb_build_array(p_world,p_country,pair[2]||'_ASSET',book->>'currency')),'UTF8')),'hex'));
  liability_id:='ACCOUNT_'||upper(encode(sha256(convert_to(world_v2.canonical_json(jsonb_build_array(p_world,p_country,pair[2]||'_LIABILITY',book->>'currency')),'UTF8')),'hex'));
  claim_id:='CLAIM_'||upper(encode(sha256(convert_to(world_v2.canonical_json(jsonb_build_array(p_world,p_country,pair[2],book->>'currency')),'UTF8')),'hex'));
  select b into opening_batch from jsonb_array_elements(root->'financialBatches')b where b->>'sourceId'=financial->>'sourceId'and exists(select 1 from jsonb_array_elements(b->'legs')l where l->'account'->>'accountId'=asset_id);
  select l into asset_leg from jsonb_array_elements(opening_batch->'legs')l where l->'account'->>'accountId'=asset_id;
  select l into liability_leg from jsonb_array_elements(opening_batch->'legs')l where l->'account'->>'accountId'=liability_id;
  asset:=asset_leg->'account';liability:=liability_leg->'account';
  if asset is null or liability is null or asset->>'accountClass'<>'ASSET'or liability->>'accountClass'<>'LIABILITY'or asset->>'ownerId'<>roster->>pair[4]or liability->>'ownerId'<>roster->>'bank'or asset->>'countryId'<>p_country or liability->>'countryId'<>p_country or asset->>'claimId'<>claim_id or liability->>'claimId'<>claim_id or asset->>'counterpartyEntityId'<>roster->>'bank'or liability->>'counterpartyEntityId'<>roster->>pair[4]or asset->>'currency'<>book->>'currency'or liability->>'currency'<>book->>'currency'or asset_leg->>'direction'<>'DEBIT'or liability_leg->>'direction'<>'CREDIT'or asset_leg->>'counterpartLegId'<>liability_leg->>'legId'or liability_leg->>'counterpartLegId'<>asset_leg->>'legId'or(asset_leg->'amount'->>'amount')::numeric<>(book->>'amount')::numeric or(liability_leg->'amount'->>'amount')::numeric<>(book->>'amount')::numeric then raise exception 'INDUSTRY_EXACT_ORIGINAL_DEPOSIT_PAIR_REQUIRED'using errcode='23514';end if;
  insert into world_v2.postwar_industry_deposit_original values(p_world,p_country,pair[1],s.seed_fingerprint,a.admission_ref,financial->>'sourceId',financial->>'payloadHash',asset,liability,(book->>'amount')::numeric)on conflict(world_id,country_id,kind)do nothing;
  if not exists(select 1 from world_v2.postwar_industry_deposit_original d where d.world_id=p_world and d.country_id=p_country and d.kind=pair[1]and d.seed_fingerprint=s.seed_fingerprint and d.admission_ref=a.admission_ref and d.asset_account=asset and d.liability_account=liability and d.opening_amount=(book->>'amount')::numeric and d.financial_source_id=financial->>'sourceId'and d.financial_source_hash=financial->>'payloadHash')then raise exception 'INDUSTRY_DEPOSIT_REGISTRATION_CONFLICT'using errcode='23514';end if;
 end loop;
 for f in select x from jsonb_array_elements((p_originals->>'facilities')::jsonb)x where x->>'countryId'=source_country and x->>'recipeId'is not null loop
  select count(*),jsonb_agg(x)->0 into recipe_count,recipe from jsonb_array_elements((p_originals->>'recipes')::jsonb)x where x->>'id'=f->>'recipeId';
  if recipe_count<>1 or recipe->>'commodityId'<>f->>'commodityId'then raise exception 'INDUSTRY_EXACT_RECIPE_ORIGINAL_REQUIRED'using errcode='23514';end if;
  select coalesce(jsonb_agg(x),'[]')into plans from jsonb_array_elements((p_originals->>'production-plans')::jsonb)x where x->>'countryId'=source_country and x->>'commodityId'=f->>'commodityId';
  select coalesce(jsonb_agg(x),'[]')into technology from jsonb_array_elements((p_originals->>'technology-proposals')::jsonb)x where x->>'countryId'=source_country and x->>'scope'=f->>'commodityId';
  select coalesce(jsonb_agg(x),'[]')into license from jsonb_array_elements((p_originals->>'license-proposals')::jsonb)x where x->>'countryId'=source_country and x->>'id'=f->>'licenseIdProposal';
  select m into raw from jsonb_array_elements(regions->'mappings')m where m->>'coreCountryId'=p_country and m->>'sourceRegionId'=f->>'regionId';
  if raw is null then raise exception 'INDUSTRY_FACILITY_REGION_ORIGINAL_MISSING'using errcode='23514';end if;
  body:=jsonb_build_object('schemaVersion','postwar-industry-originals.v1','worldId',p_world,'countryId',p_country,'locationId',raw->>'normalizedRegionId','operatorId',roster->>'operator','bankId',roster->>'bank','sourceFacility',f,'recipe',recipe,'productionPlans',plans,'technologyProposals',technology,'licenseProposals',license,'commodityCatalog',(p_originals->>'commodity-catalog')::jsonb,'ownerRule','D04_5_1_EXISTING_OP_SITE_SCOPE_NOT_TRANSFERABLE_TECH_LICENSE','ownerOriginalSha256',receipt->>'ownerOriginalSha256','sourcePointers',jsonb_build_object('facilities','data/facilities.json[id]','recipes','data/recipes.json[id]','productionPlans','data/production-plans.json[countryId,commodityId]'),'dataNature','PINNED_SOURCE_ORIGINALS_NOT_OPERATION_APPROVAL');body_text:=body::text;
  ref:='INDUSTRY_REG_'||upper(encode(sha256(convert_to(jsonb_build_array(p_world,p_country,f->>'id',s.seed_fingerprint,a.admission_ref,encode(sha256(convert_to(body_text,'UTF8')),'hex'))::text,'UTF8')),'hex'));
  insert into world_v2.postwar_industry_original(world_id,country_id,facility_id,registration_ref,seed_fingerprint,admission_ref,operating_source_id,operating_source_hash,checksums_sha256,owner_original_sha256,document_text,document_sha256)values(p_world,p_country,f->>'id',ref,s.seed_fingerprint,a.admission_ref,o->>'sourceId',o->>'payloadHash',receipt->>'sourceChecksumsSha256',receipt->>'ownerOriginalSha256',body_text,encode(sha256(convert_to(body_text,'UTF8')),'hex'))on conflict on constraint postwar_industry_original_pkey do nothing;
  select * into strict existing from world_v2.postwar_industry_original d where d.world_id=p_world and d.country_id=p_country and d.facility_id=f->>'id';if existing.registration_ref<>ref then raise exception 'INDUSTRY_ORIGINAL_REGISTRATION_CONFLICT'using errcode='23514';end if;
  return query select ref,f->>'id',existing.document_sha256;
 end loop;
end;$$;
alter function world_v2.register_postwar_industry_originals(text,text,text,jsonb)owner to world_v2_industry_source_owner;
create function world_v2.lock_postwar_industry_original(p_world text,p_country text,p_facility text,p_version bigint,p_sequence bigint)
returns table(document_text text,document_sha256 text,registration_ref text,seed_fingerprint text,admission_ref text)language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;r world_v2.postwar_industry_original%rowtype;effective name;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if has_schema_privilege(effective,'world_v2','CREATE')or not pg_has_role(effective,'world_v2_industry_source_reader','MEMBER')or pg_has_role(effective,'world_v2_industry_source_publisher','MEMBER')or pg_has_role(effective,'world_v2_industry_source_owner','MEMBER')or exists(select 1 from pg_roles where rolname=effective and(rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication))then raise exception 'INDUSTRY_FIXED_READER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 perform 1 from world_v2.world_head where world_id=p_world and world_version=p_version and event_sequence=p_sequence for share;if not found then raise exception 'INDUSTRY_SOURCE_HEAD_STALE'using errcode='40001';end if;
 a:=world_v2.industry_source_admission(p_world);
 select * into r from world_v2.postwar_industry_original d where d.world_id=p_world and d.country_id=p_country and d.facility_id=p_facility and d.seed_fingerprint=a.seed_fingerprint and d.admission_ref=a.admission_ref for share;
 if not found then raise exception 'INDUSTRY_ORIGINAL_NOT_REGISTERED'using errcode='55000';end if;
 if exists(select 1 from world_v2.postwar_industry_original_revocation v where v.world_id=p_world and v.registration_ref=r.registration_ref)then raise exception 'INDUSTRY_ORIGINAL_REVOKED'using errcode='55000';end if;
 return query select r.document_text,r.document_sha256,r.registration_ref,r.seed_fingerprint,r.admission_ref;
end;$$;
alter function world_v2.lock_postwar_industry_original(text,text,text,bigint,bigint)owner to world_v2_industry_source_owner;
create function world_v2.revoke_postwar_industry_original(p_world text,p_ref text,p_reason text)returns void language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;begin effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_industry_source_publisher','MEMBER')then raise exception 'INDUSTRY_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 perform 1 from world_v2.postwar_industry_original where world_id=p_world and registration_ref=p_ref for update;if not found then raise exception 'INDUSTRY_ORIGINAL_NOT_REGISTERED'using errcode='55000';end if;
 insert into world_v2.postwar_industry_original_revocation values(p_world,p_ref,p_reason,clock_timestamp())on conflict do nothing;
end;$$;
alter function world_v2.revoke_postwar_industry_original(text,text,text)owner to world_v2_industry_source_owner;
-- Same immutable original-source profile used to recognize Core ASSET deposits.
-- Read the COMPLETE committed own-cutoff prefix, not a later replenished balance.
create function world_v2.industry_source_deposit_balance(p_world text,p_account jsonb,p_opening numeric,p_cutoff bigint)
returns numeric language plpgsql security definer set search_path=pg_catalog as $$
declare delta numeric;begin
 perform set_config('econmind.industry_source_world',p_world,true);
 if(select count(*)from world_v2.financial_posting_batch b where b.world_id=p_world and b.world_version_after<=p_cutoff)>10000 then raise exception 'INDUSTRY_COMPLETE_FINANCIAL_PREFIX_CAPACITY'using errcode='54000';end if;
 if exists(select 1 from world_v2.financial_posting_batch b where b.world_id=p_world and b.world_version_after<=p_cutoff and not exists(select 1 from world_v2.command_receipt r where r.world_id=b.world_id and r.command_id=b.causation_command_id and r.outcome='COMMITTED'and r.world_version_before=b.world_version_before and r.world_version_after=b.world_version_after and r.event_ids=b.event_ids and r.sim_time=b.sim_time))then return null;end if;
 if exists(select 1 from world_v2.financial_posting_batch b cross join lateral jsonb_array_elements(b.canonical_payload::jsonb->'legs')l where b.world_id=p_world and b.world_version_after<=p_cutoff and l->'account'->>'accountId'=p_account->>'accountId'and l->'account' is distinct from p_account)then return null;end if;
 select coalesce(sum(case l->>'direction'when 'DEBIT'then(l->'amount'->>'amount')::numeric else -(l->'amount'->>'amount')::numeric end),0)into delta from world_v2.financial_posting_batch b cross join lateral jsonb_array_elements(b.canonical_payload::jsonb->'legs')l where b.world_id=p_world and b.world_version_after<=p_cutoff and l->'account'=p_account;
 return p_opening+delta;
end;$$;
alter function world_v2.industry_source_deposit_balance(text,jsonb,numeric,bigint)owner to world_v2_industry_source_owner;
create function world_v2.industry_source_paid_deposit(p_world text,p_country text,p_operator text,p_facility text,p_batch text,p_fingerprint text,p_expense text,p_payment text,p_cutoff bigint)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;b world_v2.financial_posting_batch%rowtype;registered world_v2.postwar_industry_original%rowtype;p world_v2.postwar_industry_deposit_original%rowtype;q world_v2.postwar_industry_deposit_original%rowtype;legs jsonb;expense jsonb;payment jsonb;liability jsonb;recipient_asset jsonb;recipient_liability jsonb;revenue jsonb;remaining jsonb;cost numeric;asset_balance numeric;liability_balance numeric;cutoff bigint;
begin
 perform set_config('econmind.industry_source_world',p_world,true);
 perform 1 from world_v2.world_head where world_id=p_world and world_version>=p_cutoff for share;if not found then return false;end if;
 a:=world_v2.industry_source_admission(p_world);
 select * into registered from world_v2.postwar_industry_original d where d.world_id=p_world and d.country_id=p_country and d.facility_id=p_facility and d.seed_fingerprint=a.seed_fingerprint and d.admission_ref=a.admission_ref for share;
 if not found or exists(select 1 from world_v2.postwar_industry_original_revocation v where v.world_id=p_world and v.registration_ref=registered.registration_ref)then return false;end if;
 select * into b from world_v2.financial_posting_batch where world_id=p_world and batch_id=p_batch and batch_fingerprint=p_fingerprint and world_version_after<=p_cutoff;
 if not found or not exists(select 1 from world_v2.command_receipt r where r.world_id=b.world_id and r.command_id=b.causation_command_id and r.outcome='COMMITTED'and r.world_version_before=b.world_version_before and r.world_version_after=b.world_version_after and r.event_ids=b.event_ids and r.sim_time=b.sim_time)then return false;end if;
 legs:=b.canonical_payload::jsonb->'legs';
 select x into expense from jsonb_array_elements(legs)x where x->>'legId'=p_expense;
 select x into payment from jsonb_array_elements(legs)x where x->>'legId'=p_payment;
 if expense is null or payment is null or expense->>'direction' is distinct from 'DEBIT'or expense->'account'->>'accountClass' is distinct from 'EXPENSE'or expense->'account'->>'ownerId' is distinct from p_operator or expense->'account'->>'countryId' is distinct from p_country or expense->'account'->'claimId'is distinct from 'null'::jsonb or expense->'account'->'counterpartyEntityId'is distinct from 'null'::jsonb or payment->>'direction'is distinct from 'CREDIT'or expense->'amount' is distinct from payment->'amount'or expense->>'counterpartyAccountId' is distinct from payment->'account'->>'accountId'or payment->>'counterpartyAccountId'is distinct from expense->'account'->>'accountId'then return false;end if;
 cost:=(payment->'amount'->>'amount')::numeric;if cost<=0 then return false;end if;
 select * into p from world_v2.postwar_industry_deposit_original d where d.world_id=p_world and d.country_id=p_country and d.kind='OPERATOR_BANK_DEPOSIT'and d.seed_fingerprint=a.seed_fingerprint and d.admission_ref=a.admission_ref and d.asset_account=payment->'account'and d.asset_account->>'ownerId'=p_operator;
 if not found then return false;end if;
 select x into liability from jsonb_array_elements(legs)x where x->'account'=p.liability_account and x->>'direction'='DEBIT'and x->'amount'=payment->'amount';
 if liability is null then return false;end if;
 -- Both the funding cutoff and current target prefix must conserve the real
 -- claim; a later positive deposit cannot cure an originally unfunded payment.
 foreach cutoff in array array[b.world_version_after,p_cutoff]loop
  asset_balance:=world_v2.industry_source_deposit_balance(p_world,p.asset_account,p.opening_amount,cutoff);
  liability_balance:=world_v2.industry_source_deposit_balance(p_world,p.liability_account,-p.opening_amount,cutoff);
  if asset_balance is null or liability_balance is null or asset_balance<0 or asset_balance<>-liability_balance then return false;end if;
 end loop;
 select coalesce(jsonb_agg(x),'[]')into remaining from jsonb_array_elements(legs)x where x->>'legId'not in(p_expense,p_payment,liability->>'legId');
 if jsonb_array_length(remaining)=1 then
  revenue:=remaining->0;
  return revenue->>'direction'='CREDIT'and revenue->'account'->>'accountClass'='REVENUE'and revenue->'account'->>'ownerId'=p.liability_account->>'ownerId'and revenue->'account'->>'countryId'=p_country and revenue->'account'->>'currency'=payment->'amount'->>'currency'and revenue->'account'->'claimId'='null'::jsonb and revenue->'account'->'counterpartyEntityId'='null'::jsonb and revenue->'amount'=payment->'amount'and revenue->>'counterpartyAccountId'=p.liability_account->>'accountId'and liability->>'counterpartyAccountId'=revenue->'account'->>'accountId';
 end if;
 if jsonb_array_length(remaining)<>3 then return false;end if;
 select * into q from world_v2.postwar_industry_deposit_original d where d.world_id=p_world and d.country_id=p_country and d.seed_fingerprint=a.seed_fingerprint and d.admission_ref=a.admission_ref and d.asset_account->>'ownerId'<>p_operator and d.liability_account->>'ownerId'=p.liability_account->>'ownerId'and exists(select 1 from jsonb_array_elements(remaining)x where x->'account'=d.asset_account and x->>'direction'='DEBIT'and x->'amount'=payment->'amount');
 if not found then return false;end if;
 foreach cutoff in array array[b.world_version_after,p_cutoff]loop
  asset_balance:=world_v2.industry_source_deposit_balance(p_world,q.asset_account,q.opening_amount,cutoff);
  liability_balance:=world_v2.industry_source_deposit_balance(p_world,q.liability_account,-q.opening_amount,cutoff);
  if asset_balance is null or liability_balance is null or asset_balance<0 or asset_balance<>-liability_balance then return false;end if;
 end loop;
 select x into recipient_asset from jsonb_array_elements(remaining)x where x->'account'=q.asset_account and x->>'direction'='DEBIT'and x->'amount'=payment->'amount';
 select x into recipient_liability from jsonb_array_elements(remaining)x where x->'account'=q.liability_account and x->>'direction'='CREDIT'and x->'amount'=payment->'amount';
 select x into revenue from jsonb_array_elements(remaining)x where x->>'direction'='CREDIT'and x->'account'->>'accountClass'='REVENUE'and x->'account'->>'ownerId'=q.asset_account->>'ownerId'and x->'account'->>'countryId'=p_country and x->'account'->>'currency'=payment->'amount'->>'currency'and x->'account'->'claimId'='null'::jsonb and x->'account'->'counterpartyEntityId'='null'::jsonb and x->'amount'=payment->'amount';
 return recipient_asset is not null and recipient_liability is not null and revenue is not null and recipient_asset->>'counterpartyAccountId'=revenue->'account'->>'accountId'and revenue->>'counterpartyAccountId'=recipient_asset->'account'->>'accountId'and liability->>'counterpartyAccountId'=q.liability_account->>'accountId'and recipient_liability->>'counterpartyAccountId'=p.liability_account->>'accountId';
end;$$;
alter function world_v2.industry_source_paid_deposit(text,text,text,text,text,text,text,text,bigint)owner to world_v2_industry_source_owner;
revoke all on function world_v2.industry_source_deposit_balance(text,jsonb,numeric,bigint),world_v2.industry_source_paid_deposit(text,text,text,text,text,text,text,text,bigint)from public;

create or replace function world_v2.validate_production_final_receipt_and_funding()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare op jsonb; cost numeric; country text; count_found bigint;
begin
  perform set_config('econmind.industry_source_world',new.world_id,true);
  op := new.canonical_payload::jsonb->'evidence'->'operating'->'payload';
  cost := world_v2.production_decimal(op->'settledCost'->'amount');
  select country_id into country from world_v2.command_submission where world_id = new.world_id and command_id = new.causation_command_id;
  if not exists (select 1 from world_v2.command_receipt r where r.world_id = new.world_id and r.command_id = new.causation_command_id
    and r.outcome = 'COMMITTED' and r.transition_id = new.causation_command_id
    and r.world_version_before = new.world_version_before and r.world_version_after = new.world_version_after
    and r.event_ids = new.event_ids and r.sim_time = new.sim_time) then
    raise exception 'Production requires its complete committed final receipt in the same transaction' using errcode = '23514';
  end if;
  select count(*) into count_found from world_v2.financial_posting_batch b,
    lateral jsonb_array_elements(b.canonical_payload::jsonb->'legs') expense
    where b.world_id = new.world_id and b.batch_id = op->>'fundingBatchId' and b.batch_fingerprint = op->>'fundingFingerprint'
      and b.world_version_after <= new.world_version_after
      and expense->>'legId' = op->>'costLegId' and expense->>'direction' = 'DEBIT'
      and expense->'account'->>'accountClass' = 'EXPENSE' and expense->'account'->>'ownerId' = op->>'operatorId'
      and expense->'account'->>'countryId' = country and expense->'amount'->>'currency' = op->'settledCost'->>'currency'
      and world_v2.production_decimal(expense->'amount'->'amount') = cost
      and (select count(*) from jsonb_array_elements(b.canonical_payload::jsonb->'legs') cash
        where cash->>'direction' = 'CREDIT' and (cash->'account'->>'accountClass' in ('CASH','DEPOSIT') or (cash->'account'->>'accountClass'='ASSET' and world_v2.industry_source_paid_deposit(new.world_id,country,op->>'operatorId',op->>'facilityRef',b.batch_id,b.batch_fingerprint,op->>'costLegId',cash->>'legId',new.world_version_before)))
          and cash->'account'->>'ownerId' = op->>'operatorId' and cash->'account'->>'countryId' = country
          and cash->'amount'->>'currency' = op->'settledCost'->>'currency') = 1
      and exists (select 1 from jsonb_array_elements(b.canonical_payload::jsonb->'legs') cash
        where cash->>'direction' = 'CREDIT' and (cash->'account'->>'accountClass' in ('CASH','DEPOSIT') or (cash->'account'->>'accountClass'='ASSET' and world_v2.industry_source_paid_deposit(new.world_id,country,op->>'operatorId',op->>'facilityRef',b.batch_id,b.batch_fingerprint,op->>'costLegId',cash->>'legId',new.world_version_before)))
          and cash->'account'->>'ownerId' = op->>'operatorId' and cash->'account'->>'countryId' = country
          and cash->'amount'->>'currency' = op->'settledCost'->>'currency'
          and world_v2.production_decimal(cash->'amount'->'amount') = cost)
      and exists (select 1 from world_v2.command_receipt r where r.world_id = b.world_id and r.command_id = b.causation_command_id
        and r.outcome = 'COMMITTED' and r.world_version_before = b.world_version_before and r.world_version_after = b.world_version_after
        and r.event_ids = b.event_ids and r.sim_time = b.sim_time);
  if count_found <> 1 then raise exception 'Production requires actual committed matching OP expense and cash funding' using errcode = '23514'; end if;
  return new;
end;
$$;

alter function world_v2.validate_production_final_receipt_and_funding()owner to world_v2_industry_source_owner;
revoke all on function world_v2.validate_production_final_receipt_and_funding()from public;

revoke all on function world_v2.industry_source_admission(text),world_v2.register_postwar_industry_originals(text,text,text,jsonb),world_v2.lock_postwar_industry_original(text,text,text,bigint,bigint),world_v2.revoke_postwar_industry_original(text,text,text)from public;
grant execute on function world_v2.register_postwar_industry_originals(text,text,text,jsonb),world_v2.revoke_postwar_industry_original(text,text,text)to world_v2_industry_source_publisher;
grant execute on function world_v2.lock_postwar_industry_original(text,text,text,bigint,bigint)to world_v2_industry_source_reader;
revoke create on schema world_v2 from world_v2_industry_source_owner;
commit;
