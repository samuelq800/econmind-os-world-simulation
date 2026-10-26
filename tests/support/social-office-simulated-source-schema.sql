-- SIMULATED_OPENING ONLY. Owned disposable fixture, NOT a migration/admission.
-- Installer owns these objects. No public/default role grants or import startup.
create table world_v2.social_demo_source_scope (
  simulation_id text not null,
  world_id text not null references world_v2.world_head(world_id),
  country_id text not null,
  schema_version text not null check(schema_version='social-office-simulated-source-store-v1'),
  source_class text not null check(source_class='SIMULATED_OPENING'),
  lock_column boolean not null default true check(lock_column),
  primary key(simulation_id,world_id,country_id)
);
create table world_v2.social_demo_source_record (
  simulation_id text not null, world_id text not null, country_id text not null,
  record_id text not null, revision text not null,
  role text not null check(role in ('RESOURCE_CATALOG','PHYSICAL_ORIGINAL_BODY','DOMAIN_FACTS','CURRENT_AUTHORIZATION')),
  physical_group_key text,
  raw_utf8 text not null check(octet_length(raw_utf8) between 1 and 1048576),
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$' and sha256=world_v2.authoritative_sha256(raw_utf8)),
  check((role='PHYSICAL_ORIGINAL_BODY' and physical_group_key is not null and physical_group_key ~ '^[a-f0-9]{64}$') or (role<>'PHYSICAL_ORIGINAL_BODY' and physical_group_key is null)),
  primary key(simulation_id,world_id,country_id,record_id),
  foreign key(simulation_id,world_id,country_id) references world_v2.social_demo_source_scope
);
create unique index social_demo_physical_origin on world_v2.social_demo_source_record(simulation_id,world_id,country_id,physical_group_key) where physical_group_key is not null;
create table world_v2.social_demo_source_revision (
  simulation_id text not null, world_id text not null, country_id text not null,
  generation bigint not null check(generation>0),
  operation_id text not null,
  manifest_hash text not null check(manifest_hash ~ '^[a-f0-9]{64}$'),
  publication_utf8 text not null check(octet_length(publication_utf8) between 1 and 4194304 and manifest_hash=world_v2.authoritative_sha256(publication_utf8)),
  primary key(simulation_id,world_id,country_id,generation),
  unique(simulation_id,world_id,country_id,operation_id),
  foreign key(simulation_id,world_id,country_id) references world_v2.social_demo_source_scope
);
create function world_v2.social_demo_immutable() returns trigger
language plpgsql set search_path=pg_catalog as $$ begin
  raise exception 'SOCIAL_SIMULATED_SOURCE_IMMUTABLE' using errcode='55000';
end $$;
create trigger social_demo_scope_immutable before update or delete on world_v2.social_demo_source_scope for each row execute function world_v2.social_demo_immutable();
create trigger social_demo_record_immutable before update or delete on world_v2.social_demo_source_record for each row execute function world_v2.social_demo_immutable();
create trigger social_demo_revision_immutable before update or delete on world_v2.social_demo_source_revision for each row execute function world_v2.social_demo_immutable();
create function world_v2.social_demo_protect_insert() returns trigger
language plpgsql set search_path=pg_catalog as $$ begin
  perform 1 from world_v2.social_demo_source_scope where simulation_id=new.simulation_id and world_id=new.world_id and country_id=new.country_id for update;
  if not found then raise exception 'SOCIAL_SIMULATED_SOURCE_ANCHOR_REQUIRED'; end if;
  return new;
end $$;
create trigger social_demo_record_protected before insert on world_v2.social_demo_source_record for each row execute function world_v2.social_demo_protect_insert();
create trigger social_demo_revision_protected before insert on world_v2.social_demo_source_revision for each row execute function world_v2.social_demo_protect_insert();

create function world_v2.social_demo_closed(v jsonb, expected text[]) returns boolean
language sql immutable set search_path=pg_catalog as $$
  select case when jsonb_typeof(v)='object' then array(select jsonb_object_keys(v) order by 1)=array(select unnest(expected) order by 1) else false end
