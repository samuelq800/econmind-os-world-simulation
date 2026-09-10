create table world_v2.world_writer_lease (
  world_id text primary key references world_v2.world_head (world_id),
  holder_id text not null
    check (holder_id ~ '^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$'),
  fencing_token bigint not null check (fencing_token > 0),
  acquired_at_real timestamptz not null,
  renewed_at_real timestamptz not null,
  lease_expires_at_real timestamptz not null,
  check (acquired_at_real <= renewed_at_real),
  check (renewed_at_real < lease_expires_at_real)
);

comment on table world_v2.world_writer_lease is
  'V09.1 operational per-World lease and monotonically increasing fencing state; it is not SimTime or replay history';

create function world_v2.validate_world_writer_lease_transition()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.fencing_token <> 1 then
      raise exception 'initial World writer lease must begin at fencing token 1'
        using errcode = '23514';
    end if;
    if new.acquired_at_real <> new.renewed_at_real then
      raise exception 'initial World writer lease must have equal acquired and renewed timestamps'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.world_id is distinct from old.world_id then
    raise exception 'World writer lease identity is immutable'
      using errcode = '55000';
  end if;

  if new.fencing_token = old.fencing_token then
    if new.holder_id is distinct from old.holder_id
       or new.acquired_at_real is distinct from old.acquired_at_real then
      raise exception 'lease renewal cannot replace the current holder or acquisition'
        using errcode = '55000';
    end if;
    if new.renewed_at_real < old.renewed_at_real
       or new.lease_expires_at_real <= old.lease_expires_at_real then
      raise exception 'lease renewal must advance time and extend expiry monotonically'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if new.fencing_token = old.fencing_token + 1 then
    if new.acquired_at_real < old.lease_expires_at_real
       or new.renewed_at_real <> new.acquired_at_real then
      raise exception 'lease takeover requires expiry and a new acquisition timestamp'
        using errcode = '55000';
    end if;
    return new;
  end if;

  raise exception 'World writer fencing token must be unchanged for renewal or increase by one for takeover'
    using errcode = '55000';
end;
$$;

create trigger world_writer_lease_transition_is_guarded
before insert or update on world_v2.world_writer_lease
for each row execute function world_v2.validate_world_writer_lease_transition();

comment on trigger world_writer_lease_transition_is_guarded on world_v2.world_writer_lease is
  'Rejects token reuse, token regression and non-expired takeover; V09.2 must still call the transaction guard below';

create function world_v2.acquire_world_writer_lease(
  p_world_id text,
  p_holder_id text,
  p_observed_at_real timestamptz,
  p_lease_duration_milliseconds bigint
)
returns table (
  world_id text,
  holder_id text,
  fencing_token bigint,
  acquired_at_real timestamptz,
  renewed_at_real timestamptz,
  lease_expires_at_real timestamptz,
  acquisition_kind text
)
language plpgsql
as $$
declare
  candidate_expires_at_real timestamptz;
  locked_lease world_v2.world_writer_lease%rowtype;
