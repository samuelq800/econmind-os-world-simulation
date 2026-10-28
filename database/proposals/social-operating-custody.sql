-- SOURCE-ONLY candidate; not in the migration manifest, not installed by this file.
-- Requires the exact runtime-read-binding-storage and controlled signed
-- runtime-admission-publication proposals through the same reviewed release chain.
-- No LOGIN, memberships, credentials, Owner signature, World or Clock creation.
begin;
-- Roles are cluster-scoped while isolated candidate databases may be cloned.
-- Reuse only an exact non-login unprivileged role; never repair a privileged
-- pre-existing role, grant membership or change an enrolled host identity.
do $$declare role_name text;begin
 foreach role_name in array array['world_v2_social_source_owner','world_v2_social_source_publisher','world_v2_social_source_reader']loop
  if not exists(select 1 from pg_roles where rolname=role_name)then
   execute format('create role %I nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication',role_name);
  end if;
  if exists(select 1 from pg_roles where rolname=role_name and(rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))
  then raise exception 'SOCIAL_UNSAFE_PREEXISTING_FIXED_ROLE'using errcode='42501';end if;
 end loop;
end;$$;
grant usage,create on schema world_v2 to world_v2_social_source_owner;
grant usage on schema world_v2 to world_v2_social_source_publisher,world_v2_social_source_reader;
create table world_v2.social_operating_source_registration(
 world_id text not null references world_v2.world_head(world_id),country_id text not null,
 registration_ref text not null unique,seed_fingerprint text not null,source_id text not null,source_payload_hash text not null,
 admission_ref text not null references world_v2.runtime_opening_admission(admission_ref),
 issuer_role name not null check(issuer_role='world_v2_social_source_publisher'),
 revision bigint not null default 1 check(revision=1),created_at timestamptz not null default clock_timestamp(),
 primary key(world_id,country_id),foreign key(world_id,seed_fingerprint) references world_v2.opening_seed(world_id,seed_fingerprint)
);
create table world_v2.social_operating_source_revocation(
 registration_ref text primary key references world_v2.social_operating_source_registration(registration_ref),
 reason_ref text not null check(length(reason_ref) between 1 and 256),revoked_at timestamptz not null default clock_timestamp()
);
alter table world_v2.social_operating_source_registration owner to world_v2_social_source_owner;
alter table world_v2.social_operating_source_revocation owner to world_v2_social_source_owner;
revoke all on world_v2.social_operating_source_registration,world_v2.social_operating_source_revocation from public;
grant select on world_v2.world_head,world_v2.opening_seed,world_v2.runtime_opening_admission,
 world_v2.runtime_admission_publication_permit,world_v2.runtime_admission_publication_revocation to world_v2_social_source_owner;
