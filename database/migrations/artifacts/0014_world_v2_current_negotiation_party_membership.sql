create table world_v2.current_negotiation_party_membership (
  world_id text not null references world_v2.world_head (world_id),
  party_id text not null
    check (party_id ~ '^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'),
  auth_subject uuid not null,
  country_id text not null,
  office_id text not null,
  authorization_version text not null check (authorization_version <> ''),
  active boolean not null,
  refreshed_at_real timestamptz not null,
  primary key (world_id, party_id, auth_subject, country_id, office_id)
);

comment on table world_v2.current_negotiation_party_membership is
  'Initially empty, server-owned current named-party membership source for derived read entitlements and projections. It deliberately has no school field or school-isolation rule; a future authorized server workflow may define cross-school party composition.';

comment on column world_v2.current_negotiation_party_membership.active is
  'False means this subject no longer has current membership of this named party and must not receive a party projection entitlement.';

create index current_negotiation_party_membership_active_idx
  on world_v2.current_negotiation_party_membership
    (world_id, party_id, auth_subject, country_id, office_id)
  where active;

alter table world_v2.current_negotiation_party_membership enable row level security;
alter table world_v2.current_negotiation_party_membership force row level security;

revoke all on table world_v2.current_negotiation_party_membership from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke usage on schema world_v2 from anon';
    execute 'revoke all on table world_v2.current_negotiation_party_membership from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke usage on schema world_v2 from authenticated';
    execute 'revoke all on table world_v2.current_negotiation_party_membership from authenticated';
  end if;
end;
$$;
