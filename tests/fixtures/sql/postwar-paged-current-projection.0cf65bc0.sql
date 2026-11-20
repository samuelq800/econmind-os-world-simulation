-- SOURCE-ONLY optional versioned page-chain current projections. Existing
-- monolithic proofs and immutable documents remain intact. Requires the bounded
-- prefix pages and reviewed complete Goods/OMO/Rent/Captain fixed effects.
-- New tables contain derived read caches only, never ledger/source authority.
begin;
grant create on schema world_v2 to world_v2_postwar_projection_owner,world_v2_day_one_fx_history_owner;
create table world_v2.postwar_paged_current_document(
 document_ref text primary key,world_id text not null,country_id text not null,office_id text not null check(office_id in('FINANCE','CENTRAL_BANK','SOCIAL','CAPTAIN')),dataset text not null,
 base_document_ref text,world_version bigint not null check(world_version>0),event_sequence bigint not null check(event_sequence>0),origin_world_version bigint not null check(origin_world_version>=0),origin_event_sequence bigint not null check(origin_event_sequence>=0),
 source_version text not null unique,source_revision text not null,admission_ref text not null,seed_id text not null,seed_fingerprint text not null,canonical_seed_sha256 text not null,source_bundle_sha256 text not null,
 model_version text not null,replay_binding text not null,document_sha256 text not null,coverage jsonb not null,source_pointer jsonb not null,total_rows integer not null check(total_rows>=0),page_count integer not null check(page_count>0),
 foreign key(base_document_ref,world_id)references world_v2.postwar_office_projection_document(document_ref,world_id),
 unique(document_ref,world_id),unique(world_id,country_id,office_id,dataset,world_version,event_sequence),
 check((office_id='CAPTAIN')=(base_document_ref is null))
);
create table world_v2.postwar_paged_current_page(
 document_ref text not null,world_id text not null,page_index integer not null,row_offset integer not null,row_count integer not null check(row_count between 0 and 100),
 rows_text text not null check(octet_length(rows_text)<=48000 and jsonb_typeof(rows_text::jsonb)='array'),page_sha256 text not null check(page_sha256=encode(sha256(convert_to(rows_text,'UTF8')),'hex')),
 primary key(document_ref,page_index),foreign key(document_ref,world_id)references world_v2.postwar_paged_current_document(document_ref,world_id),check(jsonb_array_length(rows_text::jsonb)=row_count)
);
create table world_v2.postwar_paged_current_revocation(
 world_id text not null,document_ref text primary key,reason_ref text not null check(length(reason_ref)between 1 and 256),revoked_at timestamptz not null default clock_timestamp(),
 foreign key(document_ref,world_id)references world_v2.postwar_paged_current_document(document_ref,world_id)
);
do $$declare t text;begin foreach t in array array['postwar_paged_current_document','postwar_paged_current_page','postwar_paged_current_revocation']loop
 execute format('alter table world_v2.%I owner to world_v2_postwar_projection_owner',t);
 execute format('alter table world_v2.%I enable row level security',t);execute format('alter table world_v2.%I force row level security',t);
 execute format('revoke all on world_v2.%I from public,world_v2_postwar_projection_reader,world_v2_postwar_projection_publisher',t);
 execute format('create policy paged_current_owner on world_v2.%I to world_v2_postwar_projection_owner using(current_user=''world_v2_postwar_projection_owner''and world_id=current_setting(''econmind.postwar_projection_world'',true))with check(current_user=''world_v2_postwar_projection_owner''and world_id=current_setting(''econmind.postwar_projection_world'',true))',t);
 execute format('create policy paged_current_world on world_v2.%I as restrictive to world_v2_postwar_projection_owner using(world_id=current_setting(''econmind.postwar_projection_world'',true))',t);
 execute format('create trigger paged_current_immutable before update or delete on world_v2.%I for each row execute function world_v2.reject_authoritative_history_mutation()',t);
 execute format('create trigger paged_current_no_truncate before truncate on world_v2.%I for each statement execute function world_v2.reject_authoritative_history_mutation()',t);
end loop;end;$$;

create function world_v2.read_postwar_bounded_publication_prefix_page(p_world text,p_country text,p_after_world_version bigint,p_after_event_sequence bigint,p_head_world_version bigint,p_head_event_sequence bigint,p_seed text,p_admission text)
returns table(world_id text,host_country_id text,office_id text,world_version text,event_sequence text,seed_id text,seed_fingerprint text,admission_ref text,host_source_ref text,transaction_id text,backend_pid text,from_world_version text,from_event_sequence text,through_world_version text,through_event_sequence text,has_more boolean,frame_count text,event_count text,financial_batch_count text,inventory_posting_count text,total_frame_count text,total_event_count text,total_financial_batch_count text,total_inventory_posting_count text,frames_text text,frames_sha256 text,frame_bytes text)
language sql security definer set search_path=pg_catalog as $$
 select * from world_v2.read_postwar_bounded_prefix_page(p_world,p_country,'PUBLICATION',p_after_world_version,p_after_event_sequence,p_head_world_version,p_head_event_sequence,p_seed,p_admission)
$$;
alter function world_v2.read_postwar_bounded_publication_prefix_page(text,text,bigint,bigint,bigint,bigint,text,text)owner to world_v2_day_one_fx_history_owner;
revoke all on function world_v2.read_postwar_bounded_publication_prefix_page(text,text,bigint,bigint,bigint,bigint,text,text)from public;
grant execute on function world_v2.read_postwar_bounded_publication_prefix_page(text,text,bigint,bigint,bigint,bigint,text,text)to world_v2_postwar_projection_owner;

