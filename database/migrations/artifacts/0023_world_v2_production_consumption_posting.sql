-- PREPARATION_ONLY_NOT_V09_2_STARTED. Additive proposal, NOT production approval.
-- Apply in the sole release-chain transaction after 0001..0022; no runtime gate toggle.
-- Preserve the exact existing four-movement validator, including all its guards.
alter function world_v2.validate_inventory_posting_payload(jsonb, world_v2.inventory_posting)
  rename to validate_inventory_movement_payload_v1;

create function world_v2.production_assert_keys(value jsonb, expected text[], label text)
returns void language plpgsql immutable as $$
begin
  if jsonb_typeof(value) is distinct from 'object' then
    raise exception 'Production % must be an object', label using errcode = '23514';
  end if;
  if (select array_agg(key order by key) from jsonb_object_keys(value) key)
     is distinct from (select array_agg(key order by key) from unnest(expected) key) then
    raise exception 'Production % has an unexpected shape', label using errcode = '23514';
  end if;
end;
$$;

create function world_v2.production_decimal(value jsonb, signed_value boolean default false)
returns numeric language plpgsql immutable as $$
declare rendered text;
begin
  rendered := value #>> '{}';
  if jsonb_typeof(value) is distinct from 'string'
     or rendered !~ '^-?(0|[1-9][0-9]*)([.][0-9]*[1-9])?$'
     or rendered = '-0' or length(regexp_replace(rendered, '[-.]', '', 'g')) > 120
     or (not signed_value and rendered like '-%') then
    raise exception 'Production quantity requires an exact canonical decimal string' using errcode = '23514';
  end if;
  return rendered::numeric;
end;
$$;

create function world_v2.production_quantity(value jsonb, expected_unit text)
returns numeric language plpgsql immutable as $$
begin
  perform world_v2.production_assert_keys(value, array['amount','unit'], 'quantity');
  if value->>'unit' is distinct from expected_unit or expected_unit is null
     or expected_unit !~ '^[A-Za-z][A-Za-z0-9 _/-]{0,63}$' then
    raise exception 'Production quantity unit mismatch' using errcode = '23514';
  end if;
  return world_v2.production_decimal(value->'amount');
end;
$$;

create function world_v2.production_rate(value jsonb, input_unit text, output_unit text)
returns numeric language plpgsql immutable as $$
declare coefficient numeric;
begin
  perform world_v2.production_assert_keys(value, array['amount','inputUnit','outputUnit'], 'coefficient');
  coefficient := world_v2.production_decimal(value->'amount');
  if value->>'inputUnit' is distinct from input_unit or value->>'outputUnit' is distinct from output_unit
     or input_unit is null or output_unit is null or coefficient <= 0 then
    raise exception 'Production requires an explicit positive dimensional coefficient' using errcode = '23514';
  end if;
  return coefficient;
end;
$$;

create function world_v2.production_account(value jsonb, world text, country text, operator text)
returns void language plpgsql immutable as $$
declare field text;
begin
  perform world_v2.production_assert_keys(value, array[
    'batchId','bucket','commodityId','countryId','economicRecognitionId','physicalLocationId',
    'reservationId','riskBearerId','shipmentId','titleHolderId','unit','worldId'
  ], 'account');
  foreach field in array array['batchId','commodityId','countryId','physicalLocationId','riskBearerId','titleHolderId','worldId'] loop
    if jsonb_typeof(value->field) is distinct from 'string' or value->>field !~ '^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$' then
      raise exception 'Production account identity invalid' using errcode = '23514';
    end if;
  end loop;
  if value->>'worldId' is distinct from world or value->>'countryId' is distinct from country
     or value->>'titleHolderId' is distinct from operator or value->>'riskBearerId' is distinct from operator
     or value->>'bucket' is distinct from 'AVAILABLE' or value->'reservationId' is distinct from 'null'::jsonb
     or value->'shipmentId' is distinct from 'null'::jsonb or jsonb_typeof(value->'unit') is distinct from 'string'
     or value->>'unit' !~ '^[A-Za-z][A-Za-z0-9 _/-]{0,63}$'
     or (value->'economicRecognitionId' <> 'null'::jsonb and value->>'economicRecognitionId' !~ '^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$') then
    raise exception 'Production account World/country/OP title/risk/bucket/unit invalid' using errcode = '23514';
  end if;
