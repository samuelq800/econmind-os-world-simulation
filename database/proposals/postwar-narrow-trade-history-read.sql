-- SOURCE-ONLY optional history DATA seam. Install after the Trade current source,
-- Captain mixed-read and CB OMO history proposals. No issuer, runtime table
-- grant, new role, membership, source admission or automatic execution starts.
begin;
grant create on schema world_v2 to world_v2_postwar_narrow_trade_current_owner;
create function world_v2.assert_postwar_narrow_trade_history_host(p_world text,p_country text,p_seed text,p_admission text,p_version text,p_sequence text)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h record;a world_v2.runtime_opening_admission%rowtype;permit world_v2.runtime_admission_publication_permit%rowtype;host text;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_narrow_trade_source','MEMBER')or exists(select 1 from pg_roles r where r.rolname=effective and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))or exists(select 1 from pg_roles r where r.rolname in('world_v2_postwar_narrow_trade_current_owner','world_v2_postwar_projection_owner','world_v2_captain_source_owner','world_v2_day_one_fx_history_owner')and pg_has_role(effective,r.oid,'MEMBER'))then raise exception 'TRADE_HISTORY_FIXED_READER_REQUIRED'using errcode='42501';end if;
 if current_setting('transaction_read_only')<>'off'or p_world is null or p_country is null or p_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or p_version is null or p_sequence is null or p_version!~'^(0|[1-9][0-9]*)$'or p_sequence!~'^(0|[1-9][0-9]*)$'then raise exception 'TRADE_HISTORY_EXACT_SCOPE_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.narrow_current_world',p_world,true);
 select x.world_version,x.event_sequence into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found or h.world_version::text<>p_version or h.event_sequence::text<>p_sequence or h.world_version>256 or h.event_sequence>256 then raise exception 'TRADE_HISTORY_ACTUAL_HELD_HEAD_REQUIRED'using errcode='55000';end if;
 select * into a from world_v2.runtime_opening_admission x where x.world_id=p_world and x.seed_fingerprint=p_seed and x.admission_ref=p_admission for share;
 if not found or not exists(select 1 from world_v2.opening_seed s where s.world_id=p_world and s.seed_id=a.seed_id and s.seed_fingerprint=p_seed and s.replay_binding=a.replay_binding)then raise exception 'TRADE_HISTORY_ACTUAL_ADMISSION_REQUIRED'using errcode='55000';end if;
 select * into permit from world_v2.runtime_admission_publication_permit x where x.world_id=p_world and x.seed_id=a.seed_id and x.seed_fingerprint=p_seed and x.model_version=a.model_version and x.replay_binding=a.replay_binding and 'ADMISSION_'||upper(x.authorization_sha256)=p_admission and a.admitted_at_real>=x.valid_from and a.admitted_at_real<x.valid_until for share;
 if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation x where x.authorization_id=permit.authorization_id)then raise exception 'TRADE_HISTORY_ADMISSION_REVOKED'using errcode='55000';end if;
 -- New Reserve requires a live independently admitted Trade source. Source
 -- revocation never silently cancels an already COMMITTED frozen obligation;
 -- automatic fulfilment is separately checked by Trade's actual source/Atomic
 -- guard against the exact original Reserve, queue, due time, inventory and H.
 select x.source_id into host from world_v2.postwar_narrow_trade_rights_admission x join world_v2.postwar_narrow_trade_current_original o on o.world_id=x.world_id and o.source_id=x.source_id and o.seed_fingerprint=x.seed_fingerprint and o.source_payload_hash=x.source_payload_hash where x.world_id=p_world and x.seed_fingerprint=p_seed and not exists(select 1 from world_v2.postwar_narrow_trade_rights_revocation r where r.admission_ref=x.admission_ref)and exists(select 1 from jsonb_array_elements(o.canonical_payload::jsonb->'records')v where(v->>'kind'='OWNER_TRANSFER_MANDATE'and v->>'countryId'=p_country)or(v->>'kind'='CROSS_BORDER_ROUTE'and v->>'fromCountryId'=p_country))order by x.source_id limit 1 for share of x;
 if not found and not exists(select 1 from world_v2.command_submission c join world_v2.command_receipt r on r.world_id=c.world_id and r.command_id=c.command_id and r.command_fingerprint=c.command_fingerprint and r.outcome='COMMITTED'where c.world_id=p_world and c.country_id=p_country and c.command_type='CORE_GOODS_TRANSFER_V1')then raise exception 'TRADE_HISTORY_CURRENT_HOST_OR_COMMITTED_OBLIGATION_REQUIRED'using errcode='55000';end if;
end;$$;
alter function world_v2.assert_postwar_narrow_trade_history_host(text,text,text,text,text,text)owner to world_v2_postwar_narrow_trade_current_owner;
revoke all on function world_v2.assert_postwar_narrow_trade_history_host(text,text,text,text,text,text)from public;
grant execute on function world_v2.assert_postwar_narrow_trade_history_host(text,text,text,text,text,text)to world_v2_captain_source_owner,world_v2_day_one_fx_history_owner;
grant execute on function world_v2.read_postwar_captain_history_originals(text,text,text,text,text,text),world_v2.read_central_bank_omo_committed_originals(text,text,text,text,text,text,text)to world_v2_postwar_narrow_trade_source;
revoke create on schema world_v2 from world_v2_postwar_narrow_trade_current_owner;
commit;
