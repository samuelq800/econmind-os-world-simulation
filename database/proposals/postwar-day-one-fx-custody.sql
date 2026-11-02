-- SOURCE-ONLY candidate, not in the production migration manifest. No LOGIN,
-- memberships, mandate, opening admission, balances, lease or World activation.
-- Only the fixed publisher's real Core-derived 70-country document may enter.
begin;
do $$declare n text;begin
 foreach n in array array['world_v2_day_one_fx_source_owner','world_v2_day_one_fx_source_publisher','world_v2_day_one_fx_source_reader']loop
  if not exists(select 1 from pg_roles where rolname=n)then execute format('create role %I nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication',n);end if;
  if exists(select 1 from pg_roles where rolname=n and(rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))then raise exception 'FX_UNSAFE_FIXED_ROLE'using errcode='42501';end if;
 end loop;
end;$$;
grant usage,create on schema world_v2 to world_v2_day_one_fx_source_owner;
grant usage on schema world_v2 to world_v2_day_one_fx_source_reader,world_v2_day_one_fx_source_publisher;
create table world_v2.postwar_day_one_fx_source_original(
 world_id text primary key,registration_ref text not null unique,seed_id text not null,
 seed_fingerprint text not null,admission_ref text not null,canonical_seed_sha256 text not null check(canonical_seed_sha256~'^[a-f0-9]{64}$'),
 publication_text text not null check(octet_length(publication_text)<=262144),publication_sha256 text not null check(publication_sha256=encode(sha256(convert_to(publication_text,'UTF8')),'hex')),
 policy_sha256 text not null check(policy_sha256='339fcf3c74e4e92a814f46f1f9d63abebeb23fd16e94885996267e73e5a29893'),
 user_receipt_sha256 text not null check(user_receipt_sha256='0d2f7a21172e5f2e157d7a8a95d22853104cfc9e0ba9f1281e2473c8ceb01fec'),
 issuer_role name not null check(issuer_role='world_v2_day_one_fx_source_publisher'),
 foreign key(world_id,seed_fingerprint)references world_v2.opening_seed(world_id,seed_fingerprint),
 foreign key(admission_ref)references world_v2.runtime_opening_admission(admission_ref)
);
create table world_v2.postwar_day_one_fx_quote_original(
 world_id text not null references world_v2.postwar_day_one_fx_source_original(world_id),country_id text not null,
 quote_ref text not null,source_revision text not null,
 quote_text text not null check(octet_length(quote_text)<=4096),
 quote_text_sha256 text not null check(quote_text_sha256=encode(sha256(convert_to(quote_text,'UTF8')),'hex')),
 primary key(world_id,country_id),unique(world_id,country_id,quote_ref)
);
create table world_v2.postwar_day_one_fx_source_revocation(
 world_id text primary key references world_v2.postwar_day_one_fx_source_original(world_id),
 registration_ref text not null references world_v2.postwar_day_one_fx_source_original(registration_ref),
 reason_ref text not null check(length(reason_ref)between 1 and 256),revoked_at timestamptz not null default clock_timestamp()
);
create table world_v2.postwar_day_one_fx_quote_revocation(
 world_id text not null,country_id text not null,quote_ref text not null,
 reason_ref text not null check(length(reason_ref)between 1 and 256),revoked_at timestamptz not null default clock_timestamp(),
 primary key(world_id,country_id,quote_ref),foreign key(world_id,country_id,quote_ref)references world_v2.postwar_day_one_fx_quote_original(world_id,country_id,quote_ref)
);
do $$declare t text;begin
 foreach t in array array['postwar_day_one_fx_source_original','postwar_day_one_fx_quote_original','postwar_day_one_fx_source_revocation','postwar_day_one_fx_quote_revocation']loop
  execute format('alter table world_v2.%I owner to world_v2_day_one_fx_source_owner',t);
  execute format('alter table world_v2.%I enable row level security',t);
  execute format('alter table world_v2.%I force row level security',t);
  execute format('revoke all on world_v2.%I from public',t);
  execute format('create policy fx_owner_exact on world_v2.%I for all to world_v2_day_one_fx_source_owner using(current_user=''world_v2_day_one_fx_source_owner''and world_id=current_setting(''econmind.day_one_fx_world'',true))with check(current_user=''world_v2_day_one_fx_source_owner''and world_id=current_setting(''econmind.day_one_fx_world'',true))',t);
  execute format('create trigger fx_immutable before update or delete on world_v2.%I for each row execute function world_v2.reject_authoritative_history_mutation()',t);
  execute format('create trigger fx_no_truncate before truncate on world_v2.%I for each statement execute function world_v2.reject_authoritative_history_mutation()',t);
 end loop;
