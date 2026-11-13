-- SOURCE-ONLY extension. Requires postwar-mixed-current-projection-read.sql,
-- central-bank-omo-custody.sql and postwar-narrow-trade-current-source.sql.
-- No role/member, economic command, quote, security or rights is created.
-- Private original access is narrowly delegated to the fixed projection owner;
-- operational readers retain only their existing bounded EXECUTE surface.
begin;
grant create on schema world_v2 to world_v2_postwar_projection_owner,world_v2_cb_omo_source_owner,world_v2_postwar_narrow_trade_current_owner;
grant select(world_id,posting_id,causation_command_id,world_version_before,world_version_after,sim_time,event_ids,transition_binding,operation,canonical_payload,posting_fingerprint)on world_v2.inventory_posting to world_v2_postwar_projection_owner;
create policy mixed_extended_inventory_owner_read on world_v2.inventory_posting for select to world_v2_postwar_projection_owner using(current_user='world_v2_postwar_projection_owner'and world_id=current_setting('econmind.postwar_projection_world',true));
create policy mixed_extended_inventory_owner_fence on world_v2.inventory_posting as restrictive for select to world_v2_postwar_projection_owner using(current_user='world_v2_postwar_projection_owner'and world_id=current_setting('econmind.postwar_projection_world',true));

create function world_v2.postwar_projection_omo_original(p_world text,p_country text,p_fp text,p_admission text,p_quote text)returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a record;o record;q record;qa record;body jsonb;begin
 perform set_config('econmind.cb_omo_world',p_world,true);
 select * into a from world_v2.central_bank_omo_adoption x where x.world_id=p_world and x.country_id=p_country and x.seed_fingerprint=p_fp and x.admission_ref=p_admission;
 if not found then raise exception 'MIXED_OMO_ADOPTED_ORIGINAL_REQUIRED'using errcode='55000';end if;
 select * into o from world_v2.central_bank_omo_original x where x.adoption_ref=a.adoption_ref;
 if not found or a.original_sha256 is distinct from o.original_sha256 or o.original_sha256 is distinct from encode(sha256(convert_to(o.original_text,'UTF8')),'hex')then raise exception 'MIXED_OMO_EXACT_ORIGINAL_REQUIRED'using errcode='23514';end if;
 select * into q from world_v2.central_bank_omo_quote x where x.adoption_ref=a.adoption_ref and x.quote_ref=p_quote;
 if not found then raise exception 'MIXED_OMO_ADOPTED_QUOTE_REQUIRED'using errcode='55000';end if;
 select * into qa from world_v2.central_bank_omo_quote_adoption x where x.adoption_ref=a.adoption_ref and x.quote_ref=p_quote;
 if not found or qa.quote_sha256 is distinct from q.quote_sha256 or q.quote_sha256 is distinct from encode(sha256(convert_to(q.quote_text,'UTF8')),'hex')then raise exception 'MIXED_OMO_EXACT_QUOTE_REQUIRED'using errcode='23514';end if;
 body:=o.original_text::jsonb;
 if body->>'worldId'is distinct from p_world or body->>'countryId'is distinct from p_country or body->>'seedFingerprint'is distinct from p_fp or body->>'sourceRef'is distinct from a.source_ref or body->>'sourceRevision'is distinct from a.source_revision then raise exception 'MIXED_OMO_ORIGINAL_SCOPE_REQUIRED'using errcode='23514';end if;
 -- This is historical committed evidence. Later source/quote revocation must
 -- not erase an already committed transfer. Current host is checked separately.
 return jsonb_build_object('original',body,'quote',q.quote_text::jsonb);
end;$$;
alter function world_v2.postwar_projection_omo_original(text,text,text,text,text)owner to world_v2_cb_omo_source_owner;
revoke all on function world_v2.postwar_projection_omo_original(text,text,text,text,text)from public;
grant execute on function world_v2.postwar_projection_omo_original(text,text,text,text,text)to world_v2_postwar_projection_owner;

create function world_v2.postwar_projection_trade_originals(p_world text,p_fp text)returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;begin
 perform set_config('econmind.narrow_current_world',p_world,true);
 select coalesce(jsonb_agg(jsonb_build_object('sourceId',o.source_id,'sourcePayloadHash',o.source_payload_hash,'original',o.canonical_payload::jsonb,'admissionRef',a.admission_ref)order by o.source_id),'[]'::jsonb)into result
 from world_v2.postwar_narrow_trade_current_original o join world_v2.postwar_narrow_trade_rights_admission a on a.world_id=o.world_id and a.source_id=o.source_id and a.seed_fingerprint=o.seed_fingerprint and a.source_payload_hash=o.source_payload_hash
 where o.world_id=p_world and o.seed_fingerprint=p_fp and o.source_payload_hash='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||'{"payload":'||o.canonical_payload||'}','UTF8')),'hex');
 if octet_length(result::text)>65536 then raise exception 'MIXED_TRADE_ORIGINALS_BOUNDED'using errcode='54000';end if;
 return result;
end;$$;
alter function world_v2.postwar_projection_trade_originals(text,text)owner to world_v2_postwar_narrow_trade_current_owner;
revoke all on function world_v2.postwar_projection_trade_originals(text,text)from public;
grant execute on function world_v2.postwar_projection_trade_originals(text,text)to world_v2_postwar_projection_owner;
grant select on world_v2.narrow_transfer_proposal,world_v2.narrow_transfer_approval_signature,world_v2.narrow_transfer_approval_reference to world_v2_postwar_narrow_trade_current_owner;
do $$declare t text;begin foreach t in array array['narrow_transfer_proposal','narrow_transfer_approval_signature','narrow_transfer_approval_reference']loop
 execute format('create policy mixed_trade_historical_read on world_v2.%I for select to world_v2_postwar_narrow_trade_current_owner using(current_user=''world_v2_postwar_narrow_trade_current_owner''and world_id=current_setting(''econmind.narrow_current_world'',true))',t);
 execute format('create policy mixed_trade_historical_fence on world_v2.%I as restrictive for select to world_v2_postwar_narrow_trade_current_owner using(current_user=''world_v2_postwar_narrow_trade_current_owner''and world_id=current_setting(''econmind.narrow_current_world'',true))',t);
