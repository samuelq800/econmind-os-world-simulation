create table world_v2.opening_seed (
  world_id text primary key references world_v2.world_head (world_id),
  seed_id text not null unique check (
    seed_id ~ '^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'
  ),
  opening_world_version bigint not null check (opening_world_version = 0),
  replay_binding text not null check (replay_binding <> ''),
  canonical_payload text not null check (canonical_payload <> ''),
  seed_fingerprint text not null check (
    seed_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  bootstrapped_at_real timestamptz not null,
  unique (world_id, seed_fingerprint)
);

comment on table world_v2.opening_seed is
  'V10.5 candidate-only immutable WorldVersion-zero opening lineage. It retains exact canonical seed intent plus replay binding and fingerprint for server-side replay; it is never a browser balance input, current economic authority, fixture store, or shared-Supabase publication action.';

create function world_v2.validate_opening_seed_insert()
returns trigger
language plpgsql
as $$
declare
  head_world_version bigint;
  head_event_sequence bigint;
begin
  select world_version, event_sequence
    into head_world_version, head_event_sequence
    from world_v2.world_head
    where world_id = new.world_id
    for share;
  if not found
     or head_world_version <> 0
     or head_event_sequence <> 0 then
    raise exception 'Opening seed can only be bootstrapped before World history exists'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

comment on function world_v2.validate_opening_seed_insert() is
  'Rejects post-history or replacement opening-state creation; the worker independently rehydrates and validates the canonical seed before use.';

create trigger opening_seed_insert_is_world_zero_only
before insert on world_v2.opening_seed
for each row execute function world_v2.validate_opening_seed_insert();

create trigger opening_seed_is_immutable
before update or delete on world_v2.opening_seed
for each row execute function world_v2.reject_authoritative_history_mutation();

alter table world_v2.opening_seed enable row level security;
alter table world_v2.opening_seed force row level security;

revoke all on table world_v2.opening_seed from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke usage on schema world_v2 from anon';
    execute 'revoke all on table world_v2.opening_seed from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke usage on schema world_v2 from authenticated';
    execute 'revoke all on table world_v2.opening_seed from authenticated';
  end if;
end;
$$;