end;$$;
-- The inaccessible owner alone may read the full seed during offline sealing.
-- Online reader/publisher receive only fixed function EXECUTE, never SELECT.
grant select on world_v2.world_head,world_v2.opening_seed,world_v2.runtime_opening_admission,world_v2.runtime_admission_publication_permit,world_v2.runtime_admission_publication_revocation,world_v2.current_commit_authorization,world_v2.runtime_read_seat,world_v2.projection_entitlement to world_v2_day_one_fx_source_owner;
grant update(world_version)on world_v2.world_head to world_v2_day_one_fx_source_owner;
grant update(seed_id)on world_v2.runtime_opening_admission to world_v2_day_one_fx_source_owner;
grant update(authorization_id)on world_v2.runtime_admission_publication_permit to world_v2_day_one_fx_source_owner;
grant update(authorization_version)on world_v2.current_commit_authorization to world_v2_day_one_fx_source_owner;
grant update(active)on world_v2.projection_entitlement to world_v2_day_one_fx_source_owner;
do $$declare t text;begin
 foreach t in array array['world_head','opening_seed','runtime_opening_admission','current_commit_authorization','runtime_read_seat','projection_entitlement']loop
  execute format('create policy fx_owner_read on world_v2.%I for select to world_v2_day_one_fx_source_owner using(current_user=''world_v2_day_one_fx_source_owner''and world_id=current_setting(''econmind.day_one_fx_world'',true))',t);
  execute format('create policy fx_owner_world_fence on world_v2.%I as restrictive for select to world_v2_day_one_fx_source_owner using(current_user=''world_v2_day_one_fx_source_owner''and world_id=current_setting(''econmind.day_one_fx_world'',true))',t);
 end loop;
 foreach t in array array['world_head','runtime_opening_admission','current_commit_authorization','projection_entitlement']loop
  execute format('create policy fx_owner_lock on world_v2.%I for update to world_v2_day_one_fx_source_owner using(current_user=''world_v2_day_one_fx_source_owner''and world_id=current_setting(''econmind.day_one_fx_world'',true))with check(false)',t);
  execute format('create policy fx_owner_lock_fence on world_v2.%I as restrictive for update to world_v2_day_one_fx_source_owner using(current_user=''world_v2_day_one_fx_source_owner''and world_id=current_setting(''econmind.day_one_fx_world'',true))with check(false)',t);
 end loop;
end;$$;
create function world_v2.postwar_day_one_fx_require_role(p_kind text)returns void language plpgsql security invoker set search_path=pg_catalog as $$
declare effective name;required name;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 required:=case p_kind when 'READER'then 'world_v2_day_one_fx_source_reader' when 'PUBLISHER'then 'world_v2_day_one_fx_source_publisher'else null end;
 if required is null or not pg_has_role(effective,required,'MEMBER')or pg_has_role(effective,'world_v2_day_one_fx_source_owner','MEMBER')or
 (p_kind='READER'and pg_has_role(effective,'world_v2_day_one_fx_source_publisher','MEMBER'))or
 (p_kind='PUBLISHER'and pg_has_role(effective,'world_v2_day_one_fx_source_reader','MEMBER'))or
 exists(select 1 from pg_roles r where r.rolname=effective and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))
 then raise exception 'FX_FIXED_SCOPED_ROLE_REQUIRED'using errcode='42501';end if;
