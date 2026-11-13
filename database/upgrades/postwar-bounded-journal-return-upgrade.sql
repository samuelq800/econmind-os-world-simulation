-- SOURCE-ONLY historical upgrade candidate. NOT a fresh install, production migration or approval.
-- Old immutable proposal SHA256: d651aab6dbe0a165ad8f3de9a85a81a262a1666091f3e512a6f880e894ff10e2
-- New immutable proposal SHA256: fd18216e8ca22f9000892082368b6718c7dd294748f9c7fa08709b6833fb407e
-- Requires the already installed old proposal and its unchanged history custody.
-- Pause/drain affected callers in a separately authorized release window.
-- No CASCADE, policy recreation, membership, runtime raw grant or economic write.
begin;
do $preflight$
declare p record; actual_readers text[];
begin
 select x.*,pg_get_function_result(x.oid)as result,pg_get_userbyid(x.proowner)as owner_name into p from pg_proc x where x.oid=to_regprocedure('world_v2.read_postwar_bounded_journal(text,text,text)');
 if not found or p.result<>'TABLE(world_version text, event_sequence text, financial_batch_count text, inventory_posting_count text, financial_batches jsonb)'or p.owner_name<>'world_v2_day_one_fx_history_owner'or not p.prosecdef or p.proconfig is distinct from array['search_path=pg_catalog']::text[] or encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>'4148dac301a0aaa3a211bfedc732cf0620b447c0dde3b67d096d63af6d013755'then raise exception 'JOURNAL_UPGRADE_EXACT_OLD_FUNCTION_REQUIRED'using errcode='55000';end if;
 if exists(select 1 from pg_depend where refclassid='pg_proc'::regclass and refobjid=p.oid and deptype not in('i','a'))then raise exception 'JOURNAL_UPGRADE_UNREVIEWED_DEPENDENCY'using errcode='2BP01';end if;
 if exists(select 1 from pg_roles where rolname=p.owner_name and(rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))or has_schema_privilege(p.owner_name,'world_v2','CREATE')then raise exception 'JOURNAL_UPGRADE_EXACT_OLD_OWNER_REQUIRED'using errcode='42501';end if;
 if exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x where x.grantee=0)then raise exception 'JOURNAL_UPGRADE_PUBLIC_ACL_FORBIDDEN'using errcode='42501';end if;
 if exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x where x.grantee<>p.proowner and(x.privilege_type<>'EXECUTE'or x.is_grantable))then raise exception 'JOURNAL_UPGRADE_EXACT_READER_ACL_REQUIRED'using errcode='42501';end if;
 select array_agg(pg_get_userbyid(x.grantee)::text order by pg_get_userbyid(x.grantee)::text)into actual_readers from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x where x.grantee<>p.proowner and x.privilege_type='EXECUTE'and not x.is_grantable;
 if actual_readers is distinct from array['world_v2_finance_budget_source_reader','world_v2_social_source_reader']::text[]then raise exception 'JOURNAL_UPGRADE_EXACT_READER_ACL_REQUIRED'using errcode='42501';end if;
 if(select count(*)from pg_policy where polrelid in('world_v2.financial_posting_batch'::regclass,'world_v2.inventory_posting'::regclass)and polname in('postwar_bounded_journal_read','postwar_bounded_journal_fence'))<>4 then raise exception 'JOURNAL_UPGRADE_EXISTING_POLICIES_REQUIRED'using errcode='55000';end if;