end loop;end;$$;
create function world_v2.postwar_projection_trade_approved(p_world text,p_command text,p_fingerprint text,p_seller text,p_buyer text,p_subject uuid,p_actor text,p_at timestamptz)returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
declare seller record;buyer record;begin
 perform set_config('econmind.narrow_current_world',p_world,true);
 select * into seller from world_v2.narrow_transfer_proposal p where p.world_id=p_world and p.command_id=p_command and p.command_fingerprint=p_fingerprint and p.country_id=p_seller and p.status='APPROVED'and p.required_offices@>'["TRADE"]'::jsonb and jsonb_array_length(p.required_offices)=1 and p.policy_version='V10_TREASURY_GCU_V1'and p.threshold_policy_version='V10_TREASURY_GCU_THRESHOLD_V1'and p.approved_at_real<=p_at;
 if not found then return false;end if;
 select * into buyer from world_v2.narrow_transfer_proposal p where p.world_id=p_world and p.command_id=p_command and p.command_fingerprint=p_fingerprint and p.country_id=p_buyer and p.status='APPROVED'and p.required_offices@>'["TRADE","FINANCE"]'::jsonb and jsonb_array_length(p.required_offices)=2 and p.policy_version='V10_TREASURY_GCU_V1'and p.threshold_policy_version='V10_TREASURY_GCU_THRESHOLD_V1'and p.approved_at_real<=p_at;
 if not found then return false;end if;
 return exists(select 1 from world_v2.narrow_transfer_approval_signature s where s.world_id=p_world and s.proposal_id=seller.proposal_id and s.country_id=p_seller and s.office_id='TRADE'and s.auth_subject=p_subject and s.actor_id=p_actor and s.signed_at_real<=p_at)
 and(select count(*)from world_v2.narrow_transfer_approval_signature s where s.world_id=p_world and s.proposal_id=buyer.proposal_id and s.country_id=p_buyer and s.office_id in('TRADE','FINANCE')and s.signed_at_real<=p_at)=2
 -- An HTTP lookup reference is optional for an already durable three-signature
 -- command. If present it must bind that actual Finance signature exactly.
 and not exists(select 1 from world_v2.narrow_transfer_approval_reference r join world_v2.narrow_transfer_approval_signature s on s.world_id=r.world_id and s.proposal_id=r.proposal_id and s.office_id='FINANCE'where r.world_id=p_world and r.proposal_id=buyer.proposal_id and(r.command_id is distinct from p_command or r.command_fingerprint is distinct from p_fingerprint or r.buyer_country_id is distinct from p_buyer or r.finance_actor_id is distinct from s.actor_id or r.finance_auth_subject is distinct from s.auth_subject or r.finance_authorization_version is distinct from s.authorization_version or r.finance_signed_at_real is distinct from s.signed_at_real or r.bound_at_real>p_at));
end;$$;
alter function world_v2.postwar_projection_trade_approved(text,text,text,text,text,uuid,text,timestamptz)owner to world_v2_postwar_narrow_trade_current_owner;
revoke all on function world_v2.postwar_projection_trade_approved(text,text,text,text,text,uuid,text,timestamptz)from public;
grant execute on function world_v2.postwar_projection_trade_approved(text,text,text,text,text,uuid,text,timestamptz)to world_v2_postwar_projection_owner;

-- Exact immutable H0 legs plus every earlier actual posting. This is a derived
-- arithmetic view, never a second ledger or a source of spending permission.
create function world_v2.postwar_projection_current_account_balance(p_world text,p_account jsonb,p_before bigint)returns numeric
language plpgsql security definer set search_path=pg_catalog as $$
declare a record;leg jsonb;total numeric:=0;begin
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 for leg in
  select distinct on(x->'leg'->>'legId')x->'leg'from world_v2.postwar_office_projection_document d join world_v2.postwar_office_projection_page pg on pg.document_ref=d.document_ref cross join lateral jsonb_array_elements(pg.rows_text::jsonb)x
   where d.world_id=p_world and d.dataset='opening-financial-legs'and d.office_id in('FINANCE','CENTRAL_BANK')and d.seed_fingerprint=a.seed_fingerprint and d.admission_ref=a.admission_ref and d.world_version=0 and d.event_sequence=0 and x->'leg'->'account'->>'accountId'=p_account->>'accountId'
 loop
  if (p_account?'ownerId'and leg->'account'is distinct from p_account)or leg->'account'->>'worldId'is distinct from p_world or(p_account?'currency'and leg->'amount'->>'currency'is distinct from p_account->>'currency')or leg->>'direction'not in('DEBIT','CREDIT')then raise exception 'MIXED_H0_EXACT_ACCOUNT_REQUIRED'using errcode='23514';end if;
  total:=total+(case when leg->>'direction'='DEBIT'then 1 else -1 end)*(leg->'amount'->>'amount')::numeric;
 end loop;
 for leg in select l from world_v2.financial_posting_batch b cross join lateral jsonb_array_elements(b.canonical_payload::jsonb->'legs')l where b.world_id=p_world and b.world_version_after<=p_before and l->'account'->>'accountId'=p_account->>'accountId'loop
  if (p_account?'ownerId'and leg->'account'is distinct from p_account)or leg->'account'->>'worldId'is distinct from p_world or(p_account?'currency'and leg->'amount'->>'currency'is distinct from p_account->>'currency')or leg->>'direction'not in('DEBIT','CREDIT')then raise exception 'MIXED_CURRENT_EXACT_ACCOUNT_REQUIRED'using errcode='23514';end if;
  total:=total+(case when leg->>'direction'='DEBIT'then 1 else -1 end)*(leg->'amount'->>'amount')::numeric;
 end loop;return total;
