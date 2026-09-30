-- Server-only read capability for the owner-selected, inactive source package.
-- This does not create a World, an OpeningSeed, a worker capability, or a
-- browser-accessible relation. A separately provisioned login may only SET
-- LOCAL ROLE to the group role inside the API's read-only transaction.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'world_v2_api_reader')
     or exists (select 1 from pg_roles where rolname = 'world_v2_api_login') then
    raise exception 'World V2 API reader roles must be absent before reviewed publication';
  end if;

  create role world_v2_api_reader
    nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  create role world_v2_api_login
    nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
end;
$$;

comment on role world_v2_api_reader is
  'Server-only group role with exact RLS-scoped read access to one inactive World V2 country-source artifact.';
comment on role world_v2_api_login is
  'Credentialless server login-role shell. Operations may separately provision LOGIN and a password; it must retain NOINHERIT and use SET LOCAL ROLE.';

grant world_v2_api_reader to world_v2_api_login;

revoke all privileges on schema world_v2 from world_v2_api_login;
revoke all privileges on table world_v2.country_candidate_bundle from world_v2_api_reader;
revoke all privileges on table world_v2.country_candidate_artifact from world_v2_api_reader;
revoke all privileges on table world_v2.country_candidate_profile from world_v2_api_reader;

grant usage on schema world_v2 to world_v2_api_reader;
grant select (bundle_id, package_manifest_sha256, source_status, activation_allowed)
  on table world_v2.country_candidate_bundle to world_v2_api_reader;
grant select (bundle_id, artifact_path, content_sha256, content_utf8)
  on table world_v2.country_candidate_artifact to world_v2_api_reader;

create policy country_candidate_bundle_selected_source_server_read
on world_v2.country_candidate_bundle
for select
to world_v2_api_reader
using (bundle_id = 'BALANCED_2026_09_28_V1');

create policy country_candidate_artifact_selected_source_server_read
on world_v2.country_candidate_artifact
for select
to world_v2_api_reader
using (
  bundle_id = 'BALANCED_2026_09_28_V1'
  and artifact_path = 'source/646174612f636f756e74726965732e6a736f6e'
);
