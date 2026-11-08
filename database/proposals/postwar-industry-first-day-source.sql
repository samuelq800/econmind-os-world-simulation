-- CANDIDATE ONLY. Adopted rule originals are source DATA, never evidence that
-- maintenance, work, payment, delivery, resource consumption or output occurred.
-- Existing domestic OP aggregate refineries from each country's own registered
-- originals only. Other recipes/options remain unapproved. No new role/member.
-- Requires postwar-industry-production-source.sql and its immutable admission.
begin;
grant create on schema world_v2 to world_v2_industry_source_owner;
create table world_v2.postwar_industry_first_day_source(
 world_id text not null,country_id text not null,facility_id text not null,
 source_ref text not null unique,registration_ref text not null,
 seed_id text not null,seed_fingerprint text not null,admission_ref text not null,
 policy_version text not null,policy_raw_sha256 text not null,user_adoption_raw_sha256 text not null,
 source_text text not null check(octet_length(source_text)<=65536),source_sha256 text not null check(source_sha256=encode(sha256(convert_to(source_text,'UTF8')),'hex')),
 primary key(world_id,country_id,facility_id),
 foreign key(world_id,registration_ref)references world_v2.postwar_industry_original(world_id,registration_ref)
);
create table world_v2.postwar_industry_first_day_source_revocation(
 world_id text not null,source_ref text primary key references world_v2.postwar_industry_first_day_source(source_ref),reason_ref text not null check(length(reason_ref)between 1 and 256)
);
do $$declare t text;begin foreach t in array array['postwar_industry_first_day_source','postwar_industry_first_day_source_revocation']loop
 execute format('alter table world_v2.%I owner to world_v2_industry_source_owner',t);
 execute format('alter table world_v2.%I enable row level security',t);
 execute format('alter table world_v2.%I force row level security',t);
 execute format('revoke all on world_v2.%I from public,world_v2_industry_source_reader,world_v2_industry_source_publisher',t);
 execute format('create policy first_day_owner on world_v2.%I to world_v2_industry_source_owner using(current_user=''world_v2_industry_source_owner''and world_id=current_setting(''econmind.industry_source_world'',true))with check(current_user=''world_v2_industry_source_owner''and world_id=current_setting(''econmind.industry_source_world'',true))',t);
 execute format('create trigger first_day_immutable before update or delete on world_v2.%I for each row execute function world_v2.reject_authoritative_history_mutation()',t);
 execute format('create trigger first_day_no_truncate before truncate on world_v2.%I for each statement execute function world_v2.reject_authoritative_history_mutation()',t);
end loop;end;$$;
create function world_v2.lock_postwar_industry_first_day_revocation_parent()returns trigger language plpgsql security invoker set search_path=pg_catalog as $$begin
 perform 1 from world_v2.world_head h where h.world_id=new.world_id for update;
 perform 1 from world_v2.postwar_industry_first_day_source s where s.world_id=new.world_id and s.source_ref=new.source_ref for update;
 if not found then raise exception 'INDUSTRY_FIRST_DAY_PARENT_REQUIRED'using errcode='23503';end if;
 return new;
