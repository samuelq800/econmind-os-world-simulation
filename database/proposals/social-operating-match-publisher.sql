-- SOURCE-ONLY, unregistered candidate. Depends on social-operating-custody.sql.
-- Fixed source publisher derives a one-shot day-zero rule from registered
-- originals and an actually COMMITTED last PLAN. No Clock process/advance,
-- caller Ready/admission flag, arbitrary command payload or production install.
begin;
grant create on schema world_v2 to world_v2_social_source_owner;
create table world_v2.social_operating_match_publisher(
 world_id text not null,country_id text not null,grant_ref text not null unique,
 registration_ref text not null references world_v2.social_operating_source_registration(registration_ref),
 admission_ref text not null references world_v2.runtime_opening_admission(admission_ref),
 issuer_role name not null check(issuer_role='world_v2_social_source_publisher'),
 actor_id text not null,auth_subject uuid not null,rule_version text not null check(rule_version='SOCIAL_JOB_MATCH_RULE_V1'),
 valid_from_day bigint not null check(valid_from_day=0),valid_until_day bigint not null check(valid_until_day=1),
 revision bigint not null check(revision=1),primary key(world_id,country_id)
);
create table world_v2.social_operating_match_publisher_revocation(
 grant_ref text primary key references world_v2.social_operating_match_publisher(grant_ref),reason_ref text not null,revoked_at timestamptz not null default clock_timestamp()
);
create table world_v2.social_operating_match_publication(
 world_id text not null,plan_command_id text not null,rule_version text not null,grant_ref text not null references world_v2.social_operating_match_publisher(grant_ref),
 command_id text not null,command_fingerprint text not null,primary key(world_id,plan_command_id,rule_version),
 foreign key(world_id,plan_command_id)references world_v2.command_submission(world_id,command_id),foreign key(world_id,command_id)references world_v2.command_submission(world_id,command_id)
);
alter table world_v2.social_operating_match_publisher owner to world_v2_social_source_owner;
alter table world_v2.social_operating_match_publisher_revocation owner to world_v2_social_source_owner;
alter table world_v2.social_operating_match_publication owner to world_v2_social_source_owner;
revoke all on world_v2.social_operating_match_publisher,world_v2.social_operating_match_publisher_revocation,world_v2.social_operating_match_publication from public;
grant select,insert on world_v2.command_submission,world_v2.command_queue to world_v2_social_source_owner;
grant select on world_v2.command_receipt,world_v2.authoritative_event to world_v2_social_source_owner;
-- Lock visibility only; the original immutable command trigger still denies DML.
grant update(actor_id)on world_v2.command_submission to world_v2_social_source_owner;
create function world_v2.register_social_operating_match_publisher(p_world text,p_country text)
returns world_v2.social_operating_match_publisher language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;r world_v2.social_operating_source_registration%rowtype;s world_v2.opening_seed%rowtype;o jsonb;c jsonb;h text;g world_v2.social_operating_match_publisher%rowtype;
begin
 if current_setting('role')<>'world_v2_social_source_publisher'and session_user<>'world_v2_social_source_publisher'then raise exception 'SOCIAL_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if pg_has_role((case when current_setting('role')='none'then session_user else current_setting('role')::name end),'world_v2_social_source_owner','MEMBER')then raise exception 'SOCIAL_OWNER_MEMBERSHIP_REFUSED'using errcode='42501';end if;
 a:=world_v2.social_source_admission(p_world);
 select * into strict r from world_v2.social_operating_source_registration where world_id=p_world and country_id=p_country for share;
 if r.admission_ref<>a.admission_ref or exists(select 1 from world_v2.social_operating_source_revocation v where v.registration_ref=r.registration_ref)then raise exception 'SOCIAL_MATCH_SOURCE_REVOKED'using errcode='55000';end if;
 select * into strict s from world_v2.opening_seed where world_id=p_world;
 select (x->>'canonicalPayload')::jsonb into strict o from jsonb_array_elements(s.canonical_payload::jsonb->'sources')x where x->>'sourceId'=r.source_id and x->>'payloadHash'=r.source_payload_hash;
 select x into strict c from jsonb_array_elements(o->'carrier'->'socialEmployment'->'countries')x where x->>'countryId'=p_country;
 if c#>>'{validationReadFacts,facts,boundary,dayIndex}'<>'0'or c#>>'{minimumWage,validUntilDayIndex}'<>'1'or not exists(select 1 from jsonb_array_elements(c#>'{state,servicePools}')x where x->>'ruleVersion'='SOCIAL_JOB_MATCH_RULE_V1')then raise exception 'SOCIAL_MATCH_REAL_DAY_ZERO_RULE_REQUIRED'using errcode='23514';end if;
 h:=encode(sha256(convert_to(jsonb_build_array(p_world,p_country,r.registration_ref,'SOCIAL_JOB_MATCH_RULE_V1')::text,'UTF8')),'hex');
 insert into world_v2.social_operating_match_publisher values(p_world,p_country,'SOCIAL_MATCH_GRANT_'||upper(h),r.registration_ref,a.admission_ref,'world_v2_social_source_publisher','ACTOR_SOCIAL_MATCH_'||upper(h),(substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-a'||substr(h,18,3)||'-'||substr(h,21,12))::uuid,'SOCIAL_JOB_MATCH_RULE_V1',0,1,1)on conflict(world_id,country_id)do nothing;
 select * into strict g from world_v2.social_operating_match_publisher where world_id=p_world and country_id=p_country;
 if g.registration_ref<>r.registration_ref or g.admission_ref<>a.admission_ref then raise exception 'SOCIAL_MATCH_GRANT_CONFLICT'using errcode='23514';end if;
 return g;
end;$$;
alter function world_v2.register_social_operating_match_publisher(text,text)owner to world_v2_social_source_owner;
create function world_v2.lock_social_operating_match_publisher(p_world text,p_country text)
returns world_v2.social_operating_match_publisher language plpgsql security definer set search_path=pg_catalog as $$
declare r world_v2.social_operating_source_registration%rowtype;g world_v2.social_operating_match_publisher%rowtype;
begin
 r:=world_v2.lock_social_operating_source(p_world,p_country);
 select * into g from world_v2.social_operating_match_publisher where world_id=p_world and country_id=p_country for share;
 if not found or g.registration_ref<>r.registration_ref or g.admission_ref<>r.admission_ref or exists(select 1 from world_v2.social_operating_match_publisher_revocation v where v.grant_ref=g.grant_ref)then raise exception 'SOCIAL_MATCH_CURRENT_PUBLISHER_REQUIRED'using errcode='55000';end if;
 return g;
end;$$;
alter function world_v2.lock_social_operating_match_publisher(text,text)owner to world_v2_social_source_owner;
create function world_v2.lock_social_operating_match_publication(p_world text,p_country text,p_command text,p_plan text)
returns world_v2.social_operating_match_publication language plpgsql security definer set search_path=pg_catalog as $$
declare g world_v2.social_operating_match_publisher%rowtype;p world_v2.social_operating_match_publication%rowtype;
begin
 g:=world_v2.lock_social_operating_match_publisher(p_world,p_country);
 select * into p from world_v2.social_operating_match_publication where world_id=p_world and command_id=p_command and plan_command_id=p_plan and grant_ref=g.grant_ref and rule_version=g.rule_version for share;
 if not found then raise exception 'SOCIAL_MATCH_ACTUAL_PUBLICATION_REQUIRED'using errcode='55000';end if;
 return p;
end;$$;
alter function world_v2.lock_social_operating_match_publication(text,text,text,text)owner to world_v2_social_source_owner;
revoke all on function world_v2.lock_social_operating_match_publication(text,text,text,text)from public;
grant execute on function world_v2.lock_social_operating_match_publication(text,text,text,text)to world_v2_social_source_reader;
create function world_v2.revoke_social_operating_match_publisher(p_world text,p_country text,p_reason text)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare g world_v2.social_operating_match_publisher%rowtype;
begin
 if current_setting('role')<>'world_v2_social_source_publisher'and session_user<>'world_v2_social_source_publisher'then raise exception 'SOCIAL_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 select * into strict g from world_v2.social_operating_match_publisher where world_id=p_world and country_id=p_country for update;
 insert into world_v2.social_operating_match_publisher_revocation values(g.grant_ref,p_reason,clock_timestamp())on conflict do nothing;
end;$$;
alter function world_v2.revoke_social_operating_match_publisher(text,text,text)owner to world_v2_social_source_owner;
create function world_v2.publish_social_operating_match_due(p_world text,p_plan text)
returns world_v2.command_submission language plpgsql security definer set search_path=pg_catalog as $$
declare p world_v2.command_submission%rowtype;g world_v2.social_operating_match_publisher%rowtype;r world_v2.command_receipt%rowtype;h world_v2.world_head%rowtype;a world_v2.runtime_opening_admission%rowtype;bound world_v2.social_operating_source_registration%rowtype;payload jsonb;intent jsonb;id text;fp text;payload_text text;published timestamptz;v world_v2.command_submission%rowtype;old world_v2.social_operating_match_publication%rowtype;
begin
 if current_setting('role')<>'world_v2_social_source_publisher'and session_user<>'world_v2_social_source_publisher'then raise exception 'SOCIAL_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if pg_has_role((case when current_setting('role')='none'then session_user else current_setting('role')::name end),'world_v2_social_source_owner','MEMBER')then raise exception 'SOCIAL_OWNER_MEMBERSHIP_REFUSED'using errcode='42501';end if;
 select * into strict p from world_v2.command_submission where world_id=p_world and command_id=p_plan for share;
 if p.command_type<>'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1'or p.office_id<>'SOCIAL'or p.canonical_payload::jsonb->>'dueDayIndex'<>'0'then raise exception 'SOCIAL_MATCH_ORIGINAL_PLAN_REQUIRED'using errcode='23514';end if;
 select * into strict h from world_v2.world_head where world_id=p_world for share;
 a:=world_v2.social_source_admission(p_world);
 select * into strict bound from world_v2.social_operating_source_registration where world_id=p_world and country_id=p.country_id for share;
 select * into strict g from world_v2.social_operating_match_publisher where world_id=p_world and country_id=p.country_id for share;
 if g.registration_ref<>bound.registration_ref or g.admission_ref<>a.admission_ref or exists(select 1 from world_v2.social_operating_source_revocation x where x.registration_ref=bound.registration_ref)or exists(select 1 from world_v2.social_operating_match_publisher_revocation x where x.grant_ref=g.grant_ref)then raise exception 'SOCIAL_MATCH_PUBLISHER_REVOKED'using errcode='55000';end if;
 select * into strict r from world_v2.command_receipt where world_id=p_world and command_id=p_plan and outcome='COMMITTED';
 select * into old from world_v2.social_operating_match_publication where world_id=p_world and plan_command_id=p_plan and rule_version=g.rule_version;
 if found then select * into strict v from world_v2.command_submission where world_id=p_world and command_id=old.command_id;
  if v.command_fingerprint<>old.command_fingerprint then raise exception 'SOCIAL_MATCH_PUBLISHED_COMMAND_CONFLICT'using errcode='23514';end if;return v;
 end if;
 if h.world_version<>r.world_version_after or not exists(select 1 from world_v2.authoritative_event e where e.world_id=p_world and e.causation_command_id=p_plan and e.event_type='SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1'and e.event_sequence=h.event_sequence and e.sim_time=p.sim_time)or p.sim_time<0 or p.sim_time>=86400000 then raise exception 'SOCIAL_MATCH_LAST_CANONICAL_PLAN_BOUNDARY_REQUIRED'using errcode='55000';end if;
 id:='COMMAND_SOCIAL_MATCH_'||upper(encode(sha256(convert_to(jsonb_build_array(g.grant_ref,p.command_fingerprint,g.rule_version)::text,'UTF8')),'hex'));
 payload:=jsonb_build_object('schemaVersion','social-job-match-settlement-v1','planCommandId',p.command_id,'planFingerprint',p.command_fingerprint,'dueDayIndex','0','ruleVersion',g.rule_version);
 payload_text:=world_v2.canonical_json(payload);
 intent:=jsonb_build_object('actorId',g.actor_id,'authSubject',g.auth_subject::text,'commandId',id,'commandType','CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1','countryId',p.country_id,'expectedWorldVersion',h.world_version::text,'idempotencyKey',id,'officeId',null,'canonicalPayload',payload_text,'schemaVersion','command-v1','simTime',p.sim_time::text,'worldId',p_world);
 fp:='sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(intent));published:=date_trunc('milliseconds',clock_timestamp());
 insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)
 values(p_world,id,id,'CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1','command-v1',payload_text,'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||payload_text),fp,g.auth_subject,g.actor_id,p.country_id,null,h.world_version,p.sim_time,p.correlation_id,published);
 insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time)values(p_world,id,'VERSIONED_AUTOMATIC',p.sim_time);
 insert into world_v2.social_operating_match_publication values(p_world,p_plan,g.rule_version,g.grant_ref,id,fp);
 select * into strict v from world_v2.command_submission where world_id=p_world and command_id=id;return v;
end;$$;
alter function world_v2.publish_social_operating_match_due(text,text)owner to world_v2_social_source_owner;
do $$declare t text;begin foreach t in array array['social_operating_match_publisher','social_operating_match_publisher_revocation','social_operating_match_publication']loop
 execute format('create trigger %I before update or delete on world_v2.%I for each row execute function world_v2.reject_authoritative_history_mutation()',t||'_immutable',t);
 execute format('create trigger %I before truncate on world_v2.%I for each statement execute function world_v2.reject_authoritative_history_mutation()',t||'_no_truncate',t);end loop;end;$$;
revoke all on function world_v2.register_social_operating_match_publisher(text,text),world_v2.lock_social_operating_match_publisher(text,text),world_v2.revoke_social_operating_match_publisher(text,text,text),world_v2.publish_social_operating_match_due(text,text)from public;
grant execute on function world_v2.register_social_operating_match_publisher(text,text),world_v2.revoke_social_operating_match_publisher(text,text,text),world_v2.publish_social_operating_match_due(text,text)to world_v2_social_source_publisher;
grant execute on function world_v2.lock_social_operating_match_publisher(text,text)to world_v2_social_source_reader;
revoke create on schema world_v2 from world_v2_social_source_owner;
commit;
