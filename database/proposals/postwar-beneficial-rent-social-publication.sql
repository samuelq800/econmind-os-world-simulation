-- SOURCE-ONLY offline child publication; not a release/admission/Clock install.
-- Requires social-operating-custody.sql and its actual controlled admission
-- prerequisites. Reuses existing NOLOGIN owner/publisher, with no memberships
-- or operational raw-seed SELECT grant. Immutable child DATA hash is additional
-- binding; it never substitutes for the real admitted world and live permit.
begin;
grant create on schema world_v2 to world_v2_social_source_owner;
create function world_v2.register_postwar_beneficial_rent_social_source_world(
 p_world text,p_child_fingerprint text,p_canonical_seed_sha256 text
) returns setof world_v2.social_operating_source_registration
language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;s world_v2.opening_seed%rowtype;
begin
 if current_setting('role')<>'world_v2_social_source_publisher' and session_user<>'world_v2_social_source_publisher'
 then raise exception 'SOCIAL_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if pg_has_role((case when current_setting('role')='none' then session_user else current_setting('role')::name end),'world_v2_social_source_owner','MEMBER')
 then raise exception 'SOCIAL_OWNER_MEMBERSHIP_REFUSED'using errcode='42501';end if;
 if p_world is null or p_world!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$' or
    p_child_fingerprint is null or p_child_fingerprint!~'^sha256:[a-f0-9]{64}$' or
    p_canonical_seed_sha256 is null or p_canonical_seed_sha256!~'^[a-f0-9]{64}$'
 then raise exception 'BENEFICIAL_SOCIAL_EXACT_CHILD_ARGUMENTS_REQUIRED'using errcode='22023';end if;
 -- Exact owner-world visibility fence, never authorization from caller GUC.
 perform set_config('econmind.social_custody_world',p_world,true);
 perform 1 from world_v2.world_head where world_id=p_world for share;
 if not found then raise exception 'SOCIAL_WORLD_HEAD_REQUIRED'using errcode='55000';end if;
 -- H first, then the real immutable admission and current permit/revocation.
 a:=world_v2.social_source_admission(p_world);
 select * into s from world_v2.opening_seed where world_id=p_world;
 if not found or s.opening_world_version<>0 or s.seed_id<>a.seed_id or
    s.seed_fingerprint<>a.seed_fingerprint or s.seed_fingerprint<>p_child_fingerprint or
    s.replay_binding<>a.replay_binding or (s.replay_binding::jsonb->>'modelVersion')<>a.model_version or
    encode(sha256(convert_to(s.canonical_payload,'UTF8')),'hex')<>p_canonical_seed_sha256
 then raise exception 'BENEFICIAL_SOCIAL_ACTUAL_CHILD_HEADER_REQUIRED'using errcode='55000';end if;
 -- Existing issuer derives the retained E03 original from ACTUAL stored child
 -- bytes and registers child fingerprint/admission (not the parent view fp).
 return query select * from world_v2.register_social_operating_source_world(p_world);
end;$$;
alter function world_v2.register_postwar_beneficial_rent_social_source_world(text,text,text)owner to world_v2_social_source_owner;
revoke all on function world_v2.register_postwar_beneficial_rent_social_source_world(text,text,text)from public;
grant execute on function world_v2.register_postwar_beneficial_rent_social_source_world(text,text,text)to world_v2_social_source_publisher;
revoke create on schema world_v2 from world_v2_social_source_owner;
commit;