end;
$$;

create function world_v2.production_fact(fact jsonb, trace jsonb)
returns void language plpgsql immutable as $$
declare field text;
begin
  perform world_v2.production_assert_keys(fact, array['factRef','sourceRef','predecessorFactRefs','snapshot','observedAt','payload','canonicalPayload'], 'source fact');
  foreach field in array array['factRef','sourceRef'] loop
    if jsonb_typeof(fact->field) is distinct from 'string' or fact->>field !~ '^[A-Za-z][A-Za-z0-9._:-]{0,127}$' then
      raise exception 'Production fact source identity missing' using errcode = '23514';
    end if;
  end loop;
  if fact->'snapshot' is distinct from trace->'snapshot' or fact->'observedAt' is distinct from trace->'snapshotAt'
     or fact->>'canonicalPayload' is distinct from world_v2.canonical_json(fact->'payload')
     or jsonb_typeof(fact->'predecessorFactRefs') is distinct from 'array' then
    raise exception 'Production fact mixed snapshot/time or payload evidence' using errcode = '23514';
  end if;
  if jsonb_array_length(fact->'predecessorFactRefs') = 0 or exists (
    select 1 from jsonb_array_elements(fact->'predecessorFactRefs') p
    where jsonb_typeof(p) <> 'string' or p #>> '{}' !~ '^[A-Za-z][A-Za-z0-9._:-]{0,127}$'
  ) or (select count(distinct p) from jsonb_array_elements(fact->'predecessorFactRefs') p) <> jsonb_array_length(fact->'predecessorFactRefs') then
    raise exception 'Production predecessor source evidence missing or duplicated' using errcode = '23514';
  end if;
end;
$$;

create function world_v2.production_use(use_value jsonb, before_value jsonb, required_value jsonb, actual numeric, potential numeric)
returns numeric language plpgsql immutable as $$
declare before_amount numeric; required_amount numeric; consumed numeric; after_amount numeric; unit text;
begin
  perform world_v2.production_assert_keys(use_value, array['inputRef','before','proposedConsumed','after','transition'], 'input consumption');
  unit := before_value->>'unit';
  before_amount := world_v2.production_quantity(before_value, unit);
  required_amount := world_v2.production_quantity(required_value, unit);
  consumed := world_v2.production_quantity(use_value->'proposedConsumed', unit);
  after_amount := world_v2.production_quantity(use_value->'after', unit);
  if use_value->'before' is distinct from before_value or consumed > before_amount
     or consumed * potential <> required_amount * actual or before_amount - consumed <> after_amount
     or use_value->'transition'->'before' is distinct from before_value
     or use_value->'transition'->'after' is distinct from use_value->'after'
     or use_value->'transition'->'delta'->>'unit' is distinct from unit
     or world_v2.production_decimal(use_value->'transition'->'delta'->'amount', true) <> -consumed then
    raise exception 'Production exact before-use=after/bottleneck conservation invalid' using errcode = '23514';
  end if;
  return consumed;
end;
$$;

create function world_v2.validate_inventory_production_payload(payload jsonb, row_value world_v2.inventory_posting)
returns void language plpgsql as $$
declare
  evidence jsonb; result_value jsonb; input_value jsonb; recipe jsonb; op jsonb; trace jsonb;
  output_account jsonb; cap jsonb; material jsonb; binding jsonb; recipe_material jsonb; use_value jsonb;
  entry jsonb; country text; unit text; field text; actual numeric; potential numeric; consumed numeric;
  before_amount numeric; required_amount numeric; bottleneck boolean; positive_entries bigint; count_found bigint;
