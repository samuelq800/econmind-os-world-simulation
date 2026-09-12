create table world_v2.inventory_posting (
  world_id text not null,
  posting_id text not null,
  causation_command_id text not null,
  world_version_before bigint not null check (world_version_before >= 0),
  world_version_after bigint not null check (world_version_after = world_version_before + 1),
  sim_time bigint not null check (sim_time >= 0),
  event_ids jsonb not null check (
    jsonb_typeof(event_ids) = 'array'
    and jsonb_array_length(event_ids) > 0
  ),
  transition_binding text not null,
  operation text not null check (
    operation in ('RESERVATION', 'RELEASE', 'SHIPMENT', 'DELIVERY')
  ),
  canonical_payload text not null,
  posting_fingerprint text not null check (
    posting_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  primary key (world_id, posting_id),
  foreign key (world_id, causation_command_id)
    references world_v2.command_submission (world_id, command_id)
);

comment on table world_v2.inventory_posting is
  'Append-only V08 Inventory Posting facts persisted inside the V09.2 authoritative transaction; canonical payload retains exact account and quantity evidence';

create table world_v2.financial_posting_batch (
  world_id text not null,
  batch_id text not null,
  causation_command_id text not null,
  world_version_before bigint not null check (world_version_before >= 0),
  world_version_after bigint not null check (world_version_after = world_version_before + 1),
  sim_time bigint not null check (sim_time >= 0),
  event_ids jsonb not null check (
    jsonb_typeof(event_ids) = 'array'
    and jsonb_array_length(event_ids) > 0
  ),
  transition_binding text not null,
  settlement_currency text not null check (
    settlement_currency ~ '^[A-Z]{3}$'
  ),
  canonical_payload text not null,
  batch_fingerprint text not null check (
    batch_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  primary key (world_id, batch_id),
  foreign key (world_id, causation_command_id)
    references world_v2.command_submission (world_id, command_id)
);

comment on table world_v2.financial_posting_batch is
  'Append-only V08 balanced Financial Posting batches persisted inside the V09.2 authoritative transaction; canonical payload retains exact account, amount and currency evidence';

create function world_v2.validate_authoritative_posting_evidence()
returns trigger
language plpgsql
as $$
declare
  binding jsonb;
  submitted_command_fingerprint text;
  submitted_expected_world_version bigint;
  submitted_idempotency_key text;
  expected_event_ids jsonb;
  expected_event_fingerprints jsonb;
  event_sim_time_min bigint;
  event_sim_time_max bigint;
  non_string_event_count bigint;
  distinct_event_count bigint;
begin
  begin
    binding := new.transition_binding::jsonb;
  exception when others then
    raise exception 'Posting transition binding must be canonical JSON'
      using errcode = '23514';
  end;

  if jsonb_typeof(binding) <> 'object'
     or binding->>'schemaVersion' <> 'authoritative-transition-binding-v1'
     or binding->>'worldId' is distinct from new.world_id
     or binding->>'transitionId' is distinct from new.causation_command_id
     or binding->>'commandId' is distinct from new.causation_command_id
     or binding->>'worldVersionBefore' is distinct from new.world_version_before::text
     or binding->>'worldVersionAfter' is distinct from new.world_version_after::text
     or binding->>'simTime' is distinct from new.sim_time::text
     or binding->'eventIds' is distinct from new.event_ids then
    raise exception 'Posting transition binding does not match the authoritative transition columns'
      using errcode = '23514';
  end if;

  select count(*)
    into non_string_event_count
    from jsonb_array_elements(new.event_ids) as items(item)
    where jsonb_typeof(items.item) <> 'string';
  select count(distinct ids.event_id)
    into distinct_event_count
    from jsonb_array_elements_text(new.event_ids) as ids(event_id);
  if non_string_event_count <> 0
     or distinct_event_count <> jsonb_array_length(new.event_ids) then
    raise exception 'Posting Event IDs must be unique canonical strings'
      using errcode = '23514';
  end if;

  select command_fingerprint, expected_world_version, idempotency_key
    into submitted_command_fingerprint,
         submitted_expected_world_version,
         submitted_idempotency_key
    from world_v2.command_submission
    where world_id = new.world_id
      and command_id = new.causation_command_id;
  if not found
     or binding->>'commandFingerprint' is distinct from submitted_command_fingerprint
     or binding->>'expectedWorldVersion' is distinct from submitted_expected_world_version::text
     or binding->>'idempotencyKey' is distinct from submitted_idempotency_key then
    raise exception 'Posting transition binding does not match durable Command identity'
      using errcode = '23503';
  end if;

  select coalesce(
           jsonb_agg(event.event_id order by event.event_sequence),
           '[]'::jsonb
         ),
         coalesce(
           jsonb_agg(event.event_fingerprint order by event.event_sequence),
           '[]'::jsonb
         ),
         min(event.sim_time),
         max(event.sim_time)
    into expected_event_ids,
         expected_event_fingerprints,
         event_sim_time_min,
         event_sim_time_max
    from world_v2.authoritative_event event
    where event.world_id = new.world_id
      and event.causation_command_id = new.causation_command_id
      and event.world_version = new.world_version_after;

  if expected_event_ids is distinct from new.event_ids
     or binding->'eventFingerprints' is distinct from expected_event_fingerprints
     or event_sim_time_min is distinct from new.sim_time
     or event_sim_time_max is distinct from new.sim_time then
    raise exception 'Posting must bind the complete ordered authoritative Event set and SimTime'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function world_v2.validate_authoritative_posting_evidence() is
  'Binds every V08 Posting to durable canonical Command evidence and the complete ordered Event set before V09.2 final receipt insertion';

create trigger inventory_posting_evidence_is_bound
before insert on world_v2.inventory_posting
for each row execute function world_v2.validate_authoritative_posting_evidence();

create trigger financial_posting_evidence_is_bound
before insert on world_v2.financial_posting_batch
for each row execute function world_v2.validate_authoritative_posting_evidence();

create trigger inventory_posting_is_immutable
before update or delete on world_v2.inventory_posting
for each row execute function world_v2.reject_authoritative_history_mutation();

create trigger financial_posting_batch_is_immutable
before update or delete on world_v2.financial_posting_batch
for each row execute function world_v2.reject_authoritative_history_mutation();

create table world_v2.authoritative_commit_authorization (
  world_id text not null,
  command_id text not null,
  authority_kind text not null check (
    authority_kind in ('DISCRETIONARY_USER', 'VERSIONED_AUTOMATIC')
  ),
  auth_subject uuid,
  actor_id text,
  country_id text,
  office_id text,
  capability text,
  team_id text,
  authorization_version text,
  committed_at_real timestamptz not null,
  primary key (world_id, command_id),
  foreign key (world_id, command_id)
    references world_v2.command_submission (world_id, command_id),
  check (
    (
      authority_kind = 'DISCRETIONARY_USER'
      and auth_subject is not null
      and actor_id is not null
      and country_id is not null
      and office_id is not null
      and capability is not null
      and team_id is not null
      and authorization_version is not null
    )
    or (
      authority_kind = 'VERSIONED_AUTOMATIC'
      and auth_subject is null
      and actor_id is null
      and country_id is null
      and office_id is null
      and capability is null
      and team_id is null
      and authorization_version is null
    )
  )
);

comment on table world_v2.authoritative_commit_authorization is
  'Immutable ADR-20 commit-cutoff authorization audit; discretionary rows bind the current authorization revision, while versioned automatic work has no user capability token';

create trigger authoritative_commit_authorization_is_immutable
before update or delete on world_v2.authoritative_commit_authorization
for each row execute function world_v2.reject_authoritative_history_mutation();

create table world_v2.current_materialization (
  world_id text not null,
  materialization_key text not null check (
    materialization_key ~ '^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$'
  ),
  world_version bigint not null check (world_version > 0),
  source_command_id text not null,
  canonical_payload text not null,
  payload_sha256 text not null check (
    payload_sha256 ~ '^sha256:[0-9a-f]{64}$'
  ),
  primary key (world_id, materialization_key),
  foreign key (world_id, source_command_id)
    references world_v2.command_receipt (world_id, command_id)
);

comment on table world_v2.current_materialization is
  'Replaceable current-state projection with an authoritative WorldVersion watermark; Events and Postings remain the sole replay lineage';

create function world_v2.validate_current_materialization_update()
returns trigger
language plpgsql
as $$
begin
  if new.world_id is distinct from old.world_id
     or new.materialization_key is distinct from old.materialization_key then
    raise exception 'Current materialization identity is immutable'
      using errcode = '55000';
  end if;
  if new.world_version <= old.world_version then
    raise exception 'Current materialization WorldVersion must advance'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger current_materialization_update_is_guarded
before update on world_v2.current_materialization
for each row execute function world_v2.validate_current_materialization_update();

create trigger current_materialization_delete_is_rejected
before delete on world_v2.current_materialization
for each row execute function world_v2.reject_authoritative_history_mutation();