begin
  if p_world_id is null
     or p_world_id !~ '^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$' then
    raise exception 'World writer lease requires a canonical World ID'
      using errcode = '23514';
  end if;
  if p_holder_id is null
     or p_holder_id !~ '^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$' then
    raise exception 'World writer lease requires a canonical Worker ID'
      using errcode = '23514';
  end if;
  if p_observed_at_real is null or p_lease_duration_milliseconds is null
     or p_lease_duration_milliseconds <= 0 then
    raise exception 'World writer lease requires explicit positive operational duration'
      using errcode = '23514';
  end if;

  candidate_expires_at_real :=
    p_observed_at_real + p_lease_duration_milliseconds * interval '1 millisecond';

  insert into world_v2.world_writer_lease (
    world_id,
    holder_id,
    fencing_token,
    acquired_at_real,
    renewed_at_real,
    lease_expires_at_real
  ) values (
    p_world_id,
    p_holder_id,
    1,
    p_observed_at_real,
    p_observed_at_real,
    candidate_expires_at_real
  )
  on conflict on constraint world_writer_lease_pkey do nothing
  returning * into locked_lease;

  if found then
    return query
      select
        locked_lease.world_id,
        locked_lease.holder_id,
        locked_lease.fencing_token,
        locked_lease.acquired_at_real,
        locked_lease.renewed_at_real,
        locked_lease.lease_expires_at_real,
        'ACQUIRED'::text;
    return;
  end if;

  select *
    into locked_lease
    from world_v2.world_writer_lease
    where world_writer_lease.world_id = p_world_id
    for update;

  if not found then
    raise exception 'World writer lease vanished during acquisition'
      using errcode = '55000';
  end if;

  if locked_lease.holder_id = p_holder_id
     and locked_lease.lease_expires_at_real > p_observed_at_real then
    if candidate_expires_at_real <= locked_lease.lease_expires_at_real then
      raise exception 'lease renewal must extend the active expiry monotonically'
        using errcode = '23514';
    end if;
    if p_observed_at_real < locked_lease.renewed_at_real then
      raise exception 'lease renewal cannot move operational time backward'
        using errcode = '23514';
    end if;
    update world_v2.world_writer_lease
      set renewed_at_real = p_observed_at_real,
          lease_expires_at_real = candidate_expires_at_real
      where world_writer_lease.world_id = p_world_id
      returning * into locked_lease;
    return query
      select
        locked_lease.world_id,
        locked_lease.holder_id,
        locked_lease.fencing_token,
        locked_lease.acquired_at_real,
        locked_lease.renewed_at_real,
        locked_lease.lease_expires_at_real,
        'RENEWED'::text;
    return;
  end if;

  if locked_lease.lease_expires_at_real > p_observed_at_real then
    raise exception 'WORLD_WRITER_LEASE_HELD'
      using errcode = '55000';
  end if;
  if locked_lease.fencing_token = 9223372036854775807 then
    raise exception 'World writer fencing token is exhausted'
      using errcode = '22003';
  end if;

  update world_v2.world_writer_lease
    set holder_id = p_holder_id,
        fencing_token = locked_lease.fencing_token + 1,
        acquired_at_real = p_observed_at_real,
        renewed_at_real = p_observed_at_real,
        lease_expires_at_real = candidate_expires_at_real
    where world_writer_lease.world_id = p_world_id
    returning * into locked_lease;
  return query
    select
      locked_lease.world_id,
      locked_lease.holder_id,
      locked_lease.fencing_token,
      locked_lease.acquired_at_real,
      locked_lease.renewed_at_real,
      locked_lease.lease_expires_at_real,
      'TAKEN_OVER'::text;
end;
$$;

comment on function world_v2.acquire_world_writer_lease(text, text, timestamptz, bigint) is
  'Atomically acquires, renews or takes over the operational lease using explicit wall time; no SimTime or economic fact is changed';

create function world_v2.assert_world_writer_commit_guard(
  p_world_id text,
  p_holder_id text,
  p_fencing_token bigint,
  p_expected_world_version bigint,
  p_observed_at_real timestamptz
)
returns table (
  world_version bigint,
  event_sequence bigint
)
language plpgsql
as $$
declare
  locked_lease world_v2.world_writer_lease%rowtype;
  locked_head world_v2.world_head%rowtype;
begin
  if p_world_id is null
     or p_holder_id is null
     or p_fencing_token is null
     or p_fencing_token <= 0
     or p_expected_world_version is null
     or p_expected_world_version < 0
     or p_observed_at_real is null then
    raise exception 'World writer commit guard requires complete canonical inputs'
      using errcode = '23514';
  end if;

  select *
    into locked_lease
    from world_v2.world_writer_lease
    where world_writer_lease.world_id = p_world_id
    for update;
  if not found then
    raise exception 'WORLD_WRITER_LEASE_MISSING'
      using errcode = '55000';
  end if;
  if locked_lease.lease_expires_at_real <= p_observed_at_real then
    raise exception 'WORLD_WRITER_LEASE_EXPIRED'
      using errcode = '55000';
  end if;
  if locked_lease.holder_id <> p_holder_id
     or locked_lease.fencing_token <> p_fencing_token then
    raise exception 'WORLD_WRITER_FENCE_STALE'
      using errcode = '55000';
  end if;

  select *
    into locked_head
    from world_v2.world_head
    where world_head.world_id = p_world_id
    for update;
  if not found then
    raise exception 'WORLD_HEAD_MISSING'
      using errcode = '23503';
  end if;
  if locked_head.world_version <> p_expected_world_version then
    raise exception 'WORLD_VERSION_MISMATCH'
      using errcode = '55000';
  end if;

  return query select locked_head.world_version, locked_head.event_sequence;
end;
$$;

comment on function world_v2.assert_world_writer_commit_guard(text, text, bigint, bigint, timestamptz) is
  'Locks lease then World head and rejects stale holder, fence, expiry or WorldVersion before V09.2 atomic economic commit';