grant update(world_version) on world_v2.world_head to world_v2_social_source_owner;
grant update(seed_id) on world_v2.runtime_opening_admission to world_v2_social_source_owner;
grant update(authorization_id) on world_v2.runtime_admission_publication_permit to world_v2_social_source_owner;
create policy social_source_owner_seed on world_v2.opening_seed for select to world_v2_social_source_owner using(current_user='world_v2_social_source_owner' and world_id=current_setting('econmind.social_custody_world',true));
create policy social_source_owner_seed_world_fence on world_v2.opening_seed as restrictive for select to world_v2_social_source_owner using(current_user='world_v2_social_source_owner' and world_id=current_setting('econmind.social_custody_world',true));
create policy social_source_owner_admission on world_v2.runtime_opening_admission for select to world_v2_social_source_owner using(current_user='world_v2_social_source_owner' and world_id=current_setting('econmind.social_custody_world',true));
-- Restrictive fences also constrain the pre-existing PUBLIC subject policy.
create policy social_source_owner_admission_world_fence on world_v2.runtime_opening_admission as restrictive for select to world_v2_social_source_owner using(current_user='world_v2_social_source_owner' and world_id=current_setting('econmind.social_custody_world',true));
-- The original PUBLIC admission/seat policies reference these identity metadata
-- columns even on an absent-world lookup. Only this inaccessible owner gets
-- their SELECT; no reader/publisher grant, source payload or write is added.
grant select(world_id,auth_subject,country_id,office_id,team_id,authorization_version,active) on world_v2.current_commit_authorization to world_v2_social_source_owner;
grant select on world_v2.runtime_read_seat to world_v2_social_source_owner;
-- SELECT FOR SHARE also applies the UPDATE visibility policy. This inaccessible
-- definer may lock existing rows; WITH CHECK(false) and the original immutable
-- trigger still prohibit changing any admission original.
create policy social_source_owner_admission_lock on world_v2.runtime_opening_admission for update to world_v2_social_source_owner using(current_user='world_v2_social_source_owner' and world_id=current_setting('econmind.social_custody_world',true)) with check(false);
create policy social_source_owner_admission_lock_world_fence on world_v2.runtime_opening_admission as restrictive for update to world_v2_social_source_owner using(current_user='world_v2_social_source_owner' and world_id=current_setting('econmind.social_custody_world',true)) with check(false);
-- Tables remain inaccessible directly to either operational role.
create function world_v2.social_source_admission(p_world text)
returns world_v2.runtime_opening_admission language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;p world_v2.runtime_admission_publication_permit%rowtype;
begin
 -- Private definer helper only: this setting narrows the owner policy; it is
 -- never authorization. Each public entrypoint first checks the fixed role,
 -- and this helper overwrites any caller-supplied value with its real argument.
 if p_world is null or p_world !~ '^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$' then raise exception 'SOCIAL_EXACT_WORLD_REQUIRED'using errcode='22023';end if;
 perform set_config('econmind.social_custody_world',p_world,true);
 select * into a from world_v2.runtime_opening_admission where world_id=p_world for share;
 if not found then raise exception 'SOCIAL_REAL_IMMUTABLE_ADMISSION_REQUIRED' using errcode='55000';end if;
 select * into p from world_v2.runtime_admission_publication_permit q
 where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref and q.world_id=a.world_id and q.seed_id=a.seed_id
 and q.seed_fingerprint=a.seed_fingerprint and q.model_version=a.model_version and q.replay_binding=a.replay_binding
 and a.admitted_at_real>=q.valid_from and a.admitted_at_real<q.valid_until for share;
 if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=p.authorization_id)
 then raise exception 'SOCIAL_REAL_SIGNED_ADMISSION_REVOKED_OR_MISSING' using errcode='55000';end if;
 return a;
end;$$;
alter function world_v2.social_source_admission(text) owner to world_v2_social_source_owner;
create function world_v2.register_social_operating_source(p_world text,p_country text)
returns world_v2.social_operating_source_registration language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;s world_v2.opening_seed%rowtype;o jsonb;c integer;r world_v2.social_operating_source_registration%rowtype;
begin
 if current_setting('role')<>'world_v2_social_source_publisher' and session_user<>'world_v2_social_source_publisher'
 then raise exception 'SOCIAL_FIXED_PUBLISHER_REQUIRED' using errcode='42501';end if;
 if pg_has_role((case when current_setting('role')='none' then session_user else current_setting('role')::name end),'world_v2_social_source_owner','MEMBER') then raise exception 'SOCIAL_OWNER_MEMBERSHIP_REFUSED'using errcode='42501';end if;
 perform set_config('econmind.social_custody_world',p_world,true);
 perform 1 from world_v2.world_head where world_id=p_world for share;
 a:=world_v2.social_source_admission(p_world);
 select * into strict s from world_v2.opening_seed where world_id=p_world;
 select count(*),jsonb_agg(x)->0 into c,o from jsonb_array_elements(s.canonical_payload::jsonb->'sources') x
 where (x->>'canonicalPayload')::jsonb->>'schemaVersion'='postwar-operating-genesis-seed-source-v1';
 if c<>1 or not exists(select 1 from jsonb_array_elements(((o->>'canonicalPayload')::jsonb)->'carrier'->'socialEmployment'->'countries') x where x->>'countryId'=p_country)
 then raise exception 'SOCIAL_CANONICAL_FULL_E03_REQUIRED' using errcode='23514';end if;
 insert into world_v2.social_operating_source_registration(world_id,country_id,registration_ref,seed_fingerprint,source_id,source_payload_hash,admission_ref,issuer_role)
 values(p_world,p_country,'SOCIAL_REG_'||upper(encode(sha256(convert_to(jsonb_build_array(p_world,p_country,s.seed_fingerprint,o->>'sourceId')::text,'UTF8')),'hex')),s.seed_fingerprint,o->>'sourceId',o->>'payloadHash',a.admission_ref,'world_v2_social_source_publisher')
 on conflict(world_id,country_id) do nothing;
 select * into strict r from world_v2.social_operating_source_registration where world_id=p_world and country_id=p_country;
 if r.seed_fingerprint<>s.seed_fingerprint or r.source_id<>o->>'sourceId' or r.source_payload_hash<>o->>'payloadHash' or r.admission_ref<>a.admission_ref then raise exception 'SOCIAL_REGISTRATION_CONFLICT' using errcode='23514';end if;
 return r;