end;$$;
alter function world_v2.postwar_projection_current_account_balance(text,jsonb,bigint)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.postwar_projection_current_account_balance(text,jsonb,bigint)from public;

create function world_v2.postwar_projection_current_inventory_balance(p_world text,p_account jsonb,p_before bigint)returns numeric
language plpgsql security definer set search_path=pg_catalog as $$
declare a record;entry jsonb;total numeric:=0;begin
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 for entry in select x from world_v2.postwar_office_projection_document d join world_v2.postwar_office_projection_page pg on pg.document_ref=d.document_ref cross join lateral jsonb_array_elements(pg.rows_text::jsonb)x where d.world_id=p_world and d.office_id='TRADE'and d.dataset='opening-inventory-entries'and d.seed_fingerprint=a.seed_fingerprint and d.admission_ref=a.admission_ref and d.world_version=0 and d.event_sequence=0 and x->'account'=p_account loop
  if entry->'quantity'->>'unit'is distinct from p_account->>'unit'then raise exception 'MIXED_H0_INVENTORY_UNIT_REQUIRED'using errcode='23514';end if;
  total:=total+(entry->'quantity'->>'amount')::numeric;
 end loop;
 for entry in select e from world_v2.inventory_posting p cross join lateral jsonb_array_elements(p.canonical_payload::jsonb->'entries')e where p.world_id=p_world and p.world_version_after<=p_before and e->'account'=p_account loop
  if entry->'delta'->>'unit'is distinct from p_account->>'unit'then raise exception 'MIXED_CURRENT_INVENTORY_UNIT_REQUIRED'using errcode='23514';end if;
  total:=total+(entry->'delta'->>'amount')::numeric;
 end loop;return total;
end;$$;
alter function world_v2.postwar_projection_current_inventory_balance(text,jsonb,bigint)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.postwar_projection_current_inventory_balance(text,jsonb,bigint)from public;

