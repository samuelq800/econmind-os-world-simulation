-- Candidate only. Depends on finance-budget-custody.sql. No production
-- install, account membership, new signing key or budget/money balance table.
-- The publisher accepts selectors/pins ONLY and derives immutable H0 input
-- from the unique admitted stored seed. Runtime never reads canonical_payload.
begin;
grant create on schema world_v2 to world_v2_finance_budget_source_owner;
create table world_v2.finance_budget_capacity_original(
 world_id text not null,country_id text not null,capacity_ref text not null unique,
 seed_fingerprint text not null,admission_ref text not null,canonical_seed_sha256 text not null,
 source_text text not null check(octet_length(source_text)<=65536),
 source_sha256 text not null check(source_sha256=encode(sha256(convert_to(source_text,'UTF8')),'hex')),
 primary key(world_id,country_id),foreign key(world_id,seed_fingerprint)references world_v2.opening_seed(world_id,seed_fingerprint)
);
create table world_v2.finance_budget_capacity_revocation(
 capacity_ref text primary key references world_v2.finance_budget_capacity_original(capacity_ref),reason_ref text not null check(length(reason_ref)between 1 and 256),revoked_at timestamptz not null default clock_timestamp()
);
alter table world_v2.finance_budget_capacity_original owner to world_v2_finance_budget_source_owner;
alter table world_v2.finance_budget_capacity_revocation owner to world_v2_finance_budget_source_owner;
revoke all on world_v2.finance_budget_capacity_original,world_v2.finance_budget_capacity_revocation from public;
create trigger budget_capacity_original_immutable before update or delete on world_v2.finance_budget_capacity_original for each row execute function world_v2.finance_budget_original_immutable();
create trigger budget_capacity_revocation_immutable before update or delete on world_v2.finance_budget_capacity_revocation for each row execute function world_v2.finance_budget_original_immutable();
create trigger budget_capacity_original_truncate_immutable before truncate on world_v2.finance_budget_capacity_original for each statement execute function world_v2.finance_budget_original_immutable();
create trigger budget_capacity_revocation_truncate_immutable before truncate on world_v2.finance_budget_capacity_revocation for each statement execute function world_v2.finance_budget_original_immutable();
create function world_v2.publish_finance_budget_capacity(p_world text,p_country text,p_seed_fingerprint text,p_admission_ref text,p_canonical_sha256 text)
returns text language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;s world_v2.opening_seed%rowtype;a world_v2.runtime_opening_admission%rowtype;root json;fs json;os json;financial json;operating json;doc json;original json;roster jsonb;country jsonb;asset jsonb;mirror jsonb;funding jsonb;total numeric;quantity bigint;body jsonb;bytes text;raw_hash text;row_hash text;ref text;old world_v2.finance_budget_capacity_original%rowtype;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_finance_budget_source_publisher','MEMBER')or pg_has_role(effective,'world_v2_finance_budget_source_reader','MEMBER')or pg_has_role(effective,'world_v2_finance_budget_source_owner','MEMBER')then raise exception 'BUDGET_CONTROLLED_CAPACITY_PUBLISHER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.finance_budget_source_world',p_world,true);
 select * into strict s from world_v2.opening_seed x where x.world_id=p_world and x.seed_fingerprint=p_seed_fingerprint and x.opening_world_version=0;
 raw_hash:=encode(sha256(convert_to(s.canonical_payload,'UTF8')),'hex');
 if raw_hash<>p_canonical_sha256 or s.seed_fingerprint<>'sha256:'||encode(sha256(convert_to(E'SHA-256\n'||s.canonical_payload,'UTF8')),'hex')then raise exception 'BUDGET_CAPACITY_CANONICAL_HASH_MISMATCH'using errcode='23514';end if;
 select * into strict a from world_v2.runtime_opening_admission x where x.world_id=s.world_id and x.seed_id=s.seed_id and x.seed_fingerprint=s.seed_fingerprint and x.admission_ref=p_admission_ref and x.replay_binding=s.replay_binding;
 if not exists(select 1 from world_v2.runtime_admission_publication_permit q where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref and q.world_id=a.world_id and q.seed_id=a.seed_id and q.seed_fingerprint=a.seed_fingerprint and q.model_version=a.model_version and q.replay_binding=a.replay_binding and a.admitted_at_real>=q.valid_from and a.admitted_at_real<q.valid_until and not exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=q.authorization_id))then raise exception 'BUDGET_CAPACITY_ACTUAL_ADMISSION_REQUIRED'using errcode='42501';end if;
 -- Offline only: preserve textual JSON while traversing the large seed; do not
 -- construct a whole-world JSONB tree. Convert only bounded derived values.
 root:=s.canonical_payload::json;
 select x into strict fs from json_array_elements(root->'sources')x where(x->>'canonicalPayload')::json->>'schemaVersion'='adopted-financial-opening-source-v2';
 select x into strict os from json_array_elements(root->'sources')x where(x->>'canonicalPayload')::json->>'schemaVersion'='postwar-operating-genesis-seed-source-v1';
 if fs->>'payloadHash'<>'sha256:'||encode(sha256(convert_to(E'SHA-256\n{"payload":'||(fs->>'canonicalPayload')||'}','UTF8')),'hex')or os->>'payloadHash'<>'sha256:'||encode(sha256(convert_to(E'SHA-256\n{"payload":'||(os->>'canonicalPayload')||'}','UTF8')),'hex')then raise exception 'BUDGET_CAPACITY_SOURCE_PAYLOAD_HASH_MISMATCH'using errcode='23514';end if;
 financial:=(fs->>'canonicalPayload')::json;operating:=(os->>'canonicalPayload')::json;
 select x->'roster'into strict roster from json_array_elements(financial->'assembly'->'countries')x where x->>'countryId'=p_country;
 select d into strict doc from json_array_elements(operating->'carrier'->'documents')d where d->>'documentId'='POSTWAR_FINANCIAL_OFFICE_ORIGINALS';
 if doc->>'sha256'<>encode(sha256(convert_to(doc->>'bytes','UTF8')),'hex')then raise exception 'BUDGET_CAPACITY_ORIGINAL_HASH_MISMATCH'using errcode='23514';end if;
 original:=(doc->>'bytes')::json;
 if original->>'financialSourceId'<>fs->>'sourceId'or original->>'financialSourcePayloadHash'<>fs->>'payloadHash'or original->>'worldId'<>p_world or original->>'seedId'<>s.seed_id then raise exception 'BUDGET_CAPACITY_FINANCIAL_ORIGINAL_MISMATCH'using errcode='23514';end if;
 select x into strict country from json_array_elements(original->'contract'->'countries')x where x->>'countryId'=p_country;
 select l into strict asset from json_array_elements(root->'financialBatches')b cross join lateral json_array_elements(b->'legs')l where b->>'sourceId'=fs->>'sourceId'and l->>'direction'='DEBIT'and l->'account'->>'worldId'=p_world and l->'account'->>'countryId'=p_country and l->'account'->>'ownerId'=roster->>'government'and l->'account'->>'counterpartyEntityId'=roster->>'centralBank'and l->'account'->>'accountClass'='ASSET'and l->'account'->>'currency'=country->>'localCurrency'and l->'account'->>'claimId'is not null;
 select l into strict mirror from json_array_elements(root->'financialBatches')b cross join lateral json_array_elements(b->'legs')l where b->>'sourceId'=fs->>'sourceId'and l->>'legId'=asset->>'counterpartLegId'and l->>'counterpartLegId'=asset->>'legId'and l->>'direction'='CREDIT'and l->'account'->>'worldId'=p_world and l->'account'->>'countryId'=p_country and l->'account'->>'ownerId'=roster->>'centralBank'and l->'account'->>'counterpartyEntityId'=roster->>'government'and l->'account'->>'accountClass'='LIABILITY'and l->'account'->>'currency'=country->>'localCurrency'and l->'account'->>'claimId'=asset->'account'->>'claimId'and l->'amount'->>'amount'=asset->'amount'->>'amount';
 if exists(select 1 from json_array_elements(operating->'carrier'->'facts'->'funding')f where f->>'accountId'=asset->'account'->>'accountId'and(f->>'countryId'<>p_country or f->>'payerEntityId'<>roster->>'government'or f->>'currency'<>country->>'localCurrency'or(f->>'ceilingAmount')::numeric<0))then raise exception 'BUDGET_CAPACITY_FUNDING_SCOPE_MISMATCH'using errcode='23514';end if;
 select coalesce(jsonb_agg(f order by f->>'fundingId'),'[]'::jsonb),coalesce(sum((f->>'ceilingAmount')::numeric),0),count(*)into funding,total,quantity from json_array_elements(operating->'carrier'->'facts'->'funding')f where f->>'accountId'=asset->'account'->>'accountId';
 if total>(asset->'amount'->>'amount')::numeric then raise exception 'BUDGET_CAPACITY_SOURCE_OVERBOOKED'using errcode='23514';end if;
 body:=jsonb_build_object('schemaVersion','finance-budget-capacity-source-v1','worldId',p_world,'countryId',p_country,'seedId',s.seed_id,'seedFingerprint',s.seed_fingerprint,'admissionRef',a.admission_ref,'modelVersion',a.model_version,'openingWorldVersion','0','governmentEntityId',roster->>'government','centralBankEntityId',roster->>'centralBank','financialSourceId',fs->>'sourceId','canonicalSeedSha256','sha256:'||raw_hash,'financialOriginalsSha256','sha256:'||(doc->>'sha256'),'treasury',jsonb_build_object('assetAccount',asset->'account','liabilityAccount',mirror->'account','assetLegId',asset->>'legId','liabilityLegId',mirror->>'legId','assetAmount',asset->'amount'->>'amount','liabilityAmount',mirror->'amount'->>'amount'),'openingFunding',jsonb_build_object('totalAmount',trim_scale(total)::text,'recordCount',quantity::text,'recordsSha256','sha256:'||encode(sha256(convert_to(funding::text,'UTF8')),'hex')));
 bytes:=body::text;row_hash:=encode(sha256(convert_to(bytes,'UTF8')),'hex');ref:='BUDGET_CAPACITY_SOURCE_'||upper(encode(sha256(convert_to(s.seed_fingerprint||E'\n'||p_country,'UTF8')),'hex'));
 select * into old from world_v2.finance_budget_capacity_original c where c.world_id=p_world and c.country_id=p_country;
 if found then if old.capacity_ref<>ref or old.source_sha256<>row_hash or old.seed_fingerprint<>s.seed_fingerprint or old.admission_ref<>a.admission_ref then raise exception 'BUDGET_CAPACITY_IMMUTABLE_CONFLICT'using errcode='23514';end if;return old.source_sha256;end if;
 insert into world_v2.finance_budget_capacity_original values(p_world,p_country,ref,s.seed_fingerprint,a.admission_ref,raw_hash,bytes,row_hash);return row_hash;
