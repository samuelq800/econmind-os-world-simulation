-- Scope and immutable rent publication only. Complete cumulative Core replay
-- is separately required on the same held transaction; no prefix substitution.
begin;
grant create on schema world_v2 to world_v2_beneficial_rent_source_owner;
create function world_v2.lock_postwar_beneficial_rent_paged_original(p_world text,p_country text,p_command text,p_fp text,p_observed timestamptz)
returns table(registration_ref text,world_id text,seed_id text,seed_fingerprint text,parent_seed_fingerprint text,canonical_seed_sha256 text,bundle_sha256 text,admission_ref text,receipt_fingerprint text,publication_ref text,command_fingerprint text,worker_id text,clock_binding_ref text,clock_sim_time text,world_version text,event_sequence text,history_mode text)
language plpgsql security definer set search_path=pg_catalog as $$
declare s world_v2.postwar_beneficial_rent_source%rowtype;p world_v2.postwar_beneficial_rent_publication%rowtype;h record;begin
 if current_setting('transaction_isolation')not in('repeatable read','serializable')then raise exception 'BENEFICIAL_RENT_PAGED_SNAPSHOT_REQUIRED'using errcode='25001';end if;
 select * into s from world_v2.lock_postwar_beneficial_rent_header(p_world,p_country);if s.world_id is null then return;end if;
 select * into p from world_v2.postwar_beneficial_rent_publication x where x.world_id=p_world and x.country_id=p_country and x.command_id=p_command and x.command_fingerprint=p_fp and x.registration_ref=s.registration_ref and p_observed>=x.valid_from_real and p_observed<x.valid_until_real for share;
 if not found or exists(select 1 from world_v2.postwar_beneficial_rent_publication_revocation x where x.world_id=p_world and x.publication_ref=p.publication_ref)then return;end if;
 select * into strict h from world_v2.world_head x where x.world_id=p_world;
 return query select s.registration_ref,s.world_id,s.seed_id,s.seed_fingerprint,s.parent_seed_fingerprint,s.canonical_seed_sha256,s.bundle_sha256,s.admission_ref,s.receipt_fingerprint,p.publication_ref,p.command_fingerprint,p.worker_id,p.clock_binding_ref,p.clock_sim_time,h.world_version::text,h.event_sequence::text,'GENUINE_SHARED_PAGED_CORE_REPLAY_REQUIRED'::text;
end;$$;
create function world_v2.read_postwar_beneficial_rent_paged_current(p_world text,p_country text)returns table(registration_ref text,world_id text,seed_id text,seed_fingerprint text,parent_seed_fingerprint text,canonical_seed_sha256 text,bundle_sha256 text,admission_ref text,world_version text,event_sequence text,history_mode text)
language plpgsql security definer set search_path=pg_catalog as $$declare s world_v2.postwar_beneficial_rent_source%rowtype;h record;begin
 if current_setting('transaction_isolation')not in('repeatable read','serializable')then raise exception 'BENEFICIAL_RENT_PAGED_SNAPSHOT_REQUIRED'using errcode='25001';end if;
 select * into s from world_v2.lock_postwar_beneficial_rent_header(p_world,p_country);if s.world_id is null then return;end if;select * into strict h from world_v2.world_head x where x.world_id=p_world;return query select s.registration_ref,s.world_id,s.seed_id,s.seed_fingerprint,s.parent_seed_fingerprint,s.canonical_seed_sha256,s.bundle_sha256,s.admission_ref,h.world_version::text,h.event_sequence::text,'GENUINE_SHARED_PAGED_CORE_REPLAY_REQUIRED'::text;
end;$$;
alter function world_v2.lock_postwar_beneficial_rent_paged_original(text,text,text,text,timestamptz)owner to world_v2_beneficial_rent_source_owner;
revoke all on function world_v2.lock_postwar_beneficial_rent_paged_original(text,text,text,text,timestamptz)from public;
grant execute on function world_v2.lock_postwar_beneficial_rent_paged_original(text,text,text,text,timestamptz)to world_v2_beneficial_rent_source_reader;
alter function world_v2.read_postwar_beneficial_rent_paged_current(text,text)owner to world_v2_beneficial_rent_source_owner;
revoke all on function world_v2.read_postwar_beneficial_rent_paged_current(text,text)from public;
grant execute on function world_v2.read_postwar_beneficial_rent_paged_current(text,text)to world_v2_beneficial_rent_source_reader;
revoke create on schema world_v2 from world_v2_beneficial_rent_source_owner;
commit;