create function world_v2.postwar_mixed_omo_group(p_world text,p_command jsonb,p_transition jsonb,p_event jsonb,p_batches jsonb,p_prior jsonb)returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a record;packet jsonb;o jsonb;q jsonb;ep jsonb;s jsonb;intent jsonb;holdings jsonb;after_holdings jsonb:='[]';h jsonb;bank_h jsonb;cb_h jsonb;seller jsonb;buy boolean;price numeric;face numeric;settlement numeric;key text;side text;maps jsonb;snapshot jsonb;fields jsonb;owner text;value numeric;expected_value numeric;assets numeric;equity numeric;rate numeric;acct jsonb;entry jsonb;binding jsonb;accounts jsonb;legs jsonb:='[]';b jsonb;expected jsonb;direction text;n integer;holder text;
begin
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 intent:=(p_command->>'canonicalPayload')::jsonb;ep:=(p_event->>'canonicalPayload')::jsonb;s:=ep->'source';q:=s->'quote';
 packet:=world_v2.postwar_projection_omo_original(p_world,p_command->>'countryId',a.seed_fingerprint,a.admission_ref,q->>'quoteRef');o:=packet->'original';
 if p_command->>'officeId'is distinct from 'CENTRAL_BANK'or p_command->>'commandType'is distinct from 'CORE_CENTRAL_BANK_OMO_V1'or p_event->>'eventType'is distinct from 'CENTRAL_BANK_OMO_SETTLED_V1'or ep->>'schemaVersion'is distinct from 'central-bank-omo-settlement-v1'or ep->>'commandFingerprint'is distinct from p_command->>'fingerprint'or ep->'intent'is distinct from intent or q is distinct from packet->'quote'or s->>'worldId'is distinct from p_world or s->>'countryId'is distinct from p_command->>'countryId'or s->>'worldVersion'is distinct from p_transition->>'worldVersionBefore'or s->>'currentEventSequence'is distinct from((p_event->>'sequence')::bigint-1)::text or s->>'currentSimTime'is distinct from p_command->>'simTime'or s->>'domesticTreasuryRef'is distinct from o->>'domesticTreasuryRef'or s->'bankAccounts'is distinct from o->'bankAccounts'or s->'centralBankAccounts'is distinct from o->'centralBankAccounts'or s->'valuationQuote'is distinct from o->'valuationQuote'then raise exception 'MIXED_OMO_EXACT_COMMAND_SOURCE_REQUIRED'using errcode='23514';end if;
 if intent->>'schemaVersion'is distinct from 'central-bank-omo-intent-v1'or intent->>'direction'not in('BUY_GOVERNMENT_SECURITIES','SELL_GOVERNMENT_SECURITIES')or intent->>'settlementSimTime'is distinct from p_command->>'simTime'or q->>'worldVersion'is distinct from p_transition->>'worldVersionBefore'or q->>'validAtSimTime'is distinct from p_command->>'simTime'or q->>'securityRef'is distinct from intent->>'securityRef'or q->>'batchRef'is distinct from intent->>'batchRef'or q->>'issuerRef'is distinct from o->>'domesticTreasuryRef'or q->>'sourceRef'is distinct from o->>'sourceRef'or q->>'currency'is distinct from intent->'faceValue'->>'currency'then raise exception 'MIXED_OMO_CURRENT_INSTRUMENT_QUOTE_REQUIRED'using errcode='23514';end if;
 price:=(q->>'pricePerFace')::numeric;face:=(intent->'faceValue'->>'amount')::numeric;settlement:=price*face;
 if price<=0 or face<=0 or(q->>'pricePerFace')!~'^(0|[1-9][0-9]*)([.][0-9]*[1-9])?$'or(intent->'faceValue'->>'amount')!~'^(0|[1-9][0-9]*)([.][0-9]*[1-9])?$'or jsonb_array_length(p_batches)<>1 then raise exception 'MIXED_OMO_POSITIVE_EXACT_SETTLEMENT_REQUIRED'using errcode='23514';end if;
 holdings:=coalesce(nullif(p_prior,'null'::jsonb),o->'holdings');
 if s->'holdings'is distinct from holdings or ep->'rights'->'before'is distinct from holdings then raise exception 'MIXED_OMO_COMPLETE_RIGHTS_PREFIX_REQUIRED'using errcode='23514';end if;
 if(select count(*)from jsonb_array_elements(holdings))<>(select count(distinct (x->>'securityRef',x->>'batchRef',x->>'holderRef'))from jsonb_array_elements(holdings)x)or exists(select 1 from jsonb_array_elements(holdings)x where x->>'holderRef'not in(o->'bank'->>'bankRef',o->'centralBank'->>'centralBankRef')or x->>'issuerRef'is distinct from o->>'domesticTreasuryRef'or x->>'currency'is distinct from q->>'currency'or(x->>'encumberedFaceValue')::numeric>(x->>'faceValue')::numeric or(x->>'faceValue')::numeric<0 or(x->>'encumberedFaceValue')::numeric<0 or(x->>'carryingValue')::numeric<0)then raise exception 'MIXED_OMO_COMPLETE_UNIQUE_HELD_REGISTER_REQUIRED'using errcode='23514';end if;
 if coalesce((select sum((x->>'carryingValue')::numeric)from jsonb_array_elements(holdings)x where x->>'holderRef'=o->'bank'->>'bankRef'),0)is distinct from(s->'bank'->'governmentSecurities'->>'amount')::numeric or coalesce((select sum((x->>'carryingValue')::numeric)from jsonb_array_elements(holdings)x where x->>'holderRef'=o->'centralBank'->>'centralBankRef'),0)is distinct from(s->'centralBank'->'governmentSecurities'->>'amount')::numeric then raise exception 'MIXED_OMO_POSTED_HELD_REGISTER_SUM_REQUIRED'using errcode='23514';end if;
 if ep->'trace'->'snapshot'->>'snapshotHash'is distinct from encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(s),'UTF8')),'hex')or ep->'trace'->'snapshot'->>'sourceVersion'is distinct from'WORLD_VERSION.'||(p_transition->>'worldVersionBefore')or ep->'trace'->'snapshotAt'is distinct from jsonb_build_object('amount',p_command->>'simTime','unit','sim_millisecond')then raise exception 'MIXED_OMO_CORE_SOURCE_TRACE_REQUIRED'using errcode='23514';end if;
 select j.value into strict bank_h from jsonb_array_elements(holdings)j where j.value->>'holderRef'=o->'bank'->>'bankRef'and j.value->>'batchRef'=intent->>'batchRef';
 select j.value into strict cb_h from jsonb_array_elements(holdings)j where j.value->>'holderRef'=o->'centralBank'->>'centralBankRef'and j.value->>'batchRef'=intent->>'batchRef';
 buy:=intent->>'direction'='BUY_GOVERNMENT_SECURITIES';seller:=case when buy then bank_h else cb_h end;
 if (seller->>'faceValue')::numeric-(seller->>'encumberedFaceValue')::numeric<face then raise exception 'MIXED_OMO_ACTUAL_UNENCUMBERED_FACE_REQUIRED'using errcode='23514';end if;
 for h in select j.value from jsonb_array_elements(holdings)j loop
  if h->>'batchRef'=intent->>'batchRef'then
   if h->>'holderRef'not in(o->'bank'->>'bankRef',o->'centralBank'->>'centralBankRef')or h->>'securityRef'is distinct from q->>'securityRef'or h->>'issuerRef'is distinct from q->>'issuerRef'or h->>'currency'is distinct from q->>'currency'or(h->>'maturitySimTime')::numeric<=(p_command->>'simTime')::numeric or h->>'maturitySimTime'is distinct from bank_h->>'maturitySimTime'or(h->>'carryingValue')::numeric is distinct from(h->>'faceValue')::numeric*price then raise exception 'MIXED_OMO_ISSUED_VALUED_HELD_SECURITY_REQUIRED'using errcode='23514';end if;
   n:=case when h->>'holderRef'=seller->>'holderRef'then -1 else 1 end;
   h:=h||jsonb_build_object('faceValue',trim_scale((h->>'faceValue')::numeric+n*face)::text,'carryingValue',trim_scale((h->>'carryingValue')::numeric+n*settlement)::text);
  end if;after_holdings:=after_holdings||jsonb_build_array(h);
 end loop;
 if ep->'rights'is distinct from jsonb_build_object('before',holdings,'after',after_holdings,'settlementAmount',jsonb_build_object('amount',trim_scale(settlement)::text,'currency',q->>'currency'))then raise exception 'MIXED_OMO_EXACT_RIGHTS_TRANSFER_REQUIRED'using errcode='23514';end if;
 -- All snapshots are recomputed from actual opening legs and earlier postings.
 -- Explicit zero accounts are allowed only through the adopted account map.
 foreach side in array array['bank','centralBank']loop
  maps:=o->case when side='bank'then'bankAccounts'else'centralBankAccounts'end;snapshot:=s->side;
  owner:=o->side->>case when side='bank'then'bankRef'else'centralBankRef'end;
  fields:=case when side='bank'then'{"reservesAtCentralBank":"ASSET","settlementCash":"CASH","loanAssets":"ASSET","governmentSecurities":"ASSET","otherAssets":"ASSET","demandDeposits":"LIABILITY","savingsDeposits":"LIABILITY","timeDeposits":"LIABILITY","wholesaleFunding":"LIABILITY","centralBankRefinancingBorrowing":"LIABILITY","centralBankEmergencyLiquidityBorrowing":"LIABILITY","otherLiabilities":"LIABILITY","equity":"EQUITY"}'::jsonb else'{"governmentSecurities":"ASSET","regularRefinancingLoans":"ASSET","emergencyLiquidityLoans":"ASSET","otherAssets":"ASSET","currencyInCirculation":"LIABILITY","commercialBankReserves":"LIABILITY","treasuryDeposits":"LIABILITY","centralBankBills":"LIABILITY","otherLiabilities":"LIABILITY","equity":"EQUITY"}'::jsonb end;
  if snapshot->>'currency'is distinct from q->>'currency'or snapshot->>'centralBankRef'is distinct from o->side->>'centralBankRef'or snapshot->>'bankRef'is distinct from o->side->>'bankRef'or snapshot->>'commercialBankRef'is distinct from o->side->>'commercialBankRef'or snapshot->'nonPerformingLoans'is distinct from o->side->'nonPerformingLoans'then raise exception 'MIXED_OMO_SNAPSHOT_OWNER_SOURCE_REQUIRED'using errcode='23514';end if;
  assets:=0;equity:=0;
  if o?'valuationQuote'then
   rate:=(o->'valuationQuote'->>'localCurrencyPerGcu')::numeric;
   if rate<=0 or o->'valuationQuote'->>'countryId'is distinct from p_command->>'countryId'or o->'valuationQuote'->>'localCurrency'is distinct from q->>'currency'or(p_command->>'simTime')::numeric<(o->'valuationQuote'->>'validFromSimTime')::numeric or(p_command->>'simTime')::numeric>=(o->'valuationQuote'->>'validUntilSimTime')::numeric then raise exception 'MIXED_OMO_EXACT_FOREIGN_VALUATION_REQUIRED'using errcode='23514';end if;
   for acct in select distinct x->'leg'->'account'from world_v2.postwar_office_projection_document d join world_v2.postwar_office_projection_page pg on pg.document_ref=d.document_ref cross join lateral jsonb_array_elements(pg.rows_text::jsonb)x where d.world_id=p_world and d.dataset='opening-financial-legs'and d.seed_fingerprint=a.seed_fingerprint and d.admission_ref=a.admission_ref and x->'leg'->'account'->>'ownerId'=owner and x->'leg'->'account'->>'currency'='GCU'loop
    if acct->>'accountClass'not in('CASH','EQUITY')or acct->'claimId'is distinct from'null'::jsonb or acct->'counterpartyEntityId'is distinct from'null'::jsonb then raise exception 'MIXED_OMO_FOREIGN_REGISTER_UNSUPPORTED'using errcode='23514';end if;
    value:=world_v2.postwar_projection_current_account_balance(p_world,acct,(p_transition->>'worldVersionBefore')::bigint);
    if acct->>'accountClass'='CASH'then assets:=assets+value*rate;else equity:=equity-value*rate;end if;
   end loop;
  end if;
  for key in select jsonb_object_keys(fields)loop
   value:=world_v2.postwar_projection_current_account_balance(p_world,jsonb_build_object('accountId',maps->>key,'currency',q->>'currency'),(p_transition->>'worldVersionBefore')::bigint);
   expected_value:=(case when fields->>key in('LIABILITY','EQUITY')then -value else value end)+case when key=case when side='bank'then'settlementCash'else'otherAssets'end then assets when key='equity'then equity else 0 end;
   if snapshot->key->>'currency'is distinct from q->>'currency'or(snapshot->key->>'amount')::numeric is distinct from expected_value then raise exception 'MIXED_OMO_POSTED_SNAPSHOT_REQUIRED'using errcode='23514';end if;
  end loop;
 end loop;
 b:=p_batches->0;accounts:=jsonb_build_array(b->'legs'->0->'account',b->'legs'->1->'account',b->'legs'->2->'account',b->'legs'->3->'account');
 if jsonb_array_length(b->'legs')<>4 or accounts->0->>'accountId'is distinct from o->'centralBankAccounts'->>'governmentSecurities'or accounts->1->>'accountId'is distinct from o->'centralBankAccounts'->>'commercialBankReserves'or accounts->2->>'accountId'is distinct from o->'bankAccounts'->>'reservesAtCentralBank'or accounts->3->>'accountId'is distinct from o->'bankAccounts'->>'governmentSecurities'or accounts->1->>'claimId'is null or accounts->1->>'claimId'is distinct from accounts->2->>'claimId'or accounts->1->>'counterpartyEntityId'is distinct from o->'bank'->>'bankRef'or accounts->2->>'counterpartyEntityId'is distinct from o->'centralBank'->>'centralBankRef'then raise exception 'MIXED_OMO_EXACT_FOUR_ACCOUNTS_REQUIRED'using errcode='23514';end if;
 binding:=jsonb_build_object('schemaVersion','authoritative-transition-binding-v1','transitionId',p_command->>'commandId','worldId',p_world,'commandId',p_command->>'commandId','commandFingerprint',p_command->>'fingerprint','idempotencyKey',p_command->'idempotencyKey','expectedWorldVersion',p_command->'expectedWorldVersion','worldVersionBefore',p_transition->>'worldVersionBefore','worldVersionAfter',p_transition->>'worldVersionAfter','eventIds',p_transition->'eventIds','eventFingerprints',jsonb_build_array(p_event->>'fingerprint'),'simTime',p_command->>'simTime');
 for n in 0..3 loop
  acct:=accounts->n;holder:=case when n<2 then o->'centralBank'->>'centralBankRef'else o->'bank'->>'bankRef'end;
  if acct->>'worldId'is distinct from p_world or acct->>'countryId'is distinct from p_command->>'countryId'or acct->>'ownerId'is distinct from holder or acct->>'currency'is distinct from q->>'currency'or acct->>'accountClass'is distinct from(case when n=1 then'LIABILITY'else'ASSET'end)then raise exception 'MIXED_OMO_ACCOUNT_OWNER_CLASS_REQUIRED'using errcode='23514';end if;
  direction:=case when (n in(0,2))=buy then'DEBIT'else'CREDIT'end;
  if direction='CREDIT'and n<>1 and world_v2.postwar_projection_current_account_balance(p_world,acct,(p_transition->>'worldVersionBefore')::bigint)<settlement then raise exception 'MIXED_OMO_NO_ASSET_OVERDRAFT'using errcode='23514';end if;
  legs:=legs||jsonb_build_array(jsonb_build_object('legId',(b->>'batchId')||'_LEG_'||(n+1)::text,'account',acct,'amount',jsonb_build_object('amount',trim_scale(settlement)::text,'currency',q->>'currency'),'direction',direction,'counterpartyAccountId',case when n=1 then accounts->2->'accountId'when n=2 then accounts->1->'accountId'else'null'::jsonb end));
 end loop;
 expected:=jsonb_build_object('schemaVersion','financial-posting-v1','batchId',b->>'batchId','worldId',p_world,'causationCommandId',p_command->>'commandId','causationEventIds',p_transition->'eventIds','worldVersionBefore',p_transition->>'worldVersionBefore','worldVersionAfter',p_transition->>'worldVersionAfter','simTime',p_command->>'simTime','transitionBinding',binding,'settlementCurrency',q->>'currency','legs',legs);
 if b-'fingerprint'is distinct from expected then raise exception 'MIXED_OMO_EXACT_CORE_FOUR_LEG_BATCH_REQUIRED'using errcode='23514';end if;
 return after_holdings;
