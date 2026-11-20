-- Fixed metadata/custody half of shared paged Trade replay. This function
-- does not return a history prefix, ledger, current stock, Ready bit or commit
-- authority. The shared Worker must independently consume complete Core pages
-- on this same held transaction before deriving a candidate.
begin;
grant create on schema world_v2 to world_v2_postwar_narrow_trade_current_owner;
create function world_v2.read_postwar_narrow_trade_current_paged_scope(p_world text,p_seller text,p_buyer text,p_batch text,p_subject uuid,p_team text,p_revision text)
returns table(seed_id text,seed_fingerprint text,admission_ref text,canonical_seed_sha256 text,world_version text,event_sequence text,stock_status text,stock jsonb,rights jsonb,history_mode text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h record;a world_v2.runtime_opening_admission%rowtype;permit world_v2.runtime_admission_publication_permit%rowtype;d world_v2.postwar_office_projection_document%rowtype;p record;items jsonb:='[]'::jsonb;idx integer:=0;n integer:=0;event_count bigint;command_count bigint;receipt_count bigint;batch_count bigint;inventory_count bigint;max_event bigint;max_version bigint;bytes bigint;event_bytes bigint;command_bytes bigint;receipt_bytes bigint;
begin
 if current_setting('transaction_isolation')not in('repeatable read','serializable')then raise exception 'NARROW_PAGED_HELD_TRANSACTION_REQUIRED'using errcode='25001';end if;
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_narrow_trade_source','MEMBER')or pg_has_role(effective,'world_v2_postwar_narrow_trade_current_owner','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')or exists(select 1 from pg_roles r where r.rolname=effective and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))then raise exception 'NARROW_CURRENT_FIXED_TRADE_ROLE_REQUIRED'using errcode='42501';end if;
 if current_setting('transaction_read_only')<>'off'or p_subject::text is distinct from current_setting('request.jwt.claim.sub',true)or p_seller=p_buyer or p_seller!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'or p_buyer!~'^COUNTRY_(0[1-9]|[1-6][0-9]|70)$'then raise exception 'NARROW_CURRENT_EXACT_SCOPE_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.narrow_current_world',p_world,true);
 -- Global H first. Atomic takes its authoritative CAS lock on this SAME tx.
 select x.world_version,x.event_sequence into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found then raise exception 'NARROW_CURRENT_ACTUAL_HEAD_REQUIRED'using errcode='55000';end if;
 perform 1 from world_v2.current_commit_authorization x where x.world_id=p_world and x.country_id=p_seller and x.auth_subject=p_subject and x.office_id='TRADE'and x.capability='TRADE_CONTRACTS'and x.team_id=p_team and x.authorization_version=p_revision and x.active for share;
 if not found or exists(select 1 from world_v2.current_commit_authorization x where x.world_id=p_world and x.auth_subject=p_subject and x.active and(x.country_id<>p_seller or x.team_id<>p_team or x.authorization_version<>p_revision))then raise exception 'NARROW_CURRENT_SELLER_AUTHORIZATION_REQUIRED'using errcode='42501';end if;
 perform 1 from world_v2.runtime_read_seat s where s.world_id=p_world and s.auth_subject=p_subject and s.country_id=p_seller and s.office_id='TRADE'and s.team_id=p_team and s.authorization_revision=p_revision for share;
 if not found then raise exception 'NARROW_CURRENT_EXACT_SEAT_REQUIRED'using errcode='42501';end if;
 perform 1 from world_v2.projection_entitlement e where e.world_id=p_world and e.auth_subject=p_subject and e.authorization_version=p_revision and e.classification='OFFICE_PRIVATE'and e.scope_key='OFFICE_'||upper(encode(convert_to(p_seller,'UTF8'),'hex'))||'_'||upper(encode(convert_to('TRADE','UTF8'),'hex'))and e.active and e.revoked_at is null for share;
 if not found then raise exception 'NARROW_CURRENT_ENTITLEMENT_REQUIRED'using errcode='42501';end if;
 select * into a from world_v2.runtime_opening_admission x where x.world_id=p_world for share;
 if not found or not exists(select 1 from world_v2.opening_seed x where x.world_id=p_world and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.replay_binding=a.replay_binding and x.replay_binding::jsonb->>'modelVersion'=a.model_version)then raise exception 'NARROW_CURRENT_IMMUTABLE_ADMISSION_REQUIRED'using errcode='55000';end if;
 select * into permit from world_v2.runtime_admission_publication_permit x where 'ADMISSION_'||upper(x.authorization_sha256)=a.admission_ref and x.world_id=p_world and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.model_version=a.model_version and x.replay_binding=a.replay_binding and a.admitted_at_real>=x.valid_from and a.admitted_at_real<x.valid_until for share;
 if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=permit.authorization_id)then raise exception 'NARROW_CURRENT_ADMISSION_REVOKED'using errcode='55000';end if;
 seed_id:=a.seed_id;seed_fingerprint:=a.seed_fingerprint;admission_ref:=a.admission_ref;world_version:=h.world_version::text;event_sequence:=h.event_sequence::text;
 -- Sealed H0 stock is provenance only. Actual stock is independently fully
 -- replayed by Core with ALL actual inventory rows at this held World head.
 stock_status:='MISSING';stock:='[]'::jsonb;
 select * into d from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_seller and x.office_id='TRADE'and x.dataset='opening-inventory-entries'and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref and x.source_bundle_sha256=permit.source_bundle_sha256 and x.replay_binding=a.replay_binding and x.model_version=a.model_version and x.world_version=0 and x.event_sequence=0 for share;
 if found and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.document_ref=d.document_ref)then
  if d.page_count>16 or d.total_rows>1600 then raise exception 'NARROW_CURRENT_STOCK_CAPACITY'using errcode='54000';end if;
  for p in select * from world_v2.postwar_office_projection_page x where x.document_ref=d.document_ref order by x.page_index loop
   if p.page_index<>idx or p.row_offset<>n or p.row_count<>jsonb_array_length(p.rows_text::jsonb)or p.page_sha256<>encode(sha256(convert_to(p.rows_text,'UTF8')),'hex')then raise exception 'NARROW_CURRENT_STOCK_PAGE_HASH'using errcode='55000';end if;
   items:=items||p.rows_text::jsonb;idx:=idx+1;n:=n+p.row_count;
   if octet_length(items::text)>65536 then raise exception 'NARROW_CURRENT_STOCK_CAPACITY'using errcode='54000';end if;
  end loop;
  if idx<>d.page_count or n<>d.total_rows or d.document_sha256<>encode(sha256(convert_to(items::text,'UTF8')),'hex')then raise exception 'NARROW_CURRENT_STOCK_DOCUMENT_HASH'using errcode='55000';end if;
  select coalesce(jsonb_agg(x),'[]'::jsonb)into stock from jsonb_array_elements(items)x where x->'account'->>'batchId'=p_batch and x->'account'->>'countryId'=p_seller and x->'account'->>'commodityId'='GRAIN';
  stock_status:='SEALED_ADMITTED_OPENING';canonical_seed_sha256:=d.canonical_seed_sha256;
 end if;
 perform 1 from world_v2.postwar_narrow_trade_rights_admission x where x.world_id=p_world and x.seed_fingerprint=a.seed_fingerprint for share;
 select coalesce(jsonb_agg(jsonb_build_object('source_id',o.source_id,'source_payload_hash',o.source_payload_hash,'canonical_payload',o.canonical_payload,'domain_admission_ref',r.admission_ref,'domain_admission_revision',r.admission_revision,'issuer_ref',r.issuer_ref,'custodian_ref',r.custodian_ref,'admission_evidence_sha256',r.admission_evidence_sha256)order by o.source_id),'[]'::jsonb)into rights from world_v2.postwar_narrow_trade_current_original o join world_v2.postwar_narrow_trade_rights_admission r on r.world_id=o.world_id and r.source_id=o.source_id and r.seed_fingerprint=o.seed_fingerprint and r.source_payload_hash=o.source_payload_hash where o.world_id=p_world and o.seed_fingerprint=a.seed_fingerprint and exists(select 1 from jsonb_array_elements(o.canonical_payload::jsonb->'records')record where (record->>'kind'='OWNER_TRANSFER_MANDATE'and record->>'countryId'=p_seller)or(record->>'kind'='CROSS_BORDER_ROUTE'and record->>'fromCountryId'=p_seller))and not exists(select 1 from world_v2.postwar_narrow_trade_rights_revocation v where v.admission_ref=r.admission_ref);
 if octet_length(rights::text)>65536 then raise exception 'NARROW_CURRENT_RIGHTS_CAPACITY'using errcode='54000';end if;
 history_mode:='GENUINE_SHARED_PAGED_CORE_REPLAY_REQUIRED';
 return next;
