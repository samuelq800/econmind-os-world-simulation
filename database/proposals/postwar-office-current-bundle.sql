-- Forward candidate: one SQL-owned complete prefix per country publication.
-- Existing standalone publishers and historical proposal bytes remain intact.
-- Only the bulk entry point is granted to the separate publisher. Helpers take
-- SQL-derived DATA and are private to the projection owner; callers cannot
-- supply a verified prefix, transaction flag, cache entry or authority token.
begin;
grant create on schema world_v2 to world_v2_postwar_projection_owner;
create type world_v2.postwar_current_verified_prefix as (prefix_fingerprint text,effects_fingerprint text,last_event_id text,last_event_fingerprint text,budget_envelopes jsonb,financial_posting_count text,financial_batch_count text,financial_postings_fingerprint text,page_proof jsonb);
alter type world_v2.postwar_current_verified_prefix owner to world_v2_postwar_projection_owner;
revoke all on type world_v2.postwar_current_verified_prefix from public;
create function world_v2.verify_postwar_current_coverage_from(p_actual world_v2.postwar_current_verified_prefix,p_expected jsonb)
returns table(prefix_fingerprint text,effects_fingerprint text,last_event_id text,last_event_fingerprint text,budget_envelopes jsonb,financial_posting_count text,financial_batch_count text,financial_postings_fingerprint text,page_proof jsonb)
language plpgsql security definer set search_path=pg_catalog as $$
declare actual record;v jsonb;begin
 actual:=p_actual;
 v:=jsonb_build_object('prefixFingerprint',actual.prefix_fingerprint,'knownEffectsFingerprint',actual.effects_fingerprint,'coveredThroughEventId',actual.last_event_id,'coveredThroughEventFingerprint',actual.last_event_fingerprint,'financialPostingCount',actual.financial_posting_count,'financialBatchCount',actual.financial_batch_count,'financialPostingsFingerprint',actual.financial_postings_fingerprint,'pageProof',actual.page_proof);
 if p_expected is distinct from v then raise exception 'PAGED_CURRENT_CORE_SQL_COMPLETE_COVERAGE_MISMATCH'using errcode='23514';end if;
 return query select actual.prefix_fingerprint,actual.effects_fingerprint,actual.last_event_id,actual.last_event_fingerprint,actual.budget_envelopes,actual.financial_posting_count,actual.financial_batch_count,actual.financial_postings_fingerprint,actual.page_proof;
end;$$;
alter function world_v2.verify_postwar_current_coverage_from(world_v2.postwar_current_verified_prefix,jsonb)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.verify_postwar_current_coverage_from(world_v2.postwar_current_verified_prefix,jsonb)from public;

