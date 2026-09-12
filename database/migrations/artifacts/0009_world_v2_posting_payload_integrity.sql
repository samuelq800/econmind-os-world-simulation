do $$
begin
  if to_regprocedure('sha256(bytea)') is null then
    execute 'create extension if not exists pgcrypto';
  end if;
end;
$$;

create or replace function world_v2.canonical_json(value jsonb)
returns text
language plpgsql
immutable
strict
as $$
declare
  rendered text;
begin
  case jsonb_typeof(value)
    when 'object' then
      select '{' || coalesce(
        string_agg(
          to_jsonb(entry.key)::text || ':' || world_v2.canonical_json(entry.value),
          ',' order by entry.key
        ),
        ''
      ) || '}'
        into rendered
        from jsonb_each(value) as entry(key, value);
    when 'array' then
      select '[' || coalesce(
        string_agg(world_v2.canonical_json(item.value), ',' order by item.ordinality),
        ''
      ) || ']'
        into rendered
        from jsonb_array_elements(value) with ordinality as item(value, ordinality);
    else
      rendered := value::text;
  end case;
  return rendered;
end;
$$;

create or replace function world_v2.authoritative_sha256(value text)
returns text
language plpgsql
immutable
strict
as $$
declare
  rendered text;
begin
  if to_regprocedure('sha256(bytea)') is not null then
    execute 'select encode(sha256(convert_to($1, ''UTF8'')), ''hex'')'
      into rendered
      using value;
  elsif to_regprocedure('digest(bytea,text)') is not null then
    execute 'select encode(digest(convert_to($1, ''UTF8''), ''sha256''), ''hex'')'
      into rendered
      using value;
  else
    raise exception 'No SHA-256 implementation is available for authoritative posting validation'
      using errcode = '0A000';
  end if;
  return rendered;
end;
$$;

create or replace function world_v2.validate_inventory_posting_payload(payload jsonb, row_value world_v2.inventory_posting)
returns void
language plpgsql
as $$
declare
  entry_count bigint;
  debit_count bigint;
  credit_count bigint;
  conservation_total numeric;
  distinct_account_count bigint;
  distinct_batch_count bigint;
  distinct_commodity_count bigint;
  distinct_country_count bigint;
  distinct_unit_count bigint;
  distinct_title_holder_count bigint;
  distinct_risk_bearer_count bigint;
  distinct_recognition_count bigint;
  distinct_location_count bigint;
  invalid_entry_count bigint;
  source_bucket text;
  destination_bucket text;
