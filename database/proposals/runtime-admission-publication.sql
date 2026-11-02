-- SOURCE-ONLY candidate; NOT in the migration manifest and NOT an installation.
-- The companion main-site-release-chain alone may review/install this artifact,
-- enroll the release registrar, and register previously verified signed permits.
-- No keys, signed records, external-role memberships, LOGINs or World starts.
begin;

create role world_v2_admission_owner nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
create role world_v2_admission_release nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
grant usage, create on schema world_v2 to world_v2_admission_owner;
grant usage on schema world_v2 to world_v2_admission_release;

-- A permit is a release-installed exact publication decision, not a source DTO.
-- Its signature is checked by the existing PrivateOpeningAdmissionAuthority;
-- only the controlled release registrar may install a verified signed envelope.
create table world_v2.runtime_admission_publication_permit (
  authorization_id text primary key check (authorization_id ~ '^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'),
  authorization_sha256 text not null unique check (authorization_sha256 ~ '^[0-9a-f]{64}$'),
  canonical_authorization text not null check (octet_length(canonical_authorization) between 1 and 16384),
  signature_base64url text not null check (signature_base64url ~ '^[A-Za-z0-9_-]{86}$'),
  world_id text not null references world_v2.world_head(world_id),
  seed_id text not null references world_v2.opening_seed(seed_id),
  seed_fingerprint text not null check (seed_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  model_version text not null,
  replay_binding text not null,
  source_bundle_sha256 text not null check (source_bundle_sha256 ~ '^[0-9a-f]{64}$'),
  caller_session_role name not null check (caller_session_role::text ~ '^world_v2_opening_admission_[a-z0-9_]+$'),
  valid_from timestamptz not null,
  valid_until timestamptz not null check (valid_until > valid_from),
  registered_at timestamptz not null default clock_timestamp(),
  foreign key (world_id, seed_fingerprint) references world_v2.opening_seed(world_id, seed_fingerprint),
  check (authorization_sha256 = encode(sha256(convert_to(canonical_authorization, 'UTF8')), 'hex'))
);
create table world_v2.runtime_admission_publication_revocation (
  authorization_id text primary key references world_v2.runtime_admission_publication_permit(authorization_id),
  reason_ref text not null check (length(reason_ref) between 1 and 256),
  revoked_at timestamptz not null default clock_timestamp()
);
alter table world_v2.runtime_admission_publication_permit owner to world_v2_admission_owner;
alter table world_v2.runtime_admission_publication_revocation owner to world_v2_admission_owner;
revoke all on world_v2.runtime_admission_publication_permit, world_v2.runtime_admission_publication_revocation from public;
grant insert on world_v2.runtime_admission_publication_permit, world_v2.runtime_admission_publication_revocation to world_v2_admission_release;

create function world_v2.validate_runtime_admission_permit()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
declare a jsonb;
begin
  if current_user <> 'world_v2_admission_release' then
    raise exception 'ADMISSION_RELEASE_REGISTRAR_REQUIRED' using errcode = '42501';
  end if;
  a := new.canonical_authorization::jsonb;
  if jsonb_typeof(a) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(a)) <> 13
    or a->>'schemaVersion' is distinct from 'opening-publication-authorization-v1'
    or a->>'purpose' is distinct from 'AUTHORIZE_OFFICIAL_OPENING_ADMISSION_PUBLICATION'
    or coalesce(a->>'keyId','') = '' or coalesce(a->>'ownerIdentity','') = ''
    or a->>'authorizationId' is distinct from new.authorization_id
    or a->>'worldId' is distinct from new.world_id
    or a->>'seedId' is distinct from new.seed_id
    or a->>'seedFingerprint' is distinct from new.seed_fingerprint
    or a->>'modelVersion' is distinct from new.model_version
    or a->>'replayBinding' is distinct from new.replay_binding
    or a->>'sourceBundleSha256' is distinct from new.source_bundle_sha256
    or (a->>'issuedAtReal')::timestamptz is distinct from new.valid_from
    or (a->>'expiresAtReal')::timestamptz is distinct from new.valid_until then
    raise exception 'ADMISSION_PERMIT_SIGNED_BINDING_MISMATCH' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger runtime_admission_permit_exact before insert on world_v2.runtime_admission_publication_permit