begin
  perform world_v2.production_assert_keys(payload, array['schemaVersion','postingId','worldId','causationCommandId','causationEventIds','worldVersionBefore','worldVersionAfter','simTime','transitionBinding','operation','entries','evidence','result'], 'posting');
  if payload->>'schemaVersion' is distinct from 'inventory-production-consumption-v1'
     or payload->>'operation' is distinct from 'PRODUCE_AND_CONSUME'
     or payload->>'postingId' is distinct from row_value.posting_id
     or payload->>'worldId' is distinct from row_value.world_id
     or payload->>'causationCommandId' is distinct from row_value.causation_command_id
     or payload->>'worldVersionBefore' is distinct from row_value.world_version_before::text
     or payload->>'worldVersionAfter' is distinct from row_value.world_version_after::text
     or payload->>'simTime' is distinct from row_value.sim_time::text
     or payload->'causationEventIds' is distinct from row_value.event_ids
     or payload->'transitionBinding' is distinct from row_value.transition_binding::jsonb then
    raise exception 'Production payload does not match transition columns' using errcode = '23514';
  end if;
  evidence := payload->'evidence'; result_value := payload->'result'; input_value := evidence->'input';
  perform world_v2.production_assert_keys(evidence, array['runId','inventorySnapshotHash','input','recipe','operating','materials','output'], 'evidence');
  perform world_v2.production_assert_keys(input_value, array['trace','outcomeRef','capacity','materials','energy','labour','logistics'], 'V13 input');
  trace := input_value->'trace'; recipe := evidence->'recipe'->'payload'; op := evidence->'operating'->'payload'; output_account := evidence->'output';
  perform world_v2.production_assert_keys(result_value,array['foundationStatus','outcomeRef','facilityRef','potentialOutput','actualOutput','bottleneckFactor','materialConsumption','energyConsumption','labourConsumption','logisticsConsumption','outputTransition','replayProof'],'V13 result');
  perform world_v2.production_assert_keys(trace,array['traceRef','calculationVersion','snapshot','snapshotAt'],'trace');
  perform world_v2.production_assert_keys(trace->'snapshot',array['lineageRef','sourceVersion','snapshotRef','snapshotHash','predecessorSnapshotHash'],'snapshot');
  perform world_v2.production_assert_keys(recipe, array['facilityRef','outputCommodityId','outputUnit','materials','energyPerOutput','labourPerOutput','logisticsPerOutput','costPerOutput'], 'recipe');
  perform world_v2.production_assert_keys(op, array['worldId','worldVersion','facilityRef','operatorId','operatorClassification','maintenanceAppliedRef','technologyRightRef','operatingPermissionRef','costSourceRef','fundingBatchId','fundingFingerprint','costLegId','settledCost'], 'operating facts');
  select country_id into country from world_v2.command_submission where world_id = row_value.world_id and command_id = row_value.causation_command_id;
  foreach field in array array['runId','inventorySnapshotHash'] loop
    if jsonb_typeof(evidence->field) is distinct from 'string' then
      raise exception 'Production source identity/hash missing' using errcode = '23514';
    end if;
  end loop;
  foreach field in array array['facilityRef','operatorId','fundingBatchId','fundingFingerprint','costLegId'] loop
    if jsonb_typeof(op->field) is distinct from 'string' then
      raise exception 'Production operating identity missing' using errcode = '23514';
    end if;
  end loop;
  if op->>'facilityRef' !~ '^[A-Za-z][A-Za-z0-9._:-]{0,127}$' or input_value->>'outcomeRef' !~ '^[A-Za-z][A-Za-z0-9._:-]{0,127}$'
     or jsonb_typeof(input_value->'outcomeRef') is distinct from 'string'
     or result_value->>'foundationStatus' is distinct from 'FOUNDATION_IMPLEMENTED_UNVERIFIED'
     or jsonb_typeof(trace->'snapshot'->'snapshotHash') is distinct from 'string'
     or trace->'snapshot'->>'snapshotHash' !~ '^[a-f0-9]{64}$' then
    raise exception 'Production calculation identity invalid' using errcode = '23514';
  end if;
  if op->>'operatorClassification' is distinct from 'OP' or op->>'worldId' is distinct from row_value.world_id
     or op->>'worldVersion' is distinct from row_value.world_version_before::text
     or trace->'snapshot'->>'sourceVersion' is distinct from 'WORLD_VERSION.' || row_value.world_version_before::text
     or trace->'snapshotAt' is distinct from jsonb_build_object('amount',row_value.sim_time::text,'unit','sim_millisecond')
     or evidence->>'runId' !~ '^[A-Za-z][A-Za-z0-9._:-]{0,127}$'
     or evidence->>'inventorySnapshotHash' !~ '^sha256:[a-f0-9]{64}$'
     or op->>'fundingFingerprint' !~ '^sha256:[a-f0-9]{64}$' then
    raise exception 'Production operating/source/version scope invalid' using errcode = '23514';
  end if;
  foreach field in array array['maintenanceAppliedRef','technologyRightRef','operatingPermissionRef','costSourceRef'] loop
    if jsonb_typeof(op->field) is distinct from 'string' or op->>field !~ '^[A-Za-z][A-Za-z0-9._:-]{0,127}$' then
      raise exception 'Production requires explicit maintenance/licence/permission/cost source' using errcode = '23514';
    end if;
  end loop;
  perform world_v2.production_fact(evidence->'recipe', trace);
  perform world_v2.production_fact(evidence->'operating', trace);
  foreach field in array array['capacity','energy','labour','logistics'] loop
    perform world_v2.production_fact(input_value->field, trace);
  end loop;
  perform world_v2.production_account(output_account, row_value.world_id, country, op->>'operatorId');
  unit := output_account->>'unit';
  if unit is distinct from recipe->>'outputUnit' or output_account->>'commodityId' is distinct from recipe->>'outputCommodityId'
     or result_value->>'facilityRef' is distinct from op->>'facilityRef' or recipe->>'facilityRef' is distinct from op->>'facilityRef'
     or result_value->>'outcomeRef' is distinct from input_value->>'outcomeRef' then
    raise exception 'Production recipe/output/facility identity mismatch' using errcode = '23514';
  end if;
  potential := world_v2.production_quantity(result_value->'potentialOutput', unit);
  actual := world_v2.production_quantity(result_value->'actualOutput', unit);
  cap := input_value->'capacity'->'payload';
  if actual <= 0 or potential <= 0 or actual > potential or cap->>'facilityRef' is distinct from op->>'facilityRef'
     or world_v2.production_quantity(cap->'targetUtilisation','ratio') > 1
     or potential <> world_v2.production_rate(cap->'operationalCapacity',cap->'operatingDuration'->>'unit',cap->'operationalCapacity'->>'outputUnit')
       * world_v2.production_quantity(cap->'operatingDuration',cap->'operatingDuration'->>'unit')
       * world_v2.production_quantity(cap->'targetUtilisation','ratio')
       * world_v2.production_rate(cap->'productivity',cap->'operationalCapacity'->>'outputUnit',unit) then
    raise exception 'Production must use actual bounded V13 output' using errcode = '23514';
  end if;
  bottleneck := actual = potential;
  if jsonb_typeof(input_value->'materials') is distinct from 'array' or jsonb_typeof(evidence->'materials') is distinct from 'array'
     or jsonb_typeof(recipe->'materials') is distinct from 'array' or jsonb_typeof(result_value->'materialConsumption') is distinct from 'array'
     or jsonb_typeof(payload->'entries') is distinct from 'array' then
    raise exception 'Production requires material and entry arrays' using errcode = '23514';
  end if;
  if jsonb_array_length(input_value->'materials') = 0 or jsonb_array_length(input_value->'materials') <> jsonb_array_length(evidence->'materials')
     or jsonb_array_length(recipe->'materials') <> jsonb_array_length(evidence->'materials')
     or jsonb_array_length(result_value->'materialConsumption') <> jsonb_array_length(evidence->'materials')
     or (select count(distinct m->'payload'->>'materialRef') from jsonb_array_elements(input_value->'materials') m) <> jsonb_array_length(evidence->'materials')
     or (select count(distinct m->>'materialRef') from jsonb_array_elements(evidence->'materials') m) <> jsonb_array_length(evidence->'materials')
     or (select count(distinct m->>'materialRef') from jsonb_array_elements(recipe->'materials') m) <> jsonb_array_length(evidence->'materials') then
    raise exception 'Production material mappings must be complete and unique' using errcode = '23514';
  end if;
  positive_entries := 0;
  for entry in select value from jsonb_array_elements(payload->'entries') loop
    perform world_v2.production_assert_keys(entry,array['account','delta'],'entry');
    perform world_v2.production_account(entry->'account',row_value.world_id,country,op->>'operatorId');
    perform world_v2.production_assert_keys(entry->'delta',array['amount','unit'],'delta');
    if entry->'delta'->>'unit' is distinct from entry->'account'->>'unit' then
      raise exception 'Production entry unit mismatch' using errcode = '23514';
    end if;
    consumed := world_v2.production_decimal(entry->'delta'->'amount',true);
    if consumed = 0 then raise exception 'Production entries cannot have zero deltas' using errcode = '23514'; end if;
    if consumed > 0 then
      positive_entries := positive_entries + 1;
      if entry->'account' is distinct from output_account or consumed <> actual then
        raise exception 'Production output entry differs from actual output' using errcode = '23514';
      end if;
    end if;
  end loop;
  if positive_entries <> 1 or (select count(distinct e->'account') from jsonb_array_elements(payload->'entries') e) <> jsonb_array_length(payload->'entries') then
    raise exception 'Production needs one output and unique accounts' using errcode = '23514';
  end if;
  for material in select value from jsonb_array_elements(input_value->'materials') loop
    perform world_v2.production_fact(material,trace);
    select m into binding from jsonb_array_elements(evidence->'materials') m where m->>'materialRef' = material->'payload'->>'materialRef';
    select m into recipe_material from jsonb_array_elements(recipe->'materials') m where m->>'materialRef' = material->'payload'->>'materialRef';
    select m into use_value from jsonb_array_elements(result_value->'materialConsumption') m where m->>'inputRef' = material->'payload'->>'materialRef';
    if binding is null or recipe_material is null or use_value is null or material->'payload'->'readOnly' is distinct from 'true'::jsonb
       or binding->'account'->>'batchId' is distinct from material->'payload'->>'inventoryRef'
       or binding->'account'->>'commodityId' is distinct from recipe_material->>'commodityId'
       or binding->'account'->>'batchId' = output_account->>'batchId' then
      raise exception 'Production material source/batch/recipe mismatch' using errcode = '23514';
    end if;
    perform world_v2.production_account(binding->'account',row_value.world_id,country,op->>'operatorId');
    before_amount := world_v2.production_quantity(material->'payload'->'usableBefore',binding->'account'->>'unit');
    required_amount := world_v2.production_quantity(material->'payload'->'requiredAtPotentialOutput',binding->'account'->>'unit');
    if required_amount <> world_v2.production_rate(recipe_material->'perOutput',unit,binding->'account'->>'unit') * potential
       or actual * required_amount > before_amount * potential then
      raise exception 'Production material recipe or availability bound invalid' using errcode = '23514';
    end if;
    bottleneck := bottleneck or actual * required_amount = before_amount * potential;
    consumed := world_v2.production_use(use_value,material->'payload'->'usableBefore',material->'payload'->'requiredAtPotentialOutput',actual,potential);
    select count(*) into count_found from jsonb_array_elements(payload->'entries') e
      where e->'account' = binding->'account' and world_v2.production_decimal(e->'delta'->'amount',true) = -consumed;
    if consumed <= 0 or count_found <> 1 then raise exception 'Production input entry missing or duplicated' using errcode = '23514'; end if;
  end loop;
  if jsonb_array_length(payload->'entries') <> jsonb_array_length(evidence->'materials') + 1 then
    raise exception 'Production has an unrelated input account' using errcode = '23514';
  end if;
  foreach field in array array['energy','labour','logistics'] loop
    material := input_value->field->'payload';
    before_amount := world_v2.production_quantity(case when field = 'energy' then material->'deliveredBefore' else material->'availableBefore' end,
      case when field = 'energy' then 'MWh' else material->'availableBefore'->>'unit' end);
    required_amount := world_v2.production_quantity(material->'requiredAtPotentialOutput',case when field = 'energy' then 'MWh' else material->'availableBefore'->>'unit' end);
    if required_amount <> world_v2.production_rate(recipe->(field || 'PerOutput'),unit,material->'requiredAtPotentialOutput'->>'unit') * potential
       or actual * required_amount > before_amount * potential then
      raise exception 'Production operational input recipe or bound invalid' using errcode = '23514';
    end if;
    bottleneck := bottleneck or actual * required_amount = before_amount * potential;
    use_value := result_value->(field || 'Consumption');
    if use_value->>'inputRef' is distinct from (case when field = 'energy' then material->>'allocationRef' else material->>'capacityRef' end) then
      raise exception 'Production operational consumption source mismatch' using errcode = '23514';
    end if;
    perform world_v2.production_use(use_value,case when field = 'energy' then material->'deliveredBefore' else material->'availableBefore' end,material->'requiredAtPotentialOutput',actual,potential);
  end loop;
  if not bottleneck or world_v2.production_quantity(result_value->'bottleneckFactor','ratio') * potential <> actual then
    raise exception 'Production output does not equal the real limiting input' using errcode = '23514';
  end if;
  if result_value->'outputTransition'->'before' is distinct from jsonb_build_object('amount','0','unit',unit)
     or result_value->'outputTransition'->'delta' is distinct from result_value->'actualOutput'
     or result_value->'outputTransition'->'after' is distinct from result_value->'actualOutput' then
    raise exception 'Production output transition must recognize exactly one actual output' using errcode = '23514';
  end if;
  perform world_v2.production_assert_keys(op->'settledCost',array['amount','currency'],'settled cost');
  if jsonb_typeof(op->'settledCost'->'currency') is distinct from 'string' or op->'settledCost'->>'currency' !~ '^[A-Z]{3}$' or world_v2.production_decimal(op->'settledCost'->'amount') <= 0
     or world_v2.production_decimal(op->'settledCost'->'amount') <> world_v2.production_rate(recipe->'costPerOutput',unit,op->'settledCost'->>'currency') * actual then
    raise exception 'Production exact actual cost/recipe missing' using errcode = '23514';
  end if;
  select count(*) into count_found from world_v2.authoritative_event e
    where e.world_id = row_value.world_id and e.causation_command_id = row_value.causation_command_id
      and e.world_version = row_value.world_version_after and e.event_type = 'INDUSTRY_PRODUCTION_SETTLED'
      and e.canonical_payload = world_v2.canonical_json(jsonb_build_object('schemaVersion',payload->'schemaVersion','evidence',evidence,'result',result_value))
      and e.payload_sha256 = 'sha256:' || world_v2.authoritative_sha256(E'SHA-256\n' || e.canonical_payload);
  if count_found <> 1 then raise exception 'Production requires one exact bound settlement Event' using errcode = '23514'; end if;
  if exists (select 1 from world_v2.command_receipt r where r.world_id = row_value.world_id and r.command_id = row_value.causation_command_id) then
    raise exception 'Cannot append production after a final receipt' using errcode = '55000';
  end if;
  if exists (select 1 from world_v2.inventory_posting p, lateral jsonb_array_elements(p.canonical_payload::jsonb->'entries') e
    where p.world_id = row_value.world_id and p.world_version_after <= row_value.world_version_before and e->'account'->>'batchId' = output_account->>'batchId')
    or exists (select 1 from world_v2.opening_seed s, lateral jsonb_array_elements(s.canonical_payload::jsonb->'inventoryEntries') e
      where s.world_id = row_value.world_id and e->'account'->>'batchId' = output_account->>'batchId') then
    raise exception 'Production output batch is not new in the same World lineage' using errcode = '23514';
  end if;
