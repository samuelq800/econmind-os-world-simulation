-- SOURCE-ONLY replay extension; not a production migration/installation.
-- No account, balance, command, membership, login, publisher or current quote
-- capability is created. Existing fixed source readers receive one DATA read.
begin;
do $$begin
 if not exists(select 1 from pg_roles where rolname='world_v2_day_one_fx_history_owner')then create role world_v2_day_one_fx_history_owner nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;end if;
 if exists(select 1 from pg_roles where rolname='world_v2_day_one_fx_history_owner'and(rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))then raise exception 'FX_HISTORY_UNSAFE_OWNER'using errcode='42501';end if;
end;$$;
grant usage,create on schema world_v2 to world_v2_day_one_fx_history_owner;
grant select on world_v2.world_head,world_v2.runtime_opening_admission,world_v2.runtime_admission_publication_permit,world_v2.runtime_admission_publication_revocation,world_v2.current_commit_authorization,world_v2.runtime_read_seat,world_v2.projection_entitlement to world_v2_day_one_fx_history_owner;
-- Header only; neither this owner nor any operational reader receives the
-- raw canonical seed. Quote original reads are bounded to the caller's trace.
grant select(world_id,seed_id,seed_fingerprint,replay_binding)on world_v2.opening_seed to world_v2_day_one_fx_history_owner;
grant select(world_id,registration_ref,seed_id,seed_fingerprint,admission_ref,policy_sha256,user_receipt_sha256)on world_v2.postwar_day_one_fx_source_original to world_v2_day_one_fx_history_owner;
grant update(registration_ref)on world_v2.postwar_day_one_fx_source_original to world_v2_day_one_fx_history_owner;
create policy fx_history_original_lock on world_v2.postwar_day_one_fx_source_original for update to world_v2_day_one_fx_history_owner using(current_user='world_v2_day_one_fx_history_owner'and world_id=current_setting('econmind.fx_history_world',true))with check(false);
grant select on world_v2.postwar_day_one_fx_quote_original to world_v2_day_one_fx_history_owner;
grant select(world_id,event_id,event_type,causation_command_id,canonical_payload,payload_sha256,world_version,event_sequence,sim_time)on world_v2.authoritative_event to world_v2_day_one_fx_history_owner;
grant select(world_id,command_id,command_type,country_id,office_id,command_fingerprint,canonical_payload,expected_world_version,sim_time)on world_v2.command_submission to world_v2_day_one_fx_history_owner;
grant select(world_id,command_id,command_fingerprint,outcome,reason_code,world_version_before,world_version_after,event_ids,sim_time)on world_v2.command_receipt to world_v2_day_one_fx_history_owner;
grant update(world_version)on world_v2.world_head to world_v2_day_one_fx_history_owner;
grant update(seed_id)on world_v2.runtime_opening_admission to world_v2_day_one_fx_history_owner;
grant update(authorization_id)on world_v2.runtime_admission_publication_permit to world_v2_day_one_fx_history_owner;
do $$declare t text;begin
 foreach t in array array['world_head','opening_seed','runtime_opening_admission','current_commit_authorization','runtime_read_seat','projection_entitlement','postwar_day_one_fx_source_original','postwar_day_one_fx_quote_original','authoritative_event','command_submission','command_receipt']loop
  execute format('create policy fx_history_read on world_v2.%I for select to world_v2_day_one_fx_history_owner using(current_user=''world_v2_day_one_fx_history_owner''and world_id=current_setting(''econmind.fx_history_world'',true))',t);
  execute format('create policy fx_history_read_fence on world_v2.%I as restrictive for select to world_v2_day_one_fx_history_owner using(current_user=''world_v2_day_one_fx_history_owner''and world_id=current_setting(''econmind.fx_history_world'',true))',t);
 end loop;
 foreach t in array array['world_head','runtime_opening_admission']loop
  execute format('create policy fx_history_lock on world_v2.%I for update to world_v2_day_one_fx_history_owner using(current_user=''world_v2_day_one_fx_history_owner''and world_id=current_setting(''econmind.fx_history_world'',true))with check(false)',t);
  execute format('create policy fx_history_lock_fence on world_v2.%I as restrictive for update to world_v2_day_one_fx_history_owner using(current_user=''world_v2_day_one_fx_history_owner''and world_id=current_setting(''econmind.fx_history_world'',true))with check(false)',t);
 end loop;
 -- Optional domain installations remain closed until their real source
 -- tables/roles exist. No fallback, caller source record or role enrollment.
 foreach t in array array['social_operating_source_registration','social_operating_source_revocation','finance_budget_policy_original','finance_budget_policy_revocation']loop
  if to_regclass('world_v2.'||t)is not null then
   execute format('grant select on world_v2.%I to world_v2_day_one_fx_history_owner',t);
   if t in('social_operating_source_registration','finance_budget_policy_original')then
    execute format('grant update(%I)on world_v2.%I to world_v2_day_one_fx_history_owner',case t when 'social_operating_source_registration'then 'registration_ref'else 'policy_ref'end,t);
    execute format('create policy fx_history_host_read on world_v2.%I for select to world_v2_day_one_fx_history_owner using(current_user=''world_v2_day_one_fx_history_owner''and world_id=current_setting(''econmind.fx_history_world'',true))',t);
    execute format('create policy fx_history_host_read_fence on world_v2.%I as restrictive for select to world_v2_day_one_fx_history_owner using(current_user=''world_v2_day_one_fx_history_owner''and world_id=current_setting(''econmind.fx_history_world'',true))',t);
    execute format('create policy fx_history_host_lock on world_v2.%I for update to world_v2_day_one_fx_history_owner using(current_user=''world_v2_day_one_fx_history_owner''and world_id=current_setting(''econmind.fx_history_world'',true))with check(false)',t);
   end if;
  end if;
 end loop;