for each row execute function world_v2.validate_runtime_admission_permit();

-- Serialize append-only revocation against an in-flight publication's SHARE
-- lock. PostgreSQL's role setting is permission checked, not an approval GUC.
create function world_v2.validate_runtime_admission_revocation()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if session_user <> 'world_v2_admission_release'
    and current_setting('role') <> 'world_v2_admission_release' then
    raise exception 'ADMISSION_RELEASE_REGISTRAR_REQUIRED' using errcode = '42501';
  end if;
  perform 1 from world_v2.runtime_admission_publication_permit p
    where p.authorization_id = new.authorization_id for update;
  if not found then raise exception 'ADMISSION_PERMIT_REQUIRED' using errcode = '23503'; end if;
  return new;
end;
$$;
alter function world_v2.validate_runtime_admission_revocation() owner to world_v2_admission_owner;
create trigger runtime_admission_revocation_registered before insert on world_v2.runtime_admission_publication_revocation
for each row execute function world_v2.validate_runtime_admission_revocation();
do $$
declare t text;
begin
  foreach t in array array['runtime_admission_publication_permit','runtime_admission_publication_revocation'] loop
    execute format('create trigger %I before update or delete on world_v2.%I for each row execute function world_v2.reject_authoritative_history_mutation()', t || '_immutable', t);
    execute format('create trigger %I before truncate on world_v2.%I for each statement execute function world_v2.reject_authoritative_history_mutation()', t || '_no_truncate', t);
  end loop;
end;
$$;

create function world_v2.runtime_admission_permit_for_caller(p_reference text, p_authorization_sha256 text, p_source_sha256 text)
returns world_v2.runtime_admission_publication_permit language plpgsql security definer set search_path = pg_catalog as $$
declare p world_v2.runtime_admission_publication_permit%rowtype;
begin
  if current_user <> 'world_v2_admission_owner' or current_setting('role') <> 'none'
    or not exists(select 1 from pg_roles r where r.rolname=session_user
      and not r.rolsuper and not r.rolbypassrls and not r.rolcreaterole and not r.rolcreatedb and not r.rolreplication)
    or pg_has_role(session_user,'world_v2_admission_owner','MEMBER')
    or pg_has_role(session_user,'world_v2_admission_release','MEMBER')
    or exists(select 1 from pg_roles r where r.rolname in
      ('anon','authenticated','service_role','postgres','supabase_admin','supabase_auth_admin','world_v2_api_reader','world_v2_api_login')
      and pg_has_role(session_user,r.oid,'MEMBER'))
    or has_table_privilege(session_user,'world_v2.world_head','UPDATE')
    or has_table_privilege(session_user,'world_v2.runtime_opening_admission','INSERT,UPDATE,DELETE,TRUNCATE') then
    raise exception 'ADMISSION_CALLER_ROLE_DENIED' using errcode = '42501';
  end if;
  select * into p from world_v2.runtime_admission_publication_permit q
    where q.authorization_id=p_reference and q.authorization_sha256=p_authorization_sha256
      and q.source_bundle_sha256=p_source_sha256 and q.caller_session_role=session_user
      and q.valid_from <= clock_timestamp() and clock_timestamp() < q.valid_until for share;
  if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=p_reference) then
    raise exception 'ADMISSION_PUBLICATION_ENTRYPOINT_MISSING' using errcode = '55000';
  end if;
  return p;
end;
$$;
alter function world_v2.runtime_admission_permit_for_caller(text,text,text) owner to world_v2_admission_owner;

