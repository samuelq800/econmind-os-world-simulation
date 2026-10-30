-- SOURCE-ONLY unregistered candidate; no installation or role enrollment.
-- Requires official metadata/journal/opening seed and existing immutable
-- runtime admission + publication permit tables. No direct table grant to an
-- online reader. Test-only publication is deliberately not a formal Clock.
begin;
do $$declare n text;begin foreach n in array array['world_v2_beneficial_rent_source_owner','world_v2_beneficial_rent_source_publisher','world_v2_beneficial_rent_source_reader']loop
 if not exists(select 1 from pg_roles where rolname=n)then execute format('create role %I nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication',n);end if;
 if exists(select 1 from pg_roles where rolname=n and(rolsuper or rolbypassrls or rolcanlogin or rolcreatedb or rolcreaterole or rolreplication))then raise exception 'BENEFICIAL_RENT_UNSAFE_FIXED_ROLE'using errcode='42501';end if;
end loop;end;$$;
grant usage,create on schema world_v2 to world_v2_beneficial_rent_source_owner;
grant usage on schema world_v2 to world_v2_beneficial_rent_source_publisher,world_v2_beneficial_rent_source_reader;
create table world_v2.postwar_beneficial_rent_source(
 world_id text not null,country_id text not null,registration_ref text not null unique,
 seed_id text not null,seed_fingerprint text not null,parent_seed_fingerprint text not null,admission_ref text not null,
 canonical_seed_sha256 text not null,bundle_sha256 text not null,receipt_fingerprint text not null,receipt_bytes text not null,
 source_id text not null,source_payload_hash text not null,primary key(world_id,country_id)
);
create table world_v2.postwar_beneficial_rent_revocation(world_id text not null,registration_ref text primary key references world_v2.postwar_beneficial_rent_source(registration_ref),reason_ref text not null);
create table world_v2.postwar_beneficial_rent_publication(
 world_id text not null,country_id text not null,publication_ref text not null unique,
 registration_ref text not null references world_v2.postwar_beneficial_rent_source(registration_ref),
 command_id text not null,command_fingerprint text not null,worker_id text not null,
 clock_binding_ref text not null,clock_sim_time text not null,
 valid_from_real timestamptz not null,valid_until_real timestamptz not null,
 check(valid_until_real>valid_from_real),primary key(world_id,command_id)
);
create table world_v2.postwar_beneficial_rent_publication_revocation(world_id text not null,publication_ref text primary key references world_v2.postwar_beneficial_rent_publication(publication_ref),reason_ref text not null);
do $$declare t text;begin foreach t in array array['postwar_beneficial_rent_source','postwar_beneficial_rent_revocation','postwar_beneficial_rent_publication','postwar_beneficial_rent_publication_revocation']loop
 execute format('alter table world_v2.%I owner to world_v2_beneficial_rent_source_owner',t);
 execute format('alter table world_v2.%I enable row level security',t);execute format('alter table world_v2.%I force row level security',t);
 execute format('revoke all on world_v2.%I from public',t);
 execute format('create policy rent_source_read on world_v2.%I for select to world_v2_beneficial_rent_source_owner using(current_user=''world_v2_beneficial_rent_source_owner''and world_id=current_setting(''econmind.beneficial_rent_world'',true))',t);
 execute format('create policy rent_source_insert on world_v2.%I for insert to world_v2_beneficial_rent_source_owner with check(current_user=''world_v2_beneficial_rent_source_owner''and world_id=current_setting(''econmind.beneficial_rent_world'',true))',t);
 execute format('create policy rent_source_lock on world_v2.%I for update to world_v2_beneficial_rent_source_owner using(current_user=''world_v2_beneficial_rent_source_owner''and world_id=current_setting(''econmind.beneficial_rent_world'',true))with check(false)',t);
 execute format('create trigger rent_immutable before update or delete on world_v2.%I for each row execute function world_v2.reject_authoritative_history_mutation()',t);
 execute format('create trigger rent_no_truncate before truncate on world_v2.%I for each statement execute function world_v2.reject_authoritative_history_mutation()',t);
