-- UPGRADE-ONLY CANDIDATE. No execution, admission or production approval.
-- Exact installed lineage: 0cf65bc0e6cbf1b117ca625bb16ec7280938e239 -> 4b6d400c2620303bfdc167d6645adfbfed3f3e04.
-- Old proposal SHA256: c20c56240db1d03f7279099cb5965eca6233eed12e7c68a28b6c389005740098
-- New proposal SHA256: b2d46d498c57e7e4f43013b0bbf29028f63d34184a368893ac5915ca7556b779
-- Preserves all rows, existing function OIDs/ACLs, role memberships, RLS and triggers.
-- Run only after separately approved caller drain and exact catalog review.
-- Any mismatch or repeated execution rejects atomically; do not retry UNKNOWN.
-- No generic DDL executor, new role/runtime grant, source issuer or World write.
begin;
do $preflight$declare f record;actual_readers text[];begin
 if not exists(select 1 from pg_roles where rolname='world_v2_postwar_projection_owner'and not(rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))or has_schema_privilege('world_v2_postwar_projection_owner','world_v2','CREATE')then raise exception 'PROPOSAL_UPGRADE_EXACT_OWNER_REQUIRED'using errcode='42501';end if;
 if not exists(select 1 from pg_class c where c.oid=to_regclass('world_v2.postwar_captain_current_document')and c.relkind='r'and pg_get_userbyid(c.relowner)='world_v2_postwar_projection_owner'and c.relrowsecurity and c.relforcerowsecurity)then raise exception 'PROPOSAL_UPGRADE_EXISTING_FORCED_RLS_REQUIRED'using errcode='55000';end if;
 if not exists(select 1 from pg_class c where c.oid=to_regclass('world_v2.postwar_captain_h0_current_document')and c.relkind='r'and pg_get_userbyid(c.relowner)='world_v2_postwar_projection_owner'and c.relrowsecurity and c.relforcerowsecurity)then raise exception 'PROPOSAL_UPGRADE_EXISTING_FORCED_RLS_REQUIRED'using errcode='55000';end if;
 select p.*,pg_get_function_result(p.oid)as result,pg_get_userbyid(p.proowner)as owner_name into f from pg_proc p where p.oid=to_regprocedure('world_v2.read_postwar_captain_current_page(text,integer,integer,text)');
 if not found or f.proisstrict or f.proleakproof or f.proparallel<>'u'or f.pronargdefaults<>1 or pg_get_expr(f.proargdefaults,0)is distinct from 'NULL::text' or f.owner_name<>'world_v2_postwar_projection_owner'or not f.prosecdef or f.prokind<>'f'or f.provolatile<>'v'or not f.proretset or f.proconfig is distinct from array['search_path=pg_catalog']::text[]or f.proargnames is distinct from array['p_world','p_offset','p_limit','p_expected','status','scope','source','page','rows_text']::text[]or f.result<>'TABLE(status text, scope jsonb, source jsonb, page jsonb, rows_text text)'or f.prolang<>(select oid from pg_language where lanname='plpgsql')or encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>'2abebf6800000c7c882b1a89c733692c924efc7af1892efa35e6669c17ead355'then raise exception 'PROPOSAL_UPGRADE_EXACT_OLD_FUNCTION_REQUIRED'using errcode='55000';end if;
 if exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner)))x where x.grantee=0 or x.privilege_type<>'EXECUTE'or x.is_grantable)then raise exception 'PROPOSAL_UPGRADE_EXACT_FUNCTION_ACL_REQUIRED'using errcode='42501';end if;
 select coalesce(array_agg(pg_get_userbyid(x.grantee)::text order by pg_get_userbyid(x.grantee)::text),array[]::text[])into actual_readers from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner)))x where x.grantee<>f.proowner;
 if actual_readers is distinct from array['world_v2_postwar_projection_reader']::text[]then raise exception 'PROPOSAL_UPGRADE_EXACT_FUNCTION_ACL_REQUIRED'using errcode='42501';end if;
 if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('world_v2.read_postwar_captain_current_page_before_h0_v1(text,integer,integer,text)')and pg_get_userbyid(p.proowner)='world_v2_postwar_projection_owner'and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='8dadcfc9515984f8987ea59fc145534c663813aa91a358128fc5bbd9fcec17b2'and p.prosecdef and p.proconfig=array['search_path=pg_catalog']::text[])then raise exception 'PROPOSAL_UPGRADE_EXACT_PAGED_H0_PREDECESSOR_REQUIRED'using errcode='55000';end if;
 if to_regprocedure('world_v2.postwar_captain_allocation_options(jsonb,text)')is not null then raise exception 'PROPOSAL_UPGRADE_NEW_HELPER_MUST_BE_ABSENT'using errcode='55000';end if;
