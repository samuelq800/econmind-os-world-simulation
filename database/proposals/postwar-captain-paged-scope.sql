-- Fixed live Captain actor/admission/host packet only; full mixed replay
-- independently comes from genuine shared paged Core on the held transaction.
begin;
grant create on schema world_v2 to world_v2_captain_source_owner;
create function world_v2.read_postwar_captain_paged_scope(p_world text,p_country text,p_subject uuid,p_expected text)
returns table(world_version text,event_sequence text,seed_id text,seed_fingerprint text,admission_ref text,captain_packets jsonb,history_mode text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h record;a world_v2.runtime_opening_admission%rowtype;host world_v2.captain_operating_source_adoption%rowtype;
 packets jsonb;n bigint;b bigint;
begin
 if current_setting('transaction_isolation')not in('repeatable read','serializable')then raise exception 'CAPTAIN_PAGED_SNAPSHOT_REQUIRED'using errcode='25001';end if;
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_captain_source_reader'or pg_has_role(session_user,'world_v2_captain_source_owner','MEMBER')or exists(select 1 from pg_roles x where x.rolname=session_user and(x.rolsuper or x.rolbypassrls or x.rolcreaterole or x.rolcreatedb or x.rolreplication))then raise exception 'CAPTAIN_MIXED_FIXED_READER_REQUIRED'using errcode='42501';end if;
 if p_world is null or p_world!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or p_country is null or p_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or p_subject is null or p_expected is null or p_expected!~'^(0|[1-9][0-9]*)$'then raise exception 'CAPTAIN_MIXED_EXACT_SCOPE_REQUIRED'using errcode='22023';end if;
 perform set_config('econmind.captain_world',p_world,true);
 if not exists(select 1 from world_v2.current_commit_authorization c where c.world_id=p_world and c.country_id=p_country and c.auth_subject=p_subject and c.office_id='CAPTAIN'and c.capability='CAPTAIN_CABINET'and c.active)or exists(select 1 from world_v2.current_commit_authorization c join world_v2.current_commit_authorization d on d.world_id=c.world_id and d.auth_subject=c.auth_subject and d.active where c.world_id=p_world and c.auth_subject=p_subject and c.active and(c.country_id<>d.country_id or c.team_id<>d.team_id or c.authorization_version<>d.authorization_version))then raise exception 'CAPTAIN_MIXED_CURRENT_ACTOR_REQUIRED'using errcode='42501';end if;
 -- Caller already holds the actual lease/adoption from custody, before H.
 select x.world_version,x.event_sequence into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found or h.world_version::text<>p_expected then raise exception 'CAPTAIN_MIXED_ACTUAL_HEAD_REQUIRED'using errcode='55000';end if;
 select * into a from world_v2.runtime_opening_admission x where x.world_id=p_world;
 if not found then raise exception 'CAPTAIN_MIXED_ADMISSION_REQUIRED'using errcode='55000';end if;
 perform world_v2.captain_publication_admission(p_world,a.seed_id,a.seed_fingerprint,a.admission_ref);
 select * into host from world_v2.captain_operating_source_adoption x where x.world_id=p_world and x.country_id=p_country for share;
 if not found or host.seed_fingerprint<>a.seed_fingerprint or exists(select 1 from world_v2.captain_operating_source_revocation x where x.adoption_ref=host.adoption_ref)then raise exception 'CAPTAIN_MIXED_CURRENT_SOURCE_REQUIRED'using errcode='55000';end if;
 select coalesce(jsonb_agg(jsonb_build_object('packet_text',x.packet_text,'packet_sha256',x.packet_sha256,'originals',(select jsonb_object_agg(o.fact_ref,o.original_text)from world_v2.captain_operating_original o where o.adoption_ref=x.adoption_ref))order by x.country_id),'[]'::jsonb)into packets from world_v2.captain_source_publication_registry x where x.world_id=p_world and x.seed_fingerprint=a.seed_fingerprint and x.world_admission_ref=a.admission_ref and x.country_id=p_country;
 if jsonb_array_length(packets)<>1 or octet_length(packets::text)>131072 then raise exception 'CAPTAIN_PAGED_EXACT_HOST_PACKET_REQUIRED'using errcode='55000';end if;
 return query select h.world_version::text,h.event_sequence::text,a.seed_id,a.seed_fingerprint,a.admission_ref,packets,'GENUINE_SHARED_PAGED_CORE_REPLAY_REQUIRED'::text;
end;$$;
alter function world_v2.read_postwar_captain_paged_scope(text,text,uuid,text)owner to world_v2_captain_source_owner;
revoke all on function world_v2.read_postwar_captain_paged_scope(text,text,uuid,text)from public;
grant execute on function world_v2.read_postwar_captain_paged_scope(text,text,uuid,text)to world_v2_captain_source_reader;
revoke create on schema world_v2 from world_v2_captain_source_owner;
commit;