begin
  if jsonb_typeof(payload) <> 'object'
     or (select array_agg(key order by key) from jsonb_object_keys(payload) as key) is distinct from array[
       'causationCommandId', 'causationEventIds', 'entries', 'operation',
       'postingId', 'schemaVersion', 'simTime', 'transitionBinding', 'worldId',
       'worldVersionAfter', 'worldVersionBefore'
     ] then
    raise exception 'Inventory Posting payload has an unexpected canonical shape'
      using errcode = '23514';
  end if;
  if payload->>'schemaVersion' <> 'inventory-posting-v1'
     or payload->>'postingId' <> row_value.posting_id
     or payload->>'worldId' <> row_value.world_id
     or payload->>'causationCommandId' <> row_value.causation_command_id
     or payload->>'worldVersionBefore' <> row_value.world_version_before::text
     or payload->>'worldVersionAfter' <> row_value.world_version_after::text
     or payload->>'simTime' <> row_value.sim_time::text
     or payload->>'operation' <> row_value.operation
     or payload->'causationEventIds' is distinct from row_value.event_ids
     or payload->'transitionBinding' is distinct from row_value.transition_binding::jsonb then
    raise exception 'Inventory Posting payload does not match authoritative columns'
      using errcode = '23514';
  end if;
  if jsonb_typeof(payload->'entries') <> 'array' then
    raise exception 'Inventory Posting entries must be an array'
      using errcode = '23514';
  end if;
  select count(*),
         count(*) filter (where (entry.value->'delta'->>'amount')::numeric < 0),
         count(*) filter (where (entry.value->'delta'->>'amount')::numeric > 0),
         coalesce(sum((entry.value->'delta'->>'amount')::numeric), 0),
         count(distinct entry.value->'account'->>'physicalLocationId'),
         count(distinct entry.value->'account'->>'batchId'),
         count(distinct entry.value->'account'->>'commodityId'),
         count(distinct entry.value->'account'->>'countryId'),
         count(distinct entry.value->'account'->>'unit'),
         count(distinct entry.value->'account'->>'titleHolderId'),
         count(distinct entry.value->'account'->>'riskBearerId'),
         count(distinct coalesce(entry.value->'account'->>'economicRecognitionId', '')), 
         count(*) filter (where
           jsonb_typeof(entry.value) <> 'object'
           or (select array_agg(key order by key) from jsonb_object_keys(entry.value) as key) is distinct from array['account', 'delta']
           or jsonb_typeof(entry.value->'account') <> 'object'
           or (select array_agg(key order by key) from jsonb_object_keys(entry.value->'account') as key) is distinct from array[
             'batchId', 'bucket', 'commodityId', 'countryId', 'economicRecognitionId',
             'physicalLocationId', 'reservationId', 'riskBearerId', 'shipmentId',
             'titleHolderId', 'unit', 'worldId'
           ]
           or jsonb_typeof(entry.value->'delta') <> 'object'
           or (select array_agg(key order by key) from jsonb_object_keys(entry.value->'delta') as key) is distinct from array['amount', 'unit']
           or jsonb_typeof(entry.value->'delta'->'amount') <> 'string'
           or jsonb_typeof(entry.value->'delta'->'unit') <> 'string'
           or entry.value->'delta'->>'amount' !~ '^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]*[1-9])?$'
           or entry.value->'delta'->>'amount' = '-0'
           or length(regexp_replace(entry.value->'delta'->>'amount', '[-.]', '', 'g')) > 120
           or entry.value->'delta'->>'unit' <> entry.value->'account'->>'unit'
           or entry.value->'account'->>'worldId' <> row_value.world_id
           or entry.value->'account'->>'bucket' not in ('AVAILABLE', 'RESERVED', 'IN_TRANSIT')
           or (entry.value->'account'->>'bucket' = 'AVAILABLE' and (entry.value->'account'->>'reservationId' is not null or entry.value->'account'->>'shipmentId' is not null))
           or (entry.value->'account'->>'bucket' = 'RESERVED' and (entry.value->'account'->>'reservationId' is null or entry.value->'account'->>'shipmentId' is not null))
           or (entry.value->'account'->>'bucket' = 'IN_TRANSIT' and (entry.value->'account'->>'reservationId' is not null or entry.value->'account'->>'shipmentId' is null))
         )
    into entry_count, debit_count, credit_count, conservation_total,
         distinct_location_count, distinct_batch_count, distinct_commodity_count,
         distinct_country_count, distinct_unit_count, distinct_title_holder_count,
         distinct_risk_bearer_count, distinct_recognition_count, invalid_entry_count
    from jsonb_array_elements(payload->'entries') as entry(value);
  if entry_count <> 2 or debit_count <> 1 or credit_count <> 1
     or conservation_total <> 0 or invalid_entry_count <> 0
     or distinct_batch_count <> 1 or distinct_commodity_count <> 1
     or distinct_unit_count <> 1 then
    raise exception 'Inventory Posting entries violate exact V08 conservation or account shape'
      using errcode = '23514';
  end if;
  select entry.value->'account'->>'bucket'
    into source_bucket
    from jsonb_array_elements(payload->'entries') as entry(value)
   where (entry.value->'delta'->>'amount')::numeric < 0;
  select entry.value->'account'->>'bucket'
    into destination_bucket
    from jsonb_array_elements(payload->'entries') as entry(value)
   where (entry.value->'delta'->>'amount')::numeric > 0;
  if (row_value.operation = 'RESERVE' and (source_bucket <> 'AVAILABLE' or destination_bucket <> 'RESERVED'))
     or (row_value.operation = 'RELEASE' and (source_bucket <> 'RESERVED' or destination_bucket <> 'AVAILABLE'))
     or (row_value.operation = 'SHIP' and (source_bucket <> 'RESERVED' or destination_bucket <> 'IN_TRANSIT'))
     or (row_value.operation = 'DELIVER' and (source_bucket <> 'IN_TRANSIT' or destination_bucket <> 'AVAILABLE'))
     or (row_value.operation <> 'DELIVER' and (
       distinct_country_count <> 1 or distinct_title_holder_count <> 1
       or distinct_risk_bearer_count <> 1
       or distinct_recognition_count <> 1
     ))
     or (row_value.operation in ('RESERVE', 'RELEASE') and distinct_location_count <> 1) then
    raise exception 'Inventory Posting operation does not match the exact V08 account movement rules'
      using errcode = '23514';
  end if;
