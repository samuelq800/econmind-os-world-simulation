-- ISOLATED FUNCTION-ONLY FORWARD CANDIDATE; not a fresh-install proposal.
-- Existing adopted first-day domestic logistics rules, now actual per-country
-- refinery scope. No new adoption, table, role, membership or EXECUTE grant.
-- Install after postwar-industry-logistics-custody.sql and source fence.
-- Two exact old bodies -> two exact target bodies; repeat only exact successor.
-- Actual firstday/source/admission/OP/COMMITTED checks remain in both bodies.
begin;
do $upgrade$
declare spec record;f record;new_body text;after_row record;
begin
 for spec in select * from(values
  ('postwar_industry_logistics_order_scope(text,text,text)','cb0945122226e0a2f5a784fd9681ab625151b7bf0cb84075c0d30ddd06e4ea52','c2d4fd3d334377b6dd506b7051172341ddae0ffbb0a0932fbf9ce7ee28e1390f','p_country is distinct from ''COUNTRY_02''or p_facility is distinct from ''OPEN-02-REFINED_FUEL''','p_country is null or p_country!~''^COUNTRY_(0[1-9]|[1-6][0-9]|70)$''or p_facility is distinct from ''OPEN-''||substring(p_country from 9 for 2)||''-REFINED_FUEL'''),
  ('read_postwar_industry_logistics_committed_orders(text,text,text,text,text,text,text,text,bigint,bigint,text,text)','6a8484cf85636ea4dd53d1c40e2c1839af1d94ce5f89100aee0ab634459a73c5','f8544cf50a9f5f7ec52251faf4ce8362b1f4b892ed572dd26fd236fe8d15e5ec','p_source_country is distinct from ''COUNTRY_02''or p_facility is distinct from ''OPEN-02-REFINED_FUEL''','p_source_country is null or p_source_country!~''^COUNTRY_(0[1-9]|[1-6][0-9]|70)$''or p_facility is distinct from ''OPEN-''||substring(p_source_country from 9 for 2)||''-REFINED_FUEL''')
 )v(signature,old_sha,new_sha,old_scope,new_scope)loop
  select p.oid,p.prosrc,p.proowner,p.proacl,p.proconfig,p.prosecdef into f from pg_proc p where p.oid=to_regprocedure('world_v2.'||spec.signature);
  if not found or pg_get_userbyid(f.proowner)<>'world_v2_industry_source_owner'or not f.prosecdef then raise exception 'LOGISTICS_MULTICOUNTRY_EXACT_EXISTING_FUNCTION_REQUIRED'using errcode='55000';end if;
  if f.proconfig is distinct from array['search_path=pg_catalog']::text[]
   or exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner)))a where a.privilege_type<>'EXECUTE'or a.is_grantable or a.grantee=0)
   or(select array_agg(pg_get_userbyid(a.grantee)::text order by pg_get_userbyid(a.grantee)::text)from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner)))a)
     is distinct from(case when spec.signature='postwar_industry_logistics_order_scope(text,text,text)'then array['world_v2_industry_source_owner']::text[] else array['world_v2_finance_budget_source_reader','world_v2_industry_source_owner','world_v2_postwar_projection_owner','world_v2_social_source_reader']::text[] end)
   then raise exception 'LOGISTICS_MULTICOUNTRY_EXACT_EXISTING_METADATA_REQUIRED'using errcode='55000';end if;
  if encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')=spec.new_sha then continue;end if;
  if encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>spec.old_sha or position(spec.old_scope in f.prosrc)=0 then raise exception 'LOGISTICS_MULTICOUNTRY_EXACT_PREDECESSOR_REQUIRED'using errcode='55000';end if;
  new_body:=replace(f.prosrc,spec.old_scope,spec.new_scope);
  if encode(sha256(convert_to(new_body,'UTF8')),'hex')<>spec.new_sha then raise exception 'LOGISTICS_MULTICOUNTRY_EXACT_TARGET_REQUIRED'using errcode='55000';end if;
  execute replace(pg_get_functiondef(f.oid),f.prosrc,new_body);
  select p.oid,p.prosrc,p.proowner,p.proacl,p.proconfig,p.prosecdef into after_row from pg_proc p where p.oid=to_regprocedure('world_v2.'||spec.signature);
  if after_row.oid is distinct from f.oid or after_row.proowner is distinct from f.proowner or after_row.proacl is distinct from f.proacl or after_row.proconfig is distinct from f.proconfig or after_row.prosecdef is distinct from f.prosecdef or encode(sha256(convert_to(after_row.prosrc,'UTF8')),'hex')<>spec.new_sha then raise exception 'LOGISTICS_MULTICOUNTRY_FUNCTION_METADATA_CHANGED'using errcode='55000';end if;
 end loop;
end;$upgrade$;
commit;
