-- PREPARATION_ONLY_NOT_V09_2_STARTED.
-- Owned-disposable-fixture artifact only; NOT admitted to the migration chain.
-- Requires the existing world_v2 world_head and authoritative_sha256 functions.
create table world_v2.gov01_control_catalog (
  singleton boolean primary key check (singleton),
  store_identity text not null default gen_random_uuid()::text,
  schema_version text not null check (schema_version = 'GOV01_NATIVE_CONTROL_V1')
);
insert into world_v2.gov01_control_catalog(singleton, schema_version)
values (true, 'GOV01_NATIVE_CONTROL_V1');

create table world_v2.gov01_control_scope (
  world_id text not null references world_v2.world_head(world_id),
  original_id text not null check (original_id = 'U2544::ENTITY::ENTITY_GOVERNMENT_01::account'),
  record_class text not null check (record_class in ('CONTROL_PROTOCOL_ONLY', 'RETAINED_RECORDS')),
  anchor_reference text not null,
  scope_reference text not null,
  primary key(world_id, original_id)
);
create table world_v2.gov01_control_history (
  world_id text not null,
  original_id text not null,
  generation numeric(64,0) not null check (generation >= 1),
  previous_digest text not null check (previous_digest ~ '^[a-f0-9]{64}$'),
  head_digest text not null check (head_digest ~ '^[a-f0-9]{64}$'),
  operation_id text not null,
  request_digest text not null check (request_digest ~ '^[a-f0-9]{64}$'),
  operation_kind text not null,
  state_json jsonb not null check (jsonb_typeof(state_json) = 'object'),
  documents_generation numeric(64,0) not null,
  primary key(world_id, original_id, generation),
  unique(world_id, original_id, generation, head_digest),
  foreign key(world_id, original_id) references world_v2.gov01_control_scope
);
create table world_v2.gov01_control_head (
  world_id text not null,
  original_id text not null,
  generation numeric(64,0) not null,
  head_digest text not null,
  primary key(world_id, original_id),
  foreign key(world_id, original_id, generation, head_digest)
    references world_v2.gov01_control_history(world_id, original_id, generation, head_digest)
);
create table world_v2.gov01_control_checkpoint (
  world_id text not null,
  original_id text not null,
  generation numeric(64,0) not null,
  head_digest text not null,
  primary key(world_id, original_id),
  foreign key(world_id, original_id, generation, head_digest)
    references world_v2.gov01_control_history(world_id, original_id, generation, head_digest)
);
create table world_v2.gov01_control_document (
  world_id text not null,
  original_id text not null,
  documents_generation numeric(64,0) not null,
  document_id text not null,
  source_version text not null,
  raw_utf8 bytea not null,
  byte_length numeric(64,0) not null check (byte_length between 1 and 1048576),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  primary key(world_id, original_id, documents_generation, document_id),
  foreign key(world_id, original_id) references world_v2.gov01_control_scope,
  check (byte_length = octet_length(raw_utf8)),
  check (sha256 = world_v2.authoritative_sha256(convert_from(raw_utf8, 'UTF8')))
);
create table world_v2.gov01_control_operation_receipt (
  world_id text not null,
  original_id text not null,
  operation_id text not null,
  request_digest text not null,
  outcome jsonb not null,
  primary key(world_id, original_id, operation_id),
  foreign key(world_id, original_id) references world_v2.gov01_control_scope
);

create function world_v2.gov01_forbid_control_mutation() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'GOV01_IMMUTABLE_CONTROL_RECORD' using errcode = '55000';
end;
$$;
create trigger gov01_catalog_immutable before update or delete on world_v2.gov01_control_catalog
for each row execute function world_v2.gov01_forbid_control_mutation();
create trigger gov01_scope_immutable before update or delete on world_v2.gov01_control_scope
for each row execute function world_v2.gov01_forbid_control_mutation();
create trigger gov01_history_immutable before update or delete on world_v2.gov01_control_history
for each row execute function world_v2.gov01_forbid_control_mutation();
create trigger gov01_documents_immutable before update or delete on world_v2.gov01_control_document
for each row execute function world_v2.gov01_forbid_control_mutation();
create trigger gov01_operation_receipt_immutable before update or delete on world_v2.gov01_control_operation_receipt
for each row execute function world_v2.gov01_forbid_control_mutation();

