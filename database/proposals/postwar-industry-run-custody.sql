-- Candidate fixed RUN scope; no economic write, new role, membership or raw
-- seed grant. Requires Industry intake metadata and current source custody.
begin;
grant create on schema world_v2 to world_v2_industry_source_owner;
grant select on world_v2.world_writer_lease to world_v2_industry_source_owner;
grant update(fencing_token)on world_v2.world_writer_lease to world_v2_industry_source_owner;
create policy industry_run_lease_read on world_v2.world_writer_lease for select to world_v2_industry_source_owner using(current_user='world_v2_industry_source_owner'and world_id=current_setting('econmind.industry_source_world',true));
create policy industry_run_lease_fence on world_v2.world_writer_lease as restrictive for select to world_v2_industry_source_owner using(current_user='world_v2_industry_source_owner'and world_id=current_setting('econmind.industry_source_world',true));
create policy industry_run_lease_lock on world_v2.world_writer_lease for update to world_v2_industry_source_owner using(current_user='world_v2_industry_source_owner'and world_id=current_setting('econmind.industry_source_world',true))with check(false);
create function world_v2.lock_postwar_industry_run_scope(p_world text,p_country text,p_subject uuid,p_worker text,p_version bigint,p_at timestamptz)
returns table(world_version text,event_sequence text,team_id text,authorization_version text,holder_id text,fencing_token text,acquired_at_real text,renewed_at_real text,lease_expires_at_real text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;l world_v2.world_writer_lease%rowtype;h world_v2.world_head%rowtype;a record;seat_id text;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_reader'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')or pg_has_role(session_user,'world_v2_industry_source_publisher','MEMBER')or exists(select 1 from pg_roles r where r.rolname=session_user and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))then raise exception 'INDUSTRY_RUN_FIXED_READER_REQUIRED'using errcode='42501';end if;
 if current_setting('transaction_isolation')not in('repeatable read','serializable')or current_setting('transaction_read_only')<>'off'then raise exception 'INDUSTRY_RUN_HELD_RR_REQUIRED'using errcode='25001';end if;
 if p_world is null or p_country is null or p_subject is null or p_subject::text is distinct from current_setting('request.jwt.claim.sub',true)or p_version is null or p_version<0 or p_at is null or not isfinite(p_at)then raise exception 'INDUSTRY_RUN_EXACT_SCOPE_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 select * into l from world_v2.world_writer_lease x where x.world_id=p_world and x.holder_id=p_worker and x.acquired_at_real<=p_at and x.renewed_at_real<=p_at and x.lease_expires_at_real>p_at for share;
 if not found then raise exception 'INDUSTRY_RUN_CURRENT_LEASE_REQUIRED'using errcode='55000';end if;
 select * into h from world_v2.world_head x where x.world_id=p_world and x.world_version=p_version for share;
 if not found then raise exception 'INDUSTRY_RUN_CURRENT_HEAD_REQUIRED'using errcode='40001';end if;
 select x.team_id,x.authorization_version into a from world_v2.current_commit_authorization x where x.world_id=p_world and x.country_id=p_country and x.auth_subject=p_subject and x.office_id='INDUSTRY'and x.capability='INDUSTRY_PRODUCTION'and x.active for share;
 if not found then raise exception 'INDUSTRY_RUN_CURRENT_ACTOR_REQUIRED'using errcode='42501';end if;
 select s.seat_ref into seat_id from world_v2.runtime_read_seat s where s.world_id=p_world and s.auth_subject=p_subject and s.country_id=p_country and s.office_id='INDUSTRY' and s.team_id=a.team_id and s.authorization_revision=a.authorization_version;
 if not found then raise exception 'INDUSTRY_RUN_CURRENT_SEAT_REQUIRED'using errcode='42501';end if;
 perform 1 from world_v2.lock_postwar_industry_intake_binding(p_world,p_subject,p_country,'INDUSTRY',seat_id,a.authorization_version,'INDUSTRY_PRODUCTION','OFFICE_'||upper(encode(convert_to(p_country,'UTF8'),'hex'))||'_494E445553545259');
 if not found then raise exception 'INDUSTRY_RUN_CURRENT_SEAT_REQUIRED'using errcode='42501';end if;
 return query select h.world_version::text,h.event_sequence::text,a.team_id,a.authorization_version,l.holder_id,l.fencing_token::text,to_char(l.acquired_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),to_char(l.renewed_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),to_char(l.lease_expires_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
end;$$;
alter function world_v2.lock_postwar_industry_run_scope(text,text,uuid,text,bigint,timestamptz)owner to world_v2_industry_source_owner;
revoke all on function world_v2.lock_postwar_industry_run_scope(text,text,uuid,text,bigint,timestamptz)from public;
grant execute on function world_v2.lock_postwar_industry_run_scope(text,text,uuid,text,bigint,timestamptz)to world_v2_industry_source_reader;
revoke create on schema world_v2 from world_v2_industry_source_owner;
commit;
