-- UNREGISTERED SOURCE-ONLY candidate. No LOGIN, credential, membership, production
-- install or economic posting. Requires H0 bounded reads and Social prefix scope
-- infrastructure; does not replace its functions or claim Social-only SQL is mixed-ready.
begin;
grant create on schema world_v2 to world_v2_postwar_projection_owner;
create table world_v2.postwar_financial_current_document(
 document_ref text primary key,world_id text not null,country_id text not null,office_id text not null check(office_id in('FINANCE','CENTRAL_BANK')),dataset text not null,
 world_version bigint not null check(world_version>0),event_sequence bigint not null check(event_sequence>0),
 base_document_ref text not null,seed_fingerprint text not null,admission_ref text not null,source_bundle_sha256 text not null,
 prefix_fingerprint text not null,effects_fingerprint text not null,last_event_id text not null,last_event_fingerprint text not null,
 document_sha256 text not null,source_version text not null unique,total_rows integer not null,page_count integer not null,
 unique(world_id,country_id,office_id,dataset,world_version,event_sequence),
 foreign key(base_document_ref,world_id)references world_v2.postwar_office_projection_document(document_ref,world_id),
 foreign key(world_id,last_event_id)references world_v2.authoritative_event(world_id,event_id)
);
create table world_v2.postwar_financial_current_page(
 document_ref text not null references world_v2.postwar_financial_current_document(document_ref),world_id text not null,page_index integer not null,row_offset integer not null,row_count integer not null check(row_count between 0 and 100),
 rows_text text not null check(octet_length(rows_text)<=48000 and jsonb_typeof(rows_text::jsonb)='array'),page_sha256 text not null check(page_sha256=encode(sha256(convert_to(rows_text,'UTF8')),'hex')),
 primary key(document_ref,page_index),check(jsonb_array_length(rows_text::jsonb)=row_count)
);
do $$declare t text;begin foreach t in array array['postwar_financial_current_document','postwar_financial_current_page']loop
 execute format('alter table world_v2.%I owner to world_v2_postwar_projection_owner',t);
 execute format('alter table world_v2.%I enable row level security',t);execute format('alter table world_v2.%I force row level security',t);
 execute format('revoke all on world_v2.%I from public,world_v2_postwar_projection_reader,world_v2_postwar_projection_publisher',t);
 execute format('create policy %I on world_v2.%I to world_v2_postwar_projection_owner using(current_user=''world_v2_postwar_projection_owner''and world_id=current_setting(''econmind.postwar_projection_world'',true))with check(current_user=''world_v2_postwar_projection_owner''and world_id=current_setting(''econmind.postwar_projection_world'',true))',t||'_owner',t);
 execute format('create policy %I on world_v2.%I as restrictive to world_v2_postwar_projection_owner using(world_id=current_setting(''econmind.postwar_projection_world'',true))',t||'_world',t);
 execute format('create trigger %I before update or delete on world_v2.%I for each row execute function world_v2.reject_authoritative_history_mutation()',t||'_immutable',t);
 execute format('create trigger %I before truncate on world_v2.%I for each statement execute function world_v2.reject_authoritative_history_mutation()',t||'_truncate',t);
end loop;end;$$;
-- Lock actual H/admission/permit before Core replay; no Social-origin assumption.
create function world_v2.lock_postwar_financial_current_publication(p_world text,p_country text)
returns table(world_version text,event_sequence text,seed_fingerprint text,admission_ref text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h record;a record;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')then raise exception 'FINANCIAL_FIXED_OFFLINE_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed'then raise exception 'FINANCIAL_CURRENT_FRESH_READ_COMMITTED_REQUIRED'using errcode='25000';end if;
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select * into strict h from world_v2.world_head x where x.world_id=p_world for share;
 if h.world_version<1 or h.world_version>10000 or h.event_sequence<1 or h.event_sequence>10000 then raise exception 'FINANCIAL_BOUNDED_POSITIVE_HEAD_REQUIRED'using errcode='55000';end if;
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 perform 1 from world_v2.runtime_admission_publication_permit q where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref for share;
 if exists(select 1 from world_v2.runtime_admission_publication_revocation r join world_v2.runtime_admission_publication_permit q using(authorization_id)where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref)then raise exception 'FINANCIAL_CURRENT_ADMISSION_REVOKED'using errcode='55000';end if;
 perform 1 from world_v2.postwar_office_projection_document d where d.world_id=p_world and d.country_id=p_country and d.office_id in('FINANCE','CENTRAL_BANK')and d.admission_ref=a.admission_ref and d.seed_fingerprint=a.seed_fingerprint for share;
 if(select count(*)from world_v2.postwar_office_projection_document d where d.world_id=p_world and d.country_id=p_country and d.office_id in('FINANCE','CENTRAL_BANK')and d.admission_ref=a.admission_ref and d.seed_fingerprint=a.seed_fingerprint and d.source_bundle_sha256=a.source_bundle_sha256 and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.document_ref=d.document_ref))<>7 then raise exception 'FINANCIAL_EXACT_SEVEN_H0_ORIGINAL_DATASETS_REQUIRED'using errcode='55000';end if;
 return query select h.world_version::text,h.event_sequence::text,a.seed_fingerprint,a.admission_ref;