end;$preflight$;
-- These four columns are the sole new grant; world_id was already readable.
grant select(posting_id,causation_command_id,canonical_payload,posting_fingerprint)on world_v2.inventory_posting to world_v2_day_one_fx_history_owner;
grant create on schema world_v2 to world_v2_day_one_fx_history_owner;
drop function world_v2.read_postwar_bounded_journal(text,text,text) restrict;
create function world_v2.read_postwar_bounded_journal(p_world text,p_host_country text,p_office text)
returns table(world_version text,event_sequence text,financial_batch_count text,inventory_posting_count text,financial_batches jsonb,inventory_postings jsonb)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;required name;role_id oid;a world_v2.runtime_opening_admission%rowtype;permit world_v2.runtime_admission_publication_permit%rowtype;
 h record;host_ref text;batch_count bigint;inventory_count bigint;batch_bytes bigint;inventory_bytes bigint;max_bytes integer;max_inventory_bytes integer;batches jsonb;inventory jsonb;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 required:=case p_office when 'SOCIAL'then 'world_v2_social_source_reader'when 'FINANCE'then 'world_v2_finance_budget_source_reader'else null end;
 select oid into role_id from pg_roles where rolname=required;
 if required is null or role_id is null or not pg_has_role(effective,role_id,'MEMBER')or
 exists(select 1 from pg_roles x where x.rolname=effective and(x.rolsuper or x.rolbypassrls or x.rolcreatedb or x.rolcreaterole or x.rolreplication))or
 exists(select 1 from pg_roles x where x.rolname in('world_v2_day_one_fx_history_owner','world_v2_day_one_fx_source_owner','world_v2_day_one_fx_source_publisher','world_v2_social_source_owner','world_v2_social_source_publisher','world_v2_finance_budget_source_owner','world_v2_finance_budget_source_publisher')and pg_has_role(effective,x.oid,'MEMBER'))then raise exception 'JOURNAL_FIXED_SOURCE_READER_REQUIRED'using errcode='42501';end if;
 if p_world is null or p_world!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or p_host_country is null or p_host_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'then raise exception 'JOURNAL_EXACT_REPLAY_SCOPE_REQUIRED'using errcode='22023';end if;
 perform set_config('econmind.fx_history_world',p_world,true);
 select x.world_version,x.event_sequence into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found then raise exception 'JOURNAL_ACTUAL_HEAD_REQUIRED'using errcode='55000';end if;
 if h.world_version<0 or h.event_sequence<0 or h.world_version>256 or h.event_sequence>256 then raise exception 'JOURNAL_BOUNDED_CAPACITY_EXCEEDED'using errcode='54000';end if;
 select * into a from world_v2.runtime_opening_admission x where x.world_id=p_world for share;
 if not found or not exists(select 1 from world_v2.opening_seed x where x.world_id=a.world_id and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.replay_binding=a.replay_binding and x.replay_binding::jsonb->>'modelVersion'=a.model_version)then raise exception 'JOURNAL_ACTUAL_IMMUTABLE_ADMISSION_REQUIRED'using errcode='55000';end if;
 select * into permit from world_v2.runtime_admission_publication_permit x where 'ADMISSION_'||upper(x.authorization_sha256)=a.admission_ref and x.world_id=a.world_id and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.model_version=a.model_version and x.replay_binding=a.replay_binding and a.admitted_at_real>=x.valid_from and a.admitted_at_real<x.valid_until for share;
 if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation x where x.authorization_id=permit.authorization_id)then raise exception 'JOURNAL_CURRENT_WORLD_ADMISSION_REVOKED'using errcode='55000';end if;
 if p_office='SOCIAL'then
  if to_regclass('world_v2.social_operating_source_registration')is null or to_regclass('world_v2.social_operating_source_revocation')is null then raise exception 'JOURNAL_CURRENT_HOST_SOURCE_REQUIRED'using errcode='55000';end if;
  select x.registration_ref into host_ref from world_v2.social_operating_source_registration x where x.world_id=p_world and x.country_id=p_host_country and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref for share;
  if not found or exists(select 1 from world_v2.social_operating_source_revocation x where x.registration_ref=host_ref)then raise exception 'JOURNAL_CURRENT_HOST_SOURCE_REVOKED'using errcode='55000';end if;
 else
  if to_regclass('world_v2.finance_budget_policy_original')is null or to_regclass('world_v2.finance_budget_policy_revocation')is null then raise exception 'JOURNAL_CURRENT_HOST_SOURCE_REQUIRED'using errcode='55000';end if;
  select x.policy_ref into host_ref from world_v2.finance_budget_policy_original x where x.world_id=p_world and x.country_id=p_host_country and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref and not exists(select 1 from world_v2.finance_budget_policy_revocation revoked where revoked.policy_ref=x.policy_ref)order by x.policy_ref limit 1 for share;
  if not found then raise exception 'JOURNAL_CURRENT_HOST_SOURCE_REVOKED'using errcode='55000';end if;
 end if;

 -- Count and size the entire actual World set before returning any body. H is
 -- held for share for the surrounding source/replay transaction. Authoritative
 -- writers must take its exclusive CAS lock; no row can be silently skipped.
 select count(*),coalesce(sum(octet_length(x.canonical_payload)),0),coalesce(max(octet_length(x.canonical_payload)),0)
 into batch_count,batch_bytes,max_bytes from world_v2.financial_posting_batch x where x.world_id=p_world;
 select count(*),coalesce(sum(octet_length(x.canonical_payload)),0),coalesce(max(octet_length(x.canonical_payload)),0)
 into inventory_count,inventory_bytes,max_inventory_bytes from world_v2.inventory_posting x where x.world_id=p_world;
 if batch_count>512 or inventory_count>256 or max_bytes>65536 or max_inventory_bytes>65536 or batch_bytes+inventory_bytes>1048576 then raise exception 'JOURNAL_BOUNDED_CAPACITY_EXCEEDED'using errcode='54000';end if;
 select coalesce(jsonb_agg(jsonb_build_object('causation_command_id',x.causation_command_id,'canonical_payload',x.canonical_payload,'fingerprint',x.batch_fingerprint)order by x.batch_id),'[]'::jsonb)
 into batches from world_v2.financial_posting_batch x where x.world_id=p_world;
 select coalesce(jsonb_agg(jsonb_build_object('causation_command_id',x.causation_command_id,'canonical_payload',x.canonical_payload,'fingerprint',x.posting_fingerprint)order by x.posting_id),'[]'::jsonb)
 into inventory from world_v2.inventory_posting x where x.world_id=p_world;
 if jsonb_array_length(batches)<>batch_count or jsonb_array_length(inventory)<>inventory_count then raise exception 'JOURNAL_COMPLETE_BATCH_SET_REQUIRED'using errcode='55000';end if;
 return query select h.world_version::text,h.event_sequence::text,batch_count::text,inventory_count::text,batches,inventory;
