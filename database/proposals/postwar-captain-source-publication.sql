-- CANDIDATE ONLY. Depends on captain-operating-custody.sql and
-- runtime-admission-publication.sql. No new role, membership or capital value.
-- The existing controlled release principal registers exact reviewed bytes;
-- this is source adoption custody, never an Owner signature or P0 approval.
begin;
grant create on schema world_v2 to world_v2_captain_source_owner;
create table world_v2.captain_source_publication_registry(
 adoption_ref text primary key,world_id text not null,country_id text not null,
 seed_id text not null,seed_fingerprint text not null,world_admission_ref text not null,
 packet_sha256 text not null check(packet_sha256~'^[a-f0-9]{64}$'),
 packet_text text not null check(octet_length(packet_text)<=65536 and packet_sha256=encode(sha256(convert_to(packet_text,'UTF8')),'hex')),
 original_admission_evidence_sha256 text not null check(original_admission_evidence_sha256~'^[a-f0-9]{64}$'),
 registered_at timestamptz not null default clock_timestamp(),
 unique(world_id,country_id),
 foreign key(world_id,seed_fingerprint)references world_v2.opening_seed(world_id,seed_fingerprint)
);
alter table world_v2.captain_source_publication_registry owner to world_v2_captain_source_owner;
revoke all on world_v2.captain_source_publication_registry from public;
create trigger captain_source_publication_registry_immutable before update or delete on world_v2.captain_source_publication_registry for each row execute function world_v2.reject_authoritative_history_mutation();
create trigger captain_source_publication_registry_no_truncate before truncate on world_v2.captain_source_publication_registry for each statement execute function world_v2.reject_authoritative_history_mutation();
grant select(world_id,seed_id,seed_fingerprint)on world_v2.opening_seed to world_v2_captain_source_owner;
grant select on world_v2.runtime_opening_admission,world_v2.runtime_admission_publication_permit,world_v2.runtime_admission_publication_revocation to world_v2_captain_source_owner;
grant update(seed_id)on world_v2.runtime_opening_admission to world_v2_captain_source_owner;
grant update(authorization_id)on world_v2.runtime_admission_publication_permit to world_v2_captain_source_owner;
create policy captain_publication_seed_read on world_v2.opening_seed for select to world_v2_captain_source_owner using(current_user='world_v2_captain_source_owner'and world_id=current_setting('econmind.captain_world',true));
create policy captain_publication_seed_fence on world_v2.opening_seed as restrictive for select to world_v2_captain_source_owner using(current_user='world_v2_captain_source_owner'and world_id=current_setting('econmind.captain_world',true));
do $$declare t text;begin foreach t in array array['runtime_opening_admission','runtime_admission_publication_permit']loop
 execute format('create policy captain_publication_read on world_v2.%I for select to world_v2_captain_source_owner using(current_user=''world_v2_captain_source_owner''and world_id=current_setting(''econmind.captain_world'',true))',t);
 execute format('create policy captain_publication_fence on world_v2.%I as restrictive for select to world_v2_captain_source_owner using(current_user=''world_v2_captain_source_owner''and world_id=current_setting(''econmind.captain_world'',true))',t);
 end loop;end;$$;
create policy captain_publication_lock on world_v2.runtime_opening_admission for update to world_v2_captain_source_owner using(current_user='world_v2_captain_source_owner'and world_id=current_setting('econmind.captain_world',true))with check(false);
-- Internal function has no operational EXECUTE grant. It fixes admission and
-- current permit before either registry insertion or publication. No raw seed.
create function world_v2.captain_publication_admission(p_world text,p_seed text,p_fp text,p_admission text)returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;p world_v2.runtime_admission_publication_permit%rowtype;
begin
 perform set_config('econmind.captain_world',p_world,true);
 select * into a from world_v2.runtime_opening_admission x where x.world_id=p_world and x.seed_id=p_seed and x.seed_fingerprint=p_fp and x.admission_ref=p_admission for share;
 if not found or not exists(select 1 from world_v2.opening_seed s where s.world_id=p_world and s.seed_id=p_seed and s.seed_fingerprint=p_fp)then raise exception 'CAPTAIN_ACTUAL_ADMISSION_REQUIRED'using errcode='55000';end if;
 select * into p from world_v2.runtime_admission_publication_permit x where 'ADMISSION_'||upper(x.authorization_sha256)=a.admission_ref and x.world_id=a.world_id and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.model_version=a.model_version and x.replay_binding=a.replay_binding and a.admitted_at_real>=x.valid_from and a.admitted_at_real<x.valid_until for share;
 if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=p.authorization_id)then raise exception 'CAPTAIN_CURRENT_ADMISSION_REVOKED'using errcode='55000';end if;
