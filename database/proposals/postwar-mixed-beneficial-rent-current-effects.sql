-- SOURCE-ONLY optional current-prefix extension. Depends on
-- postwar-mixed-current-projection-read.sql and
-- postwar-beneficial-housing-rent-custody.sql. Existing roles only; no runtime
-- table access, issuer enrollment, due publication or World/Clock activation.
begin;
grant create on schema world_v2 to world_v2_beneficial_rent_source_owner,world_v2_postwar_projection_owner;

-- Immutable paid history survives later revocation of the original rent source.
-- The current host admission is still checked/locked on every publication.
create function world_v2.postwar_projection_rent_original(p_world text,p_country text,p_seed text,p_admission text,p_event text,p_payload_sha text)returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a world_v2.runtime_opening_admission%rowtype;s world_v2.postwar_beneficial_rent_source%rowtype;e record;c record;rc record;r jsonb;begin
 a:=world_v2.beneficial_rent_admission(p_world);
 if a.world_id is distinct from p_world or a.seed_fingerprint is distinct from p_seed or a.admission_ref is distinct from p_admission then raise exception 'MIXED_RENT_CURRENT_ADMISSION_REQUIRED'using errcode='55000';end if;
 select * into strict s from world_v2.postwar_beneficial_rent_source x where x.world_id=p_world and x.country_id=p_country and x.seed_fingerprint=p_seed and x.admission_ref=p_admission for share;
 select * into strict e from world_v2.authoritative_event x where x.world_id=p_world and x.event_id=p_event and x.payload_sha256=p_payload_sha and x.event_type='POSTWAR_BENEFICIAL_HOUSING_RENT_SETTLED_V1'and x.corrects_event_id is null;
 select * into strict c from world_v2.command_submission x where x.world_id=p_world and x.command_id=e.causation_command_id and x.country_id=p_country and x.office_id is null and x.command_type='POSTWAR_BENEFICIAL_HOUSING_RENT_V1';
 select * into strict rc from world_v2.command_receipt x where x.world_id=p_world and x.command_id=c.command_id and x.command_fingerprint=c.command_fingerprint and x.outcome='COMMITTED'and x.reason_code is null and x.world_version_before=c.expected_world_version and x.world_version_after=e.world_version and x.sim_time=c.sim_time and x.event_ids=jsonb_build_array(e.event_id);
 if not exists(select 1 from world_v2.postwar_beneficial_rent_publication p where p.world_id=p_world and p.country_id=p_country and p.registration_ref=s.registration_ref and p.command_id=c.command_id and p.command_fingerprint=c.command_fingerprint and p.clock_sim_time=c.sim_time::text and rc.recorded_at_real>=p.valid_from_real and rc.recorded_at_real<p.valid_until_real)then raise exception 'MIXED_RENT_ORIGINAL_COMMAND_PUBLICATION_REQUIRED'using errcode='23514';end if;
 if e.payload_sha256 is distinct from'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||e.canonical_payload,'UTF8')),'hex')or e.sim_time is distinct from c.sim_time or octet_length(s.receipt_bytes)>65536 then raise exception 'MIXED_RENT_EXACT_COMMITTED_TRACE_REQUIRED'using errcode='23514';end if;
 r:=s.receipt_bytes::jsonb;
 if r->>'schemaVersion'is distinct from'beneficial-housing-reclassification.v1'or r->>'worldId'is distinct from p_world or r->>'countryId'is distinct from p_country or r->>'seedId'is distinct from a.seed_id or r->>'parentSeedFingerprint'is distinct from s.parent_seed_fingerprint or r->>'supplementalSourceId'is distinct from s.source_id or r->>'fingerprint'is distinct from s.receipt_fingerprint or s.receipt_fingerprint is distinct from'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(r-'fingerprint'),'UTF8')),'hex')or r->>'rentPaidAtOpening'is distinct from'0'or r->>'rentAccruedAtOpening'is distinct from'0'or r->'newLegalClaims'is distinct from'false'::jsonb or c.canonical_payload::jsonb->>'genesisReceiptFingerprint'is distinct from s.receipt_fingerprint or e.canonical_payload::jsonb->>'genesisReceiptFingerprint'is distinct from s.receipt_fingerprint then raise exception 'MIXED_RENT_EXACT_ADOPTED_CHILD_RECEIPT_REQUIRED'using errcode='23514';end if;
 if r->'originalAccount'->>'worldId'is distinct from p_world or r->'originalAccount'->>'countryId'is distinct from p_country or r->'originalAccount'->>'ownerId'is distinct from r->>'householdEntityId'or r->'originalAccount'->>'accountClass'is distinct from'ASSET'or r->'originalAccount'->>'claimId'is distinct from r->>'claimId'or r->'counterpartLiabilityAccount'->>'worldId'is distinct from p_world or r->'counterpartLiabilityAccount'->>'countryId'is distinct from p_country or r->'counterpartLiabilityAccount'->>'accountClass'is distinct from'LIABILITY'or r->'counterpartLiabilityAccount'->>'claimId'is distinct from r->>'claimId'or r->'counterpartLiabilityAccount'->>'currency'is distinct from r->'originalAccount'->>'currency'or r->'counterpartLiabilityAccount'->>'ownerId'is distinct from r->'originalAccount'->>'counterpartyEntityId'or r->'counterpartLiabilityAccount'->>'counterpartyEntityId'is distinct from r->>'householdEntityId'then raise exception 'MIXED_RENT_ADOPTED_RECIPROCAL_CLAIM_REQUIRED'using errcode='23514';end if;
 if jsonb_array_length(r->'subaccounts')<2 or(select count(*)from jsonb_array_elements(r->'subaccounts'))<>(select count(distinct x->>'groupId')from jsonb_array_elements(r->'subaccounts')x)or(select count(*)from jsonb_array_elements(r->'subaccounts'))<>(select count(distinct x->'account'->>'accountId')from jsonb_array_elements(r->'subaccounts')x)or exists(select 1 from jsonb_array_elements(r->'subaccounts')x where(x->>'openingAmount')::numeric<0 or x->'account'->>'accountId'=r->'originalAccount'->>'accountId')or(select sum((x->>'openingAmount')::numeric)from jsonb_array_elements(r->'subaccounts')x)is distinct from(r->>'originalAmount')::numeric then raise exception 'MIXED_RENT_UNIQUE_CONSERVING_OPENING_ALLOCATIONS_REQUIRED'using errcode='23514';end if;
 return r;