create function world_v2.read_runtime_admission_publication_authorization(p_reference text)
returns table(canonical_authorization text, signature_base64url text) language plpgsql security definer set search_path = pg_catalog as $$
declare p world_v2.runtime_admission_publication_permit%rowtype;
begin
  select * into p from world_v2.runtime_admission_publication_permit q where q.authorization_id=p_reference;
  if not found then return; end if;
  p := world_v2.runtime_admission_permit_for_caller(p_reference,p.authorization_sha256,p.source_bundle_sha256);
  return query select p.canonical_authorization,p.signature_base64url;
end;
$$;
alter function world_v2.read_runtime_admission_publication_authorization(text) owner to world_v2_admission_owner;

create function world_v2.lock_runtime_admission_publication(p_reference text, p_authorization_sha256 text, p_source_sha256 text)
returns table(world_version text, event_sequence text) language plpgsql security definer set search_path = pg_catalog as $$
declare p world_v2.runtime_admission_publication_permit%rowtype;
begin
  p := world_v2.runtime_admission_permit_for_caller(p_reference,p_authorization_sha256,p_source_sha256);
  return query select h.world_version::text,h.event_sequence::text from world_v2.world_head h where h.world_id=p.world_id for update;
end;
$$;
alter function world_v2.lock_runtime_admission_publication(text,text,text) owner to world_v2_admission_owner;

-- Retain the existing trigger: it now proves a controlled exact permit rather
-- than accepting a runtime flag. Direct invoker INSERT always fails.
create or replace function world_v2.guard_runtime_opening_admission_publication()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
declare p world_v2.runtime_admission_publication_permit%rowtype; s world_v2.opening_seed%rowtype;
begin
  if current_user <> 'world_v2_admission_owner' then
    raise exception 'ADMISSION_PUBLICATION_ENTRYPOINT_MISSING' using errcode = '55000';
  end if;
  select * into p from world_v2.runtime_admission_publication_permit q
    where 'ADMISSION_' || upper(q.authorization_sha256)=new.admission_ref and q.caller_session_role=session_user;
  if not found then raise exception 'ADMISSION_PUBLICATION_ENTRYPOINT_MISSING' using errcode = '55000'; end if;
  p := world_v2.runtime_admission_permit_for_caller(p.authorization_id,p.authorization_sha256,p.source_bundle_sha256);
  select * into s from world_v2.opening_seed where world_id=p.world_id;
  if new.world_id is distinct from p.world_id or new.seed_id is distinct from p.seed_id
    or new.seed_fingerprint is distinct from p.seed_fingerprint or new.model_version is distinct from p.model_version
    or new.replay_binding is distinct from p.replay_binding
    or s.seed_id is distinct from p.seed_id or s.seed_fingerprint is distinct from p.seed_fingerprint
    or s.replay_binding is distinct from p.replay_binding or s.replay_binding::jsonb->>'modelVersion' is distinct from p.model_version
    or not exists(select 1 from world_v2.world_head h where h.world_id=p.world_id and h.world_version=0 and h.event_sequence=0)
    or exists(select 1 from world_v2.authoritative_event e where e.world_id=p.world_id)
    or exists(select 1 from world_v2.inventory_posting i where i.world_id=p.world_id)
    or exists(select 1 from world_v2.financial_posting_batch f where f.world_id=p.world_id) then
    raise exception 'ADMISSION_PERMIT_SEED_OR_HEAD_MISMATCH' using errcode = '23514';
  end if;
  return new;
end;
$$;
alter function world_v2.guard_runtime_opening_admission_publication() owner to world_v2_admission_owner;