end;$$;
alter function world_v2.lock_postwar_financial_current_publication(text,text)owner to world_v2_postwar_projection_owner;
-- Full canonical frame reconstruction plus independent Budget envelope/line
-- replay and scoped Social effects. Never filters a foreign/unknown event.
create function world_v2.postwar_financial_complete_prefix(p_world text)
returns table(prefix_fingerprint text,effects_fingerprint text,last_event_id text,last_event_fingerprint text,budget_envelopes jsonb)
language plpgsql security definer set search_path=pg_catalog as $$
declare h record;a record;r record;c record;e record;command jsonb;event jsonb;events jsonb;transition jsonb;receipt jsonb;ep jsonb;first_body jsonb;frames jsonb:='[]';meta jsonb:='[]';wv bigint:=0;seq bigint:=0;bytes bigint:=0;seed_fp text;intent jsonb;policy jsonb;binding jsonb;before_state jsonb;after_state jsonb;env jsonb;next_env jsonb;envelopes jsonb:='[]';fund jsonb;event_index integer;expected_type text;expected_count integer;amount numeric;line_total numeric;
begin
 perform set_config('econmind.postwar_projection_world',p_world,true);
 perform world_v2.prepare_postwar_social_prefix_scopes(p_world);
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 select * into strict h from world_v2.world_head x where x.world_id=p_world;
 if h.world_version<1 or h.world_version>10000 or h.event_sequence>10000 then raise exception 'FINANCIAL_PREFIX_CAPACITY_EXCEEDED'using errcode='54000';end if;
 if(select count(*)from world_v2.command_receipt x where x.world_id=p_world and x.outcome='COMMITTED')<>h.world_version or(select count(*)from world_v2.authoritative_event x where x.world_id=p_world)<>h.event_sequence or exists(select 1 from world_v2.financial_posting_batch x where x.world_id=p_world)or exists(select 1 from world_v2.inventory_posting x where x.world_id=p_world)then raise exception 'FINANCIAL_PREFIX_INCOMPLETE_OR_POSTING_DOMAIN_UNAVAILABLE'using errcode='55000';end if;
 for r in select * from world_v2.command_receipt x where x.world_id=p_world and x.outcome='COMMITTED'order by x.world_version_after loop
  select * into strict c from world_v2.command_submission x where x.world_id=p_world and x.command_id=r.command_id;
  if r.world_version_before<>wv or r.world_version_after<>wv+1 or c.expected_world_version is distinct from wv or r.transition_id<>c.command_id or r.command_fingerprint<>c.command_fingerprint or r.sim_time<>c.sim_time or r.idempotency_key is distinct from c.idempotency_key then raise exception 'FINANCIAL_PREFIX_RECEIPT_GAP'using errcode='55000';end if;
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
  elsif c.command_type not in('CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1','CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1','CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1')then raise exception 'FINANCIAL_UNKNOWN_DOMAIN_UNAVAILABLE'using errcode='55000';end if;
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
   elsif ep->'command'is distinct from(command-'canonicalPayload'-'fingerprint'-'payloadHash')||jsonb_build_object('payload',intent)or not world_v2.postwar_social_prefix_effect_scoped(p_world,c.country_id,e.event_type,command,ep,e.event_sequence)then raise exception 'FINANCIAL_SOCIAL_SCOPE_EFFECT_INVALID'using errcode='23514';end if;
   events:=events||jsonb_build_array(event);last_event_id:=e.event_id;last_event_fingerprint:=e.event_fingerprint;event_index:=event_index+1;
  end loop;
  if event_index<>expected_count then raise exception 'FINANCIAL_EVENT_ROWS_INCOMPLETE'using errcode='55000';end if;
  transition:=jsonb_build_object('schemaVersion','authoritative-transition-v1','transitionId',c.command_id,'worldId',p_world,'commandId',c.command_id,'commandFingerprint',c.command_fingerprint,'worldVersionBefore',r.world_version_before::text,'worldVersionAfter',r.world_version_after::text,'eventIds',r.event_ids,'events',events);
  receipt:=jsonb_build_object('schemaVersion',r.schema_version,'worldId',p_world,'commandId',r.command_id,'idempotencyKey',r.idempotency_key,'commandFingerprint',r.command_fingerprint,'outcome',r.outcome,'reasonCode',r.reason_code,'transitionId',r.transition_id,'worldVersionBefore',r.world_version_before::text,'worldVersionAfter',r.world_version_after::text,'simTime',r.sim_time::text,'eventIds',r.event_ids,'recordedAtReal',to_char(r.recorded_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  frames:=frames||jsonb_build_array(jsonb_build_object('command',command,'transition',transition,'financialPostingBatches','[]'::jsonb,'inventoryPostings','[]'::jsonb,'receipt',receipt,'events',events));
  meta:=meta||jsonb_build_array(jsonb_build_object('commandId',c.command_id,'countryId',c.country_id,'commandType',c.command_type,'transitionFingerprint','sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(transition),'UTF8')),'hex'),'receiptFingerprint','sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(receipt),'UTF8')),'hex'),'eventFingerprints',(select jsonb_agg(x->'fingerprint'order by n)from jsonb_array_elements(events)with ordinality q(x,n)),'worldVersionBefore',r.world_version_before::text,'worldVersionAfter',r.world_version_after::text,'events',(select jsonb_agg(jsonb_build_object('eventId',x->>'eventId','fingerprint',x->>'fingerprint','sequence',x->>'sequence','worldVersion',x->>'worldVersion')order by n)from jsonb_array_elements(events)with ordinality q(x,n))));
  wv:=r.world_version_after;seq:=seq+expected_count;
 end loop;
 if wv<>h.world_version or seq<>h.event_sequence then raise exception 'FINANCIAL_PREFIX_HEAD_INCOMPLETE'using errcode='55000';end if;
 select x.seed_fingerprint into strict seed_fp from world_v2.postwar_projection_admission_header(p_world)x;
 prefix_fingerprint:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(jsonb_build_object('worldId',p_world,'seedFingerprint',seed_fp,'headWorldVersion',wv::text,'headEventSequence',seq::text,'frames',frames)),'UTF8')),'hex');
 effects_fingerprint:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(meta),'UTF8')),'hex');budget_envelopes:=envelopes;return next;
