-- Candidate automatic WORK cutoff. A claimed canonical task fulfils a real
-- COMMITTED run; no user proof is manufactured and no issuer is granted here.
-- Depends on Industry run custody, firstday source and immutable command rows.
begin;
grant create on schema world_v2 to world_v2_industry_source_owner;
grant select on world_v2.command_queue to world_v2_industry_source_owner;
grant update(command_id)on world_v2.command_queue to world_v2_industry_source_owner;
create policy industry_work_queue_read on world_v2.command_queue for select to world_v2_industry_source_owner using(world_id=current_setting('econmind.industry_source_world',true));
create policy industry_work_queue_fence on world_v2.command_queue as restrictive for select to world_v2_industry_source_owner using(world_id=current_setting('econmind.industry_source_world',true));
create policy industry_work_queue_lock on world_v2.command_queue for update to world_v2_industry_source_owner using(world_id=current_setting('econmind.industry_source_world',true))with check(false);
create policy industry_work_queue_lock_fence on world_v2.command_queue as restrictive for update to world_v2_industry_source_owner using(world_id=current_setting('econmind.industry_source_world',true))with check(false);
create function world_v2.lock_postwar_industry_work_scope(p_world text,p_command text,p_fingerprint text,p_worker text,p_at timestamptz,p_sim text)
returns table(world_version text,event_sequence text,holder_id text,fencing_token text,acquired_at_real text,renewed_at_real text,lease_expires_at_real text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;l world_v2.world_writer_lease%rowtype;h world_v2.world_head%rowtype;c world_v2.command_submission%rowtype;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_reader'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')or pg_has_role(session_user,'world_v2_industry_source_publisher','MEMBER')or exists(select 1 from pg_roles r where r.rolname=session_user and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))then raise exception 'INDUSTRY_WORK_FIXED_READER_REQUIRED'using errcode='42501';end if;
 if current_setting('transaction_isolation')not in('repeatable read','serializable')or current_setting('transaction_read_only')<>'off'or p_sim is null or p_sim!~'^(0|[1-9][0-9]*)$'or p_at is null or not isfinite(p_at)then raise exception 'INDUSTRY_WORK_HELD_RR_EXACT_TIME_REQUIRED'using errcode='25001';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 select * into l from world_v2.world_writer_lease x where x.world_id=p_world and x.holder_id=p_worker and x.acquired_at_real<=p_at and x.renewed_at_real<=p_at and x.lease_expires_at_real>p_at for share;
 if not found then raise exception 'INDUSTRY_WORK_CURRENT_LEASE_REQUIRED'using errcode='55000';end if;
 select * into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found then raise exception 'INDUSTRY_WORK_CURRENT_HEAD_REQUIRED'using errcode='55000';end if;
 select * into c from world_v2.command_submission x where x.world_id=p_world and x.command_id=p_command and x.command_fingerprint=p_fingerprint;
 if not found or c.command_type<>'CORE_INDUSTRY_FIRST_DAY_WORK_V1'or c.office_id is not null or c.expected_world_version is distinct from h.world_version or c.sim_time::text<>p_sim then raise exception 'INDUSTRY_WORK_ACTUAL_DUE_CANONICAL_COMMAND_REQUIRED'using errcode='55000';end if;
 perform 1 from world_v2.command_queue q where q.world_id=p_world and q.command_id=p_command and q.authority_kind='VERSIONED_AUTOMATIC'and q.queue_state='CLAIMED'and q.claimed_by=p_worker and q.claim_fencing_token=l.fencing_token and q.available_at_sim_time<=p_sim::numeric for share;
 if not found or exists(select 1 from world_v2.command_receipt r where r.world_id=p_world and r.command_id=p_command)then raise exception 'INDUSTRY_WORK_ACTUAL_UNFINISHED_FENCED_CLAIM_REQUIRED'using errcode='55000';end if;
 -- Full actual schedule/frame/worker-time/source replay is independently held
 -- by the fixed Worker source on this same executor before the Atomic guard.
 return query select h.world_version::text,h.event_sequence::text,l.holder_id,l.fencing_token::text,to_char(l.acquired_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),to_char(l.renewed_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),to_char(l.lease_expires_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
end;$$;
alter function world_v2.lock_postwar_industry_work_scope(text,text,text,text,timestamptz,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.lock_postwar_industry_work_scope(text,text,text,text,timestamptz,text)from public;
grant execute on function world_v2.lock_postwar_industry_work_scope(text,text,text,text,timestamptz,text)to world_v2_industry_source_reader;

create function world_v2.lock_postwar_industry_work_issue_scope(p_world text,p_worker text,p_at timestamptz,p_sim text)
returns table(world_version text,event_sequence text)language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h world_v2.world_head%rowtype;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_reader'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')or pg_has_role(session_user,'world_v2_industry_source_publisher','MEMBER')or exists(select 1 from pg_roles r where r.rolname=session_user and(r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb or r.rolreplication))then raise exception 'INDUSTRY_WORK_FIXED_READER_REQUIRED'using errcode='42501';end if;
 if current_setting('transaction_isolation')not in('repeatable read','serializable')or current_setting('transaction_read_only')<>'off'or p_sim is null or p_sim!~'^(0|[1-9][0-9]*)$'or p_at is null or not isfinite(p_at)then raise exception 'INDUSTRY_WORK_HELD_RR_EXACT_TIME_REQUIRED'using errcode='25001';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 perform 1 from world_v2.world_writer_lease l where l.world_id=p_world and l.holder_id=p_worker and l.acquired_at_real<=p_at and l.renewed_at_real<=p_at and l.lease_expires_at_real>p_at for share;
 if not found then raise exception 'INDUSTRY_WORK_CURRENT_LEASE_REQUIRED'using errcode='55000';end if;
 select * into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found then raise exception 'INDUSTRY_WORK_CURRENT_HEAD_REQUIRED'using errcode='55000';end if;
 return query select h.world_version::text,h.event_sequence::text;
end;$$;
alter function world_v2.lock_postwar_industry_work_issue_scope(text,text,timestamptz,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.lock_postwar_industry_work_issue_scope(text,text,timestamptz,text)from public;
grant execute on function world_v2.lock_postwar_industry_work_issue_scope(text,text,timestamptz,text)to world_v2_industry_source_reader;
revoke create on schema world_v2 from world_v2_industry_source_owner;
commit;
