-- SOURCE-ONLY candidate. Derived bounded pages, never an economic ledger,
-- source admission, activation, LOGIN or role enrollment. Requires the existing
-- immutable H0 projection/scopes and the reviewed fixed quote originals.
begin;
grant create on schema world_v2 to world_v2_postwar_projection_owner;
create table world_v2.postwar_mixed_current_document(
 document_ref text primary key,world_id text not null,country_id text not null,office_id text not null,dataset text not null,
 base_document_ref text not null,world_version bigint not null check(world_version>0),event_sequence bigint not null check(event_sequence>0),
 origin_world_version bigint not null check(origin_world_version>=0),origin_event_sequence bigint not null check(origin_event_sequence>=0),
 source_version text not null unique,document_sha256 text not null,coverage jsonb not null,source_pointer jsonb not null,
 total_rows integer not null check(total_rows>=0),page_count integer not null check(page_count>0),
 foreign key(base_document_ref,world_id)references world_v2.postwar_office_projection_document(document_ref,world_id),
 unique(world_id,country_id,office_id,dataset,world_version,event_sequence)
);
create table world_v2.postwar_mixed_current_page(
 document_ref text not null references world_v2.postwar_mixed_current_document(document_ref),world_id text not null,
 page_index integer not null,row_offset integer not null,row_count integer not null check(row_count between 0 and 100),
 rows_text text not null check(octet_length(rows_text)<=48000 and jsonb_typeof(rows_text::jsonb)='array'),
 page_sha256 text not null check(page_sha256=encode(sha256(convert_to(rows_text,'UTF8')),'hex')),
 primary key(document_ref,page_index),check(jsonb_array_length(rows_text::jsonb)=row_count)
);
do $$declare t text;begin foreach t in array array['postwar_mixed_current_document','postwar_mixed_current_page']loop
 execute format('alter table world_v2.%I owner to world_v2_postwar_projection_owner',t);
 execute format('alter table world_v2.%I enable row level security',t);execute format('alter table world_v2.%I force row level security',t);
 execute format('revoke all on world_v2.%I from public,world_v2_postwar_projection_reader,world_v2_postwar_projection_publisher',t);
 execute format('create policy mixed_current_owner on world_v2.%I to world_v2_postwar_projection_owner using(current_user=''world_v2_postwar_projection_owner''and world_id=current_setting(''econmind.postwar_projection_world'',true))with check(current_user=''world_v2_postwar_projection_owner''and world_id=current_setting(''econmind.postwar_projection_world'',true))',t);
 execute format('create policy mixed_current_world on world_v2.%I as restrictive to world_v2_postwar_projection_owner using(world_id=current_setting(''econmind.postwar_projection_world'',true))',t);
 execute format('create trigger mixed_current_immutable before update or delete on world_v2.%I for each row execute function world_v2.reject_authoritative_history_mutation()',t);
 execute format('create trigger mixed_current_no_truncate before truncate on world_v2.%I for each statement execute function world_v2.reject_authoritative_history_mutation()',t);
