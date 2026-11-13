-- CANDIDATE DATA-only adopted RUN parameters. Requires Industry first-day
-- custody, intake metadata and bounded Office read metadata. No role/member,
-- source publication, balance, execution grant or raw-seed runtime privilege.
-- V2 exposes immutable gross source capacity only, never remaining capacity or
-- a reservation. Existing installed functions require a reviewed exact-body
-- forward repair; this file remains the fresh-schema installation path.
begin;
grant create on schema world_v2 to world_v2_industry_source_owner,world_v2_postwar_projection_owner;
create function world_v2.postwar_industry_run_parameter_originals(p_world text,p_country text,p_seed text,p_admission text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;begin
 perform set_config('econmind.industry_source_world',p_world,true);
 select jsonb_agg(jsonb_build_object('schemaVersion','postwar-industry-run-parameter-row-v2','countryId',s.country_id,'facilityId',s.facility_id,'locationId',s.source_text::jsonb->>'locationId','operatorId',s.source_text::jsonb->>'operatorId','sourceRef',s.source_ref,'sourceRawSha256',s.source_sha256,'policyVersion',s.policy_version,'policyRawSha256',s.policy_raw_sha256,'userAdoptionRawSha256',s.user_adoption_raw_sha256,'outputUnit',s.source_text::jsonb->'recipe'->>'outputUnit','capacityPerSimDay',s.source_text::jsonb->'sourceFacility'->>'capacity','expenseCurrency',d.asset_account->>'currency','windowStartsAtSimTime',s.source_text::jsonb->>'openingWindowStartsAtSimTime','windowEndsAtSimTime',s.source_text::jsonb->>'openingWindowEndsAtSimTime','maximumMinutesPerWorkerFirstSimDay',s.source_text::jsonb->>'maximumMinutesPerWorkerFirstSimDay','measurement','ADOPTED_PARAMETERS_NOT_RUN_WORK_PAYMENT_OR_OUTPUT_AUTHORITY')order by s.facility_id collate"C")into result
 from world_v2.postwar_industry_first_day_source s
 join world_v2.postwar_industry_original o on o.world_id=s.world_id and o.registration_ref=s.registration_ref and o.country_id=s.country_id and o.facility_id=s.facility_id and o.seed_fingerprint=s.seed_fingerprint and o.admission_ref=s.admission_ref and o.document_sha256=s.source_text::jsonb->>'siteDocumentSha256'and o.document_sha256=encode(sha256(convert_to(o.document_text,'UTF8')),'hex')
 join world_v2.postwar_industry_deposit_original d on d.world_id=s.world_id and d.country_id=s.country_id and d.kind='OPERATOR_BANK_DEPOSIT'and d.seed_fingerprint=s.seed_fingerprint and d.admission_ref=s.admission_ref and d.asset_account->>'ownerId'=s.source_text::jsonb->>'operatorId'and d.asset_account->>'currency'=d.liability_account->>'currency'
 where s.world_id=p_world and s.country_id=p_country and s.seed_fingerprint=p_seed and s.admission_ref=p_admission
 and exists(select 1 from world_v2.runtime_opening_admission a where a.world_id=p_world and a.seed_id=s.seed_id and a.seed_fingerprint=p_seed and a.admission_ref=p_admission) and s.source_text::jsonb->>'seedId'=s.seed_id
 and s.source_sha256=encode(sha256(convert_to(s.source_text,'UTF8')),'hex')and s.source_ref='INDUSTRY_FIRST_DAY_'||upper(s.source_sha256)
 and s.source_text::jsonb->>'worldId'=p_world and s.source_text::jsonb->>'countryId'=p_country and s.source_text::jsonb->>'facilityId'=s.facility_id and s.source_text::jsonb->>'seedFingerprint'=p_seed and s.source_text::jsonb->>'admissionRef'=p_admission
 and s.source_text::jsonb->>'policyVersion'=s.policy_version and s.source_text::jsonb->>'policyRawSha256'=s.policy_raw_sha256 and s.source_text::jsonb->>'userAdoptionRawSha256'=s.user_adoption_raw_sha256
 and not exists(select 1 from world_v2.postwar_industry_first_day_source_revocation v where v.world_id=p_world and v.source_ref=s.source_ref)
 and not exists(select 1 from world_v2.postwar_industry_original_revocation v where v.world_id=p_world and v.registration_ref=s.registration_ref);
 return result;
end;$$;
alter function world_v2.postwar_industry_run_parameter_originals(text,text,text,text)owner to world_v2_industry_source_owner;
revoke all on function world_v2.postwar_industry_run_parameter_originals(text,text,text,text)from public;
grant execute on function world_v2.postwar_industry_run_parameter_originals(text,text,text,text)to world_v2_postwar_projection_owner;
create function world_v2.read_postwar_industry_run_parameters_page(p_world text,p_offset integer,p_limit integer,p_expected text)
returns table(status text,scope jsonb,source jsonb,page jsonb,rows_text text)
language plpgsql security definer set search_path=pg_catalog as $$
declare s record;b world_v2.postwar_office_projection_document%rowtype;items jsonb;selected jsonb;version text;total integer;returned integer;begin
 if current_setting('transaction_read_only')<>'on'or current_setting('transaction_isolation')not in('repeatable read','serializable')then raise exception 'INDUSTRY_RUN_PARAMETER_STABLE_READ_ONLY_REQUIRED'using errcode='25001';end if;
 if p_offset is null or p_limit is null or p_offset<0 or p_offset>100000 or p_limit<1 or p_limit>100 or(p_offset>0 and p_expected is null)or(p_expected is not null and p_expected!~'^sha256:[a-f0-9]{64}$')then raise exception 'INDUSTRY_RUN_PARAMETER_INVALID_PAGE'using errcode='22023';end if;
 select * into s from world_v2.read_postwar_office_projection_seats(p_world)h where h.office_id='INDUSTRY';
 if not found then return query select'DENIED',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select * into b from world_v2.postwar_office_projection_document d where d.world_id=p_world and d.country_id=s.country_id and d.office_id='INDUSTRY'and d.dataset='regional-source-capacity'and d.seed_id=s.seed_id and d.seed_fingerprint=s.seed_fingerprint and d.admission_ref=s.admission_ref and d.source_bundle_sha256=s.source_bundle_sha256 and not exists(select 1 from world_v2.postwar_office_projection_revocation v where v.world_id=p_world and v.document_ref=d.document_ref);
 if not found then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 items:=world_v2.postwar_industry_run_parameter_originals(p_world,s.country_id,s.seed_fingerprint,s.admission_ref);
 -- No installed source is unknown/unavailable, never a known empty facility set.
 if items is null then return query select'UNAVAILABLE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 total:=jsonb_array_length(items);if total<1 or total>100 or octet_length(items::text)>48000 then raise exception 'INDUSTRY_RUN_PARAMETER_BOUNDED_SOURCE_REQUIRED'using errcode='54000';end if;
 version:='sha256:'||encode(sha256(convert_to(jsonb_build_array(p_world,s.country_id,s.seed_fingerprint,s.admission_ref,s.world_version,s.event_sequence,items)::text,'UTF8')),'hex');
 if p_expected is not null and version<>p_expected then return query select'STALE',null::jsonb,null::jsonb,null::jsonb,'[]';return;end if;
 select coalesce(jsonb_agg(x order by n),'[]'::jsonb)into selected from jsonb_array_elements(items)with ordinality q(x,n)where n>p_offset and n<=p_offset+p_limit;returned:=jsonb_array_length(selected);
 return query select case when returned=0 then'EMPTY'else'PAGE'end,
 jsonb_build_object('worldId',s.world_id,'countryId',s.country_id,'officeId',s.office_id,'authSubject',s.auth_subject,'teamId',s.team_id,'authorizationVersion',s.authorization_revision,'scopeKey',s.scope_key,'seatRef',s.seat_ref),
 jsonb_build_object('dataNature','ADMITTED_IMMUTABLE_OPENING_FACTS','sourceVersion',version,'sourceRevision','postwar-industry-run-parameters-v2','seedId',s.seed_id,'seedFingerprint',s.seed_fingerprint,'admissionRef',s.admission_ref,'modelVersion',s.model_version,'replayBinding',s.replay_binding,'sourceBundleSha256',s.source_bundle_sha256,'canonicalSeedSha256',b.canonical_seed_sha256,'worldVersion','0','eventSequence','0','originWorldVersion','0','originEventSequence','0','observedHead',jsonb_build_object('worldVersion',s.world_version,'eventSequence',s.event_sequence),'pageHash',encode(sha256(convert_to(items::text,'UTF8')),'hex'),'returnedRowsHash',encode(sha256(convert_to(selected::text,'UTF8')),'hex'),'hashAlgorithm','POSTGRES_JSONB_TEXT_UTF8_SHA256','sourcePointer',jsonb_build_object('rowOrigin','world_v2.postwar_industry_first_day_source.source_text','rowBinding','sourceRef+sourceRawSha256','adoptionContext','exact immutable World seed/admission and original site document; not a replacement row origin')),
 jsonb_build_object('offset',p_offset,'limit',p_limit,'returned',returned,'total',total,'nextOffset',case when p_offset+returned<total then p_offset+returned else null end),selected::text;
end;$$;
alter function world_v2.read_postwar_industry_run_parameters_page(text,integer,integer,text)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.read_postwar_industry_run_parameters_page(text,integer,integer,text)from public;
grant execute on function world_v2.read_postwar_industry_run_parameters_page(text,integer,integer,text)to world_v2_postwar_projection_reader;
revoke create on schema world_v2 from world_v2_industry_source_owner,world_v2_postwar_projection_owner;
-- Stop readers/consumers before reviewed forward repair. Preserve immutable
-- originals/history; no destructive rollback or unknown-outcome replay.
commit;