end;$$;
alter function world_v2.postwar_day_one_fx_require_role(text)owner to world_v2_day_one_fx_source_owner;
create function world_v2.postwar_day_one_fx_admission(p_world text)returns world_v2.runtime_opening_admission
language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;p world_v2.runtime_admission_publication_permit%rowtype;begin
 if p_world is distinct from 'WORLD_POSTWAR_GCU_OPENING_20261029_V1'then raise exception 'FX_FIXED_NEW_WORLD_REQUIRED'using errcode='22023';end if;
 perform set_config('econmind.day_one_fx_world',p_world,true);
 select * into a from world_v2.runtime_opening_admission x where x.world_id=p_world for share;
 if not found or a.seed_id<>'SEED_POSTWAR_GCU_OPENING_20261029_V1'or a.seed_fingerprint<>'sha256:cfc55796562b44bd616f33082cbbafd9dbd43d58733a24ac550339cbc8376274'then raise exception 'FX_ACTUAL_NEW_WORLD_ADMISSION_REQUIRED'using errcode='55000';end if;
 select * into p from world_v2.runtime_admission_publication_permit q where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref and q.world_id=a.world_id and q.seed_id=a.seed_id and q.seed_fingerprint=a.seed_fingerprint and q.model_version=a.model_version and q.replay_binding=a.replay_binding and a.admitted_at_real>=q.valid_from and a.admitted_at_real<q.valid_until for share;
 if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=p.authorization_id)then raise exception 'FX_ADMISSION_REVOKED_OR_MISSING'using errcode='55000';end if;
 if not exists(select 1 from world_v2.opening_seed s where s.world_id=a.world_id and s.seed_id=a.seed_id and s.seed_fingerprint=a.seed_fingerprint and s.replay_binding=a.replay_binding and s.replay_binding::jsonb->>'modelVersion'=a.model_version)then raise exception 'FX_ACTUAL_IMMUTABLE_SEED_REQUIRED'using errcode='55000';end if;
 return a;