create function world_v2.gov01_closed_keys(value jsonb, expected text[]) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select case when jsonb_typeof(value) = 'object' then
    array(select jsonb_object_keys(value) order by 1) =
    array(select unnest(expected) order by 1)
    else false end
$$;

-- Both native entry points acquire H -> catalog -> permanent scope.
-- A missing scope remains protected by the catalog SHARE row until outer end.
create function world_v2.gov01_read_control_snapshot(
  requested_world text, requested_version text, requested_sequence text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  h record; catalog record; parent record; current_row record;
  prior_generation text; prior_digest text;
  documents jsonb;
begin
  select world_version::text as world_version, event_sequence::text as event_sequence
    into h from world_v2.world_head where world_id = requested_world for share;
  if not found or h.world_version is distinct from requested_version or h.event_sequence is distinct from requested_sequence then
    raise exception 'GOV01_H_MISMATCH';
  end if;
  select * into strict catalog from world_v2.gov01_control_catalog where singleton for share;
  select * into parent from world_v2.gov01_control_scope
    where world_id = requested_world and original_id = 'U2544::ENTITY::ENTITY_GOVERNMENT_01::account'
    for share;
  if not found then
    return jsonb_build_object('classification', 'CONTROL_PROTOCOL_ONLY', 'status', 'ABSENT',
      'worldId', requested_world, 'heldHead', jsonb_build_object('worldVersion', h.world_version,
      'eventSequence', h.event_sequence), 'catalogIdentity', catalog.store_identity);
  end if;
  select x.*, c.generation as checkpoint_generation, c.head_digest as checkpoint_digest
    into current_row from world_v2.gov01_control_head n
    join world_v2.gov01_control_history x using(world_id, original_id, generation, head_digest)
    join world_v2.gov01_control_checkpoint c using(world_id, original_id)
    where n.world_id = requested_world and n.original_id = parent.original_id;
  if not found or current_row.generation <> current_row.checkpoint_generation or
    current_row.head_digest <> current_row.checkpoint_digest then
    raise exception 'GOV01_CHECKPOINT_OR_HISTORY_MISMATCH';
  end if;
  if current_row.generation > 1 then
    select generation::text, head_digest into strict prior_generation, prior_digest
      from world_v2.gov01_control_history where world_id = requested_world and
      original_id = parent.original_id and generation = current_row.generation - 1;
    if prior_digest <> current_row.previous_digest then raise exception 'GOV01_HISTORY_GAP'; end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('pin', jsonb_build_object(
      'documentId', document_id, 'sourceVersion', source_version,
      'byteLength', byte_length::text, 'sha256', sha256, 'pointer', ''),
      'utf8', convert_from(raw_utf8, 'UTF8')) order by convert_to(document_id, 'UTF8')), '[]'::jsonb)
    into documents from world_v2.gov01_control_document where world_id = requested_world
      and original_id = parent.original_id and documents_generation = current_row.documents_generation;
  return jsonb_build_object('classification', 'CONTROL_PROTOCOL_ONLY', 'status', 'PRESENT',
    'worldId', requested_world, 'heldHead', jsonb_build_object('worldVersion', h.world_version,
    'eventSequence', h.event_sequence), 'catalogIdentity', catalog.store_identity,
    'recordClass', parent.record_class, 'anchorReference', parent.anchor_reference,
    'scopeReference', parent.scope_reference, 'generation', current_row.generation::text,
    'headDigest', current_row.head_digest, 'previousHeadDigest', current_row.previous_digest,
    'checkpointGeneration', current_row.checkpoint_generation::text,
    'checkpointHeadDigest', current_row.checkpoint_digest,
    'parentGeneration', prior_generation,
    'parentHeadDigest', prior_digest,
    'state', current_row.state_json, 'documents', documents);