end loop;end;$$;
grant select(world_id,seed_id,seed_fingerprint,admission_ref,registration_ref)on world_v2.postwar_day_one_fx_source_original to world_v2_postwar_projection_owner;
grant select on world_v2.postwar_day_one_fx_quote_original to world_v2_postwar_projection_owner;
create policy mixed_projection_fx_source on world_v2.postwar_day_one_fx_source_original for select to world_v2_postwar_projection_owner using(current_user='world_v2_postwar_projection_owner'and world_id=current_setting('econmind.postwar_projection_world',true));
create policy mixed_projection_fx_quote on world_v2.postwar_day_one_fx_quote_original for select to world_v2_postwar_projection_owner using(current_user='world_v2_postwar_projection_owner'and world_id=current_setting('econmind.postwar_projection_world',true));
-- Verify the exact six-leg FX posting group, not a family allowlist. Core also
-- independently replays the complete prefix in the fixed publisher source.
create function world_v2.postwar_mixed_fx_group(p_world text,p_command jsonb,p_transition jsonb,p_event jsonb,p_batches jsonb,p_envelopes jsonb)returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
declare ep jsonb;q jsonb;original jsonb;accounts jsonb;binding jsonb;spec jsonb;legs jsonb;b jsonb;expected jsonb;name text;currency text;amount text;id text;a record;fund jsonb;balance numeric;reserved numeric;gcu numeric;local_debit numeric;
begin
 ep:=(p_event->>'canonicalPayload')::jsonb;q:=ep->'quote';accounts:=ep->'accounts';
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 select x.quote_text::jsonb into original from world_v2.postwar_day_one_fx_quote_original x join world_v2.postwar_day_one_fx_source_original s on s.world_id=x.world_id where x.world_id=p_world and x.country_id=p_command->>'countryId'and x.quote_ref=q->>'quoteRef'and s.seed_id=a.seed_id and s.seed_fingerprint=a.seed_fingerprint and s.admission_ref=a.admission_ref and x.quote_text_sha256=encode(sha256(convert_to(x.quote_text,'UTF8')),'hex');
 if original is null or original is distinct from q or p_event->>'eventType'<>'POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_V1'or ep->>'schemaVersion'<>'postwar-day-one-treasury-fx-settled-v1'or p_command->>'officeId'<>'FINANCE'or ep->'payload'is distinct from(p_command->>'canonicalPayload')::jsonb or ep->>'worldVersionBefore'is distinct from p_transition->>'worldVersionBefore'or ep->>'simTime'is distinct from p_command->>'simTime'or ep->>'fee'is distinct from '0'or ep->>'officialGcuReserveEffect'is distinct from '0'or(p_command->>'simTime')::numeric<(q->>'validFromSimTime')::numeric or(p_command->>'simTime')::numeric>=(q->>'validUntilSimTime')::numeric then return false;end if;
 if q->>'worldId'is distinct from p_world or q->>'countryId'is distinct from p_command->>'countryId'or q->>'seedFingerprint'is distinct from a.seed_fingerprint or q->>'spreadBps'is distinct from '0'or q->>'gcuQuantum'is distinct from '0.000001'or ep->>'requestedLocalMaximum'is distinct from ep->'payload'->>'localAmount'or ep->'payload'->>'quoteRef'is distinct from q->>'quoteRef'or ep->'payload'->>'expectedQuoteSha256'is distinct from q->>'quoteSha256'or ep->'payload'->>'localCurrency'is distinct from q->>'localCurrency'or ep->'payload'->>'payerTreasuryAccountId'is distinct from accounts->'treasuryAsset'->>'accountId'or ep->'payload'->>'payerGcuAccountId'is distinct from accounts->'treasuryGcuAsset'->>'accountId'or ep->'payload'->>'dealerGcuAccountId'is distinct from accounts->'bankGcuAsset'->>'accountId'or(select count(distinct value->>'accountId')from jsonb_each(accounts))<>6 or exists(select 1 from jsonb_each(accounts)x where x.value->>'worldId'is distinct from p_world or x.value->>'countryId'is distinct from p_command->>'countryId') then return false;end if;
 local_debit:=(ep->>'actualLocalDebit')::numeric;gcu:=(ep->>'filledGcu')::numeric;
 if local_debit<=0 or gcu<=0 or gcu is distinct from floor(((ep->'payload'->>'localAmount')::numeric/(q->>'localCurrencyPerGcu')::numeric)*1000000)/1000000 or local_debit is distinct from gcu*(q->>'localCurrencyPerGcu')::numeric or(ep->>'unusedLocalMaximum')::numeric is distinct from(ep->'payload'->>'localAmount')::numeric-local_debit or jsonb_array_length(p_batches)<>2 then return false;end if;
 select x into fund from world_v2.postwar_social_prefix_scope s cross join lateral jsonb_array_elements(s.scope_document::jsonb->'funding')x where s.world_id=p_world and s.country_id=p_command->>'countryId'and x->>'payerRole'='GOV';
 if fund is null or accounts->'treasuryAsset'->>'accountId'is distinct from fund->>'accountRef'or accounts->'treasuryAsset'->>'claimId'is distinct from fund->>'claimId'or accounts->'treasuryAsset'->>'ownerId'is distinct from q->>'governmentEntityId'or accounts->'bankGcuAsset'->>'accountId'is distinct from q->>'dealerGcuAccountId'or accounts->'bankGcuAsset'->>'ownerId'is distinct from q->>'bankEntityId'or accounts->'treasuryGcuAsset'->>'ownerId'is distinct from q->>'governmentEntityId'or accounts->'bankGcuAsset'->>'currency'<>'GCU'or accounts->'treasuryGcuAsset'->>'currency'<>'GCU'or accounts->'bankGcuAsset'->>'accountClass'<>'CASH'or accounts->'treasuryGcuAsset'->>'accountClass'<>'CASH'or accounts->'bankGcuAsset'->'claimId'is distinct from 'null'::jsonb or accounts->'bankGcuAsset'->'counterpartyEntityId'is distinct from 'null'::jsonb or accounts->'treasuryGcuAsset'->'claimId'is distinct from 'null'::jsonb or accounts->'treasuryGcuAsset'->'counterpartyEntityId'is distinct from 'null'::jsonb then return false;end if;
 -- All five original accounts must be present byte-for-byte in the admitted,
 -- unrevoked H0 Finance/CB pages. No name/ASSET/reserve-to-cash inference.
 foreach name in array array['treasuryAsset','treasuryLiability','bankSettlementAsset','bankSettlementLiability','bankGcuAsset']loop
  if not exists(select 1 from world_v2.postwar_office_projection_document d join world_v2.postwar_office_projection_page p on p.document_ref=d.document_ref cross join lateral jsonb_array_elements(p.rows_text::jsonb)x where d.world_id=p_world and d.country_id=p_command->>'countryId'and d.office_id in('FINANCE','CENTRAL_BANK')and d.dataset='opening-financial-legs'and d.seed_fingerprint=a.seed_fingerprint and d.admission_ref=a.admission_ref and d.world_version=0 and d.event_sequence=0 and x->'leg'->'account'=accounts->name and p.page_sha256=encode(sha256(convert_to(p.rows_text,'UTF8')),'hex')and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.document_ref=d.document_ref))then return false;end if;
 end loop;
 -- Reconstruct the two actually spendable balances from immutable H0 legs
 -- plus prior committed posting facts, not from an event-reported balance.
 reserved:=(fund->>'reservedAmount')::numeric+coalesce((select sum((x->>'cap')::numeric)from jsonb_array_elements(p_envelopes)x where x->'scope'->>'countryId'=p_command->>'countryId'),0)+coalesce((select sum((x.canonical_payload::jsonb->'reservation'->>'amount')::numeric)from world_v2.authoritative_event x join world_v2.command_submission c on c.world_id=x.world_id and c.command_id=x.causation_command_id where x.world_id=p_world and c.country_id=p_command->>'countryId'and x.event_type='SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1'and x.event_sequence<(p_event->>'sequence')::bigint),0);
 if (ep->'encumbrances'->>'treasuryReservedAmount')::numeric is distinct from reserved or(ep->'encumbrances'->>'bankGcuReservedAmount')::numeric is distinct from 0::numeric or ep->'encumbrances'->>'worldVersion'is distinct from p_transition->>'worldVersionBefore'then return false;end if;
 foreach name in array array['treasuryAsset','bankGcuAsset']loop
  select coalesce(sum(case when leg->>'direction'='DEBIT'then(leg->'amount'->>'amount')::numeric else-(leg->'amount'->>'amount')::numeric end),0)into balance from(
   select distinct on(x->'leg'->>'legId')x->'leg'as leg from world_v2.postwar_office_projection_document d join world_v2.postwar_office_projection_page pg on pg.document_ref=d.document_ref cross join lateral jsonb_array_elements(pg.rows_text::jsonb)x where d.world_id=p_world and d.country_id=p_command->>'countryId'and d.office_id in('FINANCE','CENTRAL_BANK')and d.dataset='opening-financial-legs'and d.seed_fingerprint=a.seed_fingerprint and d.admission_ref=a.admission_ref and x->'leg'->'account'->>'accountId'=accounts->name->>'accountId'
   union all
   select l from world_v2.financial_posting_batch batch cross join lateral jsonb_array_elements(batch.canonical_payload::jsonb->'legs')l join world_v2.command_receipt rec on rec.world_id=batch.world_id and rec.command_id=batch.causation_command_id and rec.outcome='COMMITTED'where batch.world_id=p_world and batch.world_version_after<(p_transition->>'worldVersionAfter')::bigint and l->'account'->>'accountId'=accounts->name->>'accountId'
  )actual;
  if balance<0 or(name='treasuryAsset'and balance-reserved<local_debit)or(name='bankGcuAsset'and balance<gcu)then return false;end if;
 end loop;
 binding:=jsonb_build_object('schemaVersion','authoritative-transition-binding-v1','transitionId',p_command->>'commandId','worldId',p_world,'commandId',p_command->>'commandId','commandFingerprint',p_command->>'fingerprint','idempotencyKey',p_command->'idempotencyKey','expectedWorldVersion',p_command->'expectedWorldVersion','worldVersionBefore',p_transition->>'worldVersionBefore','worldVersionAfter',p_transition->>'worldVersionAfter','eventIds',p_transition->'eventIds','eventFingerprints',jsonb_build_array(p_event->>'fingerprint'),'simTime',p_command->>'simTime');
 id:=upper(left(encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(jsonb_build_object('command',p_command->>'fingerprint','draft',p_event->>'payloadHash')),'UTF8')),'hex'),40));
 foreach currency in array array[q->>'localCurrency','GCU']loop
  legs:='[]';amount:=case currency when 'GCU'then ep->>'filledGcu'else ep->>'actualLocalDebit'end;
  for spec in select value from jsonb_array_elements(case currency when 'GCU'then '[ ["BANK_GCU","bankGcuAsset","CREDIT","treasuryGcuAsset"],["GOV_GCU","treasuryGcuAsset","DEBIT","bankGcuAsset"] ]'::jsonb else '[ ["TGA_ASSET","treasuryAsset","CREDIT","treasuryLiability"],["TGA_LIABILITY","treasuryLiability","DEBIT","treasuryAsset"],["BANK_SETTLEMENT","bankSettlementAsset","DEBIT","bankSettlementLiability"],["BANK_SETTLEMENT_LIABILITY","bankSettlementLiability","CREDIT","bankSettlementAsset"] ]'::jsonb end)loop
   legs:=legs||jsonb_build_array(jsonb_build_object('legId','FX_'||id||'_'||(spec->>0),'account',accounts->(spec->>1),'direction',spec->>2,'amount',jsonb_build_object('amount',amount,'currency',currency),'counterpartyAccountId',accounts->(spec->>3)->>'accountId'));
  end loop;
  select jsonb_agg(x order by x->>'legId'collate "C")into legs from jsonb_array_elements(legs)x;
  expected:=jsonb_build_object('schemaVersion','financial-posting-v1','batchId','BATCH_FX_'||id||'_'||currency,'worldId',p_world,'causationCommandId',p_command->>'commandId','causationEventIds',p_transition->'eventIds','worldVersionBefore',p_transition->>'worldVersionBefore','worldVersionAfter',p_transition->>'worldVersionAfter','simTime',p_command->>'simTime','transitionBinding',binding,'settlementCurrency',currency,'legs',legs);
  expected:=expected||jsonb_build_object('fingerprint','sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(expected),'UTF8')),'hex'));
  select x into b from jsonb_array_elements(p_batches)x where x->>'settlementCurrency'=currency;
  if b is null or b is distinct from expected then return false;end if;
 end loop;
 return true;
exception when invalid_text_representation or numeric_value_out_of_range or division_by_zero then return false;
end;$$;
alter function world_v2.postwar_mixed_fx_group(text,jsonb,jsonb,jsonb,jsonb,jsonb)owner to world_v2_postwar_projection_owner;

-- Rehydrate only after independently checking the actual immutable SQL bytes.
-- Storage intentionally excludes fingerprint from canonical_payload.
create function world_v2.postwar_mixed_current_batch(p_raw text,p_fingerprint text,p_batch_id text)returns jsonb
language plpgsql immutable set search_path=pg_catalog as $$
declare body jsonb;begin
 if p_raw is null or octet_length(p_raw)>65536 then raise exception 'MIXED_CANONICAL_BATCH_BOUNDED'using errcode='23514';end if;
 body:=p_raw::jsonb;
 if jsonb_typeof(body)is distinct from 'object'or body?'fingerprint'or p_raw<>world_v2.canonical_json(body)or body->>'batchId'is distinct from p_batch_id or p_fingerprint is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||p_raw,'UTF8')),'hex')then raise exception 'MIXED_CANONICAL_BATCH_INVALID'using errcode='23514';end if;
 return body||jsonb_build_object('fingerprint',p_fingerprint);