end;$$;
alter function world_v2.lock_postwar_industry_first_day_revocation_parent()owner to world_v2_industry_source_owner;
revoke all on function world_v2.lock_postwar_industry_first_day_revocation_parent()from public;
create trigger first_day_revocation_parent before insert on world_v2.postwar_industry_first_day_source_revocation for each row execute function world_v2.lock_postwar_industry_first_day_revocation_parent();
create function world_v2.publish_postwar_industry_first_day_source(p_world text,p_country text,p_facility text,p_policy text,p_adoption text,p_checksums text,p_domestic_access text)
returns table(source_ref text,source_sha256 text)language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;a world_v2.runtime_opening_admission%rowtype;r world_v2.postwar_industry_original%rowtype;p jsonb;adoption jsonb;d jsonb;f jsonb;recipe jsonb;domestic jsonb;manifest jsonb;n bigint;expected text;body jsonb;raw text;ref text;existing world_v2.postwar_industry_first_day_source%rowtype;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_publisher'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')then raise exception 'INDUSTRY_FIRST_DAY_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if p_country is null or p_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or p_facility is null or p_facility!~'^[A-Za-z][A-Za-z0-9_.:-]{0,127}$'then raise exception 'INDUSTRY_FIRST_DAY_EXACT_COUNTRY_FACILITY_REQUIRED'using errcode='22023';end if;
 if p_policy is null or p_adoption is null or octet_length(p_policy)>65536 or octet_length(p_adoption)>65536 or encode(sha256(convert_to(p_policy,'UTF8')),'hex')<>'99ede2cbf1bb7b04d3fe5d99cf101c47ed055b2e12b8ca9080cfc2a43b3d086c'or encode(sha256(convert_to(p_adoption,'UTF8')),'hex')<>'8d5fb70a2b2250201d623aa7898a95d48540083d6fa316a1b8e920abca0fd9d6'then raise exception 'INDUSTRY_FIRST_DAY_EXACT_ADOPTED_BYTES_REQUIRED'using errcode='23514';end if;
 p:=p_policy::jsonb;adoption:=p_adoption::jsonb;
 if p->>'version'<>'INDUSTRY_FIRST_DAY_20261101_V1'or p->>'status'<>'OWNER_RULES_ADOPTED_EXECUTION_REQUIRES_VALIDATION'or adoption->>'answer'<>'采用这五项有限首日规则'then raise exception 'INDUSTRY_FIRST_DAY_EXPLICIT_ADOPTION_REQUIRED'using errcode='23514';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 perform 1 from world_v2.world_head h where h.world_id=p_world for update;
 if not found then raise exception 'INDUSTRY_FIRST_DAY_WORLD_REQUIRED'using errcode='55000';end if;
 a:=world_v2.industry_source_admission(p_world);
 select * into r from world_v2.postwar_industry_original x where x.world_id=p_world and x.country_id=p_country and x.facility_id=p_facility and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref for share;
 if not found or exists(select 1 from world_v2.postwar_industry_original_revocation v where v.world_id=p_world and v.registration_ref=r.registration_ref)then raise exception 'INDUSTRY_FIRST_DAY_CURRENT_SITE_SOURCE_REQUIRED'using errcode='55000';end if;
 if p_checksums is null or p_domestic_access is null or octet_length(p_checksums)>1048576 or octet_length(p_domestic_access)>1048576 or encode(sha256(convert_to(p_checksums,'UTF8')),'hex')<>r.checksums_sha256 then raise exception 'INDUSTRY_FIRST_DAY_PINNED_DOMESTIC_SOURCE_REQUIRED'using errcode='23514';end if;
 manifest:=p_checksums::jsonb;
 select count(*),min(x->>'sha256')into n,expected from jsonb_array_elements(manifest)x where x->>'path'='data/domestic-access.json';
 if n<>1 or expected<>encode(sha256(convert_to(p_domestic_access,'UTF8')),'hex')then raise exception 'INDUSTRY_FIRST_DAY_DOMESTIC_HASH_DIFFERS'using errcode='23514';end if;
 d:=r.document_text::jsonb;f:=d->'sourceFacility';recipe:=d->'recipe';
 if r.document_sha256<>encode(sha256(convert_to(r.document_text,'UTF8')),'hex')or d->>'worldId'<>p_world or d->>'countryId'<>p_country or f->>'id'<>p_facility or f->>'projectId'<>'PROJECT-15'or f->>'constructionStatusProposal'<>'OPENING_EXISTING_ASSET'or f->>'scenarioRole'<>'OPENING_PORTFOLIO'or f->>'aggregateFacility'<>'true'or f->>'conditionFraction'<>'1'or f->>'recipeId'<>recipe->>'id'or recipe->>'id'<>'SCENARIO-RECIPE-REFINED_FUEL'or recipe->>'commodityId'<>'REFINED_FUEL'then raise exception 'INDUSTRY_FIRST_DAY_EXISTING_SITE_OR_RECIPE_REQUIRED'using errcode='23514';end if;
 select count(*),jsonb_agg(x)->0 into n,domestic from jsonb_array_elements(p_domestic_access::jsonb)x where x->>'fromId'=p_facility and x->>'countryId'=f->>'countryId';
 if n<>1 or domestic->>'id'is distinct from('DOM-'||p_facility) or domestic->>'status'<>'NOT_SURVEYED_NOT_OPERATIONAL'or domestic->>'mode'<>'DOMESTIC_ACCESS_SURVEY'or(domestic->>'capacityTonnesDayProposal')::numeric<=0 or(domestic->>'distanceKmEstimate')::numeric<=0 then raise exception 'INDUSTRY_FIRST_DAY_EXACT_BOUNDED_DOMESTIC_MODEL_REQUIRED'using errcode='23514';end if;
 body:=jsonb_build_object('schemaVersion','postwar-industry-first-day-source-v1','classification','ADOPTED_OPENING_RULE_SOURCE_NOT_EXECUTION_OR_COMMIT_AUTHORITY','worldId',p_world,'countryId',p_country,'facilityId',p_facility,'locationId',d->>'locationId','operatorId',d->>'operatorId','seedId',a.seed_id,'seedFingerprint',a.seed_fingerprint,'admissionRef',a.admission_ref,'registrationRef',r.registration_ref,'siteDocumentSha256',r.document_sha256,'policyVersion',p->>'version','policyRawSha256',encode(sha256(convert_to(p_policy,'UTF8')),'hex'),'userAdoptionRawSha256',encode(sha256(convert_to(p_adoption,'UTF8')),'hex'),'openingWindowStartsAtSimTime','0','openingWindowEndsAtSimTime','86400000','originalConditionFraction','1','maintenanceBasis','OPENING_SERVICEABLE_NOT_COMPLETED_MAINTENANCE','baselineTechnologyBasis','EXISTING_SITE_BASELINE_NOT_UPGRADE_OR_TRANSFERABLE_RIGHT','rightsScope','DOMESTIC_EXISTING_UNFRAGMENTED_OP_AGGREGATE','maximumMinutesPerWorkerFirstSimDay','480','recipe',recipe,'sourceFacility',f,'domesticAccess',domestic,'domesticAccessRawSha256',expected,'commodityCatalog',d->'commodityCatalog','technologyProposals',d->'technologyProposals','licenseProposals',d->'licenseProposals','maintenanceReferences',jsonb_build_object('legacyProxy',f->'maintenanceGcuDayProposal','capitalReferenceBudget',f->'dailyMaintenanceGcuProposal','classification','REFERENCE_NOT_INVOICE_OR_PAYMENT'),'execution',jsonb_build_object('classification','NOT_ESTABLISHED_BY_POLICY_ADOPTION','maintenancePerformed',null,'workMinutesBooked',null,'paymentBatchIds',null,'energyConsumed',null,'waterConsumed',null,'logisticsDelivered',null,'outputProduced',null));
 raw:=body::text;
 if octet_length(raw)>65536 then raise exception 'INDUSTRY_FIRST_DAY_BOUNDED_SOURCE_REQUIRED'using errcode='54000';end if;
 ref:='INDUSTRY_FIRST_DAY_'||upper(encode(sha256(convert_to(raw,'UTF8')),'hex'));
 insert into world_v2.postwar_industry_first_day_source values(p_world,p_country,p_facility,ref,r.registration_ref,a.seed_id,a.seed_fingerprint,a.admission_ref,p->>'version',encode(sha256(convert_to(p_policy,'UTF8')),'hex'),encode(sha256(convert_to(p_adoption,'UTF8')),'hex'),raw,encode(sha256(convert_to(raw,'UTF8')),'hex'))on conflict(world_id,country_id,facility_id)do nothing;
 select * into existing from world_v2.postwar_industry_first_day_source x where x.world_id=p_world and x.country_id=p_country and x.facility_id=p_facility;
 if existing.source_text<>raw or existing.source_ref<>ref or exists(select 1 from world_v2.postwar_industry_first_day_source_revocation v where v.world_id=p_world and v.source_ref=existing.source_ref)then raise exception 'INDUSTRY_FIRST_DAY_CONFLICT_OR_REVOKED'using errcode='55000';end if;
 return query select existing.source_ref,existing.source_sha256;
