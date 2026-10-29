-- Reviewed candidate proposal only; no production execution is authorized here.
-- Canonical migration 0009 and its registered checksum remain unchanged.
-- Its function's sole semantic correction is [.] for the decimal separator:
-- with standard_conforming_strings=on, the previous double-backslash literal
-- matched a backslash instead of an ordinary decimal point.
-- CREATE OR REPLACE preserves the existing function owner and EXECUTE ACL.
-- All shape, exact balance, account, counterparty, amount precision, currency,
-- transition-column and positive-amount constraints below are retained.
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
           or leg.value->'amount'->>'amount' !~ '^(?:0|[1-9][0-9]*)(?:[.][0-9]*[1-9])?$'
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