-- Same publish_postwar_paged_financial_current checks and mapper; shared prefix is owner-only.
create function world_v2.publish_postwar_paged_financial_current_from_verified(p_world text,p_country text,p_assertion text,p_prefix world_v2.postwar_current_verified_prefix)
returns table(office_id text,dataset text,world_version text,event_sequence text,document_ref text,source_version text,current_rows_hash text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name; h record; a record; prefix record; originals record;
 original jsonb; assertion jsonb; scope_body jsonb; fund jsonb; banks jsonb;
 ledger jsonb; finance_rows jsonb; bank_rows jsonb; capacity jsonb; current_rows jsonb;
 tga jsonb; mirror jsonb; balance numeric; opening numeric; budget numeric; payroll numeric; reserved numeric; gcu numeric; gcu_accounts jsonb;
 rows_hash text; coverage jsonb; coverage_id text; office_name text; dataset_name text; items jsonb;
 base world_v2.postwar_office_projection_document%rowtype; doc world_v2.postwar_paged_current_document%rowtype;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_reader','MEMBER')then raise exception 'MIXED_FINANCIAL_SEPARATE_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if octet_length(p_assertion)>16384 then raise exception 'MIXED_FINANCIAL_ASSERTION_BOUNDED'using errcode='54000';end if;
 assertion:=p_assertion::jsonb;
 -- Getter takes fresh H/admission/permit/source locks and verifies all seven
 -- original documents, page sequences, byte hashes, revocation and scope pins.
 select * into strict originals from world_v2.read_postwar_paged_financial_current_publication_originals(p_world,p_country);
 if originals.originals_sha256 is distinct from encode(sha256(convert_to(originals.originals_text,'UTF8')),'hex')or octet_length(originals.originals_text)>65536 then raise exception 'MIXED_FINANCIAL_ORIGINAL_HASH_REQUIRED'using errcode='23514';end if;
 original:=originals.originals_text::jsonb;
 select * into strict h from world_v2.world_head x where x.world_id=p_world for share;
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 select * into strict prefix from world_v2.verify_postwar_current_coverage_from(p_prefix,assertion->'coverage');
 if assertion->'head'is distinct from jsonb_build_object('worldId',p_world,'worldVersion',h.world_version::text,'eventSequence',h.event_sequence::text)or original->'head'is distinct from jsonb_build_object('worldVersion',h.world_version::text,'eventSequence',h.event_sequence::text)or assertion->'seedPins'is distinct from jsonb_build_object('worldId',p_world,'seedId',a.seed_id,'seedFingerprint',a.seed_fingerprint,'admissionRef',a.admission_ref)or assertion->'coverage'is distinct from jsonb_build_object('prefixFingerprint',prefix.prefix_fingerprint,'knownEffectsFingerprint',prefix.effects_fingerprint,'coveredThroughEventId',prefix.last_event_id,'coveredThroughEventFingerprint',prefix.last_event_fingerprint,'financialPostingCount',prefix.financial_posting_count,'financialBatchCount',prefix.financial_batch_count,'financialPostingsFingerprint',prefix.financial_postings_fingerprint,'pageProof',prefix.page_proof)then raise exception 'MIXED_FINANCIAL_CORE_SQL_COMPLETE_PREFIX_MISMATCH'using errcode='23514';end if;
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
 coverage:=assertion->'coverage'||jsonb_build_object('schemaVersion','postwar-financial-current-page-chain-coverage-v3','reducerVersion','POSTWAR_COMPLETE_MIXED_PAGED_PREFIX_V1','countryId',p_country,'coverageRef',coverage_id,'globalWorldVersion',h.world_version::text,'globalEventSequence',h.event_sequence::text);
 foreach office_name in array array['FINANCE','CENTRAL_BANK']loop
  for dataset_name in select unnest(case when office_name='FINANCE'then array['currency-fx','opening-financial-legs','ledger-balances','treasury-capacity']else array['currency-fx','cb-categories','cb-holdings','bank-loans','opening-financial-legs','ledger-balances']end)loop
   select * into strict base from world_v2.postwar_office_projection_document d where d.world_id=p_world and d.country_id=p_country and d.office_id=office_name and d.dataset=case when dataset_name in('ledger-balances','treasury-capacity')then'opening-financial-legs'else dataset_name end;
   if dataset_name in('ledger-balances','treasury-capacity')then items:=current_rows->office_name->dataset_name;else select coalesce(jsonb_agg(x order by p.page_index,n),'[]'::jsonb)into items from world_v2.postwar_office_projection_page p cross join lateral jsonb_array_elements(p.rows_text::jsonb)with ordinality q(x,n)where p.document_ref=base.document_ref and p.world_id=p_world;end if;
   doc:=world_v2.postwar_write_paged_current_document(p_world,p_country,office_name,dataset_name,base.document_ref,0,0,items,coverage,jsonb_build_object('original',base.source_pointer,'currentDerivation',case when dataset_name in('ledger-balances','treasury-capacity')then'GENUINE_CORE_AND_FIXED_SQL_COMPLETE_MIXED_POSTINGS'else'HISTORICAL_ORIGINAL_AT_ORIGIN_ZERO'end));
   return query select doc.office_id,doc.dataset,doc.world_version::text,doc.event_sequence::text,doc.document_ref,doc.source_version,rows_hash;
  end loop;
 end loop;
end;$$;
alter function world_v2.publish_postwar_paged_financial_current_from_verified(text,text,text,world_v2.postwar_current_verified_prefix)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.publish_postwar_paged_financial_current_from_verified(text,text,text,world_v2.postwar_current_verified_prefix)from public;

-- Same publish_postwar_paged_social_current checks and mapper; shared prefix is owner-only.
create function world_v2.publish_postwar_paged_social_current_from_verified(p_world text,p_country text,p_assertion text,p_prefix world_v2.postwar_current_verified_prefix)
returns setof world_v2.postwar_paged_current_document language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h record;a record;prefix record;origin record;s world_v2.postwar_social_prefix_scope%rowtype;b world_v2.postwar_office_projection_document%rowtype;assertion jsonb;coverage jsonb;binding jsonb;pointer jsonb;state jsonb;items jsonb;dataset_name text;ow bigint:=0;os bigint:=0;state_hash text;material_hash text;coverage_id text;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_reader','MEMBER')then raise exception 'MIXED_SEPARATE_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 select * into strict h from world_v2.lock_postwar_paged_current_publication(p_world,p_country);
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 select * into strict s from world_v2.postwar_social_prefix_scope x where x.world_id=p_world and x.country_id=p_country for share;
 if s.seed_fingerprint<>a.seed_fingerprint or s.admission_ref<>a.admission_ref or s.source_bundle_sha256<>a.source_bundle_sha256 or s.scope_sha256<>encode(sha256(convert_to(s.scope_document,'UTF8')),'hex')then raise exception 'MIXED_SEALED_SCOPE_LINEAGE_REQUIRED'using errcode='23514';end if;
 if octet_length(p_assertion)>16384 then raise exception 'MIXED_ASSERTION_BOUNDED'using errcode='54000';end if;assertion:=p_assertion::jsonb;
 select * into strict prefix from world_v2.verify_postwar_current_coverage_from(p_prefix,assertion->'coverage');
 if assertion->'head'is distinct from jsonb_build_object('worldId',p_world,'worldVersion',h.world_version,'eventSequence',h.event_sequence)or assertion->'seedPins'is distinct from jsonb_build_object('worldId',p_world,'seedId',a.seed_id,'seedFingerprint',a.seed_fingerprint,'admissionRef',a.admission_ref)or assertion->'coverage'is distinct from jsonb_build_object('prefixFingerprint',prefix.prefix_fingerprint,'knownEffectsFingerprint',prefix.effects_fingerprint,'coveredThroughEventId',prefix.last_event_id,'coveredThroughEventFingerprint',prefix.last_event_fingerprint,'financialPostingCount',prefix.financial_posting_count,'financialBatchCount',prefix.financial_batch_count,'financialPostingsFingerprint',prefix.financial_postings_fingerprint,'pageProof',prefix.page_proof)then raise exception 'MIXED_CORE_SQL_COMPLETE_PREFIX_MISMATCH'using errcode='23514';end if;
 select * into origin from world_v2.postwar_social_origin_at_prefix(p_world,p_country);
 if found then
  state:=origin.state;binding:=origin.binding;ow:=origin.origin_world_version;os:=origin.origin_event_sequence;material_hash:=binding->>'materializationHash';
  perform 1 from world_v2.current_materialization x where x.world_id=p_world and x.materialization_key=binding->>'materializationKey'for share;
 else
  if exists(select 1 from world_v2.authoritative_event e join world_v2.command_submission c on c.world_id=e.world_id and c.command_id=e.causation_command_id where e.world_id=p_world and c.country_id=p_country and e.event_type in('SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1','SOCIAL_EMPLOYMENT_SERVICE_CREATED_V1','SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1','SOCIAL_JOB_MATCH_SETTLED_V1'))then raise exception 'MIXED_COMMITTED_MATERIALIZATION_UNAVAILABLE'using errcode='55000';end if;
  -- No Social command for this country: original rows remain unchanged.
  -- Scope deliberately omits non-row E03 internals. Do not manufacture a full
  -- employment state from it. The fixed Core publisher supplies its genuine H0
  -- state hash; SQL independently verifies the row hashes and complete prefix.
  state:=jsonb_build_object('labour',jsonb_build_object('positions',s.scope_document::jsonb->'positions'),'servicePools',s.scope_document::jsonb->'servicePools');
  material_hash:=assertion->>'employmentStateHash';

 end if;
 state_hash:=case when ow=0 then assertion->>'employmentStateHash'else 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(state),'UTF8')),'hex')end;
 if state_hash is null or state_hash!~'^sha256:[a-f0-9]{64}$'or assertion->>'employmentStateHash'is distinct from state_hash or assertion->>'materializationHash'is distinct from material_hash or assertion->>'positionsHash'is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(state->'labour'->'positions'),'UTF8')),'hex')or assertion->>'servicePoolsHash'is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(state->'servicePools'),'UTF8')),'hex')then raise exception 'MIXED_CORE_SQL_STATE_MISMATCH'using errcode='23514';end if;
 coverage_id:='POSTWAR_MIXED_SOCIAL_COVERAGE_'||upper(encode(sha256(convert_to(p_assertion||p_country,'UTF8')),'hex'));
 coverage:=assertion->'coverage'||jsonb_build_object('schemaVersion','postwar-social-current-page-chain-coverage-v4','reducerVersion','POSTWAR_COMPLETE_MIXED_PAGED_PREFIX_V1','countryId',p_country,'coverageRef',coverage_id,'globalWorldVersion',h.world_version,'globalEventSequence',h.event_sequence,'originWorldVersion',ow::text,'originEventSequence',os::text,'employmentStateHash',state_hash,'materializationHash',material_hash,'stateOrigin',case when ow=0 then'ADMITTED_OPENING_SOURCE'else'COMMITTED_MATERIALIZATION'end);
 foreach dataset_name in array array['positions','service-pools']loop
  select * into strict b from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_country and x.office_id='SOCIAL'and x.dataset=dataset_name and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref;
  items:=case dataset_name when'positions'then state->'labour'->'positions'else state->'servicePools'end;
  pointer:=case when ow=0 then jsonb_build_object('original',b.source_pointer,'currentDerivation','UNCHANGED_ADMITTED_OPENING_AFTER_COMPLETE_MIXED_PREFIX')else jsonb_build_object('table','current_materialization','key',binding->>'materializationKey','path',case when(binding->>'materializationKey')like'SOCIAL_POSITION_LIFECYCLE_%'then'employment.'else''end||case dataset_name when'positions'then'labour.positions'else'servicePools'end,'currentStateBinding',binding)end;
  return next world_v2.postwar_write_paged_current_document(p_world,p_country,'SOCIAL',dataset_name,b.document_ref,ow,os,items,coverage,pointer);
 end loop;
