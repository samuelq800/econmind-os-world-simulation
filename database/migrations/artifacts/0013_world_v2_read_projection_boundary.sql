create table world_v2.projection_entitlement (
  world_id text not null references world_v2.world_head (world_id),
  auth_subject uuid not null,
  classification text not null
    check (classification in ('COUNTRY', 'OFFICE_PRIVATE', 'NEGOTIATION_PARTY', 'ADMIN')),
  scope_key text not null
    check (scope_key ~ '^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'),
  authorization_version text not null,
  active boolean not null default true,
  granted_at timestamptz not null,
  revoked_at timestamptz,
  primary key (world_id, auth_subject, classification, scope_key),
  check ((active and revoked_at is null) or (not active and revoked_at is not null))
);

comment on table world_v2.projection_entitlement is
  'Server-issued current read entitlement; never economic authority and never writable by browser roles';

create table world_v2.read_projection (
  world_id text not null references world_v2.world_head (world_id),
  classification text not null
    check (classification in ('PUBLIC', 'COUNTRY', 'OFFICE_PRIVATE', 'NEGOTIATION_PARTY', 'ADMIN')),
  scope_key text not null
    check (scope_key ~ '^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'),
  schema_version text not null check (schema_version = 'world-projection-read-v1'),
  world_version bigint not null check (world_version >= 0),
  event_sequence bigint not null check (event_sequence >= 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  generated_at timestamptz not null,
  primary key (world_id, classification, scope_key)
);

comment on table world_v2.read_projection is
  'Derived rebuildable read model bound to an authoritative WorldVersion and EventSequence watermark';

create index projection_entitlement_active_subject_idx
  on world_v2.projection_entitlement (auth_subject, world_id, classification, scope_key)
  where active;

create index read_projection_watermark_idx
  on world_v2.read_projection (world_id, world_version desc, event_sequence desc);

alter table world_v2.projection_entitlement enable row level security;
alter table world_v2.projection_entitlement force row level security;
alter table world_v2.read_projection enable row level security;
alter table world_v2.read_projection force row level security;

create policy projection_entitlement_self_read
on world_v2.projection_entitlement
for select
using (
  active
  and revoked_at is null
  and auth_subject::text = current_setting('request.jwt.claim.sub', true)
);

create policy read_projection_entitled_read
on world_v2.read_projection
for select
using (
  exists (
    select 1
    from world_v2.projection_entitlement entitlement
    where entitlement.world_id = read_projection.world_id
      and entitlement.classification = read_projection.classification
      and entitlement.scope_key = read_projection.scope_key
      and entitlement.active
      and entitlement.revoked_at is null
      and entitlement.auth_subject::text = current_setting('request.jwt.claim.sub', true)
  )
);

revoke all on table world_v2.projection_entitlement from public;
revoke all on table world_v2.read_projection from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke usage on schema world_v2 from anon';
    execute 'revoke all on table world_v2.projection_entitlement from anon';
    execute 'revoke all on table world_v2.read_projection from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke usage on schema world_v2 from authenticated';
    execute 'revoke all on table world_v2.projection_entitlement from authenticated';
    execute 'revoke all on table world_v2.read_projection from authenticated';
  end if;
end;
$$;