end;$$;
create function world_v2.read_finance_budget_capacity(p_world text,p_country text,p_envelope text,p_period text,p_worker text,p_at timestamptz)
returns table(capacity_ref text,source_text text,source_sha256 text,canonical_seed_sha256 text)
language plpgsql security definer set search_path=pg_catalog as $$
declare h record;c world_v2.finance_budget_capacity_original%rowtype;subject uuid;
begin
 subject:=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;if subject is null then raise exception 'BUDGET_CAPACITY_VERIFIED_SUBJECT_REQUIRED'using errcode='42501';end if;
 -- Existing fixed source function performs the actual nonprivileged role,
 -- exact current Finance seat/capability/entitlement/admission/lease locks.
 select * into strict h from world_v2.lock_finance_budget_policy(p_world,p_country,p_envelope,p_period,p_worker,p_at,subject);
 select * into c from world_v2.finance_budget_capacity_original x where x.world_id=p_world and x.country_id=p_country and x.seed_fingerprint=h.seed_fingerprint and x.admission_ref=h.admission_ref for share;
 if not found or exists(select 1 from world_v2.finance_budget_capacity_revocation r where r.capacity_ref=c.capacity_ref)then raise exception 'BUDGET_CAPACITY_UNAVAILABLE_OR_REVOKED'using errcode='42501';end if;
 return query select c.capacity_ref,c.source_text,c.source_sha256,c.canonical_seed_sha256;
