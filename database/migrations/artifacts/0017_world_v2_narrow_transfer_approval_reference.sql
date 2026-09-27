-- Candidate only. No backfill: historical signatures are not automatically
-- converted into currently valid references. Runtime authorization is separate.
create table world_v2.narrow_transfer_approval_reference (
  world_id text not null,
  approval_ref text not null check (
    approval_ref ~ '^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'
  ),
  proposal_id text not null,
  buyer_country_id text not null,
  command_id text not null,
  command_fingerprint text not null check (
    command_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  office_id text not null default 'FINANCE' check (office_id = 'FINANCE'),
  finance_actor_id text not null,
  finance_auth_subject uuid not null,
  finance_authorization_version text not null,
  finance_signed_at_real timestamptz not null,
  bound_at_real timestamptz not null,
  primary key (world_id, approval_ref),
  unique (world_id, proposal_id),
  foreign key (world_id, command_id)
    references world_v2.command_submission (world_id, command_id),
  foreign key (world_id, proposal_id, buyer_country_id)
    references world_v2.narrow_transfer_proposal (world_id, proposal_id, country_id),
  foreign key (world_id, proposal_id, office_id)
    references world_v2.narrow_transfer_approval_signature (world_id, proposal_id, office_id),
  check (bound_at_real >= finance_signed_at_real)
);

comment on table world_v2.narrow_transfer_approval_reference is
  'Immutable server-owned lookup binding for an already durable, approved narrow Command. Not an approval credential, execution gate bypass or first-intake API. Consumers must match exact scope and re-read current authorization. No automatic legacy backfill.';

create function world_v2.validate_narrow_transfer_approval_reference()
returns trigger
language plpgsql
as $$
declare
  command_row world_v2.command_submission%rowtype;
  proposal_row world_v2.narrow_transfer_proposal%rowtype;
  signature_row world_v2.narrow_transfer_approval_signature%rowtype;
begin
  select * into command_row from world_v2.command_submission
    where world_id = new.world_id and command_id = new.command_id for update;
  select * into proposal_row from world_v2.narrow_transfer_proposal
    where world_id = new.world_id and proposal_id = new.proposal_id for update;
  select * into signature_row from world_v2.narrow_transfer_approval_signature
    where world_id = new.world_id and proposal_id = new.proposal_id
      and office_id = 'FINANCE' for update;
  if command_row.command_id is null
     or proposal_row.proposal_id is null
     or signature_row.proposal_id is null
     or command_row.command_type is distinct from 'CORE_GOODS_TRANSFER_V1'
     or command_row.command_fingerprint is distinct from new.command_fingerprint
     or (command_row.canonical_payload::jsonb ->> 'buyerCountryId') is distinct from new.buyer_country_id
     or (command_row.canonical_payload::jsonb ->> 'paymentSource') is distinct from 'BUYER_TREASURY_GCU'
     or (command_row.canonical_payload::jsonb ->> 'expiresAtReal') is null
     or new.proposal_id is distinct from ('BUYER_APPROVAL_' || new.command_id)
     or proposal_row.command_id is distinct from new.command_id
     or proposal_row.command_fingerprint is distinct from new.command_fingerprint
     or proposal_row.country_id is distinct from new.buyer_country_id
     or proposal_row.status is distinct from 'APPROVED'
     or proposal_row.policy_version is distinct from 'V10_TREASURY_GCU_V1'
     or proposal_row.threshold_policy_version is distinct from 'V10_TREASURY_GCU_THRESHOLD_V1'
     or proposal_row.required_offices is distinct from '["TRADE","FINANCE"]'::jsonb
     or signature_row.country_id is distinct from new.buyer_country_id
     or signature_row.actor_id is distinct from new.finance_actor_id
     or signature_row.auth_subject is distinct from new.finance_auth_subject
     or signature_row.authorization_version is distinct from new.finance_authorization_version
     or signature_row.signed_at_real is distinct from new.finance_signed_at_real
     or new.bound_at_real < proposal_row.approved_at_real
     or new.bound_at_real >= (command_row.canonical_payload::jsonb ->> 'expiresAtReal')::timestamptz then
    raise exception 'approval reference must bind the exact approved durable buyer Command and Finance signature'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger narrow_transfer_approval_reference_scope_is_verified
before insert on world_v2.narrow_transfer_approval_reference
for each row execute function world_v2.validate_narrow_transfer_approval_reference();

create trigger narrow_transfer_approval_reference_is_immutable
before update or delete on world_v2.narrow_transfer_approval_reference
for each row execute function world_v2.reject_authoritative_history_mutation();

create trigger narrow_transfer_approval_reference_cannot_truncate
before truncate on world_v2.narrow_transfer_approval_reference
for each statement execute function world_v2.reject_authoritative_history_mutation();

alter table world_v2.narrow_transfer_approval_reference enable row level security;
alter table world_v2.narrow_transfer_approval_reference force row level security;
revoke all on table world_v2.narrow_transfer_approval_reference from public;
revoke all on function world_v2.validate_narrow_transfer_approval_reference() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table world_v2.narrow_transfer_approval_reference from anon';
    execute 'revoke all on function world_v2.validate_narrow_transfer_approval_reference() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table world_v2.narrow_transfer_approval_reference from authenticated';
    execute 'revoke all on function world_v2.validate_narrow_transfer_approval_reference() from authenticated';
  end if;
end;
$$;
