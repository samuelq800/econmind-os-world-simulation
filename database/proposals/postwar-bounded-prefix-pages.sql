-- Candidate DATA-only paginated full-World history. Depends on the existing
-- postwar-bounded-prefix-read.sql and six-column bounded journal permissions.
-- No new role, membership, table, cache, raw seed read or economic authority.
-- Row SHARE locks require a READ WRITE RR/serializable transaction; the fixed
-- functions perform only SELECT and transaction-local GUC writes, and readers
-- retain EXECUTE only. Do not claim PostgreSQL READ ONLY supports row locks.
begin;
grant create on schema world_v2 to world_v2_day_one_fx_history_owner;
create function world_v2.read_postwar_bounded_prefix_page(p_world text,p_host_country text,p_office text,p_after_world_version bigint,p_after_event_sequence bigint,p_expected_head_world_version bigint,p_expected_head_event_sequence bigint,p_expected_seed_fingerprint text,p_expected_admission_ref text)
returns table(world_id text,host_country_id text,office_id text,world_version text,event_sequence text,seed_id text,seed_fingerprint text,admission_ref text,host_source_ref text,transaction_id text,backend_pid text,from_world_version text,from_event_sequence text,through_world_version text,through_event_sequence text,has_more boolean,frame_count text,event_count text,financial_batch_count text,inventory_posting_count text,total_frame_count text,total_event_count text,total_financial_batch_count text,total_inventory_posting_count text,frames_text text,frames_sha256 text,frame_bytes text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;required name;role_id oid;a world_v2.runtime_opening_admission%rowtype;permit world_v2.runtime_admission_publication_permit%rowtype;h record;host_ref text;r record;c record;e record;br record;command jsonb;events jsonb;transition jsonb;receipt jsonb;batches jsonb;inventory jsonb;body jsonb;frame jsonb;part text;parts text[]:='{}';wv bigint;seq bigint;group_events bigint;group_event_bytes bigint;max_event_bytes bigint;group_batches bigint;group_inventory bigint;posting_bytes bigint;max_posting_bytes bigint;page_frames bigint:=0;page_events bigint:=0;page_batches bigint:=0;page_inventory bigint:=0;page_bytes bigint:=2;total_frames bigint;total_events bigint;total_batches bigint;total_inventory bigint;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 required:=case p_office when 'SOCIAL'then 'world_v2_social_source_reader'when 'FINANCE'then 'world_v2_finance_budget_source_reader'when 'PUBLICATION'then 'world_v2_postwar_projection_publisher'when 'SOCIAL_MATCH'then 'world_v2_social_source_publisher'else null end;
 select oid into role_id from pg_roles where rolname=required;
 if required is null or role_id is null or not pg_has_role(effective,role_id,'MEMBER')or
 exists(select 1 from pg_roles x where x.rolname=effective and(x.rolsuper or x.rolbypassrls or x.rolcreatedb or x.rolcreaterole or x.rolreplication))or
 exists(select 1 from pg_roles x where x.rolname in('world_v2_day_one_fx_history_owner','world_v2_day_one_fx_source_owner','world_v2_day_one_fx_source_publisher','world_v2_social_source_owner','world_v2_social_source_publisher','world_v2_finance_budget_source_owner','world_v2_finance_budget_source_publisher')and pg_has_role(effective,x.oid,'MEMBER')and not(p_office='SOCIAL_MATCH'and x.rolname='world_v2_social_source_publisher'))then raise exception 'JOURNAL_FIXED_SOURCE_READER_REQUIRED'using errcode='42501';end if;
 if p_office='PUBLICATION'and exists(select 1 from pg_roles ro where ro.rolname in('world_v2_social_source_reader','world_v2_finance_budget_source_reader','world_v2_postwar_projection_reader','world_v2_postwar_projection_owner')and pg_has_role(effective,ro.oid,'MEMBER'))then raise exception 'PREFIX_PAGE_SEPARATE_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if p_world is null or p_world!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or p_host_country is null or p_host_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'then raise exception 'JOURNAL_EXACT_REPLAY_SCOPE_REQUIRED'using errcode='22023';end if;
 if current_setting('transaction_isolation')not in('repeatable read','serializable')then raise exception 'PREFIX_PAGE_HELD_REPEATABLE_TRANSACTION_REQUIRED'using errcode='25001';end if;
 perform set_config('econmind.fx_history_world',p_world,true);
 select x.world_version,x.event_sequence into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found then raise exception 'JOURNAL_ACTUAL_HEAD_REQUIRED'using errcode='55000';end if;
 if h.world_version<0 or h.event_sequence<h.world_version then raise exception 'PREFIX_PAGE_ACTUAL_HEAD_INVALID'using errcode='55000';end if;
 select * into a from world_v2.runtime_opening_admission x where x.world_id=p_world for share;
 if not found or not exists(select 1 from world_v2.opening_seed x where x.world_id=a.world_id and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.replay_binding=a.replay_binding and x.replay_binding::jsonb->>'modelVersion'=a.model_version)then raise exception 'JOURNAL_ACTUAL_IMMUTABLE_ADMISSION_REQUIRED'using errcode='55000';end if;
 select * into permit from world_v2.runtime_admission_publication_permit x where 'ADMISSION_'||upper(x.authorization_sha256)=a.admission_ref and x.world_id=a.world_id and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.model_version=a.model_version and x.replay_binding=a.replay_binding and a.admitted_at_real>=x.valid_from and a.admitted_at_real<x.valid_until for share;
 if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation x where x.authorization_id=permit.authorization_id)then raise exception 'JOURNAL_CURRENT_WORLD_ADMISSION_REVOKED'using errcode='55000';end if;
 if p_office in('SOCIAL','PUBLICATION','SOCIAL_MATCH')then
  if to_regclass('world_v2.social_operating_source_registration')is null or to_regclass('world_v2.social_operating_source_revocation')is null then raise exception 'JOURNAL_CURRENT_HOST_SOURCE_REQUIRED'using errcode='55000';end if;
  select x.registration_ref into host_ref from world_v2.social_operating_source_registration x where x.world_id=p_world and x.country_id=p_host_country and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref for share;
  if not found or exists(select 1 from world_v2.social_operating_source_revocation x where x.registration_ref=host_ref)then raise exception 'JOURNAL_CURRENT_HOST_SOURCE_REVOKED'using errcode='55000';end if;
 else
  if to_regclass('world_v2.finance_budget_policy_original')is null or to_regclass('world_v2.finance_budget_policy_revocation')is null then raise exception 'JOURNAL_CURRENT_HOST_SOURCE_REQUIRED'using errcode='55000';end if;
  select x.policy_ref into host_ref from world_v2.finance_budget_policy_original x where x.world_id=p_world and x.country_id=p_host_country and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref and not exists(select 1 from world_v2.finance_budget_policy_revocation revoked where revoked.policy_ref=x.policy_ref)order by x.policy_ref limit 1 for share;
  if not found then raise exception 'JOURNAL_CURRENT_HOST_SOURCE_REVOKED'using errcode='55000';end if;
 end if;

 if p_after_world_version is null or p_after_event_sequence is null or p_after_world_version<0 or p_after_event_sequence<0 or p_after_world_version>h.world_version or p_after_event_sequence>h.event_sequence or(p_after_world_version=0)<>(p_after_event_sequence=0)or(p_expected_head_world_version is null)<>(p_expected_head_event_sequence is null)or(p_after_world_version>0 and p_expected_head_world_version is null)then raise exception 'PREFIX_PAGE_EXACT_TRANSITION_CURSOR_REQUIRED'using errcode='22023';end if;
 if p_expected_seed_fingerprint is distinct from a.seed_fingerprint or p_expected_admission_ref is distinct from a.admission_ref or(p_expected_head_world_version is not null and(p_expected_head_world_version<>h.world_version or p_expected_head_event_sequence<>h.event_sequence))then raise exception 'PREFIX_PAGE_HELD_HEAD_OR_ADMISSION_CHANGED'using errcode='55000';end if;
 if p_after_world_version>0 and not exists(select 1 from world_v2.command_receipt rc join world_v2.authoritative_event ev on ev.world_id=rc.world_id and ev.causation_command_id=rc.command_id where rc.world_id=p_world and rc.outcome='COMMITTED'and rc.world_version_after=p_after_world_version and ev.event_sequence=p_after_event_sequence and ev.event_id=rc.event_ids->>(jsonb_array_length(rc.event_ids)-1))then raise exception 'PREFIX_PAGE_CURSOR_INSIDE_OR_OUTSIDE_TRANSITION'using errcode='22023';end if;
 select count(*)into total_frames from world_v2.command_receipt rc where rc.world_id=p_world and rc.outcome='COMMITTED';
 select count(*)into total_events from world_v2.authoritative_event ev where ev.world_id=p_world;
 select count(*)into total_batches from world_v2.financial_posting_batch fb where fb.world_id=p_world;
 select count(*)into total_inventory from world_v2.inventory_posting ip where ip.world_id=p_world;
 if total_frames<>h.world_version or total_events<>h.event_sequence then raise exception 'PREFIX_PAGE_COMPLETE_ACTUAL_HEADER_COUNTS_REQUIRED'using errcode='55000';end if;
 if exists(select 1 from world_v2.financial_posting_batch fb where fb.world_id=p_world and not exists(select 1 from world_v2.command_receipt rc where rc.world_id=fb.world_id and rc.command_id=fb.causation_command_id and rc.outcome='COMMITTED'))or exists(select 1 from world_v2.inventory_posting ip where ip.world_id=p_world and not exists(select 1 from world_v2.command_receipt rc where rc.world_id=ip.world_id and rc.command_id=ip.causation_command_id and rc.outcome='COMMITTED'))then raise exception 'PREFIX_PAGE_ORPHAN_JOURNAL_REQUIRED_CLOSED'using errcode='55000';end if;
 wv:=p_after_world_version;seq:=p_after_event_sequence;
 for r in select rc.* from world_v2.command_receipt rc where rc.world_id=p_world and rc.outcome='COMMITTED'and rc.world_version_after>p_after_world_version order by rc.world_version_after,rc.command_id limit 257 loop
  if r.world_version_before<>wv or r.world_version_after<>wv+1 or r.schema_version<>'command-receipt-v2'or r.reason_code is not null then raise exception 'PREFIX_PAGE_RECEIPT_GAP_OR_UNKNOWN_TRANSITION'using errcode='55000';end if;
  select * into strict c from world_v2.command_submission cs where cs.world_id=p_world and cs.command_id=r.command_id;
  if c.expected_world_version is distinct from wv or c.command_fingerprint is distinct from r.command_fingerprint or c.idempotency_key is distinct from r.idempotency_key or c.sim_time<>r.sim_time or r.transition_id is distinct from c.command_id or octet_length(c.canonical_payload)>16384 then raise exception 'PREFIX_PAGE_EXACT_COMMAND_RECEIPT_REQUIRED'using errcode='23514';end if;
  select count(*),coalesce(sum(octet_length(ev.canonical_payload)),0),coalesce(max(octet_length(ev.canonical_payload)),0)into group_events,group_event_bytes,max_event_bytes from world_v2.authoritative_event ev where ev.world_id=p_world and ev.causation_command_id=c.command_id;
  if group_events<1 or group_events<>jsonb_array_length(r.event_ids)or group_events>256 or max_event_bytes>65536 then raise exception 'PREFIX_PAGE_OVERSIZE_OR_INCOMPLETE_TRANSITION'using errcode='54000';end if;
  if page_events+group_events>256 then exit;end if;
  select count(*),coalesce(sum(octet_length(fb.canonical_payload)),0),coalesce(max(octet_length(fb.canonical_payload)),0)into group_batches,posting_bytes,max_posting_bytes from world_v2.financial_posting_batch fb where fb.world_id=p_world and fb.causation_command_id=c.command_id;
  select count(*),posting_bytes+coalesce(sum(octet_length(ip.canonical_payload)),0),greatest(max_posting_bytes,coalesce(max(octet_length(ip.canonical_payload)),0))into group_inventory,posting_bytes,max_posting_bytes from world_v2.inventory_posting ip where ip.world_id=p_world and ip.causation_command_id=c.command_id;
  if group_batches>512 or group_inventory>256 or max_posting_bytes>65536 or 2*group_event_bytes+posting_bytes+octet_length(c.canonical_payload)>1048576 then raise exception 'PREFIX_PAGE_OVERSIZE_TRANSITION_JOURNAL'using errcode='54000';end if;
  if page_batches+group_batches>512 or page_inventory+group_inventory>256 then exit;end if;
  command:=jsonb_build_object('actorId',c.actor_id,'authSubject',c.auth_subject::text,'commandId',c.command_id,'commandType',c.command_type,'correlationId',c.correlation_id,'countryId',c.country_id,'expectedWorldVersion',c.expected_world_version::text,'idempotencyKey',c.idempotency_key,'officeId',c.office_id,'canonicalPayload',c.canonical_payload,'schemaVersion',c.schema_version,'simTime',c.sim_time::text,'submittedAtReal',to_char(c.submitted_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'worldId',p_world,'fingerprint',c.command_fingerprint,'payloadHash',c.payload_sha256);
  events:='[]';
  for e in select ev.* from world_v2.authoritative_event ev where ev.world_id=p_world and ev.causation_command_id=c.command_id order by ev.event_sequence loop
   if e.event_sequence<>seq+jsonb_array_length(events)+1 or e.world_version<>r.world_version_after or e.sim_time<>c.sim_time or e.correlation_id is distinct from c.correlation_id or e.event_id is distinct from r.event_ids->>jsonb_array_length(events)then raise exception 'PREFIX_PAGE_COMPLETE_ORDERED_EVENT_SET_REQUIRED'using errcode='23514';end if;
   events:=events||jsonb_build_array(jsonb_build_object('causationCommandId',e.causation_command_id,'correlationId',e.correlation_id,'correctsEventId',e.corrects_event_id,'eventId',e.event_id,'eventType',e.event_type,'canonicalPayload',e.canonical_payload,'schemaVersion',e.schema_version,'sequence',e.event_sequence::text,'simTime',e.sim_time::text,'worldId',p_world,'worldVersion',e.world_version::text,'fingerprint',e.event_fingerprint,'payloadHash',e.payload_sha256,'recordedAtReal',to_char(e.recorded_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  end loop;
  transition:=jsonb_build_object('schemaVersion','authoritative-transition-v1','transitionId',c.command_id,'worldId',p_world,'commandId',c.command_id,'commandFingerprint',c.command_fingerprint,'worldVersionBefore',r.world_version_before::text,'worldVersionAfter',r.world_version_after::text,'eventIds',r.event_ids,'events',events);
  receipt:=jsonb_build_object('schemaVersion',r.schema_version,'worldId',p_world,'commandId',r.command_id,'idempotencyKey',r.idempotency_key,'commandFingerprint',r.command_fingerprint,'outcome',r.outcome,'reasonCode',r.reason_code,'transitionId',r.transition_id,'worldVersionBefore',r.world_version_before::text,'worldVersionAfter',r.world_version_after::text,'simTime',r.sim_time::text,'eventIds',r.event_ids,'recordedAtReal',to_char(r.recorded_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  batches:='[]';inventory:='[]';
  for br in select fb.canonical_payload,fb.batch_fingerprint as fingerprint from world_v2.financial_posting_batch fb where fb.world_id=p_world and fb.causation_command_id=c.command_id order by case when fb.canonical_payload::jsonb->>'settlementCurrency'='GCU'then 1 else 0 end,fb.batch_id loop
   body:=br.canonical_payload::jsonb;
   if br.canonical_payload is distinct from world_v2.canonical_json(body)or br.fingerprint is distinct from'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||br.canonical_payload,'UTF8')),'hex')then raise exception 'PREFIX_PAGE_EXACT_FINANCIAL_BODY_REQUIRED'using errcode='23514';end if;
   batches:=batches||jsonb_build_array(body||jsonb_build_object('fingerprint',br.fingerprint));
  end loop;
  for br in select ip.canonical_payload,ip.posting_fingerprint as fingerprint from world_v2.inventory_posting ip where ip.world_id=p_world and ip.causation_command_id=c.command_id order by ip.posting_id loop
   body:=br.canonical_payload::jsonb;
   if br.canonical_payload is distinct from world_v2.canonical_json(body)or br.fingerprint is distinct from'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||br.canonical_payload,'UTF8')),'hex')then raise exception 'PREFIX_PAGE_EXACT_INVENTORY_BODY_REQUIRED'using errcode='23514';end if;
   inventory:=inventory||jsonb_build_array(body||jsonb_build_object('fingerprint',br.fingerprint));
  end loop;
  frame:=jsonb_build_object('command',command,'events',events,'transition',transition,'receipt',receipt,'financialPostingBatches',batches,'inventoryPostings',inventory);part:=world_v2.canonical_json(frame);
  if octet_length(part)+2>1048576 then raise exception 'PREFIX_PAGE_SINGLE_TRANSITION_BYTES_EXCEEDED'using errcode='54000';end if;
  if page_bytes+octet_length(part)+(case when page_frames=0 then 0 else 1 end)>1048576 then exit;end if;
  parts:=array_append(parts,part);page_bytes:=page_bytes+octet_length(part)+(case when page_frames=0 then 0 else 1 end);page_frames:=page_frames+1;page_events:=page_events+group_events;page_batches:=page_batches+group_batches;page_inventory:=page_inventory+group_inventory;wv:=r.world_version_after;seq:=seq+group_events;
  if page_events=256 then exit;end if;
 end loop;
 if (page_frames=0 and wv<h.world_version)or(wv=h.world_version and seq<>h.event_sequence)then raise exception 'PREFIX_PAGE_INCOMPLETE_ACTUAL_TAIL'using errcode='55000';end if;
 frames_text:='['||array_to_string(parts,',')||']';
 return query select p_world,p_host_country,p_office,h.world_version::text,h.event_sequence::text,a.seed_id,a.seed_fingerprint,a.admission_ref,host_ref,pg_current_xact_id()::text,pg_backend_pid()::text,p_after_world_version::text,p_after_event_sequence::text,wv::text,seq::text,wv<h.world_version,page_frames::text,page_events::text,page_batches::text,page_inventory::text,total_frames::text,total_events::text,total_batches::text,total_inventory::text,frames_text,'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||frames_text,'UTF8')),'hex'),page_bytes::text;
end;$$;
alter function world_v2.read_postwar_bounded_prefix_page(text,text,text,bigint,bigint,bigint,bigint,text,text)owner to world_v2_day_one_fx_history_owner;
revoke all on function world_v2.read_postwar_bounded_prefix_page(text,text,text,bigint,bigint,bigint,bigint,text,text)from public;
grant execute on function world_v2.read_postwar_bounded_prefix_page(text,text,text,bigint,bigint,bigint,bigint,text,text)to world_v2_social_source_reader,world_v2_finance_budget_source_reader;
revoke create on schema world_v2 from world_v2_day_one_fx_history_owner;
commit;