end;$$;
-- Release is an existing NOLOGIN permission boundary. This proposal does not
-- grant membership, install credentials, or automatically register anything.
create function world_v2.register_captain_source_publication(p_packet text,p_sha text)returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;j jsonb;a jsonb;r world_v2.captain_source_publication_registry%rowtype;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_admission_release'or not pg_has_role(session_user,'world_v2_admission_release','MEMBER')then raise exception 'CAPTAIN_CONTROLLED_RELEASE_REQUIRED'using errcode='42501';end if;
 if p_packet is null or octet_length(p_packet)>65536 or p_sha is null or p_sha!~'^[a-f0-9]{64}$'or p_sha<>encode(sha256(convert_to(p_packet,'UTF8')),'hex')then raise exception 'CAPTAIN_EXACT_BOUNDED_PACKET_REQUIRED'using errcode='22023';end if;
 j:=p_packet::jsonb;a:=j->'adoption';
 if j->>'schemaVersion'is distinct from 'postwar-captain-source-publication-v1'or jsonb_typeof(a)<>'object'or a->>'adoptionRef'is null or a->>'worldId'is null or a->>'countryId'!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or a->>'seedId'is null or a->>'seedFingerprint'!~'^sha256:[a-f0-9]{64}$'or a->>'worldAdmissionRef'is null or a->>'originalAdmissionEvidenceSha256'!~'^[a-f0-9]{64}$'then raise exception 'CAPTAIN_EXPLICIT_ADOPTION_REQUIRED'using errcode='22023';end if;
 perform world_v2.captain_publication_admission(a->>'worldId',a->>'seedId',a->>'seedFingerprint',a->>'worldAdmissionRef');
 insert into world_v2.captain_source_publication_registry(adoption_ref,world_id,country_id,seed_id,seed_fingerprint,world_admission_ref,packet_sha256,packet_text,original_admission_evidence_sha256)
 values(a->>'adoptionRef',a->>'worldId',a->>'countryId',a->>'seedId',a->>'seedFingerprint',a->>'worldAdmissionRef',p_sha,p_packet,a->>'originalAdmissionEvidenceSha256')on conflict(adoption_ref)do nothing;
 select * into r from world_v2.captain_source_publication_registry x where x.adoption_ref=a->>'adoptionRef' for share;
 if r.packet_sha256 is distinct from p_sha or r.world_id is distinct from a->>'worldId'or r.country_id is distinct from a->>'countryId'or r.seed_fingerprint is distinct from a->>'seedFingerprint'or r.world_admission_ref is distinct from a->>'worldAdmissionRef'then raise exception 'CAPTAIN_IMMUTABLE_REGISTRY_CONFLICT'using errcode='23514';end if;
