-- Candidate only. Existing Industry owner/publisher/reader, no memberships,
-- raw reader grants, energized assets, water grants, work, payment or delivery.
-- Requires industry firstday custody + revocation fence. Offline publication
-- verifies actual admitted seed calendar; online reads only bounded compact DATA.
begin;
grant create on schema world_v2 to world_v2_industry_source_owner;
-- Owner-only columns for actual committed RUN/utility origins. Reader and
-- publisher retain EXEC only; baseline event-table RLS status is not changed.
grant select(world_id,event_id,event_type,causation_command_id,world_version,event_sequence,sim_time,canonical_payload,event_fingerprint)on world_v2.authoritative_event to world_v2_industry_source_owner;
create policy industry_utility_event_owner_read on world_v2.authoritative_event for select to world_v2_industry_source_owner using(current_user='world_v2_industry_source_owner'and world_id=current_setting('econmind.industry_source_world',true));
create policy industry_utility_event_owner_fence on world_v2.authoritative_event as restrictive for select to world_v2_industry_source_owner using(current_user='world_v2_industry_source_owner'and world_id=current_setting('econmind.industry_source_world',true));
create table world_v2.postwar_industry_utility_source(
 world_id text not null,country_id text not null,facility_id text not null,
 registration_ref text not null,seed_id text not null,seed_fingerprint text not null,admission_ref text not null,
 source_ref text not null unique,source_text text not null check(octet_length(source_text)<=16384),source_sha256 text not null check(source_sha256=encode(sha256(convert_to(source_text,'UTF8')),'hex')),
 primary key(world_id,country_id,facility_id),foreign key(world_id,registration_ref)references world_v2.postwar_industry_original(world_id,registration_ref)
);
alter table world_v2.postwar_industry_utility_source owner to world_v2_industry_source_owner;
alter table world_v2.postwar_industry_utility_source enable row level security;
alter table world_v2.postwar_industry_utility_source force row level security;
revoke all on world_v2.postwar_industry_utility_source from public,world_v2_industry_source_reader,world_v2_industry_source_publisher;
create policy industry_utility_owner on world_v2.postwar_industry_utility_source to world_v2_industry_source_owner using(current_user='world_v2_industry_source_owner'and world_id=current_setting('econmind.industry_source_world',true))with check(current_user='world_v2_industry_source_owner'and world_id=current_setting('econmind.industry_source_world',true));
create trigger industry_utility_immutable before update or delete on world_v2.postwar_industry_utility_source for each row execute function world_v2.reject_authoritative_history_mutation();
create trigger industry_utility_no_truncate before truncate on world_v2.postwar_industry_utility_source for each statement execute function world_v2.reject_authoritative_history_mutation();
create function world_v2.publish_postwar_industry_utility_source(p_world text,p_source text,p_raw jsonb,p_adoption text)
returns table(source_ref text,source_sha256 text)language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;a world_v2.runtime_opening_admission%rowtype;r world_v2.postwar_industry_original%rowtype;site jsonb;target jsonb;b jsonb;p jsonb;w jsonb;g jsonb;s jsonb;key text;expected text;power jsonb;stored numeric;seedtext text;source_row json;source_payload json;carrier json;doc json;opening text;matches integer:=0;rawsha text;ref text;existing world_v2.postwar_industry_utility_source%rowtype;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_publisher'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')or exists(select 1 from pg_roles where rolname=session_user and(rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication))then raise exception 'UTILITY_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if p_source is null or octet_length(p_source)>16384 or p_adoption is null or octet_length(p_adoption)>65536 or encode(sha256(convert_to(p_adoption,'UTF8')),'hex')<>'de6ad8ff58ff0180706b6bc6b4d548fd2d3404c4749cf71d91845474b19fddb0'then raise exception 'UTILITY_EXACT_ADOPTED_BYTES_REQUIRED'using errcode='23514';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 perform 1 from world_v2.world_head h where h.world_id=p_world for share;
 if not found then raise exception 'UTILITY_WORLD_REQUIRED'using errcode='55000';end if;
 a:=world_v2.industry_source_admission(p_world);
 b:=p_source::jsonb;
 select * into r from world_v2.postwar_industry_original x where x.world_id=p_world and x.country_id=(b->>'countryId')and x.facility_id=(b->>'facilityId')and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref for share;
 if not found or exists(select 1 from world_v2.postwar_industry_original_revocation v where v.world_id=p_world and v.registration_ref=r.registration_ref)or not exists(select 1 from world_v2.postwar_industry_first_day_source f where f.world_id=p_world and f.country_id=r.country_id and f.facility_id=r.facility_id and not exists(select 1 from world_v2.postwar_industry_first_day_source_revocation v where v.world_id=p_world and v.source_ref=f.source_ref))then raise exception 'UTILITY_ACTUAL_CURRENT_FIRSTDAY_SITE_REQUIRED'using errcode='55000';end if;
 site:=r.document_text::jsonb;target:=site->'sourceFacility';
 if r.document_sha256<>encode(sha256(convert_to(r.document_text,'UTF8')),'hex')or target->>'id'is distinct from r.facility_id or target->>'projectId'is distinct from'PROJECT-15'or target->>'commodityId'is distinct from'REFINED_FUEL'or target->>'recipeId'is distinct from'SCENARIO-RECIPE-REFINED_FUEL'or target->>'constructionStatusProposal'is distinct from'OPENING_EXISTING_ASSET'or target->>'scenarioRole'is distinct from'OPENING_PORTFOLIO'or target->>'aggregateFacility'is distinct from'true'or target->>'conditionFraction'is distinct from'1'then raise exception 'UTILITY_ACTUAL_EXISTING_REFINERY_REQUIRED'using errcode='23514';end if;
 if(select count(*)from jsonb_object_keys(b))<>15 or b->>'schemaVersion'<>'postwar-industry-utility-original-v1'or b->>'worldId'<>p_world or b->>'countryId'is distinct from r.country_id or b->>'facilityId'is distinct from r.facility_id or b->>'locationId'is distinct from site->>'locationId'or b->>'operatorId'is distinct from site->>'operatorId'or b->>'seedId'<>a.seed_id or b->>'seedFingerprint'<>a.seed_fingerprint or b->>'admissionRef'<>a.admission_ref or b->>'sourceChecksumsSha256'<>r.checksums_sha256 or b->>'adoptionRawSha256'<>encode(sha256(convert_to(p_adoption,'UTF8')),'hex')then raise exception 'UTILITY_EXACT_ADMITTED_SCOPE_REQUIRED'using errcode='23514';end if;
 if jsonb_typeof(p_raw)<>'object'or(select count(*)from jsonb_object_keys(p_raw))<>9 then raise exception 'UTILITY_EXACT_RAW_SET_REQUIRED'using errcode='23514';end if;
 for key,expected in select * from(values('power','81e910b36558260e0372f6b00474147e431ed502387b78bfdcc0d8dd2f26713e'),('facilities','049e39330646048b95636d3a075fc1423ee62762999184a2326df161a198b485'),('recipes','205259654c754d2ebe6e774f3a902f367455bdff4a51f7b0449e0d74334aeb7c'),('water-allocations','53b4d7cd0425f6a0789cad2e1bcd0800420a5010f38307e895742df1c0567841'),('population-services','86e828a421346aecaa31c95a7805289a022c80df93399545aeea39f6ce361615'),('seasonal-water','704f59f6204096b1f696d9d35c8727845a92f44efd8948b87eda0e740845fc66'),('geography','c1a3d521ae91b37845f764be4ede73d522bc6958be90f4676ad5a19395b26a35'),('regions','42ef418d90c3f448d390ad9e62971065eb29c3d96fdb4f3dde5fc33ae0cb2bdd'),('countries','5d493e93dfab1425731191ba7491cce47949d176e4769b33fdca48d2d31dba89'))pins(k,h)loop
  if not(p_raw?key)or octet_length(p_raw->>key)>(case key when 'geography'then 8441668 else 2500000 end) or encode(sha256(convert_to(p_raw->>key,'UTF8')),'hex')<>expected or b->'sourcePins'->>key<>expected then raise exception 'UTILITY_FIXED_ORIGINAL_HASH_DIFFERS'using errcode='23514';end if;
 end loop;
 -- Offline only. Exact immutable stored seed / operating-source pointer and
 -- physical receipt date, never supplied calendar or caller-ready authority.
 select x.canonical_payload into seedtext from world_v2.opening_seed x where x.world_id=p_world and x.seed_fingerprint=a.seed_fingerprint;
 for source_row in select value from json_array_elements(seedtext::json->'sources')loop
  if source_row->>'sourceId'=r.operating_source_id and source_row->>'payloadHash'=r.operating_source_hash then
   source_payload:=(source_row->>'canonicalPayload')::json;carrier:=source_payload->'carrier';
   for doc in select value from json_array_elements(carrier->'documents')loop
    if doc->>'documentId'=carrier->>'physicalServiceReceiptDocumentId'and doc->>'sha256'=encode(sha256(convert_to(doc->>'bytes','UTF8')),'hex')then opening:=((doc->>'bytes')::json)->>'openingGregorianTimestamp';matches:=matches+1;end if;
   end loop;
  end if;
 end loop;
 if matches<>1 or opening is distinct from b->>'openingGregorianTimestamp'then raise exception 'UTILITY_ACTUAL_GENESIS_CALENDAR_REQUIRED'using errcode='23514';end if;
 select x into strict p from jsonb_array_elements((p_raw->>'power')::jsonb)x where x->>'countryId'=target->>'countryId';
 select x into strict s from jsonb_array_elements((p_raw->>'facilities')::jsonb)x where x->>'countryId'=target->>'countryId'and x->>'projectId'='PROJECT-13'and x->>'constructionStatusProposal'='OPENING_EXISTING_ASSET';
 select x into strict g from jsonb_array_elements((p_raw->>'facilities')::jsonb)x where x->>'countryId'=target->>'countryId'and x->>'projectId'='PROJECT-23'and x->>'constructionStatusProposal'='OPENING_EXISTING_ASSET';
 select x into strict w from jsonb_array_elements((p_raw->>'water-allocations')::jsonb)x where x->>'regionId'=target->>'regionId'and x->>'countryId'=target->>'countryId';
 power:=b->'power';stored:=(p->>'storageMWh')::numeric*(p->>'openingStateOfChargeFraction')::numeric;
 if power->>'worldId'<>p_world or power->>'seedFingerprint'<>a.seed_fingerprint or power->>'countryId'is distinct from r.country_id or power->>'operatorId'is distinct from site->>'operatorId'or power->>'storageOwnerId'is distinct from site->>'operatorId'or power->>'gridOwnerId'is distinct from site->>'operatorId'or power->>'storageId'<>s->>'id'or power->>'gridId'<>g->>'id'or s->>'operatorId'is distinct from target->>'operatorId'or g->>'operatorId'is distinct from target->>'operatorId'or s->>'regionId'is distinct from target->>'regionId'or g->>'regionId'is distinct from target->>'regionId'or s->>'constructionStatusProposal'<>'OPENING_EXISTING_ASSET'or g->>'constructionStatusProposal'<>'OPENING_EXISTING_ASSET'or(power->>'originalEnergyCapacityMWh')::numeric<>(p->>'storageMWh')::numeric or(power->>'originalOpeningSocMWh')::numeric<>stored or(power->>'originalStorageDischargeMW')::numeric<>(p->>'storageDischargeMW')::numeric or(power->>'originalGridMW')::numeric<>(g->>'capacity')::numeric or(power->>'originalLossFraction')::numeric<>(p->>'lossFraction')::numeric or power->>'originalEfficiency'<>'0.9'or power->>'sourceRawSha256'<>b->'sourcePins'->>'power'then raise exception 'UTILITY_ACTUAL_POWER_PHYSICAL_SOURCE_DIFFERS'using errcode='23514';end if;
 if jsonb_array_length(power->'protectedReservations')<>1 or power->'protectedReservations'->0->>'kind'<>'PUBLIC_PRIORITY'or(power->'protectedReservations'->0->>'storedEnergyMWh')::numeric<>stored*0.1 or(power->'protectedReservations'->0->>'outputMWh')::numeric<>stored*0.1*0.85 or power->'protectedReservations'->0->>'fromSimTime'<>'0'or power->'protectedReservations'->0->>'throughSimTime'<>'21600000'or power->'protectedReservations'->0->>'sourceRawSha256'<>'27bbb6a7fddc97b83b74cc4f3ef13455a3238f1998d10c34016123ba19cf6872'then raise exception 'UTILITY_EXISTING_PUBLIC_OPTION_MUST_REMAIN_PROTECTED'using errcode='23514';end if;
 if b->'water'->>'sourceRegionId'<>w->>'regionId'or b->'water'->>'basinRef'<>w->>'basinId'or(b->'water'->>'rawQuotaPerDay')::numeric<>(w->>'industryM3Day')::numeric or b->'water'->>'allocationRawSha256'<>b->'sourcePins'->>'water-allocations'then raise exception 'UTILITY_ACTUAL_WATER_QUOTA_SOURCE_DIFFERS'using errcode='23514';end if;
 rawsha:=encode(sha256(convert_to(p_source,'UTF8')),'hex');ref:='INDUSTRY_UTILITY_'||upper(rawsha);
 insert into world_v2.postwar_industry_utility_source values(p_world,r.country_id,r.facility_id,r.registration_ref,a.seed_id,a.seed_fingerprint,a.admission_ref,ref,p_source,rawsha)on conflict(world_id,country_id,facility_id)do nothing;
 select * into existing from world_v2.postwar_industry_utility_source x where x.world_id=p_world and x.country_id=r.country_id and x.facility_id=r.facility_id;
 if existing.source_text<>p_source or existing.source_ref<>ref then raise exception 'UTILITY_IMMUTABLE_SOURCE_CONFLICT'using errcode='55000';end if;
 return query select existing.source_ref,existing.source_sha256;
