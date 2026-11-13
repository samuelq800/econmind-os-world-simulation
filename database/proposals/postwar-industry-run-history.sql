-- CANDIDATE ONLY. Committed Industry rule-original DATA for complete mixed
-- replay. No new role/membership, raw seed, work issuance or execution grant.
-- Requires postwar-industry-first-day-source and Social custody registrations.
begin;
grant create on schema world_v2 to world_v2_industry_source_owner;
grant select on world_v2.finance_budget_policy_original,world_v2.finance_budget_policy_revocation to world_v2_industry_source_owner;
grant update(policy_ref)on world_v2.finance_budget_policy_original to world_v2_industry_source_owner;
create policy industry_history_finance_host_read on world_v2.finance_budget_policy_original for select to world_v2_industry_source_owner using(world_id=current_setting('econmind.industry_source_world',true));
create policy industry_history_finance_host_lock on world_v2.finance_budget_policy_original for update to world_v2_industry_source_owner using(world_id=current_setting('econmind.industry_source_world',true))with check(false);
create policy industry_history_finance_host_lock_fence on world_v2.finance_budget_policy_original as restrictive for update to world_v2_industry_source_owner using(world_id=current_setting('econmind.industry_source_world',true))with check(false);
create policy industry_history_finance_revocation_read on world_v2.finance_budget_policy_revocation for select to world_v2_industry_source_owner using(exists(select 1 from world_v2.finance_budget_policy_original p where p.policy_ref=finance_budget_policy_revocation.policy_ref and p.world_id=current_setting('econmind.industry_source_world',true)));

grant select on world_v2.authoritative_event,world_v2.inventory_posting to world_v2_industry_source_owner;
do $$declare t text;begin foreach t in array array['authoritative_event','inventory_posting']loop
 execute format('create policy industry_run_history_read on world_v2.%I for select to world_v2_industry_source_owner using(world_id=current_setting(''econmind.industry_source_world'',true))',t);
 execute format('create policy industry_run_history_read_fence on world_v2.%I as restrictive for select to world_v2_industry_source_owner using(world_id=current_setting(''econmind.industry_source_world'',true))',t);
end loop;end;$$;