create function world_v2.lock_postwar_paged_current_publication(p_world text,p_country text)
returns table(world_version text,event_sequence text,seed_fingerprint text,admission_ref text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h record;a record;begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_reader','MEMBER')then raise exception 'PAGED_SEPARATE_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 if current_setting('transaction_isolation')not in('repeatable read','serializable')then raise exception 'PAGED_HELD_REPEATABLE_PUBLICATION_REQUIRED'using errcode='25001';end if;
 if p_world is null or p_world!~'^[A-Z][A-Z0-9]*([_-][A-Z0-9]+)*$'or p_country is null or p_country!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'then raise exception 'PAGED_EXACT_PUBLICATION_SCOPE_REQUIRED'using errcode='22023';end if;
 perform world_v2.lock_postwar_source_revocation_fences(p_world);
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select wh.world_version,wh.event_sequence into strict h from world_v2.world_head wh where wh.world_id=p_world for share;
 if h.world_version<1 or h.event_sequence<h.world_version then raise exception 'PAGED_POSITIVE_ACTUAL_HEAD_REQUIRED'using errcode='55000';end if;
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 perform 1 from world_v2.runtime_admission_publication_permit q where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref for share;
 if exists(select 1 from world_v2.runtime_admission_publication_revocation rv join world_v2.runtime_admission_publication_permit q using(authorization_id)where 'ADMISSION_'||upper(q.authorization_sha256)=a.admission_ref)then raise exception 'PAGED_CURRENT_ADMISSION_REVOKED'using errcode='55000';end if;
 perform 1 from world_v2.postwar_office_projection_document d where d.world_id=p_world and d.country_id=p_country and d.office_id='SOCIAL'and d.dataset in('positions','service-pools')and d.admission_ref=a.admission_ref and d.seed_fingerprint=a.seed_fingerprint and d.source_bundle_sha256=a.source_bundle_sha256 for share;
 if(select count(*)from world_v2.postwar_office_projection_document d where d.world_id=p_world and d.country_id=p_country and d.office_id='SOCIAL'and d.dataset in('positions','service-pools')and d.admission_ref=a.admission_ref and d.seed_fingerprint=a.seed_fingerprint and d.source_bundle_sha256=a.source_bundle_sha256 and not exists(select 1 from world_v2.postwar_office_projection_revocation rv where rv.world_id=p_world and rv.document_ref=d.document_ref))<>2 then raise exception 'PAGED_EXACT_SOCIAL_H0_PARENTS_REQUIRED'using errcode='55000';end if;
 return query select h.world_version::text,h.event_sequence::text,a.seed_fingerprint,a.admission_ref;
end;$$;
alter function world_v2.lock_postwar_paged_current_publication(text,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.lock_postwar_paged_current_publication(text,text)from public;

create function world_v2.read_postwar_paged_financial_current_publication_originals(p_world text,p_country text)
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
 -- Held REPEATABLE READ, actual H SHARE, admission/permit SHARE, then exact
 -- unrevoked same-country seven H0 document locks: the existing lock order.
 select * into strict h from world_v2.lock_postwar_paged_current_publication(p_world,p_country);
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
alter function world_v2.read_postwar_paged_financial_current_publication_originals(text,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.read_postwar_paged_financial_current_publication_originals(text,text)from public;

-- Same verified lease/payment arithmetic; only derived period counters are
-- retained between pages. Actual paid receipts remain in immutable history.
create function world_v2.postwar_paged_beneficial_rent_group(p_world text,p_command jsonb,p_transition jsonb,p_event jsonb,p_batches jsonb,p_next_period numeric)returns numeric
language plpgsql security definer set search_path=pg_catalog as $$
declare a record;r jsonb;payload jsonb;ep jsonb;lease jsonb;tenant jsonb;landlord jsonb;sub jsonb;binding jsonb;expected jsonb;expected_event jsonb;b jsonb;logical text;batch_id text;index_number numeric;due numeric;amount numeric;balance numeric;total numeric:=0;tenant_balance numeric;before_version bigint;begin
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 r:=world_v2.postwar_projection_rent_original(p_world,p_command->>'countryId',a.seed_fingerprint,a.admission_ref,p_event->>'eventId',p_event->>'payloadHash');
 payload:=(p_command->>'canonicalPayload')::jsonb;ep:=(p_event->>'canonicalPayload')::jsonb;before_version:=(p_transition->>'worldVersionBefore')::bigint;
 if p_command->>'commandType'is distinct from'POSTWAR_BENEFICIAL_HOUSING_RENT_V1'or p_command->'officeId'is distinct from'null'::jsonb or p_command->>'worldId'is distinct from p_world or p_command->>'expectedWorldVersion'is distinct from p_transition->>'worldVersionBefore'or p_event->>'eventType'is distinct from'POSTWAR_BENEFICIAL_HOUSING_RENT_SETTLED_V1'or payload->>'schemaVersion'is distinct from'beneficial-housing-rent-command.v1'or(select count(*)from jsonb_object_keys(payload))<>4 or payload->>'genesisReceiptFingerprint'is distinct from r->>'fingerprint'or jsonb_array_length(p_batches)<>1 or payload->>'periodIndex'!~'^(0|[1-9][0-9]*)$'then raise exception 'MIXED_RENT_EXACT_COMMAND_AND_PERIOD_REQUIRED'using errcode='23514';end if;
 select x into strict lease from jsonb_array_elements(r->'leases')x where x->>'leaseId'=payload->>'leaseId';index_number:=(payload->>'periodIndex')::numeric;
 if index_number is distinct from p_next_period or p_next_period<0 then raise exception 'MIXED_RENT_PAID_PERIOD_DUPLICATE_OR_GAP'using errcode='23514';end if;
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
 return index_number+1;
end;$$;
alter function world_v2.postwar_paged_beneficial_rent_group(text,jsonb,jsonb,jsonb,jsonb,numeric)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.postwar_paged_beneficial_rent_group(text,jsonb,jsonb,jsonb,jsonb,numeric)from public;

-- Internal SQL fold state is never an operational/caller state DTO. This
-- private helper reconstructs each frame from immutable tables and exact origins.
create function world_v2.postwar_apply_current_frame_page(p_world text,p_frames_text text,p_state jsonb)returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare wanted jsonb;last_event_id text;last_event_fingerprint text;inv record;inventory jsonb;inventory_count bigint;inventory_total bigint;total_inventory bigint:=0;omos jsonb:='{}';rents jsonb:='{}';body jsonb;br record;batches jsonb;all_batches jsonb:='[]';total_batches bigint:=0;total_legs bigint:=0;actual_batch_count bigint;h record;a record;r record;c record;e record;command jsonb;event jsonb;events jsonb;transition jsonb;receipt jsonb;ep jsonb;first_body jsonb;frames jsonb:='[]';meta jsonb:='[]';wv bigint:=0;seq bigint:=0;bytes bigint:=0;seed_fp text;intent jsonb;policy jsonb;binding jsonb;before_state jsonb;after_state jsonb;env jsonb;next_env jsonb;envelopes jsonb:='[]';captains jsonb:='{}';fund jsonb;event_index integer;expected_type text;expected_count integer;amount numeric;line_total numeric;
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
  elsif c.command_type not in('POSTWAR_BENEFICIAL_HOUSING_RENT_V1','CORE_CENTRAL_BANK_OMO_V1','CORE_GOODS_TRANSFER_V1','CORE_GOODS_SHIPMENT_V1','CORE_GOODS_DELIVERY_V1','CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1','POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1','CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1','CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1','CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1')then raise exception 'FINANCIAL_UNKNOWN_DOMAIN_UNAVAILABLE'using errcode='55000';end if;
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
  if c.command_type in('POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1','POSTWAR_BENEFICIAL_HOUSING_RENT_V1','CORE_CENTRAL_BANK_OMO_V1','CORE_GOODS_DELIVERY_V1')then
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
  if inventory_total>0 then
   select count(*)into inventory_count from world_v2.inventory_posting x where x.world_id=p_world and x.causation_command_id=c.command_id;
   if(c.command_type in('CORE_GOODS_TRANSFER_V1','CORE_GOODS_SHIPMENT_V1','CORE_GOODS_DELIVERY_V1')and inventory_count<>1)or(c.command_type not in('CORE_GOODS_TRANSFER_V1','CORE_GOODS_SHIPMENT_V1','CORE_GOODS_DELIVERY_V1')and inventory_count<>0)then raise exception 'MIXED_EXACT_INVENTORY_GROUP_REQUIRED'using errcode='23514';end if;
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

-- Independent streaming verifier. Each page is reconstructed from committed
-- tables and reduced by the same fixed source-backed effects as legacy V3.
-- Only domain state and three constant-size fingerprints cross page boundaries;
-- no all-history JSON or caller-supplied continuation state is accepted.
create function world_v2.postwar_paged_mixed_current_prefix(p_world text,p_country text)
returns table(prefix_fingerprint text,effects_fingerprint text,last_event_id text,last_event_fingerprint text,budget_envelopes jsonb,financial_posting_count text,financial_batch_count text,financial_postings_fingerprint text,page_proof jsonb)
language plpgsql security definer set search_path=pg_catalog as $$
declare h record;p record;prior jsonb;expected jsonb;origin jsonb;anchor jsonb;state jsonb;folded jsonb;v jsonb;
 wv bigint:=0;seq bigint:=0;pages bigint:=0;frames bigint:=0;batches bigint:=0;legs numeric:=0;inventories bigint:=0;
begin
 select * into strict h from world_v2.lock_postwar_paged_current_publication(p_world,p_country);
 expected:=jsonb_build_object('worldVersion',h.world_version,'eventSequence',h.event_sequence);
 origin:=jsonb_build_object('worldId',p_world,'seedFingerprint',h.seed_fingerprint,'expectedHead',expected);
 prefix_fingerprint:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(origin||jsonb_build_object('schemaVersion','finance-social-replay-origin-v1')),'UTF8')),'hex');
 effects_fingerprint:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(origin||jsonb_build_object('schemaVersion','postwar-effects-page-origin-v1')),'UTF8')),'hex');
 financial_postings_fingerprint:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(origin||jsonb_build_object('schemaVersion','postwar-financial-page-origin-v1')),'UTF8')),'hex');
 state:=jsonb_build_object('worldVersion','0','eventSequence','0','envelopes','[]'::jsonb,'captains','{}'::jsonb,'omos','{}'::jsonb,'rents','{}'::jsonb);
 loop
  select * into strict p from world_v2.read_postwar_bounded_publication_prefix_page(p_world,p_country,wv,seq,h.world_version::bigint,h.event_sequence::bigint,h.seed_fingerprint,h.admission_ref);
  if p.world_id is distinct from p_world or p.host_country_id is distinct from p_country or p.office_id is distinct from'PUBLICATION'or p.world_version is distinct from h.world_version or p.event_sequence is distinct from h.event_sequence or p.seed_fingerprint is distinct from h.seed_fingerprint or p.admission_ref is distinct from h.admission_ref or p.from_world_version is distinct from wv::text or p.from_event_sequence is distinct from seq::text or p.transaction_id is distinct from pg_current_xact_id()::text or p.backend_pid is distinct from pg_backend_pid()::text then raise exception 'PAGED_CURRENT_ACTUAL_TRANSACTION_PINS_REQUIRED'using errcode='23514';end if;
  if pages>0 and(p.seed_id is distinct from (prior->>'seed_id') or p.host_source_ref is distinct from (prior->>'host_source_ref') or p.total_frame_count is distinct from (prior->>'total_frame_count') or p.total_event_count is distinct from (prior->>'total_event_count') or p.total_financial_batch_count is distinct from (prior->>'total_financial_batch_count') or p.total_inventory_posting_count is distinct from (prior->>'total_inventory_posting_count'))then raise exception 'PAGED_CURRENT_PAGE_ANCHOR_CHANGED'using errcode='23514';end if;
  if p.frame_count::bigint<1 or p.event_count::bigint<1 or p.event_count::bigint>256 or p.frame_bytes::bigint>1048576 or p.frame_bytes::bigint<>octet_length(p.frames_text)or p.frames_text is distinct from world_v2.canonical_json(p.frames_text::jsonb)or p.frames_sha256 is distinct from'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||p.frames_text,'UTF8')),'hex')then raise exception 'PAGED_CURRENT_COMPLETE_BOUNDED_PAGE_REQUIRED'using errcode='23514';end if;
  folded:=world_v2.postwar_apply_current_frame_page(p_world,p.frames_text,state);
  if folded->'state'->>'worldVersion'is distinct from p.through_world_version or folded->'state'->>'eventSequence'is distinct from p.through_event_sequence or(folded->>'batchCount')::bigint<>p.financial_batch_count::bigint or jsonb_array_length(p.frames_text::jsonb)<>p.frame_count::bigint then raise exception 'PAGED_CURRENT_EFFECT_CURSOR_OR_COUNTS_MISMATCH'using errcode='23514';end if;
  anchor:=origin||jsonb_build_object('fromHead',jsonb_build_object('worldVersion',wv::text,'eventSequence',seq::text),'throughHead',jsonb_build_object('worldVersion',p.through_world_version,'eventSequence',p.through_event_sequence));
  v:=anchor||jsonb_build_object('schemaVersion','finance-social-replay-page-chain-v1','previous',prefix_fingerprint,'framesSha256',p.frames_sha256);
  prefix_fingerprint:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(v),'UTF8')),'hex');
  v:=anchor||jsonb_build_object('schemaVersion','postwar-effects-page-chain-v1','previous',effects_fingerprint,'effects',folded->'effects');
  effects_fingerprint:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(v),'UTF8')),'hex');
  v:=anchor||jsonb_build_object('schemaVersion','postwar-financial-page-chain-v1','previous',financial_postings_fingerprint,'batches',folded->'batches');
  financial_postings_fingerprint:='sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.canonical_json(v),'UTF8')),'hex');
  state:=folded->'state';wv:=p.through_world_version::bigint;seq:=p.through_event_sequence::bigint;pages:=pages+1;frames:=frames+p.frame_count::bigint;batches:=batches+p.financial_batch_count::bigint;legs:=legs+(folded->>'legCount')::numeric;inventories:=inventories+p.inventory_posting_count::bigint;
  last_event_id:=folded->>'lastEventId';last_event_fingerprint:=folded->>'lastEventFingerprint';
  if not p.has_more then exit;end if;
  prior:=to_jsonb(p);
 end loop;
 if wv::text is distinct from h.world_version or seq::text is distinct from h.event_sequence or frames<>p.total_frame_count::bigint or seq<>p.total_event_count::bigint or batches<>p.total_financial_batch_count::bigint or inventories<>p.total_inventory_posting_count::bigint then raise exception 'PAGED_CURRENT_COMPLETE_WORLD_JOURNAL_REQUIRED'using errcode='23514';end if;
 budget_envelopes:=state->'envelopes';financial_posting_count:=legs::text;financial_batch_count:=batches::text;
 page_proof:=jsonb_build_object('schemaVersion','postwar-complete-page-proof-v1','hashAlgorithm','COMPLETE_CANONICAL_PAGE_CHAINS_SHA256_V1','pageCount',pages::text,'frameCount',frames::text);
 return next;
