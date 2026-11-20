-- SOURCE-ONLY candidate. Install AFTER postwar-captain-current-derived-read.sql
-- and the selected paged-current reader override, BEFORE the final source
-- revocation-fence installation. The publisher requires that actual fence.
-- No new role, membership, raw-seed grant, capital, command or event is issued.
begin;
grant create on schema world_v2 to world_v2_postwar_projection_owner;
create table world_v2.postwar_captain_h0_current_document(
 document_ref text primary key,world_id text not null,country_id text not null,
 seed_fingerprint text not null,admission_ref text not null,
 adoption_ref text not null references world_v2.captain_operating_source_adoption(adoption_ref),
 source_version text not null,source_revision text not null,
 coverage jsonb not null,source_pointer jsonb not null,
 rows_text text not null check(octet_length(rows_text)<=65536 and jsonb_typeof(rows_text::jsonb)='array'and jsonb_array_length(rows_text::jsonb)=7),
 rows_sha256 text not null check(rows_sha256=encode(sha256(convert_to(rows_text,'UTF8')),'hex')),
 unique(world_id,country_id,seed_fingerprint,admission_ref)
);
alter table world_v2.postwar_captain_h0_current_document owner to world_v2_postwar_projection_owner;
alter table world_v2.postwar_captain_h0_current_document enable row level security;
alter table world_v2.postwar_captain_h0_current_document force row level security;
revoke all on world_v2.postwar_captain_h0_current_document from public;
create policy captain_h0_owner_world on world_v2.postwar_captain_h0_current_document to world_v2_postwar_projection_owner
 using(current_user='world_v2_postwar_projection_owner'and world_id=current_setting('econmind.postwar_projection_world',true))
 with check(current_user='world_v2_postwar_projection_owner'and world_id=current_setting('econmind.postwar_projection_world',true));
create trigger captain_h0_current_immutable before update or delete on world_v2.postwar_captain_h0_current_document for each row execute function world_v2.reject_authoritative_history_mutation();
create trigger captain_h0_current_no_truncate before truncate on world_v2.postwar_captain_h0_current_document for each statement execute function world_v2.reject_authoritative_history_mutation();