$$;
create function world_v2.social_demo_ref(v text) returns boolean
language sql immutable set search_path=pg_catalog as $$ select coalesce(v ~ '^[A-Za-z][A-Za-z0-9._:-]{0,127}$',false) $$;
create function world_v2.social_demo_uint(v text) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$ begin
  if v is null or length(v)>19 or v !~ '^(0|[1-9][0-9]*)$' then return false; end if;
  return v::numeric<=9223372036854775807;
end $$;
-- Preserve json (not jsonb) until every duplicate key has been rejected.
create function world_v2.social_demo_unique_json(v json, depth integer default 0) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
declare pair record; element json;
begin
  if depth>32 then return false; end if;
  if json_typeof(v)='object' then
    if (select count(*)<>count(distinct key) from json_each(v)) then return false; end if;
    for pair in select * from json_each(v) loop
      if not world_v2.social_demo_unique_json(pair.value,depth+1) then return false; end if;
    end loop;
  elsif json_typeof(v)='array' then
    for element in select value from json_array_elements(v) loop
      if not world_v2.social_demo_unique_json(element,depth+1) then return false; end if;
    end loop;
  end if;
  return true;
end $$;

create function world_v2.social_demo_publish_source(body text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare
  p jsonb; r jsonb; c jsonb; resource jsonb; a jsonb; raw_body jsonb;
  previous world_v2.social_demo_source_revision%rowtype;
  existing world_v2.social_demo_source_revision%rowtype;
  known world_v2.social_demo_source_record%rowtype;
  s text; w text; country text; hash text; physical text; next_generation bigint;
  ids text[]:=array[]::text[]; selected text[]; names text[]:=array[]::text[];
  resource_ids text[]:=array[]::text[]; local_names text[]; allowed text[];
  catalog_count integer:=0; alias_count integer:=0;
begin
  if body is null or octet_length(body) not between 1 and 4194304 or not world_v2.social_demo_unique_json(body::json) then raise exception 'SOCIAL_SOURCE_JSON'; end if;
  p:=body::jsonb;
  if not world_v2.social_demo_closed(p,array['schemaVersion','sourceClass','simulationId','worldId','countryId','operationId','expectedGeneration','expectedManifestHash','validFromSimTime','validUntilSimTime','disposition','allowedPurposes','selectedRecordIds','records']) then raise exception 'SOCIAL_SOURCE_CLOSED'; end if;
  if p->>'schemaVersion' is distinct from 'social-office-simulated-source-publication-v1' or p->>'sourceClass' is distinct from 'SIMULATED_OPENING' then raise exception 'SOCIAL_SOURCE_CLASS'; end if;
  -- Strings must actually be strings, not json numbers/booleans that ->> coerces.
  if exists(select 1 from unnest(array['schemaVersion','sourceClass','simulationId','worldId','countryId','operationId','expectedGeneration','validFromSimTime','disposition']) k where jsonb_typeof(p->k) is distinct from 'string') then raise exception 'SOCIAL_SOURCE_TYPES'; end if;
  s:=p->>'simulationId'; w:=p->>'worldId'; country:=p->>'countryId';
  if not world_v2.social_demo_ref(s) or not world_v2.social_demo_ref(w) or not world_v2.social_demo_ref(country) or not world_v2.social_demo_ref(p->>'operationId') or not world_v2.social_demo_uint(p->>'expectedGeneration') or not world_v2.social_demo_uint(p->>'validFromSimTime') then raise exception 'SOCIAL_SOURCE_IDS'; end if;
  if jsonb_typeof(p->'expectedManifestHash') not in ('null','string') or jsonb_typeof(p->'validUntilSimTime') not in ('null','string') or p->>'disposition' not in ('ACTIVE','REVOKED') then raise exception 'SOCIAL_SOURCE_TYPES'; end if;
  if ((p->>'expectedGeneration'='0') is distinct from (p->'expectedManifestHash'='null'::jsonb)) or (p->>'expectedManifestHash' is not null and p->>'expectedManifestHash' !~ '^[a-f0-9]{64}$') then raise exception 'SOCIAL_SOURCE_CAS_SHAPE'; end if;
  if p->>'validUntilSimTime' is not null and (not world_v2.social_demo_uint(p->>'validUntilSimTime') or (p->>'validUntilSimTime')::numeric<=(p->>'validFromSimTime')::numeric) then raise exception 'SOCIAL_SOURCE_VALIDITY'; end if;
  if jsonb_typeof(p->'records') is distinct from 'array' or jsonb_array_length(p->'records') not between 1 and 256 or jsonb_typeof(p->'allowedPurposes') is distinct from 'array' or jsonb_array_length(p->'allowedPurposes') not between 1 and 3 or jsonb_typeof(p->'selectedRecordIds') is distinct from 'array' or jsonb_array_length(p->'selectedRecordIds') not between 1 and 256 then raise exception 'SOCIAL_SOURCE_ARRAYS'; end if;
  if exists(select 1 from jsonb_array_elements(p->'allowedPurposes') v where jsonb_typeof(v)<>'string' or v#>>'{}' not in ('EDUCATION','EMPLOYMENT','HEALTHCARE')) then raise exception 'SOCIAL_SOURCE_PURPOSES'; end if;
  allowed:=array(select jsonb_array_elements_text(p->'allowedPurposes'));
  if allowed is distinct from array(select distinct x collate "C" from unnest(allowed) x order by 1) then raise exception 'SOCIAL_SOURCE_PURPOSE_ORDER'; end if;
  if exists(select 1 from jsonb_array_elements(p->'selectedRecordIds') v where jsonb_typeof(v)<>'string' or not world_v2.social_demo_ref(v#>>'{}')) then raise exception 'SOCIAL_SOURCE_SELECTION'; end if;
  selected:=array(select jsonb_array_elements_text(p->'selectedRecordIds'));
  if selected is distinct from array(select distinct x collate "C" from unnest(selected) x order by 1) then raise exception 'SOCIAL_SOURCE_SELECTION_ORDER'; end if;
  -- Complete protection before the first original/currentness read. No World H lock here.
  perform 1 from world_v2.social_demo_source_scope where simulation_id=s and world_id=w and country_id=country and source_class='SIMULATED_OPENING' and schema_version='social-office-simulated-source-store-v1' for update;
  if not found then raise exception 'SOCIAL_SOURCE_ANCHOR'; end if;
  hash:=world_v2.authoritative_sha256(body);
  select * into existing from world_v2.social_demo_source_revision where simulation_id=s and world_id=w and country_id=country and operation_id=p->>'operationId';
  if found then
    if existing.publication_utf8 is distinct from body then raise exception 'SOCIAL_SOURCE_IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('sourceClass','SIMULATED_OPENING','simulationId',s,'worldId',w,'countryId',country,'source','EXISTING','generation',existing.generation::text,'manifestHash',existing.manifest_hash);
  end if;
  select * into previous from world_v2.social_demo_source_revision where simulation_id=s and world_id=w and country_id=country order by generation desc limit 1;
  if coalesce(previous.generation,0)::text is distinct from p->>'expectedGeneration' or previous.manifest_hash is distinct from p->>'expectedManifestHash' then raise exception 'SOCIAL_SOURCE_STALE_CAS'; end if;
  if previous.generation=9223372036854775807 or (previous.generation is not null and (p->>'validFromSimTime')::numeric<(previous.publication_utf8::jsonb->>'validFromSimTime')::numeric) then raise exception 'SOCIAL_SOURCE_REVISION_BOUND'; end if;
  next_generation:=coalesce(previous.generation,0)+1;
  for r in select value from jsonb_array_elements(p->'records') loop
    if not world_v2.social_demo_closed(r,array['recordId','revision','role','physicalGroupKey','rawUtf8','sha256']) or exists(select 1 from unnest(array['recordId','revision','role','rawUtf8','sha256']) k where jsonb_typeof(r->k) is distinct from 'string') then raise exception 'SOCIAL_SOURCE_RECORD_SHAPE'; end if;
    if not world_v2.social_demo_ref(r->>'recordId') or not world_v2.social_demo_ref(r->>'revision') or r->>'role' not in ('RESOURCE_CATALOG','PHYSICAL_ORIGINAL_BODY','DOMAIN_FACTS','CURRENT_AUTHORIZATION') or octet_length(r->>'rawUtf8') not between 1 and 1048576 or r->>'sha256' !~ '^[a-f0-9]{64}$' or r->>'sha256' is distinct from world_v2.authoritative_sha256(r->>'rawUtf8') then raise exception 'SOCIAL_SOURCE_RECORD_BYTES'; end if;
    if not world_v2.social_demo_unique_json((r->>'rawUtf8')::json) then raise exception 'SOCIAL_SOURCE_ORIGINAL_DUPLICATE_KEY'; end if;
    raw_body:=(r->>'rawUtf8')::jsonb;
    if jsonb_typeof(raw_body) is distinct from 'object' then raise exception 'SOCIAL_SOURCE_ORIGINAL_OBJECT'; end if;
    if r->>'recordId'=any(ids) then raise exception 'SOCIAL_SOURCE_DUPLICATE_ID'; end if;
    ids:=array_append(ids,r->>'recordId');
    if r->>'role'='PHYSICAL_ORIGINAL_BODY' then
      if raw_body->>'worldId' is distinct from w or raw_body->>'countryId' is distinct from country or jsonb_typeof(raw_body->'worldId') is distinct from 'string' or jsonb_typeof(raw_body->'countryId') is distinct from 'string' or jsonb_typeof(raw_body->'locationId') is distinct from 'string' or jsonb_typeof(raw_body->'dayIndex') is distinct from 'string' or not world_v2.social_demo_ref(raw_body->>'locationId') or not world_v2.social_demo_uint(raw_body->>'dayIndex') or raw_body ? 'headWorldVersion' or raw_body ? 'headEventSequence' then raise exception 'SOCIAL_SOURCE_PHYSICAL_SCOPE'; end if;
      physical:=world_v2.authoritative_sha256('SOCIAL_PHYSICAL_GROUP_V1'||chr(10)||w||chr(10)||country||chr(10)||(raw_body->>'locationId')||chr(10)||(raw_body->>'dayIndex'));
      if jsonb_typeof(r->'physicalGroupKey') is distinct from 'string' or r->>'physicalGroupKey' is distinct from physical then raise exception 'SOCIAL_SOURCE_PHYSICAL_GROUP'; end if;
    elsif r->'physicalGroupKey' is distinct from 'null'::jsonb then raise exception 'SOCIAL_SOURCE_NONPHYSICAL_KEY'; end if;
    if r->>'role' in ('RESOURCE_CATALOG','PHYSICAL_ORIGINAL_BODY') and not (r->>'recordId'=any(selected)) then raise exception 'SOCIAL_SOURCE_ORIGIN_SELECTION'; end if;
    if r->>'role'='RESOURCE_CATALOG' then
      catalog_count:=catalog_count+1; c:=raw_body;
      if r->>'recordId' is distinct from 'COMMON_RF_RESOURCE_CATALOG_V1' or not world_v2.social_demo_closed(c,array['schemaVersion','sourceClass','simulationId','worldId','countryId','resources']) or exists(select 1 from unnest(array['schemaVersion','sourceClass','simulationId','worldId','countryId']) k where jsonb_typeof(c->k) is distinct from 'string') or c->>'schemaVersion' is distinct from 'social-office-simulated-resource-catalog-v1' or c->>'sourceClass' is distinct from 'SIMULATED_OPENING' or c->>'simulationId' is distinct from s or c->>'worldId' is distinct from w or c->>'countryId' is distinct from country then raise exception 'SOCIAL_SOURCE_CATALOG_SCOPE'; end if;
      if jsonb_typeof(c->'resources') is distinct from 'array' or jsonb_array_length(c->'resources') not between 1 and 4096 then raise exception 'SOCIAL_SOURCE_CATALOG_BOUND'; end if;
      for resource in select value from jsonb_array_elements(c->'resources') loop
        if not world_v2.social_demo_closed(resource,array['resourceId','kind','unit','aliases']) or jsonb_typeof(resource->'resourceId') is distinct from 'string' or jsonb_typeof(resource->'kind') is distinct from 'string' or jsonb_typeof(resource->'unit') is distinct from 'string' or not world_v2.social_demo_ref(resource->>'resourceId') or not world_v2.social_demo_ref(resource->>'unit') or resource->>'kind' not in ('PERSON','TIME','BUDGET','MEDICINE','FACILITY') or jsonb_typeof(resource->'aliases') is distinct from 'array' or jsonb_array_length(resource->'aliases') not between 1 and 64 then raise exception 'SOCIAL_SOURCE_RESOURCE_SHAPE'; end if;
        if resource->>'resourceId'=any(resource_ids) then raise exception 'SOCIAL_SOURCE_RESOURCE_DUPLICATE'; end if;
        resource_ids:=array_append(resource_ids,resource->>'resourceId'); local_names:=array[]::text[];
        for a in select value from jsonb_array_elements(resource->'aliases') loop
          if jsonb_typeof(a) is distinct from 'string' or not world_v2.social_demo_ref(a#>>'{}') or a#>>'{}'=any(names) then raise exception 'SOCIAL_SOURCE_ALIAS'; end if;
          names:=array_append(names,a#>>'{}'); local_names:=array_append(local_names,a#>>'{}'); alias_count:=alias_count+1;
          if alias_count>16384 then raise exception 'SOCIAL_SOURCE_ALIAS_BOUND'; end if;
        end loop;
        if not (resource->>'resourceId'=any(local_names)) then raise exception 'SOCIAL_SOURCE_CANONICAL_ALIAS'; end if;
      end loop;
    elsif r->>'recordId'='COMMON_RF_RESOURCE_CATALOG_V1' then raise exception 'SOCIAL_SOURCE_CATALOG_ROLE'; end if;
    select * into known from world_v2.social_demo_source_record where simulation_id=s and world_id=w and country_id=country and record_id=r->>'recordId';
    if found then
      if known.revision is distinct from r->>'revision' or known.role is distinct from r->>'role' or known.physical_group_key is distinct from r->>'physicalGroupKey' or known.raw_utf8 is distinct from r->>'rawUtf8' or known.sha256 is distinct from r->>'sha256' then raise exception 'SOCIAL_SOURCE_ORIGINAL_REPLACED'; end if;
    else
      insert into world_v2.social_demo_source_record values(s,w,country,r->>'recordId',r->>'revision',r->>'role',r->>'physicalGroupKey',r->>'rawUtf8',r->>'sha256');
    end if;
  end loop;
  if catalog_count<>1 or ids is distinct from array(select x from unnest(ids) x order by x collate "C") or exists(select 1 from unnest(selected) x where not x=any(ids)) or exists(select 1 from world_v2.social_demo_source_record where simulation_id=s and world_id=w and country_id=country and not record_id=any(ids)) then raise exception 'SOCIAL_SOURCE_COMPLETE_RETAINED_SET'; end if;
  insert into world_v2.social_demo_source_revision values(s,w,country,next_generation,p->>'operationId',hash,body);
  return jsonb_build_object('sourceClass','SIMULATED_OPENING','simulationId',s,'worldId',w,'countryId',country,'source','NEW','generation',next_generation::text,'manifestHash',hash);
end $$;

revoke all on world_v2.social_demo_source_scope,world_v2.social_demo_source_record,world_v2.social_demo_source_revision from public;
revoke all on function world_v2.social_demo_publish_source(text),world_v2.social_demo_protect_insert(),world_v2.social_demo_immutable(),world_v2.social_demo_closed(jsonb,text[]),world_v2.social_demo_ref(text),world_v2.social_demo_uint(text),world_v2.social_demo_unique_json(json,integer) from public;
-- F installer grants reader USAGE + SELECT all three tables + UPDATE(lock_column)
-- only on scope; publisher USAGE + EXECUTE publisher(text) only. No World grants.
