-- Explicit startup metadata only. Depends on social-operating-custody.sql.
-- No new role/membership, table DML, raw-payload SELECT for readers, actor
-- authority or source admission is granted. Raw SHA is computed once at cold
-- startup by the existing inaccessible owner; no full JSON parse/payload leaves.
begin;
grant create on schema world_v2 to world_v2_social_source_owner;
create function world_v2.lock_social_startup_seed_header(p_world text,p_country text)
returns table(world_id text,country_id text,registration_ref text,source_id text,source_payload_hash text,seed_id text,seed_fingerprint text,opening_world_version text,replay_binding text,model_version text,admission_ref text,canonical_seed_sha256 text)
language plpgsql security definer set search_path=pg_catalog as $$
declare r world_v2.social_operating_source_registration%rowtype;a world_v2.runtime_opening_admission%rowtype;
begin
 -- The existing fixed reader lock authenticates role separation and holds
 -- H/admission/permit/registered source. Its GUC is an owner visibility fence,
 -- overwritten from the checked world argument, never caller authorization.
 r:=world_v2.lock_social_operating_source(p_world,p_country);
 a:=world_v2.social_source_admission(p_world);
 return query select s.world_id,p_country,r.registration_ref,r.source_id,r.source_payload_hash,s.seed_id,s.seed_fingerprint,s.opening_world_version::text,s.replay_binding,a.model_version,a.admission_ref,encode(sha256(convert_to(s.canonical_payload,'UTF8')),'hex')
 from world_v2.opening_seed s
 where s.world_id=p_world and s.opening_world_version=0 and s.seed_id=a.seed_id and s.seed_fingerprint=a.seed_fingerprint and s.seed_fingerprint=r.seed_fingerprint and s.replay_binding=a.replay_binding and r.admission_ref=a.admission_ref;
 if not found then raise exception 'SOCIAL_STARTUP_ACTUAL_IMMUTABLE_SEED_REQUIRED'using errcode='55000';end if;
end;$$;
alter function world_v2.lock_social_startup_seed_header(text,text)owner to world_v2_social_source_owner;
revoke all on function world_v2.lock_social_startup_seed_header(text,text)from public;
grant execute on function world_v2.lock_social_startup_seed_header(text,text)to world_v2_social_source_reader;
revoke create on schema world_v2 from world_v2_social_source_owner;
commit;