create function world_v2.publish_postwar_captain_h0_current(p_world text,p_country text)
returns setof world_v2.postwar_captain_h0_current_document language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h record;a record;packet jsonb;genesis jsonb;capital jsonb;rows jsonb;coverage jsonb;pointer jsonb;
 b world_v2.postwar_office_projection_document%rowtype;d world_v2.postwar_captain_h0_current_document%rowtype;
 pin_count integer;state_hash text;empty_hash text;prefix_hash text;ref text;version text;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')
 or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_reader','MEMBER')
 or has_schema_privilege(effective,'world_v2','CREATE')
 or exists(select 1 from pg_roles r where r.rolname=effective and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))
 then raise exception 'CAPTAIN_H0_FIXED_SEPARATE_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if p_world is null or p_world!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or p_country is null or p_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'
 then raise exception 'CAPTAIN_H0_EXACT_SCOPE_REQUIRED'using errcode='22023';end if;
 -- Acquire the actual versioned fence BEFORE establishing source/head snapshot.
 -- The effective role remains the publisher under this fixed definer call.
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 perform set_config('econmind.postwar_projection_world',p_world,true);
 perform set_config('econmind.captain_world',p_world,true);
 select x.world_version,x.event_sequence into strict h from world_v2.world_head x where x.world_id=p_world for share;
 if h.world_version<>0 or h.event_sequence<>0
 or exists(select 1 from world_v2.authoritative_event e where e.world_id=p_world)
 or exists(select 1 from world_v2.command_receipt r where r.world_id=p_world and r.outcome='COMMITTED')
 or exists(select 1 from world_v2.financial_posting_batch j where j.world_id=p_world)
 or exists(select 1 from world_v2.inventory_posting j where j.world_id=p_world)
 then raise exception 'CAPTAIN_H0_ACTUAL_ZERO_HEAD_AND_JOURNALS_REQUIRED'using errcode='55000';end if;
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 packet:=world_v2.postwar_captain_projection_current_original(p_world,p_country,a.seed_fingerprint,a.admission_ref);
 genesis:=(packet->'genesis'->>'canonicalPayload')::jsonb;
 if genesis->>'schemaVersion'is distinct from 'captain-operating-genesis-v1'
 or genesis->>'worldId'is distinct from p_world or genesis->>'countryId'is distinct from p_country
 or genesis->>'seedId'is distinct from a.seed_id or genesis->>'seedFingerprint'is distinct from a.seed_fingerprint
 or packet->'genesis'->>'effectiveFromSimTime'is distinct from '0'
 or(packet->'genesis'->'effectiveUntilSimTime'<>'null'::jsonb and(packet->'genesis'->>'effectiveUntilSimTime')::numeric<=0)
 then raise exception 'CAPTAIN_H0_ACTUAL_EFFECTIVE_GENESIS_REQUIRED'using errcode='23514';end if;
 capital:=world_v2.postwar_captain_capital(genesis->'capital',p_country);
 select count(distinct x.canonical_seed_sha256)into pin_count from world_v2.postwar_office_projection_document x
 where x.world_id=p_world and x.country_id=p_country and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref;
 if pin_count<>1 then raise exception 'CAPTAIN_H0_UNIQUE_CANONICAL_PARENT_REQUIRED'using errcode='55000';end if;
 select * into b from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_country
 and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref
 and x.world_version=0 and x.event_sequence=0 and x.model_version=a.model_version and x.replay_binding=a.replay_binding
 and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.world_id=p_world and r.document_ref=x.document_ref)
 order by x.document_ref limit 1;
 if not found then raise exception 'CAPTAIN_H0_LIVE_CANONICAL_PARENT_REQUIRED'using errcode='55000';end if;
 select jsonb_agg(jsonb_build_object('schemaVersion','postwar-captain-political-capital-row-v1','countryId',p_country,'capitalRef',capital->>'capitalRef','bucket',x->>'bucket','unit','political_capital','balance',x->'balance'->>'amount','opening',capital->'opening'->>'amount','generated',capital->'generated'->>'amount','total',capital->'total'->>'amount','available',capital->'available'->>'amount','spent',capital->'spent'->>'amount','closing',capital->'closing'->>'amount','allocationNature','REALLOCATION_NOT_GENERATION_OR_SPENDING')order by n)
 into rows from jsonb_array_elements(capital->'buckets')with ordinality q(x,n);
 state_hash:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(capital),'UTF8')),'hex');
 empty_hash:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||'[]','UTF8')),'hex');
 prefix_hash:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(jsonb_build_object('schemaVersion','postwar-captain-empty-opening-prefix-v1','worldId',p_world,'seedFingerprint',a.seed_fingerprint,'head',jsonb_build_object('worldVersion','0','eventSequence','0'),'frames','[]'::jsonb)),'UTF8')),'hex');
 coverage:=jsonb_build_object('schemaVersion','postwar-captain-opening-current-coverage-v1','reducerVersion','POSTWAR_CAPTAIN_ADMITTED_GENESIS_EXACT_H0_V1','countryId',p_country,'coverageRef','CAPTAIN_H0_COVERAGE_'||upper(substr(state_hash,8)),'prefixFingerprint',prefix_hash,'knownEffectsFingerprint',empty_hash,'globalWorldVersion','0','globalEventSequence','0','coveredThroughEventId',null,'coveredThroughEventFingerprint',null,'financialPostingCount','0','financialBatchCount','0','financialPostingsFingerprint',empty_hash,'capitalStateHash',state_hash,'originalPacketSha256',packet->>'packetSha256','originWorldVersion','0','originEventSequence','0');
 pointer:=jsonb_build_object('schemaVersion','postwar-captain-current-source-pointer-v2','canonicalSeedSha256',b.canonical_seed_sha256,'canonicalSeedParent',jsonb_build_object('documentRef',b.document_ref,'documentSha256',b.document_sha256,'sourceVersion',b.source_version),'lastCaptainEvent',null,'table','captain_operating_original','adoptionRef',packet->'adoption'->>'adoptionRef','genesisFactRef',packet->'genesis'->>'factRef','genesisPayloadSha256',packet->'genesis'->>'payloadSHA256','originalAdmissionEvidenceSha256',packet->'adoption'->>'originalAdmissionEvidenceSha256','currentDerivation','ADMITTED_CAPTAIN_GENESIS_AT_EXACT_H0','capitalStateHash',state_hash);
 ref:='CAPTAIN_H0_CURRENT_'||upper(encode(sha256(convert_to(world_v2.canonical_json(jsonb_build_array(p_world,p_country,a.seed_fingerprint,a.admission_ref,coverage,rows,pointer)),'UTF8')),'hex'));
 version:='sha256:'||encode(sha256(convert_to(ref||rows::text,'UTF8')),'hex');
 insert into world_v2.postwar_captain_h0_current_document values(ref,p_world,p_country,a.seed_fingerprint,a.admission_ref,packet->'adoption'->>'adoptionRef',version,packet->'genesis'->>'revision',coverage,pointer,rows::text,encode(sha256(convert_to(rows::text,'UTF8')),'hex'))on conflict(world_id,country_id,seed_fingerprint,admission_ref)do nothing;
 select * into strict d from world_v2.postwar_captain_h0_current_document x where x.world_id=p_world and x.country_id=p_country and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref;
 if d.document_ref<>ref or d.source_version<>version or d.coverage<>coverage or d.source_pointer<>pointer or d.rows_text<>rows::text
 then raise exception 'CAPTAIN_H0_IMMUTABLE_PUBLICATION_CONFLICT'using errcode='23514';end if;
 return next d;
end;$$;
alter function world_v2.publish_postwar_captain_h0_current(text,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.publish_postwar_captain_h0_current(text,text)from public;
grant execute on function world_v2.publish_postwar_captain_h0_current(text,text)to world_v2_postwar_projection_publisher;

-- Preserve the installed H>0 dispatcher byte-for-byte and keep it internal.
alter function world_v2.read_postwar_captain_current_page(text,integer,integer,text)rename to read_postwar_captain_current_page_before_h0_v1;
revoke all on function world_v2.read_postwar_captain_current_page_before_h0_v1(text,integer,integer,text)from public,world_v2_postwar_projection_reader;
create function world_v2.read_postwar_captain_current_page(p_world text,p_offset integer,p_limit integer,p_expected text default null)
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
alter function world_v2.read_postwar_captain_current_page(text,integer,integer,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.read_postwar_captain_current_page(text,integer,integer,text)from public;
grant execute on function world_v2.read_postwar_captain_current_page(text,integer,integer,text)to world_v2_postwar_projection_reader;
revoke create on schema world_v2 from world_v2_postwar_projection_owner;
commit;