end;$$;
alter function world_v2.postwar_mixed_current_batch(text,text,text)owner to world_v2_postwar_projection_owner;

-- Complete independent stored-frame reconstruction, including Budget LINE groups.
create function world_v2.postwar_mixed_current_prefix(p_world text)
returns table(prefix_fingerprint text,effects_fingerprint text,last_event_id text,last_event_fingerprint text,budget_envelopes jsonb,financial_posting_count text,financial_batch_count text,financial_postings_fingerprint text)
language plpgsql security definer set search_path=pg_catalog as $$
declare br record;batches jsonb;all_batches jsonb:='[]';total_batches bigint:=0;total_legs bigint:=0;actual_batch_count bigint;h record;a record;r record;c record;e record;command jsonb;event jsonb;events jsonb;transition jsonb;receipt jsonb;ep jsonb;first_body jsonb;frames jsonb:='[]';meta jsonb:='[]';wv bigint:=0;seq bigint:=0;bytes bigint:=0;seed_fp text;intent jsonb;policy jsonb;binding jsonb;before_state jsonb;after_state jsonb;env jsonb;next_env jsonb;envelopes jsonb:='[]';captains jsonb:='{}';fund jsonb;event_index integer;expected_type text;expected_count integer;amount numeric;line_total numeric;
begin
 perform set_config('econmind.postwar_projection_world',p_world,true);
 if not exists(select 1 from world_v2.postwar_social_prefix_scope where world_id=p_world)then raise exception 'MIXED_IMMUTABLE_SCOPES_REQUIRED'using errcode='55000';end if;
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 select * into strict h from world_v2.world_head x where x.world_id=p_world;
 if h.world_version<1 or h.world_version>256 or h.event_sequence>256 then raise exception 'FINANCIAL_PREFIX_CAPACITY_EXCEEDED'using errcode='54000';end if;
 if(select count(*)from world_v2.command_receipt x where x.world_id=p_world and x.outcome='COMMITTED')<>h.world_version or(select count(*)from world_v2.authoritative_event x where x.world_id=p_world)<>h.event_sequence or exists(select 1 from world_v2.inventory_posting x where x.world_id=p_world)then raise exception 'FINANCIAL_PREFIX_INCOMPLETE_OR_POSTING_DOMAIN_UNAVAILABLE'using errcode='55000';end if;
 for r in select * from world_v2.command_receipt x where x.world_id=p_world and x.outcome='COMMITTED'order by x.world_version_after loop
  select * into strict c from world_v2.command_submission x where x.world_id=p_world and x.command_id=r.command_id;
  if r.schema_version<>'command-receipt-v2'or r.reason_code is not null or r.world_version_before<>wv or r.world_version_after<>wv+1 or c.expected_world_version is distinct from wv or r.transition_id<>c.command_id or r.command_fingerprint<>c.command_fingerprint or r.sim_time<>c.sim_time or r.idempotency_key is distinct from c.idempotency_key then raise exception 'FINANCIAL_PREFIX_RECEIPT_GAP'using errcode='55000';end if;
  command:=jsonb_build_object('actorId',c.actor_id,'authSubject',c.auth_subject::text,'commandId',c.command_id,'commandType',c.command_type,'correlationId',c.correlation_id,'countryId',c.country_id,'expectedWorldVersion',c.expected_world_version::text,'idempotencyKey',c.idempotency_key,'officeId',c.office_id,'canonicalPayload',c.canonical_payload,'schemaVersion',c.schema_version,'simTime',c.sim_time::text,'submittedAtReal',to_char(c.submitted_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'worldId',p_world,'fingerprint',c.command_fingerprint,'payloadHash',c.payload_sha256);
  intent:=c.canonical_payload::jsonb;
  if c.schema_version<>'command-v1'or c.canonical_payload<>world_v2.canonical_json(intent)or c.command_fingerprint is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(command-'fingerprint'-'payloadHash'-'correlationId'-'submittedAtReal'),'UTF8')),'hex')or c.payload_sha256 is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||c.canonical_payload,'UTF8')),'hex')then raise exception 'FINANCIAL_CANONICAL_COMMAND_INVALID'using errcode='23514';end if;
  expected_count:=1;
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
  elsif c.command_type not in('CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1','POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1','CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1','CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1','CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1')then raise exception 'FINANCIAL_UNKNOWN_DOMAIN_UNAVAILABLE'using errcode='55000';end if;
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
    if e.event_type<>expected_type or ep->>'schemaVersion'is distinct from 'finance-native-budget-event-v1'or ep->>'commandFingerprint'is distinct from c.command_fingerprint or ep->'payload'is distinct from intent or ep->>'intentIndex'is distinct from event_index::text or ep->>'intentCount'is distinct from expected_count::text or(ep-'intentIndex')is distinct from(first_body-'intentIndex')or ep->>'stateBeforeHash'is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(before_state),'UTF8')),'hex')or ep->>'stateAfterHash'is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(after_state),'UTF8')),'hex')or binding->>'seedRef'is distinct from a.seed_id or binding->>'seedFingerprint'is distinct from a.seed_fingerprint or binding->>'admissionRef'is distinct from a.admission_ref or binding->>'financialSourceId'is distinct from(select d.source_pointer->>'financialSourceId'from world_v2.postwar_office_projection_document d where d.world_id=p_world and d.country_id=c.country_id and d.office_id='FINANCE'and d.dataset='opening-financial-legs') or binding->>'treasuryAccountId'is distinct from fund->>'accountRef'or binding->>'treasuryClaimId'is distinct from fund->>'claimId'or policy->>'worldId'is distinct from p_world or policy->>'countryId'is distinct from c.country_id or policy->>'governmentEntityId'is distinct from fund->>'payerEntityId'or policy->>'currency'is distinct from fund->>'currency'or policy->>'envelopeRef'is distinct from intent->'scope'->>'envelopeRef'or policy->>'effectivePeriodRef'is distinct from intent->'scope'->>'effectivePeriodRef'or policy->>'schemaVersion'is distinct from 'finance-native-budget-policy-v1'or policy->>'requestingOfficeId'is distinct from 'FINANCE'or policy->>'programmeOwnerOfficeId'is distinct from 'FINANCE'or policy->>'classification'is distinct from 'ORDINARY_DEPARTMENTAL'or policy->>'funding'is distinct from 'FULL_UNCONDITIONAL'or policy->'requiredApprovalOffices'is distinct from '["FINANCE"]'::jsonb or c.sim_time<(policy->>'validFromSimTime')::bigint or c.sim_time>=(policy->>'validUntilSimTime')::bigint or policy->>'ruleRef'is distinct from 'FINANCE_ORDINARY_SELF_ADMINISTRATION_FULL_V1'or binding->>'policyHash'is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(policy),'UTF8')),'hex')then raise exception 'FINANCIAL_BUDGET_CORE_EFFECT_MISMATCH'using errcode='23514';end if;
   elsif c.command_type='CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1'then
    captains:=jsonb_set(captains,array[c.country_id],world_v2.postwar_mixed_captain_group(p_world,command,event,captains->c.country_id));
   elsif c.command_type='POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'then
    if c.office_id is distinct from 'FINANCE'or e.event_type<>'POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_V1'then raise exception 'MIXED_FX_EXACT_FAMILY_REQUIRED'using errcode='23514';end if;
   elsif ep->'command'is distinct from(command-'canonicalPayload'-'fingerprint'-'payloadHash')||jsonb_build_object('payload',intent)or not world_v2.postwar_social_prefix_effect_scoped(p_world,c.country_id,e.event_type,command,ep,e.event_sequence)then raise exception 'FINANCIAL_SOCIAL_SCOPE_EFFECT_INVALID'using errcode='23514';end if;
   events:=events||jsonb_build_array(event);last_event_id:=e.event_id;last_event_fingerprint:=e.event_fingerprint;event_index:=event_index+1;
  end loop;
  if event_index<>expected_count then raise exception 'FINANCIAL_EVENT_ROWS_INCOMPLETE'using errcode='55000';end if;
  transition:=jsonb_build_object('schemaVersion','authoritative-transition-v1','transitionId',c.command_id,'worldId',p_world,'commandId',c.command_id,'commandFingerprint',c.command_fingerprint,'worldVersionBefore',r.world_version_before::text,'worldVersionAfter',r.world_version_after::text,'eventIds',r.event_ids,'events',events);
  receipt:=jsonb_build_object('schemaVersion',r.schema_version,'worldId',p_world,'commandId',r.command_id,'idempotencyKey',r.idempotency_key,'commandFingerprint',r.command_fingerprint,'outcome',r.outcome,'reasonCode',r.reason_code,'transitionId',r.transition_id,'worldVersionBefore',r.world_version_before::text,'worldVersionAfter',r.world_version_after::text,'simTime',r.sim_time::text,'eventIds',r.event_ids,'recordedAtReal',to_char(r.recorded_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  batches:='[]';
  select count(*)into actual_batch_count from world_v2.financial_posting_batch x where x.world_id=p_world and x.causation_command_id=c.command_id;
  if c.command_type='POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1'then
   if actual_batch_count<>2 then raise exception 'MIXED_EXACT_TWO_FX_BATCHES_REQUIRED'using errcode='55000';end if;
   for br in select x.* from world_v2.financial_posting_batch x where x.world_id=p_world and x.causation_command_id=c.command_id order by case when x.settlement_currency='GCU'then 1 else 0 end,x.batch_id loop
    if br.world_version_before<>r.world_version_before or br.world_version_after<>r.world_version_after or br.sim_time<>r.sim_time or br.event_ids<>r.event_ids or br.transition_binding is distinct from world_v2.canonical_json(br.canonical_payload::jsonb->'transitionBinding')or br.settlement_currency is distinct from br.canonical_payload::jsonb->>'settlementCurrency'then raise exception 'MIXED_CANONICAL_BATCH_BINDING_INVALID'using errcode='23514';end if;
    bytes:=bytes+octet_length(br.canonical_payload);if bytes>8388608 then raise exception 'MIXED_COMPLETE_PREFIX_BYTES_EXCEEDED'using errcode='54000';end if;
    batches:=batches||jsonb_build_array(world_v2.postwar_mixed_current_batch(br.canonical_payload,br.batch_fingerprint,br.batch_id));total_batches:=total_batches+1;total_legs:=total_legs+jsonb_array_length(br.canonical_payload::jsonb->'legs');
   end loop;
   if not world_v2.postwar_mixed_fx_group(p_world,command,transition,events->0,batches,envelopes)then raise exception 'MIXED_EXACT_FX_EFFECTS_INVALID'using errcode='23514';end if;
  elsif actual_batch_count<>0 then raise exception 'MIXED_FINANCIAL_EFFECT_OUTSIDE_FX'using errcode='55000';end if;
  all_batches:=all_batches||batches;
  frames:=frames||jsonb_build_array(jsonb_build_object('command',command,'transition',transition,'financialPostingBatches',batches,'inventoryPostings','[]'::jsonb,'receipt',receipt,'events',events));
  meta:=meta||jsonb_build_array(jsonb_build_object('commandId',c.command_id,'countryId',c.country_id,'commandType',c.command_type,'transitionFingerprint','sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(transition),'UTF8')),'hex'),'receiptFingerprint','sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(receipt),'UTF8')),'hex'),'eventFingerprints',(select jsonb_agg(x->'fingerprint'order by n)from jsonb_array_elements(events)with ordinality q(x,n)),'worldVersionBefore',r.world_version_before::text,'worldVersionAfter',r.world_version_after::text,'events',(select jsonb_agg(jsonb_build_object('eventId',x->>'eventId','fingerprint',x->>'fingerprint','sequence',x->>'sequence','worldVersion',x->>'worldVersion')order by n)from jsonb_array_elements(events)with ordinality q(x,n))));
  wv:=r.world_version_after;seq:=seq+expected_count;
 end loop;
 if wv<>h.world_version or seq<>h.event_sequence then raise exception 'FINANCIAL_PREFIX_HEAD_INCOMPLETE'using errcode='55000';end if;
 select x.seed_fingerprint into strict seed_fp from world_v2.postwar_projection_admission_header(p_world)x;
 prefix_fingerprint:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(jsonb_build_object('worldId',p_world,'seedFingerprint',seed_fp,'headWorldVersion',wv::text,'headEventSequence',seq::text,'frames',frames)),'UTF8')),'hex');
 effects_fingerprint:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(meta),'UTF8')),'hex');budget_envelopes:=envelopes;financial_posting_count:=total_legs::text;financial_batch_count:=total_batches::text;financial_postings_fingerprint:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(all_batches),'UTF8')),'hex');
 if total_batches<>(select count(*)from world_v2.financial_posting_batch x where x.world_id=p_world)then raise exception 'MIXED_GLOBAL_POSTING_SET_INCOMPLETE'using errcode='55000';end if;return next;