end;$$;
alter function world_v2.postwar_mixed_omo_group(text,jsonb,jsonb,jsonb,jsonb,jsonb)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.postwar_mixed_omo_group(text,jsonb,jsonb,jsonb,jsonb,jsonb)from public;

create function world_v2.postwar_mixed_goods_group(p_world text,p_command jsonb,p_transition jsonb,p_event jsonb,p_batches jsonb,p_inventory jsonb)returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare a record;t record;r record;payload jsonb;terms jsonb;ep jsonb;originals jsonb;record jsonb;operation text;transfer_id text;transfer_fp text;quantity numeric;price numeric;settlement numeric;source jsonb;destination jsonb;posting jsonb;expected jsonb;binding jsonb;shipment text;mandate boolean:=false;route boolean:=false;batch jsonb;legs jsonb;buyer jsonb;seller jsonb;gov text;at_sim numeric;
begin
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 payload:=(p_command->>'canonicalPayload')::jsonb;ep:=(p_event->>'canonicalPayload')::jsonb;
 operation:=case p_command->>'commandType'when'CORE_GOODS_TRANSFER_V1'then'RESERVE'when'CORE_GOODS_SHIPMENT_V1'then'SHIP'when'CORE_GOODS_DELIVERY_V1'then'DELIVER'else null end;
 if operation is null or jsonb_array_length(p_inventory)<>1 or(operation='DELIVER'and jsonb_array_length(p_batches)<>1)or(operation<>'DELIVER'and jsonb_array_length(p_batches)<>0)then raise exception 'MIXED_GOODS_EXACT_POSTING_GROUP_REQUIRED'using errcode='23514';end if;
 transfer_id:=case when operation='RESERVE'then p_command->>'commandId'else payload->>'transferCommandId'end;
 select * into strict t from world_v2.command_submission c where c.world_id=p_world and c.command_id=transfer_id and c.command_type='CORE_GOODS_TRANSFER_V1'and c.office_id='TRADE';
 select * into strict r from world_v2.command_receipt x where x.world_id=p_world and x.command_id=transfer_id and x.outcome='COMMITTED';
 transfer_fp:=t.command_fingerprint;terms:=t.canonical_payload::jsonb;at_sim:=t.sim_time;
 if terms->>'schemaVersion'is distinct from'core-goods-transfer-v1'or terms->>'commodityId'is distinct from'GRAIN'or terms->>'sellerCountryId'is distinct from t.country_id or terms->>'buyerCountryId'=t.country_id or terms->>'paymentSource'is distinct from'BUYER_TREASURY_GCU'or terms->>'policyVersion'is distinct from'V10_TREASURY_GCU_V1'or terms->'threshold'is distinct from'{"policyVersion":"V10_TREASURY_GCU_THRESHOLD_V1","maxSettlement":{"amount":"6","currency":"GCU"}}'::jsonb or terms->'price'->>'currency'is distinct from'GCU'or terms->'price'->>'perUnit'is distinct from terms->'quantity'->>'unit'then raise exception 'MIXED_GOODS_EXACT_NARROW_TERMS_REQUIRED'using errcode='23514';end if;
 quantity:=(terms->'quantity'->>'amount')::numeric;price:=(terms->'price'->>'amount')::numeric;settlement:=quantity*price;
 if quantity<=0 or price<=0 or settlement>6 or(terms->'quantity'->>'amount')!~'^(0|[1-9][0-9]*)([.][0-9]*[1-9])?$'or(terms->'price'->>'amount')!~'^(0|[1-9][0-9]*)([.][0-9]*[1-9])?$'then raise exception 'MIXED_GOODS_EXACT_POSITIVE_LIMIT_REQUIRED'using errcode='23514';end if;
 if p_command->>'countryId'is distinct from terms->>'sellerCountryId'or(operation='RESERVE'and p_command->>'officeId'is distinct from'TRADE')or(operation<>'RESERVE'and p_command->'officeId'is distinct from'null'::jsonb)or(operation<>'RESERVE'and(r.world_version_after>(p_transition->>'worldVersionBefore')::bigint or payload->>'transferFingerprint'is distinct from transfer_fp))then raise exception 'MIXED_GOODS_PRECEDING_COMMITTED_TRANSFER_REQUIRED'using errcode='23514';end if;
 if not world_v2.postwar_projection_trade_approved(p_world,transfer_id,transfer_fp,terms->>'sellerCountryId',terms->>'buyerCountryId',t.auth_subject,t.actor_id,r.recorded_at_real)then raise exception 'MIXED_GOODS_THREE_HISTORICAL_APPROVALS_REQUIRED'using errcode='23514';end if;
 originals:=world_v2.postwar_projection_trade_originals(p_world,a.seed_fingerprint);
 for record in select x from jsonb_array_elements(originals)o cross join lateral jsonb_array_elements(o->'original'->'records')x loop
  if record->'revokedByRevision'is distinct from'null'::jsonb or(record->>'effectiveFromSimTime')::numeric>at_sim or(record->>'effectiveUntilSimTime'is not null and(record->>'effectiveUntilSimTime')::numeric<=at_sim)or record->>'commodityId'is distinct from'GRAIN'or record->>'unit'is distinct from terms->'quantity'->>'unit'or(record->>'maximumQuantity')::numeric<quantity then continue;end if;
  if record->>'kind'='OWNER_TRANSFER_MANDATE'and record->>'countryId'=terms->>'sellerCountryId'and record->>'ownerId'=terms->'assetSource'->>'titleHolderId'and record->>'authSubject'=t.auth_subject::text and record->>'batchId'=terms->'assetSource'->>'batchId'and record->>'buyerCountryId'=terms->>'buyerCountryId'then mandate:=true;end if;
  if record->>'kind'='CROSS_BORDER_ROUTE'and record->>'fromCountryId'=terms->>'sellerCountryId'and record->>'toCountryId'=terms->>'buyerCountryId'then route:=true;end if;
 end loop;
 if not mandate or not route then raise exception 'MIXED_GOODS_ADMITTED_OWNER_AND_ROUTE_REQUIRED'using errcode='23514';end if;
 source:=jsonb_build_object('worldId',p_world,'countryId',terms->>'sellerCountryId','commodityId','GRAIN','unit',terms->'quantity'->>'unit','batchId',terms->'assetSource'->>'batchId','physicalLocationId',terms->'assetSource'->>'physicalLocationId','titleHolderId',terms->'assetSource'->>'titleHolderId','riskBearerId',terms->'assetSource'->>'riskBearerId','economicRecognitionId',terms->'assetSource'->'economicRecognitionId','bucket','AVAILABLE','reservationId','null'::jsonb,'shipmentId','null'::jsonb);
 if operation='RESERVE'then
  if p_event->>'eventType'is distinct from'NARROW_TREASURY_GCU_RESERVED_V1'or ep is distinct from jsonb_build_object('schemaVersion','narrow-treasury-gcu-reservation-event-v1','transferFingerprint',transfer_fp)or(p_event->>'recordedAtReal')::timestamptz>=(terms->>'expiresAtReal')::timestamptz then raise exception 'MIXED_GOODS_RESERVE_EVENT_REQUIRED'using errcode='23514';end if;
  destination:=source||jsonb_build_object('bucket','RESERVED','reservationId','RESERVATION_'||transfer_id);
 else
  shipment:=payload->>'shipmentId';
  if shipment is null or shipment!~'^[A-Z][A-Z0-9_-]*$'or ep is distinct from jsonb_build_object('schemaVersion',case when operation='SHIP'then'narrow-treasury-gcu-shipment-event-v1'else'narrow-treasury-gcu-delivery-event-v1'end,'shipmentId',shipment,'transferCommandId',transfer_id,'transferFingerprint',transfer_fp)or p_event->>'eventType'is distinct from(case when operation='SHIP'then'NARROW_TREASURY_GCU_SHIPPED_V1'else'NARROW_TREASURY_GCU_DELIVERED_V1'end)then raise exception 'MIXED_GOODS_EXACT_AUTOMATIC_EVENT_REQUIRED'using errcode='23514';end if;
  if operation='SHIP'then
   if payload->>'schemaVersion'is distinct from'core-goods-shipment-v1'or(select count(*)from jsonb_object_keys(payload))<>4 then raise exception 'MIXED_GOODS_SHIPMENT_PAYLOAD_REQUIRED'using errcode='23514';end if;
   source:=source||jsonb_build_object('bucket','RESERVED','reservationId','RESERVATION_'||transfer_id);destination:=source||jsonb_build_object('bucket','IN_TRANSIT','reservationId','null'::jsonb,'shipmentId',shipment);
  else
   if payload->>'schemaVersion'is distinct from'core-goods-delivery-v1'or(select count(*)from jsonb_object_keys(payload))<>7 or not exists(select 1 from world_v2.command_submission c join world_v2.command_receipt rc on rc.world_id=c.world_id and rc.command_id=c.command_id and rc.outcome='COMMITTED'where c.world_id=p_world and c.command_type='CORE_GOODS_SHIPMENT_V1'and c.canonical_payload::jsonb->>'transferCommandId'=transfer_id and c.canonical_payload::jsonb->>'transferFingerprint'=transfer_fp and c.canonical_payload::jsonb->>'shipmentId'=shipment and rc.world_version_after<=(p_transition->>'worldVersionBefore')::bigint)then raise exception 'MIXED_GOODS_PRECEDING_SHIPMENT_REQUIRED'using errcode='23514';end if;
   source:=source||jsonb_build_object('bucket','IN_TRANSIT','shipmentId',shipment);
   destination:=source||jsonb_build_object('countryId',terms->>'buyerCountryId','physicalLocationId',payload->'destination'->>'physicalLocationId','titleHolderId',payload->'destination'->>'titleHolderId','riskBearerId',payload->'destination'->>'riskBearerId','economicRecognitionId',payload->'destination'->'economicRecognitionId','bucket','AVAILABLE','reservationId','null'::jsonb,'shipmentId','null'::jsonb);
  end if;
 end if;
 if world_v2.postwar_projection_current_inventory_balance(p_world,source,(p_transition->>'worldVersionBefore')::bigint)<quantity then raise exception 'MIXED_GOODS_ACTUAL_STOCK_REQUIRED'using errcode='23514';end if;
 binding:=jsonb_build_object('schemaVersion','authoritative-transition-binding-v1','transitionId',p_command->>'commandId','worldId',p_world,'commandId',p_command->>'commandId','commandFingerprint',p_command->>'fingerprint','idempotencyKey',p_command->'idempotencyKey','expectedWorldVersion',p_command->'expectedWorldVersion','worldVersionBefore',p_transition->>'worldVersionBefore','worldVersionAfter',p_transition->>'worldVersionAfter','eventIds',p_transition->'eventIds','eventFingerprints',jsonb_build_array(p_event->>'fingerprint'),'simTime',p_command->>'simTime');
 posting:=p_inventory->0;
 expected:=jsonb_build_object('schemaVersion','inventory-posting-v1','postingId',posting->>'postingId','worldId',p_world,'causationCommandId',p_command->>'commandId','causationEventIds',p_transition->'eventIds','worldVersionBefore',p_transition->>'worldVersionBefore','worldVersionAfter',p_transition->>'worldVersionAfter','simTime',p_command->>'simTime','transitionBinding',binding,'operation',operation,'entries',jsonb_build_array(jsonb_build_object('account',source,'delta',jsonb_build_object('amount',trim_scale(-quantity)::text,'unit',terms->'quantity'->>'unit')),jsonb_build_object('account',destination,'delta',terms->'quantity')));
 expected:=jsonb_set(expected,'{entries}',(select jsonb_agg(x order by world_v2.canonical_json(x->'account')collate "C")from jsonb_array_elements(expected->'entries')x));
 if posting-'fingerprint'is distinct from expected then raise exception 'MIXED_GOODS_EXACT_CORE_INVENTORY_MOVEMENT_REQUIRED'using errcode='23514',detail=jsonb_build_object('expected',expected,'actual',posting-'fingerprint')::text;end if;
 if operation='DELIVER'then
  batch:=p_batches->0;legs:=batch->'legs';buyer:=legs->0->'account';seller:=legs->1->'account';
  select x->>'payerEntityId'into strict gov from world_v2.postwar_social_prefix_scope s cross join lateral jsonb_array_elements(s.scope_document::jsonb->'funding')x where s.world_id=p_world and s.country_id=terms->>'buyerCountryId'and x->>'payerRole'='GOV';
  if jsonb_array_length(legs)<>2 or buyer->>'accountId'is distinct from payload->>'buyerTreasuryAccountId'or seller->>'accountId'is distinct from payload->>'sellerSettlementAccountId'or buyer->>'ownerId'is distinct from gov or buyer->>'ownerId'is distinct from destination->>'titleHolderId'or seller->>'ownerId'is distinct from source->>'titleHolderId'or buyer->>'worldId'is distinct from p_world or seller->>'worldId'is distinct from p_world or buyer->>'countryId'is distinct from terms->>'buyerCountryId'or seller->>'countryId'is distinct from terms->>'sellerCountryId'or buyer->>'accountClass'is distinct from'CASH'or seller->>'accountClass'is distinct from'CASH'or buyer->>'currency'is distinct from'GCU'or seller->>'currency'is distinct from'GCU'or buyer->'claimId'is distinct from'null'::jsonb or seller->'claimId'is distinct from'null'::jsonb or buyer->'counterpartyEntityId'is distinct from'null'::jsonb or seller->'counterpartyEntityId'is distinct from'null'::jsonb or world_v2.postwar_projection_current_account_balance(p_world,buyer,(p_transition->>'worldVersionBefore')::bigint)<settlement then raise exception 'MIXED_GOODS_ACTUAL_GOV_GCU_SETTLEMENT_REQUIRED'using errcode='23514';end if;
  expected:=jsonb_build_object('schemaVersion','financial-posting-v1','batchId',batch->>'batchId','worldId',p_world,'causationCommandId',p_command->>'commandId','causationEventIds',p_transition->'eventIds','worldVersionBefore',p_transition->>'worldVersionBefore','worldVersionAfter',p_transition->>'worldVersionAfter','simTime',p_command->>'simTime','transitionBinding',binding,'settlementCurrency','GCU','legs',jsonb_build_array(jsonb_build_object('legId',legs->0->>'legId','account',buyer,'amount',jsonb_build_object('amount',trim_scale(settlement)::text,'currency','GCU'),'direction','CREDIT','counterpartyAccountId',seller->>'accountId'),jsonb_build_object('legId',legs->1->>'legId','account',seller,'amount',jsonb_build_object('amount',trim_scale(settlement)::text,'currency','GCU'),'direction','DEBIT','counterpartyAccountId',buyer->>'accountId')));
  if batch-'fingerprint'is distinct from expected then raise exception 'MIXED_GOODS_EXACT_CORE_PAYMENT_REQUIRED'using errcode='23514';end if;
 end if;
end;$$;
alter function world_v2.postwar_mixed_goods_group(text,jsonb,jsonb,jsonb,jsonb,jsonb)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.postwar_mixed_goods_group(text,jsonb,jsonb,jsonb,jsonb,jsonb)from public;
revoke create on schema world_v2 from world_v2_postwar_projection_owner,world_v2_cb_omo_source_owner,world_v2_postwar_narrow_trade_current_owner;
commit;