end loop;end;$$;
grant select on world_v2.world_head,world_v2.runtime_opening_admission,world_v2.runtime_admission_publication_permit,world_v2.runtime_admission_publication_revocation to world_v2_beneficial_rent_source_owner;
grant select(world_id,seed_id,seed_fingerprint,replay_binding,canonical_payload)on world_v2.opening_seed to world_v2_beneficial_rent_source_owner;
grant update(world_version)on world_v2.world_head to world_v2_beneficial_rent_source_owner;
grant update(seed_id)on world_v2.runtime_opening_admission to world_v2_beneficial_rent_source_owner;
grant update(authorization_id)on world_v2.runtime_admission_publication_permit to world_v2_beneficial_rent_source_owner;
-- Only the inaccessible definer gets exact canonical history columns. Official
-- ledger tables currently have no RLS; explicit world predicates in every
-- fixed query, not a caller GUC, are the operational boundary there.
grant select(event_id,event_type,schema_version,world_id,causation_command_id,correlation_id,world_version,event_sequence,sim_time,recorded_at_real,corrects_event_id,canonical_payload,payload_sha256,event_fingerprint)on world_v2.authoritative_event to world_v2_beneficial_rent_source_owner;
grant select(actor_id,auth_subject,canonical_payload,country_id,expected_world_version,command_fingerprint,command_id,idempotency_key,office_id,payload_sha256,schema_version,sim_time,submitted_at_real,command_type,world_id,correlation_id)on world_v2.command_submission to world_v2_beneficial_rent_source_owner;
grant select(world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,reason_code,transition_id,world_version_before,world_version_after,sim_time,event_ids,recorded_at_real)on world_v2.command_receipt to world_v2_beneficial_rent_source_owner;
grant select(world_id,batch_id,causation_command_id,canonical_payload,batch_fingerprint)on world_v2.financial_posting_batch to world_v2_beneficial_rent_source_owner;
grant select(world_id)on world_v2.inventory_posting to world_v2_beneficial_rent_source_owner;
do $$declare t text;begin foreach t in array array['world_head','runtime_opening_admission','opening_seed','authoritative_event','command_submission','command_receipt','financial_posting_batch','inventory_posting']loop
 execute format('create policy rent_owner_read on world_v2.%I for select to world_v2_beneficial_rent_source_owner using(current_user=''world_v2_beneficial_rent_source_owner''and world_id=current_setting(''econmind.beneficial_rent_world'',true))',t);
 execute format('create policy rent_owner_fence on world_v2.%I as restrictive for select to world_v2_beneficial_rent_source_owner using(current_user=''world_v2_beneficial_rent_source_owner''and world_id=current_setting(''econmind.beneficial_rent_world'',true))',t);
end loop;
foreach t in array array['world_head','runtime_opening_admission']loop
 execute format('create policy rent_owner_lock on world_v2.%I for update to world_v2_beneficial_rent_source_owner using(current_user=''world_v2_beneficial_rent_source_owner''and world_id=current_setting(''econmind.beneficial_rent_world'',true))with check(false)',t);