end;
$$;

create function world_v2.gov01_apply_control_operation(canonical_body text, supplied_digest text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  b jsonb; p jsonb; h record; parent record; current_row record; receipt record;
  next_state jsonb; entry jsonb; pin jsonb; raw bytea; total_bytes bigint := 0;
  next_generation numeric(64,0); docs_generation numeric(64,0); previous_digest text;
  next_digest text; outcome jsonb; kind text; world text;
  original constant text := 'U2544::ENTITY::ENTITY_GOVERNMENT_01::account';
  dependencies constant text[] := array['origin','installation','cbAppointment','govAppointment',
    'holder','definition','recordSet','registration','currency','opening','accounts','register','checkpoint'];
begin
  if octet_length(canonical_body) > 67108864 or supplied_digest !~ '^[a-f0-9]{64}$' or
    world_v2.authoritative_sha256(E'GOV01_CONTROL_OPERATION_V1\n' || canonical_body) <> supplied_digest then
    raise exception 'GOV01_OPERATION_DIGEST_MISMATCH';
  end if;
  b := canonical_body::jsonb;
  if not world_v2.gov01_closed_keys(b, array['schemaVersion','operationId','worldId','originalId',
      'heldHead','expected','kind','payload']) or b->>'schemaVersion' is distinct from 'gov01-control-operation-v1' or
    b->>'originalId' is distinct from original or jsonb_typeof(b->'operationId') is distinct from 'string' or
    b->>'operationId' !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$' or
    octet_length(b->>'operationId') > 512 or
    not world_v2.gov01_closed_keys(b->'heldHead', array['worldVersion','eventSequence']) or
    jsonb_typeof(b->'heldHead'->'worldVersion') is distinct from 'string' or
    jsonb_typeof(b->'heldHead'->'eventSequence') is distinct from 'string' then
    raise exception 'GOV01_OPERATION_SHAPE';
  end if;
  world := b->>'worldId'; kind := b->>'kind'; p := b->'payload';
  if kind is null or kind not in ('REGISTER','REPLACE_RECORD_SET','REPLACE_INSTALLATION','REVOKE','RETIRE') then
    raise exception 'GOV01_OPERATION_KIND';
  end if;
  select world_version::text as world_version, event_sequence::text as event_sequence into h
    from world_v2.world_head where world_id = world for share;
  if not found then raise exception 'GOV01_H_ABSENT'; end if;
  perform singleton from world_v2.gov01_control_catalog where singleton for update;
  if not found then raise exception 'GOV01_CATALOG_ABSENT'; end if;
  select * into parent from world_v2.gov01_control_scope where world_id = world and original_id = original for update;
  -- Exact receipt recovery precedes NEW-only H/CAS/current eligibility.
  select * into receipt from world_v2.gov01_control_operation_receipt
    where world_id = world and original_id = original and operation_id = b->>'operationId';
  if found then
    if receipt.request_digest <> supplied_digest then raise exception 'GOV01_OPERATION_ID_CONFLICT'; end if;
    return receipt.outcome || jsonb_build_object('source', 'EXISTING_CONTROL_OPERATION');
  end if;
  if h.world_version is distinct from b->'heldHead'->>'worldVersion' or h.event_sequence is distinct from b->'heldHead'->>'eventSequence' then
    raise exception 'GOV01_H_MISMATCH';
  end if;
  if kind = 'REGISTER' then
    if parent.world_id is not null or b->'expected' is distinct from 'null'::jsonb then raise exception 'GOV01_EXPECTED_ABSENCE'; end if;
    next_generation := 1; previous_digest := repeat('0',64);
  else
    if parent.world_id is null or not world_v2.gov01_closed_keys(b->'expected', array['generation','headDigest']) then
      raise exception 'GOV01_PARENT_OR_EXPECTATION_ABSENT';
    end if;
    if jsonb_typeof(b->'expected'->'generation') is distinct from 'string' or
      jsonb_typeof(b->'expected'->'headDigest') is distinct from 'string' or
      b->'expected'->>'generation' !~ '^[1-9][0-9]{0,63}$' or
      b->'expected'->>'headDigest' !~ '^[a-f0-9]{64}$' then
      raise exception 'GOV01_EXPECTATION_SHAPE';
    end if;
    select x.* into strict current_row from world_v2.gov01_control_head n
      join world_v2.gov01_control_history x using(world_id,original_id,generation,head_digest)
      join world_v2.gov01_control_checkpoint c using(world_id,original_id)
      where n.world_id = world and n.original_id = original
        and c.generation = n.generation and c.head_digest = n.head_digest;
    if current_row.generation::text is distinct from b->'expected'->>'generation' or
      current_row.head_digest is distinct from b->'expected'->>'headDigest' then raise exception 'GOV01_CAS_MISMATCH'; end if;
    if current_row.state_json->>'retired' = 'true' then raise exception 'GOV01_SCOPE_RETIRED'; end if;
    next_generation := current_row.generation + 1; previous_digest := current_row.head_digest;
  end if;
  if kind in ('REGISTER','REPLACE_RECORD_SET','REPLACE_INSTALLATION') then
    if not world_v2.gov01_closed_keys(p, array['recordClass','anchorReference','scopeReference',
      'registrationReference','sourceSetVersion','targetDeploymentRef','databaseIdentityRef',
      'connectorReference','allowedCaller','enrollmentReference','bindingBase','manifestPin','documents']) or
      p->>'recordClass' not in ('CONTROL_PROTOCOL_ONLY','RETAINED_RECORDS') or
      p->>'allowedCaller' <> 'WORKER_GOV01_ACCOUNT_READ_V1' or
      jsonb_typeof(p->'documents') <> 'array' or jsonb_array_length(p->'documents') > 32 or
      (p->'bindingBase' <> 'null'::jsonb and (jsonb_typeof(p->'bindingBase') <> 'object' or p->'bindingBase' ? 'control')) then
      raise exception 'GOV01_COMPLETE_REPLACEMENT_SHAPE';
    end if;
    if p->>'recordClass' = 'RETAINED_RECORDS' and
      (p->'bindingBase' = 'null'::jsonb or p->'manifestPin' = 'null'::jsonb or jsonb_array_length(p->'documents') = 0) then
      raise exception 'GOV01_RETAINED_SET_REQUIRED';
    end if;
    if kind = 'REGISTER' then
      insert into world_v2.gov01_control_scope values(world, original, p->>'recordClass', p->>'anchorReference', p->>'scopeReference');
    elsif parent.record_class <> p->>'recordClass' or parent.anchor_reference <> p->>'anchorReference' or
      parent.scope_reference <> p->>'scopeReference' then raise exception 'GOV01_PERMANENT_SCOPE_MISMATCH';
    end if;
    if kind = 'REPLACE_RECORD_SET' then
      if current_row.state_json->'payload'->>'targetDeploymentRef' <> p->>'targetDeploymentRef' or
         current_row.state_json->'payload'->>'databaseIdentityRef' <> p->>'databaseIdentityRef' or
         current_row.state_json->'payload'->>'connectorReference' <> p->>'connectorReference' then
        raise exception 'GOV01_INSTALLATION_REPLACEMENT_REQUIRED';
      end if;
    end if;
    docs_generation := next_generation;
    for entry in select value from jsonb_array_elements(p->'documents') loop
      if not world_v2.gov01_closed_keys(entry, array['pin','utf8']) or
        not world_v2.gov01_closed_keys(entry->'pin', array['documentId','sourceVersion','byteLength','sha256','pointer']) or
        entry->'pin'->>'pointer' <> '' or jsonb_typeof(entry->'utf8') <> 'string' then
        raise exception 'GOV01_FULL_DOCUMENT_SHAPE';
      end if;
      pin := entry->'pin'; raw := convert_to(entry->>'utf8','UTF8'); total_bytes := total_bytes + octet_length(raw);
      if total_bytes > 8388608 or octet_length(pin->>'documentId') not between 1 and 512 or
        octet_length(pin->>'sourceVersion') not between 1 and 512 or pin->>'byteLength' !~ '^[1-9][0-9]{0,63}$' then
        raise exception 'GOV01_DOCUMENT_BUDGET_OR_IDENTITY';
      end if;
      insert into world_v2.gov01_control_document values(world,original,docs_generation,
        pin->>'documentId',pin->>'sourceVersion',raw,(pin->>'byteLength')::numeric,pin->>'sha256');
    end loop;
    next_state := jsonb_build_object('retired',false,'payload',p-'documents','dependencies',
      (select jsonb_object_agg(name,'ACTIVE'::text) from unnest(dependencies) as name));
  elsif kind = 'REVOKE' then
    if not world_v2.gov01_closed_keys(p,array['dependency']) or not (p->>'dependency' = any(dependencies)) then
      raise exception 'GOV01_REVOCATION_SCOPE';
    end if;
    docs_generation := current_row.documents_generation;
    next_state := jsonb_set(current_row.state_json,array['dependencies',p->>'dependency'],'"REVOKED"'::jsonb);
  else
    if not world_v2.gov01_closed_keys(p,array['reasonReference']) or octet_length(p->>'reasonReference') not between 1 and 512 then
      raise exception 'GOV01_RETIREMENT_SCOPE';
    end if;
    docs_generation := current_row.documents_generation;
    next_state := current_row.state_json || jsonb_build_object('retired',true,'retirementReason',p->>'reasonReference');
  end if;
  next_digest := world_v2.authoritative_sha256(E'GOV01_CONTROL_HEAD_V1\n' || previous_digest || E'\n' ||
    next_generation::text || E'\n' || supplied_digest);
  insert into world_v2.gov01_control_history values(world,original,next_generation,previous_digest,
    next_digest,b->>'operationId',supplied_digest,kind,next_state,docs_generation);
  insert into world_v2.gov01_control_head values(world,original,next_generation,next_digest)
    on conflict(world_id,original_id) do update set generation=excluded.generation,head_digest=excluded.head_digest;
  insert into world_v2.gov01_control_checkpoint values(world,original,next_generation,next_digest)
    on conflict(world_id,original_id) do update set generation=excluded.generation,head_digest=excluded.head_digest;
  outcome := jsonb_build_object('classification','CONTROL_PROTOCOL_ONLY','source','NEW_CONTROL_OPERATION',
    'worldId',world,'operationId',b->>'operationId','generation',next_generation::text,'headDigest',next_digest);
  insert into world_v2.gov01_control_operation_receipt values(world,original,b->>'operationId',supplied_digest,outcome);
  return outcome;
end;
$$;

revoke all on world_v2.gov01_control_catalog, world_v2.gov01_control_scope,
  world_v2.gov01_control_head, world_v2.gov01_control_checkpoint, world_v2.gov01_control_history,
  world_v2.gov01_control_document, world_v2.gov01_control_operation_receipt from public;
revoke all on function world_v2.gov01_forbid_control_mutation() from public;
revoke all on function world_v2.gov01_closed_keys(jsonb,text[]) from public;
revoke all on function world_v2.gov01_read_control_snapshot(text,text,text) from public;
revoke all on function world_v2.gov01_apply_control_operation(text,text) from public;
-- No actor grants here. An eventual admitted deployment must separately select
-- its actual least-privilege principals; tests grant only owned fixture roles.
