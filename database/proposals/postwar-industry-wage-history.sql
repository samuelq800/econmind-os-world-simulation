-- Fixed committed WORK original DATA. No work/payment issuer or source grant.
-- Depends on postwar-industry-run-history.sql (9-param office-scoped RPC).
-- Source-revocation-fence must be installed after selected custody before use.
begin;
grant create on schema world_v2 to world_v2_industry_source_owner;
create function world_v2.read_postwar_industry_completed_work_original(p_world text,p_host_country text,p_office text,p_source_country text,p_event text,p_event_fingerprint text,p_version bigint,p_sequence bigint,p_seed_fingerprint text,p_admission text)
returns table(work_body_text text,work_body_sha256 text,work_command_id text,work_command_fingerprint text,work_event_id text,work_event_fingerprint text,work_world_version text,work_event_sequence text,run_maximum_expense_amount text,run_maximum_expense_currency text,source_text text,source_sha256 text,source_ref text,world_version text,event_sequence text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;required name;h record;a world_v2.runtime_opening_admission%rowtype;c world_v2.command_submission%rowtype;r world_v2.command_receipt%rowtype;e world_v2.authoritative_event%rowtype;sc world_v2.command_submission%rowtype;sr world_v2.command_receipt%rowtype;original record;body jsonb;schedule jsonb;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 required:=case p_office when'SOCIAL'then'world_v2_social_source_reader'when'FINANCE'then'world_v2_finance_budget_source_reader'else null end;
 if required is null or effective<>required or exists(select 1 from pg_roles x where x.rolname=effective and(x.rolsuper or x.rolbypassrls or x.rolcreatedb or x.rolcreaterole or x.rolreplication))or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')then raise exception 'INDUSTRY_WAGE_FIXED_HOST_READER_REQUIRED'using errcode='42501';end if;
 if p_world is null or p_world!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or p_host_country is null or p_host_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or p_source_country is null or p_source_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or p_event_fingerprint is null or p_event_fingerprint!~'^sha256:[0-9a-f]{64}$'then raise exception 'INDUSTRY_WAGE_EXACT_SCOPE_REQUIRED'using errcode='22023';end if;
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 perform set_config('econmind.industry_source_world',p_world,true);
 select x.world_version,x.event_sequence into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found or h.world_version<>p_version or h.event_sequence<>p_sequence then raise exception 'INDUSTRY_WAGE_ACTUAL_HELD_HEAD_REQUIRED'using errcode='55000';end if;
 a:=world_v2.industry_source_admission(p_world);
 if a.seed_fingerprint is distinct from p_seed_fingerprint or a.admission_ref is distinct from p_admission then raise exception 'INDUSTRY_WAGE_ACTUAL_ADMISSION_REQUIRED'using errcode='55000';end if;
 select * into e from world_v2.authoritative_event x where x.world_id=p_world and x.event_id=p_event and x.event_fingerprint=p_event_fingerprint and x.event_type='INDUSTRY_FIRST_DAY_WORK_COMPLETED_V1'and x.corrects_event_id is null and x.world_version<=p_version and x.event_sequence<=p_sequence;
 if not found or octet_length(e.canonical_payload)>65536 or e.payload_sha256 is distinct from 'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||e.canonical_payload)then raise exception 'INDUSTRY_WAGE_ACTUAL_COMPLETED_WORK_REQUIRED'using errcode='55000';end if;
 select * into c from world_v2.command_submission x where x.world_id=p_world and x.command_id=e.causation_command_id and x.country_id=p_source_country and x.command_type='CORE_INDUSTRY_FIRST_DAY_WORK_V1'and x.office_id is null;
 if not found then raise exception 'INDUSTRY_WAGE_ACTUAL_WORK_COMMAND_REQUIRED'using errcode='55000';end if;
 select * into r from world_v2.command_receipt x where x.world_id=p_world and x.command_id=c.command_id and x.outcome='COMMITTED'and x.reason_code is null and x.world_version_after=e.world_version and x.world_version_before=c.expected_world_version and x.world_version_after=x.world_version_before+1 and x.event_ids=jsonb_build_array(e.event_id)and x.command_fingerprint=c.command_fingerprint and x.sim_time=c.sim_time;
 if not found or e.sim_time<>c.sim_time or e.correlation_id is distinct from c.correlation_id or exists(select 1 from world_v2.financial_posting_batch x where x.world_id=p_world and x.causation_command_id=c.command_id)or exists(select 1 from world_v2.inventory_posting x where x.world_id=p_world and x.causation_command_id=c.command_id)then raise exception 'INDUSTRY_WAGE_PRIOR_COMMITTED_ZERO_POSTING_WORK_REQUIRED'using errcode='55000';end if;
 body:=e.canonical_payload::jsonb;
 if e.canonical_payload<>world_v2.canonical_json(body)or body->>'schemaVersion'is distinct from'postwar-industry-completed-work-v1'or body->>'worldId'is distinct from p_world or body->>'countryId'is distinct from p_source_country or body->>'seedId'is distinct from a.seed_id or body->>'seedFingerprint'is distinct from a.seed_fingerprint or body->>'admissionRef'is distinct from a.admission_ref or body->>'completedAtSimTime'is distinct from c.sim_time::text or jsonb_typeof(body->'allocations')is distinct from'array'or jsonb_array_length(body->'allocations')<1 or jsonb_array_length(body->'allocations')>64 then raise exception 'INDUSTRY_WAGE_EXACT_IMMUTABLE_WORK_BODY_REQUIRED'using errcode='23514';end if;
 select * into sc from world_v2.command_submission x where x.world_id=p_world and x.country_id=p_source_country and x.command_id=body->'schedule'->>'commandId'and x.command_fingerprint=body->'schedule'->>'commandFingerprint'and x.command_type='CORE_INDUSTRY_RUN_SCHEDULE_V1'and x.office_id='INDUSTRY';
 if not found then raise exception 'INDUSTRY_WAGE_ACTUAL_RUN_ORIGINAL_REQUIRED'using errcode='55000';end if;
 select * into sr from world_v2.command_receipt x where x.world_id=p_world and x.command_id=sc.command_id and x.command_fingerprint=sc.command_fingerprint and x.outcome='COMMITTED'and x.world_version_after<r.world_version_after and x.event_ids=jsonb_build_array(body->'schedule'->>'eventId');
 schedule:=sc.canonical_payload::jsonb;
 if not found or schedule->>'runId'is distinct from body->>'runId'or schedule->>'facilityId'is distinct from body->>'facilityId'or schedule->>'schemaVersion'is distinct from'postwar-industry-run-schedule-v1'or jsonb_typeof(schedule->'maximumExpense')is distinct from'object'then raise exception 'INDUSTRY_WAGE_EXACT_RUN_CEILING_REQUIRED'using errcode='23514';end if;
 -- Fixed historical source function checks current host/policy/admission and
 -- the exact immutable rule referenced by this real committed WORK. Revoking
 -- an old execution rule does not erase an earned obligation.
 select * into strict original from world_v2.read_postwar_industry_run_original(p_world,p_host_country,p_office,c.command_id,c.command_fingerprint,p_version,p_sequence,p_seed_fingerprint,p_admission);
 return query select e.canonical_payload,e.payload_sha256,c.command_id,c.command_fingerprint,e.event_id,e.event_fingerprint,e.world_version::text,e.event_sequence::text,schedule->'maximumExpense'->>'amount',schedule->'maximumExpense'->>'currency',original.source_text,original.source_sha256,original.source_ref,h.world_version::text,h.event_sequence::text;
end;$$;
alter function world_v2.read_postwar_industry_completed_work_original(text,text,text,text,text,text,bigint,bigint,text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.read_postwar_industry_completed_work_original(text,text,text,text,text,text,bigint,bigint,text,text)from public;
grant execute on function world_v2.read_postwar_industry_completed_work_original(text,text,text,text,text,text,bigint,bigint,text,text)to world_v2_social_source_reader,world_v2_finance_budget_source_reader;
revoke create on schema world_v2 from world_v2_industry_source_owner;
commit;