end;
$$;

create or replace function world_v2.validate_financial_posting_payload(payload jsonb, row_value world_v2.financial_posting_batch)
returns void
language plpgsql
as $$
declare
  leg_count bigint;
  debit_total numeric;
  credit_total numeric;
  invalid_leg_count bigint;
  distinct_account_count bigint;
  distinct_leg_count bigint;
  invalid_counterparty_count bigint;
begin
  if jsonb_typeof(payload) <> 'object'
     or (select array_agg(key order by key) from jsonb_object_keys(payload) as key) is distinct from array[
       'batchId', 'causationCommandId', 'causationEventIds', 'legs',
       'schemaVersion', 'settlementCurrency', 'simTime', 'transitionBinding',
       'worldId', 'worldVersionAfter', 'worldVersionBefore'
     ] then
    raise exception 'Financial Posting payload has an unexpected canonical shape'
      using errcode = '23514';
  end if;
  if payload->>'schemaVersion' <> 'financial-posting-v1'
     or payload->>'batchId' <> row_value.batch_id
     or payload->>'worldId' <> row_value.world_id
     or payload->>'causationCommandId' <> row_value.causation_command_id
     or payload->>'worldVersionBefore' <> row_value.world_version_before::text
     or payload->>'worldVersionAfter' <> row_value.world_version_after::text
     or payload->>'simTime' <> row_value.sim_time::text
     or payload->>'settlementCurrency' <> row_value.settlement_currency
     or payload->'causationEventIds' is distinct from row_value.event_ids
     or payload->'transitionBinding' is distinct from row_value.transition_binding::jsonb
     or payload->>'settlementCurrency' !~ '^[A-Z]{3}$' then
    raise exception 'Financial Posting payload does not match authoritative columns'
      using errcode = '23514';
  end if;
  if jsonb_typeof(payload->'legs') <> 'array' then
    raise exception 'Financial Posting legs must be an array'
      using errcode = '23514';
  end if;
  select count(*),
         count(distinct leg.value->>'legId'),
         count(distinct leg.value->'account'->>'accountId'),
         coalesce(sum(case when leg.value->>'direction' = 'DEBIT' then (leg.value->'amount'->>'amount')::numeric else 0 end), 0),
         coalesce(sum(case when leg.value->>'direction' = 'CREDIT' then (leg.value->'amount'->>'amount')::numeric else 0 end), 0),
         count(*) filter (where
           jsonb_typeof(leg.value) <> 'object'
           or (select array_agg(key order by key) from jsonb_object_keys(leg.value) as key) is distinct from array['account', 'amount', 'counterpartyAccountId', 'direction', 'legId']
           or jsonb_typeof(leg.value->'account') <> 'object'
           or (select array_agg(key order by key) from jsonb_object_keys(leg.value->'account') as key) is distinct from array[
             'accountClass', 'accountId', 'claimId', 'counterpartyEntityId',
             'countryId', 'currency', 'ownerId', 'worldId'
           ]
           or jsonb_typeof(leg.value->'amount') <> 'object'
           or (select array_agg(key order by key) from jsonb_object_keys(leg.value->'amount') as key) is distinct from array['amount', 'currency']
           or jsonb_typeof(leg.value->'amount'->'amount') <> 'string'
           or leg.value->'amount'->>'amount' !~ '^(?:0|[1-9][0-9]*)(?:\\.[0-9]*[1-9])?$'
           or length(regexp_replace(leg.value->'amount'->>'amount', '[.]', '', 'g')) > 120
           or (leg.value->'amount'->>'amount')::numeric <= 0
           or leg.value->>'direction' not in ('DEBIT', 'CREDIT')
           or leg.value->'account'->>'worldId' <> row_value.world_id
           or leg.value->'amount'->>'currency' <> row_value.settlement_currency
           or leg.value->'account'->>'currency' <> row_value.settlement_currency
           or leg.value->'account'->>'accountClass' not in (
             'ASSET', 'CASH', 'DEPOSIT', 'EQUITY', 'EXPENSE', 'LIABILITY',
             'PAYABLE', 'RECEIVABLE', 'REVENUE'
           )
           or ((leg.value->'account'->>'claimId' is null) <> (leg.value->'account'->>'counterpartyEntityId' is null))
         ),
         count(*) filter (where
           leg.value->>'counterpartyAccountId' is not null
           and (leg.value->>'counterpartyAccountId' = leg.value->'account'->>'accountId'
             or not exists (
               select 1 from jsonb_array_elements(payload->'legs') as other(value)
                where other.value->'account'->>'accountId' = leg.value->>'counterpartyAccountId'
             ))
         )
    into leg_count, distinct_leg_count, distinct_account_count,
         debit_total, credit_total, invalid_leg_count, invalid_counterparty_count
    from jsonb_array_elements(payload->'legs') as leg(value);
  if leg_count < 2 or leg_count <> distinct_leg_count
     or leg_count <> distinct_account_count or debit_total <> credit_total
     or invalid_leg_count <> 0 or invalid_counterparty_count <> 0 then
    raise exception 'Financial Posting legs violate exact V08 balance or account rules'
      using errcode = '23514';
  end if;
