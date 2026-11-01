-- Candidate V1 only. Install AFTER all selected source/admission custody
-- proposals. No economic/source bytes, LOGIN, membership or production install.
-- A mutable derived fence tuple makes append-only revocation visible to old RR
-- readers as SQLSTATE 40001 instead of relying on a parent row lock to refresh
-- their snapshot. A later-installed revocation domain without its exact trigger
-- fails closed until this candidate is explicitly extended/reviewed.
begin;
do $$begin
 if not exists(select 1 from pg_roles where rolname='world_v2_revocation_fence_owner')then create role world_v2_revocation_fence_owner nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;end if;
 if exists(select 1 from pg_roles where rolname='world_v2_revocation_fence_owner'and(rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))then raise exception 'REVOCATION_FENCE_UNSAFE_OWNER'using errcode='42501';end if;
end;$$;
grant usage,create on schema world_v2 to world_v2_revocation_fence_owner;
create table world_v2.postwar_source_revocation_fence(
 world_id text primary key references world_v2.world_head(world_id),
 revision bigint not null default 0 check(revision>=0)
);
alter table world_v2.postwar_source_revocation_fence owner to world_v2_revocation_fence_owner;
alter table world_v2.postwar_source_revocation_fence enable row level security;
alter table world_v2.postwar_source_revocation_fence force row level security;
revoke all on world_v2.postwar_source_revocation_fence from public;
create policy revocation_fence_owner_scope on world_v2.postwar_source_revocation_fence to world_v2_revocation_fence_owner using(current_user='world_v2_revocation_fence_owner'and world_id=current_setting('econmind.revocation_fence_world',true))with check(current_user='world_v2_revocation_fence_owner'and world_id=current_setting('econmind.revocation_fence_world',true));
-- Backfill is a reviewed installation operation, not a runtime repair/default.
insert into world_v2.postwar_source_revocation_fence(world_id)select world_id from world_v2.world_head;
create function world_v2.initialize_postwar_revocation_fence()returns trigger language plpgsql security definer set search_path=pg_catalog as $$begin
 perform set_config('econmind.revocation_fence_world',new.world_id,true);
 insert into world_v2.postwar_source_revocation_fence(world_id)values(new.world_id);
 return new;
end;$$;
alter function world_v2.initialize_postwar_revocation_fence()owner to world_v2_revocation_fence_owner;
revoke all on function world_v2.initialize_postwar_revocation_fence()from public;
create trigger postwar_new_world_revocation_fence after insert on world_v2.world_head for each row execute function world_v2.initialize_postwar_revocation_fence();
-- Trigger arguments below are fixed by this DDL, never a query/request input.
create function world_v2.advance_postwar_revocation_fence()returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare w text;r text;n bigint;begin
 if tg_table_schema<>'world_v2'or tg_nargs<>3 then raise exception 'REVOCATION_FENCE_FIXED_TRIGGER_REQUIRED'using errcode='42501';end if;
 if tg_op='UPDATE'and(to_jsonb(new)->>'world_id')is distinct from(to_jsonb(old)->>'world_id')then raise exception 'REVOCATION_FENCE_WORLD_IDENTITY_IMMUTABLE'using errcode='22023';end if;
 if tg_argv[0]='DIRECT'then w:=coalesce(to_jsonb(new),to_jsonb(old))->>'world_id';else
  r:=to_jsonb(new)->>tg_argv[2];
  if r is null then raise exception 'REVOCATION_FENCE_PARENT_REF_REQUIRED'using errcode='23514';end if;
  perform set_config('econmind.revocation_fence_ref',r,true);
  execute format('select world_id from world_v2.%I where %I=$1',tg_argv[0],tg_argv[1])into strict w using r;
 end if;
 if w is null then raise exception 'REVOCATION_FENCE_WORLD_REQUIRED'using errcode='23514';end if;
 perform set_config('econmind.revocation_fence_world',w,true);
 update world_v2.postwar_source_revocation_fence set revision=revision+1 where world_id=w;
 get diagnostics n=row_count;
 if n<>1 then raise exception 'REVOCATION_FENCE_REGISTERED_WORLD_REQUIRED'using errcode='55000';end if;
 if tg_op='DELETE'then return old;end if;return new;