end;$$;
alter function world_v2.publish_postwar_industry_first_day_source(text,text,text,text,text,text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.publish_postwar_industry_first_day_source(text,text,text,text,text,text,text)from public;
grant execute on function world_v2.publish_postwar_industry_first_day_source(text,text,text,text,text,text,text)to world_v2_industry_source_publisher;
create function world_v2.read_postwar_industry_first_day_source(p_world text,p_country text,p_facility text,p_version bigint,p_sequence bigint)
returns table(source_text text,source_sha256 text,source_ref text,world_version text,event_sequence text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h record;a world_v2.runtime_opening_admission%rowtype;s world_v2.postwar_industry_first_day_source%rowtype;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_industry_source_reader','MEMBER')or pg_has_role(effective,'world_v2_industry_source_owner','MEMBER')or pg_has_role(effective,'world_v2_industry_source_publisher','MEMBER')or exists(select 1 from pg_roles r where r.rolname=effective and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))then raise exception 'INDUSTRY_FIRST_DAY_FIXED_READER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 select h0.world_version,h0.event_sequence into h from world_v2.world_head h0 where h0.world_id=p_world for share;
 if not found or h.world_version<>p_version or h.event_sequence<>p_sequence then raise exception 'INDUSTRY_FIRST_DAY_ACTUAL_HEAD_REQUIRED'using errcode='55000';end if;
 a:=world_v2.industry_source_admission(p_world);
 select * into s from world_v2.postwar_industry_first_day_source x where x.world_id=p_world and x.country_id=p_country and x.facility_id=p_facility and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref for share;
 if not found then return;end if;
 perform 1 from world_v2.postwar_industry_original o where o.world_id=p_world and o.registration_ref=s.registration_ref and o.seed_fingerprint=s.seed_fingerprint and o.admission_ref=s.admission_ref and o.document_sha256=(s.source_text::jsonb->>'siteDocumentSha256')and not exists(select 1 from world_v2.postwar_industry_original_revocation v where v.world_id=p_world and v.registration_ref=o.registration_ref)for share;
 if not found or exists(select 1 from world_v2.postwar_industry_first_day_source_revocation v where v.world_id=p_world and v.source_ref=s.source_ref)then raise exception 'INDUSTRY_FIRST_DAY_SOURCE_REVOKED'using errcode='55000';end if;
 return query select s.source_text,s.source_sha256,s.source_ref,h.world_version::text,h.event_sequence::text;
end;$$;
alter function world_v2.read_postwar_industry_first_day_source(text,text,text,bigint,bigint)owner to world_v2_industry_source_owner;
revoke all on function world_v2.read_postwar_industry_first_day_source(text,text,text,bigint,bigint)from public;
grant execute on function world_v2.read_postwar_industry_first_day_source(text,text,text,bigint,bigint)to world_v2_industry_source_reader;
create function world_v2.revoke_postwar_industry_first_day_source(p_world text,p_source text,p_reason text)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if effective<>'world_v2_industry_source_publisher'or pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')then raise exception 'INDUSTRY_FIRST_DAY_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 perform 1 from world_v2.world_head h where h.world_id=p_world for update;
 perform 1 from world_v2.postwar_industry_first_day_source s where s.world_id=p_world and s.source_ref=p_source for update;
 if not found then raise exception 'INDUSTRY_FIRST_DAY_EXACT_SOURCE_REQUIRED'using errcode='55000';end if;
 insert into world_v2.postwar_industry_first_day_source_revocation values(p_world,p_source,p_reason)on conflict(source_ref)do nothing;
end;$$;
alter function world_v2.revoke_postwar_industry_first_day_source(text,text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.revoke_postwar_industry_first_day_source(text,text,text)from public;
grant execute on function world_v2.revoke_postwar_industry_first_day_source(text,text,text)to world_v2_industry_source_publisher;
revoke create on schema world_v2 from world_v2_industry_source_owner;
commit;
