-- DATA-only complete bounded canonical prefix. Candidate only, not a
-- production migration/activation. Depends on postwar-bounded-journal-read.sql
-- and its historical owner/admission/host-source lock protocol. No reader
-- table SELECT, role membership, raw seed, command authority or UI cache.
begin;
grant create on schema world_v2 to world_v2_day_one_fx_history_owner;
grant select(event_id,event_type,schema_version,world_id,causation_command_id,correlation_id,world_version,event_sequence,sim_time,recorded_at_real,corrects_event_id,canonical_payload,payload_sha256,event_fingerprint)on world_v2.authoritative_event to world_v2_day_one_fx_history_owner;
grant select(actor_id,auth_subject,canonical_payload,country_id,expected_world_version,command_fingerprint,command_id,idempotency_key,office_id,payload_sha256,schema_version,sim_time,submitted_at_real,command_type,world_id,correlation_id)on world_v2.command_submission to world_v2_day_one_fx_history_owner;
grant select(world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,reason_code,transition_id,world_version_before,world_version_after,sim_time,event_ids,recorded_at_real)on world_v2.command_receipt to world_v2_day_one_fx_history_owner;
create function world_v2.read_postwar_bounded_prefix(p_world text,p_host_country text,p_office text)
returns table(world_version text,event_sequence text,events jsonb,commands jsonb,receipts jsonb)
language plpgsql security definer set search_path=pg_catalog as $$
declare j record;event_count bigint;command_count bigint;receipt_count bigint;event_bytes bigint;command_bytes bigint;receipt_bytes bigint;v_events jsonb;v_commands jsonb;v_receipts jsonb;max_event bigint;max_version bigint;
begin
 -- This fixed call authenticates the actual caller role, locks current H,
 -- admission+permit+host source, rejects their revocations and unsupported
 -- inventory/oversized financial effects. Its exact-world fence is set from
 -- the checked World, never adopted from a caller GUC or supplied Ready.
 select * into j from world_v2.read_postwar_bounded_journal(p_world,p_host_country,p_office);
 if not found then raise exception 'PREFIX_ACTUAL_HOST_JOURNAL_REQUIRED'using errcode='55000';end if;
 select count(*),coalesce(max(x.event_sequence),0),coalesce(max(x.world_version),0)into event_count,max_event,max_version from world_v2.authoritative_event x where x.world_id=p_world;
 select count(*)into receipt_count from world_v2.command_receipt x where x.world_id=p_world and x.outcome='COMMITTED';
 if event_count>256 or receipt_count>256 then raise exception 'PREFIX_BOUNDED_CAPACITY_EXCEEDED'using errcode='54000';end if;
 if event_count<>j.event_sequence::bigint or max_event<>j.event_sequence::bigint or max_version>j.world_version::bigint or receipt_count<>j.world_version::bigint then raise exception 'PREFIX_COMPLETE_EVENT_AND_RECEIPT_SET_REQUIRED'using errcode='55000';end if;
 -- No family predicate: unknown/correction/wrong-effect frames are returned
 -- intact and must be rejected by the same complete Core replay as all others.
 if exists(select 1 from world_v2.authoritative_event x where x.world_id=p_world and octet_length(x.canonical_payload)>65536)then raise exception 'PREFIX_BOUNDED_EVENT_BYTES_EXCEEDED'using errcode='54000';end if;
 select coalesce(jsonb_agg(to_jsonb(r)order by r.sequence::bigint),'[]'::jsonb),coalesce(sum(octet_length(to_jsonb(r)::text)),0)into v_events,event_bytes from(select event_id as event_id,event_type as event_type,schema_version as schema_version,world_id as world_id,causation_command_id as causation_command_id,correlation_id as correlation_id,world_v2.authoritative_event.world_version::text as world_version,world_v2.authoritative_event.event_sequence::text as sequence,sim_time::text as sim_time,to_char(recorded_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as recorded_at_real,corrects_event_id as corrects_event_id,canonical_payload as canonical_payload,payload_sha256 as payload_sha256,event_fingerprint as event_fingerprint from world_v2.authoritative_event where world_id=p_world)r;
 select count(*)into command_count from world_v2.command_submission where world_id=p_world and command_id in(select e.causation_command_id from world_v2.authoritative_event e where e.world_id=p_world union select c.command_id from world_v2.command_receipt c where c.world_id=p_world and c.outcome='COMMITTED');
 if command_count>256 then raise exception 'PREFIX_BOUNDED_CAPACITY_EXCEEDED'using errcode='54000';end if;
 if exists(select 1 from world_v2.command_submission where world_id=p_world and command_id in(select e.causation_command_id from world_v2.authoritative_event e where e.world_id=p_world union select c.command_id from world_v2.command_receipt c where c.world_id=p_world and c.outcome='COMMITTED') and octet_length(canonical_payload)>16384)then raise exception 'PREFIX_BOUNDED_COMMAND_BYTES_EXCEEDED'using errcode='54000';end if;
 select coalesce(jsonb_agg(to_jsonb(r)order by r.command_id),'[]'::jsonb),coalesce(sum(octet_length(to_jsonb(r)::text)),0)into v_commands,command_bytes from(select actor_id as actor_id,auth_subject::text as auth_subject,canonical_payload as canonical_payload,country_id as country_id,expected_world_version::text as expected_world_version,command_fingerprint as command_fingerprint,command_id as command_id,idempotency_key as idempotency_key,office_id as office_id,payload_sha256 as payload_sha256,schema_version as schema_version,sim_time::text as sim_time,to_char(submitted_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as submitted_at_real,command_type as command_type,world_id as world_id,correlation_id as correlation_id from world_v2.command_submission where world_id=p_world and command_id in(select e.causation_command_id from world_v2.authoritative_event e where e.world_id=p_world union select c.command_id from world_v2.command_receipt c where c.world_id=p_world and c.outcome='COMMITTED'))r;
 select coalesce(jsonb_agg(to_jsonb(r)order by r.world_version_after::bigint,r.command_id),'[]'::jsonb),coalesce(sum(octet_length(to_jsonb(r)::text)),0)into v_receipts,receipt_bytes from(select world_id as world_id,command_id as command_id,idempotency_key as idempotency_key,schema_version as schema_version,command_fingerprint as command_fingerprint,outcome as outcome,reason_code as reason_code,transition_id as transition_id,world_version_before::text as world_version_before,world_version_after::text as world_version_after,sim_time::text as sim_time,event_ids as event_ids,to_char(recorded_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as recorded_at_real from world_v2.command_receipt where world_id=p_world and outcome='COMMITTED')r;
 if event_bytes+command_bytes+receipt_bytes+(select coalesce(sum(octet_length(b->>'canonical_payload')),0)from jsonb_array_elements(j.financial_batches)b)>1048576 then raise exception 'PREFIX_BOUNDED_TOTAL_BYTES_EXCEEDED'using errcode='54000';end if;
 if jsonb_array_length(v_events)<>event_count or jsonb_array_length(v_commands)<>command_count or jsonb_array_length(v_receipts)<>receipt_count then raise exception 'PREFIX_COMPLETE_SETS_REQUIRED'using errcode='55000';end if;
 return query select j.world_version,j.event_sequence,v_events,v_commands,v_receipts;
end;$$;
alter function world_v2.read_postwar_bounded_prefix(text,text,text)owner to world_v2_day_one_fx_history_owner;
revoke all on function world_v2.read_postwar_bounded_prefix(text,text,text)from public;
grant execute on function world_v2.read_postwar_bounded_prefix(text,text,text)to world_v2_social_source_reader,world_v2_finance_budget_source_reader;
revoke create on schema world_v2 from world_v2_day_one_fx_history_owner;
commit;