end;$$;
create function world_v2.revoke_finance_budget_capacity(p_world text,p_country text,p_reason text)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;c world_v2.finance_budget_capacity_original%rowtype;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_finance_budget_source_publisher','MEMBER')or pg_has_role(effective,'world_v2_finance_budget_source_reader','MEMBER')then raise exception 'BUDGET_CONTROLLED_CAPACITY_PUBLISHER_REQUIRED'using errcode='42501';end if;
 select * into strict c from world_v2.finance_budget_capacity_original x where x.world_id=p_world and x.country_id=p_country for update;
 insert into world_v2.finance_budget_capacity_revocation values(c.capacity_ref,p_reason,clock_timestamp())on conflict do nothing;
end;$$;
alter function world_v2.publish_finance_budget_capacity(text,text,text,text,text)owner to world_v2_finance_budget_source_owner;
alter function world_v2.read_finance_budget_capacity(text,text,text,text,text,timestamptz)owner to world_v2_finance_budget_source_owner;
alter function world_v2.revoke_finance_budget_capacity(text,text,text)owner to world_v2_finance_budget_source_owner;
revoke all on function world_v2.publish_finance_budget_capacity(text,text,text,text,text),world_v2.read_finance_budget_capacity(text,text,text,text,text,timestamptz),world_v2.revoke_finance_budget_capacity(text,text,text)from public;
grant execute on function world_v2.publish_finance_budget_capacity(text,text,text,text,text),world_v2.revoke_finance_budget_capacity(text,text,text)to world_v2_finance_budget_source_publisher;
grant execute on function world_v2.read_finance_budget_capacity(text,text,text,text,text,timestamptz)to world_v2_finance_budget_source_reader;
revoke create on schema world_v2 from world_v2_finance_budget_source_owner;
commit;