end loop;end;$$;
create function world_v2.beneficial_rent_role(p_required name)returns void language plpgsql security definer set search_path=pg_catalog as $$declare effective name;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,p_required,'MEMBER')or exists(select 1 from pg_roles where rolname=effective and(rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))or pg_has_role(effective,'world_v2_beneficial_rent_source_owner','MEMBER')or(p_required='world_v2_beneficial_rent_source_reader'and pg_has_role(effective,'world_v2_beneficial_rent_source_publisher','MEMBER'))then raise exception 'BENEFICIAL_RENT_FIXED_SEPARATED_ROLE_REQUIRED'using errcode='42501';end if;
end;$$;
create function world_v2.beneficial_rent_admission(p_world text)returns world_v2.runtime_opening_admission language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;p world_v2.runtime_admission_publication_permit%rowtype;begin
 if p_world is null or p_world!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'then return null;end if;perform set_config('econmind.beneficial_rent_world',p_world,true);
 perform 1 from world_v2.world_head where world_id=p_world for share;if not found then return null;end if;
 select * into a from world_v2.runtime_opening_admission where world_id=p_world for share;
 if not found or not exists(select 1 from world_v2.opening_seed s where s.world_id=p_world and s.seed_id=a.seed_id and s.seed_fingerprint=a.seed_fingerprint and s.replay_binding=a.replay_binding and s.replay_binding::jsonb->>'modelVersion'=a.model_version)then return null;end if;
 select * into p from world_v2.runtime_admission_publication_permit x where 'ADMISSION_'||upper(x.authorization_sha256)=a.admission_ref and x.world_id=p_world and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.replay_binding=a.replay_binding and x.model_version=a.model_version and a.admitted_at_real>=x.valid_from and a.admitted_at_real<x.valid_until for share;
 if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation v where v.authorization_id=p.authorization_id)then return null;end if;return a;
end;$$;
create function world_v2.register_postwar_beneficial_rent_source(p_world text,p_bundle text,p_sha text)returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;b jsonb;s world_v2.opening_seed%rowtype;r jsonb;o jsonb;n integer:=0;reg text;old world_v2.postwar_beneficial_rent_source%rowtype;begin
 perform world_v2.beneficial_rent_role('world_v2_beneficial_rent_source_publisher');a:=world_v2.beneficial_rent_admission(p_world);if a.world_id is null then raise exception 'BENEFICIAL_RENT_REAL_ADMISSION_REQUIRED'using errcode='55000';end if;
 if p_bundle is null or octet_length(p_bundle)>4194304 or p_sha is distinct from encode(sha256(convert_to(p_bundle,'UTF8')),'hex')then raise exception 'BENEFICIAL_RENT_EXACT_BUNDLE_REQUIRED'using errcode='23514';end if;b:=p_bundle::jsonb;
 if b->>'schemaVersion'<>'postwar-beneficial-housing-rent-source-v1'or b->>'worldId'<>p_world or b->>'seedId'<>a.seed_id or b->>'seedFingerprint'<>a.seed_fingerprint or jsonb_typeof(b->'receipts')<>'array'or jsonb_array_length(b->'receipts')not between 1 and 70 then raise exception 'BENEFICIAL_RENT_EXACT_ADMITTED_BUNDLE_REQUIRED'using errcode='23514';end if;
 select canonical_payload into strict s.canonical_payload from world_v2.opening_seed where world_id=p_world;
 for r in select value from jsonb_array_elements(b->'receipts')loop
  if r->>'countryId'!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or r->>'worldId'<>p_world or r->>'seedId'<>a.seed_id or r->>'parentSeedFingerprint'<>b->>'parentSeedFingerprint'or r->>'rentPaidAtOpening'<>'0'or r->>'rentAccruedAtOpening'<>'0'or r->>'newLegalClaims'<>'false'then raise exception 'BENEFICIAL_RENT_EXACT_UNPAID_RIGHTS_REQUIRED'using errcode='23514';end if;
  select (x->>'canonicalPayload')::jsonb into strict o from jsonb_array_elements(s.canonical_payload::jsonb->'sources')x where x->>'sourceId'=r->>'supplementalSourceId'and x->>'sourceVersion'='POSTWAR_BENEFICIAL_HOUSING_V1';
  if o->>'parentSeedFingerprint'<>b->>'parentSeedFingerprint'or o->>'countryId'<>r->>'countryId'or o->'leases'is distinct from r->'leases'or o->'groups'is distinct from r->'groups'or o->'subaccounts'is distinct from r->'subaccounts'or not exists(select 1 from jsonb_array_elements(s.canonical_payload::jsonb->'financialBatches')x where x->>'batchId'=r->>'reclassificationBatchId'and x->>'sourceId'=r->>'supplementalSourceId')then raise exception 'BENEFICIAL_RENT_ACTUAL_SEED_RIGHTS_AND_BATCH_REQUIRED'using errcode='23514';end if;
  reg:='BENEFICIAL_RENT_'||upper(encode(sha256(convert_to(jsonb_build_array(p_world,r->>'countryId',a.seed_fingerprint,p_sha)::text,'UTF8')),'hex'));
  insert into world_v2.postwar_beneficial_rent_source select p_world,r->>'countryId',reg,a.seed_id,a.seed_fingerprint,b->>'parentSeedFingerprint',a.admission_ref,encode(sha256(convert_to(s.canonical_payload,'UTF8')),'hex'),p_sha,r->>'fingerprint',r::text,r->>'supplementalSourceId',x->>'payloadHash'from jsonb_array_elements(s.canonical_payload::jsonb->'sources')x where x->>'sourceId'=r->>'supplementalSourceId'on conflict(world_id,country_id)do nothing;
  select * into strict old from world_v2.postwar_beneficial_rent_source where world_id=p_world and country_id=r->>'countryId';if old.registration_ref<>reg then raise exception 'BENEFICIAL_RENT_SOURCE_CONFLICT'using errcode='23514';end if;n:=n+1;
 end loop;
 if (select count(*)from world_v2.postwar_beneficial_rent_source x where x.world_id=p_world and x.bundle_sha256=p_sha)<>n then raise exception 'BENEFICIAL_RENT_COMPLETE_BUNDLE_REQUIRED'using errcode='23514';end if;return n;