end;$$;
alter function world_v2.postwar_projection_rent_original(text,text,text,text,text,text)owner to world_v2_beneficial_rent_source_owner;
revoke all on function world_v2.postwar_projection_rent_original(text,text,text,text,text,text)from public;
grant execute on function world_v2.postwar_projection_rent_original(text,text,text,text,text,text)to world_v2_postwar_projection_owner;

-- Baselines are the immutable, Core-verified child receipt's actual account
-- allocations, not caller cash facts or the unreclassified parent account.
create function world_v2.postwar_projection_rent_balance(p_world text,p_account jsonb,p_before bigint,p_opening numeric)returns numeric
language plpgsql security definer set search_path=pg_catalog as $$
declare leg jsonb;balance numeric:=p_opening;begin
 if p_account->>'worldId'is distinct from p_world then raise exception 'MIXED_RENT_ACCOUNT_WORLD_REQUIRED'using errcode='23514';end if;
 for leg in select l from world_v2.financial_posting_batch b cross join lateral jsonb_array_elements(b.canonical_payload::jsonb->'legs')l where b.world_id=p_world and b.world_version_after<=p_before and l->'account'->>'accountId'=p_account->>'accountId'loop
  if leg->'account'is distinct from p_account or leg->'amount'->>'currency'is distinct from p_account->>'currency'or leg->>'direction'not in('DEBIT','CREDIT')then raise exception 'MIXED_RENT_CURRENT_EXACT_ACCOUNT_REQUIRED'using errcode='23514';end if;
  balance:=balance+(case when leg->>'direction'='DEBIT'then 1 else -1 end)*(leg->'amount'->>'amount')::numeric;
 end loop;return balance;
end;$$;
alter function world_v2.postwar_projection_rent_balance(text,jsonb,bigint,numeric)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.postwar_projection_rent_balance(text,jsonb,bigint,numeric)from public;