end;$$;
alter function world_v2.postwar_day_one_fx_admission(text)owner to world_v2_day_one_fx_source_owner;
-- Quotes are flat string records. This exact ASCII DTO normalization is also
-- used for the fixed Core SHA-256 preimage; it does not canonicalize arbitrary data.
create function world_v2.postwar_day_one_fx_quote_canonical(p jsonb)returns text language plpgsql immutable set search_path=pg_catalog as $$
declare v text;begin
 if jsonb_typeof(p)is distinct from 'object'or exists(select 1 from jsonb_each(p)x where jsonb_typeof(x.value)is distinct from 'string')then raise exception 'FX_FLAT_STRING_QUOTE_REQUIRED'using errcode='23514';end if;
 select '{'||string_agg(to_json(x.key)::text||':'||to_json(x.value#>>'{}')::text,','order by x.key collate "C")||'}'into v from jsonb_each(p)x;
 return v;
end;$$;
alter function world_v2.postwar_day_one_fx_quote_canonical(jsonb)owner to world_v2_day_one_fx_source_owner;
create function world_v2.publish_postwar_day_one_fx_originals(p_text text)
returns table(country_id text,registration_ref text,admission_ref text,source_revision text,quote_ref text)
language plpgsql security definer set search_path=pg_catalog as $$
declare d jsonb;e jsonb;q jsonb;a world_v2.runtime_opening_admission%rowtype;s world_v2.opening_seed%rowtype;r world_v2.postwar_day_one_fx_source_original%rowtype;ref text;digest text;qt text;qh text;head_version bigint;head_sequence bigint;begin
 perform world_v2.postwar_day_one_fx_require_role('PUBLISHER');
 if p_text is null or octet_length(p_text)>262144 then raise exception 'FX_BOUNDED_PUBLICATION_REQUIRED'using errcode='22023';end if;
 d:=p_text::jsonb;
 if jsonb_typeof(d)is distinct from 'object'or(select count(*)from jsonb_object_keys(d))<>9 or d->>'schemaVersion'is distinct from 'postwar-day-one-fx-custody-publication-v1'or d->>'worldId'is distinct from 'WORLD_POSTWAR_GCU_OPENING_20261029_V1'or d->>'seedId'is distinct from 'SEED_POSTWAR_GCU_OPENING_20261029_V1'or d->>'seedFingerprint'is distinct from 'sha256:cfc55796562b44bd616f33082cbbafd9dbd43d58733a24ac550339cbc8376274'then raise exception 'FX_EXACT_NEW_WORLD_DOCUMENT_REQUIRED'using errcode='23514';end if;
 if d->'retainedSources'is distinct from '{"POSTWAR_SUPPLY_SOURCE_02C3D68F539B5E945DFA99AA9BC4536FC4ACAD34":"sha256:3df2e5ffc29cf305fd6dd735551cf37caa87e4fddcad619fdbf17beaa208a799","SOURCE_GCU_BANK_67D45B1D13871199F315631C6E04333A":"sha256:232bbde072e731867226202eab44271014b65ed2485f9efaeae580f2f7e8aaca","SOURCE_POSTWAR_FINANCIAL_V1":"sha256:3e2c610a5884857e3075db8214848b8405176f6e5e9b6234f15c7a8b96db332e","SOURCE_POSTWAR_OPERATING_V1":"sha256:ba9ad8f6117d8bb8535cd6572b9092d25779add30e8050b35186606ec860e1cc"}'::jsonb or encode(sha256(convert_to(d->>'policyBytes','UTF8')),'hex')is distinct from '339fcf3c74e4e92a814f46f1f9d63abebeb23fd16e94885996267e73e5a29893'or encode(sha256(convert_to(d->>'userReceiptBytes','UTF8')),'hex')is distinct from '0d2f7a21172e5f2e157d7a8a95d22853104cfc9e0ba9f1281e2473c8ceb01fec'then raise exception 'FX_ACTUAL_POLICY_RECEIPT_AND_FOUR_SOURCE_PINS_REQUIRED'using errcode='23514';end if;
 perform set_config('econmind.day_one_fx_world',d->>'worldId',true);
 select h.world_version,h.event_sequence into head_version,head_sequence from world_v2.world_head h where h.world_id=d->>'worldId'for share;
 if not found then raise exception 'FX_ACTUAL_WORLD_HEAD_REQUIRED'using errcode='55000';end if;
 a:=world_v2.postwar_day_one_fx_admission(d->>'worldId');
 select * into strict s from world_v2.opening_seed x where x.world_id=a.world_id and x.seed_fingerprint=a.seed_fingerprint;
 if encode(sha256(convert_to(s.canonical_payload,'UTF8')),'hex')is distinct from d->>'canonicalSeedSha256'then raise exception 'FX_ACTUAL_CANONICAL_SEED_SHA_REQUIRED'using errcode='23514';end if;
 digest:=encode(sha256(convert_to(p_text,'UTF8')),'hex');ref:='FX_REG_'||upper(encode(sha256(convert_to(a.world_id||chr(10)||a.seed_fingerprint||chr(10)||a.admission_ref||chr(10)||digest,'UTF8')),'hex'));
 select * into r from world_v2.postwar_day_one_fx_source_original x where x.world_id=a.world_id for share;
 if found then
  if r.registration_ref<>ref or r.publication_sha256<>digest or r.admission_ref<>a.admission_ref then raise exception 'FX_IMMUTABLE_REGISTRATION_CONFLICT'using errcode='23514';end if;
 else
  if head_version<>0 or head_sequence<>0 then raise exception 'FX_INITIAL_REGISTRATION_REQUIRES_H0'using errcode='55000';end if;
  insert into world_v2.postwar_day_one_fx_source_original values(a.world_id,ref,s.seed_id,s.seed_fingerprint,a.admission_ref,d->>'canonicalSeedSha256',p_text,digest,'339fcf3c74e4e92a814f46f1f9d63abebeb23fd16e94885996267e73e5a29893','0d2f7a21172e5f2e157d7a8a95d22853104cfc9e0ba9f1281e2473c8ceb01fec','world_v2_day_one_fx_source_publisher');
 end if;
 if exists(select 1 from world_v2.postwar_day_one_fx_source_revocation x where x.registration_ref=ref)then raise exception 'FX_SOURCE_REVOKED'using errcode='55000';end if;
 if jsonb_typeof(d->'quotes')is distinct from 'array'or jsonb_array_length(d->'quotes')<>70 then raise exception 'FX_COMPLETE_70_QUOTES_REQUIRED'using errcode='23514';end if;
 for e in select value from jsonb_array_elements(d->'quotes')loop
  if jsonb_typeof(e)is distinct from 'object'or(select count(*)from jsonb_object_keys(e))<>1 or jsonb_typeof(e->'quoteText')is distinct from 'string'then raise exception 'FX_EXACT_QUOTE_ENVELOPE_REQUIRED'using errcode='23514';end if;
  qt:=e->>'quoteText';q:=qt::jsonb;qh:=encode(sha256(convert_to(qt,'UTF8')),'hex');
  if octet_length(qt)>4096 or qt is distinct from world_v2.postwar_day_one_fx_quote_canonical(q)or(select count(*)from jsonb_object_keys(q))<>25 or not(q ?& array['schemaVersion','policyVersion','worldId','seedFingerprint','countryId','localCurrency','localCurrencyPerGcu','governmentEntityId','centralBankEntityId','bankEntityId','dealerGcuAccountId','financialSourceId','financialSourcePayloadHash','gcuSourceId','gcuSourcePayloadHash','baselineFxVersion','baselineSourceSha256','policySha256','userReceiptSha256','validFromSimTime','validUntilSimTime','spreadBps','gcuQuantum','quoteRef','quoteSha256'])or
   q->>'schemaVersion'is distinct from 'postwar-day-one-fx-quote-v1'or q->>'policyVersion'is distinct from 'POSTWAR_DAY_ONE_FX_20261029_V1'or q->>'worldId'is distinct from a.world_id or q->>'seedFingerprint'is distinct from a.seed_fingerprint or q->>'countryId'!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or
   q->>'financialSourceId'is distinct from 'SOURCE_POSTWAR_FINANCIAL_V1'or q->>'financialSourcePayloadHash'is distinct from d->'retainedSources'->>'SOURCE_POSTWAR_FINANCIAL_V1'or q->>'gcuSourceId'is distinct from 'SOURCE_GCU_BANK_67D45B1D13871199F315631C6E04333A'or q->>'gcuSourcePayloadHash'is distinct from d->'retainedSources'->>'SOURCE_GCU_BANK_67D45B1D13871199F315631C6E04333A'or
   q->>'policySha256'is distinct from '339fcf3c74e4e92a814f46f1f9d63abebeb23fd16e94885996267e73e5a29893'or q->>'userReceiptSha256'is distinct from '0d2f7a21172e5f2e157d7a8a95d22853104cfc9e0ba9f1281e2473c8ceb01fec'or q->>'validFromSimTime'is distinct from '0'or q->>'validUntilSimTime'is distinct from '86400000'or q->>'spreadBps'is distinct from '0'or q->>'gcuQuantum'is distinct from '0.000001'or
   q->>'localCurrency'!~'^[A-Z]{3}$'or q->>'localCurrency'='GCU'or q->>'localCurrencyPerGcu'!~'^(0|[1-9][0-9]*)([.][0-9]{1,24})?$'or(q->>'localCurrencyPerGcu')::numeric<=0 or
   q->>'quoteSha256'is distinct from encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.postwar_day_one_fx_quote_canonical(q-'quoteSha256'),'UTF8')),'hex')or q->>'quoteRef'is distinct from 'DAY_ONE_FX_'||upper(left(encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.postwar_day_one_fx_quote_canonical(q-'quoteSha256'-'quoteRef'),'UTF8')),'hex'),48))
  then raise exception 'FX_FIXED_CANONICAL_QUOTE_MISMATCH'using errcode='23514';end if;
  insert into world_v2.postwar_day_one_fx_quote_original values(a.world_id,q->>'countryId',q->>'quoteRef','FX_REV_'||upper(qh),qt,qh)on conflict on constraint postwar_day_one_fx_quote_original_pkey do nothing;
  if not exists(select 1 from world_v2.postwar_day_one_fx_quote_original x where x.world_id=a.world_id and x.country_id=q->>'countryId'and x.quote_ref=q->>'quoteRef'and x.quote_text_sha256=qh)then raise exception 'FX_IMMUTABLE_QUOTE_CONFLICT'using errcode='23514';end if;
 end loop;
 if(select count(distinct ((x->>'quoteText')::jsonb->>'countryId'))from jsonb_array_elements(d->'quotes')x)<>70 then raise exception 'FX_DISTINCT_70_COUNTRIES_REQUIRED'using errcode='23514';end if;
 return query select q0.country_id,ref,a.admission_ref,q0.source_revision,q0.quote_ref from world_v2.postwar_day_one_fx_quote_original q0 where q0.world_id=a.world_id order by q0.country_id;