end;$preflight$;
create function world_v2.postwar_captain_allocation_options(p_packet jsonb,p_country text)returns jsonb
language plpgsql immutable set search_path=pg_catalog as $$
declare original jsonb;body jsonb;items jsonb:='[]';result jsonb;
begin
 if p_packet is null then return null;end if;
 if p_packet->'adoption'->>'countryId'is distinct from p_country or p_packet->>'packetSha256'!~'^[a-f0-9]{64}$'or jsonb_typeof(p_packet->'reasons')is distinct from'array'or jsonb_array_length(p_packet->'reasons')not between 1 and 64 then raise exception 'CAPTAIN_ALLOCATION_ACTUAL_PACKET_REQUIRED'using errcode='23514';end if;
 for original in select x from jsonb_array_elements(p_packet->'reasons')x loop
  body:=(original->>'canonicalPayload')::jsonb;
  if original->>'payloadSHA256'is distinct from encode(sha256(convert_to(original->>'canonicalPayload','UTF8')),'hex')or body->>'schemaVersion'is distinct from'captain-operating-reason-v1'or body->>'countryId'is distinct from p_country or body->'reason'->>'countryRef'is distinct from p_country then raise exception 'CAPTAIN_ALLOCATION_ACTUAL_REASON_REQUIRED'using errcode='23514';end if;
  items:=items||jsonb_build_array(jsonb_build_object('factRef',original->'factRef','sourceRef',original->'sourceRef','payloadSha256',original->'payloadSHA256','revision',original->'revision','sourceClass',original->'sourceClass','effectiveFromSimTime',original->'effectiveFromSimTime','effectiveUntilSimTime',original->'effectiveUntilSimTime','recordRef',body->'reason'->'recordRef','reason',body->'reason'->'reason'));
 end loop;
 result:=jsonb_build_object('schemaVersion','postwar-captain-allocation-options-v1','classification','REGISTERED_REASON_REFERENCES_NOT_ALLOCATION_APPROVAL','countryId',p_country,'originalPacketSha256',p_packet->'packetSha256','reasons',items);
 -- An oversized options list closes this form, without breaking an existing
 -- current-balance page or silently truncating its registered originals.
 if octet_length(result::text)>16384 then return null;end if;
 return result;