end;$$;
alter function world_v2.publish_postwar_industry_utility_source(text,text,jsonb,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.publish_postwar_industry_utility_source(text,text,jsonb,text)from public;
grant execute on function world_v2.publish_postwar_industry_utility_source(text,text,jsonb,text)to world_v2_industry_source_publisher;
create function world_v2.read_postwar_industry_utility_source(p_world text,p_country text,p_facility text,p_version bigint,p_sequence bigint)
returns table(source_text text,source_sha256 text,source_ref text,world_version text,event_sequence text)language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;s world_v2.postwar_industry_utility_source%rowtype;a world_v2.runtime_opening_admission%rowtype;h record;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_reader'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')or pg_has_role(session_user,'world_v2_industry_source_publisher','MEMBER')or exists(select 1 from pg_roles where rolname=session_user and(rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication))then raise exception 'UTILITY_FIXED_SOURCE_READER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 perform 1 from world_v2.read_postwar_industry_first_day_source(p_world,p_country,p_facility,p_version,p_sequence);
 if not found then return;end if;
 a:=world_v2.industry_source_admission(p_world);
 select * into s from world_v2.postwar_industry_utility_source x where x.world_id=p_world and x.country_id=p_country and x.facility_id=p_facility and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref for share;
 if not found then return;end if;
 select h0.world_version,h0.event_sequence into h from world_v2.world_head h0 where h0.world_id=p_world for share;
 if h.world_version<>p_version or h.event_sequence<>p_sequence or s.source_sha256<>encode(sha256(convert_to(s.source_text,'UTF8')),'hex')then raise exception 'UTILITY_ACTUAL_HEAD_OR_IMMUTABLE_SOURCE_CHANGED'using errcode='55000';end if;
 return query select s.source_text,s.source_sha256,s.source_ref,h.world_version::text,h.event_sequence::text;