end;$$;
alter function world_v2.register_social_operating_source(text,text) owner to world_v2_social_source_owner;
-- World batch derives the entire exact country set from the same immutable
-- original once; it accepts no country list, fabricated offer or caller facts.
create function world_v2.register_social_operating_source_world(p_world text)
returns setof world_v2.social_operating_source_registration language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;s world_v2.opening_seed%rowtype;o jsonb;c integer;countries jsonb;
begin
 if current_setting('role')<>'world_v2_social_source_publisher' and session_user<>'world_v2_social_source_publisher'
 then raise exception 'SOCIAL_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if pg_has_role((case when current_setting('role')='none' then session_user else current_setting('role')::name end),'world_v2_social_source_owner','MEMBER') then raise exception 'SOCIAL_OWNER_MEMBERSHIP_REFUSED'using errcode='42501';end if;
 perform set_config('econmind.social_custody_world',p_world,true);
 perform 1 from world_v2.world_head where world_id=p_world for share;
 a:=world_v2.social_source_admission(p_world);
 select * into strict s from world_v2.opening_seed where world_id=p_world;
 select count(*),jsonb_agg(x)->0 into c,o from jsonb_array_elements(s.canonical_payload::jsonb->'sources') x
 where (x->>'canonicalPayload')::jsonb->>'schemaVersion'='postwar-operating-genesis-seed-source-v1';
 if c<>1 then raise exception 'SOCIAL_CANONICAL_FULL_E03_REQUIRED'using errcode='23514';end if;
 countries:=((o->>'canonicalPayload')::jsonb)->'carrier'->'socialEmployment'->'countries';
 if jsonb_typeof(countries) is distinct from 'array' or jsonb_array_length(countries)=0 or
 exists(select 1 from jsonb_array_elements(countries)x where x->>'countryId' is null or x->>'countryId'!~'^COUNTRY_[A-Z0-9_]+$') or
 (select count(*) from jsonb_array_elements(countries))<>(select count(distinct x->>'countryId')from jsonb_array_elements(countries)x)
 then raise exception 'SOCIAL_CANONICAL_COUNTRIES_REQUIRED'using errcode='23514';end if;
 insert into world_v2.social_operating_source_registration(world_id,country_id,registration_ref,seed_fingerprint,source_id,source_payload_hash,admission_ref,issuer_role)
 select p_world,x->>'countryId','SOCIAL_REG_'||upper(encode(sha256(convert_to(jsonb_build_array(p_world,x->>'countryId',s.seed_fingerprint,o->>'sourceId')::text,'UTF8')),'hex')),s.seed_fingerprint,o->>'sourceId',o->>'payloadHash',a.admission_ref,'world_v2_social_source_publisher'
 from jsonb_array_elements(countries)x on conflict(world_id,country_id)do nothing;
 if exists(select 1 from world_v2.social_operating_source_registration r where r.world_id=p_world and
 (not exists(select 1 from jsonb_array_elements(countries)x where x->>'countryId'=r.country_id) or
 r.seed_fingerprint<>s.seed_fingerprint or r.source_id<>o->>'sourceId' or r.source_payload_hash<>o->>'payloadHash' or r.admission_ref<>a.admission_ref))
 then raise exception 'SOCIAL_REGISTRATION_CONFLICT'using errcode='23514';end if;
 return query select r.* from world_v2.social_operating_source_registration r where r.world_id=p_world order by r.country_id;