end;$$;
create function world_v2.publish_captain_operating_source(p_packet text,p_sha text)returns table(adoption_ref text,packet_sha256 text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;j jsonb;a jsonb;r world_v2.captain_source_publication_registry%rowtype;o jsonb;items jsonb;kind text;raw text;expected integer;actual integer;stored world_v2.captain_operating_source_adoption%rowtype;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_admission_release'or not pg_has_role(session_user,'world_v2_admission_release','MEMBER')then raise exception 'CAPTAIN_CONTROLLED_RELEASE_REQUIRED'using errcode='42501';end if;
 if p_packet is null or octet_length(p_packet)>65536 or p_sha is null or p_sha!~'^[a-f0-9]{64}$'or p_sha<>encode(sha256(convert_to(p_packet,'UTF8')),'hex')then raise exception 'CAPTAIN_EXACT_BOUNDED_PACKET_REQUIRED'using errcode='22023';end if;
 j:=p_packet::jsonb;a:=j->'adoption';
 select * into r from world_v2.captain_source_publication_registry x where x.adoption_ref=a->>'adoptionRef'and x.packet_sha256=p_sha for share;
 if not found or r.world_id is distinct from a->>'worldId'or r.country_id is distinct from a->>'countryId'or r.seed_id is distinct from a->>'seedId'or r.seed_fingerprint is distinct from a->>'seedFingerprint'or r.world_admission_ref is distinct from a->>'worldAdmissionRef'or r.original_admission_evidence_sha256 is distinct from a->>'originalAdmissionEvidenceSha256'then raise exception 'CAPTAIN_EXACT_REGISTERED_PACKET_REQUIRED'using errcode='55000';end if;
 perform world_v2.captain_publication_admission(r.world_id,r.seed_id,r.seed_fingerprint,r.world_admission_ref);
 if exists(select 1 from world_v2.captain_operating_source_revocation x where x.adoption_ref=r.adoption_ref)then raise exception 'CAPTAIN_ADOPTION_REVOKED'using errcode='55000';end if;
 if j->>'schemaVersion'is distinct from 'postwar-captain-source-publication-v1'or jsonb_typeof(j->'genesis')<>'object'or jsonb_typeof(j->'reasons')<>'array'or jsonb_array_length(j->'reasons')not between 1 and 64 then raise exception 'CAPTAIN_GENESIS_AND_REASONS_REQUIRED'using errcode='23514';end if;
 insert into world_v2.captain_operating_source_adoption values(r.adoption_ref,r.world_id,r.country_id,r.seed_fingerprint,a->>'issuerRef',a->>'custodianRef',a->>'admissionRef',a->>'admissionRevision',r.original_admission_evidence_sha256)on conflict on constraint captain_operating_source_adoption_pkey do nothing;
 select * into stored from world_v2.captain_operating_source_adoption x where x.adoption_ref=r.adoption_ref for update;
 if stored.world_id is distinct from r.world_id or stored.country_id is distinct from r.country_id or stored.seed_fingerprint is distinct from r.seed_fingerprint or stored.issuer_ref is distinct from a->>'issuerRef'or stored.custodian_ref is distinct from a->>'custodianRef'or stored.admission_ref is distinct from a->>'admissionRef'or stored.admission_revision is distinct from a->>'admissionRevision'or stored.original_admission_evidence_sha256 is distinct from r.original_admission_evidence_sha256 then raise exception 'CAPTAIN_ADOPTION_CONFLICT'using errcode='23514';end if;
 items:=jsonb_build_array(j->'genesis')||(j->'reasons');expected:=jsonb_array_length(items);
 if(select count(distinct v->>'factRef')from jsonb_array_elements(items)v)<>expected then raise exception 'CAPTAIN_UNIQUE_ORIGINALS_REQUIRED'using errcode='23514';end if;
 for o in select value from jsonb_array_elements(items)loop
 kind:=case when o=j->'genesis'then 'GENESIS'else 'REASON'end;raw:=o->>'canonicalPayload';
 if raw is null or octet_length(raw)>65536 or o->>'payloadSHA256'is distinct from encode(sha256(convert_to(raw,'UTF8')),'hex')or o->>'issuerRef'is distinct from stored.issuer_ref or o->>'custodianRef'is distinct from stored.custodian_ref or o->>'admissionRef'is distinct from stored.admission_ref or o->>'admissionRevision'is distinct from stored.admission_revision or o->>'sourceClass'not in('ADMITTED_ORIGINAL','TEST_ONLY')or o->'revokedByRevision'is distinct from 'null'::jsonb or raw::jsonb->>'worldId'is distinct from r.world_id or raw::jsonb->>'countryId'is distinct from r.country_id then raise exception 'CAPTAIN_EXACT_ORIGINAL_REQUIRED'using errcode='23514';end if;
 if kind='GENESIS'and(raw::jsonb->>'schemaVersion'is distinct from 'captain-operating-genesis-v1'or raw::jsonb->>'seedId'is distinct from r.seed_id or raw::jsonb->>'seedFingerprint'is distinct from r.seed_fingerprint)then raise exception 'CAPTAIN_EXACT_GENESIS_REQUIRED'using errcode='23514';end if;
 if kind='REASON'and raw::jsonb->>'schemaVersion'is distinct from 'captain-operating-reason-v1'then raise exception 'CAPTAIN_EXACT_REASON_REQUIRED'using errcode='23514';end if;
 -- Preserve the exact canonical original bytes embedded by the builder. jsonb
 -- itself is NOT canonical JSON, so the packet also retains originalText.
 -- The immutable wrapper text is transported as the packet's originalTexts
 -- map, whose hash is part of the separately registered complete packet.
 raw:=j->'originalTexts'->>(o->>'factRef');
 if raw is null or raw::jsonb is distinct from o then raise exception 'CAPTAIN_EXACT_WRAPPER_TEXT_REQUIRED'using errcode='23514';end if;
 insert into world_v2.captain_operating_original values(r.adoption_ref,kind,o->>'factRef',raw,encode(sha256(convert_to(raw,'UTF8')),'hex'))on conflict do nothing;
 if not exists(select 1 from world_v2.captain_operating_original x where x.adoption_ref=r.adoption_ref and x.record_kind=kind and x.fact_ref=o->>'factRef'and x.original_text=raw)then raise exception 'CAPTAIN_ORIGINAL_CONFLICT'using errcode='23514';end if;
 end loop;
 select count(*)into actual from world_v2.captain_operating_original x where x.adoption_ref=r.adoption_ref;
 if actual<>expected then raise exception 'CAPTAIN_EXACT_ORIGINAL_SET_REQUIRED'using errcode='23514';end if;
 return query select r.adoption_ref,r.packet_sha256;
end;$$;
alter function world_v2.captain_publication_admission(text,text,text,text)owner to world_v2_captain_source_owner;
alter function world_v2.register_captain_source_publication(text,text)owner to world_v2_captain_source_owner;
alter function world_v2.publish_captain_operating_source(text,text)owner to world_v2_captain_source_owner;
revoke all on function world_v2.captain_publication_admission(text,text,text,text),world_v2.register_captain_source_publication(text,text),world_v2.publish_captain_operating_source(text,text)from public;
grant execute on function world_v2.register_captain_source_publication(text,text),world_v2.publish_captain_operating_source(text,text)to world_v2_admission_release;
-- Fixed new-scenario H0 guard for the adopted policy producer. No World
-- mutation occurs; the same outer transaction retains the actual head lock.
grant select(world_id,world_version,event_sequence)on world_v2.world_head to world_v2_captain_source_owner;
grant update(world_version)on world_v2.world_head to world_v2_captain_source_owner;
grant select(world_id)on world_v2.command_submission,world_v2.command_receipt,world_v2.authoritative_event to world_v2_captain_source_owner;
do $$declare t text;begin foreach t in array array['world_head','command_submission','command_receipt','authoritative_event']loop
 execute format('create policy captain_new_scope_read on world_v2.%I for select to world_v2_captain_source_owner using(current_user=''world_v2_captain_source_owner''and world_id=current_setting(''econmind.captain_world'',true))',t);
 execute format('create policy captain_new_scope_fence on world_v2.%I as restrictive for select to world_v2_captain_source_owner using(current_user=''world_v2_captain_source_owner''and world_id=current_setting(''econmind.captain_world'',true))',t);
 end loop;end;$$;
create function world_v2.read_captain_new_scenario_opening_scope(p_world text,p_fp text,p_admission text)
returns table(seed_id text,seed_fingerprint text,admission_ref text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h record;a world_v2.runtime_opening_admission%rowtype;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_admission_release'or not pg_has_role(session_user,'world_v2_admission_release','MEMBER')or exists(select 1 from pg_roles r where r.rolname=session_user and(r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb or r.rolreplication))then raise exception 'CAPTAIN_NEW_SCENARIO_CONTROLLED_RELEASE_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.captain_world',p_world,true);
 select x.world_version,x.event_sequence into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found or h.world_version<>0 or h.event_sequence<>0 or exists(select 1 from world_v2.authoritative_event x where x.world_id=p_world)or exists(select 1 from world_v2.command_receipt x where x.world_id=p_world)or exists(select 1 from world_v2.command_submission x where x.world_id=p_world)or exists(select 1 from world_v2.captain_operating_source_adoption x where x.world_id=p_world)or exists(select 1 from world_v2.captain_source_publication_registry x where x.world_id=p_world)then raise exception 'CAPTAIN_FRESH_UNEXECUTED_UNINITIALIZED_SCENARIO_REQUIRED'using errcode='55000';end if;
 select * into a from world_v2.runtime_opening_admission x where x.world_id=p_world and x.seed_fingerprint=p_fp and x.admission_ref=p_admission;
 if not found then raise exception 'CAPTAIN_NEW_SCENARIO_ADMISSION_REQUIRED'using errcode='55000';end if;
 perform world_v2.captain_publication_admission(p_world,a.seed_id,p_fp,p_admission);
 return query select a.seed_id,a.seed_fingerprint,a.admission_ref;
end;$$;
alter function world_v2.read_captain_new_scenario_opening_scope(text,text,text)owner to world_v2_captain_source_owner;
revoke all on function world_v2.read_captain_new_scenario_opening_scope(text,text,text)from public;
grant execute on function world_v2.read_captain_new_scenario_opening_scope(text,text,text)to world_v2_admission_release;
-- Idempotent initialization recovery in a NEW unexecuted scenario. This
-- function never inserts/registers anything and refuses partial/other sources.
create function world_v2.read_captain_opening_publication_readback(p_world text,p_fp text,p_admission text,p_manifest text)
returns table(status text,publication_count integer)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h record;a world_v2.runtime_opening_admission%rowtype;m jsonb;x jsonb;r world_v2.captain_source_publication_registry%rowtype;j jsonb;originals jsonb;n integer;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_admission_release'or not pg_has_role(session_user,'world_v2_admission_release','MEMBER')or exists(select 1 from pg_roles q where q.rolname=session_user and(q.rolsuper or q.rolbypassrls or q.rolcreaterole or q.rolcreatedb or q.rolreplication))then raise exception 'CAPTAIN_INITIALIZATION_RECOVERY_RELEASE_REQUIRED'using errcode='42501';end if;
 if p_manifest is null or octet_length(p_manifest)>32768 then raise exception 'CAPTAIN_EXACT_SEVENTY_MANIFEST_REQUIRED'using errcode='22023';end if;m:=p_manifest::jsonb;
 if jsonb_typeof(m)is distinct from 'array'or jsonb_array_length(m)<>70 or(select count(distinct e->>'countryId')from jsonb_array_elements(m)e)<>70 or exists(select 1 from jsonb_array_elements(m)e where e->>'countryId'!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or e->>'packetSha256'!~'^[a-f0-9]{64}$'or e->>'adoptionRef'is null)then raise exception 'CAPTAIN_EXACT_SEVENTY_MANIFEST_REQUIRED'using errcode='22023';end if;
 perform set_config('econmind.captain_world',p_world,true);
 select q.world_version,q.event_sequence into h from world_v2.world_head q where q.world_id=p_world for share;
 if not found or h.world_version<>0 or h.event_sequence<>0 or exists(select 1 from world_v2.authoritative_event q where q.world_id=p_world)or exists(select 1 from world_v2.command_receipt q where q.world_id=p_world)or exists(select 1 from world_v2.command_submission q where q.world_id=p_world)then raise exception 'CAPTAIN_RECOVERY_UNEXECUTED_SCENARIO_REQUIRED'using errcode='55000';end if;
 select * into a from world_v2.runtime_opening_admission q where q.world_id=p_world and q.seed_fingerprint=p_fp and q.admission_ref=p_admission;
 if not found then raise exception 'CAPTAIN_RECOVERY_ACTUAL_ADMISSION_REQUIRED'using errcode='55000';end if;
 perform world_v2.captain_publication_admission(p_world,a.seed_id,p_fp,p_admission);
 select count(*)into n from world_v2.captain_source_publication_registry q where q.world_id=p_world;
 if n=0 and not exists(select 1 from world_v2.captain_operating_source_adoption q where q.world_id=p_world)then return query select'NOT_PUBLISHED',0;return;end if;
 if n<>70 or(select count(*)from world_v2.captain_operating_source_adoption q where q.world_id=p_world)<>70 then raise exception 'CAPTAIN_RECOVERY_PARTIAL_OR_DIFFERENT_INITIALIZATION'using errcode='23514';end if;
 for x in select value from jsonb_array_elements(m)loop
  select * into r from world_v2.captain_source_publication_registry q where q.world_id=p_world and q.country_id=x->>'countryId'and q.adoption_ref=x->>'adoptionRef'and q.packet_sha256=x->>'packetSha256'and q.seed_fingerprint=p_fp and q.world_admission_ref=p_admission;
  if not found or r.packet_sha256<>encode(sha256(convert_to(r.packet_text,'UTF8')),'hex')or not exists(select 1 from world_v2.captain_operating_source_adoption q where q.adoption_ref=r.adoption_ref and q.world_id=p_world and q.country_id=r.country_id and q.seed_fingerprint=p_fp)or exists(select 1 from world_v2.captain_operating_source_revocation q where q.adoption_ref=r.adoption_ref)then raise exception 'CAPTAIN_RECOVERY_EXACT_UNREVOKED_INITIALIZATION_REQUIRED'using errcode='23514';end if;
  j:=r.packet_text::jsonb;
  select jsonb_object_agg(q.fact_ref,q.original_text)into originals from world_v2.captain_operating_original q where q.adoption_ref=r.adoption_ref and q.original_sha256=encode(sha256(convert_to(q.original_text,'UTF8')),'hex');
  if j->'originalTexts'is distinct from originals then raise exception 'CAPTAIN_RECOVERY_COMPLETE_ORIGINALS_REQUIRED'using errcode='23514';end if;
 end loop;return query select'ALREADY_PUBLISHED',70;
end;$$;
alter function world_v2.read_captain_opening_publication_readback(text,text,text,text)owner to world_v2_captain_source_owner;
revoke all on function world_v2.read_captain_opening_publication_readback(text,text,text,text)from public;
grant execute on function world_v2.read_captain_opening_publication_readback(text,text,text,text)to world_v2_admission_release;
revoke create on schema world_v2 from world_v2_captain_source_owner;
commit;
