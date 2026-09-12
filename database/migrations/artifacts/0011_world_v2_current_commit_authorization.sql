create table world_v2.current_commit_authorization (
  world_id text not null references world_v2.world_head (world_id),
  auth_subject uuid not null,
  country_id text not null,
  office_id text not null,
  capability text not null,
  team_id text not null,
  authorization_version text not null check (authorization_version <> ''),
  active boolean not null,
  refreshed_at_real timestamptz not null,
  primary key (world_id, auth_subject, country_id, office_id, capability)
);

comment on table world_v2.current_commit_authorization is
  'Server-owned current identity, membership, Office, capability and authorization-revision projection. V09 reads it only inside the authoritative transaction; absent or inactive evidence denies commit.';

comment on column world_v2.current_commit_authorization.active is
  'False means identity, membership, Office assignment or capability is no longer currently authorized. The Worker never treats intake evidence as a fallback.';
