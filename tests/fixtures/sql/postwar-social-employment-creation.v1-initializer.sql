-- TEST_ONLY exact initializer from World 16f1bedd09df119fda4aba846227f86a69bfd3f3.
create or replace function world_v2.prepare_postwar_social_employment_creation_licences(p_world text)returns integer
language plpgsql security definer set search_path=pg_catalog as $$
declare effective name;a record;seed record;scope record;old record;root json;src json;doc_json json;doc jsonb;country jsonb;licence jsonb;fund jsonb;duties jsonb;body text;count_sources integer;n integer:=0;
begin
 effective:=case when current_setting('role')='none'then session_user else current_setting('role')::name end;
 if not pg_has_role(effective,'world_v2_postwar_projection_publisher','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_reader','MEMBER')or pg_has_role(effective,'world_v2_postwar_projection_owner','MEMBER')then raise exception 'SOCIAL_CREATION_FIXED_PUBLISHER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.postwar_projection_world',p_world,true);
 select * into strict a from world_v2.postwar_projection_admission_header(p_world);
 select * into strict seed from world_v2.opening_seed where world_id=p_world;
 if seed.seed_fingerprint is distinct from a.seed_fingerprint or seed.seed_fingerprint is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||seed.canonical_payload,'UTF8')),'hex')then raise exception 'SOCIAL_CREATION_ACTUAL_ADMITTED_SEED_REQUIRED'using errcode='23514';end if;
 root:=seed.canonical_payload::json;
 select count(*),json_agg(x)->0 into count_sources,src from json_array_elements(root->'sources')x where(x->>'canonicalPayload')::json->>'schemaVersion'='postwar-operating-genesis-seed-source-v1';
 if count_sources<>1 or src->>'payloadHash'is distinct from 'sha256:'||encode(sha256(convert_to('SHA-256'||chr(10)||'{"payload":'||(src->>'canonicalPayload')||'}','UTF8')),'hex')then raise exception 'SOCIAL_CREATION_EXACT_OPERATING_SOURCE_REQUIRED'using errcode='23514';end if;
 -- Keep the large stored seed/carrier as text/json, indexing only the
 -- extracted finite Social document; never index the whole child seed.
 doc_json:=(src->>'canonicalPayload')::json->'carrier'->'socialEmployment';
 if octet_length(doc_json::text)>67108864 then raise exception 'SOCIAL_CREATION_DOCUMENT_CAPACITY_EXCEEDED'using errcode='54000';end if;
 doc:=doc_json::jsonb;
 if doc->>'schemaVersion'is distinct from 'postwar-social-employment-state-v1'or doc->'inputs'->>'worldId'is distinct from p_world or doc->'inputs'->>'seedId'is distinct from a.seed_id
 or doc->'policy'->>'version'is distinct from 'POSTWAR_SOCIAL_EMPLOYMENT_20261028_V1'
 or doc->'policy'->>'authorizationReference'is distinct from 'Sentinel_a619bdbe25588191aa05709db76c7567'
 or doc->'policy'->>'npcMandate'is distinct from 'FINITE_T0_NONEXCLUSIVE_PUBLIC_REFERRAL_ACCESS_TO_OP_EMPLOYMENT_DESKS'
 or doc->'policy'->>'mandateFee'is distinct from 'NO_ADDITIONAL_T0_FEE_OR_TRANSFER'
 or doc->'policy'->>'period'is distinct from 'ONE_INITIAL_SIM_DAY_ONLY'
 or doc->'policy'->>'futurePaymentCondition'is distinct from 'NEW_PUBLIC_PURCHASE_REQUIRES_SEPARATE_LAWFUL_FUNDED_CONTRACT'
 or jsonb_typeof(doc->'countries')is distinct from 'array'then raise exception 'SOCIAL_CREATION_ADOPTED_FINITE_T0_POLICY_REQUIRED'using errcode='23514';end if;
 for country in select value from jsonb_array_elements(doc->'countries')loop
  select * into strict scope from world_v2.postwar_social_prefix_scope where world_id=p_world and country_id=country->>'countryId';
  if scope.seed_fingerprint<>a.seed_fingerprint or scope.admission_ref<>a.admission_ref or scope.source_id<>src->>'sourceId'or scope.source_payload_hash<>src->>'payloadHash'
   or scope.source_bundle_sha256<>a.source_bundle_sha256 or scope.canonical_seed_sha256<>encode(sha256(convert_to(seed.canonical_payload,'UTF8')),'hex')or scope.scope_sha256<>encode(sha256(convert_to(scope.scope_document,'UTF8')),'hex')then raise exception 'SOCIAL_CREATION_UNCHANGED_SOURCE_SCOPE_REQUIRED'using errcode='23514';end if;
  select jsonb_agg(x)->0,count(*) into fund,count_sources from jsonb_array_elements(doc->'inputs'->'fundingAccounts')x where x->>'countryId'=scope.country_id and x->>'payerRole'='GOV';
  if count_sources<>1 or fund->>'currency'is distinct from country->'minimumWage'->>'currency'or not exists(select 1 from jsonb_array_elements(doc->'inputs'->'labour'->'employers')x where x->>'countryId'=scope.country_id and x->>'role'='GOV'and x->>'employerId'=fund->>'payerEntityId')then raise exception 'SOCIAL_CREATION_ACTUAL_GOV_LOCAL_CURRENCY_REQUIRED'using errcode='23514';end if;
  if jsonb_typeof(country->'npcUsageLicenses')is distinct from 'array'or jsonb_typeof(country->'dutyAssignments')is distinct from 'array'then raise exception 'SOCIAL_CREATION_ACTUAL_LICENCE_DUTIES_REQUIRED'using errcode='23514';end if;
  for licence in select value from jsonb_array_elements(country->'npcUsageLicenses')loop
   if (select count(*)from jsonb_object_keys(licence))<>12 or licence->>'beneficiaryEntityId'is distinct from fund->>'payerEntityId'or licence->>'validFromDayIndex'is distinct from '0'or licence->>'validUntilDayIndex'is distinct from '1'
    or licence->>'scope'is distinct from 'PUBLIC_REFERRALS_ONLY_NOT_EMPLOYER_TRANSFER'or licence->>'state'is distinct from 'GENESIS_USAGE_LICENSE_NOT_PAID_PURCHASE'or licence->>'additionalFeeAmount'is distinct from '0'
    or licence->>'futurePaymentCondition'is distinct from 'NEW_PUBLIC_PURCHASE_REQUIRES_SEPARATE_LAWFUL_FUNDED_CONTRACT'
    or licence->>'maximumWorkerMinutes'!~'^[1-9][0-9]*$'or jsonb_typeof(licence->'dutyAssignmentIds')is distinct from 'array'or jsonb_array_length(licence->'dutyAssignmentIds')=0
    or not exists(select 1 from jsonb_array_elements(doc->'inputs'->'labour'->'employers')x where x->>'countryId'=scope.country_id and x->>'role'='OP'and x->>'employerId'=licence->>'licensorEntityId')
    or not exists(select 1 from jsonb_array_elements(scope.scope_document::jsonb->'servicePools')x where x->>'countryId'=scope.country_id and x->>'locationId'=licence->>'locationId'and x->>'dayIndex'='0')then raise exception 'SOCIAL_CREATION_FINITE_ORIGINAL_PUBLIC_LICENCE_REQUIRED'using errcode='23514';end if;
   select coalesce(jsonb_agg(x order by x->>'assignmentId'),'[]')into duties from jsonb_array_elements(country->'dutyAssignments')x where x->>'assignmentId'in(select jsonb_array_elements_text(licence->'dutyAssignmentIds'));
   if jsonb_array_length(duties)<>jsonb_array_length(licence->'dutyAssignmentIds')or exists(select 1 from jsonb_array_elements(duties)x where x->>'countryId'is distinct from scope.country_id or x->>'locationId'is distinct from licence->>'locationId'or x->>'employerId'is distinct from licence->>'licensorEntityId'or x->>'employerRole'is distinct from 'OP'or x->>'occupation'is distinct from 'GENERAL'or x->>'duty'not in('EMPLOYMENT_INTAKE','EMPLOYMENT_VERIFICATION')or x->>'minutesPerWorker'is distinct from '480'or x->>'workerCount'!~'^[1-9][0-9]*$'or(x->>'totalMinutes')::numeric<>(x->>'workerCount')::numeric*480
     or x->>'startOrdinal'!~'^(0|[1-9][0-9]*)$'
     or not exists(select 1 from jsonb_array_elements(doc->'inputs'->'labour'->'positions')p where p->>'positionId'=x->>'positionId'and p->>'countryId'=scope.country_id and p->>'locationId'=licence->>'locationId'and p->>'employerId'=licence->>'licensorEntityId'and p->>'employerRole'='OP'and p->>'owner'='PRIVATE_SECTOR'and p->>'classificationId'='PROFESSIONAL_AND_BUSINESS_SERVICES'and p->>'occupation'='GENERAL'and p->>'skill'in('MEDIUM','HIGH'))
     or not exists(select 1 from jsonb_array_elements(country->'state'->'labour'->'positions')p where p->>'positionId'=x->>'positionId'and p->>'countryId'=scope.country_id and(p->>'employedCount')::numeric>=(x->>'startOrdinal')::numeric+(x->>'workerCount')::numeric))
    or(licence->>'maximumWorkerMinutes')::numeric is distinct from(select sum((x->>'totalMinutes')::numeric)from jsonb_array_elements(duties)x)then raise exception 'SOCIAL_CREATION_ACTUAL_DUTY_TIME_REQUIRED'using errcode='23514';end if;
   body:=world_v2.canonical_json(licence);
   select * into old from world_v2.postwar_social_employment_creation_licence where world_id=p_world and country_id=scope.country_id and licence_ref=licence->>'licenseId';
   if found then
    if old.seed_fingerprint<>scope.seed_fingerprint or old.admission_ref<>scope.admission_ref or old.source_id<>scope.source_id or old.source_payload_hash<>scope.source_payload_hash or old.government_entity_id<>fund->>'payerEntityId'or old.local_currency<>fund->>'currency'or old.canonical_licence<>body then raise exception 'SOCIAL_CREATION_IMMUTABLE_LICENCE_CONFLICT'using errcode='23514';end if;
   else
    insert into world_v2.postwar_social_employment_creation_licence values(p_world,scope.country_id,licence->>'licenseId',scope.seed_fingerprint,scope.admission_ref,scope.source_id,scope.source_payload_hash,fund->>'payerEntityId',fund->>'currency',body,encode(sha256(convert_to(body,'UTF8')),'hex'));
   end if;
   n:=n+1;
  end loop;
 end loop;
 return n;
end;$$;
