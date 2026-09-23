create table world_v2.narrow_transfer_proposal (
  world_id text not null references world_v2.world_head (world_id),
  proposal_id text not null check (
    proposal_id ~ '^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'
  ),
  command_id text not null,
  country_id text not null,
  command_fingerprint text not null check (
    command_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  policy_version text not null check (policy_version <> ''),
  threshold_policy_version text not null check (threshold_policy_version <> ''),
  required_offices jsonb not null check (
    jsonb_typeof(required_offices) = 'array'
    and jsonb_array_length(required_offices) > 0
  ),
  status text not null check (status in ('PENDING', 'APPROVED')),
  opened_at_real timestamptz not null,
  approved_at_real timestamptz,
  primary key (world_id, proposal_id),
  unique (world_id, command_id, country_id),
  unique (world_id, proposal_id, country_id),
  foreign key (world_id, command_id)
    references world_v2.command_submission (world_id, command_id),
  check (
    (status = 'PENDING' and approved_at_real is null)
    or (status = 'APPROVED' and approved_at_real is not null)
  )
);

comment on table world_v2.narrow_transfer_proposal is
  'V10.2 candidate-only, server-owned durable scope for the exact ADR-09 GRAIN / Buyer-Treasury-GCU approval fixture. The row binds one canonical Command fingerprint, country scope, threshold policy and complete Office set; it is not a browser authority or generic transfer workflow.';

create table world_v2.narrow_transfer_approval_signature (
  world_id text not null,
  proposal_id text not null,
  country_id text not null,
  office_id text not null check (office_id in ('TRADE', 'FINANCE')),
  actor_id text not null check (actor_id <> ''),
  auth_subject uuid not null,
  authorization_version text not null check (authorization_version <> ''),
  signed_at_real timestamptz not null,
  primary key (world_id, proposal_id, office_id),
  foreign key (world_id, proposal_id, country_id)
    references world_v2.narrow_transfer_proposal
      (world_id, proposal_id, country_id)
);

comment on table world_v2.narrow_transfer_approval_signature is
  'Append-only server-held Office signature evidence for the exact V10.2 narrow transfer proposal. Current authority must still be independently re-read inside the atomic commit transaction; a stored signature is never a standing credential.';

create function world_v2.validate_narrow_transfer_proposal_update()
returns trigger
language plpgsql
as $$
begin
  if new.world_id is distinct from old.world_id
     or new.proposal_id is distinct from old.proposal_id
     or new.command_id is distinct from old.command_id
     or new.country_id is distinct from old.country_id
     or new.command_fingerprint is distinct from old.command_fingerprint
     or new.policy_version is distinct from old.policy_version
     or new.threshold_policy_version is distinct from old.threshold_policy_version
     or new.required_offices is distinct from old.required_offices
     or new.opened_at_real is distinct from old.opened_at_real then
    raise exception 'narrow transfer proposal scope is immutable'
      using errcode = '55000';
  end if;
  if old.status = 'PENDING'
     and new.status = 'APPROVED'
     and old.approved_at_real is null
     and new.approved_at_real is not null then
    return new;
  end if;
  raise exception 'narrow transfer proposal may only transition PENDING to APPROVED once'
    using errcode = '55000';
end;
$$;

create trigger narrow_transfer_proposal_update_is_guarded
before update or delete on world_v2.narrow_transfer_proposal
for each row execute function world_v2.validate_narrow_transfer_proposal_update();

create trigger narrow_transfer_approval_signature_is_immutable
before update or delete on world_v2.narrow_transfer_approval_signature
for each row execute function world_v2.reject_authoritative_history_mutation();

alter table world_v2.narrow_transfer_proposal enable row level security;
alter table world_v2.narrow_transfer_proposal force row level security;
alter table world_v2.narrow_transfer_approval_signature enable row level security;
alter table world_v2.narrow_transfer_approval_signature force row level security;

revoke all on table world_v2.narrow_transfer_proposal from public;
revoke all on table world_v2.narrow_transfer_approval_signature from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke usage on schema world_v2 from anon';
    execute 'revoke all on table world_v2.narrow_transfer_proposal from anon';
    execute 'revoke all on table world_v2.narrow_transfer_approval_signature from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke usage on schema world_v2 from authenticated';
    execute 'revoke all on table world_v2.narrow_transfer_proposal from authenticated';
    execute 'revoke all on table world_v2.narrow_transfer_approval_signature from authenticated';
  end if;
end;
$$;
