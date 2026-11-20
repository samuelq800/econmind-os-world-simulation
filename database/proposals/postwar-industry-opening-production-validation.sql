-- CANDIDATE ONLY. Preserve immutable 0023 and every original accounting,
-- inventory, Event, FINAL and funding check. Adds only the already-adopted
-- finite opening basis variants; source authenticity still requires the fixed
-- same-transaction Industry cutoff. No new roles, data or fake refs.
-- Requires postwar-industry-production-source.sql: its existing NOLOGIN source
-- owner has exact World-scoped opening_seed SELECT/RLS. Enrolled worker roles
-- need an explicit reviewed EXECUTE grant on the boolean helper below. In
-- particular NOINHERIT workers cannot rely on group membership. This candidate
-- intentionally enrolls no worker/reader and grants no raw seed table access.
begin;
grant create on schema world_v2 to world_v2_industry_source_owner;
-- Immutable seed lookup only. This issues no admission, source or commit proof.
-- Extract the inventory JSON slice without constructing a whole-seed jsonb tree.
create function world_v2.industry_opening_inventory_batch_exists(p_world text,p_batch text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare entries json;begin
 if p_world is null or p_world!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or p_batch is null or p_batch!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'then raise exception 'Exact production output World and batch required'using errcode='22023';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 select s.canonical_payload::json->'inventoryEntries'into entries from world_v2.opening_seed s where s.world_id=p_world;
 if not found then raise exception 'Actual immutable opening seed required for output uniqueness'using errcode='55000';end if;
 if json_typeof(entries)is distinct from 'array'or exists(select 1 from json_array_elements(entries)e where e->'account'->>'worldId'is distinct from p_world or json_typeof(e->'account'->'batchId')is distinct from 'string')then raise exception 'Actual opening inventory World and batch structure required'using errcode='23514';end if;
 return exists(select 1 from json_array_elements(entries)e where e->'account'->>'batchId'=p_batch);
end;$$;
alter function world_v2.industry_opening_inventory_batch_exists(text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.industry_opening_inventory_batch_exists(text,text)from public;
revoke create on schema world_v2 from world_v2_industry_source_owner;
create or replace function world_v2.validate_inventory_production_payload(payload jsonb, row_value world_v2.inventory_posting)
returns void language plpgsql set search_path=pg_catalog as $$
declare
  evidence jsonb; result_value jsonb; input_value jsonb; recipe jsonb; op jsonb; trace jsonb;
  output_account jsonb; cap jsonb; material jsonb; binding jsonb; recipe_material jsonb; use_value jsonb;
  entry jsonb; country text; unit text; field text; actual numeric; potential numeric; consumed numeric;
  before_amount numeric; required_amount numeric; bottleneck boolean; positive_entries bigint; count_found bigint;
  basis jsonb; basis_key text; basis_keys text[]; op_keys text[]; duration_ticks numeric; time_factor numeric;
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
  op_keys := array['worldId','worldVersion','facilityRef','operatorId','operatorClassification','maintenanceAppliedRef','technologyRightRef','operatingPermissionRef','costSourceRef','fundingBatchId','fundingFingerprint','costLegId','settledCost'];
  foreach field in array array['maintenanceBasis','openingServiceability','baselineTechnologyNonrequirement'] loop
    if op ? field then op_keys := array_append(op_keys,field);end if;
  end loop;
  perform world_v2.production_assert_keys(op, op_keys, 'operating facts');
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
  foreach field in array array['operatingPermissionRef','costSourceRef'] loop
    if jsonb_typeof(op->field) is distinct from 'string' or op->>field !~ '^[A-Za-z][A-Za-z0-9._:-]{0,127}$' then
      raise exception 'Production requires explicit maintenance/licence/permission/cost source' using errcode = '23514';
    end if;
  end loop;
  -- The original actual-maintenance/licence variant remains intact. These
  -- explicit alternatives prove only finite opening basis, never completed work.
  if op->'maintenanceAppliedRef' = 'null'::jsonb then
    if op->>'maintenanceBasis' is distinct from 'OPENING_SERVICEABLE_NOT_COMPLETED_MAINTENANCE' or not(op ? 'openingServiceability')then raise exception 'Opening maintenance basis required'using errcode='23514';end if;
  elsif jsonb_typeof(op->'maintenanceAppliedRef')is distinct from 'string' or op->>'maintenanceAppliedRef'!~'^[A-Za-z][A-Za-z0-9._:-]{0,127}$' or op ? 'openingServiceability' or (op ? 'maintenanceBasis' and op->>'maintenanceBasis'is distinct from 'COMPLETED_MAINTENANCE')then
    raise exception 'Actual maintenance and opening serviceability cannot be conflated'using errcode='23514';
  end if;
  if op->'technologyRightRef' = 'null'::jsonb then
    if not(op ? 'baselineTechnologyNonrequirement')then raise exception 'Explicit baseline technology required'using errcode='23514';end if;
  elsif jsonb_typeof(op->'technologyRightRef')is distinct from 'string' or op->>'technologyRightRef'!~'^[A-Za-z][A-Za-z0-9._:-]{0,127}$' or op ? 'baselineTechnologyNonrequirement'then
    raise exception 'Actual technology rights and baseline recipe cannot be conflated'using errcode='23514';
  end if;
  foreach basis_key in array array['openingServiceability','baselineTechnologyNonrequirement']loop
    if not(op ? basis_key)then continue;end if;
    basis:=op->basis_key;
    basis_keys:=array['schemaVersion','policyVersion','policyRawSha256','userAdoptionRawSha256','worldId','countryId','facilityRef','operatorId','seedId','seedFingerprint','sourceRef','sourceRawSha256','sourcePointer','rightsScope','openingWindowStartsAtSimTime','openingWindowEndsAtSimTime'];
    if basis_key='openingServiceability'then basis_keys:=basis_keys||array['originalConditionFraction'];
    else basis_keys:=basis_keys||array['basis','recipeFactRef','recipeSourceRef','recipeCanonicalPayload','baselineProductivity','baselineRequiredTechnologyRightRefs','excludedUpgradeTechnologyRefs'];end if;
    perform world_v2.production_assert_keys(basis,basis_keys,'finite opening basis');
    if basis->>'schemaVersion'is distinct from 'postwar-industry-first-day-basis-v1'
      or basis->>'policyVersion'is distinct from 'INDUSTRY_FIRST_DAY_20261101_V1'
      or basis->>'policyRawSha256'is distinct from '99ede2cbf1bb7b04d3fe5d99cf101c47ed055b2e12b8ca9080cfc2a43b3d086c'
      or basis->>'userAdoptionRawSha256'is distinct from '8d5fb70a2b2250201d623aa7898a95d48540083d6fa316a1b8e920abca0fd9d6'
      or basis->>'rightsScope'is distinct from 'DOMESTIC_EXISTING_UNFRAGMENTED_OP_AGGREGATE'
      or basis->>'worldId'is distinct from row_value.world_id or basis->>'countryId'is distinct from country
      or basis->>'facilityRef'is distinct from op->>'facilityRef' or basis->>'operatorId'is distinct from op->>'operatorId'
      or basis->'openingWindowStartsAtSimTime'is distinct from '"0"'::jsonb or basis->'openingWindowEndsAtSimTime'is distinct from '"86400000"'::jsonb
      or jsonb_typeof(basis->'seedId')is distinct from 'string' or basis->>'seedId'!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'
      or jsonb_typeof(basis->'seedFingerprint')is distinct from 'string' or basis->>'seedFingerprint'!~'^sha256:[a-f0-9]{64}$'
      or jsonb_typeof(basis->'sourceRawSha256')is distinct from 'string' or basis->>'sourceRawSha256'!~'^[a-f0-9]{64}$'
      or jsonb_typeof(basis->'sourceRef')is distinct from 'string' or basis->>'sourceRef'!~'^[A-Za-z][A-Za-z0-9._:-]{0,127}$'
      or jsonb_typeof(basis->'sourcePointer')is distinct from 'string' or length(basis->>'sourcePointer')not between 1 and 2048 or btrim(basis->>'sourcePointer')is distinct from basis->>'sourcePointer'
    then raise exception 'Exact adopted opening policy and scope required'using errcode='23514';end if;
    time_factor:=case input_value->'capacity'->'payload'->'operatingDuration'->>'unit'
      when 'sim_millisecond'then 1 when 'sim_second'then 1000 when 'second'then 1000 when 'sim_minute'then 60000 when 'minute'then 60000 when 'sim_hour'then 3600000 when 'hour'then 3600000 when 'sim_day'then 86400000 when 'day'then 86400000 else null end;
    duration_ticks:=world_v2.production_quantity(input_value->'capacity'->'payload'->'operatingDuration',input_value->'capacity'->'payload'->'operatingDuration'->>'unit')*time_factor;
    if time_factor is null or duration_ticks<=0 or trunc(duration_ticks)<>duration_ticks or row_value.sim_time<0 or row_value.sim_time>=86400000 or row_value.sim_time+duration_ticks>86400000 then raise exception 'Finite first-day operating window required'using errcode='23514';end if;
    if basis_key='openingServiceability'then
      if basis->'originalConditionFraction'is distinct from '"1"'::jsonb then raise exception 'Original condition must be exactly one'using errcode='23514';end if;
    else
      if basis->>'basis'is distinct from 'EXISTING_SITE_REFINERY_RECIPE_COEFFICIENTS'
        or basis->>'recipeFactRef'is distinct from evidence->'recipe'->>'factRef'
        or basis->>'recipeSourceRef'is distinct from evidence->'recipe'->>'sourceRef'
        or basis->>'recipeCanonicalPayload'is distinct from evidence->'recipe'->>'canonicalPayload'
        or basis->'baselineProductivity'is distinct from input_value->'capacity'->'payload'->'productivity'
        or basis->'baselineProductivity'->>'inputUnit'is distinct from basis->'baselineProductivity'->>'outputUnit'
        or world_v2.production_rate(basis->'baselineProductivity',basis->'baselineProductivity'->>'inputUnit',basis->'baselineProductivity'->>'outputUnit')>1
        or basis->'baselineRequiredTechnologyRightRefs'is distinct from '[]'::jsonb
        or jsonb_typeof(basis->'excludedUpgradeTechnologyRefs')is distinct from 'array'
      then raise exception 'Baseline recipe cannot grant upgrades or waive actual requirements'using errcode='23514';end if;
      if exists(select 1 from jsonb_array_elements(basis->'excludedUpgradeTechnologyRefs')r where jsonb_typeof(r)is distinct from 'string' or r#>>'{}'!~'^[A-Za-z][A-Za-z0-9._:-]{0,127}$')or(select count(distinct r)from jsonb_array_elements(basis->'excludedUpgradeTechnologyRefs')r)<>jsonb_array_length(basis->'excludedUpgradeTechnologyRefs')then raise exception 'Exact unique excluded upgrade references required'using errcode='23514';end if;
    end if;
  end loop;
  if op ? 'openingServiceability' and op ? 'baselineTechnologyNonrequirement'and (op->'openingServiceability'->>'seedId'is distinct from op->'baselineTechnologyNonrequirement'->>'seedId'or op->'openingServiceability'->>'seedFingerprint'is distinct from op->'baselineTechnologyNonrequirement'->>'seedFingerprint')then raise exception 'Opening basis must share the actual seed'using errcode='23514';end if;
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
    or world_v2.industry_opening_inventory_batch_exists(row_value.world_id,output_account->>'batchId') then
    raise exception 'Production output batch is not new in the same World lineage' using errcode = '23514';
  end if;
end;
$$;

commit;