end;$$;
alter function world_v2.postwar_financial_complete_prefix(text)owner to world_v2_postwar_projection_owner;
-- Derive immutable ledger positions from actual H0 legs, not source labels or
-- current paid/quote claims. Only the offline definer can aggregate these rows.
create function world_v2.postwar_financial_h0_ledger_rows(p_world text,p_country text,p_office text)
returns jsonb language sql security definer set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(jsonb_build_object('account',account,'netDebitBalance',jsonb_build_object('amount',trim_scale(amount)::text,'currency',account->>'currency'))order by account->>'accountId'),'[]'::jsonb)
 from(select row->'leg'->'account'as account,sum((case when row->'leg'->>'direction'='DEBIT'then 1 else -1 end)*(row->'leg'->'amount'->>'amount')::numeric)as amount
 from world_v2.postwar_office_projection_document d join world_v2.postwar_office_projection_page p using(document_ref,world_id)cross join lateral jsonb_array_elements(p.rows_text::jsonb)row
 where d.world_id=p_world and d.country_id=p_country and d.office_id=p_office and d.dataset='opening-financial-legs'group by row->'leg'->'account')q
$$;
alter function world_v2.postwar_financial_h0_ledger_rows(text,text,text)owner to world_v2_postwar_projection_owner;
create function world_v2.postwar_financial_capacity_rows(p_world text,p_country text,p_envelopes jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare fund jsonb;ledger jsonb;position jsonb;mirror jsonb;balance numeric;opening numeric;budget numeric;payroll numeric;total numeric;begin
 select x into strict fund from world_v2.postwar_social_prefix_scope s cross join lateral jsonb_array_elements(s.scope_document::jsonb->'funding')x where s.world_id=p_world and s.country_id=p_country and x->>'payerRole'='GOV';
 if fund->>'reservedAmount'is null or fund->>'availableAmount'is null or fund->>'claimId'is null then raise exception 'FINANCIAL_EXACT_OPENING_FUNDING_REQUIRED'using errcode='23514';end if;
 ledger:=world_v2.postwar_financial_h0_ledger_rows(p_world,p_country,'FINANCE');
 select x into strict position from jsonb_array_elements(ledger)x where x->'account'->>'accountId'=fund->>'accountRef';
 select x into strict mirror from jsonb_array_elements(world_v2.postwar_financial_h0_ledger_rows(p_world,p_country,'CENTRAL_BANK'))x where x->'account'->>'claimId'=fund->>'claimId'and x->'account'->>'ownerId'=fund->>'issuerEntityId'and x->'account'->>'counterpartyEntityId'=fund->>'payerEntityId'and x->'account'->>'accountClass'='LIABILITY';
 balance:=(position->'netDebitBalance'->>'amount')::numeric;opening:=(fund->>'reservedAmount')::numeric;
 if position->'account'->>'accountClass'<>'ASSET'or position->'account'->>'claimId'<>fund->>'claimId'or position->'account'->>'ownerId'<>fund->>'payerEntityId'or position->'account'->>'currency'<>fund->>'currency'or position->'account'->>'counterpartyEntityId'<>fund->>'issuerEntityId'or balance<>(fund->>'availableAmount')::numeric or balance<>-(mirror->'netDebitBalance'->>'amount')::numeric then raise exception 'FINANCIAL_ACTUAL_RECIPROCAL_TREASURY_CLAIM_REQUIRED'using errcode='23514';end if;
 select coalesce(sum((x->>'cap')::numeric),0)into budget from jsonb_array_elements(p_envelopes)x where x->'scope'->>'countryId'=p_country;
 select coalesce(sum(((e.canonical_payload::jsonb)->'reservation'->>'amount')::numeric),0)into payroll from world_v2.authoritative_event e join world_v2.command_submission c on c.world_id=e.world_id and c.command_id=e.causation_command_id where e.world_id=p_world and c.country_id=p_country and e.event_type='SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1'and(e.canonical_payload::jsonb)->'reservation'->>'accountId'=fund->>'accountRef';
 total:=opening+budget+payroll;if least(balance,opening,budget,payroll)<0 or total>balance then raise exception 'FINANCIAL_CAPACITY_OVERBOOKED'using errcode='23514';end if;
 return jsonb_build_array(jsonb_build_object('schemaVersion','postwar-treasury-capacity-row-v1','countryId',p_country,'accountId',fund->>'accountRef','claimId',fund->>'claimId','currency',fund->>'currency','treasuryLedgerClaimBalance',trim_scale(balance)::text,'openingReservedCapacity',trim_scale(opening)::text,'budgetEnvelopeCapacity',trim_scale(budget)::text,'additionalPayrollReservedCapacity',trim_scale(payroll)::text,'totalReservedCapacity',trim_scale(total)::text,'availableCapacity',trim_scale(balance-total)::text,'reservationNature','CAPACITY_RESERVED_NOT_PAID_OR_ACCRUED','balanceNature','RECIPROCAL_LEDGER_CLAIM_NOT_CASH_WALLET'));
end;$$;
alter function world_v2.postwar_financial_capacity_rows(text,text,jsonb)owner to world_v2_postwar_projection_owner;
create function world_v2.publish_postwar_financial_current_projection(p_world text,p_country text,p_expected_prefix text,p_expected_effects text,p_expected_current_rows_hash text)
returns setof world_v2.postwar_financial_current_document language plpgsql security definer set search_path=pg_catalog as $$
declare h record;a record;prefix record;base world_v2.postwar_office_projection_document%rowtype;prior world_v2.postwar_financial_current_document%rowtype;office_name text;dataset_name text;items jsonb;item jsonb;buffer jsonb;hash text;ref text;version text;idx integer;off integer;pages integer;current_rows jsonb;
begin
 select * into strict h from world_v2.lock_postwar_financial_current_publication(p_world,p_country);
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 select * into strict prefix from world_v2.postwar_financial_complete_prefix(p_world);
 if prefix.prefix_fingerprint is distinct from p_expected_prefix or prefix.effects_fingerprint is distinct from p_expected_effects then raise exception 'FINANCIAL_PREFIX_DIFFERS_FROM_FULL_CORE_REPLAY'using errcode='23514';end if;
 current_rows:=jsonb_build_object('FINANCE',jsonb_build_object('ledger-balances',world_v2.postwar_financial_h0_ledger_rows(p_world,p_country,'FINANCE'),'treasury-capacity',world_v2.postwar_financial_capacity_rows(p_world,p_country,prefix.budget_envelopes)),'CENTRAL_BANK',jsonb_build_object('ledger-balances',world_v2.postwar_financial_h0_ledger_rows(p_world,p_country,'CENTRAL_BANK')));
 if p_expected_current_rows_hash is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(current_rows),'UTF8')),'hex')then raise exception 'FINANCIAL_ROWS_DIFFER_FROM_ACTUAL_CORE_LEDGER_CAPACITY'using errcode='23514';end if;
 foreach office_name in array array['FINANCE','CENTRAL_BANK']loop
  for dataset_name in select unnest(case when office_name='FINANCE'then array['currency-fx','opening-financial-legs','ledger-balances','treasury-capacity']else array['currency-fx','cb-categories','cb-holdings','bank-loans','opening-financial-legs','ledger-balances']end)loop
   select * into strict base from world_v2.postwar_office_projection_document d where d.world_id=p_world and d.country_id=p_country and d.office_id=office_name and d.dataset=case when dataset_name in('ledger-balances','treasury-capacity')then'opening-financial-legs'else dataset_name end;
   if exists(select 1 from world_v2.postwar_office_projection_revocation r where r.document_ref=base.document_ref)or base.admission_ref<>a.admission_ref or base.seed_fingerprint<>a.seed_fingerprint or base.source_bundle_sha256<>a.source_bundle_sha256 then raise exception 'FINANCIAL_H0_ORIGINAL_REVOKED_OR_CHANGED'using errcode='55000';end if;
   if dataset_name in('ledger-balances','treasury-capacity')then items:=current_rows->office_name->dataset_name;else select coalesce(jsonb_agg(x order by p.page_index,n),'[]')into items from world_v2.postwar_office_projection_page p cross join lateral jsonb_array_elements(p.rows_text::jsonb)with ordinality q(x,n)where p.document_ref=base.document_ref;end if;
   hash:=encode(sha256(convert_to(items::text,'UTF8')),'hex');ref:='FINANCIAL_CURRENT_'||upper(encode(sha256(convert_to(world_v2.canonical_json(jsonb_build_array(base.document_ref,h.world_version,h.event_sequence,prefix.prefix_fingerprint,prefix.effects_fingerprint,dataset_name,hash)),'UTF8')),'hex'));version:='sha256:'||encode(sha256(convert_to(ref||hash,'UTF8')),'hex');
   select * into prior from world_v2.postwar_financial_current_document d where d.world_id=p_world and d.country_id=p_country and d.office_id=office_name and d.dataset=dataset_name and d.world_version=h.world_version::bigint and d.event_sequence=h.event_sequence::bigint;
   if found then if prior.document_ref<>ref then raise exception 'FINANCIAL_CURRENT_IMMUTABLE_CONFLICT'using errcode='23514';end if;return next prior;continue;end if;
   pages:=1;buffer:='[]';for item in select value from jsonb_array_elements(items)loop
    if octet_length(jsonb_build_array(item)::text)>48000 then raise exception 'FINANCIAL_CURRENT_ROW_TOO_LARGE'using errcode='54000';end if;
    if jsonb_array_length(buffer)>=100 or octet_length((buffer||jsonb_build_array(item))::text)>48000 then pages:=pages+1;buffer:='[]';end if;buffer:=buffer||jsonb_build_array(item);
   end loop;
   insert into world_v2.postwar_financial_current_document values(ref,p_world,p_country,office_name,dataset_name,h.world_version::bigint,h.event_sequence::bigint,base.document_ref,a.seed_fingerprint,a.admission_ref,a.source_bundle_sha256,prefix.prefix_fingerprint,prefix.effects_fingerprint,prefix.last_event_id,prefix.last_event_fingerprint,hash,version,jsonb_array_length(items),pages);
   idx:=0;off:=0;buffer:='[]';for item in select value from jsonb_array_elements(items)loop
    if jsonb_array_length(buffer)>=100 or octet_length((buffer||jsonb_build_array(item))::text)>48000 then insert into world_v2.postwar_financial_current_page values(ref,p_world,idx,off,jsonb_array_length(buffer),buffer::text,encode(sha256(convert_to(buffer::text,'UTF8')),'hex'));off:=off+jsonb_array_length(buffer);idx:=idx+1;buffer:='[]';end if;buffer:=buffer||jsonb_build_array(item);
   end loop;
   insert into world_v2.postwar_financial_current_page values(ref,p_world,idx,off,jsonb_array_length(buffer),buffer::text,encode(sha256(convert_to(buffer::text,'UTF8')),'hex'));
   select * into strict prior from world_v2.postwar_financial_current_document where document_ref=ref;return next prior;
  end loop;
 end loop;