end;$$;
alter function world_v2.publish_postwar_paged_social_current_from_verified(text,text,text,world_v2.postwar_current_verified_prefix)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.publish_postwar_paged_social_current_from_verified(text,text,text,world_v2.postwar_current_verified_prefix)from public;

-- Same publish_postwar_paged_captain_current checks and mapper; shared prefix is owner-only.
create function world_v2.publish_postwar_paged_captain_current_from_verified(p_world text,p_country text,p_assertion text,p_prefix world_v2.postwar_current_verified_prefix)
returns setof world_v2.postwar_paged_current_document language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h record;a record;prefix record;state record;packet jsonb;assertion jsonb;rows jsonb;coverage jsonb;pointer jsonb;ref text;version text;state_hash text;rows_hash text;coverage_ref text;d world_v2.postwar_paged_current_document%rowtype;b world_v2.postwar_office_projection_document%rowtype;pin_count integer;last_captain_event jsonb;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_reader','MEMBER')then raise exception 'CAPTAIN_CURRENT_FIXED_SEPARATE_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if p_world is null or p_country is null or p_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or p_assertion is null or octet_length(p_assertion)>16384 then raise exception 'CAPTAIN_CURRENT_BOUNDED_SCOPE_REQUIRED'using errcode='22023';end if;
 assertion:=p_assertion::jsonb;
 perform set_config('econmind.postwar_projection_world',p_world,true);
 perform world_v2.lock_postwar_paged_current_publication(p_world,p_country);
 select x.world_version,x.event_sequence into strict h from world_v2.world_head x where x.world_id=p_world for share;
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 packet:=world_v2.postwar_captain_projection_current_original(p_world,p_country,a.seed_fingerprint,a.admission_ref);
 select * into strict prefix from world_v2.verify_postwar_current_coverage_from(p_prefix,assertion->'coverage');
 select * into strict state from world_v2.postwar_captain_current_capital(p_world,p_country,packet);
 -- Metadata only: the public current-seat header intentionally contains no
 -- canonical payload/hash. Bind one exact immutable H0 parent, never raw seed.
 select count(distinct x.canonical_seed_sha256)into pin_count from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_country and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref;
 if pin_count<>1 then raise exception 'CAPTAIN_CURRENT_UNIQUE_CANONICAL_PARENT_REQUIRED'using errcode='55000';end if;
 select * into strict b from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_country and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref order by x.document_ref limit 1;
 if state.origin_world_version=0 and state.origin_event_sequence=0 then last_captain_event:=null;
 else
  select jsonb_build_object('eventId',e.event_id,'eventFingerprint',e.event_fingerprint,'worldVersion',e.world_version::text,'eventSequence',e.event_sequence::text)into last_captain_event from world_v2.authoritative_event e join world_v2.command_submission c on c.world_id=e.world_id and c.command_id=e.causation_command_id where e.world_id=p_world and e.world_version=state.origin_world_version and e.event_sequence=state.origin_event_sequence and e.event_type='CAPTAIN_POLITICAL_CAPITAL_ALLOCATED_V1'and c.country_id=p_country and c.office_id='CAPTAIN'and c.command_type='CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1';
  if last_captain_event is null then raise exception 'CAPTAIN_CURRENT_ACTUAL_ORIGIN_EVENT_REQUIRED'using errcode='23514';end if;
 end if;
 assertion:=p_assertion::jsonb;
 state_hash:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(state.capital),'UTF8')),'hex');
 select jsonb_agg(jsonb_build_object('schemaVersion','postwar-captain-political-capital-row-v1','countryId',p_country,'capitalRef',state.capital->>'capitalRef','bucket',x->>'bucket','unit','political_capital','balance',x->'balance'->>'amount','opening',state.capital->'opening'->>'amount','generated',state.capital->'generated'->>'amount','total',state.capital->'total'->>'amount','available',state.capital->'available'->>'amount','spent',state.capital->'spent'->>'amount','closing',state.capital->'closing'->>'amount','allocationNature','REALLOCATION_NOT_GENERATION_OR_SPENDING')order by n)into rows from jsonb_array_elements(state.capital->'buckets')with ordinality q(x,n);
 rows_hash:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(rows),'UTF8')),'hex');
 if assertion->'head'is distinct from jsonb_build_object('worldId',p_world,'worldVersion',h.world_version::text,'eventSequence',h.event_sequence::text)or assertion->'seedPins'is distinct from jsonb_build_object('worldId',p_world,'seedId',a.seed_id,'seedFingerprint',a.seed_fingerprint,'admissionRef',a.admission_ref)or assertion->'coverage'is distinct from jsonb_build_object('prefixFingerprint',prefix.prefix_fingerprint,'knownEffectsFingerprint',prefix.effects_fingerprint,'coveredThroughEventId',prefix.last_event_id,'coveredThroughEventFingerprint',prefix.last_event_fingerprint,'financialPostingCount',prefix.financial_posting_count,'financialBatchCount',prefix.financial_batch_count,'financialPostingsFingerprint',prefix.financial_postings_fingerprint,'pageProof',prefix.page_proof)or assertion->>'capitalStateHash'is distinct from state_hash or assertion->>'rowsHash'is distinct from rows_hash then raise exception 'CAPTAIN_CURRENT_CORE_SQL_STATE_OR_PREFIX_MISMATCH'using errcode='23514';end if;
 coverage_ref:='POSTWAR_CAPTAIN_CURRENT_COVERAGE_'||upper(encode(sha256(convert_to(p_assertion||p_country,'UTF8')),'hex'));
 coverage:=assertion->'coverage'||jsonb_build_object('schemaVersion','postwar-captain-current-page-chain-coverage-v2','reducerVersion','POSTWAR_COMPLETE_MIXED_PAGED_PREFIX_V1','countryId',p_country,'coverageRef',coverage_ref,'globalWorldVersion',h.world_version::text,'globalEventSequence',h.event_sequence::text,'capitalStateHash',state_hash,'originalPacketSha256',packet->>'packetSha256','originWorldVersion',state.origin_world_version::text,'originEventSequence',state.origin_event_sequence::text);
 pointer:=jsonb_build_object('schemaVersion','postwar-captain-current-source-pointer-v2','canonicalSeedSha256',b.canonical_seed_sha256,'canonicalSeedParent',jsonb_build_object('documentRef',b.document_ref,'documentSha256',b.document_sha256,'sourceVersion',b.source_version),'lastCaptainEvent',last_captain_event,'table','captain_operating_original','adoptionRef',packet->'adoption'->>'adoptionRef','genesisFactRef',packet->'genesis'->>'factRef','genesisPayloadSha256',packet->'genesis'->>'payloadSHA256','originalAdmissionEvidenceSha256',packet->'adoption'->>'originalAdmissionEvidenceSha256','currentDerivation','COMPLETE_FINANCE_SOCIAL_FX_CAPTAIN_PREFIX','capitalStateHash',state_hash);
 return next world_v2.postwar_write_paged_current_document(p_world,p_country,'CAPTAIN','political-capital-current',null,state.origin_world_version,state.origin_event_sequence,rows,coverage,pointer);
