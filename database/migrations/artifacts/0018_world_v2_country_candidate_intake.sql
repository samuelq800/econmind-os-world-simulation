create table world_v2.country_candidate_bundle (
  bundle_id text primary key check (bundle_id ~ '^[A-Z0-9][A-Z0-9_-]+$'),
  source_thread_id text not null,
  package_manifest_sha256 text not null check (package_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  source_status text not null check (source_status = 'ILLUSTRATIVE_PLANNING_ONLY'),
  activation_allowed boolean not null default false check (activation_allowed = false),
  imported_at timestamptz not null default current_timestamp
);

comment on table world_v2.country_candidate_bundle is
  'Inert versioned country-source intake only. A bundle is not a World, an OpeningSeed, a current economic fact, or authority to dispatch a worker.';

create table world_v2.country_candidate_artifact (
  bundle_id text not null references world_v2.country_candidate_bundle (bundle_id),
  artifact_path text not null check (artifact_path ~ '^[a-z0-9][a-z0-9_./-]+$'),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  content_utf8 text not null,
  primary key (bundle_id, artifact_path),
  check (content_sha256 = world_v2.authoritative_sha256(content_utf8))
);

comment on table world_v2.country_candidate_artifact is
  'Exact UTF-8 source bytes and SHA-256 for candidate JSON/CSV files; never a runtime economic posting.';

create table world_v2.country_candidate_profile (
  bundle_id text not null references world_v2.country_candidate_bundle (bundle_id),
  country_id text not null check (country_id ~ '^visual-territory-[0-9]{2}$'),
  source_record jsonb not null,
  primary key (bundle_id, country_id),
  check (source_record ->> 'countryId' = country_id),
  check (source_record -> 'activationAllowed' = 'false'::jsonb)
);

comment on table world_v2.country_candidate_profile is
  'Queryable 70-country planning rows copied from the hashed all_tables.json artifact; no World binding or authoritative opening state.';

create trigger country_candidate_bundle_immutable
before update or delete on world_v2.country_candidate_bundle
for each row execute function world_v2.reject_authoritative_history_mutation();

create trigger country_candidate_artifact_immutable
before update or delete on world_v2.country_candidate_artifact
for each row execute function world_v2.reject_authoritative_history_mutation();

create trigger country_candidate_profile_immutable
before update or delete on world_v2.country_candidate_profile
for each row execute function world_v2.reject_authoritative_history_mutation();

alter table world_v2.country_candidate_bundle enable row level security;
alter table world_v2.country_candidate_bundle force row level security;
alter table world_v2.country_candidate_artifact enable row level security;
alter table world_v2.country_candidate_artifact force row level security;
alter table world_v2.country_candidate_profile enable row level security;
alter table world_v2.country_candidate_profile force row level security;

revoke all on table world_v2.country_candidate_bundle from public;
revoke all on table world_v2.country_candidate_artifact from public;
revoke all on table world_v2.country_candidate_profile from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke usage on schema world_v2 from anon';
    execute 'revoke all on table world_v2.country_candidate_bundle from anon';
    execute 'revoke all on table world_v2.country_candidate_artifact from anon';
    execute 'revoke all on table world_v2.country_candidate_profile from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke usage on schema world_v2 from authenticated';
    execute 'revoke all on table world_v2.country_candidate_bundle from authenticated';
    execute 'revoke all on table world_v2.country_candidate_artifact from authenticated';
    execute 'revoke all on table world_v2.country_candidate_profile from authenticated';
  end if;
end;
$$;
