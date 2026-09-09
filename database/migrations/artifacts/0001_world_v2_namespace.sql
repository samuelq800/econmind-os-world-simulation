create schema if not exists world_v2;

comment on schema world_v2 is
  'EconMind World V2 authoritative namespace; production publication requires the main-site release chain';

create table if not exists world_v2.schema_release (
  migration_id text primary key,
  artifact_sha256 text not null,
  source_repo_commit text not null,
  release_order integer not null unique check (release_order > 0),
  applied_at timestamptz not null default current_timestamp
);

comment on table world_v2.schema_release is
  'Append-only identity of reviewed World V2 migration artefacts';