end;$$;
alter function world_v2.read_postwar_narrow_trade_current_paged_scope(text,text,text,text,uuid,text,text)owner to world_v2_postwar_narrow_trade_current_owner;
revoke all on function world_v2.read_postwar_narrow_trade_current_paged_scope(text,text,text,text,uuid,text,text)from public;
grant execute on function world_v2.read_postwar_narrow_trade_current_paged_scope(text,text,text,text,uuid,text,text)to world_v2_postwar_narrow_trade_source;
create function world_v2.read_postwar_narrow_trade_automatic_paged_scope(p_world text,p_command text,p_worker text,p_observed timestamptz,p_sim text)
returns table(seed_id text,seed_fingerprint text,admission_ref text,canonical_seed_sha256 text,world_version text,event_sequence text,stock_status text,stock jsonb,rights jsonb,history_mode text)
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;h record;a world_v2.runtime_opening_admission%rowtype;permit world_v2.runtime_admission_publication_permit%rowtype;d world_v2.postwar_office_projection_document%rowtype;p record;items jsonb:='[]'::jsonb;idx integer:=0;n integer:=0;event_count bigint;command_count bigint;receipt_count bigint;batch_count bigint;inventory_count bigint;max_event bigint;max_version bigint;bytes bigint;event_bytes bigint;command_bytes bigint;receipt_bytes bigint;v_auto world_v2.command_submission%rowtype;original world_v2.command_submission%rowtype;p_seller text;p_buyer text;p_batch text;
begin
 if current_setting('transaction_isolation')not in('repeatable read','serializable')then raise exception 'NARROW_PAGED_HELD_TRANSACTION_REQUIRED'using errcode='25001';end if;
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_narrow_trade_source','MEMBER')or pg_has_role(effective,'world_v2_postwar_narrow_trade_current_owner','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')or exists(select 1 from pg_roles r where r.rolname=effective and(r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole or r.rolreplication))then raise exception 'NARROW_AUTOMATIC_FIXED_ROLE_REQUIRED'using errcode='42501';end if;
 if current_setting('transaction_read_only')<>'off'or p_sim!~'^(0|[1-9][0-9]*)$'then raise exception 'NARROW_AUTOMATIC_TRANSACTION_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.narrow_current_world',p_world,true);
 -- The same active worker lease precedes the authoritative head/source locks.
 perform 1 from world_v2.world_writer_lease l where l.world_id=p_world and l.holder_id=p_worker and l.renewed_at_real<=p_observed and l.lease_expires_at_real>p_observed for share;
 if not found then raise exception 'NARROW_AUTOMATIC_ACTUAL_LEASE_REQUIRED'using errcode='55000';end if;
 select x.world_version,x.event_sequence into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found then raise exception 'NARROW_AUTOMATIC_ACTUAL_HEAD_REQUIRED'using errcode='55000';end if;
 select * into v_auto from world_v2.command_submission x where x.world_id=p_world and x.command_id=p_command;
 if not found or v_auto.command_type not in('CORE_GOODS_SHIPMENT_V1','CORE_GOODS_DELIVERY_V1')or v_auto.office_id is not null or v_auto.expected_world_version<>h.world_version or v_auto.sim_time>p_sim::numeric then raise exception 'NARROW_AUTOMATIC_EXACT_DUE_COMMAND_REQUIRED'using errcode='55000';end if;
 perform 1 from world_v2.command_queue q where q.world_id=p_world and q.command_id=p_command and q.authority_kind='VERSIONED_AUTOMATIC'and q.queue_state='CLAIMED'and q.claimed_by=p_worker and q.available_at_sim_time<=p_sim::numeric and q.claim_fencing_token=(select l.fencing_token from world_v2.world_writer_lease l where l.world_id=p_world) for share;
 if not found or exists(select 1 from world_v2.command_receipt r where r.world_id=p_world and r.command_id=p_command)then raise exception 'NARROW_AUTOMATIC_ACTIVE_UNFINISHED_CLAIM_REQUIRED'using errcode='55000';end if;
 select * into original from world_v2.command_submission x where x.world_id=p_world and x.command_id=v_auto.canonical_payload::jsonb->>'transferCommandId';
 if not found or original.command_type<>'CORE_GOODS_TRANSFER_V1'or original.command_fingerprint is distinct from v_auto.canonical_payload::jsonb->>'transferFingerprint'or original.country_id<>v_auto.country_id or not exists(select 1 from world_v2.command_receipt r where r.world_id=p_world and r.command_id=original.command_id and r.command_fingerprint=original.command_fingerprint and r.outcome='COMMITTED')then raise exception 'NARROW_AUTOMATIC_COMMITTED_TRANSFER_REQUIRED'using errcode='55000';end if;
 p_seller:=original.canonical_payload::jsonb->>'sellerCountryId';p_buyer:=original.canonical_payload::jsonb->>'buyerCountryId';p_batch:=original.canonical_payload::jsonb->'assetSource'->>'batchId';
 select * into a from world_v2.runtime_opening_admission x where x.world_id=p_world for share;
 if not found or not exists(select 1 from world_v2.opening_seed x where x.world_id=p_world and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.replay_binding=a.replay_binding and x.replay_binding::jsonb->>'modelVersion'=a.model_version)then raise exception 'NARROW_CURRENT_IMMUTABLE_ADMISSION_REQUIRED'using errcode='55000';end if;
 select * into permit from world_v2.runtime_admission_publication_permit x where 'ADMISSION_'||upper(x.authorization_sha256)=a.admission_ref and x.world_id=p_world and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.model_version=a.model_version and x.replay_binding=a.replay_binding and a.admitted_at_real>=x.valid_from and a.admitted_at_real<x.valid_until for share;
 if not found or exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=permit.authorization_id)then raise exception 'NARROW_CURRENT_ADMISSION_REVOKED'using errcode='55000';end if;
 seed_id:=a.seed_id;seed_fingerprint:=a.seed_fingerprint;admission_ref:=a.admission_ref;world_version:=h.world_version::text;event_sequence:=h.event_sequence::text;
 -- Sealed H0 stock is provenance only. Actual stock is independently fully
 -- replayed by Core with ALL actual inventory rows at this held World head.
 stock_status:='MISSING';stock:='[]'::jsonb;
 select * into d from world_v2.postwar_office_projection_document x where x.world_id=p_world and x.country_id=p_seller and x.office_id='TRADE'and x.dataset='opening-inventory-entries'and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref and x.source_bundle_sha256=permit.source_bundle_sha256 and x.replay_binding=a.replay_binding and x.model_version=a.model_version and x.world_version=0 and x.event_sequence=0 for share;
 if found and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.document_ref=d.document_ref)then
  if d.page_count>16 or d.total_rows>1600 then raise exception 'NARROW_CURRENT_STOCK_CAPACITY'using errcode='54000';end if;
  for p in select * from world_v2.postwar_office_projection_page x where x.document_ref=d.document_ref order by x.page_index loop
   if p.page_index<>idx or p.row_offset<>n or p.row_count<>jsonb_array_length(p.rows_text::jsonb)or p.page_sha256<>encode(sha256(convert_to(p.rows_text,'UTF8')),'hex')then raise exception 'NARROW_CURRENT_STOCK_PAGE_HASH'using errcode='55000';end if;
   items:=items||p.rows_text::jsonb;idx:=idx+1;n:=n+p.row_count;
   if octet_length(items::text)>65536 then raise exception 'NARROW_CURRENT_STOCK_CAPACITY'using errcode='54000';end if;
  end loop;
  if idx<>d.page_count or n<>d.total_rows or d.document_sha256<>encode(sha256(convert_to(items::text,'UTF8')),'hex')then raise exception 'NARROW_CURRENT_STOCK_DOCUMENT_HASH'using errcode='55000';end if;
  select coalesce(jsonb_agg(x),'[]'::jsonb)into stock from jsonb_array_elements(items)x where x->'account'->>'batchId'=p_batch and x->'account'->>'countryId'=p_seller and x->'account'->>'commodityId'='GRAIN';
  stock_status:='SEALED_ADMITTED_OPENING';canonical_seed_sha256:=d.canonical_seed_sha256;
 end if;
 perform 1 from world_v2.postwar_narrow_trade_rights_admission x where x.world_id=p_world and x.seed_fingerprint=a.seed_fingerprint for share;
 select coalesce(jsonb_agg(jsonb_build_object('source_id',o.source_id,'source_payload_hash',o.source_payload_hash,'canonical_payload',o.canonical_payload,'domain_admission_ref',r.admission_ref,'domain_admission_revision',r.admission_revision,'issuer_ref',r.issuer_ref,'custodian_ref',r.custodian_ref,'admission_evidence_sha256',r.admission_evidence_sha256)order by o.source_id),'[]'::jsonb)into rights from world_v2.postwar_narrow_trade_current_original o join world_v2.postwar_narrow_trade_rights_admission r on r.world_id=o.world_id and r.source_id=o.source_id and r.seed_fingerprint=o.seed_fingerprint and r.source_payload_hash=o.source_payload_hash where o.world_id=p_world and o.seed_fingerprint=a.seed_fingerprint and exists(select 1 from jsonb_array_elements(o.canonical_payload::jsonb->'records')record where (record->>'kind'='OWNER_TRANSFER_MANDATE'and record->>'countryId'=p_seller)or(record->>'kind'='CROSS_BORDER_ROUTE'and record->>'fromCountryId'=p_seller))and not exists(select 1 from world_v2.postwar_narrow_trade_rights_revocation v where v.admission_ref=r.admission_ref);
 if octet_length(rights::text)>65536 then raise exception 'NARROW_CURRENT_RIGHTS_CAPACITY'using errcode='54000';end if;
 history_mode:='GENUINE_SHARED_PAGED_CORE_REPLAY_REQUIRED';
 return next;
end;$$;
alter function world_v2.read_postwar_narrow_trade_automatic_paged_scope(text,text,text,timestamptz,text)owner to world_v2_postwar_narrow_trade_current_owner;
revoke all on function world_v2.read_postwar_narrow_trade_automatic_paged_scope(text,text,text,timestamptz,text)from public;
grant execute on function world_v2.read_postwar_narrow_trade_automatic_paged_scope(text,text,text,timestamptz,text)to world_v2_postwar_narrow_trade_source;
revoke create on schema world_v2 from world_v2_postwar_narrow_trade_current_owner;
commit;
