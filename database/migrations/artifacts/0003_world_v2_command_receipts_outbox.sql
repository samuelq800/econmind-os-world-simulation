create table world_v2.command_queue (
  world_id text not null,
  command_id text not null,
  authority_kind text not null
    check (authority_kind in ('DISCRETIONARY_USER', 'VERSIONED_AUTOMATIC')),
  queue_state text not null default 'PENDING'
    check (queue_state in ('PENDING', 'CLAIMED', 'FINALIZED')),
  priority_rank integer not null default 0 check (priority_rank >= 0),
  available_at_sim_time bigint not null check (available_at_sim_time >= 0),
  attempt_count bigint not null default 0 check (attempt_count >= 0),
  claimed_by text,
  claimed_at_real timestamptz,
  finalized_at_real timestamptz,
  primary key (world_id, command_id),
  foreign key (world_id, command_id)
    references world_v2.command_submission (world_id, command_id),
  check (
    (queue_state = 'PENDING' and claimed_by is null and claimed_at_real is null and finalized_at_real is null)
    or (queue_state = 'CLAIMED' and claimed_by is not null and claimed_at_real is not null and finalized_at_real is null)
    or (queue_state = 'FINALIZED' and finalized_at_real is not null)
  )
);

comment on table world_v2.command_queue is
  'Operational V07.2 queue state; a claim is not commit authority or a V09 fencing token';

create table world_v2.command_receipt (
  world_id text not null,
  command_id text not null,
  schema_version text not null check (schema_version = 'command-receipt-v1'),
  command_fingerprint text not null check (command_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  outcome text not null
    check (outcome in ('COMMITTED', 'REJECTED', 'AUTHORIZATION_REVOKED')),
  reason_code text,
  committed_world_version bigint check (committed_world_version > 0),
  sim_time bigint not null check (sim_time >= 0),
  event_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(event_ids) = 'array'),
  recorded_at_real timestamptz not null,
  primary key (world_id, command_id),
  foreign key (world_id, command_id)
    references world_v2.command_submission (world_id, command_id),
  check (
    (
      outcome = 'COMMITTED'
      and reason_code is null
      and committed_world_version is not null
      and jsonb_array_length(event_ids) > 0
    )
    or (
      outcome in ('REJECTED', 'AUTHORIZATION_REVOKED')
      and reason_code ~ '^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$'
      and committed_world_version is null
      and jsonb_array_length(event_ids) = 0
    )
  )
);

comment on table world_v2.command_receipt is
  'Immutable final Command outcome; acceptance remains the immutable command_submission fact';

create table world_v2.event_consumer_receipt (
  world_id text not null,
  event_id text not null,
  consumer_id text not null,
  schema_version text not null check (schema_version = 'consumer-receipt-v1'),
  delivery_state text not null
    check (delivery_state in ('PROCESSING', 'DELIVERED', 'FAILED')),
  attempt_count bigint not null default 1 check (attempt_count > 0),
  last_attempt_at_real timestamptz not null,
  primary key (world_id, event_id, consumer_id),
  foreign key (world_id, event_id)
    references world_v2.authoritative_event (world_id, event_id)
);

comment on table world_v2.event_consumer_receipt is
  'Consumer-owned operational delivery state; never authoritative Event history';

create table world_v2.notification_outbox (
  world_id text not null,
  outbox_message_id text not null,
  command_id text not null,
  event_id text,
  schema_version text not null check (schema_version = 'outbox-v1'),
  canonical_payload text not null,
  payload_sha256 text not null check (payload_sha256 ~ '^sha256:[0-9a-f]{64}$'),
  available_at_sim_time bigint not null check (available_at_sim_time >= 0),
  delivery_state text not null default 'PENDING'
    check (delivery_state in ('PENDING', 'DELIVERED')),
  attempt_count bigint not null default 0 check (attempt_count >= 0),
  last_attempt_at_real timestamptz,
  delivered_at_real timestamptz,
  primary key (world_id, outbox_message_id),
  foreign key (world_id, command_id)
    references world_v2.command_receipt (world_id, command_id),
  foreign key (world_id, event_id)
    references world_v2.authoritative_event (world_id, event_id),
  check (
    (delivery_state = 'PENDING' and delivered_at_real is null)
    or (delivery_state = 'DELIVERED' and delivered_at_real is not null)
  )
);

comment on table world_v2.notification_outbox is
  'At-least-once notification delivery state; retries cannot execute economic work';

create trigger command_receipt_is_immutable
before update or delete on world_v2.command_receipt
for each row execute function world_v2.reject_authoritative_history_mutation();

create function world_v2.validate_command_queue_transition()
returns trigger
language plpgsql
as $$
begin
  if new.world_id is distinct from old.world_id
     or new.command_id is distinct from old.command_id
     or new.authority_kind is distinct from old.authority_kind
     or new.priority_rank is distinct from old.priority_rank
     or new.available_at_sim_time is distinct from old.available_at_sim_time then
    raise exception 'command queue identity and authority are immutable'
      using errcode = '55000';
  end if;
  if not (
    (old.queue_state = 'PENDING' and new.queue_state = 'CLAIMED')
    or (old.queue_state = 'CLAIMED' and new.queue_state in ('PENDING', 'FINALIZED'))
    or (old.queue_state = 'FINALIZED' and new.queue_state = 'FINALIZED')
  ) then
    raise exception 'invalid command queue transition'
      using errcode = '55000';
  end if;
  if new.attempt_count < old.attempt_count then
    raise exception 'command queue attempt count cannot decrease'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger command_queue_transition_is_guarded
before update on world_v2.command_queue
for each row execute function world_v2.validate_command_queue_transition();

create function world_v2.validate_consumer_receipt_update()
returns trigger
language plpgsql
as $$
begin
  if new.world_id is distinct from old.world_id
     or new.event_id is distinct from old.event_id
     or new.consumer_id is distinct from old.consumer_id
     or new.schema_version is distinct from old.schema_version then
    raise exception 'consumer receipt identity is immutable'
      using errcode = '55000';
  end if;
  if old.delivery_state = 'DELIVERED' and new.delivery_state <> 'DELIVERED' then
    raise exception 'delivered consumer receipt cannot be reopened'
      using errcode = '55000';
  end if;
  if new.attempt_count < old.attempt_count then
    raise exception 'consumer receipt attempt count cannot decrease'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger consumer_receipt_update_is_guarded
before update on world_v2.event_consumer_receipt
for each row execute function world_v2.validate_consumer_receipt_update();

create function world_v2.validate_outbox_update()
returns trigger
language plpgsql
as $$
begin
  if new.world_id is distinct from old.world_id
     or new.outbox_message_id is distinct from old.outbox_message_id
     or new.command_id is distinct from old.command_id
     or new.event_id is distinct from old.event_id
     or new.schema_version is distinct from old.schema_version
     or new.canonical_payload is distinct from old.canonical_payload
     or new.payload_sha256 is distinct from old.payload_sha256
     or new.available_at_sim_time is distinct from old.available_at_sim_time then
    raise exception 'outbox authoritative references and payload are immutable'
      using errcode = '55000';
  end if;
  if old.delivery_state = 'DELIVERED' and new.delivery_state <> 'DELIVERED' then
    raise exception 'delivered outbox item cannot be reopened'
      using errcode = '55000';
  end if;
  if new.attempt_count < old.attempt_count then
    raise exception 'outbox attempt count cannot decrease'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger outbox_update_is_guarded
before update on world_v2.notification_outbox
for each row execute function world_v2.validate_outbox_update();