end;$$;
alter function world_v2.publish_postwar_paged_captain_current_from_verified(text,text,text,world_v2.postwar_current_verified_prefix)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.publish_postwar_paged_captain_current_from_verified(text,text,text,world_v2.postwar_current_verified_prefix)from public;

-- Same publish_postwar_paged_trade_current checks and mapper; shared prefix is owner-only.
create function world_v2.publish_postwar_paged_trade_current_from_verified(p_world text,p_country text,p_assertion text,p_prefix world_v2.postwar_current_verified_prefix)
returns setof world_v2.postwar_paged_current_document language plpgsql security definer set search_path=pg_catalog as $$
declare h record;a record;prefix record;b world_v2.postwar_office_projection_document%rowtype;assertion jsonb;inventory jsonb;transfers jsonb;inventory_hash text;transfer_hash text;coverage jsonb;pointer jsonb;dataset_name text;items jsonb;valid_balances boolean;
begin
 -- This existing fixed lock enforces the actual separate publisher, RR, source
 -- epoch fence, held H, current admission/permit and unrevoked Social parents.
 select * into strict h from world_v2.lock_postwar_paged_current_publication(p_world,p_country);
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 if octet_length(p_assertion)>16384 then raise exception 'TRADE_CURRENT_BOUNDED_ASSERTION_REQUIRED'using errcode='54000';end if;
 assertion:=p_assertion::jsonb;
 select * into strict prefix from world_v2.verify_postwar_current_coverage_from(p_prefix,assertion->'coverage');
 if assertion->'head'is distinct from jsonb_build_object('worldId',p_world,'worldVersion',h.world_version,'eventSequence',h.event_sequence)or assertion->'seedPins'is distinct from jsonb_build_object('worldId',p_world,'seedId',a.seed_id,'seedFingerprint',a.seed_fingerprint,'admissionRef',a.admission_ref)or assertion->'coverage'is distinct from jsonb_build_object('prefixFingerprint',prefix.prefix_fingerprint,'knownEffectsFingerprint',prefix.effects_fingerprint,'coveredThroughEventId',prefix.last_event_id,'coveredThroughEventFingerprint',prefix.last_event_fingerprint,'financialPostingCount',prefix.financial_posting_count,'financialBatchCount',prefix.financial_batch_count,'financialPostingsFingerprint',prefix.financial_postings_fingerprint,'pageProof',prefix.page_proof)then raise exception 'TRADE_CURRENT_CORE_SQL_COMPLETE_PREFIX_MISMATCH'using errcode='23514';end if;
 select * into strict b from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_country and x.office_id='TRADE'and x.dataset='opening-inventory-entries'and x.world_version=0 and x.event_sequence=0 and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref and x.source_bundle_sha256=a.source_bundle_sha256 and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.world_id=p_world and r.document_ref=x.document_ref)for share;
 if(select count(*)from world_v2.postwar_office_projection_page pg where pg.document_ref=b.document_ref)<>b.page_count or(select coalesce(sum(pg.row_count),0)from world_v2.postwar_office_projection_page pg where pg.document_ref=b.document_ref)<>b.total_rows or exists(select 1 from world_v2.postwar_office_projection_page pg where pg.document_ref=b.document_ref and(pg.page_sha256<>encode(sha256(convert_to(pg.rows_text,'UTF8')),'hex')or pg.row_count<>jsonb_array_length(pg.rows_text::jsonb)))then raise exception 'TRADE_CURRENT_COMPLETE_H0_ROWS_REQUIRED'using errcode='23514';end if;
 with entries as(
 select x->'account'as account,(x->'quantity'->>'amount')::numeric as amount,x->'quantity'->>'unit'as unit from world_v2.postwar_office_projection_page pg cross join lateral jsonb_array_elements(pg.rows_text::jsonb)x where pg.document_ref=b.document_ref
 union all
 select x->'account',(x->'delta'->>'amount')::numeric,x->'delta'->>'unit'from world_v2.inventory_posting ip cross join lateral jsonb_array_elements(ip.canonical_payload::jsonb->'entries')x where ip.world_id=p_world and ip.world_version_after<=h.world_version::bigint and x->'account'->>'countryId'=p_country
 ), balances as(select account,sum(amount)as amount,bool_and(unit=account->>'unit'and account->>'worldId'=p_world and account->>'countryId'=p_country)as valid from entries group by account)
 select coalesce(jsonb_agg(world_v2.postwar_trade_inventory_row(account,amount)order by world_v2.canonical_json(account)collate "C")filter(where amount>0),'[]'),bool_and(valid and amount>=0)into inventory,valid_balances from balances;
 if valid_balances is false then raise exception 'TRADE_CURRENT_EXACT_NONNEGATIVE_INVENTORY_REQUIRED'using errcode='23514';end if;
 -- Every row below is an actual committed transfer, not a proposal/signature
 -- queue or an opening stock. The complete SQL reducer above validates every
 -- event, journal, approval and state transition before status is projected.
 with reserved as(
 select c.command_id,c.command_fingerprint,c.canonical_payload::jsonb as intent,ip.canonical_payload::jsonb as posting from world_v2.command_submission c join world_v2.command_receipt r on r.world_id=c.world_id and r.command_id=c.command_id and r.outcome='COMMITTED'join world_v2.authoritative_event e on e.world_id=c.world_id and e.causation_command_id=c.command_id and e.event_type='NARROW_TREASURY_GCU_RESERVED_V1'join world_v2.inventory_posting ip on ip.world_id=c.world_id and ip.causation_command_id=c.command_id where c.world_id=p_world and c.command_type='CORE_GOODS_TRANSFER_V1'and e.world_version<=h.world_version::bigint and(c.canonical_payload::jsonb->>'sellerCountryId'=p_country or c.canonical_payload::jsonb->>'buyerCountryId'=p_country)
 ), statuses as(
 select r.*,destination->'account'as reservation,sh.canonical_payload::jsonb as shipment,de.command_id as delivery_id from reserved r cross join lateral jsonb_array_elements(r.posting->'entries')destination
 left join world_v2.command_submission sh on sh.world_id=p_world and sh.command_type='CORE_GOODS_SHIPMENT_V1'and sh.canonical_payload::jsonb->>'transferCommandId'=r.command_id and sh.canonical_payload::jsonb->>'transferFingerprint'=r.command_fingerprint and exists(select 1 from world_v2.command_receipt rr join world_v2.authoritative_event ee on ee.world_id=rr.world_id and ee.causation_command_id=rr.command_id where rr.world_id=p_world and rr.command_id=sh.command_id and rr.outcome='COMMITTED'and ee.event_type='NARROW_TREASURY_GCU_SHIPPED_V1'and ee.world_version<=h.world_version::bigint)
 left join world_v2.command_submission de on de.world_id=p_world and de.command_type='CORE_GOODS_DELIVERY_V1'and de.canonical_payload::jsonb->>'transferCommandId'=r.command_id and de.canonical_payload::jsonb->>'transferFingerprint'=r.command_fingerprint and exists(select 1 from world_v2.command_receipt rr join world_v2.authoritative_event ee on ee.world_id=rr.world_id and ee.causation_command_id=rr.command_id where rr.world_id=p_world and rr.command_id=de.command_id and rr.outcome='COMMITTED'and ee.event_type='NARROW_TREASURY_GCU_DELIVERED_V1'and ee.world_version<=h.world_version::bigint)
 where(destination->'delta'->>'amount')::numeric>0
 )select coalesce(jsonb_agg(jsonb_build_object('schemaVersion','postwar-trade-current-transfer-row-v1','transferCommandId',command_id,'transferFingerprint',command_fingerprint,'sellerCountryId',intent->>'sellerCountryId','buyerCountryId',intent->>'buyerCountryId','commodityId',intent->>'commodityId','batchId',intent->'assetSource'->>'batchId','quantity',intent->'quantity'->>'amount','unit',intent->'quantity'->>'unit','reservationId',reservation->'reservationId','shipmentId',shipment->'shipmentId','status',case when delivery_id is not null then'DELIVERED'when shipment is not null then'SHIPPED'else'RESERVED'end)order by command_id collate "C"),'[]')into transfers from statuses;
 inventory_hash:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(inventory),'UTF8')),'hex');transfer_hash:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(transfers),'UTF8')),'hex');
 if assertion->>'inventoryRowsHash'is distinct from inventory_hash or assertion->>'transferRowsHash'is distinct from transfer_hash then raise exception 'TRADE_CURRENT_CORE_SQL_ROWS_MISMATCH'using errcode='23514';end if;
 coverage:=assertion->'coverage'||jsonb_build_object('schemaVersion','postwar-trade-current-page-chain-coverage-v1','reducerVersion','POSTWAR_COMPLETE_MIXED_PAGED_PREFIX_V1','countryId',p_country,'coverageRef','TRADE_CURRENT_'||upper(encode(sha256(convert_to(p_assertion,'UTF8')),'hex')),'globalWorldVersion',h.world_version,'globalEventSequence',h.event_sequence,'inventoryRowsHash',inventory_hash,'transferRowsHash',transfer_hash);
 pointer:=jsonb_build_object('schemaVersion','postwar-trade-current-source-pointer-v1','openingDocumentRef',b.document_ref,'openingDocumentSha256',b.document_sha256,'currentDerivation','ALL_ACTUAL_INVENTORY_POSTINGS_AND_COMMITTED_GOODS_COMPLETE_PREFIX');
 foreach dataset_name in array array['inventory-current','goods-transfers-current']loop
 items:=case dataset_name when'inventory-current'then inventory else transfers end;
 -- Origin denotes this whole-prefix derived snapshot. It is deliberately not
 -- labelled as the last Trade action (the last global event may be another office).
 return next world_v2.postwar_write_trade_current_document(p_world,p_country,'TRADE',dataset_name,b.document_ref,h.world_version::bigint,h.event_sequence::bigint,items,coverage,pointer);
 end loop;
