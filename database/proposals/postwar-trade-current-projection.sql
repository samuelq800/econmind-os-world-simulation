-- SOURCE-ONLY derived Trade current pages. Install after the paged current
-- storage and final mixed/Industry current-effects override. No new authority
-- table, action capability, login or raw runtime grant is introduced.
begin;
alter table world_v2.postwar_paged_current_document drop constraint postwar_paged_current_document_office_id_check;
alter table world_v2.postwar_paged_current_document add constraint postwar_paged_current_document_office_id_check check(office_id in('FINANCE','CENTRAL_BANK','SOCIAL','CAPTAIN','TRADE'));
grant create on schema world_v2 to world_v2_postwar_projection_owner;
create function world_v2.postwar_write_trade_current_document(p_world text,p_country text,p_office text,p_dataset text,p_base_document_ref text,p_origin_world_version bigint,p_origin_event_sequence bigint,p_rows jsonb,p_coverage jsonb,p_source_pointer jsonb)
returns world_v2.postwar_paged_current_document language plpgsql security definer set search_path=pg_catalog as $$
declare h record;a record;b world_v2.postwar_office_projection_document%rowtype;d world_v2.postwar_paged_current_document%rowtype;ref text;version text;hash text;pages integer:=1;idx integer:=0;off integer:=0;buffer jsonb:='[]';item jsonb;revision text;
begin
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select * into strict h from world_v2.world_head where world_id=p_world for share;
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 if h.world_version<1 or h.event_sequence<1 or p_origin_world_version<0 or p_origin_world_version>h.world_version or p_origin_event_sequence<0 or p_origin_event_sequence>h.event_sequence or(p_origin_world_version=0)<>(p_origin_event_sequence=0)or p_coverage->>'globalWorldVersion'is distinct from h.world_version::text or p_coverage->>'globalEventSequence'is distinct from h.event_sequence::text or p_coverage->>'countryId'is distinct from p_country or jsonb_typeof(p_rows)is distinct from 'array'or jsonb_typeof(p_source_pointer)is distinct from 'object'then raise exception 'MIXED_DOCUMENT_SCOPE_HEAD_REQUIRED'using errcode='23514';end if;
 if p_office<>'TRADE'or p_dataset not in('inventory-current','goods-transfers-current')then raise exception 'TRADE_CURRENT_FIXED_DATASET_REQUIRED'using errcode='22023';end if;
 select * into strict b from world_v2.postwar_office_projection_document x where x.document_ref=p_base_document_ref and x.world_id=p_world and x.country_id=p_country and x.office_id='TRADE'and x.dataset='opening-inventory-entries'and x.world_version=0 and x.event_sequence=0 and x.seed_id=a.seed_id and x.seed_fingerprint=a.seed_fingerprint and x.admission_ref=a.admission_ref and x.source_bundle_sha256=a.source_bundle_sha256 and not exists(select 1 from world_v2.postwar_office_projection_revocation r where r.world_id=p_world and r.document_ref=x.document_ref)for share;
 revision:=b.source_revision;
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
alter function world_v2.postwar_write_trade_current_document(text,text,text,text,text,bigint,bigint,jsonb,jsonb,jsonb)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.postwar_write_trade_current_document(text,text,text,text,text,bigint,bigint,jsonb,jsonb,jsonb)from public;

-- Fixed small row mapping, shared by the actual SQL journal derivation.
create function world_v2.postwar_trade_inventory_row(p_account jsonb,p_quantity numeric)returns jsonb
language sql immutable set search_path=pg_catalog as $$
 select (p_account-'worldId')||jsonb_build_object('schemaVersion','postwar-trade-current-inventory-row-v1','quantity',trim_scale(p_quantity)::text)
$$;
alter function world_v2.postwar_trade_inventory_row(jsonb,numeric)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.postwar_trade_inventory_row(jsonb,numeric)from public;