end;$$;
create function world_v2.lock_postwar_beneficial_rent_header(p_world text,p_country text)returns setof world_v2.postwar_beneficial_rent_source language plpgsql security definer set search_path=pg_catalog as $$declare a world_v2.runtime_opening_admission%rowtype;r world_v2.postwar_beneficial_rent_source%rowtype;begin
 perform world_v2.beneficial_rent_role('world_v2_beneficial_rent_source_reader');a:=world_v2.beneficial_rent_admission(p_world);if a.world_id is null then return;end if;
 select * into r from world_v2.postwar_beneficial_rent_source x where x.world_id=p_world and x.country_id=p_country and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref for share;
 if not found or exists(select 1 from world_v2.postwar_beneficial_rent_revocation v where v.world_id=p_world and v.registration_ref=r.registration_ref)then return;end if;return next r;
end;$$;
-- Narrow publication is executable only in an explicitly isolated TEST_ONLY
-- World, with a frozen server-host clock binding. This creates no formal Clock
-- issuer/control registration and deliberately cannot authorize the cfc World.
create function world_v2.register_test_only_beneficial_rent_publication(p_world text,p_country text,p_command text,p_worker text,p_clock_ref text,p_clock_tick text,p_from timestamptz,p_until timestamptz)returns world_v2.postwar_beneficial_rent_publication language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;r world_v2.postwar_beneficial_rent_source%rowtype;c world_v2.command_submission%rowtype;h record;p world_v2.postwar_beneficial_rent_publication%rowtype;v jsonb;begin
 perform world_v2.beneficial_rent_role('world_v2_beneficial_rent_source_publisher');a:=world_v2.beneficial_rent_admission(p_world);
 if a.world_id is null or p_world!~'^WORLD_TEST_ONLY_'or p_clock_ref!~'^TEST_ONLY_[A-Z0-9_]+$'or p_clock_tick!~'^(0|[1-9][0-9]*)$'or p_worker is null or p_until<=p_from then raise exception 'BENEFICIAL_RENT_TEST_ONLY_FROZEN_CLOCK_BINDING_REQUIRED'using errcode='55000';end if;
 select * into strict h from world_v2.world_head where world_id=p_world;
 select * into strict r from world_v2.postwar_beneficial_rent_source where world_id=p_world and country_id=p_country for share;
 if r.admission_ref<>a.admission_ref or exists(select 1 from world_v2.postwar_beneficial_rent_revocation x where x.registration_ref=r.registration_ref)then raise exception 'BENEFICIAL_RENT_CURRENT_SOURCE_REQUIRED'using errcode='55000';end if;
 select * into strict c from world_v2.command_submission where world_id=p_world and command_id=p_command;
 v:=c.canonical_payload::jsonb;
 if c.command_type<>'POSTWAR_BENEFICIAL_HOUSING_RENT_V1'or c.office_id is not null or c.country_id<>p_country or c.expected_world_version<>h.world_version or c.sim_time::text<>p_clock_tick or v->>'genesisReceiptFingerprint'<>r.receipt_fingerprint or not exists(select 1 from jsonb_array_elements(r.receipt_bytes::jsonb->'leases')x where x->>'leaseId'=v->>'leaseId')then raise exception 'BENEFICIAL_RENT_EXACT_AUTOMATIC_PUBLICATION_REQUIRED'using errcode='23514';end if;
 insert into world_v2.postwar_beneficial_rent_publication values(p_world,p_country,'RENT_PUBLICATION_'||upper(encode(sha256(convert_to(c.command_fingerprint,'UTF8')),'hex')),r.registration_ref,c.command_id,c.command_fingerprint,p_worker,p_clock_ref,p_clock_tick,p_from,p_until)on conflict(world_id,command_id)do nothing;
 select * into strict p from world_v2.postwar_beneficial_rent_publication where world_id=p_world and command_id=p_command;if p.command_fingerprint<>c.command_fingerprint or p.worker_id<>p_worker or p.clock_binding_ref<>p_clock_ref or p.clock_sim_time<>p_clock_tick then raise exception 'BENEFICIAL_RENT_PUBLICATION_CONFLICT'using errcode='23514';end if;return p;
