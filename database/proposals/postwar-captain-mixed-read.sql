-- CANDIDATE ONLY; full bounded DATA replay, never a caller current snapshot.
-- Depends on postwar-captain-source-publication.sql and existing FX custody.
-- No new roles/memberships, reader table grants or raw opening-seed payload.
begin;
grant create on schema world_v2 to world_v2_captain_source_owner;
grant select on world_v2.world_head to world_v2_captain_source_owner;
grant update(world_version)on world_v2.world_head to world_v2_captain_source_owner;
grant select(event_id,event_type,schema_version,world_id,causation_command_id,correlation_id,world_version,event_sequence,sim_time,recorded_at_real,corrects_event_id,canonical_payload,payload_sha256,event_fingerprint)on world_v2.authoritative_event to world_v2_captain_source_owner;
grant select(actor_id,auth_subject,canonical_payload,country_id,expected_world_version,command_fingerprint,command_id,idempotency_key,office_id,payload_sha256,schema_version,sim_time,submitted_at_real,command_type,world_id,correlation_id)on world_v2.command_submission to world_v2_captain_source_owner;
grant select(world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,reason_code,transition_id,world_version_before,world_version_after,sim_time,event_ids,recorded_at_real)on world_v2.command_receipt to world_v2_captain_source_owner;
grant select(world_id,batch_id,causation_command_id,canonical_payload,batch_fingerprint)on world_v2.financial_posting_batch to world_v2_captain_source_owner;
grant select(world_id)on world_v2.inventory_posting to world_v2_captain_source_owner;
grant select(world_id,country_id,quote_ref,quote_text,quote_text_sha256)on world_v2.postwar_day_one_fx_quote_original to world_v2_captain_source_owner;
grant select(world_id,seed_id,seed_fingerprint,admission_ref)on world_v2.postwar_day_one_fx_source_original to world_v2_captain_source_owner;
do $$declare t text;begin foreach t in array array['world_head','authoritative_event','command_submission','command_receipt','financial_posting_batch','inventory_posting','postwar_day_one_fx_quote_original','postwar_day_one_fx_source_original','current_commit_authorization']loop
 execute format('create policy captain_mixed_read on world_v2.%I for select to world_v2_captain_source_owner using(current_user=''world_v2_captain_source_owner''and world_id=current_setting(''econmind.captain_world'',true))',t);
 execute format('create policy captain_mixed_fence on world_v2.%I as restrictive for select to world_v2_captain_source_owner using(current_user=''world_v2_captain_source_owner''and world_id=current_setting(''econmind.captain_world'',true))',t);
 end loop;end;$$;