end;$$;
create function world_v2.read_postwar_day_one_fx_committed_quote(p_world text,p_host_country text,p_source_country text,p_office text,p_seed_fingerprint text,p_admission_ref text,p_event_id text,p_event_payload_hash text,p_quote_ref text,p_quote_sha256 text,p_purpose text)
returns table(host_country_id text,source_country_id text,office_id text,host_source_ref text,registration_ref text,source_revision text,seed_id text,seed_fingerprint text,admission_ref text,quote_text text,quote_text_sha256 text,event_id text,event_payload_hash text,command_id text,command_fingerprint text,frame_world_version text,frame_event_sequence text,observed_world_version text,observed_event_sequence text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;required name;role_id oid;a world_v2.runtime_opening_admission%rowtype;permit world_v2.runtime_admission_publication_permit%rowtype;
 h record;host_ref text;s record;q record;e record;c record;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 required:=case p_office when 'SOCIAL'then 'world_v2_social_source_reader'when 'FINANCE'then case when p_purpose='TREASURY_FX_SOURCE_REPLAY'then 'world_v2_day_one_fx_source_reader'else 'world_v2_finance_budget_source_reader'end else null end;
 select oid into role_id from pg_roles where rolname=required;
 if required is null or role_id is null or not pg_has_role(effective,role_id,'MEMBER')or
 exists(select 1 from pg_roles x where x.rolname=effective and(x.rolsuper or x.rolbypassrls or x.rolcreatedb or x.rolcreaterole or x.rolreplication))or
 exists(select 1 from pg_roles x where x.rolname in('world_v2_day_one_fx_history_owner','world_v2_day_one_fx_source_owner','world_v2_day_one_fx_source_publisher','world_v2_social_source_owner','world_v2_social_source_publisher','world_v2_finance_budget_source_owner','world_v2_finance_budget_source_publisher')and pg_has_role(effective,x.oid,'MEMBER'))then raise exception 'FX_HISTORY_FIXED_SOURCE_READER_REQUIRED'using errcode='42501';end if;
 if p_purpose is null or p_purpose not in('SOURCE_REPLAY','TREASURY_FX_SOURCE_REPLAY')or(p_purpose='TREASURY_FX_SOURCE_REPLAY'and p_office<>'FINANCE')or p_world is null or p_world!~'^[A-Z][A-Z0-9_]*$'or
 p_host_country is null or p_host_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or p_source_country is null or p_source_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or
 p_seed_fingerprint is null or p_seed_fingerprint!~'^sha256:[a-f0-9]{64}$'or p_admission_ref is null or p_event_id is null or
 p_event_payload_hash is null or p_event_payload_hash!~'^sha256:[a-f0-9]{64}$'or p_quote_ref is null or p_quote_sha256 is null or p_quote_sha256!~'^[a-f0-9]{64}$'then raise exception 'FX_HISTORY_EXACT_REPLAY_SCOPE_REQUIRED'using errcode='22023';end if;
 perform set_config('econmind.fx_history_world',p_world,true);
 select x.world_version,x.event_sequence into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found then raise exception 'FX_HISTORY_ACTUAL_HEAD_REQUIRED'using errcode='55000';end if;
 select * into a from world_v2.runtime_opening_admission x where x.world_id=p_world and x.seed_fingerprint=p_seed_fingerprint and x.admission_ref=p_admission_ref for share;
 if not found or not exists(select 1 from world_v2.opening_seed x where x.world_id=a.world_id and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.replay_binding=a.replay_binding and x.replay_binding::jsonb->>'modelVersion'=a.model_version)then raise exception 'FX_HISTORY_ACTUAL_IMMUTABLE_ADMISSION_REQUIRED'using errcode='55000';end if;
 select * into permit from world_v2.runtime_admission_publication_permit x where 'ADMISSION_'||upper(x.authorization_sha256)=a.admission_ref and x.world_id=a.world_id and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.model_version=a.model_version and x.replay_binding=a.replay_binding and a.admitted_at_real>=x.valid_from and a.admitted_at_real<x.valid_until for share;
 if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation x where x.authorization_id=permit.authorization_id)then raise exception 'FX_HISTORY_CURRENT_WORLD_ADMISSION_REVOKED'using errcode='55000';end if;
 if p_purpose='TREASURY_FX_SOURCE_REPLAY'then
  select x.registration_ref into host_ref from world_v2.postwar_day_one_fx_source_original x where x.world_id=p_world and x.seed_id=a.seed_id and x.seed_fingerprint=p_seed_fingerprint and x.admission_ref=p_admission_ref for share;
  if not found or not exists(select 1 from world_v2.postwar_day_one_fx_quote_original x where x.world_id=p_world and x.country_id=p_host_country)then raise exception 'FX_HISTORY_CURRENT_HOST_SOURCE_REQUIRED'using errcode='55000';end if;
 elsif p_office='SOCIAL'then
  if to_regclass('world_v2.social_operating_source_registration')is null or to_regclass('world_v2.social_operating_source_revocation')is null then raise exception 'FX_HISTORY_CURRENT_HOST_SOURCE_REQUIRED'using errcode='55000';end if;
  select x.registration_ref into host_ref from world_v2.social_operating_source_registration x where x.world_id=p_world and x.country_id=p_host_country and x.seed_fingerprint=p_seed_fingerprint and x.admission_ref=p_admission_ref for share;
  if not found or exists(select 1 from world_v2.social_operating_source_revocation x where x.registration_ref=host_ref)then raise exception 'FX_HISTORY_CURRENT_HOST_SOURCE_REVOKED'using errcode='55000';end if;
 else
  if to_regclass('world_v2.finance_budget_policy_original')is null or to_regclass('world_v2.finance_budget_policy_revocation')is null then raise exception 'FX_HISTORY_CURRENT_HOST_SOURCE_REQUIRED'using errcode='55000';end if;
  select x.policy_ref into host_ref from world_v2.finance_budget_policy_original x where x.world_id=p_world and x.country_id=p_host_country and x.seed_fingerprint=p_seed_fingerprint and x.admission_ref=p_admission_ref and not exists(select 1 from world_v2.finance_budget_policy_revocation revoked where revoked.policy_ref=x.policy_ref)order by x.policy_ref limit 1 for share;
  if not found then raise exception 'FX_HISTORY_CURRENT_HOST_SOURCE_REVOKED'using errcode='55000';end if;
 end if;
 -- These two originals are immutable. Deliberately do NOT consult their
 -- revocation tables or today's quote validity: the committed event is past.
 select x.registration_ref,x.seed_id,x.seed_fingerprint,x.admission_ref into s from world_v2.postwar_day_one_fx_source_original x where x.world_id=p_world and x.seed_id=a.seed_id and x.seed_fingerprint=p_seed_fingerprint and x.admission_ref=p_admission_ref;
 if not found then raise exception 'FX_HISTORY_ADMITTED_FX_ORIGINAL_REQUIRED'using errcode='55000';end if;
 select x.source_revision,x.quote_text,x.quote_text_sha256 into q from world_v2.postwar_day_one_fx_quote_original x where x.world_id=p_world and x.country_id=p_source_country and x.quote_ref=p_quote_ref and octet_length(x.quote_text)<=4096;
 if not found or q.quote_text_sha256<>encode(sha256(convert_to(q.quote_text,'UTF8')),'hex')or q.quote_text::jsonb->>'quoteSha256'is distinct from p_quote_sha256 or q.quote_text::jsonb->>'seedFingerprint'is distinct from p_seed_fingerprint or q.quote_text::jsonb->>'worldId'is distinct from p_world or q.quote_text::jsonb->>'countryId'is distinct from p_source_country or q.quote_text::jsonb->>'quoteRef'is distinct from p_quote_ref then raise exception 'FX_HISTORY_EXACT_IMMUTABLE_QUOTE_REQUIRED'using errcode='55000';end if;
 select x.event_id,x.causation_command_id,x.canonical_payload,x.payload_sha256,x.world_version,x.event_sequence,x.sim_time into e from world_v2.authoritative_event x where x.world_id=p_world and x.event_id=p_event_id and x.event_type='POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_V1'and x.payload_sha256=p_event_payload_hash and x.world_version<=h.world_version and x.event_sequence<=h.event_sequence and octet_length(x.canonical_payload)<=65536;
 if not found or e.payload_sha256<>'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||e.canonical_payload,'UTF8')),'hex')or e.canonical_payload::jsonb->'quote'is distinct from q.quote_text::jsonb then raise exception 'FX_HISTORY_EXACT_CANONICAL_EVENT_REQUIRED'using errcode='55000';end if;
 select x.command_id,x.command_fingerprint,x.canonical_payload,x.expected_world_version,x.sim_time into c from world_v2.command_submission x where x.world_id=p_world and x.command_id=e.causation_command_id and x.country_id=p_source_country and x.office_id='FINANCE'and x.command_type='POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'and octet_length(x.canonical_payload)<=16384;
 if not found or c.canonical_payload::jsonb->>'quoteRef'is distinct from p_quote_ref or c.canonical_payload::jsonb->>'expectedQuoteSha256'is distinct from p_quote_sha256 then raise exception 'FX_HISTORY_EXACT_CANONICAL_COMMAND_REQUIRED'using errcode='55000';end if;
 perform 1 from world_v2.command_receipt x where x.world_id=p_world and x.command_id=c.command_id and x.command_fingerprint=c.command_fingerprint and x.outcome='COMMITTED'and x.reason_code is null and x.world_version_before=c.expected_world_version and x.world_version_after=x.world_version_before+1 and x.world_version_after=e.world_version and x.event_ids=jsonb_build_array(e.event_id)and x.sim_time=c.sim_time and x.sim_time=e.sim_time;
 if not found then raise exception 'FX_HISTORY_EXACT_COMMITTED_RECEIPT_REQUIRED'using errcode='55000';end if;
 return query select p_host_country,p_source_country,p_office,host_ref,s.registration_ref,q.source_revision,s.seed_id,s.seed_fingerprint,s.admission_ref,q.quote_text,q.quote_text_sha256,e.event_id,e.payload_sha256,c.command_id,c.command_fingerprint,e.world_version::text,e.event_sequence::text,h.world_version::text,h.event_sequence::text;
end;$$;
alter function world_v2.read_postwar_day_one_fx_committed_quote(text,text,text,text,text,text,text,text,text,text,text)owner to world_v2_day_one_fx_history_owner;
revoke all on function world_v2.read_postwar_day_one_fx_committed_quote(text,text,text,text,text,text,text,text,text,text,text)from public;
do $$declare r text;begin
 foreach r in array array['world_v2_social_source_reader','world_v2_finance_budget_source_reader','world_v2_day_one_fx_source_reader']loop
  if exists(select 1 from pg_roles where rolname=r)then
   execute format('grant execute on function world_v2.read_postwar_day_one_fx_committed_quote(text,text,text,text,text,text,text,text,text,text,text)to %I',r);
  end if;
 end loop;
end;$$;
revoke create on schema world_v2 from world_v2_day_one_fx_history_owner;
commit;
