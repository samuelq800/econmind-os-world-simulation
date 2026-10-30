-- SOURCE-ONLY CANDIDATE. Not installed by production migration/host.
-- Depends on postwar-office-derived-read.sql, postwar-narrow-trade-source.sql
-- and postwar-day-one-fx-custody.sql. No LOGIN/membership/issuer enrollment.
-- Operational role has EXEC only; even the inaccessible definer has no raw seed.
begin;
create role world_v2_postwar_narrow_trade_current_owner nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
grant usage,create on schema world_v2 to world_v2_postwar_narrow_trade_current_owner;
grant usage on schema world_v2 to world_v2_postwar_narrow_trade_source;
-- Independently admitted original bytes, NOT a new rights authority. No INSERT
-- role or public publisher is supplied. Real issuer custody remains required.
create table world_v2.postwar_narrow_trade_current_original(
 world_id text not null,source_id text not null,seed_fingerprint text not null,
 source_payload_hash text not null check(source_payload_hash~'^sha256:[a-f0-9]{64}$'),
 canonical_payload text not null check(octet_length(canonical_payload)<=65536 and jsonb_typeof(canonical_payload::jsonb)='object'),
 primary key(world_id,source_id),
 foreign key(world_id,source_id)references world_v2.postwar_narrow_trade_rights_admission(world_id,source_id),
 foreign key(world_id,seed_fingerprint)references world_v2.opening_seed(world_id,seed_fingerprint),
 check(source_payload_hash='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||'{"payload":'||canonical_payload||'}','UTF8')),'hex'))
);
alter table world_v2.postwar_narrow_trade_current_original owner to world_v2_postwar_narrow_trade_current_owner;
alter table world_v2.postwar_narrow_trade_current_original enable row level security;
alter table world_v2.postwar_narrow_trade_current_original force row level security;
revoke all on world_v2.postwar_narrow_trade_current_original from public;
create trigger postwar_narrow_trade_current_original_immutable before update or delete on world_v2.postwar_narrow_trade_current_original for each row execute function world_v2.reject_authoritative_history_mutation();
create trigger postwar_narrow_trade_current_original_no_truncate before truncate on world_v2.postwar_narrow_trade_current_original for each statement execute function world_v2.reject_authoritative_history_mutation();
create trigger postwar_narrow_trade_current_original_h before insert on world_v2.postwar_narrow_trade_current_original for each row execute function world_v2.lock_postwar_narrow_rights_admission_parent();
grant select on world_v2.world_head,world_v2.runtime_opening_admission,world_v2.runtime_admission_publication_permit,world_v2.current_commit_authorization,world_v2.runtime_read_seat,world_v2.projection_entitlement,world_v2.authoritative_event,world_v2.command_submission,world_v2.command_receipt,world_v2.financial_posting_batch,world_v2.inventory_posting,world_v2.postwar_office_projection_document,world_v2.postwar_office_projection_page,world_v2.postwar_office_projection_revocation,world_v2.postwar_narrow_trade_rights_admission,world_v2.postwar_day_one_fx_source_original,world_v2.postwar_day_one_fx_quote_original to world_v2_postwar_narrow_trade_current_owner;
grant select(world_id,seed_id,seed_fingerprint,replay_binding)on world_v2.opening_seed to world_v2_postwar_narrow_trade_current_owner;
grant select on world_v2.runtime_admission_publication_revocation,world_v2.postwar_narrow_trade_rights_revocation to world_v2_postwar_narrow_trade_current_owner;
-- SELECT FOR SHARE needs a column UPDATE privilege. These inaccessible owner
-- policies permit row locks and prevent actual DML only where RLS is already
-- enabled. Existing metadata tables may not enable RLS; no such protection is
-- claimed there. Safety is the NOLOGIN non-member owner plus this fixed read-only
-- function. No operational role receives column UPDATE or SET ROLE membership.
grant update(world_version)on world_v2.world_head to world_v2_postwar_narrow_trade_current_owner;
grant update(seed_id)on world_v2.runtime_opening_admission to world_v2_postwar_narrow_trade_current_owner;
grant update(authorization_id)on world_v2.runtime_admission_publication_permit to world_v2_postwar_narrow_trade_current_owner;
grant update(authorization_version)on world_v2.current_commit_authorization to world_v2_postwar_narrow_trade_current_owner;
grant update(active)on world_v2.projection_entitlement to world_v2_postwar_narrow_trade_current_owner;
grant update(seat_ref)on world_v2.runtime_read_seat to world_v2_postwar_narrow_trade_current_owner;
grant update(source_id)on world_v2.postwar_narrow_trade_rights_admission to world_v2_postwar_narrow_trade_current_owner;
grant update(document_ref)on world_v2.postwar_office_projection_document to world_v2_postwar_narrow_trade_current_owner;
do $$declare t text;begin
 foreach t in array array['world_head','opening_seed','runtime_opening_admission','runtime_admission_publication_permit','current_commit_authorization','runtime_read_seat','projection_entitlement','authoritative_event','command_submission','command_receipt','financial_posting_batch','inventory_posting','postwar_office_projection_document','postwar_office_projection_page','postwar_office_projection_revocation','postwar_narrow_trade_rights_admission','postwar_narrow_trade_current_original','postwar_day_one_fx_source_original','postwar_day_one_fx_quote_original']loop
 execute format('create policy narrow_current_read on world_v2.%I for select to world_v2_postwar_narrow_trade_current_owner using(current_user=''world_v2_postwar_narrow_trade_current_owner''and world_id=current_setting(''econmind.narrow_current_world'',true))',t);
 execute format('create policy narrow_current_fence on world_v2.%I as restrictive for select to world_v2_postwar_narrow_trade_current_owner using(current_user=''world_v2_postwar_narrow_trade_current_owner''and world_id=current_setting(''econmind.narrow_current_world'',true))',t);
 end loop;
 foreach t in array array['world_head','runtime_opening_admission','runtime_admission_publication_permit','current_commit_authorization','runtime_read_seat','projection_entitlement','postwar_narrow_trade_rights_admission','postwar_office_projection_document']loop
 execute format('create policy narrow_current_lock on world_v2.%I for update to world_v2_postwar_narrow_trade_current_owner using(current_user=''world_v2_postwar_narrow_trade_current_owner''and world_id=current_setting(''econmind.narrow_current_world'',true))with check(false)',t);
 execute format('create policy narrow_current_lock_fence on world_v2.%I as restrictive for update to world_v2_postwar_narrow_trade_current_owner using(current_user=''world_v2_postwar_narrow_trade_current_owner''and world_id=current_setting(''econmind.narrow_current_world'',true))with check(false)',t);
 end loop;
end;$$;
create policy narrow_current_revocations on world_v2.runtime_admission_publication_revocation for select to world_v2_postwar_narrow_trade_current_owner using(exists(select 1 from world_v2.runtime_admission_publication_permit p where p.authorization_id=runtime_admission_publication_revocation.authorization_id and p.world_id=current_setting('econmind.narrow_current_world',true)));
create policy narrow_current_revocations on world_v2.postwar_narrow_trade_rights_revocation for select to world_v2_postwar_narrow_trade_current_owner using(exists(select 1 from world_v2.postwar_narrow_trade_rights_admission a where a.admission_ref=postwar_narrow_trade_rights_revocation.admission_ref and a.world_id=current_setting('econmind.narrow_current_world',true)));
create function world_v2.read_postwar_narrow_trade_current_source(p_world text,p_seller text,p_buyer text,p_batch text,p_subject uuid,p_team text,p_revision text)
returns table(seed_id text,seed_fingerprint text,admission_ref text,canonical_seed_sha256 text,world_version text,event_sequence text,stock_status text,stock jsonb,rights jsonb,events jsonb,commands jsonb,receipts jsonb,financial_batches jsonb,financial_batch_count text,inventory_posting_count text,quotes jsonb)
language plpgsql security definer set search_path=pg_catalog as $$
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
 select count(*)into inventory_count from world_v2.inventory_posting x where x.world_id=p_world;
 if inventory_count<>0 then raise exception 'NARROW_CURRENT_REPLAY_UNAVAILABLE_INVENTORY_EFFECT'using errcode='55000';end if;
 inventory_posting_count:=inventory_count::text;
 -- H0 stock is usable ONLY because complete actual inventory effects=0 and
 -- complete prefix is independently decoded and replayed by Core in the host.
 stock_status:='MISSING';stock:='[]'::jsonb;
 select * into d from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_seller and x.office_id='TRADE'and x.dataset='opening-inventory-entries'and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref and x.source_bundle_sha256=permit.source_bundle_sha256 and x.replay_binding=a.replay_binding and x.model_version=a.model_version and x.world_version=0 and x.event_sequence=0 for share;
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
 if event_bytes+command_bytes+receipt_bytes+(select coalesce(sum(octet_length(b->>'canonical_payload')),0)from jsonb_array_elements(financial_batches)b)>1048576 then raise exception 'PREFIX_BOUNDED_TOTAL_BYTES_EXCEEDED'using errcode='54000';end if;
 if jsonb_array_length(events)<>event_count or jsonb_array_length(commands)<>command_count or jsonb_array_length(receipts)<>receipt_count then raise exception 'PREFIX_COMPLETE_SETS_REQUIRED'using errcode='55000';end if;
 -- Only immutable quotes actually named by committed FX commands are returned.
 select coalesce(jsonb_agg(jsonb_build_object('country_id',q.country_id,'quote_ref',q.quote_ref,'quote_text',q.quote_text,'quote_text_sha256',q.quote_text_sha256)order by q.country_id),'[]'::jsonb)into quotes from world_v2.postwar_day_one_fx_quote_original q join world_v2.postwar_day_one_fx_source_original s on s.world_id=q.world_id where q.world_id=p_world and s.seed_id=a.seed_id and s.seed_fingerprint=a.seed_fingerprint and s.admission_ref=a.admission_ref and exists(select 1 from world_v2.command_submission c join world_v2.command_receipt r on r.world_id=c.world_id and r.command_id=c.command_id and r.command_fingerprint=c.command_fingerprint and r.outcome='COMMITTED'where c.world_id=p_world and c.country_id=q.country_id and c.command_type='POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'and c.canonical_payload::jsonb->>'quoteRef'=q.quote_ref);
 if octet_length(quotes::text)>262144 then raise exception 'NARROW_CURRENT_QUOTE_CAPACITY'using errcode='54000';end if;
 return next;
end;$$;
alter function world_v2.read_postwar_narrow_trade_current_source(text,text,text,text,uuid,text,text)owner to world_v2_postwar_narrow_trade_current_owner;
revoke all on function world_v2.read_postwar_narrow_trade_current_source(text,text,text,text,uuid,text,text)from public;
grant execute on function world_v2.read_postwar_narrow_trade_current_source(text,text,text,text,uuid,text,text)to world_v2_postwar_narrow_trade_source;
-- Fixed authorization lock delegation for an economic worker which has no
-- authority-table UPDATE. Actual rows only, lease/H remain the caller's cutoff
-- frontier; this helper also takes H before authority. Not an authority issuer.
create function world_v2.lock_postwar_narrow_trade_current_authorization(p_world text,p_subject uuid,p_country text,p_office text,p_capability text)
returns table(auth_subject text,world_id text,country_id text,office_id text,capability text,team_id text,authorization_version text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_narrow_trade_source','MEMBER')or pg_has_role(effective,'world_v2_postwar_narrow_trade_current_owner','MEMBER')or exists(select 1 from pg_roles r where r.rolname=effective and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))then raise exception 'NARROW_AUTH_FIXED_READER_REQUIRED'using errcode='42501';end if;
 if not((p_office='TRADE'and p_capability='TRADE_CONTRACTS')or(p_office='FINANCE'and p_capability='FINANCE_TREASURY'))then raise exception 'NARROW_AUTH_EXACT_REQUIRED_OFFICE'using errcode='42501';end if;
 perform set_config('econmind.narrow_current_world',p_world,true);
 perform 1 from world_v2.world_head h where h.world_id=p_world for share;
 if not found then raise exception 'NARROW_AUTH_ACTUAL_HEAD_REQUIRED'using errcode='55000';end if;
 return query select a.auth_subject::text,a.world_id,a.country_id,a.office_id,a.capability,a.team_id,a.authorization_version from world_v2.current_commit_authorization a where a.world_id=p_world and a.auth_subject=p_subject and a.country_id=p_country and a.office_id=p_office and a.capability=p_capability and a.active for share;
end;$$;
alter function world_v2.lock_postwar_narrow_trade_current_authorization(text,uuid,text,text,text)owner to world_v2_postwar_narrow_trade_current_owner;
revoke all on function world_v2.lock_postwar_narrow_trade_current_authorization(text,uuid,text,text,text)from public;
grant execute on function world_v2.lock_postwar_narrow_trade_current_authorization(text,uuid,text,text,text)to world_v2_postwar_narrow_trade_source;
create function world_v2.lock_postwar_narrow_trade_revoked_authorization(p_world text,p_subject uuid,p_country text,p_office text)
returns table(present integer)language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if p_office is distinct from 'TRADE'or not pg_has_role(effective,'world_v2_postwar_narrow_trade_source','MEMBER')or pg_has_role(effective,'world_v2_postwar_narrow_trade_current_owner','MEMBER')or exists(select 1 from pg_roles r where r.rolname=effective and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))then raise exception 'NARROW_AUTH_FIXED_READER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.narrow_current_world',p_world,true);
 perform 1 from world_v2.world_head h where h.world_id=p_world for share;
 if not found then raise exception 'NARROW_AUTH_ACTUAL_HEAD_REQUIRED'using errcode='55000';end if;
 return query select 1 from world_v2.current_commit_authorization a where a.world_id=p_world and a.auth_subject=p_subject and a.country_id=p_country and a.office_id is not distinct from p_office and a.active for share;
end;$$;
alter function world_v2.lock_postwar_narrow_trade_revoked_authorization(text,uuid,text,text)owner to world_v2_postwar_narrow_trade_current_owner;
revoke all on function world_v2.lock_postwar_narrow_trade_revoked_authorization(text,uuid,text,text)from public;
grant execute on function world_v2.lock_postwar_narrow_trade_revoked_authorization(text,uuid,text,text)to world_v2_postwar_narrow_trade_source;
revoke create on schema world_v2 from world_v2_postwar_narrow_trade_current_owner;
commit;