end;$$;
alter function world_v2.publish_postwar_financial_current_projection(text,text,text,text,text)owner to world_v2_postwar_projection_owner;
create function world_v2.read_postwar_financial_current_page(p_world text,p_office text,p_dataset text,p_offset integer,p_limit integer,p_expected_version text default null)
returns table(status text,scope_json jsonb,source_json jsonb,page_json jsonb,rows_text text)
language plpgsql security definer set search_path=pg_catalog as $$
declare s record;d world_v2.postwar_financial_current_document%rowtype;b world_v2.postwar_office_projection_document%rowtype;p world_v2.postwar_financial_current_page%rowtype;selected jsonb;returned integer;is_current boolean;begin
 if p_offset is null or p_limit is null or p_offset<0 or p_offset>100000 or p_limit<1 or p_limit>100 or p_office not in('FINANCE','CENTRAL_BANK')or p_dataset is null or p_dataset<>all(case when p_office='FINANCE'then array['currency-fx','opening-financial-legs','ledger-balances','treasury-capacity']else array['currency-fx','cb-categories','cb-holdings','bank-loans','opening-financial-legs','ledger-balances']end)or(p_offset>0 and p_expected_version is null)or(p_expected_version is not null and p_expected_version!~'^sha256:[a-f0-9]{64}$')then raise exception 'FINANCIAL_CURRENT_INVALID_PAGE'using errcode='22023';end if;
 select * into s from world_v2.read_postwar_office_projection_seats(p_world)x where x.office_id=p_office;
 if not found then return query select'DENIED',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into d from world_v2.postwar_financial_current_document x where x.world_id=p_world and x.country_id=s.country_id and x.office_id=p_office and x.dataset=p_dataset and x.world_version=s.world_version::bigint and x.event_sequence=s.event_sequence::bigint and x.admission_ref=s.admission_ref and x.seed_fingerprint=s.seed_fingerprint and x.source_bundle_sha256=s.source_bundle_sha256;
 if not found then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 if p_expected_version is not null and p_expected_version<>d.source_version then return query select'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into b from world_v2.postwar_office_projection_document x where x.document_ref=d.base_document_ref;
 if not found or exists(select 1 from world_v2.postwar_office_projection_revocation r where r.document_ref=b.document_ref)or exists(select 1 from world_v2.financial_posting_batch f where f.world_id=p_world)or exists(select 1 from world_v2.inventory_posting f where f.world_id=p_world)then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into p from world_v2.postwar_financial_current_page x where x.document_ref=d.document_ref and x.row_offset<=p_offset and(p_offset<x.row_offset+x.row_count or d.total_rows=0)order by x.page_index desc limit 1;
 if p_offset>=d.total_rows then selected:='[]';else if p.document_ref is null then raise exception 'FINANCIAL_CURRENT_PAGE_MISSING'using errcode='23514';end if;select coalesce(jsonb_agg(x order by n),'[]')into selected from jsonb_array_elements(p.rows_text::jsonb)with ordinality q(x,n)where n>p_offset-p.row_offset and n<=p_offset-p.row_offset+p_limit;end if;returned:=jsonb_array_length(selected);is_current:=p_dataset in('ledger-balances','treasury-capacity');
 return query select case when returned=0 then'EMPTY'else'PAGE'end,
 jsonb_build_object('worldId',s.world_id,'countryId',s.country_id,'officeId',s.office_id,'authSubject',s.auth_subject,'teamId',s.team_id,'authorizationVersion',s.authorization_revision,'scopeKey',s.scope_key,'seatRef',s.seat_ref),
 jsonb_build_object('dataNature',case when is_current then'ADMITTED_CURRENT_FINANCIAL_NO_POSTING_PREFIX'else'ADMITTED_IMMUTABLE_OPENING_FACTS'end,'sourceVersion',d.source_version,'sourceRevision',b.source_revision,'seedId',b.seed_id,'seedFingerprint',b.seed_fingerprint,'admissionRef',b.admission_ref,'modelVersion',b.model_version,'replayBinding',b.replay_binding,'sourceBundleSha256',b.source_bundle_sha256,'canonicalSeedSha256',b.canonical_seed_sha256,'originWorldVersion','0','originEventSequence','0','worldVersion',case when is_current then d.world_version::text else'0'end,'eventSequence',case when is_current then d.event_sequence::text else'0'end,'observedHead',jsonb_build_object('worldVersion',d.world_version::text,'eventSequence',d.event_sequence::text),'currentFinancialCoverage',jsonb_build_object('schemaVersion','postwar-financial-current-prefix-coverage-v1','reducerVersion','POSTWAR_FINANCIAL_COMPLETE_NO_POSTING_PREFIX_V1','coverageRef',d.document_ref,'prefixFingerprint',d.prefix_fingerprint,'knownEffectsFingerprint',d.effects_fingerprint,'globalWorldVersion',d.world_version::text,'globalEventSequence',d.event_sequence::text,'coveredThroughEventId',d.last_event_id,'coveredThroughEventFingerprint',d.last_event_fingerprint,'noFinancialPostings',true,'noInventoryPostings',true),'pageHash',coalesce(p.page_sha256,encode(sha256(convert_to('[]','UTF8')),'hex')),'returnedRowsHash',encode(sha256(convert_to(selected::text,'UTF8')),'hex'),'hashAlgorithm','POSTGRES_JSONB_TEXT_UTF8_SHA256','sourcePointer',jsonb_build_object('original',b.source_pointer,'currentDerivation',case when is_current then'COMPLETE_CORE_AND_FIXED_SQL_NO_POSTING_PREFIX'else'HISTORICAL_ORIGINAL_AT_ORIGIN_ZERO'end)),
 jsonb_build_object('offset',p_offset,'limit',p_limit,'returned',returned,'total',d.total_rows,'nextOffset',case when p_offset+returned<d.total_rows then p_offset+returned else null end),selected::text;