end;$$;
alter function world_v2.publish_postwar_day_one_fx_originals(text)owner to world_v2_day_one_fx_source_owner;
create function world_v2.lock_postwar_day_one_fx_original(p_world text,p_country text,p_seed text,p_quote text,p_at timestamptz)
returns table(registration_ref text,admission_ref text,seed_id text,seed_fingerprint text,source_revision text,quote_text text,quote_text_sha256 text,world_version text,event_sequence text)
language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;r world_v2.postwar_day_one_fx_source_original%rowtype;q world_v2.postwar_day_one_fx_quote_original%rowtype;hv bigint;hs bigint;begin
 perform world_v2.postwar_day_one_fx_require_role('READER');
 if p_country is null or p_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or p_at is null or not isfinite(p_at)then raise exception 'FX_EXACT_SOURCE_SCOPE_REQUIRED'using errcode='22023';end if;
 perform set_config('econmind.day_one_fx_world',p_world,true);
 select h.world_version,h.event_sequence into hv,hs from world_v2.world_head h where h.world_id=p_world for share;
 if not found then raise exception 'FX_ACTUAL_WORLD_HEAD_REQUIRED'using errcode='55000';end if;
 a:=world_v2.postwar_day_one_fx_admission(p_world);
 select * into r from world_v2.postwar_day_one_fx_source_original x where x.world_id=p_world and x.seed_fingerprint=p_seed and x.admission_ref=a.admission_ref and x.seed_id=a.seed_id for share;
 if not found then raise exception 'FX_REGISTERED_SOURCE_REQUIRED'using errcode='55000';end if;
 if exists(select 1 from world_v2.postwar_day_one_fx_source_revocation x where x.registration_ref=r.registration_ref)then raise exception 'FX_SOURCE_REVOKED'using errcode='55000';end if;
 select * into q from world_v2.postwar_day_one_fx_quote_original x where x.world_id=p_world and x.country_id=p_country and x.quote_ref=p_quote for share;
 if not found then raise exception 'FX_REGISTERED_QUOTE_REQUIRED'using errcode='55000';end if;
 if exists(select 1 from world_v2.postwar_day_one_fx_quote_revocation x where x.world_id=p_world and x.country_id=p_country and x.quote_ref=p_quote)then raise exception 'FX_QUOTE_REVOKED'using errcode='55000';end if;
 return query select r.registration_ref,r.admission_ref,r.seed_id,r.seed_fingerprint,q.source_revision,q.quote_text,q.quote_text_sha256,hv::text,hs::text;