create function world_v2.postwar_mixed_beneficial_rent_group(p_world text,p_command jsonb,p_transition jsonb,p_event jsonb,p_batches jsonb,p_prior jsonb)returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a record;r jsonb;payload jsonb;ep jsonb;lease jsonb;tenant jsonb;landlord jsonb;sub jsonb;paid jsonb;binding jsonb;expected jsonb;expected_event jsonb;b jsonb;logical text;batch_id text;index_number numeric;due numeric;amount numeric;balance numeric;total numeric:=0;tenant_balance numeric;before_version bigint;begin
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 r:=world_v2.postwar_projection_rent_original(p_world,p_command->>'countryId',a.seed_fingerprint,a.admission_ref,p_event->>'eventId',p_event->>'payloadHash');
 payload:=(p_command->>'canonicalPayload')::jsonb;ep:=(p_event->>'canonicalPayload')::jsonb;paid:=coalesce(nullif(p_prior,'null'::jsonb),'[]'::jsonb);before_version:=(p_transition->>'worldVersionBefore')::bigint;
 if p_command->>'commandType'is distinct from'POSTWAR_BENEFICIAL_HOUSING_RENT_V1'or p_command->'officeId'is distinct from'null'::jsonb or p_command->>'worldId'is distinct from p_world or p_command->>'expectedWorldVersion'is distinct from p_transition->>'worldVersionBefore'or p_event->>'eventType'is distinct from'POSTWAR_BENEFICIAL_HOUSING_RENT_SETTLED_V1'or payload->>'schemaVersion'is distinct from'beneficial-housing-rent-command.v1'or(select count(*)from jsonb_object_keys(payload))<>4 or payload->>'genesisReceiptFingerprint'is distinct from r->>'fingerprint'or jsonb_typeof(paid)<>'array'or jsonb_array_length(p_batches)<>1 or payload->>'periodIndex'!~'^(0|[1-9][0-9]*)$'then raise exception 'MIXED_RENT_EXACT_COMMAND_AND_PERIOD_REQUIRED'using errcode='23514';end if;
 select x into strict lease from jsonb_array_elements(r->'leases')x where x->>'leaseId'=payload->>'leaseId';index_number:=(payload->>'periodIndex')::numeric;
 if index_number is distinct from(select count(*)::numeric from jsonb_array_elements(paid)x where x->>'leaseId'=lease->>'leaseId')then raise exception 'MIXED_RENT_PAID_PERIOD_DUPLICATE_OR_GAP'using errcode='23514';end if;
 due:=(lease->>'startTick')::numeric+(index_number+1)*(lease->>'periodTicks')::numeric;
 if due>(lease->>'endTick')::numeric or(p_command->>'simTime')::numeric<due or(p_command->>'simTime')::numeric<=0 then raise exception 'MIXED_RENT_PERIOD_NOT_DUE'using errcode='23514';end if;
 select x into strict tenant from jsonb_array_elements(r->'subaccounts')x where x->>'groupId'=lease->>'tenantGroupId';
 select x into strict landlord from jsonb_array_elements(r->'subaccounts')x where x->>'groupId'=lease->>'landlordGroupId';
 if tenant->>'groupId'=landlord->>'groupId'or tenant->'account'->>'accountId'=landlord->'account'->>'accountId'or lease->>'currency'is distinct from r->'originalAccount'->>'currency'then raise exception 'MIXED_RENT_DISTINCT_EXISTING_GROUPS_REQUIRED'using errcode='23514';end if;
 if world_v2.postwar_projection_rent_balance(p_world,r->'originalAccount',before_version,0)<>0 then raise exception 'MIXED_RENT_PARENT_CLAIM_DUPLICATED'using errcode='23514';end if;
 for sub in select x from jsonb_array_elements(r->'subaccounts')x loop
  if sub->'account'->>'ownerId'is distinct from r->>'householdEntityId'or sub->'account'->>'countryId'is distinct from p_command->>'countryId'or sub->'account'->>'claimId'is distinct from r->>'claimId'or sub->'account'->>'currency'is distinct from lease->>'currency'or sub->'account'->>'accountClass'is distinct from'ASSET'or sub->'account'->>'counterpartyEntityId'is distinct from r->'originalAccount'->>'counterpartyEntityId'then raise exception 'MIXED_RENT_EXACT_LEGAL_HOUSEHOLD_CLAIM_REQUIRED'using errcode='23514';end if;
  balance:=world_v2.postwar_projection_rent_balance(p_world,sub->'account',before_version,(sub->>'openingAmount')::numeric);
  if balance<0 then raise exception 'MIXED_RENT_BENEFICIAL_OVERDRAFT'using errcode='23514';end if;
  total:=total+balance;if sub->>'groupId'=tenant->>'groupId'then tenant_balance:=balance;end if;
 end loop;
 if world_v2.postwar_projection_rent_balance(p_world,r->'counterpartLiabilityAccount',before_version,-(r->>'originalAmount')::numeric)<>-total then raise exception 'MIXED_RENT_HOUSEHOLD_BANK_MIRROR_REQUIRED'using errcode='23514';end if;
 if exists(select 1 from world_v2.financial_posting_batch pb cross join lateral jsonb_array_elements(pb.canonical_payload::jsonb->'legs')l where pb.world_id=p_world and pb.world_version_after<=before_version and l->'account'->>'ownerId'=r->>'householdEntityId'and l->'account'->>'claimId'=r->>'claimId'and l->'account'->>'accountId'<>r->'originalAccount'->>'accountId'and not exists(select 1 from jsonb_array_elements(r->'subaccounts')x where x->'account'->>'accountId'=l->'account'->>'accountId'))then raise exception 'MIXED_RENT_UNREGISTERED_HOUSEHOLD_CLAIM'using errcode='23514';end if;
 amount:=(lease->>'rentPerHouseholdPerPeriod')::numeric*(lease->>'households')::numeric;
 if amount<=0 or tenant_balance is null or tenant_balance<amount then raise exception 'MIXED_RENT_ACTUAL_TENANT_FUNDS_REQUIRED'using errcode='23514';end if;
 logical:=upper(substr(encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(jsonb_build_object('receipt',r->>'fingerprint','leaseId',lease->>'leaseId','periodIndex',payload->>'periodIndex')),'UTF8')),'hex'),1,48));batch_id:='BATCH_BENEFICIAL_RENT_'||logical;
 if p_command->>'idempotencyKey'is distinct from'BENEFICIAL_RENT_'||logical then raise exception 'MIXED_RENT_DETERMINISTIC_IDEMPOTENCY_REQUIRED'using errcode='23514';end if;
 expected_event:=jsonb_build_object('schemaVersion','beneficial-housing-rent-event.v1','genesisReceiptFingerprint',r->>'fingerprint','leaseId',lease->>'leaseId','periodIndex',payload->>'periodIndex','landlordGroupId',landlord->>'groupId','tenantGroupId',tenant->>'groupId','landlordAccountId',landlord->'account'->>'accountId','tenantAccountId',tenant->'account'->>'accountId','amount',trim_scale(amount)::text,'currency',lease->>'currency');
 if ep is distinct from expected_event then raise exception 'MIXED_RENT_EXACT_CORE_EVENT_REQUIRED'using errcode='23514';end if;
 binding:=jsonb_build_object('schemaVersion','authoritative-transition-binding-v1','transitionId',p_command->>'commandId','worldId',p_world,'commandId',p_command->>'commandId','commandFingerprint',p_command->>'fingerprint','idempotencyKey',p_command->'idempotencyKey','expectedWorldVersion',p_command->'expectedWorldVersion','worldVersionBefore',p_transition->>'worldVersionBefore','worldVersionAfter',p_transition->>'worldVersionAfter','eventIds',p_transition->'eventIds','eventFingerprints',jsonb_build_array(p_event->>'fingerprint'),'simTime',p_command->>'simTime');
 expected:=jsonb_build_object('schemaVersion','financial-posting-v1','batchId',batch_id,'worldId',p_world,'causationCommandId',p_command->>'commandId','causationEventIds',p_transition->'eventIds','worldVersionBefore',p_transition->>'worldVersionBefore','worldVersionAfter',p_transition->>'worldVersionAfter','simTime',p_command->>'simTime','transitionBinding',binding,'settlementCurrency',lease->>'currency','legs',jsonb_build_array(jsonb_build_object('legId',batch_id||'_CREDIT','account',tenant->'account','direction','CREDIT','amount',jsonb_build_object('amount',trim_scale(amount)::text,'currency',lease->>'currency'),'counterpartyAccountId',landlord->'account'->>'accountId'),jsonb_build_object('legId',batch_id||'_DEBIT','account',landlord->'account','direction','DEBIT','amount',jsonb_build_object('amount',trim_scale(amount)::text,'currency',lease->>'currency'),'counterpartyAccountId',tenant->'account'->>'accountId')));
 b:=p_batches->0;if b-'fingerprint'is distinct from expected then raise exception 'MIXED_RENT_EXACT_CORE_TWO_LEG_BATCH_REQUIRED'using errcode='23514';end if;
 return paid||jsonb_build_array(jsonb_build_object('leaseId',lease->>'leaseId','periodIndex',payload->>'periodIndex','batchId',batch_id,'batchFingerprint',b->>'fingerprint','commandFingerprint',p_command->>'fingerprint','transitionFingerprint','sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(binding),'UTF8')),'hex'),'amount',trim_scale(amount)::text));
end;$$;
alter function world_v2.postwar_mixed_beneficial_rent_group(text,jsonb,jsonb,jsonb,jsonb,jsonb)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.postwar_mixed_beneficial_rent_group(text,jsonb,jsonb,jsonb,jsonb,jsonb)from public;
revoke create on schema world_v2 from world_v2_beneficial_rent_source_owner,world_v2_postwar_projection_owner;
commit;