create function world_v2.publish_postwar_paged_trade_current(p_world text,p_country text,p_assertion text)
returns setof world_v2.postwar_paged_current_document language plpgsql security definer set search_path=pg_catalog as $$
declare h record;a record;prefix record;b world_v2.postwar_office_projection_document%rowtype;assertion jsonb;inventory jsonb;transfers jsonb;inventory_hash text;transfer_hash text;coverage jsonb;pointer jsonb;dataset_name text;items jsonb;valid_balances boolean;
begin
 -- This existing fixed lock enforces the actual separate publisher, RR, source
 -- epoch fence, held H, current admission/permit and unrevoked Social parents.
 select * into strict h from world_v2.lock_postwar_paged_current_publication(p_world,p_country);
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 if octet_length(p_assertion)>16384 then raise exception 'TRADE_CURRENT_BOUNDED_ASSERTION_REQUIRED'using errcode='54000';end if;
 assertion:=p_assertion::jsonb;
 select * into strict prefix from world_v2.verify_postwar_paged_current_coverage(p_world,p_country,assertion->'coverage');
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
alter function world_v2.publish_postwar_paged_trade_current(text,text,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.publish_postwar_paged_trade_current(text,text,text)from public;
grant execute on function world_v2.publish_postwar_paged_trade_current(text,text,text)to world_v2_postwar_projection_publisher;
create function world_v2.read_postwar_trade_current_page(p_world text,p_dataset text,p_offset integer,p_limit integer,p_expected text)
returns table(status text,scope jsonb,source jsonb,page jsonb,rows_text text)
language plpgsql security definer set search_path=pg_catalog as $$
declare p_office constant text:='TRADE';s record;d world_v2.postwar_paged_current_document%rowtype;b world_v2.postwar_office_projection_document%rowtype;p world_v2.postwar_paged_current_page%rowtype;selected jsonb;src jsonb;returned integer;original jsonb;coverage_key text;is_current boolean;begin
 if p_offset is null or p_limit is null or p_offset<0 or p_offset>100000 or p_limit<1 or p_limit>100 or(p_offset>0 and p_expected is null)or(p_expected is not null and p_expected!~'^sha256:[a-f0-9]{64}$')or p_dataset not in('inventory-current','goods-transfers-current')then raise exception 'PAGED_CURRENT_INVALID_PAGE'using errcode='22023';end if;
 select * into s from world_v2.read_postwar_office_projection_seats(p_world)x where x.office_id=p_office;
 if not found then return query select'DENIED',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into d from world_v2.postwar_paged_current_document x where x.world_id=p_world and x.country_id=s.country_id and x.office_id=p_office and x.dataset=p_dataset and x.world_version=s.world_version::bigint and x.event_sequence=s.event_sequence::bigint;
 if not found then
  if p_expected is not null and exists(select 1 from world_v2.postwar_paged_current_document x where x.world_id=p_world and x.country_id=s.country_id and x.office_id=p_office and x.dataset=p_dataset and x.source_version=p_expected)then return query select'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';else return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';end if;return;
 end if;
 if d.seed_id is distinct from s.seed_id or d.seed_fingerprint is distinct from s.seed_fingerprint or d.admission_ref is distinct from s.admission_ref or d.source_bundle_sha256 is distinct from s.source_bundle_sha256 or d.coverage->>'countryId'is distinct from s.country_id or d.coverage->>'globalWorldVersion'is distinct from s.world_version or d.coverage->>'globalEventSequence'is distinct from s.event_sequence or d.coverage->>'reducerVersion'is distinct from'POSTWAR_COMPLETE_MIXED_PAGED_PREFIX_V1'or d.coverage->'pageProof'->>'frameCount'is distinct from s.world_version or exists(select 1 from world_v2.postwar_paged_current_revocation rv where rv.world_id=p_world and rv.document_ref=d.document_ref)or not exists(select 1 from world_v2.authoritative_event e where e.world_id=p_world and e.event_id=d.coverage->>'coveredThroughEventId'and e.event_fingerprint=d.coverage->>'coveredThroughEventFingerprint'and e.world_version=d.world_version and e.event_sequence=d.event_sequence)then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 if p_expected is not null and p_expected<>d.source_version then return query select'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into b from world_v2.postwar_office_projection_document x where x.document_ref=d.base_document_ref and x.world_id=p_world and x.country_id=s.country_id and x.office_id='TRADE'and x.dataset='opening-inventory-entries'and x.world_version=0 and x.event_sequence=0 and x.seed_id=s.seed_id and x.seed_fingerprint=s.seed_fingerprint and x.admission_ref=s.admission_ref and x.source_bundle_sha256=s.source_bundle_sha256 and not exists(select 1 from world_v2.postwar_office_projection_revocation rv where rv.world_id=p_world and rv.document_ref=x.document_ref);
 if not found or d.canonical_seed_sha256 is distinct from b.canonical_seed_sha256 or d.coverage->>'schemaVersion'is distinct from'postwar-trade-current-page-chain-coverage-v1'then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into p from world_v2.postwar_paged_current_page x where x.document_ref=d.document_ref and x.world_id=p_world and x.row_offset<=p_offset and(p_offset<x.row_offset+x.row_count or d.total_rows=0)order by x.page_index desc limit 1;
 if p_offset>=d.total_rows then selected:='[]';else
  if p.document_ref is null or p.page_sha256<>encode(sha256(convert_to(p.rows_text,'UTF8')),'hex')or p.row_count<>jsonb_array_length(p.rows_text::jsonb)then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
  select coalesce(jsonb_agg(x order by n),'[]')into selected from jsonb_array_elements(p.rows_text::jsonb)with ordinality q(x,n)where n>p_offset-p.row_offset and n<=p_offset-p.row_offset+p_limit;
 end if;
 returned:=jsonb_array_length(selected);
 src:=jsonb_build_object('dataNature','ADMITTED_CURRENT_TRADE_COMPLETE_PREFIX','sourceVersion',d.source_version,'sourceRevision',d.source_revision,'seedId',d.seed_id,'seedFingerprint',d.seed_fingerprint,'admissionRef',d.admission_ref,'modelVersion',d.model_version,'replayBinding',d.replay_binding,'sourceBundleSha256',d.source_bundle_sha256,'canonicalSeedSha256',d.canonical_seed_sha256,'worldVersion',d.world_version::text,'eventSequence',d.event_sequence::text,'originWorldVersion',d.origin_world_version::text,'originEventSequence',d.origin_event_sequence::text,'observedHead',jsonb_build_object('worldVersion',d.world_version::text,'eventSequence',d.event_sequence::text),'currentTradeCoverage',d.coverage,'pageHash',coalesce(p.page_sha256,encode(sha256(convert_to('[]','UTF8')),'hex')),'returnedRowsHash',encode(sha256(convert_to(selected::text,'UTF8')),'hex'),'hashAlgorithm','POSTGRES_JSONB_TEXT_UTF8_SHA256','sourcePointer',d.source_pointer);
 return query select case when returned=0 then'EMPTY'else'PAGE'end,jsonb_build_object('worldId',s.world_id,'countryId',s.country_id,'officeId',s.office_id,'authSubject',s.auth_subject,'teamId',s.team_id,'authorizationVersion',s.authorization_revision,'scopeKey',s.scope_key,'seatRef',s.seat_ref),src,jsonb_build_object('offset',p_offset,'limit',p_limit,'returned',returned,'total',d.total_rows,'nextOffset',case when p_offset+returned<d.total_rows then p_offset+returned else null end),selected::text;
end;$$;
alter function world_v2.read_postwar_trade_current_page(text,text,integer,integer,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.read_postwar_trade_current_page(text,text,integer,integer,text)from public;
grant execute on function world_v2.read_postwar_trade_current_page(text,text,integer,integer,text)to world_v2_postwar_projection_reader;
revoke create on schema world_v2 from world_v2_postwar_projection_owner;
commit;