end;$$;
alter function world_v2.read_postwar_bounded_journal(text,text,text)owner to world_v2_day_one_fx_history_owner;
revoke all on function world_v2.read_postwar_bounded_journal(text,text,text)from public;
grant execute on function world_v2.read_postwar_bounded_journal(text,text,text)to world_v2_social_source_reader,world_v2_finance_budget_source_reader;
revoke create on schema world_v2 from world_v2_day_one_fx_history_owner;
do $postflight$
declare p record; actual_readers text[];
begin
 select x.*,pg_get_function_result(x.oid)as result,pg_get_userbyid(x.proowner)as owner_name into strict p from pg_proc x where x.oid=to_regprocedure('world_v2.read_postwar_bounded_journal(text,text,text)');
 if p.result<>'TABLE(world_version text, event_sequence text, financial_batch_count text, inventory_posting_count text, financial_batches jsonb, inventory_postings jsonb)'or p.owner_name<>'world_v2_day_one_fx_history_owner'or not p.prosecdef or p.proconfig is distinct from array['search_path=pg_catalog']::text[] or encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>'32c1c2fd7a8de96dd2d0a142991bfcd3099d3c9f448d82585632d891b1139866'or has_schema_privilege(p.owner_name,'world_v2','CREATE')then raise exception 'JOURNAL_UPGRADE_EXACT_NEW_FUNCTION_REQUIRED'using errcode='55000';end if;
 if exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x where x.grantee=0)then raise exception 'JOURNAL_UPGRADE_PUBLIC_ACL_FORBIDDEN'using errcode='42501';end if;
 if exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x where x.grantee<>p.proowner and(x.privilege_type<>'EXECUTE'or x.is_grantable))then raise exception 'JOURNAL_UPGRADE_EXACT_READER_ACL_REQUIRED'using errcode='42501';end if;
 select array_agg(pg_get_userbyid(x.grantee)::text order by pg_get_userbyid(x.grantee)::text)into actual_readers from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x where x.grantee<>p.proowner and x.privilege_type='EXECUTE'and not x.is_grantable;
 if actual_readers is distinct from array['world_v2_finance_budget_source_reader','world_v2_social_source_reader']::text[]then raise exception 'JOURNAL_UPGRADE_EXACT_READER_ACL_REQUIRED'using errcode='42501';end if;
end;$postflight$;
commit;