create function world_v2.read_postwar_captain_mixed_prefix(p_world text,p_country text,p_subject uuid,p_expected text)
returns table(world_version text,event_sequence text,seed_id text,seed_fingerprint text,admission_ref text,events jsonb,commands jsonb,receipts jsonb,financial_batch_count text,inventory_posting_count text,financial_batches jsonb,captain_packets jsonb,fx_quotes jsonb)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h record;a world_v2.runtime_opening_admission%rowtype;host world_v2.captain_operating_source_adoption%rowtype;
 j record;event_count bigint;command_count bigint;receipt_count bigint;event_bytes bigint;command_bytes bigint;receipt_bytes bigint;v_events jsonb;v_commands jsonb;v_receipts jsonb;max_event bigint;max_version bigint;batch_count bigint;inventory_count bigint;batches jsonb;packets jsonb;quotes jsonb;n bigint;b bigint;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_captain_source_reader'or pg_has_role(session_user,'world_v2_captain_source_owner','MEMBER')or exists(select 1 from pg_roles x where x.rolname=session_user and(x.rolsuper or x.rolbypassrls or x.rolcreaterole or x.rolcreatedb or x.rolreplication))then raise exception 'CAPTAIN_MIXED_FIXED_READER_REQUIRED'using errcode='42501';end if;
 if p_world is null or p_world!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or p_country is null or p_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or p_subject is null or p_expected is null or p_expected!~'^(0|[1-9][0-9]*)$'then raise exception 'CAPTAIN_MIXED_EXACT_SCOPE_REQUIRED'using errcode='22023';end if;
 perform set_config('econmind.captain_world',p_world,true);
 if not exists(select 1 from world_v2.current_commit_authorization c where c.world_id=p_world and c.country_id=p_country and c.auth_subject=p_subject and c.office_id='CAPTAIN'and c.capability='CAPTAIN_CABINET'and c.active)or exists(select 1 from world_v2.current_commit_authorization c join world_v2.current_commit_authorization d on d.world_id=c.world_id and d.auth_subject=c.auth_subject and d.active where c.world_id=p_world and c.auth_subject=p_subject and c.active and(c.country_id<>d.country_id or c.team_id<>d.team_id or c.authorization_version<>d.authorization_version))then raise exception 'CAPTAIN_MIXED_CURRENT_ACTOR_REQUIRED'using errcode='42501';end if;
 -- Caller already holds the actual lease/adoption from custody, before H.
 select x.world_version,x.event_sequence into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found or h.world_version::text<>p_expected then raise exception 'CAPTAIN_MIXED_ACTUAL_HEAD_REQUIRED'using errcode='55000';end if;
 if h.world_version>256 or h.event_sequence>256 then raise exception 'CAPTAIN_MIXED_BOUNDED_CAPACITY_EXCEEDED'using errcode='54000';end if;
 select * into a from world_v2.runtime_opening_admission x where x.world_id=p_world;
 if not found then raise exception 'CAPTAIN_MIXED_ADMISSION_REQUIRED'using errcode='55000';end if;
 perform world_v2.captain_publication_admission(p_world,a.seed_id,a.seed_fingerprint,a.admission_ref);
 select * into host from world_v2.captain_operating_source_adoption x where x.world_id=p_world and x.country_id=p_country for share;
 if not found or host.seed_fingerprint<>a.seed_fingerprint or exists(select 1 from world_v2.captain_operating_source_revocation x where x.adoption_ref=host.adoption_ref)then raise exception 'CAPTAIN_MIXED_CURRENT_SOURCE_REQUIRED'using errcode='55000';end if;
 select count(*),coalesce(sum(octet_length(x.canonical_payload)),0)into batch_count,b from world_v2.financial_posting_batch x where x.world_id=p_world;
 select count(*)into inventory_count from world_v2.inventory_posting x where x.world_id=p_world;
 if inventory_count<>0 or batch_count>512 or b>1048576 or exists(select 1 from world_v2.financial_posting_batch x where x.world_id=p_world and octet_length(x.canonical_payload)>65536)then raise exception 'CAPTAIN_MIXED_UNSUPPORTED_OR_OVERSIZED_EFFECT'using errcode='54000';end if;
 select coalesce(jsonb_agg(jsonb_build_object('causation_command_id',x.causation_command_id,'canonical_payload',x.canonical_payload,'fingerprint',x.batch_fingerprint)order by x.batch_id),'[]'::jsonb)into batches from world_v2.financial_posting_batch x where x.world_id=p_world;
 select h.world_version::text as world_version,h.event_sequence::text as event_sequence,batches as financial_batches into j;
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
 if event_bytes+command_bytes+receipt_bytes+(select coalesce(sum(octet_length(jb->>'canonical_payload')),0)from jsonb_array_elements(j.financial_batches)jb)>1048576 then raise exception 'PREFIX_BOUNDED_TOTAL_BYTES_EXCEEDED'using errcode='54000';end if;
 if jsonb_array_length(v_events)<>event_count or jsonb_array_length(v_commands)<>command_count or jsonb_array_length(v_receipts)<>receipt_count then raise exception 'PREFIX_COMPLETE_SETS_REQUIRED'using errcode='55000';end if;

 -- No current revocation of a historical quote/source erases a COMMITTED
 -- payment. Host/current admission checks above still apply on every use.
 select count(*),coalesce(sum(octet_length(x.packet_text)),0)into n,b from world_v2.captain_source_publication_registry x where x.world_id=p_world and(x.country_id=p_country or exists(select 1 from world_v2.command_submission c join world_v2.command_receipt cr on cr.world_id=c.world_id and cr.command_id=c.command_id and cr.outcome='COMMITTED'where c.world_id=p_world and c.country_id=x.country_id and c.command_type='CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1'));
 if n>70 or b>1048576 then raise exception 'CAPTAIN_MIXED_PACKET_CAPACITY_EXCEEDED'using errcode='54000';end if;
 select coalesce(jsonb_agg(jsonb_build_object('packet_text',x.packet_text,'packet_sha256',x.packet_sha256,'originals',(select jsonb_object_agg(o.fact_ref,o.original_text)from world_v2.captain_operating_original o where o.adoption_ref=x.adoption_ref))order by x.country_id),'[]'::jsonb)into packets from world_v2.captain_source_publication_registry x where x.world_id=p_world and x.seed_fingerprint=a.seed_fingerprint and x.world_admission_ref=a.admission_ref and(x.country_id=p_country or exists(select 1 from world_v2.command_submission c join world_v2.command_receipt cr on cr.world_id=c.world_id and cr.command_id=c.command_id and cr.outcome='COMMITTED'where c.world_id=p_world and c.country_id=x.country_id and c.command_type='CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1'));
 select count(*),coalesce(sum(octet_length(q.quote_text)),0)into n,b from world_v2.postwar_day_one_fx_quote_original q where q.world_id=p_world and exists(select 1 from world_v2.command_submission c join world_v2.command_receipt cr on cr.world_id=c.world_id and cr.command_id=c.command_id and cr.outcome='COMMITTED'where c.world_id=p_world and c.country_id=q.country_id and c.command_type='POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'and c.canonical_payload::jsonb->>'quoteRef'=q.quote_ref);
 if n>70 or b>262144 then raise exception 'CAPTAIN_MIXED_QUOTE_CAPACITY_EXCEEDED'using errcode='54000';end if;
 select coalesce(jsonb_agg(jsonb_build_object('quote_text',q.quote_text,'quote_text_sha256',q.quote_text_sha256)order by q.country_id),'[]'::jsonb)into quotes from world_v2.postwar_day_one_fx_quote_original q where q.world_id=p_world and exists(select 1 from world_v2.postwar_day_one_fx_source_original fs where fs.world_id=p_world and fs.seed_id=a.seed_id and fs.seed_fingerprint=a.seed_fingerprint and fs.admission_ref=a.admission_ref)and exists(select 1 from world_v2.command_submission c join world_v2.command_receipt cr on cr.world_id=c.world_id and cr.command_id=c.command_id and cr.outcome='COMMITTED'where c.world_id=p_world and c.country_id=q.country_id and c.command_type='POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'and c.canonical_payload::jsonb->>'quoteRef'=q.quote_ref);
 return query select h.world_version::text,h.event_sequence::text,a.seed_id,a.seed_fingerprint,a.admission_ref,v_events,v_commands,v_receipts,batch_count::text,inventory_count::text,batches,packets,quotes;