grant select on world_v2.social_operating_source_registration,world_v2.social_operating_source_revocation to world_v2_industry_source_owner;
grant update(registration_ref)on world_v2.social_operating_source_registration to world_v2_industry_source_owner;
create policy industry_history_host_read on world_v2.social_operating_source_registration for select to world_v2_industry_source_owner using(world_id=current_setting('econmind.industry_source_world',true));
create policy industry_history_host_lock on world_v2.social_operating_source_registration for update to world_v2_industry_source_owner using(world_id=current_setting('econmind.industry_source_world',true))with check(false);
create policy industry_history_host_lock_fence on world_v2.social_operating_source_registration as restrictive for update to world_v2_industry_source_owner using(world_id=current_setting('econmind.industry_source_world',true))with check(false);
create policy industry_history_host_revocation_read on world_v2.social_operating_source_revocation for select to world_v2_industry_source_owner using(exists(select 1 from world_v2.social_operating_source_registration p where p.registration_ref=social_operating_source_revocation.registration_ref and p.world_id=current_setting('econmind.industry_source_world',true)));
create function world_v2.read_postwar_industry_run_original(p_world text,p_host_country text,p_office text,p_command text,p_fingerprint text,p_version bigint,p_sequence bigint,p_seed_fingerprint text,p_admission text)
returns table(source_text text,source_sha256 text,source_ref text,world_version text,event_sequence text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;required name;h record;a world_v2.runtime_opening_admission%rowtype;host text;c world_v2.command_submission%rowtype;rc world_v2.command_receipt%rowtype;e record;body jsonb;facility text;ref text;rawsha text;s world_v2.postwar_industry_first_day_source%rowtype;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 required:=case p_office when 'SOCIAL'then 'world_v2_social_source_reader'when 'FINANCE'then 'world_v2_finance_budget_source_reader'else null end;
 if required is null or effective<>required or exists(select 1 from pg_roles r where r.rolname=effective and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')then raise exception 'INDUSTRY_HISTORY_FIXED_SOCIAL_DATA_READER_REQUIRED'using errcode='42501';end if;
 if current_setting('transaction_isolation')not in('repeatable read','serializable')then raise exception 'INDUSTRY_HISTORY_HELD_REPEATABLE_TRANSACTION_REQUIRED'using errcode='25001';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 select h0.world_version,h0.event_sequence into h from world_v2.world_head h0 where h0.world_id=p_world for share;
 if not found or h.world_version<>p_version or h.event_sequence<>p_sequence then raise exception 'INDUSTRY_HISTORY_ACTUAL_HELD_HEAD_REQUIRED'using errcode='55000';end if;
 a:=world_v2.industry_source_admission(p_world);
 if a.seed_fingerprint is distinct from p_seed_fingerprint or a.admission_ref is distinct from p_admission then raise exception 'INDUSTRY_HISTORY_ACTUAL_ADMISSION_REQUIRED'using errcode='55000';end if;
 if p_office='SOCIAL'then
 select r.registration_ref into host from world_v2.social_operating_source_registration r where r.world_id=p_world and r.country_id=p_host_country and r.seed_fingerprint=a.seed_fingerprint and r.admission_ref=a.admission_ref for share;
 if not found or exists(select 1 from world_v2.social_operating_source_revocation v where v.registration_ref=host)then raise exception 'INDUSTRY_HISTORY_CURRENT_HOST_SOURCE_REVOKED'using errcode='55000';end if;
 else
 select r.policy_ref into host from world_v2.finance_budget_policy_original r where r.world_id=p_world and r.country_id=p_host_country and r.seed_fingerprint=a.seed_fingerprint and r.admission_ref=a.admission_ref and not exists(select 1 from world_v2.finance_budget_policy_revocation v where v.policy_ref=r.policy_ref)order by r.policy_ref limit 1 for share;
 if not found then raise exception 'INDUSTRY_HISTORY_CURRENT_HOST_SOURCE_REVOKED'using errcode='55000';end if;
 end if;
 select * into c from world_v2.command_submission x where x.world_id=p_world and x.command_id=p_command and x.command_fingerprint=p_fingerprint;
 if not found or c.command_type not in('CORE_INDUSTRY_RUN_SCHEDULE_V1','CORE_INDUSTRY_FIRST_DAY_WORK_V1')then raise exception 'INDUSTRY_HISTORY_ACTUAL_STAGE_COMMAND_REQUIRED'using errcode='55000';end if;
 select * into rc from world_v2.command_receipt x where x.world_id=p_world and x.command_id=p_command and x.outcome='COMMITTED'and x.world_version_after<=p_version;
 if not found or jsonb_array_length(rc.event_ids)<>1 or exists(select 1 from world_v2.financial_posting_batch x where x.world_id=p_world and x.causation_command_id=p_command)or exists(select 1 from world_v2.inventory_posting x where x.world_id=p_world and x.causation_command_id=p_command)then raise exception 'INDUSTRY_HISTORY_COMMITTED_ZERO_POSTING_STAGE_REQUIRED'using errcode='55000';end if;
 select ev.event_type,ev.canonical_payload into e from world_v2.authoritative_event ev where ev.world_id=p_world and ev.causation_command_id=p_command and ev.event_id=rc.event_ids->>0 and ev.world_version=rc.world_version_after and ev.event_sequence<=p_sequence;
 if not found then raise exception 'INDUSTRY_HISTORY_ACTUAL_STAGE_EVENT_REQUIRED'using errcode='55000';end if;
 body:=e.canonical_payload::jsonb;
 if c.command_type='CORE_INDUSTRY_RUN_SCHEDULE_V1'and e.event_type='INDUSTRY_FIRST_DAY_RUN_SCHEDULED_V1'then facility:=body->'terms'->>'facilityId';ref:=body->'source'->>'sourceRef';rawsha:=body->'source'->>'sourceRawSha256';
 elsif c.command_type='CORE_INDUSTRY_FIRST_DAY_WORK_V1'and e.event_type='INDUSTRY_FIRST_DAY_WORK_COMPLETED_V1'then facility:=body->>'facilityId';ref:=body->'policy'->>'sourceRef';rawsha:=body->'policy'->>'sourceRawSha256';
 else raise exception 'INDUSTRY_HISTORY_EXACT_STAGE_FAMILY_REQUIRED'using errcode='23514';end if;
 select * into s from world_v2.postwar_industry_first_day_source x where x.world_id=p_world and x.country_id=c.country_id and x.facility_id=facility and x.source_ref=ref and x.source_sha256=rawsha and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref for share;
 if not found or s.source_sha256<>encode(sha256(convert_to(s.source_text,'UTF8')),'hex')then raise exception 'INDUSTRY_HISTORY_EXACT_IMMUTABLE_RULE_ORIGINAL_REQUIRED'using errcode='55000';end if;
 -- Historical source revocation cannot erase committed work. New actions still
 -- use read_postwar_industry_first_day_source, which rejects that revocation.
 return query select s.source_text,s.source_sha256,s.source_ref,h.world_version::text,h.event_sequence::text;
end;$$;
alter function world_v2.read_postwar_industry_run_original(text,text,text,text,text,bigint,bigint,text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.read_postwar_industry_run_original(text,text,text,text,text,bigint,bigint,text,text)from public;
grant execute on function world_v2.read_postwar_industry_run_original(text,text,text,text,text,bigint,bigint,text,text)to world_v2_social_source_reader,world_v2_finance_budget_source_reader;
revoke create on schema world_v2 from world_v2_industry_source_owner;
commit;