end;
$$;

create function world_v2.validate_inventory_posting_payload(payload jsonb, row_value world_v2.inventory_posting)
returns void language plpgsql as $$
begin
  if row_value.operation = 'PRODUCE_AND_CONSUME' then
    perform world_v2.validate_inventory_production_payload(payload,row_value);
  else
    perform world_v2.validate_inventory_movement_payload_v1(payload,row_value);
  end if;
end;
$$;

alter table world_v2.inventory_posting drop constraint inventory_posting_operation_check;
alter table world_v2.inventory_posting add constraint inventory_posting_operation_check
  check (operation in ('RESERVE','RELEASE','SHIP','DELIVER','PRODUCE_AND_CONSUME'));

-- Same append-only table; the indexes are recognition guards, not a shadow ledger.
create unique index inventory_production_run_once on world_v2.inventory_posting
  (world_id, ((canonical_payload::jsonb)->'evidence'->>'runId')) where operation = 'PRODUCE_AND_CONSUME';
create unique index inventory_production_outcome_once on world_v2.inventory_posting
  (world_id, ((canonical_payload::jsonb)->'result'->>'outcomeRef')) where operation = 'PRODUCE_AND_CONSUME';
create unique index inventory_production_facility_tick_once on world_v2.inventory_posting
  (world_id, ((canonical_payload::jsonb)->'result'->>'facilityRef'), sim_time) where operation = 'PRODUCE_AND_CONSUME';