end;$$;
alter function world_v2.postwar_mixed_current_prefix(text)owner to world_v2_postwar_projection_owner;
-- Private append-only derived writer. Only fixed owner publisher functions may
-- call this function; rows supplied by an online actor are never accepted here.
create function world_v2.postwar_write_mixed_current_document(p_world text,p_country text,p_office text,p_dataset text,p_base_document_ref text,p_origin_world_version bigint,p_origin_event_sequence bigint,p_rows jsonb,p_coverage jsonb,p_source_pointer jsonb)
returns world_v2.postwar_mixed_current_document language plpgsql security definer set search_path=pg_catalog as $$
declare h record;a record;b world_v2.postwar_office_projection_document%rowtype;d world_v2.postwar_mixed_current_document%rowtype;ref text;version text;hash text;pages integer:=1;idx integer:=0;off integer:=0;buffer jsonb:='[]';item jsonb;
begin
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select * into strict h from world_v2.world_head where world_id=p_world for share;
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 if h.world_version<1 or h.world_version>256 or h.event_sequence<1 or h.event_sequence>256 or p_origin_world_version<0 or p_origin_world_version>h.world_version or p_origin_event_sequence<0 or p_origin_event_sequence>h.event_sequence or(p_origin_world_version=0)<>(p_origin_event_sequence=0)or p_coverage->>'globalWorldVersion'is distinct from h.world_version::text or p_coverage->>'globalEventSequence'is distinct from h.event_sequence::text or p_coverage->>'countryId'is distinct from p_country or jsonb_typeof(p_rows)is distinct from 'array'or jsonb_typeof(p_source_pointer)is distinct from 'object'then raise exception 'MIXED_DOCUMENT_SCOPE_HEAD_REQUIRED'using errcode='23514';end if;
 if not((p_office='SOCIAL'and p_dataset in('positions','service-pools'))or(p_office='FINANCE'and p_dataset in('currency-fx','opening-financial-legs','ledger-balances','treasury-capacity'))or(p_office='CENTRAL_BANK'and p_dataset in('currency-fx','cb-categories','cb-holdings','bank-loans','opening-financial-legs','ledger-balances')))then raise exception 'MIXED_FIXED_DATASET_REQUIRED'using errcode='22023';end if;
 select * into strict b from world_v2.postwar_office_projection_document x where x.document_ref=p_base_document_ref and x.world_id=p_world and x.country_id=p_country and x.office_id=p_office and x.dataset=case when p_dataset in('ledger-balances','treasury-capacity')then'opening-financial-legs'else p_dataset end and x.world_version=0 and x.event_sequence=0 and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref and x.source_bundle_sha256=a.source_bundle_sha256 and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.world_id=p_world and r.document_ref=x.document_ref)for share;
 hash:=encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
 ref:='POSTWAR_MIXED_CURRENT_'||upper(encode(sha256(convert_to(world_v2.canonical_json(jsonb_build_array(p_world,p_country,p_office,p_dataset,b.document_ref,a.seed_fingerprint,a.admission_ref,h.world_version::text,h.event_sequence::text,p_origin_world_version::text,p_origin_event_sequence::text,hash,p_coverage,p_source_pointer)),'UTF8')),'hex'));
 version:='sha256:'||encode(sha256(convert_to(ref||hash,'UTF8')),'hex');
 select * into d from world_v2.postwar_mixed_current_document x where x.world_id=p_world and x.country_id=p_country and x.office_id=p_office and x.dataset=p_dataset and x.world_version=h.world_version and x.event_sequence=h.event_sequence;
 if found then if d.document_ref<>ref then raise exception 'MIXED_IMMUTABLE_DOCUMENT_CONFLICT'using errcode='23514';end if;return d;end if;
 for item in select value from jsonb_array_elements(p_rows)loop
  if octet_length(jsonb_build_array(item)::text)>48000 then raise exception 'MIXED_ROW_CAPACITY_EXCEEDED'using errcode='54000';end if;
  if jsonb_array_length(buffer)>=100 or octet_length((buffer||jsonb_build_array(item))::text)>48000 then pages:=pages+1;buffer:='[]';end if;buffer:=buffer||jsonb_build_array(item);
 end loop;
 insert into world_v2.postwar_mixed_current_document values(ref,p_world,p_country,p_office,p_dataset,b.document_ref,h.world_version,h.event_sequence,p_origin_world_version,p_origin_event_sequence,version,hash,p_coverage,p_source_pointer,jsonb_array_length(p_rows),pages);
 buffer:='[]';for item in select value from jsonb_array_elements(p_rows)loop
  if jsonb_array_length(buffer)>=100 or octet_length((buffer||jsonb_build_array(item))::text)>48000 then
   insert into world_v2.postwar_mixed_current_page values(ref,p_world,idx,off,jsonb_array_length(buffer),buffer::text,encode(sha256(convert_to(buffer::text,'UTF8')),'hex'));off:=off+jsonb_array_length(buffer);idx:=idx+1;buffer:='[]';end if;buffer:=buffer||jsonb_build_array(item);
 end loop;
 insert into world_v2.postwar_mixed_current_page values(ref,p_world,idx,off,jsonb_array_length(buffer),buffer::text,encode(sha256(convert_to(buffer::text,'UTF8')),'hex'));
 select * into strict d from world_v2.postwar_mixed_current_document where document_ref=ref;return d;
