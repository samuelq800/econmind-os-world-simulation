-- Private MATCH publication page transport. DATA only, with the same actual
-- Social host/admission/head locks. No UI projection, role membership or raw
-- relation grants. Requires postwar-bounded-prefix-pages.sql.
begin;
grant create on schema world_v2 to world_v2_day_one_fx_history_owner;
create function world_v2.read_postwar_social_match_prefix_page(p_world text,p_country text,p_after_world_version bigint,p_after_event_sequence bigint,p_head_world_version bigint,p_head_event_sequence bigint,p_seed text,p_admission text)
returns table(world_id text,host_country_id text,office_id text,world_version text,event_sequence text,seed_id text,seed_fingerprint text,admission_ref text,host_source_ref text,transaction_id text,backend_pid text,from_world_version text,from_event_sequence text,through_world_version text,through_event_sequence text,has_more boolean,frame_count text,event_count text,financial_batch_count text,inventory_posting_count text,total_frame_count text,total_event_count text,total_financial_batch_count text,total_inventory_posting_count text,frames_text text,frames_sha256 text,frame_bytes text)
language sql security definer set search_path=pg_catalog as $$
 select * from world_v2.read_postwar_bounded_prefix_page(p_world,p_country,'SOCIAL_MATCH',p_after_world_version,p_after_event_sequence,p_head_world_version,p_head_event_sequence,p_seed,p_admission)
$$;
alter function world_v2.read_postwar_social_match_prefix_page(text,text,bigint,bigint,bigint,bigint,text,text)owner to world_v2_day_one_fx_history_owner;
revoke all on function world_v2.read_postwar_social_match_prefix_page(text,text,bigint,bigint,bigint,bigint,text,text)from public;
grant execute on function world_v2.read_postwar_social_match_prefix_page(text,text,bigint,bigint,bigint,bigint,text,text)to world_v2_social_source_owner;
revoke create on schema world_v2 from world_v2_day_one_fx_history_owner;
commit;