end;$$;
alter function world_v2.advance_postwar_revocation_fence()owner to world_v2_revocation_fence_owner;
revoke all on function world_v2.advance_postwar_revocation_fence()from public;
-- Fixed source/admission/control/recovery dependencies. Direct-world child FKs
-- retain their original exact parent validation; this trigger adds concurrency
-- ordering only and cannot make an invalid revocation valid.
do $$declare s record;begin
 for s in select * from(values
 ('runtime_admission_publication_revocation','runtime_admission_publication_permit','authorization_id','authorization_id'),
 ('social_operating_source_revocation','social_operating_source_registration','registration_ref','registration_ref'),
 ('social_operating_match_publisher_revocation','social_operating_match_publisher','grant_ref','grant_ref'),
 ('finance_budget_policy_revocation','finance_budget_policy_original','policy_ref','policy_ref'),
 ('finance_budget_capacity_revocation','finance_budget_capacity_original','capacity_ref','capacity_ref'),
 ('captain_operating_source_revocation','captain_operating_source_adoption','adoption_ref','adoption_ref'),
 ('central_bank_omo_revocation','central_bank_omo_adoption','adoption_ref','adoption_ref'),
 ('postwar_narrow_trade_rights_revocation','postwar_narrow_trade_rights_admission','admission_ref','admission_ref'),
 ('postwar_day_one_fx_source_revocation','DIRECT','',''),
 ('postwar_day_one_fx_quote_revocation','DIRECT','',''),
 ('postwar_beneficial_rent_revocation','DIRECT','',''),
 ('postwar_beneficial_rent_publication_revocation','DIRECT','',''),
 ('postwar_industry_original_revocation','DIRECT','',''),
 ('postwar_industry_first_day_source_revocation','DIRECT','',''),
 ('world_command_execution_revocation','DIRECT','',''),
 ('world_actor_binding_revocation','DIRECT','',''),
 ('world_actor_reader_scope_revocation','DIRECT','',''),
 ('postwar_office_projection_revocation','DIRECT','',''),
 ('postwar_paged_current_revocation','DIRECT','','')
 )as v(child,parent,parent_ref,child_ref)loop
  if to_regclass('world_v2.'||s.child)is null then continue;end if;
  if s.parent<>'DIRECT'then
   if to_regclass('world_v2.'||s.parent)is null then raise exception 'REVOCATION_FENCE_PARENT_TABLE_REQUIRED:%',s.parent using errcode='55000';end if;
   execute format('grant select(world_id,%I)on world_v2.%I to world_v2_revocation_fence_owner',s.parent_ref,s.parent);
   execute format('create policy revocation_fence_parent_ref on world_v2.%I for select to world_v2_revocation_fence_owner using(current_user=''world_v2_revocation_fence_owner''and %I=current_setting(''econmind.revocation_fence_ref'',true))',s.parent,s.parent_ref);
   execute format('create policy revocation_fence_parent_ref_fence on world_v2.%I as restrictive for select to world_v2_revocation_fence_owner using(current_user=''world_v2_revocation_fence_owner''and %I=current_setting(''econmind.revocation_fence_ref'',true))',s.parent,s.parent_ref);
  end if;
  execute format('create trigger a00_postwar_revocation_fence before insert on world_v2.%I for each row execute function world_v2.advance_postwar_revocation_fence(%L,%L,%L)',s.child,s.parent,s.parent_ref,s.child_ref);
 end loop;
end;$$;
-- Current seat/capability changes also invalidate a source snapshot. Their
-- existing controlled writers retain all authorization checks; no write grant
-- is added. An INSERT that changes coherent current membership is included.
do $$declare n text;begin foreach n in array array['current_commit_authorization','runtime_read_seat','projection_entitlement']loop
 if to_regclass('world_v2.'||n)is not null then
  execute format('create trigger a00_postwar_revocation_fence before insert or update or delete on world_v2.%I for each row execute function world_v2.advance_postwar_revocation_fence(''DIRECT'','''','''')',n);
 end if;