end;$$;
alter function world_v2.read_postwar_industry_utility_source(text,text,text,bigint,bigint)owner to world_v2_industry_source_owner;
revoke all on function world_v2.read_postwar_industry_utility_source(text,text,text,bigint,bigint)from public;
grant execute on function world_v2.read_postwar_industry_utility_source(text,text,text,bigint,bigint)to world_v2_industry_source_reader;

-- Source-controlled quota publication. No manual Industry seat may use this
-- function; amount/holder/validity are not caller inputs. RUN audit is frozen.
create table world_v2.postwar_industry_water_grant_publication(world_id text not null,run_id text not null,schedule_command_id text not null,command_id text not null,command_fingerprint text not null,source_ref text not null,seed_fingerprint text not null,admission_ref text not null,primary key(world_id,schedule_command_id),foreign key(world_id,command_id)references world_v2.command_submission(world_id,command_id));
alter table world_v2.postwar_industry_water_grant_publication owner to world_v2_industry_source_owner;
alter table world_v2.postwar_industry_water_grant_publication enable row level security;
alter table world_v2.postwar_industry_water_grant_publication force row level security;
revoke all on world_v2.postwar_industry_water_grant_publication from public,world_v2_industry_source_reader,world_v2_industry_source_publisher;
create policy industry_water_grant_owner on world_v2.postwar_industry_water_grant_publication to world_v2_industry_source_owner using(current_user='world_v2_industry_source_owner'and world_id=current_setting('econmind.industry_source_world',true))with check(current_user='world_v2_industry_source_owner'and world_id=current_setting('econmind.industry_source_world',true));
create trigger industry_water_grant_immutable before update or delete on world_v2.postwar_industry_water_grant_publication for each row execute function world_v2.reject_authoritative_history_mutation();
create trigger industry_water_grant_no_truncate before truncate on world_v2.postwar_industry_water_grant_publication for each statement execute function world_v2.reject_authoritative_history_mutation();
create policy industry_water_grant_command_insert on world_v2.command_submission for insert to world_v2_industry_source_owner with check(world_id=current_setting('econmind.industry_source_world',true)and command_type='INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1'and office_id is null and canonical_payload::jsonb->'operation'=jsonb_build_object('action','GRANT_RIGHT'));
create function world_v2.read_postwar_industry_water_grant_publication(p_world text,p_country text,p_facility text,p_run text)
returns table(command_json jsonb,command_fingerprint text,publication_status text)language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_publisher'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')then raise exception 'WATER_GRANT_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 return query select jsonb_build_object('schemaVersion',c.schema_version,'worldId',c.world_id,'commandId',c.command_id,'commandType',c.command_type,'actorId',c.actor_id,'authSubject',c.auth_subject::text,'countryId',c.country_id,'officeId',c.office_id,'expectedWorldVersion',c.expected_world_version::text,'idempotencyKey',c.idempotency_key,'correlationId',c.correlation_id,'simTime',c.sim_time::text,'submittedAtReal',to_char(c.submitted_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'payload',c.canonical_payload::jsonb),c.command_fingerprint,case when exists(select 1 from world_v2.command_receipt r where r.world_id=c.world_id and r.command_id=c.command_id)then 'FINAL'else 'QUEUED'end from world_v2.postwar_industry_water_grant_publication p join world_v2.command_submission c on c.world_id=p.world_id and c.command_id=p.command_id and c.command_fingerprint=p.command_fingerprint where p.world_id=p_world and p.run_id=p_run and c.country_id=p_country and c.office_id is null and c.command_type='INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1'and c.canonical_payload::jsonb->>'facilityId'=p_facility and c.canonical_payload::jsonb->>'runId'=p_run;
end;$$;
alter function world_v2.read_postwar_industry_water_grant_publication(text,text,text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.read_postwar_industry_water_grant_publication(text,text,text,text)from public;
grant execute on function world_v2.read_postwar_industry_water_grant_publication(text,text,text,text)to world_v2_industry_source_publisher;
-- Legacy C2 recovery only. New callers must supply their exact actual scope.
create function world_v2.read_postwar_industry_water_grant_publication(p_world text,p_run text)
returns table(command_json jsonb,command_fingerprint text,publication_status text)
language sql security definer set search_path=pg_catalog as $$
 select * from world_v2.read_postwar_industry_water_grant_publication(p_world,'COUNTRY_02','OPEN-02-REFINED_FUEL',p_run);
$$;
alter function world_v2.read_postwar_industry_water_grant_publication(text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.read_postwar_industry_water_grant_publication(text,text)from public;
grant execute on function world_v2.read_postwar_industry_water_grant_publication(text,text)to world_v2_industry_source_publisher;
create function world_v2.publish_postwar_industry_water_grant(p_world text,p_country text,p_facility text,p_run text,p_worker text,p_version bigint,p_sequence bigint,p_at timestamptz,p_sim text,p_expected_fingerprint text)
returns table(command_json jsonb,command_fingerprint text,publication_status text)language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;a world_v2.runtime_opening_admission%rowtype;h world_v2.world_head%rowtype;s world_v2.postwar_industry_utility_source%rowtype;c world_v2.command_submission%rowtype;r world_v2.command_receipt%rowtype;body jsonb;id text;payload jsonb;raw text;intent jsonb;fp text;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_publisher'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')or exists(select 1 from pg_roles where rolname=session_user and(rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication))then raise exception 'WATER_GRANT_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 -- Immutable recovery before any new grant or due calculation.
 if exists(select 1 from world_v2.postwar_industry_water_grant_publication q join world_v2.command_submission gc on gc.world_id=q.world_id and gc.command_id=q.command_id where q.world_id=p_world and q.run_id=p_run and gc.country_id=p_country and gc.canonical_payload::jsonb->>'facilityId'=p_facility)then return query select * from world_v2.read_postwar_industry_water_grant_publication(p_world,p_country,p_facility,p_run);return;end if;
 if p_country is null or p_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or p_facility is null or p_facility!~'^[A-Za-z][A-Za-z0-9_.:-]{0,127}$'or p_at is null or not isfinite(p_at)or p_sim is null or p_sim!~'^(0|[1-9][0-9]*)$'or p_sim::numeric>=86400000 then raise exception 'WATER_GRANT_EXACT_FIRST_DAY_SCOPE_REQUIRED'using errcode='22023';end if;
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 perform 1 from world_v2.world_writer_lease l where l.world_id=p_world and l.holder_id=p_worker and l.acquired_at_real<=p_at and l.renewed_at_real<=p_at and l.lease_expires_at_real>p_at for share;
 if not found then raise exception 'WATER_GRANT_CURRENT_LEASE_REQUIRED'using errcode='55000';end if;
 select * into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found or h.world_version<>p_version or h.event_sequence<>p_sequence then raise exception 'WATER_GRANT_ACTUAL_PREFIX_HEAD_REQUIRED'using errcode='40001';end if;
 a:=world_v2.industry_source_admission(p_world);
 select * into s from world_v2.postwar_industry_utility_source x where x.world_id=p_world and x.country_id=p_country and x.facility_id=p_facility and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref for share;
 if not found then raise exception 'WATER_GRANT_REGISTERED_QUOTA_ORIGINAL_REQUIRED'using errcode='55000';end if;
 perform 1 from world_v2.postwar_industry_original x where x.world_id=p_world and x.registration_ref=s.registration_ref and not exists(select 1 from world_v2.postwar_industry_original_revocation v where v.world_id=p_world and v.registration_ref=x.registration_ref)for share;
 if not found then raise exception 'WATER_GRANT_CURRENT_PARENT_REQUIRED'using errcode='55000';end if;
 select * into strict c from world_v2.command_submission x where x.world_id=p_world and x.country_id=p_country and x.office_id='INDUSTRY'and x.command_type='CORE_INDUSTRY_RUN_SCHEDULE_V1'and x.canonical_payload::jsonb->>'facilityId'=p_facility and x.canonical_payload::jsonb->>'runId'=p_run;
 select * into r from world_v2.command_receipt x where x.world_id=p_world and x.command_id=c.command_id and x.outcome='COMMITTED'and x.world_version_after<=h.world_version;
 if not found or jsonb_array_length(r.event_ids)<>1 or not exists(select 1 from world_v2.authoritative_event e where e.world_id=p_world and e.causation_command_id=c.command_id and e.event_id=r.event_ids->>0 and e.event_type='INDUSTRY_FIRST_DAY_RUN_SCHEDULED_V1'and e.world_version=r.world_version_after and e.event_sequence<=h.event_sequence)then raise exception 'WATER_GRANT_ACTUAL_COMMITTED_RUN_REQUIRED'using errcode='55000';end if;
 body:=c.canonical_payload::jsonb;
 if p_sim::numeric<(body->>'startsAtSimTime')::numeric or p_sim::numeric>=(body->>'endsAtSimTime')::numeric or c.sim_time>p_sim::numeric then raise exception 'WATER_GRANT_ACTUAL_RUN_INTERVAL_REQUIRED'using errcode='55000';end if;
 id:='COMMAND_INDUSTRY_WATER_GRANT_'||upper(world_v2.authoritative_sha256(world_v2.canonical_json(jsonb_build_array(p_world,c.command_fingerprint,s.source_sha256,'INDUSTRY_BOUNDED_WATER_GRANT_V1'))));
 payload:=jsonb_build_object('schemaVersion','industry-first-day-utility-command-v1','serviceKind','WATER','operationRef',id,'facilityId',p_facility,'runId',p_run,'sourceRef',s.source_ref||'_WATER','sourceRawSha256',s.source_sha256,'operation',jsonb_build_object('action','GRANT_RIGHT'));raw:=world_v2.canonical_json(payload);
 intent:=jsonb_build_object('actorId',c.actor_id,'authSubject',c.auth_subject::text,'commandId',id,'commandType','INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1','countryId',p_country,'expectedWorldVersion',p_version::text,'idempotencyKey',id,'officeId',null,'canonicalPayload',raw,'schemaVersion','command-v1','simTime',p_sim,'worldId',p_world);
 fp:='sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(intent));
 if fp is distinct from p_expected_fingerprint then raise exception 'WATER_GRANT_CORE_EXACT_CANONICAL_FINGERPRINT_REQUIRED'using errcode='23514';end if;
 insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values(p_world,id,id,'INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1','command-v1',raw,'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||raw),fp,c.auth_subject,c.actor_id,p_country,null,p_version,p_sim::numeric,c.correlation_id,p_at);
 insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time)values(p_world,id,'VERSIONED_AUTOMATIC',p_sim::numeric);
 insert into world_v2.postwar_industry_water_grant_publication values(p_world,p_run,c.command_id,id,fp,s.source_ref,a.seed_fingerprint,a.admission_ref);
 return query select * from world_v2.read_postwar_industry_water_grant_publication(p_world,p_country,p_facility,p_run);
end;$$;
alter function world_v2.publish_postwar_industry_water_grant(text,text,text,text,text,bigint,bigint,timestamptz,text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.publish_postwar_industry_water_grant(text,text,text,text,text,bigint,bigint,timestamptz,text,text)from public;
grant execute on function world_v2.publish_postwar_industry_water_grant(text,text,text,text,text,bigint,bigint,timestamptz,text,text)to world_v2_industry_source_publisher;
create function world_v2.lock_postwar_industry_water_grant_scope(p_world text,p_command text,p_fingerprint text,p_worker text,p_at timestamptz,p_sim text)
returns table(world_version text,event_sequence text,holder_id text,fencing_token text,acquired_at_real text,renewed_at_real text,lease_expires_at_real text)language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;l world_v2.world_writer_lease%rowtype;h world_v2.world_head%rowtype;c world_v2.command_submission%rowtype;publication world_v2.postwar_industry_water_grant_publication%rowtype;run world_v2.command_submission%rowtype;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_reader'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')or pg_has_role(session_user,'world_v2_industry_source_publisher','MEMBER')or exists(select 1 from pg_roles where rolname=session_user and(rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication))then raise exception 'WATER_GRANT_FIXED_WORKER_READER_REQUIRED'using errcode='42501';end if;
 if current_setting('transaction_isolation')not in('repeatable read','serializable')or current_setting('transaction_read_only')<>'off'or p_at is null or not isfinite(p_at)or p_sim!~'^(0|[1-9][0-9]*)$'then raise exception 'WATER_GRANT_HELD_RR_REQUIRED'using errcode='25001';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 select * into l from world_v2.world_writer_lease x where x.world_id=p_world and x.holder_id=p_worker and x.acquired_at_real<=p_at and x.renewed_at_real<=p_at and x.lease_expires_at_real>p_at for share;
 if not found then raise exception 'WATER_GRANT_CURRENT_LEASE_REQUIRED'using errcode='55000';end if;
 select * into h from world_v2.world_head x where x.world_id=p_world for share;
 select * into c from world_v2.command_submission x where x.world_id=p_world and x.command_id=p_command and x.command_fingerprint=p_fingerprint and x.command_type='INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1'and x.office_id is null and x.expected_world_version=h.world_version and x.sim_time::text=p_sim;
 if not found or c.canonical_payload::jsonb->'operation'<>jsonb_build_object('action','GRANT_RIGHT')then raise exception 'WATER_GRANT_EXACT_AUTO_COMMAND_REQUIRED'using errcode='55000';end if;
 select * into publication from world_v2.postwar_industry_water_grant_publication x where x.world_id=p_world and x.command_id=p_command and x.command_fingerprint=p_fingerprint for share;
 if not found then raise exception 'WATER_GRANT_ACTUAL_FIXED_PUBLICATION_REQUIRED'using errcode='55000';end if;
 select * into run from world_v2.command_submission x where x.world_id=p_world and x.command_id=publication.schedule_command_id and x.command_type='CORE_INDUSTRY_RUN_SCHEDULE_V1';
 if not found or c.actor_id is distinct from run.actor_id or c.auth_subject is distinct from run.auth_subject or c.correlation_id is distinct from run.correlation_id then raise exception 'WATER_GRANT_FROZEN_ACTUAL_RUN_AUDIT_REQUIRED'using errcode='55000';end if;
 perform 1 from world_v2.command_queue q where q.world_id=p_world and q.command_id=p_command and q.authority_kind='VERSIONED_AUTOMATIC'and q.queue_state='CLAIMED'and q.claimed_by=p_worker and q.claim_fencing_token=l.fencing_token and q.available_at_sim_time<=p_sim::numeric for share;
 if not found or exists(select 1 from world_v2.command_receipt r where r.world_id=p_world and r.command_id=p_command)then raise exception 'WATER_GRANT_ACTUAL_UNFINISHED_FENCED_CLAIM_REQUIRED'using errcode='55000';end if;
 perform 1 from world_v2.read_postwar_industry_utility_source(p_world,c.country_id,c.canonical_payload::jsonb->>'facilityId',h.world_version,h.event_sequence);
 if not found then raise exception 'WATER_GRANT_CURRENT_REGISTERED_SOURCE_REQUIRED'using errcode='55000';end if;
 return query select h.world_version::text,h.event_sequence::text,l.holder_id,l.fencing_token::text,to_char(l.acquired_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),to_char(l.renewed_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),to_char(l.lease_expires_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
end;$$;
alter function world_v2.lock_postwar_industry_water_grant_scope(text,text,text,text,timestamptz,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.lock_postwar_industry_water_grant_scope(text,text,text,text,timestamptz,text)from public;
grant execute on function world_v2.lock_postwar_industry_water_grant_scope(text,text,text,text,timestamptz,text)to world_v2_industry_source_reader;
create function world_v2.read_postwar_industry_water_grant_preclaim_scope(p_world text,p_command text,p_fingerprint text,p_worker text,p_at timestamptz,p_sim text)
returns table(world_version text,event_sequence text,holder_id text,fencing_token text,acquired_at_real text,renewed_at_real text,lease_expires_at_real text)language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;l world_v2.world_writer_lease%rowtype;h world_v2.world_head%rowtype;c world_v2.command_submission%rowtype;publication world_v2.postwar_industry_water_grant_publication%rowtype;run world_v2.command_submission%rowtype;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_reader'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')or pg_has_role(session_user,'world_v2_industry_source_publisher','MEMBER')or exists(select 1 from pg_roles where rolname=session_user and(rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication))then raise exception 'WATER_GRANT_FIXED_WORKER_READER_REQUIRED'using errcode='42501';end if;
 if current_setting('transaction_isolation')not in('repeatable read','serializable')or current_setting('transaction_read_only')<>'off'or p_at is null or not isfinite(p_at)or p_sim!~'^(0|[1-9][0-9]*)$'then raise exception 'WATER_GRANT_HELD_RR_REQUIRED'using errcode='25001';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 select * into l from world_v2.world_writer_lease x where x.world_id=p_world and x.holder_id=p_worker and x.acquired_at_real<=p_at and x.renewed_at_real<=p_at and x.lease_expires_at_real>p_at for share;
 if not found then raise exception 'WATER_GRANT_CURRENT_LEASE_REQUIRED'using errcode='55000';end if;
 select * into h from world_v2.world_head x where x.world_id=p_world for share;
 select * into c from world_v2.command_submission x where x.world_id=p_world and x.command_id=p_command and x.command_fingerprint=p_fingerprint and x.command_type='INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1'and x.office_id is null and x.expected_world_version=h.world_version and x.sim_time::text=p_sim;
 if not found or c.canonical_payload::jsonb->'operation'<>jsonb_build_object('action','GRANT_RIGHT')then raise exception 'WATER_GRANT_EXACT_AUTO_COMMAND_REQUIRED'using errcode='55000';end if;
 select * into publication from world_v2.postwar_industry_water_grant_publication x where x.world_id=p_world and x.command_id=p_command and x.command_fingerprint=p_fingerprint for share;
 if not found then raise exception 'WATER_GRANT_ACTUAL_FIXED_PUBLICATION_REQUIRED'using errcode='55000';end if;
 select * into run from world_v2.command_submission x where x.world_id=p_world and x.command_id=publication.schedule_command_id and x.command_type='CORE_INDUSTRY_RUN_SCHEDULE_V1';
 if not found or c.actor_id is distinct from run.actor_id or c.auth_subject is distinct from run.auth_subject or c.correlation_id is distinct from run.correlation_id then raise exception 'WATER_GRANT_FROZEN_ACTUAL_RUN_AUDIT_REQUIRED'using errcode='55000';end if;
 perform 1 from world_v2.command_queue q where q.world_id=p_world and q.command_id=p_command and q.authority_kind='VERSIONED_AUTOMATIC'and (q.queue_state='PENDING'or(q.queue_state='CLAIMED'and q.claimed_by=p_worker and q.claim_fencing_token=l.fencing_token)) and q.available_at_sim_time<=p_sim::numeric for share;
 if not found or exists(select 1 from world_v2.command_receipt r where r.world_id=p_world and r.command_id=p_command)then raise exception 'WATER_GRANT_ACTUAL_UNFINISHED_FENCED_CLAIM_REQUIRED'using errcode='55000';end if;
 perform 1 from world_v2.read_postwar_industry_utility_source(p_world,c.country_id,c.canonical_payload::jsonb->>'facilityId',h.world_version,h.event_sequence);
 if not found then raise exception 'WATER_GRANT_CURRENT_REGISTERED_SOURCE_REQUIRED'using errcode='55000';end if;
 return query select h.world_version::text,h.event_sequence::text,l.holder_id,l.fencing_token::text,to_char(l.acquired_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),to_char(l.renewed_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),to_char(l.lease_expires_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
end;$$;
alter function world_v2.read_postwar_industry_water_grant_preclaim_scope(text,text,text,text,timestamptz,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.read_postwar_industry_water_grant_preclaim_scope(text,text,text,text,timestamptz,text)from public;
grant execute on function world_v2.read_postwar_industry_water_grant_preclaim_scope(text,text,text,text,timestamptz,text)to world_v2_industry_source_reader;
create function world_v2.read_postwar_industry_utility_history_source(p_world text,p_country text,p_facility text,p_version bigint,p_sequence bigint)
returns table(source_text text,source_sha256 text,source_ref text,world_version text,event_sequence text)language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;s world_v2.postwar_industry_utility_source%rowtype;a world_v2.runtime_opening_admission%rowtype;h record;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_reader'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')or pg_has_role(session_user,'world_v2_industry_source_publisher','MEMBER')then raise exception 'UTILITY_FIXED_SOURCE_READER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 select h0.world_version,h0.event_sequence into h from world_v2.world_head h0 where h0.world_id=p_world for share;
 if not found or h.world_version<>p_version or h.event_sequence<>p_sequence then raise exception 'UTILITY_HISTORY_ACTUAL_HEAD_REQUIRED'using errcode='55000';end if;
 a:=world_v2.industry_source_admission(p_world);
 select * into s from world_v2.postwar_industry_utility_source x where x.world_id=p_world and x.country_id=p_country and x.facility_id=p_facility and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref for share;
 if not found then return;end if;
 -- Immutable DATA only. A later target-site revoke cannot erase committed
 -- effects; new utility actions independently call the CURRENT source RPC.
 if not exists(select 1 from world_v2.postwar_industry_original r where r.world_id=p_world and r.registration_ref=s.registration_ref and r.seed_fingerprint=s.seed_fingerprint and r.admission_ref=s.admission_ref)or s.source_sha256<>encode(sha256(convert_to(s.source_text,'UTF8')),'hex')then raise exception 'UTILITY_HISTORY_IMMUTABLE_SOURCE_CHANGED'using errcode='23514';end if;
 return query select s.source_text,s.source_sha256,s.source_ref,h.world_version::text,h.event_sequence::text;
end;$$;
alter function world_v2.read_postwar_industry_utility_history_source(text,text,text,bigint,bigint)owner to world_v2_industry_source_owner;
revoke all on function world_v2.read_postwar_industry_utility_history_source(text,text,text,bigint,bigint)from public;
grant execute on function world_v2.read_postwar_industry_utility_history_source(text,text,text,bigint,bigint)to world_v2_industry_source_reader;
create function world_v2.read_postwar_industry_water_command_evidence(p_world text,p_country text,p_facility text,p_run text,p_before_version bigint,p_before_sequence bigint,p_until text,p_work_fingerprint text,p_power_fingerprints jsonb)
returns table(grant_pin jsonb,power_pins jsonb,work_source jsonb,protected_claims jsonb,from_ticks text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h record;s record;g record;pins jsonb;work jsonb;claims jsonb;previous numeric;wanted jsonb;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_reader'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')or pg_has_role(session_user,'world_v2_industry_source_publisher','MEMBER')then raise exception 'WATER_EVIDENCE_FIXED_READER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 select h0.world_version,h0.event_sequence into h from world_v2.world_head h0 where h0.world_id=p_world for share;
 select * into s from world_v2.read_postwar_industry_utility_history_source(p_world,p_country,p_facility,h.world_version,h.event_sequence);
 if not found or p_before_version<0 or p_before_version>h.world_version or p_before_sequence<0 or p_before_sequence>h.event_sequence or p_until is null or p_until!~'^(0|[1-9][0-9]*)$'or p_until::numeric>86400000 or jsonb_typeof(p_power_fingerprints)<>'array'or jsonb_array_length(p_power_fingerprints)>64 then raise exception 'WATER_EVIDENCE_EXACT_BOUNDED_SCOPE_REQUIRED'using errcode='23514';end if;
 select e.event_id,e.canonical_payload,e.sim_time into g from world_v2.authoritative_event e join world_v2.command_receipt r on r.world_id=e.world_id and r.command_id=e.causation_command_id and r.outcome='COMMITTED'and r.event_ids?e.event_id join world_v2.command_submission c on c.world_id=r.world_id and c.command_id=r.command_id join world_v2.postwar_industry_water_grant_publication pub on pub.world_id=c.world_id and pub.command_id=c.command_id and pub.command_fingerprint=c.command_fingerprint where e.world_id=p_world and c.country_id=p_country and c.command_type='INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1'and e.event_type='INDUSTRY_FIRST_DAY_WATER_EXECUTED_V1'and e.canonical_payload::jsonb->>'stage'='RIGHT_GRANTED'and c.canonical_payload::jsonb->>'facilityId'=p_facility and e.world_version<=p_before_version and e.event_sequence<=p_before_sequence order by e.event_sequence limit 1;
 if not found then return;end if;
 select greatest(g.sim_time,coalesce(max((e.canonical_payload::jsonb->'record'->>'untilTicks')::numeric),g.sim_time))into previous from world_v2.authoritative_event e join world_v2.command_receipt r on r.world_id=e.world_id and r.command_id=e.causation_command_id and r.outcome='COMMITTED'and r.event_ids?e.event_id where e.world_id=p_world and e.event_type='INDUSTRY_FIRST_DAY_WATER_EXECUTED_V1'and e.canonical_payload::jsonb->>'stage'='WATER_DELIVERED'and e.world_version<=p_before_version and e.event_sequence<=p_before_sequence and exists(select 1 from jsonb_array_elements(e.canonical_payload::jsonb->'record'->'lines')l where l->'demand'->>'sourceRegionId'=s.source_text::jsonb->'water'->>'sourceRegionId');
 select coalesce(jsonb_agg(claim),'[]'::jsonb)into claims from world_v2.authoritative_event e join world_v2.command_receipt r on r.world_id=e.world_id and r.command_id=e.causation_command_id and r.outcome='COMMITTED'and r.event_ids?e.event_id cross join lateral jsonb_array_elements(e.canonical_payload::jsonb->'record'->'effectiveProtectedClaims')claim where e.world_id=p_world and e.event_type='INDUSTRY_FIRST_DAY_WATER_EXECUTED_V1'and e.canonical_payload::jsonb->>'stage'='WATER_DELIVERED'and e.world_version<=p_before_version and e.event_sequence<=p_before_sequence and(e.canonical_payload::jsonb->'record'->>'fromTicks')::numeric<p_until::numeric and(e.canonical_payload::jsonb->'record'->>'untilTicks')::numeric>previous;
 select jsonb_build_object('facilityId',body->>'facilityId','runId',body->>'runId','sourceRef',body->'policy'->>'sourceRef','sourceRawSha256',body->'policy'->>'sourceRawSha256')into work from(select e.canonical_payload::jsonb body from world_v2.authoritative_event e join world_v2.command_receipt r on r.world_id=e.world_id and r.command_id=e.causation_command_id and r.outcome='COMMITTED'and r.event_ids?e.event_id where e.world_id=p_world and e.event_fingerprint=p_work_fingerprint and e.event_type='INDUSTRY_FIRST_DAY_WORK_COMPLETED_V1'and e.world_version<=p_before_version and e.event_sequence<=p_before_sequence)w;
 if not found then return;end if;
 select coalesce(jsonb_agg(jsonb_build_object('kind','POWER_DELIVERY','reference',e.event_id,'rawSha256',encode(sha256(convert_to(e.canonical_payload,'UTF8')),'hex'))order by e.event_sequence),'[]'::jsonb)into pins from world_v2.authoritative_event e join world_v2.command_receipt r on r.world_id=e.world_id and r.command_id=e.causation_command_id and r.outcome='COMMITTED'and r.event_ids?e.event_id join world_v2.command_submission c on c.world_id=r.world_id and c.command_id=r.command_id where e.world_id=p_world and c.country_id=p_country and c.command_type='INDUSTRY_FIRST_DAY_POWER_EXECUTE_V1'and e.event_type='INDUSTRY_FIRST_DAY_POWER_EXECUTED_V1'and c.canonical_payload::jsonb->>'facilityId'=p_facility and c.canonical_payload::jsonb->>'runId'=p_run and p_power_fingerprints?e.event_fingerprint and e.world_version<=p_before_version and e.event_sequence<=p_before_sequence;
 if jsonb_array_length(pins)<>jsonb_array_length(p_power_fingerprints)or octet_length(claims::text)>65536 then raise exception 'WATER_EVIDENCE_COMPLETE_BOUNDED_ORIGINS_REQUIRED'using errcode='23514';end if;
 return query select jsonb_build_object('kind','WATER_RIGHT_COMMIT','reference',g.event_id,'rawSha256',encode(sha256(convert_to(g.canonical_payload,'UTF8')),'hex')),pins,work,claims,previous::text;
end;$$;
alter function world_v2.read_postwar_industry_water_command_evidence(text,text,text,text,bigint,bigint,text,text,jsonb)owner to world_v2_industry_source_owner;
revoke all on function world_v2.read_postwar_industry_water_command_evidence(text,text,text,text,bigint,bigint,text,text,jsonb)from public;
grant execute on function world_v2.read_postwar_industry_water_command_evidence(text,text,text,text,bigint,bigint,text,text,jsonb)to world_v2_industry_source_reader;
revoke create on schema world_v2 from world_v2_industry_source_owner;
commit;