end;$$;
alter function world_v2.publish_postwar_paged_trade_current_from_verified(text,text,text,world_v2.postwar_current_verified_prefix)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.publish_postwar_paged_trade_current_from_verified(text,text,text,world_v2.postwar_current_verified_prefix)from public;

-- Same publish_postwar_industry_labour_current checks and mapper; shared prefix is owner-only.
create function world_v2.publish_postwar_industry_labour_current_from_verified(p_world text,p_country text,p_assertion text,p_prefix world_v2.postwar_current_verified_prefix)
returns setof world_v2.postwar_industry_labour_document language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h record;a record;prefix record;sc world_v2.postwar_industry_labour_scope%rowtype;ss record;b record;origin record;state jsonb;binding jsonb;assertion jsonb;prefix_coverage jsonb;coverage_schema text;paged boolean:=false;rows jsonb:='[]';p jsonb;actual jsonb;rows_hash text;coverage jsonb;ref text;version text;d world_v2.postwar_industry_labour_document%rowtype;buffer jsonb:='[]';idx integer:=0;off integer:=0;item jsonb;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_reader','MEMBER')then raise exception 'INDUSTRY_FIXED_SEPARATE_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if p_assertion is not null then if octet_length(p_assertion)>16384 then raise exception 'INDUSTRY_BOUNDED_ASSERTION_REQUIRED'using errcode='22023';end if;assertion:=p_assertion::jsonb;paged:=coalesce((assertion->'coverage')?'pageProof',false);end if;
 perform set_config('econmind.postwar_projection_world',p_world,true);
 if paged then
  -- The paged coordinator acquires the fresh revocation fence BEFORE H.
  -- Do not pre-lock H here and invert its shared source lock order.
  select * into strict h from world_v2.lock_postwar_paged_current_publication(p_world,p_country);
 else
  select world_version::text as world_version,event_sequence::text as event_sequence into strict h from world_v2.world_head where world_id=p_world for share;
  if h.world_version<>'0'or h.event_sequence<>'0'then select * into strict h from world_v2.lock_postwar_social_current_prefix_publication(p_world,p_country);end if;
 end if;
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 select * into strict sc from world_v2.postwar_industry_labour_scope where world_id=p_world and country_id=p_country for share;
 select * into strict ss from world_v2.postwar_social_prefix_scope where world_id=p_world and country_id=p_country for share;
 if not world_v2.postwar_industry_labour_source_current(p_world,p_country,a.seed_fingerprint,a.admission_ref,sc.source_id,sc.source_payload_hash)or sc.seed_fingerprint<>a.seed_fingerprint or sc.admission_ref<>a.admission_ref or sc.canonical_seed_sha256<>ss.canonical_seed_sha256 or sc.source_id<>ss.source_id or sc.source_payload_hash<>ss.source_payload_hash or sc.roster_sha256<>encode(sha256(convert_to(sc.roster_text,'UTF8')),'hex')or ss.scope_sha256<>encode(sha256(convert_to(ss.scope_document,'UTF8')),'hex')then raise exception 'INDUSTRY_FRESH_SAME_ORIGINAL_REQUIRED'using errcode='23514';end if;
 select * into strict b from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_country and x.office_id='INDUSTRY'and x.dataset='regional-source-capacity'and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref and x.canonical_seed_sha256=sc.canonical_seed_sha256 and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.world_id=p_world and r.document_ref=x.document_ref)for share;
 if h.world_version='0'and h.event_sequence='0'then
  if p_assertion is not null or exists(select 1 from world_v2.authoritative_event where world_id=p_world)or exists(select 1 from world_v2.command_receipt where world_id=p_world and outcome='COMMITTED')or exists(select 1 from world_v2.financial_posting_batch where world_id=p_world)or exists(select 1 from world_v2.inventory_posting where world_id=p_world)then raise exception 'INDUSTRY_ACTUAL_EMPTY_H0_PREFIX_REQUIRED'using errcode='55000';end if;
  prefix_coverage:=jsonb_build_object('prefixFingerprint','sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(jsonb_build_object('worldId',p_world,'seedFingerprint',a.seed_fingerprint,'headWorldVersion','0','headEventSequence','0','frames','[]'::jsonb)),'UTF8')),'hex'),'knownEffectsFingerprint','sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||'[]','UTF8')),'hex'),'coveredThroughEventId',null,'coveredThroughEventFingerprint',null,'financialPostingCount','0','financialBatchCount','0','financialPostingsFingerprint','sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||'[]','UTF8')),'hex'));
 else
  if p_assertion is null then raise exception 'INDUSTRY_ACTUAL_ASSERTION_REQUIRED'using errcode='22023';end if;
  if paged then
   select * into strict prefix from world_v2.verify_postwar_current_coverage_from(p_prefix,assertion->'coverage');
  else
   select * into strict prefix from world_v2.postwar_mixed_current_prefix(p_world);
   if assertion->'coverage'is distinct from jsonb_build_object('prefixFingerprint',prefix.prefix_fingerprint,'knownEffectsFingerprint',prefix.effects_fingerprint,'coveredThroughEventId',prefix.last_event_id,'coveredThroughEventFingerprint',prefix.last_event_fingerprint,'financialPostingCount',prefix.financial_posting_count,'financialBatchCount',prefix.financial_batch_count,'financialPostingsFingerprint',prefix.financial_postings_fingerprint)then raise exception 'INDUSTRY_ACTUAL_COMPLETE_PREFIX_MISMATCH'using errcode='23514';end if;
  end if;
  if assertion->'head'is distinct from jsonb_build_object('worldId',p_world,'worldVersion',h.world_version,'eventSequence',h.event_sequence)or assertion->'seedPins'is distinct from jsonb_build_object('worldId',p_world,'seedId',a.seed_id,'seedFingerprint',a.seed_fingerprint,'admissionRef',a.admission_ref)then raise exception 'INDUSTRY_ACTUAL_COMPLETE_PREFIX_MISMATCH'using errcode='23514';end if;
  prefix_coverage:=assertion->'coverage';
 end if;
 select * into origin from world_v2.postwar_social_origin_at_prefix(p_world,p_country);
 if found then state:=origin.state;binding:=origin.binding;
 else
  if exists(select 1 from world_v2.authoritative_event e join world_v2.command_submission c on c.world_id=e.world_id and c.command_id=e.causation_command_id where e.world_id=p_world and c.country_id=p_country and e.event_type in('SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1','SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1','SOCIAL_JOB_MATCH_SETTLED_V1'))then raise exception 'INDUSTRY_CURRENT_MATERIALIZATION_UNAVAILABLE'using errcode='55000';end if;
  state:=jsonb_build_object('labour',jsonb_build_object('positions',ss.scope_document::jsonb->'positions'));
 end if;
 for p in select x from jsonb_array_elements(sc.roster_text::jsonb)x order by (x->>'positionId')collate"C" loop
  select x into strict actual from jsonb_array_elements(state->'labour'->'positions')x where x->>'positionId'=p->>'positionId';
  if actual->>'countryId'is distinct from p_country or actual->>'locationId'is distinct from p->>'locationId'or actual->>'owner'is distinct from 'PRIVATE_SECTOR'or actual->>'skill'is distinct from p->>'skill'or actual->>'classificationId'is distinct from p->>'classificationId'or actual->>'requiredCount'is distinct from p->>'requiredCount'or actual->>'employedCount'!~'^(0|[1-9][0-9]*)$'or(actual->>'employedCount')::numeric>(p->>'requiredCount')::numeric or(h.world_version='0'and actual->>'employedCount'is distinct from p->>'openingFilledCount')then raise exception 'INDUSTRY_CURRENT_POSITION_SCOPE_OR_COUNT_MISMATCH'using errcode='23514';end if;
  rows:=rows||jsonb_build_array(p||jsonb_build_object('schemaVersion','postwar-industry-labour-current-row-v1','currentEmployedCount',actual->>'employedCount','measurement','EMPLOYMENT_HEADCOUNT_NOT_ATTENDANCE_OR_PAYMENT','completedPersonDays',null,'paidCost',null));
 end loop;
 rows_hash:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(rows),'UTF8')),'hex');
 if h.world_version<>'0'and assertion->>'rowsHash'is distinct from rows_hash then raise exception 'INDUSTRY_CORE_SQL_ROWS_MISMATCH'using errcode='23514';end if;
 coverage:=prefix_coverage||jsonb_build_object('schemaVersion',case when paged then'postwar-industry-labour-current-page-chain-coverage-v2'else'postwar-industry-labour-current-coverage-v1'end,'countryId',p_country,'globalWorldVersion',h.world_version,'globalEventSequence',h.event_sequence,'rowsHash',rows_hash,'originalScopeSha256',sc.roster_sha256);coverage_schema:=coverage->>'schemaVersion';
 ref:='POSTWAR_INDUSTRY_LABOUR_'||upper(encode(sha256(convert_to(world_v2.canonical_json(jsonb_build_array(p_world,p_country,a.seed_fingerprint,a.admission_ref,coverage,b.document_ref)),'UTF8')),'hex'));version:='sha256:'||encode(sha256(convert_to(ref,'UTF8')),'hex');
 select x.* into d from world_v2.postwar_industry_labour_document x where x.world_id=p_world and x.country_id=p_country and x.world_version=h.world_version::bigint and x.event_sequence=h.event_sequence::bigint and x.coverage->>'schemaVersion'=coverage_schema;
 if found then if d.document_ref<>ref then raise exception 'INDUSTRY_IMMUTABLE_CURRENT_CONFLICT'using errcode='23514';end if;return next d;return;end if;
 insert into world_v2.postwar_industry_labour_document values(ref,p_world,p_country,h.world_version::bigint,h.event_sequence::bigint,b.document_ref,version,coverage,sc.source_pointer||jsonb_build_object('currentStateBinding',binding),jsonb_array_length(rows));
 for item in select value from jsonb_array_elements(rows)loop
  if octet_length(jsonb_build_array(item)::text)>48000 then raise exception 'INDUSTRY_ROW_TOO_LARGE'using errcode='54000';end if;
  if jsonb_array_length(buffer)>=100 or octet_length((buffer||jsonb_build_array(item))::text)>48000 then
   insert into world_v2.postwar_industry_labour_page values(ref,p_world,idx,off,jsonb_array_length(buffer),buffer::text,encode(sha256(convert_to(buffer::text,'UTF8')),'hex'));off:=off+jsonb_array_length(buffer);idx:=idx+1;buffer:='[]';
  end if;buffer:=buffer||jsonb_build_array(item);
 end loop;
 insert into world_v2.postwar_industry_labour_page values(ref,p_world,idx,off,jsonb_array_length(buffer),buffer::text,encode(sha256(convert_to(buffer::text,'UTF8')),'hex'));
 return query select * from world_v2.postwar_industry_labour_document where document_ref=ref;