create unique index inventory_production_batch_once on world_v2.inventory_posting
  (world_id, ((canonical_payload::jsonb)->'evidence'->'output'->>'batchId')) where operation = 'PRODUCE_AND_CONSUME';
create unique index inventory_production_cost_once on world_v2.inventory_posting
  (world_id, ((canonical_payload::jsonb)->'evidence'->'operating'->'payload'->>'fundingBatchId'),
   ((canonical_payload::jsonb)->'evidence'->'operating'->'payload'->>'costLegId')) where operation = 'PRODUCE_AND_CONSUME';

create function world_v2.validate_production_final_receipt_and_funding()
returns trigger language plpgsql as $$
declare op jsonb; cost numeric; country text; count_found bigint;
begin
  op := new.canonical_payload::jsonb->'evidence'->'operating'->'payload';
  cost := world_v2.production_decimal(op->'settledCost'->'amount');
  select country_id into country from world_v2.command_submission where world_id = new.world_id and command_id = new.causation_command_id;
  if not exists (select 1 from world_v2.command_receipt r where r.world_id = new.world_id and r.command_id = new.causation_command_id
    and r.outcome = 'COMMITTED' and r.transition_id = new.causation_command_id
    and r.world_version_before = new.world_version_before and r.world_version_after = new.world_version_after
    and r.event_ids = new.event_ids and r.sim_time = new.sim_time) then
    raise exception 'Production requires its complete committed final receipt in the same transaction' using errcode = '23514';
  end if;
  select count(*) into count_found from world_v2.financial_posting_batch b,
    lateral jsonb_array_elements(b.canonical_payload::jsonb->'legs') expense
    where b.world_id = new.world_id and b.batch_id = op->>'fundingBatchId' and b.batch_fingerprint = op->>'fundingFingerprint'
      and b.world_version_after <= new.world_version_after
      and expense->>'legId' = op->>'costLegId' and expense->>'direction' = 'DEBIT'
      and expense->'account'->>'accountClass' = 'EXPENSE' and expense->'account'->>'ownerId' = op->>'operatorId'
      and expense->'account'->>'countryId' = country and expense->'amount'->>'currency' = op->'settledCost'->>'currency'
      and world_v2.production_decimal(expense->'amount'->'amount') = cost
      and (select count(*) from jsonb_array_elements(b.canonical_payload::jsonb->'legs') cash
        where cash->>'direction' = 'CREDIT' and cash->'account'->>'accountClass' in ('CASH','DEPOSIT')
          and cash->'account'->>'ownerId' = op->>'operatorId' and cash->'account'->>'countryId' = country
          and cash->'amount'->>'currency' = op->'settledCost'->>'currency') = 1
      and exists (select 1 from jsonb_array_elements(b.canonical_payload::jsonb->'legs') cash
        where cash->>'direction' = 'CREDIT' and cash->'account'->>'accountClass' in ('CASH','DEPOSIT')
          and cash->'account'->>'ownerId' = op->>'operatorId' and cash->'account'->>'countryId' = country
          and cash->'amount'->>'currency' = op->'settledCost'->>'currency'
          and world_v2.production_decimal(cash->'amount'->'amount') = cost)
      and exists (select 1 from world_v2.command_receipt r where r.world_id = b.world_id and r.command_id = b.causation_command_id
        and r.outcome = 'COMMITTED' and r.world_version_before = b.world_version_before and r.world_version_after = b.world_version_after
        and r.event_ids = b.event_ids and r.sim_time = b.sim_time);
  if count_found <> 1 then raise exception 'Production requires actual committed matching OP expense and cash funding' using errcode = '23514'; end if;
  return new;
end;
$$;

create constraint trigger inventory_production_final_receipt_and_funding
after insert on world_v2.inventory_posting deferrable initially deferred
for each row when (new.operation = 'PRODUCE_AND_CONSUME')
execute function world_v2.validate_production_final_receipt_and_funding();

create trigger inventory_production_history_cannot_truncate
before truncate on world_v2.inventory_posting for each statement
execute function world_v2.reject_authoritative_history_mutation();

comment on function world_v2.validate_inventory_production_payload(jsonb, world_v2.inventory_posting) is
  'Candidate-only E08 production shape, exact recipe/actual-use conservation and bound settlement Event. Core/source authorization, E09/E03 consumption, replay and worker admission remain separate mandatory runtime gates.';
