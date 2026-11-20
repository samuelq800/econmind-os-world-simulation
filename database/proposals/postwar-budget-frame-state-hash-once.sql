-- Forward candidate: unchanged complete-page reducer and all per-event checks.
-- Only duplicate budget state digest calculation is shared within this fold.
begin;
grant create on schema world_v2 to world_v2_postwar_projection_owner;
create or replace function world_v2.postwar_apply_current_frame_page(p_world text,p_frames_text text,p_state jsonb)returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare budget_before_hash text;budget_after_hash text;previous_budget_after jsonb;previous_budget_hash text;wanted jsonb;last_event_id text;last_event_fingerprint text;inv record;inventory jsonb;inventory_count bigint;inventory_total bigint;total_inventory bigint:=0;omos jsonb:='{}';rents jsonb:='{}';body jsonb;br record;batches jsonb;all_batches jsonb:='[]';total_batches bigint:=0;total_legs bigint:=0;actual_batch_count bigint;h record;a record;r record;c record;e record;command jsonb;event jsonb;events jsonb;transition jsonb;receipt jsonb;ep jsonb;first_body jsonb;frames jsonb:='[]';meta jsonb:='[]';wv bigint:=0;seq bigint:=0;bytes bigint:=0;seed_fp text;intent jsonb;policy jsonb;binding jsonb;before_state jsonb;after_state jsonb;env jsonb;next_env jsonb;envelopes jsonb:='[]';captains jsonb:='{}';fund jsonb;event_index integer;expected_type text;expected_count integer;utility boolean;utility_action text;expected_inventory integer;amount numeric;line_total numeric;
begin

 perform set_config('econmind.postwar_projection_world',p_world,true);
 if octet_length(p_frames_text)>1048576 or jsonb_typeof(p_frames_text::jsonb)<>'array'or jsonb_array_length(p_frames_text::jsonb)>256 then raise exception 'PAGED_COMPLETE_BOUNDED_FRAME_PAGE_REQUIRED'using errcode='54000';end if;
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 select * into strict h from world_v2.world_head wh where wh.world_id=p_world;
 wv:=(p_state->>'worldVersion')::bigint;seq:=(p_state->>'eventSequence')::bigint;envelopes:=p_state->'envelopes';captains:=p_state->'captains';omos:=p_state->'omos';rents:=p_state->'rents';
 select coalesce(sum(jsonb_array_length(x->'inventoryPostings')),0)into inventory_total from jsonb_array_elements(p_frames_text::jsonb)x;
 for wanted in select x from jsonb_array_elements(p_frames_text::jsonb)x loop
  select * into strict r from world_v2.command_receipt x where x.world_id=p_world and x.command_id=wanted->'command'->>'commandId'and x.outcome='COMMITTED';
  select * into strict c from world_v2.command_submission x where x.world_id=p_world and x.command_id=r.command_id;
  if r.schema_version<>'command-receipt-v2'or r.reason_code is not null or r.world_version_before<>wv or r.world_version_after<>wv+1 or c.expected_world_version is distinct from wv or r.transition_id<>c.command_id or r.command_fingerprint<>c.command_fingerprint or r.sim_time<>c.sim_time or r.idempotency_key is distinct from c.idempotency_key then raise exception 'FINANCIAL_PREFIX_RECEIPT_GAP'using errcode='55000';end if;
  command:=jsonb_build_object('actorId',c.actor_id,'authSubject',c.auth_subject::text,'commandId',c.command_id,'commandType',c.command_type,'correlationId',c.correlation_id,'countryId',c.country_id,'expectedWorldVersion',c.expected_world_version::text,'idempotencyKey',c.idempotency_key,'officeId',c.office_id,'canonicalPayload',c.canonical_payload,'schemaVersion',c.schema_version,'simTime',c.sim_time::text,'submittedAtReal',to_char(c.submitted_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'worldId',p_world,'fingerprint',c.command_fingerprint,'payloadHash',c.payload_sha256);
  intent:=c.canonical_payload::jsonb;
  if c.schema_version<>'command-v1'or c.canonical_payload<>world_v2.canonical_json(intent)or c.command_fingerprint is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(command-'fingerprint'-'payloadHash'-'correlationId'-'submittedAtReal'),'UTF8')),'hex')or c.payload_sha256 is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||c.canonical_payload,'UTF8')),'hex')then raise exception 'FINANCIAL_CANONICAL_COMMAND_INVALID'using errcode='23514';end if;
  utility:=c.command_type in('INDUSTRY_FIRST_DAY_POWER_EXECUTE_V1','INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1','INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTE_V1');
  utility_action:=intent->'operation'->>'action';
  expected_count:=case when utility and utility_action='DELIVER'then 2 else 1 end;
  if c.command_type='CORE_FINANCE_BUDGET_APPROPRIATION_V1'then
   if c.office_id is distinct from 'FINANCE'or intent->>'operation'not in('SET_ENVELOPE','APPROVE_NEW_LINE')or intent->'scope'->>'worldId'is distinct from p_world or intent->'scope'->>'countryId'is distinct from c.country_id then raise exception 'FINANCIAL_BUDGET_SCOPE_INVALID'using errcode='23514';end if;
   expected_count:=case when intent->>'operation'='SET_ENVELOPE'then 1 else 3 end;
   select x into strict fund from world_v2.postwar_social_prefix_scope s cross join lateral jsonb_array_elements(s.scope_document::jsonb->'funding')x where s.world_id=p_world and s.country_id=c.country_id and x->>'payerRole'='GOV';
   if intent->'scope'->>'entityRef'is distinct from fund->>'payerEntityId'or intent->>'currency'is distinct from fund->>'currency'then raise exception 'FINANCIAL_BUDGET_TREASURY_OWNER_INVALID'using errcode='23514';end if;
   amount:=(intent->>'amount')::numeric;if amount<0 then raise exception 'FINANCIAL_NEGATIVE_CAPACITY'using errcode='23514';end if;
   before_state:=jsonb_build_object('worldId',p_world,'worldVersion',wv::text,'eventSequence',seq::text,'envelopes',envelopes);
   select x into env from jsonb_array_elements(envelopes)x where x->'scope'->>'envelopeRef'=intent->'scope'->>'envelopeRef';
   if exists(select 1 from jsonb_array_elements(envelopes)x where x->>'revisionRef'=intent->>'revisionRef'or exists(select 1 from jsonb_array_elements(x->'lines')l where l->>'revisionRef'=intent->>'revisionRef'))then raise exception 'FINANCIAL_BUDGET_REVISION_DUPLICATE'using errcode='23514';end if;
   if intent->>'operation'='SET_ENVELOPE'then
    if env is not null then raise exception 'FINANCIAL_ENVELOPE_DUPLICATE'using errcode='23514';end if;
    envelopes:=envelopes||jsonb_build_array(jsonb_build_object('scope',intent->'scope','currency',intent->>'currency','revisionRef',intent->>'revisionRef','cap',intent->>'amount','lines','[]'::jsonb));
   else
    if env is null or env->'scope'is distinct from intent->'scope'or env->>'currency'is distinct from intent->>'currency'or env->>'revisionRef'is distinct from intent->>'envelopeRevisionRef'or intent->>'lineRef'is null then raise exception 'FINANCIAL_EXACT_BUDGET_ENVELOPE_REQUIRED'using errcode='23514';end if;
    if exists(select 1 from jsonb_array_elements(envelopes)x cross join lateral jsonb_array_elements(x->'lines')l where l->>'lineRef'=intent->>'lineRef')then raise exception 'FINANCIAL_LINE_DUPLICATE'using errcode='23514';end if;
    select coalesce(sum((l->>'appropriation')::numeric),0)+amount into line_total from jsonb_array_elements(env->'lines')l;
    if line_total>(env->>'cap')::numeric then raise exception 'FINANCIAL_ENVELOPE_EXCEEDED'using errcode='23514';end if;
    next_env:=jsonb_set(env,'{lines}',env->'lines'||jsonb_build_array(jsonb_build_object('lineRef',intent->>'lineRef','revisionRef',intent->>'revisionRef','appropriation',intent->>'amount','paid','0','outstandingCommitments','0','reserved','0')));
    select jsonb_agg(case when x->'scope'->>'envelopeRef'=intent->'scope'->>'envelopeRef'then next_env else x end order by n)into envelopes from jsonb_array_elements(envelopes)with ordinality q(x,n);
   end if;
   after_state:=jsonb_build_object('worldId',p_world,'worldVersion',r.world_version_after::text,'eventSequence',(seq+expected_count)::text,'envelopes',envelopes);
   -- Reuse only exact locally reduced DATA. Foreign frames change the head
   -- and force a fresh before-state digest; no cache crosses a page or request.
   budget_before_hash:=case when before_state is not distinct from previous_budget_after then previous_budget_hash else 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(before_state),'UTF8')),'hex') end;
   budget_after_hash:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(after_state),'UTF8')),'hex');
   previous_budget_after:=after_state;previous_budget_hash:=budget_after_hash;
  elsif not utility and c.command_type not in('CORE_INDUSTRY_OPERATING_WAGE_PAY_V1','CORE_INDUSTRY_RUN_SCHEDULE_V1','CORE_INDUSTRY_FIRST_DAY_WORK_V1','POSTWAR_BENEFICIAL_HOUSING_RENT_V1','CORE_CENTRAL_BANK_OMO_V1','CORE_GOODS_TRANSFER_V1','CORE_GOODS_SHIPMENT_V1','CORE_GOODS_DELIVERY_V1','CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1','POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1','CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1','CORE_SOCIAL_EMPLOYMENT_SERVICE_CREATE_V1','CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1','CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1')then raise exception 'FINANCIAL_UNKNOWN_DOMAIN_UNAVAILABLE'using errcode='55000';end if;
  if jsonb_array_length(r.event_ids)<>expected_count then raise exception 'FINANCIAL_COMPLETE_EVENT_GROUP_REQUIRED'using errcode='55000';end if;
  events:='[]';first_body:=null;event_index:=0;
  for e in select x.* from world_v2.authoritative_event x join jsonb_array_elements_text(r.event_ids)with ordinality ids(id,n)on x.event_id=ids.id where x.world_id=p_world order by ids.n loop
   bytes:=bytes+octet_length(e.canonical_payload)+octet_length(c.canonical_payload);ep:=e.canonical_payload::jsonb;
   if bytes>8388608 or e.event_sequence<>seq+event_index+1 or e.world_version<>r.world_version_after or e.causation_command_id<>c.command_id or e.sim_time<>c.sim_time or e.correlation_id<>c.correlation_id or e.corrects_event_id is not null or e.schema_version<>'event-v1'or e.canonical_payload<>world_v2.canonical_json(ep)then raise exception 'FINANCIAL_UNKNOWN_EFFECT_OR_SEQUENCE'using errcode='55000';end if;
   event:=jsonb_build_object('causationCommandId',e.causation_command_id,'correlationId',e.correlation_id,'correctsEventId',e.corrects_event_id,'eventId',e.event_id,'eventType',e.event_type,'canonicalPayload',e.canonical_payload,'schemaVersion',e.schema_version,'sequence',e.event_sequence::text,'simTime',e.sim_time::text,'worldId',p_world,'worldVersion',e.world_version::text,'fingerprint',e.event_fingerprint,'payloadHash',e.payload_sha256,'recordedAtReal',to_char(e.recorded_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
   if e.payload_sha256 is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||e.canonical_payload,'UTF8')),'hex')or e.event_fingerprint is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(event-'fingerprint'-'payloadHash'-'recordedAtReal'),'UTF8')),'hex')then raise exception 'FINANCIAL_EVENT_HASH_INVALID'using errcode='23514';end if;
   if c.command_type='CORE_FINANCE_BUDGET_APPROPRIATION_V1'then
    expected_type:=case when expected_count=1 then'FINANCE_NATIVE_BUDGET_ENVELOPE_SET_V1'when event_index=0 then'FINANCE_NATIVE_BUDGET_LINE_CREATED_V1'when event_index=1 then'FINANCE_NATIVE_BUDGET_APPROPRIATED_V1'else'FINANCE_NATIVE_BUDGET_LINE_INITIALIZED_V1'end;
    policy:=ep->'policy';binding:=ep->'binding';
    if event_index=0 then first_body:=ep;end if;
    if e.event_type<>expected_type or ep->>'schemaVersion'is distinct from 'finance-native-budget-event-v1'or ep->>'commandFingerprint'is distinct from c.command_fingerprint or ep->'payload'is distinct from intent or ep->>'intentIndex'is distinct from event_index::text or ep->>'intentCount'is distinct from expected_count::text or(ep-'intentIndex')is distinct from(first_body-'intentIndex')or ep->>'stateBeforeHash'is distinct from (budget_before_hash)or ep->>'stateAfterHash'is distinct from (budget_after_hash)or binding->>'seedRef'is distinct from a.seed_id or binding->>'seedFingerprint'is distinct from a.seed_fingerprint or binding->>'admissionRef'is distinct from a.admission_ref or binding->>'financialSourceId'is distinct from(select d.source_pointer->>'financialSourceId'from world_v2.postwar_office_projection_document d where d.world_id=p_world and d.country_id=c.country_id and d.office_id='FINANCE'and d.dataset='opening-financial-legs') or binding->>'treasuryAccountId'is distinct from fund->>'accountRef'or binding->>'treasuryClaimId'is distinct from fund->>'claimId'or policy->>'worldId'is distinct from p_world or policy->>'countryId'is distinct from c.country_id or policy->>'governmentEntityId'is distinct from fund->>'payerEntityId'or policy->>'currency'is distinct from fund->>'currency'or policy->>'envelopeRef'is distinct from intent->'scope'->>'envelopeRef'or policy->>'effectivePeriodRef'is distinct from intent->'scope'->>'effectivePeriodRef'or policy->>'schemaVersion'is distinct from 'finance-native-budget-policy-v1'or policy->>'requestingOfficeId'is distinct from 'FINANCE'or policy->>'programmeOwnerOfficeId'is distinct from 'FINANCE'or policy->>'classification'is distinct from 'ORDINARY_DEPARTMENTAL'or policy->>'funding'is distinct from 'FULL_UNCONDITIONAL'or policy->'requiredApprovalOffices'is distinct from '["FINANCE"]'::jsonb or c.sim_time<(policy->>'validFromSimTime')::bigint or c.sim_time>=(policy->>'validUntilSimTime')::bigint or policy->>'ruleRef'is distinct from 'FINANCE_ORDINARY_SELF_ADMINISTRATION_FULL_V1'or binding->>'policyHash'is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(policy),'UTF8')),'hex')then raise exception 'FINANCIAL_BUDGET_CORE_EFFECT_MISMATCH'using errcode='23514';end if;
   elsif utility then
    expected_type:=case when event_index=1 then'POSTWAR_INDUSTRY_OPERATING_FACT_RECORDED_V1'when c.command_type='INDUSTRY_FIRST_DAY_POWER_EXECUTE_V1'then'INDUSTRY_FIRST_DAY_POWER_EXECUTED_V1'when c.command_type='INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1'then'INDUSTRY_FIRST_DAY_WATER_EXECUTED_V1'else'INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTED_V1'end;
    if e.event_type is distinct from expected_type then raise exception 'INDUSTRY_UTILITY_EXACT_EVENT_GROUP_REQUIRED'using errcode='23514';end if;
   elsif c.command_type='CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1'then
    captains:=jsonb_set(captains,array[c.country_id],world_v2.postwar_mixed_captain_group(p_world,command,event,captains->c.country_id));
   elsif c.command_type='POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'then
    if c.office_id is distinct from 'FINANCE'or e.event_type<>'POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_V1'then raise exception 'MIXED_FX_EXACT_FAMILY_REQUIRED'using errcode='23514';end if;
   elsif c.command_type='CORE_INDUSTRY_OPERATING_WAGE_PAY_V1'then
    if e.event_type is distinct from'INDUSTRY_OPERATING_WAGE_PAID_V1'then raise exception 'INDUSTRY_CURRENT_EXACT_WAGE_EVENT_REQUIRED'using errcode='23514';end if;
   elsif c.command_type in('CORE_INDUSTRY_RUN_SCHEDULE_V1','CORE_INDUSTRY_FIRST_DAY_WORK_V1')then
    expected_type:=case c.command_type when'CORE_INDUSTRY_RUN_SCHEDULE_V1'then'INDUSTRY_FIRST_DAY_RUN_SCHEDULED_V1'else'INDUSTRY_FIRST_DAY_WORK_COMPLETED_V1'end;
    if e.event_type is distinct from expected_type then raise exception 'INDUSTRY_CURRENT_EXACT_EVENT_FAMILY_REQUIRED'using errcode='23514';end if;
   elsif c.command_type in('POSTWAR_BENEFICIAL_HOUSING_RENT_V1','CORE_CENTRAL_BANK_OMO_V1','CORE_GOODS_TRANSFER_V1','CORE_GOODS_SHIPMENT_V1','CORE_GOODS_DELIVERY_V1')then
    expected_type:=case c.command_type when'POSTWAR_BENEFICIAL_HOUSING_RENT_V1'then'POSTWAR_BENEFICIAL_HOUSING_RENT_SETTLED_V1'when'CORE_CENTRAL_BANK_OMO_V1'then'CENTRAL_BANK_OMO_SETTLED_V1'when'CORE_GOODS_TRANSFER_V1'then'NARROW_TREASURY_GCU_RESERVED_V1'when'CORE_GOODS_SHIPMENT_V1'then'NARROW_TREASURY_GCU_SHIPPED_V1'else'NARROW_TREASURY_GCU_DELIVERED_V1'end;
    if e.event_type is distinct from expected_type then raise exception 'MIXED_EXTENDED_EXACT_EVENT_FAMILY_REQUIRED'using errcode='23514';end if;
   elsif ep->'command'is distinct from(command-'canonicalPayload'-'fingerprint'-'payloadHash')||jsonb_build_object('payload',intent)or not world_v2.postwar_social_prefix_effect_scoped(p_world,c.country_id,e.event_type,command,ep,e.event_sequence)then raise exception 'FINANCIAL_SOCIAL_SCOPE_EFFECT_INVALID'using errcode='23514';end if;
   events:=events||jsonb_build_array(event);last_event_id:=e.event_id;last_event_fingerprint:=e.event_fingerprint;event_index:=event_index+1;
  end loop;
  if event_index<>expected_count then raise exception 'FINANCIAL_EVENT_ROWS_INCOMPLETE'using errcode='55000';end if;
  transition:=jsonb_build_object('schemaVersion','authoritative-transition-v1','transitionId',c.command_id,'worldId',p_world,'commandId',c.command_id,'commandFingerprint',c.command_fingerprint,'worldVersionBefore',r.world_version_before::text,'worldVersionAfter',r.world_version_after::text,'eventIds',r.event_ids,'events',events);
  receipt:=jsonb_build_object('schemaVersion',r.schema_version,'worldId',p_world,'commandId',r.command_id,'idempotencyKey',r.idempotency_key,'commandFingerprint',r.command_fingerprint,'outcome',r.outcome,'reasonCode',r.reason_code,'transitionId',r.transition_id,'worldVersionBefore',r.world_version_before::text,'worldVersionAfter',r.world_version_after::text,'simTime',r.sim_time::text,'eventIds',r.event_ids,'recordedAtReal',to_char(r.recorded_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  batches:='[]';
  select count(*)into actual_batch_count from world_v2.financial_posting_batch x where x.world_id=p_world and x.causation_command_id=c.command_id;
  if (c.command_type='INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTE_V1'and utility_action='PAY_INPUTS')or c.command_type in('CORE_INDUSTRY_OPERATING_WAGE_PAY_V1','POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1','POSTWAR_BENEFICIAL_HOUSING_RENT_V1','CORE_CENTRAL_BANK_OMO_V1','CORE_GOODS_DELIVERY_V1')then
   if c.command_type='POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'and actual_batch_count<>2 then raise exception 'MIXED_EXACT_TWO_FX_BATCHES_REQUIRED'using errcode='55000';end if;
   if c.command_type<>'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'and actual_batch_count<>1 then raise exception 'MIXED_EXTENDED_EXACT_SINGLE_BATCH_REQUIRED'using errcode='55000';end if;
   for br in select x.* from world_v2.financial_posting_batch x where x.world_id=p_world and x.causation_command_id=c.command_id order by case when x.settlement_currency='GCU'then 1 else 0 end,x.batch_id loop
    if br.world_version_before<>r.world_version_before or br.world_version_after<>r.world_version_after or br.sim_time<>r.sim_time or br.event_ids<>r.event_ids or br.transition_binding is distinct from world_v2.canonical_json(br.canonical_payload::jsonb->'transitionBinding')or br.settlement_currency is distinct from br.canonical_payload::jsonb->>'settlementCurrency'then raise exception 'MIXED_CANONICAL_BATCH_BINDING_INVALID'using errcode='23514';end if;
    bytes:=bytes+octet_length(br.canonical_payload);if bytes>8388608 then raise exception 'MIXED_COMPLETE_PREFIX_BYTES_EXCEEDED'using errcode='54000';end if;
    batches:=batches||jsonb_build_array(world_v2.postwar_mixed_current_batch(br.canonical_payload,br.batch_fingerprint,br.batch_id));total_batches:=total_batches+1;total_legs:=total_legs+jsonb_array_length(br.canonical_payload::jsonb->'legs');
   end loop;
   if c.command_type='POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'and not world_v2.postwar_mixed_fx_group(p_world,command,transition,events->0,batches,envelopes)then raise exception 'MIXED_EXACT_FX_EFFECTS_INVALID'using errcode='23514';end if;
  elsif actual_batch_count<>0 then raise exception 'MIXED_FINANCIAL_EFFECT_OUTSIDE_FX'using errcode='55000';end if;
  inventory:='[]';inventory_count:=0;
  expected_inventory:=case when c.command_type in('CORE_GOODS_TRANSFER_V1','CORE_GOODS_SHIPMENT_V1','CORE_GOODS_DELIVERY_V1')or(c.command_type='INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTE_V1'and utility_action in('BOOK','SHIP','DELIVER'))then 1 else 0 end;
  if inventory_total>0 or utility then
   select count(*)into inventory_count from world_v2.inventory_posting x where x.world_id=p_world and x.causation_command_id=c.command_id;
   if inventory_count<>expected_inventory then raise exception 'MIXED_EXACT_INVENTORY_GROUP_REQUIRED'using errcode='23514';end if;
   for inv in select * from world_v2.inventory_posting x where x.world_id=p_world and x.causation_command_id=c.command_id order by x.posting_id loop
    if octet_length(inv.canonical_payload)>65536 then raise exception 'MIXED_INVENTORY_ROW_BOUNDED'using errcode='54000';end if;body:=inv.canonical_payload::jsonb;
    if body?'fingerprint'or inv.canonical_payload is distinct from world_v2.canonical_json(body)or body->>'postingId'is distinct from inv.posting_id or inv.posting_fingerprint is distinct from'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||inv.canonical_payload,'UTF8')),'hex')or inv.world_version_before<>r.world_version_before or inv.world_version_after<>r.world_version_after or inv.sim_time<>r.sim_time or inv.event_ids<>r.event_ids or inv.operation is distinct from body->>'operation'or inv.transition_binding is distinct from world_v2.canonical_json(body->'transitionBinding')then raise exception 'MIXED_EXACT_CANONICAL_INVENTORY_REQUIRED'using errcode='23514';end if;
    bytes:=bytes+octet_length(inv.canonical_payload);if bytes>8388608 then raise exception 'MIXED_COMPLETE_PREFIX_BYTES_EXCEEDED'using errcode='54000';end if;
    inventory:=inventory||jsonb_build_array(body||jsonb_build_object('fingerprint',inv.posting_fingerprint));total_inventory:=total_inventory+1;
   end loop;
  end if;
  if c.command_type='CORE_CENTRAL_BANK_OMO_V1'then
   if to_regprocedure('world_v2.postwar_mixed_omo_group(text,jsonb,jsonb,jsonb,jsonb,jsonb)')is null then raise exception 'MIXED_OMO_EFFECTS_EXTENSION_REQUIRED'using errcode='55000';end if;
   omos:=jsonb_set(omos,array[c.country_id],world_v2.postwar_mixed_omo_group(p_world,command,transition,events->0,batches,omos->c.country_id));
  elsif c.command_type in('CORE_GOODS_TRANSFER_V1','CORE_GOODS_SHIPMENT_V1','CORE_GOODS_DELIVERY_V1')then
   if to_regprocedure('world_v2.postwar_mixed_goods_group(text,jsonb,jsonb,jsonb,jsonb,jsonb)')is null then raise exception 'MIXED_GOODS_EFFECTS_EXTENSION_REQUIRED'using errcode='55000';end if;
   perform world_v2.postwar_mixed_goods_group(p_world,command,transition,events->0,batches,inventory);
  end if;
  if c.command_type='POSTWAR_BENEFICIAL_HOUSING_RENT_V1'then
   if to_regprocedure('world_v2.postwar_mixed_beneficial_rent_group(text,jsonb,jsonb,jsonb,jsonb,jsonb)')is null then raise exception 'MIXED_RENT_EFFECTS_EXTENSION_REQUIRED'using errcode='55000';end if;
   rents:=jsonb_set(rents,array[c.country_id],coalesce(rents->c.country_id,'{}'::jsonb)||jsonb_build_object(intent->>'leaseId',world_v2.postwar_paged_beneficial_rent_group(p_world,command,transition,events->0,batches,coalesce((rents->c.country_id->>(intent->>'leaseId'))::numeric,0))::text),true);
  end if;
  if c.command_type in('CORE_INDUSTRY_RUN_SCHEDULE_V1','CORE_INDUSTRY_FIRST_DAY_WORK_V1')then
   perform world_v2.postwar_mixed_industry_work_group(p_world,command,transition,events->0,batches,inventory);
  end if;
  if c.command_type='CORE_INDUSTRY_OPERATING_WAGE_PAY_V1'then perform world_v2.postwar_mixed_industry_wage_group(p_world,command,transition,events->0,batches,inventory);end if;
  if utility then
   if to_regprocedure('world_v2.postwar_mixed_industry_utility_group(text,jsonb,jsonb,jsonb,jsonb,jsonb)')is null then raise exception 'INDUSTRY_UTILITY_EFFECTS_EXTENSION_REQUIRED'using errcode='55000';end if;
   perform world_v2.postwar_mixed_industry_utility_group(p_world,command,transition,events,batches,inventory);
  end if;
  all_batches:=all_batches||batches;
  frames:=frames||jsonb_build_array(jsonb_build_object('command',command,'transition',transition,'financialPostingBatches',batches,'inventoryPostings',inventory,'receipt',receipt,'events',events));
  meta:=meta||jsonb_build_array(jsonb_build_object('commandId',c.command_id,'countryId',c.country_id,'commandType',c.command_type,'transitionFingerprint','sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(transition),'UTF8')),'hex'),'receiptFingerprint','sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(receipt),'UTF8')),'hex'),'eventFingerprints',(select jsonb_agg(x->'fingerprint'order by n)from jsonb_array_elements(events)with ordinality q(x,n)),'worldVersionBefore',r.world_version_before::text,'worldVersionAfter',r.world_version_after::text,'events',(select jsonb_agg(jsonb_build_object('eventId',x->>'eventId','fingerprint',x->>'fingerprint','sequence',x->>'sequence','worldVersion',x->>'worldVersion')order by n)from jsonb_array_elements(events)with ordinality q(x,n))));
  wv:=r.world_version_after;seq:=seq+expected_count;
 end loop;
 if world_v2.canonical_json(frames)is distinct from p_frames_text or total_inventory<>inventory_total then raise exception 'PAGED_ACTUAL_FRAME_AND_JOURNAL_MISMATCH'using errcode='23514';end if;
 return jsonb_build_object('state',jsonb_build_object('worldVersion',wv::text,'eventSequence',seq::text,'envelopes',envelopes,'captains',captains,'omos',omos,'rents',rents),'effects',meta,'batches',all_batches,'legCount',total_legs::text,'batchCount',total_batches::text,'lastEventId',last_event_id,'lastEventFingerprint',last_event_fingerprint);
end;$$;
alter function world_v2.postwar_apply_current_frame_page(text,text,jsonb)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.postwar_apply_current_frame_page(text,text,jsonb)from public;
revoke create on schema world_v2 from world_v2_postwar_projection_owner;
commit;
