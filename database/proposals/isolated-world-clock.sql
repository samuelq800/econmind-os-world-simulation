-- UNREGISTERED, UNNUMBERED P1/P2 ISOLATED PROPOSAL. No roles/grants/caller.
-- Real construction stays default-denied. Fixture DML is NOT publisher non-bypass.
create table world_v2.isolated_clock_input (
  world_id text not null references world_v2.world_head(world_id),
  sequence bigint not null check (sequence > 0),
  operation_id text not null check (operation_id ~ '^[A-Z][A-Z0-9_-]{0,255}$'),
  record_hash text not null check (record_hash ~ '^[0-9a-f]{64}$'),
  original_bytes text not null check (octet_length(original_bytes) <= 262144),
  primary key (world_id, sequence),
  unique (world_id, operation_id),
  unique (world_id, record_hash),
  check (world_id ~ '^CLOCK_ISOLATED_[A-Z0-9]+([_-][A-Z0-9]+)*$')
);
create table world_v2.isolated_clock_head (
  world_id text primary key references world_v2.world_head(world_id),
  clock_revision bigint not null check (clock_revision > 0),
  record_hash text not null,
  state_bytes text not null check (octet_length(state_bytes) <= 262144),
  anchor_real_ms bigint not null check (anchor_real_ms >= 0),
  binding_bytes text not null check (octet_length(binding_bytes) <= 262144),
  foreign key (world_id,clock_revision) references world_v2.isolated_clock_input(world_id,sequence),
  foreign key (world_id,record_hash) references world_v2.isolated_clock_input(world_id,record_hash),
  check (world_id ~ '^CLOCK_ISOLATED_[A-Z0-9]+([_-][A-Z0-9]+)*$')
);
create function world_v2.reject_isolated_clock_input_mutation() returns trigger
language plpgsql security invoker set search_path=pg_catalog,world_v2 as $$
begin
  raise exception 'ISOLATED_CLOCK_INPUT_IS_IMMUTABLE' using errcode='55000';
end;
$$;
create trigger isolated_clock_input_append_only before update or delete
on world_v2.isolated_clock_input for each row
execute function world_v2.reject_isolated_clock_input_mutation();
alter table world_v2.isolated_clock_input enable row level security;
alter table world_v2.isolated_clock_input force row level security;
alter table world_v2.isolated_clock_head enable row level security;
alter table world_v2.isolated_clock_head force row level security;
revoke all on world_v2.isolated_clock_input,world_v2.isolated_clock_head from public;
revoke all on function world_v2.reject_isolated_clock_input_mutation() from public;
-- No positive publication function, real source table, grants, manifest or registration.
