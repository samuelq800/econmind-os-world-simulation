-- PREPARATION_ONLY / UNREGISTERED / DEFAULT DENY. NOT a migration/publication.
-- No roles, caller registration, A privileges, live source, positive DML body.
create table world_v2.current_authorization_publication_checkpoint (
  world_id text not null references world_v2.world_head(world_id),
  auth_subject uuid not null,
  source_owner_ref text not null,
  source_registration_id text not null,
  source_record_ref text not null,
  source_schema_version text not null,
  source_sha256 text not null check (source_sha256 ~ '^sha256:[0-9a-f]{64}$'),
  source_revision text not null check (source_revision <> ''),
  predecessor_revision text,
  operation_id text not null,
  expected_world_version bigint not null check (expected_world_version >= 0),
  expected_before_fingerprint text not null check (expected_before_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  after_fingerprint text not null check (after_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  published_at_real timestamptz not null,
  primary key(world_id,auth_subject)
);
comment on table world_v2.current_authorization_publication_checkpoint is
  'Derived current publication metadata only; no authorization/Office/capability/active rows, no consumer authority, not complete history. Real source registration required.';
alter table world_v2.current_authorization_publication_checkpoint enable row level security;
alter table world_v2.current_authorization_publication_checkpoint force row level security;
revoke all on world_v2.current_authorization_publication_checkpoint from public;
-- Intentionally no policies/grants: not a product source or callable writer.

create function world_v2.apply_current_authorization_change(
  p_world_id text, p_source_record_ref text,
  p_expected_world_version bigint, p_expected_before_semantic_fingerprint text
) returns void
language plpgsql volatile security invoker
set search_path = pg_catalog, world_v2
as $$
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'AUTHORIZATION_READ_COMMITTED_REQUIRED' using errcode='55000';
  end if;
  if p_world_id is null or p_world_id !~ '^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'
    or length(p_world_id) > 256 or p_source_record_ref is null
    or length(p_source_record_ref) not between 1 and 256
    or p_expected_world_version is null or p_expected_world_version < 0
    or p_expected_before_semantic_fingerprint is null
    or p_expected_before_semantic_fingerprint !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'AUTHORIZATION_REQUEST_INVALID' using errcode='22023';
  end if;
  -- FIRST business row lock. No A/source/C lock or DML occurs before it.
  perform h.world_version from world_v2.world_head h
    where h.world_id=p_world_id for update;
  if not found then
    raise exception 'AUTHORIZATION_WORLD_HEAD_MISSING' using errcode='55000';
  end if;
  -- No real registered lookup/admin/cutoff packet exists. Do not accept JSON,
  -- a Boolean, SET ROLE/GUC, TEST_ONLY source, or a fallback granting function.
  raise exception 'AUTHORIZATION_SOURCE_NOT_REGISTERED' using errcode='55000';
end;
$$;
revoke all on function world_v2.apply_current_authorization_change(text,text,bigint,text) from public;
comment on function world_v2.apply_current_authorization_change(text,text,bigint,text) is
  'Unregistered H-first atomic refusal only. Not a positive publication implementation. No caller EXECUTE granted; original admission veto untouched.';