end;$$;
alter function world_v2.read_postwar_financial_current_page(text,text,text,integer,integer,text)owner to world_v2_postwar_projection_owner;
-- BEGIN BOUNDED_FINANCIAL_PUBLICATION_ORIGINALS_V1
-- DATA ONLY over already sealed originals. This is neither source admission,
-- an actor/current-authority token nor proof that the current prefix is supported.
-- The existing publication function independently replays/checks its full prefix.
create function world_v2.read_postwar_financial_current_publication_originals(p_world text,p_country text)
returns table(originals_text text,originals_sha256 text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h record;a record;s world_v2.postwar_social_prefix_scope%rowtype;d world_v2.postwar_office_projection_document%rowtype;
 scope_body jsonb;documents jsonb:='[]';funds jsonb;ledger_finance jsonb;ledger_bank jsonb;items jsonb;payload text;
 expected_canonical_sha text;page_count_actual bigint;row_count_actual bigint;source_bytes bigint;total_source_bytes bigint:=0;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')
 or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')
 or pg_has_role(effective,'world_v2_postwar_projection_reader','MEMBER')then raise exception 'FINANCIAL_FIXED_SEPARATE_OFFLINE_PUBLISHER_REQUIRED'using errcode='42501';end if;
 -- Fresh READ COMMITTED, actual H SHARE, admission/permit SHARE, then exact
 -- unrevoked same-country seven H0 document locks: the existing lock order.
 select * into strict h from world_v2.lock_postwar_financial_current_publication(p_world,p_country);
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 -- No preparation fallback: absent sealed scope stays unavailable. This query
 -- only uses seed/admission metadata through the existing header, never the
 -- raw seed payload or source preparation, and cannot hydrate a seed.
 select * into strict s from world_v2.postwar_social_prefix_scope x where x.world_id=p_world and x.country_id=p_country for share;
 if s.seed_fingerprint is distinct from a.seed_fingerprint or s.admission_ref is distinct from a.admission_ref
 or s.source_bundle_sha256 is distinct from a.source_bundle_sha256
 or s.scope_sha256 is distinct from encode(sha256(convert_to(s.scope_document,'UTF8')),'hex')then raise exception 'FINANCIAL_SEALED_SCOPE_LINEAGE_REQUIRED'using errcode='23514';end if;
 scope_body:=s.scope_document::jsonb;
 if scope_body->>'countryId'is distinct from p_country or jsonb_typeof(scope_body->'funding')is distinct from 'array'then raise exception 'FINANCIAL_SEALED_COUNTRY_FUNDING_REQUIRED'using errcode='23514';end if;
 select coalesce(jsonb_agg(x order by x->>'accountRef'),'[]'::jsonb)into funds from jsonb_array_elements(scope_body->'funding')x where x->>'payerRole'='GOV';
 if jsonb_array_length(funds)<>1 or exists(select 1 from jsonb_array_elements(funds)x where x->>'countryId'is distinct from p_country)then raise exception 'FINANCIAL_EXACT_SEALED_GOV_ACCOUNT_REQUIRED'using errcode='23514';end if;
 for d in select * from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_country and x.office_id in('FINANCE','CENTRAL_BANK')order by x.office_id,x.dataset loop
  if d.seed_fingerprint is distinct from a.seed_fingerprint or d.admission_ref is distinct from a.admission_ref or d.seed_id is distinct from a.seed_id
  or d.source_bundle_sha256 is distinct from a.source_bundle_sha256 or d.canonical_seed_sha256 is distinct from s.canonical_seed_sha256
  or d.source_id is distinct from s.source_id or d.source_payload_hash is distinct from s.source_payload_hash
  or d.world_version<>0 or d.event_sequence<>0 or d.projection_version<>'postwar-office-projection.v1'
  or(d.office_id='FINANCE'and d.dataset not in('currency-fx','opening-financial-legs'))
  or(d.office_id='CENTRAL_BANK'and d.dataset not in('currency-fx','cb-categories','cb-holdings','bank-loans','opening-financial-legs'))
  or exists(select 1 from world_v2.postwar_office_projection_revocation r where r.world_id=p_world and r.document_ref=d.document_ref)then raise exception 'FINANCIAL_SEALED_ORIGINAL_LINEAGE_OR_REVOCATION_INVALID'using errcode='23514';end if;
  select count(*),coalesce(sum(p.row_count),0),coalesce(sum(octet_length(p.rows_text)),0)into page_count_actual,row_count_actual,source_bytes from world_v2.postwar_office_projection_page p where p.document_ref=d.document_ref and p.world_id=p_world;
  total_source_bytes:=total_source_bytes+source_bytes;
  if d.page_count<>page_count_actual or d.total_rows<>row_count_actual or page_count_actual>64 or total_source_bytes>1048576 then raise exception 'FINANCIAL_SEALED_ORIGINAL_BOUNDED_PAGES_REQUIRED'using errcode='54000';end if;
  if exists(select 1 from(
   select p.*,row_number()over(order by p.page_index)-1 as expected_index,
    coalesce(sum(p.row_count)over(order by p.page_index rows between unbounded preceding and 1 preceding),0)as expected_offset
   from world_v2.postwar_office_projection_page p where p.document_ref=d.document_ref and p.world_id=p_world
  )p where p.page_index<>p.expected_index or p.row_offset<>p.expected_offset or p.row_count<>jsonb_array_length(p.rows_text::jsonb)
    or p.page_sha256 is distinct from encode(sha256(convert_to(p.rows_text,'UTF8')),'hex'))then raise exception 'FINANCIAL_SEALED_PAGE_HASH_OR_SEQUENCE_INVALID'using errcode='23514';end if;
  select coalesce(jsonb_agg(x order by p.page_index,n),'[]'::jsonb)into items from world_v2.postwar_office_projection_page p cross join lateral jsonb_array_elements(p.rows_text::jsonb)with ordinality q(x,n)where p.document_ref=d.document_ref and p.world_id=p_world;
  if d.document_sha256 is distinct from encode(sha256(convert_to(items::text,'UTF8')),'hex')then raise exception 'FINANCIAL_SEALED_DOCUMENT_HASH_INVALID'using errcode='23514';end if;
  documents:=documents||jsonb_build_array(jsonb_build_object('officeId',d.office_id,'dataset',d.dataset,'documentRef',d.document_ref,'documentSha256',d.document_sha256,'sourceVersion',d.source_version,'sourceId',d.source_id,'sourcePayloadHash',d.source_payload_hash));
  expected_canonical_sha:=d.canonical_seed_sha256;
 end loop;
 if jsonb_array_length(documents)<>7 then raise exception 'FINANCIAL_EXACT_SEVEN_SEALED_ORIGINALS_REQUIRED'using errcode='23514';end if;
 ledger_finance:=world_v2.postwar_financial_h0_ledger_rows(p_world,p_country,'FINANCE');
 ledger_bank:=world_v2.postwar_financial_h0_ledger_rows(p_world,p_country,'CENTRAL_BANK');
 payload:=jsonb_build_object('schemaVersion','postwar-financial-current-publication-originals-v1','dataNature','IMMUTABLE_ADMITTED_H0_FINANCIAL_DATA_ONLY','worldId',p_world,'countryId',p_country,
  'head',jsonb_build_object('worldVersion',h.world_version,'eventSequence',h.event_sequence),
  'seedId',a.seed_id,'seedFingerprint',a.seed_fingerprint,'admissionRef',a.admission_ref,
  'canonicalSeedSha256',expected_canonical_sha,'sourceBundleSha256',a.source_bundle_sha256,
  'financeLedgerRows',ledger_finance,'centralBankLedgerRows',ledger_bank,'fundingAccounts',funds,'originalDocuments',documents)::text;
 if octet_length(payload)>65536 then raise exception 'FINANCIAL_PUBLICATION_ORIGINALS_64K_BOUND'using errcode='54000';end if;
 return query select payload,encode(sha256(convert_to(payload,'UTF8')),'hex');
end;$$;
alter function world_v2.read_postwar_financial_current_publication_originals(text,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.read_postwar_financial_current_publication_originals(text,text)from public;
grant execute on function world_v2.read_postwar_financial_current_publication_originals(text,text)to world_v2_postwar_projection_publisher;
-- END BOUNDED_FINANCIAL_PUBLICATION_ORIGINALS_V1
revoke all on function world_v2.lock_postwar_financial_current_publication(text,text),world_v2.postwar_financial_complete_prefix(text),world_v2.postwar_financial_h0_ledger_rows(text,text,text),world_v2.postwar_financial_capacity_rows(text,text,jsonb),world_v2.publish_postwar_financial_current_projection(text,text,text,text,text),world_v2.read_postwar_financial_current_page(text,text,text,integer,integer,text)from public;
grant execute on function world_v2.lock_postwar_financial_current_publication(text,text),world_v2.publish_postwar_financial_current_projection(text,text,text,text,text)to world_v2_postwar_projection_publisher;
grant execute on function world_v2.read_postwar_financial_current_page(text,text,text,integer,integer,text)to world_v2_postwar_projection_reader;
revoke create on schema world_v2 from world_v2_postwar_projection_owner;
commit;