end;$$;
alter function world_v2.postwar_paged_mixed_current_prefix(text,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.postwar_paged_mixed_current_prefix(text,text)from public;

create function world_v2.verify_postwar_paged_current_coverage(p_world text,p_country text,p_expected jsonb)
returns table(prefix_fingerprint text,effects_fingerprint text,last_event_id text,last_event_fingerprint text,budget_envelopes jsonb,financial_posting_count text,financial_batch_count text,financial_postings_fingerprint text,page_proof jsonb)
language plpgsql security definer set search_path=pg_catalog as $$
declare actual record;v jsonb;begin
 select * into strict actual from world_v2.postwar_paged_mixed_current_prefix(p_world,p_country);
 v:=jsonb_build_object('prefixFingerprint',actual.prefix_fingerprint,'knownEffectsFingerprint',actual.effects_fingerprint,'coveredThroughEventId',actual.last_event_id,'coveredThroughEventFingerprint',actual.last_event_fingerprint,'financialPostingCount',actual.financial_posting_count,'financialBatchCount',actual.financial_batch_count,'financialPostingsFingerprint',actual.financial_postings_fingerprint,'pageProof',actual.page_proof);
 if p_expected is distinct from v then raise exception 'PAGED_CURRENT_CORE_SQL_COMPLETE_COVERAGE_MISMATCH'using errcode='23514';end if;
 return query select actual.prefix_fingerprint,actual.effects_fingerprint,actual.last_event_id,actual.last_event_fingerprint,actual.budget_envelopes,actual.financial_posting_count,actual.financial_batch_count,actual.financial_postings_fingerprint,actual.page_proof;
end;$$;
alter function world_v2.verify_postwar_paged_current_coverage(text,text,jsonb)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.verify_postwar_paged_current_coverage(text,text,jsonb)from public;

-- Versioned documents share neither identity nor uniqueness with legacy array
-- proofs. Same-head publication never mutates an older admitted projection.
create function world_v2.postwar_write_paged_current_document(p_world text,p_country text,p_office text,p_dataset text,p_base_document_ref text,p_origin_world_version bigint,p_origin_event_sequence bigint,p_rows jsonb,p_coverage jsonb,p_source_pointer jsonb)
returns world_v2.postwar_paged_current_document language plpgsql security definer set search_path=pg_catalog as $$
declare h record;a record;b world_v2.postwar_office_projection_document%rowtype;d world_v2.postwar_paged_current_document%rowtype;ref text;version text;hash text;pages integer:=1;idx integer:=0;off integer:=0;buffer jsonb:='[]';item jsonb;packet jsonb;revision text;
begin
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select * into strict h from world_v2.world_head where world_id=p_world for share;
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 if h.world_version<1 or h.event_sequence<1 or p_origin_world_version<0 or p_origin_world_version>h.world_version or p_origin_event_sequence<0 or p_origin_event_sequence>h.event_sequence or(p_origin_world_version=0)<>(p_origin_event_sequence=0)or p_coverage->>'globalWorldVersion'is distinct from h.world_version::text or p_coverage->>'globalEventSequence'is distinct from h.event_sequence::text or p_coverage->>'countryId'is distinct from p_country or jsonb_typeof(p_rows)is distinct from 'array'or jsonb_typeof(p_source_pointer)is distinct from 'object'then raise exception 'MIXED_DOCUMENT_SCOPE_HEAD_REQUIRED'using errcode='23514';end if;
 if not((p_office='CAPTAIN'and p_dataset='political-capital-current')or(p_office='SOCIAL'and p_dataset in('positions','service-pools'))or(p_office='FINANCE'and p_dataset in('currency-fx','opening-financial-legs','ledger-balances','treasury-capacity'))or(p_office='CENTRAL_BANK'and p_dataset in('currency-fx','cb-categories','cb-holdings','bank-loans','opening-financial-legs','ledger-balances')))then raise exception 'MIXED_FIXED_DATASET_REQUIRED'using errcode='22023';end if;
 if p_office='CAPTAIN'then
  if p_base_document_ref is not null or jsonb_array_length(p_rows)<>7 then raise exception 'PAGED_CAPTAIN_EXACT_SEVEN_ROWS_REQUIRED'using errcode='23514';end if;
  packet:=world_v2.postwar_captain_projection_current_original(p_world,p_country,a.seed_fingerprint,a.admission_ref);
  if packet is null then raise exception 'PAGED_CAPTAIN_CURRENT_ORIGINAL_REQUIRED'using errcode='55000';end if;
  select * into strict b from world_v2.postwar_office_projection_document x where x.document_ref=p_source_pointer->'canonicalSeedParent'->>'documentRef'and x.world_id=p_world and x.country_id=p_country and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref and x.canonical_seed_sha256=p_source_pointer->>'canonicalSeedSha256'and not exists(select 1 from world_v2.postwar_office_projection_revocation rv where rv.document_ref=x.document_ref)for share;
  revision:=packet->'genesis'->>'revision';
 else
 select * into strict b from world_v2.postwar_office_projection_document x where x.document_ref=p_base_document_ref and x.world_id=p_world and x.country_id=p_country and x.office_id=p_office and x.dataset=case when p_dataset in('ledger-balances','treasury-capacity')then'opening-financial-legs'else p_dataset end and x.world_version=0 and x.event_sequence=0 and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref and x.source_bundle_sha256=a.source_bundle_sha256 and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.world_id=p_world and r.document_ref=x.document_ref)for share;
  revision:=b.source_revision;
 end if;
 if p_coverage->>'reducerVersion'is distinct from'POSTWAR_COMPLETE_MIXED_PAGED_PREFIX_V1'or p_coverage->'pageProof'->>'schemaVersion'is distinct from'postwar-complete-page-proof-v1'or p_coverage->'pageProof'->>'hashAlgorithm'is distinct from'COMPLETE_CANONICAL_PAGE_CHAINS_SHA256_V1'or p_coverage->'pageProof'->>'frameCount'is distinct from h.world_version::text then raise exception 'PAGED_EXACT_COMPLETE_COVERAGE_REQUIRED'using errcode='23514';end if;

 hash:=encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
 ref:='POSTWAR_PAGED_CURRENT_'||upper(encode(sha256(convert_to(world_v2.canonical_json(jsonb_build_array(p_world,p_country,p_office,p_dataset,p_base_document_ref,a.seed_fingerprint,a.admission_ref,h.world_version::text,h.event_sequence::text,p_origin_world_version::text,p_origin_event_sequence::text,hash,p_coverage,p_source_pointer)),'UTF8')),'hex'));
 version:='sha256:'||encode(sha256(convert_to(ref||hash,'UTF8')),'hex');
 select * into d from world_v2.postwar_paged_current_document x where x.world_id=p_world and x.country_id=p_country and x.office_id=p_office and x.dataset=p_dataset and x.world_version=h.world_version and x.event_sequence=h.event_sequence;
 if found then if d.document_ref<>ref or exists(select 1 from world_v2.postwar_paged_current_revocation rv where rv.document_ref=d.document_ref)then raise exception 'MIXED_IMMUTABLE_DOCUMENT_CONFLICT'using errcode='23514';end if;return d;end if;
 for item in select value from jsonb_array_elements(p_rows)loop
  if octet_length(jsonb_build_array(item)::text)>48000 then raise exception 'MIXED_ROW_CAPACITY_EXCEEDED'using errcode='54000';end if;
  if jsonb_array_length(buffer)>=100 or octet_length((buffer||jsonb_build_array(item))::text)>48000 then pages:=pages+1;buffer:='[]';end if;buffer:=buffer||jsonb_build_array(item);
 end loop;
 insert into world_v2.postwar_paged_current_document values(ref,p_world,p_country,p_office,p_dataset,p_base_document_ref,h.world_version,h.event_sequence,p_origin_world_version,p_origin_event_sequence,version,revision,a.admission_ref,a.seed_id,a.seed_fingerprint,b.canonical_seed_sha256,a.source_bundle_sha256,a.model_version,a.replay_binding,hash,p_coverage,p_source_pointer,jsonb_array_length(p_rows),pages);
 buffer:='[]';for item in select value from jsonb_array_elements(p_rows)loop
  if jsonb_array_length(buffer)>=100 or octet_length((buffer||jsonb_build_array(item))::text)>48000 then
   insert into world_v2.postwar_paged_current_page values(ref,p_world,idx,off,jsonb_array_length(buffer),buffer::text,encode(sha256(convert_to(buffer::text,'UTF8')),'hex'));off:=off+jsonb_array_length(buffer);idx:=idx+1;buffer:='[]';end if;buffer:=buffer||jsonb_build_array(item);
 end loop;
 insert into world_v2.postwar_paged_current_page values(ref,p_world,idx,off,jsonb_array_length(buffer),buffer::text,encode(sha256(convert_to(buffer::text,'UTF8')),'hex'));
 select * into strict d from world_v2.postwar_paged_current_document where document_ref=ref;return d;