end;$$;
alter function world_v2.postwar_write_mixed_current_document(text,text,text,text,text,bigint,bigint,jsonb,jsonb,jsonb)owner to world_v2_postwar_projection_owner;

create function world_v2.publish_postwar_mixed_social_current(p_world text,p_country text,p_assertion text)
returns setof world_v2.postwar_mixed_current_document language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h record;a record;prefix record;origin record;s world_v2.postwar_social_prefix_scope%rowtype;b world_v2.postwar_office_projection_document%rowtype;assertion jsonb;coverage jsonb;binding jsonb;pointer jsonb;state jsonb;items jsonb;dataset_name text;ow bigint:=0;os bigint:=0;state_hash text;material_hash text;coverage_id text;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_reader','MEMBER')then raise exception 'MIXED_SEPARATE_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 select * into strict h from world_v2.lock_postwar_social_current_prefix_publication(p_world,p_country);
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 select * into strict s from world_v2.postwar_social_prefix_scope x where x.world_id=p_world and x.country_id=p_country for share;
 if s.seed_fingerprint<>a.seed_fingerprint or s.admission_ref<>a.admission_ref or s.source_bundle_sha256<>a.source_bundle_sha256 or s.scope_sha256<>encode(sha256(convert_to(s.scope_document,'UTF8')),'hex')then raise exception 'MIXED_SEALED_SCOPE_LINEAGE_REQUIRED'using errcode='23514';end if;
 if octet_length(p_assertion)>16384 then raise exception 'MIXED_ASSERTION_BOUNDED'using errcode='54000';end if;assertion:=p_assertion::jsonb;
 select * into strict prefix from world_v2.postwar_mixed_current_prefix(p_world);
 if assertion->'head'is distinct from jsonb_build_object('worldId',p_world,'worldVersion',h.world_version,'eventSequence',h.event_sequence)or assertion->'seedPins'is distinct from jsonb_build_object('worldId',p_world,'seedId',a.seed_id,'seedFingerprint',a.seed_fingerprint,'admissionRef',a.admission_ref)or assertion->'coverage'is distinct from jsonb_build_object('prefixFingerprint',prefix.prefix_fingerprint,'knownEffectsFingerprint',prefix.effects_fingerprint,'coveredThroughEventId',prefix.last_event_id,'coveredThroughEventFingerprint',prefix.last_event_fingerprint,'financialPostingCount',prefix.financial_posting_count,'financialBatchCount',prefix.financial_batch_count,'financialPostingsFingerprint',prefix.financial_postings_fingerprint)then raise exception 'MIXED_CORE_SQL_COMPLETE_PREFIX_MISMATCH'using errcode='23514';end if;
 select * into origin from world_v2.postwar_social_origin_at_prefix(p_world,p_country);
 if found then
  state:=origin.state;binding:=origin.binding;ow:=origin.origin_world_version;os:=origin.origin_event_sequence;material_hash:=binding->>'materializationHash';
  perform 1 from world_v2.current_materialization x where x.world_id=p_world and x.materialization_key=binding->>'materializationKey'for share;
 else
  if exists(select 1 from world_v2.authoritative_event e join world_v2.command_submission c on c.world_id=e.world_id and c.command_id=e.causation_command_id where e.world_id=p_world and c.country_id=p_country and e.event_type in('SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1','SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1','SOCIAL_JOB_MATCH_SETTLED_V1'))then raise exception 'MIXED_COMMITTED_MATERIALIZATION_UNAVAILABLE'using errcode='55000';end if;
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
 coverage:=assertion->'coverage'||jsonb_build_object('schemaVersion','postwar-social-current-prefix-coverage-v3','reducerVersion','POSTWAR_SOCIAL_FINANCE_FX_COMPLETE_PREFIX_V3','countryId',p_country,'coverageRef',coverage_id,'globalWorldVersion',h.world_version,'globalEventSequence',h.event_sequence,'originWorldVersion',ow::text,'originEventSequence',os::text,'employmentStateHash',state_hash,'materializationHash',material_hash,'stateOrigin',case when ow=0 then'ADMITTED_OPENING_SOURCE'else'COMMITTED_MATERIALIZATION'end);
 foreach dataset_name in array array['positions','service-pools']loop
  select * into strict b from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_country and x.office_id='SOCIAL'and x.dataset=dataset_name and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref;
  items:=case dataset_name when'positions'then state->'labour'->'positions'else state->'servicePools'end;
  pointer:=case when ow=0 then jsonb_build_object('original',b.source_pointer,'currentDerivation','UNCHANGED_ADMITTED_OPENING_AFTER_COMPLETE_MIXED_PREFIX')else jsonb_build_object('table','current_materialization','key',binding->>'materializationKey','path',case when(binding->>'materializationKey')like'SOCIAL_POSITION_LIFECYCLE_%'then'employment.'else''end||case dataset_name when'positions'then'labour.positions'else'servicePools'end,'currentStateBinding',binding)end;
  return next world_v2.postwar_write_mixed_current_document(p_world,p_country,'SOCIAL',dataset_name,b.document_ref,ow,os,items,coverage,pointer);
 end loop;
