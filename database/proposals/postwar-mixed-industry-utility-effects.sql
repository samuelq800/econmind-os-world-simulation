-- Optional effects verifier only. Requires mixed Industry current effects,
-- utility custody and committed logistics-order archive. No new role/member,
-- raw reader grant, command, payment, right or physical supply is created.
-- Stop consumers on failure; preserve committed history and review a forward
-- fix separately. Unknown settlement outcomes must not be retried blindly.
begin;
grant create on schema world_v2 to world_v2_industry_source_owner,world_v2_postwar_projection_owner;

-- Private bounded immutable originals. Current source revocation prevents new
-- use in the execution guard; it cannot erase a previously committed effect.
create function world_v2.postwar_projection_industry_utility_original(p_world text,p_country text,p_facility text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;s world_v2.postwar_industry_utility_source%rowtype;begin
 if current_setting('transaction_isolation')not in('repeatable read','serializable')or current_setting('econmind.postwar_projection_world',true)is distinct from p_world then raise exception 'UTILITY_EFFECTS_HELD_PROJECTION_WORLD_REQUIRED'using errcode='25001';end if;
 perform set_config('econmind.industry_source_world',p_world,true);a:=world_v2.industry_source_admission(p_world);
 select * into strict s from world_v2.postwar_industry_utility_source x where x.world_id=p_world and x.country_id=p_country and x.facility_id=p_facility and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref for share;
 if octet_length(s.source_text)>16384 or s.source_text is distinct from world_v2.canonical_json(s.source_text::jsonb)or s.source_sha256 is distinct from encode(sha256(convert_to(s.source_text,'UTF8')),'hex')or s.source_ref is distinct from'INDUSTRY_UTILITY_'||upper(s.source_sha256)or s.source_text::jsonb->>'worldId'is distinct from p_world or s.source_text::jsonb->>'countryId'is distinct from p_country or s.source_text::jsonb->>'facilityId'is distinct from p_facility or s.source_text::jsonb->>'seedFingerprint'is distinct from a.seed_fingerprint or s.source_text::jsonb->>'admissionRef'is distinct from a.admission_ref then raise exception 'UTILITY_EFFECTS_EXACT_REGISTERED_ORIGINAL_REQUIRED'using errcode='23514';end if;
 return jsonb_build_object('source',s.source_text::jsonb,'sourceRef',s.source_ref,'sourceRawSha256',s.source_sha256,'seedId',a.seed_id,'seedFingerprint',a.seed_fingerprint,'admissionRef',a.admission_ref);
end;$$;
alter function world_v2.postwar_projection_industry_utility_original(text,text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.postwar_projection_industry_utility_original(text,text,text)from public;
grant execute on function world_v2.postwar_projection_industry_utility_original(text,text,text)to world_v2_postwar_projection_owner;

create function world_v2.postwar_projection_utility_water_grant(p_world text,p_command text,p_fingerprint text,p_run_command text,p_seed text,p_admission text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$begin
 if current_setting('econmind.postwar_projection_world',true)is distinct from p_world then raise exception 'UTILITY_EFFECTS_HELD_PROJECTION_WORLD_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.industry_source_world',p_world,true);
 return exists(select 1 from world_v2.postwar_industry_water_grant_publication q where q.world_id=p_world and q.command_id=p_command and q.command_fingerprint=p_fingerprint and q.schedule_command_id=p_run_command and q.seed_fingerprint=p_seed and q.admission_ref=p_admission);
end;$$;
alter function world_v2.postwar_projection_utility_water_grant(text,text,text,text,text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.postwar_projection_utility_water_grant(text,text,text,text,text,text)from public;
grant execute on function world_v2.postwar_projection_utility_water_grant(text,text,text,text,text,text)to world_v2_postwar_projection_owner;

-- Service payment must be an earlier actual committed WORK/WAGE pair, with
-- the actual stored batch, never a planned amount or a loose event reference.
create function world_v2.postwar_projection_utility_paid_input(p_world text,p_country text,p_operator text,p_before bigint,p_paid jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare w world_v2.authoritative_event%rowtype;p world_v2.authoritative_event%rowtype;r world_v2.command_receipt%rowtype;b world_v2.financial_posting_batch%rowtype;body jsonb;batch jsonb;expense jsonb;payment jsonb;begin
 select * into strict w from world_v2.authoritative_event x where x.world_id=p_world and x.event_fingerprint=p_paid->>'workEventFingerprint'and x.event_type='INDUSTRY_FIRST_DAY_WORK_COMPLETED_V1'and x.world_version<p_before;
 select * into strict p from world_v2.authoritative_event x where x.world_id=p_world and x.event_fingerprint=p_paid->>'paymentEventFingerprint'and x.event_type='INDUSTRY_OPERATING_WAGE_PAID_V1'and x.world_version<p_before and x.world_version>w.world_version;
 select * into strict r from world_v2.command_receipt x where x.world_id=p_world and x.command_id=p.causation_command_id and x.outcome='COMMITTED'and x.event_ids=jsonb_build_array(p.event_id);
 body:=p.canonical_payload::jsonb;
 if body->>'workEventFingerprint'is distinct from w.event_fingerprint or body->'source'->>'countryId'is distinct from p_country or body->'source'->>'operatorId'is distinct from p_operator or body->>'paidAmount'is distinct from p_paid->>'amount'or body->>'currency'is distinct from p_paid->>'currency'or(p_paid->>'amount')!~'^[0-9]+([.][0-9]+)?$'or(p_paid->>'amount')::numeric<=0 then raise exception 'UTILITY_EFFECTS_ACTUAL_SERVICE_PAYMENT_REQUIRED'using errcode='23514';end if;
 select * into strict b from world_v2.financial_posting_batch x where x.world_id=p_world and x.causation_command_id=p.causation_command_id and x.batch_fingerprint=p_paid->>'batchFingerprint';
 batch:=world_v2.postwar_mixed_current_batch(b.canonical_payload,b.batch_fingerprint,b.batch_id);
 select x into strict expense from jsonb_array_elements(batch->'legs')x where x->'account'->>'ownerId'=p_operator and x->'account'->>'accountClass'='EXPENSE'and x->>'direction'='DEBIT';
 select x into strict payment from jsonb_array_elements(batch->'legs')x where x->'account'->>'ownerId'=p_operator and x->'account'->>'accountClass'='ASSET'and x->>'direction'='CREDIT';
 if expense->'amount'is distinct from jsonb_build_object('amount',p_paid->>'amount','currency',p_paid->>'currency')or payment->'amount'is distinct from expense->'amount'or b.event_ids is distinct from r.event_ids or b.world_version_after is distinct from r.world_version_after then raise exception 'UTILITY_EFFECTS_EXACT_APPLIED_PAYMENT_BATCH_REQUIRED'using errcode='23514';end if;
 return true;
end;$$;
alter function world_v2.postwar_projection_utility_paid_input(text,text,text,bigint,jsonb)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.postwar_projection_utility_paid_input(text,text,text,bigint,jsonb)from public;

-- Resolve a child beneficiary by the actual immutable receipt, without a raw
-- projection-role grant on the private rent source table or guessed group ID.
do $install$begin
 if to_regclass('world_v2.postwar_beneficial_rent_source')is not null then
  grant create on schema world_v2 to world_v2_beneficial_rent_source_owner;
  execute $ddl$create function world_v2.postwar_projection_utility_beneficiary(p_world text,p_country text,p_seed text,p_admission text,p_account jsonb,p_aggregate jsonb,p_liability jsonb)returns boolean language plpgsql security definer set search_path=pg_catalog as $$
  declare s world_v2.postwar_beneficial_rent_source%rowtype;r jsonb;begin
   perform set_config('econmind.beneficial_rent_world',p_world,true);
   select * into s from world_v2.postwar_beneficial_rent_source x where x.world_id=p_world and x.country_id=p_country for share;
   if not found then return p_account=p_aggregate;end if;
   if s.seed_fingerprint is distinct from p_seed or s.admission_ref is distinct from p_admission then return false;end if;
   r:=s.receipt_bytes::jsonb;
   if s.receipt_fingerprint is distinct from r->>'fingerprint'or r->>'worldId'is distinct from p_world or r->>'countryId'is distinct from p_country or r->>'seedId'is distinct from s.seed_id or r->'newLegalClaims'is distinct from'false'::jsonb or r->'counterpartLiabilityAccount'is distinct from p_liability or r->>'fingerprint'is distinct from'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(r-'fingerprint'))then return false;end if;
   return exists(select 1 from jsonb_array_elements(r->'subaccounts')x where x->'account'=p_account and p_account->>'ownerId'=r->>'householdEntityId'and p_account->>'claimId'=r->>'claimId');
  end;$$;$ddl$;
  alter function world_v2.postwar_projection_utility_beneficiary(text,text,text,text,jsonb,jsonb,jsonb)owner to world_v2_beneficial_rent_source_owner;
  revoke all on function world_v2.postwar_projection_utility_beneficiary(text,text,text,text,jsonb,jsonb,jsonb)from public;
  grant execute on function world_v2.postwar_projection_utility_beneficiary(text,text,text,text,jsonb,jsonb,jsonb)to world_v2_postwar_projection_owner;
  revoke create on schema world_v2 from world_v2_beneficial_rent_source_owner;
 end if;
end;$install$;

create function world_v2.postwar_mixed_industry_utility_group(p_world text,p_command jsonb,p_transition jsonb,p_events jsonb,p_batches jsonb,p_inventory jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare c world_v2.command_submission%rowtype;r world_v2.command_receipt%rowtype;e world_v2.authoritative_event%rowtype;run world_v2.command_submission%rowtype;rr world_v2.command_receipt%rowtype;re world_v2.authoritative_event%rowtype;br world_v2.financial_posting_batch%rowtype;ip world_v2.inventory_posting%rowtype;
 intent jsonb;op jsonb;ep jsonb;event jsonb;receipt jsonb;fact jsonb;packet jsonb;src jsonb;claims jsonb;orders jsonb;original jsonb;ord jsonb;work jsonb;prior jsonb;book jsonb;source jsonb;destination jsonb;posting jsonb;batch jsonb;legs jsonb;leg jsonb;asset jsonb;liability jsonb;expected jsonb;ids jsonb:='[]';action text;kind text;operator_id text;quantity text;currency text;amount text;key text;actual_count integer;idx integer:=0;a numeric[];b numeric[];d numeric[];route_loss numeric[];before_soc numeric[];after_soc numeric[];begin
 if current_setting('transaction_isolation')not in('repeatable read','serializable')or current_setting('econmind.postwar_projection_world',true)is distinct from p_world then raise exception 'UTILITY_EFFECTS_HELD_WORLD_REQUIRED'using errcode='25001';end if;
 if jsonb_typeof(p_events)is distinct from'array'or jsonb_array_length(p_events)not between 1 and 2 or jsonb_typeof(p_batches)is distinct from'array'or jsonb_array_length(p_batches)>1 or jsonb_typeof(p_inventory)is distinct from'array'or jsonb_array_length(p_inventory)>1 then raise exception 'UTILITY_EFFECTS_BOUNDED_FULL_GROUP_REQUIRED'using errcode='23514';end if;
 select * into strict c from world_v2.command_submission q where q.world_id=p_world and q.command_id=p_command->>'commandId'and q.command_fingerprint=p_command->>'fingerprint'and q.country_id=p_command->>'countryId'and q.command_type=p_command->>'commandType'and q.canonical_payload=p_command->>'canonicalPayload'and q.actor_id=p_command->>'actorId'and q.auth_subject::text=p_command->>'authSubject'and q.office_id is not distinct from p_command->>'officeId';
 select * into strict r from world_v2.command_receipt q where q.world_id=p_world and q.command_id=c.command_id and q.command_fingerprint=c.command_fingerprint and q.outcome='COMMITTED'and q.reason_code is null and q.world_version_before=c.expected_world_version and q.world_version_after=q.world_version_before+1;
 if c.canonical_payload is distinct from world_v2.canonical_json(c.canonical_payload::jsonb)or c.payload_sha256 is distinct from'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||c.canonical_payload)or c.command_fingerprint is distinct from'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(p_command-'fingerprint'-'payloadHash'-'correlationId'-'submittedAtReal'))then raise exception 'UTILITY_EFFECTS_CANONICAL_COMMAND_HASH_REQUIRED'using errcode='23514';end if;
 select count(*)into actual_count from world_v2.financial_posting_batch q where q.world_id=p_world and q.causation_command_id=c.command_id;
 if actual_count<>jsonb_array_length(p_batches)then raise exception 'UTILITY_EFFECTS_NO_EXTRA_ACTUAL_FINANCIAL_BATCH_REQUIRED'using errcode='23514';end if;
 idx:=0;
 for br in select * from world_v2.financial_posting_batch q where q.world_id=p_world and q.causation_command_id=c.command_id order by q.batch_id collate "C"loop
  batch:=world_v2.postwar_mixed_current_batch(br.canonical_payload,br.batch_fingerprint,br.batch_id);
  if p_batches->idx is distinct from batch or br.event_ids is distinct from r.event_ids or br.world_version_before<>r.world_version_before or br.world_version_after<>r.world_version_after or br.sim_time<>r.sim_time then raise exception 'UTILITY_EFFECTS_ACTUAL_CANONICAL_FINANCIAL_BATCH_REQUIRED'using errcode='23514';end if;idx:=idx+1;
 end loop;
 select count(*)into actual_count from world_v2.inventory_posting q where q.world_id=p_world and q.causation_command_id=c.command_id;
 if actual_count<>jsonb_array_length(p_inventory)then raise exception 'UTILITY_EFFECTS_NO_EXTRA_ACTUAL_INVENTORY_REQUIRED'using errcode='23514';end if;
 idx:=0;
 for ip in select * from world_v2.inventory_posting q where q.world_id=p_world and q.causation_command_id=c.command_id order by q.posting_id collate "C"loop
  posting:=ip.canonical_payload::jsonb;
  if posting?'fingerprint'or ip.canonical_payload is distinct from world_v2.canonical_json(posting)or ip.posting_fingerprint is distinct from'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||ip.canonical_payload)or p_inventory->idx is distinct from posting||jsonb_build_object('fingerprint',ip.posting_fingerprint)or ip.event_ids is distinct from r.event_ids or ip.world_version_before<>r.world_version_before or ip.world_version_after<>r.world_version_after or ip.sim_time<>r.sim_time then raise exception 'UTILITY_EFFECTS_ACTUAL_CANONICAL_INVENTORY_REQUIRED'using errcode='23514';end if;idx:=idx+1;
 end loop;
 idx:=0;
 intent:=c.canonical_payload::jsonb;op:=intent->'operation';action:=op->>'action';kind:=intent->>'serviceKind';
 if intent->>'schemaVersion'is distinct from'industry-first-day-utility-command-v1'or(select count(*)from jsonb_object_keys(intent))<>8 or c.command_type is distinct from'INDUSTRY_FIRST_DAY_'||kind||'_EXECUTE_V1'or kind not in('POWER','WATER','LOGISTICS')or (c.office_id is distinct from'INDUSTRY'and not(kind='WATER'and action='GRANT_RIGHT'and c.office_id is null))or c.idempotency_key is null or c.sim_time>86400000 or p_transition->>'worldVersionBefore'is distinct from r.world_version_before::text or p_transition->>'worldVersionAfter'is distinct from r.world_version_after::text or p_transition->>'transitionId'is distinct from r.transition_id then raise exception 'UTILITY_EFFECTS_EXACT_FAMILY_AND_TRANSITION_REQUIRED'using errcode='23514';end if;
 for event in select value from jsonb_array_elements(p_events)loop
  select * into strict e from world_v2.authoritative_event q where q.world_id=p_world and q.event_id=event->>'eventId'and q.event_fingerprint=event->>'fingerprint'and q.causation_command_id=c.command_id and q.world_version=r.world_version_after and q.sim_time=c.sim_time and q.canonical_payload=event->>'canonicalPayload';
  if e.event_fingerprint is distinct from'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(event-'fingerprint'-'payloadHash'-'recordedAtReal'))or event->>'worldId'is distinct from p_world or event->>'worldVersion'is distinct from e.world_version::text or event->>'sequence'is distinct from e.event_sequence::text or event->>'simTime'is distinct from e.sim_time::text or event->>'eventType'is distinct from e.event_type or event->>'causationCommandId'is distinct from c.command_id then raise exception 'UTILITY_EFFECTS_CANONICAL_EVENT_BINDING_REQUIRED'using errcode='23514';end if;
  if e.payload_sha256 is distinct from'sha256:'||encode(sha256(convert_to(E'SHA-256\n'||e.canonical_payload,'UTF8')),'hex')or e.event_type is distinct from(case when idx=0 then'INDUSTRY_FIRST_DAY_'||kind||'_EXECUTED_V1'else'POSTWAR_INDUSTRY_OPERATING_FACT_RECORDED_V1'end)or idx>0 and e.event_sequence<>(p_events->0->>'sequence')::bigint+idx then raise exception 'UTILITY_EFFECTS_ACTUAL_ORDERED_EVENTS_REQUIRED'using errcode='23514';end if;
  ids:=ids||jsonb_build_array(e.event_id);idx:=idx+1;
 end loop;
 expected:=jsonb_build_object('schemaVersion','authoritative-transition-v1','transitionId',c.command_id,'worldId',p_world,'commandId',c.command_id,'commandFingerprint',c.command_fingerprint,'worldVersionBefore',r.world_version_before::text,'worldVersionAfter',r.world_version_after::text,'eventIds',r.event_ids,'events',p_events);
 if p_transition is distinct from expected then raise exception 'UTILITY_EFFECTS_EXACT_FULL_TRANSITION_REQUIRED'using errcode='23514';end if;
 if ids is distinct from r.event_ids or p_transition->'eventIds'is distinct from ids or jsonb_array_length(p_events)<>(case when action='DELIVER'then 2 else 1 end)then raise exception 'UTILITY_EFFECTS_EXACT_RECEIPT_EVENT_GROUP_REQUIRED'using errcode='23514';end if;
 ep:=(p_events->0->>'canonicalPayload')::jsonb;
 select * into strict run from world_v2.command_submission q where q.world_id=p_world and q.country_id=c.country_id and q.command_type='CORE_INDUSTRY_RUN_SCHEDULE_V1'and q.office_id='INDUSTRY'and q.canonical_payload::jsonb->>'runId'=intent->>'runId'and q.canonical_payload::jsonb->>'facilityId'=intent->>'facilityId';
 select * into strict rr from world_v2.command_receipt q where q.world_id=p_world and q.command_id=run.command_id and q.outcome='COMMITTED'and q.world_version_after<r.world_version_after and jsonb_array_length(q.event_ids)=1;
 select * into strict re from world_v2.authoritative_event q where q.world_id=p_world and q.event_id=rr.event_ids->>0 and q.causation_command_id=run.command_id and q.event_type='INDUSTRY_FIRST_DAY_RUN_SCHEDULED_V1';
 if action='DELIVER'then
  receipt:=((p_events->1->>'canonicalPayload')::jsonb)->'operatingReceipt';fact:=(receipt->>'factCanonicalPayload')::jsonb;
  if receipt->>'schemaVersion'is distinct from'industry-utility-operating-receipt-v2'or receipt->>'classification'is distinct from'CONDITIONAL_DOMAIN_RECEIPT_DATA_NOT_DELIVERY_AUTHORITY'or receipt->>'kind'is distinct from kind||'_DELIVERY'or receipt->>'purpose'is distinct from'INDUSTRY_PRODUCTION_INPUT'or receipt->>'worldId'is distinct from p_world or receipt->>'countryId'is distinct from c.country_id or receipt->>'facilityId'is distinct from intent->>'facilityId'or receipt->>'runId'is distinct from intent->>'runId'or receipt->'productionRun'is distinct from jsonb_build_object('commandId',run.command_id,'commandFingerprint',run.command_fingerprint,'eventId',re.event_id,'eventFingerprint',re.event_fingerprint)or receipt->>'receiptId'is distinct from'UTILITY_RECEIPT_'||upper(world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(receipt-'receiptId')))or receipt->>'factCanonicalPayload'is distinct from world_v2.canonical_json(fact)or(receipt->>'validFromTicks')::numeric>c.sim_time or(receipt->>'validUntilTicks')::numeric<c.sim_time or(receipt->>'validUntilTicks')::numeric>86400000 then raise exception 'UTILITY_EFFECTS_EXACT_COMMITTED_RUN_RECEIPT_REQUIRED'using errcode='23514';end if;
 end if;
 if kind in('POWER','WATER')then
  packet:=world_v2.postwar_projection_industry_utility_original(p_world,c.country_id,intent->>'facilityId');src:=packet->'source';operator_id:=src->>'operatorId';
  if intent->>'sourceRef'is distinct from(packet->>'sourceRef')||'_'||kind or intent->>'sourceRawSha256'is distinct from packet->>'sourceRawSha256'or action not in('BOOK','GRANT_RIGHT','DELIVER')or jsonb_array_length(p_batches)<>0 or jsonb_array_length(p_inventory)<>0 then raise exception 'UTILITY_EFFECTS_REGISTERED_ZERO_JOURNAL_RESOURCE_REQUIRED'using errcode='23514';end if;
  if coalesce(ep->'policy'->>'userAdoptionSha256',ep->'policy'->>'adoptionRawSha256')is distinct from src->>'adoptionRawSha256'or(action='DELIVER'and(receipt->>'operatorId'is distinct from operator_id or receipt->>'locationId'is distinct from src->>'locationId'or receipt->>'sourceFingerprint'is distinct from ep->>'sourceFingerprint'))then raise exception 'UTILITY_EFFECTS_ADOPTED_POLICY_AND_RECEIPT_SOURCE_REQUIRED'using errcode='23514';end if;
  if kind='POWER'then
   source:=ep->'source';
   if action not in('BOOK','DELIVER')or ep->>'schemaVersion'is distinct from'industry-first-day-power-executed-v1'or ep->'operation'is distinct from op or source->>'worldId'is distinct from p_world or source->>'countryId'is distinct from c.country_id or source->>'facilityId'is distinct from intent->>'facilityId'or source->>'operatorId'is distinct from operator_id or source->>'runId'is distinct from intent->>'runId'or source->>'seedFingerprint'is distinct from packet->>'seedFingerprint'or source->>'admissionRef'is distinct from packet->>'admissionRef'or source->>'sourceRef'is distinct from intent->>'sourceRef'or source->>'sourceRawSha256'is distinct from intent->>'sourceRawSha256'or ep->>'sourceFingerprint'is distinct from'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(source))then raise exception 'UTILITY_EFFECTS_EXACT_POWER_SOURCE_REQUIRED'using errcode='23514';end if;
   before_soc:=world_v2.postwar_industry_current_ratio(ep->'before'->'remainingSocMWh');after_soc:=world_v2.postwar_industry_current_ratio(ep->'after'->'remainingSocMWh');
   if action='BOOK'then
    if ep->>'status'is distinct from'BOOKED_NOT_DELIVERED'or ep->'before'->'remainingSocMWh'is distinct from ep->'after'->'remainingSocMWh'or exists(select 1 from world_v2.command_submission q join world_v2.command_receipt z using(world_id,command_id)where q.world_id=p_world and q.command_type=c.command_type and q.canonical_payload::jsonb->'operation'->>'bookingRef'=op->>'bookingRef'and z.outcome='COMMITTED'and z.world_version_after<r.world_version_after)then raise exception 'UTILITY_EFFECTS_UNIQUE_BOOKING_IS_NOT_DELIVERY'using errcode='23514';end if;
   else
    d:=world_v2.postwar_industry_current_ratio(ep->'settlement'->'storedEnergyWithdrawalMWh');a:=world_v2.postwar_industry_current_ratio(ep->'settlement'->'outputMWh');b:=world_v2.postwar_industry_current_ratio(ep->'settlement'->'deliveredMWh');route_loss:=world_v2.postwar_industry_current_ratio(ep->'settlement'->'routeLossMWh');
    if ep->>'status'is distinct from'PHYSICAL_SETTLEMENT_RECOMPUTED'or d[1]<=0 or a[1]*d[2]<>d[1]*a[2]*(src->'power'->>'originalEfficiency')::numeric or b[1]*a[2]<>a[1]*b[2]*(1-(src->'power'->>'originalLossFraction')::numeric)or route_loss[1]*a[2]<>a[1]*route_loss[2]*(src->'power'->>'originalLossFraction')::numeric or(before_soc[1]*after_soc[2]-after_soc[1]*before_soc[2])*d[2]<>d[1]*before_soc[2]*after_soc[2]or ep->'settlement'->>'storageId'is distinct from src->'power'->>'storageId'or ep->'settlement'->>'gridId'is distinct from src->'power'->>'gridId'or fact->'settlement'is distinct from ep->'settlement'or fact->'actualPaidInput'is distinct from ep->'actualPaidInput'then raise exception 'UTILITY_EFFECTS_EXACT_POWER_CONSERVATION_REQUIRED'using errcode='23514';end if;
    perform world_v2.postwar_projection_utility_paid_input(p_world,c.country_id,operator_id,r.world_version_after,ep->'actualPaidInput');
   end if;
  else
   if ep->>'schemaVersion'is distinct from'industry-first-day-water-execution-v1'or action not in('GRANT_RIGHT','DELIVER')then raise exception 'UTILITY_EFFECTS_EXACT_WATER_STAGE_REQUIRED'using errcode='23514';end if;
   if action='GRANT_RIGHT'then
    if c.office_id is not null or ep->>'stage'is distinct from'RIGHT_GRANTED'or ep->'grant'->'right'->>'holderRef'is distinct from operator_id or ep->'grant'->'right'->>'regionRef'is distinct from src->>'locationId'or ep->'grant'->'right'->>'basinRef'is distinct from src->'water'->>'basinRef'or ep->'grant'->'right'->'quotaPerDay'->>'unit'is distinct from'm3/sim-day'or(ep->'grant'->'right'->'quotaPerDay'->>'amount')::numeric<=0 or(ep->'grant'->'right'->'quotaPerDay'->>'amount')::numeric>(src->'water'->>'rawQuotaPerDay')::numeric or ep->'grant'->'right'->>'countryRef'is distinct from c.country_id or ep->'grant'->'right'->>'sourceRef'is distinct from intent->>'sourceRef'or ep->'grant'->'right'->>'purpose'is distinct from'OTHER_INDUSTRY'or ep->'grant'->'right'->'validity'->>'fromTicks'is distinct from c.sim_time::text or(ep->'grant'->'right'->'validity'->>'untilTicks')::numeric>86400000 or not world_v2.postwar_projection_utility_water_grant(p_world,c.command_id,c.command_fingerprint,run.command_id,packet->>'seedFingerprint',packet->>'admissionRef')then raise exception 'UTILITY_EFFECTS_ACTUAL_PUBLISHED_BOUNDED_WATER_RIGHT_REQUIRED'using errcode='23514';end if;
   else
    if ep->>'stage'is distinct from'WATER_DELIVERED'or jsonb_array_length(ep->'accounts')<>1 or ep->'accounts'->0->>'holderRef'is distinct from operator_id or ep->'accounts'->0->>'facilityRef'is distinct from intent->>'facilityId'or ep->'accounts'->0->>'targetRunId'is distinct from intent->>'runId'or ep->'accounts'->0->'delivered'is distinct from ep->'accounts'->0->'available'or(ep->'accounts'->0->'consumed'->>'numerator')::numeric<>0 or fact->'deliveredExact'is distinct from ep->'accounts'->0->'delivered'or fact->>'allocationSourceHash'is distinct from ep->>'allocationSourceHash'then raise exception 'UTILITY_EFFECTS_EXACT_WATER_ACCOUNT_REQUIRED'using errcode='23514';end if;
    if not exists(select 1 from world_v2.authoritative_event q join world_v2.command_receipt z on z.world_id=q.world_id and z.command_id=q.causation_command_id and z.outcome='COMMITTED'where q.world_id=p_world and q.event_type='INDUSTRY_FIRST_DAY_WATER_EXECUTED_V1'and q.world_version<r.world_version_after and q.canonical_payload::jsonb->>'stage'='RIGHT_GRANTED'and q.canonical_payload::jsonb->'grant'->'right'->>'rightRef'=ep->'accounts'->0->>'rightRef'and world_v2.postwar_projection_utility_water_grant(p_world,q.causation_command_id,z.command_fingerprint,run.command_id,packet->>'seedFingerprint',packet->>'admissionRef'))then raise exception 'UTILITY_EFFECTS_ACTUAL_PRIOR_REGISTERED_WATER_RIGHT_REQUIRED'using errcode='23514';end if;
    perform world_v2.postwar_projection_utility_paid_input(p_world,c.country_id,operator_id,r.world_version_after,ep->'actualPaidInput');
    for prior in select value from jsonb_array_elements(ep->'powerUses')loop
     if not exists(select 1 from world_v2.authoritative_event q join world_v2.command_receipt z on z.world_id=q.world_id and z.command_id=q.causation_command_id and z.outcome='COMMITTED'where q.world_id=p_world and q.event_fingerprint=prior->>'eventFingerprint'and q.event_type='INDUSTRY_FIRST_DAY_POWER_EXECUTED_V1'and q.world_version<r.world_version_after and q.canonical_payload::jsonb->>'status'='PHYSICAL_SETTLEMENT_RECOMPUTED')then raise exception 'UTILITY_EFFECTS_ACTUAL_PRIOR_POWER_REQUIRED'using errcode='23514';end if;
    end loop;
   end if;
  end if;
  return true;
 end if;
 -- Logistics branches below use only actual committed order references and
 -- the immutable financial/inventory accounts already present in the ledger.
 orders:=world_v2.postwar_projection_industry_logistics_orders(p_world,c.country_id,intent->>'facilityId',intent->>'runId');
 if action not in('BOOK','SHIP','SERVICE_WORK','PAY_INPUTS','DELIVER')or ep->>'action'is distinct from action or ep->>'transferId'is distinct from op->>'transferId'then raise exception 'UTILITY_EFFECTS_EXACT_LOGISTICS_STAGE_REQUIRED'using errcode='23514';end if;
 src:=world_v2.postwar_projection_industry_original(p_world,jsonb_build_object('commandId',run.command_id,'fingerprint',run.command_fingerprint,'countryId',run.country_id),jsonb_build_object('eventId',re.event_id,'fingerprint',re.event_fingerprint,'canonicalPayload',re.canonical_payload));
 operator_id:=src->>'operatorId';
 if action='DELIVER'and(receipt->>'operatorId'is distinct from operator_id or receipt->>'locationId'is distinct from src->>'locationId')then raise exception 'UTILITY_EFFECTS_EXACT_HANDOVER_RECEIPT_SCOPE_REQUIRED'using errcode='23514';end if;
 if action in('SERVICE_WORK','PAY_INPUTS')then
  key:=case when action='SERVICE_WORK'then'workOrderRef'else'expenseOrderRef'end;
  select x into strict original from jsonb_array_elements(orders)x where x->>'kind'=(case when action='SERVICE_WORK'then'WORK'else'PAY'end)and x->>'originalRef'=op->>key and x->>'originalSha256'=op->>(case when action='SERVICE_WORK'then'workOrderSha256'else'expenseOrderSha256'end);
  ord:=(original->>'originalText')::jsonb;
  if original->>'originalText'is distinct from world_v2.canonical_json(ord)or original->>'originalSha256'is distinct from encode(sha256(convert_to(original->>'originalText','UTF8')),'hex')or ord->>'worldId'is distinct from p_world or ord->>'countryId'is distinct from c.country_id or ord->>'facilityId'is distinct from intent->>'facilityId'or ord->>'runId'is distinct from intent->>'runId'or ord->>'transferId'is distinct from op->>'transferId'or ord->>'operatorId'is distinct from operator_id then raise exception 'UTILITY_EFFECTS_EXACT_COMMITTED_ORDER_ORIGINAL_REQUIRED'using errcode='23514';end if;
  if action='SERVICE_WORK'then
   if jsonb_array_length(p_batches)<>0 or jsonb_array_length(p_inventory)<>0 or ep->>'schemaVersion'is distinct from'industry-logistics-service-work-v1'or ep->'allocations'is distinct from ord->'allocations'or ep->>'workOrderRef'is distinct from original->>'originalRef'or ep->>'workOrderSha256'is distinct from original->>'originalSha256'or ep->>'purpose'is distinct from'INDEPENDENT_INTERNAL_LOGISTICS_NOT_MANUFACTURING'then raise exception 'UTILITY_EFFECTS_REGISTERED_WORK_IS_NOT_PAYMENT_REQUIRED'using errcode='23514';end if;
  else
   if jsonb_array_length(p_batches)<>1 or jsonb_array_length(p_inventory)<>0 or ep->>'schemaVersion'is distinct from'industry-logistics-paid-input-v1'or ep->>'workEventFingerprint'is distinct from ord->>'workEventFingerprint'or ep->>'inputRef'is distinct from original->>'originalRef'or ep->>'inputRawSha256'is distinct from original->>'originalSha256'or ep->>'amount'is distinct from ord->>'amount'or ep->>'currency'is distinct from ord->>'currency'or ep->>'householdAccountId'is distinct from ord->>'householdAccountId'or ep->'budgetReferenceIsNotExpense'is distinct from'true'::jsonb then raise exception 'UTILITY_EFFECTS_EXACT_LOGISTICS_ACTUAL_PAYMENT_REQUIRED'using errcode='23514';end if;
   if not exists(select 1 from world_v2.authoritative_event q join world_v2.command_receipt z on z.world_id=q.world_id and z.command_id=q.causation_command_id and z.outcome='COMMITTED'where q.world_id=p_world and q.event_fingerprint=ord->>'workEventFingerprint'and q.event_type='INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTED_V1'and q.world_version<r.world_version_after and q.canonical_payload::jsonb->>'action'='SERVICE_WORK'and q.canonical_payload::jsonb->>'transferId'=op->>'transferId')then raise exception 'UTILITY_EFFECTS_ACTUAL_PRIOR_LOGISTICS_WORK_REQUIRED'using errcode='23514';end if;
   batch:=p_batches->0;legs:=batch->'legs';amount:=ord->>'amount';currency:=ord->>'currency';claims:=world_v2.postwar_projection_industry_wage_claims(p_world,c.country_id,operator_id);
   if jsonb_array_length(legs)<>6 or amount!~'^[0-9]+([.][0-9]+)?$'or amount::numeric<=0 or batch->>'settlementCurrency'is distinct from currency then raise exception 'UTILITY_EFFECTS_EXACT_SIX_LEG_SETTLEMENT_REQUIRED'using errcode='23514';end if;
   for leg in select value from jsonb_array_elements(legs)loop
    if leg->'amount'is distinct from jsonb_build_object('amount',amount,'currency',currency)or leg->'account'->>'worldId'is distinct from p_world or leg->'account'->>'countryId'is distinct from c.country_id or leg->'account'->>'currency'is distinct from currency then raise exception 'UTILITY_EFFECTS_EXACT_PAYMENT_LEG_SCOPE_REQUIRED'using errcode='23514';end if;
   end loop;
   if legs->0->>'direction'is distinct from'DEBIT'or legs->0->'account'->>'accountClass'is distinct from'EXPENSE'or legs->0->'account'->>'ownerId'is distinct from operator_id or legs->1->>'direction'is distinct from'CREDIT'or legs->1->'account'is distinct from claims->'payer'->'asset_account'or legs->2->>'direction'is distinct from'DEBIT'or legs->2->'account'is distinct from claims->'payer'->'liability_account'or legs->3->>'direction'is distinct from'DEBIT'or legs->3->'account'->>'accountId'is distinct from ord->>'householdAccountId'or legs->4->>'direction'is distinct from'CREDIT'or legs->4->'account'is distinct from claims->'household'->'liability_account'or legs->5->>'direction'is distinct from'CREDIT'or legs->5->'account'->>'accountClass'is distinct from'REVENUE'or legs->5->'account'->>'ownerId'is distinct from legs->3->'account'->>'ownerId'or legs->0->'account'->'claimId'is distinct from'null'::jsonb or legs->5->'account'->'claimId'is distinct from'null'::jsonb then raise exception 'UTILITY_EFFECTS_EXACT_ORIGINAL_DEPOSIT_COUNTERLEGS_REQUIRED'using errcode='23514';end if;
   asset:=legs->3->'account';liability:=claims->'household'->'liability_account';
   if to_regprocedure('world_v2.postwar_projection_utility_beneficiary(text,text,text,text,jsonb,jsonb,jsonb)')is not null then
    if not world_v2.postwar_projection_utility_beneficiary(p_world,c.country_id,original->>'seedFingerprint',original->>'admissionRef',asset,claims->'household'->'asset_account',liability)then raise exception 'UTILITY_EFFECTS_ACTUAL_BENEFICIARY_ACCOUNT_REQUIRED'using errcode='23514';end if;
   elsif asset is distinct from claims->'household'->'asset_account'then raise exception 'UTILITY_EFFECTS_ACTUAL_CHILD_ORIGINAL_READER_REQUIRED'using errcode='55000';end if;
   foreach key in array array['0:1','2:4','3:5']loop
    idx:=split_part(key,':',1)::integer;actual_count:=split_part(key,':',2)::integer;
    if legs->idx->>'counterpartyAccountId'is distinct from legs->actual_count->'account'->>'accountId'or legs->actual_count->>'counterpartyAccountId'is distinct from legs->idx->'account'->>'accountId'then raise exception 'UTILITY_EFFECTS_RECIPROCAL_SETTLEMENT_REQUIRED'using errcode='23514';end if;
   end loop;
  end if;
 else
  if jsonb_array_length(p_batches)<>0 or jsonb_array_length(p_inventory)<>1 or ep->>'schemaVersion'is distinct from'industry-logistics-stage-v1'then raise exception 'UTILITY_EFFECTS_EXACT_PHYSICAL_LOGISTICS_GROUP_REQUIRED'using errcode='23514';end if;
  if action='BOOK'then
   book:=ep->'plan';
   if book->>'classification'is distinct from'PLAN_BOOKING_NOT_COMPLETED_WORK_PAYMENT_OR_CUSTODY'or book->'request'is distinct from op->'request'or book->'actualQualifiedExpense'is distinct from'null'::jsonb or book->'budgetReference'->'isPriceOrExpense'is distinct from'false'::jsonb or book->'source'->>'worldId'is distinct from p_world or book->'source'->>'countryId'is distinct from c.country_id or book->'source'->>'facilityId'is distinct from intent->>'facilityId'or book->'source'->>'operatorId'is distinct from operator_id or book->'source'->>'seedId'is distinct from src->>'seedId'or book->'source'->>'seedFingerprint'is distinct from src->>'seedFingerprint'or book->'source'->>'toLocationId'=book->'source'->>'fromLocationId'or book->'source'->>'policyVersion'is distinct from'INDUSTRY_INTERNAL_LOGISTICS_FIRST_DAY_20261101_V1'or book->'request'->>'runId'is distinct from intent->>'runId'or book->'request'->>'transferId'is distinct from op->>'transferId'then raise exception 'UTILITY_EFFECTS_REGISTERED_RUN_BOUND_PLAN_REQUIRED'using errcode='23514';end if;
  else
   select q.canonical_payload::jsonb->'plan'into strict book from world_v2.authoritative_event q join world_v2.command_submission z on z.world_id=q.world_id and z.command_id=q.causation_command_id join world_v2.command_receipt final on final.world_id=z.world_id and final.command_id=z.command_id and final.outcome='COMMITTED'where q.world_id=p_world and z.country_id=c.country_id and z.command_type=c.command_type and z.canonical_payload::jsonb->>'facilityId'=intent->>'facilityId'and z.canonical_payload::jsonb->>'runId'=intent->>'runId'and q.event_type='INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTED_V1'and q.canonical_payload::jsonb->>'action'='BOOK'and q.canonical_payload::jsonb->>'transferId'=op->>'transferId'and final.world_version_after<r.world_version_after;
  end if;
  posting:=p_inventory->0;quantity:=case when action='BOOK'then ep->'plan'->'request'->'quantity'->>'amount'else ep->'quantity'->>'amount'end;
  if quantity!~'^[0-9]+([.][0-9]+)?$'or quantity::numeric<=0 or posting->>'operation'is distinct from(case action when'BOOK'then'RESERVE'when'SHIP'then'SHIP'else'DELIVER'end)or jsonb_array_length(posting->'entries')<>2 then raise exception 'UTILITY_EFFECTS_EXACT_LOGISTICS_INVENTORY_REQUIRED'using errcode='23514';end if;
  select x->'account'into strict source from jsonb_array_elements(posting->'entries')x where(x->'delta'->>'amount')::numeric<0;
  select x->'account'into strict destination from jsonb_array_elements(posting->'entries')x where(x->'delta'->>'amount')::numeric>0;
  if source-'bucket'-'reservationId'-'shipmentId'-'physicalLocationId'is distinct from destination-'bucket'-'reservationId'-'shipmentId'-'physicalLocationId'or source->>'worldId'is distinct from p_world or source->>'countryId'is distinct from c.country_id or source->>'titleHolderId'is distinct from operator_id or(action='BOOK'and(source->>'bucket'is distinct from'AVAILABLE'or destination->>'bucket'is distinct from'RESERVED'))or(action='SHIP'and(source->>'bucket'is distinct from'RESERVED'or destination->>'bucket'is distinct from'IN_TRANSIT'))or(action='DELIVER'and(source->>'bucket'is distinct from'IN_TRANSIT'or destination->>'bucket'is distinct from'AVAILABLE'))then raise exception 'UTILITY_EFFECTS_SAME_TITLE_RISK_NAMED_HANDOVER_REQUIRED'using errcode='23514';end if;
  for leg in select value from jsonb_array_elements(posting->'entries')loop
   if abs((leg->'delta'->>'amount')::numeric)<>quantity::numeric or leg->'delta'->>'unit'is distinct from source->>'unit'then raise exception 'UTILITY_EFFECTS_EXACT_INVENTORY_QUANTITY_REQUIRED'using errcode='23514';end if;
  end loop;
  if source->>'batchId'is distinct from book->'source'->>'batchId'or source->>'commodityId'is distinct from book->'source'->>'commodityId'or source->>'unit'is distinct from book->'request'->'quantity'->>'unit'or quantity is distinct from book->'request'->'quantity'->>'amount'or(action='BOOK'and source->>'physicalLocationId'is distinct from book->'source'->>'fromLocationId')or(action='DELIVER'and destination->>'physicalLocationId'is distinct from book->'source'->>'toLocationId')then raise exception 'UTILITY_EFFECTS_EXACT_BOOKED_STOCK_AND_QUANTITY_REQUIRED'using errcode='23514';end if;
  if action<>'BOOK'and(ep->'from'is distinct from source or ep->'to'is distinct from destination)then raise exception 'UTILITY_EFFECTS_EXACT_STAGE_LOCATIONS_REQUIRED'using errcode='23514';end if;
  if action in('SHIP','DELIVER')then
   select q.canonical_payload::jsonb into strict prior from world_v2.authoritative_event q join world_v2.command_submission z on z.world_id=q.world_id and z.command_id=q.causation_command_id join world_v2.command_receipt final on final.world_id=z.world_id and final.command_id=z.command_id and final.outcome='COMMITTED'where q.world_id=p_world and z.country_id=c.country_id and z.command_type=c.command_type and z.canonical_payload::jsonb->>'facilityId'=intent->>'facilityId'and z.canonical_payload::jsonb->>'runId'=intent->>'runId'and q.event_type='INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTED_V1'and q.canonical_payload::jsonb->>'action'=(case action when'SHIP'then'BOOK'else'SHIP'end)and q.canonical_payload::jsonb->>'transferId'=op->>'transferId'and final.world_version_after<r.world_version_after;
   if action='DELIVER'and source is distinct from prior->'to'then raise exception 'UTILITY_EFFECTS_ACTUAL_PRIOR_SHIPMENT_REQUIRED'using errcode='23514';end if;
  end if;
  if action='DELIVER'then
   if ep->>'handoverFactSha256'is distinct from'sha256:'||world_v2.authoritative_sha256(E'SHA-256\n'||world_v2.canonical_json(fact))or fact->>'schemaVersion'is distinct from'industry-logistics-named-handover-v1'or fact->>'worldId'is distinct from p_world or fact->>'countryId'is distinct from c.country_id or fact->>'operatorId'is distinct from operator_id or fact->>'facilityId'is distinct from intent->>'facilityId'or fact->>'runId'is distinct from intent->>'runId'or fact->>'transferId'is distinct from op->>'transferId'or fact->'quantity'is distinct from book->'request'->'quantity'or fact->>'from'is distinct from book->'source'->>'fromLocationId'or fact->>'to'is distinct from book->'source'->>'toLocationId'or jsonb_array_length(fact->'paidInputs')<1 then raise exception 'UTILITY_EFFECTS_ACTUAL_PAID_NAMED_HANDOVER_REQUIRED'using errcode='23514';end if;
   for prior in select value from jsonb_array_elements(fact->'paidInputs')loop
    select q.canonical_payload::jsonb into strict work from world_v2.authoritative_event q join world_v2.command_receipt final on final.world_id=q.world_id and final.command_id=q.causation_command_id and final.outcome='COMMITTED'where q.world_id=p_world and q.event_id=prior->>'eventId'and q.event_fingerprint=prior->>'eventFingerprint'and q.event_type='INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTED_V1'and q.causation_command_id=prior->>'commandId'and final.command_fingerprint=prior->>'commandFingerprint'and final.world_version_after<r.world_version_after;
    if work->>'action'is distinct from'PAY_INPUTS'or work->>'transferId'is distinct from op->>'transferId'or work->>'amount'is distinct from prior->>'amount'or work->>'currency'is distinct from prior->>'currency'or work->>'inputRef'is distinct from prior->>'inputRef'or work->>'inputRawSha256'is distinct from prior->>'inputRawSha256'or not exists(select 1 from world_v2.financial_posting_batch z where z.world_id=p_world and z.batch_id=prior->>'batchId'and z.batch_fingerprint=prior->>'batchFingerprint'and z.causation_command_id=prior->>'commandId')then raise exception 'UTILITY_EFFECTS_EXACT_PRIOR_PAID_BATCH_REQUIRED'using errcode='23514';end if;
   end loop;
  end if;
 end if;
 return true;
end;$$;
alter function world_v2.postwar_mixed_industry_utility_group(text,jsonb,jsonb,jsonb,jsonb,jsonb)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.postwar_mixed_industry_utility_group(text,jsonb,jsonb,jsonb,jsonb,jsonb)from public;
revoke create on schema world_v2 from world_v2_industry_source_owner,world_v2_postwar_projection_owner;
commit;