end;$$;
alter function world_v2.postwar_captain_allocation_options(jsonb,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.postwar_captain_allocation_options(jsonb,text)from public;
create or replace function world_v2.read_postwar_captain_current_page(p_world text,p_offset integer,p_limit integer,p_expected text default null)
returns table(status text,scope jsonb,source jsonb,page jsonb,rows_text text)
language plpgsql security definer set search_path=pg_catalog as $$
declare s record;d world_v2.postwar_captain_h0_current_document%rowtype;packet jsonb;selected jsonb;returned integer;
begin
 if p_offset is null or p_limit is null or p_offset<0 or p_offset>100000 or p_limit<1 or p_limit>100 or(p_offset>0 and p_expected is null)or(p_expected is not null and p_expected!~'^sha256:[a-f0-9]{64}$')then raise exception 'CAPTAIN_CURRENT_INVALID_PAGE'using errcode='22023';end if;
 select * into s from world_v2.read_postwar_office_projection_seats(p_world)x where x.office_id='CAPTAIN';
 if not found then return query select'DENIED',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 if s.world_version<>'0'or s.event_sequence<>'0'then
  if p_expected is not null and exists(select 1 from world_v2.postwar_captain_h0_current_document x where x.world_id=p_world and x.country_id=s.country_id and x.source_version=p_expected)then return query select'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
  return query select * from world_v2.read_postwar_captain_current_page_before_h0_v1(p_world,p_offset,p_limit,p_expected);return;
 end if;
 -- Null through-event references are legal ONLY for this exact zero-state path.
 if exists(select 1 from world_v2.authoritative_event e where e.world_id=p_world)
 or exists(select 1 from world_v2.command_receipt r where r.world_id=p_world and r.outcome='COMMITTED')
 or exists(select 1 from world_v2.financial_posting_batch j where j.world_id=p_world)
 or exists(select 1 from world_v2.inventory_posting j where j.world_id=p_world)
 then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into d from world_v2.postwar_captain_h0_current_document x where x.world_id=p_world and x.country_id=s.country_id and x.seed_fingerprint=s.seed_fingerprint and x.admission_ref=s.admission_ref;
 if not found then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 if p_expected is not null and p_expected<>d.source_version then return query select'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 perform set_config('econmind.captain_world',p_world,true);
 packet:=world_v2.postwar_captain_projection_readable_original(p_world,s.country_id,s.seed_fingerprint,s.admission_ref);
 if packet is null or d.coverage->>'originalPacketSha256'is distinct from packet->>'packetSha256'
 or not coalesce(world_v2.postwar_captain_current_parent_readable(p_world,s.country_id,s.seed_id,s.seed_fingerprint,s.admission_ref,d.source_pointer),false)
 or exists(select 1 from world_v2.postwar_office_projection_revocation r where r.world_id=p_world and r.document_ref=d.source_pointer->'canonicalSeedParent'->>'documentRef')
 or d.rows_sha256<>encode(sha256(convert_to(d.rows_text,'UTF8')),'hex')
 or d.coverage->>'schemaVersion'is distinct from 'postwar-captain-opening-current-coverage-v1'
 or d.coverage->>'globalWorldVersion'is distinct from '0'or d.coverage->>'globalEventSequence'is distinct from '0'
 or d.coverage->'coveredThroughEventId'is distinct from 'null'::jsonb or d.coverage->'coveredThroughEventFingerprint'is distinct from 'null'::jsonb
 or d.source_pointer->'lastCaptainEvent'is distinct from 'null'::jsonb
 then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select coalesce(jsonb_agg(x order by n),'[]')into selected from jsonb_array_elements(d.rows_text::jsonb)with ordinality q(x,n)where n>p_offset and n<=p_offset+p_limit;returned:=jsonb_array_length(selected);
 return query select case when returned=0 then'EMPTY'else'PAGE'end,
 jsonb_build_object('worldId',s.world_id,'countryId',s.country_id,'officeId',s.office_id,'authSubject',s.auth_subject,'teamId',s.team_id,'authorizationVersion',s.authorization_revision,'scopeKey',s.scope_key,'seatRef',s.seat_ref),
 jsonb_build_object('dataNature','ADMITTED_OPENING_POLITICAL_CAPITAL_GENESIS','sourceVersion',d.source_version,'sourceRevision',d.source_revision,'seedId',s.seed_id,'seedFingerprint',s.seed_fingerprint,'admissionRef',s.admission_ref,'modelVersion',s.model_version,'replayBinding',s.replay_binding,'sourceBundleSha256',s.source_bundle_sha256,'canonicalSeedSha256',d.source_pointer->>'canonicalSeedSha256','worldVersion','0','eventSequence','0','originWorldVersion','0','originEventSequence','0','observedHead',jsonb_build_object('worldVersion','0','eventSequence','0'),'currentCaptainCoverage',d.coverage,'pageHash',d.rows_sha256,'returnedRowsHash',encode(sha256(convert_to(selected::text,'UTF8')),'hex'),'hashAlgorithm','POSTGRES_JSONB_TEXT_UTF8_SHA256','sourcePointer',d.source_pointer)||case when world_v2.postwar_captain_allocation_options(packet,s.country_id)is null then '{}'::jsonb else jsonb_build_object('currentCaptainAllocationOptions',world_v2.postwar_captain_allocation_options(packet,s.country_id))end,
 jsonb_build_object('offset',p_offset,'limit',p_limit,'returned',returned,'total',7,'nextOffset',case when p_offset+returned<7 then p_offset+returned else null end),selected::text;
end;$$;
do $postflight$declare f record;actual_readers text[];begin
 select p.*,pg_get_function_result(p.oid)as result,pg_get_userbyid(p.proowner)as owner_name into f from pg_proc p where p.oid=to_regprocedure('world_v2.read_postwar_captain_current_page(text,integer,integer,text)');
 if not found or f.proisstrict or f.proleakproof or f.proparallel<>'u'or f.pronargdefaults<>1 or pg_get_expr(f.proargdefaults,0)is distinct from 'NULL::text' or f.owner_name<>'world_v2_postwar_projection_owner'or not f.prosecdef or f.prokind<>'f'or f.provolatile<>'v'or not f.proretset or f.proconfig is distinct from array['search_path=pg_catalog']::text[]or f.proargnames is distinct from array['p_world','p_offset','p_limit','p_expected','status','scope','source','page','rows_text']::text[]or f.result<>'TABLE(status text, scope jsonb, source jsonb, page jsonb, rows_text text)'or f.prolang<>(select oid from pg_language where lanname='plpgsql')or encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>'01eb84f2212dba8d23f8eb760d37f6ccf1738a99fd7bd81fa9ba1265d4875fba'then raise exception 'PROPOSAL_UPGRADE_EXACT_NEW_FUNCTION_REQUIRED'using errcode='55000';end if;
 if exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner)))x where x.grantee=0 or x.privilege_type<>'EXECUTE'or x.is_grantable)then raise exception 'PROPOSAL_UPGRADE_EXACT_FUNCTION_ACL_REQUIRED'using errcode='42501';end if;
 select coalesce(array_agg(pg_get_userbyid(x.grantee)::text order by pg_get_userbyid(x.grantee)::text),array[]::text[])into actual_readers from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner)))x where x.grantee<>f.proowner;
 if actual_readers is distinct from array['world_v2_postwar_projection_reader']::text[]then raise exception 'PROPOSAL_UPGRADE_EXACT_FUNCTION_ACL_REQUIRED'using errcode='42501';end if;
 if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x where p.oid=to_regprocedure('world_v2.postwar_captain_allocation_options(jsonb,text)')and(x.grantee<>p.proowner or x.privilege_type<>'EXECUTE'or x.is_grantable))then raise exception 'PROPOSAL_UPGRADE_PRIVATE_HELPER_ACL_REQUIRED'using errcode='42501';end if;
end;$postflight$;
commit;