end;$$;
alter function world_v2.register_social_operating_source_world(text) owner to world_v2_social_source_owner;
create function world_v2.lock_social_operating_source(p_world text,p_country text)
returns world_v2.social_operating_source_registration language plpgsql security definer set search_path=pg_catalog as $$
declare r world_v2.social_operating_source_registration%rowtype;a world_v2.runtime_opening_admission%rowtype;
begin
 if current_setting('role')<>'world_v2_social_source_reader' and session_user<>'world_v2_social_source_reader'
 then raise exception 'SOCIAL_FIXED_READER_REQUIRED' using errcode='42501';end if;
 if pg_has_role((case when current_setting('role')='none' then session_user else current_setting('role')::name end),'world_v2_social_source_owner','MEMBER') then raise exception 'SOCIAL_OWNER_MEMBERSHIP_REFUSED'using errcode='42501';end if;
 perform set_config('econmind.social_custody_world',p_world,true);
 perform 1 from world_v2.world_head where world_id=p_world for share;
 a:=world_v2.social_source_admission(p_world);
 select * into r from world_v2.social_operating_source_registration where world_id=p_world and country_id=p_country for share;
 if not found or r.admission_ref<>a.admission_ref or r.seed_fingerprint<>a.seed_fingerprint or exists(select 1 from world_v2.social_operating_source_revocation q where q.registration_ref=r.registration_ref)
 then raise exception 'SOCIAL_SOURCE_NOT_REGISTERED_OR_REVOKED' using errcode='55000';end if;
 return r;
end;$$;
alter function world_v2.lock_social_operating_source(text,text) owner to world_v2_social_source_owner;
-- Fixed lock-read only. Neither the worker nor source-reader receives UPDATE
-- on current authority merely to acquire row locks. This inaccessible owner
-- has no callable authority-write function; exact subject/scope is mandatory.
grant select(capability),update(refreshed_at_real)on world_v2.current_commit_authorization to world_v2_social_source_owner;
create function world_v2.lock_social_operating_current_authorization(p_world text,p_country text,p_subject uuid,p_office text,p_capability text)
returns table(auth_subject text,world_id text,country_id text,office_id text,capability text,team_id text,authorization_version text)
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if not((p_office='SOCIAL'and p_capability='SOCIAL_LABOUR')or(p_office='FINANCE'and p_capability='FINANCE_BUDGET'))then raise exception 'SOCIAL_FIXED_CAPABILITY_REQUIRED'using errcode='42501';end if;
 perform world_v2.lock_social_operating_source(p_world,p_country);
 return query select a.auth_subject::text,a.world_id,a.country_id,a.office_id,a.capability,a.team_id,a.authorization_version
 from world_v2.current_commit_authorization a
 where a.world_id=p_world and a.country_id=p_country and a.auth_subject=p_subject and a.office_id=p_office and a.capability=p_capability and a.active
 and not exists(select 1 from world_v2.current_commit_authorization c where c.world_id=a.world_id and c.auth_subject=a.auth_subject and c.active and(c.country_id is distinct from a.country_id or c.team_id is distinct from a.team_id or c.authorization_version is distinct from a.authorization_version))for share of a;
end;$$;
alter function world_v2.lock_social_operating_current_authorization(text,text,uuid,text,text)owner to world_v2_social_source_owner;
revoke all on function world_v2.lock_social_operating_current_authorization(text,text,uuid,text,text)from public;
grant execute on function world_v2.lock_social_operating_current_authorization(text,text,uuid,text,text)to world_v2_social_source_reader;
-- Zero-effect revoked-receipt predicate: preserve ANY active capability in
-- this Office (not just SOCIAL_LABOUR/FINANCE_BUDGET). The repository already
-- holds H first; this function retains the exact H/authority row locks and
-- issues no positive authorization or source-registration assertion.
create function world_v2.lock_social_operating_active_office(p_world text,p_country text,p_subject uuid,p_office text)
returns table(present integer)language plpgsql security definer set search_path=pg_catalog as $$
begin
 if current_setting('role')<>'world_v2_social_source_reader'and session_user<>'world_v2_social_source_reader'then raise exception 'SOCIAL_FIXED_READER_REQUIRED'using errcode='42501';end if;
 if pg_has_role((case when current_setting('role')='none'then session_user else current_setting('role')::name end),'world_v2_social_source_owner','MEMBER')then raise exception 'SOCIAL_OWNER_MEMBERSHIP_REFUSED'using errcode='42501';end if;
 if p_world is null or p_world!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or p_country is null or p_subject is null or p_office not in('SOCIAL','FINANCE')then raise exception 'SOCIAL_EXACT_AUTHORITY_SCOPE_REQUIRED'using errcode='22023';end if;
 perform set_config('econmind.social_custody_world',p_world,true);
 perform 1 from world_v2.world_head h where h.world_id=p_world for share;
 if not found then raise exception 'SOCIAL_WORLD_HEAD_REQUIRED'using errcode='55000';end if;
 return query select 1 from world_v2.current_commit_authorization a where a.world_id=p_world and a.auth_subject=p_subject and a.country_id=p_country and a.office_id is not distinct from p_office and a.active for share of a;