end;$$;
alter function world_v2.publish_postwar_mixed_social_current(text,text,text)owner to world_v2_postwar_projection_owner;
-- Online low privilege entry: metadata and a single bounded page only. It never
-- hydrates the seed or accepts a publisher/assertion/token from an API actor.
create function world_v2.read_postwar_mixed_current_page(p_world text,p_office text,p_dataset text,p_offset integer,p_limit integer,p_expected_version text default null)
returns table(status text,scope jsonb,source jsonb,page jsonb,rows_text text)
language plpgsql security definer set search_path=pg_catalog as $$
declare s record;d world_v2.postwar_mixed_current_document%rowtype;b world_v2.postwar_office_projection_document%rowtype;p world_v2.postwar_mixed_current_page%rowtype;selected jsonb;src jsonb;returned integer;is_current boolean;coverage_key text;
begin
 if p_offset is null or p_limit is null or p_offset<0 or p_offset>100000 or p_limit<1 or p_limit>100 or p_office is null or p_dataset is null or not((p_office='SOCIAL'and p_dataset in('positions','service-pools'))or(p_office='FINANCE'and p_dataset in('currency-fx','opening-financial-legs','ledger-balances','treasury-capacity'))or(p_office='CENTRAL_BANK'and p_dataset in('currency-fx','cb-categories','cb-holdings','bank-loans','opening-financial-legs','ledger-balances')))or(p_offset>0 and p_expected_version is null)or(p_expected_version is not null and p_expected_version!~'^sha256:[a-f0-9]{64}$')then raise exception 'MIXED_INVALID_PAGE'using errcode='22023';end if;
 select * into s from world_v2.read_postwar_office_projection_seats(p_world)x where x.office_id=p_office;
 if not found then return query select'DENIED',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into d from world_v2.postwar_mixed_current_document x where x.world_id=p_world and x.country_id=s.country_id and x.office_id=p_office and x.dataset=p_dataset and x.world_version=s.world_version::bigint and x.event_sequence=s.event_sequence::bigint;
 if not found then
  if p_expected_version is not null and exists(select 1 from world_v2.postwar_mixed_current_document x where x.world_id=p_world and x.country_id=s.country_id and x.office_id=p_office and x.dataset=p_dataset and x.source_version=p_expected_version)then return query select'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';else return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';end if;return;
 end if;
 if p_expected_version is not null and p_expected_version<>d.source_version then return query select'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into b from world_v2.postwar_office_projection_document x where x.document_ref=d.base_document_ref and x.world_id=p_world and x.country_id=s.country_id and x.office_id=p_office and x.dataset=case when p_dataset in('ledger-balances','treasury-capacity')then'opening-financial-legs'else p_dataset end and x.world_version=0 and x.event_sequence=0 and x.seed_id=s.seed_id and x.seed_fingerprint=s.seed_fingerprint and x.admission_ref=s.admission_ref and x.source_bundle_sha256=s.source_bundle_sha256 and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.world_id=p_world and r.document_ref=x.document_ref);
 if not found or d.coverage->>'countryId'is distinct from s.country_id or d.coverage->>'globalWorldVersion'is distinct from s.world_version or d.coverage->>'globalEventSequence'is distinct from s.event_sequence or not exists(select 1 from world_v2.authoritative_event e where e.world_id=p_world and e.event_id=d.coverage->>'coveredThroughEventId'and e.event_fingerprint=d.coverage->>'coveredThroughEventFingerprint'and e.world_version=d.world_version and e.event_sequence=d.event_sequence)then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 if p_office='SOCIAL'and d.origin_world_version>0 and not exists(select 1 from world_v2.current_materialization m where m.world_id=p_world and m.materialization_key=d.source_pointer->'currentStateBinding'->>'materializationKey'and m.world_version=d.origin_world_version and m.source_command_id=d.source_pointer->'currentStateBinding'->>'sourceCommandId'and m.payload_sha256=d.source_pointer->'currentStateBinding'->>'materializationHash')then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into p from world_v2.postwar_mixed_current_page x where x.document_ref=d.document_ref and x.world_id=p_world and x.row_offset<=p_offset and(p_offset<x.row_offset+x.row_count or d.total_rows=0)order by x.page_index desc limit 1;
 if p_offset>=d.total_rows then selected:='[]';else
  if p.document_ref is null or p.page_sha256<>encode(sha256(convert_to(p.rows_text,'UTF8')),'hex')or p.row_count<>jsonb_array_length(p.rows_text::jsonb)then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
  select coalesce(jsonb_agg(x order by n),'[]')into selected from jsonb_array_elements(p.rows_text::jsonb)with ordinality q(x,n)where n>p_offset-p.row_offset and n<=p_offset-p.row_offset+p_limit;
 end if;
 returned:=jsonb_array_length(selected);is_current:=p_office='SOCIAL'or p_dataset in('ledger-balances','treasury-capacity');coverage_key:=case when p_office='SOCIAL'then'currentPrefixCoverage'else'currentFinancialCoverage'end;
 src:=jsonb_build_object('dataNature',case when p_office='SOCIAL'then'ADMITTED_CURRENT_SOCIAL_MIXED_FINANCIAL_PREFIX'when is_current then'ADMITTED_CURRENT_FINANCIAL_MIXED_POSTING_PREFIX'else'ADMITTED_IMMUTABLE_OPENING_FACTS'end,'sourceVersion',d.source_version,'sourceRevision',b.source_revision,'seedId',b.seed_id,'seedFingerprint',b.seed_fingerprint,'admissionRef',b.admission_ref,'modelVersion',b.model_version,'replayBinding',b.replay_binding,'sourceBundleSha256',b.source_bundle_sha256,'canonicalSeedSha256',b.canonical_seed_sha256,'worldVersion',case when is_current then d.world_version::text else'0'end,'eventSequence',case when is_current then d.event_sequence::text else'0'end,'originWorldVersion',d.origin_world_version::text,'originEventSequence',d.origin_event_sequence::text,'observedHead',jsonb_build_object('worldVersion',d.world_version::text,'eventSequence',d.event_sequence::text),coverage_key,d.coverage,'pageHash',coalesce(p.page_sha256,encode(sha256(convert_to('[]','UTF8')),'hex')),'returnedRowsHash',encode(sha256(convert_to(selected::text,'UTF8')),'hex'),'hashAlgorithm','POSTGRES_JSONB_TEXT_UTF8_SHA256','sourcePointer',d.source_pointer-'currentStateBinding');
 if p_office='SOCIAL'and d.origin_world_version>0 then src:=src||jsonb_build_object('currentStateBinding',d.source_pointer->'currentStateBinding');end if;
 return query select case when returned=0 then'EMPTY'else'PAGE'end,jsonb_build_object('worldId',s.world_id,'countryId',s.country_id,'officeId',s.office_id,'authSubject',s.auth_subject,'teamId',s.team_id,'authorizationVersion',s.authorization_revision,'scopeKey',s.scope_key,'seatRef',s.seat_ref),src,jsonb_build_object('offset',p_offset,'limit',p_limit,'returned',returned,'total',d.total_rows,'nextOffset',case when p_offset+returned<d.total_rows then p_offset+returned else null end),selected::text;
end;$$;
alter function world_v2.read_postwar_mixed_current_page(text,text,text,integer,integer,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.postwar_mixed_current_batch(text,text,text),world_v2.postwar_mixed_fx_group(text,jsonb,jsonb,jsonb,jsonb,jsonb),world_v2.postwar_mixed_current_prefix(text),world_v2.postwar_write_mixed_current_document(text,text,text,text,text,bigint,bigint,jsonb,jsonb,jsonb),world_v2.publish_postwar_mixed_social_current(text,text,text),world_v2.read_postwar_mixed_current_page(text,text,text,integer,integer,text)from public;
grant execute on function world_v2.publish_postwar_mixed_social_current(text,text,text)to world_v2_postwar_projection_publisher;
grant execute on function world_v2.read_postwar_mixed_current_page(text,text,text,integer,integer,text)to world_v2_postwar_projection_reader;
revoke create on schema world_v2 from world_v2_postwar_projection_owner;
commit;