create function world_v2.publish_runtime_admission_publication(p_reference text, p_authorization_sha256 text, p_source_sha256 text)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare p world_v2.runtime_admission_publication_permit%rowtype; existing world_v2.runtime_opening_admission%rowtype;
begin
  perform * from world_v2.lock_runtime_admission_publication(p_reference,p_authorization_sha256,p_source_sha256);
  p := world_v2.runtime_admission_permit_for_caller(p_reference,p_authorization_sha256,p_source_sha256);
  select * into existing from world_v2.runtime_opening_admission a where a.world_id=p.world_id;
  if found then
    if existing.admission_ref is distinct from 'ADMISSION_' || upper(p.authorization_sha256)
      or existing.seed_id is distinct from p.seed_id or existing.seed_fingerprint is distinct from p.seed_fingerprint
      or existing.model_version is distinct from p.model_version or existing.replay_binding is distinct from p.replay_binding then
      raise exception 'ADMISSION_PERMIT_CONFLICT' using errcode = '23514';
    end if;
    return;
  end if;
  insert into world_v2.runtime_opening_admission(world_id,admission_ref,seed_id,seed_fingerprint,model_version,replay_binding,admitted_at_real)
    values(p.world_id,'ADMISSION_' || upper(p.authorization_sha256),p.seed_id,p.seed_fingerprint,p.model_version,p.replay_binding,clock_timestamp());
end;
$$;
alter function world_v2.publish_runtime_admission_publication(text,text,text) owner to world_v2_admission_owner;

create function world_v2.read_runtime_admission_publication(p_reference text, p_authorization_sha256 text, p_source_sha256 text)
returns table(admission_ref text,world_id text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,admitted_at_real text)
language plpgsql security definer set search_path = pg_catalog as $$
declare p world_v2.runtime_admission_publication_permit%rowtype;
begin
  p := world_v2.runtime_admission_permit_for_caller(p_reference,p_authorization_sha256,p_source_sha256);
  if exists(select 1 from world_v2.runtime_opening_admission a where a.world_id=p.world_id
    and (a.admission_ref is distinct from 'ADMISSION_' || upper(p.authorization_sha256)
      or a.seed_id is distinct from p.seed_id or a.seed_fingerprint is distinct from p.seed_fingerprint
      or a.model_version is distinct from p.model_version or a.replay_binding is distinct from p.replay_binding)) then
    raise exception 'ADMISSION_PERMIT_CONFLICT' using errcode = '23514';
  end if;
  return query select a.admission_ref,a.world_id,a.seed_id,a.seed_fingerprint,a.model_version,a.replay_binding,
    to_char(a.admitted_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    from world_v2.runtime_opening_admission a where a.world_id=p.world_id;
end;
$$;
alter function world_v2.read_runtime_admission_publication(text,text,text) owner to world_v2_admission_owner;

-- Only the inaccessible definer owner obtains source SELECT. Runtime source
-- permissions are a separate reviewed installation prerequisite: most existing
-- ledger tables have no RLS, so a policy alone would not restrict their SELECT.
grant select on world_v2.world_head,world_v2.opening_seed,world_v2.authoritative_event,
  world_v2.inventory_posting,world_v2.financial_posting_batch,world_v2.runtime_opening_admission to world_v2_admission_owner;
create policy admission_owner_seed_read on world_v2.opening_seed for select to world_v2_admission_owner using (true);
create policy admission_owner_read on world_v2.runtime_opening_admission for select to world_v2_admission_owner using (true);
grant update(world_version) on world_v2.world_head to world_v2_admission_owner;
-- world_head does not currently enable RLS. Its lock capability is confined
-- by NOLOGIN/no memberships and fixed definer bodies, not an inert RLS policy.
grant insert on world_v2.runtime_opening_admission to world_v2_admission_owner;
create policy admission_owner_exact_insert on world_v2.runtime_opening_admission for insert to world_v2_admission_owner with check (true);

revoke all on function world_v2.validate_runtime_admission_permit(), world_v2.validate_runtime_admission_revocation(),
  world_v2.runtime_admission_permit_for_caller(text,text,text),world_v2.read_runtime_admission_publication_authorization(text),
  world_v2.lock_runtime_admission_publication(text,text,text),world_v2.publish_runtime_admission_publication(text,text,text),
  world_v2.read_runtime_admission_publication(text,text,text),
  world_v2.guard_runtime_opening_admission_publication() from public;
revoke create on schema world_v2 from world_v2_admission_owner;
-- No runtime role is enrolled here. The reviewed companion release separately
-- grants only registry/lock/publish/readback EXECUTE to an
-- exact dedicated session role after reviewing that role's actual privileges.
commit;
