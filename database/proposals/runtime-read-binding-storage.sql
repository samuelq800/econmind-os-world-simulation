-- UNNUMBERED SOURCE-ONLY PROPOSAL. Not registered in the release manifest.
-- No roles/grants/backfill/production action. Existing release chain only.
create table world_v2.runtime_read_seat (
  seat_ref text primary key default ('SEAT_' || upper(replace(pg_catalog.gen_random_uuid()::text, '-', '_')))
    check (seat_ref ~ '^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'),
  world_id text not null references world_v2.world_head(world_id)
    check (world_id ~ '^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'),
  auth_subject uuid not null,
  country_id text not null check (country_id ~ '^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'),
  office_id text not null check (office_id in ('CAPTAIN','FINANCE','CENTRAL_BANK','INDUSTRY','TRADE','SOCIAL')),
  team_id text not null check (team_id ~ '^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'),
  authorization_revision text not null check (
    authorization_revision = btrim(authorization_revision)
    and length(authorization_revision) between 1 and 256
  ),
  created_at_real timestamptz not null default current_timestamp,
  unique (world_id, auth_subject, office_id, authorization_revision)
);
comment on table world_v2.runtime_read_seat is
  'Immutable revision-scoped reference derived from current server authorization; not a role assignment, capability, active flag or grant. Existing current authorization and entitlement remain mandatory at every read.';

create function world_v2.validate_runtime_read_seat_insert()
returns trigger language plpgsql security invoker as $$
begin
  if not exists (
    select 1 from world_v2.current_commit_authorization a
    where a.world_id = new.world_id and a.auth_subject = new.auth_subject
      and a.country_id = new.country_id and a.office_id = new.office_id
      and a.team_id = new.team_id and a.authorization_version = new.authorization_revision
      and a.active
  ) or exists (
    select 1 from world_v2.current_commit_authorization a
    where a.world_id = new.world_id and a.auth_subject = new.auth_subject and a.active
      and (a.country_id is distinct from new.country_id
        or a.team_id is distinct from new.team_id
        or a.authorization_version is distinct from new.authorization_revision)
  ) then
    raise exception 'seat reference requires one coherent current membership and the exact Office assignment'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger runtime_read_seat_binds_current_assignment
before insert on world_v2.runtime_read_seat
for each row execute function world_v2.validate_runtime_read_seat_insert();
create trigger runtime_read_seat_is_immutable
before update or delete on world_v2.runtime_read_seat
for each row execute function world_v2.reject_authoritative_history_mutation();
create trigger runtime_read_seat_cannot_truncate
before truncate on world_v2.runtime_read_seat
for each statement execute function world_v2.reject_authoritative_history_mutation();