end;$$;
alter function world_v2.read_postwar_captain_mixed_prefix(text,text,uuid,text)owner to world_v2_captain_source_owner;
revoke all on function world_v2.read_postwar_captain_mixed_prefix(text,text,uuid,text)from public;
grant execute on function world_v2.read_postwar_captain_mixed_prefix(text,text,uuid,text)to world_v2_captain_source_reader;
-- Exact immutable durable intent read, without UPDATE authority on submissions.
create function world_v2.read_postwar_captain_durable_command(p_world text,p_command text,p_fp text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;c record;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_captain_source_reader'or pg_has_role(session_user,'world_v2_captain_source_owner','MEMBER')then raise exception 'CAPTAIN_FIXED_READER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.captain_world',p_world,true);
 select x.actor_id,x.auth_subject,x.canonical_payload,x.country_id,x.expected_world_version,x.command_fingerprint,x.command_id,x.idempotency_key,x.office_id,x.payload_sha256,x.schema_version,x.sim_time,x.submitted_at_real,x.command_type,x.world_id,x.correlation_id into c from world_v2.command_submission x where x.world_id=p_world and x.command_id=p_command and x.command_fingerprint=p_fp and x.office_id='CAPTAIN'and x.command_type='CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1'and octet_length(x.canonical_payload)<=16384;
 if not found or not exists(select 1 from world_v2.current_commit_authorization a where a.world_id=p_world and a.auth_subject=c.auth_subject and a.country_id=c.country_id and a.office_id='CAPTAIN'and a.capability='CAPTAIN_CABINET'and a.active)then raise exception 'CAPTAIN_DURABLE_CURRENT_COMMAND_REQUIRED'using errcode='42501';end if;
 return jsonb_build_object('command_actor_id',c.actor_id,'command_auth_subject',c.auth_subject::text,'command_canonical_payload',c.canonical_payload,'command_country_id',c.country_id,'command_expected_world_version',c.expected_world_version::text,'command_fingerprint',c.command_fingerprint,'command_id',c.command_id,'command_idempotency_key',c.idempotency_key,'command_office_id',c.office_id,'command_payload_sha256',c.payload_sha256,'command_schema_version',c.schema_version,'command_sim_time',c.sim_time::text,'command_submitted_at_real',to_char(c.submitted_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'command_type',c.command_type,'command_world_id',c.world_id,'correlation_id',c.correlation_id);
end;$$;
alter function world_v2.read_postwar_captain_durable_command(text,text,text)owner to world_v2_captain_source_owner;
revoke all on function world_v2.read_postwar_captain_durable_command(text,text,text)from public;
grant execute on function world_v2.read_postwar_captain_durable_command(text,text,text)to world_v2_captain_source_reader;
-- Reverse replay for the existing fixed source readers. Only historical
-- Captain packets are exposed; no Captain current authority is delegated.
grant select on world_v2.social_operating_source_registration,world_v2.social_operating_source_revocation,world_v2.finance_budget_policy_original,world_v2.finance_budget_policy_revocation,world_v2.postwar_day_one_fx_source_revocation,world_v2.postwar_day_one_fx_quote_revocation to world_v2_captain_source_owner;
grant select(registration_ref)on world_v2.postwar_day_one_fx_source_original to world_v2_captain_source_owner;
grant update(registration_ref)on world_v2.social_operating_source_registration,world_v2.postwar_day_one_fx_source_original to world_v2_captain_source_owner;
grant update(policy_ref)on world_v2.finance_budget_policy_original to world_v2_captain_source_owner;
do $$declare t text;begin foreach t in array array['social_operating_source_registration','finance_budget_policy_original']loop
 execute format('create policy captain_history_host_read on world_v2.%I for select to world_v2_captain_source_owner using(current_user=''world_v2_captain_source_owner''and world_id=current_setting(''econmind.captain_world'',true))',t);
 execute format('create policy captain_history_host_fence on world_v2.%I as restrictive for select to world_v2_captain_source_owner using(current_user=''world_v2_captain_source_owner''and world_id=current_setting(''econmind.captain_world'',true))',t);
 execute format('create policy captain_history_host_lock on world_v2.%I for update to world_v2_captain_source_owner using(current_user=''world_v2_captain_source_owner''and world_id=current_setting(''econmind.captain_world'',true))with check(false)',t);
 end loop;end;$$;
create function world_v2.read_postwar_captain_history_originals(p_world text,p_host_country text,p_office text,p_fp text,p_admission text,p_expected text)
returns table(world_version text,event_sequence text,seed_fingerprint text,admission_ref text,captain_packets jsonb,host_original_status text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;required name;h record;a world_v2.runtime_opening_admission%rowtype;host text;host_adoption text;host_registry record;n bigint;b bigint;packets jsonb;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 required:=case p_office when 'SOCIAL'then 'world_v2_social_source_reader'when 'FINANCE'then 'world_v2_finance_budget_source_reader'when 'TREASURY_FX'then 'world_v2_day_one_fx_source_reader'else null end;
 if required is null or effective<>required or exists(select 1 from pg_roles x where x.rolname=session_user and(x.rolsuper or x.rolbypassrls or x.rolcreatedb or x.rolcreaterole or x.rolreplication))or pg_has_role(session_user,'world_v2_captain_source_owner','MEMBER')then raise exception 'CAPTAIN_HISTORY_FIXED_HOST_READER_REQUIRED'using errcode='42501';end if;
 if p_world is null or p_host_country is null or p_host_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or p_expected is null or p_expected!~'^(0|[1-9][0-9]*)$'then raise exception 'CAPTAIN_HISTORY_EXACT_SCOPE_REQUIRED'using errcode='22023';end if;
 perform set_config('econmind.captain_world',p_world,true);
 select x.world_version,x.event_sequence into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found or h.world_version::text<>p_expected or h.world_version>256 or h.event_sequence>256 then raise exception 'CAPTAIN_HISTORY_ACTUAL_BOUNDED_HEAD_REQUIRED'using errcode='55000';end if;
 select * into a from world_v2.runtime_opening_admission x where x.world_id=p_world and x.seed_fingerprint=p_fp and x.admission_ref=p_admission;
 if not found then raise exception 'CAPTAIN_HISTORY_ADMISSION_REQUIRED'using errcode='55000';end if;
 perform world_v2.captain_publication_admission(p_world,a.seed_id,p_fp,p_admission);
 if p_office='SOCIAL'then
  select x.registration_ref into host from world_v2.social_operating_source_registration x where x.world_id=p_world and x.country_id=p_host_country and x.seed_fingerprint=p_fp and x.admission_ref=p_admission for share;
  if not found or exists(select 1 from world_v2.social_operating_source_revocation x where x.registration_ref=host)then raise exception 'CAPTAIN_HISTORY_CURRENT_HOST_SOURCE_REQUIRED'using errcode='55000';end if;
 elsif p_office='FINANCE'then
  select x.policy_ref into host from world_v2.finance_budget_policy_original x where x.world_id=p_world and x.country_id=p_host_country and x.seed_fingerprint=p_fp and x.admission_ref=p_admission and not exists(select 1 from world_v2.finance_budget_policy_revocation r where r.policy_ref=x.policy_ref)order by x.policy_ref limit 1 for share;
  if not found then raise exception 'CAPTAIN_HISTORY_CURRENT_HOST_SOURCE_REQUIRED'using errcode='55000';end if;
 else
  select x.registration_ref into host from world_v2.postwar_day_one_fx_source_original x where x.world_id=p_world and x.seed_id=a.seed_id and x.seed_fingerprint=p_fp and x.admission_ref=p_admission for share;
  if not found or exists(select 1 from world_v2.postwar_day_one_fx_source_revocation x where x.registration_ref=host)or not exists(select 1 from world_v2.postwar_day_one_fx_quote_original q where q.world_id=p_world and q.country_id=p_host_country and not exists(select 1 from world_v2.postwar_day_one_fx_quote_revocation r where r.world_id=q.world_id and r.country_id=q.country_id))then raise exception 'CAPTAIN_HISTORY_CURRENT_HOST_SOURCE_REQUIRED'using errcode='55000';end if;
 end if;
 -- Presence is an actual custody lookup, never an exception fallback.
 select x.* into host_registry from world_v2.captain_source_publication_registry x where x.world_id=p_world and x.country_id=p_host_country;
 if not found then
  if exists(select 1 from world_v2.captain_operating_source_adoption x where x.world_id=p_world and x.country_id=p_host_country)then raise exception 'CAPTAIN_CURRENT_EXACT_REGISTRY_REQUIRED'using errcode='55000';end if;
  host_original_status:='NO_REGISTERED_CAPTAIN_ORIGINAL';
 else
  if host_registry.seed_fingerprint is distinct from p_fp or host_registry.world_admission_ref is distinct from p_admission then raise exception 'CAPTAIN_CURRENT_REGISTERED_SEED_MISMATCH'using errcode='55000';end if;
  select x.adoption_ref into host_adoption from world_v2.captain_operating_source_adoption x where x.adoption_ref=host_registry.adoption_ref and x.world_id=p_world and x.country_id=p_host_country and x.seed_fingerprint=p_fp;
  if not found then raise exception 'CAPTAIN_CURRENT_REGISTERED_BUT_NOT_PUBLISHED'using errcode='55000';end if;
  host_original_status:=case when exists(select 1 from world_v2.captain_operating_source_revocation x where x.adoption_ref=host_adoption)then'REVOKED'else'PRESENT'end;
 end if;
 -- History stays valid after Captain adoption revocation; only previously
 -- COMMITTED frames need these exact immutable origins. Current Captain reads
 -- still require their unrevoked source, and cannot use this history entry.
 select count(*),coalesce(sum(octet_length(x.packet_text)),0)into n,b from world_v2.captain_source_publication_registry x where x.world_id=p_world and(x.country_id=p_host_country or exists(select 1 from world_v2.command_submission c join world_v2.command_receipt cr on cr.world_id=c.world_id and cr.command_id=c.command_id and cr.outcome='COMMITTED'where c.world_id=p_world and c.country_id=x.country_id and c.command_type='CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1'));
 if n>70 or b>1048576 then raise exception 'CAPTAIN_HISTORY_BOUNDED_PACKETS_REQUIRED'using errcode='54000';end if;
 select coalesce(jsonb_agg(jsonb_build_object('packet_text',x.packet_text,'packet_sha256',x.packet_sha256,'originals',(select jsonb_object_agg(o.fact_ref,o.original_text)from world_v2.captain_operating_original o where o.adoption_ref=x.adoption_ref))order by x.country_id),'[]'::jsonb)into packets from world_v2.captain_source_publication_registry x where x.world_id=p_world and x.seed_fingerprint=p_fp and x.world_admission_ref=p_admission and(x.country_id=p_host_country or exists(select 1 from world_v2.command_submission c join world_v2.command_receipt cr on cr.world_id=c.world_id and cr.command_id=c.command_id and cr.outcome='COMMITTED'where c.world_id=p_world and c.country_id=x.country_id and c.command_type='CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1'));
 return query select h.world_version::text,h.event_sequence::text,p_fp,p_admission,packets,host_original_status;
end;$$;
alter function world_v2.read_postwar_captain_history_originals(text,text,text,text,text,text)owner to world_v2_captain_source_owner;
revoke all on function world_v2.read_postwar_captain_history_originals(text,text,text,text,text,text)from public;
grant execute on function world_v2.read_postwar_captain_history_originals(text,text,text,text,text,text)to world_v2_social_source_reader,world_v2_finance_budget_source_reader,world_v2_day_one_fx_source_reader;
revoke create on schema world_v2 from world_v2_captain_source_owner;
commit;