end;$$;
alter function world_v2.lock_social_operating_active_office(text,text,uuid,text)owner to world_v2_social_source_owner;
revoke all on function world_v2.lock_social_operating_active_office(text,text,uuid,text)from public;
grant execute on function world_v2.lock_social_operating_active_office(text,text,uuid,text)to world_v2_social_source_reader;
-- A fixed definer supplies the real guarded head. The operational source
-- reader needs no UPDATE privilege merely to satisfy PostgreSQL FOR SHARE.
create function world_v2.lock_social_operating_lineage_head(p_world text,p_country text)
returns table(world_version bigint,event_sequence bigint)language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform world_v2.lock_social_operating_source(p_world,p_country);
 return query select h.world_version,h.event_sequence from world_v2.world_head h where h.world_id=p_world for share;
end;$$;
alter function world_v2.lock_social_operating_lineage_head(text,text)owner to world_v2_social_source_owner;
revoke all on function world_v2.lock_social_operating_lineage_head(text,text)from public;
grant execute on function world_v2.lock_social_operating_lineage_head(text,text)to world_v2_social_source_reader;
create function world_v2.revoke_social_operating_source(p_world text,p_country text,p_reason text)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare r world_v2.social_operating_source_registration%rowtype;
begin
 if current_setting('role')<>'world_v2_social_source_publisher' and session_user<>'world_v2_social_source_publisher'
 then raise exception 'SOCIAL_FIXED_PUBLISHER_REQUIRED' using errcode='42501';end if;
 if pg_has_role((case when current_setting('role')='none' then session_user else current_setting('role')::name end),'world_v2_social_source_owner','MEMBER') then raise exception 'SOCIAL_OWNER_MEMBERSHIP_REFUSED'using errcode='42501';end if;
 perform set_config('econmind.social_custody_world',p_world,true);
 select * into strict r from world_v2.social_operating_source_registration where world_id=p_world and country_id=p_country for update;
 insert into world_v2.social_operating_source_revocation(registration_ref,reason_ref)values(r.registration_ref,p_reason)on conflict do nothing;
end;$$;
alter function world_v2.revoke_social_operating_source(text,text,text) owner to world_v2_social_source_owner;
do $$declare t text;begin foreach t in array array['social_operating_source_registration','social_operating_source_revocation']loop
 execute format('create trigger %I before update or delete on world_v2.%I for each row execute function world_v2.reject_authoritative_history_mutation()',t||'_immutable',t);
 execute format('create trigger %I before truncate on world_v2.%I for each statement execute function world_v2.reject_authoritative_history_mutation()',t||'_no_truncate',t);end loop;end;$$;
revoke all on function world_v2.social_source_admission(text),world_v2.register_social_operating_source(text,text),world_v2.lock_social_operating_source(text,text),world_v2.revoke_social_operating_source(text,text,text) from public;
grant execute on function world_v2.register_social_operating_source(text,text),world_v2.revoke_social_operating_source(text,text,text) to world_v2_social_source_publisher;
grant execute on function world_v2.lock_social_operating_source(text,text) to world_v2_social_source_reader;
revoke all on function world_v2.register_social_operating_source_world(text) from public;
grant execute on function world_v2.register_social_operating_source_world(text) to world_v2_social_source_publisher;
revoke create on schema world_v2 from world_v2_social_source_owner;
-- Canonical lineage SELECT/row-lock permissions and cooperating atomic-writer
-- roles are a separate reviewed deployment prerequisite, never browser grants.
commit;