end loop;end;$$;
create function world_v2.lock_postwar_source_revocation_fences(p_world text)returns void language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;allowed boolean:=false;n text;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if p_world is null or p_world!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'then raise exception 'REVOCATION_FENCE_EXACT_WORLD_REQUIRED'using errcode='22023';end if;
 if exists(select 1 from pg_roles where rolname=effective and(rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))or pg_has_role(effective,'world_v2_revocation_fence_owner','MEMBER')then raise exception 'REVOCATION_FENCE_FIXED_READER_REQUIRED'using errcode='42501';end if;
 foreach n in array array['world_v2_social_source_reader','world_v2_finance_budget_source_reader','world_v2_day_one_fx_source_reader','world_v2_captain_source_reader','world_v2_cb_omo_source_reader','world_v2_postwar_narrow_trade_source','world_v2_industry_source_reader','world_v2_postwar_projection_publisher','world_v2_social_source_publisher']loop
  if to_regrole(n)is not null and pg_has_role(effective,n,'MEMBER')then allowed:=true;end if;
 end loop;
 if not allowed then raise exception 'REVOCATION_FENCE_FIXED_READER_REQUIRED'using errcode='42501';end if;
 if current_setting('transaction_isolation')not in('repeatable read','serializable')or current_setting('transaction_read_only')<>'off'then raise exception 'REVOCATION_FENCE_HELD_WRITE_RR_REQUIRED'using errcode='25001';end if;
 foreach n in array array['runtime_admission_publication_revocation','social_operating_source_revocation','social_operating_match_publisher_revocation','finance_budget_policy_revocation','finance_budget_capacity_revocation','captain_operating_source_revocation','central_bank_omo_revocation','postwar_narrow_trade_rights_revocation','postwar_day_one_fx_source_revocation','postwar_day_one_fx_quote_revocation','postwar_beneficial_rent_revocation','postwar_beneficial_rent_publication_revocation','postwar_industry_original_revocation','postwar_industry_first_day_source_revocation','world_command_execution_revocation','world_actor_binding_revocation','world_actor_reader_scope_revocation','postwar_office_projection_revocation','postwar_paged_current_revocation','current_commit_authorization','runtime_read_seat','projection_entitlement']loop
  if to_regclass('world_v2.'||n)is not null and not exists(select 1 from pg_trigger t where t.tgrelid=to_regclass('world_v2.'||n)and t.tgname='a00_postwar_revocation_fence'and t.tgfoid='world_v2.advance_postwar_revocation_fence()'::regprocedure and t.tgenabled='O'and not t.tgisinternal)then raise exception 'REVOCATION_FENCE_TRIGGER_COVERAGE_REQUIRED:%',n using errcode='55000';end if;
 end loop;
 perform set_config('econmind.revocation_fence_world',p_world,true);
 perform 1 from world_v2.postwar_source_revocation_fence where world_id=p_world for share;
 if not found then raise exception 'REVOCATION_FENCE_REGISTERED_WORLD_REQUIRED'using errcode='55000';end if;
end;$$;
alter function world_v2.lock_postwar_source_revocation_fences(text)owner to world_v2_revocation_fence_owner;
revoke all on function world_v2.lock_postwar_source_revocation_fences(text)from public;
do $$declare n text;begin foreach n in array array['world_v2_social_source_reader','world_v2_finance_budget_source_reader','world_v2_day_one_fx_source_reader','world_v2_captain_source_reader','world_v2_cb_omo_source_reader','world_v2_postwar_narrow_trade_source','world_v2_industry_source_reader','world_v2_postwar_projection_publisher','world_v2_social_source_publisher']loop
 if to_regrole(n)is not null then execute format('grant execute on function world_v2.lock_postwar_source_revocation_fences(text)to %I',n);end if;
end loop;end;$$;
do $$declare n text;begin foreach n in array array['world_v2_postwar_projection_owner','world_v2_social_source_owner','world_v2_industry_source_owner']loop if to_regrole(n)is not null then execute format('grant execute on function world_v2.lock_postwar_source_revocation_fences(text)to %I',n);end if;end loop;end;$$;
revoke create on schema world_v2 from world_v2_revocation_fence_owner;
commit;