end;$$;
alter function world_v2.lock_postwar_day_one_fx_original(text,text,text,text,timestamptz)owner to world_v2_day_one_fx_source_owner;
create function world_v2.revoke_postwar_day_one_fx_source(p_ref text,p_reason text)returns void language plpgsql security definer set search_path=pg_catalog as $$
declare r world_v2.postwar_day_one_fx_source_original%rowtype;begin
 perform world_v2.postwar_day_one_fx_require_role('PUBLISHER');
 perform set_config('econmind.day_one_fx_world','WORLD_POSTWAR_GCU_OPENING_20261029_V1',true);
 select * into r from world_v2.postwar_day_one_fx_source_original x where x.registration_ref=p_ref for update;
 if not found then raise exception 'FX_REGISTERED_SOURCE_REQUIRED'using errcode='23503';end if;
 insert into world_v2.postwar_day_one_fx_source_revocation values(r.world_id,r.registration_ref,p_reason,clock_timestamp())on conflict do nothing;
end;$$;
alter function world_v2.revoke_postwar_day_one_fx_source(text,text)owner to world_v2_day_one_fx_source_owner;
create function world_v2.revoke_postwar_day_one_fx_quote(p_world text,p_country text,p_quote text,p_reason text)returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform world_v2.postwar_day_one_fx_require_role('PUBLISHER');
 if p_world is distinct from 'WORLD_POSTWAR_GCU_OPENING_20261029_V1'then raise exception 'FX_FIXED_NEW_WORLD_REQUIRED'using errcode='22023';end if;
 perform set_config('econmind.day_one_fx_world',p_world,true);
 perform 1 from world_v2.postwar_day_one_fx_source_original x where x.world_id=p_world for share;
 perform 1 from world_v2.postwar_day_one_fx_quote_original x where x.world_id=p_world and x.country_id=p_country and x.quote_ref=p_quote for update;
 if not found then raise exception 'FX_REGISTERED_QUOTE_REQUIRED'using errcode='23503';end if;
 insert into world_v2.postwar_day_one_fx_quote_revocation values(p_world,p_country,p_quote,p_reason,clock_timestamp())on conflict do nothing;