end;
$$;

create or replace function world_v2.validate_authoritative_posting_payload()
returns trigger
language plpgsql
as $$
declare
  payload jsonb;
  expected_fingerprint text;
begin
  begin
    payload := new.canonical_payload::jsonb;
  exception when others then
    raise exception 'Posting canonical payload must be valid JSON'
      using errcode = '23514';
  end;
  if new.canonical_payload <> world_v2.canonical_json(payload) then
    raise exception 'Posting payload is not canonical JSON'
      using errcode = '23514';
  end if;
  expected_fingerprint := 'sha256:' || world_v2.authoritative_sha256(E'SHA-256\n' || new.canonical_payload);
  if tg_table_name = 'inventory_posting' then
    if new.posting_fingerprint <> expected_fingerprint then
      raise exception 'Inventory Posting fingerprint does not hash its canonical intent'
        using errcode = '23514';
    end if;
    perform world_v2.validate_inventory_posting_payload(payload, new);
  elsif tg_table_name = 'financial_posting_batch' then
    if new.batch_fingerprint <> expected_fingerprint then
      raise exception 'Financial Posting fingerprint does not hash its canonical intent'
        using errcode = '23514';
    end if;
    perform world_v2.validate_financial_posting_payload(payload, new);
  else
    raise exception 'Unsupported authoritative Posting table %', tg_table_name
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger inventory_posting_payload_is_verified
before insert on world_v2.inventory_posting
for each row execute function world_v2.validate_authoritative_posting_payload();

create trigger financial_posting_payload_is_verified
before insert on world_v2.financial_posting_batch
for each row execute function world_v2.validate_authoritative_posting_payload();
