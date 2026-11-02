-- UNREGISTERED development candidate. Derived read publication only: no World
-- mutation, account authority, raw seed read, role membership, or credentials.
-- Requires financial-current-derived-read (bounded immutable originals getter)
-- and mixed-current-projection-read (complete prefix + private page writer).
begin;
grant create on schema world_v2 to world_v2_postwar_projection_owner;
create function world_v2.publish_postwar_mixed_financial_current(p_world text,p_country text,p_assertion text)
returns table(office_id text,dataset text,world_version text,event_sequence text,document_ref text,source_version text,current_rows_hash text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name; h record; a record; prefix record; originals record;
 original jsonb; assertion jsonb; scope_body jsonb; fund jsonb; banks jsonb;
 ledger jsonb; finance_rows jsonb; bank_rows jsonb; capacity jsonb; current_rows jsonb;
 tga jsonb; mirror jsonb; balance numeric; opening numeric; budget numeric; payroll numeric; reserved numeric; gcu numeric; gcu_accounts jsonb;
 rows_hash text; coverage jsonb; coverage_id text; office_name text; dataset_name text; items jsonb;
 base world_v2.postwar_office_projection_document%rowtype; doc world_v2.postwar_mixed_current_document%rowtype;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_reader','MEMBER')then raise exception 'MIXED_FINANCIAL_SEPARATE_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if octet_length(p_assertion)>16384 then raise exception 'MIXED_FINANCIAL_ASSERTION_BOUNDED'using errcode='54000';end if;
 assertion:=p_assertion::jsonb;
 -- Getter takes fresh H/admission/permit/source locks and verifies all seven
 -- original documents, page sequences, byte hashes, revocation and scope pins.
 select * into strict originals from world_v2.read_postwar_financial_current_publication_originals(p_world,p_country);
 if originals.originals_sha256 is distinct from encode(sha256(convert_to(originals.originals_text,'UTF8')),'hex')or octet_length(originals.originals_text)>65536 then raise exception 'MIXED_FINANCIAL_ORIGINAL_HASH_REQUIRED'using errcode='23514';end if;
 original:=originals.originals_text::jsonb;
 select * into strict h from world_v2.world_head x where x.world_id=p_world for share;
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 select * into strict prefix from world_v2.postwar_mixed_current_prefix(p_world);
 if assertion->'head'is distinct from jsonb_build_object('worldId',p_world,'worldVersion',h.world_version::text,'eventSequence',h.event_sequence::text)or original->'head'is distinct from jsonb_build_object('worldVersion',h.world_version::text,'eventSequence',h.event_sequence::text)or assertion->'seedPins'is distinct from jsonb_build_object('worldId',p_world,'seedId',a.seed_id,'seedFingerprint',a.seed_fingerprint,'admissionRef',a.admission_ref)or assertion->'coverage'is distinct from jsonb_build_object('prefixFingerprint',prefix.prefix_fingerprint,'knownEffectsFingerprint',prefix.effects_fingerprint,'coveredThroughEventId',prefix.last_event_id,'coveredThroughEventFingerprint',prefix.last_event_fingerprint,'financialPostingCount',prefix.financial_posting_count,'financialBatchCount',prefix.financial_batch_count,'financialPostingsFingerprint',prefix.financial_postings_fingerprint)then raise exception 'MIXED_FINANCIAL_CORE_SQL_COMPLETE_PREFIX_MISMATCH'using errcode='23514';end if;
 select s.scope_document::jsonb into strict scope_body from world_v2.postwar_social_prefix_scope s where s.world_id=p_world and s.country_id=p_country for share;
 select x into strict fund from jsonb_array_elements(original->'fundingAccounts')x where x->>'payerRole'='GOV'and x->>'countryId'=p_country;
 select coalesce(jsonb_agg(distinct x->>'issuerEntityId'),'[]'::jsonb)into banks from jsonb_array_elements(scope_body->'funding')x where x->>'payerRole'='OP'and x->>'countryId'=p_country;
 if jsonb_array_length(banks)<>1 or banks ? (fund->>'payerEntityId')or banks ? (fund->>'issuerEntityId')then raise exception 'MIXED_FINANCIAL_DISTINCT_ACTUAL_BANK_REQUIRED'using errcode='23514';end if;
 -- Rebuild positions from verified opening debit balances plus the actual
 -- committed posting legs. The complete-prefix verifier above validates every
 -- world frame, receipt and both FX batches; country filtering is only cropping.
 with amounts as(
  select x->'account'as account,(x->'netDebitBalance'->>'amount')::numeric as amount from jsonb_array_elements((original->'financeLedgerRows')||(original->'centralBankLedgerRows'))x
  union all
  select leg->'account',case when leg->>'direction'='DEBIT'then(leg->'amount'->>'amount')::numeric else-(leg->'amount'->>'amount')::numeric end
  from world_v2.financial_posting_batch batch cross join lateral jsonb_array_elements(batch.canonical_payload::jsonb->'legs')leg
  where batch.world_id=p_world and batch.world_version_after<=h.world_version and leg->'account'->>'countryId'=p_country
 ), grouped as(select account,sum(amount)as amount from amounts group by account)
 select coalesce(jsonb_agg(jsonb_build_object('account',account,'amount',trim_scale(amount)::text)order by account->>'accountId'collate "C"),'[]'::jsonb)into ledger from grouped;
 if exists(select 1 from jsonb_array_elements(ledger)x where x->'account'->>'worldId'is distinct from p_world or x->'account'->>'countryId'is distinct from p_country)or exists(select 1 from jsonb_array_elements(ledger)x group by x->'account'->>'accountId'having count(*)<>1)then raise exception 'MIXED_FINANCIAL_ACCOUNT_METADATA_COLLISION'using errcode='23514';end if;
 select x into strict tga from jsonb_array_elements(ledger)x where x->'account'->>'accountId'=fund->>'accountRef';
 select x into strict mirror from jsonb_array_elements(ledger)x where x->'account'->>'claimId'=fund->>'claimId'and x->'account'->>'ownerId'=fund->>'issuerEntityId'and x->'account'->>'counterpartyEntityId'=fund->>'payerEntityId'and x->'account'->>'accountClass'='LIABILITY';
 balance:=(tga->>'amount')::numeric;opening:=(fund->>'reservedAmount')::numeric;
 if tga->'account'->>'ownerId'is distinct from fund->>'payerEntityId'or tga->'account'->>'claimId'is distinct from fund->>'claimId'or tga->'account'->>'currency'is distinct from fund->>'currency'or tga->'account'->>'accountClass'is distinct from 'ASSET'or tga->'account'->>'counterpartyEntityId'is distinct from fund->>'issuerEntityId'or mirror->'account'->>'currency'is distinct from fund->>'currency'or balance<>-(mirror->>'amount')::numeric then raise exception 'MIXED_FINANCIAL_ACTUAL_TGA_MIRROR_REQUIRED'using errcode='23514';end if;
 select coalesce(sum((x->>'cap')::numeric),0)into budget from jsonb_array_elements(prefix.budget_envelopes)x where x->'scope'->>'countryId'=p_country;
 if exists(select 1 from world_v2.authoritative_event e join world_v2.command_submission c on c.world_id=e.world_id and c.command_id=e.causation_command_id where e.world_id=p_world and c.country_id=p_country and e.event_type='SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1'and e.event_sequence<=h.event_sequence and(e.canonical_payload::jsonb->'reservation'->>'accountId'is distinct from fund->>'accountRef'or e.canonical_payload::jsonb->'reservation'->>'employerId'is distinct from fund->>'payerEntityId'or e.canonical_payload::jsonb->'reservation'->>'currency'is distinct from fund->>'currency'or e.canonical_payload::jsonb->'reservation'->>'state'is distinct from 'RESERVED_NOT_PAID'))then raise exception 'MIXED_FINANCIAL_EXACT_SOCIAL_RESERVATION_REQUIRED'using errcode='23514';end if;
 select coalesce(sum((e.canonical_payload::jsonb->'reservation'->>'amount')::numeric),0)into payroll from world_v2.authoritative_event e join world_v2.command_submission c on c.world_id=e.world_id and c.command_id=e.causation_command_id where e.world_id=p_world and c.country_id=p_country and e.event_type='SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1'and e.event_sequence<=h.event_sequence;
 reserved:=opening+budget+payroll;
 if least(balance,opening,budget,payroll)<0 or reserved>balance then raise exception 'MIXED_FINANCIAL_CAPACITY_OVERBOOKED'using errcode='23514';end if;
 select coalesce(sum((x->>'amount')::numeric),0),coalesce(jsonb_agg(x->'account'->>'accountId'order by x->'account'->>'accountId'collate "C"),'[]'::jsonb)into gcu,gcu_accounts from jsonb_array_elements(ledger)x where x->'account'->>'ownerId'=fund->>'payerEntityId'and x->'account'->>'accountClass'='CASH'and x->'account'->>'currency'='GCU';
 if exists(select 1 from jsonb_array_elements(ledger)x where x->'account'->>'accountClass'='CASH'and x->'account'->>'currency'='GCU'and(x->>'amount')::numeric<0)then raise exception 'MIXED_FINANCIAL_GCU_CASH_NEGATIVE'using errcode='23514';end if;
 foreach office_name in array array['FINANCE','CENTRAL_BANK']loop
  select coalesce(jsonb_agg(jsonb_build_object('schemaVersion','postwar-current-financial-balance-row-v2','countryId',p_country,'accountId',x->'account'->>'accountId','ownerEntityId',x->'account'->>'ownerId','ownerKind',case when x->'account'->>'ownerId'=fund->>'payerEntityId'then'GOV'when x->'account'->>'ownerId'=fund->>'issuerEntityId'then'CB'else'BANK'end,'currency',x->'account'->>'currency','accountClass',x->'account'->>'accountClass','claimId',x->'account'->'claimId','counterpartyEntityId',x->'account'->'counterpartyEntityId','netDebitBalance',x->>'amount','balanceNature',case when x->'account'->>'accountClass'='CASH'and x->'account'->>'currency'='GCU'then'GCU_CASH'when x->'account'->'claimId'<>'null'::jsonb and x->'account'->'counterpartyEntityId'<>'null'::jsonb then'RECIPROCAL_LEDGER_CLAIM'else'LEDGER_POSITION'end)order by x->'account'->>'accountId'collate "C"),'[]'::jsonb)into items from jsonb_array_elements(ledger)x where case when office_name='FINANCE'then x->'account'->>'ownerId'=fund->>'payerEntityId'else x->'account'->>'ownerId'=fund->>'issuerEntityId'or banks ? (x->'account'->>'ownerId')end;
  if office_name='FINANCE'then finance_rows:=items;else bank_rows:=items;end if;
 end loop;
 capacity:=jsonb_build_array(jsonb_build_object('schemaVersion','postwar-treasury-capacity-row-v2','countryId',p_country,'accountId',fund->>'accountRef','claimId',fund->>'claimId','currency',fund->>'currency','treasuryLedgerClaimBalance',trim_scale(balance)::text,'openingReservedCapacity',trim_scale(opening)::text,'budgetEnvelopeCapacity',trim_scale(budget)::text,'additionalPayrollReservedCapacity',trim_scale(payroll)::text,'totalReservedCapacity',trim_scale(reserved)::text,'availableCapacity',trim_scale(balance-reserved)::text,'governmentGcuCurrency','GCU','governmentGcuCashBalance',trim_scale(gcu)::text,'governmentGcuAccountIds',gcu_accounts,'reservationNature','CAPACITY_RESERVED_NOT_PAID_OR_ACCRUED','balanceNature','RECIPROCAL_LEDGER_CLAIM_NOT_CASH_WALLET','gcuBalanceNature','GOVERNMENT_OWNED_GCU_CASH_NOT_OFFICIAL_RESERVES'));
 current_rows:=jsonb_build_object('FINANCE',jsonb_build_object('ledger-balances',finance_rows,'treasury-capacity',capacity),'CENTRAL_BANK',jsonb_build_object('ledger-balances',bank_rows));
 rows_hash:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(current_rows),'UTF8')),'hex');
 if assertion->>'currentRowsHash'is distinct from rows_hash then raise exception 'MIXED_FINANCIAL_SQL_ROWS_DIFFER_FROM_GENUINE_CORE'using errcode='23514';end if;
 coverage_id:='MIXED_FINANCIAL_COVERAGE_'||upper(encode(sha256(convert_to(p_assertion||p_country,'UTF8')),'hex'));
 coverage:=assertion->'coverage'||jsonb_build_object('schemaVersion','postwar-financial-current-prefix-coverage-v2','reducerVersion','POSTWAR_FINANCIAL_SOCIAL_FX_COMPLETE_PREFIX_V2','countryId',p_country,'coverageRef',coverage_id,'globalWorldVersion',h.world_version::text,'globalEventSequence',h.event_sequence::text);
 foreach office_name in array array['FINANCE','CENTRAL_BANK']loop
  for dataset_name in select unnest(case when office_name='FINANCE'then array['currency-fx','opening-financial-legs','ledger-balances','treasury-capacity']else array['currency-fx','cb-categories','cb-holdings','bank-loans','opening-financial-legs','ledger-balances']end)loop
   select * into strict base from world_v2.postwar_office_projection_document d where d.world_id=p_world and d.country_id=p_country and d.office_id=office_name and d.dataset=case when dataset_name in('ledger-balances','treasury-capacity')then'opening-financial-legs'else dataset_name end;
   if dataset_name in('ledger-balances','treasury-capacity')then items:=current_rows->office_name->dataset_name;else select coalesce(jsonb_agg(x order by p.page_index,n),'[]'::jsonb)into items from world_v2.postwar_office_projection_page p cross join lateral jsonb_array_elements(p.rows_text::jsonb)with ordinality q(x,n)where p.document_ref=base.document_ref and p.world_id=p_world;end if;
   doc:=world_v2.postwar_write_mixed_current_document(p_world,p_country,office_name,dataset_name,base.document_ref,0,0,items,coverage,jsonb_build_object('original',base.source_pointer,'currentDerivation',case when dataset_name in('ledger-balances','treasury-capacity')then'GENUINE_CORE_AND_FIXED_SQL_COMPLETE_MIXED_POSTINGS'else'HISTORICAL_ORIGINAL_AT_ORIGIN_ZERO'end));
   return query select doc.office_id,doc.dataset,doc.world_version::text,doc.event_sequence::text,doc.document_ref,doc.source_version,rows_hash;
  end loop;
 end loop;
end;$$;
alter function world_v2.publish_postwar_mixed_financial_current(text,text,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.publish_postwar_mixed_financial_current(text,text,text)from public;
grant execute on function world_v2.publish_postwar_mixed_financial_current(text,text,text)to world_v2_postwar_projection_publisher;
revoke create on schema world_v2 from world_v2_postwar_projection_owner;
commit;