end;$$;
alter function world_v2.revoke_postwar_day_one_fx_quote(text,text,text,text)owner to world_v2_day_one_fx_source_owner;
create function world_v2.lock_postwar_day_one_fx_current_authorization(p_world text,p_subject uuid,p_country text,p_office text,p_capability text)
returns table(auth_subject text,world_id text,country_id text,office_id text,capability text,team_id text,authorization_version text)
language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform world_v2.postwar_day_one_fx_require_role('READER');
 if p_office is distinct from 'FINANCE'or p_capability is distinct from 'FINANCE_TREASURY'then raise exception 'FX_EXACT_TREASURY_CAPABILITY_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.day_one_fx_world',p_world,true);
 perform 1 from world_v2.world_head h where h.world_id=p_world for share;
 perform world_v2.postwar_day_one_fx_admission(p_world);
 perform 1 from world_v2.projection_entitlement e where e.world_id=p_world and e.auth_subject=p_subject and e.active for share;
 return query select a.auth_subject::text,a.world_id,a.country_id,a.office_id,a.capability,a.team_id,a.authorization_version from world_v2.current_commit_authorization a
 where a.world_id=p_world and a.auth_subject=p_subject and a.country_id=p_country and a.office_id=p_office and a.capability=p_capability and a.active
 and not exists(select 1 from world_v2.current_commit_authorization other where other.world_id=a.world_id and other.auth_subject=a.auth_subject and other.active and(other.country_id<>a.country_id or other.team_id<>a.team_id or other.authorization_version<>a.authorization_version))
 and exists(select 1 from world_v2.runtime_read_seat s join world_v2.projection_entitlement e on e.world_id=s.world_id and e.auth_subject=s.auth_subject and e.authorization_version=s.authorization_revision and e.classification='OFFICE_PRIVATE'and e.scope_key='OFFICE_'||upper(encode(convert_to(s.country_id,'UTF8'),'hex'))||'_'||upper(encode(convert_to(s.office_id,'UTF8'),'hex'))and e.active and e.revoked_at is null where s.world_id=a.world_id and s.auth_subject=a.auth_subject and s.country_id=a.country_id and s.office_id=a.office_id and s.team_id=a.team_id and s.authorization_revision=a.authorization_version)
 for share of a;
end;$$;
alter function world_v2.lock_postwar_day_one_fx_current_authorization(text,uuid,text,text,text)owner to world_v2_day_one_fx_source_owner;
create function world_v2.lock_postwar_day_one_fx_revoked_authorization(p_world text,p_subject uuid,p_country text,p_office text)
returns table(present integer)language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform world_v2.postwar_day_one_fx_require_role('READER');
 if p_office is distinct from 'FINANCE'then raise exception 'FX_EXACT_TREASURY_OFFICE_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.day_one_fx_world',p_world,true);
 perform 1 from world_v2.world_head h where h.world_id=p_world for share;
 return query select 1 from world_v2.current_commit_authorization a where a.world_id=p_world and a.auth_subject=p_subject and a.country_id=p_country and a.office_id=p_office and a.active for share;