end;$$;
alter function world_v2.publish_postwar_industry_labour_current_from_verified(text,text,text,world_v2.postwar_current_verified_prefix)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.publish_postwar_industry_labour_current_from_verified(text,text,text,world_v2.postwar_current_verified_prefix)from public;

create function world_v2.publish_postwar_office_current_bundle(
 p_world text,p_country text,p_financial text,p_social text,p_captain text,p_trade text,p_industry text)
returns table(publication_kind text,country_id text,world_version text,event_sequence text,document_ref text,source_version text)
language plpgsql security definer set search_path=pg_catalog as $$
declare prefix world_v2.postwar_current_verified_prefix;effective name;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_reader','MEMBER')then raise exception 'MIXED_SEPARATE_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 select * into strict prefix from world_v2.postwar_paged_mixed_current_prefix(p_world,p_country);
 if p_captain is not null then
  return query select 'CAPTAIN',p_country,r.world_version::text,r.event_sequence::text,r.document_ref,r.source_version from world_v2.publish_postwar_paged_captain_current_from_verified(p_world,p_country,p_captain,prefix)r;
 end if;
 return query select 'FINANCIAL',p_country,r.world_version::text,r.event_sequence::text,r.document_ref,r.source_version from world_v2.publish_postwar_paged_financial_current_from_verified(p_world,p_country,p_financial,prefix)r;
 return query select 'SOCIAL',p_country,r.world_version::text,r.event_sequence::text,r.document_ref,r.source_version from world_v2.publish_postwar_paged_social_current_from_verified(p_world,p_country,p_social,prefix)r;
 if p_trade is not null then
  return query select 'TRADE',p_country,r.world_version::text,r.event_sequence::text,r.document_ref,r.source_version from world_v2.publish_postwar_paged_trade_current_from_verified(p_world,p_country,p_trade,prefix)r;
 end if;
 if p_industry is not null then
  return query select 'INDUSTRY',p_country,r.world_version::text,r.event_sequence::text,r.document_ref,r.source_version from world_v2.publish_postwar_industry_labour_current_from_verified(p_world,p_country,p_industry,prefix)r;
 end if;
end;$$;
alter function world_v2.publish_postwar_office_current_bundle(text,text,text,text,text,text,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.publish_postwar_office_current_bundle(text,text,text,text,text,text,text)from public;
grant execute on function world_v2.publish_postwar_office_current_bundle(text,text,text,text,text,text,text)to world_v2_postwar_projection_publisher;
revoke create on schema world_v2 from world_v2_postwar_projection_owner;
commit;