end;$$;
alter function world_v2.postwar_write_paged_current_document(text,text,text,text,text,bigint,bigint,jsonb,jsonb,jsonb)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.postwar_write_paged_current_document(text,text,text,text,text,bigint,bigint,jsonb,jsonb,jsonb)from public;
create function world_v2.publish_postwar_paged_financial_current(p_world text,p_country text,p_assertion text)
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
 select * into strict prefix from world_v2.verify_postwar_paged_current_coverage(p_world,p_country,assertion->'coverage');
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
alter function world_v2.publish_postwar_paged_financial_current(text,text,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.publish_postwar_paged_financial_current(text,text,text)from public;
grant execute on function world_v2.publish_postwar_paged_financial_current(text,text,text)to world_v2_postwar_projection_publisher;
create function world_v2.publish_postwar_paged_social_current(p_world text,p_country text,p_assertion text)
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
 select * into strict prefix from world_v2.verify_postwar_paged_current_coverage(p_world,p_country,assertion->'coverage');
 if assertion->'head'is distinct from jsonb_build_object('worldId',p_world,'worldVersion',h.world_version,'eventSequence',h.event_sequence)or assertion->'seedPins'is distinct from jsonb_build_object('worldId',p_world,'seedId',a.seed_id,'seedFingerprint',a.seed_fingerprint,'admissionRef',a.admission_ref)or assertion->'coverage'is distinct from jsonb_build_object('prefixFingerprint',prefix.prefix_fingerprint,'knownEffectsFingerprint',prefix.effects_fingerprint,'coveredThroughEventId',prefix.last_event_id,'coveredThroughEventFingerprint',prefix.last_event_fingerprint,'financialPostingCount',prefix.financial_posting_count,'financialBatchCount',prefix.financial_batch_count,'financialPostingsFingerprint',prefix.financial_postings_fingerprint,'pageProof',prefix.page_proof)then raise exception 'MIXED_CORE_SQL_COMPLETE_PREFIX_MISMATCH'using errcode='23514';end if;
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
 coverage:=assertion->'coverage'||jsonb_build_object('schemaVersion','postwar-social-current-page-chain-coverage-v4','reducerVersion','POSTWAR_COMPLETE_MIXED_PAGED_PREFIX_V1','countryId',p_country,'coverageRef',coverage_id,'globalWorldVersion',h.world_version,'globalEventSequence',h.event_sequence,'originWorldVersion',ow::text,'originEventSequence',os::text,'employmentStateHash',state_hash,'materializationHash',material_hash,'stateOrigin',case when ow=0 then'ADMITTED_OPENING_SOURCE'else'COMMITTED_MATERIALIZATION'end);
 foreach dataset_name in array array['positions','service-pools']loop
  select * into strict b from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_country and x.office_id='SOCIAL'and x.dataset=dataset_name and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref;
  items:=case dataset_name when'positions'then state->'labour'->'positions'else state->'servicePools'end;
  pointer:=case when ow=0 then jsonb_build_object('original',b.source_pointer,'currentDerivation','UNCHANGED_ADMITTED_OPENING_AFTER_COMPLETE_MIXED_PREFIX')else jsonb_build_object('table','current_materialization','key',binding->>'materializationKey','path',case when(binding->>'materializationKey')like'SOCIAL_POSITION_LIFECYCLE_%'then'employment.'else''end||case dataset_name when'positions'then'labour.positions'else'servicePools'end,'currentStateBinding',binding)end;
  return next world_v2.postwar_write_paged_current_document(p_world,p_country,'SOCIAL',dataset_name,b.document_ref,ow,os,items,coverage,pointer);
 end loop;
end;$$;
alter function world_v2.publish_postwar_paged_social_current(text,text,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.publish_postwar_paged_social_current(text,text,text)from public;
grant execute on function world_v2.publish_postwar_paged_social_current(text,text,text)to world_v2_postwar_projection_publisher;
create function world_v2.publish_postwar_paged_captain_current(p_world text,p_country text,p_assertion text)
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
 select * into strict prefix from world_v2.verify_postwar_paged_current_coverage(p_world,p_country,assertion->'coverage');
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
alter function world_v2.publish_postwar_paged_captain_current(text,text,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.publish_postwar_paged_captain_current(text,text,text)from public;
grant execute on function world_v2.publish_postwar_paged_captain_current(text,text,text)to world_v2_postwar_projection_publisher;


-- Online code reads derived bounded pages only. A present but invalid/revoked
-- new version is never hidden by fallback to a legacy same-head document.
create function world_v2.read_postwar_paged_current_page(p_world text,p_office text,p_dataset text,p_offset integer,p_limit integer,p_expected text)
returns table(status text,scope jsonb,source jsonb,page jsonb,rows_text text)
language plpgsql security definer set search_path=pg_catalog as $$
declare s record;d world_v2.postwar_paged_current_document%rowtype;b world_v2.postwar_office_projection_document%rowtype;p world_v2.postwar_paged_current_page%rowtype;selected jsonb;src jsonb;returned integer;original jsonb;coverage_key text;is_current boolean;begin
 if p_offset is null or p_limit is null or p_offset<0 or p_offset>100000 or p_limit<1 or p_limit>100 or(p_offset>0 and p_expected is null)or(p_expected is not null and p_expected!~'^sha256:[a-f0-9]{64}$')or not((p_office='CAPTAIN'and p_dataset='political-capital-current')or(p_office='SOCIAL'and p_dataset in('positions','service-pools'))or(p_office='FINANCE'and p_dataset in('currency-fx','opening-financial-legs','ledger-balances','treasury-capacity'))or(p_office='CENTRAL_BANK'and p_dataset in('currency-fx','cb-categories','cb-holdings','bank-loans','opening-financial-legs','ledger-balances')))then raise exception 'PAGED_CURRENT_INVALID_PAGE'using errcode='22023';end if;
 select * into s from world_v2.read_postwar_office_projection_seats(p_world)x where x.office_id=p_office;
 if not found then return query select'DENIED',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into d from world_v2.postwar_paged_current_document x where x.world_id=p_world and x.country_id=s.country_id and x.office_id=p_office and x.dataset=p_dataset and x.world_version=s.world_version::bigint and x.event_sequence=s.event_sequence::bigint;
 if not found then
  if p_expected is not null and exists(select 1 from world_v2.postwar_paged_current_document x where x.world_id=p_world and x.country_id=s.country_id and x.office_id=p_office and x.dataset=p_dataset and x.source_version=p_expected)then return query select'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';else return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';end if;return;
 end if;
 if d.seed_id is distinct from s.seed_id or d.seed_fingerprint is distinct from s.seed_fingerprint or d.admission_ref is distinct from s.admission_ref or d.source_bundle_sha256 is distinct from s.source_bundle_sha256 or d.coverage->>'countryId'is distinct from s.country_id or d.coverage->>'globalWorldVersion'is distinct from s.world_version or d.coverage->>'globalEventSequence'is distinct from s.event_sequence or d.coverage->>'reducerVersion'is distinct from'POSTWAR_COMPLETE_MIXED_PAGED_PREFIX_V1'or d.coverage->'pageProof'->>'frameCount'is distinct from s.world_version or exists(select 1 from world_v2.postwar_paged_current_revocation rv where rv.world_id=p_world and rv.document_ref=d.document_ref)or not exists(select 1 from world_v2.authoritative_event e where e.world_id=p_world and e.event_id=d.coverage->>'coveredThroughEventId'and e.event_fingerprint=d.coverage->>'coveredThroughEventFingerprint'and e.world_version=d.world_version and e.event_sequence=d.event_sequence)then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 if p_expected is not null and p_expected<>d.source_version then return query select'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 if p_office='CAPTAIN'then
  if not coalesce(world_v2.postwar_captain_current_parent_readable(p_world,s.country_id,s.seed_id,s.seed_fingerprint,s.admission_ref,d.source_pointer),false)or(d.origin_world_version=0 and d.source_pointer->'lastCaptainEvent'is distinct from'null'::jsonb)or(d.origin_world_version>0 and not exists(select 1 from world_v2.authoritative_event e join world_v2.command_submission c on c.world_id=e.world_id and c.command_id=e.causation_command_id where e.world_id=p_world and e.world_version=d.origin_world_version and e.event_sequence=d.origin_event_sequence and e.event_type='CAPTAIN_POLITICAL_CAPITAL_ALLOCATED_V1'and c.country_id=s.country_id and c.office_id='CAPTAIN'and d.source_pointer->'lastCaptainEvent'=jsonb_build_object('eventId',e.event_id,'eventFingerprint',e.event_fingerprint,'worldVersion',e.world_version::text,'eventSequence',e.event_sequence::text)))then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
  original:=world_v2.postwar_captain_projection_readable_original(p_world,s.country_id,s.seed_fingerprint,s.admission_ref);
  if original is null or d.total_rows<>7 or d.coverage->>'originalPacketSha256'is distinct from original->>'packetSha256'or d.coverage->>'schemaVersion'is distinct from'postwar-captain-current-page-chain-coverage-v2'then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 else
  select * into b from world_v2.postwar_office_projection_document x where x.document_ref=d.base_document_ref and x.world_id=p_world and x.country_id=s.country_id and x.office_id=p_office and x.dataset=case when p_dataset in('ledger-balances','treasury-capacity')then'opening-financial-legs'else p_dataset end and x.world_version=0 and x.event_sequence=0 and x.seed_id=s.seed_id and x.seed_fingerprint=s.seed_fingerprint and x.admission_ref=s.admission_ref and x.source_bundle_sha256=s.source_bundle_sha256 and not exists(select 1 from world_v2.postwar_office_projection_revocation rv where rv.world_id=p_world and rv.document_ref=x.document_ref);
  if not found or d.canonical_seed_sha256 is distinct from b.canonical_seed_sha256 or d.coverage->>'schemaVersion'is distinct from(case when p_office='SOCIAL'then'postwar-social-current-page-chain-coverage-v4'else'postwar-financial-current-page-chain-coverage-v3'end)then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
  if p_office='SOCIAL'and d.origin_world_version>0 and not exists(select 1 from world_v2.current_materialization m where m.world_id=p_world and m.materialization_key=d.source_pointer->'currentStateBinding'->>'materializationKey'and m.world_version=d.origin_world_version and m.source_command_id=d.source_pointer->'currentStateBinding'->>'sourceCommandId'and m.payload_sha256=d.source_pointer->'currentStateBinding'->>'materializationHash')then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 end if;
 select * into p from world_v2.postwar_paged_current_page x where x.document_ref=d.document_ref and x.world_id=p_world and x.row_offset<=p_offset and(p_offset<x.row_offset+x.row_count or d.total_rows=0)order by x.page_index desc limit 1;
 if p_offset>=d.total_rows then selected:='[]';else
  if p.document_ref is null or p.page_sha256<>encode(sha256(convert_to(p.rows_text,'UTF8')),'hex')or p.row_count<>jsonb_array_length(p.rows_text::jsonb)then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
  select coalesce(jsonb_agg(x order by n),'[]')into selected from jsonb_array_elements(p.rows_text::jsonb)with ordinality q(x,n)where n>p_offset-p.row_offset and n<=p_offset-p.row_offset+p_limit;
 end if;
 returned:=jsonb_array_length(selected);is_current:=p_office in('SOCIAL','CAPTAIN')or p_dataset in('ledger-balances','treasury-capacity');coverage_key:=case p_office when'SOCIAL'then'currentPrefixCoverage'when'CAPTAIN'then'currentCaptainCoverage'else'currentFinancialCoverage'end;
 src:=jsonb_build_object('dataNature',case when p_office='CAPTAIN'then'ADMITTED_CURRENT_POLITICAL_CAPITAL_MIXED_PREFIX'when p_office='SOCIAL'then'ADMITTED_CURRENT_SOCIAL_MIXED_FINANCIAL_PREFIX'when is_current then'ADMITTED_CURRENT_FINANCIAL_MIXED_POSTING_PREFIX'else'ADMITTED_IMMUTABLE_OPENING_FACTS'end,'sourceVersion',d.source_version,'sourceRevision',d.source_revision,'seedId',d.seed_id,'seedFingerprint',d.seed_fingerprint,'admissionRef',d.admission_ref,'modelVersion',d.model_version,'replayBinding',d.replay_binding,'sourceBundleSha256',d.source_bundle_sha256,'canonicalSeedSha256',d.canonical_seed_sha256,'worldVersion',case when is_current then d.world_version::text else'0'end,'eventSequence',case when is_current then d.event_sequence::text else'0'end,'originWorldVersion',d.origin_world_version::text,'originEventSequence',d.origin_event_sequence::text,'observedHead',jsonb_build_object('worldVersion',d.world_version::text,'eventSequence',d.event_sequence::text),coverage_key,d.coverage,'pageHash',coalesce(p.page_sha256,encode(sha256(convert_to('[]','UTF8')),'hex')),'returnedRowsHash',encode(sha256(convert_to(selected::text,'UTF8')),'hex'),'hashAlgorithm','POSTGRES_JSONB_TEXT_UTF8_SHA256','sourcePointer',d.source_pointer-'currentStateBinding');
 if p_office='SOCIAL'and d.origin_world_version>0 then src:=src||jsonb_build_object('currentStateBinding',d.source_pointer->'currentStateBinding');end if;
 return query select case when returned=0 then'EMPTY'else'PAGE'end,jsonb_build_object('worldId',s.world_id,'countryId',s.country_id,'officeId',s.office_id,'authSubject',s.auth_subject,'teamId',s.team_id,'authorizationVersion',s.authorization_revision,'scopeKey',s.scope_key,'seatRef',s.seat_ref),src,jsonb_build_object('offset',p_offset,'limit',p_limit,'returned',returned,'total',d.total_rows,'nextOffset',case when p_offset+returned<d.total_rows then p_offset+returned else null end),selected::text;
end;$$;
alter function world_v2.read_postwar_paged_current_page(text,text,text,integer,integer,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.read_postwar_paged_current_page(text,text,text,integer,integer,text)from public;

create function world_v2.read_postwar_mixed_current_page_legacy_array_v1(p_world text,p_office text,p_dataset text,p_offset integer,p_limit integer,p_expected_version text default null)
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
alter function world_v2.read_postwar_mixed_current_page_legacy_array_v1(text,text,text,integer,integer,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.read_postwar_mixed_current_page_legacy_array_v1(text,text,text,integer,integer,text)from public;
create or replace function world_v2.read_postwar_mixed_current_page(p_world text,p_office text,p_dataset text,p_offset integer,p_limit integer,p_expected_version text default null)
returns table(status text,scope jsonb,source jsonb,page jsonb,rows_text text)
language plpgsql security definer set search_path=pg_catalog as $$
declare s record;begin
 if p_offset is null or p_limit is null or p_offset<0 or p_offset>100000 or p_limit<1 or p_limit>100 or p_office is null or p_dataset is null or not((p_office='SOCIAL'and p_dataset in('positions','service-pools'))or(p_office='FINANCE'and p_dataset in('currency-fx','opening-financial-legs','ledger-balances','treasury-capacity'))or(p_office='CENTRAL_BANK'and p_dataset in('currency-fx','cb-categories','cb-holdings','bank-loans','opening-financial-legs','ledger-balances')))or(p_offset>0 and p_expected_version is null)or(p_expected_version is not null and p_expected_version!~'^sha256:[a-f0-9]{64}$')then raise exception 'MIXED_INVALID_PAGE'using errcode='22023';end if;
 select * into s from world_v2.read_postwar_office_projection_seats(p_world)x where x.office_id=p_office;
 if not found then return query select'DENIED',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 if exists(select 1 from world_v2.postwar_paged_current_document d where d.world_id=p_world and d.country_id=s.country_id and d.office_id=p_office and d.dataset=p_dataset and d.world_version=s.world_version::bigint and d.event_sequence=s.event_sequence::bigint)then
  return query select * from world_v2.read_postwar_paged_current_page(p_world,p_office,p_dataset,p_offset,p_limit,p_expected_version);return;
 end if;
 if p_expected_version is not null and exists(select 1 from world_v2.postwar_paged_current_document d where d.world_id=p_world and d.country_id=s.country_id and d.office_id=p_office and d.dataset=p_dataset and d.source_version=p_expected_version)then return query select'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 return query select * from world_v2.read_postwar_mixed_current_page_legacy_array_v1(p_world,p_office,p_dataset,p_offset,p_limit,p_expected_version);
end;$$;
alter function world_v2.read_postwar_mixed_current_page(text,text,text,integer,integer,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.read_postwar_mixed_current_page(text,text,text,integer,integer,text)from public;
grant execute on function world_v2.read_postwar_mixed_current_page(text,text,text,integer,integer,text)to world_v2_postwar_projection_reader;

create function world_v2.read_postwar_captain_current_page_legacy_array_v1(p_world text,p_offset integer,p_limit integer,p_expected text default null)
returns table(status text,scope jsonb,source jsonb,page jsonb,rows_text text)
language plpgsql security definer set search_path=pg_catalog as $$
declare s record;d world_v2.postwar_captain_current_document%rowtype;original jsonb;selected jsonb;returned integer;begin
 if p_offset is null or p_limit is null or p_offset<0 or p_offset>100000 or p_limit<1 or p_limit>100 or(p_offset>0 and p_expected is null)or(p_expected is not null and p_expected!~'^sha256:[a-f0-9]{64}$')then raise exception 'CAPTAIN_CURRENT_INVALID_PAGE'using errcode='22023';end if;
 select * into s from world_v2.read_postwar_office_projection_seats(p_world)x where x.office_id='CAPTAIN';
 if not found then return query select'DENIED',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into d from world_v2.postwar_captain_current_document x where x.world_id=p_world and x.country_id=s.country_id and x.world_version=s.world_version::bigint and x.event_sequence=s.event_sequence::bigint and x.seed_fingerprint=s.seed_fingerprint and x.admission_ref=s.admission_ref;
 if not found then if p_expected is not null and exists(select 1 from world_v2.postwar_captain_current_document x where x.world_id=p_world and x.country_id=s.country_id and x.source_version=p_expected)then return query select'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';else return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';end if;return;end if;
 if p_expected is not null and p_expected<>d.source_version then return query select'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 -- Old documents with no immutable canonical parent pin remain unavailable;
 -- no in-place update, full-seed hydrate or fallback head is permitted.
 if not coalesce(world_v2.postwar_captain_current_parent_readable(p_world,s.country_id,s.seed_id,s.seed_fingerprint,s.admission_ref,d.source_pointer),false)
 or(d.origin_world_version=0 and d.origin_event_sequence=0 and d.source_pointer->'lastCaptainEvent'is distinct from 'null'::jsonb)
 or(d.origin_world_version>0 and not exists(select 1 from world_v2.authoritative_event e join world_v2.command_submission c on c.world_id=e.world_id and c.command_id=e.causation_command_id where e.world_id=p_world and e.world_version=d.origin_world_version and e.event_sequence=d.origin_event_sequence and e.event_type='CAPTAIN_POLITICAL_CAPITAL_ALLOCATED_V1'and c.country_id=s.country_id and c.office_id='CAPTAIN'and c.command_type='CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1'and d.source_pointer->'lastCaptainEvent'=jsonb_build_object('eventId',e.event_id,'eventFingerprint',e.event_fingerprint,'worldVersion',e.world_version::text,'eventSequence',e.event_sequence::text)))
 then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 original:=world_v2.postwar_captain_projection_readable_original(p_world,s.country_id,s.seed_fingerprint,s.admission_ref);
 if original is null or d.coverage->>'originalPacketSha256'is distinct from original->>'packetSha256'or d.rows_sha256<>encode(sha256(convert_to(d.rows_text,'UTF8')),'hex')or d.coverage->>'globalWorldVersion'is distinct from s.world_version or d.coverage->>'globalEventSequence'is distinct from s.event_sequence or not exists(select 1 from world_v2.authoritative_event e where e.world_id=p_world and e.event_id=d.coverage->>'coveredThroughEventId'and e.event_fingerprint=d.coverage->>'coveredThroughEventFingerprint'and e.world_version=d.world_version and e.event_sequence=d.event_sequence)then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select coalesce(jsonb_agg(x order by n),'[]')into selected from jsonb_array_elements(d.rows_text::jsonb)with ordinality q(x,n)where n>p_offset and n<=p_offset+p_limit;returned:=jsonb_array_length(selected);
 return query select case when returned=0 then'EMPTY'else'PAGE'end,
 jsonb_build_object('worldId',s.world_id,'countryId',s.country_id,'officeId',s.office_id,'authSubject',s.auth_subject,'teamId',s.team_id,'authorizationVersion',s.authorization_revision,'scopeKey',s.scope_key,'seatRef',s.seat_ref),
 jsonb_build_object('dataNature','ADMITTED_CURRENT_POLITICAL_CAPITAL_MIXED_PREFIX','sourceVersion',d.source_version,'sourceRevision',d.source_revision,'seedId',s.seed_id,'seedFingerprint',s.seed_fingerprint,'admissionRef',s.admission_ref,'modelVersion',s.model_version,'replayBinding',s.replay_binding,'sourceBundleSha256',s.source_bundle_sha256,'canonicalSeedSha256',d.source_pointer->>'canonicalSeedSha256','worldVersion',d.world_version::text,'eventSequence',d.event_sequence::text,'originWorldVersion',d.origin_world_version::text,'originEventSequence',d.origin_event_sequence::text,'observedHead',jsonb_build_object('worldVersion',d.world_version::text,'eventSequence',d.event_sequence::text),'currentCaptainCoverage',d.coverage,'pageHash',d.rows_sha256,'returnedRowsHash',encode(sha256(convert_to(selected::text,'UTF8')),'hex'),'hashAlgorithm','POSTGRES_JSONB_TEXT_UTF8_SHA256','sourcePointer',d.source_pointer),
 jsonb_build_object('offset',p_offset,'limit',p_limit,'returned',returned,'total',7,'nextOffset',case when p_offset+returned<7 then p_offset+returned else null end),selected::text;
end;$$;
alter function world_v2.read_postwar_captain_current_page_legacy_array_v1(text,integer,integer,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.read_postwar_captain_current_page_legacy_array_v1(text,integer,integer,text)from public;
create or replace function world_v2.read_postwar_captain_current_page(p_world text,p_offset integer,p_limit integer,p_expected text default null)
returns table(status text,scope jsonb,source jsonb,page jsonb,rows_text text)
language plpgsql security definer set search_path=pg_catalog as $$
declare s record;begin
 if p_offset is null or p_limit is null or p_offset<0 or p_offset>100000 or p_limit<1 or p_limit>100 or(p_offset>0 and p_expected is null)or(p_expected is not null and p_expected!~'^sha256:[a-f0-9]{64}$')then raise exception 'CAPTAIN_CURRENT_INVALID_PAGE'using errcode='22023';end if;
 select * into s from world_v2.read_postwar_office_projection_seats(p_world)x where x.office_id='CAPTAIN';
 if not found then return query select'DENIED',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 if exists(select 1 from world_v2.postwar_paged_current_document d where d.world_id=p_world and d.country_id=s.country_id and d.office_id='CAPTAIN'and d.dataset='political-capital-current'and d.world_version=s.world_version::bigint and d.event_sequence=s.event_sequence::bigint)then
  return query select * from world_v2.read_postwar_paged_current_page(p_world,'CAPTAIN','political-capital-current',p_offset,p_limit,p_expected);return;
 end if;
 if p_expected is not null and exists(select 1 from world_v2.postwar_paged_current_document d where d.world_id=p_world and d.country_id=s.country_id and d.office_id='CAPTAIN'and d.dataset='political-capital-current'and d.source_version=p_expected)then return query select'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 return query select * from world_v2.read_postwar_captain_current_page_legacy_array_v1(p_world,p_offset,p_limit,p_expected);
end;$$;
alter function world_v2.read_postwar_captain_current_page(text,integer,integer,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.read_postwar_captain_current_page(text,integer,integer,text)from public;
grant execute on function world_v2.read_postwar_captain_current_page(text,integer,integer,text)to world_v2_postwar_projection_reader;

revoke create on schema world_v2 from world_v2_postwar_projection_owner,world_v2_day_one_fx_history_owner;
commit;