end;$$;
alter function world_v2.lock_postwar_day_one_fx_revoked_authorization(text,uuid,text,text)owner to world_v2_day_one_fx_source_owner;
create function world_v2.lock_postwar_day_one_fx_intake_binding(p_world text,p_subject uuid,p_country text,p_office text,p_seat text,p_revision text,p_capability text,p_scope text)
returns table(seat_ref text,team_id text,authorization_version text,admission_ref text,seed_id text,seed_fingerprint text,model_version text,world_version text,event_sequence text)
language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;begin
 perform world_v2.postwar_day_one_fx_require_role('READER');
 if p_office is distinct from 'FINANCE'or p_capability is distinct from 'FINANCE_TREASURY'or p_scope is distinct from 'OFFICE_'||upper(encode(convert_to(p_country,'UTF8'),'hex'))||'_46494E414E4345'then raise exception 'FX_EXACT_TREASURY_INTAKE_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.day_one_fx_world',p_world,true);
 perform 1 from world_v2.world_head h where h.world_id=p_world for share;
 a:=world_v2.postwar_day_one_fx_admission(p_world);
 return query select s.seat_ref,x.team_id,x.authorization_version,a.admission_ref,a.seed_id,a.seed_fingerprint,a.model_version,h.world_version::text,h.event_sequence::text
 from world_v2.runtime_read_seat s join world_v2.current_commit_authorization x on x.world_id=s.world_id and x.auth_subject=s.auth_subject and x.country_id=s.country_id and x.office_id=s.office_id and x.team_id=s.team_id and x.authorization_version=s.authorization_revision and x.active and x.capability=p_capability
 join world_v2.projection_entitlement e on e.world_id=s.world_id and e.auth_subject=s.auth_subject and e.authorization_version=s.authorization_revision and e.active and e.revoked_at is null and e.classification='OFFICE_PRIVATE'and e.scope_key=p_scope
 join world_v2.world_head h on h.world_id=s.world_id
 where s.world_id=p_world and s.auth_subject=p_subject and s.country_id=p_country and s.office_id=p_office and s.seat_ref=p_seat and s.authorization_revision=p_revision
 and not exists(select 1 from world_v2.current_commit_authorization other where other.world_id=s.world_id and other.auth_subject=s.auth_subject and other.active and(other.country_id<>s.country_id or other.team_id<>s.team_id or other.authorization_version<>s.authorization_revision))
 limit 2 for share of x,e;
end;$$;
alter function world_v2.lock_postwar_day_one_fx_intake_binding(text,uuid,text,text,text,text,text,text)owner to world_v2_day_one_fx_source_owner;
revoke all on function world_v2.lock_postwar_day_one_fx_intake_binding(text,uuid,text,text,text,text,text,text)from public;
grant execute on function world_v2.lock_postwar_day_one_fx_intake_binding(text,uuid,text,text,text,text,text,text)to world_v2_day_one_fx_source_reader;
revoke all on function world_v2.postwar_day_one_fx_require_role(text),world_v2.postwar_day_one_fx_admission(text),world_v2.postwar_day_one_fx_quote_canonical(jsonb),world_v2.publish_postwar_day_one_fx_originals(text),world_v2.lock_postwar_day_one_fx_original(text,text,text,text,timestamptz),world_v2.revoke_postwar_day_one_fx_source(text,text),world_v2.revoke_postwar_day_one_fx_quote(text,text,text,text),world_v2.lock_postwar_day_one_fx_current_authorization(text,uuid,text,text,text),world_v2.lock_postwar_day_one_fx_revoked_authorization(text,uuid,text,text)from public;
grant execute on function world_v2.publish_postwar_day_one_fx_originals(text),world_v2.revoke_postwar_day_one_fx_source(text,text),world_v2.revoke_postwar_day_one_fx_quote(text,text,text,text)to world_v2_day_one_fx_source_publisher;
grant execute on function world_v2.lock_postwar_day_one_fx_original(text,text,text,text,timestamptz),world_v2.lock_postwar_day_one_fx_current_authorization(text,uuid,text,text,text),world_v2.lock_postwar_day_one_fx_revoked_authorization(text,uuid,text,text)to world_v2_day_one_fx_source_reader;
revoke create on schema world_v2 from world_v2_day_one_fx_source_owner;
commit;
