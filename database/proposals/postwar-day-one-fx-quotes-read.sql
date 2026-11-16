-- New read-only forward proposal. No memberships, source creation, account posting,
-- production execution or changes to historical custody functions.
begin;
grant create on schema world_v2 to world_v2_day_one_fx_source_owner,world_v2_postwar_projection_owner;
create function world_v2.postwar_day_one_fx_quote_rows(p_world text,p_country text,p_seed text,p_admission text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare q jsonb;begin
 perform set_config('econmind.day_one_fx_world',p_world,true);
 select r.quote_text::jsonb into q
 from world_v2.postwar_day_one_fx_quote_original r
 join world_v2.postwar_day_one_fx_source_original s on s.world_id=r.world_id
 where r.world_id=p_world and r.country_id=p_country and s.seed_fingerprint=p_seed and s.admission_ref=p_admission
 and r.quote_text_sha256=encode(sha256(convert_to(r.quote_text,'UTF8')),'hex')
 and r.quote_text::jsonb->>'worldId'=p_world and r.quote_text::jsonb->>'countryId'=p_country and r.quote_text::jsonb->>'seedFingerprint'=p_seed
 and r.quote_text::jsonb->>'quoteRef'=r.quote_ref
 and not exists(select 1 from world_v2.postwar_day_one_fx_source_revocation v where v.world_id=p_world and v.registration_ref=s.registration_ref)
 and not exists(select 1 from world_v2.postwar_day_one_fx_quote_revocation v where v.world_id=p_world and v.country_id=p_country and v.quote_ref=r.quote_ref);
 if not found then return null;end if;
 -- Exactly the pre-existing runtime govGcu selector, not an account insertion.
 return jsonb_build_array(jsonb_build_object(
 'schemaVersion','postwar-day-one-fx-quote-row-v1','countryId',p_country,
 'quoteRef',q->>'quoteRef','quoteSha256',q->>'quoteSha256',
 'localCurrency',q->>'localCurrency','localCurrencyPerGcu',q->>'localCurrencyPerGcu',
 'governmentEntityId',q->>'governmentEntityId','centralBankEntityId',q->>'centralBankEntityId','bankEntityId',q->>'bankEntityId',
 'dealerGcuAccountId',q->>'dealerGcuAccountId',
 'payerGcuAccountId','ACCOUNT_DAY_ONE_GOV_GCU_'||upper(left(encode(sha256(convert_to('SHA-256'||chr(10)||world_v2.postwar_day_one_fx_quote_canonical(jsonb_build_object('worldId',p_world,'government',q->>'governmentEntityId')),'UTF8')),'hex'),40)),
 'validFromSimTime',q->>'validFromSimTime','validUntilSimTime',q->>'validUntilSimTime','spreadBps',q->>'spreadBps',
 'measurement','REGISTERED_FIRST_DAY_QUOTE_NOT_FUNDS_OR_EXECUTION'));
end;$$;
alter function world_v2.postwar_day_one_fx_quote_rows(text,text,text,text)owner to world_v2_day_one_fx_source_owner;
revoke all on function world_v2.postwar_day_one_fx_quote_rows(text,text,text,text)from public;
grant execute on function world_v2.postwar_day_one_fx_quote_rows(text,text,text,text)to world_v2_postwar_projection_owner;
create function world_v2.read_postwar_day_one_fx_quotes_page(p_world text,p_offset integer,p_limit integer,p_expected text)
returns table(status text,scope jsonb,source jsonb,page jsonb,rows_text text)
language plpgsql security definer set search_path=pg_catalog as $$
declare s record;b world_v2.postwar_office_projection_document%rowtype;items jsonb;selected jsonb;version text;total integer;returned integer;begin
 if current_setting('transaction_read_only')<>'on'or current_setting('transaction_isolation')not in('repeatable read','serializable')then raise exception 'DAY_ONE_FX_QUOTE_STABLE_READ_ONLY_REQUIRED'using errcode='25001';end if;
 if p_offset is null or p_limit is null or p_offset<0 or p_offset>100000 or p_limit<1 or p_limit>100 or(p_offset>0 and p_expected is null)or(p_expected is not null and p_expected!~'^sha256:[a-f0-9]{64}$')then raise exception 'DAY_ONE_FX_QUOTE_INVALID_PAGE'using errcode='22023';end if;
 select * into s from world_v2.read_postwar_office_projection_seats(p_world)h where h.office_id='FINANCE';
 if not found then return query select'DENIED',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into b from world_v2.postwar_office_projection_document d where d.world_id=p_world and d.country_id=s.country_id and d.office_id='FINANCE'and d.dataset='currency-fx'and d.seed_id=s.seed_id and d.seed_fingerprint=s.seed_fingerprint and d.admission_ref=s.admission_ref and d.source_bundle_sha256=s.source_bundle_sha256 and not exists(select 1 from world_v2.postwar_office_projection_revocation v where v.world_id=p_world and v.document_ref=d.document_ref);
 if not found then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 items:=world_v2.postwar_day_one_fx_quote_rows(p_world,s.country_id,s.seed_fingerprint,s.admission_ref);
 -- An absent registered quote is unavailable, never a zero-price or empty-quote substitute.
 if items is null then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 total:=jsonb_array_length(items);if total<1 or total>1 or octet_length(items::text)>8192 then raise exception 'DAY_ONE_FX_QUOTE_BOUNDED_SOURCE_REQUIRED'using errcode='54000';end if;
 version:='sha256:'||encode(sha256(convert_to(jsonb_build_array(p_world,s.country_id,s.seed_fingerprint,s.admission_ref,s.world_version,s.event_sequence,items)::text,'UTF8')),'hex');
 if p_expected is not null and version<>p_expected then return query select'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select coalesce(jsonb_agg(x order by n),'[]'::jsonb)into selected from jsonb_array_elements(items)with ordinality q(x,n)where n>p_offset and n<=p_offset+p_limit;returned:=jsonb_array_length(selected);
 return query select case when returned=0 then'EMPTY'else'PAGE'end,
 jsonb_build_object('worldId',s.world_id,'countryId',s.country_id,'officeId',s.office_id,'authSubject',s.auth_subject,'teamId',s.team_id,'authorizationVersion',s.authorization_revision,'scopeKey',s.scope_key,'seatRef',s.seat_ref),
 jsonb_build_object('dataNature','ADMITTED_IMMUTABLE_OPENING_FACTS','sourceVersion',version,'sourceRevision','postwar-day-one-fx-quotes-v1','seedId',s.seed_id,'seedFingerprint',s.seed_fingerprint,'admissionRef',s.admission_ref,'modelVersion',s.model_version,'replayBinding',s.replay_binding,'sourceBundleSha256',s.source_bundle_sha256,'canonicalSeedSha256',b.canonical_seed_sha256,'worldVersion','0','eventSequence','0','originWorldVersion','0','originEventSequence','0','observedHead',jsonb_build_object('worldVersion',s.world_version,'eventSequence',s.event_sequence),'pageHash',encode(sha256(convert_to(items::text,'UTF8')),'hex'),'returnedRowsHash',encode(sha256(convert_to(selected::text,'UTF8')),'hex'),'hashAlgorithm','POSTGRES_JSONB_TEXT_UTF8_SHA256','sourcePointer',jsonb_build_object('rowOrigin','world_v2.postwar_day_one_fx_quote_original.quote_text','rowBinding','quoteRef+quoteSha256','adoptionContext','registered original quote under exact World seed/admission; not funds or execution authority')),
 jsonb_build_object('offset',p_offset,'limit',p_limit,'returned',returned,'total',total,'nextOffset',case when p_offset+returned<total then p_offset+returned else null end),selected::text;
end;$$;
alter function world_v2.read_postwar_day_one_fx_quotes_page(text,integer,integer,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.read_postwar_day_one_fx_quotes_page(text,integer,integer,text)from public;
grant execute on function world_v2.read_postwar_day_one_fx_quotes_page(text,integer,integer,text)to world_v2_postwar_projection_reader;
revoke create on schema world_v2 from world_v2_day_one_fx_source_owner,world_v2_postwar_projection_owner;
-- Stop readers/consumers before reviewed forward repair. Preserve immutable
-- originals/history; no destructive rollback or unknown-outcome replay.
commit;