create table world_v2.runtime_opening_admission (
  world_id text primary key references world_v2.world_head(world_id),
  admission_ref text not null unique default ('ADMISSION_' || upper(replace(pg_catalog.gen_random_uuid()::text, '-', '_')))
    check (admission_ref ~ '^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'),
  seed_id text not null references world_v2.opening_seed(seed_id),
  seed_fingerprint text not null check (seed_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  model_version text not null check (length(model_version) between 1 and 256 and model_version = btrim(model_version)),
  replay_binding text not null check (replay_binding <> ''),
  admitted_at_real timestamptz not null default current_timestamp,
  foreign key (world_id, seed_fingerprint) references world_v2.opening_seed(world_id, seed_fingerprint)
);
comment on table world_v2.runtime_opening_admission is
  'Immutable exact seed/model/replay admission record. INSERT is vetoed until a real independently trusted ADMITTED-result publisher is reviewed and wired through the sole release chain. Seed/bootstrap/source/code approval is never admission.';
create function world_v2.guard_runtime_opening_admission_publication()
returns trigger language plpgsql security invoker as $$
declare opening world_v2.opening_seed%rowtype;
begin
  select * into opening from world_v2.opening_seed where world_id = new.world_id;
  if opening.world_id is null
    or opening.seed_id is distinct from new.seed_id
    or opening.seed_fingerprint is distinct from new.seed_fingerprint
    or opening.replay_binding is distinct from new.replay_binding
    or (opening.replay_binding::jsonb ->> 'modelVersion') is distinct from new.model_version then
    raise exception 'admission must bind exact immutable opening lineage' using errcode = '23514';
  end if;
  -- There is currently no real ADMITTED-result publication entrypoint.
  -- Never remove this veto because an owner selected source or code merged.
  raise exception 'ADMISSION_PUBLICATION_ENTRYPOINT_MISSING' using errcode = '55000';
end;
$$;
create trigger runtime_opening_admission_requires_real_publication
before insert on world_v2.runtime_opening_admission
for each row execute function world_v2.guard_runtime_opening_admission_publication();
create trigger runtime_opening_admission_is_immutable
before update or delete on world_v2.runtime_opening_admission
for each row execute function world_v2.reject_authoritative_history_mutation();
create trigger runtime_opening_admission_cannot_truncate
before truncate on world_v2.runtime_opening_admission
for each statement execute function world_v2.reject_authoritative_history_mutation();

alter table world_v2.runtime_read_seat enable row level security;
alter table world_v2.runtime_read_seat force row level security;
alter table world_v2.runtime_opening_admission enable row level security;
alter table world_v2.runtime_opening_admission force row level security;
revoke all on world_v2.runtime_read_seat, world_v2.runtime_opening_admission from public;
revoke all on function world_v2.validate_runtime_read_seat_insert() from public;
revoke all on function world_v2.guard_runtime_opening_admission_publication() from public;

-- These policies confer no SQL privilege. Later reviewed provisioning must
-- grant separate publisher INSERT/SELECT and runtime-reader SELECT only.
create policy runtime_read_seat_current_subject_select on world_v2.runtime_read_seat
for select to public using (
  current_user not in ('anon','authenticated','service_role','world_v2_api_reader','world_v2_api_login')
  and auth_subject::text = current_setting('request.jwt.claim.sub', true)
  and exists (select 1 from world_v2.current_commit_authorization a
    where a.world_id = runtime_read_seat.world_id and a.auth_subject = runtime_read_seat.auth_subject
      and a.country_id = runtime_read_seat.country_id and a.office_id = runtime_read_seat.office_id
      and a.team_id = runtime_read_seat.team_id and a.authorization_version = runtime_read_seat.authorization_revision and a.active)
  and not exists (select 1 from world_v2.current_commit_authorization a
    where a.world_id = runtime_read_seat.world_id and a.auth_subject = runtime_read_seat.auth_subject and a.active
      and (a.country_id is distinct from runtime_read_seat.country_id or a.team_id is distinct from runtime_read_seat.team_id
        or a.authorization_version is distinct from runtime_read_seat.authorization_revision))
);
create policy runtime_read_seat_current_assignment_insert on world_v2.runtime_read_seat
for insert to public with check (
  current_user not in ('anon','authenticated','service_role','world_v2_api_reader','world_v2_api_login')
  and exists (select 1 from world_v2.current_commit_authorization a
    where a.world_id = runtime_read_seat.world_id and a.auth_subject = runtime_read_seat.auth_subject
      and a.country_id = runtime_read_seat.country_id and a.office_id = runtime_read_seat.office_id
      and a.team_id = runtime_read_seat.team_id and a.authorization_version = runtime_read_seat.authorization_revision and a.active)
);
create policy runtime_opening_admission_current_subject_select on world_v2.runtime_opening_admission
for select to public using (
  current_user not in ('anon','authenticated','service_role','world_v2_api_reader','world_v2_api_login')
  and exists (select 1 from world_v2.runtime_read_seat s
    where s.world_id = runtime_opening_admission.world_id
      and s.auth_subject::text = current_setting('request.jwt.claim.sub', true))
);
-- Intentionally NO INSERT policy for admission: fail closed at RLS and guard.
do $$
declare role_name text;
begin
  foreach role_name in array array['anon','authenticated','service_role','world_v2_api_reader','world_v2_api_login'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on world_v2.runtime_read_seat, world_v2.runtime_opening_admission from %I', role_name);
      execute format('revoke all on function world_v2.validate_runtime_read_seat_insert() from %I', role_name);
      execute format('revoke all on function world_v2.guard_runtime_opening_admission_publication() from %I', role_name);
    end if;
  end loop;
end;
$$;
