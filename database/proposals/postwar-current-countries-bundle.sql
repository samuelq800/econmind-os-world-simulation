-- Forward candidate. One SQL-owned complete WORLD prefix within the same
-- protected publisher transaction; each country still locks its current source
-- and executes every existing family mapper/coverage/state/revocation check.
-- Neither a prefix nor an authority/cache flag is accepted from the caller.
begin;
grant create on schema world_v2 to world_v2_postwar_projection_owner;
create function world_v2.publish_postwar_current_countries_bundle(p_world text,p_bundles jsonb)
returns table(publication_kind text,country_id text,world_version text,event_sequence text,document_ref text,source_version text)
language plpgsql security definer set search_path=pg_catalog as $$
declare prefix world_v2.postwar_current_verified_prefix;effective name;b jsonb;cid text;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_reader','MEMBER')then raise exception 'MIXED_SEPARATE_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if jsonb_typeof(p_bundles)is distinct from'array'then raise exception 'CURRENT_COUNTRIES_BOUNDED_ARRAY_REQUIRED'using errcode='22023';end if;
 if jsonb_array_length(p_bundles)not between 1 and 70 or octet_length(p_bundles::text)>8388608 or (select count(distinct x->>'countryId')from jsonb_array_elements(p_bundles)x)<>jsonb_array_length(p_bundles)then raise exception 'CURRENT_COUNTRIES_BOUNDED_UNIQUE_SCOPE_REQUIRED'using errcode='22023';end if;
 -- All frames/effects are global. Country-specific page transport pins are
 -- checked by this verifier; every other country's pins are locked below.
 select * into strict prefix from world_v2.postwar_paged_mixed_current_prefix(p_world,p_bundles->0->>'countryId');
 for b in select x from jsonb_array_elements(p_bundles)x loop
  cid:=b->>'countryId';
  perform world_v2.lock_postwar_paged_current_publication(p_world,cid);
  if b->>'captain'is not null then
   return query select 'CAPTAIN',cid,r.world_version::text,r.event_sequence::text,r.document_ref,r.source_version from world_v2.publish_postwar_paged_captain_current_from_verified(p_world,cid,b->>'captain',prefix)r;
  end if;
  return query select 'FINANCIAL',cid,r.world_version::text,r.event_sequence::text,r.document_ref,r.source_version from world_v2.publish_postwar_paged_financial_current_from_verified(p_world,cid,b->>'financial',prefix)r;
  return query select 'SOCIAL',cid,r.world_version::text,r.event_sequence::text,r.document_ref,r.source_version from world_v2.publish_postwar_paged_social_current_from_verified(p_world,cid,b->>'social',prefix)r;
  if b->>'trade'is not null then
   return query select 'TRADE',cid,r.world_version::text,r.event_sequence::text,r.document_ref,r.source_version from world_v2.publish_postwar_paged_trade_current_from_verified(p_world,cid,b->>'trade',prefix)r;
  end if;
  if b->>'industry'is not null then
   return query select 'INDUSTRY',cid,r.world_version::text,r.event_sequence::text,r.document_ref,r.source_version from world_v2.publish_postwar_industry_labour_current_from_verified(p_world,cid,b->>'industry',prefix)r;
  end if;
 end loop;
end;$$;
alter function world_v2.publish_postwar_current_countries_bundle(text,jsonb)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.publish_postwar_current_countries_bundle(text,jsonb)from public;
grant execute on function world_v2.publish_postwar_current_countries_bundle(text,jsonb)to world_v2_postwar_projection_publisher;
revoke create on schema world_v2 from world_v2_postwar_projection_owner;
commit;