end;$$;
create function world_v2.beneficial_rent_prefix_data(p_world text)returns table(prefix jsonb,journal jsonb)language plpgsql security definer set search_path=pg_catalog as $$
declare h record;e jsonb;c jsonb;r jsonb;b jsonb;ec bigint;rc bigint;bc bigint;bytes bigint;begin
 select * into strict h from world_v2.world_head where world_id=p_world for share;
 select count(*)into ec from world_v2.authoritative_event where world_id=p_world;select count(*)into rc from world_v2.command_receipt where world_id=p_world and outcome='COMMITTED';
 if h.world_version>256 or h.event_sequence>256 or ec<>h.event_sequence or rc<>h.world_version or exists(select 1 from world_v2.inventory_posting where world_id=p_world)or exists(select 1 from world_v2.authoritative_event where world_id=p_world and octet_length(canonical_payload)>65536)or exists(select 1 from world_v2.command_submission where world_id=p_world and command_id in(select causation_command_id from world_v2.authoritative_event where world_id=p_world)and octet_length(canonical_payload)>16384)then raise exception 'BENEFICIAL_RENT_COMPLETE_BOUNDED_PREFIX_REQUIRED'using errcode='55000';end if;
 select coalesce(jsonb_agg(to_jsonb(q)order by q.sequence::bigint),'[]'::jsonb)into e from(select event_id,event_type,schema_version,world_id,causation_command_id,correlation_id,world_version::text as world_version,event_sequence::text as sequence,sim_time::text as sim_time,to_char(recorded_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')as recorded_at_real,corrects_event_id,canonical_payload,payload_sha256,event_fingerprint from world_v2.authoritative_event where world_id=p_world)q;
 select coalesce(jsonb_agg(to_jsonb(q)order by q.command_id),'[]'::jsonb)into c from(select actor_id,auth_subject::text as auth_subject,canonical_payload,country_id,expected_world_version::text as expected_world_version,command_fingerprint,command_id,idempotency_key,office_id,payload_sha256,schema_version,sim_time::text as sim_time,to_char(submitted_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')as submitted_at_real,command_type,world_id,correlation_id from world_v2.command_submission where world_id=p_world and command_id in(select causation_command_id from world_v2.authoritative_event where world_id=p_world union select command_id from world_v2.command_receipt where world_id=p_world and outcome='COMMITTED'))q;
 select coalesce(jsonb_agg(to_jsonb(q)order by q.world_version_after::bigint),'[]'::jsonb)into r from(select world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,reason_code,transition_id,world_version_before::text as world_version_before,world_version_after::text as world_version_after,sim_time::text as sim_time,event_ids,to_char(recorded_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')as recorded_at_real from world_v2.command_receipt where world_id=p_world and outcome='COMMITTED')q;
 select count(*),coalesce(sum(octet_length(canonical_payload)),0)into bc,bytes from world_v2.financial_posting_batch where world_id=p_world;
 if bc>512 or bytes>1048576 or exists(select 1 from world_v2.financial_posting_batch where world_id=p_world and octet_length(canonical_payload)>65536)then raise exception 'BENEFICIAL_RENT_COMPLETE_BOUNDED_JOURNAL_REQUIRED'using errcode='55000';end if;
 select coalesce(jsonb_agg(jsonb_build_object('causation_command_id',causation_command_id,'canonical_payload',canonical_payload,'fingerprint',batch_fingerprint)order by batch_id),'[]'::jsonb)into b from world_v2.financial_posting_batch where world_id=p_world;
 if octet_length(e::text)+octet_length(c::text)+octet_length(r::text)+bytes>1048576 or jsonb_array_length(c)<>h.world_version then raise exception 'BENEFICIAL_RENT_COMPLETE_BOUNDED_PREFIX_REQUIRED'using errcode='55000';end if;
 return query select jsonb_build_object('world_version',h.world_version::text,'event_sequence',h.event_sequence::text,'events',e,'commands',c,'receipts',r),jsonb_build_object('world_version',h.world_version::text,'event_sequence',h.event_sequence::text,'financial_batch_count',bc::text,'inventory_posting_count','0','financial_batches',b);
end;$$;
create function world_v2.lock_postwar_beneficial_rent_original(p_world text,p_country text,p_command text,p_fp text,p_observed timestamptz)
returns table(registration_ref text,world_id text,seed_id text,seed_fingerprint text,parent_seed_fingerprint text,canonical_seed_sha256 text,bundle_sha256 text,admission_ref text,receipt_fingerprint text,publication_ref text,command_fingerprint text,worker_id text,clock_binding_ref text,clock_sim_time text,world_version text,event_sequence text,prefix jsonb,journal jsonb)
language plpgsql security definer set search_path=pg_catalog as $$
declare s world_v2.postwar_beneficial_rent_source%rowtype;p world_v2.postwar_beneficial_rent_publication%rowtype;h record;d record;begin
 select * into s from world_v2.lock_postwar_beneficial_rent_header(p_world,p_country);if s.world_id is null then return;end if;
 select * into p from world_v2.postwar_beneficial_rent_publication x where x.world_id=p_world and x.country_id=p_country and x.command_id=p_command and x.command_fingerprint=p_fp and x.registration_ref=s.registration_ref and p_observed>=x.valid_from_real and p_observed<x.valid_until_real for share;
 if not found or exists(select 1 from world_v2.postwar_beneficial_rent_publication_revocation x where x.world_id=p_world and x.publication_ref=p.publication_ref)then return;end if;
 select * into strict h from world_v2.world_head x where x.world_id=p_world;select * into strict d from world_v2.beneficial_rent_prefix_data(p_world);
 return query select s.registration_ref,s.world_id,s.seed_id,s.seed_fingerprint,s.parent_seed_fingerprint,s.canonical_seed_sha256,s.bundle_sha256,s.admission_ref,s.receipt_fingerprint,p.publication_ref,p.command_fingerprint,p.worker_id,p.clock_binding_ref,p.clock_sim_time,h.world_version::text,h.event_sequence::text,d.prefix,d.journal;
end;$$;
create function world_v2.read_postwar_beneficial_rent_current(p_world text,p_country text)returns table(registration_ref text,world_id text,seed_id text,seed_fingerprint text,parent_seed_fingerprint text,canonical_seed_sha256 text,bundle_sha256 text,prefix jsonb,journal jsonb)
language plpgsql security definer set search_path=pg_catalog as $$declare s world_v2.postwar_beneficial_rent_source%rowtype;d record;begin
 select * into s from world_v2.lock_postwar_beneficial_rent_header(p_world,p_country);if s.world_id is null then return;end if;select * into strict d from world_v2.beneficial_rent_prefix_data(p_world);return query select s.registration_ref,s.world_id,s.seed_id,s.seed_fingerprint,s.parent_seed_fingerprint,s.canonical_seed_sha256,s.bundle_sha256,d.prefix,d.journal;
end;$$;
create function world_v2.revoke_postwar_beneficial_rent_source(p_world text,p_country text,p_reason text)returns void language plpgsql security definer set search_path=pg_catalog as $$declare r text;begin
 perform world_v2.beneficial_rent_role('world_v2_beneficial_rent_source_publisher');perform set_config('econmind.beneficial_rent_world',p_world,true);select registration_ref into strict r from world_v2.postwar_beneficial_rent_source where world_id=p_world and country_id=p_country for update;insert into world_v2.postwar_beneficial_rent_revocation values(p_world,r,p_reason)on conflict do nothing;
end;$$;
alter function world_v2.beneficial_rent_role(name)owner to world_v2_beneficial_rent_source_owner;
revoke all on function world_v2.beneficial_rent_role(name)from public;
alter function world_v2.beneficial_rent_admission(text)owner to world_v2_beneficial_rent_source_owner;
revoke all on function world_v2.beneficial_rent_admission(text)from public;
alter function world_v2.register_postwar_beneficial_rent_source(text,text,text)owner to world_v2_beneficial_rent_source_owner;
revoke all on function world_v2.register_postwar_beneficial_rent_source(text,text,text)from public;
alter function world_v2.lock_postwar_beneficial_rent_header(text,text)owner to world_v2_beneficial_rent_source_owner;
revoke all on function world_v2.lock_postwar_beneficial_rent_header(text,text)from public;
alter function world_v2.register_test_only_beneficial_rent_publication(text,text,text,text,text,text,timestamptz,timestamptz)owner to world_v2_beneficial_rent_source_owner;
revoke all on function world_v2.register_test_only_beneficial_rent_publication(text,text,text,text,text,text,timestamptz,timestamptz)from public;
alter function world_v2.beneficial_rent_prefix_data(text)owner to world_v2_beneficial_rent_source_owner;
revoke all on function world_v2.beneficial_rent_prefix_data(text)from public;
alter function world_v2.lock_postwar_beneficial_rent_original(text,text,text,text,timestamptz)owner to world_v2_beneficial_rent_source_owner;
revoke all on function world_v2.lock_postwar_beneficial_rent_original(text,text,text,text,timestamptz)from public;
alter function world_v2.read_postwar_beneficial_rent_current(text,text)owner to world_v2_beneficial_rent_source_owner;
revoke all on function world_v2.read_postwar_beneficial_rent_current(text,text)from public;
alter function world_v2.revoke_postwar_beneficial_rent_source(text,text,text)owner to world_v2_beneficial_rent_source_owner;
revoke all on function world_v2.revoke_postwar_beneficial_rent_source(text,text,text)from public;
grant execute on function world_v2.register_postwar_beneficial_rent_source(text,text,text)to world_v2_beneficial_rent_source_publisher;
grant execute on function world_v2.lock_postwar_beneficial_rent_header(text,text)to world_v2_beneficial_rent_source_reader;
grant execute on function world_v2.register_test_only_beneficial_rent_publication(text,text,text,text,text,text,timestamptz,timestamptz)to world_v2_beneficial_rent_source_publisher;
grant execute on function world_v2.lock_postwar_beneficial_rent_original(text,text,text,text,timestamptz)to world_v2_beneficial_rent_source_reader;
grant execute on function world_v2.read_postwar_beneficial_rent_current(text,text)to world_v2_beneficial_rent_source_reader;
grant execute on function world_v2.revoke_postwar_beneficial_rent_source(text,text,text)to world_v2_beneficial_rent_source_publisher;
revoke create on schema world_v2 from world_v2_beneficial_rent_source_owner;
commit;
